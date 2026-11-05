'use strict';
/* Correcting a collation table. The table the aligner made is kept as it was; each correction is an
   operation in a log, so it can be undone, and what the editor sees is that table with the log applied.

   Columns have ids that outlast any change of position, and everything an editor says about a column
   (locks, cell states, links, cuts) is said of its id. Whatever an editor changes is locked at once, so
   aligning again cannot undo it. If the text under a lock later changes, the lock is not moved to somewhere
   that looks similar: it is taken off and raised for review. */
(function (ME) {
  const { Norm, Collate } = ME;
  const Edit = {};

  Edit.STATES = {
    om: 'Omission: the witness really lacks this text',
    lac: 'Lacuna: lost to damage or a missing folio',
    illeg: 'Illegible: there, but cannot be read',
    na: 'Outside the coverage of this witness',
    ambig: 'Ambiguous: the reading is uncertain',
  };
  // These say nothing about what the witness read, so they do not count as agreement or difference.
  const UNKNOWN = new Set(['lac', 'illeg', 'na', 'ambig']);

  const DERIVED = ['ncols', 'colIds', 'nextCol', 'locks', 'cells', 'links', 'cuts', 'lockSeq'];

  // Tables made before corrections existed get what they lack.
  Edit.ensure = function (table) {
    if (!table.colIds) {
      table.colIds = Array.from({ length: table.ncols }, (_, c) => c);
      table.nextCol = table.ncols;
    }
    if (!table.locks) table.locks = [];
    if (!table.cells) table.cells = {};
    if (!table.links) table.links = [];
    if (!table.cuts) table.cuts = { add: {}, remove: {} };
    if (!table.ops) table.ops = [];
    if (!table.review) table.review = [];
    if (!table.lockSeq) table.lockSeq = 0;
    return table;
  };

  const snapshot = (t) => {
    const s = { cols: {} };
    for (const k of DERIVED) s[k] = t[k] === undefined ? t[k] : JSON.parse(JSON.stringify(t[k]));
    for (const l of t.order) s.cols[l] = t.states[l].cols.slice();
    return s;
  };
  const restore = (t, s) => {
    for (const k of DERIVED) t[k] = s[k] === undefined ? s[k] : JSON.parse(JSON.stringify(s[k]));
    for (const l of t.order) t.states[l].cols = s.cols[l].slice();
  };

  const posMap = (t) => new Map(t.colIds.map((id, c) => [id, c]));

  // first index in a rising array at or above v
  const lower = (arr, v) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  };

  /* ---------- locks ---------- */

  // Column positions that are locked: 1 by an edit, 2 by the editor, who must unlock them to change them.
  Edit.lockMap = function (t) {
    const out = new Uint8Array(t.ncols);
    const at = posMap(t);
    for (const lk of t.locks) {
      const a = at.get(lk.from), b = at.get(lk.to);
      if (a === undefined || b === undefined) continue;
      const v = lk.kind === 'manual' ? 2 : 1;
      for (let c = a; c <= b; c++) if (out[c] < v) out[c] = v;
    }
    return out;
  };

  function addLock(t, a, b, kind) {
    const lo = Math.max(0, Math.min(a, b)), hi = Math.min(t.ncols - 1, Math.max(a, b));
    if (hi < lo) return;
    t.lockSeq = (t.lockSeq || 0) + 1;
    t.locks.push({ id: t.lockSeq, from: t.colIds[lo], to: t.colIds[hi], kind });
  }

  function refuseIfLocked(t, a, b) {
    const m = Edit.lockMap(t);
    for (let c = Math.min(a, b); c <= Math.max(a, b); c++) if (m[c] === 2) throw new Error('These columns are locked. Unlock them first.');
  }

  /* ---------- columns coming and going ---------- */

  function insertColumn(t, at) {
    for (const l of t.order) {
      const cols = t.states[l].cols;
      for (let k = lower(cols, at); k < cols.length; k++) cols[k]++;
    }
    t.colIds.splice(at, 0, t.nextCol++);
    t.ncols++;
  }

  const lockEnds = (t) => {
    const ends = new Set();
    for (const lk of t.locks) { ends.add(lk.from); ends.add(lk.to); }
    return ends;
  };

  // A column with nothing left in it goes, unless the editor has said something about it.
  function dropEmptyColumns(t) {
    const used = new Uint8Array(t.ncols);
    for (const l of t.order) for (const c of t.states[l].cols) used[c] = 1;
    const said = new Set();
    for (const row of Object.values(t.cells)) for (const id of Object.keys(row)) said.add(+id);
    for (const lk of t.links) for (const id of [...lk.a, ...lk.b]) said.add(id);
    const ends = lockEnds(t);
    const map = new Int32Array(t.ncols);
    const ids = [];
    for (let c = 0; c < t.ncols; c++) {
      if (used[c] || said.has(t.colIds[c]) || ends.has(t.colIds[c])) { map[c] = ids.length; ids.push(t.colIds[c]); } else map[c] = -1;
    }
    if (ids.length === t.ncols) return;
    for (const l of t.order) t.states[l].cols = t.states[l].cols.map((c) => map[c]);
    t.colIds = ids;
    t.ncols = ids.length;
  }

  /* ---------- operations ---------- */

  const APPLY = {
    // Tokens k1..k2 of a row, by delta columns. They may only go into empty cells of that row. A single step
    // with no room makes a new column, so that a reading can always be set apart.
    shift(t, o) {
      const st = t.states[o.label];
      if (!st) throw new Error('There is no row ' + o.label);
      if (!(o.k1 >= 0 && o.k2 >= o.k1 && o.k2 < st.cols.length)) throw new Error('Nothing to move');
      const cols = st.cols;
      refuseIfLocked(t, cols[o.k1], cols[o.k2]);
      let d = o.delta;
      const before = o.k1 > 0 ? cols[o.k1 - 1] : -1;
      const after = o.k2 + 1 < cols.length ? cols[o.k2 + 1] : t.ncols;
      if (d > 0 && cols[o.k2] + d >= after) {
        if (d !== 1) throw new Error('No room to move it that far');
        refuseIfLocked(t, cols[o.k2], Math.min(t.ncols - 1, cols[o.k2] + 1));
        insertColumn(t, cols[o.k2] + 1);
      } else if (d < 0 && cols[o.k1] + d <= before) {
        if (d !== -1) throw new Error('No room to move it that far');
        refuseIfLocked(t, Math.max(0, cols[o.k1] - 1), cols[o.k1]);
        insertColumn(t, cols[o.k1]);
      }
      const lo = Math.min(cols[o.k1], cols[o.k1] + d), hi = Math.max(cols[o.k2], cols[o.k2] + d);
      if (lo < 0 || hi >= t.ncols) {
        // past either end of the table: a new column there
        if (lo < 0) { insertColumn(t, 0); } else { insertColumn(t, t.ncols); }
      }
      const a = Math.min(cols[o.k1], cols[o.k1] + d), z = Math.max(cols[o.k2], cols[o.k2] + d);
      for (let k = o.k1; k <= o.k2; k++) cols[k] += d;
      addLock(t, a, z, 'edit');
      dropEmptyColumns(t);
    },
    // A column and the next become one, if no witness has text in both.
    merge(t, o) {
      const at = posMap(t).get(o.at);
      if (at === undefined || at + 1 >= t.ncols) throw new Error('There is no next column to merge with');
      refuseIfLocked(t, at, at + 1);
      for (const l of t.order) {
        const cols = t.states[l].cols;
        const k = lower(cols, at);
        if (cols[k] === at && cols[k + 1] === at + 1) throw new Error(l + ' has text in both columns, so they cannot be one');
      }
      const gone = t.colIds[at + 1];
      for (const l of t.order) {
        const cols = t.states[l].cols;
        const k = lower(cols, at + 1);
        if (cols[k] === at + 1) cols[k] = at;
        for (let j = lower(cols, at + 2); j < cols.length; j++) cols[j]--;
      }
      t.colIds.splice(at + 1, 1);
      t.ncols--;
      // what was said of the column that went now belongs to the one that stayed
      for (const row of Object.values(t.cells)) if (row[gone] !== undefined) { if (row[o.at] === undefined) row[o.at] = row[gone]; delete row[gone]; }
      for (const lk of t.locks) { if (lk.from === gone) lk.from = o.at; if (lk.to === gone) lk.to = o.at; }
      for (const lk of t.links) for (const side of [lk.a, lk.b]) for (let i = 0; i < 2; i++) if (side[i] === gone) side[i] = o.at;
      delete t.cuts.add[gone]; delete t.cuts.remove[gone];
      addLock(t, at, at, 'edit');
    },
    // These rows' readings are not the same as the others' here: they go to a new column just after.
    split(t, o) {
      const at = posMap(t).get(o.at);
      if (at === undefined) throw new Error('No such column');
      refuseIfLocked(t, at, at);
      const here = t.order.filter((l) => { const c = t.states[l].cols; return c[lower(c, at)] === at; });
      const moving = here.filter((l) => o.labels.includes(l));
      if (!moving.length) throw new Error('These witnesses have nothing in this column');
      if (moving.length === here.length) throw new Error('Every witness with text here would move, so nothing would change');
      insertColumn(t, at + 1);
      for (const l of moving) { const c = t.states[l].cols; c[lower(c, at)] = at + 1; }
      addLock(t, at, at + 1, 'edit');
    },
    // A column changes place with the next, if no witness has text in both.
    swap(t, o) {
      const at = posMap(t).get(o.at);
      if (at === undefined || at + 1 >= t.ncols) throw new Error('There is no next column');
      refuseIfLocked(t, at, at + 1);
      for (const l of t.order) {
        const c = t.states[l].cols;
        const k = lower(c, at);
        if (c[k] === at && c[k + 1] === at + 1) throw new Error(l + ' has text in both columns, so their order cannot change');
      }
      for (const l of t.order) {
        const c = t.states[l].cols;
        const k = lower(c, at);
        if (c[k] === at) c[k] = at + 1; else if (c[k] === at + 1) c[k] = at;
      }
      const id = t.colIds[at];
      t.colIds[at] = t.colIds[at + 1];
      t.colIds[at + 1] = id;
      // a lock or link ending on one of the two columns may now run backwards
      const pos = posMap(t);
      for (const lk of t.locks) if (pos.get(lk.from) > pos.get(lk.to)) { const f = lk.from; lk.from = lk.to; lk.to = f; }
      for (const lk of t.links) for (const side of [lk.a, lk.b]) if (pos.get(side[0]) > pos.get(side[1])) side.reverse();
      addLock(t, at, at + 1, 'edit');
    },
    // What a run of cells of one row is: an omission, a lacuna and so on. null clears it.
    state(t, o) {
      if (!t.states[o.label]) throw new Error('There is no row ' + o.label);
      const at = posMap(t);
      const a = at.get(o.from), b = at.get(o.to);
      if (a === undefined || b === undefined) throw new Error('No such column');
      refuseIfLocked(t, a, b);
      const row = t.cells[o.label] || (t.cells[o.label] = {});
      for (let c = Math.min(a, b); c <= Math.max(a, b); c++) {
        if (o.state) row[t.colIds[c]] = o.state; else delete row[t.colIds[c]];
      }
      if (!Object.keys(row).length) delete t.cells[o.label];
      addLock(t, a, b, 'edit');
      dropEmptyColumns(t);
    },
    // A transposition: a passage a witness has in one place, against the same passage in another.
    link(t, o) {
      const at = posMap(t);
      if (!t.states[o.label]) throw new Error('There is no row ' + o.label);
      for (const id of [...o.a, ...o.b]) if (!at.has(id)) throw new Error('No such column');
      const [a1, a2] = o.a.map((id) => at.get(id)), [b1, b2] = o.b.map((id) => at.get(id));
      if (a1 <= b2 && b1 <= a2) throw new Error('The two passages overlap');
      t.linkSeq = (t.linkSeq || 0) + 1;
      t.links.push({ id: t.linkSeq, label: o.label, a: o.a.slice(), b: o.b.slice() });
      addLock(t, a1, a2, 'edit');
      addLock(t, b1, b2, 'edit');
    },
    unlink(t, o) { t.links = t.links.filter((x) => x.id !== o.id); },
    // A word or lemma boundary before this column: on, or off where it would otherwise be.
    cut(t, o) {
      const at = posMap(t).get(o.at);
      if (at === undefined) throw new Error('No such column');
      delete t.cuts.add[o.at]; delete t.cuts.remove[o.at];
      if (o.on === true) t.cuts.add[o.at] = 1; else if (o.on === false) t.cuts.remove[o.at] = 1;
      addLock(t, Math.max(0, at - 1), at, 'edit');
    },
    lock(t, o) {
      const at = posMap(t);
      addLock(t, at.get(o.from), at.get(o.to), 'manual');
    },
    // Takes all locks off these columns, leaving what lies outside them locked.
    unlock(t, o) {
      const at = posMap(t);
      const a = Math.min(at.get(o.from), at.get(o.to)), b = Math.max(at.get(o.from), at.get(o.to));
      const next = [];
      for (const lk of t.locks) {
        const x = at.get(lk.from), y = at.get(lk.to);
        if (y < a || x > b) { next.push(lk); continue; }
        if (x < a) { t.lockSeq++; next.push({ id: t.lockSeq, from: lk.from, to: t.colIds[a - 1], kind: lk.kind }); }
        if (y > b) { t.lockSeq++; next.push({ id: t.lockSeq, from: t.colIds[b + 1], to: lk.to, kind: lk.kind }); }
      }
      t.locks = next;
    },
    // The editor has read this block through: it is all locked, and counts towards measuring the aligner.
    check(t, o) {
      t.checked = !!o.on;
      if (o.on && t.ncols) addLock(t, 0, t.ncols - 1, 'edit');
    },
  };

  const OP_NAMES = { shift: 'Move', merge: 'Merge columns', split: 'Split column', swap: 'Swap columns', state: 'Set cell state', link: 'Mark transposition', unlink: 'Remove transposition', cut: 'Change boundary', lock: 'Lock', unlock: 'Unlock', check: 'Mark as checked' };
  Edit.opName = (op) => OP_NAMES[op.op] || op.op;

  /* Does an operation: it goes in the log only if it works, and if it does not the table is as it was.
     Throws an Error with a message for the editor. */
  Edit.perform = function (t, op, now) {
    Edit.ensure(t);
    const was = snapshot(t);
    const checkedWas = t.checked, linkWas = t.linkSeq;
    try {
      APPLY[op.op](t, op);
    } catch (e) {
      restore(t, was);
      t.checked = checkedWas; t.linkSeq = linkWas;
      throw e;
    }
    if (!t.base) t.base = Object.assign(was, { checked: checkedWas || false, linkSeq: linkWas || 0 });
    t.ops.push(Object.assign({}, op, { when: now || Date.now() }));
    t.redo = [];
    return t;
  };

  function replay(t) {
    restore(t, t.base);
    t.checked = t.base.checked; t.linkSeq = t.base.linkSeq;
    for (const op of t.ops) APPLY[op.op](t, op);
  }

  Edit.undo = function (t) {
    if (!t.ops || !t.ops.length) return null;
    const op = t.ops.pop();
    (t.redo = t.redo || []).push(op);
    replay(t);
    return op;
  };

  Edit.redo = function (t) {
    if (!t.redo || !t.redo.length) return null;
    const op = t.redo.pop();
    APPLY[op.op](t, op);
    t.ops.push(op);
    return op;
  };

  // Back to what the aligner gave. The log goes too.
  Edit.reset = function (t) {
    if (!t.base) return;
    restore(t, t.base);
    t.checked = t.base.checked; t.linkSeq = t.base.linkSeq;
    t.ops = []; t.redo = []; delete t.base;
  };

  // Everything correct? Used by the tests, and before saving anything that came from outside.
  Edit.problems = function (t) {
    const out = [];
    if (t.colIds.length !== t.ncols) out.push('column ids and columns differ');
    if (new Set(t.colIds).size !== t.colIds.length) out.push('column ids repeat');
    for (const l of t.order) {
      const st = t.states[l], c = st.cols;
      if (c.length !== st.n.length) out.push(l + ': a token lost its column');
      for (let k = 0; k < c.length; k++) {
        if (!(c[k] >= 0 && c[k] < t.ncols)) out.push(l + ': column out of range');
        if (k && c[k] <= c[k - 1]) out.push(l + ': tokens out of order');
      }
    }
    const at = posMap(t);
    for (const lk of t.locks) if (!at.has(lk.from) || !at.has(lk.to) || at.get(lk.from) > at.get(lk.to)) out.push('a lock lost its columns');
    return out;
  };

  /* ---------- what a cell is ---------- */

  Edit.stateOf = (t, label, colId) => { const r = t.cells && t.cells[label]; return (r && r[colId]) || null; };
  Edit.unknown = (s) => UNKNOWN.has(s);

  // Columns in a transposition, per row: such a passage is one event, not an omission and an addition.
  Edit.linked = function (t) {
    const out = {};
    if (!t.links || !t.links.length) return out;
    const at = posMap(t);
    for (const lk of t.links) {
      const row = out[lk.label] || (out[lk.label] = new Set());
      for (const side of [lk.a, lk.b]) {
        const x = at.get(side[0]), y = at.get(side[1]);
        if (x === undefined || y === undefined) continue;
        for (let c = x; c <= y; c++) row.add(c);
      }
    }
    return out;
  };

  /* ---------- word and lemma boundaries ---------- */

  // A boundary before column c: by default where most witnesses begin a word; the editor can add or remove.
  Edit.cutMap = function (t) {
    const starts = new Int32Array(t.ncols), have = new Int32Array(t.ncols);
    for (const l of t.order) {
      const st = t.states[l];
      if (st.layer === 'ac') continue;
      st.cols.forEach((c, k) => {
        have[c]++;
        const f = st.from[k];
        if (f === 0 || /\s/.test(st.dip[f - 1] || '') || /[।॥|]/.test(st.dip[f - 1] || '')) starts[c]++;
      });
    }
    const out = new Uint8Array(t.ncols);
    if (t.ncols) out[0] = 1;
    for (let c = 1; c < t.ncols; c++) if (have[c] && starts[c] * 2 >= have[c]) out[c] = 1;
    if (t.cuts) {
      t.colIds.forEach((id, c) => {
        if (t.cuts.add[id]) out[c] = 1;
        if (t.cuts.remove[id]) out[c] = 0;
      });
    }
    return out;
  };

  /* Variation units: stretches between boundaries where the witnesses differ, each with its readings.
     [{from, to, readings: [{n, wits}], missing: [{wit, state}]}] */
  Edit.units = function (t) {
    const grid = Collate.grid(t);
    const rows = t.order.map((l, r) => ({ l, st: t.states[l], g: grid[r] }));
    const cuts = Edit.cutMap(t);
    const variant = Collate.variantColumns(t, grid);
    const out = [];
    const finish = (a, z) => {
      let any = false;
      for (let c = a; c <= z && !any; c++) any = !!variant[c];
      if (!any) return;
      const readings = new Map(), missing = [];
      for (const { l, st, g } of rows) {
        let text = '', state = null, lost = false;
        for (let c = a; c <= z; c++) {
          const k = g[c];
          const s = Edit.stateOf(t, l, t.colIds[c]);
          if (s && UNKNOWN.has(s)) state = s;
          if (k >= 0) { if (st.n[k] === Norm.GAP) lost = true; else text += st.n[k]; }
        }
        if (state || lost) { missing.push({ wit: l, state: state || 'lac' }); continue; }
        if (!readings.has(text)) readings.set(text, []);
        readings.get(text).push(l);
      }
      out.push({ from: a, to: z, readings: Array.from(readings, ([n, wits]) => ({ n, wits })), missing });
    };
    let a = 0;
    for (let c = 1; c <= t.ncols; c++) {
      if (c === t.ncols || cuts[c]) { finish(a, c - 1); a = c; }
    }
    return out;
  };

  /* ---------- places worth a look ---------- */

  /* What the aligner tends to get wrong. Each: {kind, c1, c2, label, text, fix}. These are prompts to look,
     not findings: the editor decides. */
  Edit.KINDS = {
    review: 'A lock no longer fits the text',
    transposition: 'Perhaps a transposition',
    scatter: 'A reading broken into pieces',
    isolated: 'A few letters alone between gaps',
    consensus: 'Little agreement here',
    markup: 'Marked text among the differences',
    rule: 'Differs only because a rule acted on one side',
  };
  Edit.attention = function (t, opts) {
    const o = Object.assign({ scatterWindow: 12, scatterGaps: 3, isolated: 2, isolatedGap: 5, transposeMin: 6 }, opts);
    const grid = Collate.grid(t);
    const rows = t.order.map((l, r) => ({ l, st: t.states[l], g: grid[r] })).filter((x) => x.st.layer !== 'ac');
    const out = [];
    const nr = rows.length;
    const variant = Collate.variantColumns(t, grid);
    if (nr < 2) return out;
    for (const rv of t.review || []) out.push({ kind: 'review', c1: 0, c2: 0, label: rv.label || '', text: rv.why, review: rv.id });

    // islands of each row, against the gaps between them
    for (const { l, st } of rows) {
      const cols = st.cols;
      const isl = [];
      for (let k = 0; k < cols.length; k++) {
        if (k && cols[k] === cols[k - 1] + 1) isl[isl.length - 1].k2 = k;
        else isl.push({ k1: k, k2: k });
      }
      // a few letters alone
      isl.forEach((x, i) => {
        if (i === 0 || i === isl.length - 1) return;
        const len = x.k2 - x.k1 + 1;
        const gapL = cols[x.k1] - cols[isl[i - 1].k2] - 1, gapR = cols[isl[i + 1].k1] - cols[x.k2] - 1;
        if (len <= o.isolated && gapL >= o.isolatedGap && gapR >= o.isolatedGap) {
          out.push({ kind: 'isolated', c1: cols[x.k1], c2: cols[x.k2], label: l, text: l + ': “' + st.n.slice(x.k1, x.k2 + 1).join('') + '” stands alone' });
        }
      });
      // many breaks close together
      let i = 0;
      while (i + o.scatterGaps < isl.length) {
        const span = cols[isl[i + o.scatterGaps].k1] - cols[isl[i].k2];
        if (span <= o.scatterWindow) {
          let j = i + o.scatterGaps;
          while (j + 1 < isl.length && cols[isl[j + 1].k1] - cols[isl[j].k2] <= o.scatterWindow) j++;
          out.push({ kind: 'scatter', c1: cols[isl[i].k2], c2: cols[isl[j].k1], label: l, text: l + ': ' + (j - i) + ' breaks close together' });
          i = j;
        } else i++;
      }
    }

    // a passage a witness lacks here and alone has there
    const stretches = (test) => {
      const res = [];
      for (const row of rows) {
        let a = -1;
        for (let c = 0; c <= t.ncols; c++) {
          const on = c < t.ncols && test(row, c);
          if (on && a < 0) a = c;
          if (!on && a >= 0) { if (c - a >= 1) res.push({ row, a, z: c - 1 }); a = -1; }
        }
      }
      return res;
    };
    const others = (row, c) => rows.filter((x) => x !== row && x.g[c] >= 0);
    const extra = stretches((row, c) => row.g[c] >= 0 && !others(row, c).length);
    const lacking = stretches((row, c) => row.g[c] < 0 && others(row, c).length === nr - 1);
    const spell = (row, a, z, own) => {
      let s = '';
      for (let c = a; c <= z; c++) {
        if (own) { if (row.g[c] >= 0) s += row.st.n[row.g[c]]; continue; }
        const x = others(row, c)[0];
        if (x) s += x.st.n[x.g[c]];
      }
      return s;
    };
    for (const e of extra) {
      const text = spell(e.row, e.a, e.z, true);
      if (text.length < o.transposeMin) continue;
      for (const m of lacking) {
        if (m.row !== e.row) continue;
        const missing = spell(m.row, m.a, m.z, false);
        if (missing === text) {
          out.push({
            kind: 'transposition', c1: Math.min(e.a, m.a), c2: Math.max(e.z, m.z), label: e.row.l, text: e.row.l + ': “' + text + '” is here and missing there',
            fix: { op: 'link', label: e.row.l, a: [t.colIds[e.a], t.colIds[e.z]], b: [t.colIds[m.a], t.colIds[m.z]] },
          });
        }
      }
    }

    // low consensus, and differences that are only markup or only a rule
    const top = (c) => {
      const counts = new Map();
      let n = 0;
      for (const x of rows) {
        const k = x.g[c];
        if (k < 0) continue;
        const v = x.st.n[k];
        if (v === Norm.GAP) continue;
        n++;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      let best = 0;
      for (const v of counts.values()) if (v > best) best = v;
      return { best, n };
    };
    if (nr >= 3) {
      let a = -1;
      for (let c = 0; c <= t.ncols; c++) {
        let low = false;
        if (c < t.ncols && variant[c]) { const { best } = top(c); low = best * 2 <= nr; }
        if (low && a < 0) a = c;
        if (!low && a >= 0) { if (c - a >= 3) out.push({ kind: 'consensus', c1: a, c2: c - 1, label: '', text: 'No reading has a majority for ' + (c - a) + ' columns' }); a = -1; }
      }
    }
    for (let c = 0; c < t.ncols; c++) {
      if (!variant[c]) continue;
      let marked = null, ruled = 0, plain = 0;
      for (const x of rows) {
        const k = x.g[c];
        if (k < 0) { plain++; continue; }
        const fl = x.st.flags[k] || [];
        const m = fl.find((f) => f === 'unclear' || f.startsWith('ignored:') || f === 'add' || f === 'del');
        if (m) marked = x.l + ' ' + m.replace('ignored:', '');
        const r = x.st.rules[k] || [];
        if (r.some((id) => { const def = Norm.rule(id); return def && ['sandhi', 'nasal', 'gemination'].includes(def.cls); })) ruled++; else plain++;
      }
      if (marked) out.push({ kind: 'markup', c1: c, c2: c, label: '', text: marked });
      else if (ruled && plain) out.push({ kind: 'rule', c1: c, c2: c, label: '', text: 'A rule changed some witnesses here and not others' });
    }
    return out.sort((x, y) => x.c1 - y.c1 || x.c2 - y.c2);
  };

  /* ---------- how close was the aligner? ---------- */

  /* Pairs of tokens that share a column, in what the aligner gave against what the editor made of it.
     -> {recall, precision, pairs} or null if nothing has been corrected. */
  Edit.againstCorrections = function (t) {
    const base = t.base;
    let inNow = 0, inWas = 0, both = 0;
    // for one pair of rows: for each token of the first, which token of the second shares its column
    const partners = (a, b, out) => {
      let x = 0, y = 0;
      while (x < a.length && y < b.length) {
        if (a[x] === b[y]) { out[x] = y; x++; y++; } else if (a[x] < b[y]) { out[x] = -1; x++; } else y++;
      }
      while (x < a.length) out[x++] = -1;
    };
    const labels = t.order;
    for (let i = 0; i < labels.length; i++) {
      const nowA = t.states[labels[i]].cols, wasA = base ? base.cols[labels[i]] : nowA;
      const p1 = new Int32Array(nowA.length), p2 = new Int32Array(nowA.length);
      for (let j = i + 1; j < labels.length; j++) {
        const nowB = t.states[labels[j]].cols, wasB = base ? base.cols[labels[j]] : nowB;
        partners(nowA, nowB, p1);
        partners(wasA, wasB, p2);
        for (let x = 0; x < nowA.length; x++) {
          if (p1[x] >= 0) inNow++;
          if (p2[x] >= 0) inWas++;
          if (p1[x] >= 0 && p1[x] === p2[x]) both++;
        }
      }
    }
    return { recall: inNow ? both / inNow : 1, precision: inWas ? both / inWas : 1, pairs: inNow, moved: inNow - both };
  };

  /* ---------- aligning again without losing what the editor has done ---------- */

  // From each offset in the old text to the same letter in the new, or -1 where it has gone. Myers' diff, on
  // what lies between the common start and end, which after an edit is short.
  Edit.offsetMap = function (a, b, limit) {
    const map = new Int32Array(a.length + 1).fill(-1);
    let s = 0;
    while (s < a.length && s < b.length && a[s] === b[s]) { map[s] = s; s++; }
    let e = 0;
    while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) { map[a.length - 1 - e] = b.length - 1 - e; e++; }
    map[a.length] = b.length;
    const n = a.length - s - e, m = b.length - s - e;
    if (!n || !m) return map;
    const max = Math.min(n + m, limit || 2000);
    const v = new Int32Array(2 * max + 2);
    const trace = [];
    const off = max;
    let found = -1;
    for (let d = 0; d <= max && found < 0; d++) {
      trace.push(v.slice(off - d - 1 < 0 ? 0 : off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[s + x] === b[s + y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
    }
    if (found < 0) return map; // too different to follow: what is between stays unmapped, and locks there go to review
    let x = n, y = m;
    for (let d = found; d > 0; d--) {
      const saved = trace[d];
      const base = off - d - 1 < 0 ? 0 : off - d - 1;
      const get = (k) => saved[off + k - base];
      const k = x - y;
      const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
      const px = get(prevK), py = px - prevK;
      while (x > px && y > py && x > 0 && y > 0 && a[s + x - 1] === b[s + y - 1]) { x--; y--; map[s + x] = s + y; }
      x = px; y = py;
    }
    while (x > 0 && y > 0 && a[s + x - 1] === b[s + y - 1]) { x--; y--; map[s + x] = s + y; }
    return map;
  };

  // locked columns as separate stretches, in order
  function regions(t) {
    const m = Edit.lockMap(t);
    const out = [];
    let a = -1;
    for (let c = 0; c <= t.ncols; c++) {
      const on = c < t.ncols && m[c] > 0;
      if (on && a < 0) a = c;
      if (!on && a >= 0) { out.push({ a, b: c - 1 }); a = -1; }
    }
    return out;
  }

  Edit.hasLocks = (t) => !!(t && t.locks && t.locks.length);

  // Which old row a new state continues: the same label, or the same witness (a correction added or gone).
  function sourceOf(old, st, label) {
    if (old.states[label]) return label;
    const same = old.order.filter((l) => old.states[l].siglum === st.siglum);
    if (!same.length) return null;
    return same.find((l) => old.states[l].layer === 'pc') || same[0];
  }

  /* Aligns next (a table with its new states, their tokens but no columns) around the locks of old.
     Locked stretches keep their columns exactly and split what remains into separate alignments, so nothing can
     cross them. A witness new to the table is fitted in afterwards, without moving anything.
     align: (rows, opts) -> {order, cols, ncols}. -> next, completed. */
  Edit.recollate = async function (old, next, align, now) {
    Edit.ensure(old);
    const labels = Object.keys(next.states);
    const src = {}, maps = {};
    for (const l of labels) {
      src[l] = sourceOf(old, next.states[l], l);
      if (src[l]) maps[l] = Edit.offsetMap(old.states[src[l]].dip, next.states[l].dip);
    }
    const tied = labels.filter((l) => src[l]);
    const free = labels.filter((l) => !src[l]);
    const kept = [];
    const review = (old.review || []).slice();
    const cursor = {};
    for (const l of labels) cursor[l] = 0;
    const lastEnd = Object.assign({}, cursor);
    let seq = (old.lockSeq || 0);
    const spellOld = (a, b) => old.order.map((l) => {
      const st = old.states[l];
      const k1 = lower(st.cols, a), k2 = lower(st.cols, b + 1);
      return l + ': ' + (st.n.slice(k1, k2).join('') || '–');
    }).join(' · ');

    for (const R of regions(old)) {
      const entries = {};
      let why = null;
      for (const l of tied) {
        const os = old.states[src[l]], ns = next.states[l], map = maps[l];
        const k1 = lower(os.cols, R.a), k2 = lower(os.cols, R.b + 1); // tokens k1..k2-1 lie in the lock
        if (k1 < k2) {
          // tokens with no letter of their own (the a a consonant implies) share a start with the next one
          const among = k1 - lower(os.from, os.from[k1]);
          const nk = lower(ns.from, map[os.from[k1]] < 0 ? Infinity : map[os.from[k1]]) + among;
          const count = k2 - k1;
          for (let j = 0; j < count && !why; j++) {
            const mapped = map[os.from[k1 + j]];
            if (mapped < 0 && !(k1 + j === 0)) { why = l + ': the text has changed here'; break; }
            const want = k1 + j === 0 ? 0 : mapped;
            const at = nk + j;
            if (ns.from[at] !== want || ns.n[at] !== os.n[k1 + j]) why = l + ': the text has changed here';
          }
          if (why) break;
          if (nk < lastEnd[l]) { why = l + ': the text has moved here'; break; }
          entries[l] = { ks: nk, ke: nk + count, rel: os.cols.slice(k1, k2).map((c) => c - R.a) };
        } else {
          // nothing of this row in the lock: it stands before the next token that can still be found
          let pos = ns.dip.length, among = 0;
          for (let j = k2; j < os.from.length; j++) { if (map[os.from[j]] >= 0) { pos = map[os.from[j]]; among = j - lower(os.from, os.from[j]); break; } }
          const nk = Math.min(ns.from.length, lower(ns.from, pos) + among);
          if (nk < lastEnd[l]) { why = l + ': the text has moved here'; break; }
          entries[l] = { ks: nk, ke: nk, rel: [] };
        }
      }
      if (why) {
        seq++;
        review.push({ id: seq, why, was: spellOld(R.a, R.b), when: now || Date.now(), from: old.colIds[R.a], to: old.colIds[R.b] });
        continue;
      }
      for (const l of tied) lastEnd[l] = entries[l].ke;
      kept.push({ R, entries });
    }

    // the stretches around the locks, each aligned by itself
    const out = {};
    for (const l of labels) out[l] = [];
    const ids = [];
    let nextCol = old.nextCol;
    const segment = async (until) => {
      const rows = [];
      for (const l of tied) {
        const n = next.states[l].n.slice(cursor[l], until(l));
        if (n.length) rows.push({ label: l, n });
      }
      if (!rows.length) return;
      const res = await align(rows);
      const base = ids.length;
      for (const r of rows) for (const c of res.cols[r.label]) out[r.label].push(base + c);
      for (let c = 0; c < res.ncols; c++) ids.push(nextCol++);
    };
    for (const { R, entries } of kept) {
      await segment((l) => entries[l].ks);
      const base = ids.length;
      for (const l of tied) {
        for (const c of entries[l].rel) out[l].push(base + c);
        cursor[l] = entries[l].ke;
      }
      for (let c = R.a; c <= R.b; c++) ids.push(old.colIds[c]);
    }
    await segment((l) => next.states[l].n.length);

    let ncols = ids.length;
    // witnesses new to this table go against what the table reads, moving nothing that is there
    for (const l of free) {
      const consensus = [], where = [];
      for (let c = 0; c < ncols; c++) {
        const counts = new Map();
        for (const m of labels) {
          if (!out[m].length) continue;
          const k = lower(out[m], c);
          if (out[m][k] === c) { const v = next.states[m].n[k]; if (v !== Norm.GAP) counts.set(v, (counts.get(v) || 0) + 1); }
        }
        let best = null, bn = 0;
        for (const [v, n] of counts) if (n > bn) { best = v; bn = n; }
        if (best !== null) { consensus.push(best); where.push(c); }
      }
      const res = await align([{ label: '\u0000table', n: consensus }, { label: l, n: next.states[l].n }], { plain: true });
      const conCols = res.cols['\u0000table'], myCols = res.cols[l];
      // walk the pair's columns: a letter beside the table's goes in that column, any other in a new one
      const place = new Map();
      conCols.forEach((pc, i) => place.set(pc, where[i]));
      const inserted = []; // new columns as [before which old column, ...]
      const mine = [];
      let lastOld = -1;
      for (const pc of myCols) {
        if (place.has(pc)) { lastOld = place.get(pc); mine.push({ old: lastOld }); } else { const before = (() => { let p = pc + 1; while (p < res.ncols && !place.has(p)) p++; return p < res.ncols ? place.get(p) : ncols; })(); inserted.push(before); mine.push({ before }); }
      }
      if (inserted.length) {
        const shiftAt = new Int32Array(ncols + 1);
        for (const b of inserted) shiftAt[b]++;
        const newPos = new Int32Array(ncols + 1);
        let add = 0;
        for (let c = 0; c <= ncols; c++) { add += shiftAt[c]; newPos[c] = c + add; }
        for (const m of labels) out[m] = out[m].map((c) => newPos[c]);
        const added = new Int32Array(ncols + 1);
        const newIds = new Array(ncols + inserted.length);
        for (let c = 0; c < ncols; c++) newIds[newPos[c]] = ids[c];
        const placed = [];
        for (const x of mine) {
          if (x.old !== undefined) placed.push(newPos[x.old]);
          else { const c = newPos[x.before] - shiftAt[x.before] + added[x.before]; added[x.before]++; placed.push(c); newIds[c] = nextCol++; }
        }
        out[l] = placed;
        ids.length = 0;
        ids.push(...newIds);
        ncols = ids.length;
      } else out[l] = mine.map((x) => x.old);
    }

    for (const l of labels) next.states[l].cols = out[l];
    const live = new Set(ids);
    next.ncols = ncols;
    next.colIds = ids.slice();
    next.nextCol = nextCol;
    next.order = old.order.filter((l) => labels.includes(l)).concat(labels.filter((l) => !old.order.includes(l)));
    next.tree = null;
    next.lockSeq = seq;
    // what was said of columns that are still here stays
    next.locks = old.locks.filter((lk) => live.has(lk.from) && live.has(lk.to));
    next.cells = {};
    for (const [l, row] of Object.entries(old.cells || {})) {
      const kept2 = Object.entries(row).filter(([id]) => live.has(+id));
      if (kept2.length && next.states[l]) next.cells[l] = Object.fromEntries(kept2);
    }
    next.links = (old.links || []).filter((lk) => next.states[lk.label] && [...lk.a, ...lk.b].every((id) => live.has(id)));
    next.linkSeq = old.linkSeq || 0;
    next.cuts = { add: {}, remove: {} };
    for (const side of ['add', 'remove']) for (const id of Object.keys((old.cuts && old.cuts[side]) || {})) if (live.has(+id)) next.cuts[side][id] = 1;
    next.review = review;
    next.ops = [];
    next.checked = !!old.checked && !review.length && !free.length && kept.length > 0;
    delete next.base;
    next.history = (old.history || []).concat({ when: now || Date.now(), correctionsBefore: (old.ops || []).length, locksKept: kept.length, sentToReview: review.length - (old.review || []).length, newWitnesses: free });
    return next;
  };

  ME.CollateEdit = Edit;
})(window.ME);
