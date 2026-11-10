// Quotations marked in the witnesses (<quote>, with the work cited) reach the edition: each is a stretch of the
// edited text, shown in a shade of blue on the print page (and so in its PDF), in the reader and in the LaTeX, and
// indexed: in the order of the alphabet with its place and work, and under the works quoted; both as exports.
const { launch, checks } = require('./h');
const { LANGS, buildInPage } = require('./languages');
(async () => {
  const { browser, page } = await launch('quotes');
  const T = checks('Quotations in the edition');
  try {
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>', END = '<x-marker type="p-end"/>';
    const Q = (w, n) => '<x-marker type="q-start" source="' + w + '"' + (n ? ' n="' + n + '"' : '') + '/>', QE = '<x-marker type="q-end"/>';
    const lines = [
      P('v1') + 'इति ' + Q('w1', '1.1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः' + QE + ' इति स्मृतिः' + END,
      P('v2') + 'अथ ' + Q('w2', '') + 'सत्यं वद' + QE + ' धर्मं चर ' + Q('w1', '2.3') + 'मा प्रमदः' + QE + END,
      P('v3') + 'न किञ्चित् अपरम्' + END,
    ];
    await buildInPage(page, LANGS.sa, [{ siglum: 'A', pages: [lines] }, { siglum: 'B', pages: [lines] }], 3);
    const out = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      for (const { p } of list) { p.works = [{ id: 'w1', title: 'Bhagavadgītā', author: 'Vyāsa', abbr: 'BhG' }, { id: 'w2', title: 'Taittirīyopaniṣad', author: 'Unknown', abbr: 'TU' }]; await ME.Store.putProject(p); }
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const A = ME.Apparatus;
      const b1 = built.find((b) => b.table.unit === 'v1'), b2 = built.find((b) => b.table.unit === 'v2');
      const an = A.anchors(b1), an2 = A.anchors(b2);
      const D = ME.PrintHTML.data(ed, list, built);
      const reader = await ME.ExportView.format('reader').make({ kind: 'edition', ed, list, workId: 'main' });
      const readerHtml = typeof reader.data === 'string' ? reader.data : await reader.data.text();
      const tex = ME.Publish.tex(ed, list, built, {});
      const idx = ME.Concord.quoteIndex(built), byWork = ME.Concord.quotesByWork(built);
      const fmt = async (id) => { const f = await ME.ExportView.format(id).make({ kind: 'edition', ed, list, workId: 'main' }); return typeof f.data === 'string' ? f.data : await f.data.text(); };
      return {
        q1: b1.quotes, text1: an.quotes.map((q) => [an.text.slice(q.from, q.to), q.work, q.n]), text2: an2.quotes.map((q) => an2.text.slice(q.from, q.to)),
        print: D.blocks.find((b) => b.id === 'v1').html, printCss: ME.PrintHTML.css ? ME.PrintHTML.css() : '',
        readerHtml, readerIndices: /<h2>Quotations<\/h2>/.test(readerHtml) && /Quotations by work/.test(readerHtml) && /<h3>Bhagavadgītā, Vyāsa<\/h3>/.test(readerHtml) && /\.quote \{ color: #1f4e8c/.test(readerHtml),
        tex: { colour: /\\usepackage\{xcolor\}\\definecolor\{quote\}\{RGB\}\{31,78,140\}/.test(tex), q1: /\\textcolor\{quote\}\{धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः\s*\}/.test(tex), opens: (tex.match(/\\textcolor\{quote\}\{/g) || []).length },
        idx: idx.map((q) => [q.text, q.ref, q.work, q.n]), byWork: byWork.map((g) => [g.work, g.quotes.map((q) => q.text)]),
        indicesText: ME.LayersView.indicesText(ed, built), exp1: await fmt('quotes-index'), exp2: await fmt('quotes-by-work'),
        labels: ME.ExportView.FORMATS.filter((f) => /^quotes-/.test(f.id)).map((f) => f.label),
      };
    });
    const say = (o) => JSON.stringify(o);
    T.check('a quotation reaches the edition as a stretch of the edited text, with the work it is from', out.text1.length === 1 && out.text1[0][0] === 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः' && out.text1[0][1] === 'Bhagavadgītā, Vyāsa' && out.text1[0][2] === '1.1', say(out.text1));
    T.check('two quotations in one block are both there, each its own words', out.text2.join('|') === 'सत्यं वद|मा प्रमदः', say(out.text2));
    T.check('on the print page the quotation is a span in blue, named for its work', /<span class="quote" title="Quotation from Bhagavadgītā, Vyāsa 1\.1">धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः<\/span>/.test(out.print), out.print);
    // the reader draws its text when opened: looked at in a page of its own
    const reader = await (async () => {
      const p2 = await browser.newPage();
      await p2.setContent(out.readerHtml, { waitUntil: 'load' });
      const r = await p2.evaluate(() => { const qs = [...document.querySelectorAll('#text .quote')]; return { spans: qs.length, first: qs[0] ? { title: qs[0].title, text: qs[0].textContent.trim(), blue: getComputedStyle(qs[0]).color } : null }; });
      await p2.close();
      return r;
    })();
    T.check('the reader colours each quotation blue and names its work, and its indices list the quotations and the works quoted', reader.spans === 3 && reader.first && reader.first.title === 'Quotation from Bhagavadgītā, Vyāsa 1.1' && reader.first.text === 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः' && reader.first.blue === 'rgb(31, 78, 140)' && out.readerIndices, say({ reader, indices: out.readerIndices }));
    T.check('the LaTeX sets each quotation in the same blue, with the colour defined', out.tex.colour && out.tex.q1 && out.tex.opens === 3, say(out.tex));
    T.check('the index of quotations is in the order of the alphabet, each with its place and work', out.idx.map((q) => q[0]).join('|') === 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः|मा प्रमदः|सत्यं वद' && out.idx[0][1] === 'v1.2' && out.idx[1][1] === 'v2.6' && out.idx[2][1] === 'v2.2' && out.idx[2][2] === 'Taittirīyopaniṣad', say(out.idx));
    T.check('and by the work quoted, the works in order, an author called Unknown left out', say(out.byWork) === say([['Bhagavadgītā, Vyāsa', ['धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः', 'मा प्रमदः']], ['Taittirīyopaniṣad', ['सत्यं वद']]]), say(out.byWork));
    T.check('both are in the indices text, and each is an export of its own', /Index of quotations\n/.test(out.indicesText) && /Quotations by work\n/.test(out.indicesText) && /^Index of quotations\nधर्मक्षेत्रे/m.test(out.exp1) && /Bhagavadgītā, Vyāsa\n  धर्मक्षेत्रे/.test(out.exp2) && out.labels.join('|') === 'Index of quotations|Quotations by cited work', { labels: out.labels, exp1: out.exp1.slice(0, 200) });
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
