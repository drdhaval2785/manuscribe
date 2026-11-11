'use strict';
/* Phones, and narrow windows (up to 700 px wide): a line view. A whole folio at the width of a phone has letters of a
   few pixels, so here the typing area and the scan are enlarged together until the letters can be read (about 16 px),
   and both follow the line being typed (Editor.centerLine, the PDF's line guide); the scan takes less height; and
   the tags are one button that opens them from the bottom of the screen (so also on a tablet held upright, up to
   900 px). The sizes chosen here are this device's
   (kept in this browser), not the project's, which keeps those of the computer it is mostly typed on.

   Also, everywhere: the app's height is the height that can be seen (visualViewport; the viewport's
   interactive-widget would do it in Chrome, but Safari reports it as an error), so that on a phone or tablet the keyboard does
   not cover the line being typed. */
(function (ME) {
  const Narrow = {};
  // a phone: narrow, or held sideways (no taller than 460 px, with a finger)
  const mq = window.matchMedia ? window.matchMedia('(max-width: 700px), ((max-height: 460px) and (pointer: coarse))') : { matches: false, addEventListener() {} };
  const KEY = 'manuscribe.narrow';
  const LEGIBLE = 16; // px: the size the letters are brought to
  Narrow.LETTERS_IN_VIEW = 22; // akṣaras of the scan across the screen: readable, with room for the guess of where the letter is
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
  const LINES_OF_SCAN = 3.3; // the line being typed and its neighbours, with a little room

  /* The zoom that makes the letters of the typing area legible, from the size they have now. -> zoom, or null */
  Narrow.legible = function () {
    const E = ME.Editor;
    const line = document.querySelector('#editor-pane .line:not(.mline)');
    if (!line || !E) return null;
    const px = parseFloat(getComputedStyle(line).fontSize);
    if (!px) return null;
    return Math.min(4, Math.max(1, (E.zoom * LEGIBLE) / px));
  };

  /* The zoom of the scan that shows about LETTERS_IN_VIEW akṣaras of a line across the screen, on a calibrated folio:
     from the width of the text block and the usual number of letters in a line. -> zoom, or null */
  Narrow.letterZoom = function () {
    const P = ME.PdfView, A = ME.App, M = ME.Model;
    if (!P || !A || !A.project || !A.entries || !M) return null;
    const e = A.entries[A.idx];
    const reg = e && M.regions(A.project, e);
    const r = reg && reg.boxes && reg.boxes.main;
    if (!r) return null;
    return P.zoomToShow((r[2] * Narrow.LETTERS_IN_VIEW) / (A.project.layout.lettersPerLine || 65));
  };

  /* After a folio is laid out: in a narrow window, the device's own sizes, or legible ones the first time: the
     letters of the typing area 16 px; the scan showing about 22 letters of a line, or, where the folio is not
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
      if (!P) return;
      const applyPdf = () => {
        const pz = st.pdf || Narrow.letterZoom() || z;
        // (a render begun before is cancelled, and pdf.js says so: not an error)
        if (Math.abs(P.zoom - pz) > 0.01) { P.zoom = pz; if (P.entry) Promise.resolve(P.render()).catch(() => {}); }
        label('pdf-zoom', P.zoom);
        // in the line view the scan is about three lines tall, unless the bar between the panes has been dragged
        const pane = document.getElementById('pdf-pane');
        const lh = lines && !st.split && pane ? Narrow.scanLine() : null;
        if (lh) {
          const appH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')) || window.innerHeight;
          pane.style.height = Math.round(Math.min(Math.max(lh * LINES_OF_SCAN + 8, 120), appH * 0.45)) + 'px';
        } else if (pane && Narrow.on()) pane.style.height = Math.round(Narrow.split() * 100) + '%';
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

  /* ---------- the height that can be seen ---------- */
  /* The app is as tall as can be seen (the keyboard takes the rest), and follows the browser where it scrolls the page
     to bring the line typed above the keyboard (Safari on iOS does: visualViewport.offsetTop). While the keyboard is
     open on a phone, the top bar gives its room to the typing area (body.keyboard-open). Measured on the iPhone
     Simulator: the keyboard leaves 362 px of 699, and Safari scrolled the page by up to 306 px. */
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
    const open = Narrow.on() && window.innerHeight - h > 150;
    document.body.classList.toggle('keyboard-open', open);
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
    mq.addEventListener('change', () => { Narrow.toggleTags(false); if (ME.App && ME.App.project && ME.App.applyUi) { ME.App.applyUi(); ME.App.rerender(); } });
  });

  ME.Narrow = Narrow;
})(window.ME);
