'use strict';
/* Tagging commands, keyboard shortcuts, toolbar, tag inspector and command palette. */
(function (ME) {
  const { U, TEI, UI, Model, Editor, Spans } = ME;
  const { ELEMENTS } = TEI;
  const ZW = '​';
  const App = () => ME.App;
  const project = () => ME.App.project;

  const Commands = {};

  /* ---------- context ---------- */

  function ctx(quiet) {
    const sel = getSelection();
    const folio = Editor.folioEl();
    if (!sel.rangeCount || !folio) { if (!quiet) U.toast('Click in a line of the transcription first', 'warn'); return null; }
    const r = sel.getRangeAt(0);
    const line = Editor.lineOf(r.startContainer);
    if (!line || !folio.contains(line)) { if (!quiet) U.toast('Click in a line of the transcription first', 'warn'); return null; }
    if (!line.contains(r.endContainer)) { U.toast('A selection must stay within one line', 'warn'); return null; }
    const pos = Editor.posOf(line);
    return { line, range: r.cloneRange(), box: pos.box, i: pos.i, inNote: line.classList.contains('mline') };
  }

  // <p>, <lg> and tags that run over lines are for the text of the folio, not for a marginal note
  function notInNote(c) {
    if (!c.inNote) return true;
    U.toast('This cannot be used inside a marginal note', 'warn');
    return false;
  }

  function restore(c) {
    c.line.focus({ preventScroll: true });
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(c.range);
  }

  function lastAttrs(name) {
    const def = ELEMENTS[name];
    const saved = (project().settings.lastAttrs || {})[name] || {};
    const a = {};
    for (const f of (def && def.attrs) || []) a[f.n] = saved[f.n] !== undefined ? saved[f.n] : (f.def || '');
    return a;
  }
  function remember(name, attrs) {
    const s = project().settings;
    s.lastAttrs = s.lastAttrs || {};
    s.lastAttrs[name] = Object.assign({}, attrs);
  }
  const clean = (attrs) => { const o = {}; for (const [k, v] of Object.entries(attrs)) if (v !== '' && v !== undefined && v !== null) o[k] = String(v); return o; };

  function selectedTei(range) {
    const tmp = document.createElement('div');
    tmp.appendChild(range.cloneContents());
    return TEI.fromHtml(tmp);
  }

  // remove wrappers emptied by extractContents (keeps `keep`)
  function tidy(line, keep) {
    for (const t of U.$$('.t:not(.chip)', line).reverse()) {
      if (t === keep || t.contains(keep)) continue;
      if (t.dataset.t === 'subst' || t.dataset.t === 'choice') { if (!t.childNodes.length) t.remove(); continue; }
      if (!t.textContent.replace(/​/g, '') && !t.querySelector('.chip')) t.remove();
    }
  }

  function done(line) {
    Editor.commit(line);
    Editor.refreshMargins();
  }

  /* ---------- tags over several lines / folios ---------- */

  // Redraw the changed lines of this folio after a change made on the stored lines.
  function afterSpan(changed, end) {
    const label = Editor.entry.label;
    for (const l of changed) if (l.label === label) Editor.refreshLine(l.box, l.i);
    Editor.refreshMargins();
    Editor.clearMulti();
    Editor.setPending(null);
    if (end && end.label === label) {
      Editor.focusLine(end.box, end.i, end.offset);
      const outer = Editor.tagStack()[0];
      if (outer && !outer.classList.contains('chip')) Editor.caretAfter(outer);
    }
    App().changed();
    const folios = new Set(changed.map((l) => l.label)).size;
    if (folios > 1) U.toast('Applied over ' + changed.length + ' lines on ' + folios + ' folio sides (Ctrl+Z only undoes this folio; use Remove tag to remove all parts)', 'ok', 4500);
  }

  function beginSpan(rng) {
    if (rng.error) { U.toast(rng.error, 'warn'); return false; }
    const a = Editor.activeLine();
    if (a) Editor.commit(a);
    Editor.capture('command');
    return true;
  }

  // build(id) -> {make, finish?}; see Spans.apply
  function applySpan(rng, build) {
    if (!beginSpan(rng)) return null;
    const res = Spans.apply(project(), rng.start, rng.end, build);
    if (res.error) { U.toast(res.error, 'warn'); return null; }
    afterSpan(res.changed, res.end);
    return res;
  }

  const withSpan = (attrs, id, suffix) => (id ? Object.assign({}, attrs, { 'x-span': id + (suffix || '') }) : attrs);
  const simpleBuild = (name, attrs) => (id) => ({ make: () => { const s = TEI.makeWrap(name, withSpan(attrs, id)); return { outer: s, inner: s }; } });

  function spanMarkers(rng, startType, startAttrs, endType) {
    if (!beginSpan(rng)) return;
    const b = Spans.between(project(), rng.start, rng.end);
    if (b.error) { U.toast(b.error, 'warn'); return; }
    // the end first, so that the start position is not shifted
    const ce = Spans.insertMarker(project(), b.end, endType, {});
    const cs = Spans.insertMarker(project(), b.start, startType, startAttrs);
    afterSpan([cs, ce], Object.assign({}, b.end, { offset: b.end.offset + (ce.label === cs.label && ce.box === cs.box && ce.i === cs.i ? 2 : 1) }));
  }

  function markSpanStart() {
    const c = ctx();
    if (!c || !notInNote(c)) return;
    const p = { label: Editor.entry.label, box: c.box, i: c.i, offset: Spans.offsetOf(c.line, c.range.startContainer, c.range.startOffset) };
    const old = Editor.pending;
    // pressing it again at the same place deletes the start; elsewhere it moves it
    if (old && old.label === p.label && old.box === p.box && old.i === p.i && old.offset === p.offset) {
      Editor.setPending(null);
      U.toast('Tag start deleted');
      return;
    }
    Editor.setPending(p);
    if (old) { U.toast('Tag start moved here'); return; }
    U.toast('Start marked. Put the cursor where the tag ends — on any line or folio — and press the tag’s shortcut. To delete the start: × on its flag, Esc, or this shortcut again at the same place.', 'info', 5500);
  }

  async function attrDialog(name, values, extra) {
    const def = ELEMENTS[name];
    const fields = [];
    if (extra && extra.content) fields.push(Object.assign({ n: '_content', type: def.content && def.content.multiline ? 'textarea' : (def.content && def.content.choices ? 'choices' : 'text'), focus: true, options: def.content && def.content.choices, label: def.content ? def.content.label : 'Text', translit: !(def.content && def.content.choices) }, extra.content));
    for (const f of def.attrs || []) {
      const field = Object.assign({}, f, extra && extra.content ? { focus: false } : {});
      if (name === 'note' && f.n === 'type') field.options = String(project().settings.noAnchorIds || '').split(/[\s,;]+/).filter(Boolean);
      fields.push(field);
    }
    const form = UI.form(fields, values);
    const err = U.el('div', { class: 'field-error' });
    const body = U.el('div', null, U.el('p', { class: 'help' }, def.desc), form.el, U.el('pre', { class: 'example' }, def.example || ''), err);
    const buttons = [{ label: 'Cancel', value: null, kind: 'ghost' }];
    if (extra && extra.removable) buttons.unshift({ label: 'Remove tag', value: '__remove__', kind: 'danger', left: true });
    buttons.push({
      label: extra && extra.okLabel ? extra.okLabel : 'Insert', kind: 'primary', value: () => form.values(),
      validate: () => {
        const v = form.values();
        if (fields.some((f) => f.n === '_content') && def.content && def.content.required && !String(v._content || '').trim()) { err.textContent = def.content.label + ' is required'; return false; }
        return true;
      },
    });
    return UI.modal({ title: '<' + name + '> ' + def.label, body, buttons });
  }

  /* ---------- wrappers: del, unclear, sic, supplied, surplus, retrace, hi ---------- */

  async function wrap(name, ask) {
    const def = ELEMENTS[name];
    const rng = Editor.spanRange();
    if (rng) {
      let attrs = lastAttrs(name);
      if (ask && def.attrs && def.attrs.length) {
        const v = await attrDialog(name, attrs, { okLabel: 'Apply' });
        if (!v) return;
        attrs = v;
      }
      attrs = clean(attrs);
      remember(name, attrs);
      applySpan(rng, simpleBuild(name, attrs));
      return;
    }
    const c = ctx();
    if (!c) return;
    if (c.range.collapsed && !ask) {
      // pressing the shortcut again inside an empty-started wrapper leaves it
      const inside = c.range.startContainer.parentElement && c.range.startContainer.parentElement.closest('.t-' + name);
      if (inside && c.line.contains(inside)) { Editor.caretAfter(inside); return; }
    }
    let attrs = lastAttrs(name);
    if (ask && def.attrs && def.attrs.length) {
      const v = await attrDialog(name, attrs, { okLabel: 'Apply' });
      restore(c);
      if (!v) return;
      attrs = v;
    }
    attrs = clean(attrs);
    remember(name, attrs);
    Editor.capture('command');
    const span = TEI.makeWrap(name, attrs);
    if (c.range.collapsed) {
      c.range.insertNode(span);
      Editor.caretInside(span);
      U.toast('Type the ' + def.label.toLowerCase() + ' text; press the shortcut again (or →) to leave it', 'info', 2200);
    } else {
      span.appendChild(c.range.extractContents());
      c.range.insertNode(span);
      tidy(c.line, span);
      Editor.caretAfter(span);
    }
    done(c.line);
  }

  /* ---------- chips ---------- */

  function insertChipAt(c, chip) {
    Editor.capture('command');
    const r = c.range.cloneRange();
    r.collapse(false);
    r.insertNode(chip);
    Editor.caretAfter(chip);
    done(c.line);
  }

  async function simpleChip(name) {
    const c = ctx();
    if (!c) return;
    const def = ELEMENTS[name];
    let attrs = {};
    let content = '';
    if (name === 'pc') content = ' ';
    if (def.attrs && def.attrs.length) {
      const values = lastAttrs(name);
      if (name === 'milestone' && !values.n) values.n = Editor.entry.label + (c.i + 1);
      const v = await attrDialog(name, values, def.content ? { content: { def: (project().settings.lastAttrs[name] || {})._content || def.content.def } } : null);
      restore(c);
      if (!v) return;
      if (def.content) { content = U.escXml(v._content); delete v._content; }
      remember(name, Object.assign({}, v, def.content ? { _content: TEI.plainText(content) } : {}));
      attrs = clean(v);
      if (name === 'milestone') delete project().settings.lastAttrs.milestone.n;
    }
    insertChipAt(c, TEI.makeChip(name, attrs, content));
  }

  async function addition() {
    const rng = Editor.spanRange();
    if (rng) {
      const v = await attrDialog('add', lastAttrs('add'), { okLabel: 'Apply' });
      if (!v) return;
      const attrs = clean(v);
      remember('add', attrs);
      applySpan(rng, simpleBuild('add', attrs));
      return;
    }
    const c = ctx();
    if (!c) return;
    const values = lastAttrs('add');
    const hasSel = !c.range.collapsed;
    if (hasSel && TEI.isSignsOnly(c.range.toString())) values.place = 'inline';
    const v = await attrDialog('add', values, hasSel ? null : { content: {} });
    restore(c);
    if (!v) return;
    const content = hasSel ? selectedTei(c.range) : TEI.sanitizeInput(v._content || '');
    delete v._content;
    const attrs = clean(v);
    remember('add', attrs);
    Editor.capture('command');
    let node;
    if (attrs.place === 'inline') {
      node = TEI.makeWrap('add', attrs);
      node.appendChild(TEI.toHtml(content));
    } else {
      node = TEI.makeChip('add', attrs, content);
    }
    if (hasSel) c.range.deleteContents();
    c.range.insertNode(node);
    tidy(c.line, node);
    Editor.caretAfter(node);
    done(c.line);
  }

  async function note() {
    const c = ctx();
    if (!c) return;
    const v = await attrDialog('note', lastAttrs('note'), { content: {} });
    restore(c);
    if (!v) return;
    const content = TEI.sanitizeInput(v._content);
    delete v._content;
    const attrs = clean(v);
    remember('note', attrs);
    // these belong to this note only
    delete project().settings.lastAttrs.note.type;
    delete project().settings.lastAttrs.note.resp;
    insertChipAt(c, TEI.makeChip('note', attrs, content));
  }

  async function substitution() {
    const rng = Editor.spanRange();
    const c = ctx();
    if (!c) return;
    const hasSel = !!rng || !c.range.collapsed;
    const la = project().settings.lastAttrs || {};
    const fields = [];
    if (!hasSel) fields.push({ n: 'deleted', label: 'Deleted text (as written, then struck off)', type: 'text', focus: true, translit: true });
    fields.push({ n: 'added', label: 'Replacement text (added)', type: 'text', focus: hasSel, translit: true },
      { n: 'place', label: 'Replacement written', type: 'select', options: TEI.PLACES, def: (la.subst && la.subst.place) || 'above' },
      Object.assign({}, ELEMENTS.del.attrs[0], { n: 'rend', def: (la.subst && la.subst.rend) || 'crossed out' }),
      TEI.HAND);
    const form = UI.form(fields, {});
    const err = U.el('div', { class: 'field-error' });
    const v = await UI.modal({
      title: '<subst> Substitution',
      body: U.el('div', null, U.el('p', { class: 'help' }, ELEMENTS.subst.desc + (hasSel ? ' The selected text is the deleted part.' : '')), form.el, U.el('pre', { class: 'example' }, ELEMENTS.subst.example), err),
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, {
        label: 'Insert', kind: 'primary', value: () => form.values(),
        validate: () => { const x = form.values(); if (!x.added) { err.textContent = 'The replacement text is required'; return false; } return true; },
      }],
    });
    restore(c);
    if (!v) return;
    project().settings.lastAttrs.subst = { place: v.place, rend: v.rend };
    const addAttrs = clean({ place: v.place, hand: v.hand });
    const makeAdd = () => {
      if (v.place !== 'inline') return TEI.makeChip('add', addAttrs, TEI.sanitizeInput(v.added));
      const a = TEI.makeWrap('add', addAttrs);
      a.appendChild(TEI.toHtml(TEI.sanitizeInput(v.added)));
      return a;
    };
    if (rng) {
      applySpan(rng, (id) => ({
        make: () => {
          const o = TEI.makeWrap('subst', withSpan({}, id));
          const d = TEI.makeWrap('del', withSpan(clean({ rend: v.rend, hand: v.hand }), id, 'd'));
          o.appendChild(d);
          return { outer: o, inner: d };
        },
        finish: (o) => o.appendChild(makeAdd()),
      }));
      return;
    }
    Editor.capture('command');
    const subst = TEI.makeWrap('subst', {});
    const del = TEI.makeWrap('del', clean({ rend: v.rend, hand: v.hand }));
    if (hasSel) del.appendChild(c.range.extractContents());
    else del.appendChild(TEI.toHtml(TEI.sanitizeInput(v.deleted || '')));
    subst.append(del, makeAdd());
    c.range.insertNode(subst);
    tidy(c.line, subst);
    Editor.caretAfter(subst);
    done(c.line);
  }

  async function correction() {
    const rng = Editor.spanRange();
    const c = ctx();
    if (!c) return;
    const hasSel = !!rng || !c.range.collapsed;
    const fields = [];
    if (!hasSel) fields.push({ n: 'orig', label: 'Original reading (as in the manuscript)', type: 'text', focus: true, translit: true });
    fields.push({ n: 'corr', label: 'Corrected reading', type: 'text', focus: hasSel, translit: true });
    const form = UI.form(fields, {});
    const err = U.el('div', { class: 'field-error' });
    const v = await UI.modal({
      title: '<choice> Correction',
      body: U.el('div', null, U.el('p', { class: 'help' }, ELEMENTS.choice.desc), form.el, U.el('pre', { class: 'example' }, ELEMENTS.choice.example), err),
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, {
        label: 'Insert', kind: 'primary', value: () => form.values(),
        validate: () => { const x = form.values(); if (!x.corr) { err.textContent = 'The corrected reading is required'; return false; } return true; },
      }],
    });
    restore(c);
    if (!v) return;
    if (rng) {
      applySpan(rng, (id) => ({
        make: () => {
          const o = TEI.makeWrap('choice', withSpan({}, id));
          const g = TEI.makeWrap('orig', withSpan({}, id, 'o'));
          o.appendChild(g);
          return { outer: o, inner: g };
        },
        finish: (o) => o.appendChild(TEI.makeChip('corr', {}, TEI.sanitizeInput(v.corr))),
      }));
      return;
    }
    Editor.capture('command');
    const choice = TEI.makeWrap('choice', {});
    const orig = TEI.makeWrap('orig', {});
    if (hasSel) orig.appendChild(c.range.extractContents());
    else orig.appendChild(TEI.toHtml(TEI.sanitizeInput(v.orig || '')));
    choice.append(orig, TEI.makeChip('corr', {}, TEI.sanitizeInput(v.corr)));
    c.range.insertNode(choice);
    tidy(c.line, choice);
    Editor.caretAfter(choice);
    done(c.line);
  }

  /* ---------- structural markers ---------- */

  // Insert a marker at a range boundary, moving it outside any inline element.
  function markerAt(c, range, atEnd, type, attrs) {
    const r = range.cloneRange();
    r.collapse(!atEnd);
    let outer = null;
    let n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    while (n && n !== c.line) { if (n.classList.contains('t') && !n.classList.contains('chip')) outer = n; n = n.parentElement; }
    const m = TEI.makeMarker(type, attrs);
    if (outer) {
      const pre = document.createRange();
      pre.setStart(outer, 0);
      pre.setEnd(r.startContainer, r.startOffset);
      const empty = !pre.toString().replace(/​/g, '') && !pre.cloneContents().querySelector('.chip');
      outer.parentNode.insertBefore(m, empty ? outer : outer.nextSibling);
    } else {
      r.insertNode(m);
    }
    return m;
  }

  function stateAtCaret(c) {
    const lines = Model.linesBefore(project(), Editor.entry.label, c.box, c.i);
    const pre = document.createRange();
    pre.setStart(c.line, 0);
    pre.setEnd(c.range.startContainer, c.range.startOffset);
    lines.push(selectedTei(pre));
    return Model.openState(lines);
  }

  function streamKey(c) {
    return Model.streamOfBox(Model.pageLayout(project(), Editor.entry.label), c.box).key;
  }

  function allIds() {
    const ids = new Map();
    const re = /<x-marker\b[^>]*\bid="([^"]*)"/g;
    for (const [label, pg] of Object.entries(project().pages)) {
      for (const lines of Object.values(pg.boxes || {})) {
        for (const l of lines) { let m; while ((m = re.exec(l || ''))) if (!ids.has(m[1])) ids.set(m[1], label); }
      }
    }
    return ids;
  }

  function idValidator(current) {
    const ids = allIds();
    return (v) => {
      if (!v) return 'An xml:id is required';
      if (!/^[A-Za-z_][\w.\-]*$/.test(v)) return 'Must begin with a letter and contain only letters, digits, “.”, “-”, “_”';
      if (v !== current && ids.has(v)) return 'Already used on folio ' + ids.get(v);
      return null;
    };
  }

  const ID_PREFIX = { main: { p: 'p', lg: 'v' }, commentary: { p: 'c', lg: 'cv' }, gloss: { p: 'g', lg: 'gv' } };

  async function structStart(kind) {
    const c = ctx();
    if (!c || !notInNote(c)) return;
    const st = stateAtCaret(c);
    const sk = streamKey(c);
    const suggestion = U.nextId(st.lastIds[kind], ID_PREFIX[sk][kind] + '1');
    const id = await UI.prompt(kind === 'p' ? 'New paragraph <p>' : 'New verse <lg>', 'xml:id', suggestion, {
      validate: idValidator(),
      help: 'Unique identifier used by Saktumiva to collate this ' + (kind === 'p' ? 'paragraph' : 'verse') + ' with other witnesses, e.g. ' + (kind === 'p' ? '“p12” or “1.2.3”' : '“v1.12”') + '. ' +
        (kind === 'p' && st.p ? 'The open paragraph ' + (st.p.id || '') + ' is closed automatically.' : '') + (kind === 'lg' && st.lg ? 'The open verse ' + (st.lg.id || '') + ' is closed automatically.' : ''),
    });
    restore(c);
    if (!id) return;
    const rng = Editor.spanRange();
    if (rng) { spanMarkers(rng, kind === 'p' ? 'p-start' : 'lg-start', { id }, kind === 'p' ? 'p-end' : 'lg-end'); return; }
    Editor.capture('command');
    const m = markerAt(c, c.range, false, kind === 'p' ? 'p-start' : 'lg-start', { id });
    Editor.caretAfter(m);
    done(c.line);
  }

  function structEnd(kind) {
    const c = ctx();
    if (!c || !notInNote(c)) return;
    const st = stateAtCaret(c);
    if (kind === 'p' && !st.p) { U.toast('No paragraph is open here', 'warn'); return; }
    if (kind === 'lg' && !st.lg) { U.toast('No verse is open here', 'warn'); return; }
    Editor.capture('command');
    const m = markerAt(c, c.range, true, kind === 'p' ? 'p-end' : 'lg-end', {});
    Editor.caretAfter(m);
    done(c.line);
  }

  function verseLine() {
    const c = ctx();
    if (!c || !notInNote(c)) return;
    if (!stateAtCaret(c).lg) { U.toast('Not inside a verse — start one first with ' + keyLabel('V'), 'warn'); return; }
    Editor.capture('command');
    const m = markerAt(c, c.range, false, 'l', {});
    Editor.caretAfter(m);
    done(c.line);
  }

  /* ---------- quotations & cited works ---------- */

  // `ids`: one work id, or several separated by spaces (a quotation from several works)
  Commands.workLabel = function (ids, long) {
    const works = (project() && project().works) || [];
    const labels = String(ids || '').split(/\s+/).filter(Boolean).map((id) => {
      const w = works.find((x) => x.id === id);
      if (!w) return '';
      if (long) return w.title + (w.author ? ' — ' + w.author : '');
      return w.abbr || (w.title.length > 18 ? w.title.slice(0, 16) + '…' : w.title);
    }).filter(Boolean);
    return labels.join(long ? '; ' : ' + ');
  };

  // A cited work needs a short label and a title or an author (the other is then "Unknown").
  Commands.checkWork = function (w) {
    const abbr = (w.abbr || '').trim(), title = (w.title || '').trim(), author = (w.author || '').trim();
    if (!abbr) return 'A short label is required';
    if (!title && !author) return 'Give the work, the author, or both';
    const dup = project().works.find((x) => (x.abbr || '').toLowerCase() === abbr.toLowerCase());
    if (dup) return 'The short label “' + abbr + '” is already used for ' + dup.title + (dup.author ? ' — ' + dup.author : '');
    return null;
  };

  Commands.addWork = function (w, quiet) {
    const works = project().works;
    let n = works.length + 1;
    while (works.some((x) => x.id === 'w' + n)) n++;
    const work = { id: 'w' + n, title: (w.title || '').trim() || 'Unknown', author: (w.author || '').trim() || 'Unknown', abbr: (w.abbr || '').trim() };
    works.push(work);
    if (!quiet) { App().changed(); App().refreshSidebar(); }
    return work;
  };

  // number of quotations of each work: {w1: 12, ...}
  Commands.workUsage = function () {
    const usage = {};
    const re = /<x-marker\b[^>]*\bsource="([^"]+)"/g;
    for (const pg of Object.values(project().pages)) {
      for (const lines of Object.values(pg.boxes || {})) {
        for (const l of lines) { let m; while ((m = re.exec(l || ''))) for (const id of m[1].split(/\s+/)) if (id) usage[id] = (usage[id] || 0) + 1; }
      }
    }
    return usage;
  };

  // most quoted first, then alphabetical
  Commands.worksByUse = function () {
    const usage = Commands.workUsage();
    return project().works.slice().sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0) || a.title.localeCompare(b.title));
  };

  // Choose the quoted work(s). Clicking a work ticks / unticks it; "+" in the search box ticks
  // the highlighted work and clears the search for the next one; Enter takes the ticked works
  // (and the highlighted one, if something is typed or nothing is ticked).
  async function quoteDialog(initial) {
    const usage = Commands.workUsage();
    const works = Commands.worksByUse();
    const known = (id) => works.some((w) => w.id === id);
    const initialIds = initial ? String(initial.source || '').split(/\s+/).filter(known) : [];
    const lastIds = String(((project().settings.lastAttrs.quote || {}).source) || '').split(/\s+/).filter(known);
    let checked = initialIds.slice();
    let current = initialIds[0] || lastIds[0] || (works[0] && works[0].id);
    const search = U.el('input', { type: 'text', placeholder: 'Search cited works…  (+ adds the highlighted work, for a quotation from several works)', 'data-focus': true });
    const list = U.el('div', { class: 'work-list' });
    const chosen = U.el('div', { class: 'work-chosen' });
    const newTitle = U.el('input', { type: 'text', placeholder: 'Title of the work, e.g. Kāśikā' });
    const newAuthor = U.el('input', { type: 'text', placeholder: 'Author, e.g. Vāmana & Jayāditya' });
    const newAbbr = U.el('input', { type: 'text', placeholder: 'Short label (required)', style: { maxWidth: '10em' } });
    const wantsNew = () => !!(newTitle.value.trim() || newAuthor.value.trim() || newAbbr.value.trim());
    const locus = U.el('input', { type: 'text', placeholder: 'e.g. 1.1.16 (optional)', value: initial && initial.n || '' });
    const err = U.el('div', { class: 'field-error' });
    // search ignores case and diacritics: "kasika" finds Kāśikā
    const fold = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    // a work whose short label is exactly what was typed comes first; then the most cited
    // (works are already sorted by the number of quotations)
    const matches = () => {
      const q = fold(search.value.trim());
      const found = works.filter((w) => !q || fold(w.title + ' ' + w.author + ' ' + w.abbr).includes(q));
      const exact = found.filter((w) => q && fold(w.abbr || '') === q);
      return exact.concat(found.filter((w) => !exact.includes(w)));
    };
    const toggle = (id) => { checked = checked.includes(id) ? checked.filter((x) => x !== id) : checked.concat(id); };

    const draw = () => {
      list.innerHTML = '';
      const shown = matches();
      if (search.value.trim() && shown.length && !shown.some((w) => w.id === current)) current = shown[0].id;
      for (const w of shown) {
        list.appendChild(U.el('label', { class: 'work-item' + (w.id === current ? ' sel' : '') + (checked.includes(w.id) ? ' on' : '') },
          U.el('input', { type: 'checkbox', checked: checked.includes(w.id), onchange: () => { toggle(w.id); current = w.id; draw(); search.focus(); } }),
          U.el('span', { class: 'work-title' }, w.title), w.author ? U.el('span', { class: 'work-author' }, w.author) : null,
          w.abbr ? U.el('span', { class: 'work-abbr' }, w.abbr) : null,
          U.el('span', { class: 'work-count', title: 'Times quoted in this manuscript' }, String(usage[w.id] || 0))));
      }
      if (!works.length) list.appendChild(U.el('p', { class: 'help' }, 'No cited works yet — add the first one below.'));
      else if (!shown.length) list.appendChild(U.el('p', { class: 'help' }, 'No match. Add it as a new work below.'));
      chosen.innerHTML = '';
      if (checked.length) {
        chosen.append(U.el('span', { class: 'help' }, 'Quoted from: '),
          ...checked.map((id) => U.el('span', { class: 'work-chip' }, Commands.workLabel(id),
            U.el('button', { type: 'button', title: 'Remove', onclick: () => { toggle(id); draw(); search.focus(); } }, '×'))));
      }
    };
    const details = U.el('details', { class: 'new-work', open: !works.length },
      U.el('summary', null, '＋ Add a new cited work'),
      U.el('div', { class: 'row3' }, newTitle, newAuthor, newAbbr));
    let autoFilled = false;
    search.addEventListener('input', () => {
      if (search.value.includes('+')) { // "+": tick the highlighted work, start the next search
        search.value = search.value.replace(/\+/g, '');
        if (current && !checked.includes(current)) checked.push(current);
        search.value = '';
        draw();
        return;
      }
      if (search.value.trim() && matches().length) current = matches()[0].id;
      draw();
      if (!matches().length && search.value.trim()) {
        // nothing found: offer the search text as the title of a new work
        if (!newTitle.value || autoFilled) { newTitle.value = search.value.trim(); autoFilled = true; details.open = true; }
      } else if (autoFilled) {
        newTitle.value = '';
        autoFilled = false;
      }
    });
    newTitle.addEventListener('input', () => { autoFilled = false; });
    search.addEventListener('keydown', (e) => {
      const ids = matches().map((w) => w.id);
      const k = ids.indexOf(current);
      if (e.key === 'ArrowDown' && k < ids.length - 1) { current = ids[k + 1]; draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp' && k > 0) { current = ids[k - 1]; draw(); e.preventDefault(); }
    });
    draw();
    const result = () => {
      const ids = checked.slice();
      if (current && (search.value.trim() || !ids.length) && !wantsNew() && !ids.includes(current)) ids.push(current);
      return ids;
    };
    const body = U.el('div', { class: 'quote-dialog' },
      U.el('p', { class: 'help' }, 'Which work is quoted? Tick several works if the passage is quoted from more than one. Encoded as <quote source="#…">; the works are listed in the TEI header.'),
      search, list, chosen,
      details,
      U.el('label', { class: 'field' }, U.el('span', null, 'Location in the cited work (optional)'), locus),
      err);
    const res = await UI.modal({
      title: '<quote> Quotation', body,
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, {
        label: initial ? 'Save' : 'Mark quotation', kind: 'primary',
        value: () => {
          const ids = result();
          if (wantsNew()) ids.push(Commands.addWork({ title: newTitle.value, author: newAuthor.value, abbr: newAbbr.value }).id);
          return { source: ids.join(' '), n: locus.value.trim() };
        },
        validate: () => {
          if (wantsNew()) {
            const m = Commands.checkWork({ title: newTitle.value, author: newAuthor.value, abbr: newAbbr.value });
            if (m) { err.textContent = 'New work: ' + m; details.open = true; return false; }
            return true;
          }
          if (!result().length) { err.textContent = 'Choose a work or add a new one'; return false; }
          return true;
        },
      }],
    });
    if (res) project().settings.lastAttrs.quote = { source: res.source };
    return res;
  }

  async function quote() {
    const rng = Editor.spanRange();
    if (rng) {
      const res = await quoteDialog();
      if (res) spanMarkers(rng, 'q-start', clean({ source: res.source, n: res.n }), 'q-end');
      return;
    }
    const c = ctx();
    if (!c) return;
    if (c.inNote) {
      // inside a marginal note a quotation is simply a tag around the selected words
      if (c.range.collapsed) { U.toast('Select the quoted words in the note first', 'warn'); return; }
      const res = await quoteDialog();
      restore(c);
      if (!res) return;
      Editor.capture('command');
      const span = TEI.makeWrap('quote', clean({ source: res.source, n: res.n }));
      span.appendChild(c.range.extractContents());
      c.range.insertNode(span);
      tidy(c.line, span);
      Editor.caretAfter(span);
      done(c.line);
      return;
    }
    if (c.range.collapsed) {
      const st = stateAtCaret(c);
      if (st.quote) {
        Editor.capture('command');
        const m = markerAt(c, c.range, false, 'q-end', {});
        Editor.caretAfter(m);
        done(c.line);
        U.toast('Quotation from ' + (Commands.workLabel(st.quote.source, true) || 'unknown work') + ' closed');
        return;
      }
    }
    const res = await quoteDialog();
    restore(c);
    if (!res) return;
    Editor.capture('command');
    const attrs = clean({ source: res.source, n: res.n });
    if (!c.range.collapsed) {
      const end = markerAt(c, c.range, true, 'q-end', {});
      markerAt(c, c.range, false, 'q-start', attrs);
      Editor.caretAfter(end);
    } else {
      const m = markerAt(c, c.range, false, 'q-start', attrs);
      Editor.caretAfter(m);
      U.toast('Quotation started — press ' + keyLabel('Q') + ' again where it ends (it may run over lines and folios)', 'info', 4000);
    }
    done(c.line);
  }

  /* ---------- editing / removing existing tags ---------- */

  Commands.editTag = async function (el) {
    if (!el) {
      const stack = Editor.tagStack();
      el = stack[stack.length - 1];
      if (!el) { U.toast('The cursor is not inside a tag'); return; }
    }
    const line = el.closest('.line');
    if (!line) return;
    const name = el.dataset.t;
    const attrs = JSON.parse(el.dataset.a || '{}');
    const c = ctx(true);
    if (c && c.inNote && !c.line.contains(el)) c.inNote = false; // the note itself is being edited

    if (name === 'x-marker') {
      if (attrs.type === 'p-start' || attrs.type === 'lg-start') {
        const id = await UI.prompt('Edit xml:id', 'xml:id', attrs.id, { validate: idValidator(attrs.id) });
        if (id) { Editor.capture('command'); attrs.id = id; el.dataset.a = JSON.stringify(attrs); TEI.paintChip(el); done(line); }
      } else if (attrs.type === 'q-start') {
        const res = await quoteDialog({ source: attrs.source, n: attrs.n });
        if (res) { Editor.capture('command'); el.dataset.a = JSON.stringify(clean({ type: 'q-start', source: res.source, n: res.n })); TEI.paintChip(el); done(line); }
      } else {
        if (await UI.confirm('Remove this marker (' + el.title + ')?', { ok: 'Remove', danger: true })) Commands.removeTag(el);
      }
      if (c) restore(c);
      return;
    }
    if (name === 'quote') {
      const res = await quoteDialog({ source: attrs.source, n: attrs.n });
      if (c) restore(c);
      if (res) {
        Editor.capture('command');
        el.dataset.a = JSON.stringify(Object.assign({}, attrs, clean({ source: res.source, n: res.n })));
        el.title = TEI.describe(name, JSON.parse(el.dataset.a));
        done(c && c.line.contains(el) ? c.line : line);
      }
      return;
    }
    const def = ELEMENTS[name];
    if (!def || (!(def.attrs || []).length && !def.content)) {
      if (await UI.confirm('<' + name + '> has no attributes to edit. Remove the tag (keeping its text)?', { ok: 'Remove tag' })) Commands.removeTag(el);
      return;
    }
    const isChip = el.classList.contains('chip');
    const values = Object.assign({}, attrs);
    if (name === 'note' && !values.place) values.place = ''; // saving must not invent a place
    const extra = { okLabel: 'Save', removable: true };
    if (isChip && def.content) { extra.content = {}; values._content = TEI.plainText(el.dataset.c || ''); if (/<[^>]+>/.test(el.dataset.c || '')) values._content = el.dataset.c; }
    const v = await attrDialog(name, values, extra);
    if (c) restore(c);
    if (!v) return;
    if (v === '__remove__') { Commands.removeTag(el); return; }
    Editor.capture('command');
    let content = null;
    if ('_content' in v) { content = TEI.sanitizeInput(v._content); delete v._content; }
    const newAttrs = clean(v);
    // attributes this dialog does not list (e.g. from an imported transcription) stay as they are
    const listed = new Set((def.attrs || []).map((f) => f.n));
    for (const [k, x] of Object.entries(attrs)) if (!listed.has(k) && !k.startsWith('x-')) newAttrs[k] = x;
    const spanId = Spans.idOf(el);
    if (spanId) {
      // a tag over several lines: change every piece
      const a = Editor.activeLine();
      if (a) Editor.commit(a);
      const changed = Spans.update(project(), spanId, (p) => { p.dataset.a = JSON.stringify(Object.assign({}, newAttrs, { 'x-span': spanId })); });
      afterSpan(changed, null);
      return;
    }
    if (name === 'add' && (newAttrs.place === 'inline') !== !isChip) {
      // switching between an inline addition and one written above/below/in a margin
      let repl;
      if (isChip) { repl = TEI.makeWrap('add', newAttrs); repl.appendChild(TEI.toHtml(content !== null ? content : el.dataset.c || '')); } else repl = TEI.makeChip('add', newAttrs, TEI.fromHtml(el));
      el.replaceWith(repl);
    } else {
      el.dataset.a = JSON.stringify(newAttrs);
      if (content !== null) el.dataset.c = content;
      if (isChip) TEI.paintChip(el); else el.title = TEI.describe(name, newAttrs);
    }
    done(c && c.inNote && c.line.contains(el) ? c.line : line);
  };

  Commands.removeTag = function (el) {
    if (!el) {
      const stack = Editor.tagStack();
      el = stack[stack.length - 1];
      if (!el) { U.toast('The cursor is not inside a tag'); return; }
    }
    const line = el.closest('.line');
    Editor.capture('command');
    const name = el.dataset.t;
    const spanId = Spans.idOf(el);
    if (spanId) {
      // a tag over several lines (perhaps folios): remove every piece
      Editor.commit(line);
      const changed = Spans.update(project(), spanId, (p) => Spans.unwrap(p));
      afterSpan(changed, null);
      U.toast('Removed <' + name + '> from ' + changed.length + ' line(s)');
      return;
    }
    if (el.classList.contains('chip')) {
      const prev = el.previousSibling;
      if (el._mnote) el._mnote.remove();
      el.remove();
      if (document.activeElement !== line) line.focus({ preventScroll: true });
      if (prev && prev.parentNode) Editor.caretAfter(prev); else Editor.setCaret(line, 0);
    } else {
      const last = el.lastChild;
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
      if (last && last.parentNode) { if (last.nodeType === 3) { const r = document.createRange(); r.setStart(last, last.nodeValue.length); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); } else Editor.caretAfter(last); }
    }
    done(line);
    U.toast('Removed <' + (name === 'x-marker' ? 'marker' : name) + '> — Ctrl+Z to undo');
  };

  /* ---------- registry & shortcuts ---------- */

  function modLabel() {
    const m = project() ? project().settings.modifier : (U.isMac ? 'ctrlalt' : 'alt');
    if (m === 'ctrlalt') return U.isMac ? '⌃⌥' : 'Ctrl+Alt+';
    return U.isMac ? '⌥' : 'Alt+';
  }
  function keyLabel(k, shift) {
    const shown = { Backslash: '\\', Minus: '-', PageDown: 'PgDn', PageUp: 'PgUp', BracketLeft: '[', BracketRight: ']', Enter: 'Enter', Backspace: 'Backspace', Slash: '/', Period: '.' }[k] || k;
    return modLabel() + (shift ? (U.isMac ? '⇧' : 'Shift+') : '') + shown;
  }
  Commands.keyLabel = keyLabel;

  const REG = [];
  function reg(o) { REG.push(o); return o; }

  for (const [name, def] of Object.entries(ELEMENTS)) {
    if (def.internal) continue;
    let run, shiftRun;
    if (def.kind === 'wrap') { run = () => wrap(name, false); if ((def.attrs || []).length) shiftRun = () => wrap(name, true); }
    else if (name === 'add') run = addition;
    else if (name === 'note') run = note;
    else if (name === 'subst') run = substitution;
    else if (name === 'choice') run = correction;
    else run = () => simpleChip(name);
    reg({ id: name, label: def.label, tag: name, key: def.key, group: def.group, desc: def.desc, run, shiftRun, toolbar: true });
  }
  reg({ id: 'p', label: 'Paragraph', tag: 'p', key: 'P', group: 'structure', desc: TEI.STRUCT.p.desc, run: () => structStart('p'), shiftRun: () => structEnd('p'), toolbar: true });
  reg({ id: 'lg', label: 'Verse', tag: 'lg', key: 'V', group: 'structure', desc: TEI.STRUCT.lg.desc, run: () => structStart('lg'), shiftRun: () => structEnd('lg'), toolbar: true });
  reg({ id: 'l', label: 'Verse line', tag: 'l', key: 'L', group: 'structure', desc: TEI.STRUCT.l.desc, run: verseLine, toolbar: true });
  reg({ id: 'quote', label: 'Quotation', tag: 'quote', key: 'Q', group: 'structure', desc: TEI.STRUCT.quote.desc, run: quote, toolbar: true });
  reg({ id: 'edit', label: 'Edit tag at cursor', key: 'Enter', group: 'tools', desc: 'Edit the attributes of the innermost tag at the cursor (or double-click the tag).', run: () => Commands.editTag() });
  reg({ id: 'remove', label: 'Remove tag at cursor', key: 'Backspace', group: 'tools', desc: 'Remove the innermost tag at the cursor, keeping its text.', run: () => Commands.removeTag() });
  reg({ id: 'palette', label: 'Find a tag / command…', key: 'T', group: 'tools', desc: 'Search all tags and commands by name.', run: () => Commands.palette() });
  reg({ id: 'spanstart', label: 'Mark where a tag starts', key: 'Period', group: 'tools', desc: 'For a tag that ends on another line or folio: mark its start here, put the cursor at its end and press the tag’s shortcut. (Within a folio you can also drag or Shift+click across lines.)', run: markSpanStart });
  reg({ id: 'next', label: 'Next folio side', key: 'PageDown', alt: ['BracketRight'], group: 'nav', desc: 'Go to the next folio side.', run: () => App().step(1) });
  reg({ id: 'prev', label: 'Previous folio side', key: 'PageUp', alt: ['BracketLeft'], group: 'nav', desc: 'Go to the previous folio side.', run: () => App().step(-1) });
  reg({ id: 'translit', label: 'Toggle transliteration input', key: 'K', group: 'tools', desc: 'Switch the typing scheme (e.g. Harvard-Kyoto → IAST) on/off.', run: () => App().toggleTranslit() });
  reg({ id: 'help', label: 'Keyboard shortcuts & tag guide', key: 'Slash', group: 'tools', desc: 'Show all shortcuts.', run: () => App().showHelp() });
  Commands.REG = REG;

  function matchesMod(e) {
    const m = project() ? project().settings.modifier : 'alt';
    if (m === 'ctrlalt') return e.ctrlKey && e.altKey && !e.metaKey;
    return e.altKey && !e.ctrlKey && !e.metaKey;
  }

  function codeKey(code) {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  Commands.onKeyDown = function (e) {
    if (!project()) return;
    if (UI.isModalOpen()) {
      // the typing scheme can be switched while typing in a dialog too
      if (matchesMod(e) && e.code === 'KeyK') { e.preventDefault(); e.stopPropagation(); App().toggleTranslit(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); App().saveToFile(); return; }
    if (e.key === 'F1') { e.preventDefault(); App().showHelp(); return; }
    if (!matchesMod(e)) return;
    const k = codeKey(e.code);
    const cmd = REG.find((c) => c.key === k || (c.alt && c.alt.includes(k)));
    if (!cmd) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && cmd.shiftRun) cmd.shiftRun(); else cmd.run();
  };

  /* ---------- toolbar ---------- */

  const GROUPS = [
    ['scribal', 'Scribe'], ['editorial', 'Editor'], ['layout', 'Layout'], ['structure', 'Structure'],
  ];

  // The shortcut letter is underlined in the tag name (as in menus); otherwise shown small after it.
  function accel(tag, key, shown) {
    const idx = key.length === 1 ? tag.indexOf(key.toLowerCase()) : -1;
    if (idx >= 0) return [tag.slice(0, idx), U.el('u', null, tag[idx]), tag.slice(idx + 1)];
    return [tag, U.el('sup', null, shown || key)];
  }

  Commands.buildToolbar = function (host) {
    host.innerHTML = '';
    const btn = (c, content, extra) => U.el('button', Object.assign({
      class: 'tb-btn tb-' + c.id, dataset: { cmd: c.id },
      title: c.label + (c.tag ? ' <' + c.tag + '>' : '') + '  —  ' + keyLabel(c.key) + (c.shiftRun ? '   (' + keyLabel(c.key, true) + (c.group === 'structure' ? ': end' : ': choose attributes') + ')' : '') + '\n' + c.desc,
      onmousedown: (e) => e.preventDefault(),
      onclick: (e) => { if (e.shiftKey && c.shiftRun) c.shiftRun(); else c.run(); },
    }, extra || {}), content);
    for (const [g, title] of GROUPS) {
      const grp = U.el('div', { class: 'tb-group', dataset: { group: g }, title });
      for (const c of REG.filter((x) => x.toolbar && x.group === g)) grp.appendChild(btn(c, accel(c.tag, c.key, ELEMENTS[c.id] && ELEMENTS[c.id].keyLabel)));
      host.appendChild(grp);
    }
    const byId = (id) => REG.find((x) => x.id === id);
    host.appendChild(U.el('div', { class: 'tb-group' }, btn(byId('spanstart'), '↦'), btn(byId('palette'), '⌕')));
  };

  /* ---------- inspector ---------- */

  Commands.renderInspector = function (host, stack) {
    host.innerHTML = '';
    if (!stack || !stack.length) {
      host.appendChild(U.el('p', { class: 'help' }, 'Place the cursor inside a tag (or click a mark such as a note or gap) to see and edit it here.'));
      host.appendChild(legend());
      return;
    }
    for (const el of stack) {
      const name = el.dataset.t;
      const a = JSON.parse(el.dataset.a || '{}');
      const isMarker = name === 'x-marker';
      const def = ELEMENTS[name];
      const title = isMarker ? el.title.split('·')[0].trim() : '<' + name + '> ' + (def ? def.label : '');
      const card = U.el('div', { class: 'insp-card' + (el === stack[stack.length - 1] ? ' innermost' : '') },
        U.el('div', { class: 'insp-title' }, title), a['x-span'] ? U.el('div', { class: 'help' }, 'Runs over several lines — editing or removing it changes every part.') : null);
      const rows = U.el('dl', { class: 'insp-attrs' });
      for (const [k, v] of Object.entries(a)) {
        if ((isMarker && k === 'type') || k.startsWith('x-')) continue;
        rows.append(U.el('dt', null, k), U.el('dd', null, k === 'source' ? (Commands.workLabel(v, true) || v) : v));
      }
      if (el.dataset.c && name !== 'pc') rows.append(U.el('dt', null, 'text'), U.el('dd', { class: 'insp-text' }, TEI.plainText(el.dataset.c)));
      if (rows.childNodes.length) card.appendChild(rows);
      card.appendChild(U.el('div', { class: 'insp-actions' },
        U.el('button', { class: 'btn small', onmousedown: (e) => e.preventDefault(), onclick: () => Commands.editTag(el) }, 'Edit…'),
        U.el('button', { class: 'btn small ghost', onmousedown: (e) => e.preventDefault(), onclick: () => Commands.removeTag(el) }, 'Remove')));
      host.appendChild(card);
    }
    const inner = stack[stack.length - 1];
    const tmp = document.createElement('div');
    tmp.appendChild(inner.cloneNode(true));
    host.appendChild(U.el('div', { class: 'insp-xml-title' }, 'XML'));
    host.appendChild(U.el('pre', { class: 'insp-xml' }, TEI.fromHtml(tmp).replace(/ x-span="[^"]*"/g, '').replace(/<x-marker type="([^"]+)"([^>]*)\/>/, '[$1$2]')));
  };

  function legend() {
    const items = [
      ['del', 'vidyā', 'deleted'], ['add above', '‸', 'added above'], ['unclear', 'tattvaṃ', 'unclear'], ['gap', '[···]', 'gap'],
      ['supplied', 'd', 'supplied'], ['surplus', 'naṃ', 'surplus'], ['sic', 'pa', 'sic'], ['hi', 'śrī', 'rubricated'], ['retrace', 'gṛha', 'retraced'],
    ];
    const box = U.el('div', { class: 'legend' }, U.el('div', { class: 'insp-xml-title' }, 'How tags look'));
    for (const [cls, sample, label] of items) {
      const c = cls.split(' ')[0];
      box.appendChild(U.el('div', { class: 'legend-row' }, U.el('span', { class: 'legend-sample t t-' + c + (cls.includes('above') ? ' chip above' : '') }, sample), U.el('span', null, label)));
    }
    return box;
  }

  /* ---------- command palette ---------- */

  Commands.palette = function () {
    const c = ctx(true);
    const input = U.el('input', { type: 'text', placeholder: 'Type a tag or command name (e.g. gap, note, quote)…', 'data-focus': true });
    const list = U.el('div', { class: 'palette-list' });
    let sel = 0, shown = [];
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      shown = REG.filter((x) => !q || (x.label + ' ' + (x.tag || '') + ' ' + x.desc).toLowerCase().includes(q));
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = '';
      shown.forEach((x, k) => list.appendChild(U.el('div', { class: 'palette-item' + (k === sel ? ' sel' : ''), onmousedown: (e) => { e.preventDefault(); sel = k; go(); } },
        U.el('span', { class: 'pi-label' }, x.label + (x.tag ? '  <' + x.tag + '>' : '')), U.el('kbd', null, keyLabel(x.key)), U.el('div', { class: 'pi-desc' }, x.desc))));
    };
    let closeFn = null;
    const go = () => { const x = shown[sel]; if (closeFn) closeFn(null); if (c) restore(c); if (x) setTimeout(() => x.run(), 0); };
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); }
    });
    draw();
    UI.modal({ title: 'Find a tag or command', body: U.el('div', { class: 'palette' }, input, list), buttons: [], className: 'palette-modal', onOpen: (dlg, close) => { closeFn = close; } });
  };

  ME.Commands = Commands;
})(window.ME);
