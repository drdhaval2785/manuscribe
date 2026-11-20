// Proofreading levels: set in Settings › Transcription, given to a folio side in the Folio tab (or the side marked as
// text from OCR, not yet read), and said by every export: the TEI (<pb level="#proof2"/>, level="#ocr", the states in
// the header), the HTML page, the Markdown, the conspectus of an edition in its formats.
const { launch, checks, sleep } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');
(async () => {
  const { browser, page } = await launch('proof');
  const T = checks('Proofreading levels');
  try {
    // a transcription of three folio sides, opened
    await page.evaluate(async () => {
      const { Model, Store, App } = ME;
      const p = Model.upgrade(Model.newProject({ meta: { title: 'Proof', siglum: 'P', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 2 }, folios: {} }));
      p.pdf = { name: 'x.pdf', pages: 3 };
      const labels = Model.entries(p).map((e) => e.label);
      p.pages = {};
      labels.forEach((l, i) => { p.pages[l] = { boxes: { main: ['<x-marker type="p-start" id="p' + (i + 1) + '"/>पहिला वाक्य ', 'दूसरी पंक्ति<x-marker type="p-end"/>'] } }; });
      await Store.putProject(p);
      window.__labels = labels;
      await App.open(p.id);
    });
    await sleep(500);

    // Settings: the levels, four to begin with; three of one's own
    const settings = await page.evaluate(async () => {
      const done = ME.App.showSettings();
      for (let k = 0; k < 40 && !document.querySelector('.modal textarea[data-n="proofLevels"]'); k++) await new Promise((r) => setTimeout(r, 50));
      const ta = document.querySelector('.modal textarea[data-n="proofLevels"]');
      const before = ta ? ta.value.split('\n') : null;
      if (ta) ta.value = 'Letters\nPunctuation and numbers\nMarkup';
      const apply = [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent === 'Apply') || document.querySelector('.modal-foot .btn');
      apply.click();
      await done;
      return { before, after: ME.App.project.settings.proofLevels };
    });
    T.check('Settings › Transcription lists the levels of proofreading, four to begin with, and takes one’s own, a line each', settings.before && settings.before.length === 4 && /^First reading/.test(settings.before[0]) && JSON.stringify(settings.after) === JSON.stringify(['Letters', 'Punctuation and numbers', 'Markup']), settings);

    // the Folio tab: a selector of the state (not stated, OCR, each level); the folio list says it
    const folio = await page.evaluate(async () => {
      const { App, Model } = ME;
      App.project.ui.sidebarTab = 'folio'; App.toggleSidebar(true); App.refreshSidebar();
      await new Promise((r) => setTimeout(r, 100));
      const sel = document.querySelector('#tab-folio select.proof-level');
      const options = sel ? [...sel.options].map((o) => o.value + '=' + o.textContent) : null;
      sel.value = 'proof2'; sel.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 100));
      const L = window.__labels;
      const sel2 = document.querySelector('#tab-folio select.proof-level');
      const first = { level: App.project.pages[L[0]].level, kept: sel2 && sel2.value, listed: document.querySelector('#sel-folio option').textContent };
      // the second folio side: text from OCR, not yet read; the third says nothing
      Model.setLevel(App.project, L[1], 'ocr');
      await App.go(1, { noFocus: true });
      await new Promise((r) => setTimeout(r, 100));
      const sel3 = document.querySelector('#tab-folio select.proof-level');
      return { options, first, second: sel3 && sel3.value, listed2: document.queruerySelectorAll ? null : [...document.querySelectorAll('#sel-folio option')].map((o) => o.textContent.replace(/^.*·  (?=PDF)/, '')), nothing: document.querySelector('#tab-folio .proof-src') === null };
    });
    T.check('the Folio tab has a selector of the state (Not stated, OCR, then each level), no tick box; the folio list says the state', folio.options && folio.options.length === 5 && folio.options[0] === '=Not stated' && folio.options[1] === 'ocr=OCR: recognised by a program, not yet read' && folio.options[3] === 'proof2=Level 2: Punctuation and numbers' && folio.first.level === 'proof2' && folio.first.kept === 'proof2' && /·  proof 2$/.test(folio.first.listed) && folio.second === 'ocr' && /·  OCR$/.test(folio.listed2[1]) && !/·  (proof|OCR)/.test(folio.listed2[2]) && folio.nothing, folio);

    // the TEI: level="#proof2", level="#ocr", a plain <pb/>; the states in the header; no respStmt
    const tei = await page.evaluate(() => {
      const { App, Export, Model, Importer } = ME;
      const xml = Export.build(App.project, {}).xml;
      // back into a project made for the file: the levels, each folio side's state, and the same body again
      const f = Model.upgrade(Model.newProject({ meta: { title: 'in' }, layoutType: 'linear', lines: { main: 2 }, folios: {} }));
      f.pdf = { name: 'x', pages: 3 };
      Importer.apply(f, Importer.parse(xml, {}), '1r', { fresh: true });
      const again = Export.build(f, {}).xml;
      const body = (x) => x.split('<body>')[1];
      const L = window.__labels;
      // older files: resp="#ocr", change or ana="#proof2"
      const old = Importer.parse(xml.replace('level="#proof2"', 'change="#proof2"').replace('level="#ocr"', 'resp="#ocr"'), {});
      return { pb: [...xml.matchAll(/<pb [^>]*>/g)].map((m) => m[0]), levels: f.settings.proofLevels, states: L.map((l) => f.pages[l] && f.pages[l].level), same: body(xml) === body(again),
        header: /<listChange ordered="true">\s*<change xml:id="ocr" n="0" type="proofreading">Text recognised by a program \(OCR\), not yet proofread<\/change>\s*<change xml:id="proof1" n="1" type="proofreading">Letters<\/change>\s*<change xml:id="proof2"[^>]*>Punctuation and numbers<\/change>\s*<change xml:id="proof3"[^>]*>Markup<\/change>\s*<\/listChange>/.test(xml), resp: /respStmt xml:id="ocr"/.test(xml),
        old: [old.pageAttrs[L[0]].level, old.pageAttrs[L[1]].level] };
    });
    T.check('the TEI has <pb n level="#proof2"/> for the folio side, level="#ocr" for the next, a plain <pb/> for the third, and the states as <listChange> in the header', tei.pb.length === 3 && tei.pb[0] === '<pb n="1r" level="#proof2"/>' && tei.pb[1] === '<pb n="1v" level="#ocr"/>' && tei.pb[2] === '<pb n="2r"/>' && tei.header && !tei.resp, { pb: tei.pb, header: tei.header, resp: tei.resp });
    T.check('read back into a project made for the file: the levels, each folio side’s state, and the same body again; an older file’s resp="#ocr" and change="#proof2" are read too', JSON.stringify(tei.levels) === JSON.stringify(['Letters', 'Punctuation and numbers', 'Markup']) && JSON.stringify(tei.states) === '["proof2","ocr",null]' && tei.same && JSON.stringify(tei.old) === '["proof2","ocr"]', { levels: tei.levels, states: tei.states, same: tei.same, old: tei.old });

    // the HTML page and the Markdown of the transcription
    const pages = await page.evaluate(async () => {
      const { App, Export, Markdown } = ME;
      const html = (await Export.html(App.project, {})).html;
      const md = Markdown.transcription(App.project);
      return { badges: [...html.matchAll(/<h2>Folio [^<]*((?:<span class="proof[^"]*"[^>]*>[^<]*<\/span>\s*)*)<\/h2>/g)].map((m) => [...m[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((x) => x[1]).join('|')), legend: /<p class="legend">Proofreading levels: 1\. Letters; 2\. Punctuation and numbers; 3\. Markup\.<\/p>/.test(html), titles: [/title="Proofread to level 2 of 3 \(Punctuation and numbers\)"/.test(html), /title="Text recognised by a program \(OCR\), not yet proofread"/.test(html)], md: md.split('\n').filter((l) => /Proofread|Proofreading|OCR/.test(l)) };
    });
    T.check('the HTML page: a badge of the state beside each folio heading that has one, with the levels explained once at the top', pages.badges.length === 3 && pages.badges[0] === 'proofread · level 2' && pages.badges[1] === 'OCR' && pages.badges[2] === '' && pages.legend && pages.titles.every(Boolean), pages);
    T.check('the Markdown: the levels and the state of the whole, and a line under each folio side with a state', pages.md.length === 3 && pages.md[0] === 'Proofreading levels: 1. Letters; 2. Punctuation and numbers; 3. Markup. The transcription is proofread to level 2 of 3 (Punctuation and numbers) on 1 of 3 folio sides; 2 folio sides not yet, 1 of them text from OCR.' && pages.md[1] === '*Proofread to level 2 of 3 (Punctuation and numbers)*' && pages.md[2] === '*Text recognised by a program (OCR), not yet proofread*', pages.md);

    // an edition: the conspectus says, witness by witness, how far the transcription is proofread
    await buildInPage(page, LANGS.sa, make('sa', 3, 2, 4, 3), 4);
    const ed = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      const { Store, Collate, Publish, Model } = ME;
      const [A, B, C] = list.map((x) => x.p);
      for (const l of Object.keys(A.pages)) A.pages[l].level = 'proof2';
      const bl = Object.keys(B.pages); B.pages[bl[0]].level = 'proof1'; B.pages[bl[1]].level = 'ocr';
      for (const l of Object.keys(C.pages)) C.pages[l].level = 'ocr';
      await Store.putProject(A); await Store.putProject(B); await Store.putProject(C);
      await Collate.run(ed, list, 'main', {});
      const { built } = (await ME.Release.works(ed, list))[0];
      const rows = Publish.conspectus(ed, list).map((r) => r.proofing);
      const print = ME.PrintHTML.html(ed, list, built, {});
      const reader = await Publish.reader(ed, list, built, await ME.LayersView.baseTexts(ed, 'main'));
      const sides = (p) => Object.values(p.pages).filter((pg) => Model.pageHasContent(pg)).length;
      const nA = sides(A), nB = sides(B), nC = sides(C);
      const wantA = 'proofread to level 2 of 4 (Second reading: punctuation, numbers, line and folio breaks) on all ' + nA + ' folio sides';
      const wantB = 'proofread to level 1 of 4 (First reading: the letters against the scan) on 1 of ' + nB + ' folio sides; ' + (nB - 1) + (nB - 1 === 1 ? ' folio side' : ' folio sides') + ' not yet, ' + (nB - 1 === 1 ? 'text from OCR' : '1 of them text from OCR');
      const wantC = 'text from OCR, not yet proofread, on all ' + nC + ' folio sides';
      return { rows, want: [wantA, wantB, wantC], print: print.includes(wantA) && print.includes(wantC), reader: reader.includes('<small>' + wantB + '</small>'), none: Model.proofSentence(Model.newProject({})) };
    });
    T.check('an edition’s conspectus says how far each witness is proofread, or that it is from OCR and not yet read, in the print page and the reader; nothing when no state is given', JSON.stringify(ed.rows) === JSON.stringify(ed.want) && ed.print && ed.reader && ed.none === '', ed);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
