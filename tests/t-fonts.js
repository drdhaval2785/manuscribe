// A font for every script: each script finds its Noto font; a font cut down to the glyphs an edition uses still
// draws them as before; and, where the internet can be reached, the fonts are fetched once, kept in the browser, and
// carried by the print page and the PDF, so that a PDF in Arabic, Japanese, Tibetan or hieroglyphs is text, with
// no pictures of words. Without the internet those last checks are skipped.
const { launch, sleep, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

(async () => {
  const T = checks('A font for every script');
  const { browser, page } = await launch('fonts', { fonts: true });
  const fam = await page.evaluate(() => {
    const F = ME.FontLib;
    const one = (t, l) => F.familiesFor(t, l).map((x) => x.family).join();
    return { ar: one('قال الشيخ'), ja: one('源氏物語', ['ja']), zh: one('天地人', ['zh-Hant']), ko: one('한국어', ['ko']), egyp: one('𓀀𓁐'), bo: one('བོད་'), grc: one('λόγος'), mixed: one('रामः and قال') };
  });
  T.check('each script finds its Noto font: Arabic, Japanese, Chinese, Korean, hieroglyphs, Tibetan, Greek', fam.ar === 'NotoNaskhArabic' && fam.ja === 'NotoSerifJP' && fam.zh === 'NotoSerifTC' && fam.ko === 'NotoSerifKR' && fam.egyp === 'NotoSansEgyptianHieroglyphs' && fam.bo === 'NotoSerifTibetan' && fam.grc === 'NotoSerif', fam);
  // a subset draws what it kept as the whole font does
  const sub = await page.evaluate(async () => {
    await ME.Shaper.load();
    const t = await ME.Publish.font();
    const bytes = Uint8Array.from(atob(t.base64), (c) => c.charCodeAt(0));
    const sh = ME.Shaper.font(bytes);
    const text = 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः Kṛṣṇa';
    const keep = ME.FontLib.glyphsOf(sh, text);
    const web = ME.FontLib.subset(bytes, keep, 'web'), pdf = ME.FontLib.subset(bytes, keep, 'pdf');
    const load = async (name, b) => { const f = new FontFace(name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); await f.load(); document.fonts.add(f); };
    await load('WholeTiro', bytes); await load('SubTiro', web);
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 60;
    const c = cv.getContext('2d');
    const draw = (font) => { c.clearRect(0, 0, 900, 60); c.font = '28px ' + font; c.fillText(text, 4, 40); return Array.from(c.getImageData(0, 0, 900, 60).data.filter((_, i) => i % 4 === 3)); };
    const a = draw('WholeTiro'), b = draw('SubTiro');
    let diff = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 8) diff++;
    const again = ME.Shaper.font(web); // the page's subset keeps what shaping needs; the PDF's need not
    return { whole: bytes.length, web: web.length, pdf: pdf.length, ink: a.filter((x) => x > 128).length, diff, sameShape: JSON.stringify(again.shape('धर्मक्षेत्रे').map((g) => g.g)) === JSON.stringify(sh.shape('धर्मक्षेत्रे').map((g) => g.g)) };
  });
  T.check('a font cut down to the glyphs used draws them exactly as the whole font does, and is far smaller', sub.ink > 1000 && sub.diff === 0 && sub.sameShape && sub.web < sub.whole && sub.pdf < sub.whole / 4, sub);
  // with the internet: fetched, kept, carried
  const online = await page.evaluate(async () => !!(await ME.FontLib.get('NotoSansOgham')));
  if (!online) { T.skip('fonts fetched from the internet', 'the internet cannot be reached'); T.done(page); await browser.close(); return; }
  T.check('a font is fetched once and kept in the browser', await page.evaluate(async () => { const k = await ME.Store.getFont('noto:NotoSansOgham'); return !!(k && k.bytes && k.bytes.byteLength > 1000); }));
  const egyp = { name: 'Egyptian hieroglyphs', tag: 'egy-Egyp', words: ['𓀀𓁐', '𓂀𓃀', '𓄿𓅓', '𓆑𓇋', '𓈖𓉐', '𓊃𓋴', '𓌳𓍿', '𓎛𓏏', '𓐍𓀭', '𓁷𓂋', '𓃭𓄡', '𓅱𓆓'], stop: '.', comma: ',', join: ' ', perLine: 40, code: 'egy' };
  for (const [code, L] of [['ar', LANGS.ar], ['ja', LANGS.ja], ['bo', LANGS.bo], ['egy', egyp]]) {
    await buildInPage(page, L, make.length && L.code === code && LANGS[code] ? make(code, 3, 1, 20, 5) : require('./languages').makeFrom(L, 3, 1, 20, 5), 20);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const fonts = await ME.PrintHTML.fonts(ed, built, list);
      const t0 = performance.now();
      const c = await ME.Capture.pdf(ed, list, built);
      const buf = new Uint8Array(await c.blob.arrayBuffer());
      await ME.PdfView.ensureWorker();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      return { fonts: fonts.map((f) => f.name + ':' + Math.round(f.data.length * 0.75 / 1024) + 'KB'), pictures: c.words.pictures, text: c.words.text, kb: Math.round(buf.length / 1024), pages: doc.numPages, ms: Math.round(performance.now() - t0) };
    });
    T.check(L.name + ': the page carries its Noto font, cut down, and the PDF is all text (' + r.text + ' words, ' + r.kb + ' KB, ' + r.ms + ' ms)', r.fonts.some((f) => /^Noto/.test(f)) && r.pictures === 0 && r.text > 50 && r.pages >= 1 && r.kb < 1500, r);
  }
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
