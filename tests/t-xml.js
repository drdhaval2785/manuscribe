// Transcriptions: XML out and back in gives the same lines, in every layout; folio and page numbering.
const { launch, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('xml');
  const T = checks('XML round trip and numbering');
  const r = await page.evaluate(() => {
    const { Model, Export, Importer } = ME;
    const out = {};
    const cases = {
      linear: [{ main: 4 }, { '1r': { boxes: { main: ['<x-marker type="p-start" id="p1"/>पहिला वाक्य ', 'दूसरी <del rend="crossed out">पंक्ति</del> यहाँ', 'आगे तीसरी<add place="above">क</add>', 'चौथी<x-marker type="p-end"/> '] } } }],
      tripatha: [{ top: 2, main: 2, bottom: 2 }, { '1r': { boxes: { top: ['<x-marker type="p-start" id="c1"/>उपरि एक ', 'उपरि द्वि '], main: ['<x-marker type="p-start" id="p1"/>मूल एक ', 'मूल द्वि<x-marker type="p-end"/> '], bottom: ['अधो एक ', 'अधो द्वि<x-marker type="p-end"/>'] } } }],
      pancapatha: [{ top: 2, left: 2, main: 2, right: 2, bottom: 2 }, { '1r': { boxes: { top: ['<x-marker type="p-start" id="c1"/>उ '], right: ['द '], left: ['वा '], bottom: ['अ<x-marker type="p-end"/> '], main: ['<x-marker type="p-start" id="p1"/>मू<x-marker type="p-end"/> '] } } }],
      interlinear: [{ main: 2 }, { '1r': { boxes: { main: ['<x-marker type="p-start" id="p1"/>मूल एक ', 'मूल द्वि<x-marker type="p-end"/> '], gloss: ['टीका एक ', 'टीका द्वि '] } } }],
    };
    for (const [type, [lines, pages]] of Object.entries(cases)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: 'T', siglum: 'T' }, layoutType: type, lines, folios: {} }));
      p.pdf = { name: 'x', pages: 2 }; p.pages = pages;
      const x1 = Export.build(p, {}).xml;
      const f = Model.upgrade(Model.newProject({ meta: { title: 'i' }, layoutType: type, lines, folios: {} }));
      f.pdf = { name: 'x', pages: 2 };
      Importer.apply(f, Importer.parse(x1, {}), '1r', { fresh: true });
      const x2 = Export.build(f, {}).xml;
      const body = (x) => x.split('<body>')[1];
      out[type] = body(x1) === body(x2);
    }
    // a pañcapāṭha commentary reads top, right, left, bottom
    out.pancaOrder = [...Export.build((() => { const p = Model.upgrade(Model.newProject({ meta: {}, layoutType: 'pancapatha', lines: cases.pancapatha[0], folios: {} })); p.pdf = { name: 'x', pages: 1 }; p.pages = cases.pancapatha[1]; return p; })(), {}).xml.matchAll(/<cb n="(\w+)"/g)].map((m) => m[1]).join(',');
    const labels = (folios, pages) => { const p = Model.upgrade(Model.newProject({ meta: {}, layoutType: 'linear', lines: { main: 3 }, folios })); p.pdf = { name: 'x', pages: pages || 5 }; return Model.entries(p).map((e) => e.label).join(' '); };
    out.recto = labels({ firstPage: 2, startNo: 5, startSide: 'r' });
    out.page = labels({ firstPage: 2, startNo: 9, startSide: 'p' });
    out.pageMissing = labels({ firstPage: 1, startNo: 9, startSide: 'p', missing: '11, 13-14' });
    out.tagProblems = Importer.tagProblems('<TEI><text><body><p><note>open <lb/>never closed</p></body></text></TEI>').length > 0;
    return out;
  });
  for (const t of ['linear', 'tripatha', 'pancapatha', 'interlinear']) T.check(t + ': export, import, export gives the same body', r[t]);
  T.check('pañcapāṭha commentary is top, right, left, bottom', r.pancaOrder === 'top,right,left,bottom', r.pancaOrder);
  T.check('recto and verso numbering', r.recto === 'p1 5r 5v 6r 6v', r.recto);
  T.check('page numbering', r.page === 'p1 9 10 11 12', r.page);
  T.check('missing pages are skipped', r.pageMissing === '9 10 12 15 16', r.pageMissing);
  T.check('a note never closed is refused', r.tagProblems);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
