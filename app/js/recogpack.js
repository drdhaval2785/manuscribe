'use strict';
/* The recognition pack: ONNX Runtime Web and the three models (segmenter, recogniser, word spacer) with their
   parameters, fetched once from a website (or read from files on disk) and kept in this browser, so that recognition
   then works offline and from a page opened from disk. Nothing is ever sent: the only requests are for the site's
   files. Every file is checked against the SHA-256 its manifest gives before it is kept.

   The site (manuscript_ocr's msocr/site.py writes it; by default the manuscribe-models repository on GitHub Pages):
     index.json                       {schema: 1, latest, packs: [{id, manifest, created, bytes, summary, ...}],
                                       runtimes: {id: {path, version, licence, variants: {webgpu|wasm: {js, wasm}}}}}
     packs/<id>/manifest.json         the pack: its models, parameters and their checksums, what each was trained on
     runtime/<id>/...                 ONNX Runtime Web's bundles and WebAssembly, as published on npm
   A pack names the versions of pipeline.json and spacer.json it was made with; Manuscribe reads only the versions its
   own code follows (CODE), and says so for a newer pack.

   source() / setSource(url)          the site this browser fetches from (kept in localStorage)
   catalogue(url)                     -> the site's index.json, its packs marked usable or not
   variant()                          -> 'webgpu' where this browser has a WebGPU adapter, else 'wasm'
   install(url, packId, onProgress)   fetch, check and keep the pack and the runtime this browser needs
   installFiles(files, onProgress)    the same from files chosen on disk (the site's folder, or a pack's files and a
                                      runtime's); a file's relative path (webkitRelativePath) places it
   installed()                        -> the record of what is kept, or null
   load()                             -> what recogworker.js's start() takes
   remove()                           forget the pack and the runtime
   contribution(url)                  -> the site's contribute.json: where contributed lines go (a GitHub repository whose
                                      issues take them) and the public key that seals them; the last one read is kept,
                                      for a contribution made offline
   A pack of pipeline version 2 carries a language model (manifest.lm.components: files read by recoglm.js, mixed by
   their weights); load() hands its files on, still compressed.
   Kept in IndexedDB (database manuscribe-recognition: files, meta), apart from the projects' own database. */
(function (ME) {
  const CODE = { pipeline: [1, 2], spacer: [1], runtimes: ['onnxruntime-web-1.31.1'] };     // pipeline 2: a pack may carry a language model
  const SOURCE = 'https://drdhaval2785.github.io/manuscribe-models/';
  const PREFS = 'manuscribe.recognition';
  const MODELS = ['segmenter', 'recogniser', 'spacer'];

  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } };
  const savePrefs = (o) => { try { localStorage.setItem(PREFS, JSON.stringify(Object.assign(prefs(), o))); } catch (e) { /* kept for this visit only */ } };
  const source = () => prefs().source || SOURCE;
  const setSource = (url) => savePrefs({ source: url && url !== SOURCE ? url : undefined });
  const slash = (u) => (u.endsWith('/') ? u : u + '/');

  /* ---------- the database ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('this browser keeps no databases')); return; }
      const r = indexedDB.open('manuscribe-recognition', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'key' }); r.result.createObjectStore('meta', { keyPath: 'id' }); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('the database did not open'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('not stored (is the disk full?)'));
    });
  }
  const getMeta = () => tx('meta', 'readonly', (s) => s.get('installed'));
  const getFile = (key) => tx('files', 'readonly', (s) => s.get(key));

  /* ---------- checks ---------- */
  async function sha256(buf) {
    if (!(crypto && crypto.subtle)) throw new Error('this page cannot check files (no crypto.subtle: open Manuscribe from its website or from disk)');
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function usable(manifest) {
    if (!CODE.pipeline.includes(manifest.pipeline_version)) return 'made for pipeline version ' + manifest.pipeline_version + '; this Manuscribe reads ' + CODE.pipeline.join(', ') + ' (a newer Manuscribe reads it)';
    if (!CODE.spacer.includes(manifest.spacer_version)) return 'made for spacer version ' + manifest.spacer_version + '; this Manuscribe reads ' + CODE.spacer.join(', ');
    const rt = manifest.needs && manifest.needs.runtime;
    if (rt && !CODE.runtimes.includes(rt)) return 'needs ' + rt + ', which this Manuscribe does not know';
    return '';
  }
  // the files of a pack: [{name, sha256, bytes}]
  function packFiles(m) {
    const out = MODELS.map((k) => ({ name: m.models[k].file, sha256: m.models[k].sha256, bytes: m.models[k].bytes }));
    for (const [name, h] of Object.entries(m.files || {})) out.push({ name, sha256: typeof h === 'string' ? h : h.sha256, bytes: typeof h === 'string' ? null : h.bytes });
    for (const c of (m.lm && m.lm.components) || []) out.push({ name: c.file, sha256: c.sha256, bytes: c.bytes });
    return out;
  }

  // the fixed length of a pack's spacer, or null where it takes any length (its manifest's input shape)
  const spacerLength = (m) => { const L = m.models.spacer.input && m.models.spacer.input.shape[1]; return typeof L === 'number' ? L : null; };

  async function variant() {
    try { if (navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu'; } catch (e) { /* none */ }
    return 'wasm';
  }

  /* ---------- fetching ---------- */
  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ': ' + r.status);
    return r.json();
  }
  // -> ArrayBuffer, with progress as bytes arrive
  async function fetchBytes(url, onBytes) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ': ' + r.status);
    if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); onBytes(b.byteLength); return b; }
    const reader = r.body.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); n += value.length; onBytes(value.length);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out.buffer;
  }

  async function contribution(url) {
    url = slash(url || source());
    let c;
    try { c = await fetchJson(url + 'contribute.json'); } catch (err) {
      const kept = prefs().contribute;
      if (kept && kept.from === url) return kept;
      throw err;
    }
    if (c.schema !== 1 || !c.inbox || !c.key || !c.key.spki || !c.key.id) throw new Error('this site\'s contribute.json is of a kind this Manuscribe does not read');
    savePrefs({ contribute: Object.assign({ from: url }, c) });
    return c;
  }

  async function catalogue(url) {
    url = slash(url || source());
    const idx = await fetchJson(url + 'index.json');
    if (idx.schema !== 1) throw new Error('this site\'s index is of a kind this Manuscribe does not read (schema ' + idx.schema + ')');
    for (const p of idx.packs || []) p.problem = usable(p);
    return idx;
  }

  /* ---------- keeping ---------- */
  // items: [{key, name, sha256, get: async (onBytes) -> ArrayBuffer}]; all are fetched and checked before any is kept
  async function keep(items, record, onProgress) {
    const total = items.reduce((a, it) => a + (it.bytes || 0), 0);
    let got = 0;
    const say = (name) => onProgress && onProgress({ name, got, total });
    const bufs = [];
    for (const it of items) {
      say(it.name);
      const b = await it.get((n) => { got += n; say(it.name); });
      if (!it.bytes) got += b.byteLength;
      const h = await sha256(b);
      if (h !== it.sha256) throw new Error(it.name + ' is not the file its manifest names (its checksum differs): not kept');
      bufs.push(b);
    }
    await remove();
    await tx('files', 'readwrite', (s) => { items.forEach((it, k) => s.put({ key: it.key, sha256: it.sha256, bytes: bufs[k].byteLength, data: bufs[k] })); });
    record.bytes = bufs.reduce((a, b) => a + b.byteLength, 0);
    record.keys = items.map((it) => it.key);
    record.date = new Date().toISOString();
    await tx('meta', 'readwrite', (s) => s.put(Object.assign({ id: 'installed' }, record)));
    return record;
  }

  async function install(url, packId, onProgress) {
    url = slash(url || source());
    const idx = await catalogue(url);
    const entry = (idx.packs || []).find((p) => p.id === (packId || idx.latest));
    if (!entry) throw new Error('the site has no pack ' + (packId || idx.latest));
    const base = new URL(entry.manifest, url).href.replace(/[^/]*$/, '');
    const manifest = await fetchJson(base + 'manifest.json');
    const problem = usable(manifest);
    if (problem) throw new Error('pack ' + manifest.pack + ' is ' + problem);
    const rtId = (manifest.needs && manifest.needs.runtime) || CODE.runtimes[0];
    const rt = idx.runtimes && idx.runtimes[rtId];
    if (!rt) throw new Error('the site has no runtime ' + rtId);
    const v = await variant();
    const files = rt.variants[v] || rt.variants.wasm;
    const rtBase = new URL(slash(rt.path), url).href;
    const items = packFiles(manifest).map((f) => ({ key: 'pack/' + f.name, name: f.name, sha256: f.sha256, bytes: f.bytes, get: (on) => fetchBytes(base + f.name, on) }))
      .concat(['js', 'wasm'].map((k) => ({ key: 'runtime/' + k, name: files[k].file, sha256: files[k].sha256, bytes: files[k].bytes, get: (on) => fetchBytes(rtBase + files[k].file, on) })));
    return keep(items, { pack: manifest.pack, manifest, runtime: { id: rtId, version: rt.version, licence: rt.licence, variant: rt.variants[v] ? v : 'wasm', files }, source: url }, onProgress);
  }

  async function installFiles(list, onProgress) {
    const files = Array.from(list);
    const rel = (f) => f.webkitRelativePath || f.name;
    const dir = (p) => p.replace(/[^/]*$/, '');
    const json = async (f) => JSON.parse(await f.text());
    // the newest usable pack among the manifests chosen, and a runtime
    let best = null;
    for (const f of files.filter((x) => rel(x).endsWith('manifest.json'))) {
      const m = await json(f).catch(() => null);
      if (m && m.pack && m.models && !usable(m) && (!best || String(m.created) > String(best.m.created))) best = { m, dir: dir(rel(f)) };
    }
    if (!best) throw new Error('no usable pack among these files: choose the site\'s folder, or a pack\'s files (with its manifest.json) and a runtime\'s (with its runtime.json)');
    const rtId = (best.m.needs && best.m.needs.runtime) || CODE.runtimes[0];
    let rt = null;
    for (const f of files.filter((x) => rel(x).endsWith('runtime.json'))) {
      const r = await json(f).catch(() => null);
      if (r && r.id === rtId) rt = { r, dir: dir(rel(f)) };
    }
    if (!rt) throw new Error('the runtime ' + rtId + ' is not among these files (its runtime.json and files)');
    const at = (path) => files.find((f) => rel(f) === path) || files.find((f) => f.name === path.split('/').pop());
    const v = await variant();
    const want = rt.r.variants[v] && at(rt.dir + rt.r.variants[v].wasm.file) ? v : 'wasm';
    const vf = rt.r.variants[want];
    const items = packFiles(best.m).map((f) => ({ key: 'pack/' + f.name, name: f.name, sha256: f.sha256, bytes: f.bytes, file: at(best.dir + f.name) }))
      .concat(['js', 'wasm'].map((k) => ({ key: 'runtime/' + k, name: vf[k].file, sha256: vf[k].sha256, bytes: vf[k].bytes, file: at(rt.dir + vf[k].file) })));
    const missing = items.filter((it) => !it.file).map((it) => it.name);
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
    items.forEach((it) => { it.get = async (on) => { const b = await it.file.arrayBuffer(); on(b.byteLength); return b; }; });
    return keep(items, { pack: best.m.pack, manifest: best.m, runtime: { id: rtId, version: rt.r.version, licence: rt.r.licence, variant: want, files: vf }, source: 'files' }, onProgress);
  }

  async function installed() {
    try { return (await getMeta()) || null; } catch (e) { return null; }
  }

  async function remove() {
    const m = await installed();
    await tx('files', 'readwrite', (s) => s.clear());
    await tx('meta', 'readwrite', (s) => s.clear());
    return m;
  }

  async function load() {
    const m = await installed();
    if (!m) throw new Error('no recognition pack in this browser: Settings › Recognition fetches one');
    const get = async (key) => { const f = await getFile(key); if (!f) throw new Error('the recognition pack is incomplete (' + key + ' is missing): fetch it again'); return f.data; };
    const text = async (key) => new TextDecoder().decode(await get(key));
    const man = m.manifest, models = {};
    for (const k of MODELS) models[k] = await get('pack/' + man.models[k].file);
    // the language model's files, still compressed: the worker decompresses and reads them (RecogLM)
    const lm = man.lm && man.lm.components ? await Promise.all(man.lm.components.map(async (c) => ({ name: c.name, weight: c.weight, data: await get('pack/' + c.file) }))) : null;
    return {
      lm,
      ortJs: await text('runtime/js'), wasm: await get('runtime/wasm'), gpu: m.runtime.variant === 'webgpu' && prefs().backend !== 'wasm',
      models, P: JSON.parse(await text('pack/pipeline.json')), chars: JSON.parse(await text('pack/' + (man.models.recogniser.chars || 'recogniser_chars.json'))),
      S: JSON.parse(await text('pack/spacer.json')), threshold: man.models.spacer.threshold, manifest: man, spacerLength: spacerLength(man),
    };
  }

  ME.RecogPack = { CODE, SOURCE, source, setSource, prefs, savePrefs, catalogue, contribution, variant, install, installFiles, installed, load, remove, usable, sha256, spacerLength };
})(window.ME);
