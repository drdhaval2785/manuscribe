// The start screen and the transcription screen, made lighter: three actions to begin with, one Open… that knows a
// project file, an XML transcription and an edition package; a top bar of a few controls; the PDF's view in a menu;
// and the Manuscript tab in folds.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, WORK, SAMPLE } = require('./h');

(async () => {
  const T = checks('A lighter start and transcription screen');
  const { browser, page } = await launch('tidy', { level: 'simple' });
  const start = await page.evaluate(() => ({ actions: [...document.querySelectorAll('.start-actions .btn')].map((b) => b.textContent.trim()), tagline: document.querySelector('.tagline').textContent, old: !!document.getElementById('btn-import') || !!document.getElementById('btn-import-edition') }));
  T.check('the start screen has three actions: New transcription, New edition, Open…', start.actions.join('|') === '＋ New transcription|＋ New edition|Open…' && !start.old, start);
  T.check('and says what Manuscribe is for in any language', /any script/.test(start.tagline) && !/Sanskrit/.test(start.tagline), start.tagline);
  // Open…, with each kind of file
  const dir = path.join(WORK, 'tidy'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const projectJson = await page.evaluate(() => { const p = ME.Model.upgrade(ME.Model.newProject({ meta: { title: 'Opened', siglum: 'O' }, layoutType: 'linear', lines: { main: 4 }, folios: {} })); p.pages = { '1r': { boxes: { main: ['पहिला', '', '', ''] } } }; return JSON.stringify({ project: p }); });
  fs.writeFileSync(path.join(dir, 'opened.json'), projectJson);
  fs.writeFileSync(path.join(dir, 'opened.xml'), '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><p xml:id="p1"><pb n="0001_1"/><lb n="1"/>राम</p></body></text></TEI>');
  const open = async (file) => { const [ch] = await Promise.all([page.waitForFileChooser(), page.click('#btn-open')]); await ch.accept([file]); await sleep(1200); };
  await open(path.join(dir, 'opened.json'));
  T.check('Open… opens a project file', await page.evaluate(() => !!ME.App.project && ME.App.project.meta.title === 'Opened' && !document.body.classList.contains('no-project')));
  // the transcription screen
  const vis = (sel) => page.evaluate((sel) => { const root = document.querySelector(sel); const v = (e) => { const r = e.getBoundingClientRect(); const shut = e.closest('details'); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && !(shut && !shut.open && !e.closest('summary')); }; return [...root.querySelectorAll('button, select, input, summary, textarea')].filter(v).map((e) => e.textContent.trim() || e.getAttribute('aria-label') || e.tagName); }, sel);
  const bar = await vis('#topbar');
  T.check('the top bar has at most 7 controls, with Export… and no Backup or Layout (' + bar.length + ')', bar.length <= 7 && bar.includes('Export…') && !bar.includes('Backup') && !bar.some((b) => /Layout/.test(b)), bar);
  const pdfBar = await page.evaluate(() => { const m = document.querySelector('.pdf-view'); return m ? [...m.querySelectorAll('.menu-items .pbtn')].map((b) => b.textContent.trim()) : null; });
  T.check('the PDF’s Leaf, Rotate and Brightness are in one View menu', pdfBar && pdfBar.length === 3 && /Leaf/.test(pdfBar[0]), pdfBar);
  await page.evaluate(() => document.querySelector('[data-tab="ms"]').click());
  await sleep(300);
  const ms = await vis('#tab-ms');
  const folds = await page.evaluate(() => [...document.querySelectorAll('#tab-ms .ms-fold > summary')].map((x) => x.textContent));
  T.check('the Manuscript tab is in folds: About, Folios, Bring in text, Project file', ['About the manuscript', 'Folios and numbering', 'Bring in text', 'Project file and backups'].every((f) => folds.includes(f)), folds);
  const about = await page.evaluate(() => { const d = document.querySelector('#tab-ms .ms-fold'); return [...d.querySelectorAll('input, select, textarea')].length; });
  const outside = ms.length - about;
  T.check('besides the manuscript’s own fields, the tab shows at most 12 controls (' + outside + ')', outside <= 12, ms);
  await page.evaluate(() => { const d = [...document.querySelectorAll('#tab-ms .ms-fold')].find((x) => /Folios/.test(x.textContent)); d.open = true; });
  T.check('the default layout is chosen in the Folios fold', await page.evaluate(() => !![...document.querySelectorAll('#tab-ms .ms-fold[open] select')].find((s) => [...s.options].some((o) => o.value === 'pancapatha'))));
  // Open… with an XML transcription: a new transcription, from it
  await page.evaluate(() => ME.App.showStart());
  await sleep(400);
  await open(path.join(dir, 'opened.xml'));
  T.check('Open… with XML starts a new transcription from it', await page.evaluate(() => { const m = document.querySelector('.modal'); return !!m && /opened\.xml/.test(m.innerText); }));
  await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].find((x) => /cancel/i.test(x.textContent)) || document.querySelector('.modal-head .icon-btn'); if (b) b.click(); });
  await sleep(300);
  if (fs.existsSync(SAMPLE)) {
    await open(SAMPLE);
    T.check('Open… with an edition package opens the edition', await page.evaluate(() => !!ME.Edition.current && !document.getElementById('edition-view').hidden));
  } else T.skip('Open… with an edition package', 'the owner’s package is not on this computer');
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
