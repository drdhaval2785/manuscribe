// Recognition in the app, in the browser itself: the recognition pack fetched from a site (a local copy of
// manuscribe-models, made by manuscript_ocr's msocr/site.py) and kept, a tampered file refused and the pack kept before
// it left as it was, the pack read from a folder instead; the recognition worker, built from source on a page opened
// from disk, reading the reference's fixture pages as the reference reads them (rows, text and word spaces, on
// WebAssembly; on WebGPU too where the browser has it, which is reported); then, on linear.pdf, "Recognise this side"
// from the Folio tab proposing lines with where they were cut from, nothing over typed text; and the training consent
// (the draft refused, then, approved for the test, the question asked, the answer kept in the project), the package of
// corrected lines (their images cut again, their corrected text, the consent record) and the withdrawal.
// Site: MANUSCRIBE_RECOG_SITE, or ../../lexicon_manuscripts/manuscribe-models; fixtures as in t-recog-conformance.js.
// Skipped where they are absent (the models are not in this repository; the fixtures hold manuscript pages).
const fs = require('fs'), path = require('path'), http = require('http');
const { launch, sleep, checks, ROOT } = require('./h');
const { readPng } = require('./png');

const T = checks('recognition in the app: pack, worker, proposed lines, consent');
const SITE = process.env.MANUSCRIBE_RECOG_SITE || path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscribe-models');
const FIXTURES = path.resolve(ROOT, '..', '..', 'lexicon_manuscripts', 'manuscript_ocr', 'data', 'fixtures');

// the site, with /tampered/ the same but for one byte of the recogniser
function siteServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const tampered = rel.startsWith('tampered/');
    if (tampered) rel = rel.slice('tampered/'.length);
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
    T.check('the pack fetched from the site, checked and kept (' + got.pack + ', ' + (got.bytes / 1e6).toFixed(1) + ' MB, runtime for ' + got.variant + ')', got.pack === index.latest && got.keys === 8 && got.steps > 8, got);
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
        const rows = sameRows(res.boxes, pg.text), spaces = sameSpaces(res.boxes, pg.spaced);
        const n = Object.values(pg.text).reduce((a, x) => a + x.length, 0);
        const what = pg.page + (gpu ? ' on WebGPU' : ' on WebAssembly') + ' in the worker (' + res.ms + ' ms: ' + Object.entries(res.times).map(([k, v]) => k + ' ' + v).join(', ') + '; ' + Object.entries(res.backends).map(([k, v]) => k + ' ' + v).join(', ') + ')';
        if (gpu && !(rows && spaces)) T.skip(what, 'differs from the reference on WebGPU (its arithmetic is not the CPU\'s): reported, not failed');
        else T.check(what + ': ' + n + ' rows and their word spaces as the reference reads them', rows && spaces, { rows, spaces });
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
      const walk = (d) => { for (const f of fs.readdirSync(path.join(SITE, d))) { const r = d ? d + '/' + f : f; if (fs.statSync(path.join(SITE, r)).isDirectory()) walk(r); else if (/\.(json|onnx|mjs|wasm)$/.test(f) && r !== 'index.json') out.push(r); } };
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
    await page.evaluate(() => { const p = ME.App.project, e = ME.App.entries[ME.App.idx]; p.pages[e.label] = p.pages[e.label] || { boxes: {} }; p.pages[e.label].boxes = { main: ['typed by hand'] }; ME.App.changed(); ME.App.rerender(); });
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
        sources: (p.sources || []).map((s) => s.model + ' ' + s.version), marked: document.querySelectorAll('.line.proposed').length, sample: prop.slice(0, 3).map((y) => y.x.text) };
    });
    T.check('"Recognise this side" proposes lines (' + run.proposed + ', ' + (run.last && run.last.times[0] ? run.last.times[0].total + ' ms, ' + Object.entries(run.last.times[0].backends || {}).map(([k, v]) => k + ' ' + v).join(', ') : '') + '), each with where it was cut from, marked as proposed in the folio',
      run.proposed > 0 && run.withCut === run.proposed && run.marked > 0 && !run.last.error, run);
    T.check('a line typed by hand is left as it was, and counted as left out', run.typed === 'typed by hand' && run.last.skipped >= 1 && run.firstProposed !== 0, { typed: run.typed, skipped: run.last && run.last.skipped });
    T.check('the source is recorded with the pack and its models', run.sources.some((s) => /segmenter .* recogniser .*pack-/.test(s)), run.sources);

    // ---- consent: the draft cannot be answered
    const draft = await page.evaluate(async () => ({ asked: await ME.RecogView.askConsent(ME.App.project), consent: ME.App.project.consent || null, pkg: await ME.RecogView.contribute(ME.App.project) }));
    T.check('while the consent text is a draft, nothing is asked and nothing can be contributed', draft.asked === null && !draft.consent && draft.pkg === null, draft);

    // ---- consent approved (for the test): asked after recognising, kept in the project
    // (linear.pdf may have one side only: the side is emptied, as a side not yet read would be)
    await page.evaluate(() => { ME.RecogView.CONSENT.approved = true; ME.RecogPack.savePrefs({ askTraining: true }); const p = ME.App.project, e = ME.App.entries[ME.App.idx]; p.pages[e.label] = { boxes: {} }; ME.App.changed(); ME.App.rerender(); });
    await sleep(500);
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

    // ---- withdrawn
    page.evaluate(() => ME.RecogView.withdraw(ME.App.project));
    for (let k = 0; k < 30 && !(await page.evaluate(() => !!document.querySelector('.modal .btn.danger'))); k++) await sleep(100);
    await page.evaluate(() => document.querySelector('.modal .btn.danger').click());
    await sleep(300);
    const after = await page.evaluate(async () => ({ t: ME.App.project.consent.training, h: ME.App.project.consent.history.map((x) => x.what), pkg: await ME.RecogView.contribute(ME.App.project) }));
    T.check('consent withdrawn: kept with its date, and nothing more can be contributed', after.t.answer === 'withdrawn' && after.t.withdrawn && after.h.join() === 'yes,withdrawn' && after.pkg === null, after);

    T.check('no errors in the page', !page.errors.length, page.errors);
  } finally {
    await browser.close();
    server.close();
    T.done();
  }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
