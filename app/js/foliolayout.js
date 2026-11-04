'use strict';
/* Sizing and measuring a folio on the screen. The exported HTML page carries a copy of this whole
   function (see Export.html), so it may use only the DOM: nothing else of the app. */
window.ME = window.ME || {};
ME.folioLayoutSource = function (ME) {
  const L = {};
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('sa', { granularity: 'grapheme' }) : null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // g: {type, aspect, lines, boxes}; the letters follow from the height of a line
  L.size = function (folio, g, w, scale) {
    folio.style.width = w + 'px';
    folio.style.height = w / g.aspect + 'px';
    for (const boxEl of folio.querySelectorAll('.box')) {
      const box = boxEl.dataset.box;
      const h = boxEl.getBoundingClientRect().height || (parseFloat(boxEl.style.height) / 100) * (w / g.aspect);
      const n = g.lines[box];
      if (g.type === 'interlinear') {
        const row = h / n;
        boxEl.style.setProperty('--lh-gloss', row * 0.4 + 'px');
        boxEl.style.setProperty('--fs-gloss', row * 0.4 * 0.62 * scale + 'px');
        boxEl.style.setProperty('--lh', row * 0.6 + 'px');
        boxEl.style.setProperty('--fs', row * 0.6 * 0.62 * scale + 'px');
      } else {
        const lh = h / n;
        boxEl.style.setProperty('--lh', lh + 'px');
        boxEl.style.setProperty('--fs', lh * 0.62 * scale + 'px');
        // while a line of this block is edited it gets one extra line of room, the others close up
        boxEl.style.setProperty('--lh-tight', h / (n + 1) + 'px');
      }
    }
    folio.style.setProperty('--note-fs', Math.max(10, Math.min(15, w / 90)) + 'px');
  };

  function naturalWidth(line) {
    const prev = line.style.width;
    line.style.width = 'max-content';
    const w = line.getBoundingClientRect().width;
    line.style.width = prev;
    return w;
  }

  // a line longer than its block is set a little smaller
  L.fit = function (line) {
    if (!line.textContent.trim()) return;
    const avail = line.clientWidth - 2, w0 = naturalWidth(line);
    if (w0 > avail) line.style.setProperty('--fit', Math.max(0.5, avail / w0).toFixed(4));
  };

  // The mark of a tag around a vowel sign alone (क<del>ि</del>) is laid over exactly the
  // akṣara it belongs to, measured on screen.
  L.placeSignMarks = function (line) {
    for (const deco of line.querySelectorAll('.signs-only > .sign-deco')) {
      const span = deco.parentNode;
      deco.removeAttribute('style');
      let prev = span.previousSibling;
      while (prev && prev.nodeType === 3 && !prev.nodeValue.replace(/\u200B/g, '')) prev = prev.previousSibling;
      if (!prev || prev.nodeType !== 3) continue;
      const end = prev.nodeValue.replace(/\u200B+$/, '').length;
      let gs = Math.max(0, end - 1);
      if (segmenter) for (const seg of segmenter.segment(prev.nodeValue.slice(0, end))) gs = seg.index;
      const r = document.createRange();
      r.setStart(prev, gs);
      r.setEnd(prev, end);
      const cr = r.getBoundingClientRect(), sr = span.getBoundingClientRect();
      if (!cr.width) continue;
      const right = Math.max(cr.right, sr.left);
      Object.assign(deco.style, { left: cr.left - sr.left + 'px', width: right - cr.left + 'px' });
      if (span.classList.contains('t-del')) Object.assign(deco.style, { top: cr.top - sr.top + 'px', height: cr.height + 'px' });
    }
  };

  // Notes and additions in the margins, where the scribe writes them: in the side margins level
  // with their line (flowing down when there is no room), in the top and bottom margins
  // above/below their place in the line. sides[side] = [{chip, el}]; rules: {left, right}.
  L.margins = function (folio, g, rules, sides) {
    const bs = Object.values(g.boxes);
    const minY = Math.min(...bs.map((r) => r[1])), maxY = Math.max(...bs.map((r) => r[1] + r[3]));
    const minX = Math.min(...bs.map((r) => r[0])), maxX = Math.max(...bs.map((r) => r[0] + r[2]));
    const bands = {
      top: [minX, 0, maxX - minX, minY], bottom: [minX, maxY, maxX - minX, 1 - maxY],
      left: [0, minY, minX, 1 - minY], right: [maxX, minY, 1 - maxX, 1 - minY],
    };
    const fr = folio.getBoundingClientRect();
    for (const side of Object.keys(bands)) {
      const m = folio.querySelector('.margin-' + side);
      const r = bands[side];
      Object.assign(m.style, { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: r[2] * 100 + '%', height: r[3] * 100 + '%' });
      const keep = sides[side].map((it) => it.el);
      for (const old of Array.from(m.children)) if (!keep.includes(old)) old.remove();
      const bw = r[2] * fr.width, bandTop = r[1] * fr.height, bandLeft = r[0] * fr.width;
      let nextY = 2, rowY = 2, rowH = 0, nextX = 0;
      sides[side].forEach((it) => {
        const el = it.el;
        if (el.parentNode !== m) m.appendChild(el);
        const line = it.chip.closest('.line');
        const lr = (line || it.chip).getBoundingClientRect();
        const cr = it.chip.getBoundingClientRect();
        if (side === 'left' || side === 'right') {
          // in the margin outside the red rule (drawn over the neighbour only if it is very narrow)
          const ruleX = (side === 'left' ? rules.left : rules.right) * fr.width;
          const room = side === 'left' ? ruleX - 10 : fr.width - ruleX - 10;
          const w = Math.max(80, room);
          el.style.width = w + 'px';
          el.classList.toggle('overlap', room < 80);
          el.style.left = (side === 'left' ? ruleX - 6 - w : ruleX + 6) - bandLeft + 'px';
          const y = Math.max(lr.top - fr.top - bandTop, nextY);
          el.style.top = y + 'px';
          nextY = y + el.offsetHeight + 2;
        } else {
          el.style.maxWidth = bw + 'px';
          el.style.left = '0';
          const w = Math.min(el.offsetWidth, bw);
          // a note without a placeholder has no place in the line to stand above: it starts at the left
          const want = cr.width || cr.left ? cr.left - fr.left - bandLeft - w / 2 : 0;
          let x = clamp(want, 0, Math.max(0, bw - w));
          if (x < nextX) x = nextX;
          if (x + w > bw && nextX > 0) { rowY += rowH + 2; rowH = 0; x = clamp(want, 0, Math.max(0, bw - w)); }
          el.style.left = x + 'px';
          el.style.top = rowY + 'px';
          nextX = x + w + 8;
          rowH = Math.max(rowH, el.offsetHeight);
        }
      });
    }
  };

  ME.FolioLayout = L;
};
ME.folioLayoutSource(ME);
