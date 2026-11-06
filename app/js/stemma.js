'use strict';
/* Stemmatics: what the variants say about how the witnesses are related. Nothing here decides a stemma. It
   computes agreement, trees and their conflicts, so that the editor can weigh them, and draws the stemma the
   editor proposes. A lost reading is never a state: it is missing, and never counts as agreement.

   A matrix: {taxa: [sigla], chars: [{ref, label, states: [text], cells: [state index or -1 for missing]}]}. */
(function (ME) {
  const { Apparatus: A } = ME;
  const S = {};

  S.DEFAULTS = { name: '', blocks: 'all', orthographic: false, informativeOnly: false, exclude: [], seed: 7, bootstrap: 100 };

  // A seeded random number generator, so that every run with the same settings gives the same trees.
  S.random = (seed) => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

  /* ---------- the matrix ---------- */

  /* From the apparatus of a work. built: [{table, entries}]; settings as S.DEFAULTS; samples: ids of sample passages. */
  S.matrix = function (ed, built, settings, samples) {
    const s = Object.assign({}, S.DEFAULTS, settings);
    const taxa = ed.witnesses.map((w) => w.siglum).filter((x) => !s.exclude.includes(x));
    const chars = [];
    for (const b of built) {
      if (s.blocks === 'samples' && samples && !samples.includes(b.table.unit)) continue;
      const present = new Set(Object.values(b.table.states).map((st) => st.siglum));
      for (const e of b.entries) {
        if (e.kind === 'orthographic' && !s.orthographic) continue;
        if (e.kind === 'testimonium') continue;
        const states = [];
        const cells = new Array(taxa.length).fill(-1);
        const put = (text, wits) => {
          let i = states.indexOf(text);
          if (i < 0) { i = states.length; states.push(text); }
          for (const w of wits) { const t = taxa.indexOf(w); if (t >= 0) cells[t] = i; }
        };
        if (e.kind === 'orthographic') {
          put(e.lemma, e.lemWits.filter((w) => !e.orth.some((o) => o.wits.includes(w))));
          for (const o of e.orth) put(o.text, o.wits);
        } else {
          if (e.lemWits.length) put(e.lemma, e.lemWits);
          for (const r of e.readings) put(r.text, r.wits);
        }
        // witnesses lost here, or without the block, stay missing
        for (const m of e.missing) { const t = taxa.indexOf(m.wit); if (t >= 0) cells[t] = -1; }
        for (let t = 0; t < taxa.length; t++) if (!present.has(taxa[t])) cells[t] = -1;
        const counts = new Map();
        for (const c of cells) if (c >= 0) counts.set(c, (counts.get(c) || 0) + 1);
        if (counts.size < 2) continue; // no variation among the witnesses analysed
        if (s.informativeOnly && [...counts.values()].filter((n) => n >= 2).length < 2) continue;
        chars.push({ ref: e.ref, unit: e.unit, label: e.lemma, states, cells, fromId: e.fromId, initial: states.indexOf(e.lemma) });
      }
    }
    return { taxa, chars, settings: s };
  };

  // A fingerprint of the data, to tell whether a saved analysis still describes the same evidence.
  S.fingerprint = function (m) {
    const text = JSON.stringify([m.taxa, m.chars.map((c) => [c.ref, c.cells])]);
    let h = 0x811C9DC5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16) + ':' + m.chars.length;
  };

  /* ---------- agreement and distance ---------- */

  /* For each pair: {same, sites}, over the characters where both can be read. Missing never agrees. */
  S.agreement = function (m) {
    const n = m.taxa.length;
    const same = Array.from({ length: n }, () => new Int32Array(n)), sites = Array.from({ length: n }, () => new Int32Array(n));
    for (const c of m.chars) {
      for (let i = 0; i < n; i++) {
        if (c.cells[i] < 0) continue;
        for (let j = i + 1; j < n; j++) {
          if (c.cells[j] < 0) continue;
          sites[i][j]++; sites[j][i]++;
          if (c.cells[i] === c.cells[j]) { same[i][j]++; same[j][i]++; }
        }
      }
    }
    return { same, sites };
  };

  // Proportion of disagreement, by pairwise deletion. null where two witnesses never overlap.
  S.distances = function (m, ag) {
    const a = ag || S.agreement(m);
    const n = m.taxa.length;
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 0 : a.sites[i][j] ? 1 - a.same[i][j] / a.sites[i][j] : null)));
  };

  /* ---------- trees ---------- */

  // A tree: {nodes: [{id, parent, children, taxon, len}], root}. Leaves have taxon >= 0.
  const node = (nodes, taxon) => { const v = { id: nodes.length, parent: -1, children: [], taxon: taxon === undefined ? -1 : taxon, len: 0 }; nodes.push(v); return v; };

  /* Neighbour joining (Saitou and Nei). Distances that are missing are taken as the largest seen. -> tree */
  S.nj = function (D) {
    const n = D.length;
    const nodes = [];
    let max = 0;
    for (const row of D) for (const v of row) if (v !== null && v > max) max = v;
    const d = D.map((row) => row.map((v) => (v === null ? max : v)));
    let active = [];
    for (let i = 0; i < n; i++) active.push({ v: node(nodes, i), row: i });
    const dist = new Map();
    const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dist.set(key(active[i].v.id, active[j].v.id), d[i][j]);
    const get = (a, b) => (a === b ? 0 : dist.get(key(a, b)));
    while (active.length > 2) {
      const r = active.length;
      const sum = new Map(active.map((x) => [x.v.id, active.reduce((acc, y) => acc + get(x.v.id, y.v.id), 0)]));
      let best = null, bq = Infinity;
      for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) {
        const a = active[i].v.id, b = active[j].v.id;
        const q = (r - 2) * get(a, b) - sum.get(a) - sum.get(b);
        if (q < bq - 1e-12) { bq = q; best = [i, j]; }
      }
      const [i, j] = best;
      const A_ = active[i].v, B = active[j].v;
      const dab = get(A_.id, B.id);
      const la = Math.max(0, dab / 2 + (sum.get(A_.id) - sum.get(B.id)) / (2 * (r - 2)));
      const u = node(nodes);
      A_.parent = u.id; B.parent = u.id; A_.len = la; B.len = Math.max(0, dab - la);
      u.children = [A_.id, B.id];
      for (const x of active) if (x.v !== A_ && x.v !== B) dist.set(key(u.id, x.v.id), (get(A_.id, x.v.id) + get(B.id, x.v.id) - dab) / 2);
      active = active.filter((x, k) => k !== i && k !== j);
      active.push({ v: u });
    }
    if (active.length === 1) return { nodes, root: active[0].v.id };
    const [x, y] = active.map((z) => z.v);
    const root = node(nodes);
    const dxy = get(x.id, y.id);
    x.parent = root.id; y.parent = root.id; x.len = dxy / 2; y.len = dxy / 2;
    root.children = [x.id, y.id];
    return { nodes, root: root.id };
  };

  const leavesUnder = (t, id, out) => { const v = t.nodes[id]; if (v.taxon >= 0) out.push(v.taxon); for (const c of v.children) leavesUnder(t, c, out); return out; };

  // The splits a tree makes, each as a sorted list of the taxa on the side without the first taxon.
  S.splits = function (t, n) {
    const out = new Set();
    for (const v of t.nodes) {
      if (v.id === t.root || v.taxon >= 0 || (v.parent < 0)) continue;
      let side = leavesUnder(t, v.id, []);
      if (side.includes(0)) { const all = new Set(side); side = []; for (let i = 0; i < n; i++) if (!all.has(i)) side.push(i); }
      if (side.length < 2 || side.length > n - 2) continue;
      out.add(side.sort((a, b) => a - b).join(','));
    }
    return out;
  };

  /* Bootstrap support for each split of a tree: resampled characters, the same seed, the same answer. */
  S.bootstrap = function (m, tree, reps, seed) {
    const rnd = S.random(seed);
    const want = S.splits(tree, m.taxa.length);
    const support = new Map([...want].map((k) => [k, 0]));
    for (let r = 0; r < reps; r++) {
      const chars = m.chars.map(() => m.chars[Math.floor(rnd() * m.chars.length)]);
      const t = S.nj(S.distances({ taxa: m.taxa, chars }));
      for (const k of S.splits(t, m.taxa.length)) if (support.has(k)) support.set(k, support.get(k) + 1);
    }
    return { support, reps };
  };

  // Rooted at the midpoint of its longest path, for drawing: the computed tree has no direction of its own.
  S.midpoint = function (t) {
    const adj = new Map(t.nodes.map((v) => [v.id, []]));
    for (const v of t.nodes) if (v.parent >= 0) { adj.get(v.id).push([v.parent, v.len]); adj.get(v.parent).push([v.id, v.len]); }
    // drop the arbitrary root if it has two children
    const far = (from) => { const d = new Map([[from, 0]]), prev = new Map(); const st = [from]; while (st.length) { const x = st.pop(); for (const [y, l] of adj.get(x)) if (!d.has(y)) { d.set(y, d.get(x) + l); prev.set(y, x); st.push(y); } } let best = from; for (const [k, v] of d) if (t.nodes[k].taxon >= 0 && v > d.get(best)) best = k; return { best, d, prev }; };
    const a = far(t.nodes.find((v) => v.taxon >= 0).id).best;
    const { best: b, d, prev } = far(a);
    const half = d.get(b) / 2;
    let x = b;
    while (prev.has(x) && d.get(prev.get(x)) >= half) x = prev.get(x);
    const p = prev.get(x);
    // rebuild rooted at a new node on the edge p–x
    const nodes = t.nodes.map((v) => ({ id: v.id, parent: -1, children: [], taxon: v.taxon, len: 0 }));
    const root = { id: nodes.length, parent: -1, children: [], taxon: -1, len: 0 };
    nodes.push(root);
    const edge = (adj.get(x).find(([y]) => y === p) || [p, 0])[1];
    const lx = d.get(x) - half, lp = edge - lx;
    const hang = (from, to, len) => { nodes[to].parent = from; nodes[to].len = len; nodes[from].children.push(to); };
    const grow = (v, cameFrom) => { for (const [y, l] of adj.get(v)) if (y !== cameFrom) { hang(v, y, l); grow(y, v); } };
    if (p === undefined) return t;
    hang(root.id, x, Math.max(0, lx)); grow(x, p);
    hang(root.id, p, Math.max(0, lp)); grow(p, x);
    // a node left with one child (the old root) is spliced out
    for (const v of nodes) {
      if (v.id !== root.id && v.taxon < 0 && v.children.length === 1) {
        const c = nodes[v.children[0]], par = nodes[v.parent];
        c.parent = par.id; c.len += v.len;
        par.children = par.children.map((k) => (k === v.id ? c.id : k));
        v.children = []; v.dead = true;
      }
    }
    return { nodes, root: root.id };
  };

  S.newick = function (t, taxa) {
    const w = (id) => { const v = t.nodes[id]; const name = v.taxon >= 0 ? taxa[v.taxon].replace(/[(),:;\s]/g, '_') : ''; return (v.children.length ? '(' + v.children.map(w).join(',') + ')' : '') + name + (v.parent >= 0 ? ':' + v.len.toFixed(5) : ''); };
    return w(t.root) + ';';
  };

  S.leafOrder = (t) => leavesUnder(t, t.root, []);

  /* ---------- a map of the witnesses ---------- */

  // Classical multidimensional scaling to two dimensions. -> [[x, y]] per taxon
  S.pcoa = function (D) {
    const n = D.length;
    let max = 0;
    for (const row of D) for (const v of row) if (v !== null && v > max) max = v;
    const d2 = D.map((row) => row.map((v) => { const x = v === null ? max : v; return x * x; }));
    const rm = d2.map((row) => row.reduce((a, b) => a + b, 0) / n);
    const all = rm.reduce((a, b) => a + b, 0) / n;
    const B = d2.map((row, i) => row.map((v, j) => -0.5 * (v - rm[i] - rm[j] + all)));
    const eig = [];
    const M = B.map((r) => r.slice());
    for (let k = 0; k < 2; k++) {
      let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1 + k));
      let lambda = 0;
      for (let it = 0; it < 200; it++) {
        const w = M.map((row) => row.reduce((acc, x, j) => acc + x * v[j], 0));
        const norm = Math.hypot(...w) || 1;
        lambda = norm;
        v = w.map((x) => x / norm);
      }
      eig.push({ lambda, v });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] -= lambda * v[i] * v[j];
    }
    return Array.from({ length: n }, (_, i) => eig.map((e) => e.v[i] * Math.sqrt(Math.max(0, e.lambda))));
  };

  /* ---------- copies and changes of exemplar ---------- */

  /* Could B be a copy of A? B shares A's own readings, and differs from A only where B stands alone. A flag for
     review, never a ruling: the palaeography can say otherwise. -> [{copy, of, shared, against, sites}] */
  S.descripti = function (m) {
    const n = m.taxa.length;
    const out = [];
    const counts = m.chars.map((c) => { const k = new Map(); for (const v of c.cells) if (v >= 0) k.set(v, (k.get(v) || 0) + 1); return k; });
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b) continue;
      let shared = 0, against = 0, sites = 0;
      m.chars.forEach((c, k) => {
        const x = c.cells[a], y = c.cells[b];
        if (x < 0 || y < 0) return;
        sites++;
        const cnt = counts[k];
        if (x === y && cnt.get(x) === 2) shared++; // a reading the two alone have
        if (x !== y && cnt.get(y) > 1) against++; // B goes with others against A: not a copy of A
      });
      if (sites && against === 0 && shared > 0) out.push({ copy: m.taxa[b], of: m.taxa[a], shared, against, sites });
    }
    return out.sort((x, y) => y.shared - x.shared);
  };

  /* For one witness, which other it agrees with most in each block: a change of nearest relative along the text
     may mean a change of exemplar. -> [{unit, best, rates: {sigla: rate}, sites}] */
  S.byBlock = function (m, siglum) {
    const t = m.taxa.indexOf(siglum);
    const units = [...new Set(m.chars.map((c) => c.unit))];
    return units.map((u) => {
      const cs = m.chars.filter((c) => c.unit === u);
      const rates = {};
      let sites = 0;
      m.taxa.forEach((o, j) => {
        if (j === t) return;
        let same = 0, n = 0;
        for (const c of cs) if (c.cells[t] >= 0 && c.cells[j] >= 0) { n++; if (c.cells[t] === c.cells[j]) same++; }
        rates[o] = n ? same / n : null;
        sites = Math.max(sites, n);
      });
      const best = Object.entries(rates).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1])[0];
      return { unit: u, best: best ? best[0] : null, rates, sites };
    });
  };

  /* ---------- parsimony ---------- */

  // Each character as bit sets per taxon; missing is every state, so it never costs a step.
  const bitsOf = (m) => m.chars.map((c) => { const all = (1 << c.states.length) - 1; return c.cells.map((v) => (v < 0 ? all : 1 << v)); });

  // Fitch length of a rooted binary tree, and of each character.
  S.fitch = function (t, m, bits) {
    const b = bits || bitsOf(m);
    const per = new Int32Array(m.chars.length);
    const order = [];
    const visit = (id) => { for (const c of t.nodes[id].children) visit(c); order.push(id); };
    visit(t.root);
    const sets = new Array(t.nodes.length);
    for (let k = 0; k < b.length; k++) {
      let steps = 0;
      for (const id of order) {
        const v = t.nodes[id];
        if (v.taxon >= 0) { sets[id] = b[k][v.taxon]; continue; }
        let s = sets[v.children[0]];
        for (let i = 1; i < v.children.length; i++) {
          const x = s & sets[v.children[i]];
          if (x) s = x; else { s = s | sets[v.children[i]]; steps++; }
        }
        sets[id] = s;
      }
      per[k] = steps;
    }
    let total = 0;
    for (const x of per) total += x;
    return { total, per };
  };

  const clone = (t) => ({ root: t.root, nodes: t.nodes.map((v) => ({ id: v.id, parent: v.parent, children: v.children.slice(), taxon: v.taxon, len: v.len })) });

  // All trees one nearest-neighbour interchange away.
  function* nni(t) {
    for (const v of t.nodes) {
      if (v.taxon >= 0 || v.parent < 0 || v.children.length !== 2 || v.dead) continue;
      const p = t.nodes[v.parent];
      const sib = p.children.find((c) => c !== v.id);
      if (sib === undefined) continue;
      for (const which of [0, 1]) {
        const u = clone(t);
        const vv = u.nodes[v.id], pp = u.nodes[p.id];
        const moved = vv.children[which];
        vv.children[which] = sib; u.nodes[sib].parent = vv.id;
        pp.children = pp.children.map((c) => (c === sib ? moved : c)); u.nodes[moved].parent = pp.id;
        yield u;
      }
    }
  }

  // Random addition of taxa, then interchanges while they shorten the tree.
  function randomTree(n, rnd) {
    const nodes = [];
    const leaves = [];
    for (let i = 0; i < n; i++) leaves.push(node(nodes, i));
    const order = leaves.map((x) => x.id).sort(() => rnd() - 0.5);
    const r = node(nodes);
    r.children = [order[0], order[1]];
    nodes[order[0]].parent = r.id; nodes[order[1]].parent = r.id;
    for (let k = 2; k < order.length; k++) {
      const edges = nodes.filter((v) => v.parent >= 0 && v.id !== order[k]);
      const at = edges[Math.floor(rnd() * edges.length)];
      const p = nodes[at.parent];
      const u = node(nodes);
      p.children = p.children.map((c) => (c === at.id ? u.id : c)); u.parent = p.id;
      u.children = [at.id, order[k]]; at.parent = u.id; nodes[order[k]].parent = u.id;
    }
    return { nodes, root: r.id };
  }

  /* The shortest trees found: from the NJ tree and from a few random starts, by interchanges.
     -> {tree, length, per, ci, ri, starts} */
  S.parsimony = function (m, opts) {
    const o = Object.assign({ starts: 5, seed: 7 }, opts);
    const bits = bitsOf(m);
    const rnd = S.random(o.seed);
    const climb = (t) => {
      let best = t, len = S.fitch(t, m, bits).total;
      for (let better = true; better;) {
        better = false;
        for (const u of nni(best)) { const l = S.fitch(u, m, bits).total; if (l < len) { best = u; len = l; better = true; break; } }
      }
      return { tree: best, len };
    };
    const tries = [climb(S.nj(S.distances(m)))];
    for (let s = 0; s < o.starts; s++) tries.push(climb(randomTree(m.taxa.length, rnd)));
    tries.sort((a, b) => a.len - b.len);
    const best = tries[0];
    const f = S.fitch(best.tree, m, bits);
    const fit = S.fit(m, f.per);
    return Object.assign({ tree: best.tree, length: f.total, per: f.per, starts: tries.length, lengths: tries.map((x) => x.len) }, fit);
  };

  // Consistency and retention index, from the steps each character takes.
  S.fit = function (m, per) {
    let min = 0, max = 0, len = 0;
    m.chars.forEach((c, k) => {
      const cnt = new Map();
      for (const v of c.cells) if (v >= 0) cnt.set(v, (cnt.get(v) || 0) + 1);
      const states = cnt.size, n = [...cnt.values()].reduce((a, b) => a + b, 0), top = Math.max(...cnt.values());
      min += states - 1; max += n - top; len += per[k];
    });
    return { ci: len ? min / len : 1, ri: max > min ? (max - len) / (max - min) : 1, min, max };
  };

  /* Which witness most makes the tree disagree with the variants? Each is left out in turn and the rest
     analysed again. A witness whose absence cuts the extra steps most is a candidate for contamination. */
  S.dropOne = function (m, opts) {
    const base = S.parsimony(m, opts);
    const extra = base.length - base.min;
    return m.taxa.map((x, t) => {
      const keep = m.taxa.map((_, i) => i).filter((i) => i !== t);
      const sub = { taxa: keep.map((i) => m.taxa[i]), chars: m.chars.map((c) => Object.assign({}, c, { cells: keep.map((i) => c.cells[i]) })).filter((c) => new Set(c.cells.filter((v) => v >= 0)).size > 1) };
      if (sub.taxa.length < 3) return { siglum: x, extraWithout: null, ciWithout: null };
      const r = S.parsimony(sub, opts);
      return { siglum: x, extraWithout: r.length - r.min, ciWithout: r.ci, extra };
    }).sort((a, b) => (a.extraWithout === null) - (b.extraWithout === null) || a.extraWithout - b.extraWithout);
  };

  /* ---------- the editor's stemma ---------- */

  /* A stemma written in DOT: digraph { ω -> α; α -> A; α -> B; ω -> C; B -> D [style=dashed] }. Names that are
     not sigla are hypothetical witnesses. A dashed edge is contamination: it is drawn, but the tree used for
     reconstruction follows the solid edges. -> {nodes: [{name, extant}], edges: [{from, to, contamination}], errors} */
  S.parseDot = function (text, sigla) {
    const errors = [];
    const body = String(text || '').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const inner = (body.match(/\{([\s\S]*)\}/) || [null, body])[1];
    const names = new Set();
    const edges = [];
    for (const raw of inner.split(/[;\n]/)) {
      const stmt = raw.trim();
      if (!stmt || /^(graph|node|edge)\s*\[/.test(stmt) || /^rankdir/.test(stmt)) continue;
      const attrs = (stmt.match(/\[([^\]]*)\]/) || [null, ''])[1];
      const path = stmt.replace(/\[[^\]]*\]/, '').split('->').map((x) => x.trim().replace(/^"|"$/g, ''));
      if (path.some((x) => !x)) { errors.push('Not understood: ' + stmt); continue; }
      path.forEach((x) => names.add(x));
      for (let i = 0; i + 1 < path.length; i++) edges.push({ from: path[i], to: path[i + 1], contamination: /dashed|dotted|contamination/.test(attrs) });
    }
    const nodes = [...names].map((name) => ({ name, extant: sigla.includes(name) }));
    // a solid edge gives each witness one exemplar
    const parents = new Map();
    for (const e of edges) if (!e.contamination) { if (parents.has(e.to)) errors.push(e.to + ' has two exemplars by solid lines; make one of them dashed (contamination)'); parents.set(e.to, e.from); }
    const roots = nodes.filter((x) => !parents.has(x.name));
    if (nodes.length && roots.length !== 1) errors.push(roots.length ? 'More than one top of the stemma: ' + roots.map((x) => x.name).join(', ') : 'The solid lines go round in a circle');
    for (const x of sigla) if (nodes.length && !names.has(x)) errors.push(x + ' is not in the stemma');
    return { nodes, edges, errors, root: roots.length === 1 ? roots[0].name : null };
  };

  S.writeDot = function (stemma) {
    return 'digraph stemma {\n' + stemma.edges.map((e) => '  "' + e.from + '" -> "' + e.to + '"' + (e.contamination ? ' [style=dashed]' : '') + ';').join('\n') + '\n}\n';
  };

  // The DOT of a computed tree, rooted at its midpoint, with hypothetical nodes numbered.
  S.treeDot = function (t, taxa) {
    const name = (v) => (v.taxon >= 0 ? taxa[v.taxon] : 'h' + v.id);
    const lines = [];
    for (const v of t.nodes) if (v.parent >= 0 && !v.dead) lines.push('  "' + name(t.nodes[v.parent]) + '" -> "' + name(v) + '";');
    return 'digraph tree {\n' + lines.join('\n') + '\n}\n';
  };

  /* Reconstruction on the editor's stemma: for each character, the states the hypothetical witnesses can have at
     least cost (Sankoff, one step per change), extant witnesses fixed to their readings. Any extant witness may
     stand inside the stemma, as the exemplar of others. -> {per: [{ref, root: [states], steps, nodes: {name: [states]}}], length} */
  S.reconstruct = function (m, stemma) {
    const kids = new Map(stemma.nodes.map((x) => [x.name, []]));
    for (const e of stemma.edges) if (!e.contamination) kids.get(e.from).push(e.to);
    const order = [];
    const seen = new Set();
    const visit = (x) => { if (seen.has(x)) return; seen.add(x); for (const c of kids.get(x) || []) visit(c); order.push(x); };
    if (stemma.root) visit(stemma.root);
    const per = [];
    let total = 0;
    for (const c of m.chars) {
      const k = c.states.length;
      const cost = new Map();
      for (const x of order) {
        const t = m.taxa.indexOf(x);
        const own = t >= 0 ? c.cells[t] : -1;
        const row = new Array(k).fill(0);
        for (let s = 0; s < k; s++) {
          if (own >= 0 && s !== own) { row[s] = Infinity; continue; }
          for (const ch of kids.get(x)) { const cr = cost.get(ch); let best = Infinity; for (let u = 0; u < k; u++) best = Math.min(best, cr[u] + (u === s ? 0 : 1)); row[s] += best; }
        }
        cost.set(x, row);
      }
      const rootRow = cost.get(stemma.root) || new Array(k).fill(0);
      const steps = Math.min(...rootRow);
      total += steps;
      // which states each node can take on some cheapest history, going down from the top
      const can = new Map();
      const down = (x, allowed) => {
        const row = cost.get(x);
        can.set(x, allowed);
        for (const ch of kids.get(x)) {
          const cr = cost.get(ch);
          const ok = new Set();
          for (const s of allowed) { let best = Infinity; for (let u = 0; u < k; u++) best = Math.min(best, cr[u] + (u === s ? 0 : 1)); for (let u = 0; u < k; u++) if (cr[u] + (u === s ? 0 : 1) === best) ok.add(u); }
          down(ch, [...ok]);
        }
        return row;
      };
      if (stemma.root) down(stemma.root, rootRow.map((v, s) => (v === steps ? s : -1)).filter((s) => s >= 0));
      const nodes = {};
      for (const [x, states] of can) if (m.taxa.indexOf(x) < 0) nodes[x] = states.map((s) => c.states[s]);
      per.push({ ref: c.ref, unit: c.unit, fromId: c.fromId, label: c.label, root: (can.get(stemma.root) || []).map((s) => c.states[s]), steps, min: new Set(c.cells.filter((v) => v >= 0)).size - 1, nodes });
    }
    return { per, length: total };
  };

  /* Variants that do not fit a stemma: more changes than the number of readings demands. They point to
     contamination, coincidence, or a stemma to be redrawn. -> [{ref, extra, groups: [{text, wits}]}] */
  S.conflicts = function (m, rec) {
    return rec.per.map((r, k) => ({ r, c: m.chars[k] })).filter(({ r }) => r.steps > r.min).map(({ r, c }) => ({
      ref: r.ref, unit: r.unit, fromId: r.fromId, label: r.label, extra: r.steps - r.min,
      groups: c.states.map((text, s) => ({ text, wits: m.taxa.filter((_, t) => c.cells[t] === s) })).filter((g) => g.wits.length),
    })).sort((a, b) => b.extra - a.extra);
  };

  // The computed tree as a stemma, to start from: rooted at its midpoint, hypothetical nodes named h1, h2…
  S.stemmaFromTree = function (t, taxa) {
    let k = 0;
    const names = new Map();
    const nameOf = (v) => { if (v.taxon >= 0) return taxa[v.taxon]; if (!names.has(v.id)) names.set(v.id, v.id === t.root ? 'ω' : 'h' + (++k)); return names.get(v.id); };
    const edges = [];
    for (const v of t.nodes) if (v.parent >= 0 && !v.dead) edges.push({ from: nameOf(t.nodes[v.parent]), to: nameOf(v), contamination: false });
    return S.writeDot({ edges });
  };

  /* ---------- export ---------- */

  const SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  /* NEXUS for PAUP*, SplitsTree and others. Characters with more readings than the 32 symbols allowed are
     left out and listed. -> {text, dropped} */
  S.nexus = function (m, meta) {
    const keep = m.chars.filter((c) => c.states.length <= SYMBOLS.length);
    const dropped = m.chars.filter((c) => c.states.length > SYMBOLS.length).map((c) => c.ref);
    const name = (x) => "'" + String(x).replace(/'/g, "''") + "'";
    const rows = m.taxa.map((x, t) => '  ' + name(x) + ' ' + keep.map((c) => (c.cells[t] < 0 ? '?' : SYMBOLS[c.cells[t]])).join(''));
    const labels = keep.map((c, i) => '    ' + (i + 1) + ' ' + name(c.ref) + ' / ' + c.states.map((s) => name(s || 'om.')).join(' ')).join(',\n');
    const text = '#NEXUS\n[' + String((meta && meta.citation) || '').replace(/[[\]]/g, '') + ']\n'
      + 'BEGIN TAXA;\n  DIMENSIONS NTAX=' + m.taxa.length + ';\n  TAXLABELS ' + m.taxa.map(name).join(' ') + ';\nEND;\n'
      + 'BEGIN CHARACTERS;\n  DIMENSIONS NCHAR=' + keep.length + ';\n  FORMAT DATATYPE=STANDARD MISSING=? GAP=- SYMBOLS="' + SYMBOLS.split('').join(' ') + '";\n'
      + '  CHARSTATELABELS\n' + labels + ';\n  MATRIX\n' + rows.join('\n') + '\n  ;\nEND;\n';
    return { text, dropped };
  };

  /* ---------- NeighborNet ---------- */

  /* A circular order of the witnesses, by the agglomeration of NeighborNet (Bryant and Moulton 2004), as in
     SplitsTree, which is GPL-3.0: clusters of one or two nodes are joined, and three nodes are reduced to two,
     the reductions being undone at the end to give the order. D: square distances, null where unknown.
     -> [taxon indices] */
  S.circularOrder = function (D0) {
    const ntax = D0.length;
    if (ntax <= 3) return Array.from({ length: ntax }, (_, i) => i);
    let max = 0;
    for (const row of D0) for (const v of row) if (v !== null && v > max) max = v;
    const size = 3 * ntax + 4;
    const D = Array.from({ length: size }, () => new Float64Array(size));
    for (let i = 0; i < ntax; i++) for (let j = 0; j < ntax; j++) D[i + 1][j + 1] = i === j ? 0 : D0[i][j] === null ? max : D0[i][j];
    const mk = (id) => ({ id, nbr: null, ch1: null, ch2: null, next: null, prev: null, Sx: 0, Rx: 0 });
    const head = mk(0);
    for (let i = ntax; i >= 1; i--) { const t = mk(i); t.next = head.next; head.next = t; }
    for (let t = head; t.next; t = t.next) t.next.prev = t;
    const amalgs = [];
    let numNodes = ntax;
    const cd = (p, q) => {
      if (!p.nbr && !q.nbr) return D[p.id][q.id];
      if (p.nbr && !q.nbr) return (D[p.id][q.id] + D[p.nbr.id][q.id]) / 2;
      if (!p.nbr && q.nbr) return (D[p.id][q.id] + D[p.id][q.nbr.id]) / 2;
      return (D[p.id][q.id] + D[p.id][q.nbr.id] + D[p.nbr.id][q.id] + D[p.nbr.id][q.nbr.id]) / 4;
    };
    const agg3 = (x, y, z) => {
      const u = mk(numNodes + 1), v = mk(numNodes + 2);
      u.ch1 = x; u.ch2 = y; v.ch1 = y; v.ch2 = z;
      u.next = x.next; u.prev = x.prev; if (u.next) u.next.prev = u; if (u.prev) u.prev.next = u;
      v.next = z.next; v.prev = z.prev; if (v.next) v.next.prev = v; if (v.prev) v.prev.next = v;
      if (y.next) y.next.prev = y.prev; if (y.prev) y.prev.next = y.next;
      u.nbr = v; v.nbr = u;
      for (let p = head.next; p; p = p.next) {
        D[u.id][p.id] = D[p.id][u.id] = (2 / 3) * D[x.id][p.id] + D[y.id][p.id] / 3;
        D[v.id][p.id] = D[p.id][v.id] = (2 / 3) * D[z.id][p.id] + D[y.id][p.id] / 3;
      }
      D[u.id][u.id] = D[v.id][v.id] = 0;
      amalgs.push(u);
      numNodes += 2;
      return u;
    };
    const rx = (z, Cx, Cy) => {
      let r = 0;
      for (let p = head.next; p; p = p.next) {
        if (p === Cx || p === Cx.nbr || p === Cy || p === Cy.nbr || !p.nbr) r += D[z.id][p.id];
        else r += D[z.id][p.id] / 2;
      }
      return r;
    };
    let active = ntax, clusters = ntax;
    while (active > 3) {
      if (active === 4 && clusters === 2) {
        const p = head.next;
        const q = p.next !== p.nbr ? p.next : p.next.next;
        if (D[p.id][q.id] + D[p.nbr.id][q.nbr.id] < D[p.id][q.nbr.id] + D[p.nbr.id][q.id]) agg3(p, q, q.nbr);
        else agg3(p, q.nbr, q);
        break;
      }
      for (let p = head.next; p; p = p.next) p.Sx = 0;
      for (let p = head.next; p; p = p.next) {
        if (p.nbr && p.nbr.id < p.id) continue;
        for (let q = p.next; q; q = q.next) {
          if (q.nbr && (q.nbr.id < q.id || q.nbr === p)) continue;
          const d = cd(p, q);
          p.Sx += d; if (p.nbr) p.nbr.Sx += d;
          q.Sx += d; if (q.nbr) q.nbr.Sx += d;
        }
      }
      let Cx = null, Cy = null, best = 0;
      for (let p = head.next; p; p = p.next) {
        if (p.nbr && p.nbr.id < p.id) continue;
        for (let q = head.next; q !== p; q = q.next) {
          if (q.nbr && q.nbr.id < q.id) continue;
          if (q.nbr === p) continue;
          const Q = (clusters - 2) * cd(p, q) - p.Sx - q.Sx;
          if (!Cx || Q < best) { Cx = p; Cy = q; best = Q; }
        }
      }
      let x = Cx, y = Cy;
      if (Cx.nbr || Cy.nbr) {
        Cx.Rx = rx(Cx, Cx, Cy); if (Cx.nbr) Cx.nbr.Rx = rx(Cx.nbr, Cx, Cy);
        Cy.Rx = rx(Cy, Cx, Cy); if (Cy.nbr) Cy.nbr.Rx = rx(Cy.nbr, Cx, Cy);
      }
      let m = clusters;
      if (Cx.nbr) m++;
      if (Cy.nbr) m++;
      best = (m - 2) * D[Cx.id][Cy.id] - Cx.Rx - Cy.Rx;
      if (Cx.nbr) { const Q = (m - 2) * D[Cx.nbr.id][Cy.id] - Cx.nbr.Rx - Cy.Rx; if (Q < best) { x = Cx.nbr; y = Cy; best = Q; } }
      if (Cy.nbr) { const Q = (m - 2) * D[Cx.id][Cy.nbr.id] - Cx.Rx - Cy.nbr.Rx; if (Q < best) { x = Cx; y = Cy.nbr; best = Q; } }
      if (Cx.nbr && Cy.nbr) { const Q = (m - 2) * D[Cx.nbr.id][Cy.nbr.id] - Cx.nbr.Rx - Cy.nbr.Rx; if (Q < best) { x = Cx.nbr; y = Cy.nbr; } }
      if (!x.nbr && !y.nbr) { x.nbr = y; y.nbr = x; clusters--; }
      else if (!x.nbr) { agg3(x, y, y.nbr); active--; clusters--; }
      else if (!y.nbr || active === 4) { agg3(y, x, x.nbr); active--; clusters--; }
      else { const x2 = x.nbr, y2 = y.nbr; const u = agg3(x2, x, y); agg3(u, u.nbr, y2); active -= 2; clusters--; }
    }
    // undo the reductions
    let x = head.next;
    const y0 = x.next, z0 = y0.next;
    z0.next = x; x.prev = z0;
    while (amalgs.length) {
      let u = amalgs.pop();
      let a = u.ch1;
      const b = u.ch2;
      let v = u.nbr;
      let c = v.ch2;
      if (v !== u.next) { const t = u; u = v; v = t; const t2 = a; a = c; c = t2; }
      a.prev = u.prev; a.prev.next = a; a.next = b;
      b.prev = a; b.next = c;
      c.prev = b; c.next = v.next; c.next.prev = c;
      x = a;
    }
    while (x.id !== 1) x = x.next;
    const order = [];
    let t = x;
    do { order.push(t.id - 1); t = t.next; } while (t !== x && order.length <= ntax);
    return order;
  };

  /* Weights for every split that is circular for the order, by least squares with no weight below zero, solved by
     accelerated projected gradient with the sums of a split system taken in O(n²) from prefix sums.
     -> {order, splits: [{side: [taxa], weight}], fit} */
  S.neighbornet = function (D0, opts) {
    const n = D0.length;
    const order = S.circularOrder(D0);
    if (n < 3) return { order, splits: [], fit: 1 };
    let maxD = 0;
    for (const row of D0) for (const v of row) if (v !== null && v > maxD) maxD = v;
    const d = Array.from({ length: n }, (_, a) => Float64Array.from({ length: n }, (__, b) => { const v = D0[order[a]][order[b]]; return a === b ? 0 : v === null ? maxD : v; }));
    // W[s][e], 1 <= s <= e <= n-1: the split whose side is positions s..e
    const W = Array.from({ length: n }, () => new Float64Array(n));
    const P = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
    const rect = (s1, s2, e1, e2) => (s1 > s2 || e1 > e2 ? 0 : P[s2 + 1][e2 + 1] - P[s1][e2 + 1] - P[s2 + 1][e1] + P[s1][e1]);
    const forward = (w, out) => {
      for (let s = 0; s < n; s++) for (let e = 0; e < n; e++) P[s + 1][e + 1] = w[s][e] + P[s][e + 1] + P[s + 1][e] - P[s][e];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const v = rect(1, a, a, b - 1) + rect(a + 1, b, b, n - 1); out[a][b] = out[b][a] = v; }
    };
    const Q = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
    const RS = new Float64Array(n + 1);
    const adjoint = (r, g) => {
      for (let a = 0; a < n; a++) { let rs = 0; for (let b = 0; b < n; b++) rs += r[a][b]; RS[a + 1] = RS[a] + rs; }
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) Q[a + 1][b + 1] = r[a][b] + Q[a][b + 1] + Q[a + 1][b] - Q[a][b];
      for (let s = 1; s < n; s++) for (let e = s; e < n; e++) g[s][e] = RS[e + 1] - RS[s] - (Q[e + 1][e + 1] - Q[s][e + 1] - Q[e + 1][s] + Q[s][s]);
    };
    const mat = () => Array.from({ length: n }, () => new Float64Array(n));
    const fit = mat(), res = mat(), grad = mat();
    // the largest eigenvalue of AᵀA, by power iteration, for the step
    const v = mat();
    for (let s = 1; s < n; s++) for (let e = s; e < n; e++) v[s][e] = 1;
    let L = 1;
    for (let it = 0; it < 40; it++) {
      forward(v, fit); adjoint(fit, grad);
      let norm = 0;
      for (let s = 1; s < n; s++) for (let e = s; e < n; e++) norm += grad[s][e] * grad[s][e];
      norm = Math.sqrt(norm) || 1;
      L = norm;
      for (let s = 1; s < n; s++) for (let e = s; e < n; e++) v[s][e] = grad[s][e] / norm;
    }
    // L is the norm of AᵀA v for unit v: near the largest eigenvalue
    const step = 1 / (L * 1.05);
    const y = mat(), prev = mat();
    let t = 1;
    const iters = (opts && opts.iterations) || 4000;
    let sse = 0, sst = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) sst += d[a][b] * d[a][b];
    for (let it = 0; it < iters; it++) {
      forward(y, fit);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) res[a][b] = a === b ? 0 : fit[a][b] - d[a][b];
      adjoint(res, grad);
      let change = 0;
      for (let s = 1; s < n; s++) for (let e = s; e < n; e++) { prev[s][e] = W[s][e]; W[s][e] = Math.max(0, y[s][e] - step * grad[s][e]); change = Math.max(change, Math.abs(W[s][e] - prev[s][e])); }
      const t2 = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
      for (let s = 1; s < n; s++) for (let e = s; e < n; e++) y[s][e] = W[s][e] + ((t - 1) / t2) * (W[s][e] - prev[s][e]);
      t = t2;
      if (change < 1e-10 && it > 50) break;
    }
    forward(W, fit);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) sse += (fit[a][b] - d[a][b]) ** 2;
    let wmax = 0;
    for (let s = 1; s < n; s++) for (let e = s; e < n; e++) wmax = Math.max(wmax, W[s][e]);
    const splits = [];
    for (let s = 1; s < n; s++) for (let e = s; e < n; e++) if (W[s][e] > wmax * 1e-6) splits.push({ s, e, side: order.slice(s, e + 1), weight: W[s][e] });
    return { order, splits, fit: sst ? 1 - sse / sst : 1 };
  };

  /* A drawing of the splits as an outline (after Bagci, Bryant and Huson 2021): each split is a pair of parallel
     edges, as long as its weight, pointing towards the middle of its side; the first witness of the order sits at the
     origin and the outline passes every witness in order. -> {path: [[x, y, split]], at: [[x, y] per position]} */
  S.outline = function (nn) {
    const n = nn.order.length;
    const vec = (sp) => { const th = Math.PI * (sp.s + sp.e) / n; return [sp.weight * Math.cos(th), sp.weight * Math.sin(th)]; };
    let x = 0, y = 0;
    const path = [[0, 0, null]];
    const at = [[0, 0]];
    for (let k = 0; k < n; k++) {
      const phi = 2 * Math.PI * k / n;
      const steps = [];
      for (const sp of nn.splits) {
        const [vx, vy] = vec(sp);
        if (sp.s === k + 1) steps.push({ sp, dx: vx, dy: vy });
        if (sp.e === k) steps.push({ sp, dx: -vx, dy: -vy });
      }
      const rel = (st) => { let a = Math.atan2(st.dy, st.dx) - phi; while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a; };
      steps.sort((a, b) => rel(a) - rel(b));
      for (const st of steps) { x += st.dx; y += st.dy; path.push([x, y, st.sp]); }
      if (k + 1 < n) at.push([x, y]);
    }
    return { path, at };
  };

  /* ---------- coherence ---------- */

  /* Pre-genealogical coherence, as in the Coherence-Based Genealogical Method: for each witness, every other one
     with the share of places where they agree. With it, a simple genealogical coherence in which the reading of the
     edited text is taken as the source of the others at each place (A, the initial text, among the witnesses): a
     witness is a potential ancestor of another if it has the earlier reading more often than the later.
     -> {names, rows: [[{witness, eq, pass, perc, prior, posterior, norel, ancestor, rank}]]} */
  S.coherence = function (m) {
    const n = m.taxa.length;
    const names = m.taxa.concat('A');
    const read = (c, t) => (t === n ? c.initial : c.cells[t]);
    const rows = names.map((_, w) => {
      const out = [];
      for (let x = 0; x <= n; x++) {
        if (x === w) continue;
        let eq = 0, pass = 0, prior = 0, posterior = 0, norel = 0;
        for (const c of m.chars) {
          const a = read(c, w), b = read(c, x);
          if (a < 0 || b < 0) continue;
          pass++;
          if (a === b) { eq++; continue; }
          if (c.initial < 0) norel++;
          else if (b === c.initial) prior++; // the other has the earlier reading
          else if (a === c.initial) posterior++;
          else norel++;
        }
        out.push({ witness: names[x], eq, pass, perc: pass ? eq / pass : null, prior, posterior, norel, ancestor: prior > posterior });
      }
      out.sort((p, q) => (q.perc === null ? -1 : q.perc) - (p.perc === null ? -1 : p.perc));
      let r = 0;
      for (const o of out) if (o.ancestor) o.rank = ++r;
      return out;
    });
    return { names, rows };
  };

  ME.Stemma = S;
})(window.ME);
