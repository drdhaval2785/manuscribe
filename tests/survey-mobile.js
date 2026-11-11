// A gallery of the app on a phone (390 × 844), a phone held sideways (844 × 390), a tablet held upright (820 × 1180)
// and a tablet held sideways (1180 × 820): a screenshot of each screen into a folder, with the audit's figures
// (what runs past the right edge, controls too small for a finger, text under 12 px) in survey.log beside them.
// Not a test, and run.js does not run it: for looking through after a change to the layout.
//
//   node tests/survey-mobile.js [folder, ~/Downloads/manuscribe-survey]
//
// Uses linear.pdf from the repository folder for the scan.
const fs = require('fs'), path = require('path'), os = require('os');
const { launch, sleep, audit, ROOT } = require('./h');

(async () => {
  const out = process.argv[2] || path.join(os.homedir(), 'Downloads', 'manuscribe-survey');
  fs.mkdirSync(out, { recursive: true });
  const pdf = path.join(ROOT, 'linear.pdf');
  if (!fs.existsSync(pdf)) { console.log('linear.pdf is not in the repository folder'); process.exit(1); }
  const { browser, page } = await launch('survey-mobile', { touch: true });
  const log = [];
  const say = (m) => { console.log(m); log.push(m); };
  const shot = async (name) => {
    const a = await audit(page);
    say(name + ': ' + a.W + ' px wide' + (a.docW > a.W ? ', SCROLLS SIDEWAYS (' + a.docW + ')' : '') + (a.over.length ? ' · past the edge: ' + a.over.join(' | ') : '') + (a.small.length ? ' · small: ' + a.small.join(' | ') : '') + (a.tiny.length ? ' · text under 12 px: ' + a.tiny.join(' | ') : '') + (!a.over.length && !a.small.length && !a.tiny.length && a.docW <= a.W ? ' · clean' : ''));
    await page.screenshot({ path: path.join(out, name + '.png') });
  };
  const close = () => page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); });
  // a calibrated witness and a fresh one, with a scan; an edition of the two
  const ids = await page.evaluate(async (b64) => {
    localStorage.removeItem('manuscribe.narrow');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const made = {};
    for (const [key, calibrated] of [['cal', true], ['raw', false]]) {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: calibrated ? 'Calibrated witness' : 'Fresh witness', siglum: calibrated ? 'A' : 'B', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 8 }, lettersPerLine: 66, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      if (calibrated) p.layout.regions['0'] = { leaf: [0.05, 0.05, 0.9, 0.9], boxes: { main: [0.12, 0.2, 0.76, 0.6] } };
      p.pages = { [ME.Model.entries(p)[0].label]: { boxes: { main: ['<x-marker type="p-start" id="b1"/>श्रीगणेशाय नमः ॥ अथ जिनस्तुतिः प्रारभ्यते ॥ धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः<x-marker type="p-end"/>', 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय', '', '', '', '', '', ''] } } };
      p.ui.sidebar = false;
      await ME.Store.putProject(p); await ME.Store.putPdf(p.id, blob);
      made[key] = p.id;
    }
    const { Store, Edition, Collate, Model } = ME;
    const ed = Edition.create('Jinastuti');
    const list = [];
    for (const id of [made.cal, made.raw]) { const p = Model.upgrade(await Store.getProject(id)); const w = { siglum: p.meta.siglum, projectId: p.id, streams: {} }; ed.witnesses.push(w); list.push({ w, p }); }
    ed.trust = ['A', 'B'];
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'main', {});
    ME.Features.save({ level: 'full' });
    made.ed = ed.id;
    return made;
  }, fs.readFileSync(pdf).toString('base64'));
  const openProject = async (id) => {
    await page.evaluate(async (id) => { await ME.App.open(id); }, id);
    for (let k = 0; k < 60 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    await sleep(1000);
    await page.evaluate(() => ME.Editor.focusLine('main', 0, 3));
    await sleep(400);
  };
  for (const [name, w, h] of [['phone', 390, 844], ['phone-sideways', 844, 390], ['tablet', 820, 1180], ['tablet-sideways', 1180, 820]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await sleep(400);
    say('== ' + name + ' ' + w + '×' + h);
    await page.evaluate(() => ME.App.showStart());
    await sleep(500);
    await shot(name + '-01-start');
    await openProject(ids.cal);
    await shot(name + '-02-transcribe');
    await page.evaluate(() => ME.Narrow.toggleTags(true));
    await sleep(300);
    await shot(name + '-03-tags');
    await page.evaluate(() => ME.Narrow.toggleTags(false));
    await page.evaluate(() => ME.App.toggleSidebar(true));
    await sleep(300);
    await shot(name + '-04-side-panel');
    await page.evaluate(() => ME.App.toggleSidebar(false));
    await page.evaluate(() => document.getElementById('btn-settings').click());
    await sleep(400);
    await shot(name + '-05-settings');
    await close();
    await page.evaluate(() => document.getElementById('btn-export').click());
    await sleep(400);
    await shot(name + '-06-export');
    await close();
    await openProject(ids.raw);
    await shot(name + '-07-fresh');
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => { window.__cal = ME.App.calibrate(); });
    await sleep(1200);
    await shot(name + '-08-calibrating');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.calib-bar button')].find((x) => /Next|Skip/.test(x.textContent)); if (b) b.click(); });
    await sleep(500);
    await shot(name + '-09-calibrating-step-2');
    await page.evaluate(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await window.__cal; });
    await sleep(300);
    await close();
    for (const step of ['witnesses', 'collate', 'publish']) {
      await page.evaluate(async (id, step) => { ME.Edition.stepOf[id] = step; await ME.Edition.show(id); }, ids.ed, step);
      await sleep(600);
      await shot(name + '-10-edition-' + step);
    }
    await page.evaluate(async (id) => { ME.Edition.stepOf[id] = 'collate'; await ME.Edition.show(id); }, ids.ed);
    await sleep(500);
    await page.evaluate(() => document.querySelector('#edition-view [data-action="open-block"]').click());
    await sleep(1200);
    await shot(name + '-11-block');
    await page.evaluate(() => { const u = document.querySelector('.ct-text .ct-u:not(.d-same)') || document.querySelector('.ct-text .ct-u'); if (u) u.click(); });
    await sleep(500);
    await shot(name + '-12-block-place');
    await close();
    await sleep(300);
    await page.evaluate(() => document.querySelector('#edition-view [data-action="work-apparatus"]').click());
    await sleep(1200);
    await shot(name + '-13-work-apparatus');
    await close();
    await sleep(300);
    await page.evaluate(() => document.querySelector('.ed-bar [data-action="export"]').click());
    await sleep(600);
    await shot(name + '-14-edition-export');
    await close();
  }
  fs.writeFileSync(path.join(out, 'survey.log'), log.join('\n') + '\n');
  console.log('Written to ' + out);
  await browser.close();
})().catch((e) => { console.log('crashed ' + e.stack); process.exit(1); });
