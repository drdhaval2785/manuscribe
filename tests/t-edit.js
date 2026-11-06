// The table window of a block, at the Simple level: a place shows its readings, Accept and Emend… and folds the
// rest under More; the blocks of a work are gone through without closing the window; and, at Full, the tools of the
// letter view are in two groups.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('Editing a block');
  const { browser, page } = await launch('edit', { level: 'simple' });
  await page.evaluate(async () => {
    const { Model, Store, Edition, Collate } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    const texts = {
      A: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      B: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेताः युयुत्सवः ।' + END, P('m2') + 'मामका पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      C: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवाः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत संजय ॥' + END],
    };
    const ed = Edition.create('Gītā');
    const list = [];
    for (const [s, lines] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: lines.concat(['', '']) } } };
      await Store.putProject(p);
      const w = { siglum: s, projectId: p.id, streams: {} };
      ed.witnesses.push(w); list.push({ w, p });
    }
    ed.trust = ['A', 'B', 'C'];
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'main', {});
    window.ed = ed; window.list = list;
    ME.CollateView.open(ed, list, 'main', 'm1', () => {});
  });
  await sleep(900);
  const vis = () => page.evaluate(() => { const p = document.querySelector('.ct-panel'); const v = (e) => { const r = e.getBoundingClientRect(); const shut = e.closest('details'); return r.width > 0 && r.height > 0 && !e.hidden && !e.closest('[hidden]') && !(shut && !shut.open && !e.closest('summary')); }; return { controls: [...p.querySelectorAll('button, select, input')].filter(v).length, text: p.innerText }; });
  await page.evaluate(() => document.querySelector('.ct-text .ct-u:not(.d-same)').click());
  await sleep(300);
  const panel = await vis();
  T.check('a place shows at most six controls at the Simple level (' + panel.controls + ')', panel.controls <= 6, panel);
  T.check('with Accept, Emend… and More', /Accept/.test(panel.text) && /Emend…/.test(panel.text) && /More: crux, lacuna/.test(panel.text), panel.text.slice(0, 300));
  await page.evaluate(() => [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Emend…').click());
  await sleep(100);
  T.check('Emend… opens the field for your own text', await page.evaluate(() => { const i = document.querySelector('.ct-panel .ct-emend'); return !!i && i.getBoundingClientRect().width > 0; }));
  await page.evaluate(() => { const d = document.querySelector('.ct-panel .ct-more'); d.open = true; });
  await sleep(100);
  T.check('More holds the crux, lacuna, certainty and reasons', await page.evaluate(() => { const t = document.querySelector('.ct-panel .ct-more').innerText; return /† crux/.test(t) && /Lacuna/.test(t) && /Why \(optional\)/.test(t); }));
  T.check('and at Simple, no letter view from here', await page.evaluate(() => !/Correct the alignment here/.test(document.querySelector('.ct-panel').innerText)));
  await page.evaluate(() => [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Accept').click());
  await sleep(300);
  T.check('Accept makes the proposal a decision', await page.evaluate(() => /decision/.test(document.querySelector('.cv-count').textContent)));
  // through the blocks
  await page.evaluate(() => document.querySelector('[data-action="block-next"]').click());
  await sleep(1000);
  T.check('Block › opens the next block in the window', await page.evaluate(() => /Collation: m2/.test(document.querySelector('.modal-head h2').textContent) && document.querySelector('[data-action="block-next"]').disabled));
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('[');
  await sleep(1000);
  T.check('and [ goes back', await page.evaluate(() => /Collation: m1/.test(document.querySelector('.modal-head h2').textContent)));
  T.check('where the decision is still there', await page.evaluate(() => /1 decision/.test(document.querySelector('.cv-count').textContent)), await page.evaluate(() => document.querySelector('.cv-count').textContent));
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(400);
  // the letter view at Full
  await page.evaluate(() => { ME.Features.save({ level: 'full' }); ME.CollateView.open(window.ed, window.list, 'main', 'm1', () => {}); });
  await sleep(900);
  await page.evaluate(() => document.querySelector('[data-action="letters"]').click());
  await sleep(800);
  const groups = await page.evaluate(() => [...document.querySelectorAll('.cv-tgroup .cv-tlabel')].map((x) => x.textContent));
  T.check('at Full, the letter tools are in two groups, Move and Mark', groups.join() === 'Move,Mark', groups);
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
