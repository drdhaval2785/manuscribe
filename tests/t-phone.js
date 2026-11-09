// Typing on a phone (390 px wide): on a calibrated folio the scan shows about 22 letters of a line, unless the device
// has a zoom of its own; along a long line the caret is kept in the middle of the typing area; ↑ and ↓ go to the line
// above or below without losing the caret; on a computer the arrows are not shown. Uses linear.pdf.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, ROOT } = require('./h');
(async () => {
  const T = checks('Typing on a phone');
  const pdf = path.join(ROOT, 'linear.pdf');
  if (!fs.existsSync(pdf)) { T.skip('all', 'linear.pdf is not in the repository folder'); T.done(); return; }
  const { browser, page } = await launch('phone-typing');
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Phone', siglum: 'P', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 8 }, lettersPerLine: 66, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      p.layout.regions['0'] = { leaf: [0.05, 0.05, 0.9, 0.9], boxes: { main: [0.12, 0.2, 0.76, 0.6] } };
      await ME.Store.putProject(p);
      await ME.Store.putPdf(p.id, blob);
      await ME.App.open(p.id);
      window.__pid = p.id;
    }, fs.readFileSync(pdf).toString('base64'));
    for (let k = 0; k < 60 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    await sleep(1200);
    const scan = () => page.evaluate(() => {
      const P = ME.PdfView, scroller = document.querySelector('.pdf-scroller'), stage = document.querySelector('.pdf-stage');
      const r = ME.Model.regions(ME.App.project, ME.App.entries[ME.App.idx]).boxes.main;
      const blockPx = r[2] * parseFloat(stage.style.width);
      return { zoom: +P.zoom.toFixed(2), blockPx: Math.round(blockPx), paneW: scroller.clientWidth, lettersAcross: +((66 * scroller.clientWidth) / blockPx).toFixed(1), device: ME.Narrow.state().pdf || null, narrow: ME.Narrow.on() };
    });
    const fit = await page.evaluate(() => ({ inner: innerWidth, docW: document.documentElement.scrollWidth, statusW: Math.round(document.getElementById('statusbar').getBoundingClientRect().width), fontBtn: getComputedStyle(document.getElementById('btn-font-down').parentElement).display }));
    T.check('the app is no wider than the phone, so the browser does not zoom the page out (the status bar fits, without the letter-size buttons)', fit.inner === 390 && fit.docW <= 390 && fit.statusW <= 390 && fit.fontBtn === 'none', fit);
    let s = await scan();
    T.check('on a calibrated folio the scan is zoomed to show about 22 letters of a line across the screen (' + s.lettersAcross + ')', s.narrow && s.lettersAcross > 19 && s.lettersAcross < 25.5 && !s.device, s);
    // ↑ and ↓
    const nav = await page.evaluate(() => {
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      return { up: shown('btn-line-up'), down: shown('btn-line-down') };
    });
    T.check('↑ and ↓ are in the status bar', nav.up && nav.down, nav);
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 0));
    await sleep(300);
    await page.click('#btn-line-down');
    await sleep(400);
    let at = await page.evaluate(() => { const l = ME.Editor.activeLine(); return l ? ME.Editor.posOf(l).i : null; });
    T.check('↓ goes to the line below, the caret kept', at === 3, at);
    await page.click('#btn-line-up');
    await page.click('#btn-line-up');
    await sleep(400);
    at = await page.evaluate(() => { const l = ME.Editor.activeLine(); return l ? ME.Editor.posOf(l).i : null; });
    T.check('↑ twice goes two lines up', at === 1, at);
    // a long line: the caret stays in the middle half of the typing area
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः');
    await sleep(900);
    const caret = await page.evaluate(() => {
      const pane = document.getElementById('editor-pane').getBoundingClientRect(), line = ME.Editor.activeLine().getBoundingClientRect();
      const r = getSelection().getRangeAt(0).cloneRange(); r.collapse(true); const c = r.getClientRects()[0] || { left: 0 };
      return { caretX: Math.round(c.left - pane.left), paneW: Math.round(pane.width), lineW: Math.round(line.width), scrolled: Math.round(document.getElementById('editor-pane').scrollLeft) };
    });
    T.check('along a line wider than the screen (' + caret.lineW + ' px) the caret is kept in the middle half', caret.lineW > caret.paneW && caret.caretX > caret.paneW * 0.2 && caret.caretX < caret.paneW * 0.8 && caret.scrolled > 0, caret);
    // the keyboard: the app is as tall as can be seen, follows the browser's scrolling, and the top bar steps aside
    const kb = await page.evaluate(() => {
      const r1 = ME.Narrow.viewport({ height: 362, offsetTop: 40 });
      const cs = getComputedStyle(document.documentElement);
      const open = { r: r1, h: cs.getPropertyValue('--app-h').trim(), top: cs.getPropertyValue('--app-top').trim(), cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, main: Math.round(document.getElementById('main').getBoundingClientRect().height), mainTop: Math.round(document.getElementById('main').getBoundingClientRect().top) };
      const r2 = ME.Narrow.viewport({ height: 844, offsetTop: 0 });
      const closed = { r: r2, cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, main: Math.round(document.getElementById('main').getBoundingClientRect().height) };
      return { open, closed };
    });
    T.check('with the keyboard open (362 px left, the page scrolled by 40): the app is 362 px tall, moved down by 40, and the top bar steps aside', kb.open.h === '362px' && kb.open.top === '40px' && kb.open.cls && kb.open.topbar === 'none' && kb.open.main === 362 && kb.open.mainTop === 40, kb.open);
    T.check('with the keyboard closed, all is as before', !kb.closed.cls && kb.closed.topbar !== 'none' && kb.closed.main === 844 - 46, kb.closed);
    // a keyboard that transliterates by itself (iOS's Hindi keyboard): Manuscribe's scheme steps aside
    const tl = await page.evaluate(() => {
      ME.App.project.settings.translit = 'itrans-deva';
      const line = ME.Editor.focusLine('main', 5, 0);
      const dt = new DataTransfer(); dt.setData('text/plain', 'समवेता');
      const ev = new InputEvent('beforeinput', { inputType: 'insertReplacementText', data: '', dataTransfer: dt, bubbles: true, cancelable: true });
      const stopped = !line.dispatchEvent(ev);
      return { stopped, translit: ME.App.project.settings.translit, badge: document.getElementById('translit-badge').textContent, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ') };
    });
    T.check('a keyboard that puts a transliterated word in place of the letters switches Manuscribe’s scheme off, and says so', tl.stopped && tl.translit === 'off' && /Unicode/.test(tl.badge) && /converts to Devanagari by itself/.test(tl.toast), tl);
    // the New transcription dialog on a phone: a sheet the height of the screen, its body scrolling, Cancel and Create in sight
    const dlg = await page.evaluate(async () => {
      const opening = ME.App.newProject();
      await new Promise((r) => setTimeout(r, 300));
      const m = document.querySelector('.modal'), body = m.querySelector('.modal-body'), foot = m.querySelector('.modal-foot');
      const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
      const create = [...foot.querySelectorAll('.btn')].find((b) => b.textContent === 'Create'), cancel = [...foot.querySelectorAll('.btn')].find((b) => b.textContent === 'Cancel');
      const title = m.querySelector('input[placeholder*="Haima"]'), siglum = m.querySelector('input[placeholder*="P1"]');
      const out = { modal: r(m), create: r(create), cancel: r(cancel), bodyScrolls: body.scrollHeight > body.clientHeight + 4, bodyH: body.clientHeight, inner: innerHeight, stacked: siglum.getBoundingClientRect().top >= title.getBoundingClientRect().bottom, createH: Math.round(create.getBoundingClientRect().height) };
      // the keyboard open: still within what can be seen
      ME.Narrow.viewport({ height: 362, offsetTop: 24 });
      await new Promise((r2) => setTimeout(r2, 50));
      out.kb = { modal: r(m), create: r(create), bodyScrolls: body.scrollHeight > body.clientHeight + 4 };
      ME.Narrow.viewport({ height: 844, offsetTop: 0 });
      cancel.click();
      await opening;
      out.closed = !document.querySelector('.modal');
      return out;
    });
    T.check('New transcription on a phone fills the screen, no wider than it, and its body scrolls', dlg.inner === 844 && dlg.modal.left >= 0 && dlg.modal.right <= 390 && dlg.modal.top >= 0 && dlg.modal.bottom <= dlg.inner && dlg.bodyScrolls, dlg);
    T.check('Cancel and Create are in sight, big enough for a thumb, and the two-column rows are stacked', dlg.create.bottom <= dlg.inner && dlg.create.top > 0 && dlg.cancel.bottom <= dlg.inner && dlg.createH >= 40 && dlg.stacked, dlg);
    T.check('with the keyboard open the dialog keeps to what can be seen, Create still in sight', dlg.kb.modal.top >= 24 && dlg.kb.modal.bottom <= 24 + 362 + 1 && dlg.kb.create.bottom <= 24 + 362 + 1 && dlg.kb.bodyScrolls, dlg.kb);
    T.check('Cancel closes it', dlg.closed);
    // a zoom of the device's own wins over the letters
    await page.evaluate(async () => { ME.Narrow.save({ pdf: 1.5 }); await ME.App.open(window.__pid); });
    for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(150);
    await sleep(900);
    s = await scan();
    T.check('a zoom the device has chosen (pinch, buttons) is kept instead', Math.abs(s.zoom - 1.5) < 0.05, s);
    // on a computer: no arrows
    await page.setViewport({ width: 1280, height: 800 });
    await sleep(600);
    const wide = await page.evaluate(() => ({ up: getComputedStyle(document.querySelector('.line-nav')).display, narrow: ME.Narrow.on() }));
    T.check('on a computer the arrows are not shown', !wide.narrow && wide.up === 'none', wide);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
