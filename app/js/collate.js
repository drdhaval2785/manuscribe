'use strict';
/* Collation, block by block. The aligner is Charles Li's, from Saktumiva 2.0 (GPL-3.0); it runs in a
   Worker made from a Blob, the only way a page opened from disk can have one. Everything the aligner
   needs goes through Collate.align, so another engine can stand in its place.

   A table holds, for each state of a witness, its diplomatic text and where each token starts in it,
   each token's normalised form, and the column each token falls in. That is enough to find every token's
   letters and its place in the manuscript, without keeping a copy of them for each token. */
(function (ME) {
  const { U, Tokens, Norm, Store } = ME;
  const Collate = {};

  const ENGINE = { tool: 'saktumiva-multialign', version: '132a83e', config: 'arr_simple', after: 'close-gaps@1' };
  // Saktumiva's own defaults
  const SCORING = { match: 1, mismatch: -1, gap_open: -2, gap_extend: -0.25, gap_skip_initial: true, scalegap: false, recursive: false, realigndepth: 0, distancefunc: 'ngrams', ngramsize: 3 };
  Collate.DEFAULT_TOKENS = 'letter'; // on real text words did far worse, as Li warns, and akṣaras a little worse

  /* ---------- the engine ---------- */

  /* An aligner scatters a witness that omits a long passage: kr-----at-----u, where the whole word kratu
     stands in the other witnesses. Here a stretch of a witness's tokens moves up against its neighbour when
     it reads the same in its new columns, which always leaves that witness with fewer gaps. Nothing else
     moves, so a reading the aligner placed for good reason stays where it is.
     Runs inside the Worker, so it cannot use anything from outside itself. -> {cols, ncols} */
  function closeGaps(labels, tokens, cols, ncols, gapMark) {
    const counts = Array.from({ length: ncols }, () => new Map());
    const add = (c, n, by) => { if (n !== gapMark) counts[c].set(n, (counts[c].get(n) || 0) + by); };
    for (const l of labels) tokens[l].forEach((n, k) => add(cols[l][k], n, 1));
    const reads = (c, n) => counts[c].get(n) || 0;
    const indexOf = (arr, c) => { // arr rises
      let lo = 0, hi = arr.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < c) lo = mid + 1; else hi = mid; }
      return arr[lo] === c ? lo : -1;
    };
    // Witnesses that read these columns alike, and have room there too, move together: each of them
    // agreeing with the others where they stand should not hold the rest back.
    const tryMove = (l, from, to, shift) => {
      const len = to - from + 1;
      const group = [];
      for (const m of labels) {
        const start = indexOf(cols[m], cols[l][from]);
        if (start < 0 || start + len > cols[m].length) continue;
        let alike = true;
        for (let j = 0; j < len && alike; j++) alike = cols[m][start + j] === cols[l][from + j] && tokens[m][start + j] === tokens[l][from + j];
        if (!alike) continue;
        const before = start > 0 ? cols[m][start - 1] : -1, after = start + len < cols[m].length ? cols[m][start + len] : Infinity;
        if (cols[m][start] + shift > before && cols[m][start + len - 1] + shift < after) group.push([m, start]);
      }
      if (!group.some(([m]) => m === l)) return false;
      for (let j = 0; j < len; j++) {
        const n = tokens[l][from + j], c = cols[l][from + j];
        if (n === gapMark) continue;
        const here = reads(c, n) - group.length, there = reads(c + shift, n);
        if (there < 1 || there < here) return false;
      }
      for (const [m, start] of group) {
        for (let j = 0; j < len; j++) { add(cols[m][start + j], tokens[m][start + j], -1); cols[m][start + j] += shift; add(cols[m][start + j], tokens[m][start + j], 1); }
      }
      return true;
    };
    for (const l of labels) {
      for (let changed = true; changed;) {
        changed = false;
        const col = cols[l];
        const starts = [0];
        for (let k = 1; k < col.length; k++) if (col[k] !== col[k - 1] + 1) starts.push(k);
        for (let i = 1; i < starts.length && !changed; i++) {
          const from = starts[i], to = (i + 1 < starts.length ? starts[i + 1] : col.length) - 1;
          // up against the stretch before it
          if (tryMove(l, from, to, col[from - 1] + 1 - col[from])) { changed = true; break; }
          // or the stretch before it up against this one
          const pFrom = starts[i - 1], pTo = from - 1;
          if (tryMove(l, pFrom, pTo, col[from] - 1 - col[pTo])) changed = true;
        }
      }
    }
    // columns nobody is left in
    const used = new Uint8Array(ncols);
    for (const l of labels) for (const c of cols[l]) used[c] = 1;
    const map = new Int32Array(ncols);
    let next = 0;
    for (let c = 0; c < ncols; c++) if (used[c]) map[c] = next++;
    for (const l of labels) cols[l] = cols[l].map((c) => map[c]);
    return { cols, ncols: next };
  }

  let workerUrl = null;
  function engineUrl() {
    if (workerUrl) return workerUrl;
    const handler = function (closeGaps, gapMark) {
      onmessage = (e) => {
        const { states, scoring, config, plain } = e.data;
        try {
          const ma = new self.CollateEngine.MultiAligner(config, scoring);
          const res = ma.align(states.map((s) => ({ siglum: s.label, text: s.n })));
          const cols = {};
          res.sigla.forEach((label, r) => {
            const row = res.alignment[r], at = [];
            for (let c = 0; c < row.length; c++) if (row[c] !== '') at.push(c);
            cols[label] = at;
          });
          const tokens = {};
          for (const st of states) tokens[st.label] = st.n;
          const closed = plain ? { cols, ncols: res.alignment[0].length } : closeGaps(res.sigla, tokens, cols, res.alignment[0].length, gapMark);
          // the tree's node ids are random: numbered instead, the same input gives the same file
          const ids = new Map();
          const tree = String(res.tree).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (u) => { if (!ids.has(u)) ids.set(u, 'n' + (ids.size + 1)); return ids.get(u); });
          postMessage({ done: true, order: res.sigla, cols: closed.cols, ncols: closed.ncols, tree });
        } catch (err) {
          postMessage({ done: true, error: String((err && err.message) || err) });
        }
      };
    };
    const src = '(' + ME.collateEngineSource.toString() + ')(self);\n(' + handler.toString() + ')(' + closeGaps.toString() + ', ' + JSON.stringify(Norm.GAP) + ');';
    workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return workerUrl;
  }

  /* align(states, {onProgress, signal}) -> {order, cols: {label: [column of each token]}, ncols, tree}.
     states: [{label, n: [token, ...]}], none of them empty. */
  Collate.align = function (states, opts) {
    const o = opts || {};
    if (states.length < 2) {
      const only = states[0];
      return Promise.resolve({ order: only ? [only.label] : [], cols: only ? { [only.label]: only.n.map((_, k) => k) } : {}, ncols: only ? only.n.length : 0, tree: null });
    }
    return new Promise((resolve, reject) => {
      const w = new Worker(engineUrl());
      const stop = () => { w.terminate(); reject(new Collate.Cancelled()); };
      if (o.signal) o.signal.addEventListener('abort', stop, { once: true });
      const end = (fn, v) => { w.terminate(); if (o.signal) o.signal.removeEventListener('abort', stop); fn(v); };
      w.onerror = (e) => end(reject, new Error(e.message || 'the aligner stopped'));
      w.onmessage = (e) => {
        const d = e.data;
        if (!d.done) { if (o.onProgress && typeof d.progress === 'number') o.onProgress(d.progress); return; }
        if (d.error) { end(reject, new Error(d.error)); return; }
        // the aligner must have kept every token, in order
        for (const s of states) {
          const c = d.cols[s.label];
          if (!c || c.length !== s.n.length) { end(reject, new Error('the aligner lost tokens of ' + s.label)); return; }
        }
        end(resolve, { order: d.order, cols: d.cols, ncols: d.ncols, tree: d.tree });
      };
      w.postMessage({ states: states.map((s) => ({ label: s.label, n: s.n })), scoring: o.scoring || SCORING, config: o.config || ENGINE.config, plain: !!o.plain });
    });
  };
  Collate.Cancelled = class extends Error { constructor() { super('cancelled'); this.cancelled = true; } };

  // Roughly how long a block takes, from measuring this aligner in a Worker on an M2 Pro: it grows with the
  // square of the witnesses and of the length.
  Collate.estimateSeconds = (rows) => {
    const longest = rows.reduce((a, r) => Math.max(a, r.n.length), 0);
    return 4.5e-9 * rows.length * rows.length * longest * longest;
  };

  /* ---------- tables ---------- */

  async function hashText(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle) {
      const d = await crypto.subtle.digest('SHA-256', bytes);
      return 'sha256:' + Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811C9DC5; // a page that cannot have SHA-256 still needs to notice a change
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
    return 'fnv1a:' + (h >>> 0).toString(16) + ':' + bytes.length;
  }

  // Tokens with no normalised form cannot be aligned; a state has one only if all of it was ignored.
  const alignable = (st) => st.tokens.some((t) => t.n !== '');

  const stateRecord = (st) => {
    const rules = {}, flags = {};
    st.tokens.forEach((t, k) => {
      if (t.rules.length) rules[k] = t.rules;
      if (t.flags.length) flags[k] = t.flags;
    });
    return {
      siglum: st.siglum, layer: st.layer, dip: st.dip,
      ignored: st.runs.filter((r) => r.ignored && r.to > r.from).map((r) => [r.from, r.to]),
      gaps: (st.gaps || []).map((g) => ({ at: g.at, quantity: g.quantity })),
      runs: st.runs.filter((r) => r.to > r.from).map((r) => (r.sep ? { from: r.from, to: r.to, sep: true } : { from: r.from, to: r.to, folio: r.label, box: r.box, line: r.i, offs: r.offs })),
      from: st.tokens.map((t) => t.from), n: st.tokens.map((t) => t.n), rules, flags,
    };
  };

  const paramsOf = (ed, kind) => {
    const s = Norm.settings(ed.norm);
    return {
      aligner: Object.assign({ scoring: SCORING }, ENGINE), tokens: kind, profile: s.profile.id + '@' + s.profile.version,
      rules: Array.from(s.on).sort(), ignoredTags: s.ignoreTags.slice().sort(),
    };
  };

  const stableJson = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? sortKeys(x) : x));

  const keyOf = (edId, work, unit) => edId + '\u0000' + work + '\u0000' + unit;
  Collate.keyOf = keyOf;
  const tokenKind = (ed) => (ed.collate && ed.collate.tokens) || Collate.DEFAULT_TOKENS;
  Collate.tokenKind = tokenKind;

  /* ---------- what is known about an edition's tables, without loading them all each time ---------- */

  const known = new Map(); // edition id -> Map(key -> summary)
  const summarise = (rec) => ({ key: rec.key, work: rec.work, unit: rec.unit, seen: rec.seen, paramsKey: rec.paramsKey, imported: !!rec.table.imported,
    ncols: rec.table.ncols, variants: rec.table.variants, labels: rec.table.order.length, tokens: rec.table.tokens,
    corrections: (rec.table.ops || []).length, locks: (rec.table.locks || []).length, review: (rec.table.review || []).length, checked: !!rec.table.checked,
    accuracy: rec.table.checked ? ME.CollateEdit.againstCorrections(rec.table) : null,
    ...(() => { try { const c = ME.CollateEdit.proposal(rec.table, []).count; return { words: c.words, differ: c.differ, ties: c.trust }; } catch (e) { return {}; } })() });
  Collate.summaries = async function (edId) {
    if (known.has(edId)) return known.get(edId);
    const m = new Map();
    for (const rec of await Store.listCollations(edId)) m.set(rec.key, summarise(rec));
    known.set(edId, m);
    return m;
  };
  Collate.saveTable = async function (ed, rec) {
    rec.table.variants = countVariants(rec.table);
    await save(ed.id, rec);
  };
  async function save(edId, rec) {
    await Store.putCollation(rec);
    const m = await Collate.summaries(edId);
    m.set(rec.key, summarise(rec));
  }

  // Is this table still of the witnesses as they stand? Without reading them: a null means "cannot tell".
  Collate.isCurrent = function (ed, list, summary) {
    if (summary.paramsKey !== stableJson(paramsOf(ed, tokenKind(ed)))) return false;
    for (const { w, p } of list) if (p && summary.seen[w.siglum] !== (p.modified || 0)) return null;
    return true;
  };

  const countVariants = (table) => Collate.variantColumns(table, Collate.grid(table)).reduce((a, b) => a + b, 0);

  /* Collates a work. A block whose text and settings have not changed keeps its table.
     opts: {force, signal, onUnit(i, total, id), onProgress(fraction in this block)}
     -> {done: [ids], kept: [ids], removed: [ids], skipped: [{id, why}], outside, unreadable} */
  Collate.run = async function (ed, list, workId, opts) {
    const o = opts || {};
    const kind = tokenKind(ed);
    const res = await Tokens.forWorkSliced(ed, list, workId, { kind });
    const params = paramsOf(ed, kind);
    const paramsKey = stableJson(params);
    const out = { done: [], kept: [], removed: [], skipped: [], outside: res.outside, unreadable: res.unreadable };
    const m = await Collate.summaries(ed.id);
    const here = list.filter((x) => x.p);
    const seen = {};
    for (const { w, p } of here) seen[w.siglum] = p.modified || 0;
    const cover = (ed.coverage && ed.coverage[workId]) || {};
    const units = res.units;
    const live = new Set();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (o.signal && o.signal.aborted) throw new Collate.Cancelled();
      if (o.onUnit) o.onUnit(i, units.length, u.id);
      const key = keyOf(ed.id, workId, u.id);
      live.add(key);
      const states = u.states.filter(alignable);
      const dropped = u.states.filter((s) => !alignable(s));
      if (!states.length) { out.skipped.push({ id: u.id, why: 'nothing left to compare' }); continue; }
      const inputs = {};
      for (const st of states) inputs[st.label] = await hashText(JSON.stringify([st.dip, st.tokens.map((t) => t.from), st.tokens.map((t) => t.n)]));
      const absent = u.absent.map((s) => ({ siglum: s, state: (cover[u.id] && cover[u.id][s]) || 'missing' }));
      const old = m.has(key) ? await Store.getCollation(key) : null;
      const same = old && !o.force && !old.table.imported && old.paramsKey === paramsKey && JSON.stringify(sortKeys(old.table.inputs)) === JSON.stringify(sortKeys(inputs));
      if (same) {
        // the same text: only what the editor says about absent witnesses, and the folio names, can have changed
        for (const st of states) if (old.table.states[st.label]) old.table.states[st.label].runs = stateRecord(st).runs;
        old.seen = seen;
        old.table.absent = absent;
        await save(ed.id, old);
        out.kept.push(u.id);
        continue;
      }
      if (old && old.table.imported && !o.force && JSON.stringify(sortKeys(old.table.inputs)) === JSON.stringify(sortKeys(inputs))) {
        // an alignment brought in from elsewhere stays until its text changes or the editor asks
        old.seen = seen;
        old.table.absent = absent;
        await save(ed.id, old);
        out.kept.push(u.id);
        continue;
      }
      const tokenRows = states.map((st) => ({ label: st.label, n: st.tokens.map((t) => t.n) }));
      if (o.onEstimate) o.onEstimate(Collate.estimateSeconds(tokenRows));
      const shared = { unit: u.id, work: workId, params, inputs, absent, states: {}, empty: dropped.map((s) => s.label), tokens: tokenRows.reduce((a, r) => a + r.n.length, 0) };
      for (const st of states) shared.states[st.label] = stateRecord(st);
      let table;
      if (old && ME.CollateEdit.hasLocks(old.table)) {
        // what the editor has corrected stays; only the rest is aligned again
        table = await ME.CollateEdit.recollate(old.table, shared, (rows, extra) => Collate.align(rows, Object.assign({ signal: o.signal }, extra)));
        out.reviewed = (out.reviewed || 0) + table.history[table.history.length - 1].sentToReview;
      } else {
        const aligned = await Collate.align(tokenRows, { signal: o.signal, onProgress: o.onProgress });
        table = Object.assign(shared, { order: aligned.order, ncols: aligned.ncols, tree: aligned.tree });
        for (const st of states) table.states[st.label].cols = aligned.cols[st.label];
        ME.CollateEdit.ensure(table);
      }
      table.variants = countVariants(table);
      await save(ed.id, { key, edition: ed.id, work: workId, unit: u.id, seen, paramsKey, table });
      out.done.push(u.id);
    }
    // blocks no witness has any more
    for (const [key, s] of m) {
      if (s.work === workId && !live.has(key)) { await Store.deleteCollation(key); m.delete(key); out.removed.push(s.unit); }
    }
    return out;
  };

  function sortKeys(o) {
    const c = {};
    for (const k of Object.keys(o).sort()) c[k] = o[k];
    return c;
  }

  // The witnesses, most trusted first: as the editor has set it, then any added since, as listed.
  Collate.trustOrder = function (ed) {
    const sigla = ed.witnesses.map((w) => w.siglum);
    const set = (ed.trust || []).filter((s) => sigla.includes(s));
    return set.concat(sigla.filter((s) => !set.includes(s)));
  };

  /* ---------- reading a table ---------- */

  // The stretch of diplomatic text a token covers.
  const rangeOf = (st, k) => [st.from[k], k + 1 < st.from.length ? st.from[k + 1] : st.dip.length];

  // A token as the rest of the program knows it.
  Collate.token = function (st, k) {
    const [from, to] = rangeOf(st, k);
    const src = [];
    // runs are in text order
    let lo = 0, hi = st.runs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (st.runs[mid].to <= from) lo = mid + 1; else hi = mid; }
    for (let j = lo; j < st.runs.length && st.runs[j].from < to; j++) {
      const r = st.runs[j];
      const a = Math.max(from, r.from), z = Math.min(to, r.to);
      if (r.sep) src.push({ sep: st.dip.slice(a, z) });
      else src.push({ folio: r.folio, box: r.box, line: r.line, offs: r.offs + (a - r.from), len: z - a });
    }
    return { t: st.dip.slice(from, to), n: st.n[k], src, rules: st.rules[k] || [], flags: st.flags[k] || [], gap: st.n[k] === Norm.GAP };
  };

  /* A grid of token numbers: grid[r][c] is the token of row r in column c, or -1. */
  Collate.grid = function (table) {
    return table.order.map((label) => {
      const st = table.states[label];
      const row = new Int32Array(table.ncols).fill(-1);
      st.cols.forEach((c, k) => { row[c] = k; });
      return row;
    });
  };

  /* Which columns differ, among the readings of the texts as corrected. Text lost to damage says nothing;
     an empty cell beside other witnesses' text is a difference. */
  Collate.variantColumns = function (table, grid) {
    const E = ME.CollateEdit;
    const linked = E.linked(table);
    const rows = table.order.map((l, r) => ({ l, st: table.states[l], g: grid[r], link: linked[l] })).filter((x) => x.st.layer !== 'ac');
    const out = new Uint8Array(table.ncols);
    const ids = table.colIds;
    const anyCells = table.cells && Object.keys(table.cells).length;
    for (let c = 0; c < table.ncols; c++) {
      let first = null, blanks = 0, known_ = 0, differ = false;
      for (const { l, st, g, link } of rows) {
        if (link && link.has(c)) continue;
        if (anyCells && E.unknown(E.stateOf(table, l, ids ? ids[c] : c))) continue;
        const k = g[c];
        if (k < 0) { blanks++; continue; }
        const n = st.n[k];
        if (n === Norm.GAP) continue;
        known_++;
        if (first === null) first = n; else if (first !== n) differ = true;
      }
      if (differ || (known_ > 0 && blanks > 0)) out[c] = 1;
    }
    return out;
  };

  /* ---------- agreement between witnesses ---------- */

  /* For every pair, over the given tables: in how many columns where both can be read do they agree?
     Text lost, a witness without the block, and its text before correction do not count either way:
     lacunae are not agreement. */
  Collate.agreement = function (tables) {
    const sigla = [];
    const add = (s) => { if (!sigla.includes(s)) sigla.push(s); };
    const pairs = new Map();
    const at = (a, b) => {
      const k = a < b ? a + '\u0000' + b : b + '\u0000' + a;
      if (!pairs.has(k)) pairs.set(k, { same: 0, sites: 0 });
      return pairs.get(k);
    };
    for (const t of tables) {
      const E = ME.CollateEdit;
      E.ensure(t);
      const linked = E.linked(t);
      const grid = Collate.grid(t);
      const rows = t.order.map((l, r) => ({ l, st: t.states[l], g: grid[r] })).filter((x) => x.st.layer !== 'ac');
      const counts = (x, c) => !E.unknown(E.stateOf(t, x.l, t.colIds[c])) && !(linked[x.l] && linked[x.l].has(c));
      for (const x of rows) add(x.st.siglum);
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const p = at(rows[i].st.siglum, rows[j].st.siglum);
          for (let c = 0; c < t.ncols; c++) {
            const ka = rows[i].g[c], kb = rows[j].g[c];
            if (ka < 0 && kb < 0) continue;
            const na = ka < 0 ? null : rows[i].st.n[ka], nb = kb < 0 ? null : rows[j].st.n[kb];
            if (na === Norm.GAP || nb === Norm.GAP) continue;
            if (!counts(rows[i], c) || !counts(rows[j], c)) continue;
            p.sites++;
            if (na === nb) p.same++;
          }
        }
      }
    }
    return { sigla, of: (a, b) => (a === b ? null : at(a, b)) };
  };

  /* ---------- exchange ---------- */

  // What CollateX takes as input: each witness as its tokens, with t and n.
  Collate.toCollateXInput = (table) => ({
    witnesses: table.order.map((label) => {
      const st = table.states[label];
      return { id: label, tokens: st.n.map((n, k) => { const t = Collate.token(st, k).t; return { t: t || n, n }; }) };
    }),
  });

  // What CollateX gives as output: for each witness, one cell per column, a list of tokens or null.
  Collate.toCollateXTable = function (table) {
    const grid = Collate.grid(table);
    return {
      witnesses: table.order.slice(),
      table: table.order.map((label, r) => {
        const st = table.states[label];
        return Array.from(grid[r], (k) => (k < 0 ? null : [{ t: Collate.token(st, k).t || st.n[k], n: st.n[k] }]));
      }),
    };
  };

  // One row per witness, one column per column, with a state written out where one has been set.
  Collate.toCsv = function (table, show) {
    const E = ME.CollateEdit;
    E.ensure(table);
    const grid = Collate.grid(table);
    const q = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    return table.order.map((label, r) => {
      const st = table.states[label];
      const cells = [label];
      for (let c = 0; c < table.ncols; c++) {
        const k = grid[r][c];
        const s = E.stateOf(table, label, table.colIds[c]);
        let v = '';
        if (k >= 0) v = show === 'dip' ? Collate.token(st, k).t.trim() : st.n[k];
        if (s && (k < 0 || show !== 'dip')) v = (v ? v + ' ' : '') + '[' + s + ']';
        cells.push(q(v));
      }
      return cells.join(',');
    }).join('\n') + '\n';
  };

  const esc = (s) => U.escXml(String(s));
  // The form Saktumiva saves and its matrix editor opens.
  Collate.toTeiCorpus = function (table) {
    const grid = Collate.grid(table);
    const list = table.order.map((label) => '<witness xml:id="' + U.escAttr(label) + '"><abbr>' + esc(label) + '</abbr></witness>').join('\n');
    const rows = table.order.map((label, r) => {
      const st = table.states[label];
      let cells = '';
      for (let c = 0; c < table.ncols; c++) {
        const k = grid[r][c];
        if (k < 0) { cells += '<w n="' + c + '"/>'; continue; }
        const t = Norm.fromSlp(Collate.token(st, k).t.trim() ? Collate.token(st, k).t : st.n[k]);
        cells += t === st.n[k] ? '<w n="' + c + '">' + esc(t) + '</w>' : '<w n="' + c + '" lemma="' + U.escAttr(st.n[k]) + '">' + esc(t) + '</w>';
      }
      return '<TEI n="' + U.escAttr(label) + '"><text>' + cells + '</text></TEI>';
    }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<teiCorpus xmlns="http://www.tei-c.org/ns/1.0">\n<teiHeader>\n<fileDesc><titleStmt><title>' + esc(table.unit) +
      '</title></titleStmt><publicationStmt><p>Made with Manuscribe.</p></publicationStmt><sourceDesc><listWit>\n' + list + '\n</listWit></sourceDesc></fileDesc>\n</teiHeader>\n' + rows + '\n</teiCorpus>\n';
  };

  // An alignment from elsewhere replaces this table's, and with it any corrections.
  function freshCopy(table, over) {
    const c = Object.assign({}, table, over);
    for (const k of ['colIds', 'nextCol', 'locks', 'cells', 'links', 'cuts', 'ops', 'review', 'base', 'redo', 'checked', 'lockSeq', 'linkSeq', 'history', 'picks', 'decisions', 'decisionSeq']) delete c[k];
    return c;
  }

  /* Reads an alignment made elsewhere into a table of the same block. The tokens must be this block's
     text: anything else would cut every reading off from its place in the manuscript, so it is refused.
     columns: {label: [one entry per column: list of token forms, possibly empty]} */
  function applyColumns(table, columns, source) {
    const labels = Object.keys(columns);
    const missing = table.order.filter((l) => !labels.includes(l));
    const extra = labels.filter((l) => !table.order.includes(l));
    if (missing.length || extra.length) throw new Error('its witnesses do not match this block' + (missing.length ? ': it lacks ' + missing.join(', ') : '') + (extra.length ? '; it has ' + extra.join(', ') + ' as well' : ''));
    const width = columns[labels[0]].length;
    if (labels.some((l) => columns[l].length !== width)) throw new Error('its rows are not all the same length');
    // a column with several tokens in one witness has to become several columns
    const span = new Array(width).fill(1);
    for (const l of labels) columns[l].forEach((cell, c) => { if (cell.length > span[c]) span[c] = cell.length; });
    const start = [];
    let ncols = 0;
    for (let c = 0; c < width; c++) { start.push(ncols); ncols += span[c]; }
    const next = freshCopy(table, { ncols, order: table.order.slice(), states: {}, imported: source, tree: null });
    for (const l of table.order) {
      const st = table.states[l];
      const flat = columns[l].flatMap((cell, c) => cell.map((v, i) => ({ v, col: start[c] + i })));
      if (flat.length !== st.n.length) throw new Error(l + ' has ' + flat.length + ' tokens there and ' + st.n.length + ' here');
      flat.forEach((x, k) => {
        if (x.v !== st.n[k] && x.v !== Collate.token(st, k).t) throw new Error(l + ', token ' + (k + 1) + ', reads “' + x.v + '” there and “' + st.n[k] + '” here');
      });
      next.states[l] = Object.assign({}, st, { cols: flat.map((x) => x.col) });
    }
    ME.CollateEdit.ensure(next);
    next.variants = countVariants(next);
    return next;
  }

  Collate.fromCollateX = function (table, json) {
    if (!json || !Array.isArray(json.witnesses) || !Array.isArray(json.table)) throw new Error('this is not a CollateX table');
    const columns = {};
    json.witnesses.forEach((id, r) => {
      columns[id] = json.table[r].map((cell) => (cell || []).map((tok) => (typeof tok === 'string' ? tok : tok.n !== undefined ? tok.n : tok.t)));
    });
    return applyColumns(table, columns, 'CollateX JSON');
  };

  Collate.fromTeiCorpus = function (table, xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('this is not well-formed XML');
    const rows = Array.from(doc.getElementsByTagName('TEI'));
    if (!rows.length) throw new Error('this has no aligned witnesses');
    const columns = {};
    for (const row of rows) {
      const label = row.getAttribute('n');
      const cells = [];
      for (const w of Array.from(row.getElementsByTagName('w'))) {
        const c = parseInt(w.getAttribute('n'), 10);
        const text = w.getAttribute('lemma') !== null ? w.getAttribute('lemma') : w.textContent;
        cells[c] = text === '' ? [] : [text];
      }
      for (let c = 0; c < cells.length; c++) if (!cells[c]) cells[c] = [];
      columns[label] = cells;
    }
    const width = Math.max(...Object.values(columns).map((c) => c.length));
    for (const c of Object.values(columns)) while (c.length < width) c.push([]);
    return applyColumns(table, columns, 'TEI corpus');
  };

  /* A file saved by Saktumiva. Its cells are its own: it cuts and normalises differently, and writes some
     vowels in its own way. But it spells the same manuscript text, so each of its cells can be found in the
     diplomatic text by counting letters, and each reading keeps its place in the manuscript. If the
     letters do not agree, it was made from other text, and it is refused. */
  const comparable = (s) => s.toLowerCase().normalize('NFC').replace(/aî/g, 'ai').replace(/aû/g, 'au').replace(/[ēê]/g, 'e').replace(/[ōô]/g, 'o').replace(/[\s|.,;:!?()[\]'’"“”॰-]/g, '');
  Collate.fromSaktumiva = function (table, xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('this is not well-formed XML');
    const rows = Array.from(doc.getElementsByTagName('TEI'));
    const labels = rows.map((r) => r.getAttribute('n'));
    const missing = table.order.filter((l) => !labels.includes(l));
    if (missing.length) throw new Error('it lacks ' + missing.join(', '));
    const blockId = Array.from(doc.getElementsByTagName('ab')).find((x) => x.getAttribute('type') === 'blockid');
    if (blockId && blockId.textContent.trim() && blockId.textContent.trim() !== table.unit) throw new Error('it is the alignment of “' + blockId.textContent.trim() + '”, not of “' + table.unit + '”');
    const next = freshCopy(table, { order: table.order.slice(), states: {}, imported: 'Saktumiva', tree: null });
    let ncols = 0;
    for (const row of rows) {
      const label = row.getAttribute('n');
      const st = table.states[label];
      if (!st) continue;
      const ignored = st.ignored || [];
      const base = Norm.fromDiplomatic(st.dip, { skip: ignored, gaps: st.gaps || [] });
      // the manuscript's letters, each with where it starts in the diplomatic text
      const mine = [], where = [];
      for (let j = 0; j < base.text.length; j++) {
        for (const c of comparable(Norm.fromSlp(base.text[j]))) { mine.push(c); where.push(base.at[j]); }
      }
      const from = [], n = [], cols = [];
      let pos = 0;
      for (const w of Array.from(row.getElementsByTagName('w'))) {
        const c = parseInt(w.getAttribute('n'), 10);
        if (c + 1 > ncols) ncols = c + 1;
        const text = w.textContent;
        const letters = comparable(text);
        const lemma = w.getAttribute('lemma');
        const form = (lemma !== null ? lemma : text).trim().replace(/ē/g, 'e').replace(/ō/g, 'o');
        if (!text.trim() && !form) continue;
        if (!letters) { if (form && n.length) continue; }
        for (let i = 0; i < letters.length; i++) {
          if (mine[pos + i] !== letters[i]) throw new Error(label + ' reads “' + text.trim() + '” in column ' + (c + 1) + ', which does not follow the transcription here: was it made from other text, or with other tags ignored?');
        }
        from.push(pos < where.length ? where[pos] : st.dip.length);
        n.push(form);
        cols.push(c);
        pos += letters.length;
      }
      if (pos !== mine.length) throw new Error(label + ' has ' + pos + ' letters there and ' + mine.length + ' here');
      if (from.length) from[0] = 0;
      next.states[label] = Object.assign({}, st, { from, n, cols, rules: {}, flags: {} });
    }
    next.ncols = ncols;
    ME.CollateEdit.ensure(next);
    next.variants = countVariants(next);
    next.tokens = Object.values(next.states).reduce((a, x) => a + x.n.length, 0);
    return next;
  };

  // Whichever kind of file this is: Manuscribe's and CollateX's own tokens, or Saktumiva's.
  Collate.fromFile = function (table, text) {
    if (!text.trimStart().startsWith('<')) return Collate.fromCollateX(table, JSON.parse(text));
    return /<cl[\s>]|<editorialDecl/.test(text) ? Collate.fromSaktumiva(table, text) : Collate.fromTeiCorpus(table, text);
  };

  Collate.saveImported = async function (ed, list, table) {
    const seen = {};
    for (const { w, p } of list) if (p) seen[w.siglum] = p.modified || 0;
    await save(ed.id, { key: keyOf(ed.id, table.work, table.unit), edition: ed.id, work: table.work, unit: table.unit, seen, paramsKey: stableJson(paramsOf(ed, tokenKind(ed))), table });
  };

  // For an edition package: tables go out as plain files, and come back the same.
  Collate.forPackage = async function (edId) {
    return (await Store.listCollations(edId)).map((rec) => rec.table);
  };
  Collate.fromPackage = async function (edId, tables) {
    known.delete(edId);
    await Store.deleteCollations(edId);
    for (const table of tables) {
      await Store.putCollation({ key: keyOf(edId, table.work, table.unit), edition: edId, work: table.work, unit: table.unit, seen: {}, paramsKey: stableJson(table.params), table });
    }
    known.delete(edId);
  };
  Collate.forget = (edId) => known.delete(edId);

  /* ---------- measuring an alignment against one checked by hand ---------- */

  /* gold: {rows: {label: [cell text, ...]}}, as the check pages save it; the rows of a label must spell the
     same text as the table's, spaces apart. Sum-of-pairs: of the letter pairs one alignment puts in a
     column, how many does the other too? Each cell counts by its first letter, so that tables cut into
     letters and into akṣaras can be compared. */
  Collate.evaluate = function (table, gold) {
    const strip = (s) => s.replace(/\s+/g, '');
    const labels = Object.keys(gold.rows).filter((l) => table.states[l]);
    const problems = [];
    const tableCols = {}, goldCols = {}, tableStarts = {}, goldStarts = {};
    for (const l of labels) {
      const st = table.states[l];
      const col = [], starts = [];
      st.n.forEach((_, k) => {
        const t = strip(Collate.token(st, k).t);
        if (t) starts.push([col.length, st.cols[k]]);
        for (let i = 0; i < t.length; i++) col.push(st.cols[k]);
      });
      const gc = [], gs = [];
      gold.rows[l].forEach((cell, c) => {
        const t = strip(cell || '');
        if (t) gs.push([gc.length, c]);
        for (let i = 0; i < t.length; i++) gc.push(c);
      });
      if (col.length !== gc.length) problems.push(l + ': ' + gc.length + ' letters in the checked file, ' + col.length + ' in the table');
      tableCols[l] = col; goldCols[l] = gc; tableStarts[l] = starts; goldStarts[l] = gs;
    }
    let goldPairs = 0, recalled = 0, tablePairs = 0, correct = 0;
    const pairsIn = (starts, cols, other) => {
      let total = 0, ok = 0;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i], b = labels[j];
          const byCol = new Map(starts[b].map(([pos, c]) => [c, pos]));
          for (const [posA, c] of starts[a]) {
            if (!byCol.has(c)) continue;
            total++;
            if (other[a][posA] !== undefined && other[a][posA] === other[b][byCol.get(c)]) ok++;
          }
        }
      }
      return [total, ok];
    };
    [goldPairs, recalled] = pairsIn(goldStarts, goldCols, tableCols);
    [tablePairs, correct] = pairsIn(tableStarts, tableCols, goldCols);
    return { recall: goldPairs ? recalled / goldPairs : 0, precision: tablePairs ? correct / tablePairs : 0, goldPairs, tablePairs, problems };
  };

  ME.Collate = Collate;
})(window.ME);
