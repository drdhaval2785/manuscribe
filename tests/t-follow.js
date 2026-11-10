// The scan follows the letter being typed: akṣaras counted as a reader of the page counts them, the line's expected
// length learnt from the lines above, the letter kept in the middle of the pane (the first and the last of a line too),
// a click inside a line typed halfway reckoned over the whole line, a pan by hand that stops the following until
// Follow or the next line (and a scroll by nothing of the kind, such as a late event of the app's own scroll, that does
// not), a pinch that zooms; and the figure of letters per line, given at setup and kept for old projects. Uses
// linear.pdf from the repository folder.
const fs = require('fs'), path = require('path');
const { launch, sleep, checks, ROOT } = require('./h');
(async () => {
  const T = checks('The scan follows the letter');
  const { browser, page } = await launch('follow');
  try {
    const unit = await page.evaluate(() => {
      const { Follow, Model } = ME;
      const out = [];
      const ok = (n, c, x) => out.push([n, !!c, x]);
      const c = Follow.count;
      ok('akṣaras are counted, conjuncts as one: धर्मक्षेत्रे is 4', c('धर्मक्षेत्रे') === 4, c('धर्मक्षेत्रे'));
      ok('spaces and note placeholders count for nothing', c('धर्मक्षेत्रे कुरुक्षेत्रे ￼ समवेता') === 12 && c('   ') === 0, c('धर्मक्षेत्रे कुरुक्षेत्रे ￼ समवेता'));
      ok('a daṇḍa and a digit are one each', c('युयुत्सवः । १२ ॥') === 4 + 1 + 2 + 1, c('युयुत्सवः । १२ ॥'));
      ok('in a script without akṣaras, a letter is one: dharmakṣetre is 12', c('dharmakṣetre') === 12 && c('dharmakṣetre kurukṣetre') === 22, c('dharmakṣetre'));
      ok('Bengali and Grantha conjuncts too', c('ক্ষেত্র') === 2 && c('𑌕𑍍𑌷') === 1, [c('ক্ষেত্র'), c('𑌕𑍍𑌷')]);
      const f = Follow.fraction;
      ok('the caret in a line already typed: its place over the line’s own length', Math.abs(f({ before: 30, total: 60, atEnd: false, above: [], perLine: 65 }) - 0.5) < 1e-9);
      ok('typing on at the end, with no line above: over the figure given', Math.abs(f({ before: 13, total: 13, atEnd: true, above: [], perLine: 65 }) - 13 / 65) < 1e-9 && Math.abs(f({ before: 13, total: 13, atEnd: true, above: [] }) - 13 / 65) < 1e-9);
      ok('with lines above: over their average, a short last line of a paragraph left out', Math.abs(Follow.expected([64, 66, 12, 68, 65], 65) - (64 + 66 + 68 + 65) / 4) < 1e-9 && Math.abs(Follow.expected([30, 32, 31], 65) - 31) < 1e-9);
      ok('never past the end of the line', f({ before: 80, total: 80, atEnd: true, above: [], perLine: 65 }) < 1 && f({ before: 80, total: 80, atEnd: true, above: [], perLine: 65 }) > 0.98);
      ok('inside a line typed halfway (20 of 65), the caret at its 10th letter is 10/65 along, not half; once the line is complete, over its own length', Math.abs(f({ before: 10, total: 20, atEnd: false, above: [], perLine: 65 }) - 10 / 65) < 1e-9 && Math.abs(f({ before: 10, total: 20, atEnd: false, above: [], perLine: 65, complete: true }) - 0.5) < 1e-9);
      // before the blocks are drawn: a guess inside the leaf, marked as such; nothing without a leaf
      const q = Model.newProject({ lines: { main: 10 }, pdf: { name: 'x.pdf', pages: 2 } }), e0 = Model.entries(q)[0];
      ok('with no leaf known, a line has no place on the scan', Model.lineRect(q, e0, 'main', 0) === null);
      q.layout.regions['0'] = { leaf: [0.1, 0.2, 0.8, 0.6], boxes: {} };
      const g = Model.lineRect(q, e0, 'main', 3);
      ok('with the leaf known and no blocks drawn, a line is guessed inside the leaf, and says so', g && g.guessed === true && g[0] > 0.1 && g[0] + g[2] < 0.9 && g[1] > 0.2 && g[1] + g[3] < 0.8 && Math.abs(g[3] - 0.6 * 0.82 / 10) < 0.01, g);
      q.layout.regions['0'].boxes.main = [0.2, 0.3, 0.6, 0.4];
      const d = Model.lineRect(q, e0, 'main', 0);
      ok('with the block drawn, the line is where it was drawn, and not a guess', d && !d.guessed && d[0] === 0.2 && Math.abs(d[3] - 0.04) < 1e-9, d);
      const p = Model.newProject({ lettersPerLine: 80 }), old = Model.upgrade({ meta: {}, layout: { type: 'linear', lines: {} } });
      ok('the figure is kept with the project (80), and an old project gets 65', p.layout.lettersPerLine === 80 && Model.newProject({}).layout.lettersPerLine === 65 && old.layout.lettersPerLine === 65, [p.layout.lettersPerLine, old.layout.lettersPerLine]);
      return out;
    });
    for (const [n, ok, x] of unit) T.check(n, ok, x);

    const pdf = path.join(ROOT, 'linear.pdf');
    if (!fs.existsSync(pdf)) { T.skip('the scan', 'linear.pdf is not in the repository folder'); T.done(page); return; }
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Follow', siglum: 'F', textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      // the text block, as a calibration would set it: the middle of the page
      p.layout.regions['0'] = { leaf: [0.05, 0.05, 0.9, 0.9], boxes: { main: [0.12, 0.2, 0.76, 0.6] } };
      await ME.Store.putProject(p);
      await ME.Store.putPdf(p.id, blob);
      await ME.App.open(p.id);
      window.__pid = p.id;
    }, fs.readFileSync(pdf).toString('base64'));
    for (let k = 0; k < 60 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    await page.evaluate(async () => { await ME.PdfView.setZoom(4); });
    await sleep(400);
    // where the letter the caret is at stands on the scan, against the middle of the pane
    const where = () => page.evaluate(() => {
      const P = ME.PdfView, line = ME.Editor.activeLine();
      if (!line) return { noLine: true, following: P.following, button: !document.getElementById('btn-follow').hidden };
      const pos = ME.Editor.posOf(line);
      const rect = ME.Model.lineRect(ME.App.project, ME.App.entries[ME.App.idx], pos.box, pos.i);
      const f = ME.Follow.along(ME.App.project, line, pos);
      const scroller = document.querySelector('.pdf-scroller'), clip = document.querySelector('.pdf-clip'), stage = document.querySelector('.pdf-stage');
      const ox = clip.offsetLeft + (parseFloat(stage.style.left) || 0), sw = parseFloat(stage.style.width);
      const x = ox + (rect[0] + f * rect[2]) * sw - scroller.scrollLeft;
      return { f: +f.toFixed(3), off: Math.round(x - scroller.clientWidth / 2), scrollLeft: Math.round(scroller.scrollLeft), following: P.following, button: !document.getElementById('btn-follow').hidden, canScroll: scroller.scrollWidth > scroller.clientWidth + 4 };
    });
    await page.evaluate(() => ME.Editor.focusLine('main', 1, 0));
    await sleep(900);
    let w = await where();
    T.check('zoomed in, the start of an empty line is in the middle of the pane (room is left for it)', w.canScroll && w.f === 0 && Math.abs(w.off) <= 16, w);
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता');
    await sleep(1100);
    w = await where();
    T.check('after 12 akṣaras of a line expected to have 65, the letter is 12/65 along, and in the middle', Math.abs(w.f - 12 / 65) < 0.002 && Math.abs(w.off) <= 16 && w.following && !w.button, w);
    // a click inside the line typed halfway: its place over the whole line
    await page.evaluate(() => ME.Editor.setCaret(ME.Editor.activeLine(), 5));
    await sleep(1100);
    w = await where();
    T.check('the caret put back at the 3rd akṣara of the 12: 3/65 along, and in the middle', Math.abs(w.f - 3 / 65) < 0.002 && Math.abs(w.off) <= 16 && w.following, w);
    // a scroll event the app's own smooth scroll sends late (as on a phone after a long way): the scan follows on
    await page.evaluate(() => document.querySelector('.pdf-scroller').dispatchEvent(new Event('scroll')));
    await sleep(100);
    w = await where();
    T.check('a late scroll event of the app’s own does not stop the following', w.following && !w.button, w);
    // a pan by hand (a finger on the pane): the scan stays where it was put, and offers to follow again
    const byHand = (dx) => page.evaluate((dx) => {
      const s = document.querySelector('.pdf-scroller');
      s.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', bubbles: true }));
      s.scrollLeft += dx;
      s.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }));
    }, dx);
    await byHand(300);
    await sleep(300);
    const panned = await where();
    await page.keyboard.type(' युयुत्सवः');
    await sleep(900);
    w = await where();
    T.check('after a pan by hand the scan stays where it was put while the typing goes on, and Follow is offered', !w.following && w.button && !panned.following && Math.abs(w.scrollLeft - panned.scrollLeft) <= 2 && w.f > panned.f, { panned, w });
    await page.click('#btn-follow');
    await sleep(1000);
    w = await where();
    T.check('Follow brings the letter back to the middle, and the caret stays in its line', !w.noLine && w.following && !w.button && Math.abs(w.off) <= 16, w);
    await byHand(-200);
    await sleep(300);
    await page.evaluate(() => ME.Editor.focusLine('main', 2, 0));
    await sleep(1000);
    w = await where();
    T.check('moving to another line, the scan follows again of itself', w.following && !w.button && Math.abs(w.off) <= 16, w);
    // the lines above teach the length of a line: two lines of 24 akṣaras, then the third
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव');
    await page.evaluate(() => ME.Editor.focusLine('main', 3, 0));
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव');
    await page.evaluate(() => ME.Editor.focusLine('main', 4, 0));
    await page.keyboard.type('धर्मक्षेत्रे कुरुक्षेत्रे समवेता');
    await sleep(1100);
    w = await where();
    // the lines above hold 16, 24 and 24 akṣaras (the empty first line counts for nothing): a line is expected to hold their average
    T.check('the lines above teach the length: 12 akṣaras are 12/21.3 along, not 12/65', Math.abs(w.f - 12 / ((16 + 24 + 24) / 3)) < 0.02 && Math.abs(w.off) <= 16, w);
    // the caret inside a line already typed: its place over the line's own length
    await page.evaluate(() => ME.Editor.focusLine('main', 3, 0));
    await sleep(1200);
    w = await where();
    T.check('at the start of a line already typed, the first letter is in the middle', w.f === 0 && Math.abs(w.off) <= 16, w);
    // a pinch zooms the scan about the point between the fingers
    const pinched = await page.evaluate(async () => {
      const P = ME.PdfView, stage = document.querySelector('.pdf-stage'), z0 = P.zoom;
      const box = document.querySelector('.pdf-scroller').getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const ev = (type, id, x, y) => stage.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, bubbles: true }));
      ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
      for (let k = 1; k <= 5; k++) { ev('pointermove', 1, cx - 40 - 4 * k, cy); ev('pointermove', 2, cx + 40 + 4 * k, cy); }
      const scaledWhileMoving = /scale\(/.test(document.querySelector('.pdf-clip').style.transform);
      ev('pointerup', 1, cx - 60, cy); ev('pointerup', 2, cx + 60, cy);
      await new Promise((r) => setTimeout(r, 900));
      return { z0, z: P.zoom, scaledWhileMoving, transformGone: !document.querySelector('.pdf-clip').style.transform, following: P.following };
    });
    T.check('a pinch zooms the scan (' + pinched.z0 + ' → ' + pinched.z.toFixed(1) + '), scaling it while the fingers move and drawing it afresh after', Math.abs(pinched.z / pinched.z0 - 1.5) < 0.1 && pinched.scaledWhileMoving && pinched.transformGone && !pinched.following, pinched);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
