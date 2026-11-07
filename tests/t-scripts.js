// Every script Unicode encodes (Unicode 17.0: 172 of them, from cuneiform, hieroglyphs and Linear B to Adlam and
// Tolong Siki): three witnesses in each, of words made of its own letters and marks, tagged und-Xxxx as a text in an
// unnamed language in that script would be. Each is set up as Manuscribe sets up such an edition, collated and
// published: the apparatus finds the variants and passes its checks, with lemmas of a word or two; the print page
// lays itself out, every note on its page, right to left where the script is; the reader opens; the TEI is
// well-formed. Whether a script is drawn depends on the fonts of the computer, which this does not test.
const { launch, sleep, checks } = require('./h');
const { makeFrom, buildInPage } = require('./languages');
const { specs } = require('./scripts');

const LINES = 14;

(async () => {
  const T = checks('Every script in Unicode');
  const t0 = Date.now();
  const all = specs(process.env.SCRIPTS ? process.env.SCRIPTS.split(',') : null);
  console.log('  ' + all.length + ' scripts, their letters found in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  const { browser, page } = await launch('scripts', { level: 'simple' });
  const p2 = await browser.newPage();
  const failed = [];
  for (const L of all) {
    const data = makeFrom(L, 3, 1, LINES, 11);
    const set = await buildInPage(page, L, data, LINES);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      try {
        const res = await ME.Collate.run(ed, list, 'main', {});
        const works = await ME.Release.works(ed, list);
        const built = works[0].built;
        const entries = built.flatMap((b) => b.entries);
        const problems = built.flatMap((b) => ME.Apparatus.validate(ed, b.table, b)).filter((p) => p.level === 'error').map((p) => p.text);
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        const lemmas = entries.map((e) => [...seg.segment(e.lemma || '')].length).sort((a, b) => a - b);
        const tei = ME.Apparatus.tei(ed, built, works[0].work);
        return { blocks: res.done.length, skipped: res.skipped.length, entries: entries.length, problems, median: lemmas.length ? lemmas[Math.floor(lemmas.length / 2)] : 0,
          print: ME.PrintHTML.html(ed, list, built, {}), reader: await ME.Publish.reader(ed, list, built, null),
          tei: !new DOMParser().parseFromString(tei, 'application/xml').getElementsByTagName('parsererror').length,
          sample: entries.slice(0, 2).map((e) => ME.Apparatus.format(ed, e).replace(/<\/?sup>/g, '')) };
      } catch (e) { return { error: e.message + ' ' + (e.stack || '').split('\n')[1] }; }
    });
    if (r.error) { T.check(L.code + ' ' + L.name, false, r.error); failed.push(L.code); continue; }
    await p2.setContent(r.print, { waitUntil: 'load' });
    for (let k = 0; k < 200 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(30);
    const lay = await p2.evaluate(() => {
      const R = window.__paginated;
      if (!R) return null;
      return { pages: R.pages, overfull: R.overfull, strays: R.pagesInfo.reduce((a, pg) => a + pg.inText.filter((k) => !pg.inFoot.includes(k)).length + pg.inFoot.filter((k) => !pg.inText.includes(k)).length, 0), clear: R.pagesInfo.every((pg) => pg.clear && pg.within), dir: getComputedStyle(document.querySelector('.txt')).direction };
    });
    await p2.setContent(r.reader, { waitUntil: 'load' });
    const rd = await p2.evaluate(() => ({ blocks: document.querySelectorAll('section.block').length, marked: document.querySelectorAll('#text .u').length }));
    const ok = r.blocks > 0 && !r.skipped && r.entries > 0 && !r.problems.length && r.median <= 12 && r.tei && lay && !lay.strays && !lay.overfull && lay.clear && (lay.dir === 'rtl') === L.rtl && rd.blocks === r.blocks && rd.marked > 0;
    if (!ok) failed.push(L.code);
    T.check(L.code + ' ' + L.name + ' (' + L.nLetters + ' letters' + (L.nMarks ? ', ' + L.nMarks + ' marks' : '') + '): ' + set.profile + ', by ' + set.tokens + 's; ' + r.entries + ' entries, lemmas of ' + r.median + '; ' + (lay ? lay.pages + ' pages ' + lay.dir : 'no layout'), ok,
      { problems: r.problems.slice(0, 2), skipped: r.skipped, median: r.median, lay, reader: rd, tei: r.tei, sample: r.sample });
  }
  if (failed.length) console.log('  not yet: ' + failed.join(' '));
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
