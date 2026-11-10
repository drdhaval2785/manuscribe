'use strict';
/* The scan follows the letter being typed. Where the caret is along the line is reckoned in letters, not pixels: the
   akṣaras typed before it, over the number the line is expected to have. That number is the line's own count where
   its text already runs on beyond the caret; else the average of the lines typed above it on this side; else the
   figure given when the transcription was set up (65 to begin with). So the figure given need only be rough: the
   real one is learnt from the lines typed, and the unit has only to be the same above and below the line.

   Letters are counted as a reader of the page would: an akṣara is one, a conjunct (क्ष, स्त्र) is one, a space or a
   placeholder for a note is none. In a script without akṣaras a letter is one. */
(function (ME) {
  const Follow = {};
  Follow.DEFAULT_PER_LINE = 65;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  // a piece ending in one of these joins the letter after it into the same akṣara: the viramas of the Indic scripts, and the joiners
  const JOINS = /[्্੍્୍்్್്්္်᜔្᩠᭄᮪᮫᯲᯳꠆꣄꥓꯭\u{10A3F}\u{11046}\u{1107F}\u{110B9}\u{11133}\u{11134}\u{111C0}\u{11235}\u{112EA}\u{1134D}\u{11442}\u{114C2}\u{115BF}\u{1163F}\u{116B6}\u{1172B}\u{11839}\u{1193D}\u{1193E}\u{11A34}\u{11A47}\u{11A99}\u{11C3F}\u{11D44}\u{11D45}\u{11D97}‌‍]$/u;

  /* How many akṣaras in a text. -> number */
  Follow.count = function (text) {
    const t = String(text || '').replace(/[\s￼​]+/g, '');
    if (!t) return 0;
    let n = 0, joined = false;
    for (const p of seg ? Array.from(seg.segment(t), (x) => x.segment) : Array.from(t)) {
      if (!(joined && /^\p{L}/u.test(p))) n++;
      joined = JOINS.test(p);
    }
    return n;
  };

  /* How many akṣaras a line of this page is expected to have, from the lines typed above it (the last five of about
     the usual length; a short last line of a paragraph does not count), else the figure given. -> number */
  Follow.expected = function (above, perLine) {
    const typed = (above || []).filter((n) => n > 0);
    if (!typed.length) return perLine || Follow.DEFAULT_PER_LINE;
    const sorted = typed.slice().sort((a, b) => a - b), median = sorted[sorted.length >> 1];
    const full = typed.filter((n) => n >= 0.6 * median).slice(-5);
    return full.reduce((a, b) => a + b, 0) / full.length;
  };

  /* Where the caret is along its line, 0..1. before: akṣaras before the caret; total: in the line; atEnd: nothing
     after the caret but spaces; above: the counts of the lines above on this side; perLine: the figure given;
     complete: the line has been typed to its end (there is text on a line below it). A line's own length counts
     only once it is complete, or about as long as the lines above: in a line typed halfway, a click on its third
     word is a third of the way along the typed part, not of the line. */
  Follow.fraction = function ({ before, total, atEnd, above, perLine, complete }) {
    const usual = Follow.expected(above, perLine);
    const own = !atEnd && total > 0 && (complete || total >= 0.75 * usual);
    let expected = own ? total : usual;
    if (expected < before + 1) expected = before + 1; // never past the end of the line
    return Math.max(0, Math.min(1, before / expected));
  };

  /* For the line being typed on the screen. pos: {box, i}. -> 0..1, or null (a marginal note, or no caret) */
  Follow.along = function (project, line, pos) {
    const E = ME.Editor;
    if (!E || !line || !pos || line.classList.contains('mline')) return null;
    const off = E.caretOffset(line);
    if (off === null) return null;
    const text = E.unitText(line);
    const above = [];
    for (let k = Math.max(0, pos.i - 8); k < pos.i; k++) {
      const el = E.lineEl(pos.box, k);
      if (el) above.push(Follow.count(E.unitText(el)));
    }
    // typed on below this line: the line is complete, and its own length is the measure
    let complete = false;
    for (let k = pos.i + 1, el = E.lineEl(pos.box, k); el && !complete; k++, el = E.lineEl(pos.box, k)) complete = /\S/.test(E.unitText(el));
    return Follow.fraction({ before: Follow.count(text.slice(0, off)), total: Follow.count(text), atEnd: off >= text.replace(/\s+$/, '').length, above, perLine: project && project.layout && project.layout.lettersPerLine, complete });
  };

  ME.Follow = Follow;
})(window.ME);
