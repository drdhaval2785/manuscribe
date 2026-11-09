// What is drawn of a scan, for a phone's memory: only the part of the page that is shown (the leaf), placed where it
// falls on the page; the whole page in page mode; a few drawn pages kept, the oldest freed, fewer on a phone; and
// the leaf detection and the paper colour still right. Uses linear.pdf from the repository folder.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, ROOT } = require('./h');
(async () => {
  const T = checks('What is drawn of a scan');
  const pdf = path.join(ROOT, 'linear.pdf');
  if (!fs.existsSync(pdf)) { T.skip('all', 'linear.pdf is not in the repository folder'); T.done(); return; }
  const { browser, page } = await launch('scan');
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Scan', siglum: 'S' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      p.layout.regions['0'] = { leaf: [0.1, 0.15, 0.8, 0.7], boxes: { main: [0.15, 0.2, 0.7, 0.6] } };
      await ME.Store.putProject(p);
      await ME.Store.putPdf(p.id, blob);
      await ME.App.open(p.id);
      window.__pid = p.id;
    }, fs.readFileSync(pdf).toString('base64'));
    for (let k = 0; k < 60 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    const drawn = () => page.evaluate(() => {
      const stage = document.querySelector('.pdf-stage'), c = stage.querySelector('canvas');
      const live = [...ME.PdfView.cache.values()].map((v) => v.canvas);
      return { stageW: Math.round(parseFloat(stage.style.width)), stageH: Math.round(parseFloat(stage.style.height)), left: Math.round(parseFloat(c.style.left)), top: Math.round(parseFloat(c.style.top)), w: Math.round(parseFloat(c.style.width)), h: Math.round(parseFloat(c.style.height)), px: c.width * c.height, cache: ME.PdfView.cache.size, freed: live.filter((x) => x.width === 0).length, mode: ME.PdfView.mode, zoom: ME.PdfView.zoom };
    });
    let d = await drawn();
    T.check('in leaf mode only the leaf is drawn: a canvas of 80% × 70% of the page, placed at 10%, 15% of it', Math.abs(d.w - 0.8 * d.stageW) <= 2 && Math.abs(d.h - 0.7 * d.stageH) <= 2 && Math.abs(d.left - 0.1 * d.stageW) <= 2 && Math.abs(d.top - 0.15 * d.stageH) <= 2, d);
    const guide = await page.evaluate(() => { ME.Editor.focusLine('main', 2, 0); const g = document.querySelector('.pdf-guide'); return { hidden: g.hidden, left: g.style.left, top: g.style.top }; });
    T.check('the line guide is placed on the page as before', !guide.hidden && /^1[45]\.\d*%|^1[45]%/.test(guide.left) && parseFloat(guide.top) > 30 && parseFloat(guide.top) < 40, guide);
    await page.evaluate(async () => { await ME.PdfView.setMode('page'); });
    await sleep(300);
    d = await drawn();
    T.check('in page mode the whole page is drawn', d.left === 0 && d.top === 0 && Math.abs(d.w - d.stageW) <= 1 && Math.abs(d.h - d.stageH) <= 1, d);
    await page.evaluate(async () => { await ME.PdfView.setMode('leaf'); });
    // many zoom levels: the cache stays bounded and what it lets go is freed
    for (const z of [1.5, 2, 2.5, 3, 3.5, 4, 4.5]) { await page.evaluate(async (z) => { await ME.PdfView.setZoom(z); }, z); }
    await sleep(300);
    d = await drawn();
    const canvases = await page.evaluate(() => ({ inPage: document.querySelectorAll('.pdf-stage canvas').length, big: [...document.querySelectorAll('canvas')].filter((c) => c.width > 0 && !c.closest('.pdf-stage')).length }));
    T.check('on a computer at most five drawn pages are kept, and none of them has been freed', d.cache <= 5 && d.cache >= 3 && d.freed === 0, d);
    T.check('one canvas is in the page', canvases.inPage === 1, canvases);
    // the leaf detection: run on the drawn part, it answers in the page's measure
    const det = await page.evaluate(() => { const r = ME.PdfView.detectLeaf(); return r && r.map((v) => +v.toFixed(2)); });
    T.check('the leaf detection answers in the page’s measure, within the part drawn', !det || (det[0] >= 0.1 - 0.01 && det[0] + det[2] <= 0.9 + 0.01 && det[1] >= 0.15 - 0.01 && det[1] + det[3] <= 0.85 + 0.01), det);
    const paper = await page.evaluate(() => getComputedStyle(document.getElementById('editor-pane')).getPropertyValue('--paper') || getComputedStyle(document.querySelector('#folio') || document.body).backgroundColor);
    T.check('the paper colour is still taken from the scan', !!paper && paper !== 'rgba(0, 0, 0, 0)', paper);
    // a phone: two pages kept, and a canvas of at most 12 megapixels
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await sleep(800);
    for (const z of [2, 3, 4, 5]) { await page.evaluate(async (z) => { await ME.PdfView.setZoom(z); }, z); }
    await sleep(300);
    d = await drawn();
    T.check('on a phone two drawn pages are kept and a canvas has at most 12 megapixels (' + (d.px / 1e6).toFixed(1) + ')', d.cache <= 2 && d.px <= 12e6, d);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
