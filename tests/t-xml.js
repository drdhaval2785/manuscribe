// Transcriptions: XML out and back in gives the same lines, in every layout; each folio side's own number of lines,
// block by block, written and read back; folio and page numbering.
const { launch, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('xml');
  const T = checks('XML round trip and numbering');
  const r = await page.evaluate(() => {
    const { Model, Export, Importer } = ME;
    const out = {};
    const body = (x) => x.split('<body>')[1];
    const cases = {
      linear: [{ main: 4 }, { '1r': { boxes: { main: ['<x-marker type="p-start" id="p1"/>पहिला वाक्य ', 'दूसरी <del rend="crossed out">पंक्ति</del> यहाँ', 'आगे तीसरी<add place="above">क</add>', 'चौथी<x-marker type="p-end"/> '] } } }],
      tripatha: [{ top: 2, main: 2, bottom: 2 }, { '1r': { boxes: { top: ['<x-marker type="p-start" id="c1"/>उपरि एक ', 'उपरि द्वि '], main: ['<x-marker type="p-start" id="p1"/>मूल एक ', 'मूल द्वि<x-marker type="p-end"/> '], bottom: ['अधो एक ', 'अधो द्वि<x-marker type="p-end"/>'] } } }],
      pancapatha: [{ top: 2, left: 2, main: 2, right: 2, bottom: 2 }, { '1r': { boxes: { top: ['<x-marker type="p-start" id="c1"/>उ '], right: ['द '], left: ['वा '], bottom: ['अ<x-marker type="p-end"/> '], main: ['<x-marker type="p-start" id="p1"/>मू<x-marker type="p-end"/> '] } } }],
      interlinear: [{ main: 2 }, { '1r': { boxes: { main: ['<x-marker type="p-start" id="p1"/>मूल एक ', 'मूल द्वि<x-marker type="p-end"/> '], gloss: ['टीका एक ', 'टीका द्वि '] } } }],
      // paragraph boundaries at line ends: a paragraph ending with a space after its marker (the file drops it), one
      // ending and the next beginning with a space after the new paragraph's marker; two spaces at the end of a line
      boundaries: [{ main: 5 }, { '1r': { boxes: { main: ['<x-marker type="p-start" id="p1"/>पहिला वाक्य  ', 'दूसरी पंक्ति<x-marker type="p-end"/> ', '<x-marker type="p-start" id="p2"/>तीसरी<x-marker type="p-end"/><x-marker type="p-start" id="p3"/> ', 'चौथी पंक्ति ', 'पांचवी<x-marker type="p-end"/>'] } } }, 'linear'],
    };
    for (const [type, [lines, pages, layout]] of Object.entries(cases)) {
      const lt = layout || type;
      const p = Model.upgrade(Model.newProject({ meta: { title: 'T', siglum: 'T' }, layoutType: lt, lines, folios: {} }));
      p.pdf = { name: 'x', pages: 2 }; p.pages = pages;
      const x1 = Export.build(p, {}).xml;
      const f = Model.upgrade(Model.newProject({ meta: { title: 'i' }, layoutType: lt, lines, folios: {} }));
      f.pdf = { name: 'x', pages: 2 };
      Importer.apply(f, Importer.parse(x1, {}), '1r', { fresh: true });
      const x2 = Export.build(f, {}).xml;
      out[type] = body(x1) === body(x2);
    }

    // each folio side keeps the number of lines the file gives it, block by block: the export writes every line of a
    // block that has text, the blank ones at its end too, and the header's usual number serves only the rest
    {
      const p = Model.upgrade(Model.newProject({ meta: { title: 'T', siglum: 'T' }, layoutType: 'tripatha', lines: { top: 5, main: 8, bottom: 5 }, folios: {} }));
      p.pdf = { name: 'x', pages: 3 };
      const L = Model.entries(p).map((e) => e.label);
      const row = (s, n, first, last) => Array.from({ length: n }, (_, i) => (i === 0 && first ? first : '') + s + (i + 1) + (i === n - 1 && last ? last : '') + ' ');
      p.pages = {
        [L[0]]: { boxes: { top: row('उ', 5, '<x-marker type="p-start" id="c1"/>'), main: row('म', 2, '<x-marker type="p-start" id="p1"/>'), bottom: row('अ', 5) } }, // the main text typed to line 2 of 8
        [L[1]]: { lines: { top: 9, main: 3 }, boxes: { top: row('उ', 9), main: row('म', 3), bottom: row('अ', 5) } }, // a short main text under a long commentary
        [L[2]]: { lines: { main: 12, bottom: 2 }, boxes: { top: row('उ', 5), main: row('म', 12, '', '<x-marker type="p-end"/>'), bottom: row('अ', 2, '', '<x-marker type="p-end"/>') } },
      };
      const xml = Export.build(p, {}).xml;
      const count = (x) => {
        const o = {}; let div = '', pg = '', box = '';
        for (const m of x.matchAll(/<div type="([^"]+)"|<pb n="([^"]+)"|<cb n="([^"]+)"|<lb /g)) {
          if (m[1]) div = m[1]; else if (m[2]) { pg = m[2]; box = div === 'base-text' ? 'main' : ''; } else if (m[3]) box = m[3]; else o[pg + ' ' + box] = (o[pg + ' ' + box] || 0) + 1;
        }
        return Object.entries(o).sort().map((e) => e.join('=')).join(' ');
      };
      const f = Model.upgrade(Model.newProject({ meta: { title: 'i' }, layoutType: 'tripatha', lines: { top: 4, main: 6, bottom: 4 }, folios: {} }));
      f.pdf = { name: 'x', pages: 2 };
      Importer.apply(f, Importer.parse(xml, {}), '1r', { fresh: true });
      const n = (label, box) => Model.lineCount(f, label, box);
      out.counts = { written: count(xml), header: (/Lines per folio side: [^.]*\./.exec(xml) || [])[0], usual: f.layout.lines, own: L.slice(0, 3).map((l) => (f.pages[l].lines ? Object.entries(f.pages[l].lines).sort().map((e) => e.join('=')).join(' ') : null)),
        back: [n(L[0], 'main'), n(L[1], 'top'), n(L[1], 'main'), n(L[1], 'bottom'), n(L[2], 'main'), n(L[2], 'bottom')], same: body(xml) === body(Export.build(f, {}).xml) };
      // a file from elsewhere: writtenLines is the usual number; a folio side with fewer lines keeps its own
      const lbs = (k) => Array.from({ length: k }, (_, i) => '<lb n="' + (i + 1) + '"/>पंक्ति ' + (i + 1) + ' ').join('');
      const foreign = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><sourceDesc><msDesc><physDesc><objectDesc><layoutDesc><layout writtenLines="19"/></layoutDesc></objectDesc></physDesc></msDesc></sourceDesc></fileDesc></teiHeader><text><body><p><pb n="1r"/>' + lbs(19) + '<pb n="1v"/>' + lbs(6) + '</p></body></text></TEI>';
      const g = Model.upgrade(Model.newProject({ meta: { title: 'g' }, layoutType: 'linear', lines: { main: 8 }, folios: {} }));
      g.pdf = { name: 'x', pages: 1 };
      Importer.apply(g, Importer.parse(foreign, {}), '1r', { fresh: true });
      out.foreign = { usual: g.layout.lines.main, first: Model.lineCount(g, '1r', 'main'), second: Model.lineCount(g, '1v', 'main') };
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
  for (const t of ['linear', 'tripatha', 'pancapatha', 'interlinear', 'boundaries']) T.check(t + ': export, import, export gives the same body', r[t]);
  T.check('the file says how many lines each block of a folio side has: every line of a block with text, the blank ones at its end too; the header gives the usual numbers', r.counts.written === '1r bottom=5 1r main=8 1r top=5 1v bottom=5 1v main=3 1v top=9 2r bottom=2 2r main=12 2r top=5' && r.counts.header === 'Lines per folio side: main text 8, top 5, bottom 5.', r.counts);
  T.check('read back into a project made with other numbers, each folio side keeps its own number of lines, block by block, the usual numbers serving the rest; the body is the same', r.counts.usual.main === 8 && r.counts.usual.top === 5 && r.counts.usual.bottom === 5 && JSON.stringify(r.counts.own) === JSON.stringify([null, 'main=3 top=9', 'bottom=2 main=12']) && JSON.stringify(r.counts.back) === '[8,9,3,5,12,2]' && r.counts.same, r.counts);
  T.check('a file from elsewhere: the header’s writtenLines is the usual number, and a folio side with fewer lines keeps its own', r.foreign.usual === 19 && r.foreign.first === 19 && r.foreign.second === 6, r.foreign);
  T.check('pañcapāṭha commentary is top, right, left, bottom', r.pancaOrder === 'top,right,left,bottom', r.pancaOrder);
  T.check('recto and verso numbering', r.recto === 'p1 5r 5v 6r 6v', r.recto);
  T.check('page numbering', r.page === 'p1 9 10 11 12', r.page);
  T.check('missing pages are skipped', r.pageMissing === '9 10 12 15 16', r.pageMissing);
  T.check('a note never closed is refused', r.tagProblems);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
