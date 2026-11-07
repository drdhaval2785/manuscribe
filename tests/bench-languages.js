// A benchmark, not a test (run.js does not run it): for each language, fifteen witnesses of about ten folio sides
// each, copied from one text down a stemma of three families with errors of their own at each copying; collated,
// and published as the print page, the browser's PDF of it, the reader, TEI and, for Latin script, the direct PDF.
// It reports how long each step takes and what came out, and saves the outputs and a picture of a page of each.
//
//   node tests/bench-languages.js [language codes, e.g. la,ar,ja,grc, or all] [witnesses, 15] [folio sides, 10]
const fs = require('fs'), path = require('path');
const { launch, sleep, WORK } = require('./h');

const { LANGS, make, buildInPage } = require('./languages');

const ms = (t) => (t >= 10000 ? (t / 1000).toFixed(1) + ' s' : Math.round(t) + ' ms');

(async () => {
  const which = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : Object.keys(LANGS);
  const N = +(process.argv[3] || 15), SIDES = +(process.argv[4] || 10), LINES = 26;
  const out = path.join(WORK, 'bench');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await launch('bench');
  const report = [];
  for (const key of which) {
    const L = LANGS[key];
    const data = make(key, N, SIDES, LINES);
    const r = { code: key, lang: L.name, witnesses: N, sides: data.map((d) => d.pages.length), words: Math.round(data.reduce((a, d) => a + d.words, 0) / N), chars: Math.round(data.reduce((a, d) => a + d.chars, 0) / N), blocks: data[0].blocks };
    console.log('\n— ' + key + ' ' + L.name + ': ' + N + ' witnesses of ' + Math.min(...r.sides) + '–' + Math.max(...r.sides) + ' folio sides, about ' + r.words + ' words (' + r.chars + ' characters) each, in ' + r.blocks + ' blocks');
    const set = await buildInPage(page, L, data, LINES);
    await page.evaluate(() => { window.bench = window.lang; });
    Object.assign(r, set);
    // collate, watching its progress
    const t0 = Date.now();
    await page.evaluate(() => {
      window.bench.progress = { i: 0, n: 0 };
      window.bench.done = null;
      const t = performance.now();
      ME.Collate.run(window.bench.ed, window.bench.list, 'main', { onUnit: (i, n) => { window.bench.progress = { i, n }; } })
        .then((res) => { window.bench.done = { ok: true, ms: performance.now() - t, aligned: res.done.length, skipped: res.skipped.length, outside: res.outside.length }; }, (e) => { window.bench.done = { ok: false, error: e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 5).join(' | ') }; });
    });
    let last = 0;
    for (;;) {
      await sleep(1000);
      const st = await page.evaluate(() => ({ p: window.bench.progress, d: window.bench.done }));
      if (st.d) { r.collate = st.d; break; }
      if (Date.now() - last > 15000) { last = Date.now(); console.log('  … collating block ' + (st.p.i + 1) + ' of ' + st.p.n + ', ' + ms(Date.now() - t0)); }
    }
    if (!r.collate.ok) { console.log('  collation failed: ' + r.collate.error); report.push(r); continue; }
    console.log('  collated (' + r.profile + ', by ' + r.tokens + 's): ' + r.collate.aligned + ' blocks in ' + ms(r.collate.ms) + ' (' + ms(r.collate.ms / r.collate.aligned) + ' a block)' + (r.collate.skipped ? ', ' + r.collate.skipped + ' skipped' : ''));
    // the apparatus, and the outputs made in the page
    const made = await page.evaluate(async (key) => {
      const { ed, list } = window.bench;
      const T = (f) => { const t = performance.now(); return Promise.resolve(f()).then((v) => [v, performance.now() - t]); };
      const [works, tBuild] = await T(() => ME.Release.works(ed, list));
      const built = works[0].built;
      const entries = built.reduce((a, b) => a + b.entries.length, 0);
      const problems = built.reduce((a, b) => a + ME.Apparatus.validate(ed, b.table, b).filter((p) => p.level === 'error').length, 0);
      const [fonts] = await T(() => ME.PrintHTML.fonts(ed, built, list));
      const [print, tPrint] = await T(() => ME.PrintHTML.html(ed, list, built, { fonts }));
      const [reader, tReader] = await T(() => ME.Publish.reader(ed, list, built, null));
      const [tei, tTei] = await T(() => ME.Apparatus.tei(ed, built, works[0].work));
      const wellFormed = !new DOMParser().parseFromString(tei, 'application/xml').getElementsByTagName('parsererror').length;
      let direct = null;
      if (ME.ExportView.available({ kind: 'edition', ed, list }).some((f) => f.id === 'pdf-direct')) {
        const [d, tDirect] = await T(() => ME.Typeset.pdf(ed, list, built));
        const buf = new Uint8Array(await d.blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        direct = { ms: tDirect, pages: d.pages, overfull: d.overfull, missing: d.missing, b64: btoa(bin) };
      }
      const sample = built[0].entries.slice(0, window.BENCH_DEBUG ? 25 : 3).map((e) => ME.Apparatus.format(ed, e).replace(/<\/?sup>/g, ''));
      return { tBuild, entries, problems, print, tPrint, reader, tReader, tei, tTei, wellFormed, direct, sample, words: built.reduce((a, b) => a + b.proposal.count.words, 0) };
    }, key);
    Object.assign(r, { build: made.tBuild, entries: made.entries, problems: made.problems, tei: { ms: made.tTei, wellFormed: made.wellFormed, kb: Math.round(made.tei.length / 1024) } });
    console.log('  apparatus: ' + made.entries + ' entries for ' + made.words + ' words of edited text, built in ' + ms(made.tBuild) + '; ' + made.problems + ' problem(s) in the checks');
    console.log('  e.g. ' + made.sample.join(process.env.BENCH_DEBUG ? '\n       ' : '  |  '));
    fs.writeFileSync(path.join(out, key + '.print.html'), made.print);
    fs.writeFileSync(path.join(out, key + '.reader.html'), made.reader);
    fs.writeFileSync(path.join(out, key + '.tei.xml'), made.tei);
    // the print page: laid out by the browser, then its PDF, as Save as PDF makes it
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 900, height: 1200 });
    let t = Date.now();
    await p2.setContent(made.print, { waitUntil: 'load' });
    for (let k = 0; k < 600 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(100);
    const tLayout = Date.now() - t;
    const lay = await p2.evaluate(() => {
      const R = window.__paginated;
      const strays = R.pagesInfo.reduce((a, pg) => a + pg.inText.filter((k) => !pg.inFoot.includes(k)).length + pg.inFoot.filter((k) => !pg.inText.includes(k)).length, 0);
      return { pages: R.pages, overfull: R.overfull, strays, clear: R.pagesInfo.every((pg) => pg.clear && pg.within), notes: R.pagesInfo.reduce((a, pg) => a + pg.inFoot.length, 0), dir: getComputedStyle(document.querySelector('.txt')).direction };
    });
    const pages = await p2.$$('.page');
    if (pages[2]) await pages[2].screenshot({ path: path.join(out, key + '.print-page3.png') });
    t = Date.now();
    const pdf = await p2.pdf({ preferCSSPageSize: true, printBackground: true });
    const tPdf = Date.now() - t;
    fs.writeFileSync(path.join(out, key + '.browser.pdf'), pdf);
    await p2.close();
    r.print = { html: made.tPrint, layout: tLayout, pdf: tPdf, pages: lay.pages, overfull: lay.overfull, strays: lay.strays, clear: lay.clear, notes: lay.notes, dir: lay.dir, kb: Math.round(pdf.length / 1024) };
    console.log('  print page: made in ' + ms(made.tPrint) + ', laid out in ' + ms(tLayout) + ' as ' + lay.pages + ' pages (' + lay.dir + '); ' + lay.notes + ' notes, ' + lay.strays + ' away from their marker, ' + lay.overfull + ' overfull, ' + (lay.clear ? 'no text over its notes' : 'TEXT OVER NOTES'));
    console.log('  browser PDF: ' + ms(tPdf) + ', ' + r.print.kb + ' KB');
    // the reader
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 1200, height: 800 });
    t = Date.now();
    await p3.setContent(made.reader, { waitUntil: 'load' });
    await sleep(200);
    const rd = await p3.evaluate(() => ({ blocks: document.querySelectorAll('section.block').length, marked: document.querySelectorAll('#text .u').length }));
    const tOpen = Date.now() - t;
    const u = await p3.$$('#text .u');
    if (u[3]) { await u[3].click(); await sleep(150); if (u[1]) await u[1].hover(); await sleep(150); }
    await p3.screenshot({ path: path.join(out, key + '.reader.png') });
    await p3.close();
    r.reader = { ms: made.tReader, open: tOpen, blocks: rd.blocks, marked: rd.marked, kb: Math.round(made.reader.length / 1024) };
    console.log('  reader: made in ' + ms(made.tReader) + ', opens in ' + ms(tOpen) + ', ' + rd.blocks + ' passages, ' + rd.marked + ' words with variants, ' + r.reader.kb + ' KB');
    console.log('  TEI: ' + ms(made.tTei) + ', ' + r.tei.kb + ' KB, ' + (made.wellFormed ? 'well-formed' : 'NOT WELL-FORMED'));
    if (made.direct) {
      fs.writeFileSync(path.join(out, key + '.direct.pdf'), Buffer.from(made.direct.b64, 'base64'));
      r.direct = { ms: made.direct.ms, pages: made.direct.pages, overfull: made.direct.overfull, missing: made.direct.missing };
      console.log('  direct PDF: ' + ms(made.direct.ms) + ', ' + made.direct.pages + ' pages, ' + made.direct.overfull + ' overfull, ' + made.direct.missing + ' letters missing from the font');
    }
    report.push(r);
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('\nOutputs and pictures in ' + out);
  await browser.close();
})().catch((e) => { console.log('crashed: ' + e.stack); process.exitCode = 1; });
