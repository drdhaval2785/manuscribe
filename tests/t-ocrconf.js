// How sure the recogniser was, shown in the status bar beside the side's level: for the akṣara the cursor stands after,
// or the one under the mouse, in a line the recogniser proposed and nobody has changed: its least sure letter in whole
// per cent (e.pcts), marked where it is under the threshold of the doubtful letters; only in tenths (60–69 %) for a
// line read before the exact figure was kept (e.confs alone); nothing in a line edited, accepted, or typed by hand.
const { launch, checks, sleep } = require('./h');
(async () => {
  const { browser, page } = await launch('ocrconf');
  const T = checks('Confidence of the akṣara at the cursor (status bar)');
  try {
    // धर्मक्षेत्रे कुरुक्षेत्रे, proposed with a probability for each letter; रामः from before pcts were kept; a line typed
    const t0 = 'धर्मक्षेत्रे कुरुक्षेत्रे';
    const p0 = [99, 97, 95, 63, 88, 90, 41, 92, 99, 99, 98, 97, null, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
    await page.evaluate(async (t0, p0) => {
      const { Model, Store, App } = ME;
      const p = Model.upgrade(Model.newProject({ meta: { title: 'Conf', siglum: 'C', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 3 }, folios: {} }));
      p.pdf = { name: 'x.pdf', pages: 1 };
      const label = Model.entries(p)[0].label;
      const pcts = p0.map((v) => (v === null ? '  ' : String(v).padStart(2, '0'))).join('');
      const confs = p0.map((v) => (v === null ? ' ' : String(Math.floor(v / 10)))).join('');
      p.sources = [{ id: 's1', kind: 'htr', software: 'test' }];
      p.pages = { [label]: { level: 'ocr', boxes: { main: [t0, 'रामः', 'अन्य'] },
        proposed: { main: { 0: { text: t0, src: 's1', conf: 0.9, confs, pcts }, 1: { text: 'रामः', src: 's1', conf: 0.8, confs: '9969' } } } } };
      await Store.putProject(p);
      await App.open(p.id);
    }, t0, p0);
    await sleep(500);

    // the cursor placed in a line, at a place in its text; what the status bar then says
    const caretAt = (i, off) => page.evaluate(async (i, off) => {
      const el = ME.Editor.lineEl('main', i);
      el.focus();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n = walk.nextNode(), k = off;
      while (n && k > n.data.length) { k -= n.data.length; n = walk.nextNode(); }
      const r = document.createRange(); r.setStart(n, k); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      for (let f = 0; f < 4; f++) await new Promise((res) => requestAnimationFrame(res));
      const host = document.getElementById('ocr-conf');
      return { hidden: host.hidden, text: host.textContent.replace(/\s+/g, ' ').trim(), low: host.classList.contains('low'), title: host.title };
    }, i, off);
    const read = () => page.evaluate(() => { const h = document.getElementById('ocr-conf'); return { hidden: h.hidden, text: h.textContent.replace(/\s+/g, ' ').trim(), low: h.classList.contains('low'), title: h.title }; });

    const bar = await page.evaluate(() => {
      const sel = document.getElementById('sel-proof'), c = document.getElementById('ocr-conf');
      return c.parentElement === sel.parentElement && sel.nextElementSibling === c;
    });
    T.check('the confidence has its place in the status bar, right after the selector of the side’s level', bar);

    const r1 = await caretAt(0, 4);          // after धर्म: the akṣara र्म, its least sure letter म 63 %
    const r0 = await caretAt(0, 0);          // at the line's start: the first akṣara, ध
    const r2 = await caretAt(0, 12);         // after क्षेत्रे: त्रे (97 %), a conjunct one akṣara
    const r3 = await caretAt(0, 8);          // after क्षे: 41 %
    const rs = await caretAt(0, 13);         // after the space: nothing to say
    T.check('the akṣara the cursor stands after, a conjunct counted as one, with its least sure letter in whole per cent (र्म 63 %; ध at the line’s start; त्रे 97 %), each letter’s own in the title; marked when under the doubtful letters’ threshold (70 %); nothing after a space',
      !r1.hidden && r1.text === 'OCRर्म63 %' && r1.low && /र 97 % · ◌् 95 % · म 63 %/.test(r1.title) && /before the cursor/.test(r1.title)
        && r0.text === 'OCRध99 %' && !r0.low && r2.text === 'OCRत्रे97 %' && !r2.low && r3.text === 'OCRक्षे41 %' && r3.low && rs.hidden, { r1, r0, r2, r3, rs });

    // the mouse over an akṣara, also over the right half of it (where the nearest place between letters is after it)
    const rectOf = (i, a, b) => page.evaluate((i, a, b) => {
      const el = ME.Editor.lineEl('main', i), n = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b);
      const q = r.getBoundingClientRect();
      return { left: q.left, right: q.right, top: q.top, bottom: q.bottom };
    }, i, a, b);
    await caretAt(0, 4);                     // the cursor after र्म, to come back to
    const q = await rectOf(0, 4, 8);         // क्षे
    await page.mouse.move((q.left + q.right) / 2, (q.top + q.bottom) / 2);
    await sleep(120);
    const h1 = await read();
    const d = await rectOf(0, 0, 1);         // ध, near its right edge
    await page.mouse.move(d.right - 1.5, (d.top + d.bottom) / 2);
    await sleep(120);
    const h2 = await read();
    await page.mouse.move(5, 5);             // out of the typing area: back to the cursor's
    await sleep(120);
    const h3 = await read();
    T.check('the mouse over an akṣara shows that one (क्षे 41 %, said to be under the mouse), also over its right half (ध), and leaving the typing area goes back to the cursor’s',
      h1.text === 'OCRक्षे41 %' && h1.low && /under the mouse/.test(h1.title) && h2.text === 'OCRध99 %' && h3.text === 'OCRर्म63 %' && /before the cursor/.test(h3.title), { h1, h2, h3 });

    const b1 = await caretAt(1, 4);          // रामः, read before pcts were kept: मः, म in tenths
    T.check('a line read before the exact figure was kept says the tenth only (मः 60–69 %), and says so', b1.text === 'OCRमः60–69 %' && b1.low && /in tenths only/.test(b1.title), b1);

    const typed = await caretAt(2, 2);       // a line typed by hand
    const edited = await page.evaluate(async () => {
      const el = ME.Editor.lineEl('main', 0);
      el.textContent = el.textContent + 'क';
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }).then(() => caretAt(0, 4));
    const accepted = await page.evaluate(async () => {
      const p = ME.App.project, e = ME.App.entries[ME.App.idx];
      ME.HTR.accept(p, e.label, 'main', 1);
      await new Promise((r) => setTimeout(r, 200));
    }).then(() => caretAt(1, 4));
    T.check('nothing in a line typed by hand, a proposed line once edited, or one accepted', typed.hidden && edited.hidden && accepted.hidden, { typed, edited, accepted });
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
