// The print edition as a PDF made in the browser: a valid file that pdf.js reads back, every glyph in the font,
// notes always on the page of their line and never past the margin, over many pages; the text searchable; and
// the button on the apparatus screen. With the owner's package too, if it is here.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, importSample, WORK, exportVia } = require('./h');

(async () => {
  const T = checks('PDF in the browser');
  const { browser, page } = await launch('pdf');
  const res = await page.evaluate(async () => {
    const { Model, Store, Edition, Collate, CollateEdit: E } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    // a long tradition, to run over many pages: forty blocks, each a few lines, with variants in each
    const words = 'राम वनं गच्छति सीता च लक्ष्मणः अनुगच्छति ततः भरतः आगतः धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय'.split(' ');
    const texts = { A: [], B: [], C: [] };
    let seed = 5; const rnd = (n) => (seed = (seed * 16807) % 2147483647) % n;
    for (let k = 1; k <= 40; k++) {
      const base = Array.from({ length: 24 + rnd(30) }, () => words[rnd(words.length)]);
      for (const s of Object.keys(texts)) {
        const w = base.map((x) => (rnd(9) === 0 ? x + (s === 'B' ? 'ः' : 'म्') : x));
        if (s === 'C' && rnd(3) === 0) w.splice(rnd(w.length), 1);
        texts[s].push('<x-marker type="p-start" id="b' + k + '"/>' + w.join(' ') + ' ॥ ' + k + ' ॥<x-marker type="p-end"/>');
      }
    }
    const ed = Edition.create('Rāmāyaṇa-like');
    ed.editor = 'Editor';
    const list = [];
    for (const [s, lines] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, repository: 'Library', shelfmark: 'No. ' + s, date: '1700' }, layoutType: 'linear', lines: { main: 50 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: lines } } };
      await Store.putProject(p);
      const w = { siglum: s, projectId: p.id, streams: {} };
      ed.witnesses.push(w); list.push({ w, p });
    }
    ed.trust = ['A', 'B', 'C'];
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'main', {});
    // a crux, an uncertain reading and an emendation, with a reason
    const rec = await Store.getCollation(Collate.keyOf(ed.id, 'main', 'b1'));
    const t = E.ensure(rec.table);
    const places = E.proposal(t, ed.trust).units.filter((u) => u.differs);
    const q = (u) => { const o = {}; for (const g of u.groups) for (const m of g.members) o[m.label] = m.text; return o; };
    E.perform(t, { op: 'decide', from: places[0].fromId, to: places[0].toId, type: 'selectio', label: places[0].groups[1].form.label, quote: q(places[0]), crux: true, reasons: ['metre'] });
    E.perform(t, { op: 'decide', from: places[1].fromId, to: places[1].toId, type: 'emendatio', text: 'रामः', quote: q(places[1]), confidence: 'low', source: 'Kielhorn' });
    await Collate.saveTable(ed, rec);
    const works = await ME.Release.works(ed, list);
    const t0 = performance.now();
    const r = await ME.Typeset.pdf(ed, list, works[0].built);
    const ms = performance.now() - t0;
    ok('a PDF of ' + r.pages + ' pages, in ' + Math.round(ms) + ' ms', r.pages >= 4 && ms < 20000, { pages: r.pages, ms });
    ok('every glyph is in the font', r.missing === 0, r.missing);
    ok('no page has more notes than fit', r.overfull === 0, r.overfull);
    const strays = r.layout.flatMap((pg) => pg.notes.filter((n) => !pg.lines.includes(n)).map((n) => pg.page + ' ' + n));
    ok('every note is on the page of its line', strays.length === 0 && r.layout.reduce((a, pg) => a + pg.notes.length, 0) > 40, strays.slice(0, 5));
    ok('the text never runs into its notes, nor past the margin', r.layout.every((pg) => pg.bodyEnd <= pg.footTop + 1 && pg.footTop <= pg.limit), r.layout.filter((pg) => pg.bodyEnd > pg.footTop + 1).map((pg) => [pg.page, pg.bodyEnd, pg.footTop]));
    ok('every line of every block is set once', r.layout.flatMap((pg) => pg.lines).length === new Set(r.layout.flatMap((pg) => pg.lines)).size);
    // read it back
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    ok('it is a PDF', String.fromCharCode(...buf.slice(0, 8)) === '%PDF-1.7' && /%%EOF\s*$/.test(String.fromCharCode(...buf.slice(-8))));
    await ME.PdfView.ensureWorker();
    const pdf = await pdfjsLib.getDocument({ data: buf.slice() }).promise;
    ok('pdf.js opens it, with every page', pdf.numPages === r.pages, pdf.numPages);
    const textOf = async (i) => (await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ');
    const p1 = await textOf(1), p2 = await textOf(2);
    ok('the title page: title, conspectus, principles', /Rāmāyaṇa-like/.test(p1) && /Conspectus siglorum/.test(p1) && /Editorial principles/.test(p1), p1.slice(0, 200));
    ok('the text can be searched: letters come back from the glyphs', /राम/.test(p2) && /लक्ष्मणः/.test(p2) && /b1/.test(p2), p2.slice(0, 200));
    ok('a crux is in daggers, and the emendation is in the text and the apparatus', /†/.test(p2) && /Kielhorn/.test(p2), p2.slice(0, 600));
    // drawn, not blank
    const pg = await pdf.getPage(2);
    const vp = pg.getViewport({ scale: 1 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0 && px[i] < 128) ink++;
    ok('a page of the edition has ink on it', ink > 3000, ink);
    window.ed = ed; window.list = list;
    let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    window.pdfB64 = btoa(bin);
    return out;
  });
  for (const [n, c, x] of res) T.check(n, c, x);
  // to look at it: MANUSCRIBE_PDF_OUT=file.pdf node t-pdf.js
  if (process.env.MANUSCRIBE_PDF_OUT) fs.writeFileSync(process.env.MANUSCRIBE_PDF_OUT, Buffer.from(await page.evaluate(() => window.pdfB64), 'base64'));

  // the button, on the apparatus screen
  const dl = path.join(WORK, 'downloads-pdf');
  fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await page.evaluate(() => { ME.CollateView.workApparatus(window.ed, window.list, 'main'); });
  await sleep(900);
  await exportVia(page, '.modal [data-action="export"]', 'pdf-direct');
  for (let k = 0; k < 40 && !fs.readdirSync(dl).some((f) => f.endsWith('.pdf')); k++) await sleep(250);
  const file = fs.readdirSync(dl).find((f) => f.endsWith('.pdf'));
  T.check('Export › PDF file (Devanagari and Latin) saves a PDF', !!file && fs.statSync(path.join(dl, file)).size > 100000, file);
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(300);

  // the owner's package
  await page.evaluate(() => ME.App.showStart());
  await sleep(300);
  if (await importSample(page)) {
    const r = await page.evaluate(async () => {
      const eds = await ME.Store.listEditions();
      const ed = eds.find((e) => e.witnesses.some((w) => w.siglum === 'AK1'));
      const list = [];
      for (const w of ed.witnesses) list.push({ w, p: ME.Model.upgrade(await ME.Store.getProject(w.projectId)) });
      await ME.Collate.run(ed, list, 'commentary', {});
      const works = await ME.Release.works(ed, list);
      const out = await ME.Typeset.pdf(ed, list, works[0].built);
      return { pages: out.pages, missing: out.missing, strays: out.layout.flatMap((pg) => pg.notes.filter((n) => !pg.lines.includes(n))).length };
    });
    T.check('the owner’s package typesets, every glyph present and every note with its line', r.pages >= 2 && r.missing === 0 && r.strays === 0, r);
  } else T.skip('the owner’s package', 'not on this computer');
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
