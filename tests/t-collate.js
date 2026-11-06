// Collation and its correction: tokens back to their lines, a re-run is identical, exchange formats, locks that
// survive random edits, and the editing operations with undo. Uses the owner's package if present.
const { launch, checks, sampleProjects } = require('./h');
(async () => {
  const { browser, page } = await launch('collate');
  const T = checks('Collation and correction');
  const projects = sampleProjects();
  const res = await page.evaluate(async (projects) => {
    const { Model, Collate, CollateEdit: E, Store, Edition, TEI, Norm } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    // a small table by hand, for the operations
    const mk = (rows) => {
      const t = { unit: 'u', order: Object.keys(rows), ncols: rows[Object.keys(rows)[0]].length, states: {}, params: { tokens: 'letter' } };
      for (const [l, row] of Object.entries(rows)) { const n = [], cols = [], from = []; let f = 0; row.forEach((v, c) => { if (v !== '') { n.push(v); cols.push(c); from.push(f); f += v.length; } }); t.states[l] = { siglum: l, layer: 'base', dip: n.join(''), n, cols, from, runs: [], rules: {}, flags: {} }; }
      return E.ensure(t);
    };
    const show = (t, l) => { const g = new Array(t.ncols).fill('–'); t.states[l].cols.forEach((c, k) => { g[c] = t.states[l].n[k]; }); return g.join(''); };
    let t = mk({ A: ['a', 'b', 'c', '', 'd'], B: ['a', '', 'c', 'x', 'd'] });
    E.perform(t, { op: 'shift', label: 'B', k1: 1, k2: 1, delta: -1 });
    ok('a reading moves into an empty cell', show(t, 'B').replace(/–/g, '') === 'acxd' && !E.problems(t).length);
    E.undo(t);
    ok('undo', show(t, 'B') === 'a–cxd');
    t = mk({ A: ['a', 'b', '', 'c'], B: ['a', '', 'b', 'c'] });
    E.perform(t, { op: 'merge', at: t.colIds[1] });
    ok('two half-full columns merge', show(t, 'A') === 'abc' && show(t, 'B') === 'abc');
    t = mk({ A: ['a', 'b', 'c', 'd'], B: ['a', '', '', 'd'] });
    E.perform(t, { op: 'state', label: 'B', from: t.colIds[1], to: t.colIds[2], state: 'lac' });
    const ag = Collate.agreement([t]).of('A', 'B');
    ok('a lacuna is neither agreement nor difference', ag.sites === 2 && ag.same === 2, ag);
    if (!projects) return { out, sample: false };
    const ed = Edition.create('t');
    const list = [];
    for (const [s, raw] of Object.entries(projects)) { const p = Model.upgrade(JSON.parse(JSON.stringify(raw))); p.id = 'x' + s; p.modified = 1; await Store.putProject(p); const w = { siglum: s, projectId: p.id, streams: {} }; ed.witnesses.push(w); list.push({ w, p }); }
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'commentary', {});
    const key = Collate.keyOf(ed.id, 'commentary', 'c2.1');
    const table = (await Store.getCollation(key)).table;
    let bad = 0, count = 0;
    for (const st of Object.values(table.states)) {
      const p = list.find((x) => x.w.siglum === st.siglum).p;
      st.n.forEach((_, k) => { const tok = Collate.token(st, k); count++; const b = tok.src.map((s) => (s.sep !== undefined ? s.sep : TEI.plainText(p.pages[s.folio].boxes[s.box][s.line]).slice(s.offs, s.offs + s.len))).join(''); if (b !== tok.t) bad++; });
    }
    ok('every token of the real block reads back from its line (' + count + ')', count > 2000 && bad === 0, bad);
    const again = await Collate.run(ed, list, 'commentary', { force: true });
    const t2 = (await Store.getCollation(key)).table;
    ok('aligning again gives the same table', JSON.stringify(t2.order.map((l) => t2.states[l].cols)) === JSON.stringify(table.order.map((l) => table.states[l].cols)) && t2.tree === table.tree);
    ok('CollateX table round trip', Object.keys(table.states).every((l) => JSON.stringify(Collate.fromCollateX(table, JSON.parse(JSON.stringify(Collate.toCollateXTable(table)))).states[l].cols) === JSON.stringify(table.states[l].cols)));
    ok('TEI corpus round trip', Object.keys(table.states).every((l) => JSON.stringify(Collate.fromTeiCorpus(table, Collate.toTeiCorpus(table)).states[l].cols) === JSON.stringify(table.states[l].cols)));
    let refused = false;
    try { const cx = Collate.toCollateXTable(table); cx.table[0][cx.table[0].findIndex((c) => c)][0].n = 'XXX'; Collate.fromCollateX(table, cx); } catch (e) { refused = true; }
    ok('an alignment of other text is refused', refused);
    // locks under random edits: kept exactly, or sent to review, never moved
    let x = 4242; const rnd = (n) => { x = (x * 16807) % 2147483647; return x % n; };
    let violations = 0, kept = 0, reviewed = 0;
    for (let run = 0; run < 12; run++) {
      const remake = (src, edits) => {
        const next = { unit: src.unit, work: src.work, params: src.params, inputs: {}, absent: [], states: {}, empty: [], tokens: 0 };
        for (const l of src.order) {
          let dip = src.states[l].dip;
          for (const e of (edits[l] || []).slice().sort((a, b) => b.at - a.at)) dip = dip.slice(0, e.at) + e.text + dip.slice(e.at + 1);
          const split = Norm.split(Norm.apply(dip, { rules: new Set(['punct', 'spaces']) }), 'letter');
          next.states[l] = { siglum: src.states[l].siglum, layer: src.states[l].layer, dip, ignored: [], gaps: [], runs: [{ from: 0, to: dip.length, folio: 'x', box: 'main', line: 0, offs: 0 }], from: split.map((q) => q.from), n: split.map((q) => q.n), rules: {}, flags: {} };
        }
        return next;
      };
      const base = remake(table, {});
      const al = await Collate.align(table.order.map((l) => ({ label: l, n: base.states[l].n })));
      const old = Object.assign({}, base, { order: al.order, ncols: al.ncols });
      for (const l of table.order) old.states[l].cols = al.cols[l];
      E.ensure(old);
      for (let i = 0; i < 3; i++) { const a = rnd(old.ncols - 12); E.perform(old, { op: 'lock', from: old.colIds[a], to: old.colIds[a + 2 + rnd(8)] }); }
      const lm = E.lockMap(old);
      const fp = {};
      old.colIds.forEach((id, c) => { if (lm[c]) { fp[id] = {}; for (const l of old.order) { const k = old.states[l].cols.indexOf(c); fp[id][l] = k < 0 ? null : old.states[l].n[k]; } } });
      const edits = {};
      for (const l of old.order) edits[l] = [{ at: rnd(old.states[l].dip.length - 3), text: ['क', 'ग', 'म'][rnd(3)] }];
      const r2 = await E.recollate(old, remake(old, edits), (rows, extra) => Collate.align(rows, extra), 1);
      if (E.problems(r2).length) violations++;
      reviewed += r2.review.length;
      const at = new Map(r2.colIds.map((id, c) => [id, c]));
      for (const lk of r2.locks) {
        kept++;
        for (let c = at.get(lk.from); c <= at.get(lk.to); c++) for (const l of r2.order) { const k = r2.states[l].cols.indexOf(c); const now = k < 0 ? null : r2.states[l].n[k]; if (fp[r2.colIds[c]] && fp[r2.colIds[c]][l] !== now) violations++; }
      }
    }
    ok('locks hold exactly or go to review under random edits (' + kept + ' kept, ' + reviewed + ' to review)', violations === 0 && kept > 0, violations);
    return { out, sample: true };
  }, projects);
  for (const [n, ok, x] of res.out) T.check(n, ok, x);
  if (!res.sample) T.skip('the real block', 'the owner\'s package is not on this computer');
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
