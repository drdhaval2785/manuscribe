'use strict';
/* The stemmatic workbench: settings that can be saved and run again, agreement between witnesses, a map, the
   computed trees, the editor's own stemma, what contradicts it, and the archetype it implies. Trees drawn here
   are computed, not stemmata: they have no direction until the editor gives one. */
(function (ME) {
  const { U, UI, Store, Edition, Collate, Apparatus: A, Stemma: S } = ME;
  const StemmaView = {};

  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, ...kids) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); for (const k of kids) if (k) el.append(k); return el; };
  const txt = (x, y, s, attrs) => svg('text', Object.assign({ x, y }, attrs), document.createTextNode(s));
  const pct = (v) => (v === null || v === undefined ? '—' : (100 * v).toFixed(0) + '%');
  const download = (name, data, type) => U.download(name, new Blob([data], { type: type || 'text/plain' }));
  const fileSafe = (s) => String(s).replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_');

  /* ---------- drawings ---------- */

  // A NeighborNet as an outline: parallel edges are one split, as long as its weight.
  function drawNetwork(nn, taxa) {
    const o = S.outline(nn);
    const xs = o.path.map((p) => p[0]), ys = o.path.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = 420, H = 340, pad = 46;
    const k = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxY - minY) || 1));
    const X = (x) => pad + (x - minX) * k, Y = (y) => pad + (y - minY) * k;
    const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sv-net', role: 'img', 'aria-label': 'NeighborNet' });
    for (let i = 1; i < o.path.length; i++) {
      const [x1, y1] = o.path[i - 1], [x2, y2, sp] = o.path[i];
      const side = sp.side.map((t) => taxa[t]);
      const rest = taxa.filter((t) => !side.includes(t));
      g.append(svg('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: 'sv-edge' }, svg('title', {}, document.createTextNode(side.join(' ') + '  |  ' + rest.join(' ') + '  (' + sp.weight.toFixed(3) + ')'))));
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    o.at.forEach(([x, y], pos) => {
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
      g.append(svg('circle', { cx: X(x), cy: Y(y), r: 2.5, class: 'sv-node' }), txt(X(x) + 14 * dx / len, Y(y) + 14 * dy / len + 4, taxa[nn.order[pos]], { class: 'sv-leaf', 'text-anchor': Math.abs(dx / len) < 0.3 ? 'middle' : dx > 0 ? 'start' : 'end' }));
    });
    return g;
  }

  // A computed tree, rooted at its midpoint, drawn with branch lengths, with bootstrap support at its splits.
  function drawTree(t, taxa, support, reps) {
    const order = S.leafOrder(t);
    const y = new Map(), x = new Map();
    order.forEach((taxon, i) => { const v = t.nodes.find((n) => n.taxon === taxon); y.set(v.id, 20 + i * 22); });
    const depth = (id, d) => { const v = t.nodes[id]; x.set(id, d); for (const c of v.children) depth(c, d + t.nodes[c].len); };
    depth(t.root, 0);
    const place = (id) => { const v = t.nodes[id]; if (!v.children.length) return y.get(id); const ys = v.children.map(place); y.set(id, (Math.min(...ys) + Math.max(...ys)) / 2); return y.get(id); };
    place(t.root);
    const maxX = Math.max(...x.values()) || 1;
    const W = 420, scale = (W - 90) / maxX, H = 30 + order.length * 22;
    const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sv-tree', role: 'img', 'aria-label': 'Computed tree' });
    const X = (id) => 10 + x.get(id) * scale;
    for (const v of t.nodes) {
      if (v.dead || !x.has(v.id)) continue;
      if (v.children.length) {
        const ys = v.children.map((c) => y.get(c));
        g.append(svg('line', { x1: X(v.id), y1: Math.min(...ys), x2: X(v.id), y2: Math.max(...ys), class: 'sv-edge' }));
        for (const c of v.children) g.append(svg('line', { x1: X(v.id), y1: y.get(c), x2: X(c), y2: y.get(c), class: 'sv-edge' }));
        if (support && v.id !== t.root) {
          const side = []; const walk = (k) => { const n = t.nodes[k]; if (n.taxon >= 0) side.push(n.taxon); n.children.forEach(walk); }; walk(v.id);
          let key = side;
          if (side.includes(0)) { const all = new Set(side); key = taxa.map((_, i) => i).filter((i) => !all.has(i)); }
          const k = key.slice().sort((a, b) => a - b).join(',');
          if (support.has(k)) g.append(txt(X(v.id) - 3, y.get(v.id) - 4, Math.round((100 * support.get(k)) / reps) + '', { class: 'sv-support', 'text-anchor': 'end' }));
        }
      } else g.append(txt(X(v.id) + 4, y.get(v.id) + 4, taxa[v.taxon], { class: 'sv-leaf' }));
    }
    const bar = 0.05 * scale;
    g.append(svg('line', { x1: 10, y1: H - 8, x2: 10 + bar, y2: H - 8, class: 'sv-edge' }), txt(14 + bar, H - 4, '5% different', { class: 'sv-scale' }));
    return g;
  }

  // The editor's stemma: generations from the top, each placed under its exemplars.
  function drawStemma(st) {
    const kids = new Map(st.nodes.map((n) => [n.name, []]));
    for (const e of st.edges) if (!e.contamination && kids.has(e.from)) kids.get(e.from).push(e.to);
    const level = new Map();
    const down = (n, d, seen) => { if (seen.has(n)) return; seen.add(n); level.set(n, Math.max(level.get(n) || 0, d)); for (const c of kids.get(n) || []) down(c, d + 1, seen); seen.delete(n); };
    if (st.root) down(st.root, 0, new Set());
    for (const n of st.nodes) if (!level.has(n.name)) level.set(n.name, 0);
    const rows = [];
    for (const [n, d] of level) (rows[d] = rows[d] || []).push(n);
    // order each generation by where its exemplars stand
    const xpos = new Map();
    rows.forEach((row, d) => {
      if (d) row.sort((a, b) => { const pa = st.edges.find((e) => !e.contamination && e.to === a), pb = st.edges.find((e) => !e.contamination && e.to === b); return (pa ? xpos.get(pa.from) : 0) - (pb ? xpos.get(pb.from) : 0); });
      row.forEach((n, i) => xpos.set(n, (i + 1) / (row.length + 1)));
    });
    const W = 460, H = 40 + rows.length * 64;
    const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sv-stemma', role: 'img', 'aria-label': 'Stemma' });
    const P = (n) => [xpos.get(n) * W, 24 + level.get(n) * 64];
    for (const e of st.edges) {
      if (!xpos.has(e.from) || !xpos.has(e.to)) continue;
      const [x1, y1] = P(e.from), [x2, y2] = P(e.to);
      if (e.contamination && y1 === y2) {
        // between witnesses of one generation: a curve under them, clear of the others' names
        const dir = x2 > x1 ? 1 : -1;
        g.append(svg('path', { d: 'M' + (x1 + dir * 10) + ' ' + (y1 + 8) + ' Q ' + (x1 + x2) / 2 + ' ' + (y1 + 34) + ' ' + (x2 - dir * 10) + ' ' + (y2 + 8), class: 'sv-edge contam', fill: 'none' }));
        continue;
      }
      g.append(svg('line', { x1, y1: y1 + 10, x2, y2: y2 - 12, class: 'sv-edge' + (e.contamination ? ' contam' : '') }));
    }
    for (const n of st.nodes) {
      if (!xpos.has(n.name)) continue;
      const [x1, y1] = P(n.name);
      g.append(txt(x1, y1 + 4, n.name, { class: n.extant ? 'sv-extant' : 'sv-hyp', 'text-anchor': 'middle' }));
    }
    return g;
  }

  function drawMap(points, taxa) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const W = 360, H = 260, pad = 30;
    const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (v) => pad + ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
    const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sv-map', role: 'img', 'aria-label': 'Map of the witnesses' });
    points.forEach((p, i) => { g.append(svg('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4, class: 'sv-dot' }), txt(X(p[0]) + 6, Y(p[1]) + 4, taxa[i], { class: 'sv-leaf' })); });
    return g;
  }

  function heatmap(m, ag, order) {
    const n = m.taxa.length;
    const idx = order || m.taxa.map((_, i) => i);
    return U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table sv-heat' },
      U.el('thead', null, U.el('tr', null, U.el('th', null, ''), idx.map((i) => U.el('th', null, m.taxa[i])))),
      U.el('tbody', null, idx.map((i) => U.el('tr', null, U.el('th', null, m.taxa[i]), idx.map((j) => {
        if (i === j) return U.el('td', { class: 'muted' }, '');
        const sites = ag.sites[i][j];
        if (!sites) return U.el('td', { class: 'muted', title: 'No place where both can be read' }, 'n/a');
        const r = ag.same[i][j] / sites;
        return U.el('td', { class: 'num', style: { background: 'rgba(43,138,62,' + Math.max(0, (r - 0.4) / 0.6).toFixed(2) + ')' }, title: ag.same[i][j] + ' of ' + sites + ' variants where both can be read' }, pct(r));
      }))))), n > 2 ? null : null);
  }

  /* ---------- the workbench ---------- */

  async function builtFor(ed, list, workId) {
    const recs = (await Store.listCollations(ed.id)).filter((r) => r.work === workId);
    const reg = Edition.register(ed, list)[workId];
    const ids = reg ? reg.order : [];
    recs.sort((a, b) => ids.indexOf(a.unit) - ids.indexOf(b.unit));
    return recs.map((r) => Object.assign({ table: ME.CollateEdit.ensure(r.table) }, A.entries(ed, r.table)));
  }

  /* only: one part of the workbench, as the Analyse step opens it ('agreement', 'trees', 'network', 'copies',
     'stemma'), with the settings above it; without it, all of it. */
  StemmaView.PARTS = { agreement: 'Agreement', trees: 'Trees', network: 'Network and coherence', copies: 'Copies and contamination', stemma: 'Your stemma' };
  StemmaView.open = async function (ed, list, workId, only) {
    const show = (k) => !only || only === k;
    if (list) ME.Features.setContext(ME.Features.langsOf(list));
    const built = await builtFor(ed, list, workId);
    if (!built.length) { U.toast('Collate first', 'warn'); return; }
    ed.stemma = ed.stemma || {};
    const save = () => Edition.save(ed);
    const body = U.el('div', { class: 'sv' });
    const state = { settings: Object.assign({}, S.DEFAULTS, ed.stemma.settings), pars: null, boot: null, drop: null };
    const samples = (ed.samples && ed.samples[workId]) || [];

    const draw = () => {
      body.innerHTML = '';
      const m = S.matrix(ed, built, state.settings, samples);
      const fp = S.fingerprint(m);
      const enough = m.taxa.length >= 3 && m.chars.length > 0;

      // settings, and saved analyses
      const s = state.settings;
      const set = (k, v) => { state.settings = Object.assign({}, state.settings, { [k]: v }); state.pars = state.boot = state.drop = state.net = state.co = null; ed.stemma.settings = state.settings; save(); draw(); };
      const tick = (k, label) => U.el('label', null, U.el('input', { type: 'checkbox', checked: !!s[k], onchange: (e) => set(k, e.target.checked) }), ' ' + label);
      const excl = U.el('span', { class: 'ap-pick' }, ed.witnesses.map((w) => U.el('label', null, U.el('input', { type: 'checkbox', checked: s.exclude.includes(w.siglum), onchange: (e) => set('exclude', e.target.checked ? s.exclude.concat(w.siglum) : s.exclude.filter((x) => x !== w.siglum)) }), ' ' + w.siglum)));
      const nameIn = U.el('input', { type: 'text', placeholder: 'a name for this analysis', 'aria-label': 'Name of the analysis' });
      const saved = (ed.stemma.analyses || []).map((an, i) => {
        const now = S.fingerprint(S.matrix(ed, built, an.settings, samples));
        return U.el('li', null, U.el('strong', null, an.name), ' · ' + an.summary + ' · ', U.el('span', { class: 'ed-tag ' + (now === an.fingerprint ? 'ok' : 'warn') }, now === an.fingerprint ? 'same evidence as when saved' : 'the evidence has changed since'),
          ' ', U.el('button', { class: 'btn small', onclick: () => { state.settings = Object.assign({}, S.DEFAULTS, an.settings); state.pars = state.boot = state.drop = state.net = state.co = null; draw(); } }, 'Use these settings'),
          ' ', U.el('button', { class: 'btn small danger-ghost', onclick: () => { ed.stemma.analyses.splice(i, 1); save(); draw(); } }, 'Remove'));
      });
      body.append(U.el('details', { class: 'nv-fold', open: true }, U.el('summary', null, 'What is analysed'),
        U.el('div', { class: 'nv-head' },
          U.el('label', null, 'Passages ', U.el('select', { onchange: (e) => set('blocks', e.target.value) }, U.el('option', { value: 'all', selected: s.blocks === 'all' }, 'all'), U.el('option', { value: 'samples', selected: s.blocks === 'samples' }, 'only the sample passages (' + samples.length + ')'))),
          tick('orthographic', 'count spelling variants too'), tick('informativeOnly', 'only variants shared by two or more witnesses on each side')),
        U.el('div', { class: 'nv-head' }, U.el('span', null, 'Leave out:'), excl),
        U.el('p', { class: 'help' }, m.taxa.length + ' witnesses, ' + m.chars.length + ' variants. A witness whose text is lost at a variant is missing there; that never counts as agreement. Leaving a witness out keeps it in the data.'),
        U.el('div', { class: 'nv-head' }, nameIn, U.el('button', { class: 'btn small', onclick: () => {
          const name = nameIn.value.trim() || 'Analysis ' + ((ed.stemma.analyses || []).length + 1);
          ed.stemma.analyses = (ed.stemma.analyses || []).concat({ name, settings: state.settings, fingerprint: fp, summary: m.taxa.length + ' witnesses, ' + m.chars.length + ' variants', when: Date.now() });
          save(); draw();
        } }, 'Save these settings')),
        saved.length ? U.el('ul', { class: 'sv-saved' }, saved) : null));
      if (!enough) { body.append(U.el('p', { class: 'nv-warn' }, 'This needs at least three witnesses and one variant among them.')); return; }

      // first stage: agreement, map, a tree by distance
      const ag = S.agreement(m);
      const D = S.distances(m);
      const nj = S.nj(D);
      const shown = S.midpoint(nj);
      const order = S.leafOrder(shown);
      if (show('agreement')) body.append(U.el('h3', null, 'How far the witnesses agree'),
        U.el('p', { class: 'help' }, 'Variants where two witnesses read alike, out of those where both can be read. Ordered as in the tree below, so that close witnesses sit together.'),
        heatmap(m, ag, order));
      const treeBox = U.el('div', { class: 'sv-figure' }, drawTree(shown, m.taxa, state.boot && state.boot.support, state.boot && state.boot.reps));
      if (show('trees')) body.append(U.el('div', { class: 'sv-row' },
        U.el('div', null, U.el('h3', null, 'A tree by distance (neighbour joining)'), treeBox,
          U.el('p', { class: 'help' }, state.boot ? 'Numbers: in how many of ' + state.boot.reps + ' resamplings of the variants each group came out again.' : 'Drawn from its midpoint: a computed tree has no top of its own.'),
          U.el('div', { class: 'nv-head' }, U.el('button', { class: 'btn small', onclick: () => { state.boot = S.bootstrap(m, nj, s.bootstrap, s.seed); draw(); } }, 'How sure? (bootstrap, ' + s.bootstrap + ')'),
            U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.nj.tre', S.newick(shown, m.taxa) + '\n') }, 'Save as Newick'))),
        U.el('div', null, U.el('h3', null, 'A map of the witnesses'), U.el('div', { class: 'sv-figure' }, drawMap(S.pcoa(D), m.taxa)),
          U.el('p', { class: 'help' }, 'Close witnesses stand close. The two axes carry the most of the differences that two axes can.'))));

      // a network, where the variants do not all fit one tree
      const netBox = U.el('div');
      if (state.net) netBox.append(U.el('div', { class: 'sv-figure' }, drawNetwork(state.net, m.taxa)),
        U.el('p', { class: 'help' }, state.net.splits.length + ' splits; they account for ' + (100 * state.net.fit).toFixed(1) + '% of the distances (least squares). Point at an edge to see its split.'));
      const coWho = U.el('select', { 'aria-label': 'Witness' }, m.taxa.concat('A').map((x) => U.el('option', { value: x, selected: x === state.coWho }, x === 'A' ? 'A (the edited text)' : x)));
      const coBox = U.el('div');
      const showCoherence = () => {
        state.coWho = coWho.value;
        const co = state.co || (state.co = S.coherence(m));
        const rows = co.rows[co.names.indexOf(coWho.value)];
        coBox.innerHTML = '';
        coBox.append(U.el('table', { class: 'ed-table sv-small' }, U.el('thead', null, U.el('tr', null, ['Witness', 'Agrees', 'Of places', 'Has the earlier reading', 'Has the later', 'Unrelated', 'Potential ancestor'].map((h) => U.el('th', null, h)))),
          U.el('tbody', null, rows.map((r) => U.el('tr', null, U.el('td', null, r.witness), U.el('td', { class: 'num' }, pct(r.perc)), U.el('td', { class: 'num' }, String(r.pass)), U.el('td', { class: 'num' }, String(r.prior)), U.el('td', { class: 'num' }, String(r.posterior)), U.el('td', { class: 'num' }, String(r.norel)), U.el('td', { class: 'num' }, r.ancestor ? '#' + r.rank : ''))))));
      };
      coWho.addEventListener('change', showCoherence);
      showCoherence();
      if (show('network')) body.append(U.el('div', { class: 'sv-row' },
        U.el('div', null, U.el('h3', null, 'A network (NeighborNet)'),
          U.el('p', { class: 'help' }, 'Where the variants pull in different directions, as contamination does, a tree hides it and a network shows it: boxes mark witnesses grouped two ways at once.'),
          U.el('button', { class: 'btn small primary', onclick: () => { state.net = S.neighbornet(D); draw(); } }, state.net ? 'Draw again' : 'Draw it'), netBox),
        U.el('div', null, U.el('h3', null, 'Coherence'),
          U.el('p', { class: 'help' }, 'As in the Coherence-Based Genealogical Method: each witness’s closest relatives, by the share of places where they agree. Taking the edited text’s reading as the source of the others at each place, a witness with the earlier reading more often than the later is a potential ancestor, ranked by agreement. A stands for the edited text.'),
          U.el('label', null, 'For ', coWho), coBox)));

      // second stage: parsimony
      const parsBox = U.el('div');
      if (state.pars) {
        const p = state.pars;
        parsBox.append(U.el('div', { class: 'sv-figure' }, drawTree(S.midpoint(p.tree), m.taxa)),
          U.el('p', { class: 'help' }, 'Length ' + p.length + ' changes (at least ' + p.min + ' are needed); consistency index ' + p.ci.toFixed(2) + ', retention index ' + p.ri.toFixed(2) + '. ' + p.starts + ' searches by nearest-neighbour interchange; their lengths: ' + p.lengths.join(', ') + '.'),
          U.el('div', { class: 'nv-head' },
            U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.parsimony.tre', S.newick(S.midpoint(p.tree), m.taxa) + '\n') }, 'Save as Newick'),
            U.el('button', { class: 'btn small', onclick: () => { ed.stemma.dot = S.stemmaFromTree(S.midpoint(p.tree), m.taxa); save(); draw(); } }, 'Start my stemma from this tree')));
      }
      if (show('trees')) body.append(U.el('h3', null, 'The shortest tree (parsimony)'),
        U.el('p', { class: 'help' }, 'The tree that needs the fewest changes of reading. It can take a while with many witnesses.'),
        U.el('button', { class: 'btn small primary', onclick: () => { state.pars = S.parsimony(m, { starts: 5, seed: s.seed }); draw(); } }, state.pars ? 'Search again' : 'Find it'), parsBox);

      // copies, contamination and changes of exemplar
      const desc = S.descripti(m);
      const dropBox = U.el('div');
      if (state.drop) {
        dropBox.append(U.el('table', { class: 'ed-table sv-small' }, U.el('thead', null, U.el('tr', null, ['Left out', 'Extra changes without it', 'Consistency without it'].map((h) => U.el('th', null, h)))),
          U.el('tbody', null, state.drop.map((d) => U.el('tr', null, U.el('td', null, d.siglum), U.el('td', { class: 'num' }, d.extraWithout === null ? '—' : String(d.extraWithout) + ' (of ' + d.extra + ')'), U.el('td', { class: 'num' }, d.ciWithout === null ? '—' : d.ciWithout.toFixed(2)))))));
      }
      const who = U.el('select', { 'aria-label': 'Witness' }, m.taxa.map((x) => U.el('option', { value: x }, x)));
      const blockBox = U.el('div');
      const showBlocks = () => {
        blockBox.innerHTML = '';
        const rows = S.byBlock(m, who.value);
        const others = m.taxa.filter((x) => x !== who.value);
        blockBox.append(U.el('table', { class: 'ed-table sv-small' }, U.el('thead', null, U.el('tr', null, U.el('th', null, 'Passage'), others.map((o) => U.el('th', null, o)))),
          U.el('tbody', null, rows.map((r) => U.el('tr', null, U.el('td', null, r.unit), others.map((o) => U.el('td', { class: 'num' + (r.best === o ? ' sv-best' : '') }, pct(r.rates[o]))))))));
      };
      who.addEventListener('change', showBlocks);
      showBlocks();
      if (show('copies')) body.append(U.el('h3', null, 'Copies, contamination, changes of exemplar'),
        U.el('p', { class: 'help' }, 'Possible copies: a witness that has all the readings another has alone with it, and differs only where it stands alone. To check against the manuscripts: dates and palaeography may show the reverse.'),
        desc.length ? U.el('ul', { class: 'sv-saved' }, desc.slice(0, 20).map((d) => U.el('li', null, d.copy + ' may be a copy of ' + d.of + ': ' + d.shared + ' reading(s) only they share, none against, ' + d.sites + ' variants compared'))) : U.el('p', { class: 'help' }, 'None found.'),
        U.el('div', { class: 'nv-head' }, U.el('button', { class: 'btn small', onclick: () => { state.drop = S.dropOne(m, { starts: 3, seed: s.seed }); draw(); } }, 'Leave each witness out in turn'), U.el('span', { class: 'help' }, 'A witness whose absence removes the most extra changes may be contaminated, or the cause of it.')),
        dropBox,
        U.el('div', { class: 'nv-head' }, U.el('span', null, 'Passage by passage, how far'), who, U.el('span', null, 'agrees with each other witness:')), blockBox);

      // the editor's stemma
      const dot = U.el('textarea', { class: 'sv-dottext', rows: 8, spellcheck: 'false', 'aria-label': 'Stemma in DOT' }, ed.stemma.dot || 'digraph stemma {\n  ω -> α;\n' + m.taxa.map((x, i) => '  ' + (i % 2 ? 'ω' : 'α') + ' -> ' + x + ';').join('\n') + '\n}\n');
      const stBox = U.el('div');
      const drawHypothesis = () => {
        stBox.innerHTML = '';
        const st = S.parseDot(dot.value, m.taxa);
        if (st.errors.length) stBox.append(U.el('ul', { class: 'nv-warn' }, st.errors.map((e) => U.el('li', null, e))));
        if (!st.nodes.length) return;
        stBox.append(U.el('div', { class: 'sv-figure' }, drawStemma(st)));
        if (st.errors.length) return;
        const rec = S.reconstruct(m, st);
        const conf = S.conflicts(m, rec);
        const extra = rec.per.reduce((a, r) => a + r.steps - r.min, 0);
        stBox.append(U.el('p', { class: 'help' }, 'On this stemma the variants need ' + rec.length + ' changes, ' + extra + ' more than their readings alone require. Dashed lines are drawn but not followed.'));
        // one place is a block and its first column: two entries can share a printed reference
        const lemmaOf = new Map(built.flatMap((b) => b.entries.map((e) => [e.unit + '|' + e.fromId, e.lemma])));
        const placeOf = (r) => r.unit + '|' + r.fromId;
        const differs = rec.per.filter((r) => r.root.length === 1 && lemmaOf.has(placeOf(r)) && r.root[0] !== lemmaOf.get(placeOf(r)));
        const ties = rec.per.filter((r) => r.root.length > 1);
        stBox.append(U.el('details', { class: 'nv-fold', open: differs.length > 0 }, U.el('summary', null, 'The archetype this stemma implies: ' + differs.length + ' place(s) where it differs from your text, ' + ties.length + ' left open'),
          U.el('p', { class: 'help' }, 'Where the top of the stemma can be reconstructed. Readings in braces are equally possible on this stemma.'),
          U.el('ul', { class: 'ap-entries' }, differs.map((r) => U.el('li', null, r.ref + ' ' + (lemmaOf.get(placeOf(r)) || '(omits)') + ' — the archetype: ' + (r.root[0] || '(omits)'))),
            ties.slice(0, 60).map((r) => U.el('li', { class: 'muted' }, r.ref + ' {' + r.root.map((x) => x || 'om.').join(', ') + '}')))),
          U.el('details', { class: 'nv-fold' }, U.el('summary', null, conf.length + ' variant(s) that do not fit this stemma'),
            U.el('p', { class: 'help' }, 'More changes than the number of readings demands: contamination, coincidence, or a stemma to redraw.'),
            U.el('ul', { class: 'ap-entries' }, conf.slice(0, 100).map((c) => U.el('li', null, c.ref + ' (+' + c.extra + '): ' + c.groups.map((g) => (g.text || 'om.') + ' ' + g.wits.join(' ')).join('; '))))));
      };
      dot.addEventListener('input', U.debounce(() => { ed.stemma.dot = dot.value; save(); drawHypothesis(); }, 400));
      if (show('stemma')) body.append(U.el('h3', null, 'Your stemma'),
        U.el('p', { class: 'help' }, 'Write it in DOT, one line from exemplar to copy: ω -> α; α -> A. Names that are not sigla are lost witnesses. A copy with a second source: B -> C [style=dashed]. An extant witness may be the exemplar of another.'),
        U.el('div', { class: 'sv-row' }, dot, stBox),
        U.el('div', { class: 'nv-head' }, U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.stemma.dot', dot.value) }, 'Save as DOT')));
      drawHypothesis();

      // exports
      const nx = S.nexus(m, { citation: ME.Publish.citation(ed) });
      if (!only) body.append(U.el('h3', null, 'For other programs'),
        U.el('p', { class: 'help' }, 'NEXUS for PAUP* and SplitsTree, the tree in Newick, your stemma in DOT, and the TEI apparatus for teiphy and open-cbgm: under Export.'),
        U.el('div', { class: 'nv-head' }, U.el('button', { class: 'btn small', dataset: { action: 'export' }, onclick: () => ME.ExportView.open({ kind: 'edition', ed, list, workId }) }, 'Export…')),
        nx.dropped.length ? U.el('p', { class: 'help' }, nx.dropped.length + ' variant(s) with more than 32 readings are left out of the NEXUS file: ' + nx.dropped.slice(0, 10).join(', ')) : '');
    };
    draw();
    await UI.modal({ title: only ? StemmaView.PARTS[only] : 'Stemmatics', body, wide: true, className: 'cv-modal', buttons: [{ label: 'Close', value: null }], onOpen: () => { StemmaView.lastOpen = { state, body, ed }; } });
    StemmaView.lastOpen = null;
  };

  ME.StemmaView = StemmaView;
})(window.ME);
