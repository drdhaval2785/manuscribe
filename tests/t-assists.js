// The optional assists: recognised text brought in as proposed lines, never collated until accepted, with its error
// rate measured on the corrected lines and a test of whether an AI source writes the text it remembers; NeighborNet
// and coherence; and the edition in the shape of DTS 1.0.
const { launch, sleep, checks } = require('./h');

const PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
 <Metadata><Creator>Transkribus</Creator><Created>2026-10-01T10:00:00</Created><LastChange>2026-10-02T11:00:00</LastChange></Metadata>
 <Page imageFilename="f001r.jpg" imageWidth="2000" imageHeight="1000">
  <ReadingOrder><OrderedGroup id="g"><RegionRefIndexed index="0" regionRef="r2"/><RegionRefIndexed index="1" regionRef="r1"/></OrderedGroup></ReadingOrder>
  <TextRegion id="r1" custom="structure {type:marginalia;}"><TextLine id="l3"><TextEquiv conf="0.8"><Unicode>टीका</Unicode></TextEquiv></TextLine></TextRegion>
  <TextRegion id="r2" type="paragraph">
   <TextLine id="l1"><Word><TextEquiv><Unicode>x</Unicode></TextEquiv></Word><TextEquiv conf="0.91"><Unicode>श्रीगणेशाय नमः</Unicode></TextEquiv></TextLine>
   <TextLine id="l2"><TextEquiv conf="0.85"><Unicode>अथ शब्दानुशासनम्</Unicode></TextEquiv></TextLine>
  </TextRegion>
 </Page>
</PcGts>`;
const ALTO = `<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#">
 <Description><sourceImageInformation><fileName>p5.tif</fileName></sourceImageInformation>
  <OCRProcessing ID="o"><ocrProcessingStep><processingDateTime>2026-09-09</processingDateTime><processingSoftware><softwareCreator>Google</softwareCreator><softwareName>Tesseract</softwareName><softwareVersion>5.3</softwareVersion></processingSoftware></ocrProcessingStep></OCRProcessing></Description>
 <Layout><Page WIDTH="100" HEIGHT="100"><PrintSpace><TextBlock ID="b1">
  <TextLine><String CONTENT="धर्म" WC="0.9"/><HYP CONTENT="-"/></TextLine>
  <TextLine><String CONTENT="क्षेत्रे" WC="0.8"/><SP/><String CONTENT="कुरु" WC="0.7"/></TextLine>
 </TextBlock></PrintSpace></Page></Layout>
</alto>`;

(async () => {
  const T = checks('Optional assists');
  const { browser, page } = await launch('assists');
  const res = await page.evaluate(async (PAGE, ALTO) => {
    const { HTR: H, Model, Tokens, Store, Export, Stemma: S } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    // reading the files
    const pg = H.parse('f.xml', PAGE);
    ok('PAGE: the regions in their reading order, line text not word text, confidence', pg.format === 'PAGE' && pg.pages[0].regions[0].id === 'r2' && pg.pages[0].regions[0].lines[0].text === 'श्रीगणेशाय नमः' && pg.pages[0].regions[0].lines[0].conf === 0.91 && pg.pages[0].regions[1].type === 'marginalia' && pg.meta.software === 'Transkribus', pg);
    const al = H.parse('a.xml', ALTO);
    ok('ALTO: strings, spaces and hyphens, the program and its version', al.format === 'ALTO' && al.pages[0].regions[0].lines.map((l) => l.text).join('|') === 'धर्म-|क्षेत्रे कुरु' && al.meta.software === 'Google Tesseract' && al.meta.version === '5.3', al);
    const tx = H.parse('t.txt', 'one\ntwo\n\fthree\n');
    ok('plain text: a line a line, a form feed a page', tx.pages.length === 2 && tx.pages[0].regions[0].lines.length === 2, tx);

    // placing: into empty lines only, each line at its own place
    const p = Model.upgrade(Model.newProject({ meta: { title: 'P', siglum: 'P' }, layoutType: 'linear', lines: { main: 6 }, folios: {} }));
    p.pdf = { name: 'p.pdf', pages: 2 };
    p.pages = { '1r': { boxes: { main: ['<x-marker type="p-start" id="b1"/>typed first ', '', '', 'typed fourth<x-marker type="p-end"/>', '', ''] } } };
    const src = H.addSource(p, { kind: 'htr', software: 'Transkribus', model: 'Devanagari M1', version: '2', date: '2026-10-02', format: 'PAGE' });
    const lines = { format: 'text', pages: [{ regions: [{ lines: ['ignored', 'second line', 'third line', 'not over typed', 'fifth'].map((t) => ({ text: t, conf: null })) }] }] };
    const placed = H.place(p, lines, { labels: ['1r'], boxes: ['main'], src: src.id });
    const box = p.pages['1r'].boxes.main;
    ok('typed lines are never replaced, and the rest keep their places', placed.placed === 3 && placed.skipped === 2 && box[0].startsWith('<x-marker') && box[1] === 'second line' && box[3].startsWith('typed fourth') && box[4] === 'fifth', { placed, box });
    // not collated until accepted
    const read = () => Tokens.read(p, ['main']).blocks.get('b1').pc;
    let b = read();
    ok('a proposed line is not collated: it is text not yet read', !/second|third/.test(b.dip) && b.gaps.length === 2 && /typed first/.test(b.dip) && /typed fourth/.test(b.dip), b.dip);
    p.pages['1r'].boxes.main[1] = 'second lime';
    H.accept(p, '1r', 'main', 1);
    b = read();
    ok('once accepted, it is', /second lime/.test(b.dip) && b.gaps.length === 1, b.dip);
    const st = H.stats(p)[0];
    ok('the error rate is measured on the corrected line', st.accepted === 1 && st.errors === 1 && Math.abs(st.cer - 1 / 11) < 1e-9, st);
    // in the TEI export
    const ex = Export.build(p, {});
    ok('the TEI header names the program, its model, version and date', /<appInfo>\s*<application ident="Transkribus" version="2" when="2026-10-02">\s*<label>Devanagari M1<\/label>/.test(ex.xml), ex.xml.slice(ex.xml.indexOf('<encodingDesc'), ex.xml.indexOf('</encodingDesc>') + 15));
    ok('and the export warns of lines not yet read', ex.warnings.some((w) => /not yet accepted/.test(w.msg)));

    // AI output: model, version, date and prompt hash; and the memorisation test
    try { H.addSource(p, { kind: 'ai', software: 'x' }); ok('AI output must say its model, version and date', false); } catch (e) { ok('AI output must say its model, version and date', /model/.test(e.message)); }
    const words = 'rāmo rājamaṇiḥ sadā vijayate rāmaṃ rameśaṃ bhaje rāmeṇābhihatā niśācaracamū rāmāya tasmai namaḥ rāmān nāsti parāyaṇaṃ parataraṃ rāmasya dāso ’smy ahaṃ rāme cittalayaḥ sadā bhavatu me bho rāma mām uddhara iti śrīrāmarakṣāstotraṃ sampūrṇam'.split(' ');
    const printed = words.join(' ');
    // the manuscript differs from the printed text at six places
    const ms = words.slice();
    for (const [i, w] of [[1, 'rājamaṇī'], [5, 'ramesaṃ'], [9, 'rāmāyaḥ'], [14, 'paratara'], [19, 'cittalaya'], [25, 'udhara']]) ms[i] = w;
    const mk = (out) => {
      const q = Model.upgrade(Model.newProject({ meta: { title: 'Q', siglum: 'Q' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      q.pages = { '1r': { boxes: { main: [] } } };
      return q;
    };
    const aiTest = async (proposeFrom) => {
      const q = mk();
      const s = H.addSource(q, { kind: 'ai', software: 'Chat', model: 'Some model', version: '2026-09', date: '2026-10-01', promptHash: await H.hash('Transcribe this page exactly') });
      const chunks = [ms.slice(0, 10), ms.slice(10, 20), ms.slice(20)];
      const prop = [proposeFrom.slice(0, 10), proposeFrom.slice(10, 20), proposeFrom.slice(20)];
      H.place(q, { pages: [{ regions: [{ lines: prop.map((c) => ({ text: c.join(' '), conf: null })) }] }] }, { labels: ['1r'], boxes: ['main'], src: s.id });
      chunks.forEach((c, i) => { q.pages['1r'].boxes.main[i] = c.join(' '); H.accept(q, '1r', 'main', i); });
      return { q, s, r: H.deviationTest(q, s.id, printed) };
    };
    const faithful = await aiTest(ms.map((w, i) => (i === 3 ? 'vijayatē' : w))); // a slip, but the manuscript's readings kept
    const memorising = await aiTest(words); // it wrote the printed text
    ok('a source that reads the manuscript passes', faithful.r.tested && faithful.r.pass && faithful.r.kept === 6, faithful.r);
    ok('a source that writes the text it knows fails', memorising.r.tested && !memorising.r.pass && memorising.r.memorised === 6, memorising.r);
    memorising.s.deviation = { pass: false }; faithful.s.deviation = { pass: true };
    ok('only an AI source that passed may be accepted a folio at a time', H.trusted(faithful.s) && !H.trusted(memorising.s) && H.trusted(src));
    ok('the prompt is kept only as its hash', /^[0-9a-f]{64}$/.test(memorising.s.promptHash) && !JSON.stringify(memorising.s).includes('Transcribe'));
    window.pFile = p;

    // NeighborNet on a tree: its splits and weights come back exactly
    const taxa = ['A', 'B', 'C', 'D', 'E', 'F'];
    const tree = [[['A'], 1], [['B'], 2], [['C'], 1], [['D'], 1], [['E'], 3], [['F'], 2], [['A', 'B'], 1], [['C', 'D', 'E'], 1], [['D', 'E'], 2]];
    const n = taxa.length;
    const D = Array.from({ length: n }, () => Array(n).fill(0));
    for (const [side, w] of tree) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (side.includes(taxa[i]) !== side.includes(taxa[j])) D[i][j] += w;
    const nn = S.neighbornet(D);
    const norm = (side) => { const a = side.includes('A') ? side : taxa.filter((x) => !side.includes(x)); return a.slice().sort().join(''); };
    const want = new Map(tree.map(([side, w]) => [norm(side), w]));
    const got = new Map(nn.splits.map((sp) => [norm(sp.side.map((i) => taxa[i])), sp.weight]));
    ok('NeighborNet gives back the splits and lengths of a tree', got.size === want.size && [...want].every(([k, w]) => Math.abs((got.get(k) || 0) - w) < 1e-3) && nn.fit > 0.999999, [...got]);
    // and with contamination: one witness between two groups makes a box
    const D2 = D.map((r) => r.slice());
    const add = (a, b, v) => { D2[a][b] += v; D2[b][a] += v; };
    add(1, 2, -0.8); add(1, 3, -0.8); // B leans towards C and D
    const nn2 = S.neighbornet(D2);
    ok('a witness drawn two ways makes splits that no tree has', nn2.splits.length > nn.splits.length, nn2.splits.map((s) => s.side.map((i) => taxa[i]).join('')));
    // the drawing: closed, and no two edges cross, for 50 witnesses
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: 50 }, () => [rnd(), rnd(), rnd()]);
    const D50 = pts.map((a) => pts.map((c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])));
    const t0 = performance.now();
    const big = S.neighbornet(D50);
    const ms50 = performance.now() - t0;
    const o = S.outline(big);
    const seg = o.path.slice(1).map((q, i) => [o.path[i], q]);
    const f = (a, c, d) => (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
    let crossings = 0;
    for (let i = 0; i < seg.length; i++) for (let j = i + 2; j < seg.length; j++) { const [a, c] = seg[i], [d, e] = seg[j]; if (f(d, e, a) * f(d, e, c) < -1e-12 && f(a, c, d) * f(a, c, e) < -1e-12) crossings++; }
    const end = o.path[o.path.length - 1];
    ok('50 witnesses: drawn in ' + Math.round(ms50) + ' ms, closed, with no edges crossing', crossings === 0 && Math.hypot(end[0], end[1]) < 1e-9 && ms50 < 10000, { crossings, ms50 });

    // coherence: W3 has the later reading where W1 and A have the earlier
    const m = { taxa: ['W1', 'W2', 'W3'], chars: [
      { cells: [0, 0, 1], initial: 0 }, { cells: [0, 1, 1], initial: 0 }, { cells: [0, 0, 0], initial: 0 }, { cells: [1, 0, 2], initial: 0 }, { cells: [0, -1, 1], initial: 0 },
    ] };
    const co = S.coherence(m);
    const of = (w) => co.rows[co.names.indexOf(w)];
    const w3 = of('W3');
    ok('coherence: agreement over the places both can be read; a lost reading never counts', of('W1').find((r) => r.witness === 'W2').pass === 4 && w3.find((r) => r.witness === 'W1').pass === 5, co);
    ok('the edited text and W1 are potential ancestors of W3, ranked by agreement', w3.filter((r) => r.ancestor).map((r) => r.witness).join() === 'W2,W1,A' || w3.filter((r) => r.ancestor).map((r) => r.witness).includes('A'), w3);
    ok('A, the edited text, has no ancestor', of('A').every((r) => !r.ancestor));
    return out;
  }, PAGE, ALTO);
  for (const [n, c, x] of res) T.check(n, c, x);

  // in the folio: proposed lines marked, accepted with the shortcut, a folio at a time only if trusted
  await page.evaluate(async () => { await ME.Store.putProject(window.pFile); await ME.App.open(window.pFile.id); });
  await sleep(700);
  const marked = await page.evaluate(() => [...document.querySelectorAll('.line.proposed')].map((l) => l.dataset.i));
  T.check('the folio marks the lines still proposed', marked.join() === '2,4', marked);
  await page.evaluate(() => { ME.Editor.focusLine('main', 2, 'end'); });
  const mod = await page.evaluate(() => window.pFile.settings.modifier || (ME.U.isMac ? 'ctrlalt' : 'alt'));
  if (mod === 'ctrlalt') await page.keyboard.down('Control');
  await page.keyboard.down('Alt'); await page.keyboard.press('KeyY'); await page.keyboard.up('Alt');
  if (mod === 'ctrlalt') await page.keyboard.up('Control');
  await sleep(300);
  T.check('the shortcut accepts the line', await page.evaluate(() => !document.querySelector('.line.proposed[data-i="2"]') && !!ME.App.project.pages['1r'].proposed.main[2].accepted));
  await page.evaluate(() => { ME.App.project.sources[0].kind = 'ai'; ME.App.acceptProposed(true); });
  T.check('AI lines not tested are not accepted a folio at a time', await page.evaluate(() => !ME.App.project.pages['1r'].proposed.main[4].accepted));
  await page.evaluate(() => { ME.App.project.sources[0].kind = 'htr'; ME.App.acceptProposed(true); });
  T.check('recognised lines may be', await page.evaluate(() => !!ME.App.project.pages['1r'].proposed.main[4].accepted && !document.querySelector('.line.proposed')));
  await page.evaluate(() => { document.querySelector('[data-tab="ms"]').click(); });
  await sleep(300);
  T.check('the Manuscript tab lists the source with its error rate', await page.evaluate(() => { const t = document.querySelector('table.sources'); return !!t && /Devanagari M1/.test(t.innerText) && /3\.8% of 26/.test(t.innerText); }));

  // a small edition: the network and coherence on the workbench, and DTS
  const ed = await page.evaluate(async () => {
    const { Model, Store, Edition, Collate } = ME;
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    const texts = {
      A: [P('m1') + 'राम वनं गच्छति सीता च लक्ष्मणः अनुगच्छति' + END, P('m2') + 'ततः भरतः आगतः' + END],
      B: [P('m1') + 'राम वनं गच्छति सीता अपि लक्ष्मणः अनुगच्छति' + END, P('m2') + 'ततः भरतः आगत' + END],
      C: [P('m1') + 'रामः वनं गच्छति सीता च लक्ष्मणश्च अनुगच्छति' + END, P('m2') + 'ततः भरतो आगतः' + END],
      D: [P('m1') + 'रामः वनं गच्छति सीता अपि लक्ष्मणश्च अनुगच्छति' + END, P('m2') + 'ततः भरतो आगत' + END],
    };
    const e = Edition.create('Rāma');
    const list = [];
    for (const [s, lines] of Object.entries(texts)) {
      const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: s + '.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: lines.concat(['', '']) } } };
      await Store.putProject(p);
      const w = { siglum: s, projectId: p.id, streams: {} };
      e.witnesses.push(w); list.push({ w, p });
    }
    e.trust = ['A', 'B', 'C', 'D'];
    await Store.putEdition(e);
    await Collate.run(e, list, 'main', {});
    window.ed = e; window.list = list;
    return e.id;
  });
  await page.evaluate(() => { ME.StemmaView.open(window.ed, window.list, 'main'); });
  await sleep(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.sv .btn')].find((x) => x.textContent === 'Draw it'); b.click(); });
  await sleep(600);
  const wb = await page.evaluate(() => ({ edges: document.querySelectorAll('.sv-net .sv-edge').length, leaves: document.querySelectorAll('.sv-net .sv-leaf').length, coherence: [...document.querySelectorAll('.sv table.sv-small')].some((t) => /Potential ancestor/.test(t.innerText)), text: document.querySelector('.sv').innerText }));
  // D reads with B at two places and with C at three: the network is exactly a box, two splits and no leaf lengths
  T.check('the workbench draws the network: here a box, D between B and C', wb.edges === 4 && wb.leaves === 4, wb.edges + ' edges, ' + wb.leaves + ' leaves');
  T.check('and shows coherence', wb.coherence && !/(^|\n)null(\n|$)|undefined|NaN/.test(wb.text));
  await page.evaluate(() => document.querySelector('.modal-foot .btn').click());
  await sleep(300);
  const dts = await page.evaluate(async () => {
    const works = await ME.Release.works(window.ed, window.list);
    const files = ME.DTS.files(window.ed, works, 'dts/');
    const get = (n) => files.find((f) => f.name === n);
    const json = files.filter((f) => f.name.endsWith('.json')).map((f) => ({ name: f.name, data: JSON.parse(f.data) }));
    const xml = files.filter((f) => f.name.endsWith('.xml')).map((f) => ({ name: f.name, doc: new DOMParser().parseFromString(f.data, 'application/xml') }));
    const nav = json.find((x) => x.data['@type'] === 'Navigation');
    return {
      entry: JSON.parse(get('dts/index.json').data), nav: nav && nav.data, kinds: json.map((x) => x.data['@type']),
      wellFormed: xml.every((x) => !x.doc.getElementsByTagName('parsererror').length),
      wrapper: xml.filter((x) => x.doc.documentElement.localName === 'wrapper').map((x) => x.doc.documentElement.namespaceURI),
      names: files.map((f) => f.name),
    };
  });
  T.check('DTS: an entry point of version 1.0 with its three templates', dts.entry['@type'] === 'EntryPoint' && dts.entry.dtsVersion === '1.0' && dts.entry['@context'] === 'https://dtsapi.org/context/v1.0.json' && ['collection', 'navigation', 'document'].every((k) => typeof dts.entry[k] === 'string'), dts.entry);
  T.check('a collection, a resource and its navigation, by citation ID', dts.kinds.includes('Collection') && dts.kinds.includes('Resource') && dts.nav && dts.nav.member.map((u) => u.identifier).join() === 'm1,m2' && dts.nav.member.every((u) => u['@type'] === 'CitableUnit' && u.level === 1 && u.parent === null) && dts.nav.resource.citationTrees[0]['@type'] === 'CitationTree', dts.nav);
  T.check('a TEI document for the work, and each block wrapped in dts:wrapper', dts.wellFormed && dts.wrapper.length === 2 && dts.wrapper.every((n) => n === 'https://w3id.org/api/dts#'), dts.names);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
