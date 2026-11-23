'use strict';
/* Recognition in the browser, first stages: the image operations the reference pipeline (manuscript_ocr's
   msocr/reference.py) does with PIL, done here the same way to the last grey level, so that the networks see in
   Manuscribe what they saw in Python. Checked against the reference's stage fixtures by tests/t-recog-conformance.js.

   grey(rgb, w, h)                      PIL's convert("L"): (R·19595 + G·38470 + B·7471 + 32768) >> 16
   resize(src, sw, sh, dw, dh)          PIL's Image.resize(..., BILINEAR) of an 8-bit grey image: a triangle filter whose
                                        support widens with the scale when shrinking, weights turned into 22-bit fixed
                                        point, a horizontal pass into an 8-bit image, then a vertical pass
   segmenterSize(w, h, imgH)            the width and height the page is resized to for the segmenter
   recogniserSize(w, h, height, stride) the width and height a line image is resized to for the recogniser
   pyRound(x)                           Python's round(): halves to the even number */
(function (ME) {
  const PRECISION_BITS = 32 - 8 - 2;
  const ONE = 2 ** PRECISION_BITS;

  function grey(rgb, w, h, channels = 3) {
    const out = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < w * h; i++, j += channels) {
      out[i] = (rgb[j] * 19595 + rgb[j + 1] * 38470 + rgb[j + 2] * 7471 + 0x8000) >>> 16;
    }
    return out;
  }

  // Pillow's precompute_coeffs (Resample.c) with the bilinear filter, then normalize_coeffs_8bpc
  function coeffs(inSize, outSize) {
    const scale = inSize / outSize;
    const filterscale = Math.max(scale, 1.0);
    const support = 1.0 * filterscale;
    const ksize = Math.ceil(support) * 2 + 1;
    const bounds = new Int32Array(outSize * 2);
    const kk = new Float64Array(outSize * ksize);
    for (let xx = 0; xx < outSize; xx++) {
      const center = (xx + 0.5) * scale;
      const ss = 1.0 / filterscale;
      let xmin = Math.trunc(center - support + 0.5);
      if (xmin < 0) xmin = 0;
      let xmax = Math.trunc(center + support + 0.5);
      if (xmax > inSize) xmax = inSize;
      xmax -= xmin;
      let ww = 0.0;
      for (let x = 0; x < xmax; x++) {
        const t = Math.abs((x + xmin - center + 0.5) * ss);
        const w = t < 1.0 ? 1.0 - t : 0.0;
        kk[xx * ksize + x] = w;
        ww += w;
      }
      for (let x = 0; x < xmax; x++) if (ww !== 0.0) kk[xx * ksize + x] /= ww;
      bounds[xx * 2] = xmin;
      bounds[xx * 2 + 1] = xmax;
    }
    const k = new Int32Array(outSize * ksize);
    for (let i = 0; i < k.length; i++) {
      k[i] = kk[i] < 0 ? Math.trunc(-0.5 + kk[i] * ONE) : Math.trunc(0.5 + kk[i] * ONE);
    }
    return { ksize, bounds, k };
  }

  const clip8 = (ss) => { const v = Math.floor(ss / ONE); return v < 0 ? 0 : v > 255 ? 255 : v; };

  function resize(src, sw, sh, dw, dh) {
    const needH = dw !== sw, needV = dh !== sh;
    const H = coeffs(sw, dw), V = coeffs(sh, dh);
    let img = src, iw = sw, ih = sh;
    const vb = Int32Array.from(V.bounds);
    if (needH) {
      const first = vb[0], last = vb[dh * 2 - 2] + vb[dh * 2 - 1];
      for (let i = 0; i < dh; i++) vb[i * 2] -= first;            // rows counted from the first one used
      const th = last - first;
      const tmp = new Uint8Array(dw * th);
      for (let y = 0; y < th; y++) {
        const row = (y + first) * iw;
        for (let xx = 0; xx < dw; xx++) {
          const xmin = H.bounds[xx * 2], xmax = H.bounds[xx * 2 + 1], o = xx * H.ksize;
          let ss = ONE / 2;
          for (let x = 0; x < xmax; x++) ss += img[row + x + xmin] * H.k[o + x];
          tmp[y * dw + xx] = clip8(ss);
        }
      }
      img = tmp; iw = dw; ih = th;
    }
    if (!needV) return needH ? img : Uint8Array.from(img);
    const out = new Uint8Array(iw * dh);
    for (let yy = 0; yy < dh; yy++) {
      const ymin = needH ? vb[yy * 2] : V.bounds[yy * 2], ymax = V.bounds[yy * 2 + 1], o = yy * V.ksize;
      for (let xx = 0; xx < iw; xx++) {
        let ss = ONE / 2;
        for (let y = 0; y < ymax; y++) ss += img[(y + ymin) * iw + xx] * V.k[o + y];
        out[yy * iw + xx] = clip8(ss);
      }
    }
    return out;
  }

  function pyRound(x) {
    const f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  const segmenterSize = (w, h, imgH) => [Math.max(16, pyRound(w * (imgH / h))), imgH];
  const recogniserSize = (w, h, height, stride) => [Math.max(stride * 2, pyRound(w * height / h)), height];

  ME.RecogImage = { grey, resize, pyRound, segmenterSize, recogniserSize };
})(window.ME);
