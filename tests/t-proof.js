// Proofreading levels: set in Settings › Transcription, given to a folio side in the Folio tab, and said by every
// export: the TEI (<pb change="#proofN" resp="#ocr"/>, the levels in the header), the HTML page, the Markdown, the
// conspectus of an edition in its formats.
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

    // the Folio tab: a selector of the level, and the OCR tick box; the folio list says the level
    const folio = await page.evaluate(async () => {
      const { App } = ME;
      App.project.ui.sidebarTab = 'folio'; App.toggleSidebar(true); App.refreshSidebar();
      await new Promise((r) => setTimeout(r, 100));
      const sel = document.querySelector('#tab-folio select.proof-level');
      const options = sel ? [...sel.options].map((o) => o.textContent) : null;
      sel.value = '2'; sel.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 100));
      const cb = document.querySelector('#tab-folio .proof-src input');
      cb.click();
      await new Promise((r) => setTimeout(r, 100));
      const l = window.__labels[0], pg = App.project.pages[l];
      const sel2 = document.querySelector('#tab-folio select.proof-level');
      return { options, proof: pg.proof, resp: pg.resp, kept: sel2 && sel2.value, listed: document.querySelector('#sel-folio option').textContent };
    });
    T.check('the Folio tab has a selector of the level (Not proofread, then each level) and a tick box for text from OCR; the folio list says the level', folio.options && folio.options.length === 4 && folio.options[0] === 'Not proofread' && folio.options[2] === 'Level 2: Punctuation and numbers' && folio.proof === 2 && folio.resp === '#ocr' && folio.kept === '2' && /·  proof 2$/.test(folio.listed), folio);

    // the TEI: the attributes on <pb/>, the levels in the header, a respStmt for the OCR; nothing of it on the other folios
    const tei = await page.evaluate(() => {
      const { App, Export, Model, Importer } = ME;
      Model.setProof(App.project, window.__labels[1], 1);
      const xml = Export.build(App.project, {}).xml;
      // back into a project made for the file: the levels, each folio side's level and provenance, and the same body again
      const f = Model.upgrade(Model.newProject({ meta: { title: 'in' }, layoutType: 'linear', lines: { main: 2 }, folios: {} }));
      f.pdf = { name: 'x', pages: 3 };
      Importer.apply(f, Importer.parse(xml, {}), '1r', { fresh: true });
      const again = Export.build(f, {}).xml;
      const body = (x) => x.split('<body>')[1];
      const L = window.__labels;
      return { xml: xml.split('<body>')[0].slice(-900) + body(xml).slice(0, 400), pb: [...xml.matchAll(/<pb [^>]*>/g)].map((m) => m[0]), levels: f.settings.proofLevels, proofs: L.map((l) => f.pages[l] && f.pages[l].proof), resps: L.map((l) => f.pages[l] && f.pages[l].resp), same: body(xml) === body(again),
        header: /<listChange ordered="true">\s*<change xml:id="proof1" n="1" type="proofreading">Letters<\/change>\s*<change xml:id="proof2"[^>]*>Punctuation and numbers<\/change>\s*<change xml:id="proof3"[^>]*>Markup<\/change>\s*<\/listChange>/.test(xml), resp: /<respStmt xml:id="ocr">\s*<resp>Text recognised by<\/resp>\s*<name>OCR<\/name>\s*<\/respStmt>/.test(xml) };
    });
    T.check('the TEI has <pb n resp="#ocr" change="#proof2"/> for the folio side, change="#proof1" for the next, a plain <pb/> for the third, the levels as <listChange> in the header, and a respStmt for the OCR', tei.pb.length === 3 && tei.pb[0] === '<pb n="1r" resp="#ocr" change="#proof2"/>' && tei.pb[1] === '<pb n="1v" change="#proof1"/>' && tei.pb[2] === '<pb n="2r"/>' && tei.header && tei.resp, { pb: tei.pb, header: tei.header, resp: tei.resp, xml: tei.xml });
    T.check('read back into a project made for the file: the levels, each folio side’s level and provenance, and the same body again', JSON.stringify(tei.levels) === JSON.stringify(['Letters', 'Punctuation and numbers', 'Markup']) && JSON.stringify(tei.proofs) === '[2,1,null]' && JSON.stringify(tei.resps) === '["#ocr",null,null]' && tei.same, { levels: tei.levels, proofs: tei.proofs, resps: tei.resps, same: tei.same });

    // the HTML page and the Markdown of the transcription
    const pages = await page.evaluate(async () => {
      const { App, Export, Markdown } = ME;
      const html = (await Export.html(App.project, {})).html;
      const md = Markdown.transcription(App.project);
      return { badges: [...html.matchAll(/<h2>Folio [^<]*((?:<span class="proof[^"]*"[^>]*>[^<]*<\/span>\s*)*)<\/h2>/g)].map((m) => [...m[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((x) => x[1]).join('|')), legend: /<p class="legend">Proofreading levels: 1\. Letters; 2\. Punctuation and numbers; 3\. Markup\.<\/p>/.test(html), title: /title="Proofread to level 2 of 3: Punctuation and numbers"/.test(html), md: md.split('\n').filter((l) => /Proofread|Proofreading|OCR/.test(l)) };
    });
    T.check('the HTML page: a badge of the level and one for OCR beside the folio heading, with the levels explained once at the top', pages.badges.length === 3 && pages.badges[0] === 'proofread · level 2|OCR' && pages.badges[1] === 'proofread · level 1' && pages.badges[2] === '' && pages.legend && pages.title, pages);
    T.check('the Markdown: the levels and the state of the whole, and a line under each folio side read', pages.md.length === 3 && /^Proofreading levels: 1\. Letters; 2\. Punctuation and numbers; 3\. Markup\. The transcription is proofread to level 2 of 3 \(Punctuation and numbers\) on 1 of 3 folio sides, level 1 on 1 folio side; 1 folio side not yet\.$/.test(pages.md[0]) && pages.md[1] === '*Proofread to level 2 of 3 (Punctuation and numbers) · Text from OCR*' && pages.md[2] === '*Proofread to level 1 of 3 (Letters)*', pages.md);

    // an edition: the conspectus says, witness by witness, how far the transcription is proofread
    await buildInPage(page, LANGS.sa, make('sa', 2, 2, 4, 3), 4);
    const ed = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      const { Store, Collate, Publish, Model } = ME;
      const [A, B] = list.map((x) => x.p);
      for (const l of Object.keys(A.pages)) A.pages[l].proof = 2;
      B.pages[Object.keys(B.pages)[0]].proof = 1;
      await Store.putProject(A); await Store.putProject(B);
      await Collate.run(ed, list, 'main', {});
      const { built } = (await ME.Release.works(ed, list))[0];
      const rows = Publish.conspectus(ed, list).map((r) => r.proofing);
      const print = ME.PrintHTML.html(ed, list, built, {});
      const reader = await Publish.reader(ed, list, built, await ME.LayersView.baseTexts(ed, 'main'));
      const sides = (p) => Object.values(p.pages).filter((pg) => Model.pageHasContent(pg)).length;
      const nA = sides(A), nB = sides(B);
      const wantA = 'proofread to level 2 of 4 (Second reading: punctuation, numbers, line and folio breaks) on all ' + nA + ' folio sides';
      const wantB = 'proofread to level 1 of 4 (First reading: the letters against the scan) on 1 of ' + nB + ' folio sides; ' + (nB - 1) + (nB - 1 === 1 ? ' folio side' : ' folio sides') + ' not yet';
      return { rows, wantA, wantB, print: print.includes(wantA), reader: reader.includes('<small>' + wantB + '</small>'), none: Model.proofSentence(Model.newProject({})) };
    });
    T.check('an edition\u2019s conspectus says how far each witness is proofread, in the print page and the reader; nothing when no folio side is', ed.rows.length === 2 && ed.rows[0] === ed.wantA && ed.rows[1] === ed.wantB && ed.print && ed.reader && ed.none === '', ed);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
