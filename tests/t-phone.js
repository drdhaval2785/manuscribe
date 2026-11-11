// Typing on a phone (390 px wide): the typing area shows three lines - the line being typed, the one above and the
// one below - each a strip the width of the screen scrolling along its own text, with the notes of the line under it,
// and the scan about three lines of the page (the whole folio a button away), the top bar staying while the keyboard
// is open; on a calibrated folio the scan shows
// two of the three parts of a line, the first two until the letter typed passes the middle, then the last two, not
// sliding meanwhile (nor back for a letter corrected there), unless the device has a zoom of its own; along a long
// line the caret is kept in the middle of the strip; a long press opens the tags; ↑ and ↓ (in the folio bar), and a
// swipe up or down on the strips, go to the line above or below without
// losing the caret; the status bar makes way for the text, its position line fixed at the top of the typing area
// with − / + for the lines; ⌖ Calibrate in the folio bar though the folio is calibrated, the scan's controls in the
// bar's ⋯ menu and nothing over the scan; with the keyboard
// open (the window kept, or shrunk for it) the scan keeps three lines and the typing area three strips; on a
// computer the arrows are not shown. Uses linear.pdf.
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
      return { zoom: +P.zoom.toFixed(2), blockPx: Math.round(blockPx), paneW: scroller.clientWidth, partsAcross: +((3 * scroller.clientWidth) / blockPx).toFixed(2), device: ME.Narrow.state().pdf || null, narrow: ME.Narrow.on() };
    });
    const fit = await page.evaluate(() => { const mid = document.getElementById('midbar').getBoundingClientRect(), cal = document.getElementById('btn-calibrate'); return { inner: innerWidth, docW: document.documentElement.scrollWidth, midW: Math.round(mid.width), midH: Math.round(mid.height), status: getComputedStyle(document.getElementById('statusbar')).display, fontBtn: getComputedStyle(document.getElementById('btn-font-down').parentElement).display, head: !!document.querySelector('#editor-pane .lv-head #status-pos'), nav: !!document.querySelector('#midbar .line-nav'), menu: ['btn-view', 'translit-badge', 'ed-zoom', 'btn-zoom-in', 'pdf-zoom', 'btn-pdf-mode', 'btn-rotate', 'btn-filters'].every((id) => !!document.getElementById(id).closest('#midbar details.more-menu')), cal: !cal.hidden && cal.textContent === '⌖' && !!cal.closest('#midbar .folio-nav') && cal.getBoundingClientRect().height >= 36, overScan: [...document.querySelectorAll('.pdf-tools > *')].filter((e) => !e.hidden).map((e) => e.id) }; });
    T.check('the app is no wider than the phone, so the browser does not zoom the page out; the status bar makes way for the text: its position line at the top of the typing area, ↑ ↓ in the folio bar (one row), the rest in its ⋯ menu with the scan’s controls, the letter-size buttons left out; ⌖ Calibrate in the bar though the folio is calibrated; nothing over the scan', fit.inner === 390 && fit.docW <= 390 && fit.midW <= 390 && fit.midH <= 48 && fit.status === 'none' && fit.fontBtn === 'none' && fit.head && fit.nav && fit.menu && fit.cal && fit.overScan.length === 0, fit);
    let s = await scan();
    T.check('on a calibrated folio the scan is zoomed to show two of the three parts of a line across the screen (' + s.partsAcross + ')', s.narrow && s.partsAcross > 1.95 && s.partsAcross < 2.3 && !s.device, s);
    // the line view: three strips, the scan three lines tall
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 0));
    await sleep(500);
    const lv = await page.evaluate(() => {
      const near = [...document.querySelectorAll('.line.near')].map((l) => ({ i: +l.dataset.i, shown: getComputedStyle(l).display !== 'none', w: Math.round(l.getBoundingClientRect().width) }));
      const others = [...document.querySelectorAll('.line:not(.mline):not(.near)')].filter((l) => getComputedStyle(l).display !== 'none').length;
      const pane = document.getElementById('pdf-pane').getBoundingClientRect(), line = ME.Narrow.scanLine();
      const head = document.querySelector('#editor-pane .lv-head'), ed = document.getElementById('editor-pane').getBoundingClientRect();
      return { view: ME.Editor.view, lineView: document.querySelector('.folio').classList.contains('line-view'), near, others, paneH: Math.round(pane.height), linesOfScan: line ? +(pane.height / line).toFixed(2) : null, fs: parseFloat(getComputedStyle(document.querySelector('.line.near')).fontSize), btn: document.getElementById('btn-view').textContent, edW: document.getElementById('editor-pane').clientWidth, docW: document.documentElement.scrollWidth, edH: Math.round(ed.height),
        head: head ? { top: Math.round(head.getBoundingClientRect().top - ed.top), text: head.textContent.replace(/\s+/g, ' ').trim(), sticky: getComputedStyle(head).position, boxTag: getComputedStyle(document.querySelector('.folio .box-tag')).display, minis: head.querySelectorAll('.lv-lines .mini').length } : null };
    });
    const ids = lv.near.map((x) => x.i);
    T.check('the typing area shows strips, the line being typed between the one above and the one below and as many more as fit (' + ids.length + ' here), each the width of the screen, the other lines not drawn', lv.lineView && lv.view === 'lines' && [1, 2, 3].every((i) => ids.includes(i)) && ids.length > 3 && ids.length <= 9 && lv.near.every((x) => x.shown && x.w === lv.edW) && lv.others === 0 && lv.docW <= 390, lv);
    T.check('the letters are a readable size (' + lv.fs + ' px) and the scan is three lines tall (' + lv.linesOfScan + '): the line typed, one above, one below', lv.fs >= 17 && lv.fs <= 24 && lv.linesOfScan >= 2.95 && lv.linesOfScan <= 3.05 && lv.btn === 'Folio', lv);
    T.check('the position is a line fixed at the top of the typing area, with − / + for the lines of the block; the block’s own tag is not drawn', !!lv.head && lv.head.top === 0 && lv.head.sticky === 'sticky' && /Folio 1r · Main text/.test(lv.head.text) && /line 3 of 8/.test(lv.head.text) && /8 lines/.test(lv.head.text) && lv.head.minis === 2 && lv.head.boxTag === 'none', lv.head);
    const lines = await page.evaluate(async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const count = () => ME.Model.lineCount(ME.App.project, ME.App.entries[ME.App.idx].label, 'main');
      const said = () => { ME.Editor.focusLine('main', 2, 0); return (document.querySelector('.lv-head .lv-n') || {}).textContent; };
      document.querySelector('.lv-head .lv-lines .mini:last-child').click();
      await w(500);
      const n1 = count(), t1 = said();
      document.querySelector('.lv-head .lv-lines .mini:first-child').click();
      await w(500);
      return { n1, t1, n2: count(), t2: said() };
    });
    T.check('+ there adds a line to the block, − takes it away, and the count says so', lines.n1 === 9 && lines.t1 === '9 lines' && lines.n2 === 8 && lines.t2 === '8 lines', lines);
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 0));
    await sleep(300);
    // the whole folio, a button away, and back
    // (the button is in the folio bar's ⋯ menu)
    await page.evaluate(() => document.getElementById('btn-view').click());
    await sleep(700);
    const whole = await page.evaluate(() => ({ lineView: document.querySelector('.folio').classList.contains('line-view'), shown: [...document.querySelectorAll('.line:not(.mline)')].filter((l) => getComputedStyle(l).display !== 'none').length, zoom: ME.Editor.zoom, btn: document.getElementById('btn-view').textContent, saved: ME.Narrow.state().view, minis: document.querySelectorAll('.lv-head .lv-lines:not([hidden]) .mini').length }));
    await page.evaluate(() => document.getElementById('btn-view').click());
    await sleep(700);
    const back = await page.evaluate(() => ({ lineView: document.querySelector('.folio').classList.contains('line-view'), near: document.querySelectorAll('.line.near').length, saved: ME.Narrow.state().view }));
    T.check('Folio shows the whole folio side with its letters enlarged (the blocks’ own − / + there), and 3 lines brings the strips back; the choice is kept for the device', !whole.lineView && whole.shown === 8 && whole.zoom > 1.5 && whole.btn === '3 lines' && whole.saved === 'folio' && whole.minis === 0 && back.lineView && back.near >= 3 && back.saved === 'lines', { whole, back });
    // a long press on the text opens the tags
    const pressed = await page.evaluate(async () => {
      const l = document.querySelector('.line.near'), r = l.getBoundingClientRect();
      const ev = (type) => l.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 5, clientX: r.left + 40, clientY: r.top + r.height / 2, bubbles: true }));
      ev('pointerdown'); await new Promise((res) => setTimeout(res, 300)); ev('pointerup');
      const quick = document.body.classList.contains('tags-open');
      ev('pointerdown'); await new Promise((res) => setTimeout(res, 750));
      const held = document.body.classList.contains('tags-open');
      ev('pointerup');
      ME.Narrow.toggleTags(false);
      return { quick, held };
    });
    T.check('a finger held on the text for a moment opens the tags; a tap does not', pressed.held && !pressed.quick, pressed);
    // ↑ and ↓
    const nav = await page.evaluate(() => {
      const shown = (id) => { const e = document.getElementById(id); return getComputedStyle(e).display !== 'none' && !!e.closest('#midbar') && e.getBoundingClientRect().height >= 36; };
      return { up: shown('btn-line-up'), down: shown('btn-line-down') };
    });
    T.check('↑ and ↓ are in the folio bar, big enough for a finger', nav.up && nav.down, nav);
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
    // the scan along the line: the first two parts while the letter typed is in the first half of the line (reckoned
    // over the 66 letters expected), not sliding meanwhile; the last two once it passes the middle; a letter
    // corrected there does not bring the first two back; the caret put back well before the middle does
    const step = () => page.evaluate(() => {
      const P = ME.PdfView, line = ME.Editor.activeLine(), pos = ME.Editor.posOf(line);
      const rect = ME.Model.lineRect(ME.App.project, ME.App.entries[ME.App.idx], pos.box, pos.i);
      const f = ME.Follow.along(ME.App.project, line, pos);
      const scroller = document.querySelector('.pdf-scroller'), clip = document.querySelector('.pdf-clip'), stage = document.querySelector('.pdf-stage');
      const ox = clip.offsetLeft + (parseFloat(stage.style.left) || 0), sw = parseFloat(stage.style.width), vw = scroller.clientWidth, padX = rect[2] * 0.01;
      const x0 = ox + (rect[0] - padX) * sw - 10, x1 = ox + (rect[0] + rect[2] + padX) * sw + 10;
      const x = ox + (rect[0] + f * rect[2]) * sw - scroller.scrollLeft;
      return { f: +f.toFixed(3), n: ME.Follow.count(ME.Editor.unitText(line)), left: Math.round(scroller.scrollLeft), start: Math.round(Math.max(0, x0)), end: Math.round(x1 - vw), letterIn: x > 0 && x < vw, following: P.following };
    });
    const atStart = (w) => w.following && w.letterIn && Math.abs(w.left - w.start) <= 2, atEnd = (w) => w.following && w.letterIn && Math.abs(w.left - w.end) <= 2;
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः ');
    await sleep(1000);
    const s1 = await step();
    await page.keyboard.type('पाण्डवाश्चैव किमकुर्वत ');
    await sleep(1000);
    const s2 = await step();
    T.check('in the first half of the line (' + s1.n + ' then ' + s2.n + ' of 66 letters) the scan shows the first two parts, the start of the line at its left edge, and does not move', s1.f < 0.5 && s2.f < 0.5 && s2.f > 0.4 && atStart(s1) && atStart(s2) && s1.left === s2.left && s2.end > s2.start + 100, { s1, s2 });
    await page.keyboard.type('सञ्जय धर्म');
    await sleep(1000);
    const s3 = await step();
    T.check('past the middle (' + s3.n + ' letters) it shows the last two parts, the end of the line at its right edge', s3.f > 0.5 && atEnd(s3), s3);
    for (let k = 0; k < 3; k++) await page.keyboard.press('Backspace');
    await sleep(1000);
    const s4 = await step();
    await page.keyboard.type('र्म');
    await sleep(1000);
    const s5 = await step();
    T.check('a letter corrected there (' + s4.n + ' letters, then ' + s5.n + ' again) does not move the scan to and fro', s4.n < s3.n && s5.n > s4.n && s4.f >= 0.44 && atEnd(s4) && atEnd(s5), { s3, s4, s5 });
    await page.evaluate(() => { const l = ME.Editor.activeLine(); ME.Editor.setCaret(l, ME.Editor.unitText(l).indexOf('मामकाः')); });
    await sleep(1000);
    const s6 = await step();
    T.check('the caret put back well before the middle (' + s6.n + ' letters before it): the first two parts again', s6.f < 0.35 && atStart(s6), s6);
    // a swipe up or down on the strips goes to the line below or above, as the arrows do; a short movement, a sideways
    // one and a slow one go nowhere
    const swipe = (dx, dy, ms) => page.evaluate(async (dx, dy, ms) => {
      const l = ME.Editor.activeLine(), r = l.getBoundingClientRect();
      const x = r.left + 60, y = r.top + r.height / 2;
      const ev = (type, cx, cy) => { const t = new Touch({ identifier: 1, target: l, clientX: cx, clientY: cy }); l.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
      ev('touchstart', x, y);
      await new Promise((res) => setTimeout(res, ms));
      ev('touchend', x + dx, y + dy);
      await new Promise((res) => setTimeout(res, 150));
      const a = ME.Editor.activeLine();
      return a ? ME.Editor.posOf(a).i : null;
    }, dx, dy, ms);
    const sw = [await swipe(0, -90, 120), await swipe(0, -90, 120), await swipe(4, 90, 120), await swipe(0, -20, 120), await swipe(90, -30, 120), await swipe(0, -90, 900)];
    T.check('a swipe up on the strips goes to the line below (1 → 2 → 3), a swipe down to the line above (→ 2); a short movement, a sideways one and a slow one go nowhere', sw.join() === '2,3,2,2,2,2', sw);
    await page.evaluate(() => ME.Editor.focusLine('main', 1, 'end'));
    await sleep(300);
    // a long line: the caret stays in the middle half of the typing area
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः');
    await sleep(900);
    const caret = await page.evaluate(() => {
      const pane = document.getElementById('editor-pane').getBoundingClientRect(), el = ME.Editor.activeLine(), line = el.getBoundingClientRect();
      const r = getSelection().getRangeAt(0).cloneRange(); r.collapse(true); const c = r.getClientRects()[0] || { left: 0 };
      return { caretX: Math.round(c.left - pane.left), paneW: Math.round(pane.width), lineW: Math.round(line.width), textW: el.scrollWidth, scrolled: Math.round(el.scrollLeft) };
    });
    T.check('along a text wider than the screen (' + caret.textW + ' px) the strip scrolls so that the caret is kept in its middle half', caret.textW > caret.paneW && caret.lineW <= caret.paneW && caret.caretX > caret.paneW * 0.2 && caret.caretX < caret.paneW * 0.8 && caret.scrolled > 0, caret);
    // the keyboard: the app is as tall as can be seen, follows the browser's scrolling, and the top bar stays;
    // the scan keeps its three lines, the typing area shows three strips, in sight above the keyboard
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 0));
    await sleep(300);
    const kb = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));
      const near = () => [...document.querySelectorAll('.line.near')].map((l) => l.dataset.i).join(',');
      const r1 = ME.Narrow.viewport({ height: 362, offsetTop: 40 });
      const cs = getComputedStyle(document.documentElement);
      const open = { r: r1, h: cs.getPropertyValue('--app-h').trim(), top: cs.getPropertyValue('--app-top').trim(), cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, main: Math.round(document.getElementById('main').getBoundingClientRect().height), mainTop: Math.round(document.getElementById('main').getBoundingClientRect().top) };
      await frame();
      const strips = [...document.querySelectorAll('.line.near')].map((l) => l.getBoundingClientRect());
      const pane = document.getElementById('pdf-pane').getBoundingClientRect(), line = ME.Narrow.scanLine();
      open.near = near(); open.linesOfScan = +(pane.height / line).toFixed(2); open.stripsIn = strips.every((b) => b.top >= 40 && b.bottom <= 40 + 362 + 1); open.stripBottom = Math.round(Math.max(...strips.map((b) => b.bottom)));
      const r2 = ME.Narrow.viewport({ height: 844, offsetTop: 0 });
      await frame();
      const closed = { r: r2, cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, main: Math.round(document.getElementById('main').getBoundingClientRect().height), near: near() };
      return { open, closed };
    });
    T.check('with the keyboard open (362 px left, the page scrolled by 40): the app is 362 px tall, moved down by 40, and the top bar stays, the way back on it', kb.open.h === '362px' && kb.open.top === '40px' && kb.open.cls && kb.open.topbar !== 'none' && kb.open.main === 362 - 46 && kb.open.mainTop === 40 + 46, kb.open);
    T.check('with the keyboard open the scan keeps its three lines and the typing area shows three strips at the least, all in sight above the keyboard', /(^|,)1,2,3(,|$)/.test(kb.open.near) && kb.open.linesOfScan >= 2.95 && kb.open.linesOfScan <= 3.05 && kb.open.stripsIn, kb.open);
    T.check('with the keyboard closed, all is as before, the strips as many as fit', !kb.closed.cls && kb.closed.topbar !== 'none' && kb.closed.main === 844 - 46 && kb.closed.near.split(',').length > 3, kb.closed);
    // a browser that shrinks the window for the keyboard (Chrome on Android): read as the keyboard too, and not as a phone held sideways
    await page.setViewport({ width: 390, height: 362, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await sleep(700);
    const shrunk = await page.evaluate(() => ({ cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, main: Math.round(document.getElementById('main').getBoundingClientRect().height), near: [...document.querySelectorAll('.line.near')].map((l) => l.dataset.i).join(','), grid: getComputedStyle(document.getElementById('workspace')).display, docW: document.documentElement.scrollWidth, pdfH: Math.round(document.getElementById('pdf-pane').getBoundingClientRect().height), line: +ME.Narrow.scanLine().toFixed(1) }));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await sleep(700);
    const grown = await page.evaluate(() => ({ cls: document.body.classList.contains('keyboard-open'), topbar: getComputedStyle(document.getElementById('topbar')).display, near: [...document.querySelectorAll('.line.near')].map((l) => l.dataset.i).join(',') }));
    T.check('the window shrunk to 390 × 362 for the keyboard: read as the keyboard (the top bar staying, three strips, the scan three lines), not as a phone held sideways; the window grown again, all as before', shrunk.cls && shrunk.topbar !== 'none' && shrunk.main === 362 - 46 && /(^|,)1,2,3(,|$)/.test(shrunk.near) && shrunk.grid === 'flex' && shrunk.docW <= 390 && Math.abs(shrunk.pdfH - 3 * shrunk.line) <= 2 && !grown.cls && grown.topbar !== 'none' && grown.near.split(',').length > 3, { shrunk, grown });
    // the page pinched larger by the browser: what can be seen shrinks too, but the app keeps its size
    const pinched = await page.evaluate(() => {
      const r = ME.Narrow.viewport({ height: 300, offsetTop: 120, scale: 2.8 });
      const cs = getComputedStyle(document.documentElement);
      const out = { r, h: cs.getPropertyValue('--app-h').trim(), top: cs.getPropertyValue('--app-top').trim(), cls: document.body.classList.contains('keyboard-open') };
      ME.Narrow.viewport({ height: 844, offsetTop: 0, scale: 1 });
      return out;
    });
    T.check('the page pinched larger (2.8×, 300 px seen): the app stays 844 px tall, is not moved, and no keyboard is taken to be open', pinched.h === '844px' && pinched.top === '0px' && !pinched.cls, pinched);
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
      const controls = [...m.querySelectorAll('input:not([type=file]), select, textarea, button, .layout-card')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => ({ n: el.tagName.toLowerCase() + '.' + (el.className || el.placeholder || el.textContent.trim().slice(0, 12)), l: Math.round(el.getBoundingClientRect().left), r: Math.round(el.getBoundingClientRect().right) }));
      const cards = [...m.querySelectorAll('.layout-card')].map((c) => c.getBoundingClientRect());
      const stackedCards = cards.every((c, i) => !i || c.top >= cards[i - 1].bottom - 1);
      const out = { tooWide: controls.filter((c) => c.r > 390 || c.l < 0), nControls: controls.length, stackedCards, modal: r(m), create: r(create), cancel: r(cancel), bodyScrolls: body.scrollHeight > body.clientHeight + 4, bodyH: body.clientHeight, inner: innerHeight, stacked: siglum.getBoundingClientRect().top >= title.getBoundingClientRect().bottom, createH: Math.round(create.getBoundingClientRect().height) };
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
    T.check('every field, drop-down and button of the dialog is within the phone’s width (' + dlg.nControls + ' looked at)', dlg.nControls > 12 && dlg.tooWide.length === 0, dlg.tooWide);
    T.check('the layout cards stand one above another', dlg.stackedCards);
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
    const wide = await page.evaluate(() => { const s = document.getElementById('statusbar'), t = document.querySelector('.pdf-tools'); return { up: getComputedStyle(document.querySelector('.line-nav')).display, narrow: ME.Narrow.on(), status: getComputedStyle(s).display !== 'none' && s.contains(document.getElementById('status-pos')) && s.contains(document.getElementById('btn-view')) && s.contains(document.getElementById('ed-zoom')), head: !document.querySelector('.lv-head'), tools: t.firstElementChild.id === 'btn-zoom-out' && !t.querySelector('.pdf-more') && !t.querySelector('.pdf-view').hidden && t.querySelector('.pdf-view .menu-items').contains(document.getElementById('btn-rotate')) && document.getElementById('btn-calibrate').textContent === '⌖ Calibrate' && t.contains(document.getElementById('filters-pop')), menu: !document.querySelector('#midbar .more-menu') }; });
    T.check('on a computer the arrows are not shown, and everything is back where it was: the status bar with its controls, the scan’s toolbar with its zoom and View menu, no line atop the typing area', !wide.narrow && wide.up === 'none' && wide.status && wide.head && wide.tools && wide.menu, wide);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
