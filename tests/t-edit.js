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
  await sleep(400);
  // ↓ past the last place of a block goes on to the first of the next; ↑ before the first, back to the last
  await page.evaluate(() => { ME.Features.save({ level: 'simple' }); ME.CollateView.open(window.ed, window.list, 'main', 'm1', () => {}); });
  await sleep(1000);
  // between one block and the next the window is closed for a moment: on a slow machine, a look may fall just then
  const where = async () => {
    for (let k = 0; k < 50; k++) {
      if (await page.evaluate(() => !!document.querySelector('.modal-head h2'))) return page.evaluate(() => ({ title: document.querySelector('.modal-head h2').textContent, sel: (document.querySelector('.ct-text .ct-u.sel') || {}).textContent || null }));
      await sleep(100);
    }
    throw new Error('the window of the block did not come back');
  };
  for (let k = 0; k < 6 && /m1/.test((await where()).title); k++) { await page.keyboard.press('ArrowDown'); await sleep(350); }
  await sleep(800);
  const down = await where();
  T.check('↓ after the last place of a block opens the next, at its first place', /Collation: m2/.test(down.title) && !!down.sel, down);
  for (let k = 0; k < 6 && /m2/.test((await where()).title); k++) { await page.keyboard.press('ArrowUp'); await sleep(350); }
  await sleep(800);
  const up = await where();
  T.check('↑ before the first place goes back to the block before, at its last place', /Collation: m1/.test(up.title) && !!up.sel, up);
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(500);
  // a problem of the apparatus, in the Publish step, opens its block at its place, highlighted
  await page.evaluate(async () => {
    const rec = await ME.Store.getCollation(ME.Collate.keyOf(window.ed.id, 'main', 'm2'));
    const t = ME.CollateEdit.ensure(rec.table);
    const u = ME.CollateEdit.proposal(t, ['A', 'B', 'C']).units.find((x) => x.differs);
    // a decision whose witness no longer reads what it read: it needs review, and the checks say so
    t.decisions.push({ id: 'dX', key: u.key, from: u.fromId, to: u.toId, type: 'selectio', label: 'A', status: 'accepted', quote: { A: 'something else' } });
    await ME.Store.putCollation(rec);
    window.__target = u.fromId;
    const el = await ME.Steps.publish(window.ed, window.list, () => {});
    document.body.appendChild(el);
    window.__pub = el;
  });
  const problem = await page.evaluate(() => { const b = window.__pub.querySelector('[data-action="go-problem"]'); return b ? b.parentNode.textContent : null; });
  T.check('the Publish step lists the problem with a link to its place', !!problem && /needs review/.test(problem), problem);
  await page.evaluate(() => window.__pub.querySelector('[data-action="go-problem"]').click());
  await sleep(1200);
  const landed = await page.evaluate(() => { const el = document.querySelector('.ct-text .ct-u.sel'); const u = el && ME.CollateView.lastOpen && ME.CollateView.lastOpen.text.sel; return { title: document.querySelector('.modal-head h2').textContent, flash: !!(el && el.classList.contains('flash')), at: u ? u.fromId : null, want: window.__target }; });
  T.check('clicking it opens the block at that place, highlighted', /m2/.test(landed.title) && landed.flash && landed.at === landed.want, landed);
  // More: each part explained when the pointer rests on it, and all of them in a list
  await page.evaluate(() => { const d = document.querySelector('.ct-panel .ct-more'); d.open = true; const h = d.querySelector('.ct-help'); if (h) h.open = true; });
  const help = await page.evaluate(() => {
    const m = document.querySelector('.ct-panel .ct-more');
    const by = (t) => [...m.querySelectorAll('.btn')].find((b) => b.textContent.trim() === t);
    return { crux: (by('† crux') || {}).title || '', lacuna: (by('Lacuna') || {}).title || '', chip: (by('lectio difficilior') || {}).title || '', sure: (m.querySelector('[aria-label="How sure"]') || {}).title || '', list: [...m.querySelectorAll('.ct-help dt')].map((x) => x.textContent) };
  });
  T.check('in More, crux, lacuna, certainty and each reason say what they are, with an example, when the pointer rests on them', /corrupt/.test(help.crux) && /E\.g\./.test(help.crux) && /lost here in every witness/.test(help.lacuna) && /harder reading/.test(help.chip) && /wavy line/.test(help.sure), help);
  T.check('and What these mean lists them all, to read', ['† crux', 'Lacuna', 'How sure?', 'lectio difficilior', 'usus scribendi', 'metre', 'emendation', 'conjecture', 'Join with the next word'].every((t) => help.list.includes(t)), help.list);
  await page.evaluate(() => { document.querySelector('.modal-foot .btn').click(); window.__pub.remove(); });
  await sleep(400);
  // the abbreviations of the apparatus: a table that says what each means, with an example, and a box to change it
  const abbr = await page.evaluate(async () => {
    const el = await ME.Steps.publish(window.ed, window.list, () => {});
    document.body.appendChild(el);
    const t = el.querySelector('.ap-abbr-table');
    const row = (k) => [...t.querySelectorAll('tbody tr')].find((r) => r.querySelector('input').getAttribute('aria-label').includes(k));
    const om = row('omittit');
    const out = { rows: t.querySelectorAll('tbody tr').length, heads: [...t.querySelectorAll('th')].map((x) => x.textContent), om: om.textContent, ex: om.querySelector('.ap-ex').textContent };
    const box = om.querySelector('input');
    box.value = 'deest in'; box.dispatchEvent(new Event('input'));
    out.live = om.querySelector('.ap-ex').textContent;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 300));
    out.saved = ME.Apparatus.abbr(window.ed).om;
    el.remove();
    return out;
  });
  T.check('How the apparatus is written has a table: printed as, stands for, meaning, example', abbr.rows === 20 && abbr.heads.join() === 'Printed as,Stands for,Meaning,Example' && /omittit/.test(abbr.om) && /does not have the words/.test(abbr.om) && /\] om\. B/.test(abbr.ex), abbr);
  T.check('writing another abbreviation shows it in the example at once, and the apparatus uses it', /\] deest in B/.test(abbr.live) && abbr.saved === 'deest in', abbr);
  const back = await page.evaluate(async () => {
    const el = await ME.Steps.publish(window.ed, window.list, () => {});
    document.body.appendChild(el);
    const b = el.querySelector('.ap-abbr-table button[title^="Back to"]');
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 300));
    el.remove();
    return { had: !!b, now: ME.Apparatus.abbr(window.ed).om };
  });
  T.check('and ↺ puts back the abbreviation of the set', back.had && back.now === 'om.', back);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
