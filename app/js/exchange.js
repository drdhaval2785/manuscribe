'use strict';
/* Two copies of one edition, compared and merged. Each package says, by the SHA-256 of its files, what it holds,
   and the edition remembers what both copies knew at the last exchange, so that a change made on one side only is
   taken from that side. What both sides changed is shown for the editor to choose, and nothing is chosen for them
   but the default of keeping their own.

   Decisions are never chosen between: both logs are kept whole. Where the two copies decided one place
   differently, both decisions stay and the place is marked for the editor to settle. Before any merge both
   copies are kept whole in the browser, until the editor deletes them. */
(function (ME) {
  const { U, Edition, Store, Zip, Collate, CollateEdit: E } = ME;
  const X = {};

  const text = (v) => Edition.canonical(v === undefined ? null : v);
  const same = (a, b) => text(a) === text(b);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // This browser's copy, as a package would hold it.
  X.mine = async function (ed) {
    const { files } = await Edition.buildPackage(ed);
    return Edition.readPackage(new Map(files.map((f) => [f.name, f.data])));
  };

  async function hashes(pkg) {
    const out = new Map();
    for (const [name, t] of pkg.files) if (Edition.HASHED(name)) out.set(name, await Edition.hashText(t));
    return out;
  }

  /* What happened to one file: same; mine or theirs (changed on that side only); both; or new on one side.
     Without a record of the last exchange, any difference counts as both. */
  const status = (m, t, b) => (m === t ? 'same' : m === undefined ? 'theirs-new' : t === undefined ? 'mine-new' : b !== undefined && m === b ? 'theirs' : b !== undefined && t === b ? 'mine' : 'both');

  /* ---------- decisions ---------- */

  // A decision, apart from what a log adds to it, so that the same decision in two copies is known as one.
  const fp = (d) => { const c = Object.assign({}, d); for (const k of ['id', 'status', 'supersedes', 'settles', 'why']) delete c[k]; return text(c); };

  /* Brings source's decisions into target. A decision already there is not doubled; one that answers to the
     decision it superseded in the other copy supersedes it here too; one that meets another decision here is a
     conflict. A decision whose columns are not in target's alignment goes to review. -> {added, conflicts, review} */
  X.mergeDecisions = function (target, source, by) {
    E.ensure(target);
    const have = new Map(target.decisions.map((d) => [fp(d), d]));
    const ids = new Map();
    const cols = new Set(target.colIds);
    const out = { added: 0, conflicts: 0, review: 0 };
    for (const d of (source && source.decisions) || []) {
      const f = fp(d);
      if (have.has(f)) { ids.set(d.id, have.get(f).id); continue; }
      target.decisionSeq = (target.decisionSeq || 0) + 1;
      const n = Object.assign({}, d, { id: 'd' + target.decisionSeq });
      delete n.supersedes; delete n.settles;
      if (d.supersedes && ids.has(d.supersedes)) n.supersedes = ids.get(d.supersedes);
      if (d.settles) { const s = d.settles.map((x) => ids.get(x)).filter(Boolean); if (s.length) n.settles = s; }
      ids.set(d.id, n.id);
      if (n.status === 'accepted' || n.status === 'conflict') {
        if (!cols.has(n.from) || !cols.has(n.to)) {
          n.status = 'review';
          n.why = 'it came from another copy of the edition, and its columns are not in this alignment';
          target.lockSeq = (target.lockSeq || 0) + 1;
          target.review.push({ id: target.lockSeq, why: 'A decision from another copy (' + n.type + ') has no place in this alignment: ' + (n.label || n.text || ''), was: JSON.stringify(n.quote || {}), when: Date.now(), from: n.from, to: n.to });
          out.review++;
        } else {
          const cur = target.decisions.find((x) => x.key === n.key && x.status === 'accepted');
          if (!cur) n.status = 'accepted';
          else if (n.supersedes === cur.id || (n.settles || []).includes(cur.id)) {
            cur.status = 'superseded';
            for (const r of target.decisions) if (r.key === n.key && r.status === 'conflict' && (n.settles || []).includes(r.id)) r.status = 'superseded';
            n.status = 'accepted';
          } else { n.status = 'conflict'; out.conflicts++; }
        }
      }
      target.decisions.push(n);
      have.set(f, n);
      out.added++;
    }
    // a merge closes the undo log, as aligning again does
    if (out.added) {
      target.ops = []; delete target.base; target.redo = [];
      target.history = (target.history || []).concat({ when: Date.now(), merged: Object.assign({ from: by || '' }, out) });
    }
    return out;
  };

  // Does the alignment itself differ, apart from decisions?
  const ALIGN = ['colIds', 'locks', 'cells', 'links', 'cuts'];
  const alignmentOf = (t) => { const o = {}; for (const k of ALIGN) o[k] = t[k]; o.cols = Object.fromEntries(Object.entries(t.states || {}).map(([l, s]) => [l, s.cols])); return o; };

  /* ---------- lists and settings in edition.json ---------- */

  /* Three-way, key by key. A conflict is recorded in conf with an id, and resolved by choices[id], else mine. */
  function merge3(m, t, b, path, conf, choices) {
    if (same(m, t)) return m;
    if (b !== undefined && same(m, b)) return t;
    if (b !== undefined && same(t, b)) return m;
    if (m === undefined && b === undefined) return t;
    if (t === undefined && b === undefined) return m;
    if (isObj(m) && isObj(t) && (b === undefined || isObj(b))) {
      const r = {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) {
        const v = merge3(m[k], t[k], b ? b[k] : undefined, path.concat(k), conf, choices);
        if (v !== undefined) r[k] = v;
      }
      return r;
    }
    const id = path.join(' › ');
    conf.push({ id, mine: m, theirs: t });
    return choices && choices[id] === 'theirs' ? t : m;
  }

  /* Lists whose items stand alone (evidence, registers): an item is kept if both have it, or if it is new on the
     side that has it; one the other side has removed since the last exchange goes. Ids that clash are renumbered. */
  function mergeSet(m, t, b, prefix) {
    const key = (x) => { const c = Object.assign({}, x); delete c.id; return text(c); };
    const inB = new Set((b || []).map(key)), inM = new Set((m || []).map(key)), inT = new Set((t || []).map(key));
    const out = [];
    for (const x of m || []) if (inT.has(key(x)) || !inB.has(key(x))) out.push(x);
    const ids = new Set(out.map((x) => x.id));
    let seq = Math.max(0, ...[...m || [], ...t || []].map((x) => parseInt(String(x.id || '').replace(/\D/g, ''), 10) || 0));
    for (const x of t || []) {
      if (inM.has(key(x)) || inB.has(key(x))) continue;
      const y = Object.assign({}, x);
      if (ids.has(y.id)) y.id = prefix + (++seq);
      ids.add(y.id);
      out.push(y);
    }
    return { list: out, seq };
  }

  // Items with a key of their own (links by block, works by id): each three-way.
  function mergeKeyed(m, t, b, keyOf, path, conf, choices) {
    const map = (xs) => new Map((xs || []).map((x) => [keyOf(x), x]));
    const M = map(m), T = map(t), B = map(b);
    const out = [];
    for (const k of new Set([...M.keys(), ...T.keys()])) {
      const v = merge3(M.get(k), T.get(k), b ? (B.has(k) ? B.get(k) : null) : undefined, path.concat(k), conf, choices);
      if (v !== undefined && v !== null) out.push(v);
    }
    return out;
  }

  const SKIP = new Set(['id', 'schema', 'created', 'modified', 'lastPackage', 'exchange', 'github', 'witnesses']);

  function mergeHead(m, t, b, conf, choices) {
    const out = {};
    for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) {
      if (SKIP.has(k)) continue;
      const bk = b ? (k in b ? b[k] : undefined) : undefined;
      if (k === 'evidence' || k === 'registers') {
        const r = mergeSet(m[k], t[k], b ? b[k] || [] : null, k === 'evidence' ? 'ev' : 'rg');
        out[k] = r.list;
        out[k === 'evidence' ? 'evidenceSeq' : 'registerSeq'] = Math.max(r.seq, m[k === 'evidence' ? 'evidenceSeq' : 'registerSeq'] || 0, t[k === 'evidence' ? 'evidenceSeq' : 'registerSeq'] || 0);
      } else if (k === 'evidenceSeq' || k === 'registerSeq') {
        if (!(k in out)) out[k] = Math.max(m[k] || 0, t[k] || 0);
      } else if (k === 'links') out[k] = mergeKeyed(m[k], t[k], b ? b[k] || [] : undefined, (x) => x.work + '|' + x.unit, ['links'], conf, choices);
      else if (k === 'works') out[k] = mergeKeyed(m[k], t[k], b ? b[k] || [] : undefined, (x) => x.id, ['works'], conf, choices);
      else {
        const v = merge3(m[k], t[k], bk, [k], conf, choices);
        if (v !== undefined) out[k] = v;
      }
    }
    return out;
  }

  // A witness's entry in the edition (group, streams, declarations), without where it is kept.
  const entry = (w) => { if (!w) return w; const c = Object.assign({}, w); delete c.dir; delete c.projectId; return c; };

  /* ---------- comparing ---------- */

  /* What differs between this browser's copy and another, and what merging would do.
     -> {sameEdition, by, made, hasBase, witnesses: [...], tables: [...], conflicts: [...], lists: {...}} */
  X.compare = async function (ed, mine, theirs) {
    const base = ed.exchange || null;
    const hm = await hashes(mine), ht = await hashes(theirs);
    const bh = (base && base.files) || {};
    const r = { sameEdition: theirs.head.id === ed.id, title: theirs.head.title || '', by: (theirs.manifest && theirs.manifest.by) || '', made: (theirs.manifest && theirs.manifest.made) || '', hasBase: !!base, witnesses: [], tables: [], conflicts: [], lists: {} };
    const dirs = [...new Set([...mine.witnesses.map((x) => x.dir), ...theirs.witnesses.map((x) => x.dir)])];
    for (const dir of dirs) {
      const path = 'witnesses/' + dir + '/project.json';
      const m = mine.witnesses.find((x) => x.dir === dir), t = theirs.witnesses.find((x) => x.dir === dir);
      const st = status(hm.get(path), ht.get(path), bh[path]);
      r.witnesses.push({ dir, siglum: (m || t).w.siglum, status: st, lines: m && t && st !== 'same' ? X.lineDiff(m.p, t.p) : [], choice: st === 'theirs' || st === 'theirs-new' ? 'theirs' : 'mine' });
    }
    const names = [...new Set([...mine.tables.map((x) => x.name), ...theirs.tables.map((x) => x.name)])];
    for (const name of names) {
      const m = mine.tables.find((x) => x.name === name), t = theirs.tables.find((x) => x.name === name);
      const st = status(hm.get(name), ht.get(name), bh[name]);
      const tb = (m || t).table;
      const row = { name, work: tb.work, unit: tb.unit, status: st, base: st === 'theirs' || st === 'theirs-new' ? 'theirs' : 'mine', incoming: 0, conflicts: 0, review: 0, alignmentKept: true };
      if (m && t) {
        const [target, source] = row.base === 'theirs' ? [clone(t.table), m.table] : [clone(m.table), t.table];
        const res = X.mergeDecisions(target, source);
        Object.assign(row, { incoming: res.added, conflicts: res.conflicts, review: res.review });
        // their corrections to the alignment are kept only if theirs is the table taken
        if (st === 'both' && !same(alignmentOf(m.table), alignmentOf(t.table))) row.alignmentKept = false;
      } else if (t) row.incoming = (t.table.decisions || []).length;
      r.tables.push(row);
    }
    const conf = [];
    mergeHead(mine.head, theirs.head, base ? base.head : null, conf, null);
    // witness entries common to both
    for (const t of theirs.witnesses) {
      const m = mine.witnesses.find((x) => x.dir === t.dir);
      if (!m) continue;
      const bw = base && base.head.witnesses ? base.head.witnesses.find((x) => x.dir === t.dir) : undefined;
      merge3(entry(m.w), entry(t.w), base ? entry(bw) || null : undefined, ['witness ' + t.w.siglum], conf, null);
    }
    r.conflicts = conf.map((c) => Object.assign(c, { choice: 'mine' }));
    for (const k of ['evidence', 'registers']) {
      const merged = mergeSet(mine.head[k], theirs.head[k], base ? base.head[k] || [] : null, '').list;
      const key = (x) => { const c = Object.assign({}, x); delete c.id; return text(c); };
      const had = new Set((mine.head[k] || []).map(key));
      r.lists[k] = { incoming: merged.filter((x) => !had.has(key(x))).length, removed: (mine.head[k] || []).filter((x) => !merged.some((y) => key(y) === key(x))).length };
    }
    return r;
  };

  // The lines of a witness that differ: [{label, box, i, mine, theirs}]
  X.lineDiff = function (pm, pt) {
    const out = [];
    for (const label of new Set([...Object.keys(pm.pages || {}), ...Object.keys(pt.pages || {})])) {
      const bm = ((pm.pages[label] || {}).boxes) || {}, bt = ((pt.pages[label] || {}).boxes) || {};
      for (const box of new Set([...Object.keys(bm), ...Object.keys(bt)])) {
        const a = bm[box] || [], b = bt[box] || [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || '') !== (b[i] || '')) out.push({ label, box, i, mine: a[i] || '', theirs: b[i] || '' });
      }
    }
    return out;
  };

  /* ---------- merging ---------- */

  /* Merges theirs into this browser's copy, as the report says, with its choices. Both copies are kept first.
     -> {witnesses, tables, decisions, conflicts, review, kept: merge id} */
  X.merge = async function (ed, mine, theirs, report) {
    const zipOf = (pkg) => Zip.write([...pkg.files].map(([name, data]) => ({ name, data })));
    const kept = { id: U.uid('mg'), edition: ed.id, title: ed.title || '', when: Date.now(), by: report.by || '', mine: await zipOf(mine), theirs: await zipOf(theirs) };
    if (!(await Store.putMerge(kept))) throw new Error('this browser cannot keep the copies before merging, so nothing was merged');
    const base = ed.exchange || null;
    const choices = Object.fromEntries(report.conflicts.map((c) => [c.id, c.choice]));
    const out = { witnesses: 0, tables: 0, decisions: 0, conflicts: 0, review: 0, kept: kept.id };
    // the edition's settings and lists
    const conf = [];
    const head = mergeHead(mine.head, theirs.head, base ? base.head : null, conf, choices);
    for (const [k, v] of Object.entries(head)) ed[k] = v;
    // witnesses
    for (const rw of report.witnesses) {
      const t = theirs.witnesses.find((x) => x.dir === rw.dir);
      let w = ed.witnesses.find((x) => Edition.safeName(x.siglum) === rw.dir);
      if (t && w) {
        const m = mine.witnesses.find((x) => x.dir === rw.dir);
        const bw = base && base.head.witnesses ? base.head.witnesses.find((x) => x.dir === rw.dir) : undefined;
        const merged = merge3(entry(m.w), entry(t.w), base ? entry(bw) || null : undefined, ['witness ' + t.w.siglum], [], choices);
        Object.assign(w, merged);
      }
      if (rw.choice !== 'theirs' || !t) continue;
      const p = clone(t.p);
      if (w) {
        const here = await Store.getProject(w.projectId);
        if (here) await Store.backupNow(here);
        p.id = w.projectId;
      } else {
        p.id = U.uid('ms');
        w = Object.assign(entry(t.w), { projectId: p.id });
        ed.witnesses.push(w);
      }
      p.modified = Date.now();
      await Store.putProject(p);
      out.witnesses++;
    }
    // tables, each with both decision logs
    const tables = [];
    for (const rt of report.tables) {
      const m = mine.tables.find((x) => x.name === rt.name), t = theirs.tables.find((x) => x.name === rt.name);
      let target;
      if (!m) { target = clone(t.table); out.tables++; }
      else if (!t) target = m.table;
      else {
        const [a, b] = rt.base === 'theirs' ? [clone(t.table), m.table] : [clone(m.table), t.table];
        const res = X.mergeDecisions(a, b, report.by);
        out.decisions += res.added; out.conflicts += res.conflicts; out.review += res.review;
        if (rt.base === 'theirs' || res.added) out.tables++;
        target = a;
      }
      tables.push(target);
    }
    await Collate.fromPackage(ed.id, tables);
    await Edition.remember(ed, theirs);
    await Edition.save(ed);
    return out;
  };

  /* What of either copy is missing from a merged one: decisions, evidence and register entries. For checking
     that a merge lost nothing. -> [string] */
  X.lost = function (mine, theirs, merged) {
    const out = [];
    const decs = (pkg) => new Set(pkg.tables.flatMap((x) => (x.table.decisions || []).map((d) => x.name + ' ' + fp(d))));
    const got = decs(merged);
    for (const pkg of [mine, theirs]) for (const d of decs(pkg)) if (!got.has(d)) out.push('decision ' + d.slice(0, 120));
    return out;
  };

  /* ---------- the copies kept before merging ---------- */

  X.kept = (ed) => Store.listMerges(ed.id);

  ME.Exchange = X;
})(window.ME);
