// A selection that runs on: through an addition written in the margin (letter by letter of its text, and a tag over
// the selection goes into the addition, which stays whole), and over the end of a folio side on to the next (the
// anchor kept on the folio before; a tag then runs over both). A paragraph, verse or quotation marker falling inside
// a tag cuts the tag in two, after a question; at the edge of a tag it goes just outside it. A marker inside an
// addition cuts the addition in two at export, so that the verse begins where the scribe began it, in the margin.
const { launch, sleep, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('select');
  const T = checks('A selection that runs on');
  try {
    await page.evaluate(async () => {
      const { Model, Store } = ME;
      const p = Model.upgrade(Model.newProject({ meta: { title: 'S', siglum: 'S', textLang: 'en' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: 'x.pdf', pages: 3 };
      const labels = Model.entries(p).map((e) => e.label);
      p.pages = {};
      labels.forEach((l, n) => { p.pages[l] = { boxes: { main: ['abcdefgh', 'ijklmnop', 'qrstuvwx', 'yz012345'].map((x) => x + n) } }; });
      p.pages[labels[0]].boxes.main[0] = 'ABC DEF <add place="left-margin">GHI</add> JKL';
      p.pages[labels[0]].boxes.main[1] = 'ABC <hi rend="rubricated">DEFGH</hi> IJK';
      p.pages[labels[0]].boxes.main[2] = 'ABC <hi rend="rubricated">DEFGH</hi> IJK';
      await Store.putProject(p);
      await ME.App.open(p.id);
      window.labels = labels;
    });
    await sleep(600);
    const lab = await page.evaluate(() => window.labels);
    const line = (pages, f, i) => pages[lab[f]].boxes.main[i].replace(/ x-span="[^"]*"/g, '');
    const pages = () => page.evaluate(() => { ME.App.flush(); return ME.App.project.pages; });
    // runs a command; answers its dialog with this id (or cancels), and a question about cutting a tag with `cut`
    // (a question not expected is cancelled, and reported); never waits for ever
    const run = (cmd, id, cut) => page.evaluate(async (cmd, id, cut) => {
      const { Commands } = ME;
      const c = Commands.REG.find((r) => r.id === cmd);
      let settled = false;
      const going = Promise.resolve(c.run()).then(() => { settled = true; });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = async (re) => { for (let i = 0; i < 100 && !settled; i++) { const b = [...document.querySelectorAll('.modal-foot .btn')].find((x) => re.test(x.textContent)); if (b) return b; await wait(20); } return null; };
      const cancel = () => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent === 'Cancel').click();
      if (id !== undefined) {
        const ok = await btn(/^(OK|Insert|Apply)$/);
        if (!ok) return { noDialog: true };
        if (id === null) cancel();
        else { document.querySelector('.modal input[data-focus]').value = id; ok.click(); }
      }
      let asked = null;
      const b = await btn(/^Cut/);
      if (b) { asked = document.querySelector('.modal .confirm-text').textContent; if (cut) b.click(); else cancel(); }
      await Promise.race([going, wait(5000)]);
      await wait(60);
      return settled ? { asked, unexpected: !!b && cut === undefined } : { asked, hung: true };
    }, cmd, id, cut);
    const shiftArrow = async (key, n) => { await page.keyboard.down('Shift'); for (let k = 0; k < n; k++) { await page.keyboard.press(key); await sleep(40); } await page.keyboard.up('Shift'); await sleep(150); };

    // --- the addition in the margin, along the line
    for (let k = 0; k < 30 && !(await page.evaluate(() => { const c = document.querySelector('.line .t-add.chip'); return c && c._mnote && c._mnote._body; })); k++) await sleep(100);
    const u = await page.evaluate(() => {
      const { Spans, Editor } = ME;
      const line = Editor.lineEl('main', 0), chip = line.querySelector('.t-add.chip'), body = Spans.addBody(chip);
      const segs = Spans.segments(line, 5, 12, Spans.addBody).map((s) => [s.container === line ? 'line' : s.container === body ? 'margin' : '?', s.from, s.to]);
      const p9 = Spans.pointAt(line, 9);
      const t = body.firstChild;
      return { units: Spans.units(line), chip: Spans.units(chip), segs, p9: [body.contains(p9.node) ? 'margin' : 'line', p9.offset], off: Spans.offsetOf(line, t, 2), text: Editor.unitText(line).replace(/￼/g, '_') };
    });
    T.check('the addition counts as its text: the line has 15 units, its mark 3', u.units === 15 && u.chip === 3 && u.text === 'ABC DEF ___ JKL', u);
    T.check('a stretch through it is cut into the line’s text, the margin’s, and the line’s again', JSON.stringify(u.segs) === JSON.stringify([['line', 5, 8], ['margin', 0, 3], ['line', 11, 12]]), u.segs);
    T.check('a point inside it is in the margin line, and the way back gives the same offset', u.p9[0] === 'margin' && u.p9[1] === 1 && u.off === 10, u);
    // the caret: → and ← go over the mark at one go
    await page.evaluate(() => ME.Editor.focusLine('main', 0, 8));
    await page.keyboard.press('ArrowRight');
    const over = await page.evaluate(() => ME.Editor.caretOffset(ME.Editor.activeLine()));
    await page.keyboard.press('ArrowLeft');
    const back = await page.evaluate(() => ME.Editor.caretOffset(ME.Editor.activeLine()));
    T.check('→ goes over the addition’s mark at one go (8 → 11), and ← back (→ 8)', over === 11 && back === 8, { over, back });
    // Shift+→ from D|EF: into the margin, through its text, and out again; painted, not the browser's selection
    await page.evaluate(() => ME.Editor.focusLine('main', 0, 5));
    await shiftArrow('ArrowRight', 3);
    const within = await page.evaluate(() => ({ multi: !!ME.Editor.multi, native: getSelection().toString() }));
    await shiftArrow('ArrowRight', 2);
    const into = await page.evaluate(() => ({ multi: ME.Editor.multi && [ME.Editor.multi.a.offset, ME.Editor.multi.f.offset], ranges: CSS.highlights.get('lipi-multi') ? [...CSS.highlights.get('lipi-multi')].map((r) => r.toString()) : null }));
    await shiftArrow('ArrowRight', 3);
    const out = await page.evaluate(() => ({ multi: ME.Editor.multi && [ME.Editor.multi.a.offset, ME.Editor.multi.f.offset], ranges: CSS.highlights.get('lipi-multi') ? [...CSS.highlights.get('lipi-multi')].map((r) => r.toString()) : null, status: document.getElementById('statusbar').textContent }));
    T.check('within the line’s own text the browser selects (EF )', !within.multi && within.native === 'EF ', within);
    T.check('into the margin: painted, the line’s part and the margin’s (EF  + GH)', into.multi && into.multi[1] === 10 && into.ranges && into.ranges.join('|') === 'EF |GH', into);
    T.check('and out again: three stretches (EF  + GHI +  J)', out.multi && out.multi[1] === 13 && out.ranges && out.ranges.join('|') === 'EF |GHI| J' && /press a tag shortcut/.test(out.status), out);
    await run('hi');
    let pg = await pages();
    T.check('a tag over it goes into the addition, which stays whole: three pieces of one tag', line(pg, 0, 0) === 'ABC D<hi rend="rubricated">EF </hi><add place="left-margin"><hi rend="rubricated">GHI</hi></add><hi rend="rubricated"> J</hi>KL' && /x-span="(\w+)".*x-span="\1".*x-span="\1"/.test(pg[lab[0]].boxes.main[0]), pg[lab[0]].boxes.main[0]);
    // a verse ending inside the addition
    await page.evaluate(() => ME.Editor.focusLine('main', 0, 5));
    await shiftArrow('ArrowRight', 4);
    let r = await run('lg', 'v1', true);
    pg = await pages();
    T.check('a verse from D|EF to inside the addition: its end marker is in the addition, cutting the tag there (asked first)', /end of the verse falls inside a <hi>/.test(r.asked) && /^ABC D<x-marker type="lg-start" id="v1"\/><hi[^>]*>EF <\/hi><add place="left-margin"><hi[^>]*>G<\/hi><x-marker type="lg-end"\/><hi[^>]*>HI<\/hi><\/add>/.test(line(pg, 0, 0)), { asked: r.asked, line: line(pg, 0, 0) });
    const xml = await page.evaluate(() => ME.Export.build(ME.App.project, {}).xml);
    T.check('at export the addition is cut at the marker: the verse ends with its first letter, the rest follows', /<lg xml:id="v1"><l>\s*<hi rend="rubricated">EF <\/hi><add place="left-margin"><hi rend="rubricated">G<\/hi><\/add><\/l><\/lg><add place="left-margin"><hi rend="rubricated">HI<\/hi><\/add>/.test(xml.replace(/\s*\n\s*/g, '')), xml.slice(xml.indexOf('v1') - 40, xml.indexOf('v1') + 300));

    // --- a marker inside a tag: asked, then the tag cut in two
    const selectIn = (i, from, to) => page.evaluate((i, from, to) => { const { Editor, Spans } = ME; Editor.focusLine('main', i, from); const l = Editor.lineEl('main', i); const a = Spans.pointAt(l, from), b = Spans.pointAt(l, to); getSelection().setBaseAndExtent(a.node, a.offset, b.node, b.offset); }, i, from, to);
    await selectIn(1, 5, 7);
    r = await run('p', 'a9', false);
    pg = await pages();
    T.check('a paragraph on EF inside <hi>DEFGH</hi> is asked about, and cancelled changes nothing', /falls inside a <hi> \(highlighted, rubricated\) tag/.test(r.asked) && /end of the paragraph/.test(r.asked) && line(pg, 0, 1) === 'ABC <hi rend="rubricated">DEFGH</hi> IJK', { asked: r.asked, line: line(pg, 0, 1) });
    await selectIn(1, 5, 7);
    r = await run('p', 'a9', true);
    pg = await pages();
    T.check('confirmed: the tag is cut in two around the markers, each part keeping its attributes', !!r.asked && line(pg, 0, 1) === 'ABC <hi rend="rubricated">D</hi><x-marker type="p-start" id="a9"/><hi rend="rubricated">EF</hi><x-marker type="p-end"/><hi rend="rubricated">GH</hi> IJK', line(pg, 0, 1));
    await selectIn(2, 4, 9);
    r = await run('p', 'b9', true);
    pg = await pages();
    T.check('at the edges of a tag the markers go just outside it, and nothing is asked', r.asked === null && line(pg, 0, 2) === 'ABC <x-marker type="p-start" id="b9"/><hi rend="rubricated">DEFGH</hi><x-marker type="p-end"/> IJK', { asked: r.asked, line: line(pg, 0, 2) });
    // the caret alone inside a tag: the verse line marker
    await page.evaluate(() => { ME.Editor.focusLine('main', 2, 5); });
    await run('lg', 'v2');
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 7));
    r = await run('l', undefined, true);
    pg = await pages();
    T.check('a verse line marker at the caret inside the tag cuts it too, after the question', /verse line marker falls inside/.test(r.asked) && /<x-marker type="lg-start" id="v2"\/><hi rend="rubricated">D<\/hi><x-marker type="l"\/><hi rend="rubricated">EFGH<\/hi>/.test(line(pg, 0, 2)), { asked: r.asked, line: line(pg, 0, 2) });

    // --- over the end of the folio on to the next
    await page.evaluate(() => ME.Editor.focusLine('main', 3, 7));
    await shiftArrow('ArrowRight', 3);
    await sleep(600);
    const crossed = await page.evaluate(() => ({ idx: ME.App.idx, a: ME.Editor.multi && ME.Editor.multi.a, f: ME.Editor.multi && ME.Editor.multi.f, status: document.getElementById('statusbar').textContent, focused: ME.Editor.activeLine() && ME.Editor.posOf(ME.Editor.activeLine()) }));
    T.check('Shift+→ past the last line of the folio shows the next folio, the selection kept from the one before', crossed.idx === 1 && crossed.a && crossed.a.label === lab[0] && crossed.a.i === 3 && crossed.a.offset === 7 && crossed.f.label === lab[1] && crossed.f.i === 0 && crossed.f.offset === 0 && /selection from folio/.test(crossed.status) && crossed.focused && crossed.focused.i === 0, crossed);
    await shiftArrow('ArrowRight', 2);
    const painted = await page.evaluate(() => ({ f: ME.Editor.multi.f.offset, ranges: [...CSS.highlights.get('lipi-multi')].map((r) => r.toString()) }));
    T.check('on the new folio the selection goes on from its first line (ab painted)', painted.f === 2 && painted.ranges.join('|') === 'ab', painted);
    await run('hi');
    pg = await pages();
    T.check('a tag over it runs over both folios, as one tag', line(pg, 0, 3) === 'yz01234<hi rend="rubricated">50</hi>' && line(pg, 1, 0) === '<hi rend="rubricated">ab</hi>cdefgh1' && /x-span="(\w+)"/.test(pg[lab[0]].boxes.main[3]) && pg[lab[1]].boxes.main[0].includes(pg[lab[0]].boxes.main[3].match(/x-span="(\w+)"/)[1]), [line(pg, 0, 3), line(pg, 1, 0)]);
    // and back: Shift+← from the start of the folio goes to the end of the one before; Shift+↓ past the end goes on too
    await page.evaluate(() => ME.Editor.focusLine('main', 0, 1));
    await shiftArrow('ArrowLeft', 2);
    await sleep(600);
    const backed = await page.evaluate(() => ({ idx: ME.App.idx, f: ME.Editor.multi && ME.Editor.multi.f }));
    T.check('Shift+← from the start of a folio goes back to the end of the folio before', backed.idx === 0 && backed.f && backed.f.label === lab[0] && backed.f.i === 3 && backed.f.offset === 9, backed);
    await page.keyboard.press('Escape');
    await page.evaluate(() => ME.Editor.focusLine('main', 3, 2));
    await shiftArrow('ArrowDown', 1);
    await sleep(600);
    const down = await page.evaluate(() => ({ idx: ME.App.idx, f: ME.Editor.multi && ME.Editor.multi.f }));
    T.check('Shift+↓ on the last line goes on to the first line of the next folio', down.idx === 1 && down.f && down.f.label === lab[1] && down.f.i === 0, down);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
