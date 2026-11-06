'use strict';
/* Text shaping with HarfBuzz, compiled to WebAssembly (harfbuzzjs, MIT; vendor/harfbuzz.wasm.js), driven directly
   rather than through its ES module, which a page opened from disk cannot load. Shaping is what turns the letters
   of Devanagari into the glyphs of a font: conjuncts, vowel signs before their consonant, marks above and below. */
(function (ME) {
  const Shaper = {};
  let inst = null;

  function instantiate(bytes) {
    let memory = null;
    const imports = {
      env: {
        _abort_js: () => { throw new Error('HarfBuzz stopped'); },
        _emscripten_runtime_keepalive_clear: () => {},
        _setitimer_js: () => 0,
        emscripten_resize_heap: (size) => {
          const need = Math.ceil((size - memory.buffer.byteLength) / 65536);
          try { if (need > 0) memory.grow(need); return 1; } catch (e) { return 0; }
        },
      },
      wasi_snapshot_preview1: { proc_exit: (code) => { throw new Error('HarfBuzz exited ' + code); } },
    };
    const m = new WebAssembly.Module(bytes);
    const i = new WebAssembly.Instance(m, imports);
    memory = i.exports.memory;
    if (i.exports.__wasm_call_ctors) i.exports.__wasm_call_ctors();
    return i.exports;
  }

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // The WebAssembly, loaded on first use: from a script beside the page, since a page opened from disk cannot fetch.
  Shaper.load = function () {
    if (inst) return Promise.resolve(inst);
    return new Promise((resolve, reject) => {
      const go = () => { try { inst = instantiate(fromB64(ME.HB_WASM)); resolve(inst); } catch (e) { reject(e); } };
      if (ME.HB_WASM) { go(); return; }
      const s = document.createElement('script');
      s.src = 'vendor/harfbuzz.wasm.js';
      s.onload = go;
      s.onerror = () => reject(new Error('the shaping engine (vendor/harfbuzz.wasm.js) could not be loaded'));
      document.head.appendChild(s);
    });
  };
  // for Node, in the tests
  Shaper.init = (bytes) => { inst = instantiate(bytes); return inst; };

  const tag = (s) => ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;

  /* A font for shaping. bytes: the TTF. -> {upem, shape(text) -> [{g, cl, ax, ay, dx, dy}] in font units} */
  Shaper.font = function (bytes) {
    const x = inst;
    if (!x) throw new Error('call Shaper.load first');
    const ptr = x.malloc(bytes.length);
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    const blob = x.hb_blob_create(ptr, bytes.length, 2 /* writable: HarfBuzz may use it in place */, 0, 0);
    const face = x.hb_face_create(blob, 0);
    const font = x.hb_font_create(face);
    const upem = x.hb_face_get_upem(face);
    x.hb_font_set_scale(font, upem, upem);
    const cache = new Map();
    const langs = new Map();
    const lang = (l) => { if (!langs.has(l)) { const s = new TextEncoder().encode(l + '\0'); const p = x.malloc(s.length); new Uint8Array(x.memory.buffer, p, s.length).set(s); langs.set(l, x.hb_language_from_string(p, -1)); } return langs.get(l); };
    function shape(text, opts) {
      const key = text + '\u0001' + ((opts && opts.lang) || '');
      if (cache.has(key)) return cache.get(key);
      const buf = x.hb_buffer_create();
      const n = text.length;
      const tp = x.malloc(n * 2 + 2);
      const u16 = new Uint16Array(x.memory.buffer, tp, n);
      for (let i = 0; i < n; i++) u16[i] = text.charCodeAt(i);
      x.hb_buffer_add_utf16(buf, tp, n, 0, n);
      x.hb_buffer_guess_segment_properties(buf);
      if (opts && opts.lang) x.hb_buffer_set_language(buf, lang(opts.lang));
      x.hb_shape(font, buf, 0, 0);
      const len = x.hb_buffer_get_length(buf);
      const ip = x.hb_buffer_get_glyph_infos(buf, 0), pp = x.hb_buffer_get_glyph_positions(buf, 0);
      const info = new Uint32Array(x.memory.buffer, ip, len * 5), pos = new Int32Array(x.memory.buffer, pp, len * 5);
      const out = new Array(len);
      for (let i = 0; i < len; i++) out[i] = { g: info[i * 5], cl: info[i * 5 + 2], ax: pos[i * 5], ay: pos[i * 5 + 1], dx: pos[i * 5 + 2], dy: pos[i * 5 + 3] };
      x.free(tp);
      x.hb_buffer_destroy(buf);
      if (cache.size > 20000) cache.clear();
      cache.set(key, out);
      return out;
    }
    // the glyph the font gives a character on its own (its cmap), or 0
    const gp = x.malloc(4);
    const nominal = (cp) => (x.hb_font_get_nominal_glyph(font, cp, gp) ? new Uint32Array(x.memory.buffer, gp, 1)[0] : 0);
    return { upem, shape, nominal, width: (text, opts) => shape(text, opts).reduce((a, g) => a + g.ax, 0) };
  };
  Shaper.tag = tag;

  ME.Shaper = Shaper;
})(window.ME);
