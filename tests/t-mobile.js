// Phones and tablets. On a phone (390 × 844, touch), transcription is a line view: the letters of the typing area
// and the scan enlarged together until they can be read, with the device's own sizes (the project's are left as
// they are); the folio bar on one row, the tags in a panel from the bottom of the screen that closes when one is
// chosen; buttons big enough for a finger; no page that scrolls sideways; wide tables with the column that names the
// row in view; calibration by touch: a finger draws, two fingers pinch to zoom. On a tablet held upright (820 ×
// 1180) the folio keeps the project's sizes and the tags are in the same panel. On a computer, nothing of this.
const { launch, sleep, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

// a scan, drawn here: a leaf with eight lines of "text", as a one-page PDF
function scanPdf() {
  let ops = '0.93 0.88 0.76 rg 30 30 782 340 re f 0.2 0.12 0.08 rg\n';
  for (let k = 0; k < 8; k++) for (let x = 70; x < 760; x += 46) ops += x + ' ' + (330 - k * 38) + ' ' + (30 + (x * 7 + k * 13) % 12) + ' 14 re f\n';
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 842 400]/Contents 4 0 R>>', '<</Length ' + ops.length + '>>\nstream\n' + ops + 'endstream'];
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(out, 'latin1').toString('base64');
}

(async () => {
  const T = checks('Phones and tablets');
  const { browser, page } = await launch('mobile');
  try {
    const open = async (w, h, touch) => {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: !!touch, hasTouch: !!touch });
      await page.evaluate(async (b64) => {
        if (!window.__pid) {
          localStorage.removeItem('manuscribe.narrow');
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const p = ME.Model.newProject({ meta: { title: 'Phone', siglum: 'P', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'scan.pdf', bytes: bytes.length } });
          const info = await ME.PdfView.load(blob);
          p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
          p.pages = { [ME.Model.entries(p)[0].label]: { boxes: { main: ['श्रीगणेशाय नमः ॥ अथ जिनस्तुतिः प्रारभ्यते ॥', 'दूसरी पंक्ति यहाँ', '', '', '', '', '', ''] } } };
          await ME.Store.putProject(p); await ME.Store.putPdf(p.id, blob);
          window.__pid = p.id;
        }
        await ME.App.open(window.__pid);
      }, scanPdf());
      for (let k = 0; k < 30 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(150);
      await sleep(600);
      await page.evaluate(() => ME.Editor.focusLine('main', 0, 3));
      await sleep(300);
    };
    const look = () => page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
      const line = document.querySelector('#editor-pane .line:not(.mline)');
      const shown = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const small = [...document.querySelectorAll('#topbar button, #statusbar button, #midbar button, .pdf-tools button')].filter((b) => shown(b)).filter((b) => { const x = b.getBoundingClientRect(); return x.height < 32 || x.width < 28; }).map((b) => b.id || b.className);
      return {
        vw: window.innerWidth, docW: document.documentElement.scrollWidth, font: line ? parseFloat(getComputedStyle(line).fontSize) : 0,
        edZoom: ME.Editor.zoom, pdfZoom: ME.PdfView.zoom, mid: r('#midbar').height, tags: shown(document.getElementById('btn-tags')), toolbar: shown(document.getElementById('toolbar')),
        // (buttons for a finger where the pointer is one: Playwright's Firefox and WebKit here are not touch screens)
        small: matchMedia('(pointer: coarse)').matches ? small : [], projectUi: { ed: ME.App.project.ui.editorZoom || 1, pdf: ME.App.project.ui.pdfZoom || 1 },
      };
    });

    // a phone
    await open(390, 844, true);
    const phone = await look();
    T.check('on a phone the letters of the typing area are enlarged until they can be read (' + phone.font.toFixed(1) + ' px), and the scan with them', phone.font >= 15 && phone.edZoom > 1.5 && Math.abs(phone.pdfZoom - phone.edZoom) < 0.05, phone);
    T.check('the folio bar is one row, with a Tags button; buttons are big enough for a finger; no page scrolls sideways', phone.mid <= 56 && phone.tags && !phone.toolbar && !phone.small.length && phone.docW <= phone.vw, phone);
    T.check('the sizes are the device’s own: the project’s stay as they were', phone.projectUi.ed === 1 && phone.projectUi.pdf === 1, phone.projectUi);
    const sheet = await page.evaluate(async () => {
      document.getElementById('btn-tags').click();
      await new Promise((r) => setTimeout(r, 100));
      const tb = document.getElementById('toolbar');
      const b = tb.getBoundingClientRect();
      const btns = [...tb.querySelectorAll('.tb-btn')];
      const open = { shown: getComputedStyle(tb).display !== 'none', atBottom: Math.abs(b.bottom - window.innerHeight) < 2, n: btns.length, big: btns.every((x) => x.getBoundingClientRect().height >= 40) };
      // a word chosen, then a tag: applied, and the panel closes
      ME.Editor.focusLine('main', 1, 0);
      const line = document.activeElement;
      const range = document.createRange(); const node = line.firstChild; range.setStart(node, 0); range.setEnd(node, 5);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      tb.querySelector('.tb-del, [data-cmd="del"]').click();
      await new Promise((r) => setTimeout(r, 150));
      return Object.assign(open, { closed: !document.body.classList.contains('tags-open') && getComputedStyle(tb).display === 'none', tagged: /<del/.test(ME.App.project.pages[ME.Model.entries(ME.App.project)[0].label].boxes.main[1] || '') || !!document.querySelector('#editor-pane .line [data-t="del"], #editor-pane .line .t-del, #editor-pane del') });
    });
    T.check('the tags open from the bottom of the screen, as big buttons; one chosen is applied, and the panel closes', sheet.shown && sheet.atBottom && sheet.n > 15 && sheet.big && sheet.closed && sheet.tagged, sheet);
    // zooming on the phone: kept for this device
    const kept = await page.evaluate(() => { document.getElementById('btn-ed-in').click(); return { st: JSON.parse(localStorage.getItem('manuscribe.narrow') || '{}'), project: ME.App.project.ui.editorZoom || 1 }; });
    T.check('a zoom chosen on the phone is kept for the phone, not written into the project', kept.st.ed > 1.5 && kept.project === 1, kept);

    // calibration by touch: a finger draws, two pinch
    const cal = await page.evaluate(async () => {
      const done = ME.App.calibrate();
      for (let k = 0; k < 30 && !document.querySelector('.calib-bar:not([hidden]) .calib-step'); k++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));
      const ov = document.querySelector('.pdf-overlay');
      const touchAction = getComputedStyle(ov).touchAction;
      const st = document.querySelector('.pdf-stage').getBoundingClientRect();
      const ev = (type, id, x, y, target) => (target || window).dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      const x0 = st.left + 20, y0 = st.top + 20;
      ev('pointerdown', 1, x0, y0, ov); ev('pointermove', 1, x0 + 80, y0 + 50); ev('pointermove', 1, x0 + 150, y0 + 90); ev('pointerup', 1, x0 + 150, y0 + 90);
      await new Promise((r) => setTimeout(r, 100));
      const drawn = !!document.querySelector('.calib-rect');
      const z0 = ME.PdfView.calibScale;
      const cx = st.left + st.width / 2, cy = st.top + Math.min(st.height, 200) / 2;
      ev('pointerdown', 1, cx - 30, cy, ov); ev('pointerdown', 2, cx + 30, cy, ov);
      for (let k = 1; k <= 6; k++) { ev('pointermove', 1, cx - 30 - k * 15, cy); ev('pointermove', 2, cx + 30 + k * 15, cy); await new Promise((r) => setTimeout(r, 60)); }
      ev('pointerup', 1, cx - 120, cy); ev('pointerup', 2, cx + 120, cy);
      await new Promise((r) => setTimeout(r, 400));
      const z1 = ME.PdfView.calibScale;
      const rects = document.querySelectorAll('.calib-rect').length;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await done;
      return { touchAction, drawn, z0, z1, rects };
    });
    T.check('calibration by touch: a finger draws the box, two fingers pinch to zoom (and draw nothing)', cal.touchAction === 'none' && cal.drawn && cal.z1 > cal.z0 * 1.3 && cal.rects === 1, cal);

    // a tablet held upright
    await page.evaluate(() => localStorage.removeItem('manuscribe.narrow'));
    await open(820, 1180, true);
    const tab = await look();
    T.check('on a tablet held upright the folio keeps the project’s sizes, the tags are in the panel, and no page scrolls sideways', tab.edZoom === 1 && tab.tags && !tab.toolbar && tab.mid <= 56 && !tab.small.length && tab.docW <= tab.vw, tab);
    // a computer: as before
    await open(1500, 1000, false);
    const desk = await look();
    T.check('on a computer, nothing of this: the toolbar as before, the project’s sizes', desk.edZoom === 1 && !desk.tags && desk.toolbar, desk);

    // the edition's wide tables on a phone
    // (a page made mobile is loaded again: first the size, then the edition)
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await sleep(800);
    await buildInPage(page, LANGS.sa, make('sa', 3, 1, 10, 3), 10);
    const tbl = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      await ME.Edition.show(ed.id);
      await new Promise((r) => setTimeout(r, 500));
      const b = [...document.querySelectorAll('#edition-view .ed-step')].find((x) => x.dataset.action === 'step-collate');
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 800));
      const t = document.querySelector('.cv-units table');
      if (!t) return { none: true };
      const first = t.querySelector(t.classList.contains('has-sample') ? 'tbody td:nth-child(2)' : 'tbody td:first-child');
      const box = t.closest('.ed-scroll');
      return { sticky: getComputedStyle(first).position, scrolls: box.scrollWidth > box.clientWidth, docW: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    T.check('the edition’s wide tables scroll sideways in their box, the column naming the block staying in view', tbl.sticky === 'sticky' && tbl.docW <= tbl.vw, tbl);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
