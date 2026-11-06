// Emending where every witness is wrong: any word, or a stretch of several, chosen by Shift+click or by dragging,
// given the editor's own text, typed with the typing schemes of a transcription; it reaches the edited text and the
// apparatus as an emendation, passes the checks, and is taken back with Withdraw, as an accepted reading is.
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
  const word = (w) => page.evaluate((w) => { const el = [...document.querySelectorAll('.ct-text .ct-u')].find((x) => x.textContent.trim().replace(/\s*[।॥]$/, '') === w); if (!el) return null; el.click(); return el.className; }, w);
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
  T.check('Use my text is the button to press, and whose emendation it is waits under More', await page.evaluate(() => { const b = document.querySelector('.ct-panel [data-action="use-emend"]'); const src = document.querySelector('.ct-panel [aria-label="Whose emendation, if not yours"]'); return !!b && b.classList.contains('primary') && !!src && !!src.closest('.ct-more'); }));
  // several words as one place: click the first, Shift+click the last
  const count = () => page.evaluate(() => document.querySelector('.cv-count').textContent);
  await word('समवेता');
  await page.evaluate(() => { const el = [...document.querySelectorAll('.ct-text .ct-u')].find((x) => /युयुत्सव/.test(x.textContent)); el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  await sleep(200);
  const range = await page.evaluate(() => ({ sel: [...document.querySelectorAll('.ct-text .ct-u.sel')].map((x) => x.textContent.trim()), panel: document.querySelector('.ct-panel').innerText, value: document.querySelector('.ct-panel .ct-emend').value }));
  T.check('Shift+click chooses a stretch of words, with what each witness reads over all of it', range.sel.length === 2 && /2 words chosen/.test(range.panel) && /समवेता युयुत्सवः/.test(range.panel) && /समवेता युयुत्सवाः/.test(range.panel), range);
  T.check('and offers the proposed text to correct', /^समवेता युयुत्सवः$/.test(range.value), range.value);
  // typed as a transcription is: Harvard-Kyoto into Devanagari
  const typing = await page.evaluate(() => { const t = document.querySelector('.ct-panel .ct-typing'); if (!t) return null; t.value = 'hk-deva'; t.dispatchEvent(new Event('change')); return true; });
  T.check('the field has the typing schemes of the transcription', !!typing);
  await sleep(200);
  await page.evaluate(() => { const i = document.querySelector('.ct-panel .ct-emend'); i.value = ''; i.focus(); });
  await page.keyboard.type('samavetAyuyutsavaH');
  const typed = await page.evaluate(() => document.querySelector('.ct-panel .ct-emend').value);
  T.check('and types Harvard-Kyoto as Devanagari', typed === 'समवेतायुयुत्सवः', typed);
  await page.keyboard.press('Enter');
  await sleep(1000);
  const joined = await page.evaluate(() => ({ text: document.querySelector('.ct-text').innerText, sel: (document.querySelector('.ct-text .ct-u.sel') || {}).textContent, settled: (document.querySelector('.ct-panel .ct-settled') || {}).textContent }));
  T.check('Enter puts the text in as one place, an emendation', /समवेतायुयुत्सवः/.test(joined.text) && /समवेतायुयुत्सवः/.test(joined.sel || '') && /Your emendation/.test(joined.settled), joined);
  T.check('two decisions now', /2 decision/.test(await count()), await count());
  const app2 = await page.evaluate(async () => {
    const works = await ME.Release.works(window.ed, window.list);
    const b = works[0].built[0];
    const e = b.entries.find((x) => x.decision && x.lemma && /समवेतायुयुत्सवः/.test(x.lemma));
    return { text: b.text, entry: e ? ME.Apparatus.format(window.ed, e).replace(/<[^>]+>/g, '') : null, errors: ME.Apparatus.validate(window.ed, b.table, b).filter((p) => p.level === 'error').map((p) => p.text) };
  });
  T.check('the apparatus has one entry for the stretch, with each witness’s reading of it', !!app2.entry && /समवेता युयुत्सवः/.test(app2.entry) && /समवेता युयुत्सवाः/.test(app2.entry) && app2.errors.length === 0, app2);
  // dragging across words chooses them too, and says what gives way
  const drag = await page.evaluate(() => {
    const us = [...document.querySelectorAll('.ct-text .ct-u')];
    const a = us.find((x) => /धर्मक्षेत्रे/.test(x.textContent)), b = us.find((x) => /कुरुक्षेत्रेऽस्मिन्/.test(x.textContent));
    const r = document.createRange(); r.setStart(a.firstChild, 1); r.setEnd(b.firstChild, 2);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('.ct-text').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { sel: document.querySelectorAll('.ct-text .ct-u.sel').length, panel: document.querySelector('.ct-panel').innerText };
  });
  T.check('dragging across words chooses them, and says which decisions would give way', drag.sel === 2 && /2 words chosen/.test(drag.panel) && /Your decisions on 1 of these words give way/.test(drag.panel), drag);
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('Escape'); await sleep(150);
  T.check('Esc leaves the stretch', await page.evaluate(() => !document.querySelector('.ct-text .ct-u.sel') && !!document.querySelector('.modal')));
  // withdrawing: the stretch comes apart again
  await word('समवेतायुयुत्सवः');
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('Delete'); await sleep(600);
  const apart = await page.evaluate(() => [...document.querySelectorAll('.ct-text .ct-u')].map((x) => x.textContent.trim()));
  T.check('Delete withdraws it, and the words are separate places again', apart.includes('समवेता') && apart.some((x) => /^युयुत्सवः/.test(x)) && /1 decision/.test(await count()), apart);
  // withdrawing an accepted reading
  await page.evaluate(() => [...document.querySelectorAll('.ct-text .ct-u')].find((x) => /^युयुत्सवः/.test(x.textContent.trim())).click());
  await page.evaluate(() => [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Accept').click());
  await sleep(400);
  const accepted = await count();
  const w = await page.evaluate(() => { const b = document.querySelector('.ct-panel [data-action="withdraw"]'); return b && !b.closest('details') ? b.textContent : null; });
  T.check('an accepted reading shows Withdraw decision beside the readings', /2 decision/.test(accepted) && w === 'Withdraw decision', { accepted, w });
  await page.evaluate(() => document.querySelector('.ct-panel [data-action="withdraw"]').click());
  await sleep(400);
  T.check('which takes the approval back', /1 decision/.test(await count()) && await page.evaluate(() => !![...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Accept')), await count());
  // and the first emendation
  await word('कुरुक्षेत्रेऽस्मिन्');
  await page.evaluate(() => [...document.querySelectorAll('.ct-panel .btn')].find((b) => b.textContent === 'Withdraw emendation').click());
  await sleep(500);
  T.check('Withdraw emendation takes an emendation back', await page.evaluate(() => !/कुरुक्षेत्रेऽस्मिन्/.test(document.querySelector('.ct-text').innerText) && !/decision/.test(document.querySelector('.cv-count').textContent.replace(/0 decision/, ''))), await count());
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
