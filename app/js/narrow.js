'use strict';
/* Phones, and narrow windows (up to 700 px wide): a line view. A whole folio at the width of a phone has letters of a
   few pixels, so here the typing area and the scan are enlarged together until the letters can be read (about 16 px),
   and both follow the line being typed (Editor.centerLine, the PDF's line guide); the scan takes less height; and
   the tags are one button that opens them from the bottom of the screen (so also on a tablet held upright, up to
   900 px). The sizes chosen here are this device's
   (kept in this browser), not the project's, which keeps those of the computer it is mostly typed on.

   On a phone the bars also make way for the text (Narrow.layout): the status bar is hidden, its position line fixed
   at the top of the typing area with − / + for the lines of the block, ↑ ↓ in the folio bar and the rest in a ⋯
   menu there, together with the scan's controls; ⌖ Calibrate is a button in that bar too, so that nothing but
   Follow lies over the scan. The scan is three lines tall (the line typed, one above, one below), and the typing
   area shows as many lines round the one typed as fit: three at the least, with the keyboard open. Along the line
   the scan shows two of three parts, the first two until the letter typed passes the middle of the line, then the
   last two (pdfview.js, steppedLeft), so that it does not slide along with every letter.

   Also, everywhere: the app's height is the height that can be seen (visualViewport; the viewport's
   interactive-widget would do it in Chrome, but Safari reports it as an error), so that on a phone or tablet the keyboard does
   not cover the line being typed. */
(function (ME) {
  const Narrow = {};
  // a phone: narrow, or held sideways (no taller than 460 px and well wider than tall, with a finger; see device.js)
  const mq = window.matchMedia ? window.matchMedia('(max-width: 700px), ((max-height: 460px) and (min-aspect-ratio: 4/3) and (pointer: coarse))') : { matches: false, addEventListener() {} };
  const KEY = 'manuscribe.narrow';
  const LEGIBLE = 16; // px: the size the letters are brought to
  Narrow.SCAN_PART = 2 / 3; // of a line across the scan: the line is in three parts, and two are shown at a time
  Narrow.on = () => mq.matches;
  Narrow.state = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  Narrow.save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(Narrow.state(), patch))); } catch (e) { /* this visit only */ } };

  /* On a phone the typing area shows three lines (Editor.view 'lines'): the line being typed, the one above and the
     one below, each a strip the width of the screen; and the scan about three lines of the page. 'folio' shows the
     whole folio as on a computer. Chosen with the button in the status bar, kept for the device. */
  Narrow.view = () => (Narrow.on() ? Narrow.state().view || 'lines' : 'folio');
  Narrow.setView = function (view) {
    Narrow.save({ view: view === 'folio' ? 'folio' : 'lines' });
    if (ME.Editor) ME.Editor.setView(Narrow.view());
    Narrow.fit();
    Narrow.viewButton();
  };
  Narrow.viewButton = function () {
    const b = document.getElementById('btn-view');
    if (!b) return;
    const lines = Narrow.view() === 'lines';
    b.textContent = lines ? 'Folio' : '3 lines';
    b.title = lines ? 'Show the whole folio side' : 'Show three lines: the line being typed, the one above and the one below';
  };

  /* One line of the scan on the screen, in px, from the calibration and the scan's zoom; null when not known. */
  Narrow.scanLine = function () {
    const P = ME.PdfView, A = ME.App, M = ME.Model;
    if (!P || !A || !A.project || !A.entries || !P.pagePx1) return null;
    const e = A.entries[A.idx];
    const rect = e && M.lineRect(A.project, e, 'main', 0);
    const size = e && ((A.pageSizes && A.pageSizes[e.pdfPage]) || (A.project.pdf && A.project.pdf.size));
    if (!rect || rect.guessed || !size || !size.width) return null;
    return rect[3] * P.pagePx1 * P.zoom * (size.height / size.width);
  };
  const LINES_OF_SCAN = 3; // the line being typed, the one above and the one below
  const SCAN_MIN = 56; // px: a scan never shorter than this
  const $ = (id) => document.getElementById(id);

  /* One strip of the line view, in px (measured; or reckoned from the letters before any is drawn) */
  const stripH = () => {
    const l = document.querySelector('#editor-pane .line.near');
    const h = l && l.getBoundingClientRect().height;
    return h || 19 * 1.75 * ((ME.Editor && ME.Editor.zoom) || 1) + 8;
  };
  /* The height the typing area needs: its line at the top, three strips, and the room round them */
  Narrow.typingNeed = function () {
    const head = document.querySelector('#editor-pane .lv-head');
    return (head ? head.getBoundingClientRect().height : 0) + 3 * stripH() + 12;
  };
  /* The heights, in a narrow window: the scan three lines tall on a calibrated folio (unless the bar between the
     panes has been dragged), and no taller than leaves the typing area its three strips; the typing area then shows
     as many lines round the one typed as fit in what is left (Editor.nearK: one above and one below at the least,
     four at the most). Done again when the keyboard opens or closes. */
  Narrow.fitHeight = function () {
    if (!Narrow.on() || !ME.App || !ME.App.project) return;
    const pane = $('pdf-pane'), ed = $('editor-pane');
    if (!pane || !ed) return;
    const st = Narrow.state(), lines = Narrow.view() === 'lines';
    const lh = lines && !st.split ? Narrow.scanLine() : null;
    if (lh) {
      const appH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')) || window.innerHeight;
      const top = document.body.classList.contains('keyboard-open') ? 0 : ($('topbar') || {}).offsetHeight || 46;
      const mid = ($('midbar') || {}).offsetHeight || 48;
      const room = appH - top - mid - Narrow.typingNeed();
      pane.style.height = Math.round(Math.max(SCAN_MIN, Math.min(lh * LINES_OF_SCAN, room))) + 'px';
    } else pane.style.height = Math.round(Narrow.split() * 100) + '%';
    if (lines && ME.Editor) {
      const head = ed.querySelector('.lv-head');
      const left = ed.clientHeight - (head ? head.offsetHeight : 0) - 12;
      const k = ME.U.clamp(Math.floor((left / stripH() - 1) / 2), 1, 4);
      if (k !== ME.Editor.nearK) { ME.Editor.nearK = k; ME.Editor.markNear(); }
    }
  };

  /* The zoom that makes the letters of the typing area legible, from the size they have now. -> zoom, or null */
  Narrow.legible = function () {
    const E = ME.Editor;
    const line = document.querySelector('#editor-pane .line:not(.mline)');
    if (!line || !E) return null;
    const px = parseFloat(getComputedStyle(line).fontSize);
    if (!px) return null;
    return Math.min(4, Math.max(1, (E.zoom * LEGIBLE) / px));
  };

  /* The zoom of the scan that shows two of the three parts of a line across the screen, on a calibrated folio: from
     the width of the text block. -> zoom, or null */
  Narrow.letterZoom = function () {
    const P = ME.PdfView, A = ME.App, M = ME.Model;
    if (!P || !A || !A.project || !A.entries || !M) return null;
    const e = A.entries[A.idx];
    const reg = e && M.regions(A.project, e);
    const r = reg && reg.boxes && reg.boxes.main;
    if (!r) return null;
    return P.zoomToShow(r[2] * Narrow.SCAN_PART);
  };

  /* After a folio is laid out: in a narrow window, the device's own sizes, or legible ones the first time: the
     letters of the typing area 16 px; the scan showing two of the three parts of a line, or, where the folio is not
     calibrated, enlarged as the typing area is. */
  let fitting = false;
  const label = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Math.round(v * 100) + '%'; };
  Narrow.fit = function () {
    if (!Narrow.on() || fitting || !ME.App || !ME.App.project) return;
    const E = ME.Editor, P = ME.PdfView;
    const st = Narrow.state();
    const lines = Narrow.view() === 'lines';
    // the line view has readable letters of itself; the folio is enlarged until its letters can be read
    const z = lines ? st.lv || 1 : st.ed || Narrow.legible();
    if (!z) return;
    fitting = true;
    try {
      if (E.view !== Narrow.view()) E.setView(Narrow.view());
      if (Math.abs(E.zoom - z) > 0.01) E.setZoom(z);
      label('ed-zoom', E.zoom);
      Narrow.viewButton();
      Narrow.headLines(E.current);
      if (!P) return;
      const applyPdf = () => {
        const pz = st.pdf || Narrow.letterZoom() || z;
        // (a render begun before is cancelled, and pdf.js says so: not an error)
        if (Math.abs(P.zoom - pz) > 0.01) { P.zoom = pz; if (P.entry) Promise.resolve(P.render()).catch(() => {}); }
        label('pdf-zoom', P.zoom);
        Narrow.fitHeight();
      };
      // the scan's size at zoom 1 is known once it has been drawn
      if (st.pdf || P.pagePx1 || !ME.App.pdfShown) applyPdf();
      else Promise.resolve(ME.App.pdfShown).then(applyPdf, () => {});
    } finally { fitting = false; }
  };

  /* the scan's share of the height, in a narrow window */
  Narrow.split = () => Narrow.state().split || 0.3;

  /* ---------- the tags, from the bottom of the screen ---------- */
  Narrow.toggleTags = function (open) {
    const on = open === undefined ? !document.body.classList.contains('tags-open') : !!open;
    document.body.classList.toggle('tags-open', on);
    const b = document.getElementById('btn-tags');
    if (b) b.setAttribute('aria-expanded', String(on));
    // the sheet says what a tag will go round: the passage kept (Editor.kept), or the cursor
    const tb = document.getElementById('toolbar');
    let head = tb && tb.querySelector('.tb-head');
    if (on && tb) {
      const kept = ME.Editor && ME.Editor.keptText ? ME.Editor.keptText().replace(/\s+/g, ' ').trim() : '';
      if (!head) { head = ME.U.el('div', { class: 'tb-head' }); tb.prepend(head); }
      head.textContent = kept ? 'Tag the selected text: «' + (kept.length > 36 ? kept.slice(0, 36) + '…' : kept) + '»' : 'Tag at the cursor; select text first for a tag round it';
    } else if (head) head.remove();
  };

  /* ---------- the phone's layout of the screen ---------- */
  /* On a phone the bars make way for the text. The status bar is hidden, and what it held moves: the position
     ("Folio 1r · Main text · line 3 of 8") to a line fixed at the top of the typing area, with − / + for the lines of
     the block (the box's tag, which would float with the strips, is not drawn there); ↑ and ↓ into the folio bar;
     the rest (Folio / 3 lines, the typing scheme, the size of the letters) into a ⋯ menu at its end, under the
     scan's controls (zoom, leaf or page, rotation, brightness), which come there from the scan's corner; and ⌖
     Calibrate is a button in the bar, calibrated or not, since some manuscripts need calibrating on every folio
     side. So nothing lies over a scan three lines tall but Follow, when the scan has been moved by hand. In a wide
     window everything goes back where it was. */
  let laid = false;
  Narrow.layout = function (on) {
    on = on === undefined ? Narrow.on() : !!on;
    if (on === laid) return;
    const U = ME.U;
    const tools = document.querySelector('.pdf-tools'), status = $('statusbar'), right = status && status.querySelector('.status-right');
    const nav = document.querySelector('#midbar .folio-nav'), pane = $('editor-pane'), view = tools && tools.querySelector('details.pdf-view');
    if (!tools || !right || !nav || !pane || !view) return;
    laid = on;
    const cal = $('btn-calibrate'), pop = $('filters-pop');
    if (on) {
      // the scan's controls and the status bar's in one ⋯ menu at the end of the folio bar (a choice made closes it;
      // the zoom buttons keep it open), ⌖ Calibrate a button before it; only Follow stays over the scan
      const items = U.el('div', { class: 'menu-items' },
        U.el('div', { class: 'pm-zoom' }, $('btn-zoom-out'), $('pdf-zoom'), $('btn-zoom-in')), $('btn-pdf-mode'), $('btn-rotate'), $('btn-filters'),
        U.el('div', { class: 'menu-sep' }),
        $('btn-view'), $('translit-badge'), ...right.querySelectorAll('.ed-zoom-ctl'), $('storage-warning'));
      const menu = U.el('details', { class: 'menu more-menu' }, U.el('summary', { class: 'nbtn', title: 'The scan: zoom, leaf or page, rotation, brightness. The whole folio, the typing scheme, the size of the letters' }, '⋯'), items);
      items.addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('.pm-zoom, .ed-zoom-ctl')) menu.open = false; });
      view.hidden = true;
      cal.dataset.label = cal.textContent;
      cal.textContent = '⌖';
      cal.title = 'Calibrate this folio side: draw the leaf and the text blocks on the scan';
      cal.className = 'nbtn cal-bar';
      cal.hidden = false;
      tools.append($('btn-follow'));
      // the brightness pop-up floats under the scan
      pop.classList.add('pf-float');
      document.body.appendChild(pop);
      nav.append(right.querySelector('.line-nav'), cal, menu);
      // the position, fixed at the top of the typing area, with − / + for the lines of the block
      pane.prepend(U.el('div', { class: 'lv-head' }, $('status-pos'), U.el('span', { class: 'lv-lines', hidden: true })));
      Narrow.headLines(ME.Editor && ME.Editor.current);
    } else {
      const menu = nav.querySelector('details.more-menu'), head = pane.querySelector('.lv-head');
      view.querySelector('.menu-items').append($('btn-pdf-mode'), $('btn-rotate'), $('btn-filters'));
      view.hidden = false;
      cal.textContent = cal.dataset.label || '⌖ Calibrate';
      cal.title = 'Draw the leaf and the text blocks on the PDF';
      cal.className = 'pbtn accent';
      pop.classList.remove('pf-float');
      pop.style.top = '';
      tools.append($('btn-zoom-out'), $('pdf-zoom'), $('btn-zoom-in'), view, $('btn-follow'), cal, pop);
      right.append($('storage-warning'), nav.querySelector('.line-nav'), $('btn-view'), $('translit-badge'), ...(menu ? menu.querySelectorAll('.ed-zoom-ctl') : []));
      if (menu) menu.remove();
      status.prepend($('status-pos'));
      if (head) head.remove();
    }
  };

  /* The − / + for the lines of the block being typed, beside the position at the top of the typing area (in the
     line view; in the folio view the block's own tag has them). pos: {box, i} of the cursor, or null. */
  Narrow.headLines = function (pos) {
    const el = document.querySelector('#editor-pane .lv-head .lv-lines');
    if (!el) return;
    const A = ME.App, M = ME.Model, E = ME.Editor, U = ME.U;
    const e = A && A.project && A.entries && A.entries[A.idx];
    el.innerHTML = '';
    if (!e || !pos || !pos.box || !E || E.view !== 'lines' || !E.hooks.onLinesChange) { el.hidden = true; return; }
    el.hidden = false;
    const box = pos.box === 'gloss' ? 'main' : pos.box;
    const n = M.lineCount(A.project, e.label, box);
    const mini = (t, title, k) => U.el('button', { class: 'mini', title, onpointerdown: (ev) => ev.preventDefault(), onclick: () => E.hooks.onLinesChange(box, n + k) }, t);
    el.append(mini('−', 'One line fewer on this folio side', -1), U.el('span', { class: 'lv-n', title: 'Lines of this block on this folio side' }, n + ' lines'), mini('+', 'One more line on this folio side (or Enter on the last line)', 1));
  };

  /* ---------- the height that can be seen ---------- */
  /* The app is as tall as can be seen (the keyboard takes the rest), and follows the browser where it scrolls the page
     to bring the line typed above the keyboard (Safari on iOS does: visualViewport.offsetTop). While the keyboard is
     open on a phone, the top bar gives its room to the typing area (body.keyboard-open). Measured on the iPhone
     Simulator: the keyboard leaves 362 px of 699, and Safari scrolled the page by up to 306 px. */
  let tallest = 0, tallAt = 0, lastH = 0, lastOpen = false;
  Narrow.viewport = function (v) {
    const vv = window.visualViewport;
    const scale = v && v.scale !== undefined ? v.scale : vv ? vv.scale : 1;
    let h = v && v.height !== undefined ? v.height : vv ? vv.height : window.innerHeight;
    let top = v && v.offsetTop !== undefined ? v.offsetTop : vv ? vv.offsetTop : 0;
    /* The page pinched larger (which Safari on iOS always allows) also shrinks what can be seen; but then the app
       must keep its size, and the browser shows the part looked at: only the keyboard takes room from the app. */
    if (scale > 1.01) { h = document.documentElement.clientHeight || h * scale; top = 0; }
    const root = document.documentElement.style;
    root.setProperty('--app-h', Math.round(h) + 'px');
    root.setProperty('--app-top', Math.round(top) + 'px');
    /* The keyboard is open when much less can be seen than the tallest the window has been at this width: so read
       both where the browser keeps the window its size and brings the keyboard over it (Safari), and where it
       shrinks the window for the keyboard (Chrome on Android). */
    if (window.innerWidth !== tallAt) { tallAt = window.innerWidth; tallest = 0; }
    tallest = Math.max(tallest, window.innerHeight);
    const open = Narrow.on() && tallest - h > 150;
    document.body.classList.toggle('keyboard-open', open);
    // the keyboard come or gone, or the height much changed: the scan and the strips fitted to it again
    if (open !== lastOpen || Math.abs(h - lastH) > 40) { lastOpen = open; lastH = h; requestAnimationFrame(() => Narrow.fitHeight()); }
    return { height: Math.round(h), offsetTop: Math.round(top), keyboardOpen: open };
  };
  const seen = () => Narrow.viewport();

  window.addEventListener('DOMContentLoaded', () => {
    seen();
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', seen); window.visualViewport.addEventListener('scroll', seen); }
    window.addEventListener('resize', seen);
    const b = document.getElementById('btn-tags');
    if (b) { b.addEventListener('click', () => Narrow.toggleTags()); b.addEventListener('pointerdown', (e) => e.preventDefault()); } // the selection stays
    const v = document.getElementById('btn-view');
    if (v) { v.addEventListener('click', () => Narrow.setView(Narrow.view() === 'lines' ? 'folio' : 'lines')); Narrow.viewButton(); }
    // the phone's layout of the screen; the brightness pop-up under the scan; a tap elsewhere closes the ⋯ menu
    Narrow.layout(Narrow.on());
    const fb = document.getElementById('btn-filters');
    if (fb) fb.addEventListener('click', () => { const pop = document.getElementById('filters-pop'), pane = document.getElementById('pdf-pane'); if (pop && pane && pop.classList.contains('pf-float')) pop.style.top = Math.round(pane.getBoundingClientRect().bottom + 6) + 'px'; });
    document.addEventListener('pointerdown', (e) => { for (const d of document.querySelectorAll('details.more-menu[open]')) if (!d.contains(e.target)) d.open = false; });
    /* A long press on the text (a finger held still for a moment) opens the tags, for the passage kept by the editor
       (a selection made by finger, which the press itself does not lose) or for the caret: on a phone, and on a
       tablet held upright, wherever the tags are a sheet. While the phone is selecting text itself under the finger
       (the selection is growing), the press is let be. */
    const pane = document.getElementById('editor-pane');
    if (pane) {
      let press = null;
      const stop = () => { if (press) { clearTimeout(press.t); press = null; } };
      const sheets = () => (ME.Device ? ME.Device.sheets() : Narrow.on());
      pane.addEventListener('pointerdown', (e) => {
        if (!sheets() || e.pointerType !== 'touch' || !e.target.closest || !e.target.closest('.line')) return;
        stop();
        press = { x: e.clientX, y: e.clientY, t: setTimeout(() => { press = null; Narrow.toggleTags(true); }, 600) };
      });
      pane.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) stop(); });
      pane.addEventListener('pointerup', stop);
      pane.addEventListener('pointercancel', stop);
      document.addEventListener('selectionchange', () => { if (press && !getSelection().isCollapsed) stop(); });
      pane.addEventListener('contextmenu', (e) => { if (sheets() && ME.Device && ME.Device.touch() && e.target.closest && e.target.closest('.line')) e.preventDefault(); });
    }
    // a tag chosen closes the panel, the cursor still where it was
    const tb = document.getElementById('toolbar');
    if (tb) tb.addEventListener('click', (e) => { if (document.body.classList.contains('tags-open') && e.target.closest('.tb-btn')) setTimeout(() => Narrow.toggleTags(false), 0); });
    // a window made narrow or wide: laid out again with its own sizes
    mq.addEventListener('change', () => { Narrow.toggleTags(false); Narrow.layout(mq.matches); if (ME.App && ME.App.project && ME.App.applyUi) { ME.App.applyUi(); ME.App.rerender(); } });
  });

  ME.Narrow = Narrow;
})(window.ME);
