// Every language Manuscribe is likely to meet, by its language code: three witnesses of two folio sides each, in its
// own script, copied down a stemma; set up as Manuscribe sets up an edition in that language, collated, and published.
// For each: the apparatus finds the variants and passes its checks, with lemmas of a word or two; the print page
// lays itself out with every note on the page of its marker, right to left where the script is; the reader opens;
// the TEI is well-formed; and where Export offers the direct PDF, its font has every letter.
const { launch, sleep, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

const LINES = 26;

(async () => {
  const T = checks('Every language');
  const only = process.env.LANGS ? process.env.LANGS.split(',') : Object.keys(LANGS);
  const { browser, page } = await launch('languages', { level: 'simple' });
  const rows = [];
  for (const code of only) {
    const L = LANGS[code];
    const data = make(code, 3, 2, LINES, 7);
    const set = await buildInPage(page, L, data, LINES);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      const t0 = performance.now();
      const res = await ME.Collate.run(ed, list, 'main', {});
      const tCollate = performance.now() - t0;
      const works = await ME.Release.works(ed, list);
      const built = works[0].built;
      const entries = built.flatMap((b) => b.entries);
      const problems = built.flatMap((b) => ME.Apparatus.validate(ed, b.table, b)).filter((p) => p.level === 'error').map((p) => p.text);
      const lemmas = entries.filter((e) => e.kind !== 'testimonium').map((e) => [...(e.lemma || '')].length).sort((a, b) => a - b);
      const median = lemmas.length ? lemmas[Math.floor(lemmas.length / 2)] : 0;
      const print = ME.PrintHTML.html(ed, list, built, { fonts: await ME.PrintHTML.fonts(ed, built) });
      const reader = await ME.Publish.reader(ed, list, built, null);
      const tei = ME.Apparatus.tei(ed, built, works[0].work);
      const wellFormed = !new DOMParser().parseFromString(tei, 'application/xml').getElementsByTagName('parsererror').length;
      // the direct PDF, where Export offers it
      const offered = ME.ExportView.available({ kind: 'edition', ed, list }).some((f) => f.id === 'pdf-direct');
      let direct = null;
      if (offered) { const d = await ME.Typeset.pdf(ed, list, built); direct = { pages: d.pages, missing: d.missing, overfull: d.overfull }; }
      const sample = entries.slice(0, 2).map((e) => ME.Apparatus.format(ed, e).replace(/<\/?sup>/g, ''));
      return { blocks: res.done.length, tCollate, entries: entries.length, problems, median, longest: lemmas[lemmas.length - 1] || 0, print, reader, wellFormed, offered, direct, sample };
    });
    // the print page, laid out
    const p2 = await browser.newPage();
    await p2.setContent(r.print, { waitUntil: 'load' });
    for (let k = 0; k < 200 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(50);
    const lay = await p2.evaluate(() => {
      const R = window.__paginated;
      if (!R) return null;
      const strays = R.pagesInfo.reduce((a, pg) => a + pg.inText.filter((k) => !pg.inFoot.includes(k)).length + pg.inFoot.filter((k) => !pg.inText.includes(k)).length, 0);
      return { pages: R.pages, overfull: R.overfull, strays, clear: R.pagesInfo.every((pg) => pg.clear && pg.within), dir: getComputedStyle(document.querySelector('.txt')).direction };
    });
    await p2.close();
    const p3 = await browser.newPage();
    await p3.setContent(r.reader, { waitUntil: 'load' });
    await sleep(100);
    const rd = await p3.evaluate(() => ({ blocks: document.querySelectorAll('section.block').length, marked: document.querySelectorAll('#text .u').length }));
    await p3.close();
    const name = code + ' (' + L.name + ')';
    const ok = r.blocks > 0 && r.entries > 0 && !r.problems.length && r.median <= 24 && r.wellFormed && lay && !lay.strays && !lay.overfull && lay.clear && (lay.dir === 'rtl') === !!L.rtl && rd.blocks === r.blocks && rd.marked > 0 && (!r.direct || r.direct.missing === 0);
    T.check(name + ': ' + set.profile + ', by ' + set.tokens + 's; ' + r.entries + ' entries, lemmas of ' + r.median + ' letters (median); ' + (lay ? lay.pages + ' pages ' + lay.dir : 'no layout') + (r.direct ? '; direct PDF ' + r.direct.pages + ' pages' : ''), ok,
      { problems: r.problems.slice(0, 3), median: r.median, longest: r.longest, lay, reader: rd, wellFormed: r.wellFormed, direct: r.direct, sample: r.sample });
    rows.push({ code, name: L.name, profile: set.profile, tokens: set.tokens, pack: set.pack, ms: Math.round(r.tCollate), entries: r.entries, median: r.median, pages: lay && lay.pages, dir: lay && lay.dir, direct: r.direct });
  }
  console.log('  ' + rows.map((x) => x.code + ':' + x.tokens[0] + (x.pack ? '*' : '') + ':' + x.ms + 'ms').join(' '));
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
