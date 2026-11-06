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
  await page.evaluate(() => document.querySelector('[data-action="collate"]').click());
  for (let k = 0; k < 80; k++) { await sleep(250); if (await page.evaluate(() => !ME.CollateView.running && document.querySelector('[data-action="collate"]'))) break; }
  await sleep(800);
  const done = await page.evaluate(async () => { const m = await ME.Collate.summaries(window.edId); return [...m.values()].map((s) => s.work + '/' + s.unit).sort(); });
  T.check('one Collate collates every layer', ['L-b/b1', 'L-b/b2', 'L-c/c1-0', 'L-c/c1-1', 'L-c/c2-1', 'L-ca/ca1-1-1', 'L-r/r1-1'].every((x) => done.includes(x)), done);
  const cText = await page.evaluate(async () => { const r = await ME.Store.getCollation(ME.Collate.keyOf(window.edId, 'L-c', 'c1-1')); return Object.values(r.table.states).map((s) => s.siglum + ':' + s.dip.trim()); });
  T.check('a commentary block has its own text only, though it is written in the same box as the base', cText.length === 3 && cText.every((t) => /व्याख्यानम्$/.test(t) && !/युयुत्सवः/.test(t)), cText);
  const rAbsent = await page.evaluate(async () => { const r = await ME.Store.getCollation(ME.Collate.keyOf(window.edId, 'L-r', 'r1-1')); return r.table.absent.map((a) => a.siglum); });
  T.check('a witness without one commentary is absent from it only', rAbsent.join() === 'C', rAbsent);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });

function ME_ALL() { return '*layers'; }
