// Emending where every witness is wrong: a word all the witnesses agree on can be chosen in the table window and
// given the editor's own text, alone or joined with the next word; it reaches the edited text and the apparatus as
// an emendation, passes the checks, and can be taken back.
const { launch, sleep, checks } = require('./h');

(async () => {
  const T = checks('Emending where the witnesses agree');
  const { browser, page } = await launch('emend', { level: 'simple' });
  await page.evaluate(async () => {
    const { Model, Store, Edition, Collate } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    // all three read कुरुक्षेत्रे and समवेता alike; they differ only at युयुत्सवः
    const texts = {
      A: P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।' + END,
      B: P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।' + END,
      C: P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवाः ।' + END,
    };
    const ed = Edition.create('Gītā');
    const list = [];
    for (const [s, line] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: [line, '', '', ''] } } };
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
  const word = (w) => page.evaluate((w) => { const el = [...document.querySelectorAll('.ct-text .ct-u')].find((x) => x.textContent.trim() === w); if (!el) return null; el.click(); return el.className; }, w);
  const cls = await word('कुरुक्षेत्रे');
  T.check('a word every witness agrees on can be chosen, and is not marked as a difference', !!cls && /d-same/.test(cls), cls);
  const panel = await page.evaluate(() => { const p = document.querySelector('.ct-panel'); return { text: p.innerText, buttons: [...p.querySelectorAll('.ct-decide > .btn')].map((b) => b.textContent) }; });
  T.check('its panel says they agree, and offers Emend… but not Accept', /All the witnesses that can be read agree/.test(panel.text) && panel.buttons.includes('Emend…') && !panel.buttons.includes('Accept'), panel);
  // E opens the field; type and use it
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('e'); await sleep(150);
  T.check('E opens the field for your own text', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('ct-emend')));
  await page.keyboard.type('कुरुक्षेत्रेऽस्मिन्');
  await page.evaluate(() => [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Use my text').click());
  await sleep(1000); // the window saves its table a moment after a change
  const after = await page.evaluate(() => ({ text: document.querySelector('.ct-text').innerText, settled: document.querySelector('.ct-panel .ct-settled').textContent, count: document.querySelector('.cv-count').textContent }));
  T.check('the emendation stands in the text', /कुरुक्षेत्रेऽस्मिन्/.test(after.text) && /Your emendation/.test(after.settled), after);
  T.check('and counts as a decision', /1 decision/.test(after.count), after.count);
  // the edited text and the apparatus
  const built = await page.evaluate(async () => {
    const works = await ME.Release.works(window.ed, window.list);
    const b = works[0].built[0];
    const e = b.entries.find((x) => x.decision && x.decision.type === 'emendatio');
    return { text: b.text, entry: e ? ME.Apparatus.format(window.ed, e).replace(/<[^>]+>/g, '') : null, errors: ME.Apparatus.validate(window.ed, b.table, b).filter((p) => p.level === 'error').map((p) => p.text) };
  });
  T.check('the edited text has the emendation', /कुरुक्षेत्रेऽस्मिन्/.test(built.text), built.text);
  T.check('the apparatus gives it as an emendation, with what the witnesses read', !!built.entry && /कुरुक्षेत्रेऽस्मिन्/.test(built.entry) && /em\./.test(built.entry) && /कुरुक्षेत्रे/.test(built.entry.replace('कुरुक्षेत्रेऽस्मिन्', '')), built.entry);
  T.check('and the apparatus passes its checks', built.errors.length === 0, built.errors);
  // two words at once: join, then emend
  await word('समवेता');
  await page.evaluate(() => { document.querySelector('.ct-panel .ct-more').open = true; [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Join with the next word').click(); });
  await sleep(500);
  const joined = await page.evaluate(() => { const el = document.querySelector('.ct-text .ct-u.sel'); return el ? el.textContent.trim() : null; });
  T.check('Join with the next word makes one place of two words, here a difference', !!joined && /समवेता\s+युयुत्सव/.test(joined), joined);
  await page.evaluate(() => { [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Emend…').click(); const i = document.querySelector('.ct-panel .ct-emend'); i.value = 'समवेता युयुत्सवः'; [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Use my text').click(); });
  await sleep(500);
  const two = await page.evaluate(() => ({ count: document.querySelector('.cv-count').textContent, settled: (document.querySelector('.ct-panel .ct-settled') || {}).textContent, text: document.querySelector('.ct-text').innerText }));
  T.check('and it can be emended as one', /2 decision/.test(two.count) && /Your emendation/.test(two.settled), two);
  // back to the witnesses
  await word('कुरुक्षेत्रेऽस्मिन्');
  await page.evaluate(() => { document.querySelector('.ct-panel .ct-more').open = true; [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Back to the witnesses’ text').click(); });
  await sleep(500);
  T.check('Back to the witnesses’ text takes the emendation back', await page.evaluate(() => !/कुरुक्षेत्रेऽस्मिन्/.test(document.querySelector('.ct-text').innerText) && /1 decision/.test(document.querySelector('.cv-count').textContent)));
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
