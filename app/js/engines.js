'use strict';
/* The aligners Collate can use, besides Saktumiva's (vendor/saktumiva-aligner.js). Each runs in the collation
   Worker, where this source is inlined (a Worker of a page opened from disk can load nothing): it is given the
   witnesses' tokens and returns, for each, the column of each of its tokens.

   - Partial-order alignment (Lee, Grasso and Sharlow 2002): each witness is lined up against a graph of all the
     witnesses before it, so that a reading any of them has can be matched; the graph's order gives the columns.
     Affine gaps; over a long block a band that follows the best path, and is wider than the witnesses differ in length.
   - Against a base text: each witness on its own against one witness the editor names (Gotoh: global alignment,
     affine gaps), and the alignments put together by the base's places; what a witness adds stands between them.

   align(states: [{label, n: [token]}], settings) -> {order: [label], cols: {label: [column]}, ncols, tree: null} */
window.ME = window.ME || {};
ME.alignEngineSource = function (global) {
  'use strict';
  const MATCH = 4, MIS = -4, GO = -6, GE = -1, NEG = -1e9 | 0;
  // half the width of the band: wider than the two differ in length, but never more cells than memory can hold
  const CELLS = 2e7, BASE_CELLS = 2e8; // a cell of the base's table is one byte, of the graph's twelve
  const bandFor = (rows, len, cells) => Math.max(50, Math.min(Math.max(200, Math.ceil(Math.abs(rows - len) / 2) + 200), Math.floor((cells / (rows + 1) - 1) / 2)));

  function poa(seqs, opts) {
    const ids = new Map();
    const enc = (t) => { let i = ids.get(t); if (i === undefined) { i = ids.size; ids.set(t, i); } return i; };
    const S = seqs.map((w) => Int32Array.from(w, enc));
    let cap = 1 << 12, tok = new Int32Array(cap), ring = new Int32Array(cap), n = 0;
    const preds = [], succs = [], paths = [];
    const addNode = (t) => { if (n === cap) { cap *= 2; const a = new Int32Array(cap); a.set(tok); tok = a; const b = new Int32Array(cap); b.set(ring); ring = b; } tok[n] = t; ring[n] = n; preds.push([]); succs.push([]); return n++; };
    const addEdge = (a, b) => { if (!succs[a].includes(b)) { succs[a].push(b); preds[b].push(a); } };
    const topo = () => { const ind = new Int32Array(n); for (let i = 0; i < n; i++) ind[i] = preds[i].length; const q = new Int32Array(n); let h = 0, e = 0; for (let i = 0; i < n; i++) if (!ind[i]) q[e++] = i; while (h < e) { const v = q[h++]; for (const x of succs[v]) if (--ind[x] === 0) q[e++] = x; } return q.subarray(0, e); };
    let H = new Int32Array(0), E = new Int32Array(0), F = new Int32Array(0);
    S.forEach((w, wi) => {
      if (opts.onProgress) opts.onProgress(wi / S.length);
      const L = w.length;
      if (n === 0) { let p = -1; const path = []; for (let i = 0; i < L; i++) { const v = addNode(w[i]); if (p >= 0) addEdge(p, v); p = v; path.push(v); } paths.push(path); return; }
      const order = topo(), pos = new Int32Array(n);
      for (let i = 0; i < order.length; i++) pos[order[i]] = i + 1;
      const V = order.length;
      // the whole table for a block of ordinary length; a band, and a wide one, for a long one
      const BAND = V * (L + 1) > 4e6 ? bandFor(V, L, CELLS) : 0;
      const lo = new Int32Array(V + 1), hi = new Int32Array(V + 1), off = new Int32Array(V + 2), best = new Int32Array(V + 1);
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
    });
    // the nodes of one ring are one column; the columns in the order of the longest path
    const ringId = new Int32Array(n).fill(-1); let nr = 0;
    for (let i = 0; i < n; i++) if (ringId[i] < 0) { let x = i; do { ringId[x] = nr; x = ring[x]; } while (x !== i); nr++; }
    const rs = Array.from({ length: nr }, () => new Set()), rin = new Int32Array(nr);
    for (let a = 0; a < n; a++) for (const b of succs[a]) { const ra = ringId[a], rb = ringId[b]; if (ra !== rb && !rs[ra].has(rb)) { rs[ra].add(rb); rin[rb]++; } }
    const rank = new Int32Array(nr), q = []; for (let i = 0; i < nr; i++) if (!rin[i]) q.push(i);
    for (let h = 0; h < q.length; h++) { const a = q[h]; for (const b of rs[a]) { if (rank[a] + 1 > rank[b]) rank[b] = rank[a] + 1; if (--rin[b] === 0) q.push(b); } }
    // ranks are columns, but two tokens of one witness never share one: a column per rank, then closed up
    return paths.map((p) => p.map((v) => rank[ringId[v]]));
  }

  // one witness against the base: where each of its tokens goes, {at: base place} or {after: base place, k}
  function toBase(base, w, noAnchors) {
    const n = base.length, m = w.length, M = 1, X = -1, O = -2, G = -0.25, N = -1e15;
    if (!noAnchors && (n + 1) * (m + 1) > BASE_CELLS) return numbered(toBaseAnchored(base, w));
    if (!n || !m) return numbered(w.map(() => ({ after: n - 1 })));
    // only the way back is kept for every cell, and over a long block only for a band along the diagonal
    const big = (n + 1) * (m + 1) > BASE_CELLS, half = big ? bandFor(n, m, BASE_CELLS) : m, W = big ? 2 * half + 1 : m + 1;
    const loOf = (i) => (big ? Math.max(0, Math.round(i * m / n) - half) : 0), hiOf = (i) => (big ? Math.min(m, Math.round(i * m / n) + half) : m);
    const T = new Uint8Array((n + 1) * W);
    let H0 = new Float64Array(m + 1), E0 = new Float64Array(m + 1), H1 = new Float64Array(m + 1), E1 = new Float64Array(m + 1);
    let plo = 0, phi = -1;
    for (let i = 0; i <= n; i++) {
      const lo = loOf(i), hi = hiOf(i);
      let F = N;
      for (let j = lo; j <= hi; j++) {
        if (!i && !j) { H1[0] = 0; E1[0] = N; continue; }
        let t = 0, e = N, f = N, d = N;
        if (i && j >= plo && j <= phi) { const a = H0[j] + O + G, b = E0[j] + G; if (a >= b) e = a; else { e = b; t |= 4; } }
        if (j > lo) { const a = H1[j - 1] + O + G, b = F + G; if (a >= b) f = a; else { f = b; t |= 8; } }
        if (i && j && j - 1 >= plo && j - 1 <= phi) d = H0[j - 1] + (base[i - 1] === w[j - 1] ? M : X);
        let h = d, from = 0;
        if (e > h) { h = e; from = 1; }
        if (f > h) { h = f; from = 2; }
        H1[j] = h; E1[j] = e; F = f;
        T[i * W + j - lo] = t | from;
      }
      let x = H0; H0 = H1; H1 = x; x = E0; E0 = E1; E1 = x;
      plo = lo; phi = hi;
    }
    const out = new Array(m).fill(null); let i = n, j = m, st = 0;
    while (i > 0 || j > 0) {
      const t = T[i * W + j - loOf(i)];
      if (st === 0) { const from = t & 3; if (from === 0) { out[j - 1] = { at: i - 1 }; i--; j--; } else st = from; }
      else if (st === 1) { st = t & 4 ? 1 : 0; i--; }
      else { out[j - 1] = { after: i - 1 }; st = t & 8 ? 2 : 0; j--; }
    }
    return noAnchors ? out : numbered(out);
  }
  /* A long block is too big for the whole table, and a band along the diagonal loses its way once the texts have drifted
     apart by more than its width. The two go on being alike for long stretches: follow them while they agree, find where
     they next agree (twelve tokens running, the nearest such place), and align only the gap between. */
  // what a witness adds at one place of the base, numbered in order
  function numbered(out) {
    let last = -2, k = 0;
    for (const x of out) if (x.after !== undefined) { if (x.after !== last) { last = x.after; k = 0; } x.k = k++; } else last = -2;
    return out;
  }
  function toBaseAnchored(base, w) {
    const n = base.length, m = w.length, K = 12, out = new Array(m).fill(null);
    const hash = (a, at) => { let h = 7; for (let t = 0; t < K; t++) { const s = a[at + t]; for (let c = 0; c < s.length; c++) h = Math.imul(h, 31) + s.charCodeAt(c) | 0; h = Math.imul(h, 17) | 0; } return h; };
    const agree = (p, q) => { for (let t = 0; t < K; t++) if (base[p + t] !== w[q + t]) return false; return true; };
    const nextAgreement = (i, j) => {
      for (let reach = 64; ; reach *= 4) {
        const where = new Map();
        for (let q = Math.min(j + reach, m - K); q >= j; q--) where.set(hash(w, q), q); // the nearest wins, by going backwards
        let best = null;
        for (let p = i, top = Math.min(i + reach, n - K); p <= top; p++) {
          if (best && p - i >= best[2]) break;
          const q = where.get(hash(base, p));
          if (q === undefined || !agree(p, q)) continue;
          const d = p - i + q - j;
          if (!best || d < best[2]) best = [p, q, d];
        }
        if (best) return best;
        if (reach >= n + m) return [n, m, n + m];
      }
    };
    let i = 0, j = 0;
    while (i < n || j < m) {
      while (i < n && j < m && base[i] === w[j]) { out[j] = { at: i }; i++; j++; }
      if (i >= n || j >= m) { for (; j < m; j++) out[j] = { after: n - 1 }; break; }
      const [p, q] = nextAgreement(i, j);
      const gap = toBase(base.slice(i, p), w.slice(j, q), true);
      gap.forEach((x, g) => { out[j + g] = x.at !== undefined ? { at: x.at + i } : { after: x.after + i }; });
      i = p; j = q;
    }
    return out;
  }
  function againstBase(seqs, b, opts) {
    const base = seqs[b];
    const maps = seqs.map((w, i) => { if (opts.onProgress) opts.onProgress(i / seqs.length); return i === b ? w.map((_, j) => ({ at: j })) : toBase(base, w); });
    const most = new Int32Array(base.length + 1);
    for (const mp of maps) for (const x of mp) if (x.after !== undefined) most[x.after + 1] = Math.max(most[x.after + 1], x.k + 1);
    const start = new Int32Array(base.length + 2); let c = 0;
    for (let p = 0; p <= base.length; p++) { start[p] = c; c += most[p] + 1; }
    return maps.map((mp) => mp.map((x) => (x.at !== undefined ? start[x.at] + most[x.at] : start[x.after + 1] + x.k)));
  }

  /* A column per rank, but a witness's tokens in distinct, increasing columns; the columns no witness is in go. */
  function table(states, colsOf) {
    const cols = {};
    let ncols = 0;
    states.forEach((s, i) => { cols[s.label] = colsOf[i].slice(); for (const c of cols[s.label]) if (c + 1 > ncols) ncols = c + 1; });
    for (const l of Object.keys(cols)) { const a = cols[l]; for (let k = 1; k < a.length; k++) if (a[k] <= a[k - 1]) throw new Error('the aligner put two tokens of ' + l + ' in one place'); }
    const used = new Uint8Array(ncols);
    for (const l of Object.keys(cols)) for (const c of cols[l]) used[c] = 1;
    const map = new Int32Array(ncols); let next = 0;
    for (let c = 0; c < ncols; c++) if (used[c]) map[c] = next++;
    for (const l of Object.keys(cols)) cols[l] = cols[l].map((c) => map[c]);
    return { order: states.map((s) => s.label), cols, ncols: next, tree: null };
  }

  global.AlignEngines = {
    poa: { align: (states, settings, opts) => table(states, poa(states.map((s) => s.n), opts || {})) },
    base: {
      align: (states, settings, opts) => {
        const b = Math.max(0, states.findIndex((s) => s.label === (settings && settings.base)));
        return table(states, againstBase(states.map((s) => s.n), b, opts || {}));
      },
    },
  };
};
