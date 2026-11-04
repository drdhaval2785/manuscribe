'use strict';
/* On demand, in the Manuscript tab: every tag and attribute of the transcription as it would be
   exported, most frequent first, with what is outside the standards listed on top.
   TEI: the official schema (teischema.js). Saktumiva: what www.saktumiva.org/wiki/tei documents. */
(function (ME) {
  const { U, TEI, Model, Export } = ME;

  const SAKTUMIVA = {
    p: ['xml:id'], lg: ['xml:id'], l: ['xml:id'], subst: [], add: ['place'], del: ['rend'], choice: [], orig: [], corr: [], caesura: [],
    gap: ['reason', 'unit', 'quantity'], hi: ['rend'], lb: ['n'], metamark: ['function'], milestone: ['n', 'unit'],
    note: ['place', 'xml:lang'], pb: ['n'], pc: [], retrace: [], sic: [], space: ['unit', 'quantity'], supplied: [], surplus: ['reason'], unclear: ['reason'],
  };
  // attributes that are different at every occurrence: their values are not listed
  const NO_VALUES = new Set(['n', 'xml:id', 'quantity']);
  const MAX_PLACES = 40;
  const LABEL = { bad: 'not in TEI', tei: 'not in Saktumiva', odd: 'unusual value' };

  const schemaAttrs = (el) => {
    const S = ME.TEI_SCHEMA;
    return S.lists[S.elements[el]].split(' ');
  };
  const globalAttrs = new Set(ME.TEI_SCHEMA ? ME.TEI_SCHEMA.global.split(' ') : []);
  const isTeiElement = (el) => Object.prototype.hasOwnProperty.call(ME.TEI_SCHEMA.elements, el);

  const elementLevel = (el) => (SAKTUMIVA[el] ? 'ok' : isTeiElement(el) ? 'tei' : 'bad');
  function attrLevel(el, attr) {
    if (!isTeiElement(el)) return 'bad';
    if (SAKTUMIVA[el] && SAKTUMIVA[el].includes(attr)) return 'ok';
    return globalAttrs.has(attr) || schemaAttrs(el).includes(attr) ? 'tei' : 'bad';
  }
  // a value outside the choices the tag's dialog offers
  function isOdd(el, attr, value) {
    const def = TEI.ELEMENTS[el];
    const f = def && (def.attrs || []).find((x) => x.n === attr);
    return !!(f && f.options && f.options.filter(Boolean).length && !f.options.includes(value));
  }

  const bucket = () => ({ count: 0, where: [] });
  const note = (b, where) => { b.count++; if (b.where.length < MAX_PLACES) b.where.push(where); };

  function compute(project) {
    const xml = Export.build(project, {}).xml;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { error: 'The exported XML is not well-formed, so it cannot be counted. Open Export XML to see the problem.' };
    const labelOfPb = {};
    for (const e of Model.entries(project)) labelOfPb[Model.pbValue(project, e.label)] = e.label;
    const streamOfDiv = {};
    for (const [k, s] of Object.entries(Model.STREAMS)) streamOfDiv[s.divType] = k;

    const els = new Map();
    let total = 0;
    const st = { label: null, box: null, n: null, stream: 'main' };
    (function walk(parent) {
      for (const x of Array.from(parent.children)) {
        const name = x.nodeName;
        if (name === 'div') { st.stream = streamOfDiv[x.getAttribute('type')] || 'main'; st.box = null; }
        if (name === 'pb') { const v = x.getAttribute('n'); st.label = labelOfPb[v] || v; st.box = null; st.n = null; }
        if (name === 'cb') st.box = x.getAttribute('n');
        if (name === 'lb') st.n = x.getAttribute('n');
        const where = st.label ? { label: st.label, box: st.box, n: st.n, stream: st.stream } : null;
        if (!els.has(name)) els.set(name, Object.assign(bucket(), { name, attrs: new Map() }));
        const E = els.get(name);
        total++;
        note(E, where);
        for (const at of Array.from(x.attributes)) {
          if (!E.attrs.has(at.name)) E.attrs.set(at.name, Object.assign(bucket(), { name: at.name, values: new Map() }));
          const A = E.attrs.get(at.name);
          note(A, where);
          if (!NO_VALUES.has(at.name)) {
            if (!A.values.has(at.value)) A.values.set(at.value, Object.assign(bucket(), { value: at.value }));
            note(A.values.get(at.value), where);
          }
        }
        walk(x);
      }
    }(doc.getElementsByTagName('body')[0]));

    const byCount = (a, b) => b.count - a.count;
    const elements = Array.from(els.values()).sort(byCount).map((E) => Object.assign(E, {
      level: elementLevel(E.name),
      attrs: Array.from(E.attrs.values()).sort(byCount).map((A) => Object.assign(A, {
        level: attrLevel(E.name, A.name),
        values: Array.from(A.values.values()).sort(byCount).map((V) => Object.assign(V, { odd: isOdd(E.name, A.name, V.value) })),
      })),
    }));
    // what to look at first
    const flagged = { bad: [], tei: [], odd: [] };
    for (const E of elements) {
      if (E.level !== 'ok') flagged[E.level].push({ text: '<' + E.name + '>', count: E.count, where: E.where });
      for (const A of E.attrs) {
        if (A.level !== 'ok' && E.level !== 'bad') flagged[A.level].push({ text: '<' + E.name + '> @' + A.name, count: A.count, where: A.where });
        for (const V of A.values) if (V.odd) flagged.odd.push({ text: '<' + E.name + '> @' + A.name + '="' + V.value + '"', count: V.count, where: V.where });
      }
    }
    for (const list of Object.values(flagged)) list.sort(byCount);
    return { elements, flagged, total, when: new Date() };
  }

  /* ---------- the panel ---------- */

  let state = null; // {projectId, result, open: Set}: kept while the tab is drawn again
  let redraw = null; // of the panel now on the screen

  function placeText(w) { return w.label + (w.box ? ' ' + w.box : '') + (w.n ? ':' + w.n : ''); }

  function places(item, onJump) {
    const known = item.where.filter(Boolean);
    return U.el('div', { class: 'ts-where' },
      known.map((w) => U.el('button', { class: 'ts-loc', title: 'Go to this place', onclick: () => onJump(w) }, placeText(w))),
      item.count > known.length ? U.el('span', { class: 'ts-more' }, '… first ' + known.length + ' of ' + item.count) : null);
  }

  const badge = (level) => (LABEL[level] ? U.el('span', { class: 'ts-badge ' + level }, LABEL[level]) : null);

  function fold(key, head, children) {
    const d = U.el('details', { ontoggle: () => { if (d.open) state.open.add(key); else state.open.delete(key); } }, U.el('summary', null, head), children);
    d.open = state.open.has(key);
    return d;
  }

  function attention(res, onJump) {
    const f = res.flagged;
    if (!f.bad.length && !f.tei.length && !f.odd.length) return U.el('div', { class: 'ts-attention clean' }, '✓ Everything here is on the Saktumiva page.');
    const group = (kind, heading) => (f[kind].length ? [U.el('h5', { class: kind }, heading + ' (' + f[kind].length + ')'),
      ...f[kind].map((it) => fold('!' + it.text, [U.el('span', { class: 'ts-name' }, it.text), U.el('span', { class: 'ts-n' }, String(it.count))], places(it, onJump)))] : null);
    return U.el('div', { class: 'ts-attention' },
      group('bad', 'Not in TEI'), group('tei', 'In TEI, but not in the Saktumiva guide'),
      f.tei.length ? U.el('p', { class: 'ts-more' }, 'The export itself writes <div>, <cb> and break="no".') : null,
      group('odd', 'Values outside the usual list'));
  }

  function fullList(res, onJump) {
    return U.el('div', { class: 'ts-list' }, res.elements.map((E) => fold('e' + E.name,
      [U.el('span', { class: 'ts-name' }, '<' + E.name + '>'), badge(E.level), U.el('span', { class: 'ts-n' }, String(E.count))],
      [places(E, onJump), ...E.attrs.map((A) => fold('a' + E.name + '@' + A.name,
        [U.el('span', { class: 'ts-name' }, '@' + A.name), E.level === 'bad' ? null : badge(A.level), U.el('span', { class: 'ts-n' }, String(A.count))],
        A.values.length ? A.values.map((V) => fold('v' + E.name + '@' + A.name + '=' + V.value,
          [U.el('span', { class: 'ts-val' }, V.value || '(empty)'), V.odd ? badge('odd') : null, U.el('span', { class: 'ts-n' }, String(V.count))],
          places(V, onJump))) : places(A, onJump)))])));
  }

  // beforeCount: makes sure the line being typed is in the project
  function panel(project, beforeCount, onJump) {
    const host = U.el('div');
    if (state && state.projectId !== project.id) state = null;
    const run = () => {
      beforeCount();
      state = { projectId: project.id, result: compute(project), open: state ? state.open : new Set() };
      redraw();
    };
    const draw = () => {
      host.innerHTML = '';
      if (!state) {
        host.append(U.el('p', { class: 'help' }, 'Counts every tag and attribute in the XML this transcription exports, most frequent first, to find unwanted or mistaken ones.'),
          U.el('button', { class: 'btn small', onclick: run }, 'Summarise tags and attributes'));
        return;
      }
      const res = state.result;
      if (res.error) { host.append(U.el('p', { class: 'field-error' }, res.error), U.el('button', { class: 'btn small', onclick: run }, 'Try again')); return; }
      host.append(
        U.el('div', { class: 'ts-head' }, U.el('span', null, res.total + ' tags, ' + res.elements.length + ' kinds · as of ' + res.when.toLocaleTimeString()), U.el('button', { class: 'btn small', onclick: run }, 'Refresh')),
        attention(res, onJump),
        fullList(res, onJump),
        U.el('p', { class: 'help' }, 'TEI: checked against the official schema, P5 version ' + ME.TEI_SCHEMA.version + '. Saktumiva: the elements and attributes its guide documents. Open a tag to see where it occurs; click a place to go there.'));
    };
    redraw = draw;
    draw();
    return host;
  }

  ME.TagSummary = { compute, panel };
})(window.ME);
