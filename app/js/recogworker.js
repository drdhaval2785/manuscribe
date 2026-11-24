'use strict';
/* The recognition worker: ONNX Runtime Web and the recognition modules (recogimage … recogpage) run in a Worker, so that
   the page stays responsive while a side is read. A Worker of a page opened from disk can load nothing, and can be no
   module worker, so the worker is built from source text: ONNX Runtime's bundle, made a classic script (classicOrt),
   then the modules' sources as recogModule kept them, then the message handler; its WebAssembly comes as bytes
   (ort.env.wasm.wasmBinary). Measured in Chrome, 24 November 2026, from a page opened from disk: this runs, and WebGPU is
   there in the worker. The segmenter and the spacer run on WebGPU where there is one; the recogniser always on
   WebAssembly (its LSTM has no WebGPU kernel, and a session that mixes the two read a line in 780 ms against 80).
   Without cross-origin isolation (a page from disk, GitHub Pages) WebAssembly has one thread.

   classicOrt(text)          ONNX Runtime's ES-module bundle as a classic script that sets self.ort
   start(bundle)             -> {read(page, layout, opts, onProgress) -> Promise<result>, close(), backends}
     bundle  {ortJs: the bundle's text, wasm: ArrayBuffer, gpu: whether to try WebGPU,
              models: {segmenter, recogniser, spacer: ArrayBuffer}, P, chars, S, threshold,
              spacerLength: the fixed length of a spacer exported at one, else null}
     page    {data, width, height, channels}; layout as Manuscribe names it; opts {space}
     result  RecogPage.run's, with the backend each network ran on */
(function (ME) {
  function classicOrt(text) {
    const m = text.match(/export\s*\{([^}]*)\}\s*;?\s*(\/\/# sourceMappingURL=\S*\s*)?$/);
    if (!m) throw new Error('this is not the ONNX Runtime bundle Manuscribe knows (no export statement at its end)');
    const names = m[1].split(',').map((x) => { const [a, b] = x.trim().split(/\s+as\s+/); return JSON.stringify(b || a) + ':' + a; });
    // import.meta.url only places files beside the bundle (the WebAssembly, thread workers): neither is fetched here
    return text.slice(0, m.index).replace(/import\.meta\.url/g, '"https://onnxruntime.invalid/ort.mjs"') + '\nself.ort={' + names.join(',') + '};\n';
  }

  // runs in the worker
  function handler() {
    const ort = self.ort;
    let cfg = null;
    const sessions = {}, backends = {};
    async function session(name) {
      if (sessions[name]) return sessions[name];
      const bytes = new Uint8Array(cfg.models[name]);
      const gpu = cfg.gpu && name !== 'recogniser';
      if (gpu) {
        try { sessions[name] = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu', 'wasm'], logSeverityLevel: 3 }); backends[name] = 'webgpu'; return sessions[name]; } catch (e) { /* WebAssembly, below */ }
      }
      // (logSeverityLevel 3: errors only; a WebGPU session warns that shape operations run on the CPU, as they should)
      sessions[name] = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 });
      backends[name] = 'wasm';
      return sessions[name];
    }
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.init) {
          cfg = m.init;
          ort.env.wasm.wasmBinary = cfg.wasm;
          ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, (self.navigator && self.navigator.hardwareConcurrency) || 1) : 1;
          ort.env.logLevel = 'error';
          await session('segmenter');
          await session('recogniser');
          self.postMessage({ ready: true, backends });
          return;
        }
        if (m.read) {
          const { page, layout, opts } = m.read;
          const seg = await session('segmenter'), rec = await session('recogniser');
          const nets = {
            segment: async (x, h, W) => (await seg.run({ x: new ort.Tensor('float32', x, [1, 1, h, W]) })).y.data,
            recognise: async (x, h, w) => { const y = (await rec.run({ x: new ort.Tensor('float32', x, [1, 1, h, w]) })).y; return { data: y.data, T: y.dims[1], C: y.dims[2] }; },
          };
          if (opts && opts.space) {
            const sp = await session('spacer'), RS = self.ME.RecogSpace;
            if (cfg.spacerLength) nets.spaceBatch = RS.ortBatchNetwork(ort, sp, cfg.S, cfg.spacerLength);
            else nets.space = RS.ortNetwork(ort, sp, cfg.S, null);
          }
          const res = await self.ME.RecogPage.run({ data: new Uint8Array(page.data), width: page.width, height: page.height, channels: page.channels }, layout, nets,
            { P: cfg.P, chars: cfg.chars, S: cfg.S, threshold: cfg.threshold },
            Object.assign({}, opts, { progress: (stage, k, n) => self.postMessage({ progress: { stage, k, n } }) }));
          res.backends = Object.assign({}, backends);
          self.postMessage({ done: true, result: res });
        }
      } catch (err) {
        self.postMessage({ done: true, error: String((err && err.message) || err) });
      }
    };
  }

  function source(ortJs) {
    const mods = (ME.recogSources || []).map((f) => '(' + f.toString() + ')(self.ME);');
    return [classicOrt(ortJs), 'self.window = self; self.ME = {};'].concat(mods, ['(' + handler.toString() + ')();']).join('\n');
  }

  function start(bundle) {
    const url = URL.createObjectURL(new Blob([source(bundle.ortJs)], { type: 'text/javascript' }));
    const w = new Worker(url);
    // the address is let go once the worker has answered: WebKit reads the source later than Chrome, and fails if it
    // is gone by then
    let revoked = false;
    const revoke = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } };
    let pending = null;
    const fail = (msg) => { if (pending) { const p = pending; pending = null; p.reject(new Error(msg)); } };
    w.onerror = (e) => { e.preventDefault(); revoke(); fail('the recognition worker stopped: ' + (e.message || 'an error')); };
    w.onmessage = (e) => {
      revoke();
      const m = e.data;
      if (!pending) return;
      if (m.progress) { if (pending.onProgress) pending.onProgress(m.progress); return; }
      const p = pending;
      pending = null;
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.ready ? m.backends : m.result);
    };
    const ask = (msg, transfer, onProgress) => new Promise((resolve, reject) => {
      if (pending) { reject(new Error('the recognition worker is busy')); return; }
      pending = { resolve, reject, onProgress };
      w.postMessage(msg, transfer || []);
    });
    const models = bundle.models;
    const ready = ask({ init: { wasm: bundle.wasm, gpu: !!bundle.gpu, models, P: bundle.P, chars: bundle.chars, S: bundle.S, threshold: bundle.threshold, spacerLength: bundle.spacerLength || null } },
      [bundle.wasm].concat(Object.values(models)));
    const api = {
      ready,
      backends: null,
      read: async (page, layout, opts, onProgress) => {
        api.backends = await ready;
        const data = page.data.slice().buffer;      // a copy goes: the caller keeps its pixels
        return ask({ read: { page: { data, width: page.width, height: page.height, channels: page.channels }, layout, opts: opts || {} } }, [data], onProgress);
      },
      close: () => { fail('cancelled'); w.terminate(); revoke(); },
    };
    return api;
  }

  ME.RecogWorker = { classicOrt, source, start };
})(window.ME);
