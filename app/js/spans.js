'use strict';
/* Tags that run over several lines (or folios).
   A tag is stored as one piece per line; the pieces share an internal x-span id. On export,
   pieces that follow each other with only <lb/>/<pb/>/<cb/> in between become one element.
   All operations here work on the stored lines, so the folios involved need not be on screen.
   A position is {label, box, i, offset}, offset counted in "units": characters (ignoring
   zero-width spaces) plus one per non-editable chip. */
(function (ME) {
  const { TEI, Model } = ME;
  const ZW = '​';

  const Spans = {};

  Spans.units = function units(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/​/g, '').length;
    if (node.nodeType !== 1 && node.nodeType !== 11) return 0;
    if (node.nodeType === 1 && node.classList.contains('chip')) return node.classList.contains('no-anchor') ? 0 : 1;
    let n = 0;
    for (const c of node.childNodes) n += units(c);
    return n;
  };

  // DOM boundary point {node, offset} that lies `n` units into `root`.
  Spans.pointAt = function (root, n) {
    let remaining = n;
    let found = null;
    const walk = (node) => {
      for (const c of Array.from(node.childNodes)) {
        if (found) return;
        if (c.nodeType === 3) {
          const v = c.nodeValue;
          const len = v.replace(/​/g, '').length;
          if (remaining <= len) {
            let idx = 0, k = 0;
            while (k < remaining && idx < v.length) { if (v[idx] !== ZW) k++; idx++; }
            found = { node: c, offset: idx };
            return;
          }
          remaining -= len;
        } else if (c.nodeType === 1) {
          if (c.classList.contains('no-anchor')) continue; // shown only in the margin
          if (c.classList.contains('chip')) {
            const idx = Array.prototype.indexOf.call(c.parentNode.childNodes, c);
            if (remaining === 0) { found = { node: c.parentNode, offset: idx }; return; }
            remaining -= 1;
            if (remaining === 0 && !c.nextSibling) { found = { node: c.parentNode, offset: idx + 1 }; return; }
          } else {
            walk(c);
          }
        }
      }
    };
    if (n <= 0) return { node: root, offset: 0 };
    walk(root);
    return found || { node: root, offset: root.childNodes.length };
  };

  // Units from the start of `root` to a DOM point.
  Spans.offsetOf = function (root, node, offset) {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return Spans.units(r.cloneContents());
  };

  const render = (tei) => { const d = document.createElement('div'); d.appendChild(TEI.toHtml(tei || '')); return d; };

  Spans.newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- ordering ---------- */

  function streamKey(project, label, box) {
    return Model.streamOfBox(Model.pageLayout(project, label), box).key;
  }

  // All lines of a stream in reading order: [{label, box, i}]
  Spans.streamSeq = function (project, key) {
    const seq = [];
    const seen = new Set();
    for (const e of Model.entries(project)) {
      if (seen.has(e.label)) continue;
      seen.add(e.label);
      const t = Model.pageLayout(project, e.label);
      const s = Model.LAYOUTS[t].streams.find((x) => x.key === key);
      if (!s) continue;
      for (const b of s.boxes) for (let i = 0; i < Model.lineCount(project, e.label, b); i++) seq.push({ label: e.label, box: b, i });
    }
    return seq;
  };

  // Lines from a to b (in either order) with the unit range to take from each.
  Spans.between = function (project, a, b) {
    const key = streamKey(project, a.label, a.box);
    if (streamKey(project, b.label, b.box) !== key) return { error: 'The start and the end are in different texts (e.g. main text and commentary).' };
    const seq = Spans.streamSeq(project, key);
    const ia = seq.findIndex((x) => x.label === a.label && x.box === a.box && x.i === a.i);
    const ib = seq.findIndex((x) => x.label === b.label && x.box === b.box && x.i === b.i);
    if (ia < 0 || ib < 0) return { error: 'Position not found' };
    let s = a, e = b, is = ia, ie = ib;
    if (ia > ib || (ia === ib && a.offset > b.offset)) { s = b; e = a; is = ib; ie = ia; }
    const lines = seq.slice(is, ie + 1).map((x, k, arr) => {
      const len = Spans.units(render(Model.boxLines(project, x.label, x.box)[x.i]));
      return Object.assign({}, x, { from: k === 0 ? Math.min(s.offset, len) : 0, to: k === arr.length - 1 ? Math.min(e.offset, len) : len });
    });
    return { start: s, end: e, lines, key };
  };

  /* ---------- applying a tag over a range ---------- */

  function wrapRange(div, from, to, makePiece) {
    if (to <= from) return [];
    const a = Spans.pointAt(div, from), b = Spans.pointAt(div, to);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    if (r.collapsed) return [];
    const frag = r.extractContents();
    const out = document.createDocumentFragment();
    const pieces = [];
    let cur = null;
    for (const c of Array.from(frag.childNodes)) {
      // paragraph / verse / quotation markers stay outside the tag
      if (c.nodeType === 1 && c.dataset && c.dataset.t === 'x-marker') { out.appendChild(c); cur = null; continue; }
      if (!cur) { const p = makePiece(); cur = p.inner; out.appendChild(p.outer); pieces.push(p.outer); }
      cur.appendChild(c);
    }
    r.insertNode(out);
    // drop wrappers that extractContents left empty
    for (const t of Array.from(div.querySelectorAll('.t:not(.chip)')).reverse()) {
      if (pieces.includes(t) || pieces.some((p) => p.contains(t) || t.contains(p))) continue;
      if (!t.textContent.replace(/​/g, '') && !t.querySelector('.chip')) t.remove();
    }
    return pieces;
  }

  // build(spanId) -> {make: () => {outer, inner}, finish?: (lastOuter) => void}
  // Returns {changed: [{label, box, i}], end} or {error}.
  Spans.apply = function (project, a, b, build) {
    const rng = Spans.between(project, a, b);
    if (rng.error) return rng;
    const active = rng.lines.filter((l) => l.to > l.from);
    if (!active.length) return { error: 'Nothing is selected.' };
    const id = active.length > 1 ? Spans.newId() : null;
    const builder = build(id);
    let lastPiece = null;
    const divs = active.map((l) => {
      const div = render(Model.boxLines(project, l.label, l.box)[l.i]);
      const pieces = wrapRange(div, l.from, l.to, builder.make);
      if (pieces.length) lastPiece = pieces[pieces.length - 1];
      return div;
    });
    if (!lastPiece) return { error: 'Nothing to tag in the selection.' };
    if (builder.finish) builder.finish(lastPiece); // e.g. the <add> of a <subst>
    active.forEach((l, k) => { Model.boxLines(project, l.label, l.box)[l.i] = TEI.fromHtml(divs[k]); });
    return { changed: active, start: rng.start, end: rng.end, id };
  };

  /* ---------- deleting a range ---------- */

  // Text that a deletion from a to b would remove, line by line: [{label, box, i, text}]
  Spans.preview = function (project, a, b) {
    const rng = Spans.between(project, a, b);
    if (rng.error) return rng;
    return rng.lines.filter((l) => l.to > l.from).map((l) => {
      const div = render(Model.boxLines(project, l.label, l.box)[l.i]);
      const p = Spans.pointAt(div, l.from), q = Spans.pointAt(div, l.to);
      const r = document.createRange();
      r.setStart(p.node, p.offset);
      r.setEnd(q.node, q.offset);
      return { label: l.label, box: l.box, i: l.i, text: r.toString().replace(/​/g, '') };
    });
  };

  // Delete everything from a to b. The lines stay (they are physical lines of the folio),
  // only their text goes. Returns the lines changed.
  Spans.deleteRange = function (project, a, b) {
    const rng = Spans.between(project, a, b);
    if (rng.error) return rng;
    const changed = [];
    for (const l of rng.lines) {
      if (l.to <= l.from) continue;
      const arr = Model.boxLines(project, l.label, l.box);
      const div = render(arr[l.i]);
      const p = Spans.pointAt(div, l.from), q = Spans.pointAt(div, l.to);
      const r = document.createRange();
      r.setStart(p.node, p.offset);
      r.setEnd(q.node, q.offset);
      r.deleteContents();
      for (const t of Array.from(div.querySelectorAll('.t:not(.chip)')).reverse()) {
        if (!t.textContent.replace(/​/g, '') && !t.querySelector('.chip')) t.remove();
      }
      arr[l.i] = TEI.fromHtml(div);
      changed.push(l);
    }
    return { changed, start: rng.start, end: rng.end };
  };

  /* ---------- markers at a position ---------- */

  Spans.insertMarker = function (project, pos, type, attrs) {
    const arr = Model.boxLines(project, pos.label, pos.box);
    const div = render(arr[pos.i]);
    const p = Spans.pointAt(div, pos.offset);
    let outer = null;
    let n = p.node.nodeType === 1 ? p.node : p.node.parentElement;
    while (n && n !== div) { if (n.classList.contains('t') && !n.classList.contains('chip')) outer = n; n = n.parentElement; }
    const m = TEI.makeMarker(type, attrs);
    if (outer) {
      const pre = document.createRange();
      pre.setStart(outer, 0);
      pre.setEnd(p.node, p.offset);
      const empty = !pre.toString().replace(/​/g, '') && !pre.cloneContents().querySelector('.chip');
      outer.parentNode.insertBefore(m, empty ? outer : outer.nextSibling);
    } else {
      const r = document.createRange();
      r.setStart(p.node, p.offset);
      r.insertNode(m);
    }
    arr[pos.i] = TEI.fromHtml(div);
    return { label: pos.label, box: pos.box, i: pos.i };
  };

  /* ---------- editing all pieces of a span ---------- */

  // fn(el) is called for every piece of span `id`; returns the lines changed.
  Spans.update = function (project, id, fn) {
    const changed = [];
    const needle = 'x-span="' + id + '"';
    for (const [label, pg] of Object.entries(project.pages)) {
      for (const [box, lines] of Object.entries(pg.boxes || {})) {
        lines.forEach((l, i) => {
          if (!l || l.indexOf(needle) < 0) return;
          const div = render(l);
          for (const t of Array.from(div.querySelectorAll('.t'))) if (JSON.parse(t.dataset.a || '{}')['x-span'] === id) fn(t);
          lines[i] = TEI.fromHtml(div);
          changed.push({ label, box, i });
        });
      }
    }
    return changed;
  };

  Spans.unwrap = function (el) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
  };

  Spans.idOf = (el) => JSON.parse(el.dataset.a || '{}')['x-span'] || null;

  ME.Spans = Spans;
})(window.ME);
