// <p> and <lg> on what is selected: the tag opens where the selection starts and closes where it ends, within a line,
// over several lines (selected with the mouse), and over several folios (from a start marked with "."). With nothing
// selected only the start is put in.
const { launch, sleep, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('paragraph');
  const T = checks('A tag on what is selected');
  try {
    await page.evaluate(async () => {
      const { Model, Store } = ME;
      const p = Model.upgrade(Model.newProject({ meta: { title: 'K', siglum: 'K', textLang: 'en' }, layoutType: 'linear', lines: { main: 4 }, folios: {} }));
      p.pdf = { name: 'x.pdf', pages: 3 };
      const labels = Model.entries(p).map((e) => e.label);
      p.pages = {};
      labels.forEach((l, n) => { p.pages[l] = { boxes: { main: ['abcdefgh', 'ijklmnop', 'qrstuvwx', 'yz012345'].map((x) => x + n) } }; });
      await Store.putProject(p);
      await ME.App.open(p.id);
      window.labels = labels;
    });
    await sleep(600);
    // runs a command, answers its dialog with this id; or cancels. -> the lines of the folios, as stored
    const run = (cmd, id) => page.evaluate(async (cmd, id) => {
      const { Commands } = ME;
      const c = Commands.REG.find((r) => r.id === cmd);
      const going = c.run();
      for (let i = 0; i < 200 && !document.querySelector('.modal-foot .btn.primary'); i++) await new Promise((r) => setTimeout(r, 20));
      if (id === null) [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent === 'Cancel').click();
      else { document.querySelector('.modal input[data-focus]').value = id; document.querySelector('.modal-foot .btn.primary').click(); }
      await going;
      ME.App.flush();
      await new Promise((r) => setTimeout(r, 60));
      return ME.App.project.pages;
    }, cmd, id);
    const selectIn = (i, from, to) => page.evaluate((i, from, to) => {
      const { Editor } = ME;
      Editor.focusLine('main', i, from);
      const l = Editor.lineEl('main', i);
      const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      getSelection().setBaseAndExtent(n, from, n, to);
    }, i, from, to);
    const S = (id) => '<x-marker type="p-start" id="' + id + '"/>', E = '<x-marker type="p-end"/>';
    const lab = await page.evaluate(() => window.labels);
    const line = (pages, f, i) => pages[lab[f]].boxes.main[i];

    // within a line
    await selectIn(0, 2, 5);
    let pages = await run('p', 'a1');
    T.check('a selection within a line: the paragraph opens and closes around it', line(pages, 0, 0) === 'ab' + S('a1') + 'cde' + E + 'fgh0', line(pages, 0, 0));

    // over lines, selected with the mouse: a click, then shift and a click
    const at = (i, x) => page.evaluate((i, x) => { const el = ME.Editor.lineEl('main', i); const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); const r = document.createRange(); r.setStart(n, x); r.setEnd(n, x + 1); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 }; }, i, x);
    const a = await at(1, 2);
    await page.mouse.click(a.x, a.y);
    await sleep(400);
    const b = await at(2, 4); // the first click may have scrolled the line to the middle
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await sleep(120);
    T.check('the mouse has selected over two lines', await page.evaluate(() => !!ME.Editor.multi));
    pages = await run('p', 'a2');
    T.check('a selection over lines: it opens at the start and closes at the end', /^ij<x-marker type="p-start" id="a2"\/>klmnop0$/.test(line(pages, 0, 1)) && /^qrst<x-marker type="p-end"\/>uvwx0$/.test(line(pages, 0, 2)), [line(pages, 0, 1), line(pages, 0, 2)]);

    // over folios: a start marked on one, then the tag on another
    await page.evaluate(() => { const { Editor } = ME; Editor.focusLine('main', 3, 1); Editor.setPending({ label: Editor.entry.label, box: 'main', i: 3, offset: 1 }); });
    await page.evaluate(async () => { await ME.App.go(1, { noFocus: true }); });
    await sleep(400);
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 3));
    pages = await run('p', 'a3');
    T.check('over folios: it opens on the first and closes on the last', line(pages, 0, 3) === 'y' + S('a3') + 'z0123450' && line(pages, 1, 2) === 'qrs' + E + 'tuvwx1', [line(pages, 0, 3), line(pages, 1, 2)]);

    // a verse too, and cancelling
    await selectIn(0, 1, 3);
    pages = await run('lg', 'v1');
    T.check('a verse on a selection too', /^a<x-marker type="lg-start" id="v1"\/>bc<x-marker type="lg-end"\/>defgh1$/.test(line(pages, 1, 0)), line(pages, 1, 0));
    await selectIn(1, 1, 3);
    const before = line(pages, 1, 1);
    pages = await run('p', null);
    T.check('cancelling the dialog changes nothing', line(pages, 1, 1) === before, line(pages, 1, 1));

    // nothing selected
    await page.evaluate(() => ME.Editor.focusLine('main', 3, 2));
    pages = await run('p', 'a4');
    T.check('with nothing selected, only the start is put in, as before', line(pages, 1, 3) === 'yz' + S('a4') + '0123451', line(pages, 1, 3));
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
