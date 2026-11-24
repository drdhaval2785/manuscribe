'use strict';
/* Recognition in the browser: a row cut out of the page, straightened along its baseline, scaled for the recogniser,
   and the recogniser's output decoded, as the reference pipeline does it (manuscript_ocr's msocr/linecut.py, and
   reference.py's cut, recogniser_input and decode). Checked against the reference's stage fixtures by
   tests/t-recog-conformance.js. Uses ME.RecogImage (recogimage.js loads first).

   bandOf(baseline, outline)            [above, below] in px: the largest offset of the outline's top over the
                                        baseline and of its bottom under it
   cutLine(page, w, h, ch, baseline, above, below, smooth)
                                        -> {data, width, height, channels}: one column for every px of the baseline's
                                        length, one row for every px of the band; column u is the point at distance u
                                        along the baseline, its direction taken over `smooth` px either side; row v is
                                        that point moved v - above + 0.5 px along the normal; each pixel read from the
                                        page by bilinear interpolation (white outside), rounded half to even
   cut(page, w, h, ch, baseline, outline, P)   the row's line image (P: pipeline.json)
   input(crop, P)                       -> {data: Float32Array, width, height}: grey, scaled to the recogniser's
                                        height (PIL's bilinear), ink high (1 - grey / 255 in float32)
   decode(logits, T, C, chars)          greedy CTC: the best class of every column, repeats and blanks (class 0)
                                        dropped -> {text, conf}: conf the mean probability of the classes kept, in %
   The page is the page's pixels as read (grey, RGB or RGBA: `ch` values a pixel), not the grey page: the reference
   cuts the colour page and turns the line image grey afterwards. */
(window.ME.recogModule = window.ME.recogModule || function (f) { (window.ME.recogSources = window.ME.recogSources || []).push(f); f(window.ME); })(function (ME) {
  const pyRound = (x) => ME.RecogImage.pyRound(x);
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  // numpy's pairwise sum of a float64 array (np.sum)
  function pairwise(a, lo, n) {
    if (n < 8) {
      let r = -0;
      for (let i = 0; i < n; i++) r += a[lo + i];
      return r;
    }
    if (n <= 128) {
      const r = [];
      for (let j = 0; j < 8; j++) r.push(a[lo + j]);
      let i = 8;
      for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j];
      let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
      for (; i < n; i++) res += a[lo + i];
      return res;
    }
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return pairwise(a, lo, n2) + pairwise(a, lo + n2, n - n2);
  }

  // the polyline's segments and the distance along it at which each starts
  function course(pts) {
    const m = pts.length - 1, sx = new Float64Array(m), sy = new Float64Array(m), lens = new Float64Array(m), cum = new Float64Array(m + 1);
    for (let k = 0; k < m; k++) {
      sx[k] = pts[k + 1][0] - pts[k][0];
      sy[k] = pts[k + 1][1] - pts[k][1];
      lens[k] = hyp(sx[k], sy[k]);
      cum[k + 1] = cum[k] + lens[k];
    }
    return { pts, sx, sy, lens, cum };
  }

  // the point at distance u along the polyline, clamped to its ends
  function along(c, u) {
    const { cum, lens } = c, m = lens.length;
    u = Math.min(Math.max(u, 0), cum[m]);
    let lo = 0, hi = cum.length;                     // the number of starts at or before u (searchsorted, side right)
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= u) lo = mid + 1; else hi = mid; }
    const k = Math.min(Math.max(lo - 1, 0), m - 1);
    const t = (u - cum[k]) / Math.max(lens[k], 1e-9);
    return [c.pts[k][0] + c.sx[k] * t, c.pts[k][1] + c.sy[k] * t];
  }

  function cutLine(page, w, h, ch, baseline, above, below, smooth) {
    let pts = baseline.filter((p, i) => i === 0 || hyp(p[0] - baseline[i - 1][0], p[1] - baseline[i - 1][1]) > 1e-6).map((p) => [+p[0], +p[1]]);
    if (pts.length < 2) pts = [pts[0], [pts[0][0] + 1, pts[0][1]]];
    const c = course(pts);
    const cols = pyRound(pairwise(c.lens, 0, c.lens.length)) + 1;
    above = pyRound(above); below = pyRound(below);
    const rows = above + below;
    const out = new Uint8Array(rows * cols * ch);
    const acc = new Float64Array(ch);
    for (let u = 0; u < cols; u++) {
      const p = along(c, u), a = along(c, u + smooth), b = along(c, u - smooth);
      let dx = a[0] - b[0], dy = a[1] - b[1];
      const norm = Math.max(hyp(dx, dy), 1e-9);
      dx /= norm; dy /= norm;
      const nx = -dy, ny = dx;                        // the normal, down the page for a level line
      for (let r = 0; r < rows; r++) {
        const v = r - above + 0.5;
        const x = p[0] + v * nx, y = p[1] + v * ny;
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        acc.fill(0);
        for (let dyi = 0; dyi < 2; dyi++) {
          const wy = dyi ? fy : 1.0 - fy, yi = y0 + dyi;
          for (let dxi = 0; dxi < 2; dxi++) {
            const wx = dxi ? fx : 1.0 - fx, xi = x0 + dxi, wgt = wx * wy;
            const inside = xi >= 0 && xi < w && yi >= 0 && yi < h, at = (yi * w + xi) * ch;
            for (let k = 0; k < ch; k++) acc[k] = acc[k] + (inside ? page[at + k] : 255.0) * wgt;
          }
        }
        const o = (r * cols + u) * ch;
        for (let k = 0; k < ch; k++) out[o + k] = Math.min(255, Math.max(0, pyRound(acc[k])));
      }
    }
    return { data: out, width: cols, height: rows, channels: ch };
  }

  function bandOf(baseline, outline) {
    const n = baseline.length;
    let above = -Infinity, below = -Infinity;
    for (let i = 0; i < n; i++) {
      above = Math.max(above, baseline[i][1] - outline[i][1]);
      below = Math.max(below, outline[outline.length - 1 - i][1] - baseline[i][1]);
    }
    return [above, below];
  }

  function cut(page, w, h, ch, baseline, outline, P) {
    const [above, below] = bandOf(baseline, outline);
    return cutLine(page, w, h, ch, baseline, above, below, P.cutter.smooth);
  }

  function input(crop, P) {
    const R = ME.RecogImage;
    const g = crop.channels === 1 ? crop.data : R.grey(crop.data, crop.width, crop.height, crop.channels);
    const [rw, rh] = R.recogniserSize(crop.width, crop.height, P.recogniser.height, P.recogniser.stride);
    const small = R.resize(g, crop.width, crop.height, rw, rh);
    const data = new Float32Array(rw * rh);
    for (let i = 0; i < data.length; i++) data[i] = Math.fround(1 - Math.fround(small[i] / 255));
    return { data, width: rw, height: rh };
  }

  function decode(logits, T, C, chars) {
    let text = '', sum = 0, kept = 0, prev = 0;
    for (let t = 0; t < T; t++) {
      const o = t * C;
      let best = 0;
      for (let c = 1; c < C; c++) if (logits[o + c] > logits[o + best]) best = c;
      if (best !== prev && best !== 0) {
        let z = 0;
        for (let c = 0; c < C; c++) z += Math.exp(logits[o + c] - logits[o + best]);
        text += chars[best - 1];
        sum += 1 / z;
        kept++;
      }
      prev = best;
    }
    return { text, conf: 100 * (kept ? sum / kept : 0) };
  }

  ME.RecogRead = { bandOf, cutLine, cut, input, decode, pairwise };
});
