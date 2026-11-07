// Any language: editions in Arabic (right to left), Japanese (no spaces), English and Sanskrit go through the whole of
// Manuscribe, from witnesses to the print edition. Letters are compared as written; the print page lays itself out
// in the browser, with every note on the page of its marker; and the browser's own PDF of it can be searched.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, WORK, OTHER, fileUrl } = require('./h');

const TEXTS = {
  ar: { check: 'قال', lang: 'ar', words: 'بسم الله الرحمن الرحيم الحمد لله رب العالمين قال الشيخ رحمه الله تعالى هذا كتاب في علم النحو والصرف وما يتعلق بهما من المسائل والفوائد'.split(' '), vary: (w) => w + 'ا' },
  ja: { check: '女御更衣', lang: 'ja', words: 'いづれの 御時にか 女御更衣 あまた さぶらひ たまひける なかに いと やむごとなき 際には あらぬが すぐれて 時めき たまふ ありけり'.split(' '), vary: (w) => w.slice(0, -1) + 'を', join: '' },
  en: { check: 'Aprille', lang: 'en', words: 'Whan that Aprille with his shoures soote The droghte of March hath perced to the roote And bathed every veyne in swich licour Of which vertu engendred is the flour'.split(' '), vary: (w) => w + 'e' },
  // Chrome's PDF writer maps a conjunct glyph to no letters, so only a word without one is searched for here
  sa: { check: 'मामकाः', lang: 'sa-Deva', words: 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय'.split(' '), vary: (w) => w + 'म्', profile: 'sa-classical' },
};

(async () => {
  const T = checks('Any language, and the print edition');
  const { browser, page } = await launch('print');
  // letters as written
  const norm = await page.evaluate(() => {
    const N = ME.Norm;
    const any = new Set(N.settings({ profile: 'any' }).on);
    const t = (s, r) => N.apply(s, { rules: r || any }).text.normalize('NFC');
    return {
      en: t('The quick, brown fox!'), ar: t('كِتَابُ اللهِ، وَ'), ja: t('源氏物語、桐壺。'),
      fold: t('Ἐν ἀρχῇ', new Set([...any, 'u-case', 'u-marks'])), sa: N.apply('धर्मक्षेत्रे', { rules: new Set(N.settings().on) }).text,
      suggest: [N.suggestProfile('Arabic'), N.suggestProfile('Japanese'), N.suggestProfile('Sanskrit')],
    };
  });
  T.check('letters as written: English keeps its th, and punctuation of any script goes', norm.en === 'Thequickbrownfox' && norm.ar === 'كِتَابُاللهِوَ' && norm.ja === '源氏物語桐壺', norm);
  T.check('capitals and marks are folded only if asked', norm.fold === 'εναρχη', norm.fold);
  T.check('Sanskrit is as before, and other languages are offered the profile for any language', norm.sa === 'Darmakṣetre' && norm.suggest.join() === 'any,any,sa-classical', norm);

  const dir = path.join(WORK, 'print');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const [key, spec] of Object.entries(TEXTS)) {
    const made = await page.evaluate(async (key, spec) => {
      const { Model, Store, Edition, Collate } = ME;
      let seed = 11; const rnd = (n) => (seed = (seed * 16807) % 2147483647) % n;
      const vary = new Function('w', 'return (' + spec.vary + ')(w)');
      const texts = { A: [], B: [], C: [] };
      for (let k = 1; k <= 14; k++) {
        const base = Array.from({ length: 70 + rnd(50) }, () => spec.words[rnd(spec.words.length)]);
        for (const s of Object.keys(texts)) {
          const w = base.map((x) => (rnd(8) === 0 ? vary(x) : x));
          texts[s].push('<x-marker type="p-start" id="p' + k + '"/>' + w.join(spec.join === undefined ? ' ' : spec.join) + '<x-marker type="p-end"/>');
        }
      }
      const ed = Edition.create(key + ' edition');
      ed.editor = 'Editor';
      ed.norm = { profile: spec.profile || 'any' };
      const list = [];
      for (const [s, lines] of Object.entries(texts)) {
        const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: spec.lang, repository: 'Library', shelfmark: s }, layoutType: 'linear', lines: { main: 20 }, folios: {} }));
        p.pdf = { name: s + '.pdf', pages: 1 };
        p.pages = { '1r': { boxes: { main: lines } } };
        await Store.putProject(p);
        const w = { siglum: s, projectId: p.id, streams: {} };
        ed.witnesses.push(w); list.push({ w, p });
      }
      ed.trust = ['A', 'B', 'C'];
      await Store.putEdition(ed);
      await Collate.run(ed, list, 'main', {});
      const works = await ME.Release.works(ed, list);
      const built = works[0].built;
      const entries = built.reduce((a, b) => a + b.entries.length, 0);
      const html = ME.PrintHTML.html(ed, list, built, { fonts: await ME.PrintHTML.fonts(ed, built, list) });
      window['ed_' + key] = { ed, list, built };
      return { html, entries, blocks: built.length, sample: built[0].text.slice(0, 60) };
    }, key, { ...spec, vary: spec.vary.toString() });
    T.check(key + ': collated letter by letter, with variants found', made.entries > 20 && made.blocks === 14, { entries: made.entries, sample: made.sample });
    const file = path.join(dir, key + '.html');
    fs.writeFileSync(file, made.html);
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1100, height: 900 });
    await p2.goto(fileUrl(file));
    for (let k = 0; k < 80 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(150);
    const r = await p2.evaluate(() => {
      const R = window.__paginated;
      const dir = getComputedStyle(document.querySelector('.txt')).direction;
      const strays = R.pagesInfo.flatMap((pg, i) => [...pg.inText.filter((k) => !pg.inFoot.includes(k)).map((k) => 'text ' + i + ' ' + k), ...pg.inFoot.filter((k) => !pg.inText.includes(k)).map((k) => 'foot ' + i + ' ' + k)]);
      const markers = R.pagesInfo.reduce((a, pg) => a + pg.inText.length, 0);
      return { pages: R.pages, overfull: R.overfull, strays, markers, clear: R.pagesInfo.every((pg) => pg.clear && pg.within), dir, lines: document.querySelectorAll('.ln').length };
    });
    T.check(key + ': laid out as ' + r.pages + ' pages, every note on the page of its marker', r.pages >= 3 && !r.strays.length && r.markers > 20 && r.overfull === 0, r);
    T.check(key + ': no text runs into its notes or off the page; lines numbered', r.clear && r.lines > 3, r);
    if (key === 'ar') T.check('Arabic is set right to left', r.dir === 'rtl', r.dir);
    // the browser's PDF of it, as Save as PDF makes it (only Chrome can be asked for one)
    if (OTHER) { await p2.close(); T.skip(key + ': the browser’s PDF can be searched', 'only Chrome makes a PDF when asked'); continue; }
    const pdf = await p2.pdf({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(path.join(dir, key + '.pdf'), pdf);
    await p2.close();
    const got = await page.evaluate(async (b64, word) => {
      const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await ME.PdfView.ensureWorker();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join('');
      // a ligature such as Allah may come out as its presentation form, which NFKC makes letters again
      return { pages: doc.numPages, has: text.normalize('NFKC').replace(/\s+/g, '').includes(word.normalize('NFKC')), sample: text.slice(0, 160) };
    }, Buffer.from(pdf).toString('base64'), spec.check);
    T.check(key + ': the browser’s PDF has every page, and its text can be searched', got.pages === r.pages && got.has, got);
  }

  // the direct PDF has markers too, each with its note on its page
  const direct = await page.evaluate(async () => {
    const { ed, list, built } = window.ed_sa;
    const r = await ME.Typeset.pdf(ed, list, built);
    const strays = r.layout.flatMap((pg) => pg.markers.filter((k) => !pg.noted.includes(k)).concat(pg.noted.filter((k) => !pg.markers.includes(k))));
    return { pages: r.pages, markers: r.layout.reduce((a, pg) => a + pg.markers.length, 0), strays };
  });
  T.check('the direct PDF marks each variant in the text, its note on the same page', direct.markers > 20 && !direct.strays.length, direct);
  // keyed by line instead
  const lines = await page.evaluate(() => {
    const { ed, list, built } = window.ed_en;
    ed.apparatus = Object.assign({}, ed.apparatus, { keys: 'lines' });
    const d = ME.PrintHTML.data(ed, list, built);
    return { byMarkers: d.byMarkers, sups: (d.blocks[0].html.match(/<sup>/g) || []).length, anchors: (d.blocks[0].html.match(/class="an"/g) || []).length };
  });
  T.check('notes can be keyed by line numbers instead, with no markers in the text', !lines.byMarkers && lines.sups === 0 && lines.anchors > 0, lines);
  // lines counted down each page, or through the text; a note keyed by line cites the number in the margin
  const layOut = async (lines) => {
    const html = await page.evaluate((lines) => { const { ed, list, built } = window.ed_en; ed.print = Object.assign({}, ed.print, { lines, every: 1 }); return ME.PrintHTML.html(ed, list, built); }, lines);
    const p3 = await browser.newPage();
    await p3.setContent(html, { waitUntil: 'load' });
    for (let k = 0; k < 80 && !(await p3.evaluate(() => !!window.__paginated)); k++) await sleep(150);
    const r = await p3.evaluate(() => [...document.querySelectorAll('.page')].filter((p) => p.querySelector('.rh') && p.querySelector('.txt')).map((p) => ({ ln: [...p.querySelectorAll('.ln')].map((x) => +x.textContent), nk: [...p.querySelectorAll('.foot .nk')].map((x) => +x.textContent) })));
    await p3.close();
    return r;
  };
  // notes numbered from 1 on each page, the markers with them, linked both ways, and no block IDs
  const numbered = await (async () => {
    const html = await page.evaluate(() => { const { ed, list, built } = window.ed_sa; return ME.PrintHTML.html(ed, list, built); });
    const p3 = await browser.newPage();
    await p3.setContent(html, { waitUntil: 'load' });
    for (let k = 0; k < 80 && !(await p3.evaluate(() => !!window.__paginated)); k++) await sleep(150);
    const r = await p3.evaluate(() => {
      const pages = [...document.querySelectorAll('.page')].filter((p) => p.querySelector('.foot .note'));
      return { pages: pages.length, ids: document.querySelectorAll('.body .bid').length, each: pages.map((p) => {
        const nk = [...new Set([...p.querySelectorAll('.foot a.nk')].map((x) => +x.textContent))].sort((a, b) => a - b);
        const sup = [...p.querySelectorAll('.body .an sup a')].map((x) => +x.textContent);
        const linked = [...p.querySelectorAll('.body .an sup a')].every((x) => { const t = document.getElementById(x.getAttribute('href').slice(1)); return t && t.closest('.page') === p && +t.textContent === +x.textContent; })
          && [...p.querySelectorAll('.foot a.nk')].every((x) => { const t = document.getElementById(x.getAttribute('href').slice(1)); return t && t.closest('.page') === p; });
        return { nk, sup, linked };
      }) };
    });
    await p3.close();
    return r;
  })();
  T.check('notes are numbered from 1 on each page, the markers with them, and no block IDs are printed', numbered.pages >= 2 && numbered.ids === 0 && numbered.each.every((p) => p.nk[0] === 1 && p.nk.every((n, i) => n === i + 1) && p.sup.join() === p.nk.join()), numbered.each.map((p) => p.sup.slice(0, 4).join(',') + '…' + p.nk.length));
  T.check('each marker links to its note and each note back to its marker, on the same page', numbered.each.every((p) => p.linked));
  const pdfLinks = await page.evaluate(async () => {
    const { ed, list, built } = window.ed_sa;
    const r = await ME.Typeset.pdf(ed, list, built);
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    await ME.PdfView.ensureWorker();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let links = 0, dests = 0;
    for (let i = 1; i <= doc.numPages; i++) for (const a of await (await doc.getPage(i)).getAnnotations()) if (a.subtype === 'Link') { links++; if (a.dest) dests++; }
    const firstNumbers = r.layout.map((pg) => pg.noted.map((k) => +k.split('#')[1]));
    return { links, dests, firstNumbers };
  });
  T.check('the direct PDF numbers its notes from 1 on each page too, and links markers and notes both ways', pdfLinks.links > 40 && pdfLinks.dests === pdfLinks.links && pdfLinks.firstNumbers.filter((x) => x.length).every((x) => x[0] === 1), pdfLinks);
  const perPage = await layOut('page');
  T.check('lines are numbered down each page, from 1 on every page, without regard to blocks', perPage.length >= 2 && perPage.every((p) => p.ln[0] === 1 && p.ln.every((n, i) => n === i + 1)), perPage.map((p) => p.ln.slice(0, 3).join(',') + '…' + p.ln.length));
  T.check('and each note cites a line of its own page', perPage.every((p) => p.nk.every((n) => n >= 1 && n <= p.ln.length)) && perPage.some((p) => p.nk.length), perPage.map((p) => p.nk.slice(0, 5)));
  const through = await layOut('text');
  T.check('or through the whole text, page after page', through.length >= 2 && through.every((p, i) => i === 0 || p.ln[0] === through[i - 1].ln[through[i - 1].ln.length - 1] + 1), through.map((p) => p.ln[0] + '–' + p.ln[p.ln.length - 1]));
  await page.evaluate(() => { const { ed } = window.ed_en; ed.print = Object.assign({}, ed.print, { lines: 'page', every: 5 }); ed.apparatus = Object.assign({}, ed.apparatus, { keys: 'markers' }); });
  // the buttons and settings on the apparatus screen
  await page.evaluate(() => { const { ed, list } = window.ed_ar; ME.CollateView.workApparatus(ed, list, 'main'); });
  await sleep(900);
  // the print settings and the keying of notes are in the Publish step
  const ui = await page.evaluate(async () => { const { ed, list } = window.ed_ar; const el = await ME.Steps.publish(ed, list, () => {}); return { keys: !![...el.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'lines')), settings: /Paper and fonts for printing/.test(el.textContent) }; });
  await page.evaluate(() => document.querySelector('.modal [data-action="export"]').click());
  await sleep(400);
  ui.formats = await page.evaluate(() => [...document.querySelectorAll('.modal input[name="xp-format"]')].map((r) => r.value));
  ui.route = await page.evaluate(() => { const s = document.querySelector('.modal [data-action="pdf-route"]'); return s ? { value: s.value, options: [...s.options].map((o) => o.value) } : null; });
  // for Arabic, the PDF in Manuscribe's Devanagari font is not offered: it belongs to the South Asian pack
  T.check('the Export of an Arabic edition offers one PDF, saved at once or through the print dialog, its page and LaTeX; the Publish step has the print settings', ['pdf', 'print-page', 'latex'].every((f) => ui.formats.includes(f)) && !ui.formats.includes('pdf-direct') && !ui.formats.includes('pdf-any') && ui.route && ui.route.value === 'direct' && ui.route.options.join() === 'direct,print' && ui.keys && ui.settings, ui);
  for (let k = 0; k < 2; k++) { await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); }); await sleep(200); }
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
