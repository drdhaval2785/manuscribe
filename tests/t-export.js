// One Export: every format comes out of the dialog exactly as it did from its own button (the same text, the same
// files in a ZIP, the same PDF but for its date); each is offered only where it makes sense; and a choice made in
// the dialog is saved, and remembered. The reader page, opened as a file on a phone, with and without a script running,
// and for an edition of one witness.
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
    await same('text', ctxWork, () => A.text(ed, built) + '\n\n' + ME.LayersView.indicesBody(ed, built) + '\n');
    await same('indices', ctxWork, () => ME.LayersView.indicesText(ed, built));
    // the indices chosen are the ones exported, in every format that reads
    const without = { padas: true, words: false, quotes: true, byWork: true }, none = { padas: false, words: false, quotes: false, byWork: false };
    const ixt = await asText((await X.make('indices', Object.assign({ indices: without }, ctxWork))).data);
    const full = await asText((await X.make('indices', ctxWork)).data);
    ok('the indices chosen are the ones exported: the words left out of the text indices', /Index of words/.test(full) && !/Index of words/.test(ixt), { full: full.length, ixt: ixt.length });
    const rd = await asText((await X.make('reader', Object.assign({ indices: none }, ctxWork))).data);
    const rdAll = await asText((await X.make('reader', ctxWork)).data);
    ok('a reader with none chosen has no indices, one with all has them', /<summary>Indices<\/summary>/.test(rdAll) && /<h2>Words<\/h2>/.test(rdAll) && !/<summary>Indices<\/summary>/.test(rd));
    const md = await asText((await X.make('markdown', ctxWork)).data), mdNone = await asText((await X.make('markdown', Object.assign({ indices: none }, ctxWork))).data);
    ok('the Markdown carries the indices chosen as lists', /\n## Index of words\n\n- /.test(md) && !/## Index of/.test(mdNone));
    const tx = await asText((await X.make('text', Object.assign({ indices: none }, ctxWork))).data);
    ok('and the apparatus as text ends with the text itself when none is chosen', !/Index of/.test(tx) && tx.trim().length > 20);
    const texAll = (await unzip((await X.make('latex', ctxWork)).data))['edition.tex'], texNone = (await unzip((await X.make('latex', Object.assign({ indices: none }, ctxWork))).data))['edition.tex'];
    const texText = (csv) => new TextDecoder().decode(new Uint8Array(csv.split(',').map(Number)));
    ok('the LaTeX sets the indices chosen in columns, with multicol, and none when none is chosen', /\\section\*\{Index of words\}\n\\ixthree\n\\ixentry\{/.test(texText(texAll)) && /\\usepackage\{multicol\}/.test(texText(texAll)) && !/multicol/.test(texText(texNone)));
    const pdfAll = await ME.Typeset.pdf(ed, list, built, {}), pdfNone = await ME.Typeset.pdf(ed, list, built, { indices: none });
    ok('the direct PDF has pages of indices after the text, and none when none is chosen', pdfAll.pages > pdfNone.pages && pdfAll.missing === 0, { all: pdfAll.pages, none: pdfNone.pages, missing: pdfAll.missing });
    const mdBook = ME.Markdown.edition(ed, list, built, { bare: true }), pdfBook = await ME.Typeset.pdf(ed, list, built, { bare: true });
    ok('for a book there are no indices, whatever the choice', !/## Index of/.test(mdBook) && pdfBook.pages < pdfAll.pages, { book: pdfBook.pages, all: pdfAll.pages });
    const html = ME.PrintHTML.html(ed, list, built, { fonts: [] }), htmlNone = ME.PrintHTML.html(ed, list, built, { fonts: [], indices: none });
    ok('the print page carries the indices chosen in its data', /"indices":\{"words":\[\["/.test(html) && /"indices":\{"words":\[\],"padas":\[\],"quotes":\[\],"byWork":\[\]\}/.test(htmlNone));
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
    await same('text', ctxBlock, () => A.text(ed, one) + '\n\n' + ME.LayersView.indicesBody(ed, one) + '\n');
    // what is offered where
    const ids = (ctx) => X.available(Object.assign({ blockScope: false }, ctx)).map((f) => f.id);
    const work0 = ids({ kind: 'edition', ed, list });
    const block0 = ids({ kind: 'edition', ed, list, blockScope: true });
    const proj = ids({ kind: 'project' });
    ok('an edition offers print, read, exchange and archive formats, and the block formats only for a block', ['pdf-any', 'reader', 'tei', 'package', 'release'].every((f) => work0.includes(f)) && !work0.includes('csv') && block0.includes('csv'), { work0, block0 });
    ok('a transcription offers TEI or HTML, Markdown, and its backup', proj.join() === 'tei-xml,markdown-tr,backup', proj);
    ME.Features.setContext(['ar']);
    const ar = ids({ kind: 'edition', ed, list });
    ok('without the South Asian pack: no Devanagari PDF, no Saktumiva', !ar.includes('pdf-direct') && !ar.includes('saktumiva'), ar);
    ME.Features.setContext(ME.Features.langsOf(list));
    window.ed = ed; window.list = list;
    return out;
  });
  for (const [n, c, x] of res) T.check(n, c, x);

  // the reader page, opened as a file would be on a phone: the text and the notes are in the file itself, so that a
  // viewer that runs no script (a phone's file preview) shows them, the notes under the text; with the script, as
  // before; and an edition of one witness reads too
  const readerOf = (one) => page.evaluate(async (one) => {
    const { Store, Edition, Collate, Publish } = ME;
    let ed = window.ed, list = window.list;
    if (one) {
      ed = Edition.create('Alone'); ed.editor = 'Editor';
      const p = list[0].p, w = { siglum: 'A', projectId: p.id, streams: {} };
      ed.witnesses.push(w); list = [{ w, p }]; ed.trust = ['A'];
      await Store.putEdition(ed);
      await Collate.run(ed, list, 'main', {});
    }
    const { built } = (await ME.Release.works(ed, list))[0];
    return Publish.reader(ed, list, built, await ME.LayersView.baseTexts(ed, 'main'));
  }, one);
  const look = async (html, js) => {
    const p2 = await browser.newPage();
    await p2.setJavaScriptEnabled(js);
    await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [];
    p2.on('pageerror', (e) => errors.push(String(e)));
    await p2.setContent(html, { waitUntil: 'load' });
    await sleep(300);
    const r = await p2.evaluate(() => ({ blocks: document.querySelectorAll('#text section.block').length, text: [...document.querySelectorAll('#text .txt')].map((x) => x.textContent.trim()).filter(Boolean).length, app: [...document.querySelectorAll('#text ol.app')].some((x) => x.getBoundingClientRect().height > 0), items: document.querySelectorAll('#text ol.app li').length, controls: getComputedStyle(document.querySelector('header label')).display, docW: document.documentElement.scrollWidth }));
    r.errors = errors;
    await p2.close();
    return r;
  };
  const three = await readerOf(false), alone = await readerOf(true);
  const withJs = await look(three, true), without = await look(three, false), aloneJs = await look(alone, true), aloneNo = await look(alone, false);
  T.check('the reader page on a phone: its two blocks of text, the notes kept for pointing and clicking, no error, nothing past the right edge', withJs.blocks === 2 && withJs.text === 2 && withJs.app === false && withJs.items > 0 && !withJs.errors.length && withJs.docW <= 390, withJs);
  T.check('with no script running (a phone’s file preview): the text is there all the same, the notes under it, the dead controls not shown', without.blocks === 2 && without.text === 2 && without.app === true && without.items > 0 && without.controls === 'none', without);
  T.check('an edition of one witness: its text in the reader, with and without a script, no error', aloneJs.blocks === 2 && aloneJs.text === 2 && !aloneJs.errors.length && aloneNo.blocks === 2 && aloneNo.text === 2, { aloneJs, aloneNo });

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
    out.ixTei = document.querySelector('.modal .xp-indices').hidden;
    document.querySelector('.modal input[name="xp-kind"][value="pdf"]').click();
    out.pdf = vis();
    out.ixPdf = !document.querySelector('.modal .xp-indices').hidden;
    out.ixBoxes = [...document.querySelectorAll('.modal .xp-indices input')].map((i) => i.dataset.index);
    out.checked = document.querySelector('.modal input[name="xp-format"]:checked').value;
    return out;
  });
  T.check('Export asks first for the kind of file: PDF, HTML, LaTeX, TEI, Text, Archive', ['PDF', 'HTML', 'LaTeX', 'TEI', 'Text', 'Archive'].every((k) => kinds.kinds.includes(k)), kinds.kinds);
  T.check('the indices to carry are offered for a PDF (pādas, words, quotations, by work) and not for TEI', kinds.ixPdf && kinds.ixTei && kinds.ixBoxes.join() === 'padas,words,quotes,byWork', { pdf: kinds.ixPdf, tei: kinds.ixTei, boxes: kinds.ixBoxes });
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
