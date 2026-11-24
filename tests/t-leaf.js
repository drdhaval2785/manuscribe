// The leaf on a scanned page, and the page's own turn. A library's PDF often puts the leaf on an A4 page with its
// header and footer round it (and wide margins): the leaf is found on each page (PdfView.leafOn) and recognition reads
// it alone, as the segmenter learned (RV.sidePixels); a leaf drawn by hand (Calibrate) is read as drawn; a scan that
// is the leaf itself, its paper taken for the background, is read whole. A page that says it is to be shown turned
// (/Rotate 90: a long leaf stored upright) is shown, found and read turned so, on top of any turn given by hand.
// Hand-made PDFs: no models are needed.
const { launch, sleep, checks } = require('./h');

// a one-page PDF of `ops` drawn on a W x H page (in the displayed frame); turned: stored upright, /Rotate 90
function pdf(ops, W, H, turned) {
  const page = turned
    ? '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + H + ' ' + W + ']/Rotate 90/Contents 4 0 R>>'
    : '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + W + ' ' + H + ']/Contents 4 0 R>>';
  // shown turned a quarter clockwise, the stored page holds the picture turned a quarter the other way: (x, y) -> (H - y, x)
  const body = (turned ? '0 1 -1 0 ' + H + ' 0 cm\n' : '') + ops;
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', page, '<</Length ' + body.length + '>>\nstream\n' + body + 'endstream'];
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(out, 'latin1').toString('base64');
}

// eight lines of "writing" across a rectangle, the first line's start marked heavier (to tell its corner)
function writing(x0, y0, w, h, n) {
  let ops = '0.2 0.12 0.08 rg\n';
  const step = h / (n + 1);
  for (let k = 0; k < n; k++) {
    for (let x = x0 + 0.05 * w; x < x0 + 0.95 * w - 14; x += 22) {
      ops += x.toFixed(1) + ' ' + (y0 + h - (k + 1) * step).toFixed(1) + ' ' + (12 + ((x * 7 + k * 13) % 8)).toFixed(1) + ' ' + (0.32 * step).toFixed(1) + ' re f\n';
    }
  }
  return ops + (x0 + 0.02 * w).toFixed(1) + ' ' + (y0 + h - 1.4 * step).toFixed(1) + ' 10 ' + (0.9 * step).toFixed(1) + ' re f\n';
}

// A4 landscape (842 x 595): a library's header and footer, and the leaf between them
const LEAF = [0.03, 0.22, 0.94, 0.56];
function library() {
  const [W, H] = [842, 595];
  const [lx, ly, lw, lh] = [LEAF[0] * W, (1 - LEAF[1] - LEAF[3]) * H, LEAF[2] * W, LEAF[3] * H];
  let ops = '0.25 0.25 0.25 rg\n';
  for (let x = 250; x < 590; x += 9) ops += x + ' 560 6 9 re f\n';           // the header, a line of small letters
  for (let x = 40; x < 800; x += 9) if (x < 200 || x > 640) ops += x + ' 30 6 8 re f\n';   // the footer
  ops += '0.91 0.85 0.70 rg ' + lx + ' ' + ly + ' ' + lw + ' ' + lh + ' re f\n';
  return { ops: ops + writing(lx, ly, lw, lh, 8), W, H };
}

(async () => {
  const T = checks('The leaf on a scanned page, and the page\'s own turn');
  const { browser, page } = await launch('leaf');
  try {
    const lib = library();
    const plain = pdf(lib.ops, lib.W, lib.H, false), turned = pdf(lib.ops, lib.W, lib.H, true);
    // a scan that is the leaf: its paper to the edges, dense lines of writing on it
    const whole = pdf('0.91 0.85 0.70 rg 0 0 842 400 re f\n' + writing(0, 0, 842, 400, 11), 842, 400, false);
    const r = await page.evaluate(async (plain, turned, whole) => {
      const PV = ME.PdfView;
      await PV.ensureWorker();
      const open = async (b64) => pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const shown = async (pg, turn) => {
        const vp = pg.getViewport({ scale: 0.5, rotation: PV.turn(pg, turn) });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        return c.getContext('2d').getImageData(0, 0, c.width, c.height);
      };
      const out = {};
      const a = await (await open(plain)).getPage(1), b = await (await open(turned)).getPage(1);
      out.leafPlain = await PV.leafOn(a, 0, [0, 0, 1, 1]);
      out.leafTurned = await PV.leafOn(b, 0, [0, 0, 1, 1]);
      out.rotate = b.rotate;
      const ia = await shown(a, 0), ib = await shown(b, 0);
      out.sizes = [[ia.width, ia.height], [ib.width, ib.height]];
      let d = 0;
      if (ia.width === ib.width && ia.height === ib.height) { for (let i = 0; i < ia.data.length; i += 4) d += Math.abs(ia.data[i] - ib.data[i]); d /= ia.data.length / 4; } else d = 999;
      out.diff = d;
      // turned by hand a quarter on top of its own: a page standing upright
      const ic = await shown(b, 90);
      out.byHand = [ic.width, ic.height];
      const info = {};
      out.leafWhole = await PV.leafOn(await (await open(whole)).getPage(1), 0, [0, 0, 1, 1], info);
      out.fillWhole = info.fill;
      return out;
    }, plain, turned, whole);
    const near = (q, w, tol) => !!q && q.every((v, i) => Math.abs(v - w[i]) <= tol);
    T.check('the leaf between a library\'s header and footer is found', near(r.leafPlain, LEAF, 0.02), r.leafPlain);
    T.check('a page stored upright with /Rotate 90 is shown turned as it says: as wide as the plain page, and the same picture', r.rotate === 90 && JSON.stringify(r.sizes[0]) === JSON.stringify(r.sizes[1]) && r.diff < 2, r);
    T.check('its leaf is found where it is shown', near(r.leafTurned, LEAF, 0.02), r.leafTurned);
    T.check('a turn by hand is on top of the page\'s own', r.byHand[0] < r.byHand[1], r.byHand);
    T.check('a scan that is the leaf itself (its paper taken for the background) has no leaf found in it, and is read whole', r.leafWhole === null, { leaf: r.leafWhole, fill: r.fillWhole });

    // in a project: the side read from the leaf found on its own page; a leaf drawn by hand read as drawn
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Leaf', siglum: 'L' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'leaf.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      await ME.Store.putProject(p); await ME.Store.putPdf(p.id, blob); await ME.App.open(p.id);
    }, turned);
    for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(150);
    await sleep(400);
    const s = await page.evaluate(async () => {
      const A = ME.App, e = A.entries[A.idx], c = document.querySelector('.pdf-stage canvas');
      const out = { canvas: [c.width, c.height], detected: ME.PdfView.detectLeaf() };
      const px = await ME.RecogView.sidePixels(e, 685);
      out.found = { rect: px.render.rect, size: [px.width, px.height], rotation: px.render.rotation };
      ME.Model.setRegions(A.project, e, { leaf: [0.1, 0.25, 0.8, 0.5], boxes: { main: [0.15, 0.3, 0.7, 0.4] }, drawnOn: e.label }, 'all');
      const py = await ME.RecogView.sidePixels(e, 685);
      out.drawn = py.render.rect;
      return out;
    });
    T.check('in a project, the turned page is shown as wide as it is meant to be, and its leaf found at import', s.canvas[0] > s.canvas[1] && near(s.detected, LEAF, 0.02), s);
    T.check('recognition reads the side from the leaf found on its page, at the height asked', near(s.found.rect, LEAF, 0.02) && s.found.size[1] === 685 && s.found.size[0] > 2 * 685 && s.found.rotation === 0, s.found);
    T.check('a leaf drawn by hand (Calibrate) is read as drawn', JSON.stringify(s.drawn) === JSON.stringify([0.1, 0.25, 0.8, 0.5]), s.drawn);
  } finally {
    T.done(page);
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
