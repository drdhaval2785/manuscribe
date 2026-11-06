// Decisions and the apparatus: faulty entries are caught; decisions never move silently when a witness is
// re-transcribed; each witness reads back from the TEI; the proposed text by majority and trust.
const { launch, checks, sampleProjects } = require('./h');
(async () => {
  const projects = sampleProjects();
  const T = checks('Decisions and apparatus');
  if (!projects) { T.skip('all', 'the owner\'s package is not on this computer'); T.done(); return; }
  const { browser, page } = await launch('apparatus');
  const res = await page.evaluate(async (projects) => {
    const { Model, Collate, CollateEdit: E, Store, Edition, Apparatus: A, Norm } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const ed = Edition.create('t');
    const list = [];
    for (const [s, raw] of Object.entries(projects)) { const p = Model.upgrade(JSON.parse(JSON.stringify(raw))); p.id = 'x' + s; p.modified = 1; await Store.putProject(p); const w = { siglum: s, projectId: p.id, streams: {}, group: s.startsWith('AK') ? 'α' : '' }; ed.witnesses.push(w); list.push({ w, p }); }
    ed.trust = ['AK2', 'LD1', 'AK1'];
    await Store.putEdition(ed);
    await Collate.run(ed, list, 'commentary', {});
    const base = (await Store.getCollation(Collate.keyOf(ed.id, 'commentary', 'c2.1'))).table;
    const P = E.proposal(base, ed.trust);
    ok('the proposal marks only real differences (' + P.count.differ + ' of ' + P.count.words + ' words)', P.count.differ > 5 && P.count.differ < P.count.words / 2);
    ok('ties are settled by the trust order', P.count.trust >= 1);
    const P2 = E.proposal(base, ['AK1', 'LD1', 'AK2']);
    ok('another trust order changes a tie', P2.text !== P.text);
    const faults = [
      ['a witness cited twice', (b) => { b.entries[0].readings[0].wits.push(b.entries[0].lemWits[0]); }],
      ['a witness left out', (b) => { b.entries[0].readings = []; }],
      ['a lemma with no witness', (b) => { b.entries[2].lemWits = []; b.entries[2].readings[0].wits = b.entries[2].readings[0].wits.concat(['AK1', 'AK2']); }],
      ['a reading without witnesses', (b) => { b.entries[3].readings.push({ text: 'x', wits: [] }); }],
      ['a decision in review', (b) => { b.entries[4].review = { why: 'test' }; }],
    ];
    for (const [name, spoil] of faults) {
      const b = A.entries(ed, JSON.parse(JSON.stringify(base)));
      b.entries = b.entries.filter((e) => e.kind !== 'orthographic');
      spoil(b);
      ok('caught: ' + name, A.validate(ed, base, b).some((v) => v.level === 'error'));
    }
    ok('the real apparatus has no errors', !A.validate(ed, base).some((v) => v.level === 'error'));
    // decisions under re-transcription
    let x = 99; const rnd = (n) => { x = (x * 16807) % 2147483647; return x % n; };
    let applied = 0, reviewed = 0, silent = 0;
    for (let run = 0; run < 10; run++) {
      const t = JSON.parse(JSON.stringify(base)); E.ensure(t);
      const places = E.proposal(t, ed.trust).units.filter((u) => u.differs);
      const made = [];
      for (let i = 0; i < 4; i++) {
        const u = places[rnd(places.length)];
        if (made.some((m) => m.key === u.key)) continue;
        const quote = {}; for (const g of u.groups) for (const m of g.members) quote[m.label] = m.text;
        const g = u.groups[rnd(u.groups.length)];
        E.perform(t, { op: 'decide', from: u.fromId, to: u.toId, type: 'selectio', label: g.form.label, quote });
        made.push({ key: u.key, label: g.form.label });
      }
      const next = { unit: t.unit, work: t.work, params: t.params, inputs: {}, absent: [], states: {}, empty: [], tokens: 0 };
      for (const l of t.order) {
        let dip = t.states[l].dip;
        for (let k = 0; k < 3; k++) { const at = rnd(dip.length - 2); dip = dip.slice(0, at) + ['क', 'म', ''][rnd(3)] + dip.slice(at + 1); }
        const split = Norm.split(Norm.apply(dip, { rules: new Set(Norm.settings().on) }), 'letter');
        next.states[l] = { siglum: t.states[l].siglum, layer: t.states[l].layer, dip, ignored: [], gaps: [], runs: [{ from: 0, to: dip.length, folio: '8r', box: 'top', line: 0, offs: 0 }], from: split.map((q) => q.from), n: split.map((q) => q.n), rules: {}, flags: {} };
      }
      const after = await E.recollate(t, next, (rows, extra) => Collate.align(rows, extra), 1);
      const P3 = E.proposal(after, ed.trust);
      for (const m of made) {
        const d = after.decisions.find((y) => y.key === m.key && y.status !== 'superseded');
        const u = P3.units.find((y) => y.key === m.key);
        if ((d && d.status === 'review') || (u && u.review) || P3.orphaned.includes(m.key)) { reviewed++; continue; }
        if (u && u.decision) { const g = u.groups.find((gg) => gg.members.some((mm) => mm.label === m.label)); const own = g && g.members.find((mm) => mm.label === m.label); if (!own || own.text !== d.quote[m.label]) silent++; else applied++; continue; }
        silent++;
      }
    }
    ok('decisions are applied to their own text or reviewed, never moved (' + applied + ' applied, ' + reviewed + ' reviewed)', silent === 0 && applied > 0, silent);
    // TEI keeps every witness's letters
    const b = A.entries(ed, base);
    const xml = A.tei(ed, [Object.assign({ table: base }, b)], ed.works[1]);
    const back = A.readBack(xml);
    const letters = (s) => s.replace(/[\s।॥|‡.,;:]/g, '');
    for (const s of ['AK1', 'AK2', 'LD1']) {
      const st = base.states[s] || base.states[s + 'pc'];
      let dip = '', at = 0;
      for (const [a1, z1] of st.ignored || []) { dip += st.dip.slice(at, a1); at = z1; }
      dip += st.dip.slice(at);
      ok(s + ' reads back from the TEI letter for letter', letters(dip) === letters(back[s] || ''));
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const S = ME.TEI_SCHEMA;
    let notTei = 0;
    for (const el of Array.from(doc.getElementsByTagName('*'))) { if (!Object.prototype.hasOwnProperty.call(S.elements, el.localName)) notTei++; }
    ok('the TEI is well formed and uses only TEI elements', !doc.getElementsByTagName('parsererror').length && notTei === 0, notTei);
    return out;
  }, projects);
  for (const [n, ok, x] of res) T.check(n, ok, x);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
