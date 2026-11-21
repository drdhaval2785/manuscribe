// Proofreading levels: set in Settings › Transcription, given to a folio side in the status bar (or the side marked as
// text from OCR, not yet read), shown by the Folio tab's bars, and said by every export: the TEI (<pb level="#proof2"/>,
// level="#ocr", the states in the header), the HTML page, the Markdown, the conspectus of an edition in its formats. A
// file imported with folio sides that say nothing asks what state to give them.
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

    // the status bar: a selector of the state (not stated, OCR, each level), changed without leaving the typing area,
    // showing each folio side's own; the folio list says it; the Folio tab has no selector
    const bar = await page.evaluate(async () => {
      const { App, Model } = ME;
      const sel = document.getElementById('sel-proof');
      const inBar = document.getElementById('statusbar').contains(sel) && getComputedStyle(sel).display !== 'none';
      const options = [...sel.options].map((o) => o.value + '=' + o.textContent);
      sel.value = 'proof2'; sel.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 100));
      const L = window.__labels;
      const first = { level: App.project.pages[L[0]].level, kept: sel.value, set: sel.classList.contains('set'), title: sel.title, listed: document.querySelector('#sel-folio option').textContent };
      // the second folio side: text from OCR, not yet read; the third says nothing
      Model.setLevel(App.project, L[1], 'ocr');
      await App.go(1, { noFocus: true });
      await new Promise((r) => setTimeout(r, 100));
      const second = sel.value;
      await App.go(2, { noFocus: true });
      await new Promise((r) => setTimeout(r, 100));
      const third = sel.value === '' && !sel.classList.contains('set');
      App.project.ui.sidebarTab = 'folio'; App.toggleSidebar(true); App.refreshSidebar();
      await new Promise((r) => setTimeout(r, 100));
      return { inBar, options, first, second, third, listed: [...document.querySelectorAll('#sel-folio option')].map((o) => o.textContent.replace(/^.*·  (?=PDF)/, '')), folioTab: document.querySelector('#tab-folio select.proof-level') === null };
    });
    T.check('the status bar has a selector of the state (Not stated, OCR, then each level), set without leaving the typing area and showing each folio side\u2019s own; the folio list says the state; the Folio tab has none', bar.inBar && bar.options.length === 5 && bar.options[0] === '=Not stated' && bar.options[1] === 'ocr=OCR: recognised, not yet read' && bar.options[3] === 'proof2=Level 2: Punctuation and numbers' && bar.first.level === 'proof2' && bar.first.kept === 'proof2' && bar.first.set && /^Proofread to level 2 of 3/.test(bar.first.title) && /·  proof 2$/.test(bar.first.listed) && bar.second === 'ocr' && bar.third && /·  OCR$/.test(bar.listed[1]) && !/·  (proof|OCR)/.test(bar.listed[2]) && bar.folioTab, bar);


    // the Folio tab's progress: a bar of the lines with text, and one of the proofreading, a cell for each level filled as
    // far as the folio side has got, following the status bar's selector
    const tab = await page.evaluate(async () => {
      const { App } = ME;
      const tick = (ms) => new Promise((r) => setTimeout(r, ms));
      const read = () => {
        const host = document.getElementById('tab-folio');
        const steps = host.querySelector('.progress.steps');
        return { caps: [...host.querySelectorAll('.bar-cap')].map((c) => [...c.children].map((x) => x.textContent).join('=')), cells: steps ? steps.children.length : -1, done: steps ? steps.querySelectorAll('i.done').length : -1, ocr: !!steps && steps.classList.contains('ocr'),
          lines: host.querySelector('.progress:not(.steps) i').style.width, titles: steps ? [...steps.children].map((x) => x.title) : [], help: host.querySelector('.progress.steps + .help').textContent };
      };
      const third = read(); // 2r: not stated
      await App.go(1, { noFocus: true }); await tick(100);
      const second = read(); // 1v: text from OCR
      await App.go(0, { noFocus: true }); await tick(100);
      const first = read(); // 1r: level 2 of 3
      const sel = document.getElementById('sel-proof');
      sel.value = 'proof3'; sel.dispatchEvent(new Event('change')); await tick(100);
      const raised = read();
      sel.value = 'proof2'; sel.dispatchEvent(new Event('change')); await tick(100);
      return { third, second, first, raised };
    });
    T.check('the Folio tab’s progress: a bar of the lines with text and one of the proofreading, a cell for each level filled as far as the folio side has got (none when not stated, hatched for OCR), following the status bar’s selector', tab.first.caps[0] === 'Lines with text=100%' && tab.first.lines === '100%' && tab.first.caps[1] === 'Proofreading=level 2 of 3' && tab.first.cells === 3 && tab.first.done === 2 && tab.first.titles[1] === 'Level 2: Punctuation and numbers' && /^Proofread to level 2 of 3 \(Punctuation and numbers\)\. Set it in the status bar/.test(tab.first.help) && tab.second.caps[1] === 'Proofreading=OCR' && tab.second.done === 0 && tab.second.ocr && tab.third.caps[1] === 'Proofreading=not stated' && tab.third.done === 0 && !tab.third.ocr && /^How far the text has got is not stated\./.test(tab.third.help) && tab.raised.done === 3 && tab.raised.caps[1] === 'Proofreading=level 3 of 3', tab);

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


    // an imported file: the folio sides it says nothing about are given one state, chosen on import (the lowest, text from
    // OCR, unless another is chosen); those it does say keep their own; a file that says it for every side asks nothing
    const imp = await page.evaluate(async () => {
      const { App, Export, Importer } = ME;
      const L = window.__labels;
      const tick = (ms) => new Promise((r) => setTimeout(r, ms));
      const wait = async (f) => { for (let i = 0; i < 200 && !f(); i++) await tick(25); return f(); };
      const states = () => L.map((l) => App.project.pages[l].level || null);
      const button = (t) => [...document.querySelectorAll('.modal .modal-foot button')].find((b) => b.textContent === t);
      const run = async (xml, choose) => {
        const done = App.importXml(new File([xml], 'in.xml', { type: 'text/xml' }));
        const found = await wait(() => document.querySelector('.modal select[data-n="level"]') || button('Replace'));
        if (found && found.tagName === 'BUTTON') { found.click(); await wait(() => document.querySelector('.modal select[data-n="level"]')); }
        const sel = document.querySelector('.modal select[data-n="level"]');
        if (!sel) { await done; return { asked: false, states: states() }; }
        const dlg = { asked: true, title: document.querySelector('.modal h2').textContent, text: document.querySelector('.modal .confirm-text').textContent, options: [...sel.options].map((o) => o.value + '=' + o.textContent), def: sel.value };
        if (choose !== undefined) sel.value = choose;
        button('Import').click();
        await done;
        return Object.assign(dlg, { states: states() });
      };
      // 1r says level 2; 1v and 2r say nothing
      const xml = Export.build(App.project, {}).xml.replace(' level="#ocr"', '');
      const unmarked = Importer.unmarked(Importer.parse(xml, {}), '1r');
      const a = await run(xml); // as given: the lowest, OCR
      const b = await run(xml, 'proof1'); // level 1 chosen
      // every side says it: nothing asked
      const d = App.importXml(new File([Export.build(App.project, {}).xml], 'full.xml', { type: 'text/xml' }));
      await tick(400);
      if (button('Replace')) { button('Replace').click(); await tick(400); }
      const full = { asked: !!document.querySelector('.modal select[data-n="level"]') };
      await d;
      full.states = states();
      const c = await run(xml, ''); // not stated
      return { unmarked, a, b, full, c };
    });
    T.check('a file that says nothing about some folio sides asks, on import, what state to give them, the lowest (text from OCR) unless another is chosen; the sides it does say keep their own; a file that says it for every side asks nothing', JSON.stringify(imp.unmarked) === '["1v","2r"]' && imp.a.asked && imp.a.title === 'How far has this transcription got?' && imp.a.text === '2 of the 3 folio sides in in.xml do not say how far their text has got. The other one keeps its own state.' && imp.a.options.length === 5 && imp.a.options[1] === 'ocr=OCR: recognised, not yet read' && imp.a.options[2] === 'proof1=Level 1: Letters' && imp.a.def === 'ocr' && JSON.stringify(imp.a.states) === '["proof2","ocr","ocr"]' && JSON.stringify(imp.b.states) === '["proof2","proof1","proof1"]' && !imp.full.asked && JSON.stringify(imp.full.states) === '["proof2","proof1","proof1"]' && JSON.stringify(imp.c.states) === '["proof2",null,null]', imp);

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
