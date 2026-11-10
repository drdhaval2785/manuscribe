'use strict';
/* Tags that run over several lines (or folios).
   A tag is stored as one piece per line; the pieces share an internal x-span id. On export,
   pieces that follow each other with only <lb/>/<pb/>/<cb/> in between become one element.
   All operations here work on the stored lines, so the folios involved need not be on screen.
   A position is {label, box, i, offset}, offset counted in "units": characters (ignoring
   zero-width spaces) plus one per non-editable chip - except an addition written outside the
   line (above it, below it, or in a margin), which counts as its text does: the scribe's text
   goes on through it, so a selection runs on into it and out again, and a tag over the selection
   goes into it. On the screen such an addition is a mark in the line, its text edited in the
   margin or shown floating; here (in the stored lines) it is a wrapper like any tag. */
(function (ME) {
  const { TEI, Model } = ME;
  const ZW = '​';

  const Spans = {};

  const isAddChip = (el) => el.classList.contains('chip') && el.dataset.t === 'add';
  const addCache = new Map();
  // the units of an addition's mark: those of its text
  function addUnits(chip) {
    const c = chip.dataset.c || '';
    if (!c) return 0;
    let n = addCache.get(c);
    if (n === undefined) { if (addCache.size > 400) addCache.clear(); n = Spans.units(render(c)); addCache.set(c, n); }
    return n;
  }
  const chipUnits = (c) => (c.classList.contains('no-anchor') ? 0 : isAddChip(c) ? addUnits(c) : 1);
  const indexIn = (c) => Array.prototype.indexOf.call(c.parentNode.childNodes, c);
  // Where the text of an addition's mark is on the screen: its margin line, or its floating text; null if nowhere.
  Spans.addBody = (chip) => (chip._mnote && chip._mnote._body) || chip.querySelector('.float') || null;

  Spans.units = function units(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/​/g, '').length;
    if (node.nodeType !== 1 && node.nodeType !== 11) return 0;
    if (node.nodeType === 1 && node.classList.contains('chip')) return chipUnits(node);
    let n = 0;
    for (const c of node.childNodes) n += units(c);
    return n;
  };

  // DOM boundary point {node, offset} that lies `n` units into `root`. Inside an addition's mark, the point is in its
  // text where that is on the screen (Spans.addBody), or, where it is nowhere, just before the mark.
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
          if (c.classList.contains('chip')) {
            const u = chipUnits(c);
            if (!u) continue; // shown only in the margin, or empty
            const idx = indexIn(c);
            if (remaining === 0) { found = { node: c.parentNode, offset: idx }; return; }
            if (remaining < u) {
              const body = Spans.addBody(c);
              found = body ? Spans.pointAt(body, Math.min(remaining, Spans.units(body))) : { node: c.parentNode, offset: idx };
              return;
            }
            remaining -= u;
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

  // Units from the start of `root` to a DOM point; a point in the text of an addition shown outside `root` is so far
  // along as the addition's mark, and then into its text.
  Spans.offsetOf = function (root, node, offset) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!root.contains(node)) {
      const m = el && el.closest('.mline');
      const chip = m && m._chip;
      if (!chip || !root.contains(chip)) return 0;
      return Spans.offsetOf(root, chip.parentNode, indexIn(chip)) + Spans.offsetOf(m, node, offset);
    }
    const fl = el && el.closest('.float');
    if (fl && fl !== root && fl.parentElement && isAddChip(fl.parentElement) && root.contains(fl.parentElement) && fl.parentElement !== root) {
      const chip = fl.parentElement;
      return Spans.offsetOf(root, chip.parentNode, indexIn(chip)) + Spans.offsetOf(fl, node, offset);
    }
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return Spans.units(r.cloneContents());
  };

  /* The stretch [from, to) of root cut where it runs through additions: -> [{container, from, to}], each a stretch of
     root's own text or, within an addition, of the addition's, bodyOf(addition) saying where that is: the addition's
     wrapper in a stored line; on the screen Spans.addBody (null where its text is nowhere, and the stretch is left out). */
  Spans.segments = function (root, from, to, bodyOf) {
    const out = [];
    let at = 0, cur = from;
    const walk = (node) => {
      for (const c of Array.from(node.childNodes)) {
        if (cur >= to) return;
        if (c.nodeType === 3) { at += c.nodeValue.replace(/​/g, '').length; continue; }
        if (c.nodeType !== 1) continue;
        const chip = c.classList.contains('chip');
        const add = chip ? isAddChip(c) && !c.classList.contains('no-anchor') : c.classList.contains('t') && c.dataset.t === 'add';
        if (!add) { if (chip) at += chipUnits(c); else walk(c); continue; }
        const s = at, e = at + Spans.units(c);
        at = e;
        if (e <= cur) continue;
        if (s >= to) return;
        if (cur < s) out.push({ container: root, from: cur, to: s });
        const body = bodyOf ? bodyOf(c) : null;
        const a = Math.max(cur, s) - s, b = Math.min(to, e) - s;
        if (body && b > a) out.push(...Spans.segments(body, a, b, bodyOf));
        cur = Math.min(e, to);
      }
    };
    walk(root);
    if (cur < to) out.push({ container: root, from: cur, to });
    return out;
  };

  // a stored line, as the operations here see it: every addition a wrapper
  const render = (tei) => { const d = document.createElement('div'); d.appendChild(TEI.toHtml(tei || '', { addsInline: true })); return d; };

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

  // the tag over [from, to) of root, as pieces: one for each stretch between the markers there
  function wrapIn(root, from, to, makePiece) {
    if (to <= from) return [];
    const a = Spans.pointAt(root, from), b = Spans.pointAt(root, to);
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
    for (const t of Array.from(root.querySelectorAll('.t:not(.chip)')).reverse()) {
      if (pieces.includes(t) || pieces.some((p) => p.contains(t) || t.contains(p))) continue;
      if (!t.textContent.replace(/​/g, '') && !t.querySelector('.chip')) t.remove();
    }
    return pieces;
  }
  // and over a stretch running through additions: a piece in each, the additions themselves left whole
  const inAdds = (el) => el;
  function wrapRange(div, from, to, makePiece) {
    const pieces = [];
    for (const s of Spans.segments(div, from, to, inAdds)) pieces.push(...wrapIn(s.container, s.from, s.to, makePiece));
    return pieces;
  }

  // build(spanId) -> {make: () => {outer, inner}, finish?: (lastOuter) => void}
  // Returns {changed: [{label, box, i}], end} or {error}.
  Spans.apply = function (project, a, b, build) {
    const rng = Spans.between(project, a, b);
    if (rng.error) return rng;
    const active = rng.lines.filter((l) => l.to > l.from);
    if (!active.length) return { error: 'Nothing is selected.' };
    const divs = active.map((l) => render(Model.boxLines(project, l.label, l.box)[l.i]));
    // pieces on several lines, or on both sides of an addition, are one tag: they share an id
    const stretches = active.reduce((n, l, k) => n + Spans.segments(divs[k], l.from, l.to, inAdds).filter((s) => s.to > s.from).length, 0);
    const id = stretches > 1 ? Spans.newId() : null;
    const builder = build(id);
    let lastPiece = null;
    active.forEach((l, k) => {
      const pieces = wrapRange(divs[k], l.from, l.to, builder.make);
      if (pieces.length) lastPiece = pieces[pieces.length - 1];
    });
    if (!lastPiece) return { error: 'Nothing to tag in the selection.' };
    if (builder.finish) builder.finish(lastPiece); // e.g. the <add> of a <subst>
    active.forEach((l, k) => { Model.boxLines(project, l.label, l.box)[l.i] = TEI.fromHtml(divs[k]); });
    return { changed: active, start: rng.start, end: rng.end, id };
  };

  /* ---------- deleting a range ---------- */

  // What lies from a to b, line by line: [{label, box, i, text, tei}] (what a deletion would remove, what a copy takes)
  Spans.preview = function (project, a, b) {
    const rng = Spans.between(project, a, b);
    if (rng.error) return rng;
    return rng.lines.filter((l) => l.to > l.from).map((l) => {
      const div = render(Model.boxLines(project, l.label, l.box)[l.i]);
      const p = Spans.pointAt(div, l.from), q = Spans.pointAt(div, l.to);
      const r = document.createRange();
      r.setStart(p.node, p.offset);
      r.setEnd(q.node, q.offset);
      const tmp = document.createElement('div');
      tmp.appendChild(r.cloneContents());
      return { label: l.label, box: l.box, i: l.i, text: tmp.textContent.replace(/​/g, ''), tei: TEI.fromHtml(tmp) };
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

  /* Where a marker (a paragraph, verse or quotation starting or ending) put at point p of root would go: in the text
     there ('at'); before or after a tag whose edge it falls at (a marker is no part of a tag); or cutting in two a
     tag it falls inside ('split'), the tag given. An addition written outside the line is a place in the text, not a
     tag to keep out of: a verse may well begin in the margin. -> {where, outer} */
  Spans.markerPlace = function (root, p) {
    let outer = null;
    let n = p.node.nodeType === 1 ? p.node : p.node.parentElement;
    while (n && n !== root) {
      if (n.classList.contains('t') && !n.classList.contains('chip')) { if (n.dataset.t === 'add') break; outer = n; }
      n = n.parentElement;
    }
    if (!outer) return { where: 'at', outer: null };
    const pre = document.createRange();
    pre.setStart(outer, 0);
    pre.setEnd(p.node, p.offset);
    const post = document.createRange();
    post.setStart(p.node, p.offset);
    post.setEnd(outer, outer.childNodes.length);
    const empty = (r) => !r.toString().replace(/​/g, '') && !r.cloneContents().querySelector('.chip');
    return { where: empty(pre) ? 'before' : empty(post) ? 'after' : 'split', outer };
  };

  /* Puts marker m at point p of root, where markerPlace says (given, or found here). A tag cut in two becomes two
     tags with the same attributes, the tags within it cut likewise. -> m */
  Spans.placeMarker = function (root, p, m, place) {
    const pl = place || Spans.markerPlace(root, p);
    if (pl.where === 'at') { const r = document.createRange(); r.setStart(p.node, p.offset); r.insertNode(m); return m; }
    if (pl.where === 'before') { pl.outer.parentNode.insertBefore(m, pl.outer); return m; }
    if (pl.where === 'after') { pl.outer.parentNode.insertBefore(m, pl.outer.nextSibling); return m; }
    const r = document.createRange();
    r.setStart(p.node, p.offset);
    r.setEnd(pl.outer, pl.outer.childNodes.length);
    const tail = r.extractContents();
    const second = pl.outer.cloneNode(false);
    second.appendChild(tail);
    pl.outer.parentNode.insertBefore(second, pl.outer.nextSibling);
    pl.outer.parentNode.insertBefore(m, second);
    return m;
  };

  // The tag a marker at this position would cut in two, or null. -> {name, attrs} | null
  Spans.markerCuts = function (project, pos) {
    const div = render(Model.boxLines(project, pos.label, pos.box)[pos.i]);
    const pl = Spans.markerPlace(div, Spans.pointAt(div, pos.offset));
    return pl.where === 'split' ? { name: pl.outer.dataset.t, attrs: JSON.parse(pl.outer.dataset.a || '{}') } : null;
  };

  Spans.insertMarker = function (project, pos, type, attrs) {
    const arr = Model.boxLines(project, pos.label, pos.box);
    const div = render(arr[pos.i]);
    Spans.placeMarker(div, Spans.pointAt(div, pos.offset), TEI.makeMarker(type, attrs));
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
