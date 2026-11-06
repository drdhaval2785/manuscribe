// Two editors, each in a browser of their own, on one edition made here. They exchange packages and reconcile a
// seeded conflict with nothing lost; then the same through a stand-in for GitHub, where a send that is behind is
// refused and PDFs never travel; then a version is issued, and every output carries its version and date.
const { launch, sleep, checks } = require('./h');
const { start } = require('./mock-github');

// in each page: a small tradition, its places, and deciding one of them
const SETUP = () => {
  const { Model, Store, Edition, Collate, CollateEdit: E } = ME;
  const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
  const END = '<x-marker type="p-end"/>';
  window.T = {
    async make() {
      const texts = {
        A: [P('m1') + 'राम वनं गच्छति सीता च लक्ष्मणः अनुगच्छति' + END, P('m2') + 'ततः भरतः आगतः' + END],
        B: [P('m1') + 'राम वनं गच्छति सीता अपि लक्ष्मणः अनुगच्छति' + END, P('m2') + 'ततः भरतः आगत' + END],
        C: [P('m1') + 'रामः वनं गच्छति सीता च लक्ष्मणश्च अनुगच्छति' + END, P('m2') + 'ततः भरतो आगतः' + END],
      };
      const ed = Edition.create('Rāma');
      const list = [];
      for (const [s, lines] of Object.entries(texts)) {
        const p = Model.newProject({ meta: { title: s, siglum: s, repository: 'Library', shelfmark: 'No. ' + s, date: '1700' }, layoutType: 'linear', lines: { main: 4 }, folios: {} });
        p.pdf = { name: s + '.pdf', pages: 1 };
        p.pages = { '1r': { boxes: { main: lines.concat(['', '']) } } };
        Model.upgrade(p);
        await Store.putProject(p);
        const w = { siglum: s, projectId: p.id, streams: {} };
        ed.witnesses.push(w); list.push({ w, p });
      }
      ed.trust = ['A', 'B', 'C'];
      await Store.putEdition(ed);
      await Collate.run(ed, list, 'main', {});
      return ed;
    },
    async list(ed) { const out = []; for (const w of ed.witnesses) out.push({ w, p: Model.upgrade(await Store.getProject(w.projectId)) }); return out; },
    async rec(ed, unit) { return Store.getCollation(Collate.keyOf(ed.id, 'main', unit)); },
    // the place whose readings include this text
    async place(ed, unit, text) {
      const t = E.ensure((await T.rec(ed, unit)).table);
      return E.proposal(t, ed.trust).units.find((u) => u.groups.some((g) => g.form.text.trim() === text));
    },
    async decide(ed, unit, text, who) {
      const rec = await T.rec(ed, unit);
      const t = E.ensure(rec.table);
      const u = E.proposal(t, ed.trust).units.find((x) => x.groups.some((g) => g.form.text.trim() === text));
      const g = u.groups.find((x) => x.form.text.trim() === text);
      const quote = {};
      for (const gg of u.groups) for (const m of gg.members) quote[m.label] = m.text;
      E.perform(t, { op: 'decide', from: u.fromId, to: u.toId, type: 'selectio', label: g.form.label, quote, resp: who });
      await Collate.saveTable(ed, rec);
    },
    async files(ed) { const { files } = await Edition.buildPackage(ed); return files.map((f) => [f.name, f.data]); },
    async exported(ed) { const { files } = await Edition.buildPackage(ed); await Edition.remember(ed, { files: new Map(files.map((f) => [f.name, f.data])), manifest: null }); await Edition.save(ed); return files.map((f) => [f.name, f.data]); },
    async editLine(ed, siglum, from, to) {
      const w = ed.witnesses.find((x) => x.siglum === siglum);
      const p = await Store.getProject(w.projectId);
      p.pages['1r'].boxes.main[0] = p.pages['1r'].boxes.main[0].replace(from, to);
      p.modified = Date.now();
      await Store.putProject(p);
    },
    async lineOf(ed, siglum) { const w = ed.witnesses.find((x) => x.siglum === siglum); return (await Store.getProject(w.projectId)).pages['1r'].boxes.main[0]; },
  };
};

(async () => {
  const T = checks('Sharing and releasing');
  const A = await launch('exchange-a'), B = await launch('exchange-b');
  await A.page.evaluate(SETUP); await B.page.evaluate(SETUP);
  const ok = (rows) => { for (const [n, c, x] of rows) T.check(n, c, x); };

  // A makes the edition and gives B a package
  const p0 = await A.page.evaluate(async () => { const ed = await T.make(); window.ed = ed; return T.exported(ed); });
  T.check('the package says what it holds, by hash', p0.some(([n, d]) => n === 'manifest.json' && /"files"/.test(d)));
  ok(await B.page.evaluate(async (files) => {
    const ed = await ME.Edition.importPackage(new Map(files), () => 'replace');
    window.ed = ed;
    return [['B has the edition, and remembers what it was given', ed && ed.exchange && Object.keys(ed.exchange.files).length > 3]];
  }, p0));

  // both work: B on witness B and some places, A on witness C and some places, and both on one place
  await B.page.evaluate(async () => {
    ed.editor = 'Editor B';
    await T.editLine(ed, 'B', 'अनुगच्छति', 'अनुगच्छत्');
    await T.decide(ed, 'm1', 'राम', 'Editor B');
    await T.decide(ed, 'm1', 'अपि', 'Editor B');
    ME.Layers.addEvidence(ed, { work: 'main', unit: 'm1', key: (await T.place(ed, 'm1', 'अपि')).key, reading: 'अपि', type: 'quotes', source: { label: 'Kosha' } });
    ed.apparatus = Object.assign({}, ed.apparatus, { polarity: 'positive' });
    await ME.Edition.save(ed);
  });
  await A.page.evaluate(async () => {
    ed.editor = 'Editor A';
    await T.editLine(ed, 'C', 'वनं', 'वनम्');
    await T.decide(ed, 'm1', 'च', 'Editor A');
    await T.decide(ed, 'm1', 'लक्ष्मणश्च', 'Editor A');
    ed.apparatus = Object.assign({}, ed.apparatus, { polarity: 'negative' });
    await ME.Edition.save(ed);
  });
  const pB = await B.page.evaluate(() => T.exported(ed));

  // A compares and merges
  ok(await A.page.evaluate(async (files) => {
    const X = ME.Exchange;
    const out = [];
    const o = (n, c, x) => out.push([n, !!c, x]);
    const theirs = ME.Edition.readPackage(new Map(files));
    const mine = await X.mine(ed);
    const r = await X.compare(ed, mine, theirs);
    const st = Object.fromEntries(r.witnesses.map((w) => [w.siglum, w.status]));
    o('witness B changed in theirs only, C here only, A in neither', st.B === 'theirs' && st.C === 'mine' && st.A === 'same', st);
    const m1 = r.tables.find((t) => t.unit === 'm1');
    o('the block both decided in is changed in both, with one conflict', m1.status === 'both' && m1.conflicts === 1 && m1.incoming === 2, m1);
    o('a setting changed on both sides is a choice', r.conflicts.some((c) => /polarity/.test(c.id)), r.conflicts.map((c) => c.id));
    o('their evidence is to be brought in', r.lists.evidence.incoming === 1);
    const res = await X.merge(ed, mine, theirs, r);
    const merged = await X.mine(ed);
    o('nothing of either copy is lost', X.lost(mine, theirs, merged).length === 0, X.lost(mine, theirs, merged));
    o('B’s transcription of B is taken, A’s of C kept', /अनुगच्छत्/.test(await T.lineOf(ed, 'B')) && /वनम्/.test(await T.lineOf(ed, 'C')));
    o('my setting is kept unless I choose theirs', ed.apparatus.polarity === 'negative');
    o('the evidence is here', ME.Layers.evidence(ed).length === 1);
    const t = ME.CollateEdit.ensure((await T.rec(ed, 'm1')).table);
    const P = ME.CollateEdit.proposal(t, ed.trust);
    const conflict = P.units.filter((u) => u.review && u.review.conflict);
    o('the place both decided is marked for review, with both decisions', conflict.length === 1 && conflict[0].review.conflict.length === 2 && new Set(conflict[0].review.conflict.map((d) => d.resp)).size === 2, conflict.map((u) => u.review));
    o('decisions on other places stand', P.units.filter((u) => u.decision && !u.review).length === 2, P.units.filter((u) => u.decision).map((u) => u.text));
    o('the apparatus checks report it', ME.Apparatus.validate(ed, t).some((v) => /decide this place differently/.test(v.text)));
    o('both copies are kept from before the merge', (await ME.Store.listMerges(ed.id)).length === 1);
    window.beforeSettle = { mine, theirs };
    return out;
  }, pB));

  // a version cannot be issued while a conflict stands
  ok(await A.page.evaluate(async () => {
    ed.licence = 'CC BY 4.0';
    for (const w of ed.witnesses) w.rights = 'Library';
    await ME.Edition.save(ed);
    try { await ME.Release.issue(ed, await T.list(ed), '1.0'); return [['an edition with a conflict is not issued', false]]; } catch (e) { return [['an edition with a conflict is not issued', /Not issued/.test(e.message) && /decide differently/.test(e.message), e.message]]; }
  }));

  // the conflict, on screen, and settled there
  await A.page.evaluate(async () => { const list = await T.list(ed); ME.CollateView.open(ed, list, 'main', 'm1', () => {}); });
  await sleep(900);
  const shown = await A.page.evaluate(() => {
    const u = [...document.querySelectorAll('.ct-text .ct-u')].find((x) => x.classList.contains('d-review'));
    if (!u) return null;
    u.click();
    const box = document.querySelector('.ct-conflict');
    return box ? { text: box.innerText, buttons: box.querySelectorAll('button').length } : null;
  });
  T.check('the text view shows both decisions side by side', shown && shown.buttons === 2 && /Editor A/.test(shown.text) && /Editor B/.test(shown.text), shown);
  await A.page.evaluate(() => { [...document.querySelectorAll('.ct-conflict button')].find((b) => b.parentNode.textContent.includes('Editor B')).click(); });
  await sleep(700);
  ok(await A.page.evaluate(async () => {
    document.querySelector('.modal-foot .btn').click();
    await new Promise((r) => setTimeout(r, 400));
    const t = ME.CollateEdit.ensure((await T.rec(ed, 'm1')).table);
    const P = ME.CollateEdit.proposal(t, ed.trust);
    const u = P.units.find((x) => x.groups.some((g) => g.form.text.trim() === 'अपि'));
    return [
      ['keeping one settles it', !P.units.some((x) => x.review) && u.decision && u.decision.label === 'B', u.decision],
      ['and both stay in the history', t.decisions.filter((d) => d.key === u.key).length === 3 && t.decisions.filter((d) => d.key === u.key && d.status === 'superseded').length === 2, t.decisions.filter((d) => d.key === u.key).map((d) => d.status)],
    ];
  }));

  // B takes A's merged copy: no conflict comes back, and the two copies agree
  const pA2 = await A.page.evaluate(() => T.exported(ed));
  ok(await B.page.evaluate(async (files) => {
    const X = ME.Exchange;
    const theirs = ME.Edition.readPackage(new Map(files));
    const mine = await X.mine(ed);
    const r = await X.compare(ed, mine, theirs);
    await X.merge(ed, mine, theirs, r);
    const merged = await X.mine(ed);
    const t = ME.CollateEdit.ensure((await T.rec(ed, 'm1')).table);
    const P = ME.CollateEdit.proposal(t, ed.trust);
    window.textB = P.text;
    return [
      ['B merges A’s copy with no conflict', r.tables.every((x) => !x.conflicts) && !P.units.some((u) => u.review), r.tables],
      ['nothing lost on B’s side either', X.lost(mine, theirs, merged).length === 0, X.lost(mine, theirs, merged)],
      ['B has A’s change to C', /वनम्/.test(await T.lineOf(ed, 'C'))],
    ];
  }, pA2));
  const textA = await A.page.evaluate(async () => ME.CollateEdit.proposal(ME.CollateEdit.ensure((await T.rec(ed, 'm1')).table), ed.trust).text);
  const textB = await B.page.evaluate(() => window.textB);
  T.check('the two copies give the same edited text', textA === textB, [textA, textB]);

  // GitHub, through a stand-in
  const gh = await start('test-token');
  const api = 'http://127.0.0.1:' + gh.port;
  ok(await A.page.evaluate(async (api) => {
    const G = ME.GitHub;
    G.API = api; G.setToken('test-token', false);
    ed.github = { owner: 'o', repo: 'r', branch: 'main', folder: 'edition' };
    const out = [];
    const r1 = await G.push(ed, 'First');
    out.push(['A sends the edition to an empty repository', r1.changed > 5 && ed.github.lastCommit === r1.commit, r1]);
    const r2 = await G.push(ed, 'Again');
    out.push(['a second send with nothing new sends nothing', r2.changed === 0, r2]);
    out.push(['PDFs and binary files are refused', G.refuse('witnesses/A/scan.pdf', 'x') && G.refuse('a.json', new Uint8Array(2)) && !G.refuse('edition.json', '{}')]);
    out.push(['the token is not remembered unless asked', !G.remembered()]);
    return out;
  }, api));
  const files = gh.repo.files('main');
  T.check('the repository holds the package in its folder, and no PDF', files.has('edition/edition.json') && files.has('edition/witnesses/A/project.json') && ![...files.keys()].some((k) => /\.pdf$/.test(k)), [...files.keys()]);
  gh.repo.addFile('main', 'edition/witnesses/A/scan.pdf', '%PDF-1.4 not really');
  ok(await B.page.evaluate(async (api) => {
    const G = ME.GitHub, X = ME.Exchange;
    G.API = api; G.setToken('test-token', false);
    ed.github = { owner: 'o', repo: 'r', branch: 'main', folder: 'edition' };
    const out = [];
    try { await G.push(ed, 'From B'); out.push(['B, who has not fetched, may not send', false]); } catch (e) { out.push(['B, who has not fetched, may not send', !!e.behind, e.message]); }
    const mine = await X.mine(ed);
    const got = await G.fetch(ed.github, mine.files);
    out.push(['a PDF in the repository is not fetched, and is named', got.refused.length === 1 && ![...got.zip.keys()].some((k) => /\.pdf$/.test(k)), got.refused]);
    const theirs = ME.Edition.readPackage(got.zip);
    const r = await X.compare(ed, mine, theirs);
    await X.merge(ed, mine, theirs, r);
    ed.github.lastCommit = got.head;
    await T.decide(ed, 'm2', 'भरतो', 'Editor B');
    const res = await G.push(ed, 'B decides in m2');
    out.push(['after fetching, B sends', res.changed >= 1, res]);
    return out;
  }, api));
  ok(await A.page.evaluate(async () => {
    const G = ME.GitHub, X = ME.Exchange;
    const out = [];
    await T.decide(ed, 'm2', 'आगतः', 'Editor A');
    try { await G.push(ed, 'From A'); out.push(['A, now behind, may not send', false]); } catch (e) { out.push(['A, now behind, may not send', !!e.behind, e.message]); }
    const mine = await X.mine(ed);
    const got = await G.fetch(ed.github, mine.files);
    const theirs = ME.Edition.readPackage(got.zip);
    const r = await X.compare(ed, mine, theirs);
    await X.merge(ed, mine, theirs, r);
    ed.github.lastCommit = got.head;
    const merged = await X.mine(ed);
    out.push(['A fetches B’s decision and keeps its own', X.lost(mine, theirs, merged).length === 0 && (await T.rec(ed, 'm2')).table.decisions.filter((d) => d.status !== 'superseded').length === 2]);
    const res = await G.push(ed, 'A merged');
    out.push(['and then sends', res.changed >= 1]);
    return out;
  }));
  gh.close();

  // issuing a version
  ok(await A.page.evaluate(async () => {
    const out = [];
    const o = (n, c, x) => out.push([n, !!c, x]);
    const list = await T.list(ed);
    // settle what the GitHub round left open, so that the apparatus passes
    const t2 = ME.CollateEdit.ensure((await T.rec(ed, 'm2')).table);
    const open = ME.CollateEdit.proposal(t2, ed.trust).units.filter((u) => u.review);
    for (const u of open) await T.decide(ed, 'm2', u.review.conflict[0].label === 'A' ? u.groups.find((g) => g.members.some((m) => m.label === 'A')).form.text.trim() : u.text.trim(), 'Editor A');
    const ed0 = JSON.parse(JSON.stringify(ed));
    delete ed.licence;
    const checks = await ME.Release.check(ed, list);
    o('without a licence the self-check fails', checks.some((c) => c.level === 'fail' && /licence/.test(c.text)), checks.filter((c) => c.level === 'fail'));
    ed.licence = ed0.licence;
    o('the self-check covers the IDE areas', ['Bibliographic description', 'The sources', 'Editorial method', 'Text and apparatus', 'Data and access', 'Sustainability'].every((a) => checks.some((c) => c.area === a)));
    let res;
    try { res = await ME.Release.issue(ed, list, '1.0'); } catch (e) { o('version 1.0 is issued', false, [e.message, (e.checks || []).filter((c) => c.level === 'fail')]); return out; }
    const zip = await ME.Zip.read(res.zip);
    const txt = (n) => ME.Zip.text(zip.get(n));
    const date = ed.issued.date;
    const long = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const stamp = 'version 1.0, issued ' + long;
    o('the citation names the version and its date', ME.Publish.citation(ed).includes(stamp), ME.Publish.citation(ed));
    o('the release holds the package and every output', ['edition.json', 'manifest.json', 'output/main/reader.html', 'output/main/apparatus.xml', 'output/main/apparatus.txt', 'output/main/indices.txt', 'output/main/latex/edition.tex', 'output/main/edition.pdf', 'CITATION.cff', '.zenodo.json', 'RELEASE.txt'].every((n) => zip.has(n)), [...zip.keys()]);
    o('each output carries the version and date', ['output/main/reader.html', 'output/main/apparatus.xml', 'output/main/apparatus.txt', 'output/main/latex/edition.tex', 'RELEASE.txt'].every((n) => txt(n).includes(stamp)), ['output/main/reader.html', 'output/main/apparatus.xml', 'output/main/apparatus.txt', 'output/main/latex/edition.tex'].filter((n) => !txt(n).includes(stamp)));
    o('CITATION.cff and the Zenodo metadata', /version: "1.0"/.test(txt('CITATION.cff')) && txt('CITATION.cff').includes('date-released: ' + date) && /license: CC-BY-4.0/.test(txt('CITATION.cff')) && JSON.parse(txt('.zenodo.json')).license === 'cc-by-4.0');
    o('the package records the issue', JSON.parse(txt('edition.json')).issued.version === '1.0');
    try { await ME.Release.issue(ed, list, '1.0'); o('a version is issued only once', false); } catch (e) { o('a version is issued only once', /issued already/.test(e.message)); }
    ed.apparatus = Object.assign({}, ed.apparatus, { polarity: 'auto' });
    await ME.Edition.save(ed);
    o('a change afterwards makes it a draft again', /draft after version 1\.0/.test(ME.Publish.citation(ed)), ME.Publish.citation(ed));
    return out;
  }));

  // the screens open
  await A.page.evaluate(async () => { const list = await T.list(ed); ME.ExchangeView.issue(ed, list, null); });
  await sleep(900);
  T.check('the issue screen shows the self-check', await A.page.evaluate(() => document.querySelectorAll('.xv-checks li').length > 8));
  await A.page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(200);
  await A.page.evaluate(() => { ME.ExchangeView.compare(ed, window.beforeSettle.theirs, 'B.zip', null); });
  await sleep(900);
  T.check('the compare screen lists what differs', await A.page.evaluate(() => /Transcriptions/.test(document.querySelector('.modal').innerText) && document.querySelectorAll('.modal .ed-table').length >= 1));
  await A.page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  // GitHub answers 409 when asked for the branch of an empty repository: the browser logs it, and it is expected
  for (const pg of [A.page, B.page]) pg.errors = pg.errors.filter((e) => !/status of 409/.test(e));
  T.done(A.page);
  if (B.page.errors.length) T.check('no page errors in B', false, B.page.errors.slice(0, 3));
  await A.browser.close(); await B.browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
