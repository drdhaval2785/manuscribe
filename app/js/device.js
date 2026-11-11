'use strict';
/* What the screen is, in one place: narrow (a phone, up to 700 px); sheets (up to 900 px: a phone, or a tablet held
   upright, where the side panel and the tags open as sheets); tablet (up to 1024 px, with a finger); touch (a
   finger: pointer coarse). Kept as classes on <body> (narrow, sheets, tablet, touch), so that the styles and the code
   agree on what the screen is, and read again when the window changes. Loaded before everything that lays out. */
(function (ME) {
  const D = {};
  const q = (s) => (window.matchMedia ? window.matchMedia(s) : { matches: false, addEventListener() {} });
  const narrow = q('(max-width: 700px)'), sheets = q('(max-width: 900px)'), tablet = q('(max-width: 1024px)'), coarse = q('(pointer: coarse)');
  D.NARROW = 700; D.SHEETS = 900; D.TABLET = 1024;
  // forced on by a test, or by a computer with a touch screen the browser does not report
  let forced = null;
  D.touch = () => (forced !== null ? forced : coarse.matches);
  D.narrow = () => narrow.matches;
  D.sheets = () => sheets.matches;
  D.tablet = () => !narrow.matches && tablet.matches && D.touch();
  D.force = (touch) => { forced = touch === null || touch === undefined ? null : !!touch; D.apply(); };
  D.apply = function () {
    const b = document.body;
    if (!b) return;
    b.classList.toggle('touch', D.touch());
    b.classList.toggle('narrow', D.narrow());
    b.classList.toggle('sheets', D.sheets());
    b.classList.toggle('tablet', D.tablet());
  };
  for (const m of [narrow, sheets, tablet, coarse]) m.addEventListener('change', D.apply);
  if (document.body) D.apply(); else document.addEventListener('DOMContentLoaded', D.apply);
  ME.Device = D;
})(window.ME);
