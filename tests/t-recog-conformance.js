// Recognition in the browser, held to the reference: the JavaScript stages (app/js/recogimage.js, recogvector.js,
// recogrows.js; the segmenter through ONNX Runtime Web's WebAssembly backend, the same binary as in the browser, here under
// Node) run on the stage fixtures that manuscript_ocr's reference pipeline wrote (python -m msocr.fixtures), and each
// output is compared with the reference's within its tolerance. Fixtures: MANUSCRIBE_RECOG_FIXTURES=<folder of one pack's
// fixtures>, or the newest under ../../lexicon_manuscripts/manuscript_ocr/data/fixtures; skipped where there are none (they
// hold manuscript pages, which are not distributed). The row finder is also held to the reference on the wider set of
// pages in data/fixtures/rows (tools/rows_fixtures.py; MANUSCRIBE_ROWS_FIXTURES=<folder> elsewhere), where there is one.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checks, ROOT } = require('./h');
const { readPng } = require('./png');

const T = checks('recognition stages against the reference fixtures');
const ctx = { window: { ME: {} }, Math, Uint8Array, Int32Array, Float32Array, Float64Array, BigInt64Array, Array, Map, Infinity };
vm.createContext(ctx);
const ctxGlobals = { TextDecoder, DataView, Uint16Array, Blob: globalThis.Blob, Response: globalThis.Response, DecompressionStream: globalThis.DecompressionStream };
Object.assign(ctx, ctxGlobals);
for (const f of ['recogimage.js', 'recogvector.js', 'recogrows.js', 'recogread.js', 'recoglm.js', 'recogspace.js', 'recogpage.js'].filter((f) => fs.existsSync(path.join(ROOT, 'app', 'js', f)))) vm.runInContext(fs.readFileSync(path.join(ROOT, 'app', 'js', f), 'utf8'), ctx);
const R = ctx.window.ME.RecogImage, V = ctx.window.ME.RecogVector, RR = ctx.window.ME.RecogRows, RD = ctx.window.ME.RecogRead, RP = ctx.window.ME.RecogPage, RL = ctx.window.ME.RecogLM;
const zlib = require('zlib');
// a pack's language model as the worker builds it (recoglm.js), from the pack's files; null where it has none
function packLM(pack, manifest) {
  if (!manifest.lm || !manifest.lm.components || !RL) return null;
  return RL.mix(manifest.lm.components.map((c) => ({ weight: c.weight, model: RL.load(new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(pack, c.file))))) })));
}
const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;

function readF32(file) {
  const b = fs.readFileSync(file);
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

// the largest gap between two lists of lines: [same number, largest distance of a point from its counterpart]
function compareLines(a, b) {
  if (a.length !== b.length) return [false, Infinity];
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    for (const part of ['baseline', 'boundary']) {
      const p = a[i][part], q = b[i][part];
      if (p.length !== q.length) return [true, Infinity];
      for (let j = 0; j < p.length; j++) worst = Math.max(worst, Math.abs(p[j][0] - q[j][0]), Math.abs(p[j][1] - q[j][1]));
    }
  }
  return [true, worst];
}

// rows {box: [[baseline, outline], ...]} against the reference's: the same boxes, rows, and points, every coordinate
// within 1 px -> {ok, worst, why}
function compareRows(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return { ok: false, worst: Infinity, why: 'boxes ' + ka.join(',') + ' against ' + kb.join(',') };
  let worst = 0;
  const why = [];
  for (const k of ka) {
    if (a[k].length !== b[k].length) { why.push(k + ': ' + a[k].length + ' rows against ' + b[k].length); continue; }
    a[k].forEach((row, i) => [0, 1].forEach((j) => {
      const p = row[j], q = b[k][i][j];
      if (p.length !== q.length) { why.push(k + ' row ' + (i + 1) + ': ' + ['baseline', 'outline'][j] + ' of ' + p.length + ' points against ' + q.length); return; }
      for (let m = 0; m < p.length; m++) worst = Math.max(worst, Math.abs(p[m][0] - q[m][0]), Math.abs(p[m][1] - q[m][1]));
    }));
  }
  if (why.length) return { ok: false, worst: Infinity, why: why.join('; ') };
  return { ok: worst <= 1, worst, why: worst <= 1 ? '' : 'a point ' + worst + ' px away' };
}
const rowCounts = (rows) => Object.keys(rows).map((k) => k + ' ' + rows[k].length).join(', ') || 'none';

const FIXTURES = path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscript_ocr', 'data', 'fixtures');
function fixturesDir() {
  if (process.env.MANUSCRIBE_RECOG_FIXTURES) return process.env.MANUSCRIBE_RECOG_FIXTURES;
  const base = FIXTURES;
  if (!fs.existsSync(base)) return null;
  const packs = fs.readdirSync(base).filter((d) => d !== 'rows' && fs.existsSync(path.join(base, d, 'index.json'))).sort();   // rows: the row finder's own
  return packs.length ? path.join(base, packs[packs.length - 1]) : null;
}

function maxDiff(a, b) {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; }
  return m;
}

const dir = fixturesDir();
const jobs = [];                       // pages whose maps the segmenter makes again, after the checks done in Node
if (!dir) {
  T.skip('fixtures', 'none found: set MANUSCRIBE_RECOG_FIXTURES to a folder made by python -m msocr.fixtures');
} else {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const pipeline = JSON.parse(fs.readFileSync(path.resolve(dir, '..', '..', 'model_pack', index.pack, 'pipeline.json'), 'utf8'));
  console.log('  fixtures ' + dir + ' (pack ' + index.pack + ', pipeline version ' + index.pipeline_version + ')');
  T.check('pipeline.json is the version the fixtures were made with', pipeline.version === index.pipeline_version, pipeline.version);
  for (const pg of index.pages) {
    const d = path.join(dir, pg.dir);
    const page = readPng(path.join(d, '00_page.png'));
    const g = R.grey(page.data, page.width, page.height, page.channels);
    const ref = readPng(path.join(d, '01_grey.png'));
    T.check(pg.page + ': grey exact', maxDiff(g, ref.data) === 0, { maxDiff: maxDiff(g, ref.data) });
    const [sw, sh] = R.segmenterSize(page.width, page.height, pipeline.segmenter.img_h);
    const segIn = readPng(path.join(d, '02_seg_input.png'));
    const mine = R.resize(ref.data, page.width, page.height, sw, sh);
    const dSeg = sw === segIn.width && sh === segIn.height ? maxDiff(mine, segIn.data) : Infinity;
    T.check(pg.page + ': segmenter input ' + sw + 'x' + sh + ' within 1 grey level (largest difference ' + dSeg + ')', dSeg <= 1, { size: [sw, sh], ref: [segIn.width, segIn.height], maxDiff: dSeg });
    const crops = fs.readdirSync(d).filter((f) => f.startsWith('06_crop_')).sort();
    let worst = 0, sizesOk = true, exact = 0;
    for (const f of crops) {
      const crop = readPng(path.join(d, f));
      const cg = R.grey(crop.data, crop.width, crop.height, crop.channels);
      const [rw, rh] = R.recogniserSize(crop.width, crop.height, pipeline.recogniser.height, pipeline.recogniser.stride);
      const refIn = readPng(path.join(d, f.replace('06_crop_', '07_rec_input_')));
      if (rw !== refIn.width || rh !== refIn.height) { sizesOk = false; continue; }
      const m = maxDiff(R.resize(cg, crop.width, crop.height, rw, rh), refIn.data);
      worst = Math.max(worst, m);
      exact += m === 0;
    }
    T.check(pg.page + ': recogniser input of ' + crops.length + ' lines within 1 grey level (' + exact + ' exact)', sizesOk && worst <= 1, { sizesOk, maxDiff: worst });

    // the reference's maps, and the lines the vectoriser makes of them
    const fx = JSON.parse(fs.readFileSync(path.join(d, 'fixture.json'), 'utf8'));
    const [, mh, mw] = fx.files['03_maps.f32'].shape;
    const refMaps = readF32(path.join(d, '03_maps.f32'));
    const plane = mh * mw;
    const lines = V.vectorize(refMaps.subarray(0, plane), refMaps.subarray(plane, 2 * plane), refMaps.subarray(2 * plane), mh, mw, fx.scale, pipeline.segmenter);
    const refLines = JSON.parse(fs.readFileSync(path.join(d, '04_lines.json'), 'utf8'));
    const [sameCount, far] = compareLines(lines, refLines);
    T.check(pg.page + ': vectoriser, ' + lines.length + ' lines from the reference maps, every point within 1 px (largest ' + far + ')', sameCount && far <= 1, { sameCount, far });

    // the rows and blocks the row finder makes of the reference's lines on the reference's grey page
    const rows = RR.rows(refLines, ref.data, ref.width, ref.height, fx.layout, pipeline);
    const cr = compareRows(rows, JSON.parse(fs.readFileSync(path.join(d, '05_rows.json'), 'utf8')));
    T.check(pg.page + ': rows (' + fx.layout + '; ' + rowCounts(rows) + '), every point within 1 px (largest ' + cr.worst + ')', cr.ok, cr.why);

    // the line images the cutter makes of the reference's rows on the page as read, and what the recogniser is given
    const refRows = JSON.parse(fs.readFileSync(path.join(d, '05_rows.json'), 'utf8'));
    const lineJobs = [];
    let cutWorst = 0, cutExact = 0, cutSizes = true, cutN = 0, inWorst = 0;
    for (const box of Object.keys(refRows)) {
      refRows[box].forEach(([baseline, outline], i) => {
        const name = box + '_' + String(i + 1).padStart(2, '0');
        const crop = RD.cut(page.data, page.width, page.height, page.channels, baseline, outline, pipeline);
        const refCrop = readPng(path.join(d, '06_crop_' + name + '.png'));
        cutN++;
        if (crop.width !== refCrop.width || crop.height !== refCrop.height || crop.channels !== refCrop.channels) { cutSizes = false; return; }
        const m = maxDiff(crop.data, refCrop.data);
        cutWorst = Math.max(cutWorst, m); cutExact += m === 0;
        const x = RD.input(crop, pipeline), refIn = readPng(path.join(d, '07_rec_input_' + name + '.png'));
        let mi = x.width === refIn.width && x.height === refIn.height ? 0 : Infinity;
        for (let k = 0; mi < Infinity && k < x.data.length; k++) mi = Math.max(mi, Math.abs(Math.round((1 - x.data[k]) * 255) - refIn.data[k]));
        inWorst = Math.max(inWorst, mi);
        lineJobs.push({ name, x });
      });
    }
    T.check(pg.page + ': line cutter, ' + cutN + ' line images within 1 grey level (' + cutExact + ' exact, largest difference ' + cutWorst + ')', cutSizes && cutWorst <= 1, { cutSizes, cutWorst });
    T.check(pg.page + ': recogniser input from those line images within 1 grey level (largest difference ' + inWorst + ')', inWorst <= 1, inWorst);
    jobs.push({ page: pg.page, d, segIn, mh, mw, refMaps, plane, lineJobs, text: JSON.parse(fs.readFileSync(path.join(d, '09_text.json'), 'utf8')) });
  }
}

// the row finder on the wider set of pages: one check for them all, and one for every page that differs
const rowsDir = process.env.MANUSCRIBE_ROWS_FIXTURES || path.join(FIXTURES, 'rows');
const rowPages = fs.existsSync(path.join(rowsDir, 'index.json')) ? fs.readdirSync(rowsDir).filter((p) => fs.existsSync(path.join(rowsDir, p, 'meta.json'))).sort() : [];
if (!rowPages.length) {
  T.skip('row finder on the rows fixtures', 'none found: tools/rows_fixtures.py in manuscript_ocr writes them');
} else {
  // the parameters they were made with: the reference's own pipeline.json, beside data/
  const index = JSON.parse(fs.readFileSync(path.join(rowsDir, 'index.json'), 'utf8'));
  const P = JSON.parse(fs.readFileSync(path.resolve(rowsDir, '..', '..', '..', 'msocr', 'pipeline.json'), 'utf8'));
  T.check('pipeline.json is the version the rows fixtures were made with', P.version === index.pipeline_version, P.version);
  const layouts = {}, failed = [];
  let worst = 0, exact = 0;
  for (const p of rowPages) {
    const d = path.join(rowsDir, p), meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    const grey = readPng(path.join(d, 'grey.png'));
    let c;
    try {
      const rows = RR.rows(JSON.parse(fs.readFileSync(path.join(d, 'lines.json'), 'utf8')), grey.data, grey.width, grey.height, meta.layout, P);
      c = compareRows(rows, JSON.parse(fs.readFileSync(path.join(d, 'rows.json'), 'utf8')));
    } catch (e) { c = { ok: false, worst: Infinity, why: String(e) }; }
    layouts[meta.layout] = (layouts[meta.layout] || 0) + 1;
    if (c.ok) { worst = Math.max(worst, c.worst); exact += c.worst === 0; } else failed.push([p, c]);
  }
  for (const [p, c] of failed) T.check('rows fixture ' + p, false, c.why);
  const kinds = Object.keys(layouts).map((k) => layouts[k] + ' ' + k).join(', ');
  T.check('row finder on ' + rowPages.length + ' rows fixtures (' + kinds + '): ' + (rowPages.length - failed.length) + ' within 1 px, ' + exact + ' exact (largest difference ' + worst + ' px)',
    !failed.length, failed.map(([p]) => p));
  // the block finder not told the layout (what a manuscript's layout is told from): the same blocks, with as many rows
  const told = rowPages.filter((p) => fs.existsSync(path.join(rowsDir, p, 'untold.json')));
  if (!told.length) T.skip('blocks found untold', 'the rows fixtures have no untold.json: tools/rows_fixtures.py writes them');
  else {
    const differ = [];
    for (const p of told) {
      const d = path.join(rowsDir, p), grey = readPng(path.join(d, 'grey.png'));
      const want = JSON.parse(fs.readFileSync(path.join(d, 'untold.json'), 'utf8'));
      let got;
      try { got = RR.untold(JSON.parse(fs.readFileSync(path.join(d, 'lines.json'), 'utf8')), grey.data, grey.width, grey.height, P); } catch (e) { got = String(e); }
      const key = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
      if (typeof got !== 'object' || key(got) !== key(want)) differ.push([p, want, got]);
    }
    T.check('blocks found untold on ' + told.length + ' rows fixtures as the reference finds them (blocks and rows in each): ' + (told.length - differ.length) + ' the same', !differ.length, differ.slice(0, 4));
  }
}

// the segmenter itself, through ONNX Runtime Web, on the reference's resized input
(async () => {
  if (dir) {
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    const pack = path.resolve(dir, '..', '..', 'model_pack', index.pack);
    const session = await ort.InferenceSession.create(path.join(pack, 'segmenter.onnx'), { executionProviders: ['wasm'] });
    const pipeline = JSON.parse(fs.readFileSync(path.join(pack, 'pipeline.json'), 'utf8'));
    for (const j of jobs) {
      const pad = pipeline.segmenter.pad_to, W = Math.ceil(j.segIn.width / pad) * pad, h = j.segIn.height;
      const x = new Float32Array(h * W);
      for (let y = 0; y < h; y++) for (let c = 0; c < j.segIn.width; c++) x[y * W + c] = 1 - j.segIn.data[y * j.segIn.width + c] / 255;
      const out = await session.run({ x: new ort.Tensor('float32', x, [1, 1, h, W]) });
      const m = V.maps(out.y.data, h, W, j.segIn.width, pipeline.segmenter);
      const worst = [m.pbase, m.up, m.down].map((a, k) => { let w = 0; for (let i = 0; i < j.plane; i++) w = Math.max(w, Math.abs(a[i] - j.refMaps[k * j.plane + i])); return w; });
      T.check(j.page + ': segmenter maps within 1e-3 of the reference (largest: baseline ' + worst[0].toExponential(1) + ', up ' + worst[1].toExponential(1) + ', down ' + worst[2].toExponential(1) + ')', worst.every((v) => v <= 1e-3), worst);
    }
    // the recogniser on the JavaScript's own line images, and its output decoded
    const rec = await ort.InferenceSession.create(path.join(pack, 'recogniser.onnx'), { executionProviders: ['wasm'] });
    const chars = JSON.parse(fs.readFileSync(path.join(pack, 'recogniser_chars.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
    const lm = packLM(pack, manifest);
    if (manifest.lm) {
      // the language model itself: every distribution sums to one, and the odds it gives are the reference's (lm.json)
      const probs = (ctx) => { let s = 0; for (let k = 0; k < lm.symbols.length; k++) s += Math.exp(lm.logp(ctx, k)); return s; };
      const sums = [[], [lm.symbol('क')], [lm.symbol('अ'), lm.symbol('म'), lm.symbol('ृ')], [0, lm.symbol('ध'), lm.symbol('र'), lm.symbol('्'), lm.symbol('म'), lm.symbol('क')]].map(probs);
      T.check('the pack\'s language model loaded (' + manifest.lm.components.map((c) => c.name).join(' + ') + '): P(next letter | context) sums to one for every context tried (within the thousandth of a nat its tables keep)', sums.every((s) => Math.abs(s - 1) < 2e-3), sums);
    } else T.skip('the pack\'s language model', 'none in ' + manifest.pack);
    for (const j of jobs) {
      let worst = 0, same = 0, confWorst = 0, greedySame = 0, portSame = 0, portConf = 0;
      const differ = [], portDiffer = [];
      for (const lj of j.lineJobs) {
        const out = await rec.run({ x: new ort.Tensor('float32', lj.x.data, [1, 1, lj.x.height, lj.x.width]) });
        const [, t, c] = out.y.dims;
        const ref = readF32(path.join(j.d, '08_logits_' + lj.name + '.f32'));
        worst = Math.max(worst, maxDiff(out.y.data, ref));
        const [box, k] = [lj.name.replace(/_\d+$/, ''), +lj.name.slice(-2) - 1];
        const want = j.text[box][k];
        if (RD.decode(out.y.data, t, c, chars).text === RD.decode(ref, t, c, chars).text) greedySame++;
        if (lm) {
          const port = RL.decode(ref, t, c, chars, lm, pipeline.lm);
          if (port.text === want.text) portSame++; else portDiffer.push(lj.name);
          portConf = Math.max(portConf, Math.abs(port.conf - want.conf));
        }
        const got = lm ? RL.decode(out.y.data, t, c, chars, lm, pipeline.lm) : RD.decode(out.y.data, t, c, chars);
        if (got.text === want.text) { same++; confWorst = Math.max(confWorst, Math.abs(got.conf - want.conf)); } else differ.push(lj.name);
      }
      const n = j.lineJobs.length;
      T.check(j.page + ': recogniser logits on ' + n + ' lines within 1e-3 of the reference (largest ' + worst.toExponential(1) + ')', worst <= 1e-3, worst);
      T.check(j.page + ': the runtime\'s logits read greedily give the reference\'s greedy text on all ' + n + ' lines', greedySame === n, greedySame);
      if (lm) T.check(j.page + ': the language-model search on the reference\'s own logits gives its text on all ' + n + ' lines, confidence within 0.01 (largest difference ' + portConf.toFixed(4) + ')', portSame === n && portConf <= 0.01, portDiffer);
      // the runtime's logits differ from the reference's in the fifth decimal; a beam search may then tip between two
      // readings of nearly equal score, so a few lines may differ: not more than one in eight
      T.check(j.page + ': decoded text' + (lm ? ' (with the language model)' : '') + ' on the runtime\'s logits identical on ' + same + ' of ' + n + ' lines' + (lm ? ' (at least seven of eight)' : '') + ', confidence within 0.01 where identical (largest difference ' + confWorst.toFixed(4) + ')', (lm ? same >= Math.ceil(7 * n / 8) : same === n) && confWorst <= 0.01, differ);
    }

    // the whole side at once (recogpage.js), from the page's pixels to the text of its rows, the networks run here
    const spacing = !!ctx.window.ME.RecogSpace;
    const sp = spacing ? await ort.InferenceSession.create(path.join(pack, 'spacer.onnx'), { executionProviders: ['wasm'] }) : null;
    const nets = {
      segment: async (x, h, W) => (await session.run({ x: new ort.Tensor('float32', x, [1, 1, h, W]) })).y.data,
      recognise: async (x, h, w) => { const y = (await rec.run({ x: new ort.Tensor('float32', x, [1, 1, h, w]) })).y; return { data: y.data, T: y.dims[1], C: y.dims[2] }; },
    };
    const packData = { P: pipeline, chars, S: JSON.parse(fs.readFileSync(path.join(pack, 'spacer.json'), 'utf8')), threshold: manifest.models.spacer.threshold, lm };
    // as the worker does: a spacer of any length a window at a time, one of a fixed length in batches
    const spLen = typeof manifest.models.spacer.input.shape[1] === 'number' ? manifest.models.spacer.input.shape[1] : null;
    if (sp && spLen) nets.spaceBatch = ctx.window.ME.RecogSpace.ortBatchNetwork(ort, sp, packData.S, spLen);
    else if (sp) nets.space = ctx.window.ME.RecogSpace.ortNetwork(ort, sp, packData.S, null);
    for (const j of jobs) {
      const page = readPng(path.join(j.d, '00_page.png'));
      const fx = JSON.parse(fs.readFileSync(path.join(j.d, 'fixture.json'), 'utf8'));
      const t0 = Date.now();
      const res = await RP.run(page, fx.layout, nets, packData, { space: spacing });
      const ms = Date.now() - t0;
      const want = j.text, got = res.boxes;
      const sameBoxes = Object.keys(got).sort().join() === Object.keys(want).sort().join();
      let rowsN = 0, same = 0;
      const agreed = {};      // blocks whose every row is read as the reference reads it
      for (const b of Object.keys(want)) { agreed[b] = true; (want[b] || []).forEach((l, k) => { rowsN++; if (got[b] && got[b][k] && got[b][k].text === l.text) same++; else agreed[b] = false; }); }
      const enough = lm ? same >= Math.ceil(7 * rowsN / 8) : same === rowsN;     // as above: a beam search on logits a shade apart
      T.check(j.page + ': the whole side from its pixels (' + ms + ' ms on one thread: ' + Object.entries(res.times).map(([k, v]) => k + ' ' + v).join(', ') + '): ' + same + ' of ' + rowsN + ' rows read as the reference reads them' + (lm ? ' (at least seven of eight)' : ''), sameBoxes && enough && Object.values(got).every((rs, i) => rs.length === Object.values(want)[i].length), { boxes: Object.keys(got), times: res.times });
      if (spacing) {
        const ref = JSON.parse(fs.readFileSync(path.join(j.d, '10_spaced.json'), 'utf8'));
        const blocks = Object.keys(ref).filter((b) => agreed[b]);
        const bad = blocks.filter((b) => !got[b] || got[b].map((r) => r.spaced).join('').replace(/\s+/g, ' ').trim() !== ref[b].replace(/\s+/g, ' ').trim());
        T.check(j.page + ': word spaces as the reference puts them, given back to the rows (' + blocks.length + ' of ' + Object.keys(ref).length + ' blocks read as the reference reads them)', !bad.length, bad);
      }
    }
  }
  T.done();
})();
