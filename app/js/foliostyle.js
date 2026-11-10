'use strict';
/* The look of the folio. It is kept here, not in app.css, because the exported HTML page carries
   a copy of it, and a page opened from disk may not read the rules of its own stylesheets.
   This script stands before app.css in index.html, which keeps the order of the rules. */
window.ME = window.ME || {};
ME.FOLIO_CSS = String.raw`
:root {
  --bg: #ece5d8;
  --chrome: #2b221c;
  --chrome-2: #3a2f27;
  --chrome-ink: #f2e9d8;
  --panel: #fbf7ef;
  --panel-2: #f4ede0;
  --line: #e3d7c3;
  --line-2: #d4c5ad;
  --ink: #2b2017;
  --muted: #7d6c5a;
  --accent: #b23a26;
  --accent-ink: #fff;
  --indigo: #2f5d8a;
  --green: #2e7d32;
  --teal: #0b7285;
  --violet: #6a3d9a;
  --ui: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif;
  --script: 'Tiro Devanagari Sanskrit', 'Noto Serif Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', 'Mangal', serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

/* ---------------- the folio replica ---------------- */
.folio-wrap { padding: 30px 24px 48px; min-width: min-content; }
.folio {
  --paper: rgb(246, 236, 214);
  position: relative; margin: 0 auto; background: var(--paper); color: #24170c;
  border-radius: 5px; font-family: var(--script);
  box-shadow: 0 1px 1px rgba(60,40,20,.25), 0 12px 32px rgba(60,40,20,.28), inset 0 0 40px rgba(120, 80, 30, .10);
}
.folio-texture {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: .35; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .18  0 0 0 .22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
.rule {
  position: absolute; top: 2.5%; bottom: 2.5%; width: 7px; transform: translateX(-50%); pointer-events: none;
  border-left: 1.6px solid rgba(190, 50, 35, .62); border-right: 1.6px solid rgba(190, 50, 35, .62);
}
.box { position: absolute; }
.box:hover { outline: 1px dashed rgba(120, 80, 40, .28); outline-offset: 3px; }
.lines { display: flex; flex-direction: column; height: 100%; }
.line {
  flex: 1 1 0; min-height: 0; position: relative; outline: none; white-space: pre; overflow: visible;
  line-height: var(--lh); font-size: calc(var(--fs) * var(--fit, 1)); caret-color: var(--accent);
  border-radius: 2px; box-shadow: inset 0 -1px 0 rgba(110, 70, 30, .09); cursor: text;
}
.line:hover { background: rgba(255, 255, 255, .16); }
.line.current { background: rgba(255, 210, 90, .20); box-shadow: inset 0 -1.5px 0 rgba(178, 58, 38, .5); }
.lnums {
  position: absolute; right: calc(100% + 4px); top: 0; bottom: 0; width: 22px; display: flex; flex-direction: column;
  pointer-events: none; user-select: none; -webkit-user-select: none;
}
.lnums span { flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: flex-end; font: 600 10px var(--ui); color: rgba(120, 80, 40, .55); opacity: 0; }
.box:hover .lnums span, .lnums span.cur { opacity: 1; }
.box:hover .lnums span { pointer-events: auto; cursor: pointer; }
.lnums span.cur { color: var(--accent); }
.layout-interlinear .lnums span { align-items: flex-end; padding-bottom: 4px; }
.row { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.row .line { flex: 0.6 1 0; }
.row .line.gloss {
  flex: 0.4 1 0; line-height: var(--lh-gloss); font-size: calc(var(--fs-gloss) * var(--fit, 1));
  color: #5b3b1d; box-shadow: inset 0 -1px 0 rgba(110, 70, 30, .05);
}
.box-tag {
  position: absolute; bottom: calc(100% + 4px); right: 0; z-index: 6; display: none; align-items: center; gap: 4px;
  font: 11px var(--ui); color: var(--muted); background: rgba(255, 252, 245, .95); border: 1px solid var(--line-2);
  border-radius: 10px; padding: 1px 4px 1px 9px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.08);
}
.box:hover .box-tag, .box:focus-within .box-tag { display: flex; }
.box-tag-name { font-weight: 650; color: var(--ink); }
.box-tag .mini { width: 18px; height: 18px; border: 1px solid var(--line-2); background: #fff; border-radius: 50%; cursor: pointer; line-height: 1; padding: 0; color: var(--ink); }
.box-tag .mini:hover { border-color: var(--accent); color: var(--accent); }
.margin { position: absolute; font-size: var(--note-fs, 12px); line-height: 1.25; }
.mnote { position: absolute; font-family: var(--script); overflow-wrap: anywhere; white-space: normal; z-index: 2; }
.margin-left .mnote { text-align: right; }
.mnote.overlap { background: var(--paper); border-radius: 4px; padding: 2px 4px; box-shadow: 0 1px 6px rgba(60, 40, 20, .25); z-index: 7; }
.line.mline {
  display: inline-block; vertical-align: top; min-width: 1.5em; min-height: 1em; max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere;
  font-size: inherit; line-height: inherit; box-shadow: none; border-radius: 3px; padding: 0 .15em;
}
.line.mline:hover { background: rgba(255, 255, 255, .35); }
.line.mline.current { background: rgba(255, 210, 90, .32); box-shadow: inset 0 -1px 0 rgba(178, 58, 38, .5); }
.mnote sup { cursor: pointer; font: 700 9px var(--ui); color: #fff; background: var(--accent); border-radius: 6px; padding: 0 4px; margin-right: 3px; vertical-align: 3px; }
.mnote-add sup { background: var(--green); }
.mnote.en { font-family: var(--ui); font-style: italic; }
.margin-foot { top: 100%; left: 0; right: 0; margin-top: 14px; padding: 8px 12px 10px; background: #fff; border: 1px solid var(--line-2); border-radius: 5px; color: #24170c; }
.margin-foot[hidden] { display: none; }
.margin-foot::before { content: 'Editorial notes'; display: block; margin-bottom: 4px; font: 600 11px var(--ui); color: var(--muted); }
.margin-foot .mnote { position: static; display: flex; align-items: baseline; margin-top: 2px; }
.margin-foot .mline { flex: 1; display: block; }
.margin-foot .mline:hover { background: rgba(120, 80, 40, .06); }

/* ---------------- tags inside lines ---------------- */
.t-del { text-decoration: line-through; text-decoration-color: #c62828; text-decoration-thickness: .09em; color: #6d2a22; }
.t-unclear { text-decoration: underline dotted rgba(70, 50, 30, .85); text-underline-offset: .18em; color: #6c5a48; }
.t-sic { text-decoration: underline wavy #d9822b; text-underline-offset: .2em; text-decoration-thickness: .05em; }
.t-supplied { color: var(--indigo); background: rgba(47, 93, 138, .10); border-radius: 2px; }
.t-surplus { color: #8a6d3b; text-decoration: overline; text-decoration-color: rgba(138, 109, 59, .7); }
.t.spans { box-shadow: inset 0 -1px 0 rgba(0, 0, 0, .12); }
.t-retrace { text-shadow: .05em .04em 0 rgba(100, 55, 20, .55); }
.t-hi { color: #c0321f; margin-inline: .08em; }
.t-quote { color: var(--teal); }
.t-note.chip.no-anchor { display: none; }
.t-lb.chip, .t-pb.chip { font: 600 max(8px, .42em) var(--ui); color: var(--muted); vertical-align: .6em; }
.t-add:not(.chip) { color: var(--green); text-decoration: underline; text-decoration-color: rgba(46, 125, 50, .45); }
.t-orig { text-decoration: underline dotted var(--violet); text-underline-offset: .18em; }
.t-subst, .t-choice { border-radius: 2px; }
.t-subst:hover, .t-choice:hover { background: rgba(0, 0, 0, .04); }
.chip { cursor: pointer; user-select: none; -webkit-user-select: none; border-radius: 3px; letter-spacing: 0; }
.t-gap.chip { color: #6b5a48; background: rgba(0, 0, 0, .05); border: 1px dashed rgba(70, 50, 30, .45); padding: 0 .12em; font-size: .85em; }
.t-space.chip { display: inline-block; height: .7em; border-bottom: 1.5px dashed rgba(47, 93, 138, .7); vertical-align: baseline; }
.t-caesura.chip { color: var(--indigo); font-weight: bold; padding: 0 .05em; }
.t-pc.chip { color: rgba(80, 60, 40, .5); font-size: .7em; vertical-align: middle; }
.t-metamark.chip { color: #c0321f; }
.t-milestone.chip { color: var(--indigo); background: rgba(47, 93, 138, .09); font: 600 .45em var(--ui); vertical-align: .6em; padding: .05em .35em; }
.chip.above, .chip.below { display: inline-block; position: relative; width: 0; padding: 0; vertical-align: baseline; }
.chip .float {
  position: absolute; left: 0; transform: translateX(-50%); white-space: nowrap; font-size: .64em; line-height: 1;
  color: var(--green); background: color-mix(in srgb, var(--paper, #f6ecd6) 70%, transparent); padding: 0 .1em; border-radius: 2px;
}
.chip.above .float { bottom: .82em; }
.chip.below .float { top: .4em; }
.caretmark { position: absolute; left: 0; transform: translateX(-50%); bottom: -.05em; font-size: .62em; color: var(--green); line-height: 1; }
.t-corr.chip .float { color: var(--indigo); font-style: italic; }
.chip.in-margin { vertical-align: .55em; }
.chip.in-margin .caretmark { position: static; transform: none; font-size: .5em; margin-right: .05em; }
.chip .anchor { font: 700 max(8px, .4em) var(--ui); color: #fff; background: var(--accent); border-radius: 7px; padding: .05em .45em; }
.t-add.chip .anchor { background: var(--green); }
.inline-note { font-size: .62em; color: #8a2a17; background: rgba(178, 58, 38, .08); border-radius: 3px; padding: 0 .25em; vertical-align: .3em; }
.t-x-marker.chip {
  font: 650 max(9px, .4em) var(--ui); vertical-align: .75em; padding: .05em .4em; border-radius: 8px; white-space: nowrap; margin: 0 .05em;
}
.m-p-start, .m-p-end { color: #6b4f2a; background: rgba(107, 79, 42, .13); }
.m-lg-start, .m-lg-end, .m-l { color: var(--violet); background: rgba(106, 61, 154, .12); }
.m-q-start, .m-q-end { color: var(--teal); background: rgba(11, 114, 133, .13); }
.folio.hide-markers .t-x-marker { display: none; }
/* a tint, not an outline: an outline would stand in the space beside the tag */
.t.active { background-color: rgba(178, 58, 38, .12); border-radius: 2px; }
/* raised marks must not push the text of their line down, into the next one */
.chip.in-margin, .t-x-marker.chip, .t-milestone.chip, .t-lb.chip, .t-pb.chip, .t-pc.chip { line-height: 0; }
.chip.active { outline: 1.5px solid rgba(178, 58, 38, .65); outline-offset: 1px; }

/* ---------------- tags around a vowel sign only (क + <del>ि</del>) ---------------- */
.t.signs-only { position: relative; }
.sign-deco { position: absolute; left: -0.72em; width: 0.68em; height: 0.09em; bottom: -0.06em; background: #8a7a68; border-radius: 1px; pointer-events: none; user-select: none; }
/* a deleted sign: the akṣara is tinted red (the ink turns red, the paper stays) - no stroke */
.t-del > .sign-deco { bottom: auto; top: -0.1em; height: 1.25em; background: #c8261c; mix-blend-mode: lighten; border-radius: 2px; }
.t-add > .sign-deco { background: var(--green); }
.t-unclear > .sign-deco { background: none; border-bottom: 0.09em dotted #6c5a48; height: 0; }
.t-sic > .sign-deco { background: #d9822b; }
.t-supplied > .sign-deco { background: var(--indigo); }
.t-surplus > .sign-deco { bottom: auto; top: -0.02em; background: #8a6d3b; }
.t-hi > .sign-deco { background: #c0321f; }
.t-retrace > .sign-deco { background: #6b4f2a; }
.t-orig > .sign-deco { background: none; border-bottom: 0.09em dotted var(--violet); height: 0; }
.t.signs-only.active > .sign-deco { box-shadow: 0 0 0 1.5px rgba(178, 58, 38, .5); }
/* the line being edited gets one line of extra room; the other lines of its block close up */
.box.has-current .lines > .line { line-height: var(--lh-tight); }
.box.has-current .lines > .line.current { flex-grow: 2; line-height: calc(var(--lh-tight) * 2); }
.box.has-current .lnums span.cur { flex-grow: 2; }
/* the line view (a phone): three strips the width of the screen - the line being typed, the one above and the one
   below - each scrolling along its own text, the notes of the line under it; the rest of the folio is not drawn */
.folio-wrap.line-view { min-width: 0; width: 100%; box-sizing: border-box; }
.folio.line-view { display: flex; flex-direction: column; width: 100% !important; max-width: 100%; height: auto !important; min-height: 100%; margin: 0; border-radius: 0; box-shadow: none; }
.folio.line-view .folio-texture, .folio.line-view .rule, .folio.line-view .lnums { display: none; }
.folio.line-view .box { position: static !important; left: auto !important; top: auto !important; width: auto !important; height: auto !important; order: 1; display: flex; flex-direction: column; }
.folio.line-view .box:hover { outline: none; }
.folio.line-view .box .lines { display: block; height: auto; }
.folio.line-view .row { display: block; }
.folio.line-view .line:not(.mline) { display: none; }
.folio.line-view .line.near { display: block; flex: none; width: auto; max-width: 100%; box-sizing: border-box; height: auto; min-height: 1.4em; padding: 4px 50% 4px 10px; overflow-x: auto; overflow-y: hidden; white-space: pre; scrollbar-width: none; box-shadow: inset 0 -1px 0 rgba(110, 70, 30, .18); }
.folio.line-view .line.near::-webkit-scrollbar { display: none; }
.folio.line-view .box.has-current .lines > .line, .folio.line-view .box.has-current .lines > .line.current { flex-grow: 0; line-height: var(--lh); }
.folio.line-view .box-tag { position: static; display: block; order: -1; margin: 6px 10px 2px; font-size: 11px; opacity: .75; align-self: flex-start; }
.folio.line-view .margin { position: static; order: 2; width: auto; height: auto; }
.folio.line-view .margin-foot { order: 3; }
.folio.line-view .mnote { display: none; }
.folio.line-view .mnote.near, .folio.line-view .margin-foot .mnote { display: block; position: static !important; left: auto !important; top: auto !important; width: auto !important; max-width: none !important; margin: 4px 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255, 255, 255, .35); }
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ME.FOLIO_CSS }));
