// The screens, driven as an editor would: copying several lines; and, with the owner's package, the trust order,
// the text view, the apparatus, the workbench and the reader file opened from disk with no network.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, importSample, WORK } = require('./h');
(async () => {
  const { browser, page } = await launch('screens');
  const T = checks('Screens');
  // copying several lines
  await page.evaluate(async () => {
    const p = ME.Model.newProject({ meta: { title: 'Test', siglum: 'T' }, layoutType: 'linear', lines: { main: 6 }, folios: {} });
    p.pdf = { name: 'x.pdf', pages: 1 };
    p.pages = { '1r': { boxes: { main: ['पहिला वाक्य ', 'दूसरी <del rend="crossed out">पंक्ति</del> यहाँ', 'आगे तीसरी ', '', '', ''] } } };
    await ME.Store.putProject(p);
    await ME.App.open(p.id);
  });
  await sleep(500);
  const copied = await page.evaluate(() => {
    ME.Editor.focusLine('main', 0, 0);
    ME.Editor.setMulti({ box: 'main', i: 0, offset: 0 }, { box: 'main', i: 2, offset: 4 });
    const dt = new DataTransfer();
    document.activeElement.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return { plain: dt.getData('text/plain'), lines: dt.getData('application/x-manuscribe-lines') };
  });
  T.check('copying a selection over three lines gives three lines', copied.plain.split('\n').length === 3, copied.plain);
  T.check('and their markup for pasting back', /<del/.test(copied.lines));
  await page.evaluate(() => ME.App.showStart());
  await sleep(400);
  if (!(await importSample(page))) { T.skip('edition screens', 'the owner\'s package is not on this computer'); T.done(page); await browser.close(); return; }
  const dl = path.join(WORK, 'downloads');
  fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const click = (t, sel = '#edition-view .btn') => page.evaluate((t, sel) => { const b = [...document.querySelectorAll(sel)].find((x) => x.textContent === t); if (!b) return false; b.click(); return true; }, t, sel);
  await click('Collate'); await sleep(400);
  T.check('the first Collate asks for the trust order', await page.evaluate(() => /trust most/.test((document.querySelector('.modal-head h2') || {}).textContent || '')));
  await click('Save and collate', '.modal-foot .btn');
  for (let k = 0; k < 40; k++) { await sleep(200); if (await page.evaluate(() => !ME.CollateView.running && !document.querySelector('.modal-backdrop'))) break; }
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll('.cv-units button.link')][0].click());
  await sleep(700);
  const textView = await page.evaluate(() => ({ marked: document.querySelectorAll('.ct-text .ct-u').length, status: document.querySelector('.cv-count').textContent }));
  T.check('the text view marks the differing words', textView.marked > 5, textView);
  await page.evaluate(() => document.querySelector('.ct-text').focus());
  await page.keyboard.press('n'); await sleep(150); await page.keyboard.press('a'); await sleep(300);
  T.check('A makes the proposal a decision', await page.evaluate(() => /decision/.test(document.querySelector('.cv-count').textContent)));
  await click('Apparatus', '.cv-view .btn'); await sleep(500);
  const lit = await page.evaluate(() => { const w = document.querySelector('.ap-text .ap-u'); w.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return document.querySelectorAll('.ap-hl').length; });
  T.check('pointing at a word lights up its entry', lit >= 2, lit);
  await click('Reader (one HTML file)', '.cv-view .btn'); await sleep(1500);
  await click('Close', '.modal-foot .btn'); await sleep(500);
  await click('Stemmatics…'); await sleep(1200);
  T.check('the workbench opens with agreement and a tree', await page.evaluate(() => document.querySelectorAll('.sv-heat td.num').length > 0 && document.querySelectorAll('.sv-tree .sv-leaf').length === 3));
  T.check('no stray null on the workbench', await page.evaluate(() => !/(^|\n)null(\n|$)|undefined|NaN/.test(document.querySelector('.sv').innerText)));
  await browser.close();
  // the reader, from disk, with every request watched
  const html = fs.readdirSync(dl).find((f) => f.endsWith('.html'));
  T.check('the reader file was saved', !!html);
  if (html) {
    const puppeteer = require('puppeteer-core');
    const b2 = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const p2 = await b2.newPage();
    const requests = [];
    await p2.setRequestInterception(true);
    p2.on('request', (r) => { requests.push(r.url()); r.continue(); });
    await p2.goto('file://' + path.join(dl, html), { waitUntil: 'load' }); await sleep(400);
    T.check('the reader shows the text and its apparatus', await p2.evaluate(() => document.querySelectorAll('.u').length > 5 && document.querySelectorAll('ol.app li').length > 5));
    T.check('the reader asks nothing of the network', requests.every((u) => u.startsWith('file://') || u.startsWith('data:')), requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:')));
    await b2.close();
  }
  T.done();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
