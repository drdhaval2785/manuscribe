// What is shown: the Simple level by default, the Full level, a tool switched on its own, and the South Asian pack
// switched on by the language of the witnesses or by hand. Nothing shown or hidden changes the edition itself.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('What is shown');
  const { browser, page } = await launch('features', { level: 'simple' });
  T.check('a new browser starts at the Simple level', await page.evaluate(() => ME.Features.prefs().level === 'simple'));
  // two small editions, one in Arabic and one in Sanskrit
  await page.evaluate(async () => {
    const { Model, Store, Edition, Collate } = ME;
    const make = async (title, lang, words, profile) => {
      const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
      const END = '<x-marker type="p-end"/>';
      const ed = Edition.create(title);
      if (profile) ed.norm = { profile };
      const list = [];
      for (const [s, w] of Object.entries(words)) {
        const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: lang }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
        p.pdf = { name: s + '.pdf', pages: 1 };
        p.pages = { '1r': { boxes: { main: [P('b1') + w + END, '', '', ''] } } };
        await Store.putProject(p);
        const x = { siglum: s, projectId: p.id, streams: {} };
        ed.witnesses.push(x); list.push({ w: x, p });
      }
      ed.trust = Object.keys(words);
      await Store.putEdition(ed);
      await Collate.run(ed, list, 'main', {});
      return ed.id;
    };
    window.ids = {};
    window.ids.ar = await make('Arabic', 'ar', { A: 'بسم الله الرحمن الرحيم', B: 'بسم الله الرحمن الرحيمه', C: 'باسم الله الرحمن الرحيم' }, 'any');
    window.ids.sa = await make('Sanskrit', 'sa-Deva', { A: 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः', B: 'धर्मक्षेत्रे कुरुक्षेत्रे समवेताः युयुत्सवः', C: 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवाः' });
  });
  const ids = await page.evaluate(() => window.ids);
  const look = (id) => page.evaluate(async (id) => {
    await ME.Edition.show(id);
    await new Promise((r) => setTimeout(r, 500));
    const v = document.getElementById('edition-view');
    const text = (sel) => [...v.querySelectorAll(sel)].map((b) => b.textContent);
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const profiles = [...v.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'any'));
    const tokens = [...v.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'letter'));
    return {
      buttons: text('.btn'), controls: [...v.querySelectorAll('button, select, input')].filter(vis).length,
      profiles: profiles ? [...profiles.options].map((o) => o.value) : [], tokens: tokens ? [...tokens.options].map((o) => o.value) : [],
      folds: [...v.querySelectorAll('summary')].map((x) => x.textContent),
      // what the Export dialog would offer here
      formats: ME.ExportView.available({ kind: 'edition', ed: ME.Edition.current, list: [] }).map((f) => f.id),
    };
  }, id);
  const ar = await look(ids.ar);
  T.check('Simple, Arabic: no stemmatics, sharing, aligning again or importing an alignment', !['Stemmatics…', 'Compare and merge…', 'GitHub…', 'Kept copies', 'Align again', 'Import alignment…'].some((b) => ar.buttons.includes(b)) && ar.buttons.includes('Edited text and apparatus…'), ar.buttons);
  T.check('Arabic: no South Asian features (Saktumiva, Sanskrit profiles, akṣara tokens)', !ar.formats.includes('saktumiva') && ar.profiles.join() === 'any' && !ar.tokens.includes('aksara'), { profiles: ar.profiles, tokens: ar.tokens });
  T.check('Simple: normalisation is its profile alone, without the rule folds', !ar.folds.some((f) => /Rules used|What each witness/.test(f)), ar.folds);
  const sa = await look(ids.sa);
  T.check('Sanskrit: the South Asian pack is on by the language of the witnesses', sa.formats.includes('saktumiva') && sa.profiles.includes('sa-classical') && sa.tokens.includes('aksara'), { buttons: sa.buttons, profiles: sa.profiles });
  // by hand
  await page.evaluate(() => ME.Features.save({ packs: { 'south-asian': 'on' } }));
  const arOn = await look(ids.ar);
  await page.evaluate(() => ME.Features.save({ packs: { 'south-asian': 'off' } }));
  const saOff = await look(ids.sa);
  T.check('the pack can be switched on and off by hand', arOn.formats.includes('saktumiva') && !saOff.formats.includes('saktumiva') && !saOff.tokens.includes('aksara'), { arOn: arOn.formats, saOff: saOff.formats });
  await page.evaluate(() => ME.Features.save({ packs: {} }));
  // one tool on its own, then the Full level
  await page.evaluate(() => ME.Features.save({ on: { stemmatics: true } }));
  const one = await look(ids.sa);
  T.check('one tool can be switched on by itself', one.buttons.includes('Stemmatics…') && !one.buttons.includes('GitHub…'), one.buttons);
  await page.evaluate(() => ME.Features.save({ on: {}, level: 'full' }));
  const full = await look(ids.sa);
  T.check('Full shows every tool', ['Stemmatics…', 'Compare and merge…', 'GitHub…', 'Kept copies', 'Align again', 'Import alignment…'].every((b) => full.buttons.includes(b)), full.buttons);
  T.check('Simple shows fewer controls on the edition screen (' + sa.controls + ' against ' + full.controls + ')', sa.controls < full.controls - 8, { simple: sa.controls, full: full.controls });
  // the choice is kept in this browser
  await page.evaluate(() => ME.Features.save({ level: 'simple' }));
  await page.reload(); await sleep(800);
  T.check('the level is remembered in this browser', await page.evaluate(() => ME.Features.prefs().level === 'simple'));
  // the table window at Simple: no letter view; metre for Sanskrit
  const table = await page.evaluate(async (id) => {
    const ed = await ME.Store.getEdition(id);
    const list = [];
    for (const w of ed.witnesses) list.push({ w, p: ME.Model.upgrade(await ME.Store.getProject(w.projectId)) });
    ME.Edition.current = ed;
    ME.Features.setContext(ME.Features.langsOf(list));
    ME.CollateView.open(ed, list, 'main', 'b1', () => {});
    await new Promise((r) => setTimeout(r, 900));
    const letters = document.querySelector('[data-action="letters"]');
    const u = document.querySelector('.ct-text .ct-u');
    if (u) u.click();
    await new Promise((r) => setTimeout(r, 300));
    const out = { lettersHidden: !letters || letters.hidden, evidence: !!document.querySelector('.ct-evidence'), formats: !![...document.querySelectorAll('.modal select')].find((s) => [...s.options].some((o) => o.value === 'csv')) };
    document.querySelector('.modal-foot .btn').click();
    return out;
  }, ids.sa);
  T.check('Simple: the table has no letter view, no evidence form, no exchange formats', table.lettersHidden && !table.evidence && !table.formats, table);
  // the Settings dialog from the edition screen
  await page.evaluate(async (id) => { await ME.Edition.show(id); }, ids.sa);
  await sleep(500);
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await sleep(400);
  const dlg = await page.evaluate(() => ({ text: document.querySelector('.modal').innerText, radios: document.querySelectorAll('.modal input[name="ft-level"]').length, switches: document.querySelectorAll('.modal .ft-row input[type=checkbox]').length }));
  const tools = await page.evaluate(() => ME.Features.LIST.length);
  T.check('Settings shows the level, the language features and a switch for each tool', dlg.radios === 2 && dlg.switches === tools && /South Asian scripts/.test(dlg.text) && /Now on: the text is sa-Deva/.test(dlg.text), { radios: dlg.radios, switches: dlg.switches, tools });
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  // nothing shown or hidden changes the edition
  const same = await page.evaluate(async (id) => {
    const ed = await ME.Store.getEdition(id);
    const hash = async () => (await ME.Edition.buildPackage(ed)).manifest.files;
    ME.Features.save({ level: 'simple', packs: { 'south-asian': 'off' } });
    const a = JSON.stringify(await hash());
    ME.Features.save({ level: 'full', packs: { 'south-asian': 'on' } });
    const b = JSON.stringify(await hash());
    ME.Features.save({ level: 'simple', packs: {} });
    return a === b;
  }, ids.sa);
  T.check('the edition package is the same whatever is shown', same);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
