// Layered texts and evidence, on a small tradition made here: a verse of the Bhagavadgītā with a commentary,
// in tripāṭha, pañcapāṭha and linear witnesses. The two page layouts give the same logical text; links follow the
// cases of the DHARMA guide; evidence is only what is recorded, and silence never counts for a reading; the
// concordance, the indices and the reader.
const { launch, sleep, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('layers');
  const T = checks('Layered texts and evidence');
  const res = await page.evaluate(async () => {
    const { Model, Store, Edition, Collate, CollateEdit: E, Apparatus: A, Layers: L, Concord: C, Metre, Tokens, Stemma, Publish } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const P = (id) => '<x-marker type="p-start" id="' + id + '"/>';
    const END = '<x-marker type="p-end"/>';
    const verse = (pada, d) => [P('m1') + 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः।', pada + ' पाण्डवाश्चैव ' + (d || 'किमकुर्वत') + ' सञ्जय॥' + END];
    const comm = (w) => [P('c1') + 'धर्मक्षेत्र इति।', 'धर्मस्य क्षेत्रं धर्मक्षेत्रम्।', 'तस्मिन् कुरुक्षेत्रे।', w + ' मदीयाः।' + END];
    const mk = (siglum, layout, boxes) => {
      const p = Model.newProject({ meta: { title: siglum, siglum }, layoutType: layout, lines: { main: 4, top: 4, bottom: 4, left: 4, right: 4 }, folios: {} });
      p.pdf = { name: siglum + '.pdf', pages: 1 };
      p.id = 'lay-' + siglum;
      p.pages = { '1r': { boxes } };
      return Model.upgrade(p);
    };
    const k = comm('मामकाः'), kb = comm('मामका');
    const projects = [
      mk('A', 'tripatha', { top: [k[0], k[1]], main: verse('मामकाः'), bottom: [k[2], k[3]] }),
      mk('B', 'tripatha', { top: [kb[0], kb[1]], main: verse('मामका'), bottom: [kb[2], kb[3]] }),
      mk('C', 'pancapatha', { top: [k[0]], right: [k[1]], left: [k[2]], main: verse('मामकाः'), bottom: [k[3]] }),
      mk('D', 'linear', { main: verse('मामका', 'किमकुर्वता') }), // a reading against the metre
    ];
    const ed = Edition.create('Layers');
    const list = [];
    for (const p of projects) { await Store.putProject(p); const w = { siglum: p.meta.siglum, projectId: p.id, streams: {} }; ed.witnesses.push(w); list.push({ w, p }); }
    ed.trust = ['A', 'C', 'B', 'D'];
    await Store.putEdition(ed);

    // the same logical text from tripāṭha and pañcapāṭha
    const units = Tokens.forWork(ed, list, 'commentary', { kind: 'word' }).units;
    const c1 = units.find((u) => u.id === 'c1');
    const dip = (s) => c1.states.find((x) => x.siglum === s).dip;
    ok('tripāṭha and pañcapāṭha give the same commentary', c1 && dip('A') === dip('C'), c1 && [dip('A'), dip('C')]);
    ok('it runs top, right, left, bottom in the pañcapāṭha', c1 && /^धर्मक्षेत्र इति। धर्मस्य क्षेत्रं धर्मक्षेत्रम्। तस्मिन् कुरुक्षेत्रे। मामकाः/.test(dip('C')), c1 && dip('C'));
    ok('the linear witness has no commentary', c1 && c1.absent.includes('D'));
    const mainUnits = Tokens.forWork(ed, list, 'main', { kind: 'word' }).units;
    const m1 = mainUnits.find((u) => u.id === 'm1');
    ok('and the same main text in all four', m1 && m1.states.find((x) => x.siglum === 'A').dip === m1.states.find((x) => x.siglum === 'C').dip);

    await Collate.run(ed, list, 'main', {});
    await Collate.run(ed, list, 'commentary', {});
    const tm = E.ensure((await Store.getCollation(Collate.keyOf(ed.id, 'main', 'm1'))).table);
    const tc = E.ensure((await Store.getCollation(Collate.keyOf(ed.id, 'commentary', 'c1'))).table);

    // links, after the DHARMA guide §4
    ok('a commentary comments on the main text unless told otherwise', L.baseOf(ed, 'commentary') === 'main' && L.baseOf(ed, 'main') === null);
    L.setBase(ed, 'gloss', 'commentary');
    ok('a gloss can comment on the commentary', L.baseOf(ed, 'gloss') === 'commentary' && L.dependents(ed, 'commentary').map((w) => w.id).join() === 'gloss');
    const sug = L.suggest(['c1', 'c2', 'c9'], ['m1', 'm2']);
    ok('links are proposed where the numbers agree, and only there', sug.length === 2 && sug[0].base[0] === 'm1' && sug[1].base[0] === 'm2', sug);
    ok('a proposal sets nothing', L.links(ed).length === 0);
    L.setLink(ed, 'commentary', 'c1', ['m1', 'm2'], 'comments');
    ok('one block on several base blocks', /several base sections/.test(L.caseOf(L.linkOf(ed, 'commentary', 'c1'))));
    for (const kind of ['absent', 'ignored', 'none', 'implied', 'reconstructible']) {
      L.setLink(ed, 'commentary', 'cx', [], kind);
      ok('the case “' + L.KINDS[kind] + '”', L.caseOf(L.linkOf(ed, 'commentary', 'cx')) === L.KINDS[kind]);
    }
    L.setLink(ed, 'commentary', 'cx', [], '');
    ok('a link can be taken away', !L.linkOf(ed, 'commentary', 'cx') && L.links(ed, 'commentary').length === 1);
    L.setLink(ed, 'commentary', 'c1', ['m1'], 'comments');
    ok('the base text embedded: the witnesses that carry both', L.embedded(ed, list, 'main', 'commentary').join() === 'A,B,C', L.embedded(ed, list, 'main', 'commentary'));

    // evidence
    const Pm = E.proposal(tm, ed.trust);
    const place = Pm.units.find((u) => u.differs && /मामका/.test(u.text));
    const metrical = Pm.units.find((u) => u.differs && u.groups.some((g) => /र्वता/.test(g.form.text)));
    ok('the verse has two places of variation', Pm.units.filter((u) => u.differs).length === 2 && place && metrical, Pm.units.filter((u) => u.differs).map((u) => u.text));
    const before = A.entries(ed, tm);
    const matrixBefore = Stemma.matrix(ed, [Object.assign({ table: tm }, before)]).chars.length;
    const teiBefore = A.readBack(A.tei(ed, [Object.assign({ table: tm }, before)], ed.works[0]));
    ok('the commentary says nothing until you record it: no evidence is inferred', before.entries.every((e) => !e.testimonia.length));
    try { L.addEvidence(ed, { work: 'main', unit: 'm1', key: place.key, reading: 'मामकाः', type: 'pratika', source: { label: '' } }); ok('evidence needs a source', false); } catch (e) { ok('evidence needs a source', /where the evidence is from/.test(e.message)); }
    L.addEvidence(ed, { work: 'main', unit: 'm1', key: place.key, ref: 'm1 मामकाः', reading: 'मामकाः', type: 'pratika', source: { label: 'Comm.', work: 'commentary', unit: 'c1' }, quote: 'मामकाः मदीयाः' });
    const agreed = Pm.units.find((u) => !u.others && u.text.trim());
    L.addEvidence(ed, { work: 'main', unit: 'm1', key: agreed.key, ref: 'm1 ' + agreed.text.trim(), reading: agreed.text.trim(), type: 'quotes', source: { label: 'Kāvyamīmāṃsā', locus: '4' } });
    const after = A.entries(ed, tm);
    const at = after.entries.find((e) => e.fromId === place.fromId);
    ok('recorded evidence is in its entry', at && at.testimonia.length === 1 && at.testimonia[0].source.label === 'Comm.');
    const sup = L.supportOf(at.testimonia);
    const other = place.groups.map((g) => g.form.text.trim()).find((t) => t !== 'मामकाः');
    ok('it supports the reading it names', (sup.for.get('मामकाः') || []).length === 1);
    ok('silence is not support: the other reading has none', other !== undefined && !sup.for.has(other), other);
    ok('a reported or rejected reading is not support', !L.supportOf([{ type: 'kvacit', reading: 'x', source: { label: 'y' } }, { type: 'apapatha', reading: 'x', source: { label: 'y' } }]).for.size);
    ok('evidence where the witnesses agree makes a testimonium entry', after.entries.some((e) => e.kind === 'testimonium' && e.fromId === agreed.fromId));
    const tiers = A.tiers(ed, after.entries);
    ok('which is not a variant', !tiers.variants.some((e) => e.kind === 'testimonium') && tiers.testimonia.length === 2);
    ok('it prints with its source', /Kāvyamīmāṃsā 4 \(quotes\)/.test(A.format(ed, after.entries.find((e) => e.kind === 'testimonium'))));
    ok('the apparatus still passes every check', !A.validate(ed, tm, after).some((v) => v.level === 'error'), A.validate(ed, tm, after));
    ok('the stemma does not count testimonia', Stemma.matrix(ed, [Object.assign({ table: tm }, after)]).chars.length === matrixBefore);
    const tei = A.tei(ed, [Object.assign({ table: tm }, after)], ed.works[0]);
    ok('in TEI, a note of type testimonium', /<note type="testimonium" subtype="pratika">Comm\./.test(tei));
    ok('every witness still reads back from the TEI', JSON.stringify(A.readBack(tei)) === JSON.stringify(teiBefore));
    const tex = Publish.tex(ed, list, [Object.assign({ table: tm }, after)]);
    ok('in print, series B is the testimonia', /\\Bfootnote\{Comm\. \(pratīka\) मामकाः/.test(tex) && /\\Xbhooknote\[B\]\{\\textit\{Testimonia:\}/.test(tex));
    L.addEvidence(ed, { work: 'main', unit: 'm1', key: 'gone|gone', ref: 'm1 x', reading: 'x', type: 'explains', source: { label: 'Comm.' } });
    ok('evidence that has lost its place is caught', A.validate(ed, tm).some((v) => /no longer fits a word/.test(v.text)));
    L.removeEvidence(ed, ed.evidence[ed.evidence.length - 1].id);

    // metre per reading
    const whole = Metre.identify(Pm.text);
    ok('the verse is a śloka', whole.metre === 'Śloka (anuṣṭubh)', whole);
    const i = Pm.units.indexOf(metrical);
    const fit = (r) => Metre.faultsIn(Pm.units.map((u, j) => (j === i ? r : u.text)).join(''), whole.metre);
    const [good, bad] = [metrical.groups.find((g) => !/र्वता/.test(g.form.text)), metrical.groups.find((g) => /र्वता/.test(g.form.text))];
    ok('a reading in the metre has no fault, one against it has one', fit(good.form.text) === 0 && fit(bad.form.text) === 1, [good.form.text, bad.form.text, fit(good.form.text), fit(bad.form.text)]);

    // registers
    try { L.addRegister(ed, { kind: 'parallel', title: '' }); ok('a register entry needs its text', false); } catch (e) { ok('a register entry needs its text', true); }
    const rg = L.addRegister(ed, { kind: 'testimonium', title: 'Kāvyamīmāṃsā', locus: '4', place: { work: 'main', unit: 'm1' } });
    ok('testimonia and parallels are kept', L.register(ed, 'testimonium').length === 1 && L.register(ed, 'parallel').length === 0);
    L.removeRegister(ed, rg.id);
    ok('and removed', !L.register(ed).length);

    // the concordance
    const rules = new Set(ME.Norm.settings(ed.norm).on);
    const own = { name: 'own', licence: 'mine', lines: C.ownLines(list) };
    ok('the own lines are every line with text', own.lines.length === 4 * 2 + 3 * 4, own.lines.length);
    const hits = C.search('कुरुक्षेत्रे', [own], rules);
    ok('found in the verse of each witness and in the commentaries', new Set(hits.filter((h) => /समवेता/.test(h.text)).map((h) => h.place.siglum)).size === 4 && hits.some((h) => /तस्मिन्/.test(h.text)), hits.map((h) => h.ref));
    ok('a passage over two lines is found', C.search('युयुत्सवः मामकाः', [own], rules).length === 2);
    const txt = C.parse('gita.txt', 'BhG 1.1\tdharmakṣetre kurukṣetre samavetā yuyutsavaḥ\nBhG 1.2\tdṛṣṭvā tu pāṇḍavānīkaṃ');
    const xml = C.parse('x.xml', '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><lg n="1.1"><l n="1.1a">dharmakṣetre kurukṣetre</l><l>samavetā yuyutsavaḥ</l></lg><p n="p1">gadyam idam</p></body></text></TEI>');
    const json = C.parse('x.json', JSON.stringify([{ ref: 'a', text: 'eka' }, { ref: 'b', text: '' }]));
    ok('packs from text, TEI and JSON', txt.length === 2 && txt[0].ref === 'BhG 1.1' && xml.length === 3 && xml[0].ref === '1.1a' && xml[1].ref === '1.1' && xml[2].ref === 'p1' && json.length === 1, [txt, xml, json]);
    const pk = { id: 'pk-test', name: 'Gītā', licence: 'CC0', source: 'gita.txt', lines: txt };
    ok('IAST in a pack is found from Devanagari', C.search('समवेता युयुत्सवः', [pk], rules).map((h) => h.ref).join() === 'BhG 1.1');
    await Store.putPack(pk);
    const back = await Store.listPacks();
    ok('packs are kept in the browser', back.length === 1 && back[0].licence === 'CC0' && back[0].lines.length === 2);
    await Store.deletePack('pk-test');
    ok('and removed', !(await Store.listPacks()).length);

    // the indices
    const built = [Object.assign({ table: tm }, after)];
    const words = C.wordIndex(built);
    const col = new Intl.Collator('sa');
    ok('a word index in alphabetical order', words.length === 8 && words.every((w, j) => !j || col.compare(words[j - 1].word, w.word) <= 0) && words.find((w) => w.word === 'धर्मक्षेत्रे').refs[0] === 'm1.1', words.map((w) => w.word));
    const padas = C.padaIndex(built);
    ok('a pāda index with its verse and letter', padas.length === 4 && padas.some((p) => p.pada === 'मामकाः पाण्डवाश्चैव' && p.ref === 'm1c') && padas.some((p) => p.pada === 'धर्मक्षेत्रे कुरुक्षेत्रे' && p.ref === 'm1a'), padas);

    // the reader beside its base text
    const layered = await ME.LayersView.baseTexts(ed, 'commentary');
    const builtC = [Object.assign({ table: tc }, A.entries(ed, tc))];
    const html = await Publish.reader(ed, list, builtC, layered);
    ok('the commentary’s reader shows the verse it comments on', layered && /class=\\?"mula/.test(html) && html.includes('समवेता'), layered);
    ok('and its indices', /<summary>Indices<\/summary>/.test(html));
    await Edition.save(ed);
    window.__ed = ed; window.__list = list;
    return out;
  });
  for (const [n, c, x] of res) T.check(n, c, x);
  // the screens
  await page.evaluate(() => { ME.CollateView.workApparatus(window.__ed, window.__list, 'main'); });
  await sleep(800);
  const shown = await page.evaluate(() => ({ tiers: [...document.querySelectorAll('.ap-tier')].map((x) => x.textContent), folds: [...document.querySelectorAll('.modal summary')].map((x) => x.textContent) }));
  T.check('the apparatus window has a testimonia tier', shown.tiers.includes('Testimonia'), shown);
  T.check('and the registers, the concordance and the indices', ['Testimonia and parallels', 'Concordance', 'Indices'].every((w) => shown.folds.some((f) => f.startsWith(w))), shown.folds);
  await page.evaluate(() => { const d = [...document.querySelectorAll('.modal summary')].find((x) => x.textContent.startsWith('Concordance')); d.click(); });
  await sleep(500);
  await page.evaluate(() => { const q = document.querySelector('.lv-query'); q.value = 'किमकुर्वत'; q.nextElementSibling.click(); });
  await sleep(300);
  T.check('the concordance finds a passage on screen', await page.evaluate(() => /3 place/.test(document.querySelector('.modal').innerText)));
  await page.evaluate(() => { const d = [...document.querySelectorAll('.modal summary')].find((x) => x.textContent.startsWith('Indices')); d.click(); });
  await sleep(300);
  T.check('the indices open', await page.evaluate(() => document.querySelectorAll('.lv-index li').length > 9));
  await page.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent === 'Close').click());
  await sleep(300);
  await page.evaluate(() => { ME.CollateView.open(window.__ed, window.__list, 'main', 'm1', () => {}); });
  await sleep(900);
  const panel = await page.evaluate(() => {
    const read = () => ({ metre: [...document.querySelectorAll('.ct-metre')].map((x) => x.textContent.trim()), backing: [...document.querySelectorAll('.ct-backing')].map((x) => x.textContent.trim()) });
    const us = [...document.querySelectorAll('.ct-text .ct-u')];
    if (!us.length) return null;
    const got = us.map((u) => { u.click(); return read(); });
    return { metre: got.flatMap((g) => g.metre), backing: got.flatMap((g) => g.backing), evidence: !!document.querySelector('.ct-evidence') };
    return { metre: [...document.querySelectorAll('.ct-metre')].map((x) => x.textContent.trim()), backing: [...document.querySelectorAll('.ct-backing')].map((x) => x.textContent.trim()), evidence: !!document.querySelector('.ct-evidence') };
  });
  T.check('the decision panel shows each reading in the metre', panel && panel.metre.includes('metre ✓') && panel.metre.some((m) => /fault/.test(m)), panel);
  T.check('and the evidence for a reading', panel && panel.evidence && panel.backing.some((b) => /Comm\. \(pratīka\)/.test(b)), panel);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
