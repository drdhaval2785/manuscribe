'use strict';
/* PDF viewer (top pane): renders one folio side with pdf.js, zoom / pan / image filters,
   the reading guide that follows the line being typed, and the calibration tool. */
(function (ME) {
  const { U } = ME;
  /* What is drawn is kept within a phone's memory: a canvas of at most 12 megapixels there (Safari on iOS refuses one of
     more than about 16), 24 on a computer; two pages kept drawn rather than five; and only the part of the page that
     is shown drawn at all, since a page zoomed in on a phone would not fit whole. */
  const smallDevice = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  const maxPixels = () => (smallDevice() ? 12e6 : 24e6);
  const cachePages = () => (smallDevice() ? 2 : 5);

  const PdfView = {
    doc: null,
    entry: null,
    leaf: [0, 0, 1, 1],
    mode: 'leaf',
    zoom: 1,
    rotation: 0,
    filters: { b: 100, c: 100, inv: false, gray: false },
    cb: {},
    renderSeq: 0,
    cache: new Map(),
    calibrating: false,
  };

  let root, scroller, clip, stage, overlay, guideEl, emptyEl, calibBar, pageInfo;

  PdfView.init = function (rootEl, callbacks) {
    root = rootEl;
    PdfView.cb = callbacks || {};
    root.innerHTML = '';
    scroller = U.el('div', { class: 'pdf-scroller' });
    clip = U.el('div', { class: 'pdf-clip' });
    stage = U.el('div', { class: 'pdf-stage' });
    overlay = U.el('div', { class: 'pdf-overlay' });
    guideEl = U.el('div', { class: 'pdf-guide', hidden: true });
    overlay.appendChild(guideEl);
    stage.appendChild(overlay);
    clip.appendChild(stage);
    scroller.appendChild(clip);
    pageInfo = U.el('div', { class: 'pdf-pageinfo' });
    emptyEl = U.el('div', { class: 'pdf-empty' });
    calibBar = U.el('div', { class: 'calib-bar', hidden: true });
    root.append(scroller, pageInfo, emptyEl, calibBar);
    /* While calibrating, the scan begins under the bar, whatever height the bar has (on a phone it wraps to several
       rows): its height is kept in --calib-bar-h, and the page is fitted to the room left when it changes. */
    PdfView.barHeight = function () {
      if (!PdfView.calibrating) return;
      const h = Math.ceil(calibBar.getBoundingClientRect().height);
      if (h === PdfView._barH) return;
      PdfView._barH = h;
      root.style.setProperty('--calib-bar-h', h + 'px');
      if (PdfView._barH0 !== undefined) PdfView.render();
      PdfView._barH0 = h;
    };
    // (read in the next frame, not in the observer's own callback, whose changes of size WebKit reports as a loop)
    PdfView.barWatch = window.ResizeObserver ? new ResizeObserver(() => requestAnimationFrame(PdfView.barHeight)) : null;

    // drag to pan; two fingers pinch to zoom (the stage is scaled while the fingers move, and drawn afresh when they lift)
    let pan = null, pinch = null;
    const fingers = new Map();
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const middle = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    stage.addEventListener('pointerdown', (e) => {
      if (PdfView.calibrating || e.button !== 0) return;
      if (e.pointerType === 'touch') {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { stage.setPointerCapture(e.pointerId); } catch (x) { /* a pointer the browser does not know: a test's */ }
        if (fingers.size === 2) {
          pan = null; stage.classList.remove('panning');
          const m = middle(), box = clip.getBoundingClientRect();
          pinch = { d: spread(), z: PdfView.zoom, f: 1, ox: m.x - box.left, oy: m.y - box.top, at: m };
          clip.style.transformOrigin = pinch.ox + 'px ' + pinch.oy + 'px';
          return;
        }
      }
      pan = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop };
      try { stage.setPointerCapture(e.pointerId); } catch (x) { /* a pointer the browser does not know: a test's */ }
      stage.classList.add('panning');
    });
    stage.addEventListener('pointermove', (e) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        if (fingers.size === 2) { pinch.f = U.clamp(spread() / pinch.d, 0.3 / pinch.z, 8 / pinch.z); clip.style.transform = 'scale(' + pinch.f + ')'; }
        return;
      }
      if (!pan) return;
      scroller.scrollLeft = pan.sl - (e.clientX - pan.x);
      scroller.scrollTop = pan.st - (e.clientY - pan.y);
    });
    const endPan = (e) => {
      if (e && fingers.has(e.pointerId)) fingers.delete(e.pointerId);
      if (pinch && fingers.size < 2) {
        const p = pinch; pinch = null;
        clip.style.transform = ''; clip.style.transformOrigin = '';
        if (Math.abs(p.f - 1) > 0.02) {
          // the point between the fingers stays where it was
          const box = scroller.getBoundingClientRect();
          const ax = p.at.x - box.left, ay = p.at.y - box.top;
          const fx = (scroller.scrollLeft + ax) / Math.max(1, scroller.scrollWidth), fy = (scroller.scrollTop + ay) / Math.max(1, scroller.scrollHeight);
          pauseFollow();
          PdfView.setZoom(p.z * p.f).then(() => { scroller.scrollLeft = fx * scroller.scrollWidth - ax; scroller.scrollTop = fy * scroller.scrollHeight - ay; });
        }
      }
      pan = null; stage.classList.remove('panning');
    };
    stage.addEventListener('pointerup', endPan);
    stage.addEventListener('pointercancel', endPan);
    /* A scroll by hand - a finger or the mouse on the pane, or the wheel turned - stops the scan following, until
       the next line or Follow. A scroll by nothing of the kind is not the editor's: the app's own smooth scroll (its
       events can come late, after a long way on a phone), or the browser settling the pane after its size changed
       (the keyboard opening). Those must not stop it: the scan would stay put while the typing went on. */
    let handOn = false, wheelUntil = 0;
    scroller.addEventListener('pointerdown', () => { handOn = true; });
    window.addEventListener('pointerup', () => { handOn = false; });
    window.addEventListener('pointercancel', () => { handOn = false; });
    scroller.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) wheelUntil = performance.now() + 400; }, { passive: true });
    scroller.addEventListener('scroll', () => { if (handOn || performance.now() < wheelUntil) pauseFollow(); });

    scroller.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey) || !PdfView.doc) return;
      e.preventDefault();
      if (PdfView.calibrating) { PdfView.calibZoom(PdfView.calibScale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e); return; }
      PdfView.setZoom(PdfView.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });

    // drop a PDF file onto the viewer
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      root.classList.remove('drop');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && PdfView.cb.onFileDrop) PdfView.cb.onFileDrop(f);
    });

    new ResizeObserver(U.debounce(() => { if (PdfView.entry) PdfView.render(); }, 120)).observe(scroller);
    PdfView.showEmpty('');
  };

  PdfView.showEmpty = function (html) {
    emptyEl.hidden = !html;
    emptyEl.innerHTML = html || '';
    scroller.hidden = !!html;
  };

  let workerReady = null;
  function ensureWorker() {
    if (workerReady) return workerReady;
    const lib = window.pdfjsLib;
    if (location.protocol === 'file:') {
      // Browsers refuse Web Workers from file://, so run pdf.js' worker code on the main thread.
      workerReady = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/pdf.worker.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    } else {
      lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      workerReady = Promise.resolve();
    }
    return workerReady;
  }

  PdfView.ensureWorker = ensureWorker;

  PdfView.load = async function (blob) {
    await ensureWorker();
    const data = new Uint8Array(await blob.arrayBuffer());
    if (PdfView.doc) { try { PdfView.doc.destroy(); } catch (e) { /* ignore */ } }
    dropCache();
    PdfView.doc = await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const p1 = await PdfView.doc.getPage(1);
    const vp = p1.getViewport({ scale: 1 });
    PdfView.showEmpty('');
    return { pages: PdfView.doc.numPages, width: vp.width, height: vp.height };
  };

  PdfView.unload = function () {
    if (PdfView.doc) { try { PdfView.doc.destroy(); } catch (e) { /* ignore */ } }
    PdfView.doc = null;
    dropCache();
  };

  PdfView.show = function (entry, leaf) {
    PdfView.entry = entry;
    PdfView.leaf = leaf || [0, 0, 1, 1];
    return PdfView.render();
  };

  PdfView.setMode = function (m) { PdfView.mode = m; return PdfView.render(); };
  /* While calibrating: a zoom of its own, from the whole page (1) to eight times it, keeping the point under the
     cursor (or the middle of the pane) where it was, so that a block can be drawn closely on a small scan. */
  PdfView.calibScale = 1;
  PdfView.calibZoom = function (z, at) {
    const z1 = U.clamp(z, 1, 8), z0 = PdfView.calibScale;
    if (z1 === z0) return Promise.resolve();
    const box = scroller.getBoundingClientRect();
    const ax = at ? at.clientX - box.left : box.width / 2, ay = at ? at.clientY - box.top : box.height / 2;
    const fx = (scroller.scrollLeft + ax) / Math.max(1, scroller.scrollWidth), fy = (scroller.scrollTop + ay) / Math.max(1, scroller.scrollHeight);
    PdfView.calibScale = z1;
    return PdfView.render().then(() => { scroller.scrollLeft = fx * scroller.scrollWidth - ax; scroller.scrollTop = fy * scroller.scrollHeight - ay; if (PdfView.cb.onCalibZoom) PdfView.cb.onCalibZoom(z1); });
  };
  // The zoom at which this fraction of the page's width fills the pane. -> zoom, or null before the first render
  PdfView.zoomToShow = function (fraction) {
    if (!PdfView.pagePx1 || !(fraction > 0) || !scroller) return null;
    return U.clamp(Math.max(200, scroller.clientWidth - 28) / (fraction * PdfView.pagePx1), 0.3, 8);
  };
  PdfView.setZoom = function (z) { PdfView.zoom = U.clamp(z, 0.3, 8); if (PdfView.cb.onZoom) PdfView.cb.onZoom(PdfView.zoom); return PdfView.render(); };
  PdfView.setRotation = function (r) { PdfView.rotation = ((r % 360) + 360) % 360; dropCache(); return PdfView.render(); };

  PdfView.setFilters = function (f) {
    PdfView.filters = Object.assign({}, PdfView.filters, f);
    const x = PdfView.filters;
    stage.style.filter = `brightness(${x.b}%) contrast(${x.c}%)` + (x.gray ? ' grayscale(1)' : '') + (x.inv ? ' invert(1)' : '');
  };

  function visibleRegion() {
    return PdfView.mode === 'leaf' && !PdfView.calibrating ? PdfView.leaf : [0, 0, 1, 1];
  }

  /* The part `region` (page-normalised [x, y, w, h]) of a page, drawn at `scale`. -> {canvas, w, h: the whole page's
     size on the screen; x0, y0, rw, rh: where the part is on it, and its size}. The canvas is kept, with a few others
     lately drawn; the latest used is kept longest. */
  async function renderToCanvas(pageNo, scale, region) {
    const reg = region || [0, 0, 1, 1];
    const key = pageNo + '@' + scale.toFixed(4) + '@' + PdfView.rotation + '@' + reg.map((v) => v.toFixed(4)).join(',');
    const hit = PdfView.cache.get(key);
    if (hit) { PdfView.cache.delete(key); PdfView.cache.set(key, hit); return hit; }
    const page = await PdfView.doc.getPage(pageNo);
    const vp = page.getViewport({ scale, rotation: PdfView.rotation });
    const x0 = Math.floor(reg[0] * vp.width), y0 = Math.floor(reg[1] * vp.height);
    const rw = Math.max(1, Math.ceil((reg[0] + reg[2]) * vp.width) - x0), rh = Math.max(1, Math.ceil((reg[1] + reg[3]) * vp.height) - y0);
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const most = maxPixels();
    while (rw * rh * dpr * dpr > most && dpr > 0.5) dpr *= 0.85;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(rw * dpr);
    canvas.height = Math.floor(rh * dpr);
    canvas.style.width = rw + 'px';
    canvas.style.height = rh + 'px';
    canvas.style.left = x0 + 'px';
    canvas.style.top = y0 + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr, rotation: PdfView.rotation, offsetX: -x0 * dpr, offsetY: -y0 * dpr }) }).promise;
    const out = { canvas, w: vp.width, h: vp.height, x0, y0, rw, rh, region: reg };
    PdfView.cache.set(key, out);
    while (PdfView.cache.size > cachePages()) { const k = PdfView.cache.keys().next().value; const v = PdfView.cache.get(k); PdfView.cache.delete(k); free(v); }
    return out;
  }
  // a canvas no longer shown gives its memory back at once, not when the garbage collector gets to it
  function free(v) { if (v && v.canvas && !v.canvas.isConnected) { v.canvas.width = 0; v.canvas.height = 0; } }
  function dropCache() { for (const v of PdfView.cache.values()) free(v); PdfView.cache.clear(); }

  /* A render begun when the PDF is closed (another transcription opened) is cancelled by pdf.js: that is no error. */
  PdfView.render = () => renderNow().catch((e) => { if (e && /Cancel/i.test(e.name || '')) return; throw e; });
  async function renderNow() {
    const entry = PdfView.entry;
    if (!PdfView.doc || !entry) return;
    if (!entry.pdfPage) {
      PdfView.showEmpty('<div class="pdf-empty-inner"><p>This folio is not mapped to a PDF page.</p></div>');
      return;
    }
    PdfView.showEmpty('');
    const seq = ++PdfView.renderSeq;
    const page = await PdfView.doc.getPage(entry.pdfPage);
    const vp1 = page.getViewport({ scale: 1, rotation: PdfView.rotation });
    const region = visibleRegion();
    const availW = Math.max(200, scroller.clientWidth - 28);
    const availH = Math.max(120, scroller.clientHeight - 36);
    let fit = availW / (region[2] * vp1.width);
    // the whole page must be visible to draw on it, and is the point of "page" mode
    if (PdfView.calibrating || PdfView.mode === 'page') fit = Math.min(fit, availH / (region[3] * vp1.height));
    const scale = Math.round(fit * (PdfView.calibrating ? PdfView.calibScale : PdfView.zoom) * 1000) / 1000;
    if (!PdfView.calibrating) PdfView.pagePx1 = vp1.width * fit; // the page's width on the screen at zoom 1
    const r = await renderToCanvas(entry.pdfPage, scale, region);
    if (seq !== PdfView.renderSeq) return;
    const old = stage.querySelector('canvas');
    if (old !== r.canvas) {
      if (old) { old.remove(); if (![...PdfView.cache.values()].some((v) => v.canvas === old)) { old.width = 0; old.height = 0; } }
      stage.insertBefore(r.canvas, overlay);
    }
    PdfView._shown = r;
    stage.style.width = r.w + 'px';
    stage.style.height = r.h + 'px';
    stage.style.left = -region[0] * r.w + 'px';
    stage.style.top = -region[1] * r.h + 'px';
    clip.style.width = region[2] * r.w + 'px';
    clip.style.height = region[3] * r.h + 'px';
    // half a pane of room above and below, so that any line can be brought to the middle; and, when the page is
    // wider than the pane, to the left and right too, so that the first and the last letter of a line can be
    const pad = PdfView.calibrating ? 14 : Math.round(scroller.clientHeight / 2);
    const padX = !PdfView.calibrating && region[2] * r.w > scroller.clientWidth - 28 ? Math.round(scroller.clientWidth / 2) : null;
    const newPage = PdfView._shownKey !== entry.key;
    PdfView._shownKey = entry.key;
    clip.style.marginTop = pad + 'px';
    clip.style.marginBottom = pad + 'px';
    clip.style.marginLeft = clip.style.marginRight = padX === null ? 'auto' : padX + 'px';
    if (newPage || (PdfView.calibrating && PdfView.calibScale === 1) || !PdfView.guide.rect) scroller.scrollTop = Math.max(0, pad - 14);
    pageInfo.textContent = 'PDF page ' + entry.pdfPage + ' / ' + PdfView.doc.numPages + (entry.half !== null && entry.half !== undefined ? (entry.half ? ' · lower half' : ' · upper half') : '');
    if (PdfView.cb.onPageSize) PdfView.cb.onPageSize(entry, { width: vp1.width, height: vp1.height });
    const paper = samplePaper(r, PdfView.leaf);
    if (PdfView.cb.onPaper) PdfView.cb.onPaper(paper);
    PdfView.positionGuide(true);
    // warm the cache for the next page
    const next = entry.pdfPage + 1;
    if (next <= PdfView.doc.numPages) setTimeout(() => { if (seq === PdfView.renderSeq) renderToCanvas(next, scale, region).catch(() => {}); }, 400);
  };

  // Average colour of the bright (non-ink) pixels inside the leaf. r: what was drawn (renderToCanvas), the leaf page-normalised.
  function samplePaper(r, leaf) {
    try {
      const S = 48, canvas = r.canvas;
      const t = document.createElement('canvas');
      t.width = S; t.height = S;
      const ctx = t.getContext('2d', { willReadFrequently: true });
      // the leaf, in the pixels of the part drawn
      const kx = canvas.width / r.rw, ky = canvas.height / r.rh;
      const lx = (leaf[0] * r.w - r.x0) * kx, ly = (leaf[1] * r.h - r.y0) * ky, lw = leaf[2] * r.w * kx, lh = leaf[3] * r.h * ky;
      const x = Math.max(0, lx + lw * 0.15), y = Math.max(0, ly + lh * 0.15);
      ctx.drawImage(canvas, x, y, Math.min(lw * 0.7, canvas.width - x), Math.min(lh * 0.7, canvas.height - y), 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
      px.sort((a, b) => a[3] - b[3]);
      const top = px.slice(Math.floor(px.length * 0.55), Math.floor(px.length * 0.95));
      if (!top.length) return null;
      const avg = [0, 1, 2].map((k) => top.reduce((s, p) => s + p[k], 0) / top.length);
      return avg;
    } catch (e) { return null; }
  }

  // Find the leaf on a scan: the largest block of rows/columns that differ from the
  // background colour sampled along the page border. Returns [x,y,w,h] or null.
  PdfView.detectLeaf = function () {
    const canvas = stage.querySelector('canvas');
    if (!canvas) return null;
    try {
      const W = 240, H = Math.max(40, Math.round((W * canvas.height) / canvas.width));
      const t = document.createElement('canvas');
      t.width = W; t.height = H;
      const ctx = t.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const px = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k + 1], d[k + 2]]; };
      const border = [];
      for (let x = 0; x < W; x += 2) border.push(px(x, 1), px(x, H - 2));
      for (let y = 0; y < H; y += 2) border.push(px(1, y), px(W - 2, y));
      const bg = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
      const fg = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = px(x, y);
        fg[y * W + x] = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60 ? 1 : 0;
      }
      const longestRun = (fracs, thr) => {
        let best = [0, -1], s = -1, gap = 0;
        const maxGap = Math.round(fracs.length * 0.02);
        for (let i = 0; i <= fracs.length; i++) {
          if (i < fracs.length && fracs[i] > thr) { if (s < 0) s = i; gap = 0; } else if (s >= 0) {
            gap++;
            if (gap > maxGap || i === fracs.length) { const e = i - gap; if (e - s > best[1] - best[0]) best = [s, e]; s = -1; gap = 0; }
          }
        }
        return best;
      };
      const rows = [];
      for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) n += fg[y * W + x]; rows.push(n / W); }
      const [y0, y1] = longestRun(rows, 0.5);
      if (y1 <= y0) return null;
      const cols = [];
      for (let x = 0; x < W; x++) { let n = 0; for (let y = y0; y <= y1; y++) n += fg[y * W + x]; cols.push(n / (y1 - y0 + 1)); }
      const [x0, x1] = longestRun(cols, 0.5);
      if (x1 <= x0) return null;
      // in the part of the page that was drawn: given back in the page's own measure
      const reg = (PdfView._shown && PdfView._shown.region) || [0, 0, 1, 1];
      const r = [reg[0] + (x0 / W) * reg[2], reg[1] + (y0 / H) * reg[3], ((x1 - x0 + 1) / W) * reg[2], ((y1 - y0 + 1) / H) * reg[3]];
      if (r[2] * r[3] < 0.08 * reg[2] * reg[3] || r[2] * r[3] > 0.97 * reg[2] * reg[3]) return null;
      return r;
    } catch (e) { return null; }
  };

  /* ---------- reading guide ---------- */

  /* The scan follows the line being typed, and the letter along it. A pan or a pinch by hand stops it following (so
     that a marginal note can be read), until the typing moves to another line, or Follow is pressed. */
  PdfView.following = true;
  function pauseFollow() {
    if (!PdfView.following || !PdfView.guide.rect) return;
    PdfView.following = false;
    if (PdfView.cb.onFollow) PdfView.cb.onFollow(false);
  }
  PdfView.resumeFollow = function () {
    const was = PdfView.following;
    PdfView.following = true;
    if (!was && PdfView.cb.onFollow) PdfView.cb.onFollow(true);
    scrollToGuide(false);
  };

  PdfView.guide = { rect: null, style: 'band' };
  PdfView.setGuide = function (rect, style) {
    const moved = JSON.stringify(rect) !== JSON.stringify(PdfView.guide.rect);
    PdfView.guide = { rect, style: style || PdfView.guide.style, fx: null, at: null };
    if (moved && !PdfView.following) { PdfView.following = true; if (PdfView.cb.onFollow) PdfView.cb.onFollow(true); }
    PdfView.positionGuide(false);
  };

  // fx: where the cursor is along the line (0..1); when zoomed in, the PDF keeps the letter in the middle of the pane
  PdfView.followX = function (fx) {
    if (!PdfView.guide.rect || fx === null || fx === undefined) return;
    PdfView.guide.fx = fx;
    if (PdfView.following) scrollToGuide(false);
  };

  PdfView.positionGuide = function (instant) {
    const { rect, style } = PdfView.guide;
    if (!rect || style === 'off' || PdfView.calibrating) { guideEl.hidden = true; return; }
    guideEl.hidden = false;
    guideEl.className = 'pdf-guide guide-' + style + (rect.guessed ? ' guessed' : '');
    // handwritten lines are seldom straight: pad the band by 25% of the line height above and below
    const padY = rect[3] * 0.25, padX = rect[2] * 0.01;
    Object.assign(guideEl.style, { left: (rect[0] - padX) * 100 + '%', top: (rect[1] - padY) * 100 + '%', width: (rect[2] + 2 * padX) * 100 + '%', height: (rect[3] + 2 * padY) * 100 + '%' });
    scrollToGuide(instant);
  };

  // Bring the current line to the middle of the pane. Computed from the page geometry: the band itself
  // slides to its new place, so its on-screen position lags behind.
  function scrollToGuide(instant) {
    const { rect, fx } = PdfView.guide;
    const sw = parseFloat(stage.style.width), sh = parseFloat(stage.style.height);
    if (!rect || !sw || scroller.hidden || !PdfView.following) return;
    const ox = clip.offsetLeft + (parseFloat(stage.style.left) || 0), oy = clip.offsetTop + (parseFloat(stage.style.top) || 0);
    const padY = rect[3] * 0.25;
    const top = oy + (rect[1] - padY) * sh, bottom = oy + (rect[1] + rect[3] + padY) * sh;
    const to = {};
    // the line being typed is kept in the middle of the pane
    const vt = scroller.scrollTop, vh = scroller.clientHeight;
    const target = Math.max(0, (top + bottom) / 2 - vh / 2);
    if (Math.abs(target - vt) > 3) to.top = target;
    // and the letter being typed in the middle, once the letters have moved on by more than a little (on a phone
    // the scan moves in steps instead: steppedLeft)
    if (fx !== null && fx !== undefined && scroller.scrollWidth > scroller.clientWidth + 4) {
      const x = ox + (rect[0] + fx * rect[2]) * sw, vl = scroller.scrollLeft, vw = scroller.clientWidth;
      const stepped = ME.Narrow && ME.Narrow.on();
      const left = stepped ? steppedLeft(x, ox, rect, sw, vw) : U.clamp(x - vw / 2, 0, scroller.scrollWidth - vw);
      if (Math.abs(left - vl) > (stepped ? 3 : 12)) to.left = left;
    }
    if ('top' in to || 'left' in to) scroller.scrollTo(Object.assign(to, { behavior: instant ? 'auto' : 'smooth' }));
  }

  /* On a phone the scan does not slide along with every letter typed, which draws the eye from the typing. The line
     is in three parts, and the scan shows two (Narrow.letterZoom): the first two until the letter typed passes the
     middle of the line, then the last two. In general (the scan zoomed by hand) the letter is kept in the middle
     half of the pane: when it comes three quarters of the way across, the scan moves on so that the letter is a
     quarter of the way in; when it goes back within an eighth of the left edge, the scan moves back likewise - so
     that a letter corrected at the middle of the line does not move the scan to and fro. The scan never shows
     beyond the ends of the line (with a margin). Where the scan stands along the line is kept (PdfView.guide.at,
     0..1 along the line) until the line changes. x: the letter, in the scroller's px. -> scrollLeft */
  const EDGE = 10; // px: the end of the line is not flush with the edge of the pane
  function steppedLeft(x, ox, rect, sw, vw) {
    const g = PdfView.guide, padX = rect[2] * 0.01;
    const x0 = ox + (rect[0] - padX) * sw - EDGE, x1 = ox + (rect[0] + rect[2] + padX) * sw + EDGE;
    const lo = x0, hi = Math.max(x0, x1 - vw);
    let left = g.at === null || g.at === undefined ? lo : x0 + g.at * (x1 - x0);
    if (x >= left + vw * 0.75) left = x - vw / 4;
    else if (x < left + vw / 8) left = x - vw * 0.75;
    left = U.clamp(left, lo, hi);
    g.at = x1 > x0 ? (left - x0) / (x1 - x0) : 0;
    return U.clamp(left, 0, scroller.scrollWidth - vw);
  }

  /* ---------- calibration ---------- */

  // steps: [{key, label, color, lines?}] -> Promise<{rects: {key: [x,y,w,h]}, lines: {key: n}} | null>
  PdfView.calibrate = function (steps, existing) {
    return new Promise((resolve) => {
      PdfView.calibrating = true;
      PdfView.calibScale = 1;
      PdfView._barH = 0; PdfView._barH0 = undefined;
      root.classList.add('calibrating');
      if (PdfView.barWatch) PdfView.barWatch.observe(calibBar);
      // on a touch screen, how to get about, said once
      if (ME.Device && ME.Device.touch()) U.toast('One finger draws a box; two fingers zoom the page and move it.', 'info', 4500);
      // the PDF takes the whole window while the boxes are drawn: the typing area has nothing to show meanwhile
      document.body.classList.add('calibrating');
      const prevMode = PdfView.mode;
      const rects = Object.assign({}, existing || {});
      let i = 0;
      const shapes = {};

      const drawShape = (st, r) => {
        const key = st.key;
        if (shapes[key]) shapes[key].remove();
        if (!r) return;
        const s = U.el('div', { class: 'calib-rect', style: { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: r[2] * 100 + '%', height: r[3] * 100 + '%', borderColor: st.color, background: st.color + '22', color: st.color } },
          U.el('span', { style: { background: st.color } }, st.title + (st.lines ? ' · ' + st.lines + ' lines' : '')));
        // the line divisions, to check against the scan
        for (let k = 1; k < (st.lines || 0); k++) s.appendChild(U.el('i', { style: { top: (k * 100) / st.lines + '%' } }));
        overlay.appendChild(s);
        shapes[key] = s;
      };
      steps.forEach((st) => drawShape(st, rects[st.key]));

      const finish = (ok) => {
        PdfView.calibrating = false;
        root.classList.remove('calibrating');
        document.body.classList.remove('calibrating');
        PdfView.calibScale = 1;
        calibBar.hidden = true;
        if (PdfView.barWatch) PdfView.barWatch.unobserve(calibBar);
        root.style.removeProperty('--calib-bar-h');
        Object.values(shapes).forEach((s) => s.remove());
        overlay.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onTouchMove);
        window.removeEventListener('pointerup', onTouchEnd);
        window.removeEventListener('pointercancel', onTouchEnd);
        window.removeEventListener('keydown', onKey, true);
        PdfView.mode = prevMode;
        PdfView.render();
        const lines = {};
        steps.forEach((st) => { if (st.lines) lines[st.key] = st.lines; });
        resolve(ok ? { rects, lines } : null);
      };

      const showStep = () => {
        if (i >= steps.length) { finish(true); return; }
        const st = steps[i];
        calibBar.hidden = false;
        calibBar.innerHTML = '';
        let linesCtl = null;
        if (st.lines) {
          const inp = U.el('input', { type: 'number', min: '1', max: '120', value: st.lines, title: 'Number of lines in this block on this folio' });
          const set = (n) => { st.lines = U.clamp(n | 0, 1, 120); inp.value = st.lines; drawShape(st, rects[st.key]); };
          inp.addEventListener('input', () => { if (+inp.value > 0) set(+inp.value); });
          linesCtl = U.el('span', { class: 'calib-lines' }, 'Lines',
            U.el('button', { class: 'btn small', onclick: () => set(st.lines - 1) }, '−'), inp,
            U.el('button', { class: 'btn small', onclick: () => set(st.lines + 1) }, '+'));
        }
        calibBar.append(...[
          U.el('span', { class: 'calib-step' }, 'Step ' + (i + 1) + ' / ' + steps.length),
          U.el('span', { class: 'calib-swatch', style: { background: st.color } }),
          // on a phone, the short wording, so that the bar leaves room for the page
          U.el('span', { class: 'calib-label' }, ME.Device && ME.Device.narrow() && st.short ? st.short : st.label),
          linesCtl,
          U.el('span', { class: 'calib-zoom', title: 'Zoom in to draw closely (Ctrl+wheel); the page scrolls' },
            U.el('button', { class: 'btn small', title: 'Zoom out', onclick: () => PdfView.calibZoom(PdfView.calibScale / 1.25) }, '−'),
            U.el('button', { class: 'btn small calib-fit', title: 'The whole page', onclick: () => PdfView.calibZoom(1) }, Math.round(PdfView.calibScale * 100) + '%'),
            U.el('button', { class: 'btn small', title: 'Zoom in', onclick: () => PdfView.calibZoom(PdfView.calibScale * 1.25) }, '+')),
          // after a pinch or a zoom, the whole page again
          U.el('button', { class: 'btn small calib-fit-all', title: 'The whole page in view again', hidden: Math.abs(PdfView.calibScale - 1) < 0.01, onclick: () => PdfView.calibZoom(1) }, 'Fit'),
          U.el('button', { class: 'btn small' + (rects[st.key] ? ' primary' : ''), onclick: () => { i++; showStep(); } }, rects[st.key] ? (i === steps.length - 1 ? 'Finish' : 'Next') : 'Skip'),
          i > 0 ? U.el('button', { class: 'btn small', onclick: () => { i--; showStep(); } }, 'Back') : null,
          U.el('button', { class: 'btn small ghost', onclick: () => finish(false) }, 'Cancel'),
        ].filter(Boolean));
        PdfView.barHeight();
      };

      let drag = null;
      // two fingers: a pinch zooms, moving them together pans (one finger draws, so on a phone this is the way to
      // reach the rest of a page zoomed in on), and neither draws anything
      const touches = new Map();
      let pinch = null;
      const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const mid = () => { const [a, b] = [...touches.values()]; return { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }; };
      const onTouchMove = (ev) => {
        if (!touches.has(ev.pointerId)) return;
        touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pinch && touches.size === 2) {
          const m = mid();
          scroller.scrollLeft -= m.clientX - pinch.m.clientX;
          scroller.scrollTop -= m.clientY - pinch.m.clientY;
          pinch.m = m;
          const d = spread();
          if (Math.abs(d / pinch.d - 1) > 0.08) PdfView.calibZoom(pinch.z * (d / pinch.d), m);
        }
      };
      const onTouchEnd = (ev) => { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; };
      function onDown(e) {
        if (e.pointerType === 'touch') {
          touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touches.size === 2) {
            // the rectangle begun by the first finger is let go
            if (drag) { drawShape(drag.st, rects[drag.st.key]); drag.cancelled = true; }
            pinch = { d: spread(), z: PdfView.calibScale, m: mid() };
            return;
          }
        }
        if (e.button !== 0 || i >= steps.length) return;
        e.preventDefault();
        const box = stage.getBoundingClientRect();
        const st = steps[i];
        const p0 = [(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height];
        drag = { p0, st };
        const move = (ev) => {
          if (drag.cancelled || (ev.pointerType === 'touch' && ev.pointerId !== e.pointerId)) return;
          const p = [U.clamp((ev.clientX - box.left) / box.width, 0, 1), U.clamp((ev.clientY - box.top) / box.height, 0, 1)];
          drag.r = [Math.min(p0[0], p[0]), Math.min(p0[1], p[1]), Math.abs(p[0] - p0[0]), Math.abs(p[1] - p0[1])];
          drawShape(st, drag.r);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (drag.cancelled) { drag = null; return; }
          if (drag.r && drag.r[2] > 0.01 && drag.r[3] > 0.005) {
            rects[st.key] = drag.r;
            // blocks wait so that the number of lines can be checked against the scan
            if (!st.lines) i++;
            showStep();
          } else {
            drawShape(st, rects[st.key]);
          }
          drag = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }
      function onKey(e) {
        if (e.target.tagName === 'INPUT' && e.key !== 'Enter' && e.key !== 'Escape') return;
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); i++; showStep(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      }
      window.addEventListener('keydown', onKey, true);
      overlay.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onTouchMove);
      window.addEventListener('pointerup', onTouchEnd);
      window.addEventListener('pointercancel', onTouchEnd);
      PdfView.cb.onCalibZoom = (z) => { const b = calibBar.querySelector('.calib-fit'); if (b) b.textContent = Math.round(z * 100) + '%'; const f = calibBar.querySelector('.calib-fit-all'); if (f) f.hidden = Math.abs(z - 1) < 0.01; };
      PdfView.mode = 'page';
      PdfView.render().then(showStep);
    });
  };

  ME.PdfView = PdfView;
})(window.ME);
