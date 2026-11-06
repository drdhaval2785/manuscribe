// The optional tools, in the Collate step's Tools menu: each switched on in Settings, nothing computed until one is
// chosen, and each part of the stemmatic workbench on its own.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('The tools of Collate');
  const { browser, page } = await launch('tools');
  const id = await page.evaluate(async () => {
    const { Model, Store, Edition, Collate } = ME;
    const P = (x) => '<x-marker type="p-start" id="' + x + '"/>';
    const END = '<x-marker type="p-end"/>';
    const lines = {
      A: 'राम वनं गच्छति सीता च लक्ष्मणः अनुगच्छति', B: 'राम वनं गच्छति सीता अपि लक्ष्मणः अनुगच्छति',
      C: 'रामः वनं गच्छति सीता च लक्ष्मणश्च अनुगच्छति', D: 'रामः वनं गच्छति सीता अपि लक्ष्मणश्च अनुगच्छति',
    };
    const ed = Edition.create('Rāma');
    const list = [];
    for (const [s, t] of Object.entries(lines)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: [P('m1') + t + END, '', '', ''] } } };
      await Store.putProject(p);
      const w = { siglum: s, projectId: p.id, streams: {} };
      ed.witnesses.push(w); list.push({ w, p });
    }
    ed.trust = ['A', 'B', 'C', 'D'];
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'main', {});
    await Edition.show(ed.id);
    return ed.id;
  });
  await page.evaluate(() => document.querySelector('[data-action="step-collate"]').click());
  await sleep(500);
  const steps = await page.evaluate(() => [...document.querySelectorAll('.ed-step')].map((b) => b.textContent.replace(/\d+/g, '').replace(/\//g, '').trim()));
  T.check('the edition has three steps: Witnesses, Collate, Publish', steps.join() === 'Witnesses,Collate,Publish', steps);
  const cards = await page.evaluate(() => ({ actions: [...document.querySelectorAll('.cv-tools .menu-items .btn')].map((b) => b.dataset.action), drawn: document.querySelectorAll('.sv-heat, .sv-tree, .sv-net').length }));
  T.check('the Tools menu of Collate has each tool switched on, and nothing is computed yet', ['an-agreement', 'an-trees', 'an-network', 'an-copies', 'an-stemma', 'an-registers', 'an-metre', 'stemmatics', 'tools-settings'].every((a) => cards.actions.includes(a)) && !cards.actions.includes('an-indices') && cards.drawn === 0, cards);
  const part = async (action) => {
    await page.evaluate((a) => document.querySelector('[data-action="' + a + '"]').click(), action);
    await sleep(1200);
    const r = await page.evaluate(() => ({ title: document.querySelector('.modal-head h2').textContent, heads: [...document.querySelectorAll('.modal h3')].map((h) => h.textContent) }));
    await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
    await sleep(300);
    return r;
  };
  const trees = await part('an-trees');
  T.check('Trees opens only the trees and the map', trees.title === 'Trees' && trees.heads.some((h) => /neighbour joining/.test(h)) && trees.heads.some((h) => /parsimony/.test(h)) && !trees.heads.some((h) => /NeighborNet|Your stemma|Copies/.test(h)), trees);
  const net = await part('an-network');
  T.check('Network and coherence opens only those', net.heads.some((h) => /NeighborNet/.test(h)) && net.heads.some((h) => /Coherence/.test(h)) && !net.heads.some((h) => /parsimony|Your stemma/.test(h)), net);
  const copies = await part('an-copies');
  T.check('Copies and contamination opens only that', copies.heads.length === 1 && /Copies/.test(copies.heads[0]), copies);
  const st = await part('an-stemma');
  T.check('Your stemma opens only the stemma', st.heads.length === 1 && /Your stemma/.test(st.heads[0]), st);
  const all = await part('stemmatics');
  T.check('the whole workbench is still there, with all its parts', ['How far the witnesses agree', 'Your stemma', 'For other programs'].every((h) => all.heads.includes(h)), all.heads);
  const agree = await part('an-agreement');
  T.check('Agreement shows the table and the search for witnesses agreeing against others', agree.heads.some((h) => /agree against others/.test(h)), agree);
  // at Simple, with no Sanskrit witness, the menu has only the way to Settings
  await page.evaluate(async () => { ME.Features.save({ level: 'simple', packs: { 'south-asian': 'off' } }); await ME.Edition.draw(); });
  await sleep(500);
  const simple = await page.evaluate(() => [...document.querySelectorAll('.cv-tools .menu-items .btn')].map((b) => b.dataset.action));
  T.check('at Simple without the South Asian pack, Tools only leads to Settings', simple.join() === 'tools-settings', simple);
  await page.evaluate(() => document.querySelector('[data-action="tools-settings"]').click());
  await sleep(500);
  T.check('which opens the switches of the tools', await page.evaluate(() => !!document.querySelector('.modal .ft-panel')));
  await page.evaluate(() => { ME.Features.save({ packs: {} }); const b = document.querySelector('.modal-foot .btn, .modal-head .icon-btn'); if (b) b.click(); });
  void id;
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
