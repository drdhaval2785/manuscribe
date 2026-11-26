// Recognition in the app, in the browser itself: the recognition pack fetched from a site (a local copy of
// manuscribe-models, made by manuscript_ocr's msocr/site.py) and kept, a tampered file refused and the pack kept before
// it left as it was, the pack read from a folder instead; the recognition worker, built from source on a page opened
// from disk, reading the reference's fixture pages as the reference reads them (rows, text and word spaces, on
// WebAssembly; on WebGPU too where the browser has it, which is reported); then, on linear.pdf, "Recognise this side"
// from the Folio tab proposing lines with where they were cut from, nothing over typed text; and the training consent
// (approved, version 1; a draft refused; the question asked, the answer kept in the project), the package of corrected
// lines (their images cut again, their corrected text, the consent record), sealed to a key of the test's own served as
// the site's contribute.json and opened here by OpenSSL, saved, with the inbox's issue form opened filled in, and the
// withdrawal with its request. MANUSCRIBE_SAVE_CONTRIBUTION=<folder> keeps the sealed package and the test's key there
// (for manuscribe-contributions/tools/inbox.py check and msocr.contributions to open).
// Site: MANUSCRIBE_RECOG_SITE, or ../../lexicon_manuscripts/manuscribe-models; fixtures as in t-recog-conformance.js.
// Skipped where they are absent (the models are not in this repository; the fixtures hold manuscript pages).
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { launch, sleep, checks, ROOT } = require('./h');
const { readPng } = require('./png');

const T = checks('recognition in the app: pack, worker, proposed lines, consent');
const SITE = process.env.MANUSCRIBE_RECOG_SITE || path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscribe-models');
const FIXTURES = path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscript_ocr', 'data', 'fixtures');

// a key of the test's own, published as the site's contribute.json
const KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SPKI = KEY.publicKey.export({ type: 'spki', format: 'der' });
const CONTRIBUTE = { schema: 1, inbox: 'test-owner/test-inbox', email: 'maintainer@example.org', wordings: ['1', '2'], sides: ['2'], script: 'sa-Deva',
  key: { id: crypto.createHash('sha256').update(SPKI).digest('hex').slice(0, 16), alg: 'RSA-OAEP-256+A256GCM', spki: SPKI.toString('base64') } };
// what msocr.seal and the inbox do, by OpenSSL: the AES key unwrapped, the lines opened (the tag is GCM's last 16 bytes)
function openSealed(seal, sealed) {
  const k = crypto.privateDecrypt({ key: KEY.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(seal.wrapped, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(seal.iv, 'base64'));
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

// the site, with /tampered/ the same but for one byte of the recogniser, and the test's contribute.json
function siteServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const tampered = rel.startsWith('tampered/');
    if (tampered) rel = rel.slice('tampered/'.length);
    if (rel === 'contribute.json') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(CONTRIBUTE)); return; }
    const f = path.join(SITE, rel);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    let body = fs.readFileSync(f);
    if (tampered && rel.endsWith('recogniser.onnx')) { body = Buffer.from(body); body[body.length - 1] ^= 1; }
    res.writeHead(200, { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function fixturePages() {
  const dir = process.env.MANUSCRIBE_RECOG_FIXTURES || (() => {
    if (!fs.existsSync(FIXTURES)) return null;
    const sets = fs.readdirSync(FIXTURES).filter((d) => !['rows', 'spacer'].includes(d) && fs.existsSync(path.join(FIXTURES, d, 'index.json'))).sort();
    return sets.length ? path.join(FIXTURES, sets[sets.length - 1]) : null;
  })();
  if (!dir) return [];
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  return index.pages.map((pg) => {
    const d = path.join(dir, pg.dir), fx = JSON.parse(fs.readFileSync(path.join(d, 'fixture.json'), 'utf8'));
    return { page: pg.page, d, layout: fx.layout, pack: index.pack, text: JSON.parse(fs.readFileSync(path.join(d, '09_text.json'), 'utf8')), spaced: JSON.parse(fs.readFileSync(path.join(d, '10_spaced.json'), 'utf8')) };
  });
}

const sameRows = (got, want) => Object.keys(want).every((b) => got[b] && got[b].length === want[b].length && got[b].every((r, k) => r.text === want[b][k].text)) && Object.keys(got).every((b) => want[b]);
const sameSpaces = (got, want) => Object.keys(want).every((b) => got[b] && got[b].map((r) => r.spaced).join('').replace(/\s+/g, ' ').trim() === want[b].replace(/\s+/g, ' ').trim());

(async () => {
  if (!fs.existsSync(path.join(SITE, 'index.json'))) { T.skip('all', 'no recognition site at ' + SITE + ' (manuscript_ocr: python -m msocr.site)'); T.done(); return; }
  const server = await siteServer();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const { browser, page } = await launch('recognise');
  try {
    // ---- the pack: fetched, checked, kept
    const got = await page.evaluate(async (url) => {
      const steps = [];
      const rec = await ME.RecogPack.install(url, null, (p) => steps.push(p.got));
      const kept = await ME.RecogPack.installed();
      return { pack: rec.pack, bytes: rec.bytes, variant: kept && kept.runtime.variant, steps: steps.length, keys: kept && kept.keys.length };
    }, url);
    const index = JSON.parse(fs.readFileSync(path.join(SITE, 'index.json'), 'utf8'));
    // kept: three models, three parameter files, the runtime's two, and the language model's files where the pack has them
    const latestMan = JSON.parse(fs.readFileSync(path.join(SITE, index.packs.find((p) => p.id === index.latest).manifest), 'utf8'));
    const nKeys = 8 + ((latestMan.lm && latestMan.lm.components) || []).length;
    T.check('the pack fetched from the site, checked and kept (' + got.pack + ', ' + (got.bytes / 1e6).toFixed(1) + ' MB, runtime for ' + got.variant + (nKeys > 8 ? ', with its language model' : '') + ')', got.pack === index.latest && got.keys === nKeys && got.steps > 8, got);
    const bad = await page.evaluate(async (url) => {
      try { await ME.RecogPack.install(url + 'tampered/'); return { refused: false }; } catch (e) { return { refused: /checksum/.test(e.message), msg: e.message, still: (await ME.RecogPack.installed()).source }; }
    }, url);
    T.check('a file that is not what its manifest names is refused, and the pack kept before stays', bad.refused && bad.still === url, bad);

    // ---- the worker on the reference's fixture pages
    const pages = fixturePages();
    if (!pages.length) T.skip('the worker on the fixture pages', 'no fixtures (python -m msocr.fixtures in manuscript_ocr)');
    for (const gpu of [false, true]) {
      if (!pages.length) break;
      const has = gpu ? await page.evaluate(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null))) : true;
      if (!has) { T.skip('the worker on WebGPU', 'this browser has no WebGPU adapter'); break; }
      await page.evaluate(async (gpu) => { const b = await ME.RecogPack.load(); b.gpu = gpu; window.recogW = ME.RecogWorker.start(b); await window.recogW.ready; }, gpu);
      for (const pg of pages) {
        const png = readPng(path.join(pg.d, '00_page.png'));
        const res = await page.evaluate(async (b64, w, h, ch, layout) => {
          const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const t0 = performance.now();
          const r = await window.recogW.read({ data, width: w, height: h, channels: ch }, layout, { space: true });
          r.ms = Math.round(performance.now() - t0);
          return r;
        }, Buffer.from(png.data).toString('base64'), png.width, png.height, png.channels, pg.layout);
        // with a language model in the pack, a beam search on logits a shade apart from the reference's may tip a
        // row or two between readings of nearly equal score: at least seven rows of eight, and spaces where all agree
        const n = Object.values(pg.text).reduce((a, x) => a + x.length, 0);
        const lmPack = !!(await page.evaluate(async () => { const m = await ME.RecogPack.installed(); return m && m.manifest.lm; }));
        const agree = Object.keys(pg.text).filter((b) => res.boxes[b] && res.boxes[b].length === pg.text[b].length && res.boxes[b].every((r, k) => r.text === pg.text[b][k].text));
        const sameN = Object.keys(pg.text).reduce((a, b) => a + (res.boxes[b] ? res.boxes[b].filter((r, k) => pg.text[b][k] && r.text === pg.text[b][k].text).length : 0), 0);
        const rows = lmPack ? Object.keys(pg.text).every((b) => res.boxes[b] && res.boxes[b].length === pg.text[b].length) && sameN >= Math.ceil(7 * n / 8) : sameRows(res.boxes, pg.text);
        const spaces = lmPack ? agree.every((b) => sameSpaces({ [b]: res.boxes[b] }, { [b]: pg.spaced[b] })) : sameSpaces(res.boxes, pg.spaced);
        const what = pg.page + (gpu ? ' on WebGPU' : ' on WebAssembly') + ' in the worker (' + res.ms + ' ms: ' + Object.entries(res.times).map(([k, v]) => k + ' ' + v).join(', ') + '; ' + Object.entries(res.backends).map(([k, v]) => k + ' ' + v).join(', ') + ')';
        if (gpu && !(rows && spaces)) T.skip(what, 'differs from the reference on WebGPU (its arithmetic is not the CPU\'s): reported, not failed');
        else T.check(what + ': ' + (lmPack ? sameN + ' of ' + n + ' rows (with the language model; at least seven of eight) and the word spaces of the blocks that agree' : n + ' rows and their word spaces') + ' as the reference reads them', rows && spaces, { rows, spaces, sameN, n });
      }
      await page.evaluate(() => { window.recogW.close(); window.recogW = null; });
    }

    // ---- the pack read from a folder instead
    const fromFiles = await page.evaluate(async (url, files) => {
      const list = [];
      for (const rel of files) {
        const b = await (await fetch(url + rel)).blob();
        const f = new File([b], rel.split('/').pop());
        Object.defineProperty(f, 'webkitRelativePath', { value: 'manuscribe-models/' + rel });
        list.push(f);
      }
      const rec = await ME.RecogPack.installFiles(list);
      return { pack: rec.pack, source: rec.source, variant: rec.runtime.variant };
    }, url, (() => {
      const out = ['index.json'];
      const walk = (d) => { for (const f of fs.readdirSync(path.join(SITE, d))) { const r = d ? d + '/' + f : f; if (fs.statSync(path.join(SITE, r)).isDirectory()) walk(r); else if (/\.(json|onnx|mjs|wasm|gz)$/.test(f) && r !== 'index.json') out.push(r); } };
      walk('');
      return out;
    })());
    T.check('the pack read from the site\'s folder chosen on disk (' + fromFiles.variant + ')', fromFiles.pack === index.latest && fromFiles.source === 'files', fromFiles);

    // ---- in a project: "Recognise this side"
    const pdf = path.join(ROOT, 'linear.pdf');
    if (!fs.existsSync(pdf)) { T.skip('recognising in a project', 'linear.pdf is not in the repository folder'); return; }
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Recognise', siglum: 'R', repository: 'Test library', shelfmark: 'MS 1' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      await ME.Store.putProject(p);
      await ME.Store.putPdf(p.id, blob);
      await ME.App.open(p.id);
    }, fs.readFileSync(pdf).toString('base64'));
    for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    // a line typed already, which recognition must leave alone
    // and a line count far above the rows the side has, which recognition is to bring down to them
    await page.evaluate(() => { const p = ME.App.project, e = ME.App.entries[ME.App.idx]; p.pages[e.label] = p.pages[e.label] || { boxes: {} }; p.pages[e.label].boxes = { main: ['typed by hand'] }; p.pages[e.label].lines = { main: 40 }; ME.App.changed(); ME.App.rerender(); });
    await page.evaluate(() => { const t = document.querySelector('.side-tab[data-tab="folio"]'); if (t) t.click(); else { ME.App.project.ui.sidebarTab = 'folio'; ME.App.refreshSidebar(); } });
    await sleep(300);
    const button = await page.evaluate(() => !!document.querySelector('[data-action="recognise"]'));
    T.check('the Folio tab offers "Recognise this side…"', button);
    await page.evaluate(() => { window.recogRun = null; const b = document.querySelector('[data-action="recognise"]'); if (b) b.click(); else ME.RecogView.recognise(); });
    for (let k = 0; k < 50 && !(await page.evaluate(() => !!document.querySelector('.modal [data-recog="count"]'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.modal .btn.primary').click());
    for (let k = 0; k < 600 && !(await page.evaluate(() => ME.RecogView.last && !document.querySelector('.modal [data-recog="status"]'))); k++) await sleep(200);
    const run = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = p.pages[e.label] || {};
      const prop = Object.entries(pg.proposed || {}).flatMap(([box, l]) => Object.entries(l).map(([i, x]) => ({ box, i: +i, x })));
      return { last: ME.RecogView.last, proposed: prop.length, withCut: prop.filter((y) => y.x.cut && y.x.cut.b.length > 1).length, typed: pg.boxes.main[0], firstProposed: prop.length ? prop[0].i : null,
        count: ME.Model.lineCount(p, e.label, 'main'), from: pg.linesFrom && pg.linesFrom.main, length: pg.boxes.main.length, shown: document.querySelectorAll('.line').length,
        sources: (p.sources || []).map((s) => s.model + ' ' + s.version), marked: document.querySelectorAll('.line.proposed').length, sample: prop.slice(0, 3).map((y) => y.x.text) };
    });
    T.check('"Recognise this side" proposes lines (' + run.proposed + ', ' + (run.last && run.last.times[0] ? run.last.times[0].total + ' ms, ' + Object.entries(run.last.times[0].backends || {}).map(([k, v]) => k + ' ' + v).join(', ') : '') + '), each with where it was cut from, marked as proposed in the folio',
      run.proposed > 0 && run.withCut === run.proposed && run.marked > 0 && !run.last.error, run);
    T.check('the side\'s line count becomes the rows found (' + run.count + ', it was 40), its empty lines after them dropped, the count kept as recognition\'s',
      run.count === run.proposed + run.last.skipped && run.from === run.count && run.length <= run.count, { count: run.count, rows: run.proposed + (run.last && run.last.skipped), from: run.from, length: run.length });
    T.check('a line typed by hand is left as it was, and counted as left out', run.typed === 'typed by hand' && run.last.skipped >= 1 && run.firstProposed !== 0, { typed: run.typed, skipped: run.last && run.last.skipped });
    T.check('the source is recorded with the pack and its models', run.sources.some((s) => /segmenter .* recogniser .*pack-/.test(s)), run.sources);
    const read = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = p.pages[e.label];
      const g = ME.Model.geometry(p, e, ME.App.pageSizes[e.pdfPage] || p.pdf.size);
      const i = Object.keys(pg.proposed.main).map(Number).find((k) => pg.proposed.main[k].cut);
      const line = ME.Model.lineRect(p, e, 'main', i), box = pg.regions && pg.regions.boxes.main;
      const shown = (id) => { const b = document.getElementById(id); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; };
      return { level: ME.Model.levelOf(p, e.label), from: pg.regions && pg.regions.from, calibrated: g.calibrated, line, box,
        inside: !!line && !!box && line[0] >= box[0] - 1e-6 && line[1] >= box[1] - 1e-6 && line[0] + line[2] <= box[0] + box[2] + 1e-6 && line[1] + line[3] <= box[1] + box[3] + 1e-6,
        toolbar: shown('btn-recognise'), calibrateClass: document.getElementById('btn-calibrate').className, calibrateShown: shown('btn-calibrate'),
        segmenter: ME.RecogView.sideForSegmenter(p, e).why };
    });
    T.check('a side read is marked “OCR: recognised, not yet read”, given its blocks from the rows found (no calibrating), and the guide follows each line\'s own outline, inside its block',
      read.level === 'ocr' && read.from === 'recognition' && read.calibrated && read.inside, read);
    // ---- the letters the model was unsure of, marked in the proposed lines
    const doubt = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = p.pages[e.label], H = ME.HTR;
      const plain = (t) => new DOMParser().parseFromString('<x>' + t + '</x>', 'text/xml').documentElement.textContent;
      const entries = Object.entries(pg.proposed.main).filter(([, x]) => !x.accepted);
      const aligned = entries.every(([, x]) => typeof x.confs === 'string' && x.confs.length === plain(x.text).length
        && [...plain(x.text)].every((c, k) => (c === ' ') === (x.confs[k] === ' ')));
      // and in whole per cent, two digits a letter, the tenth of each being the letter's digit in confs
      const pcts = entries.every(([, x]) => typeof x.pcts === 'string' && x.pcts.length === 2 * x.confs.length
        && [...x.confs].every((c, k) => (c === ' ' ? x.pcts.slice(2 * k, 2 * k + 2) === '  ' : Math.floor(+x.pcts.slice(2 * k, 2 * k + 2) / 10) === +c)));
      // the runs of letters under 70 % expected in the lines shown, as unchanged and not accepted
      const runs = (x, below) => { let n = 0; for (let k = 0; k < x.confs.length; k++) if (x.confs[k] !== ' ' && +x.confs[k] < below && (k === 0 || x.confs[k - 1] === ' ' || +x.confs[k - 1] >= below)) n++; return n; };
      const shown = entries.filter(([i]) => ME.Editor.lineEl('main', +i));
      const want = shown.reduce((a, [, x]) => a + runs(x, 7), 0);
      const hl = () => (CSS.highlights.get(H.DOUBT) || { size: 0 }).size;
      const first = hl();
      // a line edited loses its marks
      const withMarks = shown.find(([, x]) => runs(x, 7) > 0);
      let afterEdit = null, afterAccept = null;
      if (withMarks) {
        const [i, x] = withMarks, el = ME.Editor.lineEl('main', +i);
        el.textContent = el.textContent + 'क';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        afterEdit = { got: hl(), want: want - runs(x, 7) };
      }
      ME.RecogPack.savePrefs({ doubt: 0 }); H.doubt(p, e.label); const off = hl();
      ME.RecogPack.savePrefs({ doubt: 9 }); H.doubt(p, e.label); const at90 = hl();
      // at 90 %: the runs of letters under 90 % in the lines still unchanged (the edited one has lost its marks; runs
      // under 70 % a letter or two apart join into one, so there may be fewer runs than at 70 %, never fewer letters)
      const want90 = shown.filter(([i]) => !withMarks || i !== withMarks[0]).reduce((a, [, x]) => a + runs(x, 9), 0);
      ME.RecogPack.savePrefs({ doubt: 7 }); H.doubt(p, e.label);
      const other = shown.find(([i, x]) => (!withMarks || i !== withMarks[0]) && runs(x, 7) > 0);
      if (other) { H.accept(p, e.label, 'main', +other[0]); H.doubt(p, e.label); afterAccept = { got: hl(), want: want - (withMarks ? runs(withMarks[1], 7) : 0) - runs(other[1], 7) }; }
      const lowShare = entries.reduce((a, [, x]) => a + [...x.confs].filter((c) => c !== ' ' && +c < 7).length, 0) / entries.reduce((a, [, x]) => a + x.confs.replace(/ /g, '').length, 0);
      return { lines: entries.length, aligned, pcts, want, first, afterEdit, afterAccept, off, at90, want90, lowShare: Math.round(1000 * lowShare) / 10, api: typeof Highlight !== 'undefined' && !!CSS.highlights };
    });
    T.check('every letter read keeps its probability, letter for letter with the text placed (word spaces lined up), in tenths and in whole per cent; the ones under 70 % are marked (' + doubt.want + ' run(s), ' + doubt.lowShare + ' % of the letters), a line edited or accepted loses its marks, the setting turns them off or to 90 %',
      doubt.api && doubt.aligned && doubt.pcts && doubt.first === doubt.want && (!doubt.afterEdit || doubt.afterEdit.got === doubt.afterEdit.want) && (!doubt.afterAccept || doubt.afterAccept.got === doubt.afterAccept.want)
        && doubt.off === 0 && doubt.at90 === doubt.want90, doubt);
    T.check('Recognise is a button on the scan\'s toolbar; Calibrate a plain one, still there to correct blocks recognition found; and blocks found so never count as drawn for the segmenter',
      read.toolbar && !/accent/.test(read.calibrateClass) && read.calibrateShown && /found by recognition/.test(read.segmenter || ''), read);

    // ---- consent: the text approved; a draft could not be answered
    const shipped = await page.evaluate(() => ({ v: ME.RecogView.CONSENT.version, ok: ME.RecogView.CONSENT.approved, text: ME.RecogView.CONSENT.paragraphs.join(' ') }));
    T.check('the consent text is approved (version ' + shipped.v + '): lines and whole folio sides, kept to their language and script, the inbox and the maintainer\'s address, and models trained before a withdrawal remain',
      shipped.v === '2' && shipped.ok && /whole folio sides|that whole side/.test(shipped.text) && /never mixed/.test(shipped.text) && /drdhaval2785\/manuscribe-contributions/.test(shipped.text) && /drdhaval2785@gmail\.com/.test(shipped.text) && /remain, and are not withdrawn/.test(shipped.text), shipped);
    const draft = await page.evaluate(async () => {
      const C = ME.RecogView.CONSENT, was = C.approved;
      C.approved = false;
      try { return { asked: await ME.RecogView.askConsent(ME.App.project), consent: ME.App.project.consent || null, pkg: await ME.RecogView.contribute(ME.App.project) }; } finally { C.approved = was; }
    });
    T.check('were the consent text a draft, nothing would be asked and nothing could be contributed', draft.asked === null && !draft.consent && draft.pkg === null, draft);

    // ---- consent: asked after recognising, kept in the project
    // (linear.pdf may have one side only: the side is emptied, as a side not yet read would be)
    await page.evaluate(() => { ME.RecogView.CONSENT.approved = true; ME.RecogPack.savePrefs({ askTraining: true }); const p = ME.App.project, e = ME.App.entries[ME.App.idx]; p.pages[e.label] = { boxes: {} }; ME.App.changed(); ME.App.rerender(); });
    await sleep(500);
    const cta = await page.evaluate(() => { const b = document.querySelector('#calib-hint [data-action="recognise-cta"]'); return { shown: !!b && !document.getElementById('calib-hint').hidden, whole: !!document.querySelector('#calib-hint [data-action="recognise-whole"]'), cls: b && b.className }; });
    T.check('a folio side with no text is offered recognition in the typing area, as the call to action, with the whole manuscript beside it', cta.shown && cta.whole && /primary/.test(cta.cls), cta);
    page.evaluate(() => ME.RecogView.run(ME.App.project, [ME.App.entries[ME.App.idx]], { space: true }));
    for (let k = 0; k < 600 && !(await page.evaluate(() => !!document.querySelector('.recog-consent-dialog'))); k++) await sleep(200);
    const asked = await page.evaluate(() => !!document.querySelector('.recog-consent-dialog'));
    T.check('with the user\'s leave to be asked, recognising a new manuscript asks the question', asked);
    await page.evaluate(() => { document.querySelector('.recog-consent-dialog .btn.primary').click(); });
    await sleep(200);
    const refusedNoRights = await page.evaluate(() => !!document.querySelector('.recog-consent-dialog') && document.querySelector('.recog-consent-dialog .field-error').textContent.length > 0);
    T.check('a yes needs the right to share the images confirmed', refusedNoRights);
    await page.evaluate(() => { document.querySelector('.recog-consent-dialog [data-recog="rights"]').click(); document.querySelector('.recog-consent-dialog .btn.primary').click(); });
    await sleep(300);
    const consent = await page.evaluate(() => Object.assign({ version: ME.RecogView.CONSENT.version }, ME.App.project.consent));
    T.check('the answer is kept in the project, with its date, the wording\'s version and the name for the model cards', consent && consent.training.answer === 'yes' && consent.training.rights && consent.training.wording === consent.version && consent.training.name === 'Test library, MS 1, Recognise' && consent.history.length === 1, consent);

    // ---- corrected lines contributed: their images cut again, their corrected text, the consent record
    const pkg = await page.evaluate(async () => {
      const p = ME.App.project, H = ME.HTR;
      const pend = ME.App.entries.flatMap((e) => H.pendingOn(p, e.label).map((x) => Object.assign({ label: e.label }, x)));
      const two = pend.slice(0, 2);
      two.forEach((x, k) => { p.pages[x.label].boxes[x.box][x.i] = 'संशोधितम् ' + k + ' '; H.accept(p, x.label, x.box, x.i); });
      const lines = ME.RecogView.corrected(p);
      const out = await ME.RecogView.contributionPackage(p, lines);
      const files = await ME.Zip.read(out.blob);
      const about = JSON.parse(ME.Zip.text(files.get('contribution.json')));
      const png = files.get(about.lines[0].image);
      return { n: lines.length, lines: out.lines, names: [...files.keys()], about: { consent: about.consent.answer, wording: about.wording.version, name: about.manuscript.name, texts: about.lines.map((l) => l.text), proposed: about.lines.map((l) => !!l.proposed) },
        png: png && png[0] === 0x89 && png[1] === 0x50 && png.length > 200, txt: ME.Zip.text(files.get(about.lines[0].image.replace('.png', '.txt'))) };
    });
    T.check('the package holds each corrected line\'s image (cut again from the PDF), its corrected text, what was proposed, and the consent record (' + pkg.lines + ' lines, ' + pkg.names.length + ' files)',
      pkg.n === 2 && pkg.lines === 2 && pkg.names.length === 5 && pkg.png && pkg.about.consent === 'yes' && pkg.about.texts[0] === 'संशोधितम् 0' && pkg.txt === 'संशोधितम् 0\n' && pkg.about.proposed.every(Boolean), pkg);

    // ---- contributed: sealed to the site's key, saved, and the inbox's issue form opened, filled in
    await page.evaluate((url) => {
      ME.RecogPack.setSource(url);
      window.recogGot = { files: [], opened: [] };
      ME.U.download = (name, blob) => window.recogGot.files.push({ name, blob });
      window.open = (u) => { window.recogGot.opened.push(u); return null; };
    }, url);
    const sending = page.evaluate(() => ME.RecogView.contribute(ME.App.project).then((r) => r && { ids: r.packages.map((k) => k.id), url: r.url, lines: r.lines }));
    for (const dlg of ['.recog-contribute-dialog', '.recog-send-dialog']) {
      for (let k = 0; k < 100 && !(await page.evaluate((c) => !!document.querySelector(c), dlg)); k++) await sleep(100);
      await page.evaluate((c) => { const b = document.querySelector(c + ' .btn.primary'); if (b) b.click(); }, dlg);
    }
    const sentRun = await sending;
    const b64 = 'const b64 = (u) => { let t = ""; for (let i = 0; i < u.length; i += 32768) t += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(t); };';
    const saved = await page.evaluate(async (b64src) => {
      const b64 = new Function(b64src + ' return b64;')();
      return Promise.all(window.recogGot.files.map(async (f) => {
        const z = await ME.Zip.read(f.blob);
        return { name: f.name, names: [...z.keys()], about: ME.Zip.text(z.get('contribution.json')), sealed: z.get('sealed.bin') ? b64(z.get('sealed.bin')) : '', zip: b64(new Uint8Array(await f.blob.arrayBuffer())) };
      }));
    }, b64);
    const one = saved[0] || {}, about = one.about ? JSON.parse(one.about) : {};
    const sealedBytes = Buffer.from(one.sealed || '', 'base64');
    const sha = crypto.createHash('sha256').update(sealedBytes).digest('hex');
    T.check('one sealed package saved (' + one.name + '): contribution.json in the clear (its id, the name, the count, the consent) and sealed.bin, no line\'s text in the clear',
      saved.length === 1 && sentRun && one.name === 'manuscribe-contribution-' + about.id + '.zip' && one.names.join() === 'contribution.json,sealed.bin' && about.version === 2 && about.sealed === true
        && about.id === 'c' + about.made.slice(0, 10).replace(/-/g, '') + '-' + sha.slice(0, 12) && about.seal.sha256 === sha && about.seal.bytes === sealedBytes.length && about.seal.key === CONTRIBUTE.key.id
        && about.count === 2 && about.sides === 0 && about.consent.answer === 'yes' && about.wording.version === '2' && about.manuscript.script === 'sa-Deva' && about.consent.script === 'sa-Deva'
        && about.inbox === CONTRIBUTE.inbox && !one.about.includes('संशोधितम्'),
      { name: one.name, names: one.names, about: Object.assign({}, about, { wording: undefined, seal: about.seal && { key: about.seal.key, bytes: about.seal.bytes } }) });
    let inner = null;
    try { inner = openSealed(about.seal, sealedBytes); } catch (e) { inner = null; }
    const opened = inner && await page.evaluate(async (b) => {
      const z = await ME.Zip.read(new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))]));
      const a = JSON.parse(ME.Zip.text(z.get('contribution.json')));
      return { names: [...z.keys()].length, version: a.version, texts: a.lines.map((l) => l.text), png: a.lines.every((l) => z.get(l.image) && z.get(l.image)[0] === 0x89), consent: a.consent, part: a.part };
    }, inner.toString('base64'));
    T.check('the sealed lines open with the private key by OpenSSL, as msocr.seal opens them: the lines\' package, the same consent inside',
      !!opened && opened.version === 2 && opened.names === 5 && opened.texts.join('|') === 'संशोधितम् 0|संशोधितम् 1' && opened.png && JSON.stringify(opened.consent) === JSON.stringify(about.consent) && opened.part.join() === '1,1', opened);
    const issue = sentRun ? new URL(sentRun.url) : null;
    const opens = await page.evaluate(() => window.recogGot.opened);
    T.check('the inbox\'s issue form (from contribute.json) is opened filled in: the manuscript, the package id, the lines',
      !!issue && opens[0] === sentRun.url && issue.origin + issue.pathname === 'https://github.com/test-owner/test-inbox/issues/new' && issue.searchParams.get('template') === 'contribution.yml'
        && issue.searchParams.get('ids') === about.id && issue.searchParams.get('lines') === '2' && issue.searchParams.get('manuscript') === about.consent.name, { url: sentRun && sentRun.url, opens });
    const parts = await page.evaluate(async () => {
      const p = ME.App.project, cfg = await ME.RecogPack.contribution();
      const k = await ME.RecogView.sealedPackages(p, ME.RecogView.corrected(p), cfg, 1);
      const abouts = await Promise.all(k.map(async (x) => JSON.parse(ME.Zip.text((await ME.Zip.read(x.blob)).get('contribution.json')))));
      const h = p.consent.history.filter((x) => x.what === 'contributed');
      return { n: k.length, parts: abouts.map((a) => a.part.join('/')), counts: abouts.map((a) => a.count), ids: new Set(k.map((x) => x.id)).size, history: h.map((x) => ({ ids: x.ids, inbox: x.inbox, lines: x.lines })) };
    });
    T.check('lines beyond the size of an attachment go in parts, each a package of its own; the project keeps what was sent and where',
      parts.n === 2 && parts.parts.join() === '1/2,2/2' && parts.counts.join() === '1,1' && parts.ids === 2 && parts.history.length === 1 && parts.history[0].ids.join() === about.id && parts.history[0].inbox === CONTRIBUTE.inbox && parts.history[0].lines === 2, parts);
    if (process.env.MANUSCRIBE_SAVE_CONTRIBUTION && one.zip) {
      const out = path.resolve(process.env.MANUSCRIBE_SAVE_CONTRIBUTION);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, one.name), Buffer.from(one.zip, 'base64'));
      fs.writeFileSync(path.join(out, 'test-key.pem'), KEY.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      fs.writeFileSync(path.join(out, 'test-contribute.json'), JSON.stringify(CONTRIBUTE, null, 1));
      console.log('  sealed package and the test key kept in ' + out);
    }

    // ---- a folio side for the segmenter: its block drawn, holding as many lines of text as it was given
    const side = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = ME.Model.page(p, e.label);
      delete pg.linesFrom;
      const before = ME.RecogView.sideForSegmenter(p, e).why;
      const arr = pg.boxes.main = (pg.boxes.main || []).slice();
      let n = 0;
      while (n < arr.length && ME.TEI.hasContent(arr[n])) n++;
      for (let k = n; k < arr.length; k++) if (ME.TEI.hasContent(arr[k])) { for (let j = n; j < k; j++) arr[j] = 'पङ्क्तिः'; n = k + 1; }
      arr.length = n;
      const L = ME.Model.defaultLeaf(e), box = { main: [L[0] + 0.04 * L[2], L[1] + 0.05 * L[3], 0.92 * L[2], 0.9 * L[3]] };
      pg.lines = { main: n };
      // blocks drawn on another side and applied to the whole manuscript: not this side's own
      ME.Model.setRegions(p, e, { leaf: L, boxes: box, drawnOn: 'another side' }, 'all');
      const shared = ME.RecogView.sideForSegmenter(p, e).why;
      ME.Model.setRegions(p, e, { leaf: L, boxes: box }, 'all');
      const sharedOld = ME.RecogView.sideForSegmenter(p, e).why;          // a calibration made before drawnOn was kept
      ME.Model.setRegions(p, e, { leaf: L, boxes: box, drawnOn: e.label }, 'all');
      const sharedHere = !ME.RecogView.sideForSegmenter(p, e).why;        // drawn on this very side, then applied to all
      ME.Model.setRegions(p, e, { leaf: L, boxes: box }, 'page');
      pg.linesFrom = { main: n };                                          // the count as recognition found it ...
      const auto = ME.RecogView.sideForSegmenter(p, e).why;
      delete pg.linesFrom.main;                                            // ... until the editor gives it (App.setLines)
      const short = Object.assign({}, pg.lines, { main: n + 1 });
      pg.lines = short;
      const wrongCount = ME.RecogView.sideForSegmenter(p, e).why;
      pg.lines = { main: n };
      ME.App.changed();
      return { before, wrongCount, shared, sharedOld, sharedHere, auto, ok: ME.RecogView.sideForSegmenter(p, e), n, lines1: ME.RecogView.givesSides({ answer: 'yes', wording: '1' }), lines2: ME.RecogView.givesSides(p.consent.training) };
    });
    T.check('a folio side teaches the segmenter only with its blocks drawn on it (not a calibration drawn on another side and applied to all) and each holding as many lines of text as it was given (' + side.n + ' here), and only on a consent that gives sides',
      !!side.before && /not drawn/.test(side.before) && /not \d+/.test(side.wrongCount || '') && /another folio side/.test(side.shared || '') && /another folio side/.test(side.sharedOld || '') && side.sharedHere && /recognition found/.test(side.auto || '') && side.ok.layout === 'linear' && side.ok.boxes.main.lines === side.n && side.lines1 === false && side.lines2 === true, side);
    const nFiles = await page.evaluate(() => window.recogGot.files.length);
    const sending2 = page.evaluate(() => ME.RecogView.contribute(ME.App.project).then((r) => r && { ids: r.packages.map((k) => k.id), lines: r.lines, sides: r.sides, url: r.url }));
    for (const dlg of ['.recog-contribute-dialog', '.recog-send-dialog']) {
      for (let k = 0; k < 100 && !(await page.evaluate((c) => !!document.querySelector(c), dlg)); k++) await sleep(100);
      await page.evaluate((c) => { const b = document.querySelector(c + ' .btn.primary'); if (b) b.click(); }, dlg);
    }
    const run2 = await sending2;
    const saved2 = await page.evaluate(async (b64src, from) => {
      const b64 = new Function(b64src + ' return b64;')();
      const f = window.recogGot.files[from], z = await ME.Zip.read(f.blob);
      return { about: ME.Zip.text(z.get('contribution.json')), sealed: b64(z.get('sealed.bin')) };
    }, b64, nFiles);
    const about2 = JSON.parse(saved2.about), inner2 = openSealed(about2.seal, Buffer.from(saved2.sealed, 'base64'));
    const sideBack = await page.evaluate(async (b) => {
      const z = await ME.Zip.read(new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))]));
      const a = JSON.parse(ME.Zip.text(z.get('contribution.json')));
      const sd = a.sides[0], jpg = sd && z.get(sd.image), g = sd && JSON.parse(ME.Zip.text(z.get(sd.geometry)));
      const r = g && g.boxes.main.rect;
      return { n: a.sides.length, jpeg: !!jpg && jpg[0] === 0xff && jpg[1] === 0xd8, kb: jpg && Math.round(jpg.length / 1024), w: g && g.width, h: g && g.height, rect: r, lines: g && g.boxes.main.lines, layout: g && g.layout,
        inside: !!r && r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= g.width + 1 && r[1] + r[3] <= g.height + 1, script: a.manuscript.script, found: g && Object.keys(g.found || {}).length, drawn: g && g.drawn };
    }, inner2.toString('base64'));
    T.check('the side goes sealed in a package of its own (the lines sent before are not sent again): its image (a JPEG, ' + sideBack.kb + ' KB, ' + sideBack.w + 'x' + sideBack.h + ' px, at the height the segmenter learned from), its drawn block in the image\'s own pixels with its line count, its language and script',
      !!run2 && run2.sides === 1 && run2.lines === 0 && about2.count === 0 && about2.sides === 1 && about2.manuscript.script === 'sa-Deva' && sideBack.n === 1 && sideBack.jpeg && sideBack.inside && sideBack.lines === side.n && sideBack.drawn === 'here' && sideBack.layout === 'linear' && sideBack.script === 'sa-Deva' && Math.abs(sideBack.h - 685) <= 2,
      { run2, sideBack });
    if (process.env.MANUSCRIBE_SAVE_CONTRIBUTION) {
      const out = path.resolve(process.env.MANUSCRIBE_SAVE_CONTRIBUTION);
      const zip2 = await page.evaluate(async (b64src, from) => { const b64 = new Function(b64src + ' return b64;')(); return b64(new Uint8Array(await window.recogGot.files[from].blob.arrayBuffer())); }, b64, nFiles);
      fs.writeFileSync(path.join(out, 'manuscribe-contribution-' + about2.id + '.zip'), Buffer.from(zip2, 'base64'));
    }

    // ---- withdrawn
    const withdrawing = page.evaluate(() => ME.RecogView.withdraw(ME.App.project));
    for (let k = 0; k < 30 && !(await page.evaluate(() => !!document.querySelector('.modal .btn.danger'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.modal .btn.danger').click());
    for (let k = 0; k < 50 && !(await page.evaluate(() => !!document.querySelector('.recog-withdraw-dialog'))); k++) await sleep(100);
    await page.evaluate(() => { const b = document.querySelector('.recog-withdraw-dialog .btn.primary'); if (b) b.click(); });
    await withdrawing;
    const after = await page.evaluate(async () => ({ t: ME.App.project.consent.training, h: ME.App.project.consent.history.map((x) => x.what), pkg: await ME.RecogView.contribute(ME.App.project), opened: window.recogGot.opened.slice(2) }));
    T.check('consent withdrawn: kept with its date, and nothing more can be contributed', after.t.answer === 'withdrawn' && after.t.withdrawn && after.h.join() === 'yes,contributed,contributed,withdrawn' && after.pkg === null, after);
    const req = after.opened.length ? new URL(after.opened[0]) : null;
    T.check('the lines already sent are withdrawn by a request in the inbox they went to, opened filled in with their ids',
      !!req && after.opened.length === 1 && req.pathname === '/test-owner/test-inbox/issues/new' && req.searchParams.get('template') === 'withdrawal.yml' && req.searchParams.get('ids') === [about.id].concat(run2 ? run2.ids : []).join('\n'), after.opened);

    // ---- a proofread side is read again only with leave, and then its text is replaced
    const proof = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = ME.Model.page(p, e.label);
      pg.boxes = { main: ['पठितम् एतत्', 'द्वितीया पङ्क्तिः'] };
      delete pg.proposed;
      ME.Model.setLevel(p, e.label, 'proof1');
      ME.App.changed(); ME.App.rerender();
      return ME.Model.levelOf(p, e.label);
    });
    let asking = page.evaluate(() => ME.RecogView.recogniseSides(ME.App.project, [ME.App.entries[ME.App.idx]], { space: true, background: false }).then((t) => !!t));
    for (let k = 0; k < 50 && !(await page.evaluate(() => !!document.querySelector('.recog-overwrite-dialog'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.recog-overwrite-dialog .btn.ghost').click());
    const cancelled = { ran: await asking, kept: await page.evaluate(() => { const p = ME.App.project, e = ME.App.entries[ME.App.idx]; return p.pages[e.label].boxes.main[0] === 'पठितम् एतत्' && ME.Model.levelOf(p, e.label) === 'proof1'; }) };
    asking = page.evaluate(() => ME.RecogView.recogniseSides(ME.App.project, [ME.App.entries[ME.App.idx]], { space: true, background: false }).then((t) => !!t));
    for (let k = 0; k < 50 && !(await page.evaluate(() => !!document.querySelector('.recog-overwrite-dialog'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.recog-overwrite-dialog .btn.danger').click());
    const replacedRan = await asking;
    const replaced = await page.evaluate(() => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx], pg = p.pages[e.label];
      return { level: ME.Model.levelOf(p, e.label), old: (pg.boxes.main || []).some((l) => /पठितम्|द्वितीया/.test(l)), proposed: Object.keys((pg.proposed && pg.proposed.main) || {}).length };
    });
    T.check('a proofread side (' + proof + ') is recognised again only after a dialog: Cancel leaves it as it was; Replace replaces its text with what was read and marks it OCR',
      proof === 'proof1' && !cancelled.ran && cancelled.kept && replacedRan && replaced.level === 'ocr' && !replaced.old && replaced.proposed > 0, { cancelled, replaced });

    // ---- a new manuscript read whole: the first side now, the rest in the background
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Read whole', siglum: 'W' }, layoutType: 'linear', lines: { main: 8 }, folios: { sidesPerPage: 2 }, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      await ME.Store.putProject(p);
      await ME.Store.putPdf(p.id, blob);
      await ME.App.open(p.id);
    }, fs.readFileSync(pdf).toString('base64'));
    for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    // (the training question, which a user who asked to be asked gets after the first side, waits for no answer: it is
    // answered No here once the background reading runs)
    page.evaluate(() => ME.RecogView.offerWhole());
    for (let k = 0; k < 50 && !(await page.evaluate(() => !!document.querySelector('.recog-offer-dialog'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.recog-offer-dialog .btn.primary').click());
    let sawStatus = false;
    for (let k = 0; k < 900; k++) {
      const st = await page.evaluate(() => ({ bg: !!ME.RecogView.bg, shown: !!document.getElementById('recog-bg') && !document.getElementById('recog-bg').hidden, last: !!ME.RecogView.lastBackground }));
      if (st.shown) sawStatus = true;
      if (st.bg) await page.evaluate(() => { const d = document.querySelector('.recog-consent-dialog'); if (d) d.querySelector('.btn.ghost').click(); });
      if (st.last && !st.bg) break;
      await sleep(200);
    }
    const whole = await page.evaluate(() => {
      const p = ME.App.project;
      return { title: p.meta.title, sides: ME.App.entries.map((e) => ({ label: e.label, level: ME.Model.levelOf(p, e.label), proposed: Object.keys(((p.pages[e.label] || {}).proposed || {}).main || {}).length })),
        bg: ME.RecogView.lastBackground && { total: ME.RecogView.lastBackground.total, done: ME.RecogView.lastBackground.done, error: ME.RecogView.lastBackground.error } };
    });
    T.check('offered after import, the whole manuscript is read: the first side now, the other in the background with its progress in the status bar, each side marked OCR',
      whole.title === 'Read whole' && whole.sides.length === 2 && whole.sides.every((x) => x.level === 'ocr' && x.proposed > 0) && sawStatus && whole.bg && whole.bg.done === 1 && whole.bg.total === 1 && !whole.bg.error,
      Object.assign({ sawStatus }, whole));

    // ---- the layout, told from a dozen of the manuscript's sides before it is first read, and offered
    // the vote and what is offered, on counts made up for the purpose
    const vote = await page.evaluate(() => {
      const RV = ME.RecogView, V = (a) => RV.layoutVerdict(a).layout, rep = (x, n) => Array.from({ length: n }, () => x);
      const T3 = { main: 4, top: 8, bottom: 9 }, L = { main: 19 }, P5 = { main: 8, top: 4, bottom: 4, left: 16, right: 15 }, E = { main: 1 };
      const S = (chosen, tri, pan, layout) => RV.layoutSuggestion(chosen, { layout, text: 12, tri, pan });
      return {
        tri: V(rep(T3, 7).concat(rep(L, 5))), lin: V(rep(T3, 5).concat(rep(L, 7))), pan: V(rep(P5, 6).concat(rep(L, 6))),
        few: V(rep(E, 10).concat(rep(T3, 2))), blanks: V(rep(E, 4).concat(rep(T3, 8))),
        offers: [S('linear', 10, 0, 'tripatha'), S('linear', 2, 0, 'linear'), S('tripatha', 4, 0, 'linear'), S('tripatha', 2, 0, 'linear'), S('tripatha', 10, 7, 'pancapatha'), S('pancapatha', 10, 1, 'tripatha'), S('pancapatha', 10, 4, 'tripatha'), S('interlinear', 10, 0, 'tripatha')],
      };
    });
    T.check('the layout vote: a manuscript is what half its sides with text are (tripāṭha: a top and a bottom block of two rows or more; pañcapāṭha: a side column too), blank sides not counted, too few with text no verdict; offered only against the layout chosen, a block layout questioned only when under a quarter of its sides show it',
      vote.tri === 'tripatha' && vote.lin === 'linear' && vote.pan === 'pancapatha' && vote.few === null && vote.blanks === 'tripatha'
        && JSON.stringify(vote.offers) === JSON.stringify(['tripatha', null, null, 'linear', 'pancapatha', 'tripatha', null, null]), vote);
    const triPdf = path.join(ROOT, 'tripatha.pdf');
    if (!fs.existsSync(triPdf)) T.skip('the layout told from the sides', 'tripatha.pdf is not in the repository folder');
    else {
      const openAs = (b64, layout, title) => page.evaluate(async (b64, layout, title) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const p = ME.Model.newProject({ meta: { title, siglum: 'Y' }, layoutType: layout, lines: { main: 8 }, folios: {}, pdf: { name: title + '.pdf', bytes: bytes.length } });
        const info = await ME.PdfView.load(blob);
        p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
        await ME.Store.putProject(p); await ME.Store.putPdf(p.id, blob); await ME.App.open(p.id);
        ME.RecogView.SURVEY.min = 1;                                   // the repository's PDFs have one side
        ME.RecogView._notNow = p.id;                                   // the training question (asked to be asked, above): not here
      }, b64, layout, title);
      const waitFor = async (sel) => { for (let k = 0; k < 300 && !(await page.evaluate((s) => !!document.querySelector(s), sel)); k++) await sleep(100); return page.evaluate((s) => { const d = document.querySelector(s); return d && d.textContent; }, sel); };
      // a tripāṭha leaf in a project made linear: looked at, tripāṭha offered, taken, and the side read in its blocks
      await openAs(fs.readFileSync(triPdf).toString('base64'), 'linear', 'Layout');
      for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
      await page.evaluate(() => { window.__read = ME.RecogView.recogniseSides(ME.App.project, ME.App.entries.filter((e) => !e.orphan && e.pdfPage), { space: false }); });
      const offer = await waitFor('.recog-layout-dialog');
      await page.evaluate(() => document.querySelector('.recog-layout-dialog .btn.primary').click());
      const used = await page.evaluate(async () => {
        const tot = await window.__read, p = ME.App.project, e = ME.App.entries.find((x) => x.pdfPage), pg = p.pages[e.label] || {};
        return { placed: tot && tot.placed, layout: p.layout.type, select: document.getElementById('sel-layout').value, survey: p.layoutSurvey, blocks: Object.keys(pg.proposed || {}).sort() };
      });
      // asked once a manuscript: not again
      const again = await page.evaluate(async () => { await ME.RecogView.checkLayout(ME.App.project); return !!document.querySelector('.recog-survey-dialog, .recog-layout-dialog'); });
      T.check('before a manuscript is first read, its sides are looked at; a tripāṭha leaf in a project made linear has tripāṭha offered, and taken, the side is read in its top, main and bottom blocks; asked once a manuscript',
        /tripāṭha/.test(offer || '') && used.survey && (used.survey.looked || []).length === 1 && used.layout === 'tripatha' && used.select === 'tripatha' && used.survey && used.survey.answer === 'used' && used.survey.suggested === 'tripatha' && used.survey.tri === 1
          && used.placed > 0 && ['main', 'top', 'bottom'].every((b) => used.blocks.includes(b)) && !again, { offer, used, again });
      // a linear leaf in a project made tripāṭha: linear offered, and declined; said so in the Manuscript tab
      await openAs(fs.readFileSync(pdf).toString('base64'), 'tripatha', 'Layout kept');
      for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
      await page.evaluate(() => { window.__check = ME.RecogView.checkLayout(ME.App.project); });
      const offer2 = await waitFor('.recog-layout-dialog');
      await page.evaluate(() => document.querySelector('.recog-layout-dialog .btn.ghost').click());
      const kept = await page.evaluate(async () => {
        await window.__check;
        const p = ME.App.project, fold = ME.RecogView.msFold(p), note = fold.find((el) => el.getAttribute && el.getAttribute('data-recog') === 'layout-survey');
        return { layout: p.layout.type, survey: p.layoutSurvey, note: note && note.textContent, button: fold.some((el) => el.getAttribute && el.getAttribute('data-action') === 'check-layout') };
      });
      T.check('a linear leaf in a project made tripāṭha has linear offered, and Keep keeps tripāṭha; the Manuscript tab says what was found and offered, with a button to look again',
        /looks linear/.test(offer2 || '') && kept.layout === 'tripatha' && kept.survey && kept.survey.answer === 'kept' && kept.survey.suggested === 'linear' && /declined/.test(kept.note || '') && kept.button, { offer2, kept });
      await page.evaluate(() => { ME.RecogView.SURVEY.min = 6; });
    }

    T.check('no errors in the page', !page.errors.length, page.errors);
  } finally {
    await browser.close();
    server.close();
    T.done();
  }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
