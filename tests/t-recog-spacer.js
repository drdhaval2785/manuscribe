// Word spaces in the browser, held to the reference: app/js/recogspace.js (the Sanskrit word spacer's reference
// pipeline, sanskrit_spacer/spacer_reference.py, ported), with the pack's spacer.onnx run through ONNX Runtime Web's
// WebAssembly backend under Node (the browser's own binary). (a) On the pipeline's stage fixtures: each box's lines
// (09_text.json) spaced as 10_spaced.json has them, identically. (b) On the spacer's fixture set
// (sanskrit_spacer/tools/make_spacer_fixtures.py: test sentences, long runs that need windows, mixed and refused texts,
// random strings, hand-made cases, the pages' boxes): every run's units identical, every letter's probability within
// 1e-5, every spaced text identical; a text that differs where a probability lies within 1e-5 of the threshold (a
// genuine tie) is reported, not failed. Fixtures: MANUSCRIBE_RECOG_FIXTURES and MANUSCRIBE_SPACER_FIXTURES, or the
// newest under ../../lexicon_manuscripts/manuscript_ocr/data/fixtures and its spacer/ folder; skipped where there are
// none (they are not distributed).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checks, ROOT } = require('./h');

const T = checks('word spaces against the spacer reference');
// the typed arrays of this realm, which ONNX Runtime's Tensor checks with instanceof
const ctx = { window: { ME: {} }, Math, Array, Map, Set, WeakMap, BigInt, BigInt64Array, Float32Array, Float64Array, Uint8Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app', 'js', 'recogspace.js'), 'utf8'), ctx);
const SP = ctx.window.ME.RecogSpace;
const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;

const FIXTURES = path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscript_ocr', 'data', 'fixtures');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function newest(base) {
  if (!fs.existsSync(base)) return null;
  const sets = fs.readdirSync(base).filter((d) => d !== 'rows' && d !== 'spacer' && fs.existsSync(path.join(base, d, 'index.json'))).sort();
  return sets.length ? path.join(base, sets[sets.length - 1]) : null;
}

// a pack's spacer: its tables, threshold and network (one session per pack), a count of the network's calls, and the
// same network remembering its answers (the fixture set's texts are spaced with the windows their probabilities ran)
const packs = new Map();
async function spacer(pack) {
  if (!packs.has(pack)) {
    const S = readJson(path.join(pack, 'spacer.json'));
    const threshold = readJson(path.join(pack, 'manifest.json')).models.spacer.threshold;
    const session = await ort.InferenceSession.create(path.join(pack, 'spacer.onnx'), { executionProviders: ['wasm'] });
    const p = { S, threshold, calls: 0 };
    // the length the pack's spacer was exported at (the first packs: max_len), or null: any length
    const shape = readJson(path.join(pack, 'manifest.json')).models.spacer.input.shape, fixed = typeof shape[1] === 'number' ? shape[1] : null;
    const net = SP.ortNetwork(ort, session, S, fixed), seen = new Map();
    p.batch = SP.ortBatchNetwork(ort, session, S, fixed);
    p.net = (ids, n) => { p.calls++; return net(ids, n); };
    p.memo = async (ids, n) => {
      const k = ids.join(',');
      if (!seen.has(k)) seen.set(k, await p.net(ids, n));
      return seen.get(k);
    };
    await SP.spaceText('धर्मक्षेत्रेकुरुक्षेत्रे', p.net, S, threshold);   // the first run starts the WebAssembly: not timed
    packs.set(pack, p);
  }
  return packs.get(pack);
}

// the probabilities a run's spaces were decided on: at the last letter of every unit but the last (p[-1] for a unit
// with no letters at the start, as Python indexes)
function decisions(units, p) {
  const out = [];
  let pos = 0;
  units.forEach(([, x], k) => { pos += Array.from(x).length; if (k < units.length - 1) out.push(p[pos - 1 < 0 ? p.length + pos - 1 : pos - 1]); });
  return out;
}

(async () => {
  // (a) the pipeline's stage fixtures: 09_text.json -> 10_spaced.json
  const dir = process.env.MANUSCRIBE_RECOG_FIXTURES || newest(FIXTURES);
  if (!dir) {
    T.skip('pipeline fixtures', 'none found: set MANUSCRIBE_RECOG_FIXTURES to a folder made by python -m msocr.fixtures');
  } else {
    const index = readJson(path.join(dir, 'index.json'));
    const sp = await spacer(path.resolve(dir, '..', '..', 'model_pack', index.pack));
    console.log('  pipeline fixtures ' + dir + ' (pack ' + index.pack + ', spacer version ' + index.spacer_version + ')');
    T.check("the pack's spacer.json is the version the pipeline fixtures were made with", sp.S.version === index.spacer_version, sp.S.version);
    for (const pg of index.pages) {
      const text = readJson(path.join(dir, pg.dir, '09_text.json')), ref = readJson(path.join(dir, pg.dir, '10_spaced.json'));
      const boxes = Object.keys(text), bad = [];
      let chars = 0;
      const calls = sp.calls, t0 = process.hrtime.bigint();
      for (const b of boxes) {
        const s = text[b].map((l) => l.text).join('');
        chars += Array.from(s).length;
        const mine = await SP.spaceText(s, sp.net, sp.S, sp.threshold);
        if (mine !== ref[b]) bad.push({ box: b, mine: mine.slice(0, 120), ref: String(ref[b]).slice(0, 120) });
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      T.check(pg.page + ': spaced text of ' + boxes.length + ' boxes identical (' + chars + ' characters, ' + (sp.calls - calls) + ' windows, ' + ms.toFixed(0) + ' ms)',
        !bad.length && boxes.length === Object.keys(ref).length, bad);
    }
  }

  // (b) the spacer's fixture set
  const sdir = process.env.MANUSCRIBE_SPACER_FIXTURES || newest(path.join(FIXTURES, 'spacer'));
  if (!sdir) {
    T.skip('spacer fixtures', 'none found: sanskrit_spacer/tools/make_spacer_fixtures.py writes them (MANUSCRIBE_SPACER_FIXTURES elsewhere)');
  } else {
    const index = readJson(path.join(sdir, 'index.json'));
    const sp = await spacer(path.resolve(sdir, '..', '..', '..', 'model_pack', index.pack));
    const items = readJson(path.join(sdir, 'texts.json'));
    console.log('  spacer fixtures ' + sdir + ' (pack ' + index.pack + ', spacer version ' + index.spacer_version + ', ' + items.length + ' texts)');
    T.check("the pack's spacer.json is the version the spacer fixtures were made with", sp.S.version === index.spacer_version, sp.S.version);
    let runs = 0, refused = 0, letters = 0, same = 0, worst = 0, worstAt = '';
    const calls = sp.calls, t0 = Date.now();
    const unitsBad = [], probBad = [], spacedBad = [], ties = [], near = [], kinds = {};
    for (const it of items) {
      kinds[it.kind] = (kinds[it.kind] || 0) + 1;
      let tie = false;
      for (const r of it.runs) {
        runs++;
        const u = SP.units(r.run, sp.S);
        if (JSON.stringify(u) !== JSON.stringify(r.units)) unitsBad.push({ id: it.id, run: r.run, mine: u, ref: r.units });
        if (!r.units) { refused++; continue; }
        const p = await SP.probabilities(r.units.map((x) => x[1]).join(''), sp.memo, sp.S);
        if (p.length !== r.p.length) { probBad.push({ id: it.id, letters: [p.length, r.p.length] }); continue; }
        let w = 0;
        for (let i = 0; i < p.length; i++) {
          const d = Math.abs(p[i] - r.p[i]);
          if (d > w) w = d;
          same += d === 0;
        }
        letters += p.length;
        if (w > worst) { worst = w; worstAt = it.id; }
        if (w > 1e-5) probBad.push({ id: it.id, run: r.run.slice(0, 40), largest: w });
        if (decisions(r.units, r.p).some((q) => Math.abs(q - index.threshold) <= 1e-5)) tie = true;
      }
      if (tie) near.push(it.id);
      const mine = await SP.spaceText(it.text, sp.memo, sp.S, index.threshold);
      if (mine !== it.spaced) (tie ? ties : spacedBad).push({ id: it.id, mine: mine.slice(0, 120), ref: it.spaced.slice(0, 120) });
    }
    console.log('  ' + (sp.calls - calls) + ' windows through the network, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    T.check('units identical on ' + runs + ' runs of ' + items.length + ' texts (' + refused + ' runs refused: null)', !unitsBad.length, unitsBad.slice(0, 3));
    T.check('probabilities of ' + letters + ' letters within 1e-5 (largest difference ' + worst.toExponential(1) + (worstAt ? ' in ' + worstAt : '') + '; ' + same + ' exactly the same)',
      !probBad.length, probBad.slice(0, 5));
    const kindList = Object.keys(kinds).map((k) => kinds[k] + ' ' + k).join(', ');
    T.check('spaced text identical on ' + (items.length - spacedBad.length - ties.length) + ' of ' + items.length + ' texts (' + kindList + ')', !spacedBad.length, spacedBad.slice(0, 3));
    console.log('  texts with a probability within 1e-5 of the threshold ' + index.threshold + ': ' + (near.length ? near.join(', ') : 'none'));
    // the same texts with the windows run 16 at a time (spaceTextBatched), as the recognition worker runs them
    const t1 = Date.now(), batchBad = [];
    for (const it of items) {
      const mine = await SP.spaceTextBatched(it.text, sp.batch, sp.S, index.threshold);
      if (mine !== it.spaced && !ties.some((t) => t.id === it.id)) batchBad.push({ id: it.id, mine: mine.slice(0, 120), ref: it.spaced.slice(0, 120) });
    }
    T.check('spaced text identical with the windows run 16 at a time, on ' + (items.length - batchBad.length) + ' of ' + items.length + ' texts (' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)', !batchBad.length, batchBad.slice(0, 3));
    for (const t of ties) T.skip('spaced text of ' + t.id, 'differs at a genuine tie: a probability within 1e-5 of the threshold');
  }
  T.done();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
