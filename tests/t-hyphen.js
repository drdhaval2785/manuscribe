// A word of an Indian script longer than a line: broken between akṣaras with a hyphen, never inside a cluster, and
// never into the margin; on the print page and in the PDF. Words in other scripts do not overflow either.
const { launch, checks } = require('./h');
const { LANGS, buildInPage } = require('./languages');
const long = 'इतिश्रीस्वच्छातुच्छमहेच्छश्रीवृहत्खरतरगच्छाधिराजश्रीजिनराजसूरिपट्टालंकारश्रीपूज्यश्रीजिनभद्रसूरींद्रसंतानीयश्रीजिनमाणिक्यसूरिपट्टालंकारश्रीमत्कीर्तिरत्नसूरिशाखायां';
const words = 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय';
(async () => {
  const { browser, page } = await launch('hyphen', { fonts: true });
  const T = checks('Long words');
  try {
    const P = '<x-marker type="p-start" id="v1"/>', END = '<x-marker type="p-end"/>';
    const lines = Array.from({ length: 24 }, (_, i) => (i % 4 === 1 ? long + ' ' : '') + words + ' ' + words);
    lines[0] = P + lines[0]; lines[23] += END;
    await buildInPage(page, LANGS.sa, [{ siglum: 'A', pages: [lines] }], 24);
    const res = await page.evaluate(async (long) => {
      const { ed, list } = window.lang;
      const out = [];
      const ok = (n, c, x) => out.push([n, !!c, x]);
      const SHY = '­';
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      // what the PDF writes
      const writer = ME.PDFWriter.doc, drawn = [];
      const runs = [];
      ME.PDFWriter.doc = (...a) => { const d = writer(...a), np = d.page; d.page = (...b) => { const pg = np(...b), g = pg.glyphs; pg.glyphs = (gl, x, y, s, t, ...r) => { drawn.push(t); const w = g.call(pg, gl, x, y, s, t, ...r); runs.push({ t, x, y, w }); return w; }; return pg; }; return d; };
      const cap = await ME.Capture.pdf(ed, list, built, { keep: true });
      ME.PDFWriter.doc = writer;
      const fr = [...document.querySelectorAll('iframe')].pop(), w = fr.contentWindow, d = fr.contentDocument;
      const spans = [...d.querySelectorAll('.page .body .w')];
      let over = 0, worst = 0;
      for (const s of spans) { const b = s.closest('.body').getBoundingClientRect(); for (const r of s.getClientRects()) { if (r.right > b.right + 1) { over++; worst = Math.max(worst, r.right - b.right); } } }
      ok('no word runs into the margin', over === 0, { over, worst });
      const text = spans.map((s) => s.textContent).join('').replace(/­/g, '').replace(/-(?=\S)/g, '');
      ok('the text is unchanged, hyphens aside', text.includes(long) && text.includes('धर्मक्षेत्रे कुरुक्षेत्रे'), text.slice(0, 120));
      const soft = spans.filter((s) => s.textContent.endsWith(SHY));
      ok('a long word has places to break', soft.length > 20, soft.length);
      const cluster = /[्]­/;
      ok('never inside a cluster, or before a vowel sign', !spans.some((s) => cluster.test(s.textContent)) && !spans.some((s, i) => i && spans[i - 1].textContent.endsWith(SHY) && /^[\p{M}ऽ]/u.test(s.textContent)));
      ok('at least two akṣaras on each side', !spans.some((s, i) => s.textContent.endsWith(SHY) && (!i || !spans[i - 1].textContent.endsWith(SHY)) && Array.from(s.textContent.replace(SHY, '').matchAll(/\p{L}(?!्)/gu)).length < 2));
      const short = spans.filter((s) => s.textContent.trim()).find((s) => s.textContent === 'सञ्जय');
      ok('a short word is whole', !!short, spans.slice(0, 8).map((s) => s.textContent));
      // the line ends where a word was broken
      const lineEnds = soft.filter((s) => { const n = s.nextElementSibling, a = s.getClientRects()[0], b = n && n.getClientRects()[0]; return b && b.top > a.top + a.height / 2; });
      ok('long words do break at the ends of lines', lineEnds.length > 0, lineEnds.length);
      const hyphens = drawn.filter((t) => t === SHY).length;
      ok('and the PDF draws a hyphen at each of them (' + hyphens + ')', hyphens === lineEnds.length && cap.words.text > 0, { hyphens, lines: lineEnds.length });
      ok('the PDF does not write a soft hyphen into a word', !drawn.some((t) => t !== SHY && t.includes(SHY)));
      // the hyphen stands after the last letter of the word as the PDF set it, never on it
      const onLetter = runs.filter((r, i) => r.t === SHY && i > 0 && runs[i - 1].t !== SHY && Math.abs(runs[i - 1].y - r.y) < 0.5 && r.x < runs[i - 1].x + runs[i - 1].w - 0.2);
      ok('each hyphen is set after the end of its word, not over its last letter', runs.some((r) => r.t === SHY) && !onLetter.length, onLetter.slice(0, 3));
      // the spaces, the page's last lines among them, are not stretched
      const gaps = spans.filter((x) => x.textContent && !x.textContent.trim() && x.nextElementSibling && x.getClientRects()[0]).map((x) => x.getClientRects()[0].width);
      ok('the spaces are not stretched wide, even on the last line of a page (' + Math.max(...gaps).toFixed(0) + ' px at the widest)', gaps.length > 20 && Math.max(...gaps) < 30, Math.max(...gaps));
      fr.remove();
      return out;
    }, long);
    for (const [n, ok, x] of res) T.check(n, ok, x);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
