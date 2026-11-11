'use strict';
/* Small DOM + string helpers shared by every module. Everything hangs off window.ME
   because classic <script> tags are used (ES modules do not load from file://). */
window.ME = window.ME || {};
// The version of Manuscribe, named in every output and release.
ME.VERSION = '0.10.6';
(function (ME) {
  const U = {};

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // el('div', {class: 'x', onclick: fn, dataset: {a: 1}}, child, 'text', ...)
  U.el = function (tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'html') node.innerHTML = v;
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  };

  U.escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  U.escAttr = (s) => U.escXml(s).replace(/"/g, '&quot;');
  U.escHtml = U.escAttr;

  U.debounce = function (fn, ms) {
    let t = null;
    const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
    d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
    d.cancel = () => { clearTimeout(t); t = null; };
    return d;
  };

  U.uid = (prefix = 'id') => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  U.clone = (o) => JSON.parse(JSON.stringify(o));

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  U.graphemeCount = (s) => (segmenter ? Array.from(segmenter.segment(s)).length : Array.from(s).length);

  U.timeAgo = function (ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + ' s ago';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(ts).toLocaleDateString();
  };

  U.download = function (filename, content, mime = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = U.el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  U.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const prev = document.activeElement;
      const ta = U.el('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      return ok;
    }
  };

  /* For a long job on this thread: call it in the job's loop, and every 40 ms it lets the screen be drawn. By a message,
     since a browser slows timers in a tab that is not in front, and the job would slow with them. -> true if it did */
  U.breather = function () {
    const ch = new MessageChannel();
    let last = performance.now();
    return async () => {
      if (performance.now() - last < 40) return false;
      await new Promise((resolve) => { ch.port1.onmessage = resolve; ch.port2.postMessage(0); });
      last = performance.now();
      return true;
    };
  };

  /* A bar in the corner of the screen, for a job that takes time. Its shine moves by the compositor, so that it goes on
     moving even while the page is too busy to draw: the machine is seen not to have hung.
     -> {set(fraction, text), close()} */
  U.progressPanel = function (title) {
    const fill = U.el('span', { class: 'xp-fill' });
    const bar = U.el('span', { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': title }, fill, U.el('span', { class: 'xp-shine' }));
    const text = U.el('span', { class: 'xp-progress-text' });
    const box = U.el('div', { class: 'xp-progress', dataset: { action: 'export-progress' } }, U.el('strong', null, title), bar, text);
    document.body.appendChild(box);
    let at = 0;
    return {
      set(f, t) { at = Math.max(at, Math.min(1, f)); fill.style.width = (100 * at).toFixed(1) + '%'; bar.setAttribute('aria-valuenow', String(Math.round(100 * at))); if (t) text.textContent = t; },
      close() { box.remove(); },
    };
  };

  U.toast = function (msg, kind = 'info', ms = 2600) {
    let host = U.$('#toasts');
    if (!host) { host = U.el('div', { id: 'toasts' }); document.body.appendChild(host); }
    const t = U.el('div', { class: 'toast toast-' + kind }, msg);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // Increment the trailing number of an id: "v1.12" -> "v1.13", "p" -> "p1"
  U.nextId = function (id, fallback) {
    if (!id) return fallback;
    const m = /^(.*?)(\d+)(\D*)$/.exec(id);
    if (!m) return id + '1';
    return m[1] + (parseInt(m[2], 10) + 1) + m[3];
  };

  ME.U = U;
})(window.ME);
