// The Analyse step: a card for each analysis, nothing computed until a card is opened, and each part of the
// stemmatic workbench on its own.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('Analyse');
  const { browser, page } = await launch('analyse');
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
  await page.evaluate(() => document.querySelector('[data-action="step-analyse"]').click());
  await sleep(500);
  const cards = await page.evaluate(() => ({ actions: [...document.querySelectorAll('.an-card .btn')].map((b) => b.dataset.action), drawn: document.querySelectorAll('.sv-heat, .sv-tree, .sv-net').length }));
  T.check('Analyse shows a card for each analysis, and has computed nothing yet', ['an-agreement', 'an-trees', 'an-network', 'an-copies', 'an-stemma', 'an-registers', 'an-indices', 'an-metre', 'stemmatics'].every((a) => cards.actions.includes(a)) && cards.drawn === 0, cards);
  const part = async (action) => {
    await page.evaluate((a) => document.querySelector('[data-action="' + a + '"]').click(), action);
    await sleep(900);
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
  void id;
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
