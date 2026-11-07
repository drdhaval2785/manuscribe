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
  {
    const fresh = await launch('fonts-none', { fonts: 'none' });
    const r = await fresh.page.evaluate(async () => {
      const t = await ME.Publish.font();
      let err = '';
      try { await ME.Capture.pdf({ witnesses: [], works: [], apparatus: {} }, [], []); } catch (e) { err = e.message; }
      return { font: t, start: !!document.querySelector('#start-view, .start-card'), err };
    });
    T.check('a computer that has never been online: the app opens with its own fonts, and a PDF says that the font needs the internet once', r.font === null && r.start && /connect to the internet once/.test(r.err) && !fresh.page.errors.filter((e) => !/Failed to load resource/.test(e)).length, Object.assign(r, { errors: fresh.page.errors.filter((e) => !/Failed to load resource/.test(e)) }));
    await fresh.browser.close();
  }
  // with the internet: fetched, kept, carried
  const online = await page.evaluate(async () => !!(await ME.FontLib.get('NotoSansOgham')));
  if (!online) { T.skip('fonts fetched from the internet', 'the internet cannot be reached'); T.done(page); await browser.close(); return; }
  // Manuscribe's own font: no longer a file of the app, but fetched once and kept, and the typing area is set in it
  const own = await page.evaluate(async () => {
    const p = ME.Model.newProject({ meta: { title: 'Tiro', siglum: 'T' }, layoutType: 'linear', lines: { main: 4 }, folios: {} });
    p.pdf = { name: 'x.pdf', pages: 1 };
    p.pages = { '1r': { boxes: { main: ['धर्मक्षेत्रे कुरुक्षेत्रे', '', '', ''] } } };
    await ME.Store.putProject(p);
    await ME.App.open(p.id);
    await new Promise((r) => setTimeout(r, 400));
    const line = document.querySelector('#editor-pane .line');
    const kept = await ME.Store.getFont('noto:TiroDevanagariSanskrit');
    const t = await ME.Publish.font();
    return { faces: [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Tiro Devanagari Sanskrit' && f.status === 'loaded').map((f) => f.style).sort().join(), check: document.fonts.check('16px "Tiro Devanagari Sanskrit"', 'धर्म'), first: getComputedStyle(line).fontFamily.split(',')[0].replace(/["']/g, '').trim(), kept: !!(kept && kept.bytes), licence: !!(t && /Open Font License/.test(t.licence)) };
  });
  T.check('Manuscribe’s font, Tiro, is fetched once and kept, upright and italic, with its licence, and the typing area is set in it', own.faces === 'italic,normal' && own.check && own.first === 'Tiro Devanagari Sanskrit' && own.kept && own.licence, own);
  // only the font a transcription needs: none for Greek, Noto Serif Tibetan for Tibetan; and Tiro in print only
  // where the edition has Devanagari
  {
    const s = await launch('fonts-screen', { fonts: true });
    const r = await s.page.evaluate(async () => {
      const open = async (tag, line) => {
        const p = ME.Model.newProject({ meta: { title: tag, siglum: 'S', textLang: tag }, layoutType: 'linear', lines: { main: 2 }, folios: {} });
        p.pdf = { name: 'x.pdf', pages: 1 };
        p.pages = { '1r': { boxes: { main: [line, ''] } } };
        await ME.Store.putProject(p);
        await ME.App.open(p.id);
        await new Promise((r) => setTimeout(r, 1500));
        return { onScreen: ME.FontLib.onScreen().join(), stack: getComputedStyle(document.documentElement).getPropertyValue('--script'), tiro: [...document.fonts].some((f) => /Tiro/.test(f.family)) };
      };
      const grc = await open('grc', 'ἐν ἀρχῇ ἦν ὁ λόγος');
      const bo = await open('bo', 'བོད་ཀྱི་ཡི་གེ');
      // the dialog's two lists, as a new transcription would write them
      const L = ME.App.languageInputs();
      const pick = (lang, script) => { const [l, sc] = L.el.querySelectorAll('select'); l.value = lang; l.dispatchEvent(new Event('change')); if (script) sc.value = script; return L.value(); };
      const tags = [pick('grc'), pick('sa'), pick('sa', 'Latn'), pick('ar'), pick('ja')];
      return { grc, bo, tags };
    });
    T.check('a Greek transcription fetches no font (the browser sets Greek), and no Tiro', r.grc.onScreen === '' && !r.grc.tiro, r.grc);
    T.check('a Tibetan transcription fetches its Noto font only, and the typing area uses it', r.bo.onScreen === 'NotoSerifTibetan' && /NotoSerifTibetan/.test(r.bo.stack) && !r.bo.tiro, r.bo);
    const t = r.tags.map((x) => x.textLang + '/' + x.script + '/' + x.language).join(' ');
    T.check('a new transcription is asked its language and the script it is typed in: grc, sa-Deva, sa-Latn (from a Devanagari manuscript), ar, ja', t === 'grc/grc-Grek/Ancient Greek sa-Deva/sa-Deva/Sanskrit sa-Latn/sa-Deva/Sanskrit ar/ar-Arab/Arabic ja/ja-Jpan/Japanese', t);
    await buildInPage(s.page, LANGS.grc, make('grc', 3, 1, 20, 5), 20);
    const g = await s.page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const fonts = (await ME.PrintHTML.fonts(ed, built, list)).map((f) => f.name);
      const reader = await ME.Publish.reader(ed, list, built, null);
      const c = await ME.Capture.pdf(ed, list, built);
      return { fonts, readerTiro: /Tiro Devanagari Sanskrit';\s*src/.test(reader), pictures: c.words.pictures, text: c.words.text };
    });
    T.check('a Greek edition carries Noto Serif and no Tiro, in the print page, the reader and the PDF (all text)', g.fonts.join() === 'NotoSerif' && !g.readerTiro && g.pictures === 0 && g.text > 50, g);
    await s.browser.close();
  }
  T.check('a font is fetched once and kept in the browser', await page.evaluate(async () => { const k = await ME.Store.getFont('noto:NotoSansOgham'); return !!(k && k.bytes && k.bytes.byteLength > 1000); }));
  const egyp = { name: 'Egyptian hieroglyphs', tag: 'egy-Egyp', words: ['𓀀𓁐', '𓂀𓃀', '𓄿𓅓', '𓆑𓇋', '𓈖𓉐', '𓊃𓋴', '𓌳𓍿', '𓎛𓏏', '𓐍𓀭', '𓁷𓂋', '𓃭𓄡', '𓅱𓆓'], stop: '.', comma: ',', join: ' ', perLine: 40, code: 'egy' };
  for (const [code, L] of [['ar', LANGS.ar], ['ja', LANGS.ja], ['bo', LANGS.bo], ['egy', egyp], ['grc', LANGS.grc]]) {
    // Greek with fifteen witnesses: notes enough that a font arriving after the layout pushed the text into them
    await buildInPage(page, L, code === 'grc' ? make(code, 15, 2, 26) : LANGS[code] ? make(code, 3, 1, 20, 5) : require('./languages').makeFrom(L, 3, 1, 20, 5), code === 'grc' ? 26 : 20);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const fonts = await ME.PrintHTML.fonts(ed, built, list);
      const t0 = performance.now();
      const c = await ME.Capture.pdf(ed, list, built, { keep: true });
      // the page laid itself out with its fonts in: now that they surely are, the text still clears the notes
      const fr = document.querySelector('iframe[aria-hidden]');
      const clear = [...fr.contentDocument.querySelectorAll('.page')].every((p) => { const b = p.querySelector('.body').getBoundingClientRect(), f = p.querySelector('.foot'); return !f.childElementCount || b.bottom <= f.getBoundingClientRect().top + 0.5; });
      fr.remove();
      const buf = new Uint8Array(await c.blob.arrayBuffer());
      const size = buf.length; // (pdf.js may take the bytes over to its worker)
      await ME.PdfView.ensureWorker();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      return { fonts: fonts.map((f) => f.name + ':' + Math.round(f.data.length * 0.75 / 1024) + 'KB'), pictures: c.words.pictures, text: c.words.text, clear, kb: Math.round(size / 1024), pages: doc.numPages, ms: Math.round(performance.now() - t0) };
    });
    T.check(L.name + ': the page carries its Noto font, cut down, the text clears the notes, and the PDF is all text (' + r.text + ' words, ' + r.kb + ' KB, ' + r.ms + ' ms)', r.fonts.some((f) => /^Noto/.test(f)) && r.clear && r.pictures === 0 && r.text > 50 && r.pages >= 1 && r.kb < 1500, r);
  }
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
