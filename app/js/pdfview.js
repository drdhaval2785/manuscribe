'use strict';
/* PDF viewer (top pane): renders one folio side with pdf.js, zoom / pan / image filters,
   the reading guide that follows the line being typed, and the calibration tool. */
(function (ME) {
  const { U } = ME;
  const MAX_CANVAS_PIXELS = 24e6;

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

    // drag to pan
    let pan = null;
    stage.addEventListener('pointerdown', (e) => {
      if (PdfView.calibrating || e.button !== 0) return;
      pan = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('panning');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pan) return;
      scroller.scrollLeft = pan.sl - (e.clientX - pan.x);
      scroller.scrollTop = pan.st - (e.clientY - pan.y);
    });
    const endPan = () => { pan = null; stage.classList.remove('panning'); };
    stage.addEventListener('pointerup', endPan);
    stage.addEventListener('pointercancel', endPan);

    scroller.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey) || !PdfView.doc) return;
      e.preventDefault();
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
    PdfView.cache.clear();
    PdfView.doc = await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const p1 = await PdfView.doc.getPage(1);
    const vp = p1.getViewport({ scale: 1 });
    PdfView.showEmpty('');
    return { pages: PdfView.doc.numPages, width: vp.width, height: vp.height };
  };

  PdfView.unload = function () {
    if (PdfView.doc) { try { PdfView.doc.destroy(); } catch (e) { /* ignore */ } }
    PdfView.doc = null;
    PdfView.cache.clear();
  };

  PdfView.show = function (entry, leaf) {
    PdfView.entry = entry;
    PdfView.leaf = leaf || [0, 0, 1, 1];
    return PdfView.render();
  };

  PdfView.setMode = function (m) { PdfView.mode = m; return PdfView.render(); };
  PdfView.setZoom = function (z) { PdfView.zoom = U.clamp(z, 0.3, 8); if (PdfView.cb.onZoom) PdfView.cb.onZoom(PdfView.zoom); return PdfView.render(); };
  PdfView.setRotation = function (r) { PdfView.rotation = ((r % 360) + 360) % 360; PdfView.cache.clear(); return PdfView.render(); };

  PdfView.setFilters = function (f) {
    PdfView.filters = Object.assign({}, PdfView.filters, f);
    const x = PdfView.filters;
    stage.style.filter = `brightness(${x.b}%) contrast(${x.c}%)` + (x.gray ? ' grayscale(1)' : '') + (x.inv ? ' invert(1)' : '');
  };

  function visibleRegion() {
    return PdfView.mode === 'leaf' && !PdfView.calibrating ? PdfView.leaf : [0, 0, 1, 1];
  }

  async function renderToCanvas(pageNo, scale) {
    const key = pageNo + '@' + scale.toFixed(4) + '@' + PdfView.rotation;
    if (PdfView.cache.has(key)) return PdfView.cache.get(key);
    const page = await PdfView.doc.getPage(pageNo);
    const vp = page.getViewport({ scale, rotation: PdfView.rotation });
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    while (vp.width * vp.height * dpr * dpr > MAX_CANVAS_PIXELS && dpr > 0.5) dpr *= 0.85;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr, rotation: PdfView.rotation }) }).promise;
    const out = { canvas, w: vp.width, h: vp.height };
    PdfView.cache.set(key, out);
    while (PdfView.cache.size > 5) PdfView.cache.delete(PdfView.cache.keys().next().value);
    return out;
  }

  PdfView.render = async function () {
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
    const scale = Math.round(fit * (PdfView.calibrating ? 1 : PdfView.zoom) * 1000) / 1000;
    const r = await renderToCanvas(entry.pdfPage, scale);
    if (seq !== PdfView.renderSeq) return;
    const old = stage.querySelector('canvas');
    if (old !== r.canvas) { if (old) old.remove(); stage.insertBefore(r.canvas, overlay); }
    stage.style.width = r.w + 'px';
    stage.style.height = r.h + 'px';
    stage.style.left = -region[0] * r.w + 'px';
    stage.style.top = -region[1] * r.h + 'px';
    clip.style.width = region[2] * r.w + 'px';
    clip.style.height = region[3] * r.h + 'px';
    // half a pane of room above and below, so that any line can be brought to the middle
    const pad = PdfView.calibrating ? 14 : Math.round(scroller.clientHeight / 2);
    const newPage = PdfView._shownKey !== entry.key;
    PdfView._shownKey = entry.key;
    clip.style.marginTop = pad + 'px';
    clip.style.marginBottom = pad + 'px';
    if (newPage || PdfView.calibrating || !PdfView.guide.rect) scroller.scrollTop = Math.max(0, pad - 14);
    pageInfo.textContent = 'PDF page ' + entry.pdfPage + ' / ' + PdfView.doc.numPages + (entry.half !== null && entry.half !== undefined ? (entry.half ? ' · lower half' : ' · upper half') : '');
    if (PdfView.cb.onPageSize) PdfView.cb.onPageSize(entry, { width: vp1.width, height: vp1.height });
    const paper = samplePaper(r.canvas, PdfView.leaf);
    if (PdfView.cb.onPaper) PdfView.cb.onPaper(paper);
    PdfView.positionGuide(true);
    // warm the cache for the next page
    const next = entry.pdfPage + 1;
    if (next <= PdfView.doc.numPages) setTimeout(() => { if (seq === PdfView.renderSeq) renderToCanvas(next, scale).catch(() => {}); }, 400);
  };

  // Average colour of the bright (non-ink) pixels inside the leaf.
  function samplePaper(canvas, leaf) {
    try {
      const S = 48;
      const t = document.createElement('canvas');
      t.width = S; t.height = S;
      const ctx = t.getContext('2d', { willReadFrequently: true });
      const x = (leaf[0] + leaf[2] * 0.15) * canvas.width, y = (leaf[1] + leaf[3] * 0.15) * canvas.height;
      ctx.drawImage(canvas, x, y, leaf[2] * 0.7 * canvas.width, leaf[3] * 0.7 * canvas.height, 0, 0, S, S);
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
      const r = [x0 / W, y0 / H, (x1 - x0 + 1) / W, (y1 - y0 + 1) / H];
      if (r[2] * r[3] < 0.08 || r[2] * r[3] > 0.97) return null;
      return r;
    } catch (e) { return null; }
  };

  /* ---------- reading guide ---------- */

  PdfView.guide = { rect: null, style: 'band' };
  PdfView.setGuide = function (rect, style) {
    PdfView.guide = { rect, style: style || PdfView.guide.style, fx: null };
    PdfView.positionGuide(false);
  };

  // fx: where the cursor is along the line (0..1); when zoomed in, the PDF follows it sideways
  PdfView.followX = function (fx) {
    if (!PdfView.guide.rect || fx === null || fx === undefined) return;
    PdfView.guide.fx = fx;
    scrollToGuide(false);
  };

  PdfView.positionGuide = function (instant) {
    const { rect, style } = PdfView.guide;
    if (!rect || style === 'off' || PdfView.calibrating) { guideEl.hidden = true; return; }
    guideEl.hidden = false;
    guideEl.className = 'pdf-guide guide-' + style;
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
    if (!rect || !sw || scroller.hidden) return;
    const ox = clip.offsetLeft + (parseFloat(stage.style.left) || 0), oy = clip.offsetTop + (parseFloat(stage.style.top) || 0);
    const padY = rect[3] * 0.25;
    const top = oy + (rect[1] - padY) * sh, bottom = oy + (rect[1] + rect[3] + padY) * sh;
    const to = {};
    // the line being typed is kept in the middle of the pane
    const vt = scroller.scrollTop, vh = scroller.clientHeight;
    const target = Math.max(0, (top + bottom) / 2 - vh / 2);
    if (Math.abs(target - vt) > 3) to.top = target;
    if (fx !== null && fx !== undefined && scroller.scrollWidth > scroller.clientWidth + 4) {
      const x = ox + (rect[0] + fx * rect[2]) * sw, vl = scroller.scrollLeft, vw = scroller.clientWidth;
      if (x < vl + 60 || x > vl + vw - 60) to.left = Math.max(0, x - vw / 2);
    }
    if ('top' in to || 'left' in to) scroller.scrollTo(Object.assign(to, { behavior: instant ? 'auto' : 'smooth' }));
  }

  /* ---------- calibration ---------- */

  // steps: [{key, label, color, lines?}] -> Promise<{rects: {key: [x,y,w,h]}, lines: {key: n}} | null>
  PdfView.calibrate = function (steps, existing) {
    return new Promise((resolve) => {
      PdfView.calibrating = true;
      root.classList.add('calibrating');
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
        calibBar.hidden = true;
        Object.values(shapes).forEach((s) => s.remove());
        overlay.removeEventListener('pointerdown', onDown);
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
          U.el('span', { class: 'calib-label' }, st.label),
          linesCtl,
          U.el('button', { class: 'btn small' + (rects[st.key] ? ' primary' : ''), onclick: () => { i++; showStep(); } }, rects[st.key] ? (i === steps.length - 1 ? 'Finish' : 'Next') : 'Skip'),
          i > 0 ? U.el('button', { class: 'btn small', onclick: () => { i--; showStep(); } }, 'Back') : null,
          U.el('button', { class: 'btn small ghost', onclick: () => finish(false) }, 'Cancel'),
        ].filter(Boolean));
      };

      let drag = null;
      function onDown(e) {
        if (e.button !== 0 || i >= steps.length) return;
        e.preventDefault();
        const box = stage.getBoundingClientRect();
        const st = steps[i];
        const p0 = [(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height];
        drag = { p0, st };
        const move = (ev) => {
          const p = [U.clamp((ev.clientX - box.left) / box.width, 0, 1), U.clamp((ev.clientY - box.top) / box.height, 0, 1)];
          drag.r = [Math.min(p0[0], p[0]), Math.min(p0[1], p[1]), Math.abs(p[0] - p0[0]), Math.abs(p[1] - p0[1])];
          drawShape(st, drag.r);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
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
      PdfView.mode = 'page';
      PdfView.render().then(showStep);
    });
  };

  ME.PdfView = PdfView;
})(window.ME);
