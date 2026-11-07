// One Export: every format comes out of the dialog exactly as it did from its own button (the same text, the same
// files in a ZIP, the same PDF but for its date); each is offered only where it makes sense; and a choice made in
// the dialog is saved, and remembered.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, WORK, exportVia } = require('./h');

(async () => {
  const T = checks('One Export');
  const { browser, page } = await launch('export');
  const res = await page.evaluate(async () => {
    const { Model, Store, Edition, Collate, Apparatus: A, Publish, Zip } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    const texts = {
      A: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      B: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेताः युयुत्सवः ।' + END, P('m2') + 'मामका पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      C: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवाः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत संजय ॥' + END],
    };
    const ed = Edition.create('Gītā');
    ed.editor = 'Editor';
    const list = [];
    for (const [s, lines] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: lines.concat(['', '']) } } };
      await Store.putProject(p);
      const w = { siglum: s, projectId: p.id, streams: {} };
      ed.witnesses.push(w); list.push({ w, p });
    }
    ed.trust = ['A', 'B', 'C'];
    ed.stemma = { dot: 'ω -> A; ω -> B; ω -> C' };
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'main', {});
    ME.Features.setContext(ME.Features.langsOf(list));
    const works = await ME.Release.works(ed, list);
    const { built, work } = works[0];
    const one = [built[0]];
    const X = ME.ExportView;
    const ctxWork = { kind: 'edition', ed, list, workId: 'main', scope: 'work' };
    const ctxBlock = { kind: 'edition', ed, list, tables: [built[0].table], workId: 'main', scope: 'block' };
    const asText = async (d) => (d instanceof Blob ? await d.text() : typeof d === 'string' ? d : new TextDecoder().decode(d));
    const unzip = async (d) => { const z = await Zip.read(d instanceof Blob ? d : new Blob([d])); const o = {}; for (const [n, b] of z) o[n] = Array.from(b).join(','); return o; };
    const same = async (id, ctx, direct, how) => {
      const f = await X.make(id, ctx);
      let a, b;
      if (how === 'zip') { a = JSON.stringify(await unzip(f.data)); b = JSON.stringify(await unzip(await Zip.write(await direct()))); }
      else if (how === 'pdf') { const strip = (s) => s.replace(/\/CreationDate \(D:\d+Z\)/, ''); a = strip(await asText(f.data)); b = strip(await asText((await direct()).blob)); }
      else { a = await asText(f.data); b = await asText(await direct()); }
      ok(id + ': the same as before, from Export (' + f.name + ')', a === b && a.length > 20, { a: a.length, b: b.length });
    };
    const layered = await ME.LayersView.baseTexts(ed, 'main');
    await same('reader', ctxWork, () => Publish.reader(ed, list, built, layered));
    await same('print-page', ctxWork, async () => ME.PrintHTML.html(ed, list, built, { fonts: await ME.PrintHTML.fonts(ed, built, list) }));
    await same('tei', ctxWork, () => A.tei(ed, built, work));
    await same('text', ctxWork, () => A.text(ed, built));
    await same('indices', ctxWork, () => ME.LayersView.indicesText(ed, built));
    await same('latex', ctxWork, () => Publish.texFiles(ed, list, built), 'zip');
    await same('dts', ctxWork, () => ME.DTS.files(ed, [{ work, built }]), 'zip');
    await same('saktumiva', ctxWork, () => Edition.saktumivaFiles(ed, list, 'main'), 'zip');
    await same('pdf-direct', ctxWork, () => ME.Typeset.pdf(ed, list, built), 'pdf');
    const S = ME.Stemma;
    const m = S.matrix(ed, built, S.DEFAULTS, []);
    await same('nexus', ctxWork, () => S.nexus(m, { citation: Publish.citation(ed) }).text);
    await same('newick', ctxWork, () => S.newick(S.midpoint(S.nj(S.distances(m))), m.taxa) + '\n');
    await same('dot', ctxWork, () => ed.stemma.dot);
    const t0 = built[0].table;
    await same('collatex-in', ctxBlock, () => JSON.stringify(Collate.toCollateXInput(t0), null, 1));
    await same('collatex', ctxBlock, () => JSON.stringify(Collate.toCollateXTable(t0)));
    await same('tei-corpus', ctxBlock, () => Collate.toTeiCorpus(t0));
    await same('csv', ctxBlock, () => Collate.toCsv(t0, 'n'));
    await same('table-json', ctxBlock, () => JSON.stringify(t0, null, 1));
    // a block's apparatus, not the work's
    await same('text', ctxBlock, () => A.text(ed, one));
    // what is offered where
    const ids = (ctx) => X.available(Object.assign({ blockScope: false }, ctx)).map((f) => f.id);
    const work0 = ids({ kind: 'edition', ed, list });
    const block0 = ids({ kind: 'edition', ed, list, blockScope: true });
    const proj = ids({ kind: 'project' });
    ok('an edition offers print, read, exchange and archive formats, and the block formats only for a block', ['pdf-any', 'reader', 'tei', 'package', 'release'].every((f) => work0.includes(f)) && !work0.includes('csv') && block0.includes('csv'), { work0, block0 });
    ok('a transcription offers TEI or HTML, and its backup', proj.join() === 'tei-xml,backup', proj);
    ME.Features.setContext(['ar']);
    const ar = ids({ kind: 'edition', ed, list });
    ok('without the South Asian pack: no Devanagari PDF, no Saktumiva', !ar.includes('pdf-direct') && !ar.includes('saktumiva'), ar);
    ME.Features.setContext(ME.Features.langsOf(list));
    window.ed = ed; window.list = list;
    return out;
  });
  for (const [n, c, x] of res) T.check(n, c, x);

  // on screen: one Export… where there were many buttons
  await page.evaluate(async () => { await ME.Edition.show(window.ed.id); });
  await sleep(500);
  const bar = await page.evaluate(() => [...document.querySelectorAll('.ed-bar .btn')].map((b) => b.textContent));
  T.check('the edition bar has one Export…, and no Export package or Export for Saktumiva', bar.includes('Export…') && !bar.includes('Export package') && !bar.includes('Export for Saktumiva'), bar);
  await page.evaluate(() => { ME.CollateView.workApparatus(window.ed, window.list, 'main'); });
  await sleep(900);
  const app = await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].map((b) => b.textContent));
  T.check('the apparatus window has one Export… in place of eight buttons', app.includes('Export…') && !['Reader (one HTML file)', 'Print edition (LaTeX)', 'Save as TEI', 'Save as text', 'Save for DTS', 'Save the print page', 'Print edition (any script)', 'PDF file (Devanagari and Latin)'].some((b) => app.includes(b)), app);
  // export from the dialog, for real
  const dl = path.join(WORK, 'downloads-export');
  fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const picked = await exportVia(page, '.modal [data-action="export"]', 'text');
  for (let k = 0; k < 30 && !fs.readdirSync(dl).some((f) => f.endsWith('.txt')); k++) await sleep(200);
  const txt = fs.readdirSync(dl).find((f) => f.endsWith('.txt'));
  T.check('the dialog saves the format chosen', picked && !!txt && /m1/.test(fs.readFileSync(path.join(dl, txt), 'utf8')), txt);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); });
  await sleep(300);
  await page.evaluate(() => document.querySelector('.ed-bar [data-action="export"]').click());
  await sleep(400);
  T.check('and remembers it the next time', await page.evaluate(() => document.querySelector('.modal input[name="xp-format"]:checked').value === 'text'));
  // the kind of file first, and only its options under it
  const kinds = await page.evaluate(() => {
    const vis = () => [...document.querySelectorAll('.modal .xp-row')].filter((r) => !r.hidden).map((r) => r.dataset.format);
    const out = { kinds: [...document.querySelectorAll('.modal .xp-kind')].map((k) => k.textContent.trim()), text: vis() };
    document.querySelector('.modal input[name="xp-kind"][value="tei"]').click();
    out.tei = vis();
    document.querySelector('.modal input[name="xp-kind"][value="pdf"]').click();
    out.pdf = vis();
    out.checked = document.querySelector('.modal input[name="xp-format"]:checked').value;
    return out;
  });
  T.check('Export asks first for the kind of file: PDF, HTML, LaTeX, TEI, Text, Archive', ['PDF', 'HTML', 'LaTeX', 'TEI', 'Text', 'Archive'].every((k) => kinds.kinds.includes(k)), kinds.kinds);
  T.check('and shows only the options of the kind chosen', kinds.text.includes('text') && !kinds.text.includes('tei') && kinds.tei.includes('tei') && !kinds.tei.includes('text') && kinds.pdf.join() === 'pdf' && kinds.checked === 'pdf', kinds);
  // PDF in any script: the tab is opened in the click itself (as Safari requires), then filled
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.ed-bar [data-action="export"]').click());
  await sleep(400);
  const opened = new Promise((res) => browser.once('targetcreated', (t) => res(t)));
  await page.evaluate(() => { document.querySelector('.modal input[name="xp-kind"][value="pdf"]').click(); document.querySelector('.modal input[name="xp-format"][value="pdf"]').click(); const r = document.querySelector('.modal [data-action="pdf-route"]'); r.value = 'print'; r.dispatchEvent(new Event('change')); document.querySelector('.modal [data-action="export-go"]').click(); });
  const target = await Promise.race([opened, sleep(8000).then(() => null)]);
  let tab = null;
  if (target) { tab = await target.page(); for (let k = 0; k < 60 && !(await tab.evaluate(() => !!window.__paginated).catch(() => false)); k++) await sleep(200); }
  const filled = tab ? await tab.evaluate(() => ({ pages: document.querySelectorAll('.page').length, laid: !!window.__paginated })).catch(() => null) : null;
  T.check('PDF in any script opens its tab in the click and fills it with the laid-out edition', !!filled && filled.laid && filled.pages > 1, filled);
  if (tab) await tab.close().catch(() => {});
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
