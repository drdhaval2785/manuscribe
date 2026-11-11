// A long export shows that it is working: a bar that appears at once, moves through its stages and goes away, and a
// page that is not frozen meanwhile.
const { launch, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');
(async () => {
  const { browser, page } = await launch('progress', { fonts: true });
  const T = checks('Progress of an export');
  try {
    await buildInPage(page, LANGS.sa, make('sa', 2, 80, 26, 5), 26);
    const res = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      const { U, Collate, ExportView: X } = ME;
      const out = [];
      const ok = (n, c, x) => out.push([n, !!c, x]);
      await Collate.run(ed, list, 'main', {});
      const tick = (ms) => new Promise((r) => setTimeout(r, ms));
      const wait = async (f, most) => { for (let i = 0; i < (most || 5000) / 20 && !f(); i++) await tick(20); return f(); };
      const saved = [];
      const realDownload = U.download;
      U.download = (name, blob) => { saved.push({ name, size: blob.size }); };
      // makes a format through the dialog, watching the bar and the page's heartbeat
      const run = async (format) => {
        let open = X.open({ kind: 'edition', ed, list, workId: 'main' });
        await wait(() => document.querySelector('[data-action="export-go"]'));
        const row = document.querySelector('.xp-row[data-format="' + format + '"] input[type=radio]');
        row.click();
        const seen = { texts: [], widths: [], shown: false, worst: 0 };
        let last = performance.now(), on = true;
        const beat = () => { const n = performance.now(); seen.worst = Math.max(seen.worst, n - last); last = n; if (on) requestAnimationFrame(beat); };
        requestAnimationFrame(beat);
        const spy = setInterval(() => {
          const box = document.querySelector('[data-action="export-progress"]');
          if (!box) return;
          seen.shown = true;
          const t = box.querySelector('.xp-progress-text').textContent, w = parseFloat(box.querySelector('.xp-fill').style.width);
          if (seen.texts[seen.texts.length - 1] !== t) seen.texts.push(t);
          seen.widths.push(w);
        }, 15);
        const before = saved.length;
        document.querySelector('[data-action="export-go"]').click();
        seen.atClick = !!document.querySelector('[data-action="export-progress"]');
        await wait(() => saved.length > before, 120000);
        await tick(50);
        clearInterval(spy); on = false;
        seen.after = !!document.querySelector('[data-action="export-progress"]');
        seen.saved = saved[saved.length - 1];
        await open;
        return seen;
      };
      const pdf = await run('pdf');
      ok('the PDF shows a bar as soon as Export is pressed', pdf.atClick && pdf.shown, pdf.texts);
      ok('it says what it is doing, stage by stage', pdf.texts.some((t) => /Laying out/.test(t)) && pdf.texts.some((t) => /Writing page \d+ of \d+/.test(t)), pdf.texts);
      ok('it only moves forward', pdf.widths.length > 3 && pdf.widths.every((w, i) => !i || w >= pdf.widths[i - 1]) && pdf.widths[pdf.widths.length - 1] > 50, pdf.widths.slice(-5));
      ok('it goes away when the file is saved', !pdf.after && pdf.saved && /\.pdf$/.test(pdf.saved.name) && pdf.saved.size > 1000, pdf.saved);
      // (GitHub's computers are slower, and Firefox there writes a PDF slower still)
      const F = window.MANUSCRIBE_CI ? (window.MANUSCRIBE_ENGINE === 'firefox' ? 6 : 3) : 1;
      ok('the page is not frozen meanwhile (' + (pdf.worst / 1000).toFixed(1) + ' s at the longest)', pdf.worst < 2500 * F, pdf.worst);
      const md = await run('markdown');
      ok('a quicker format has the bar too, and it goes away', md.atClick && !md.after && md.saved && /\.md$/.test(md.saved.name), md.saved);
      const held = U.progressPanel('x'), shineEl = document.querySelector('.xp-shine');
      const anim = shineEl.getAnimations()[0];
      const frames = anim ? anim.effect.getKeyframes() : [];
      ok('its shine moves by the compositor, so it runs even while the page is busy', anim && frames.length >= 2 && frames.every((f) => f.transform && !f.left && !f.width), frames);
      held.close();
      U.download = realDownload;
      // the panel, by itself
      const p = U.progressPanel('Test');
      p.set(0.5, 'half'); p.set(0.2, 'not back');
      const box = document.querySelector('[data-action="export-progress"]');
      ok('the bar is announced as a progress bar, and never goes back', box.querySelector('[role=progressbar]').getAttribute('aria-valuenow') === '50' && parseFloat(box.querySelector('.xp-fill').style.width) === 50);
      p.close();
      return out;
    });
    for (const [n, ok, x] of res) T.check(n, ok, x);
    // one very long block: the percentage is of the whole, and stays within it
    const lines = Array.from({ length: 26 }, () => 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय');
    const pages = Array.from({ length: 80 }, () => lines.slice());
    pages[0][0] = '<x-marker type="p-start" id="v1"/>' + pages[0][0];
    pages[79][25] += '<x-marker type="p-end"/>';
    await buildInPage(page, LANGS.sa, [{ siglum: 'A', pages }], 26);
    const said = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const seen = [];
      await ME.Capture.pdf(ed, list, built, { onProgress: (f, t) => seen.push([f, t]) });
      return seen;
    });
    const percents = said.map(([, t]) => /(\d+)%/.exec(t)).filter(Boolean).map((m) => +m[1]);
    T.check('over one long block the layout reports within the block, and never above 100% (' + percents.join(', ') + ')', percents.length > 1 && percents.every((p) => p >= 0 && p <= 100) && said.every(([f]) => f <= 1), said.slice(0, 12));
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
