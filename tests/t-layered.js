// A layered edition: a base and commentaries on it, nested, told apart and linked by their IDs alone (b2.47,
// c2.47-1, ca2.47-1-1). The layers are found in the witnesses, named, abbreviated and ordered in a register; each is
// a work collated on its own, whatever part of the page it is written in; and the IDs are checked.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('Layers by their IDs');
  const { browser, page } = await launch('layered');
  await page.evaluate(async () => {
    const { Model, Store, Edition } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    // base and commentaries written one after the other in the same box, as in most manuscripts
    const lines = (v) => [
      P('c1-0') + 'अथ प्रथमः श्लोकः ' + END,
      P('b1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ' + END,
      P('c1-1') + 'धर्मक्षेत्र इति ' + v.c + ' व्याख्यानम् ' + END,
      P('ca1-1-1') + 'इति भाष्यस्य टीका ' + v.ca + END,
      ...(v.r ? [P('r1-1') + 'रामानुजस्य भाष्यम् ' + v.r + END] : []),
      P('b2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ' + END,
      P('c2-1') + 'मामका इति ' + v.c + END,
      P('ca2-5-1') + 'अनाथा टीका ' + END,
      P('c3') + 'अशुद्धम् ' + END,
    ];
    const texts = { A: { c: 'शङ्करस्य', ca: 'आनन्दगिरेः', r: 'प्रथमम्' }, B: { c: 'शंकरस्य', ca: 'आनन्दगिरेः', r: 'प्रथमं' }, C: { c: 'शङ्करस्य', ca: 'आनन्दगिरे' } };
    const ed = Edition.create('Gītā with commentaries');
    for (const [s, v] of Object.entries(texts)) {
      const L = lines(v);
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: L.length }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: L } } };
      await Store.putProject(p);
      ed.witnesses.push({ siglum: s, projectId: p.id, streams: {} });
    }
    ed.trust = ['A', 'B', 'C'];
    await Store.putEdition(ed);
    ME.Edition.stepOf[ed.id] = 'witnesses';
    await Edition.show(ed.id);
    window.edId = ed.id;
  });
  await sleep(500);
  const reg = await page.evaluate(() => ({ layers: ME.Edition.current.layers.map((l) => l.code + ':' + l.abbr), works: ME.Edition.current.works.filter((w) => w.layer).map((w) => w.id) }));
  T.check('the layers are found in the IDs: b, c, ca, r, with abbreviations', reg.layers.join() === 'b:,c:C,ca:CA,r:R', reg);
  T.check('and each layer is a work', ['L-b', 'L-c', 'L-ca', 'L-r'].every((w) => reg.works.includes(w)), reg.works);
  const fold = await page.evaluate(() => { const d = document.querySelector('.ly-fold'); return d ? { rows: [...d.querySelectorAll('tbody tr')].map((r) => r.querySelector('code').textContent), text: d.innerText } : null; });
  T.check('the Witnesses step lists the layers, the base first and each commentary after its parent', fold && fold.rows.join() === 'b,c,ca,r', fold && fold.rows);
  T.check('and says what is wrong: a block whose parent no witness has', fold && /ca2-5-1 comments on c2-5, which no witness has/.test(fold.text), fold && fold.text.slice(0, 800));
  T.check('and an ID that was meant as a layer ID', fold && /c3 is not a layer ID/.test(fold.text));
  const parse = await page.evaluate(() => { const L = ME.LayerIds; return { a: L.parentOf(L.parse('ca2.47-1-2')), b: L.parentOf(L.parse('ca2.47-3')), c: L.parentOf(L.parse('c2.47_2.48-1')), d: L.parse('b2.47-1'), e: L.parse('caa2.47-1-1-1').depth, f: L.parentOf(L.parse('caa2.47-1-1-1')) }; });
  T.check('a parent is read from the ID: a paragraph, the whole comment, two verses', parse.a.ids[0] === 'c2.47-1' && parse.b.prefix === 'c2.47-' && parse.c.ids.join() === 'b2.47,b2.48' && parse.d === null && parse.e === 3 && parse.f.ids[0] === 'ca2.47-1-1', parse);
  // naming, abbreviations, order
  await page.evaluate(async () => {
    const d = document.querySelector('.ly-fold'); d.open = true;
    const row = (code) => [...d.querySelectorAll('tbody tr')].find((r) => r.querySelector('code').textContent === code);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); };
    set(row('c').querySelector('[aria-label="Name of layer c"]'), 'Śaṅkara, Bhāṣya');
    await new Promise((r) => setTimeout(r, 400));
    set(document.querySelector('.ly-fold [aria-label="Abbreviation of layer c"]'), 'Ś');
    await new Promise((r) => setTimeout(r, 400));
    set(document.querySelector('.ly-fold [aria-label="Abbreviation of layer r"]'), 'Ś');
    await new Promise((r) => setTimeout(r, 400));
  });
  const named = await page.evaluate(() => ({ c: ME.LayerIds.layer(ME.Edition.current, 'c'), work: ME.Edition.current.works.find((w) => w.id === 'L-c').title, text: document.querySelector('.ly-fold').innerText }));
  T.check('a layer is named and abbreviated, and its work takes the name', named.c.name === 'Śaṅkara, Bhāṣya' && named.c.abbr === 'Ś' && named.work === 'Śaṅkara, Bhāṣya', named.c);
  T.check('two layers with one abbreviation are told', /share the abbreviation \[Ś\]/.test(named.text));
  await page.evaluate(async () => {
    document.querySelector('.ly-fold').open = true;
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); };
    set(document.querySelector('.ly-fold [aria-label="Abbreviation of layer r"]'), 'R');
    await new Promise((r) => setTimeout(r, 400));
    document.querySelector('.ly-fold').open = true;
    const r = [...document.querySelectorAll('.ly-fold tbody tr')].find((x) => x.querySelector('code').textContent === 'r');
    r.querySelector('[title="Before the commentary above it"]').click();
    await new Promise((res) => setTimeout(res, 400));
  });
  const order = await page.evaluate(() => [...document.querySelectorAll('.ly-fold tbody tr')].map((r) => r.querySelector('code').textContent));
  T.check('↑ puts one commentary before another, with its family after it', order.join() === 'b,r,c,ca', order);
  // the Collate step: every layer at once
  await page.evaluate(async () => { document.querySelector('[data-action="step-collate"]').click(); await new Promise((r) => setTimeout(r, 500)); });
  const step = await page.evaluate(() => { const sel = document.querySelector('[aria-label="Work to collate"]'); return { value: sel && sel.value, options: sel ? [...sel.options].map((o) => o.textContent) : [], rows: [...document.querySelectorAll('.cv-units tbody tr')].map((r) => r.querySelector('.cv-unit').textContent.trim()) }; });
  T.check('Collate offers All layers, and starts there', step.value === ME_ALL(step) && step.options[0] === 'All layers', step);
  T.check('the table has every layer’s blocks, each commentary with its [abbreviation]', step.rows.includes('b1') && step.rows.includes('[Ś] c1-1') && step.rows.includes('[CA] ca1-1-1') && step.rows.includes('[R] r1-1'), step.rows);
  // in the order of the manuscript, base and commentaries interleaved, and what is amiss highlighted
  const seq = step.rows.map((r) => r.replace(/^\[[^\]]+\] /, ""));
  T.check('the blocks stand as in the manuscript: c1-0, b1, c1-1, ca1-1-1, r1-1, b2, c2-1, ca2-5-1', seq.join() === 'c1-0,b1,c1-1,ca1-1-1,r1-1,b2,c2-1,ca2-5-1', seq);
  const bad = await page.evaluate(() => [...document.querySelectorAll('.cv-units tbody tr.cv-bad')].map((r) => r.querySelector('.cv-unit').textContent.trim() + ' :: ' + r.title));
  T.check('the block whose base block no witness has is highlighted, and says so', bad.length === 1 && /ca2-5-1/.test(bad[0]) && /c2-5 is missing/.test(bad[0]) && /highlighted/.test(await page.evaluate(() => (document.querySelector('.cv-units .ed-warn') || {}).textContent || '')), bad);
  // blocks on the wrong side of their base, and out of order, in a manuscript of their own
  const amiss = await page.evaluate(async () => {
    const { Model, Edition } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>', END = '<x-marker type="p-end"/>';
    // the last line: an avataraṇikā, the verse and its commentary beginning in one line, as a scribe writes them
    const L = [P('b2') + 'मामकाः ' + END, P('c1-1') + 'धर्मक्षेत्र इति ' + END, P('b1') + 'धर्मक्षेत्रे ' + END, P('c2-0') + 'अथ द्वितीयः ' + END, P('c2-2') + 'टीका ' + END, P('c2-1') + 'मामका इति ' + END,
      P('c3-0') + 'अथ तृतीयः ' + END + P('b3') + 'सञ्जय उवाच ' + END + P('c3-1') + 'सञ्जय इति ' + END];
    const p = Model.upgrade(Model.newProject({ meta: { title: 'Z', siglum: 'Z', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: L.length }, folios: {} }));
    p.pdf = { name: 'z.pdf', pages: 1 }; p.pages = { '1r': { boxes: { main: L } } };
    const ed = Edition.create('Amiss'); ed.witnesses.push({ siglum: 'Z', projectId: p.id, streams: {} });
    const list = [{ w: ed.witnesses[0], p }];
    Edition.syncLayers(ed, list);
    return Edition.manuscriptOrder(ed, list).map((x) => x.id + (x.problem ? ' !! ' + x.problem : ''));
  });
  T.check('a commentary before its base, a -0 block after its base, a base out of order and a paragraph out of order are each told; three blocks beginning in one line stand in their order there, and are in order', amiss.join('\n') === ['b2', 'c1-1 !! c1-1: it stands before its base block b1', 'b1 !! b1: it comes after b2, out of order', 'c2-0 !! c2-0: it stands after its base block b2', 'c2-2', 'c2-1 !! c2-1: it comes after c2-2, out of order', 'c3-0', 'b3', 'c3-1'].join('\n'), amiss);
  await page.evaluate(() => document.querySelector('[data-action="collate"]').click());
  for (let k = 0; k < 80; k++) { await sleep(250); if (await page.evaluate(() => !ME.CollateView.running && document.querySelector('[data-action="collate"]'))) break; }
  await sleep(800);
  const done = await page.evaluate(async () => { const m = await ME.Collate.summaries(window.edId); return [...m.values()].map((s) => s.work + '/' + s.unit).sort(); });
  T.check('one Collate collates every layer', ['L-b/b1', 'L-b/b2', 'L-c/c1-0', 'L-c/c1-1', 'L-c/c2-1', 'L-ca/ca1-1-1', 'L-r/r1-1'].every((x) => done.includes(x)), done);
  const cText = await page.evaluate(async () => { const r = await ME.Store.getCollation(ME.Collate.keyOf(window.edId, 'L-c', 'c1-1')); return Object.values(r.table.states).map((s) => s.siglum + ':' + s.dip.trim()); });
  T.check('a commentary block has its own text only, though it is written in the same box as the base', cText.length === 3 && cText.every((t) => /व्याख्यानम्$/.test(t) && !/युयुत्सवः/.test(t)), cText);
  const rAbsent = await page.evaluate(async () => { const r = await ME.Store.getCollation(ME.Collate.keyOf(window.edId, 'L-r', 'r1-1')); return r.table.absent.map((a) => a.siglum); });
  T.check('a witness without one commentary is absent from it only', rAbsent.join() === 'C', rAbsent);
  // the links, from the IDs alone
  const links = await page.evaluate(async () => {
    const ed = ME.Edition.current, LV = ME.LayersView;
    const of = async (w) => { const x = await LV.baseTexts(ed, w); return x ? { title: x.title, links: Object.fromEntries(x.links.map((l) => [l.unit, l.base.join(' ')])), texts: x.texts } : null; };
    return { c: await of('L-c'), ca: await of('L-ca'), r: await of('L-r'), b: await of('L-b'), base: ME.Layers.baseOf(ed, 'L-ca') };
  });
  T.check('each commentary block is linked to its parent by its ID: c1-0 and c1-1 to b1, ca1-1-1 to c1-1', links.c && links.c.links['c1-0'] === 'b1' && links.c.links['c1-1'] === 'b1' && links.c.links['c2-1'] === 'b2' && links.ca.links['ca1-1-1'] === 'c1-1' && links.r.links['r1-1'] === 'b1' && links.base === 'L-c' && links.b === null, links && { c: links.c && links.c.links, ca: links.ca && links.ca.links });
  T.check('and a sub-commentary’s base text is its commentary’s', links.ca && /व्याख्यानम्/.test(links.ca.texts['c1-1'] || ''), links.ca && links.ca.texts);
  await page.evaluate(async () => { ME.CollateView.workApparatus(ME.Edition.current, await Promise.all(ME.Edition.current.witnesses.map(async (w) => ({ w, p: ME.Model.upgrade(await ME.Store.getProject(w.projectId)) }))), 'L-ca'); await new Promise((r) => setTimeout(r, 800)); });
  T.check('Edited text and apparatus of a sub-commentary shows above each block what it comments on', await page.evaluate(() => { const q = document.querySelector('.modal .ap-base'); return !!q && /व्याख्यानम्/.test(q.textContent); }));
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  // all the layers as one text
  const ALL = '*layers';
  const woven = await page.evaluate(async () => {
    const ed = ME.Edition.current;
    const list = await Promise.all(ed.witnesses.map(async (w) => ({ w, p: ME.Model.upgrade(await ME.Store.getProject(w.projectId)) })));
    const works = (await ME.Release.works(ed, list)).filter((w) => ME.LayerIds.codeOf(w.work.id));
    window.__list = list;
    return ME.LayerIds.weave(ed, works).map((b) => b.table.unit + ':' + b.layer.depth + ':' + b.layer.abbr);
  });
  // r was put before c, so on b1: c's introduction, the verse, r, then c with ca under it; ca2-5-1, whose parent no
  // witness has, follows its verse
  T.check('woven in reading order: the introduction before the verse, each commentary after it with its sub-commentary under it, in the register’s order', woven.join(' ') === 'c1-0:1:Ś b1:0: r1-1:1:R c1-1:1:Ś ca1-1-1:2:CA b2:0: c2-1:1:Ś ca2-5-1:2:CA', woven);
  await page.evaluate(async (ALL) => { ME.CollateView.workApparatus(ME.Edition.current, window.__list, ALL); await new Promise((r) => setTimeout(r, 900)); }, ALL);
  const view = await page.evaluate(() => [...document.querySelectorAll('.modal .lw-block')].map((x) => ({ id: x.dataset.unit, indent: parseFloat(x.style.marginInlineStart) || 0, abbr: (x.querySelector('.lw-abbr') || {}).textContent || '' })));
  T.check('Edited text and apparatus of All layers shows them woven, each set in by its depth, with its [abbreviation]', view.length === 8 && view[0].abbr === '[Ś]' && view[1].abbr === '' && view[4].id === 'ca1-1-1' && view[4].indent > view[3].indent && view[3].indent > view[1].indent, view);
  await page.evaluate(() => { const b = document.querySelector('.modal-foot .btn'); if (b) b.click(); });
  await sleep(300);
  const print = await page.evaluate(async (ALL) => {
    const ed = ME.Edition.current;
    const f = await ME.ExportView.make('print-page', { kind: 'edition', ed, list: window.__list, workId: ALL });
    const html = typeof f.data === 'string' ? f.data : await new Response(f.data).text();
    const json = JSON.parse(html.match(/<script type="application\/json" id="edition-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
    return { blocks: json.blocks.map((b) => b.id + ':' + b.depth + ':' + b.abbr), first: json.blocks[0].html.slice(0, 60), layers: json.layers.map((l) => l.abbr + ' ' + l.name), html };
  }, ALL);
  T.check('the print page has all the layers in reading order, each commentary block with [abbreviation] first', print.blocks.join(' ') === 'c1-0:1:Ś b1:0: r1-1:1:R c1-1:1:Ś ca1-1-1:2:CA b2:0: c2-1:1:Ś ca2-5-1:2:CA' && /^<span class="labl"[^>]*>\[Ś\]<\/span>/.test(print.first), print.blocks);
  T.check('and lists the commentaries and their abbreviations', print.layers.includes('Ś Śaṅkara, Bhāṣya') && print.layers.includes('CA Sub-commentary ca (on c)'), print.layers);
  // lay it out: the deeper layers are set in further
  const laid = await (async () => {
    const p2 = await browser.newPage();
    await p2.setContent(print.html, { waitUntil: 'load' });
    for (let k = 0; k < 40 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(200);
    const r = await p2.evaluate(() => {
      const at = (id) => { const p = document.querySelector('.body p.txt[data-block="' + id + '"]'); return p ? p.getBoundingClientRect().left : null; };
      return { b1: at('b1'), c11: at('c1-1'), ca: at('ca1-1-1'), foot: [...document.querySelectorAll('.foot .nk')].map((x) => x.textContent), ids: document.querySelectorAll('.body .bid').length, sups: [...document.querySelectorAll('.body .an sup a')].map((x) => x.getAttribute('href') + '>' + x.textContent), back: [...document.querySelectorAll('.foot a.nk')].every((x) => !!document.getElementById(x.getAttribute('href').slice(1))) };
    });
    await p2.close();
    return r;
  })();
  T.check('on the page, a commentary is set in from the verse, and its sub-commentary further', laid.b1 !== null && laid.c11 > laid.b1 && laid.ca > laid.c11, laid);
  T.check('no block IDs are printed; the notes are numbered from 1 on the page, each marker linked to its note and back', laid.ids === 0 && laid.foot.length > 0 && laid.foot.every((n, i) => +n === i + 1) && laid.sups.length === laid.foot.length && laid.sups.every((x) => /^#fn-\d+-\d+>\d+$/.test(x)) && laid.back, laid);
  const reader = await page.evaluate(async (ALL) => {
    const f = await ME.ExportView.make('reader', { kind: 'edition', ed: ME.Edition.current, list: window.__list, workId: ALL });
    const html = typeof f.data === 'string' ? f.data : await new Response(f.data).text();
    return html;
  }, ALL);
  let readerUse = null;
  const readerOk = await (async () => {
    const p3 = await browser.newPage(); await p3.setViewport({ width: 1200, height: 800 });
    await p3.setContent(reader, { waitUntil: 'load' }); await sleep(300);
    const r = await p3.evaluate(() => [...document.querySelectorAll('section.block')].map((x) => x.id.slice(2) + ((x.querySelector('.labl') || {}).textContent || '')));
    const shown = () => p3.evaluate(() => ({ app: [...document.querySelectorAll('#text ol.app')].some((x) => x.getBoundingClientRect().height > 0), pop: !document.querySelector('#pop').hidden && document.querySelector('#pop').innerText, panel: document.body.classList.contains('panel-open') && document.querySelector('#panel').getBoundingClientRect().width > 0 && document.querySelector('#panel-body').innerText, ids: document.querySelectorAll('#text h2').length }));
    const first = await shown();
    first.underline = await p3.evaluate(() => { const st = getComputedStyle(document.querySelector('#text .u')); return st.textDecorationLine + ' ' + st.textDecorationStyle; });
    await p3.hover('#text .u');
    await sleep(150);
    const hovered = await shown();
    await p3.click('#text .u');
    await sleep(150);
    const clicked = await shown();
    await p3.evaluate(() => { const b = document.querySelector('#t-app'); b.checked = true; b.dispatchEvent(new Event('change')); });
    const all = await shown();
    readerUse = { first, hovered, clicked, all };
    await p3.close();
    return r;
  })();
  T.check('the reader shows the text alone at first: no apparatus, no block IDs', readerUse.first.app === false && !readerUse.first.panel && readerUse.first.ids === 0, readerUse.first);
  T.check('the words with variant readings are underlined, dotted, so that a reader knows where to point', /underline/.test(readerUse.first.underline) && /dotted/.test(readerUse.first.underline), readerUse.first.underline);
  T.check('pointing at a word shows its entry beside it', /आनन्दगिरे/.test(readerUse.hovered.pop || ''), readerUse.hovered.pop);
  T.check('clicking it keeps the entry open in the panel at the side', /आनन्दगिरे/.test(readerUse.clicked.panel || '') && /\]/.test(readerUse.clicked.panel || ''), readerUse.clicked.panel);
  T.check('and the apparatus can be put under the text, as in print', readerUse.all.app === true);
  T.check('the reader has them in the same order, with the abbreviations', readerOk.join(' ') === 'c1-0[Ś] b1 r1-1[R] c1-1[Ś] ca1-1-1[CA] b2 c2-1[Ś] ca2-5-1[CA]', readerOk);
  // the direct PDF is laid out as the print page: the commentaries listed, each block with its [abbreviation]
  const direct = await page.evaluate(async (ALL) => {
    const f = await ME.ExportView.make('pdf-direct', { kind: 'edition', ed: ME.Edition.current, list: window.__list, workId: ALL });
    const buf = new Uint8Array(await f.data.arrayBuffer());
    await ME.PdfView.ensureWorker();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
    return text.replace(/\s+/g, '');
  }, ALL);
  T.check('the direct PDF lists the commentaries and begins each commentary block with its [abbreviation], as the print page does', /Thecommentaries/.test(direct) && /\[Ś\]/.test(direct) && /\[CA\]/.test(direct) && /\[R\]/.test(direct), direct.slice(0, 300));
  // TEI: each block names its layer, each commentary block points to what it comments on
  const tei = await page.evaluate(async (ALL) => {
    const f = await ME.ExportView.make('tei', { kind: 'edition', ed: ME.Edition.current, list: window.__list, workId: ALL });
    const xml = typeof f.data === 'string' ? f.data : await new Response(f.data).text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const NS = 'http://www.tei-c.org/ns/1.0';
    const ab = (id) => [...doc.getElementsByTagNameNS(NS, 'ab')].find((x) => x.getAttribute('n') === id);
    const S = ME.TEI_SCHEMA, global = new Set(S.global.split(' '));
    const bad = [];
    for (const el of doc.getElementsByTagNameNS(NS, '*')) {
      if (!(el.localName in S.elements)) { bad.push('<' + el.localName + '>'); continue; }
      const own = new Set(S.lists[S.elements[el.localName]].split(' '));
      for (const at of el.attributes) if (at.name !== 'xmlns' && !global.has(at.name) && !own.has(at.name)) bad.push(el.localName + '@' + at.name);
    }
    const cat = (code) => doc.querySelector('category[n="' + code + '"]');
    return {
      ok: !doc.getElementsByTagName('parsererror').length,
      c11: ab('c1-1') && [ab('c1-1').getAttribute('ana'), ab('c1-1').getAttribute('corresp')],
      ca: ab('ca1-1-1') && ab('ca1-1-1').getAttribute('corresp'),
      b1: ab('b1') && [ab('b1').getAttribute('ana'), ab('b1').getAttribute('corresp')],
      nested: !!(cat('ca') && cat('ca').parentNode === cat('c') && cat('c').parentNode === cat('b')),
      abbr: cat('c') && cat('c').querySelector('abbr').textContent,
      links: doc.querySelectorAll('standOff linkGrp[type="commentary"] link').length,
      titles: [...doc.querySelectorAll('titleStmt title[subtype]')].map((t) => t.getAttribute('subtype') + ':' + t.textContent),
      bad: [...new Set(bad)],
      back: Object.keys(ME.Apparatus.readBack(xml)).length,
    };
  }, ALL);
  T.check('the TEI of all layers is well-formed, and every element and attribute is TEI P5', tei.ok && tei.bad.length === 0, tei.bad);
  T.check('each block names its layer; a commentary block points to the block it comments on', tei.c11 && tei.c11[0] === '#layer-c' && tei.c11[1] === '#w-b1' && tei.ca === '#w-c1-1' && tei.b1[0] === '#layer-b' && tei.b1[1] === null, tei);
  T.check('the header has the layers nested as they comment on one another, with their abbreviations', tei.nested && tei.abbr === 'Ś' && tei.titles.includes('commentary:Śaṅkara, Bhāṣya') && tei.titles.some((t) => /^base-text:/.test(t)), tei);
  T.check('and standOff has the same links, one for each commentary block that has a parent here (not ca2-5-1)', tei.links === 5 && tei.back === 3, tei);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });

function ME_ALL() { return '*layers'; }
