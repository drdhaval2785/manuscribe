'use strict';
/* Recognition in the browser: the rows of text of a page, from the lines the segmenter found, as the reference pipeline
   finds them (manuscript_ocr's msocr/reference.py, rows(): align.find_rows, fill_edge_rows and _merge on a linear page;
   blocks.page_blocks on a tripāṭha or pañcapāṭha page, the row finder then run on every block). Each function mirrors
   the Python function named in its comment, with the same thresholds, so that the two can be read side by side.
   Checked against the reference's fixtures by tests/t-recog-conformance.js. Uses ME.RecogImage.pyRound (recogimage.js
   loads first).

   rows(lines, grey, width, height, layout, P)   -> {box: [[baseline, outline], ...]} in reading order, "main" alone on
                                         a linear page; lines as RecogVector.vectorize makes them ({baseline, boundary}),
                                         grey the 8-bit page (width x height, row by row), P the parsed pipeline.json
   The notes the Python writes for people are left out: nothing is decided on them.

   The arithmetic is Python's and numpy's wherever it can tip a threshold: statistics.mean and pstdev exact (as Python's
   fractions make them), round() to even, int() towards zero, numpy's 'linear' percentile (in float32 where numpy works
   in float32), a float32 mean as numpy's pairwise sum, stable sorts, the first of equal maxima. Where numpy hands a dot
   product to the BLAS (np.correlate, np.convolve) the order of its additions is unknown; here they run left to right,
   but for a flat kernel over counts, whose sums are exact (convolveSame). */
(window.ME.recogModule = window.ME.recogModule || function (f) { (window.ME.recogSources = window.ME.recogSources || []).push(f); f(window.ME); })(function (ME) {
  const pyRound = (x) => ME.RecogImage.pyRound(x);
  const trunc = Math.trunc;                                        // int()
  const f32 = Math.fround;
  let PR = null;                                                   // pipeline.json's "rows", for the page in hand

  // ---------------------------------------------------------------- Python's and numpy's arithmetic

  // the bounds of a[start:stop] in a sequence of length n, as Python slices it (negative from the end); null: open
  function pySlice(n, start, stop) {
    const fix = (i) => (i < 0 ? Math.max(0, i + n) : Math.min(i, n));
    const lo = start == null ? 0 : fix(start), hi = stop == null ? n : fix(stop);
    return [lo, Math.max(lo, hi)];
  }
  const sl = (a, start, stop) => { const [lo, hi] = pySlice(a.length, start, stop); return a.slice(lo, hi); };
  const range = (a, b) => { const out = []; for (let i = a; i < b; i++) out.push(i); return out; };
  const pairs = (xs) => xs.slice(1).map((b, i) => [xs[i], b]);
  const last = (xs) => xs[xs.length - 1];
  const ys = (r) => r.map((d) => d.y);
  function sum(xs) {                                               // sum(): in order
    let s = 0;
    for (const x of xs) s += x;
    return s;
  }
  // min() and max() with a key: the first of equal ones
  function minBy(xs, key) {
    let best = xs[0], bk = key(xs[0]);
    for (let i = 1; i < xs.length; i++) { const k = key(xs[i]); if (k < bk) { best = xs[i]; bk = k; } }
    return best;
  }
  function maxBy(xs, key) {
    let best = xs[0], bk = key(xs[0]);
    for (let i = 1; i < xs.length; i++) { const k = key(xs[i]); if (k > bk) { best = xs[i]; bk = k; } }
    return best;
  }
  // sorted(xs, key=key): stable, the keys worked out once
  function sortBy(xs, key) {
    const ks = xs.map(key), idx = xs.map((_, i) => i);
    idx.sort((i, j) => (ks[i] < ks[j] ? -1 : ks[i] > ks[j] ? 1 : 0));
    return idx.map((i) => xs[i]);
  }
  const sortInPlace = (xs, key) => { const s = sortBy(xs, key); xs.splice(0, xs.length, ...s); };
  const lexCmp = (p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0);

  // statistics.median, and np.median of a list: the middle one, or the mean of the middle two
  function median(xs) {
    const s = Float64Array.from(xs).sort(), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  // a double as m * 2^e exactly, m a BigInt
  const dv = new DataView(new ArrayBuffer(8));
  function parts(x) {
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4), ex = (hi >>> 20) & 0x7ff;
    let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), e = -1074;
    if (ex) { m |= 1n << 52n; e = ex - 1075; }
    return [hi >>> 31 ? -m : m, e];
  }
  const bitLen = (v) => (v === 0n ? 0 : v.toString(2).length);
  // p / q (BigInts, q > 0) as the nearest double, ties to even: Python's int / int
  function ratio(p, q) {
    if (p === 0n) return 0;
    const neg = p < 0n;
    if (neg) p = -p;
    const shift = bitLen(p) - bitLen(q) - 55;                       // a quotient of 55 or 56 bits
    const a = shift < 0 ? p << BigInt(-shift) : p, b = shift > 0 ? q << BigInt(shift) : q;
    const Q = a / b, sticky = a % b !== 0n, extra = bitLen(Q) - 53;
    let m = Q >> BigInt(extra);
    const rem = Q & ((1n << BigInt(extra)) - 1n), half = 1n << BigInt(extra - 1);
    if (rem > half || (rem === half && (sticky || (m & 1n)))) m += 1n;
    const v = Number(m) * 2 ** (shift + extra);
    return neg ? -v : v;
  }
  // statistics.mean: the exact mean, rounded once
  function mean(xs) {
    const n = xs.length;
    let s = 0, abs = 0, ints = true;
    for (const x of xs) { if (!Number.isInteger(x)) { ints = false; break; } s += x; abs += Math.abs(x); }
    if (ints && abs < 2 ** 53) return s / n;
    const ps = xs.map(parts), E = Math.min(...ps.map((p) => p[1]));
    let t = 0n;
    for (const [m, e] of ps) t += m << BigInt(e - E);
    return E < 0 ? ratio(t, BigInt(n) << BigInt(-E)) : ratio(t << BigInt(E), BigInt(n));
  }
  function isqrt(n) {
    if (n < 2n) return n;
    let x = 1n << BigInt(Math.ceil(bitLen(n) / 2));
    for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
  }
  // statistics.pstdev (Python 3.11): the exact variance, its square root correctly rounded (_float_sqrt_of_frac)
  function pstdev(xs) {
    const n = BigInt(xs.length), ps = xs.map(parts), E = Math.min(...ps.map((p) => p[1]));
    let sx = 0n, sxx = 0n;
    for (const [m, e] of ps) { const X = m << BigInt(e - E); sx += X; sxx += X * X; }
    let num = n * sxx - sx * sx, den = n * n;
    if (E < 0) den <<= BigInt(-2 * E); else num <<= BigInt(2 * E);
    if (num === 0n) return 0;
    const rto = (a, b) => { const r = isqrt(a / b); return r * r * b !== a ? r | 1n : r; };
    const q = Math.floor((bitLen(num) - bitLen(den) - 109) / 2);
    if (q >= 0) return ratio(rto(num, den << BigInt(2 * q)) << BigInt(q), 1n);
    return ratio(rto(num << BigInt(-2 * q), den), 1n << BigInt(-q));
  }

  // np.percentile(a, q), method 'linear': kth(k) the k-th smallest of n; lerp32: in float32, as numpy for a float32
  // array and a single q (a list of q, or an integer array, is interpolated in float64)
  function percentile(kth, n, q, lerp32) {
    if (!n) return NaN;
    const v = (n - 1) * (q / 100);
    if (v >= n - 1) return kth(n - 1);
    const i = Math.floor(v), g = v - i, a = kth(i), b = kth(i + 1);
    if (lerp32) {
      const d = f32(b - a);
      return g >= 0.5 ? f32(b - f32(d * f32(1 - g))) : f32(a + f32(d * f32(g)));
    }
    const d = b - a;
    return g >= 0.5 ? b - d * (1 - g) : a + d * g;
  }
  const pctOf = (xs, q, lerp32) => { const s = Float64Array.from(xs).sort(); return percentile((k) => s[k], s.length, q, lerp32); };

  // numpy's pairwise sum of a float32 array (the sum under a float32 mean)
  function pairwise32(a, lo, n) {
    if (n < 8) {
      let r = -0;
      for (let i = 0; i < n; i++) r = f32(r + a[lo + i]);
      return r;
    }
    if (n <= 128) {
      const r = [];
      for (let j = 0; j < 8; j++) r.push(a[lo + j]);
      let i = 8;
      for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] = f32(r[j] + a[lo + i + j]);
      let res = f32(f32(f32(r[0] + r[1]) + f32(r[2] + r[3])) + f32(f32(r[4] + r[5]) + f32(r[6] + r[7])));
      for (; i < n; i++) res = f32(res + a[lo + i]);
      return res;
    }
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return f32(pairwise32(a, lo, n2) + pairwise32(a, lo + n2, n - n2));
  }

  // np.convolve(a, v, mode="same"): numpy's correlate with v reversed. A flat kernel over whole numbers (counts of pieces)
  // gives the window's exact sum times the weight, rounded once: where the block's edge falls on a tie (an average of
  // exactly 0.3 of the largest), numpy's BLAS lands on that value and a sum left to right can miss it by a bit. Otherwise
  // each sum runs left to right.
  function convolveSame(a, v) {
    if (v.length > a.length) [a, v] = [v, a];
    const n1 = a.length, n = v.length, k = Array.from(v).reverse(), left = n >> 1, out = new Float64Array(n1);
    if (v.every((x) => x === v[0]) && a.every((x) => Number.isInteger(x))) {
      const c = new Float64Array(n1 + 1);
      for (let i = 0; i < n1; i++) c[i + 1] = c[i] + a[i];
      for (let i = 0; i < n1; i++) out[i] = (c[Math.min(n1, i - left + n)] - c[Math.max(0, i - left)]) * v[0];
      return out;
    }
    for (let i = 0; i < n1; i++) {
      let s = 0;
      for (let j = Math.max(0, left - i), j1 = Math.min(n, n1 - i + left); j < j1; j++) s += a[i - left + j] * k[j];
      out[i] = s;
    }
    return out;
  }
  const flat = (k) => new Float64Array(k).fill(1 / k);              // np.ones(k) / k
  function addTo(a, start, stop, v) {                               // a[start:stop] += v
    const [lo, hi] = pySlice(a.length, start, stop);
    for (let i = lo; i < hi; i++) a[i] += v;
  }
  function anyIn(a, start, stop) {                                  // a[start:stop].any()
    const [lo, hi] = pySlice(a.length, start, stop);
    for (let i = lo; i < hi; i++) if (a[i]) return true;
    return false;
  }
  const maxOf = (a) => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };

  // ---------------------------------------------------------------- the grey page

  // gray[y0:y1, x0:x1] (Python's slicing; null: open) as a view of the same pixels
  function crop(g, y0, y1, x0, x1) {
    const [ya, yb] = pySlice(g.h, y0, y1), [xa, xb] = pySlice(g.w, x0, x1);
    return { data: g.data, stride: g.stride, ox: g.ox + xa, oy: g.oy + ya, w: xb - xa, h: yb - ya };
  }
  const at = (g, x, y) => g.data[(g.oy + y) * g.stride + g.ox + x];
  // the cumulative histogram of a view's grey levels, kept: the same rectangles come back often
  const hists = new WeakMap();
  function cumHist(g) {
    let m = hists.get(g.data);
    if (!m) hists.set(g.data, (m = new Map()));
    const key = g.ox + ',' + g.oy + ',' + g.w + ',' + g.h;
    let c = m.get(key);
    if (!c) {
      c = new Uint32Array(256);
      for (let y = 0; y < g.h; y++) {
        const o = (g.oy + y) * g.stride + g.ox;
        for (let x = 0; x < g.w; x++) c[g.data[o + x]]++;
      }
      for (let v = 1; v < 256; v++) c[v] += c[v - 1];
      m.set(key, c);
    }
    return c;
  }
  // np.percentile(gray[...], qs) of a view (float64, as numpy for an 8-bit array or a list of q)
  function greyPct(g, qs) {
    const c = cumHist(g), n = g.w * g.h;
    const kth = (k) => { let v = 0; while (v < 255 && c[v] <= k) v++; return v; };
    return qs.map((q) => percentile(kth, n, q, false));
  }
  // (gray < thr).mean(axis=0): the share of dark pixels in every column of a view
  function colShare(g, thr) {
    const out = new Float64Array(g.w);
    for (let y = 0; y < g.h; y++) {
      const o = (g.oy + y) * g.stride + g.ox;
      for (let x = 0; x < g.w; x++) if (g.data[o + x] < thr) out[x]++;
    }
    for (let x = 0; x < g.w; x++) out[x] /= g.h;
    return out;
  }
  // (gray < thr).mean(axis=1) for the rows lo..hi of a view (the others left at 0)
  function rowShare(g, thr, lo = 0, hi = g.h) {
    const out = new Float64Array(g.h);
    for (let y = lo; y < hi; y++) {
      const o = (g.oy + y) * g.stride + g.ox;
      let n = 0;
      for (let x = 0; x < g.w; x++) if (g.data[o + x] < thr) n++;
      out[y] = n / g.w;
    }
    return out;
  }

  // ---------------------------------------------------------------- align.py

  function info(line) {                                            // _info
    const xs = line.baseline.map((p) => p[0]), yv = line.baseline.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y: sum(yv) / yv.length, line };
  }

  // image_pitch: the line pitch from the autocorrelation of the ink profile in the block (float32, as numpy)
  function imagePitch(g, block, lo = 12, hi = 200) {
    const x0 = trunc(Math.max(0, block[0])), x1 = trunc(Math.min(g.w, block[1]));
    if (x1 - x0 < 10) return null;
    const H = g.h, prof = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = x0; x < x1; x++) s += 255 - at(g, x, y);
      prof[y] = s / (x1 - x0);
    }
    const m = f32(pairwise32(prof, 0, H) / H);
    for (let y = 0; y < H; y++) prof[y] = prof[y] - m;
    hi = Math.min(hi, H - 2);
    const ac = new Float32Array(Math.max(1, hi + 1));
    for (let k = 0; k <= Math.max(0, hi) && k < H; k++) {
      let s = 0;
      for (let j = 0; j + k < H; j++) s += prof[j] * prof[j + k];
      ac[k] = s;
    }
    if (ac[0] <= 0) return null;
    const a0 = ac[0], floor = f32(0.05);
    for (let k = 0; k < ac.length; k++) ac[k] = ac[k] / a0;
    let best = null;
    for (let i = lo; i < hi; i++) {
      if (ac[i] >= ac[i - 1] && ac[i] >= ac[i + 1] && ac[i] > floor && (best === null || ac[i] > ac[best])) best = i;
    }
    return best;
  }

  // _block_from_pieces: the widest stretch of the page the pieces cover
  function blockFromPieces(dets, width) {
    let cov = new Float64Array(width + 1);
    for (const d of dets) if (d.x1 - d.x0 > 0.02 * width) addTo(cov, trunc(Math.max(0, d.x0)), trunc(Math.min(width, d.x1)) + 1, 1);
    if (maxOf(cov) === 0) return null;
    const win = Math.max(1, trunc(0.03 * width));
    cov = convolveSame(cov, flat(win));
    const top = 0.3 * maxOf(cov);
    let best = null, start = null;
    for (let x = 0; x <= cov.length; x++) {
      if (x < cov.length && cov[x] >= top) {
        if (start === null) start = x;
      } else if (start !== null) {
        if (best === null || x - start > best[1] - best[0]) best = [start, x];
        start = null;
      }
    }
    return best;
  }

  // _ink: the share of dark pixels in the band of a row whose baseline would be at yb
  function inkAt(g, block, yb, pitch) {
    const x0 = trunc(Math.max(0, block[0])), x1 = trunc(Math.min(g.w, block[1]));
    const [p5, p50] = greyPct(crop(g, null, null, x0, x1), [5, 50]), thr = (p5 + p50) / 2;
    const y0 = Math.max(0, trunc(yb - 0.7 * pitch)), y1 = Math.min(g.h, trunc(yb + 0.15 * pitch));
    if (!(y1 > y0)) return 0.0;
    const b = crop(g, y0, y1, x0, x1);
    let n = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (at(b, x, y) < thr) n++;
    return n / (b.w * b.h);
  }

  // _across_puspika: the block widened over the puṣpikā to the other halves of the lines it cuts
  function acrossPuspika(dets, width, pitch, bx0, bx1) {
    const inside = (d) => Math.min(d.x1, bx1) - Math.max(d.x0, bx0) >= 0.5 * (d.x1 - d.x0);
    const wide = dets.filter((d) => d.x1 - d.x0 >= 0.2 * width);
    const halves = wide.filter((d) => !inside(d) && wide.some((o) => inside(o) && Math.abs(o.y - d.y) < 0.3 * pitch));
    const mid = (bx0 + bx1) / 2;
    const right = halves.filter((d) => d.x0 >= mid).map((d) => d.x1), left = halves.filter((d) => d.x1 <= mid).map((d) => d.x0);
    return [left.length ? Math.min(bx0, median(left)) : bx0, right.length ? Math.max(bx1, median(right)) : bx1];
  }

  // _pitch_from_pieces: the pitch from the heights of the pieces, for a page of too few lines
  function pitchFromPieces(dets, width) {
    const big = sortBy(dets.filter((d) => d.x1 - d.x0 > 0.03 * width), (d) => d.y);
    if (!big.length) return null;
    const hs = big.map((d) => { const yb = d.line.boundary.map((p) => p[1]); return Math.max(...yb) - Math.min(...yb); });
    const h = median(hs), groups = [];
    for (const d of big) {
      if (groups.length && Math.abs(d.y - mean(ys(last(groups)))) < 0.5 * h) last(groups).push(d);
      else groups.push([d]);
    }
    const lines = groups.filter((g) => sum(g.map((x) => x.x1 - x.x0)) > 0.15 * width).map((g) => mean(ys(g)));
    const gaps = pairs(lines).map(([a, b]) => b - a).filter((g) => g > 0.5 * h);
    if (gaps.length) return Math.min(...gaps);
    return lines.length ? 1.3 * h : null;
  }

  // _rule_score: for each x in x0..x1, the largest share of the band's rows in which a thin dark line passes near a
  // path through x leaning up to 4 % either way
  function ruleScore(band, x0, x1) {
    const H = band.h, W = band.w, a = Math.max(0, x0 - 30), b = Math.min(W, x1 + 30);
    if (b - a < 3 || H < 4) return new Float64Array(Math.max(0, x1 - x0));
    const [p5, p50] = greyPct(band, [5, 50]), delta = Math.max(8.0, 0.12 * (p50 - p5)), w = b - a;
    const ridge0 = new Uint8Array(H * w), row = new Int16Array(w);
    for (let y = 0; y < H; y++) {
      const o = (band.oy + y) * band.stride + band.ox + a;
      for (let x = 0; x < w; x++) row[x] = band.data[o + x];
      for (const k of [3, 5, 8]) {
        for (let x = 0; x < w; x++) {
          const l = row[x - k < 0 ? 0 : x - k], r = row[x + k > w - 1 ? w - 1 : x + k];
          if ((l < r ? l : r) - row[x] > delta) ridge0[y * w + x] = 1;
        }
      }
    }
    const ridge = new Uint8Array(H * w);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        ridge[i] = ridge0[i] | (x > 0 ? ridge0[i - 1] : 0) | (x + 1 < w ? ridge0[i + 1] : 0);
      }
    }
    const best = new Float64Array(w), step = (0.04 - -0.04) / 16, cnt = new Int32Array(w);
    for (let s = 0; s < 17; s++) {
      const slant = s === 16 ? 0.04 : s * step + -0.04;
      cnt.fill(0);
      for (let y = 0; y < H; y++) {
        const off = pyRound(slant * (y - H / 2)), o = y * w;
        for (let x = 0; x < w; x++) { const j = x + off; cnt[x] += ridge[o + (j < 0 ? 0 : j > w - 1 ? w - 1 : j)]; }
      }
      for (let x = 0; x < w; x++) best[x] = Math.max(best[x], cnt[x] / H);
    }
    return sl(best, x0 - a, x0 - a + (x1 - x0));
  }

  // _to_the_ink: the block widened to where the page's own ink ends, up to a rule or a blank gap
  // -> [bx0, bx1, left rule or null, right rule or null]
  function toTheInk(gray, dets, bx0, bx1, pitch, width) {
    const inside = dets.filter((d) => bx0 <= (d.x0 + d.x1) / 2 && (d.x0 + d.x1) / 2 <= bx1);
    if (!inside.length || !gray) return [bx0, bx1, null, null];
    const y0 = trunc(Math.max(0, Math.min(...ys(inside)) - 0.9 * pitch));
    const y1 = trunc(Math.min(gray.h, Math.max(...ys(inside)) + 0.3 * pitch));
    const band = crop(gray, y0, y1, null, null);
    if (band.h < 4) return [bx0, bx1, null, null];
    const [p5, p50] = greyPct(band, [5, 50]);
    const ink = colShare(band, (p5 + p50) / 2), n = ink.length;
    // a rule: dark down nearly the whole band, a few pixels' play either side
    const darkThr = p50 - 0.25 * (p50 - p5), dark = new Float64Array(n), pad = new Uint8Array(n + 6);
    for (let y = 0; y < band.h; y++) {
      const o = (band.oy + y) * band.stride + band.ox;
      for (let j = 0; j < n + 6; j++) pad[j] = band.data[o + (j < 3 ? 0 : j - 3 > n - 1 ? n - 1 : j - 3)];
      for (let x = 0; x < n; x++) {
        let lean = pad[x];
        for (let j = x + 1; j <= x + 6; j++) if (pad[j] < lean) lean = pad[j];
        if (lean < darkThr) dark[x]++;
      }
    }
    for (let x = 0; x < n; x++) dark[x] /= band.h;
    const k = Math.max(1, trunc(0.3 * pitch)), sm = convolveSame(ink, flat(k));
    const a = trunc(Math.max(0, bx0)), b = trunc(Math.min(n - 1, bx1));
    const ref = b > a ? median(sl(sm, a, b + 1)) : 0.0;
    if (ref <= 0) return [bx0, bx1, null, null];
    const isRule = Array.from(dark, (v) => v >= 0.8);
    const gapMax = trunc(0.5 * pitch), reach = trunc(width / 6);
    for (const [lo, hi] of [[Math.max(0, a - reach - 2), a + 1], [b, Math.min(n, b + reach + 2)]]) {
      if (hi > lo) ruleScore(band, lo, hi).forEach((v, i) => { if (v >= 0.75) isRule[lo + i] = true; });
    }
    function push(x, step, limit) {
      let lastX = x, quiet = 0, rule = null;
      while (x + step > 0 && x + step < n && Math.abs(x + step - limit) > 0 && Math.abs(x - limit) < reach) {
        x += step;
        if (isRule[x]) { rule = x; break; }
        if (sm[x] >= 0.2 * ref) { lastX = x; quiet = 0; } else if (++quiet > gapMax) break;
      }
      return [lastX, rule];
    }
    const [nx0, ruleL] = push(a, -1, a), [nx1, ruleR] = push(b, 1, b);
    return [Math.min(bx0, nx0), Math.max(bx1, nx1), ruleL, ruleR];
  }

  // _hand: [density, stem, pen] of a row's writing, or null where there is next to no writing to measure
  function hand(g, row, x0, x1, pitch, paper, ink) {
    const y = median(row.flatMap((d) => d.line.baseline.map((p) => p[1])));
    const lo = trunc(Math.max(0, y - 0.45 * pitch)), hi = trunc(Math.min(g.h, y + 0.05 * pitch));
    const a = trunc(Math.max(0, x0)), b = trunc(Math.min(g.w, x1));
    if (hi - lo < 4 || b - a < 10) return null;
    const band = crop(g, lo, hi, a, b);
    const own = greyPct(band, [3])[0];
    if (paper - own < 0.2 * (paper - ink)) return null;
    const thr = paper - 0.3 * (paper - own);
    let cols = 0, dark = 0;
    for (let x = 0; x < band.w; x++) {
      let c = 0;
      for (let y = 0; y < band.h; y++) if (at(band, x, y) < thr) c++;
      if (c) { cols++; dark += c; }
    }
    if (cols < 10) return null;
    const density = dark / (cols * band.h);
    const tall = crop(g, trunc(Math.max(0, y - 0.95 * pitch)), trunc(Math.min(g.h, y + 0.3 * pitch)), a, b);
    const runs = [];                                                // vertical runs of ink, column by column
    for (let x = 0; x < tall.w; x++) {
      let r = 0;
      for (let y = 0; y <= tall.h; y++) {
        if (y < tall.h && at(tall, x, y) < thr) r++;
        else { if (r >= 2) runs.push(r); r = 0; }
      }
    }
    if (runs.length < 20) return null;
    const s = Float64Array.from(runs).sort(), kth = (k) => s[k];
    const p50 = percentile(kth, s.length, 50, false), p80 = percentile(kth, s.length, 80, false);
    const short = runs.filter((r) => r <= p50), long = runs.filter((r) => r >= p80);
    return [density, sum(long) / long.length, sum(short) / short.length];
  }

  // _small_hand_edges: the rows at the top and the bottom that are a commentary in a smaller hand, by the logistic
  // regression of pipeline.json (rows.commentary) -> [rows kept, how many dropped above, below]
  function smallHandEdges(rows, gray, x0, x1, pitch) {
    if (!gray || rows.length < 5) return [rows, 0, 0];
    const C = PR.commentary;
    const ys0 = rows.flatMap((r) => r.flatMap((d) => d.line.baseline.map((p) => p[1])));
    const area = crop(gray, trunc(Math.max(0, Math.min(...ys0) - pitch)), trunc(Math.min(gray.h, Math.max(...ys0) + pitch)), trunc(Math.max(0, x0)), trunc(x1));
    const [p5, p50] = greyPct(area, [5, 50]);
    const hands = rows.map((r) => hand(gray, r, x0, x1, pitch, p50, p5));
    const known = hands.filter((h) => h);
    if (known.length < 5) return [rows, 0, 0];
    const med = [0, 1, 2].map((k) => median(known.map((h) => h[k])));
    const yr = rows.map((r) => median(r.flatMap((d) => d.line.baseline.map((p) => p[1]))));
    const n = rows.length;
    function prob(i) {
      const pos = Math.min(i, n - 1 - i);
      const [inner, outer] = i < n / 2 ? [i + 1, i - 1] : [i - 1, i + 1];
      const gin = inner >= 0 && inner < n ? Math.abs(yr[inner] - yr[i]) / pitch : 1.0;
      const gout = outer >= 0 && outer < n ? Math.abs(yr[outer] - yr[i]) / pitch : 3.0;
      const h = hands[i];
      const f = (h ? [h[0] / med[0], h[1] / med[1], h[2] / med[2]] : [0.0, 0.0, 0.0])
        .concat([Math.min(gin, 4.0), Math.min(gout, 4.0), pos, rows[i][0].filled ? 1 : 0, h === null ? 1 : 0]);
      const z = C.bias + sum(C.weights.map((w, k) => w * f[k]));
      return 1.0 / (1.0 + Math.exp(-z));
    }
    function outerRule(order) {                                     // outer()
      let cut = 0;
      for (let k = 0; k < Math.min(3, order.length - 1); k++) {
        const p = prob(order[k]);
        if (p < C.some) break;
        if (p >= C.clear) cut = k + 1;
      }
      return cut;
    }
    function notes(order) {
      const run = [];
      for (const i of order) {
        if (hands[i] === null || hands[i][0] >= 0.7 * med[0]) break;
        run.push(i);
      }
      if (run.length >= 2 && pairs(run).every(([a, b]) => Math.abs(yr[a] - yr[b]) < 0.75 * pitch)) return run.length;
      return 0;
    }
    function edge(order) {                                          // the two rules in turn, up to four rows
      let cut = 0;
      while (cut < 4 && order.length - cut > 1) {
        let step = Math.max(outerRule(order.slice(cut)), notes(order.slice(cut)));
        if (!step && cut) {
          const i = order[cut], j = order[cut - 1];
          if (prob(i) >= C.some && Math.abs(yr[i] - yr[j]) < 0.75 * pitch) step = 1;
        }
        if (!step) break;
        cut = Math.min(4, cut + step);
      }
      return cut;
    }
    const top = edge(range(0, n));
    const bottom = n - top > 4 ? edge(range(top, n).reverse()) : 0;
    if (n - top - bottom < 4) return [rows, 0, 0];
    return [rows.slice(top, n - bottom), top, bottom];
  }

  // _fits_better: are the gaps between the long lines whole multiples of pNew clearly more nearly than of pOld?
  function fitsBetter(long, pNew, pOld) {
    const gaps = pairs(long).map(([a, b]) => b.y - a.y).filter((g) => g >= 0.6 * Math.min(pNew, pOld));
    if (gaps.length < 2) return false;
    const misfit = (p) => sum(gaps.map((g) => { const e = g / p - pyRound(g / p); return e * e; })) / gaps.length;
    return misfit(pNew) < 0.5 * misfit(pOld);
  }

  // find_rows -> [rows, block, pitch]: each row a list of pieces left to right, rows top to bottom
  function findRows(seg, width, gray = null, pitchHint = null) {
    const dets = seg.lines.filter((l) => l.boundary.length >= 3).map(info);
    const long = sortBy(dets.filter((d) => d.x1 - d.x0 > 0.5 * width), (d) => d.y);
    let pitch = null, bx0, bx1;
    if (long.length >= 2) {
      pitch = median(pairs(long).map(([a, b]) => b.y - a.y));
      bx0 = median(long.map((d) => d.x0));
      bx1 = median(long.map((d) => d.x1));
    } else {
      const blk = gray ? blockFromPieces(dets, width) : null;
      if (!blk) return [[], null, 0];
      [bx0, bx1] = blk;
    }
    if (pitchHint) pitch = pitchHint;
    else if (gray) {
      const pimg = imagePitch(gray, [bx0, bx1]);
      if (pimg && (pitch === null || Math.abs(pitch - pimg) > 0.3 * pimg)) pitch = pimg;
      else if (pimg && pitch && Math.abs(pitch - pimg) > 0.1 * pimg && fitsBetter(long, pimg, pitch)) pitch = pimg;
    }
    if (!pitch) pitch = pitchFromPieces(dets, width);
    if (!pitch) return [[], null, 0];
    [bx0, bx1] = acrossPuspika(dets, width, pitch, bx0, bx1);

    let rows = [];
    for (const d of long) {                                         // two long pieces at one height: one row
      if (rows.length && d.y - last(rows)[0].y < 0.4 * pitch) last(rows).push(d);
      else rows.push([d]);
    }
    const overlaps = (row, d) => row.some((r) => Math.min(d.x1, r.x1) - Math.max(d.x0, r.x0) > 0.3 * (d.x1 - d.x0));
    const used = new Set(rows.flat());
    const rest = dets.filter((d) => !used.has(d) && bx0 < (d.x0 + d.x1) / 2 && (d.x0 + d.x1) / 2 < bx1 && d.x1 - d.x0 > 0.03 * width);
    let orphans = [];
    for (const d of rest) {                                         // fragments that continue a row
      const row = rows.length ? minBy(rows, (r) => Math.abs(r[0].y - d.y)) : null;
      if (row && Math.abs(row[0].y - d.y) < 0.25 * pitch && !overlaps(row, d)) row.push(d);
      else orphans.push(d);
    }
    orphans = sortBy(orphans, (d) => d.y);                          // a row broken into short pieces
    const groups = [];
    for (const d of orphans) {
      if (groups.length && Math.abs(d.y - mean(ys(last(groups)))) < 0.3 * pitch) last(groups).push(d);
      else groups.push([d]);
    }
    for (const g of groups) {
      const covered = sum(g.map((d) => d.x1 - d.x0)), gy = mean(ys(g));
      const far = rows.every((r) => Math.abs(gy - mean(ys(r))) > 0.6 * pitch);
      if (covered > 0.5 * (bx1 - bx0) && far) rows.push(g);
    }
    rows = sortBy(rows, (r) => mean(ys(r)));
    for (const r of rows) sortInPlace(r, (d) => d.x0);
    if (!rows.length) return [[], null, 0];
    let above, below;
    [rows, above, below] = smallHandEdges(rows, gray, bx0, bx1, pitch);
    if (above) rows[0][0].commentary_above = true;                 // fill_edge_rows adds no row where it was
    if (below) last(rows)[0].commentary_below = true;

    // a row Kraken missed between two neighbours, filled in where the page has ink there
    const most = gray ? 5 : 3;
    const ends = (row) => { const pts = row.flatMap((d) => d.line.baseline); return [pts.reduce((p, q) => (lexCmp(q, p) < 0 ? q : p))[1], pts.reduce((p, q) => (lexCmp(q, p) > 0 ? q : p))[1]]; };
    let block = [bx0 - 0.015 * width, bx1 + 0.015 * width];
    const typical = gray ? median(rows.map((r) => inkAt(gray, block, mean(ys(r)), pitch))) : null;
    let filled = [], out = [];
    for (const row of rows) {
      if (out.length) {
        const ya = mean(ys(last(out))), yb = mean(ys(row)), k = pyRound((yb - ya) / pitch);
        if (k >= 2 && k <= most) {
          const [al, ar] = ends(last(out)), [bl, br] = ends(row);
          for (let j = 1; j < k; j++) {
            const t = j / k, yl = al + t * (bl - al), yr = ar + t * (br - ar);
            if (typical !== null) {
              const ink = inkAt(gray, block, (yl + yr) / 2, pitch) / Math.max(typical, 1e-6);
              if (ink < 0.25) { last(out)[0].blank_after = true; continue; }   // a paragraph break
              if (ink < 0.5) continue;                                       // too little ink for a line
            }
            out.push([{ x0: bx0, x1: bx1, y: (yl + yr) / 2, filled: true, line: { baseline: [[bx0, yl], [bx1, yr]] } }]);
            filled.push(out.length);
          }
        }
      }
      out.push(row);
    }
    if (filled.length && filled.length >= rows.length) {           // the pitch was halved, not rows missed
      out = rows;
      filled = [];
      for (const r of rows) delete r[0].blank_after;
    }
    rows = out;
    // the rows cut out as wide as the writing goes, never across a rule
    let ruleL, ruleR;
    [bx0, bx1, ruleL, ruleR] = toTheInk(gray, dets, bx0, bx1, pitch, width);
    block = [Math.max(Math.min(block[0], bx0 - 0.015 * width), ruleL !== null ? ruleL + 2 : -1e9),
      Math.min(Math.max(block[1], bx1 + 0.015 * width), ruleR !== null ? ruleR - 2 : 1e9)];
    return [rows, block, pitch];
  }

  // uneven: the spacing problem of a page, or null
  function uneven(rows, pitch) {
    const yv = rows.map((r) => mean(ys(r)));
    const bad = [];
    for (let i = 0; i + 1 < rows.length; i++) {
      const g = yv[i + 1] - yv[i];
      if ((g > 1.5 * pitch && !rows[i][0].blank_after) || g < 0.6 * pitch) bad.push(g);
    }
    return bad.length ? 'uneven row spacing (' + pyRound(Math.min(...bad)) + '-' + pyRound(Math.max(...bad)) + 'px, pitch ' + pyRound(pitch) + 'px)' : null;
  }

  // fill_edge_rows: a row added a pitch above the first and below the last where the page has a line's ink
  // -> [rows, the sides added]
  function fillEdgeRows(rows, block, pitch, gray) {
    const ends = (row) => { const pts = row.flatMap((d) => d.line.baseline); return [pts.reduce((p, q) => (lexCmp(q, p) < 0 ? q : p))[1], pts.reduce((p, q) => (lexCmp(q, p) > 0 ? q : p))[1]]; };
    const typical = median(rows.map((r) => inkAt(gray, block, mean(ys(r)), pitch)));
    const added = [];
    for (const side of ['above', 'below']) {
      if ((side === 'above' ? rows[0] : last(rows))[0]['commentary_' + side]) continue;
      for (let t = 0; t < 2; t++) {
        const row = side === 'above' ? rows[0] : last(rows);
        const [yl, yr] = ends(row), shift = side === 'above' ? -pitch : pitch;
        const yb = mean(ys(row)) + shift;
        if (yb < 0.5 * pitch || yb > gray.h - 0.2 * pitch || inkAt(gray, block, yb, pitch) < 0.5 * typical) break;
        const synth = [{ x0: block[0], x1: block[1], y: yb, filled: true, line: { baseline: [[block[0], yl + shift], [block[1], yr + shift]] } }];
        const trial = side === 'above' ? [synth].concat(rows) : rows.concat([synth]);
        const [, top, bottom] = smallHandEdges(trial, gray, block[0], block[1], pitch);
        if (side === 'above' ? top : bottom) break;                 // the ink there is a commentary
        rows = trial;
        added.push(side);
      }
    }
    return [rows, added];
  }

  // _merge: one baseline and one outline (a band of fixed proportions around it) for a row of 1+ pieces
  function merge(row, block, pitch) {
    const [x0, x1] = block, raw = [];
    for (const d of row) for (const [x, y] of d.line.baseline) raw.push([Math.min(Math.max(x, x0), x1), y]);
    raw.sort(lexCmp);
    const pts = raw.filter((p, i) => i === 0 || lexCmp(p, raw[i - 1]) !== 0);
    const xs = pts.map((p) => p[0]).filter((x, i, a) => i === 0 || x !== a[i - 1]);
    const base = xs.map((x) => [x, mean(pts.filter((p) => p[0] === x).map((p) => p[1]))]);
    if (base[0][0] > x0) base.unshift([x0, base[0][1]]);
    if (last(base)[0] < x1) base.push([x1, last(base)[1]]);
    const poly = base.map(([x, y]) => [x, y - PR.above * pitch]).concat(base.slice().reverse().map(([x, y]) => [x, y + PR.below * pitch]));
    return [base.map(([x, y]) => [trunc(x), trunc(y)]), poly.map(([x, y]) => [trunc(x), Math.max(0, trunc(y))])];
  }

  // ---------------------------------------------------------------- blocks.py

  const BOXES = ['main', 'top', 'right', 'left', 'bottom'];
  const EXPECTED = { linear: ['main'], tripatha: ['main', 'top', 'bottom'], panchapatha: BOXES };

  // _runs: stretches of true in mask, gaps shorter than minGap closed -> [[start, end]]
  function runsOf(mask, minGap) {
    const out = [];
    let start = null;
    for (let i = 0; i <= mask.length; i++) {
      const on = i < mask.length && mask[i];
      if (on && start === null) start = i;
      else if (!on && start !== null) { out.push([start, i]); start = null; }
    }
    const merged = [];
    for (const r of out) {
      if (merged.length && r[0] - last(merged)[1] < minGap) last(merged)[1] = r[1];
      else merged.push(r);
    }
    return merged;
  }

  function piecesOf(seg) {                                         // _pieces
    const out = [];
    for (const l of seg.lines) {
      if (l.boundary.length < 3) continue;
      const d = info(l), yb = l.boundary.map((p) => p[1]);
      d.y0 = Math.min(...yb);
      d.y1 = Math.max(...yb);
      d.h = d.y1 - d.y0;
      out.push(d);
    }
    return out;
  }

  // separators: x positions that part the columns: rules drawn down the page, corridors no piece covers, blank strips
  function separators(gray, width, cov) {
    const h = gray.h, area = crop(gray, trunc(0.15 * h), trunc(0.85 * h), null, null);
    const [p5, p50] = greyPct(area, [5, 50]);
    const frac = colShare(area, (p5 + p50) / 2), rule = colShare(area, p50 - 0.25 * (p50 - p5));
    const peak = pctOf(frac, 90, false);
    const seps = new Set();
    for (const [x0, x1] of runsOf(Array.from(rule, (v) => v > 0.45), 2)) {
      if (x1 - x0 <= 10) {
        const c = sl(cov, x0, x1 + 1);
        if (sum(c) / c.length <= 1.5) seps.add(Math.floor((x0 + x1) / 2));
      }
    }
    const inked = Array.from(frac, (v) => v >= 0.15 * Math.max(peak, 1e-6));
    for (const [x0, x1] of runsOf(Array.from(sl(cov, null, width), (v) => v === 0), 1)) {
      if (x1 - x0 >= 6 && 0.03 * width < x0 && x1 < 0.97 * width && anyIn(cov, Math.max(0, x0 - 60), x0) && anyIn(cov, x1, x1 + 60)) seps.add(Math.floor((x0 + x1) / 2));
    }
    for (const [x0, x1] of runsOf(inked.map((v) => !v), 1)) {
      if (x1 - x0 >= 4 && 0.03 * width < x0 && x1 < 0.97 * width && anyIn(inked, Math.max(0, x0 - 60), x0) && anyIn(inked, x1, x1 + 60)) seps.add(Math.floor((x0 + x1) / 2));
    }
    return [...seps].sort((a, b) => a - b);
  }

  // _cut_piece: a piece crossing a rule at x, cut into its parts left and right of it
  function cutPiece(d, x) {
    const out = [];
    for (const side of ['left', 'right']) {
      const pts = d.line.baseline.filter((p) => (p[0] < x) === (side === 'left'));
      if (pts.length < 2) continue;
      const xs = pts.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
      const bnd = d.line.boundary.map(([px, py]) => [Math.min(Math.max(px, x0), x1), py]);
      out.push({ x0, x1, y: d.y, y0: d.y0, y1: d.y1, h: d.h, line: { baseline: pts, boundary: bnd } });
    }
    return out;
  }

  function coverage(ps, width) {
    const cov = new Float64Array(width + 1);
    for (const d of ps) if (d.x1 - d.x0 > 0.01 * width) addTo(cov, trunc(Math.max(0, d.x0)), trunc(Math.min(width, d.x1)) + 1, 1);
    return cov;
  }

  // _columns: the stretches of the width the pieces cover, parted at the separators
  function columns(ps, width, gray = null) {
    const cuts = gray ? separators(gray, width, coverage(ps, width)) : [];
    if (cuts.length) {
      const split = [];
      for (const d of ps) {
        const inner = cuts.filter((x) => d.x0 + 8 < x && x < d.x1 - 8);
        if (inner.length) {
          let parts = [d];
          for (const x of inner) parts = parts.flatMap((d2) => (d2.x0 + 8 < x && x < d2.x1 - 8 ? cutPiece(d2, x) : [d2]));
          split.push(...parts);
        } else split.push(d);
      }
      ps = split;
    }
    const cov = coverage(ps, width);
    for (const x of cuts) { const [lo, hi] = pySlice(cov.length, Math.max(0, x - 4), x + 5); cov.fill(0, lo, hi); }
    const rs = runsOf(Array.from(cov, (v) => v > 0), 0.008 * width).filter((r) => r[1] - r[0] > 0.03 * width);
    const cols = [];
    for (const [x0, x1] of rs) {
      const inside = [];
      for (let d of ps) {
        if (Math.min(d.x1, x1) - Math.max(d.x0, x0) >= 0.6 * Math.max(1, d.x1 - d.x0)) {
          if (d.x0 < x0 || d.x1 > x1) d = Object.assign({}, d, { x0: Math.max(d.x0, x0), x1: Math.min(d.x1, x1) });
          inside.push(d);
        }
      }
      if (inside.length >= 2) cols.push({ x0, x1, pieces: inside });
    }
    return cols;
  }

  // _centre: [index of the centre column, columns], two half-columns of the main text merged first
  function centre(cols, width) {
    if (!cols.length) return [null, cols];
    cols = sortBy(cols, (c) => c.x0);
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i], b = cols[i + 1], wa = a.x1 - a.x0, wb = b.x1 - b.x0;
      if (Math.min(wa, wb) > 0.25 * width && Math.min(wa, wb) / Math.max(wa, wb) > 0.6 && a.x0 < width / 2 && width / 2 < b.x1) {
        cols.splice(i, 2, { x0: a.x0, x1: b.x1, pieces: a.pieces.concat(b.pieces), halves: true });
        break;
      }
    }
    const mid = range(0, cols.length).filter((i) => cols[i].x0 <= width / 2 && width / 2 <= cols[i].x1);
    return [mid.length ? mid[0] : maxBy(range(0, cols.length), (i) => cols[i].x1 - cols[i].x0), cols];
  }

  // _rows: pieces grouped by height into rows, top to bottom; rows of specks dropped
  function pieceRows(ps, cw) {
    const groups = [];
    let cur = [ps[0]];
    for (const d of ps.slice(1)) {
      if (d.y - last(cur).y < 0.45 * Math.max(d.h, last(cur).h)) cur.push(d);
      else { groups.push(cur); cur = [d]; }
    }
    groups.push(cur);
    const out = [];
    for (const r of groups) {
      if (sum(r.map((d) => d.x1 - d.x0)) < 0.1 * cw) continue;
      let wide = r.filter((d) => d.x1 - d.x0 > 0.2 * cw);
      if (!wide.length) wide = r;
      out.push({ pieces: r, y: mean(ys(r)), h: median(wide.map((d) => d.h)), y0: Math.min(...r.map((d) => d.y0)), y1: Math.max(...r.map((d) => d.y1)) });
    }
    return out;
  }

  // _blank_runs: stretches of the page height with no ink across the column
  function blankRuns(gray, x0, x1) {
    const area = crop(gray, null, null, trunc(x0) + 10, trunc(x1) - 10);
    if (area.w < 10) return [];
    const [p5, p50] = greyPct(area, [5, 50]);
    const prof = rowShare(area, (p5 + p50) / 2), peak = pctOf(prof, 90, false);
    return runsOf(Array.from(prof, (v) => v < 0.08 * Math.max(peak, 1e-6)), 1);
  }

  // _pitch_of: the typical spacing of a band's rows, the larger gaps left out
  function pitchOf(gray, x0, x1, band) {
    const gaps = pairs(band.rows).map(([a, b]) => b.y - a.y).sort((a, b) => a - b);
    if (!gaps.length) return band.h;
    let usual = gaps.filter((g) => g <= 1.7 * gaps[0]);
    if (!usual.length) usual = gaps.slice(0, 1);
    return median(usual);
  }

  const bandOf = (rows) => ({ rows, pieces: rows.flatMap((r) => r.pieces), y0: rows[0].y0, y1: last(rows).y1, h: median(rows.map((r) => r.h)) });   // _band
  const fits = (gap, pitch) => Math.abs(gap - pitch) <= 0.35 * pitch || Math.abs(gap - 2 * pitch) <= 0.25 * 2 * pitch;   // _fits

  // _bodies: the body height of each row, from the dense band of its ink profile; null where unreliable
  function bodies(gray, x0, x1, rows) {
    const out = [], yv = rows.map((r) => r.y);
    rows.forEach((r, i) => {
      const d = maxBy(r.pieces, (q) => q.x1 - q.x0);
      const xa = trunc(Math.max(x0, d.x0)), xb = trunc(Math.min(x1, d.x1));
      if (xb - xa < 30) { out.push(null); return; }
      const col = crop(gray, null, null, xa, xb);
      const [p5, p50] = greyPct(col, [5, 50]);
      const y = yv[i];
      let lo = i > 0 ? (yv[i - 1] + y) / 2 : yv.length > 1 ? y - (yv[1] - y) / 2 : y - 20;
      let hi = i + 1 < yv.length ? (y + yv[i + 1]) / 2 : yv.length > 1 ? y + (y - yv[i - 1]) / 2 : y + 20;
      lo = trunc(Math.max(0, lo));
      hi = trunc(Math.min(col.h, hi));
      const [a0, b0] = pySlice(col.h, lo, hi);
      const w = rowShare(col, (p5 + p50) / 2, a0, b0).slice(a0, b0);
      if (w.length < 4 || maxOf(w) === 0) { out.push(null); return; }
      let k = 0;
      for (let j = 1; j < w.length; j++) if (w[j] > w[k]) k = j;
      let a = k, b = k;
      while (a > 0 && w[a - 1] >= 0.4 * w[k]) a--;
      while (b + 1 < w.length && w[b + 1] >= 0.4 * w[k]) b++;
      out.push(a === 0 || b === w.length - 1 || b - a < 2 ? null : b - a + 1);
    });
    return out;
  }

  // _normalised: row gaps, a gap of two pitches (a line Kraken missed) halved
  function normalised(gaps) {
    const out = gaps.slice();
    gaps.forEach((g, i) => {
      const near = sl(gaps, Math.max(0, i - 2), i).concat(sl(gaps, i + 1, i + 3));
      if (near.length && Math.abs(g - 2 * median(near)) <= 0.5 * median(near)) out[i] = g / 2;
    });
    return out;
  }

  // _line_rows: the column's pieces as rows, one per written line
  function lineRows(ps, cw) {
    const rows = pieceRows(sortBy(ps, (d) => d.y), cw);
    if (!rows.length) return [];
    const kept = [], gaps0 = normalised(pairs(rows).map(([a, b]) => b.y - a.y));
    rows.forEach((r, i) => {
      const before = sl(gaps0, Math.max(0, i - 3), i - 1), after = sl(gaps0, i, i + 2);
      const own = kept.length ? r.y - last(kept).y : null;
      if (own !== null && before.length && after.length && own < 0.65 * median(before) && own < 0.65 * median(after)) {
        const a = last(kept), wide = maxBy([a, r], (q) => Math.max(...q.pieces.map((d) => d.x1 - d.x0)));
        kept[kept.length - 1] = { pieces: a.pieces.concat(r.pieces), y: wide.y, h: Math.max(a.h, r.h), y0: Math.min(a.y0, r.y0), y1: Math.max(a.y1, r.y1) };
      } else kept.push(r);
    });
    return kept;
  }

  // _letter_height: from the baseline up to the headline (the strongest line of ink a fifth to four fifths of a pitch up)
  function letterHeight(gray, row, x0, x1, pitch, thr) {
    const y = median(row.pieces.flatMap((d) => d.line.baseline.map((p) => p[1])));
    const xs = row.pieces.filter((d) => d.x1 - d.x0 > 0.05 * (x1 - x0)).map((d) => [Math.max(x0, d.x0), Math.min(x1, d.x1)]);
    const lo = trunc(Math.max(0, y - 0.8 * pitch)), hi = trunc(Math.min(gray.h, y - 0.2 * pitch));
    if (!xs.length || hi - lo < 3) return null;
    const prof = new Float64Array(hi - lo);
    for (const [a, b] of xs) {
      const c = crop(gray, lo, hi, trunc(a), trunc(b));
      for (let yy = 0; yy < c.h; yy++) for (let x = 0; x < c.w; x++) if (at(c, x, yy) < thr) prof[yy]++;
    }
    let k = 0;
    for (let j = 1; j < prof.length; j++) if (prof[j] > prof[k]) k = j;
    return y - (lo + k);
  }

  // _clearance: for every pixel the vertical distance to the nearest ink above or below it (capped), in float32
  function clearance(ink, h, w, cap) {
    const c32 = f32(cap), up = new Float32Array(h * w), out = new Float32Array(h * w), run = new Float32Array(w);
    run.fill(c32);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { run[x] = ink[y * w + x] ? 0 : Math.min(run[x] + 1, c32); up[y * w + x] = run[x]; }
    run.fill(c32);
    for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) { run[x] = ink[y * w + x] ? 0 : Math.min(run[x] + 1, c32); out[y * w + x] = Math.min(up[y * w + x], run[x]); }
    return out;
  }

  // _seam: the cheapest path across cost (h x w) from the left edge, starting between rows start[0] and start[1],
  // moving up or down within a column at cost + vpen a pixel -> y of the path in every column
  function seam(cost, h, w, start, vpen) {
    const D = new Float64Array(h * w), big = 1e12;
    const [s0, s1] = pySlice(h, start[0], start[1]);
    for (let y = 0; y < h; y++) D[y * w] = y >= s0 && y < s1 ? cost[y * w] : big;
    const c = new Float64Array(h), step = new Float64Array(h), S = new Float64Array(h), t = new Float64Array(h);
    for (let x = 1; x < w; x++) {
      let acc = 0;
      for (let y = 0; y < h; y++) {
        c[y] = D[y * w + x - 1] + cost[y * w + x];
        step[y] = cost[y * w + x] + vpen;
        acc = y ? acc + step[y] : step[y];
        S[y] = acc;
      }
      let m = 0;                                                    // moving down the column
      for (let y = 0; y < h; y++) { const v = c[y] - S[y]; m = y ? Math.min(m, v) : v; t[y] = m + S[y]; }
      for (let y = 0; y < h; y++) c[y] = Math.min(c[y], t[y]);
      let sr = 0;                                                   // moving up the column
      for (let i = 0; i < h; i++) {
        const y = h - 1 - i;
        sr = i ? sr + step[y] : step[y];
        const v = c[y] - sr;
        m = i ? Math.min(m, v) : v;
        t[y] = m + sr;
      }
      for (let y = 0; y < h; y++) D[y * w + x] = Math.min(c[y], t[y]);
    }
    const out = new Int32Array(w);
    let y = 0;
    for (let i = 1; i < h; i++) if (D[i * w + w - 1] < D[y * w + w - 1]) y = i;
    const Sc = new Float64Array(h + 1);
    for (let x = w - 1; x > 0; x--) {
      out[x] = y;
      for (let i = 0; i < h; i++) { step[i] = cost[i * w + x] + vpen; Sc[i + 1] = i ? Sc[i] + step[i] : step[i]; }
      const here = cost[y * w + x];
      let best = 0, bv = Infinity;
      for (let i = 0; i < h; i++) {
        const lo = Math.min(i, y), hi = Math.max(i, y);
        const v = D[i * w + x - 1] + here + (Sc[hi + 1] - Sc[lo] - step[y]);
        if (v < bv) { bv = v; best = i; }
      }
      y = best;
    }
    out[0] = y;
    return out;
  }
  const meanInt = (a) => sum(a) / a.length;                         // np.mean of an integer array

  // _seam_bands: top, main text and bottom of the centre column, cut along the blank space between them
  function seamBands(ps, gray, x0, x1) {
    const rows = lineRows(ps, x1 - x0);
    if (rows.length < 3) return null;
    const pitch = median(normalised(pairs(rows).map(([a, b]) => b.y - a.y)));
    const f = 2;                                                    // at half resolution
    const Y0 = trunc(Math.max(0, Math.min(...ps.map((d) => d.y0)))), Y1 = trunc(Math.min(gray.h, Math.max(...ps.map((d) => d.y1))));
    const X0 = trunc(Math.max(0, Math.max(x0, Math.min(...ps.map((d) => d.x0)))));
    const X1 = trunc(Math.min(gray.w, Math.min(x1, Math.max(...ps.map((d) => d.x1)))));
    const [ya, yb] = pySlice(gray.h, Y0, Y1), [xa, xb] = pySlice(gray.w, X0, X1);
    const H = Math.ceil((yb - ya) / f), W = Math.ceil((xb - xa) / f);
    if (H < 8 || W < 8) return null;
    const small = new Uint8Array(H * W), cnt = new Uint32Array(256);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = at(gray, xa + f * x, ya + f * y); small[y * W + x] = v; cnt[v]++; }
    for (let v = 1; v < 256; v++) cnt[v] += cnt[v - 1];
    const kth = (k) => { let v = 0; while (v < 255 && cnt[v] <= k) v++; return v; };
    const thr = (percentile(kth, H * W, 5, false) + percentile(kth, H * W, 50, false)) / 2;
    const ink = new Uint8Array(H * W);
    for (let i = 0; i < H * W; i++) ink[i] = small[i] < thr ? 1 : 0;
    for (let x = 0; x < W; x++) ink[x] = ink[(H - 1) * W + x] = 1;  // walls: no cut along the edges or the margins
    for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) ink[y * W + x] = 1;
    const clear = clearance(ink, H, W, Math.max(4.0, pitch / f));
    const cost = new Float64Array(H * W);
    for (let i = 0; i < H * W; i++) cost[i] = f32(1.0 / f32(1.0 + clear[i])) + 4.0 * ink[i];
    const left = sortBy(rows, (r) => r.y), cands = [];
    for (const [a, b] of pairs(left)) {                             // a path from every gap between two rows
      let s0 = trunc((a.y - Y0) / f), s1 = trunc((b.y - Y0 - 0.5 * pitch) / f);
      s0 = Math.max(0, s0);
      s1 = Math.min(H, Math.max(s0 + 1, s1));
      const mid = (s0 + s1) / 2;
      const [lo, hi] = pySlice(H, trunc(Math.max(0, mid - 1.2 * pitch / f)), trunc(Math.min(H, mid + 1.2 * pitch / f)));
      const path = seam(cost.subarray(lo * W, hi * W), hi - lo, W, [s0 - lo, s1 - lo], 1.0).map((y) => y + lo);
      const cl = Float32Array.from(path, (y, x) => clear[y * W + x]).sort();
      cands.push([percentile((k) => cl[k], cl.length, 25, true), path]);
    }
    const first = (rows[0].y - Y0) / f, lastY = (last(rows).y - Y0) / f, distinct = [];
    for (const [score, path] of sortBy(cands, (c) => -c[0])) {
      const m = meanInt(path);
      if (!(first + 0.3 * pitch / f < m && m < lastY - 0.3 * pitch / f)) continue;
      if (distinct.every(([, o]) => meanInt(Array.from(path, (y, i) => Math.abs(y - o[i]))) > 0.5 * pitch / f)) distinct.push([score, path]);
    }
    if (distinct.length < 2) return null;
    const usual = median(distinct.map((c) => c[0]));
    let cuts = distinct.filter(([score]) => score >= Math.max(1.6 * usual, 0.25 * pitch / f)).map((c) => c[1]).slice(0, 2);
    if (!cuts.length) return null;
    cuts = sortBy(cuts, meanInt);
    const side = (d) => {
      const xm = Math.min(Math.max(trunc(((d.x0 + d.x1) / 2 - X0) / f), 0), W - 1);
      return cuts.filter((p) => (d.y - Y0) / f > p[xm]).length;
    };
    const groups = [[], [], []];
    for (const d of ps) groups[side(d)].push(d);
    let parts;
    if (cuts.length === 1) {                                        // the side written larger, or the longer, is the main text
      const [a, b] = groups;
      const ha = a.length ? median(a.map((d) => d.h)) : 0, hb = b.length ? median(b.map((d) => d.h)) : 0;
      const names = hb > ha || (hb === ha && b.length > a.length) ? ['top', 'main'] : ['main', 'bottom'];
      parts = [[names[0], a], [names[1], b]];
    } else parts = [['top', groups[0]], ['main', groups[1]], ['bottom', groups[2]]];
    const named = {};
    for (const [name, pp] of parts) {
      const prow = pp.length ? lineRows(pp, x1 - x0) : [];
      if (prow.length) {
        const band = bandOf(prow), own = normalised(pairs(prow).map(([p, q]) => q.y - p.y));
        band.pitch = own.length ? median(own) : pitch;
        named[name] = band;
      }
    }
    return 'main' in named ? named : null;
  }

  // _hand_bands: top, main text and bottom of the centre column, from the main text's larger hand; null when no run of
  // lines stands out clearly
  function handBands(ps, gray, x0, x1) {
    const rows = lineRows(ps, x1 - x0), n = rows.length;
    if (n < 3) return null;
    const yv = rows.map((r) => r.y), gaps = pairs(yv).map(([a, b]) => b - a), norm = normalised(gaps);
    const pitch = median(norm);
    const [p5, p50] = greyPct(crop(gray, null, null, trunc(x0), trunc(x1)), [5, 50]), thr = (p5 + p50) / 2;
    const letter = rows.map((r) => letterHeight(gray, r, x0, x1, pitch, thr));
    const spacing = range(0, n).map((i) => {
      const g = [i - 1, i].filter((j) => j >= 0 && j < n - 1 && norm[j] < 1.6 * pitch).map((j) => norm[j]);
      return g.length ? mean(g) : null;
    });
    const piece = rows.map((r) => r.h), feats = [letter, spacing, piece];
    function z(vals) {
      const xs = vals.filter((v) => v && v > 0).map(Math.log);
      if (xs.length < 3) return vals.map(() => null);
      const m = mean(xs), sd = pstdev(xs) || 1.0;
      return vals.map((v) => (v && v > 0 ? (Math.log(v) - m) / sd : null));
    }
    const zs = feats.map(z);
    const comb = range(0, n).map((i) => { const v = zs.map((f) => f[i]).filter((x) => x !== null); return mean(v.length ? v : [0.0]); });
    let best = null;
    for (let a = 0; a < n; a++) {
      for (let b = a; b < n; b++) {
        const inside = comb.slice(a, b + 1), out = comb.slice(0, a).concat(comb.slice(b + 1));
        if (!out.length) continue;
        const sc = (mean(inside) - mean(out)) * Math.sqrt(inside.length * out.length / n);
        if (best === null || sc > best[0]) best = [sc, a, b];
      }
    }
    if (best === null) return null;
    let [, a, b] = best;
    const big = new Set(range(0, n - 1).filter((i) => gaps[i] >= 1.6 * pitch));   // blank gaps between two lines
    function size(f, i, a, b) {                                     // nearer the main text's measure or the commentary's?
      if (!f[i]) return null;
      const ins = range(a, b + 1).filter((k) => k !== i && f[k]).map((k) => f[k]);
      const out = range(0, a).concat(range(b + 1, n)).filter((k) => k !== i && f[k]).map((k) => f[k]);
      if (!ins.length || !out.length) return null;
      return Math.abs(Math.log(f[i] / median(ins))) < Math.abs(Math.log(f[i] / median(out)));
    }
    const votes = (i, a, b) => { const v = feats.map((f) => size(f, i, a, b)); return [v.filter((x) => x === true).length, v.filter((x) => x === false).length]; };
    for (const i of [a - 1, a - 2, a]) if (big.has(i) && i >= 0 && i < n - 1 && i + 1 <= b) { a = i + 1; break; }
    for (const i of [b, b - 1, b + 1]) if (big.has(i) && a <= i && i < n - 1) { b = i; break; }
    for (let t = 0; t < n; t++) {                                   // lines at the edges go to the side whose hand they match
      let moved = false;
      if (b > a && votes(a, a, b)[1] >= 2 && !big.has(a - 1) && !big.has(a)) { a++; moved = true; }
      if (b > a && votes(b, a, b)[1] >= 2 && !big.has(b) && !big.has(b - 1)) { b--; moved = true; }
      if (a > 0 && !big.has(a - 1) && votes(a - 1, a, b)[0] >= 2) { a--; moved = true; }
      if (b < n - 1 && !big.has(b) && votes(b + 1, a, b)[0] >= 2) { b++; moved = true; }
      if (!moved) break;
    }
    let clear = 0;
    for (const f of feats) {
      const ins = range(a, b + 1).filter((k) => f[k]).map((k) => f[k]);
      const out = range(0, a).concat(range(b + 1, n)).filter((k) => f[k]).map((k) => f[k]);
      if (ins.length && out.length && median(ins) / median(out) >= 1.12) clear++;
    }
    if (clear < 2) return null;
    const named = {};
    for (const [name, part] of [['top', rows.slice(0, a)], ['main', rows.slice(a, b + 1)], ['bottom', rows.slice(b + 1)]]) {
      if (part.length) {
        const band = bandOf(part), own = norm.slice(rows.indexOf(part[0]), rows.indexOf(last(part)));
        band.pitch = own.length ? median(own) : pitchOf(gray, x0, x1, band);
        named[name] = band;
      }
    }
    return named;
  }

  // _bands: the centre column's rows cut into bands at blank runs, changes of spacing and changes of hand
  function bands(ps, gray, x0, x1) {
    const cw = x1 - x0, rows = lineRows(ps, cw);
    if (!rows.length) return [];
    const n = rows.length;
    if (n === 1) { const b = bandOf(rows); b.pitch = pitchOf(gray, x0, x1, b); return [b]; }
    const yv = rows.map((r) => r.y), gaps = pairs(yv).map(([a, b]) => b - a), norm = normalised(gaps);
    const body = bodies(gray, x0, x1, rows);
    const med = (xs) => (xs.length ? median(xs) : null);
    const nearest = (ks) => med(ks.filter((k) => k >= 0 && k < n && body[k]).map((k) => body[k]).slice(0, 3));
    const medH = median(rows.map((r) => r.h));
    const blankAll = blankRuns(gray, x0, x1);
    const blanks = blankAll.filter(([a, b]) => b - a >= Math.max(8, 0.35 * medH));
    const cuts = new Map();                                         // i: a cut between rows i and i+1 -> its kind
    const share = rows.map((r) => sum(r.pieces.map((d) => d.x1 - d.x0)) / cw);
    for (const [ya, yb] of blanks) {
      const inside = range(0, n).filter((i) => ya <= yv[i] && yv[i] <= yb);
      if (inside.some((i) => share[i] >= 0.5)) continue;
      const above = range(0, n).filter((i) => yv[i] < ya), below = range(0, n).filter((i) => yv[i] > yb);
      if (!above.length || !below.length) continue;
      const cut = inside.length ? Math.max(...inside) : last(above);   // a short line in the gap ends the block above
      if (cut < below[0] && cut < n - 1) cuts.set(cut, 'blank');
    }
    const score = new Map();                                        // change points of the spacing
    for (let i = 0; i < n - 1; i++) {
      const before = sl(norm, Math.max(0, i - 2), i), after = sl(norm, i + 1, i + 3);
      if (before.length && after.length) {
        const sc = Math.abs(Math.log(med(after) / med(before)));
        if (sc >= Math.log(1.3)) score.set(i, sc);
      }
    }
    const runs = [];
    let cur = [];
    for (const i of [...score.keys()].sort((p, q) => p - q)) {
      if (cur.length && i === last(cur) + 1) cur.push(i);
      else { cur = [i]; runs.push(cur); }
    }
    for (const run of runs) {
      const i0 = run[0], i1 = last(run);
      if ([...cuts.keys()].some((c) => i0 - 1 <= c && c <= i1 + 1)) continue;   // a blank run settles it
      const pa = med(sl(norm, Math.max(0, i0 - 3), i0)) || norm[i0];
      const pb = med(sl(norm, i1 + 1, i1 + 4)) || norm[i1];
      const ba = nearest(range(i0 - 5, i0 + 1).reverse()), bb = nearest(range(i1 + 1, i1 + 7));
      let cut = i1, prev = i0;
      for (let r = i0 + 1; r <= i1; r++) {
        const ga = yv[r] - yv[prev], gb = r + 1 < n ? yv[r + 1] - yv[r] : null;
        const fitA = fits(ga, pa), fitB = gb !== null && fits(gb, pb);
        if (fitB && !fitA) { cut = r - 1; break; }
        if (fitA && !fitB) { prev = r; continue; }
        let toB;
        if (body[r] && ba && bb) toB = Math.abs(body[r] - bb) < Math.abs(body[r] - ba);
        else if (body[r] && ba) toB = Math.abs(body[r] - ba) / ba >= 0.15;
        else if (body[r] && bb) toB = Math.abs(body[r] - bb) / bb < 0.15;
        else toB = gb !== null && Math.abs(gb - pb) / pb < Math.abs(ga - pa) / pa;
        if (toB) { cut = r - 1; break; }
        prev = r;
      }
      cuts.set(cut, 'pitch');
    }
    const near1 = (i) => [...cuts.keys()].some((c) => Math.abs(i - c) <= 1);
    for (let i = 0; i < n - 1; i++) {                               // a wide blank gap with the hand changing across it
      if (near1(i)) continue;
      const near = sl(norm, Math.max(0, i - 3), i).concat(sl(norm, i + 1, i + 4));
      if (!near.length || gaps[i] < 1.35 * med(near)) continue;
      const before = range(Math.max(0, i - 2), i + 1).filter((k) => body[k]).map((k) => body[k]);
      const after = range(i + 1, Math.min(n, i + 4)).filter((k) => body[k]).map((k) => body[k]);
      if (before.length && after.length && Math.max(med(before), med(after)) / Math.min(med(before), med(after)) >= 1.1 &&
          blankAll.filter(([ya, yb]) => yb - ya >= 6).some(([ya, yb]) => yv[i] - 0.35 * rows[i].h < ya && yb < yv[i + 1] + 0.2 * rows[i + 1].h)) cuts.set(i, 'gap');
    }
    for (let i = 0; i < n - 1; i++) {                               // a sharp change of body height
      if (near1(i) || !body[i] || !body[i + 1]) continue;
      const before = range(Math.max(0, i - 2), i + 1).filter((k) => body[k]).map((k) => body[k]);
      const after = range(i + 1, Math.min(n, i + 4)).filter((k) => body[k]).map((k) => body[k]);
      if (before.length >= 2 && after.length >= 2 && Math.max(med(after), med(before)) / Math.min(med(after), med(before)) >= 1.5 &&
          Math.max(body[i], body[i + 1]) / Math.min(body[i], body[i + 1]) >= 1.3) cuts.set(i, 'body');
    }
    let bs = [], start = 0;
    const kinds = [null];
    for (const i of [...cuts.keys()].sort((p, q) => p - q).concat([n - 1])) {
      const b = bandOf(rows.slice(start, i + 1));
      b.pitch = med(norm.slice(start, i)) || pitchOf(gray, x0, x1, b);
      const hs = range(start, i + 1).filter((k) => body[k]).map((k) => body[k]);
      b.hand = hs.length >= 2 ? med(hs) : 0.45 * b.h;
      bs.push(b);
      if (cuts.has(i)) kinds.push(cuts.get(i));
      start = i + 1;
    }
    let changed = true;                                             // a lone row left by a body cut joins its like
    while (changed && bs.length > 1) {
      changed = false;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (b.rows.length > 1) continue;
        const y = b.rows[0].y, options = [];
        if (i > 0 && kinds[i] === 'body') { const a = bs[i - 1]; options.push([Math.abs(a.h - b.h), i - 1, fits(y - last(a.rows).y, a.pitch)]); }
        if (i + 1 < bs.length && kinds[i + 1] === 'body') { const c = bs[i + 1]; options.push([Math.abs(c.h - b.h), i + 1, fits(c.rows[0].y - y, c.pitch)]); }
        const fitting = options.filter((o) => o[2]);
        if (!fitting.length) continue;
        const j = fitting.reduce((p, q) => (q[0] < p[0] || (q[0] === p[0] && q[1] < p[1]) ? q : p))[1];
        const lo = Math.min(i, j), hi = Math.max(i, j);
        bs.splice(lo, hi - lo + 1, join(bs[lo], bs[hi], gray, x0, x1));
        kinds.splice(hi, 1);
        changed = true;
        break;
      }
    }
    const merged = [bs[0]];                                         // a blank cut alone between alike bands is undone
    for (let k = 1; k < bs.length; k++) {
      const b = bs[k], kind = kinds[k], prev = last(merged);
      const alike = Math.max(prev.hand, b.hand) / Math.max(1, Math.min(prev.hand, b.hand)) < 1.1 &&
        Math.max(prev.pitch, b.pitch) / Math.max(1, Math.min(prev.pitch, b.pitch)) < 1.2;
      const run = Math.max(0, ...blanks.filter(([ya]) => last(prev.rows).y < ya && ya < b.rows[0].y).map(([ya, yb]) => yb - ya));
      if (kind === 'blank' && alike && run < 0.5 * medH) merged[merged.length - 1] = join(prev, b, gray, x0, x1);
      else merged.push(b);
    }
    return rebalance(merged, gray, x0, x1);
  }

  // _join: two neighbouring bands as one
  function join(a, b, gray, x0, x1) {
    const m = bandOf(a.rows.concat(b.rows));
    m.pitch = pitchOf(gray, x0, x1, m);
    const wa = a.rows.length, wb = b.rows.length;
    m.hand = ((a.hand !== undefined ? a.hand : 0.45 * a.h) * wa + (b.hand !== undefined ? b.hand : 0.45 * b.h) * wb) / (wa + wb);
    return m;
  }

  // _rebalance: a row at a band's edge spaced like the neighbouring band is moved across
  function rebalance(bs, gray, x0, x1) {
    const gapFits = (g, pitch) => Math.abs(g - pitch) <= 0.35 * pitch;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < bs.length - 1; i++) {
        const a = bs[i], b = bs[i + 1];
        if (a.rows.length >= 2) {
          const lastR = last(a.rows), prev = a.rows[a.rows.length - 2];
          if (lastR.y - prev.y > 1.8 * a.pitch && gapFits(b.rows[0].y - lastR.y, b.pitch)) {
            bs[i] = bandOf(a.rows.slice(0, -1));
            bs[i + 1] = bandOf([lastR].concat(b.rows));
            changed = true;
          }
        }
        if (!changed && b.rows.length >= 2) {
          const firstR = b.rows[0], nxt = b.rows[1];
          if (nxt.y - firstR.y > 1.8 * b.pitch && gapFits(firstR.y - last(a.rows).y, a.pitch)) {
            bs[i] = bandOf(a.rows.concat([firstR]));
            bs[i + 1] = bandOf(b.rows.slice(1));
            changed = true;
          }
        }
        if (changed) {
          for (const [bb, src] of [[bs[i], a], [bs[i + 1], b]]) {
            bb.pitch = pitchOf(gray, x0, x1, bb);
            bb.hand = src.hand !== undefined ? src.hand : 0.45 * src.h;
          }
          break;
        }
      }
    }
    return bs;
  }

  // _name_bands: the main text is the band with the clearly largest hand and pitch; above it top, below it bottom
  function nameBands(bs, height) {
    if (bs.length === 1) return { main: bs[0] };
    const all1 = bs.every((x) => x.rows.length < 2);
    const score = bs.map((b) => (b.hand !== undefined ? b.hand : 0.45 * b.h) * b.pitch * (b.rows.length >= 2 || all1 ? 1 : 0));
    const order = sortBy(range(0, bs.length), (i) => -score[i]);
    let k;
    if (score[order[0]] / Math.max(1, score[order[1]]) >= 1.2) k = order[0];
    else if (bs.length === 3) k = 1;
    else k = minBy(range(0, bs.length), (i) => Math.abs((bs[i].y0 + bs[i].y1) / 2 - height / 2));
    const named = { main: bs[k] }, above = bs.slice(0, k), below = bs.slice(k + 1);
    if (above.length) { named.top = bandOf(above.flatMap((b) => b.rows)); named.top.pitch = median(above.map((b) => b.pitch)); }
    if (below.length) { named.bottom = bandOf(below.flatMap((b) => b.rows)); named.bottom.pitch = median(below.map((b) => b.pitch)); }
    return named;
  }

  // find_blocks -> {box: {rect: [x0, y0, x1, y1], pieces, pitch}}; boxes absent from the page are absent
  function findBlocks(seg, size, gray, expect = null) {
    const [width, height] = size;
    const ps = piecesOf(seg).filter((d) => d.x1 - d.x0 >= 0.01 * width && d.h >= 4);
    if (!ps.length) return {};
    const [k, cols] = centre(columns(ps, width, gray), width);
    if (k === null) return {};
    const mid = cols[k], wantsBands = expect && (expect.includes('top') || expect.includes('bottom'));
    let named = null;
    if (wantsBands) named = seamBands(mid.pieces, gray, mid.x0, mid.x1);
    if (!named && wantsBands) named = handBands(mid.pieces, gray, mid.x0, mid.x1);
    if (!named) {
      const bs = bands(mid.pieces, gray, mid.x0, mid.x1);
      if (!bs.length) return {};
      named = nameBands(bs, height);
    }
    const blocks = {};
    for (const [name, b] of Object.entries(named)) {
      const xs0 = Math.min(...b.pieces.map((d) => d.x0)), xs1 = Math.max(...b.pieces.map((d) => d.x1));
      blocks[name] = { rect: [trunc(xs0), trunc(b.y0), trunc(xs1), trunc(b.y1)], pieces: b.pieces, pitch: (b.rows || []).length >= 2 ? b.pitch : null };
    }
    const ch = Math.max(1, Math.max(...mid.pieces.map((d) => d.y1)) - Math.min(...mid.pieces.map((d) => d.y0)));
    for (const [side, cands] of [['left', cols.filter((c, i) => i < k)], ['right', cols.filter((c, i) => i > k)]]) {
      let best = null;
      for (const c of cands) {
        const span = Math.max(...c.pieces.map((d) => d.y1)) - Math.min(...c.pieces.map((d) => d.y0));
        if (c.pieces.length >= 3 && span >= 0.3 * ch && (best === null || c.pieces.length > best.pieces.length)) best = c;
      }
      if (best) {
        const srows = pieceRows(sortBy(best.pieces, (d) => d.y), best.x1 - best.x0);
        const sgaps = normalised(pairs(srows).map(([a, b]) => b.y - a.y));
        blocks[side] = { rect: [trunc(best.x0), trunc(Math.min(...best.pieces.map((d) => d.y0))), trunc(best.x1), trunc(Math.max(...best.pieces.map((d) => d.y1)))],
          pieces: best.pieces, pitch: sgaps.length ? median(sgaps) : null };
      }
    }
    return blocks;
  }

  // rows_in_block: the row finder run on one block as if it were a page; others: the rectangles of the other blocks
  // -> {rows (page coordinates, merged), raw, pitch, warn, offset, block}
  function rowsInBlock(block, gray, others = []) {
    let [x0, y0, x1, y1] = block.rect;
    const pad = 4;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(gray.w, x1 + pad);
    y1 = Math.min(gray.h, y1 + pad);
    const sub = { lines: block.pieces.map((d) => ({ baseline: d.line.baseline.map(([x, y]) => [x - x0, y - y0]), boundary: d.line.boundary.map(([x, y]) => [x - x0, y - y0]) })) };
    const cr = crop(gray, y0, y1, x0, x1);
    let [rows, blk, pitch] = findRows(sub, x1 - x0, cr);
    const pRows = block.pitch;
    const nRows = Math.max(1, pieceRows(sortBy(block.pieces, (d) => d.y), x1 - x0).length);
    // a pitch read off the ink that does not fit the block's own rows (a period of its edges, a harmonic) is replaced
    if (pRows && pitch && (pitch > 1.5 * (y1 - y0) / nRows || pitch < 0.4 * pRows)) [rows, blk, pitch] = findRows(sub, x1 - x0, cr, pRows);
    if (!rows.length) return { rows: [], raw: [], pitch, warn: 'no rows', offset: [x0, y0], block: blk };
    // a short line that seeded no row, at a height no row has, is a row of its own
    const used = new Set(rows.flatMap((r) => r.map((d) => d.line)));
    const bw = x1 - x0;
    const typical = median(rows.map((r) => inkAt(cr, blk, r[0].y, pitch)));
    for (const d of sortBy(sub.lines.map(info), (q) => q.y)) {
      if (used.has(d.line) || d.x1 - d.x0 < Math.max(60, 0.15 * bw)) continue;
      if (inkAt(cr, [d.x0, d.x1], d.y, pitch) < 0.5 * typical) continue;   // a smear or a stamp
      if (rows.every((r) => Math.abs(d.y - r[0].y) >= 0.6 * pitch)) {
        rows.push([d]);
        rows = sortBy(rows, (r) => r[0].y);
      }
    }
    const close = [];                                               // rows closer than 0.6 pitch are one line
    for (const r of rows) {
      if (close.length && r[0].y - last(close)[0].y < 0.6 * pitch && !r[0].filled && !last(close)[0].filled) close[close.length - 1] = sortBy(last(close).concat(r), (d) => d.x0);
      else close.push(r);
    }
    rows = close;
    if (rows.length >= 3) {
      // the edge check sees a pitch beyond the block: a taller crop, the rows shifted into it
      const ext = trunc(1.5 * pitch), ty0 = Math.max(0, y0 - ext), ty1 = Math.min(gray.h, y1 + ext), dy = y0 - ty0;
      for (const r of rows) for (const d of r) { d.y += dy; d.line.baseline = d.line.baseline.map(([x, y]) => [x, y + dy]); }
      [rows] = fillEdgeRows(rows, blk, pitch, crop(gray, ty0, ty1, x0, x1));
      const inOther = (r) => {                                      // an added edge row whose ink belongs to another block
        const yb = r[0].y + ty0, band = [yb - 1.2 * pitch, yb + 0.65 * pitch];
        return others.some(([ox0, oy0, ox1, oy1]) => band[0] < oy1 && band[1] > oy0 && x0 < ox1 && x1 > ox0);
      };
      while (rows.length && rows[0][0].filled && inOther(rows[0])) rows = rows.slice(1);
      while (rows.length && last(rows)[0].filled && inOther(last(rows))) rows = rows.slice(0, -1);
      for (const r of rows) for (const d of r) { d.y -= dy; d.line.baseline = d.line.baseline.map(([x, y]) => [x, y - dy]); }
    }
    const W = gray.w, H = gray.h;
    const clamp = ([x, y]) => [Math.min(Math.max(x + x0, 0), W - 1), Math.min(Math.max(y + y0, 0), H - 1)];   // a band may reach past the edge
    const merged = rows.map((r) => { const [base, poly] = merge(r, blk, pitch); return [base.map(clamp), poly.map(clamp)]; });
    return { rows: merged, raw: rows, pitch, warn: uneven(rows, pitch), offset: [x0, y0], block: blk };
  }

  // page_blocks -> {box: {rect, rows, raw, pitch, warn, offset, block}}, in Manuscribe's order of the boxes
  function pageBlocks(seg, size, gray, expect = null) {
    const blocks = findBlocks(seg, size, gray, expect), out = {};
    for (const box of BOXES) {
      if (!(box in blocks)) continue;
      const others = Object.keys(blocks).filter((name) => name !== box).map((name) => blocks[name].rect);
      const found = rowsInBlock(blocks[box], gray, others);
      if (found.rows.length) out[box] = Object.assign({ rect: blocks[box].rect }, found);
    }
    return out;
  }

  // ---------------------------------------------------------------- reference.rows

  function rows(lines, grey, width, height, layout, P) {
    PR = P.rows;
    hists.delete(grey);                                             // the pixels may be new
    const g = { data: grey, stride: width, ox: 0, oy: 0, w: width, h: height }, seg = { lines };
    if (layout === 'tripatha' || layout === 'panchapatha') {
      const found = pageBlocks(seg, [width, height], g, EXPECTED[layout]), out = {};
      for (const box of Object.keys(found)) out[box] = found[box].rows;
      return out;
    }
    let [found, block, pitch] = findRows(seg, width, g);
    if (!found.length) return {};
    if (found.length >= 3) [found] = fillEdgeRows(found, block, pitch, g);
    return { main: found.map((r) => merge(r, block, pitch)) };
  }

  /* the blocks a page's lines fall into when the block finder is not told the layout (blocks.page_blocks(seg, size, g),
     expect None) -> {box: rows found in it}: what a manuscript's layout is told from (RecogView.surveyLayout) */
  function untold(lines, grey, width, height, P) {
    PR = P.rows;
    hists.delete(grey);
    const g = { data: grey, stride: width, ox: 0, oy: 0, w: width, h: height }, out = {};
    const found = pageBlocks({ lines }, [width, height], g, null);
    for (const box of Object.keys(found)) out[box] = found[box].rows.length;
    return out;
  }

  ME.RecogRows = { rows, untold, findRows, fillEdgeRows, merge, uneven, pageBlocks, findBlocks, rowsInBlock, imagePitch, mean, median, pstdev, percentile };
});
