// How much each screen shows at the Simple level, held to the targets of the usability roadmap; and a walk from
// witnesses to an exported edition that follows only what the screen says to do next.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, WORK } = require('./h');

// visible controls under a selector, leaving out the rows of tables (one per block or witness)
const COUNT = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return -1;
  const v = (e) => { const r = e.getBoundingClientRect(); const shut = e.closest('details'); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && !e.closest('tbody') && !(shut && !shut.open && !e.closest('summary')); };
  return [...root.querySelectorAll('button, select, input, textarea, summary')].filter(v).length;
};

(async () => {
  const T = checks('Simple, step by step');
  const { browser, page } = await launch('survey', { level: 'simple' });
  T.check('the start screen offers at most 5 controls to begin with', (await page.evaluate(COUNT, '.start-actions')) <= 5);
  await page.evaluate(async () => {
    const { Model, Store, Edition } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    const texts = {
      A: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      B: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेताः युयुत्सवः ।' + END, P('m2') + 'मामका पाण्डवाश्चैव किमकुर्वत सञ्जय ॥' + END],
      C: [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवाः ।' + END, P('m2') + 'मामकाः पाण्डवाश्चैव किमकुर्वत संजय ॥' + END],
    };
    const ed = Edition.create('Gītā');
    for (const [s, lines] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: lines.concat(['', '']) } } };
      await Store.putProject(p);
      ed.witnesses.push({ siglum: s, projectId: p.id, streams: {} });
    }
    ed.trust = ['A', 'B', 'C'];
    await Store.putEdition(ed);
    ME.Edition.stepOf[ed.id] = 'witnesses';
    await Edition.show(ed.id);
    window.edId = ed.id;
  });
  T.check('the edition bar has at most 6 controls', (await page.evaluate(COUNT, '.ed-bar')) <= 6, await page.evaluate(COUNT, '.ed-bar'));
  
  const nextLabel = () => page.evaluate(() => { const b = document.querySelector('[data-action="next"]'); return b ? b.textContent : null; });
  // the walk: only what the screen offers next
  const labels = [];
  labels.push(await nextLabel());
  T.check('with witnesses but nothing collated, the next thing is Collate', labels[0] === 'Collate', labels);
  T.check('step 1 shows at most 10 controls besides its rows', (await page.evaluate(COUNT, '.ed-stepbody')) <= 10, await page.evaluate(COUNT, '.ed-stepbody'));
  await page.evaluate(() => document.querySelector('[data-action="next"]').click());
  for (let k = 0; k < 60; k++) { await sleep(200); if (await page.evaluate(async () => !ME.CollateView.running && (await ME.Collate.summaries(window.edId)).size === 2)) break; }
  await sleep(800);
  T.check('following it collates every block', await page.evaluate(async () => (await ME.Collate.summaries(window.edId)).size === 2));
  T.check('step 2 shows at most 10 controls besides its rows', (await page.evaluate(COUNT, '.ed-stepbody')) <= 10, await page.evaluate(COUNT, '.ed-stepbody'));
  labels.push(await nextLabel());
  T.check('then the next thing is to decide, in the first block', labels[1] === 'Decide in m1', labels);
  // decide one place, with the keys, in the block the prompt opens
  await page.evaluate(() => document.querySelector('[data-action="next"]').click());
  await sleep(900);
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('n'); await sleep(200);
  T.check('a place shows at most 6 controls', (await page.evaluate(COUNT, '.ct-panel')) <= 6, await page.evaluate(COUNT, '.ct-panel'));
  await page.keyboard.press('a'); await sleep(300);
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(800);
  labels.push(await nextLabel());
  T.check('with a decision made, the next thing is Publish', labels[2] === 'Publish', labels);
  await page.evaluate(() => document.querySelector('[data-action="next"]').click());
  await sleep(600);
  T.check('step 3 shows at most 10 controls besides its rows', (await page.evaluate(COUNT, '.ed-stepbody')) <= 10, await page.evaluate(COUNT, '.ed-stepbody'));
  T.check('there are three steps', await page.evaluate(() => document.querySelectorAll('.ed-step').length === 3));
  // and export it
  const dl = path.join(WORK, 'downloads-survey');
  fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await page.evaluate(() => document.querySelector('.ed-stepbody [data-action="export"]').click());
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.modal input[name="xp-format"][value="pdf"]').click(); document.querySelector('.modal [data-action="export-go"]').click(); });
  for (let k = 0; k < 40 && !fs.readdirSync(dl).some((f) => f.endsWith('.pdf')); k++) await sleep(250);
  const pdf = fs.readdirSync(dl).find((f) => f.endsWith('.pdf'));
  T.check('from witnesses to a PDF, following only the prompts, one decision and Export', !!pdf && fs.statSync(path.join(dl, pdf)).size > 10000 && fs.readFileSync(path.join(dl, pdf)).slice(0, 5).toString() === '%PDF-', pdf);
  // help
  await page.evaluate(() => document.querySelector('[data-action="help"]').click());
  await sleep(300);
  T.check('the edition screen has its help, with the keys of a block', await page.evaluate(() => /step by step/.test(document.querySelector('.modal-head h2').textContent) && /Accept the proposal/.test(document.querySelector('.modal').innerText)));
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
