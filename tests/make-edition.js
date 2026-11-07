// Makes a dummy edition in one language and saves what Export would give: the PDF (saved at once, captured from the
// print page), the print page and the reader. Not a test, and run.js does not run it.
//
//   node tests/make-edition.js <code> [witnesses, 15] [folio sides, 10] [folder, ~/Downloads/manuscribe-<code>]
//
// <code> is a language code of tests/languages.js (en, es, fr, de, it, pt, la, ru, el, grc, ka, hy, ar, fa, ur, he,
// syc, sa, hi, mr, ne, gu, bn, pa, or, ta, te, kn, ml, si, bo, th, km, my, zh, ja, ko, am) or a Unicode script code
// of tests/scripts.js (Xsux, Egyp, Linb, Brah, Adlm…). The fonts of the scripts are fetched as the app fetches them
// (Noto), so the internet is needed the first time; MANUSCRIBE_FONTS=off uses the computer's fonts instead.
const fs = require('fs'), path = require('path'), os = require('os');
const { launch, sleep } = require('./h');
const { LANGS, make, makeFrom, buildInPage } = require('./languages');
const { specs } = require('./scripts');

(async () => {
  const code = process.argv[2];
  if (!code) { console.log('Usage: node tests/make-edition.js <language or script code> [witnesses] [folio sides] [folder]'); process.exit(1); }
  const N = +(process.argv[3] || 15), SIDES = +(process.argv[4] || 10), LINES = 26;
  const out = process.argv[5] || path.join(os.homedir(), 'Downloads', 'manuscribe-' + code);
  let L = LANGS[code], data;
  if (L) data = make(code, N, SIDES, LINES);
  else { L = specs([code])[0]; if (!L) { console.log('No language or script ' + code); process.exit(1); } data = makeFrom(L, N, SIDES, LINES); }
  fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const { browser, page } = await launch('make-' + code, { fonts: process.env.MANUSCRIBE_FONTS !== 'off' });
  console.log(L.name + ': ' + N + ' witnesses of ' + Math.min(...data.map((d) => d.pages.length)) + '–' + Math.max(...data.map((d) => d.pages.length)) + ' folio sides, ' + data[0].blocks + ' blocks');
  const set = await buildInPage(page, L, data, LINES);
  console.log('  compared as ' + set.profile + ', by ' + set.tokens + 's');
  // collate, with its progress
  await page.evaluate(() => {
    window.made = { at: 0, of: 0, done: null };
    const t = performance.now();
    ME.Collate.run(window.lang.ed, window.lang.list, 'main', { onUnit: (i, n) => { window.made.at = i + 1; window.made.of = n; } })
      .then(() => { window.made.done = { ms: performance.now() - t }; }, (e) => { window.made.done = { error: e.message }; });
  });
  for (let last = 0; ; ) {
    await sleep(500);
    const m = await page.evaluate(() => window.made);
    if (m.done) { if (m.done.error) throw new Error(m.done.error); console.log('  collated in ' + (m.done.ms / 1000).toFixed(1) + ' s'); break; }
    if (Date.now() - last > 5000) { last = Date.now(); console.log('  … block ' + m.at + ' of ' + m.of); }
  }
  const r = await page.evaluate(async () => {
    const { ed, list } = window.lang;
    const built = (await ME.Release.works(ed, list))[0].built;
    const b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    let t = performance.now();
    const fonts = await ME.PrintHTML.fonts(ed, built, list);
    const tFonts = performance.now() - t;
    t = performance.now();
    const pdf = await ME.Capture.pdf(ed, list, built);
    const tPdf = performance.now() - t;
    return {
      entries: built.reduce((a, b) => a + b.entries.length, 0), fonts: fonts.map((f) => f.name), tFonts, tPdf, pages: pdf.pages, words: pdf.words,
      pdf: await b64(pdf.blob), print: ME.PrintHTML.html(ed, list, built, { fonts }), reader: await ME.Publish.reader(ed, list, built, null),
    };
  });
  const name = code + '-' + N + 'x' + SIDES;
  fs.writeFileSync(path.join(out, name + '.pdf'), Buffer.from(r.pdf, 'base64'));
  fs.writeFileSync(path.join(out, name + '.print.html'), r.print);
  fs.writeFileSync(path.join(out, name + '.reader.html'), r.reader);
  console.log('  ' + r.entries + ' apparatus entries; fonts: ' + r.fonts.join(', ') + ' (' + (r.tFonts / 1000).toFixed(1) + ' s)');
  console.log('  PDF: ' + r.pages + ' pages, ' + r.words.text + ' words as text' + (r.words.pictures ? ', ' + r.words.pictures + ' as pictures (no font at hand)' : '') + ', ' + Math.round(Buffer.from(r.pdf, 'base64').length / 1024) + ' KB, made in ' + (r.tPdf / 1000).toFixed(1) + ' s');
  console.log('  saved in ' + out + ': ' + name + '.pdf, .print.html, .reader.html (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s in all)');
  await browser.close();
})().catch((e) => { console.log('Failed: ' + e.message); process.exitCode = 1; });
