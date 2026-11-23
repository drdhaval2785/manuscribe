'use strict';
/* Recognition in the browser: the segmenter's maps turned into lines, as the reference pipeline does it
   (manuscript_ocr's msocr/tseg.py, vectorize). Checked against the reference's stage fixtures by
   tests/t-recog-conformance.js. Uses ME.RecogImage.pyRound (recogimage.js loads first).

   maps(raw, h, W, width, P)            the network's output (3 x h x W, float32) -> {pbase, up, down} (h x width):
                                        sigmoid of channel 0; channels 1 and 2 clipped at 0 and multiplied by norm
   components(mask, h, w)               8-connected components, runs joined row by row (union-find over runs), in
                                        raster order of their first pixel -> [{ys, xs}]
   vectorize(pbase, up, down, h, w, scale, P)   -> [{baseline: [[x, y], ...], boundary: [[x, y], ...]}] in page px:
                                        per piece the mean row of every column, a moving average (edge-padded), the
                                        reach up and down read at the rounded centre line and averaged, a point every
                                        `step` columns and the last, Python's rounding, the baseline simplified
                                        (Ramer–Douglas–Peucker); sorted by mean baseline height, then first x
   P is pipeline.json's "segmenter" section. */
(function (ME) {
  const pyRound = (x) => ME.RecogImage.pyRound(x);

  function maps(raw, h, W, width, P) {
    const n = h * width, pbase = new Float32Array(n), up = new Float32Array(n), down = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x, j = y * W + x;
        pbase[i] = 1 / (1 + Math.exp(-raw[j]));
        up[i] = Math.max(raw[h * W + j], 0) * P.norm;
        down[i] = Math.max(raw[2 * h * W + j], 0) * P.norm;
      }
    }
    return { pbase, up, down };
  }

  function components(mask, h, w) {
    const ry = [], ra = [], rb = [], parent = [];
    const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    let prev = [];
    for (let y = 0; y < h; y++) {
      const cur = [];
      let j = 0, x = 0;
      while (x < w) {
        if (!mask[y * w + x]) { x++; continue; }
        const a = x;
        while (x < w && mask[y * w + x]) x++;
        const b = x - 1, i = ry.length;
        ry.push(y); ra.push(a); rb.push(b); parent.push(i); cur.push(i);
        while (j < prev.length && rb[prev[j]] < a - 1) j++;
        for (let k = j; k < prev.length && ra[prev[k]] <= b + 1; k++) {
          const r1 = root(i), r2 = root(prev[k]);
          if (r1 !== r2) parent[Math.max(r1, r2)] = Math.min(r1, r2);
        }
      }
      prev = cur;
    }
    const groups = new Map();
    for (let i = 0; i < ry.length; i++) {
      const r = root(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    return [...groups.keys()].sort((p, q) => p - q).map((r) => {
      const ys = [], xs = [];
      for (const i of groups.get(r)) for (let x = ra[i]; x <= rb[i]; x++) { ys.push(ry[i]); xs.push(x); }
      return { ys, xs };
    });
  }

  function smooth(v, k) {
    const n = v.length;
    if (n < 3) return Float64Array.from(v);
    k = Math.min(k, n % 2 ? n : n - 1);
    const pad = k >> 1, w = 1 / k, out = new Float64Array(n);
    const at = (i) => v[Math.min(n - 1, Math.max(0, i - pad))];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += at(i + j) * w;
      out[i] = s;
    }
    return out;
  }

  function simplify(points, eps) {
    if (points.length < 3) return points.map((p) => p.slice());
    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [xa, ya] = points[a], [xb, yb] = points[b];
      const dx = xb - xa, dy = yb - ya, norm = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9);
      let far = 0, at = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dx * (points[i][1] - ya) - dy * (points[i][0] - xa)) / norm;
        if (d > far) { far = d; at = i; }
      }
      if (far > eps) { keep[at] = true; stack.push([a, at], [at, b]); }
    }
    return points.filter((p, i) => keep[i]).map((p) => p.slice());
  }

  function vectorize(pbase, up, down, h, w, s, P) {
    const mask = new Uint8Array(h * w);
    for (let i = 0; i < h * w; i++) mask[i] = pbase[i] > P.threshold ? 1 : 0;
    const lines = [];
    for (const { ys: rows, xs: cols } of components(mask, h, w)) {
      let x0 = Infinity, x1 = -Infinity;
      for (const c of cols) { if (c < x0) x0 = c; if (c > x1) x1 = c; }
      x1 += 1;
      if (x1 - x0 < P.min_piece) continue;
      const cnt = new Float64Array(x1 - x0), sum = new Float64Array(x1 - x0);
      for (let i = 0; i < cols.length; i++) { cnt[cols[i] - x0] += 1; sum[cols[i] - x0] += rows[i]; }
      const xs = [], mean = [];
      for (let c = 0; c < x1 - x0; c++) if (cnt[c] > 0) { xs.push(x0 + c); mean.push(sum[c] / cnt[c]); }
      const yc = smooth(mean, P.smooth_baseline);
      const rowAt = (y) => Math.min(h - 1, Math.max(0, pyRound(y)));
      let u = xs.map((x, i) => up[rowAt(yc[i]) * w + x]);
      let d = xs.map((x, i) => down[rowAt(yc[i]) * w + x]);
      u = smooth(u, P.smooth_reach);
      d = smooth(d, P.smooth_reach);
      const idx = [];
      for (let i = 0; i < xs.length; i += P.step) idx.push(i);
      if (idx[idx.length - 1] !== xs.length - 1) idx.push(xs.length - 1);
      const toPage = (x, y) => [pyRound(x / s), pyRound(y / s)];
      const bl = simplify(idx.map((i) => toPage(xs[i], yc[i])), P.simplify);
      if (bl.length === 1) bl.push([bl[0][0] + 1, bl[0][1]]);
      const top = idx.map((i) => toPage(xs[i], yc[i] - Math.max(1.0, u[i])));
      const bot = idx.slice().reverse().map((i) => toPage(xs[i], yc[i] + Math.max(1.0, d[i])));
      lines.push({ baseline: bl, boundary: top.concat(bot) });
    }
    const key = (l) => l.baseline.reduce((a, p) => a + p[1], 0) / l.baseline.length;
    return lines.sort((a, b) => key(a) - key(b) || a.baseline[0][0] - b.baseline[0][0]);
  }

  ME.RecogVector = { maps, components, smooth, simplify, vectorize };
})(window.ME);
