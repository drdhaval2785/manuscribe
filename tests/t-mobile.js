// Phones and tablets. On a phone (390 × 844, touch), transcription is a line view: the letters of the typing area
// and the scan enlarged together until they can be read, with the device's own sizes (the project's are left as
// they are); the folio bar on one row, the tags in a panel from the bottom of the screen that closes when one is
// chosen; buttons big enough for a finger; the scan's controls one ⋯ at its corner, ⌖ Calibrate beside it; no page
// that scrolls sideways; wide tables with the column that names the row in view; calibration by touch: a finger
// draws, two fingers pinch to zoom. On a tablet held upright (820 ×
// 1180) the folio keeps the project's sizes and the tags are in the same panel. On a computer, nothing of this.
const { launch, sleep, checks, audit } = require('./h');
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
        edZoom: ME.Editor.zoom, pdfZoom: ME.PdfView.zoom, lineView: !!document.querySelector('.folio.line-view'), mid: r('#midbar').height, tags: shown(document.getElementById('btn-tags')), toolbar: shown(document.getElementById('toolbar')),
        // (buttons for a finger where the pointer is one: Playwright's Firefox and WebKit here are not touch screens)
        small: matchMedia('(pointer: coarse)').matches ? small : [], projectUi: { ed: ME.App.project.ui.editorZoom || 1, pdf: ME.App.project.ui.pdfZoom || 1 },
        // the computer's layout: the status bar with its controls, the scan's zoom buttons and View menu, no ⋯ menus
        computer: (() => { const s = document.getElementById('statusbar'), t = document.querySelector('.pdf-tools'); return getComputedStyle(s).display !== 'none' && s.contains(document.getElementById('status-pos')) && s.contains(document.getElementById('btn-view')) && t.firstElementChild.id === 'btn-zoom-out' && !t.querySelector('.pdf-more') && !document.querySelector('.more-menu') && !document.querySelector('.lv-head'); })(),
      };
    });

    // every screen of the phone passes the audit: nothing past the right edge, no control under 36 px, no text under 12 px
    const clean = async (name, allow) => { const a = await audit(page, allow); T.check(name + ': fits the phone, its controls big enough for a finger, its text readable', a.docW <= a.W && !a.over.length && !a.small.length && !a.tiny.length, a); };
    // a phone
    await open(390, 844, true);
    await clean('the transcription on a phone');
    const phone = await look();
    T.check('on a phone the typing area is the line view, its letters a size that can be read (' + phone.font.toFixed(1) + ' px)', phone.lineView && phone.font >= 15 && phone.edZoom === 1, phone);
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
    await page.evaluate(() => ME.Narrow.toggleTags(true));
    await clean('the tag sheet');
    await page.evaluate(() => ME.Narrow.toggleTags(false));
    T.check('the tags open from the bottom of the screen, as big buttons; one chosen is applied, and the panel closes', sheet.shown && sheet.atBottom && sheet.n > 15 && sheet.big && sheet.closed && sheet.tagged, sheet);
    // zooming on the phone: kept for this device
    const kept = await page.evaluate(() => { document.getElementById('btn-ed-in').click(); return { st: JSON.parse(localStorage.getItem('manuscribe.narrow') || '{}'), project: ME.App.project.ui.editorZoom || 1 }; });
    T.check('a zoom chosen on the phone is kept for the phone (the line view’s own), not written into the project', kept.st.lv > 1.1 && kept.project === 1, kept);

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

    // the scan's controls: one ⋯ at its corner, its menu whole and within the phone; ⌖ Calibrate beside it, and Follow
    const tools = await page.evaluate(async () => {
      const W = innerWidth, r = (e) => e.getBoundingClientRect();
      const cal = document.getElementById('btn-calibrate');
      const d = document.querySelector('.pdf-tools details.pdf-more');
      d.open = true;
      await new Promise((res) => setTimeout(res, 120));
      const items = d.querySelector('.menu-items');
      const m = r(items);
      const inMenu = ['btn-zoom-out', 'pdf-zoom', 'btn-zoom-in', 'btn-pdf-mode', 'btn-rotate', 'btn-filters'].every((id) => items.contains(document.getElementById(id)));
      const whole = m.top >= r(d).bottom && m.bottom <= innerHeight && m.height > 150; // not cut off by a scan three lines tall
      const zoomed = document.getElementById('btn-zoom-in').getBoundingClientRect().height >= 36;
      d.open = false;
      const follow = document.getElementById('btn-follow');
      follow.hidden = false;
      const f = r(follow);
      follow.hidden = true;
      const t = r(document.querySelector('.pdf-tools')), pdf = r(document.getElementById('pdf-pane'));
      return { calIn: !cal.hidden && cal.textContent === '⌖' && r(cal).left >= 0 && r(cal).right <= W && r(cal).height >= 36, menuIn: m.right <= W + 0.5 && m.left >= -0.5, inMenu, whole, zoomed, toolsIn: t.left >= 0 && t.right <= W && t.width < pdf.width / 2, followIn: f.left >= 0 && f.right <= W, view: document.querySelector('.pdf-tools details.pdf-view').hidden, W };
    });
    T.check('the scan’s controls are one ⋯ at its corner (zoom, leaf or page, rotation, brightness), its menu whole and within the screen, ⌖ Calibrate beside it and Follow in view, the View menu of the computer put away', tools.calIn && tools.menuIn && tools.inMenu && tools.whole && tools.zoomed && tools.toolsIn && tools.followIn && tools.view, tools);

    // a selection made by a finger is kept: a tap on Tags or on a tag, or a long press, does not lose it
    const keptSel = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      if (!matchMedia('(pointer: coarse)').matches) ME.Device.force(true);
      ME.Editor.focusLine('main', 0, 0);
      const line = document.activeElement;
      const tn = [...line.childNodes].find((n) => n.nodeType === 3);
      getSelection().setBaseAndExtent(tn, 0, tn, 4);
      await wait(150);
      const kept1 = !!ME.Editor.kept && ME.Editor.keptText() === 'श्री';
      // the browser's selection goes, as with a tap on a button: the passage stays kept, and is painted
      getSelection().collapseToStart();
      await wait(150);
      const painted = !!(CSS.highlights && CSS.highlights.get('lipi-multi')) || !!document.querySelector('.line.in-multi');
      document.getElementById('btn-tags').click();
      await wait(100);
      const head = (document.querySelector('#toolbar .tb-head') || {}).textContent || '';
      document.querySelector('#toolbar .tb-hi, #toolbar [data-cmd="hi"]').click();
      await wait(250);
      const label = ME.Model.entries(ME.App.project)[0].label;
      const stored1 = ME.App.project.pages[label].boxes.main[0];
      // (the selection is put back round the tagged text, as on a computer, and so is kept again)
      const gone = !ME.Editor.kept || ME.Editor.keptText() === 'श्री';
      // a long press on a kept passage (the finger moves the caret, as the browser does) opens the tags for it
      const line2 = document.querySelector('#editor-pane .line:not(.mline)');
      const last = [...line2.childNodes].filter((n) => n.nodeType === 3).pop();
      getSelection().setBaseAndExtent(last, 0, last, 4);
      await wait(150);
      const rg = document.createRange(); rg.setStart(last, 1); rg.setEnd(last, 2);
      const b = rg.getBoundingClientRect();
      line2.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: b.left + 1, clientY: b.top + b.height / 2, button: 0, bubbles: true }));
      getSelection().collapse(last, 1);
      await wait(750);
      const sheetOpen = document.body.classList.contains('tags-open');
      const head2 = (document.querySelector('#toolbar .tb-head') || {}).textContent || '';
      line2.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true }));
      document.querySelector('#toolbar .tb-del, #toolbar [data-cmd="del"]').click();
      await wait(250);
      const stored2 = ME.App.project.pages[label].boxes.main[0];
      // a tap elsewhere lets a kept passage go
      getSelection().setBaseAndExtent(last, 0, last, 2);
      await wait(150);
      const keptAgain = !!ME.Editor.kept;
      const far = document.querySelector('#editor-pane .line:not(.mline):nth-of-type(2)') || line2;
      far.dispatchEvent(new MouseEvent('mousedown', { clientX: 5, clientY: far.getBoundingClientRect().bottom - 2, bubbles: true }));
      const cleared = !ME.Editor.kept;
      ME.Device.force(null);
      return { kept1, painted, head, stored1, gone, sheetOpen, head2, stored2, keptAgain, cleared };
    });
    T.check('a selection made by a finger is kept after the browser’s own goes, painted, and named in the sheet; the tag goes round it', keptSel.kept1 && keptSel.painted && /Tag the selected text: «श्री»/.test(keptSel.head) && /^<hi[^>]*>श्री<\/hi>/.test(keptSel.stored1) && keptSel.gone, keptSel);
    T.check('a long press on the kept passage opens the tags for it, and a tap elsewhere lets it go', keptSel.sheetOpen && /Tag the selected text/.test(keptSel.head2) && /<del[^>]*>[^<]{1,6}<\/del>/.test(keptSel.stored2) && keptSel.keptAgain && keptSel.cleared, keptSel);

    // the side panel is a sheet: not opened by the computer's setting, closed by its backdrop, the setting left alone
    const side = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      ME.App.project.ui.sidebar = true;
      await ME.Store.putProject(ME.App.project);
      await ME.App.open(ME.App.project.id);
      await wait(500);
      const closedAtOpen = !document.body.classList.contains('sidebar-open');
      document.getElementById('btn-sidebar').click();
      const opened = document.body.classList.contains('sidebar-open');
      const backdrop = document.getElementById('side-backdrop');
      const shown = getComputedStyle(backdrop).display !== 'none';
      const closeBtn = getComputedStyle(document.getElementById('side-close')).display !== 'none';
      backdrop.click();
      const closed = !document.body.classList.contains('sidebar-open');
      const setting = ME.App.project.ui.sidebar === true;
      ME.App.project.ui.sidebar = false;
      await ME.Store.putProject(ME.App.project);
      return { closedAtOpen, opened, shown, closeBtn, closed, setting };
    });
    T.check('on a phone the side panel is a sheet: closed when the project opens whatever the computer chose, opened by ◧, closed by its backdrop or ✕, the computer’s setting kept', side.closedAtOpen && side.opened && side.shown && side.closeBtn && side.closed && side.setting, side);
    for (const tab of ['tag', 'folio', 'works', 'ms']) {
      await page.evaluate((tab) => { ME.App.toggleSidebar(true); [...document.querySelectorAll('.side-tab')].find((x) => x.dataset.tab === tab).click(); }, tab);
      await sleep(300);
      await clean('the side panel, ' + tab);
    }
    await page.evaluate(() => ME.App.toggleSidebar(false));
    await page.evaluate(() => document.getElementById('btn-settings').click());
    await sleep(400);
    await clean('Settings');
    await page.evaluate(() => { [...document.querySelectorAll('.modal .st-tabs .btn')].find((b) => b.dataset.k === 'interface').click(); });
    await sleep(300);
    await clean('Settings, Interface');
    await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
    await sleep(300);
    await page.evaluate(() => document.getElementById('btn-export').click());
    await sleep(500);
    await clean('Export, a transcription');
    await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
    await sleep(300);
    const calAudit = page.evaluate(async () => { const done = ME.App.calibrate(); for (let k = 0; k < 30 && !document.querySelector('.calib-bar:not([hidden]) .calib-step'); k++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 400)); window.__calDone = done; });
    await calAudit;
    await clean('calibration');
    await page.evaluate(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await window.__calDone; });
    await sleep(300);

    // a tablet held upright
    await page.evaluate(() => localStorage.removeItem('manuscribe.narrow'));
    await open(820, 1180, true);
    const tab = await look();
    await clean('the transcription on a tablet held upright');
    // a phone held sideways: the scan at the left, the typing area beside it, the line view
    await page.evaluate(() => localStorage.removeItem('manuscribe.narrow'));
    await open(844, 390, true);
    const side2 = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const p = r('pdf-pane'), e = r('editor-pane'), m = r('midbar'); return { pdfLeft: p.right <= e.left + 1 && p.right <= m.left + 1, pdfTall: p.height >= innerHeight - 46 - 2, lineView: !!document.querySelector('.folio.line-view'), narrow: ME.Narrow.on(), docW: document.documentElement.scrollWidth, vw: innerWidth }; });
    T.check('a phone held sideways: the scan at the left, the typing area beside it, as tall as the screen, in the line view', side2.pdfLeft && side2.pdfTall && side2.lineView && side2.narrow && side2.docW <= side2.vw, side2);
    await clean('the transcription on a phone held sideways');
    // a tablet held sideways: the computer's layout, the side panel docked, the toolbar in view, buttons for a finger
    await page.evaluate(() => localStorage.removeItem('manuscribe.narrow'));
    await open(1180, 820, true);
    const wide = await page.evaluate(() => { ME.App.toggleSidebar(true); const s = document.getElementById('sidebar'); return { docked: getComputedStyle(s).position !== 'fixed' && getComputedStyle(s).display !== 'none', toolbar: getComputedStyle(document.getElementById('toolbar')).display !== 'none', btn: document.getElementById('btn-sidebar').getBoundingClientRect().height >= 40 }; });
    T.check('a tablet held sideways: the computer’s layout with the side panel docked and the toolbar in view, buttons for a finger', wide.docked && wide.toolbar && wide.btn, wide);
    await clean('the transcription on a tablet held sideways');
    await page.evaluate(() => ME.App.toggleSidebar(false));
    T.check('on a tablet held upright the folio keeps the project’s sizes, the tags are in the panel, and no page scrolls sideways', tab.edZoom === 1 && tab.tags && !tab.toolbar && tab.mid <= 56 && !tab.small.length && tab.docW <= tab.vw, tab);
    // a computer: as before
    await open(1500, 1000, false);
    const desk = await look();
    T.check('on a computer, nothing of this: the toolbar as before, the project’s sizes, the status bar and the scan’s toolbar as they were', desk.edZoom === 1 && !desk.tags && desk.toolbar && desk.computer, desk);

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
    // the edition's screens on the phone
    await page.evaluate(() => ME.Features.save({ level: 'full' }));
    for (const step of ['witnesses', 'collate', 'publish']) {
      await page.evaluate(async (step) => { ME.Edition.stepOf[ME.Edition.current.id] = step; await ME.Edition.draw(); }, step);
      await sleep(600);
      await clean('the edition, ' + step);
    }
    await page.evaluate(async () => { ME.Edition.stepOf[ME.Edition.current.id] = 'collate'; await ME.Edition.draw(); });
    await sleep(500);
    const clamp = await page.evaluate(() => { const p = document.querySelector('#edition-view .ed-stepbody p.help'); const before = getComputedStyle(p).webkitLineClamp; p.click(); const after = getComputedStyle(p).webkitLineClamp; p.click(); return { before, after, title: getComputedStyle(document.querySelector('.ed-title')).order }; });
    T.check('on a phone the edition’s long explanations are clamped to two lines, a tap opens one, and the title has a row of its own', clamp.before === '2' && clamp.after === 'none' && clamp.title === '-1', clamp);
    await page.evaluate(() => document.querySelector('#edition-view [data-action="open-block"]').click());
    await sleep(1200);
    await clean('a block');
    const fold = await page.evaluate(() => { const h = document.querySelector('.cv-head'), f = h.querySelector('.fold-menu'); const t = document.querySelector('.ct-head'), g = t.querySelector('.fold-menu'); return { folded: !!f && !f.hidden && !!f.querySelector('[data-action="block-next"]'), rows: Math.round(h.getBoundingClientRect().height), textFolded: !!g && !g.hidden && [...g.querySelectorAll('button')].some((b) => /Undo/.test(b.textContent)), keysHidden: getComputedStyle(document.querySelector('.ct-keys')).display === 'none', touchHelp: getComputedStyle(document.querySelector('.ct-touch')).display !== 'none' }; });
    T.check('on a phone the block window folds its buttons into ⋯ menus, the tabs and Previous / Next staying; the keyboard help gives way to a line about tapping', fold.folded && fold.rows <= 130 && fold.textFolded && fold.keysHidden && fold.touchHelp, fold);
    await page.evaluate(() => { const u = document.querySelector('.ct-text .ct-u:not(.d-same)') || document.querySelector('.ct-text .ct-u'); if (u) u.click(); });
    await sleep(500);
    await clean('a block, a place opened');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); });
    await sleep(400);
    await page.evaluate(() => document.querySelector('#edition-view [data-action="work-apparatus"]').click());
    await sleep(1200);
    await clean('the work apparatus');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); });
    await sleep(300);
    await page.evaluate(() => document.querySelector('.ed-bar [data-action="export"]').click());
    await sleep(600);
    await clean('Export, an edition');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.modal-foot .btn')].pop(); if (b) b.click(); });
    await page.evaluate(() => ME.Features.save({ level: 'simple' }));
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
