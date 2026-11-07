'use strict';
/* Phones, and narrow windows (up to 700 px wide): a line view. A whole folio at the width of a phone has letters of a
   few pixels, so here the typing area and the scan are enlarged together until the letters can be read (about 16 px),
   and both follow the line being typed (Editor.centerLine, the PDF's line guide); the scan takes less height; and
   the tags are one button that opens them from the bottom of the screen (so also on a tablet held upright, up to
   900 px). The sizes chosen here are this device's
   (kept in this browser), not the project's, which keeps those of the computer it is mostly typed on.

   Also, everywhere: the app's height is the height that can be seen, so that on a phone or tablet the keyboard does
   not cover the line being typed. */
(function (ME) {
  const Narrow = {};
  const mq = window.matchMedia ? window.matchMedia('(max-width: 700px)') : { matches: false, addEventListener() {} };
  const KEY = 'manuscribe.narrow';
  const LEGIBLE = 16; // px: the size the letters are brought to
  Narrow.on = () => mq.matches;
  Narrow.state = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  Narrow.save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(Narrow.state(), patch))); } catch (e) { /* this visit only */ } };

  /* The zoom that makes the letters of the typing area legible, from the size they have now. -> zoom, or null */
  Narrow.legible = function () {
    const E = ME.Editor;
    const line = document.querySelector('#editor-pane .line:not(.mline)');
    if (!line || !E) return null;
    const px = parseFloat(getComputedStyle(line).fontSize);
    if (!px) return null;
    return Math.min(4, Math.max(1, (E.zoom * LEGIBLE) / px));
  };

  /* After a folio is laid out: in a narrow window, the device's own sizes, or legible ones the first time. */
  let fitting = false;
  Narrow.fit = function () {
    if (!Narrow.on() || fitting || !ME.App || !ME.App.project) return;
    const E = ME.Editor, P = ME.PdfView;
    const st = Narrow.state();
    const z = st.ed || Narrow.legible();
    if (!z) return;
    fitting = true;
    try {
      if (Math.abs(E.zoom - z) > 0.01) E.setZoom(z);
      const pz = st.pdf || z;
      // (a render begun before is cancelled, and pdf.js says so: not an error)
      if (P && Math.abs(P.zoom - pz) > 0.01) { P.zoom = pz; if (P.entry) Promise.resolve(P.render()).catch(() => {}); }
      const label = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Math.round(v * 100) + '%'; };
      label('ed-zoom', E.zoom); label('pdf-zoom', P ? P.zoom : 1);
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
  };

  /* ---------- the height that can be seen ---------- */
  function seen() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  }

  window.addEventListener('DOMContentLoaded', () => {
    seen();
    if (window.visualViewport) window.visualViewport.addEventListener('resize', seen);
    window.addEventListener('resize', seen);
    const b = document.getElementById('btn-tags');
    if (b) b.addEventListener('click', () => Narrow.toggleTags());
    // a tag chosen closes the panel, the cursor still where it was
    const tb = document.getElementById('toolbar');
    if (tb) tb.addEventListener('click', (e) => { if (document.body.classList.contains('tags-open') && e.target.closest('.tb-btn')) setTimeout(() => Narrow.toggleTags(false), 0); });
    // a window made narrow or wide: laid out again with its own sizes
    mq.addEventListener('change', () => { Narrow.toggleTags(false); if (ME.App && ME.App.project && ME.App.applyUi) { ME.App.applyUi(); ME.App.rerender(); } });
  });

  ME.Narrow = Narrow;
})(window.ME);
