'use strict';
/* Folio editor (bottom pane). Renders a replica of the folio side - same proportions,
   blocks and number of lines as the manuscript - where every physical line is its own
   editable strip. Handles typing, line navigation, multi-line selection, clipboard and undo.
   The text of a marginal note is edited in place, in a "margin line" (.line.mline) which works
   like a line of the folio and is saved into the note's mark (its chip) in the host line.
   Nothing is generated with CSS ::before/::after inside an editable line: input methods
   such as Keyman read the text before the caret, and generated text would mislead them. */
(function (ME) {
  const { U, TEI, Model, Translit, Spans } = ME;
  const ZW = '​';

  const Editor = {
    project: null,
    entry: null,
    geom: null,
    pageSize: null,
    paper: null,
    zoom: 1,
    hooks: {},
    current: null, // {box, i}
    multi: null, // selection over several lines of this folio: {a, f} = {box, i, offset}
    pending: null, // start of a tag that will end elsewhere: {label, box, i, offset}
  };

  let pane, wrap, folio;
  let drag = null;

  Editor.init = function (paneEl, hooks) {
    pane = paneEl;
    Editor.hooks = hooks || {};
    wrap = U.el('div', { class: 'folio-wrap' });
    pane.appendChild(wrap);
    new ResizeObserver(U.debounce(() => Editor.relayout(), 80)).observe(pane);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', () => {
      drag = null;
      if (centerAfterDrag && document.activeElement === centerAfterDrag) {
        openRoom(centerAfterDrag);
        if (!Editor.multi) Editor.centerLine(centerAfterDrag);
      }
      centerAfterDrag = null;
    });
  };

  const hook = (name, ...args) => { if (Editor.hooks[name]) return Editor.hooks[name](...args); };
  const isM = (line) => line.classList.contains('mline');

  /* ---------- rendering ---------- */

  Editor.render = function (project, entry, pageSize) {
    Editor.project = project;
    Editor.entry = entry;
    if (pageSize) Editor.pageSize = pageSize;
    Editor.current = null;
    Editor.multi = null;
    paintMulti([]);
    tlReset();
    const g = Editor.typingGeom(project, entry, Editor.pageSize || (project.pdf && project.pdf.size));
    Editor.geom = g;
    Editor.rules = ruleXs(g);
    wrap.innerHTML = '';
    folio = Editor.buildFolio(project, entry, g);

    folio.addEventListener('keydown', onKeyDown);
    folio.addEventListener('beforeinput', onBeforeInput);
    folio.addEventListener('input', onInput);
    folio.addEventListener('paste', onPaste);
    folio.addEventListener('copy', (e) => onCopy(e, false));
    folio.addEventListener('cut', (e) => onCopy(e, true));
    folio.addEventListener('focusin', onFocusIn);
    folio.addEventListener('focusout', onFocusOut);
    folio.addEventListener('mousedown', onMouseDown);
    folio.addEventListener('dblclick', onDblClick);
    folio.addEventListener('click', onClick);
    folio.addEventListener('dragstart', (e) => e.preventDefault());

    wrap.appendChild(folio);
    Editor.applyPaper(Editor.paper);
    Editor.relayout();
    pane.scrollTop = Math.max(0, Math.round(pane.clientHeight / 2) - 30); // top of the folio in view
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Editor.fitAll(); Editor.refreshMargins(); });
  };

  // The folio with its lines, not yet on the page (the exported HTML page is made from it too).
  Editor.buildFolio = function (project, entry, g) {
    const el = U.el('div', { class: 'folio layout-' + g.type + (project.settings.showMarkers ? '' : ' hide-markers') });
    el.appendChild(U.el('div', { class: 'folio-texture' }));
    for (const side of ['top', 'bottom', 'left', 'right', 'foot']) el.appendChild(U.el('div', { class: 'margin margin-' + side, dataset: { side } }));
    for (const x of ruleXs(g).xs) el.appendChild(U.el('div', { class: 'rule', style: { left: x * 100 + '%' } }));

    for (const box of Model.LAYOUTS[g.type].boxes) {
      if (box === 'gloss') continue;
      const r = g.boxes[box];
      const boxEl = U.el('div', {
        class: 'box box-' + box, dataset: { box },
        style: { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: r[2] * 100 + '%', height: r[3] * 100 + '%' },
      });
      const linesEl = U.el('div', { class: 'lines' });
      const nums = U.el('div', { class: 'lnums', 'aria-hidden': 'true' });
      const n = g.lines[box];
      if (g.type === 'interlinear') {
        const glossArr = Model.boxLines(project, entry.label, 'gloss');
        const mainArr = Model.boxLines(project, entry.label, 'main');
        for (let i = 0; i < n; i++) {
          linesEl.appendChild(U.el('div', { class: 'row' }, makeLine('gloss', i, glossArr[i]), makeLine('main', i, mainArr[i])));
        }
      } else {
        const arr = Model.boxLines(project, entry.label, box);
        for (let i = 0; i < n; i++) linesEl.appendChild(makeLine(box, i, arr[i]));
      }
      for (let i = 0; i < n; i++) nums.appendChild(U.el('span', { dataset: { i: String(i) } }, Model.lineNumber(project, entry.label, g.type === 'interlinear' ? 'main' : box, i)));
      boxEl.append(nums, linesEl, makeBoxTag(box, n, g.type));
      el.appendChild(boxEl);
    }
    if (ME.HTR) ME.HTR.mark(el, project, entry.label);
    return el;
  };

  function makeLine(box, i, content) {
    const line = U.el('div', {
      class: 'line' + (box === 'gloss' ? ' gloss' : ''), contenteditable: 'true', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      dataset: { box, i: String(i) },
    });
    line.appendChild(TEI.toHtml(content || ''));
    return line;
  }

  function makeBoxTag(box, n, type) {
    const label = type === 'interlinear' ? 'Lines (with interlinear commentary above)' : Model.BOX_LABEL[box];
    return U.el('div', { class: 'box-tag', contenteditable: 'false' },
      U.el('span', { class: 'box-tag-name' }, label),
      U.el('button', { class: 'mini', title: 'One line fewer on this folio', onmousedown: (e) => e.preventDefault(), onclick: () => hook('onLinesChange', box, n - 1) }, '−'),
      U.el('span', { class: 'box-tag-n' }, n + ' lines'),
      U.el('button', { class: 'mini', title: 'One more line on this folio (or press Enter on the last line)', onmousedown: (e) => e.preventDefault(), onclick: () => hook('onLinesChange', box, n + 1) }, '+'));
  }

  // The typing folio is wider than the leaf: extra side margins hold the marginal notes.
  const EXTRA_MARGIN = 0.12; // of the leaf width, on each side
  function widen(g) {
    const k = 1 + 2 * EXTRA_MARGIN;
    const boxes = {};
    for (const [b, r] of Object.entries(g.boxes)) boxes[b] = [(r[0] + EXTRA_MARGIN) / k, r[1], r[2] / k, r[3]];
    return Object.assign({}, g, { boxes, aspect: g.aspect * k });
  }
  Editor.typingGeom = (project, entry, pageSize) => widen(Model.geometry(project, entry, pageSize));

  // red rules just beside the text, as in the manuscripts; the margins lie outside them
  function ruleXs(g) {
    const bs = Object.values(g.boxes);
    const minX = Math.min(...bs.map((r) => r[0])), maxX = Math.max(...bs.map((r) => r[0] + r[2]));
    const xs = [minX - 0.008, maxX + 0.008];
    if (g.type === 'pancapatha' && g.boxes.left && g.boxes.main && g.boxes.right) {
      xs.push((g.boxes.left[0] + g.boxes.left[2] + g.boxes.main[0]) / 2, (g.boxes.main[0] + g.boxes.main[2] + g.boxes.right[0]) / 2);
    }
    return { left: xs[0], right: xs[1], xs };
  }
  Editor.ruleXs = ruleXs;

  Editor.applyPaper = function (rgb) {
    Editor.paper = rgb;
    if (!folio) return;
    const mode = Editor.project && Editor.project.settings.paper;
    let c = [246, 236, 214];
    if (mode === 'auto' && rgb) c = rgb.map((v) => Math.round(v + (255 - v) * 0.3));
    else if (mode === 'white') c = [253, 252, 248];
    folio.style.setProperty('--paper', `rgb(${c.join(',')})`);
  };

  // Keeps a line in the vertical middle of the editor pane, so the eyes need not go to the
  // bottom of the screen. The folio has half a pane of room above and below for this.
  Editor.centerLine = function (line, instant) {
    if (!line || !pane) return;
    const pr = pane.getBoundingClientRect(), lr = line.getBoundingClientRect();
    const dy = lr.top + lr.height / 2 - (pr.top + pr.height / 2);
    let dx = 0;
    if (lr.left < pr.left + 20) dx = lr.left - pr.left - 20;
    else if (lr.left > pr.right - 60) dx = lr.left - pr.left - 40;
    if (Math.abs(dy) > 2 || dx) pane.scrollBy({ top: dy, left: dx, behavior: instant ? 'auto' : 'smooth' });
  };
  let centerAfterDrag = null;

  Editor.relayout = function () {
    if (!folio || !Editor.geom) return;
    const g = Editor.geom;
    const half = Math.round(pane.clientHeight / 2);
    wrap.style.paddingTop = half + 'px';
    wrap.style.paddingBottom = half + 'px';
    const avail = Math.max(320, pane.clientWidth - 48);
    const w = avail * Editor.zoom;
    ME.FolioLayout.size(folio, g, w, Editor.project.settings.textScale || 1);
    Editor.fitAll();
    const cur = activeLine();
    if (cur) Editor.centerLine(cur, true);
    Editor.refreshMargins();
    drawPending();
    if (Editor.multi) paintMulti(multiRanges());
  };

  Editor.setZoom = function (z) { Editor.zoom = U.clamp(z, 0.5, 4); Editor.relayout(); };

  /* ---------- fitting long lines; marks of tagged vowel signs ---------- */

  // Lines are kept exactly as typed. Only a line longer than its block is set a little
  // smaller, so that it does not run into the next block or the margin.
  Editor.fitLine = function (line) {
    line.style.removeProperty('--fit');
    if (!isM(line) && line !== document.activeElement) ME.FolioLayout.fit(line);
    placeSignMarks(line);
  };

  Editor.fitAll = function () { if (folio) U.$$('.line:not(.mline)', folio).forEach(Editor.fitLine); };

  const placeSignMarks = (line) => ME.FolioLayout.placeSignMarks(line);

  /* ---------- margin notes ---------- */

  // Notes and additions in the margins are drawn where the scribe writes them: in the
  // side margins level with their line (flowing down when there is no room), in the top
  // and bottom margins above/below their place in the line. Their text can be edited and
  // tagged in place, like a line of the folio.
  function marginNote(it) {
    let el = it.chip._mnote;
    if (!el || !el.isConnected) {
      const body = U.el('span', { class: 'line mline', contenteditable: 'true', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
      body._chip = it.chip;
      el = U.el('span', { class: 'mnote' }, U.el('sup', { title: 'Edit this note’s place, language, hand …', onmousedown: (e) => e.preventDefault(), onclick: () => hook('onEditChip', it.chip) }), body);
      el._body = body;
      it.chip._mnote = el;
    }
    el.className = 'mnote mnote-' + it.kind + (it.lang === 'en' ? ' en' : '');
    el.title = (it.kind === 'add' ? 'Addition' : 'Note') + ' — type and tag here like in a line';
    const sup = el.firstChild;
    sup.textContent = it.num || '';
    sup.hidden = !it.num;
    const body = el._body;
    if (TEI.fromHtml(body) !== (it.chip.dataset.c || '')) {
      body.innerHTML = '';
      body.appendChild(TEI.toHtml(it.chip.dataset.c || ''));
    }
    return el;
  }

  // Numbers the notes and additions outside the line; which side of the folio each one goes to.
  Editor.collectNotes = function (root) {
    const sides = { top: [], bottom: [], left: [], right: [], foot: [] };
    let num = 0;
    for (const chip of U.$$('.t-note.chip, .t-add.chip', root)) {
      if (chip.closest('.mline')) continue;
      const a = JSON.parse(chip.dataset.a || '{}');
      const place = TEI.placeOf(chip.dataset.t, a);
      if (['above', 'below', 'inline'].includes(place)) continue;
      const hidden = chip.classList.contains('no-anchor');
      if (!hidden) {
        num++;
        chip.dataset.num = String(num);
        const anchor = chip.querySelector('.anchor');
        if (anchor) anchor.textContent = String(num);
      }
      sides[place].push({ num: hidden ? 0 : num, chip, kind: chip.dataset.t, lang: a['xml:lang'] });
    }
    return sides;
  };
  Editor.marginNote = marginNote;

  Editor.refreshMargins = function () {
    if (!folio) return;
    const sides = Editor.collectNotes(folio);
    // editorial notes: a list below the folio, in the order of the text
    const foot = folio.querySelector('.margin-foot');
    const inFoot = sides.foot.map(marginNote);
    for (const old of Array.from(foot.children)) if (!inFoot.includes(old)) old.remove();
    inFoot.forEach((el, k) => {
      el.removeAttribute('style');
      if (foot.children[k] !== el) foot.insertBefore(el, foot.children[k] || null);
    });
    foot.hidden = !inFoot.length;
    const placed = {};
    for (const side of ['top', 'bottom', 'left', 'right']) placed[side] = sides[side].map((it) => ({ chip: it.chip, el: marginNote(it) }));
    ME.FolioLayout.margins(folio, Editor.geom, Editor.rules, placed);
  };

  /* ---------- lookup helpers ---------- */

  Editor.lineEl = (box, i) => folio && folio.querySelector(`.line[data-box="${box}"][data-i="${i}"]`);
  Editor.folioEl = () => folio;
  const lineOf = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el ? el.closest('.line') : null;
  };
  Editor.lineOf = lineOf;
  // the place of a line; a margin line counts as the folio line its note is anchored in
  const posOf = (line) => {
    const l = isM(line) ? line._chip.closest('.line') || line : line;
    return { box: l.dataset.box, i: +l.dataset.i };
  };
  Editor.posOf = posOf;
  const activeLine = () => {
    const a = document.activeElement;
    return a && a.classList && a.classList.contains('line') && folio && folio.contains(a) ? a : null;
  };
  Editor.activeLine = activeLine;
  const lineCount = (box) => Editor.geom.lines[box === 'gloss' ? 'main' : box];

  /* ---------- caret ---------- */

  Editor.caretOffset = function (line, end) {
    const sel = getSelection();
    if (!sel.rangeCount || !line.contains(sel.anchorNode)) return null;
    const s = sel.getRangeAt(0);
    return end ? Spans.offsetOf(line, s.endContainer, s.endOffset) : Spans.offsetOf(line, s.startContainer, s.startOffset);
  };
  Editor.lineLength = (line) => Spans.units(line);

  // How far along its line the cursor is (0..1), for the PDF to follow.
  Editor.caretFraction = function (line) {
    const cr = caretRect();
    if (!cr) return null;
    const lr = line.getBoundingClientRect();
    return lr.width ? U.clamp((cr.left - lr.left) / lr.width, 0, 1) : null;
  };

  Editor.setCaret = function (line, offset) {
    const p = Spans.pointAt(line, Math.max(0, offset));
    const r = document.createRange();
    r.setStart(p.node, p.offset);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  function selectWithin(line, from, to) {
    const a = Spans.pointAt(line, from), b = Spans.pointAt(line, to);
    getSelection().setBaseAndExtent(a.node, a.offset, b.node, b.offset);
  }

  Editor.focusLine = function (box, i, where) {
    const line = Editor.lineEl(box, i);
    if (!line) return null;
    line.focus({ preventScroll: true });
    if (where === 'end') Editor.setCaret(line, Editor.lineLength(line));
    else if (typeof where === 'number') Editor.setCaret(line, where);
    else Editor.setCaret(line, 0);
    return line;
  };

  // Continue typing in a block: the end of its last line with text (or its first line).
  Editor.focusContinue = function (box) {
    const arr = Model.boxLines(Editor.project, Editor.entry.label, box);
    let last = -1;
    for (let k = 0; k < lineCount(box); k++) if (TEI.hasContent(arr[k])) last = k;
    return last < 0 ? Editor.focusLine(box, 0, 'start') : Editor.focusLine(box, last, 'end');
  };

  // Put the caret just after `node`, outside any wrapper, so that typing continues outside it.
  Editor.caretAfter = function (node) {
    let t = node.nextSibling;
    // never put the zero-width space between a consonant and its vowel sign: it would split the akṣara
    if (t && t.nodeType === 3 && /^\p{M}/u.test(t.nodeValue)) { getSelection().collapse(t, 0); return; }
    if (!t || t.nodeType !== 3) {
      t = document.createTextNode(ZW);
      node.parentNode.insertBefore(t, node.nextSibling);
    } else if (t.nodeValue[0] !== ZW) {
      t.insertData(0, ZW);
    }
    const r = document.createRange();
    r.setStart(t, 1);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  Editor.caretInside = function (span) {
    const t = document.createTextNode(ZW);
    span.appendChild(t);
    const r = document.createRange();
    r.setStart(t, 1);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // deleteData (not nodeValue=) so that saved selections, e.g. while a dialog is open, stay valid
  function cleanZw(line) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const kill = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      for (let k = t.nodeValue.lastIndexOf(ZW); k >= 0; k = t.nodeValue.lastIndexOf(ZW, k - 1)) {
        t.deleteData(k, 1);
        if (k === 0) break;
      }
      if (!t.nodeValue) kill.push(t);
    }
    kill.forEach((t) => t.remove());
  }

  /* ---------- model sync ---------- */

  Editor.commit = function (line) {
    if (isM(line)) {
      // the text of a margin line lives in its note's mark in the host line
      const chip = line._chip;
      if (line.querySelector('.t')) TEI.decorateSigns(line);
      const c = TEI.fromHtml(line);
      if ((chip.dataset.c || '') === c) return;
      chip.dataset.c = c;
      TEI.paintChip(chip);
      if (line.querySelector('.signs-only')) placeSignMarks(line);
      const host = chip.closest('.line');
      if (host) Editor.commit(host);
      return;
    }
    const { box, i } = posOf(line);
    const arr = Model.boxLines(Editor.project, Editor.entry.label, box);
    if (line.querySelector('.t')) TEI.decorateSigns(line);
    const tei = TEI.fromHtml(line);
    if (arr[i] === tei) return;
    arr[i] = tei;
    if (line.querySelector('.signs-only')) placeSignMarks(line);
    if (line.querySelector('.t-note, .t-add') || line.dataset.hadNotes) {
      line.dataset.hadNotes = line.querySelector('.t-note, .t-add') ? '1' : '';
      Editor.refreshMargins();
    }
    hook('onChange');
  };

  Editor.refreshLine = function (box, i) {
    const line = Editor.lineEl(box, i);
    if (!line) return;
    const arr = Model.boxLines(Editor.project, Editor.entry.label, box);
    line.innerHTML = '';
    line.appendChild(TEI.toHtml(arr[i] || ''));
    Editor.fitLine(line);
  };

  Editor.refreshAll = function () {
    if (!folio) return;
    for (const line of U.$$('.line:not(.mline)', folio)) Editor.refreshLine(line.dataset.box, +line.dataset.i);
    Editor.refreshMargins();
    Editor.refreshNumbers();
    drawPending();
  };

  // The numbers in the gutter follow the line numbers given in imported or pasted XML.
  Editor.refreshNumbers = function () {
    for (const boxEl of U.$$('.box', folio)) {
      const box = boxEl.dataset.box;
      for (const sp of U.$$('.lnums span', boxEl)) sp.textContent = Model.lineNumber(Editor.project, Editor.entry.label, box, +sp.dataset.i);
    }
  };

  /* ---------- undo / redo (per folio side) ---------- */

  const undoStacks = new Map();
  let lastKind = null, lastTime = 0, lastLine = null;
  function stacks() {
    const k = Editor.entry.label;
    if (!undoStacks.has(k)) undoStacks.set(k, { undo: [], redo: [] });
    return undoStacks.get(k);
  }
  function snapshot() {
    const pg = Model.page(Editor.project, Editor.entry.label);
    const line = activeLine();
    return {
      boxes: U.clone(pg.boxes), lines: pg.lines ? U.clone(pg.lines) : null, lb: pg.lb ? U.clone(pg.lb) : null,
      caret: line ? Object.assign(posOf(line), { offset: isM(line) ? 'end' : Editor.caretOffset(line) || 0 }) : null,
    };
  }
  Editor.capture = function (kind) {
    if (!Editor.entry) return;
    const now = Date.now();
    const line = document.activeElement;
    if (kind === 'typing' && lastKind === 'typing' && now - lastTime < 1500 && line === lastLine) { lastTime = now; return; }
    lastLine = line;
    const s = stacks();
    s.undo.push(snapshot());
    if (s.undo.length > 300) s.undo.shift();
    s.redo = [];
    lastKind = kind;
    lastTime = now;
  };
  function restore(snap) {
    const pg = Model.page(Editor.project, Editor.entry.label);
    pg.boxes = U.clone(snap.boxes);
    const linesChanged = JSON.stringify(pg.lines || null) !== JSON.stringify(snap.lines);
    if (snap.lines) pg.lines = U.clone(snap.lines); else delete pg.lines;
    if (snap.lb) pg.lb = U.clone(snap.lb); else delete pg.lb;
    if (linesChanged) hook('onRerender', snap.caret);
    else {
      Editor.refreshAll();
      if (snap.caret) Editor.focusLine(snap.caret.box, snap.caret.i, snap.caret.offset);
    }
    hook('onChange');
  }
  Editor.undo = function () {
    const s = stacks();
    if (!s.undo.length) { U.toast('Nothing to undo on this folio'); return; }
    s.redo.push(snapshot());
    restore(s.undo.pop());
    lastKind = null;
  };
  Editor.redo = function () {
    const s = stacks();
    if (!s.redo.length) { U.toast('Nothing to redo'); return; }
    s.undo.push(snapshot());
    restore(s.redo.pop());
    lastKind = null;
  };

  /* ---------- navigation ---------- */

  // Enter: next line; on the last line of a block a new line is added to the block.
  Editor.nextLine = function (line) {
    const { box, i } = posOf(line);
    if (i + 1 < lineCount(box)) { Editor.focusLine(box, i + 1, 'start'); return; }
    hook('onAddLine', box);
  };

  Editor.prevLineEnd = function (line) {
    const { box, i } = posOf(line);
    const g = Editor.geom;
    if (i > 0) { Editor.focusLine(box, i - 1, 'end'); return; }
    const stream = Model.streamOfBox(g.type, box);
    const j = stream.boxes.indexOf(box);
    if (j > 0) { const pb = stream.boxes[j - 1]; Editor.focusLine(pb, lineCount(pb) - 1, 'end'); }
  };

  Editor.nextBox = function (line, dir) {
    const { box, i } = posOf(line);
    const g = Editor.geom;
    if (g.type === 'interlinear') { Editor.focusLine(box === 'gloss' ? 'main' : 'gloss', i, 'end'); return; }
    const def = Model.LAYOUTS[g.type];
    const order = def.tabOrder || def.boxes;
    const k = (order.indexOf(box) + dir + order.length) % order.length;
    Editor.focusContinue(order[k]);
  };

  // Option/Alt + arrow: jump to the block lying in that direction.
  Editor.blockMove = function (line, dir) {
    const { box, i } = posOf(line);
    const g = Editor.geom;
    if (g.type === 'interlinear') {
      if (dir === 'up' && box === 'main') Editor.focusLine('gloss', i, 'end');
      else if (dir === 'down' && box === 'gloss') Editor.focusLine('main', i, 'end');
      return;
    }
    const cur = g.boxes[box];
    const cx = cur[0] + cur[2] / 2, cy = cur[1] + cur[3] / 2;
    let best = null, bestScore = Infinity;
    for (const [b, r] of Object.entries(g.boxes)) {
      if (b === box) continue;
      const dx = r[0] + r[2] / 2 - cx, dy = r[1] + r[3] / 2 - cy;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 0.01) continue;
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (best) Editor.focusContinue(best);
  };

  function caretRect() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const rect = r.getClientRects()[0];
    if (!rect || (!rect.width && !rect.height && !rect.left)) {
      const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      const nr = node.getBoundingClientRect();
      return { left: nr.left, top: nr.top, bottom: nr.bottom };
    }
    return rect;
  }

  function rangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; }
    }
    return null;
  }

  function offsetAtPoint(line, x, y) {
    const r = rangeFromPoint(x, y);
    if (r && line.contains(r.startContainer) && !(r.startContainer.parentElement && r.startContainer.parentElement.closest('.chip'))) {
      return Spans.offsetOf(line, r.startContainer, r.startOffset);
    }
    const lr = line.getBoundingClientRect();
    return x > lr.left + lr.width / 2 ? Spans.units(line) : 0;
  }

  function caretAtPoint(line, x, y) {
    line.focus({ preventScroll: true });
    Editor.setCaret(line, offsetAtPoint(line, x, y));
  }

  function lineNear(line, dir, x) {
    const lr = line.getBoundingClientRect();
    const cy = lr.top + lr.height / 2;
    let best = null, bestScore = Infinity;
    for (const c of U.$$('.line:not(.mline)', folio)) {
      if (c === line) continue;
      const r = c.getBoundingClientRect();
      const y = r.top + r.height / 2;
      if (dir > 0 ? y <= cy + 1 : y >= cy - 1) continue;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const score = Math.abs(y - cy) + dx * 3;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  Editor.verticalMove = function (line, dir) {
    const x = (caretRect() || line.getBoundingClientRect()).left;
    const best = lineNear(line, dir, x);
    if (!best) return;
    const r = best.getBoundingClientRect();
    caretAtPoint(best, U.clamp(x, r.left + 1, r.right - 1), r.top + r.height / 2);
  };

  /* ---------- inside an akṣara ----------
     The browser treats an akṣara (e.g. कि) as one unit: its caret jumps over it and typing or
     Backspace with the caret inside it act on the whole cluster. The arrows here move one
     character at a time, so the caret can stand between क and ि; typing and deleting there are
     done by hand. Elsewhere the browser (and input methods such as Keyman) work as usual. */

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('sa', { granularity: 'grapheme' }) : null;

  // [start, end] of the cluster that `off` lies strictly inside, or null at a cluster boundary
  function clusterAround(text, off) {
    if (!segmenter || off <= 0 || off >= text.length) return null;
    for (const seg of segmenter.segment(text)) {
      if (seg.index === off) return null;
      if (seg.index < off && seg.index + seg.segment.length > off) return [seg.index, seg.index + seg.segment.length];
    }
    return null;
  }
  Editor.clusterAround = clusterAround;

  // End of the akṣara after `off` in `text` - a conjunct (क्ष, स्त्र) counts as one akṣara,
  // also where an older browser would split it at the virama.
  function nextAksaraEnd(text, off) {
    if (off >= text.length) return text.length;
    const ends = segmenter ? Array.from(segmenter.segment(text), (x) => x.index + x.segment.length) : Array.from(text, (c, k) => k + 1);
    let b = ends.find((e) => e > off) || text.length;
    while (b < text.length && /[\u094D\u200C\u200D]/.test(text[b - 1]) && /[\u0915-\u0939\u0958-\u095F\u0978-\u097F]/.test(text[b])) {
      b = ends.find((e) => e > b) || text.length;
    }
    return b;
  }
  Editor.nextAksaraEnd = nextAksaraEnd;

  // The text of a line as the caret counts it: characters, and one placeholder per chip.
  function unitText(line) {
    let s = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.nodeValue.replace(/\u200B/g, '');
        else if (c.nodeType === 1) { if (c.classList.contains('chip')) { if (!c.classList.contains('no-anchor')) s += '\uFFFC'; } else walk(c); }
      }
    };
    walk(line);
    return s;
  }

  Editor.unitText = unitText;

  // e.g. "क|ि" while the caret stands inside an akṣara (shown in the status bar)
  Editor.insideAksara = function () {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== 3 || !lineOf(n)) return null;
    const c = clusterAround(n.nodeValue, sel.anchorOffset);
    return c ? n.nodeValue.slice(c[0], sel.anchorOffset) + '|' + n.nodeValue.slice(sel.anchorOffset, c[1]) : null;
  };

  /* ---------- selection over several lines ---------- */

  function streamOrder(p) {
    const s = Model.streamOfBox(Editor.geom.type, p.box);
    return [s.boxes.indexOf(p.box), p.i, p.offset];
  }
  function before(a, b) {
    const x = streamOrder(a), y = streamOrder(b);
    for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] < y[k];
    return false;
  }

  function multiRanges() {
    if (!Editor.multi) return [];
    let { a, f } = Editor.multi;
    if (before(f, a)) [a, f] = [f, a];
    const s = Model.streamOfBox(Editor.geom.type, a.box);
    const ranges = [];
    for (const b of s.boxes) {
      for (let i = 0; i < lineCount(b); i++) {
        const p = { box: b, i };
        const ia = before({ box: b, i, offset: Infinity }, a), ib = before(f, { box: b, i, offset: -1 });
        if (ia || ib) continue;
        const line = Editor.lineEl(b, i);
        if (!line) continue;
        const from = p.box === a.box && p.i === a.i ? a.offset : 0;
        const to = p.box === f.box && p.i === f.i ? f.offset : Spans.units(line);
        if (to <= from) continue;
        const x = Spans.pointAt(line, from), y = Spans.pointAt(line, to);
        const r = document.createRange();
        r.setStart(x.node, x.offset);
        r.setEnd(y.node, y.offset);
        ranges.push(r);
      }
    }
    return ranges;
  }

  function paintMulti(ranges) {
    if (window.CSS && CSS.highlights && window.Highlight) {
      if (ranges.length) CSS.highlights.set('lipi-multi', new Highlight(...ranges));
      else CSS.highlights.delete('lipi-multi');
    } else if (folio) {
      U.$$('.line.in-multi', folio).forEach((l) => l.classList.remove('in-multi'));
      ranges.forEach((r) => { const l = lineOf(r.startContainer); if (l) l.classList.add('in-multi'); });
    }
  }

  Editor.setMulti = function (a, f) {
    const g = Editor.geom;
    if (Model.streamOfBox(g.type, a.box).key !== Model.streamOfBox(g.type, f.box).key) return false;
    if (a.box === f.box && a.i === f.i) {
      Editor.clearMulti();
      const line = Editor.lineEl(a.box, a.i);
      if (line) Editor.current = posOf(line);
      if (line) { if (document.activeElement !== line) line.focus({ preventScroll: true }); selectWithin(line, a.offset, f.offset); }
      return false;
    }
    Editor.multi = { a, f };
    paintMulti(multiRanges());
    hook('onMulti');
    return true;
  };

  Editor.clearMulti = function () {
    if (!Editor.multi) return;
    Editor.multi = null;
    paintMulti([]);
    hook('onMulti');
  };

  // The next / previous line of the same text on this folio, also in its next block
  // (e.g. from the top commentary to the bottom commentary).
  function streamNeighbour(p, dir) {
    const boxes = Model.streamOfBox(Editor.geom.type, p.box).boxes;
    let b = boxes.indexOf(p.box), i = p.i + dir;
    if (i < 0) { b--; if (b < 0) return null; i = lineCount(boxes[b]) - 1; }
    else if (i >= lineCount(p.box)) { b++; if (b >= boxes.length) return null; i = 0; }
    return { box: boxes[b], i };
  }

  // Where the selection stands now: {a: anchor, f: focus}
  function selectionEnds(line) {
    if (Editor.multi) return Editor.multi;
    const sel = getSelection();
    const has = sel.rangeCount && line.contains(sel.anchorNode);
    const pos = posOf(line);
    return {
      a: Object.assign({}, pos, { offset: has ? Spans.offsetOf(line, sel.anchorNode, sel.anchorOffset) : 0 }),
      f: Object.assign({}, pos, { offset: has ? Spans.offsetOf(line, sel.focusNode, sel.focusOffset) : 0 }),
    };
  }

  function pointX(line, off) {
    const p = Spans.pointAt(line, off);
    const r = document.createRange();
    r.setStart(p.node, p.offset);
    r.collapse(true);
    const rect = r.getClientRects()[0];
    if (rect && (rect.left || rect.width)) return rect.left;
    if (off > 0) {
      const q = Spans.pointAt(line, off - 1);
      r.setStart(q.node, q.offset);
      r.setEnd(p.node, p.offset);
      const before = r.getBoundingClientRect();
      if (before.width) return before.right;
    }
    return line.getBoundingClientRect().left;
  }

  function scrollToSee(line) {
    const pr = pane.getBoundingClientRect(), lr = line.getBoundingClientRect();
    if (lr.top < pr.top + 8) pane.scrollBy({ top: lr.top - pr.top - 8 });
    else if (lr.bottom > pr.bottom - 8) pane.scrollBy({ top: lr.bottom - pr.bottom + 8 });
  }

  // Shift + ↑/↓: to the same place in the line above / below
  function extendVertical(line, dir) {
    const { a, f } = selectionEnds(line);
    const n = streamNeighbour(f, dir);
    if (!n) return;
    const target = Editor.lineEl(n.box, n.i);
    if (!target) return;
    const x = pointX(Editor.lineEl(f.box, f.i), f.offset);
    scrollToSee(target);
    const r = target.getBoundingClientRect();
    Editor.setMulti(a, Object.assign(n, { offset: offsetAtPoint(target, U.clamp(x, r.left + 1, r.right - 1), r.top + r.height / 2) }));
  }

  // Shift + ←/→: one character; at the end of a line, on to the next line
  function extendHorizontal(line, dir) {
    const { a, f } = selectionEnds(line);
    const fl = Editor.lineEl(f.box, f.i);
    const off = f.offset + dir;
    if (off >= 0 && off <= Spans.units(fl)) { Editor.setMulti(a, Object.assign({}, f, { offset: off })); return; }
    const n = streamNeighbour(f, dir);
    if (!n) return;
    const target = Editor.lineEl(n.box, n.i);
    if (!target) return;
    scrollToSee(target);
    Editor.setMulti(a, Object.assign(n, { offset: dir > 0 ? 0 : Spans.units(target) }));
  }

  // Backspace/Delete on a selection over several lines: ask twice (a dialog whose Delete
  // button only works once "I am sure" is ticked), then delete. Undo restores it.
  Editor.deleteMulti = async function () {
    if (!Editor.multi) return;
    const label = Editor.entry.label;
    const a = Object.assign({ label }, Editor.multi.a), b = Object.assign({ label }, Editor.multi.f);
    const parts = Spans.preview(Editor.project, a, b);
    if (parts.error || !parts.length) { Editor.clearMulti(); return; }
    const n = parts.length;
    const where = (p) => Model.BOX_LABEL[p.box].toLowerCase() + ' line ' + (p.i + 1);
    const shown = parts.slice(0, 12).map((p) => where(p).padEnd(18) + '│ ' + (p.text.length > 90 ? p.text.slice(0, 88) + '…' : p.text || '(marks only)'));
    if (parts.length > 12) shown.push('… and ' + (parts.length - 12) + ' more line(s)');
    const sure = U.el('input', { type: 'checkbox' });
    const body = U.el('div', { class: 'bulk-delete' },
      U.el('p', null, 'This deletes the selected text on ', U.el('b', null, n + ' lines'), ' of folio ' + label + ', from ' + where(parts[0]) + ' to ' + where(parts[n - 1]) + '. The lines themselves stay; lines that were selected completely become empty.'),
      U.el('pre', { class: 'bulk-preview' }, shown.join('\n')),
      U.el('label', { class: 'field check bulk-sure' }, sure, U.el('span', null, 'Yes, I am sure: delete the text on these ' + n + ' lines')),
      U.el('p', { class: 'help' }, 'You can still undo it afterwards with ' + (U.isMac ? '⌘Z' : 'Ctrl+Z') + '.'));
    const ok = await ME.UI.modal({
      title: 'Delete text on ' + n + ' lines?', body,
      buttons: [{ label: 'Cancel', kind: 'ghost', value: false }, { label: 'Delete ' + n + ' lines', kind: 'danger', value: true, validate: () => sure.checked }],
      onOpen: (dlg) => {
        const del = Array.from(dlg.querySelectorAll('.modal-foot .btn')).pop();
        del.disabled = true;
        sure.addEventListener('change', () => { del.disabled = !sure.checked; });
      },
    });
    if (!ok) return;
    Editor.capture('command');
    const res = Spans.deleteRange(Editor.project, a, b);
    if (res.error) { U.toast(res.error, 'warn'); return; }
    Editor.clearMulti();
    for (const l of res.changed) Editor.refreshLine(l.box, l.i);
    Editor.refreshMargins();
    Editor.focusLine(res.start.box, res.start.i, res.start.offset);
    hook('onChange');
    U.toast('Deleted the text on ' + n + ' lines — ' + (U.isMac ? '⌘Z' : 'Ctrl+Z') + ' to undo', 'ok', 4000);
  };

  // The range a tag should cover when it is not a simple selection within one line.
  Editor.spanRange = function () {
    const label = Editor.entry.label;
    const act = activeLine();
    if (act && isM(act)) return null; // inside a marginal note a tag stays inside that note
    if (Editor.multi) return { start: Object.assign({ label }, Editor.multi.a), end: Object.assign({ label }, Editor.multi.f) };
    if (Editor.pending) {
      const line = activeLine();
      if (!line) return { error: 'Click where the tag should end' };
      return { start: Editor.pending, end: Object.assign({ label }, posOf(line), { offset: Editor.caretOffset(line, true) || 0 }) };
    }
    return null;
  };

  Editor.setPending = function (p) {
    Editor.pending = p;
    drawPending();
    hook('onMulti');
  };

  function drawPending() {
    if (!folio) return;
    U.$$('.pending-flag', folio).forEach((x) => x.remove());
    const p = Editor.pending;
    if (!p || p.label !== Editor.entry.label) return;
    const line = Editor.lineEl(p.box, p.i);
    if (!line) return;
    const pt = Spans.pointAt(line, p.offset);
    const r = document.createRange();
    r.setStart(pt.node, pt.offset);
    const rect = r.getClientRects()[0] || line.getBoundingClientRect();
    const fr = folio.getBoundingClientRect(), lr = line.getBoundingClientRect();
    folio.appendChild(U.el('div', {
      class: 'pending-flag', title: 'A tag starts here — put the cursor where it ends and press the tag’s shortcut',
      style: { left: rect.left - fr.left + 'px', top: lr.top - fr.top + 'px', height: lr.height + 'px' },
    }, U.el('span', { class: 'pf-tab' }, '↦'), U.el('button', {
      class: 'pf-x', title: 'Delete this tag start', onmousedown: (e) => e.preventDefault(),
      onclick: () => { Editor.setPending(null); U.toast('Tag start deleted'); },
    }, '×')));
  }

  /* ---------- live transliteration ---------- */

  const tl = { raw: '', shown: '', node: null, offset: -1 };
  function tlReset() { tl.raw = ''; tl.shown = ''; tl.node = null; tl.offset = -1; }
  function tlContinues(node, off) {
    return tl.raw && tl.node === node && tl.offset === off && node.nodeType === 3 && node.nodeValue.slice(0, off).endsWith(tl.shown);
  }
  function tlWrite(line, node, off, raw) {
    const mode = Editor.project.settings.translit;
    const out = raw ? Translit.convert(mode, raw, { geminate: !!Editor.project.settings.geminate }) : '';
    const start = off - tl.shown.length;
    node.deleteData(start, tl.shown.length);
    node.insertData(start, out);
    const caret = start + out.length;
    const r = document.createRange();
    r.setStart(node, caret);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    if (raw) Object.assign(tl, { raw, shown: out, node, offset: caret }); else tlReset();
    Editor.commit(line);
  }
  function tlType(line, ch) {
    const r = getSelection().getRangeAt(0);
    if (!r.collapsed) { r.deleteContents(); tlReset(); }
    let node = r.startContainer, off = r.startOffset;
    if (!tlContinues(node, off)) tlReset();
    if (node.nodeType !== 3) {
      const t = document.createTextNode('');
      r.insertNode(t);
      node = t; off = 0;
    }
    tlWrite(line, node, off, tl.raw + ch);
  }

  /* ---------- events ---------- */

  function selectionInfo(line) {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!line.contains(r.startContainer)) return null;
    return r;
  }

  // If the caret sits at the very end of a wrapper (e.g. <del>), return the outermost such wrapper.
  function wrapperEndingAtCaret(line) {
    const r = selectionInfo(line);
    if (!r || !r.collapsed) return null;
    const node = r.startContainer;
    if (node.nodeType === 3) {
      if (node.nodeValue.slice(r.startOffset).replace(/​/g, '') !== '') return null;
    } else if (node.childNodes[r.startOffset]) return null;
    let found = null;
    let n = node;
    while (n && n !== line) {
      const parent = n.parentNode;
      let after = n.nextSibling, empty = true;
      while (after) { if (Spans.units(after) > 0) { empty = false; break; } after = after.nextSibling; }
      if (!empty) break;
      if (parent !== line && parent.classList.contains('t') && !parent.classList.contains('chip')) found = parent;
      n = parent;
    }
    return found;
  }

  const ARROW_DIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function onKeyDown(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line || e.isComposing || e.keyCode === 229) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (isM(line) && marginKey(e, line)) return;
    if (k === 'Escape') { Editor.clearMulti(); if (Editor.pending) { Editor.setPending(null); U.toast('Tag start cancelled'); } return; }
    if (mod && !e.altKey && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) Editor.redo(); else Editor.undo(); return; }
    if (mod && !e.altKey && (k === 'y' || k === 'Y')) { e.preventDefault(); Editor.redo(); return; }
    if (mod && !e.altKey && /^[biu]$/i.test(k)) { e.preventDefault(); return; }
    // Option/Alt + arrow: go to the block in that direction
    if (ARROW_DIR[k] && e.altKey && !mod && !e.shiftKey) { e.preventDefault(); tlReset(); Editor.clearMulti(); Editor.blockMove(line, ARROW_DIR[k]); return; }
    // Shift + up/down: select over several lines
    if ((k === 'ArrowUp' || k === 'ArrowDown') && e.shiftKey && !mod && !e.altKey) { e.preventDefault(); extendVertical(line, k === 'ArrowDown' ? 1 : -1); return; }
    // Shift + ←/→: character by character, so that a vowel sign can be selected on its own;
    // at the end of a line it goes on to the next line
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey && !mod && !e.altKey) { e.preventDefault(); tlReset(); extendHorizontal(line, k === 'ArrowRight' ? 1 : -1); return; }
    if (Editor.multi && (k === 'Backspace' || k === 'Delete') && !mod && !e.altKey) { e.preventDefault(); Editor.deleteMulti(); return; }
    if (Editor.multi && !['Shift', 'Alt', 'Control', 'Meta', 'CapsLock'].includes(k)) Editor.clearMulti();
    if (!['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'Backspace'].includes(k) && k.length !== 1) tlReset();
    const plain = !mod && !e.altKey;
    const r = selectionInfo(line);
    const collapsed = !r || r.collapsed;
    switch (k) {
      case 'Enter':
        if (!plain) return;
        e.preventDefault();
        Editor.nextLine(line);
        break;
      case 'Tab':
        if (mod || e.altKey) return;
        e.preventDefault();
        Editor.nextBox(line, e.shiftKey ? -1 : 1);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        if (!plain || e.shiftKey) return;
        e.preventDefault();
        Editor.verticalMove(line, k === 'ArrowDown' ? 1 : -1);
        break;
      case 'ArrowLeft': {
        if (!plain || e.shiftKey || !collapsed) return;
        e.preventDefault();
        const off = Editor.caretOffset(line);
        if (off === 0) Editor.prevLineEnd(line); else Editor.setCaret(line, off - 1); // one sign, even inside an akṣara
        break;
      }
      case 'ArrowRight': {
        if (!plain || e.shiftKey || !collapsed) return;
        e.preventDefault();
        const w = wrapperEndingAtCaret(line);
        if (w) { Editor.caretAfter(w); break; }
        const off = Editor.caretOffset(line);
        // → jumps over a whole akṣara (conjuncts included); ← and Backspace go sign by sign
        const text = unitText(line);
        if (off < text.length) { Editor.setCaret(line, nextAksaraEnd(text, off)); break; }
        const { box, i } = posOf(line);
        if (i + 1 < lineCount(box)) Editor.focusLine(box, i + 1, 'start');
        break;
      }
      case 'Backspace': {
        if (!plain || !collapsed) return;
        if (Editor.caretOffset(line) !== 0) return;
        e.preventDefault();
        const { box, i } = posOf(line);
        // an empty line added at the end of a block (beyond the usual count) is removed again
        const usual = Editor.project.layout.lines[box === 'gloss' ? 'main' : box];
        if (i === lineCount(box) - 1 && i > 0 && lineCount(box) > usual && !Spans.units(line) && hook('onRemoveLine', box)) return;
        Editor.prevLineEnd(line);
        break;
      }
      case 'Delete':
        if (!plain || !collapsed) return;
        if (Editor.caretOffset(line) >= Editor.lineLength(line)) e.preventDefault();
        break;
      default:
    }
  }

  // Keys that act differently in a margin line. Returns true when the key is dealt with.
  function marginKey(e, line) {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (k === 'Escape' || k === 'Tab' || (k === 'Enter' && !mod && !e.altKey)) {
      e.preventDefault();
      tlReset();
      const chip = line._chip, host = chip.closest('.line');
      if (host) { host.focus({ preventScroll: true }); Editor.caretAfter(chip); }
      return true;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') { if (!e.altKey) return true; return false; } // the note may wrap: moves within it
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey && !mod && !e.altKey) {
      e.preventDefault();
      tlReset();
      const sel = getSelection();
      if (!sel.rangeCount) return true;
      const f = U.clamp(Spans.offsetOf(line, sel.focusNode, sel.focusOffset) + (k === 'ArrowRight' ? 1 : -1), 0, Spans.units(line));
      const p = Spans.pointAt(line, f);
      sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, p.node, p.offset);
      return true;
    }
    if (!mod && !e.altKey && !e.shiftKey) {
      const off = Editor.caretOffset(line);
      const at0 = off === 0, atEnd = off >= Spans.units(line);
      const collapsed = getSelection().isCollapsed;
      // the note ends here: do not run on into the folio lines
      if (collapsed && ((at0 && (k === 'ArrowLeft' || k === 'Backspace')) || (atEnd && (k === 'Delete')))) { e.preventDefault(); return true; }
      if (collapsed && atEnd && k === 'ArrowRight') {
        const w = wrapperEndingAtCaret(line);
        if (w) Editor.caretAfter(w);
        e.preventDefault();
        return true;
      }
    }
    return false;
  }

  function onBeforeInput(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    const t = e.inputType;
    if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); Editor.nextLine(line); return; }
    if (t === 'historyUndo') { e.preventDefault(); Editor.undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); Editor.redo(); return; }
    if (t.startsWith('format') || t === 'insertFromDrop' || t === 'deleteByDrag') { e.preventDefault(); return; }
    Editor.clearMulti();
    const boundary = t !== 'insertText' || /[\s|।॥]/.test(e.data || '');
    Editor.capture(boundary ? 'edit' : 'typing');
    if ((t === 'deleteContentBackward' || t === 'deleteContentForward') && deleteChipNear(line, t === 'deleteContentBackward')) {
      e.preventDefault();
      tlReset();
      Editor.commit(line);
      Editor.refreshMargins();
      return;
    }
    const mode0 = Editor.project.settings.translit;
    const tlOn = mode0 && mode0 !== 'off';
    const sel = getSelection();
    const n = sel.anchorNode;
    if (!e.isComposing && sel.isCollapsed && n && n.nodeType === 3 && clusterAround(n.nodeValue, sel.anchorOffset)) {
      const off = sel.anchorOffset;
      // the caret stands inside an akṣara (e.g. between क and ि): act on single characters
      if (t === 'deleteContentBackward') { e.preventDefault(); tlReset(); n.deleteData(off - 1, 1); sel.collapse(n, off - 1); Editor.commit(line); return; }
      if (t === 'deleteContentForward') { e.preventDefault(); tlReset(); n.deleteData(off, 1); sel.collapse(n, off); Editor.commit(line); return; }
      if (t === 'insertText' && e.data && !(tlOn && e.data.length === 1 && Translit.isAlpha(mode0, e.data))) {
        e.preventDefault(); tlReset(); n.insertData(off, e.data); sel.collapse(n, off + e.data.length); Editor.commit(line); return;
      }
    }
    const mode = Editor.project.settings.translit;
    if (!mode || mode === 'off' || e.isComposing) return;
    /* A keyboard that transliterates by itself (the Hindi keyboard of iOS types Latin letters, then puts the word in
       Devanagari in their place): with Manuscribe's scheme on too, the letters would be converted twice. The scheme
       goes off, and the word stands as the scheme made it. */
    if (t === 'insertReplacementText') {
      e.preventDefault();
      tlReset();
      if (ME.App && ME.App.toggleTranslit) ME.App.toggleTranslit();
      else Editor.project.settings.translit = 'off';
      if (ME.U && ME.U.toast) ME.U.toast('Your keyboard converts to ' + (Translit.SCHEMES[mode] && /deva/i.test(mode) ? 'Devanagari' : 'the script') + ' by itself, so Manuscribe’s typing scheme has been switched off: the two would convert the same letters twice. The badge below switches it on again.', 'info', 8000);
      return;
    }
    if (t === 'insertText' && e.data && e.data.length === 1 && Translit.isAlpha(mode, e.data)) {
      e.preventDefault();
      tlType(line, e.data);
      return;
    }
    if (t === 'deleteContentBackward') {
      const r = selectionInfo(line);
      // Backspace while typing a word removes the last key typed
      if (r && r.collapsed && tlContinues(r.startContainer, r.startOffset)) {
        e.preventDefault();
        tlWrite(line, r.startContainer, r.startOffset, tl.raw.slice(0, -1));
        return;
      }
    }
    tlReset();
  }

  // The chip (marker, gap, note …) next to the caret, ignoring the invisible zero-width
  // spaces that keep the caret outside tags; or a chip that is selected (clicked).
  function deleteChipNear(line, back) {
    const sel = getSelection();
    if (!sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    let target = null;
    if (!r.collapsed) {
      if (r.startContainer === r.endContainer && r.endOffset - r.startOffset === 1) target = r.startContainer.childNodes[r.startOffset];
    } else if (r.startContainer.nodeType === 3) {
      const v = r.startContainer.nodeValue;
      let k = r.startOffset;
      if (back) { while (k > 0 && v[k - 1] === ZW) k--; if (k === 0) target = r.startContainer.previousSibling; }
      else { while (k < v.length && v[k] === ZW) k++; if (k === v.length) target = r.startContainer.nextSibling; }
    } else {
      target = r.startContainer.childNodes[r.startOffset + (back ? -1 : 0)];
    }
    // a note without a placeholder is not in the way: it is removed from the margin, not from here
    while (target && target.nodeType === 1 && target.classList.contains('no-anchor')) target = back ? target.previousSibling : target.nextSibling;
    if (!target || target.nodeType !== 1 || !target.classList.contains('chip') || !line.contains(target)) return false;
    const before = target.previousSibling;
    target.remove();
    if (before && before.parentNode) {
      if (before.nodeType === 3) sel.collapse(before, before.nodeValue.length); else Editor.caretAfter(before);
    }
    return true;
  }

  function onInput(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    // the browser sometimes leaves a <br> in an emptied line
    if (line.childNodes.length === 1 && line.firstChild.nodeName === 'BR') line.innerHTML = '';
    Editor.commit(line);
  }

  function onFocusIn(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    tlReset();
    line.style.removeProperty('--fit');
    placeSignMarks(line);
    Editor.current = posOf(line);
    U.$$('.line.current', folio).forEach((l) => l.classList.remove('current'));
    line.classList.add('current');
    if (isM(line)) {
      // the folio stays as it is: its line keeps the room of the line being edited
      const host = line._chip.closest('.line');
      if (host) { host.classList.add('current'); openRoom(host); }
      hook('onLineFocus', Editor.current);
      return;
    }
    // room around the line and keeping it in the middle of the pane: after a mouse click or drag
    // has ended, so that the text does not move under the pointer
    if (drag) centerAfterDrag = line; else { openRoom(line); Editor.centerLine(line); }
    hook('onLineFocus', Editor.current);
  }

  // The line being edited gets one line of extra room (half above, half below) in its block.
  function openRoom(line) {
    if (!folio) return;
    const box = line.closest('.box');
    U.$$('.box.has-current', folio).forEach((b) => { if (b !== box) b.classList.remove('has-current'); });
    U.$$('.lnums .cur', folio).forEach((x) => x.classList.remove('cur'));
    const num = box.querySelector(`.lnums span[data-i="${line.dataset.i}"]`);
    if (num) num.classList.add('cur');
    if (Editor.geom.type !== 'interlinear') box.classList.add('has-current');
    Editor.refreshMargins();
    drawPending();
  }

  function onFocusOut(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    tlReset();
    cleanZw(line);
    Editor.commit(line);
    if (!isM(line)) requestAnimationFrame(() => Editor.fitLine(line));
  }

  function onMouseDown(e) {
    tlReset();
    const line = e.target.closest && e.target.closest('.line');
    if (!line) { Editor.clearMulti(); return; }
    const active = activeLine();
    if (e.shiftKey && active && !isM(active) && !isM(line) && (active !== line || Editor.multi)) {
      // shift+click on another line extends the selection over several lines
      e.preventDefault();
      const sel = getSelection();
      const a = Editor.multi ? Editor.multi.a : Object.assign(posOf(active), { offset: sel.rangeCount && active.contains(sel.anchorNode) ? Spans.offsetOf(active, sel.anchorNode, sel.anchorOffset) : 0 });
      Editor.setMulti(a, Object.assign(posOf(line), { offset: offsetAtPoint(line, e.clientX, e.clientY) }));
      return;
    }
    Editor.clearMulti();
    const chip = e.target.closest('.chip');
    if (chip) {
      e.preventDefault();
      if (document.activeElement !== line) line.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNode(chip);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    if (isM(line)) return;
    // remember where a drag starts, before focusing moves the lines
    drag = { line, a: Object.assign(posOf(line), { offset: offsetAtPoint(line, e.clientX, e.clientY) }) };
  }

  function onDragMove(e) {
    if (!drag || !folio) return;
    if (!(e.buttons & 1)) { drag = null; return; }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el && el.closest ? el.closest('.line') : null;
    if (!over || isM(over) || !folio.contains(over)) return;
    if (over === drag.line) {
      if (Editor.multi) { Editor.clearMulti(); selectWithin(drag.line, drag.a.offset, offsetAtPoint(over, e.clientX, e.clientY)); }
      return;
    }
    if (Editor.setMulti(drag.a, Object.assign(posOf(over), { offset: offsetAtPoint(over, e.clientX, e.clientY) }))) {
      // keep the caret in the line where the selection started
      const p = Spans.pointAt(drag.line, drag.a.offset);
      if (document.activeElement !== drag.line) drag.line.focus({ preventScroll: true });
      getSelection().collapse(p.node, p.offset);
    }
  }

  // Safety net: a click on a line (or its number) always leaves the cursor in that line.
  function onClick(e) {
    if (Editor.multi || e.shiftKey) return;
    let line = e.target.closest && e.target.closest('.line');
    const num = !line && e.target.closest && e.target.closest('.lnums span');
    if (num) line = num.closest('.box').querySelector(`.line[data-i="${num.dataset.i}"]:not(.gloss)`);
    if (!line || document.activeElement === line) return;
    line.focus({ preventScroll: true });
    Editor.setCaret(line, num ? Spans.units(line) : offsetAtPoint(line, e.clientX, e.clientY));
  }

  function onDblClick(e) {
    const t = e.target.closest && e.target.closest('.t');
    if (t && t.closest('.line')) { e.preventDefault(); hook('onEditChip', t); return; }
    const m = e.target.closest && e.target.closest('.mline');
    if (m) { e.preventDefault(); hook('onEditChip', m._chip); }
  }

  let selRaf = 0;
  function onSelectionChange() {
    if (selRaf) return;
    selRaf = requestAnimationFrame(() => {
      selRaf = 0;
      if (!folio) return;
      const sel = getSelection();
      const node = sel.rangeCount ? sel.anchorNode : null;
      const line = node && folio.contains(node) ? lineOf(node) : null;
      U.$$('.t.active', folio).forEach((x) => x.classList.remove('active'));
      if (!line) return;
      const stack = Editor.tagStack();
      if (stack.length) stack[stack.length - 1].classList.add('active');
      if (ME.Narrow && ME.Narrow.on()) Editor.keepCaretAcross(line);
      hook('onCaret', posOf(line), stack);
    });
  }

  // On a phone the line is wider than the screen: the caret is kept in the middle half of the typing area.
  Editor.keepCaretAcross = function (line) {
    const cr = caretRect();
    if (!cr || !pane || !line) return;
    const pr = pane.getBoundingClientRect();
    if (cr.left >= pr.left + pr.width * 0.25 && cr.left <= pr.right - pr.width * 0.25) return;
    pane.scrollBy({ left: cr.left - (pr.left + pr.width / 2), behavior: 'smooth' });
  };

  // Tags around the caret/selection, outermost first (a selected chip counts as innermost).
  Editor.tagStack = function () {
    const sel = getSelection();
    if (!sel.rangeCount) return [];
    const r = sel.getRangeAt(0);
    const line = lineOf(r.startContainer);
    if (!line) return [];
    const out = [];
    const node = r.startContainer;
    if (node.nodeType === 1 && !r.collapsed && r.startContainer === r.endContainer && r.endOffset - r.startOffset === 1) {
      const c = node.childNodes[r.startOffset];
      if (c && c.classList && c.classList.contains('t')) out.unshift(c);
    }
    let n = node.nodeType === 1 ? node : node.parentElement;
    while (n && n !== line) { if (n.classList.contains('t')) out.unshift(n); n = n.parentElement; }
    out.sort((a, b) => (a.contains(b) ? -1 : b.contains(a) ? 1 : 0));
    if (isM(line)) out.unshift(line._chip); // the note itself: edit its place, remove it
    return out;
  };

  /* ---------- clipboard ---------- */

  /* A selection over several lines is Manuscribe's own, not the browser's, so it is copied here: as plain text,
     one line to a line, and, for pasting back into Manuscribe, as the TEI of each line. A tag that runs over
     several lines comes out as one piece on each line. */
  function copyMulti(e, cut) {
    const ranges = multiRanges();
    if (!ranges.length) return false;
    e.preventDefault();
    const texts = [], teis = [];
    for (const r of ranges) {
      const tmp = document.createElement('div');
      tmp.appendChild(r.cloneContents());
      texts.push(tmp.textContent.replace(/\u200B/g, ''));
      teis.push(TEI.fromHtml(tmp).replace(/ x-span="[^"]*"/g, ''));
    }
    // a line that does not end a word continues on the next, as <lb break="no"/> says in the export
    const brk = texts.map((t, k) => k > 0 && !/[\s|।॥]$/.test(texts[k - 1]) && texts[k - 1] !== '');
    e.clipboardData.setData('text/plain', texts.join('\n'));
    e.clipboardData.setData('application/x-manuscribe-lines', JSON.stringify({ lines: teis, brk }));
    if (cut) Editor.deleteMulti();
    else U.toast('Copied ' + ranges.length + ' lines');
    return true;
  }

  function onCopy(e, cut) {
    if (Editor.multi && copyMulti(e, cut)) return;
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    const r = selectionInfo(line);
    if (!r || r.collapsed) return;
    e.preventDefault();
    const tmp = document.createElement('div');
    tmp.appendChild(r.cloneContents());
    e.clipboardData.setData('text/plain', tmp.textContent.replace(/​/g, ''));
    e.clipboardData.setData('application/x-manuscribe-tei', TEI.fromHtml(tmp));
    if (cut) {
      Editor.capture('edit');
      r.deleteContents();
      Editor.commit(line);
    }
  }

  Editor.insertFragmentAtCaret = function (line, teiStr) {
    const sel = getSelection();
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const frag = TEI.toHtml(teiStr);
    const last = frag.lastChild;
    r.insertNode(frag);
    if (last) {
      if (last.nodeType === 3) { const nr = document.createRange(); nr.setStart(last, last.nodeValue.length); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); } else Editor.caretAfter(last);
    }
  };

  function onPaste(e) {
    const line = e.target.closest && e.target.closest('.line');
    if (!line) return;
    e.preventDefault();
    tlReset();
    const custom = e.clipboardData.getData('application/x-manuscribe-tei');
    const several = e.clipboardData.getData('application/x-manuscribe-lines');
    Editor.capture('edit');
    if (several && !isM(line)) {
      let data = null;
      try { data = JSON.parse(several); } catch (err) { data = null; }
      if (data && Array.isArray(data.lines) && data.lines.length) {
        placeLines(line, data.lines.map((tei, k) => ({ tei, lb: k ? { brk: !!(data.brk && data.brk[k]) } : null })), '');
        return;
      }
    }
    if (custom) { Editor.insertFragmentAtCaret(line, custom); Editor.commit(line); return; }
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    if (isM(line)) { // a note stays one flowing text
      Editor.insertFragmentAtCaret(line, TEI.sanitizeInput(text.replace(/\s*\n\s*/g, ' ')));
      Editor.commit(line);
      return;
    }
    if (!/<[A-Za-z/!?]|&[#\w]+;/.test(text) && text.indexOf('\n') < 0) {
      Editor.insertFragmentAtCaret(line, U.escXml(text));
      Editor.commit(line);
      return;
    }
    // XML and multi-line text: cut at <lb/> (or at carriage returns where there is no <lb/>);
    // a tag that runs over a line break becomes one element in pieces
    const res = ME.Importer.parse(text, {});
    ME.Importer.resolveSources(Editor.project, res);
    const parts = res.lines;
    if (!parts.length) return;
    // the reader drops spaces at the start of a line; here the text may continue a line
    const lead = !parts[0].lb && Spans.units(line) && /^[ \t]/.test(text) ? ' ' : '';
    placeLines(line, parts, lead);
    if (res.pages.length) U.toast('The folio breaks (<pb>) in the pasted text were left out. To bring in several folios use Import transcription XML (Manuscript tab).', 'warn', 6000);
  }

  // The first part goes in at the caret; each later part starts the line after.
  function placeLines(line, parts, lead) {
    const { box, i } = posOf(line);
    const label = Editor.entry.label;
    const pg = Model.page(Editor.project, label);
    const arr = Model.boxLines(Editor.project, label, box);
    if (parts[0].lb && !Spans.units(line)) {
      Model.setLb(pg, box, i, parts[0].lb);
      if (i > 0 && arr[i - 1]) {
        if (parts[0].lb.brk) arr[i - 1] = arr[i - 1].replace(/\s+$/, '');
        else if (!/[\s|।॥]$/.test(arr[i - 1])) arr[i - 1] += ' ';
        Editor.refreshLine(box, i - 1);
      }
    }
    Editor.insertFragmentAtCaret(line, lead + parts[0].tei);
    Editor.commit(line);
    if (parts.length > 1) {
      for (let k = 1; k < parts.length; k++) {
        arr[i + k] = parts[k].tei + (arr[i + k] || '');
        Model.setLb(pg, box, i + k, parts[k].lb);
      }
      const last = i + parts.length - 1;
      if (last >= lineCount(box)) { hook('onGrowLines', box, last + 1, { box, i: last, offset: 'end' }); return; }
      for (let k = 1; k < parts.length; k++) Editor.refreshLine(box, i + k);
      Editor.refreshMargins();
      Editor.focusLine(box, last, 'end');
    }
    Editor.refreshNumbers();
    hook('onChange');
  }

  ME.Editor = Editor;
})(window.ME);
