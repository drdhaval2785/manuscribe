// Text deleted from the transcriptions after it was collated: it must not come back in what is shown or exported.
// A layered edition, collated and corrected; the lines of two commentaries go, or one block of them; a witness that
// cannot be read keeps its tables; and the Export dialog says when blocks have changed since they were collated.
const { launch, sleep, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('deleted');
  const T = checks('Deleted text stays deleted');
  await page.evaluate(async () => {
    const { Model, Store, Edition } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>', END = '<x-marker type="p-end"/>';
    const lines = (v) => [
      P('b1') + 'alpha beta gamma delta ' + END,
      P('c1-1') + 'commentone first ' + v.c + ' words ' + END,
      P('ca1-1-1') + 'SUBCOMMENT second ' + v.ca + END,
      P('r1-1') + 'OTHERCOMMENT third ' + v.r + END,
      P('b2') + 'epsilon zeta eta theta ' + END,
      P('c2-1') + 'commentone again ' + v.c + END,
      P('ca2-1-1') + 'SUBCOMMENT more ' + v.ca + END,
      P('r2-1') + 'OTHERCOMMENT more ' + v.r + END,
    ];
    const texts = { A: { c: 'one', ca: 'two', r: 'three' }, B: { c: 'oen', ca: 'two', r: 'tree' }, C: { c: 'one', ca: 'too', r: 'three' } };
    const ed = Edition.create('Layers');
    for (const [s, v] of Object.entries(texts)) {
      const L = lines(v);
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'en' }, layoutType: 'linear', lines: { main: L.length }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 }; p.pages = { '1r': { boxes: { main: L } } };
      await Store.putProject(p);
      ed.witnesses.push({ siglum: s, projectId: p.id, streams: {} });
    }
    ed.trust = ['A', 'B', 'C'];
    await Store.putEdition(ed);
    ME.Edition.stepOf[ed.id] = 'witnesses';
    await Edition.show(ed.id);
  });
  await sleep(600);
  const res = await page.evaluate(async () => {
    const { Store, Collate, CollateEdit: E, Release, Edition, CollateView, ExportView, LayerIds } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const ed = Edition.current;
    const load = () => Promise.all(ed.witnesses.map(async (w) => ({ w, p: ME.Model.upgrade(await Store.getProject(w.projectId)) })));
    const layers = ed.works.filter((w) => LayerIds.codeOf(w.id)).map((w) => w.id);
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    const wait = async (f) => { for (let i = 0; i < 500 && !f(); i++) await tick(30); return f(); };
    const del = async (list, re) => { let stamp = Date.now() + 10; for (const { p } of list) { p.pages['1r'].boxes.main = p.pages['1r'].boxes.main.filter((x) => !re.test(x)); p.modified = stamp++; await Store.putProject(p); } };
    const shown = async (l) => { const ws = await Release.works(ed, l); return { units: ws.flatMap((x) => x.recs.map((r) => r.unit)), text: ws.flatMap((x) => x.built.map((b) => b.text)).join(' '), woven: LayerIds.weave(ed, ws.filter((x) => LayerIds.codeOf(x.work.id))).map((b) => b.text).join(' ') }; };
    const stored = async () => (await Store.listCollations(ed.id)).map((r) => r.unit).sort();
    let list = await load();
    for (const w of layers) await Collate.run(ed, list, w, {});
    // the editor's work on the commentaries
    for (const r of await Store.listCollations(ed.id)) if (/L-(ca|r)$/.test(r.work)) { E.perform(r.table, { op: 'lock', from: r.table.colIds[0], to: r.table.colIds[1] }); await Collate.saveTable(ed, r); }
    let s = await shown(list);
    ok('before the deletion, the commentaries are there', /SUBCOMMENT/i.test(s.text) && /OTHERCOMMENT/i.test(s.text) && s.units.length === 8, s.units);

    // one block of a commentary goes
    await del(list, /r2-1/);
    list = await load();
    s = await shown(list);
    ok('one block deleted: not in the export, without collating again', !s.units.includes('r2-1') && s.units.includes('r1-1') && (await stored()).includes('r2-1'), s.units);

    // both commentaries, every line, in every witness
    await del(list, /SUBCOMMENT|OTHERCOMMENT/);
    list = await load();
    s = await shown(list);
    ok('two commentaries deleted: not in the export, without collating again', !/SUBCOMMENT|OTHERCOMMENT/i.test(s.text) && s.units.join() === 'b1,b2,c1-1,c2-1', s.units);
    ok('nor in the text of all layers woven together', !/SUBCOMMENT|OTHERCOMMENT/i.test(s.woven) && /alpha/i.test(s.woven), s.woven.slice(0, 200));
    const pack = await Collate.forPackage(ed.id, ed, list);
    ok('nor in an edition package', pack.length === 4 && !pack.some((t) => /^(ca|r)/.test(t.unit)), pack.map((t) => t.unit));

    // a witness that cannot be read may still have them
    const partly = list.map((x, i) => (i ? x : { w: x.w, p: null }));
    ok('a table is kept if a witness in it could not be read', Collate.orphans(ed, partly, await Store.listCollations(ed.id)).length === 0);

    // Collate, as the button does it: the layers that still have text; then the rest are forgotten
    const reg = Edition.register(ed, list);
    const live = layers.filter((w) => reg[w] && reg[w].order.length);
    ok('the layers with no text left are not among those collated', live.join() === 'L-b,L-c', live);
    await CollateView.collate(ed, list, live, document.createElement('div'), document.createElement('button'), () => {}, false);
    ok('pressing Collate forgets the deleted blocks, in the layers it did not collate too', (await stored()).join() === 'b1,b2,c1-1,c2-1', await stored());
    ok('and the edition knows it', [...(await Collate.summaries(ed.id)).values()].every((x) => !/^(ca|r)/.test(x.unit)));

    // a block still there, with its text changed: said so, in the dialog
    const c0 = await Collate.changedBlocks(ed, list, ['L-b', 'L-c']);
    ok('when nothing has changed, nothing is said', !c0.changed.length && !c0.missing.length, c0);
    const dlg = () => document.querySelector('[data-action="export-stale"]');
    let open = ExportView.open({ kind: 'edition', ed, list, workId: 'L-c' });
    await wait(() => dlg());
    await tick(300);
    ok('the Export dialog says nothing when the blocks are as collated', dlg().hidden);
    document.querySelector('.modal-foot .btn').click();
    await open;
    for (const { p } of list) { p.pages['1r'].boxes.main = p.pages['1r'].boxes.main.map((x) => x.replace('commentone again', 'commentone AGAIN changed')); p.modified = Date.now() + 50; await Store.putProject(p); }
    list = await load();
    const c1 = await Collate.changedBlocks(ed, list, ['L-c']);
    ok('a block whose text has changed is found', c1.changed.join() === 'c2-1' && !c1.missing.length, c1);
    open = ExportView.open({ kind: 'edition', ed, list, workId: 'L-c' });
    await wait(() => dlg() && !dlg().hidden);
    ok('and the Export dialog warns of it, naming the block', dlg() && !dlg().hidden && /c2-1/.test(dlg().textContent) && /Collate/.test(dlg().textContent), dlg() && dlg().textContent);
    document.querySelector('.modal-foot .btn').click();
    await open;
    return out;
  });
  for (const [n, ok, x] of res) T.check(n, ok, x);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exit(1); });
