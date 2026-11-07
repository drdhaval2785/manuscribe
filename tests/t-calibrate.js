// Calibration in one pane: while the leaf and the blocks are drawn, the PDF takes the whole window (the typing area,
// which has nothing to show meanwhile, steps aside); it can be zoomed in to draw closely, and a box drawn when zoomed
// in is where it was drawn on the page; after it, the typing area is back as it was.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, ROOT } = require('./h');

(async () => {
  const T = checks('Calibration in one pane');
  const pdf = path.join(ROOT, 'linear.pdf');
  if (!fs.existsSync(pdf)) { T.skip('all', 'linear.pdf is not in the repository folder'); T.done(); return; }
  const { browser, page } = await launch('calibrate');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const p = ME.Model.newProject({ meta: { title: 'Calibrate', siglum: 'K' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
    const info = await ME.PdfView.load(blob);
    p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
    await ME.Store.putProject(p);
    await ME.Store.putPdf(p.id, blob);
    await ME.App.open(p.id);
  }, fs.readFileSync(pdf).toString('base64'));
  for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
  const size = () => page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width), shown: getComputedStyle(e).display !== 'none' }; };
    const c = document.querySelector('.pdf-stage canvas');
    return { main: r('main'), pdf: r('pdf-pane'), editor: r('editor-pane'), canvas: c ? Math.round(c.getBoundingClientRect().height) : 0, scrollH: document.querySelector('.pdf-scroller').scrollHeight, zoom: (document.querySelector('.calib-fit') || {}).textContent };
  });
  const before = await size();
  page.evaluate(() => { window.calib = ME.App.calibrate(); });
  for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.calib-bar:not([hidden]) .calib-step'))); k++) await sleep(100);
  await sleep(300);
  const during = await size();
  T.check('while calibrating, the PDF takes the whole window and the typing area steps aside', !during.editor.shown && during.pdf.h >= during.main.h - 2 && during.pdf.h > before.pdf.h * 1.8, { before, during });
  T.check('the page is drawn larger than in the half pane', during.canvas > before.canvas * 1.3, { before: before.canvas, during: during.canvas });
  // zoom in, then draw the leaf
  await page.evaluate(() => [...document.querySelectorAll('.calib-zoom button')].pop().click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('.calib-zoom button')].pop().click());
  await sleep(400);
  const zoomed = await size();
  T.check('it can be zoomed in, and the page then scrolls', zoomed.zoom === '156%' && zoomed.canvas > during.canvas * 1.4 && zoomed.scrollH > zoomed.pdf.h, zoomed);
  const box = await page.evaluate(() => { const b = document.querySelector('.pdf-stage').getBoundingClientRect(), s = document.querySelector('.pdf-scroller').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, sx: s.left, sy: s.top, sw: s.width, sh: s.height }; });
  // a rectangle inside what is in view
  const x0 = Math.max(box.x, box.sx) + 40, y0 = Math.max(box.y, box.sy) + 40;
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + 200, y0 + 150, { steps: 5 }); await page.mouse.up();
  await sleep(200);
  const drawn = await page.evaluate(() => { const r = document.querySelector('.calib-rect'); return r ? [r.style.left, r.style.top, r.style.width, r.style.height].map(parseFloat) : null; });
  const want = [((x0 - box.x) / box.w) * 100, ((y0 - box.y) / box.h) * 100, (200 / box.w) * 100, (150 / box.h) * 100];
  T.check('a box drawn when zoomed in is where it was drawn on the page', drawn && drawn.every((v, i) => Math.abs(v - want[i]) < 0.6), { drawn, want });
  // cancel: back as before
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.calib);
  await sleep(500);
  const after = await size();
  T.check('afterwards the typing area is back as it was', after.editor.shown && Math.abs(after.pdf.h - before.pdf.h) < 3 && Math.abs(after.editor.w - before.editor.w) < 3 && Math.abs(after.canvas - before.canvas) < 3, { before, after });
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
