// Collation algorithms, benchmarked: each lines up the same witnesses, made here with the true place of every word
// known, and is timed and scored. A benchmark, not a test: run.js does not run it.
//
//   node tests/bench-collate.js [quick|full] [engines, comma-separated]
//   CX_PYTHON=/path/to/python-with-collatex node tests/bench-collate.js      (CollateX too, through Python)
//
// The witnesses: an archetype of words drawn as in prose (a few words very common), copied down a stemma, each copy
// changing about 3 in 100 words (a spelling, another word, an omission, an addition), sometimes moving a short
// passage, now and then losing a long one, as damaged manuscripts do; "divergent" triples every rate. Each word keeps
// the place it came from, so the truth is known.
// The score: for every pair of witnesses, the pairs of words a method puts in one place, against the true pairs:
// precision (how many it put together belong together), recall (how many that belong together it put together), F1.
// A method that lines up letters is scored by the words its letters join, so words and letters are scored alike.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

// ---------- the witnesses ----------
function generate(N, L, seed, rate) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const syl = 'ka kā ki ku kr̥ ga gu ca ja ta tā ti tu da dā di du dha na nā ni nu pa pā pu ba bu bha bhā ma mā mi mu ya yā yu ra rā ri ru la va vā vi śa śā śi ṣa sa sā si su ha hā hi'.split(' ');
  const mkWord = () => { const n = 1 + Math.floor(rnd() * 4) + (rnd() < 0.4 ? 1 : 0); let w = ''; for (let i = 0; i < n; i++) w += syl[Math.floor(rnd() * syl.length)]; return w; };
  const V = Math.max(200, Math.floor(L * 0.45));
  const vocab = Array.from({ length: V }, mkWord);
  const draw = () => vocab[Math.floor(V * Math.pow(rnd(), 3))];
  const mutate = (w) => { const c = [...w]; const i = Math.floor(rnd() * c.length); const r = rnd(); if (r < 0.5) c[i] = syl[Math.floor(rnd() * syl.length)]; else if (r < 0.75) c.splice(i, 1); else c.splice(i, 0, c[i]); return c.join('') || w; };
  let nextCol = 0;
  const arche = Array.from({ length: L }, () => ({ t: draw(), c: nextCol++ }));
  const k = rate || 1;
  const copy = (src) => {
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const r = rnd();
      if (r < 0.015 * k) out.push({ t: mutate(src[i].t), c: src[i].c });
      else if (r < 0.022 * k) out.push({ t: draw(), c: src[i].c });
      else if (r < 0.027 * k) { const n = 1 + Math.floor(-Math.log(rnd()) * 2); i += n - 1; }
      else if (r < 0.030 * k) { const n = 1 + Math.floor(-Math.log(rnd()) * 2); out.push(src[i]); for (let m = 0; m < n; m++) out.push({ t: draw(), c: nextCol++ }); }
      else out.push(src[i]);
    }
    if (rnd() < 0.5 && out.length > 40) { const a = Math.floor(rnd() * (out.length - 30)); const n = 2 + Math.floor(rnd() * 6); const seg = out.splice(a, n); out.splice(Math.min(out.length, a + 5 + Math.floor(rnd() * 20)), 0, ...seg); }
    if (rnd() < 0.08 * k && out.length > 100) { const a = Math.floor(rnd() * (out.length - 60)); out.splice(a, Math.floor(out.length * 0.03 * (1 + rnd()))); }
    return out;
  };
  const wits = [arche];
  while (wits.length < N) wits.push(copy(wits[Math.floor(rnd() * wits.length)]));
  wits.shift();
  wits.push(copy(arche));
  return wits.slice(0, N).map((w, i) => ({ siglum: 'W' + (i + 1), words: w.map((x) => ({ t: x.t, key: 'c' + x.c, scope: null })) }));
}

// a witness as tokens: its words, or its letters (each letter remembers its word)
function tokens(wit, kind) {
  if (kind === 'word') return { t: wit.words.map((x) => x.t), word: wit.words.map((_, i) => i) };
  const t = [], word = [];
  wit.words.forEach((x, i) => { for (const ch of x.t.normalize('NFC')) { t.push(ch); word.push(i); } });
  return { t, word };
}

// ---------- the score ----------
function score(wits, toks, cols) {
  let tp = 0, pp = 0, tt = 0;
  for (let a = 0; a < wits.length; a++) for (let b = a + 1; b < wits.length; b++) {
    // the words of a and b that a method put together
    const byCol = new Map();
    cols[a].forEach((c, i) => { if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(toks[a].word[i]); });
    const pred = new Set();
    cols[b].forEach((c, j) => { const wa = byCol.get(c); if (wa) for (const x of wa) pred.add(x + ':' + toks[b].word[j]); });
    // and those that belong together (the same key); a pair within one place whose readings differ in length counts
    // neither way (the same scope, another key)
    const truthA = new Map();
    wits[a].words.forEach((w, i) => { if (w.key) truthA.set(w.key, i); });
    let truth = 0;
    wits[b].words.forEach((w, j) => { const i = truthA.get(w.key); if (i !== undefined) { truth++; if (pred.has(i + ':' + j)) tp++; } });
    let counted = 0;
    for (const p of pred) { const [i, j] = p.split(':').map(Number); const x = wits[a].words[i], y = wits[b].words[j]; if (x.key === y.key || !(x.scope && x.scope === y.scope)) counted++; }
    tt += truth; pp += counted;
  }
  const P = pp ? tp / pp : 0, R = tt ? tp / tt : 0;
  return { precision: P, recall: R, f1: P + R ? (2 * P * R) / (P + R) : 0 };
}

// ---------- the engines: (seqs: [[token]]) -> cols: [[column of each token]] ----------
const ENGINES = {};

// Saktumiva 2.0 (Charles Li), as Manuscribe runs it: progressive, a guide tree of n-gram distances, affine gaps
let Sak = null;
function saktumiva(seqs, depth) {
  if (!Sak) {
    global.window = { ME: {} };
    global.ME = global.window.ME;
    // eslint-disable-next-line no-eval
    (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'app', 'vendor', 'saktumiva-aligner.js'), 'utf8'));
    const g = {};
    global.window.ME.collateEngineSource(g);
    Sak = g.CollateEngine;
  }
  const scoring = { match: 1, mismatch: -1, gap_open: -2, gap_extend: -0.25, gap_skip_initial: true, scalegap: false, recursive: false, realigndepth: depth, distancefunc: 'ngrams', ngramsize: 3 };
  const ma = new Sak.MultiAligner('arr_simple', scoring);
  const res = ma.align(seqs.map((s, i) => ({ siglum: 'W' + i, text: s })));
  const out = [];
  res.sigla.forEach((sig, r) => { const row = res.alignment[r], at = []; for (let c = 0; c < row.length; c++) if (row[c] !== '') at.push(c); out[+sig.slice(1)] = at; });
  return out;
}
/* Manuscribe as it collates: Saktumiva, then its own pass that closes the gaps an aligner leaves inside a word
   (kr-----at-----u), taken from app/js/collate.js as it is */
let closeGaps = null;
function manuscribe(seqs) {
  if (!closeGaps) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'collate.js'), 'utf8');
    const at = src.indexOf('function closeGaps(');
    let i = src.indexOf('{', at), depth = 0;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    closeGaps = new Function('return (' + src.slice(at, i + 1) + ')')();
  }
  const cols = saktumiva(seqs, 0);
  const labels = seqs.map((_, i) => 'W' + i), tokens = {}, byLabel = {};
  seqs.forEach((s, i) => { tokens['W' + i] = s; byLabel['W' + i] = cols[i]; });
  const ncols = Math.max(0, ...cols.map((c) => (c.length ? c[c.length - 1] + 1 : 0)));
  const closed = closeGaps(labels, tokens, byLabel, ncols, '‡');
  return labels.map((l) => closed.cols[l]);
}
ENGINES['manuscribe'] = { name: 'Manuscribe today: Saktumiva, then its pass that closes gaps inside words', run: (s) => manuscribe(s) };
ENGINES['saktumiva'] = { name: 'Progressive alignment, guide tree (Saktumiva 2.0, as Manuscribe runs it)', run: (s) => saktumiva(s, 0) };
ENGINES['saktumiva-refine'] = { name: 'The same, with iterative refinement (Saktumiva, realign depth 20)', run: (s) => saktumiva(s, 20) };

/* The engines of app/js/engines.js, as the app runs them */
let App = null;
function appEngine(id, seqs, close) {
  if (!App) { global.window = global.window || { ME: {} }; global.ME = global.window.ME; (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'engines.js'), 'utf8')); const g = {}; global.window.ME.alignEngineSource(g); App = g.AlignEngines; }
  const states = seqs.map((n, i) => ({ label: 'W' + i, n }));
  const r = App[id].align(states, null, {});
  if (!close) return states.map((s) => r.cols[s.label]);
  if (!closeGaps) manuscribe([['a'], ['a']]);
  const tokens = {}; states.forEach((s) => { tokens[s.label] = s.n; });
  const closed = closeGaps(r.order, tokens, r.cols, r.ncols, '‡');
  return states.map((s) => closed.cols[s.label]);
}
ENGINES['app-poa'] = { name: 'Careful, all witnesses together (as the app runs it, closing gaps)', run: (s) => appEngine('poa', s, true) };
ENGINES['app-poa-raw'] = { name: 'The same, without the pass that closes gaps', run: (s) => appEngine('poa', s, false) };
ENGINES['app-base'] = { name: 'Against a base text (as the app runs it, closing gaps; the first witness the base)', run: (s) => appEngine('base', s, true) };
ENGINES['app-base-raw'] = { name: 'The same, without the pass that closes gaps', run: (s) => appEngine('base', s, false) };

// Partial-order alignment (Lee, Grasso and Sharlow 2002): each witness aligned to the graph of those before it
function poa(seqs, BAND) {
  const ids = new Map();
  const enc = (t) => { let i = ids.get(t); if (i === undefined) { i = ids.size; ids.set(t, i); } return i; };
  const S = seqs.map((w) => Int32Array.from(w, enc));
  const MATCH = 4, MIS = -4, GO = -6, GE = -1, NEG = -1e9 | 0;
  let cap = 1 << 12, tok = new Int32Array(cap), ring = new Int32Array(cap), n = 0;
  const preds = [], succs = [], paths = [];
  const addNode = (t) => { if (n === cap) { cap *= 2; const a = new Int32Array(cap); a.set(tok); tok = a; const b = new Int32Array(cap); b.set(ring); ring = b; } tok[n] = t; ring[n] = n; preds.push([]); succs.push([]); return n++; };
  const addEdge = (a, b) => { if (!succs[a].includes(b)) { succs[a].push(b); preds[b].push(a); } };
  const topo = () => { const ind = new Int32Array(n); for (let i = 0; i < n; i++) ind[i] = preds[i].length; const q = new Int32Array(n); let h = 0, e = 0; for (let i = 0; i < n; i++) if (!ind[i]) q[e++] = i; while (h < e) { const v = q[h++]; for (const x of succs[v]) if (--ind[x] === 0) q[e++] = x; } return q.subarray(0, e); };
  let H = new Int32Array(0), E = new Int32Array(0), F = new Int32Array(0);
  for (const w of S) {
    const L = w.length;
    if (n === 0) { let p = -1; const path = []; for (let i = 0; i < L; i++) { const v = addNode(w[i]); if (p >= 0) addEdge(p, v); p = v; path.push(v); } paths.push(path); continue; }
    const order = topo(), pos = new Int32Array(n);
    for (let i = 0; i < order.length; i++) pos[order[i]] = i + 1;
    const V = order.length, lo = new Int32Array(V + 1), hi = new Int32Array(V + 1), off = new Int32Array(V + 2), best = new Int32Array(V + 1);
    const W = BAND ? 2 * BAND + 1 : L + 1, need = (V + 1) * W;
    if (H.length < need) { H = new Int32Array(need); E = new Int32Array(need); F = new Int32Array(need); }
    lo[0] = 0; hi[0] = BAND ? Math.min(L, BAND) : L;
    for (let j = 0; j <= hi[0]; j++) { H[j] = j ? GO + GE * j : 0; E[j] = NEG; F[j] = NEG; }
    for (let r = 1; r <= V; r++) {
      const v = order[r - 1], pr = preds[v].length ? preds[v].map((p) => pos[p]) : [0];
      let c = 0; for (const q of pr) if (best[q] + 1 > c) c = best[q] + 1;
      const l = BAND ? Math.max(0, c - BAND) : 0, h = BAND ? Math.min(L, c + BAND) : L;
      lo[r] = l; hi[r] = h; const o = off[r] = r * W - l;
      let bj = l, bs = NEG, fPrev = NEG, hPrev = NEG;
      for (let j = l; j <= h; j++) {
        let bd = NEG, be = NEG;
        for (const q of pr) {
          if (j >= lo[q] && j <= hi[q]) { const a = H[off[q] + j] + GO + GE, b = E[off[q] + j] + GE; const m = a > b ? a : b; if (m > be) be = m; }
          if (j - 1 >= lo[q] && j - 1 <= hi[q]) { const d = H[off[q] + j - 1]; if (d > bd) bd = d; }
        }
        let s = NEG; if (j > 0 && bd > NEG) s = bd + (tok[v] === w[j - 1] ? MATCH : MIS);
        const f = j > l ? Math.max(hPrev + GO + GE, fPrev + GE) : NEG;
        let hh = s; if (be > hh) hh = be; if (f > hh) hh = f;
        H[o + j] = hh; E[o + j] = be; F[o + j] = f; hPrev = hh; fPrev = f;
        if (hh > bs) { bs = hh; bj = j; }
      }
      best[r] = bj;
    }
    let er = -1, es = NEG;
    for (let r = 1; r <= V; r++) { const v = order[r - 1]; if (!succs[v].length && L >= lo[r] && L <= hi[r] && H[off[r] + L] > es) { es = H[off[r] + L]; er = r; } }
    const al = []; let r = er, j = L, st = 0;
    if (er < 0) { r = V; for (let x = L; x > hi[V]; x--) al.push([-1, x - 1]); j = hi[V]; }
    while (r > 0 || j > 0) {
      if (r === 0) { al.push([-1, j - 1]); j--; continue; }
      const v = order[r - 1], o = off[r], pr = preds[v].length ? preds[v].map((p) => pos[p]) : [0];
      if (j < lo[r] || j > hi[r]) { if (j > hi[r]) { al.push([-1, j - 1]); j--; } else { al.push([v, -1]); r = pr[0]; } continue; }
      if (st === 0) {
        const cur = H[o + j];
        if (cur === F[o + j]) { st = 2; continue; }
        if (cur === E[o + j] || j === 0) { st = 1; continue; }
        const sc = tok[v] === w[j - 1] ? MATCH : MIS;
        let q = -1; for (const p of pr) if (j - 1 >= lo[p] && j - 1 <= hi[p] && H[off[p] + j - 1] + sc === cur) { q = p; break; }
        if (q < 0) { let bv = NEG; for (const p of pr) if (j - 1 >= lo[p] && j - 1 <= hi[p] && H[off[p] + j - 1] > bv) { bv = H[off[p] + j - 1]; q = p; } }
        if (q < 0) { al.push([v, -1]); r = pr[0]; continue; }
        al.push([v, j - 1]); r = q; j--;
      } else if (st === 1) {
        const cur = E[o + j]; let q = -1, ns = 0;
        for (const p of pr) { if (j < lo[p] || j > hi[p]) continue; if (H[off[p] + j] + GO + GE === cur) { q = p; ns = 0; break; } if (E[off[p] + j] + GE === cur) { q = p; ns = 1; break; } }
        if (q < 0) { q = pr[0]; ns = 0; }
        al.push([v, -1]); r = q; st = ns;
      } else { const cur = F[o + j]; al.push([-1, j - 1]); st = j - 1 >= lo[r] && H[o + j - 1] + GO + GE === cur ? 0 : 2; j--; }
    }
    al.reverse();
    let prev = -1; const path = [];
    for (const [v, jj] of al) {
      if (jj < 0) continue;
      const t = w[jj]; let node = -1;
      if (v >= 0) { if (tok[v] === t) node = v; else { let x = ring[v]; while (x !== v) { if (tok[x] === t) { node = x; break; } x = ring[x]; } if (node < 0) { node = addNode(t); ring[node] = ring[v]; ring[v] = node; } } } else node = addNode(t);
      if (prev >= 0) addEdge(prev, node);
      prev = node; path.push(node);
    }
    paths.push(path);
  }
  // nodes of one ring are one column; columns ordered by the longest path
  const ringId = new Int32Array(n).fill(-1); let nr = 0;
  for (let i = 0; i < n; i++) if (ringId[i] < 0) { let x = i; do { ringId[x] = nr; x = ring[x]; } while (x !== i); nr++; }
  const rs = Array.from({ length: nr }, () => new Set()), rin = new Int32Array(nr);
  for (let a = 0; a < n; a++) for (const b of succs[a]) { const ra = ringId[a], rb = ringId[b]; if (ra !== rb && !rs[ra].has(rb)) { rs[ra].add(rb); rin[rb]++; } }
  const rank = new Int32Array(nr), q = []; for (let i = 0; i < nr; i++) if (!rin[i]) q.push(i);
  for (let h = 0; h < q.length; h++) { const a = q[h]; for (const b of rs[a]) { if (rank[a] + 1 > rank[b]) rank[b] = rank[a] + 1; if (--rin[b] === 0) q.push(b); } }
  return paths.map((p) => p.map((v) => rank[ringId[v]]));
}
ENGINES['poa'] = { name: 'Partial-order alignment, banded (Lee et al. 2002; band 100 words, 400 letters)', run: (s, kind) => poa(s, kind === 'word' ? 100 : 400) };

/* Star alignment to a base text: each witness aligned on its own to the base (Gotoh: global, affine gaps), and the
   alignments put together by the base's positions. What tools that collate against a base text do. */
function toBase(base, w, mode) {
  const n = base.length, m = w.length;
  if (mode === 'diff') {
    // a diff: the longest common subsequence, exact matches only
    const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = base[i] === w[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
    const pairs = []; let i = 0, j = 0;
    while (i < n && j < m) { if (base[i] === w[j]) { pairs.push([i, j]); i++; j++; } else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++; }
    // between two matches, what is left stands opposite what is left, in order, as a diff shows a change
    const out = new Array(m).fill(null); let pi = -1, pj = -1;
    for (const [a, b] of pairs.concat([[n, m]])) {
      for (let k = 0; k < b - pj - 1; k++) out[pj + 1 + k] = pi + 1 + k < a ? { at: pi + 1 + k } : { after: a - 1, k: k - (a - pi - 1) };
      if (a < n) out[b] = { at: a };
      pi = a; pj = b;
    }
    return out;
  }
  const MATCH = 1, MIS = -1, GO = -2, GE = -0.25, NEG = -1e15;
  const H = Array.from({ length: n + 1 }, () => new Float64Array(m + 1)), E = Array.from({ length: n + 1 }, () => new Float64Array(m + 1)), F = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    if (!i && !j) { H[0][0] = 0; E[0][0] = F[0][0] = NEG; continue; }
    E[i][j] = i ? Math.max(H[i - 1][j] + GO + GE, E[i - 1][j] + GE) : NEG;
    F[i][j] = j ? Math.max(H[i][j - 1] + GO + GE, F[i][j - 1] + GE) : NEG;
    const d = i && j ? H[i - 1][j - 1] + (base[i - 1] === w[j - 1] ? MATCH : MIS) : NEG;
    H[i][j] = Math.max(d, E[i][j], F[i][j]);
  }
  const out = new Array(m).fill(null); let i = n, j = m, st = 0;
  while (i > 0 || j > 0) {
    if (st === 0) {
      if (i && j && H[i][j] === H[i - 1][j - 1] + (base[i - 1] === w[j - 1] ? MATCH : MIS)) { out[j - 1] = { at: i - 1 }; i--; j--; }
      else if (H[i][j] === E[i][j]) st = 1; else st = 2;
    } else if (st === 1) { st = i && E[i][j] === H[i - 1][j] + GO + GE ? 0 : 1; i--; }
    else { out[j - 1] = { after: i - 1 }; st = j && F[i][j] === H[i][j - 1] + GO + GE ? 0 : 2; j--; }
  }
  // number the additions after each base position
  let last = -2, k = 0;
  for (const x of out) if (x.after !== undefined) { if (x.after !== last) { last = x.after; k = 0; } x.k = k++; } else last = -2;
  return out;
}
function star(seqs, mode) {
  const base = seqs[0];
  const maps = seqs.map((w, i) => (i ? toBase(base, w, mode) : w.map((_, j) => ({ at: j }))));
  // columns: before each base position, the additions of every witness (up to the most any has there), then it
  const most = new Int32Array(base.length + 1);
  for (const mp of maps) for (const x of mp) if (x.after !== undefined) most[x.after + 1] = Math.max(most[x.after + 1], x.k + 1);
  const start = new Int32Array(base.length + 2); let c = 0;
  for (let p = 0; p <= base.length; p++) { start[p] = c; c += most[p] + 1; }
  return maps.map((mp) => mp.map((x) => (x.at !== undefined ? start[x.at] + most[x.at] : start[x.after + 1] + x.k)));
}
ENGINES['star'] = { name: 'Star alignment to a base text (Gotoh, affine gaps; as collating against a base text)', run: (s) => star(s, 'nw') };
ENGINES['diff'] = { name: 'Diff against a base text (longest common subsequence; as Juxta and other diff tools)', run: (s) => star(s, 'diff') };

// CollateX 2.3 (Python), Dekker's edit-graph aligner over a variant graph, if a Python with collatex is named
const CX = process.env.CX_PYTHON;
if (CX) ENGINES['collatex'] = {
  name: 'Variant graph, edit-graph aligner (CollateX 2.3, Python)', words: true, slow: true,
  run: (seqs) => {
    const py = 'import sys, json\nfrom collatex import Collation, collate\nd = json.load(sys.stdin)\nc = Collation()\nfor i, w in enumerate(d):\n    c.add_witness({"id": "W%d" % i, "tokens": [{"t": t + " ", "n": t} for t in w]})\nr = json.loads(collate(c, output="json", segmentation=False))\nout = []\nfor row in r["table"]:\n    cols = []\n    for ci, cell in enumerate(row):\n        if cell:\n            for tok in cell: cols.append(ci)\n    out.append(cols)\nprint(json.dumps(out))\n';
    const r = spawnSync(CX, ['-I', '-c', py], { input: JSON.stringify(seqs), encoding: 'utf8', maxBuffer: 256 << 20, timeout: 600000 });
    if (r.status !== 0) throw new Error((r.stderr || '').split('\n').filter(Boolean).pop() || 'CollateX failed');
    return JSON.parse(r.stdout);
  },
};

// ---------- gold: real witnesses aligned by scholars (tests/gold-sets.js) ----------
async function goldRuns(only) {
  const G = require('./gold-sets');
  const sets = [await G.john3(), await G.frankenstein()];
  for (const set of sets) {
    console.log('\n' + set.name + ' (' + set.licence + ')');
    for (const kind of ['word', 'letter']) {
      for (const id of only) {
        const E = ENGINES[id];
        if (!E || (E.words && kind !== 'word')) continue;
        if (id === 'saktumiva-refine') continue;
        let ms = 0, tp = 0, ok = true, err = null;
        const sums = { p: 0, r: 0, n: 0 };
        // every block, and the scores weighted by its pairs of witnesses
        let P = 0, R = 0, W = 0;
        for (const b of set.blocks) {
          const toks = b.witnesses.map((w) => tokens(w, kind));
          const t0 = process.hrtime.bigint();
          let cols;
          try { cols = E.run(toks.map((x) => x.t), kind); } catch (e) { err = e.message; ok = false; break; }
          ms += Number(process.hrtime.bigint() - t0) / 1e6;
          const sc = score(b.witnesses, toks, cols);
          const w = (b.witnesses.length * (b.witnesses.length - 1)) / 2;
          P += sc.precision * w; R += sc.recall * w; W += w;
        }
        const p = W ? P / W : 0, r = W ? R / W : 0, f1 = p + r ? (2 * p * r) / (p + r) : 0;
        const row = { set: set.name, engine: id, kind, blocks: set.blocks.length, ms: Math.round(ms), precision: +fmt(p), recall: +fmt(r), f1: +fmt(f1), error: err };
        rows.push(row);
        console.log([id.padEnd(17), kind.padEnd(6), (set.blocks.length + ' blocks').padEnd(10), (row.ms + ' ms').padStart(10), ok ? 'P ' + row.precision + '  R ' + row.recall + '  F1 ' + row.f1 : 'failed: ' + err].join('  '));
      }
    }
  }
}

// ---------- the runs ----------
const SETS = {
  quick: [[5, 60], [20, 60], [5, 400], [20, 400]],
  full: [[5, 60], [20, 60], [50, 60], [5, 400], [20, 400], [50, 400], [10, 2000]],
};
const gold = process.argv[2] === 'gold';
const which = gold ? [] : SETS[process.argv[2] || 'quick'] || SETS.quick;
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(ENGINES);
const LIMIT_TOKENS = 3e6; // a run whose table would be too large is skipped
const rows = [];
const fmt = (x) => (x * 100).toFixed(1);
console.log('Collation algorithms, benchmarked (Node ' + process.version + ', ' + os.cpus()[0].model + ')');
for (const rate of [1, 3]) {
  for (const [N, L] of which) {
    const wits = generate(N, L, 7 + N * 31 + L, rate);
    for (const kind of ['word', 'letter']) {
      const toks = wits.map((w) => tokens(w, kind));
      for (const id of only) {
        const E = ENGINES[id];
        if (!E || (E.words && kind !== 'word')) continue;
        if (E.slow && (N * L > 8000)) continue;
        if (kind === 'letter' && (id === 'star' || id === 'diff') && L > 400) continue;
        if (id === 'saktumiva-refine' && N * L * (kind === 'letter' ? 6 : 1) > 50000) continue;
        const t0 = process.hrtime.bigint();
        let cols, err = null;
        try { cols = E.run(toks.map((x) => x.t), kind); } catch (e) { err = e.message; }
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const sc = cols ? score(wits, toks, cols) : null;
        const row = { engine: id, kind, N, L, divergence: rate === 1 ? 'usual (3%)' : 'divergent (9%)', ms: Math.round(ms), precision: sc && +fmt(sc.precision), recall: sc && +fmt(sc.recall), f1: sc && +fmt(sc.f1), error: err };
        rows.push(row);
        console.log([id.padEnd(17), kind.padEnd(6), (N + '×' + L).padEnd(8), row.divergence.padEnd(15), (row.ms + ' ms').padStart(10), sc ? 'P ' + row.precision + '  R ' + row.recall + '  F1 ' + row.f1 : 'failed: ' + err].join('  '));
      }
    }
  }
}
(async () => {
if (gold) await goldRuns(only);
const out = path.join(os.tmpdir(), 'manuscribe-bench-collate' + (gold ? '-gold' : '') + '.json');
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), node: process.version, cpu: os.cpus()[0].model, engines: Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [k, v.name])), rows }, null, 1));
console.log('Results: ' + out);
})().catch((e) => { console.log('Failed: ' + e.stack); process.exitCode = 1; });
