'use strict';
/* The recognition pack: ONNX Runtime Web and the models (segmenter, recogniser, language model, word spacer) with their
   parameters, fetched once from a website (or read from files on disk) and kept in this browser, so that recognition
   then works offline and from a page opened from disk. Nothing is ever sent: the only requests are for the site's
   files. Every file is checked against the SHA-256 its manifest gives before it is kept.

   The site (manuscript_ocr's msocr/site.py writes it; by default the manuscribe-models repository on GitHub Pages):
     index.json                       {schema: 1, latest, packs: [{id, manifest, created, bytes, summary, ...}],
                                       runtimes: {id: {path, version, licence, variants: {webgpu|wasm: {js, wasm}}}}}
                                       (a pack's `bytes` there are its three networks only: plan() gives what it takes)
     packs/<id>/manifest.json         the pack: its models, parameters and their checksums, what each was trained on
     runtime/<id>/...                 ONNX Runtime Web's bundles and WebAssembly, as published on npm
   A pack names the versions of pipeline.json and spacer.json it was made with; Manuscribe reads only the versions its
   own code follows (CODE), and says so for a newer pack.

   A pack is kept in parts (PARTS): the runtime this browser needs, the segmenter and the recogniser, which a side
   cannot be read without (REQUIRED), and the language model and the word spacer, which may be left out (a side is then
   read letter by letter, or not spaced). A file already kept with the same checksum, from this pack or another, is not
   fetched again: a new pack whose segmenter, spacer and runtime are those of the last fetches only what changed.

   source() / setSource(url)          the site this browser fetches from (kept in localStorage)
   catalogue(url)                     -> the site's index.json, its packs marked usable or not
   variant()                          -> 'webgpu' where this browser has a WebGPU adapter, else 'wasm'
   plan(url, packId)                  -> what fetching a pack takes, part by part: {pack, entry, manifest, problem,
                                      runtime: {id, version, licence, variant}, parts: [{part, required, items, bytes,
                                      kept, toFetch}]}: `bytes` the part's size, `toFetch` what of it is not in this
                                      browser yet, `kept` where nothing is
   install(url, packId, onProgress, want)
                                      fetch, check and keep the pack's required parts and, of the optional ones, those
                                      in `want` (every one the pack has where `want` is not given); a part kept before
                                      and not wanted now is let go
   installFiles(files, onProgress)    the same from files chosen on disk (the site's folder, or a pack's files and a
                                      runtime's); a file's relative path (webkitRelativePath) places it; an optional part
                                      whose files are not all among them is left out. The runtime is kept apart from the
                                      packs: it is found by its runtime.json, the site's index.json, or its files' names
                                      and the checksums this Manuscribe knows (KNOWN_RUNTIMES: ONNX Runtime Web's own
                                      dist folder will do); where it is not among the files, the one kept in this browser
                                      is used; failing that, the error has code 'runtime' (Settings then asks for its
                                      folder as well)
   installed()                        -> the record of what is kept, or null
   hasPart(record, part)              whether the record keeps that part (a record kept before parts could be chosen
                                      kept them all)
   keptParts(record)                  -> [{part, required, kept, bytes}]: every part of the pack kept, kept or left out
   load()                             -> what recogworker.js's start() takes: the parts kept, and the language model
                                      only where it is kept and not turned off (prefs().lm === false); `spacer` says
                                      whether there is a word spacer
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
  const PARTS = ['runtime', 'segmenter', 'recogniser', 'lm', 'spacer'];
  const REQUIRED = ['runtime', 'segmenter', 'recogniser'];
  // the runtimes this Manuscribe reads, file by file as npm publishes them: a runtime read from disk without its
  // runtime.json (ONNX Runtime Web's own dist folder) is known by these names and checked against these checksums
  const KNOWN_RUNTIMES = {
    'onnxruntime-web-1.31.1': { version: '1.31.1', licence: 'MIT', variants: {
      webgpu: { js: { file: 'ort.webgpu.bundle.min.mjs', sha256: 'c90275ffcd0e74e8929f527840ce9339399bfd45f11a74887e4b81a893907b70', bytes: 122491 },
        wasm: { file: 'ort-wasm-simd-threaded.asyncify.wasm', sha256: 'ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec', bytes: 28747738 } },
      wasm: { js: { file: 'ort.wasm.bundle.min.mjs', sha256: '51bd7168175767324ab0acfcfc4ca94a096a3826e3ebac9ccc4f195eb865f8dd', bytes: 77024 },
        wasm: { file: 'ort-wasm-simd-threaded.wasm', sha256: '4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d', bytes: 14848852 } } } },
  };

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

  // the files of a pack by part: {segmenter, recogniser, spacer, lm: [{name, sha256, bytes}]} (lm only where the pack
  // has one); the pipeline's parameters, which every step reads, and any file not named here go with the segmenter
  function packParts(m) {
    const files = Object.assign({}, m.files || {});
    const entry = (name, h) => ({ name, sha256: typeof h === 'string' ? h : h.sha256, bytes: typeof h === 'string' ? null : h.bytes });
    const take = (name) => { const h = files[name]; delete files[name]; return h ? [entry(name, h)] : []; };
    const net = (k) => [{ name: m.models[k].file, sha256: m.models[k].sha256, bytes: m.models[k].bytes }];
    const out = {
      recogniser: net('recogniser').concat(take(m.models.recogniser.chars || 'recogniser_chars.json')),
      spacer: net('spacer').concat(take('spacer.json')),
      lm: ((m.lm && m.lm.components) || []).map((c) => ({ name: c.file, sha256: c.sha256, bytes: c.bytes })),
    };
    out.segmenter = net('segmenter').concat(Object.entries(files).map(([n, h]) => entry(n, h)));
    if (!out.lm.length) delete out.lm;
    return out;
  }

  // a pack's parts as items to keep: [{part, required, items: [{key, name, sha256, bytes, path, runtime}]}], `path`
  // within the pack's folder, or the runtime's where `runtime`
  function partItems(m, rtFiles) {
    const parts = packParts(m);
    return PARTS.filter((k) => k === 'runtime' || parts[k]).map((k) => ({
      part: k, required: REQUIRED.includes(k),
      items: k === 'runtime'
        ? ['js', 'wasm'].map((x) => ({ key: 'runtime/' + x, name: rtFiles[x].file, sha256: rtFiles[x].sha256, bytes: rtFiles[x].bytes, path: rtFiles[x].file, runtime: true }))
        : parts[k].map((f) => ({ key: 'pack/' + f.name, name: f.name, sha256: f.sha256, bytes: f.bytes, path: f.name })),
    }));
  }

  function hasPart(rec, part) {
    if (!rec) return false;
    if (part === 'lm' && !(rec.manifest.lm && rec.manifest.lm.components)) return false;
    return rec.parts ? rec.parts.includes(part) : true;
  }
  // the parts of the pack kept: [{part, required, kept, bytes}], every part the pack has, kept or not
  function keptParts(rec) {
    if (!rec) return [];
    const sizes = rec.sizes || {};
    return partItems(rec.manifest, rec.runtime.files).map((p) => ({ part: p.part, required: p.required, kept: hasPart(rec, p.part),
      bytes: p.items.reduce((a, it) => a + (sizes[it.key] || it.bytes || 0), 0) }));
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

  /* ---------- planning ---------- */
  // the checksums kept in this browser: {key: sha256} (a record kept before they were noted: none, so all is fetched)
  const keptSums = (rec) => (rec && rec.sums) || {};

  async function plan(url, packId, idx) {
    url = slash(url || source());
    idx = idx || await catalogue(url);
    const entry = (idx.packs || []).find((p) => p.id === (packId || idx.latest));
    if (!entry) throw new Error('the site has no pack ' + (packId || idx.latest));
    const base = new URL(entry.manifest, url).href.replace(/[^/]*$/, '');
    const manifest = await fetchJson(base + 'manifest.json');
    const problem = usable(manifest);
    const rtId = (manifest.needs && manifest.needs.runtime) || CODE.runtimes[0];
    const rt = idx.runtimes && idx.runtimes[rtId];
    if (!rt) return { pack: manifest.pack, entry, manifest, problem: problem || 'needs the runtime ' + rtId + ', which the site does not have', parts: [] };
    const v = await variant(), vname = rt.variants[v] ? v : 'wasm';
    const rtBase = new URL(slash(rt.path), url).href;
    const sums = keptSums(await installed());
    const parts = partItems(manifest, rt.variants[vname]).map((p) => {
      p.items.forEach((it) => { it.url = (it.runtime ? rtBase : base) + it.path; });
      const bytes = p.items.reduce((a, it) => a + (it.bytes || 0), 0);
      const toFetch = p.items.filter((it) => sums[it.key] !== it.sha256).reduce((a, it) => a + (it.bytes || 0), 0);
      return Object.assign(p, { bytes, toFetch, kept: p.items.every((it) => sums[it.key] === it.sha256) });
    });
    return { pack: manifest.pack, entry, manifest, problem, source: url, runtime: { id: rtId, version: rt.version, licence: rt.licence, variant: vname, files: rt.variants[vname] }, parts };
  }

  /* ---------- keeping ---------- */
  // items: [{key, name, sha256, bytes, get: async (onBytes) -> ArrayBuffer}]: those not kept already with the same
  // checksum are fetched and checked, all of them before any is kept; then the files the record names no more are let go
  async function keep(items, record, onProgress) {
    const old = await installed(), sums = keptSums(old), sizes = (old && old.sizes) || {};
    const fresh = items.filter((it) => sums[it.key] !== it.sha256);
    const total = fresh.reduce((a, it) => a + (it.bytes || 0), 0);
    let got = 0;
    const say = (name) => onProgress && onProgress({ name, got, total });
    const bufs = [];
    for (const it of fresh) {
      say(it.name);
      const b = await it.get((n) => { got += n; say(it.name); });
      if (!it.bytes) got += b.byteLength;
      const h = await sha256(b);
      if (h !== it.sha256) throw new Error(it.name + ' is not the file its manifest names (its checksum differs): not kept');
      bufs.push(b);
    }
    const keys = new Set(items.map((it) => it.key));
    const drop = old ? (old.keys || []).filter((k) => !keys.has(k)) : [];
    if (old && !old.sums) await tx('files', 'readwrite', (s) => s.clear());       // kept before checksums were noted
    await tx('files', 'readwrite', (s) => {
      drop.forEach((k) => s.delete(k));
      fresh.forEach((it, k) => s.put({ key: it.key, sha256: it.sha256, bytes: bufs[k].byteLength, data: bufs[k] }));
    });
    record.keys = items.map((it) => it.key);
    record.sums = {};
    record.sizes = {};
    items.forEach((it) => {
      const k = fresh.indexOf(it);
      record.sums[it.key] = it.sha256;
      record.sizes[it.key] = k >= 0 ? bufs[k].byteLength : (sizes[it.key] || it.bytes || 0);
    });
    record.bytes = Object.values(record.sizes).reduce((a, b) => a + b, 0);
    record.fetched = bufs.reduce((a, b) => a + b.byteLength, 0);
    record.date = new Date().toISOString();
    await tx('meta', 'readwrite', (s) => s.put(Object.assign({ id: 'installed' }, record)));
    return record;
  }

  async function install(url, packId, onProgress, want) {
    const pl = await plan(url, packId);
    if (pl.problem) throw new Error('pack ' + pl.pack + ' is ' + pl.problem);
    const chosen = pl.parts.filter((p) => p.required || !want || want.includes(p.part));
    const items = chosen.flatMap((p) => p.items).map((it) => Object.assign({}, it, { get: (on) => fetchBytes(it.url, on) }));
    const rt = pl.runtime;
    return keep(items, { pack: pl.pack, manifest: pl.manifest, runtime: { id: rt.id, version: rt.version, licence: rt.licence, variant: rt.variant, files: rt.files }, source: pl.source, parts: chosen.map((p) => p.part) }, onProgress);
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
    const at = (path) => files.find((f) => rel(f) === path) || files.find((f) => f.name === path.split('/').pop());
    // the runtime, which is kept apart from the packs (the site's runtime/ folder, or ONNX Runtime Web's own dist
    // folder): its runtime.json among the files, else the site's index.json among them, else its files by name,
    // checked against the checksums this Manuscribe knows; else the runtime kept in this browser
    let rt = null;
    for (const f of files.filter((x) => rel(x).endsWith('runtime.json'))) {
      const r = await json(f).catch(() => null);
      if (r && r.id === rtId) rt = { version: r.version, licence: r.licence, variants: r.variants, dir: dir(rel(f)) };
    }
    for (const f of rt ? [] : files.filter((x) => rel(x).endsWith('index.json'))) {
      const idx = await json(f).catch(() => null), r = idx && idx.runtimes && idx.runtimes[rtId];
      if (r) rt = { version: r.version, licence: r.licence, variants: r.variants, dir: dir(rel(f)) + slash(r.path) };
    }
    if (!rt && KNOWN_RUNTIMES[rtId]) rt = Object.assign({ dir: '' }, KNOWN_RUNTIMES[rtId]);
    const v = await variant();
    let want = rt && (rt.variants[v] && at(rt.dir + rt.variants[v].wasm.file) ? v : rt.variants.wasm && at(rt.dir + rt.variants.wasm.wasm.file) ? 'wasm' : null);
    let runtime = want ? { id: rtId, version: rt.version, licence: rt.licence, variant: want, files: rt.variants[want] } : null;
    const old = await installed();
    if (!runtime && old && old.runtime && old.runtime.id === rtId && old.sums
        && old.sums['runtime/js'] === old.runtime.files.js.sha256 && old.sums['runtime/wasm'] === old.runtime.files.wasm.sha256) {
      runtime = old.runtime;           // not among the files, but kept here: nothing to read
      want = old.runtime.variant;
    }
    if (!runtime) {
      const name = KNOWN_RUNTIMES[rtId] ? 'ONNX Runtime Web ' + KNOWN_RUNTIMES[rtId].version : rtId;
      throw Object.assign(new Error('pack ' + best.m.pack + ' needs ' + name + ', which is neither among these files nor in this browser: choose its folder as well (runtime/' + rtId + ' in the site’s folder, or the dist folder of ONNX Runtime Web)'), { code: 'runtime' });
    }
    const sums = keptSums(old);
    const parts = partItems(best.m, runtime.files);
    const rtDir = rt ? rt.dir : '';
    parts.forEach((p) => p.items.forEach((it) => { it.file = at((it.runtime ? rtDir : best.dir) + it.path); }));
    const here = (it) => it.file || sums[it.key] === it.sha256;
    const missing = parts.filter((p) => p.required).flatMap((p) => p.items).filter((it) => !here(it)).map((it) => it.name);
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
    const chosen = parts.filter((p) => p.required || p.items.every(here));
    const items = chosen.flatMap((p) => p.items);
    items.forEach((it) => { it.get = async (on) => { const b = await it.file.arrayBuffer(); on(b.byteLength); return b; }; });
    return keep(items, { pack: best.m.pack, manifest: best.m, runtime, source: 'files', parts: chosen.map((p) => p.part) }, onProgress);
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
    const man = m.manifest, models = {}, spacer = hasPart(m, 'spacer');
    for (const k of ['segmenter', 'recogniser'].concat(spacer ? ['spacer'] : [])) models[k] = await get('pack/' + man.models[k].file);
    // the language model's files, still compressed: the worker decompresses and reads them (RecogLM)
    const lm = hasPart(m, 'lm') && prefs().lm !== false ? await Promise.all(man.lm.components.map(async (c) => ({ name: c.name, weight: c.weight, data: await get('pack/' + c.file) }))) : null;
    return {
      lm, spacer,
      ortJs: await text('runtime/js'), wasm: await get('runtime/wasm'), gpu: m.runtime.variant === 'webgpu' && prefs().backend !== 'wasm',
      models, P: JSON.parse(await text('pack/pipeline.json')), chars: JSON.parse(await text('pack/' + (man.models.recogniser.chars || 'recogniser_chars.json'))),
      S: spacer ? JSON.parse(await text('pack/spacer.json')) : null, threshold: man.models.spacer.threshold, manifest: man, spacerLength: spacer ? spacerLength(man) : null,
    };
  }

  ME.RecogPack = { CODE, SOURCE, PARTS, REQUIRED, source, setSource, prefs, savePrefs, catalogue, contribution, variant, plan, install, installFiles, installed, hasPart, keptParts, load, remove, usable, sha256, spacerLength };
})(window.ME);
