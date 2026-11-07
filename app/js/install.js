'use strict';
/* Manuscribe as an app of its own, from its website (ME.SITE):
   - offline: a service worker (sw.js) keeps every file of the app in the browser;
   - updates: a new version on the website is fetched quietly, and a bar offers to reload into it, after saving;
   - install: a button on the start screen where the browser can install it (Chrome, Edge), and the way to do it
     where it cannot be asked (Safari: Add to Dock, Add to Home Screen);
   - files: a backup opened from the desktop with the installed app comes in as if chosen with Open…;
   - a copy downloaded and opened from a file looks, once a day when online, for a newer version on the website. */
(function (ME) {
  const Install = {};
  const web = /^https?:$/.test(location.protocol);
  // the manifest, from the website only: a page opened from a file may not read it, and the browser says so
  if (web) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l); }
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* A bar at the top of the window, with one button. -> the bar */
  function bar(id, text, button, onClick, onLater) {
    let b = document.getElementById(id);
    if (b) b.remove();
    b = document.createElement('div');
    b.id = id;
    b.className = 'app-bar';
    b.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = text;
    const go = document.createElement(button.href ? 'a' : 'button');
    go.className = 'btn small primary';
    if (!button.href) go.addEventListener('click', () => b.remove());
    go.textContent = button.label;
    if (button.href) { go.href = button.href; go.target = '_blank'; go.rel = 'noopener'; } else go.addEventListener('click', onClick);
    const x = document.createElement('button');
    x.className = 'btn small ghost';
    x.textContent = 'Later';
    x.addEventListener('click', () => { b.remove(); if (onLater) onLater(); });
    b.append(t, go, x);
    document.body.appendChild(b);
    return b;
  }

  /* ---------- offline, and updates ---------- */
  let reloading = false;
  Install.offline = async function () {
    if (!web || !('serviceWorker' in navigator)) return null;
    let reg;
    try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { return null; }
    // where service workers are turned off (some private windows), there is no registration
    if (!reg) return null;
    // a new version waits until the editor says so; the first one, with nothing before it, needs no reload
    const offer = (w) => {
      if (!navigator.serviceWorker.controller) return;
      bar('update-bar', 'A new version of Manuscribe is ready.', { label: 'Reload' }, async () => {
        try { if (ME.App && ME.App.project) await ME.App.save(); } catch (e) { /* saved as usual */ }
        reloading = true;
        w.postMessage('skip-waiting');
      });
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
    // look for a new version when the app is opened, and every few hours while it stays open
    setInterval(() => reg.update().catch(() => {}), 4 * 3600 * 1000);
    Install.registration = reg;
    return reg;
  };

  /* ---------- install ---------- */
  let asked = null;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Android/.test(ua);
  // (Safari never offers to install by itself: its own way first)
  Install.how = () => (!web || standalone() ? null : ios ? 'ios' : safari ? 'safari' : asked ? 'prompt' : null);
  Install.draw = function () {
    const row = document.getElementById('install-row');
    if (!row) return;
    const how = Install.how();
    row.hidden = !how;
    row.innerHTML = '';
    if (!how) return;
    const say = (html) => { const p = document.createElement('p'); p.className = 'help install-how'; p.innerHTML = html; row.appendChild(p); };
    if (how === 'prompt') {
      const b = document.createElement('button');
      b.className = 'btn big';
      b.dataset.action = 'install';
      b.textContent = '⤓ Install Manuscribe';
      b.title = 'An icon and a window of its own; it opens without the internet';
      b.addEventListener('click', async () => { const e = asked; if (!e) return; asked = null; e.prompt(); await e.userChoice.catch(() => null); Install.draw(); });
      row.appendChild(b);
      say('Gives Manuscribe an icon and a window of its own, and it opens without the internet. Your work stays where it is.');
    } else if (how === 'ios') say('To install Manuscribe: tap <b>Share</b> <span aria-hidden="true">⎙</span>, then <b>Add to Home Screen</b>, and open it from its icon from then on: it opens without the internet, and your work is kept safely. The installed Manuscribe keeps its work apart from Safari’s: if you have work here, first <b>Back up everything</b> (below), then <b>Open…</b> that file in the installed one.');
    else say('To install Manuscribe: in Safari’s menu, <b>File → Add to Dock…</b>, then <b>Add</b>. Nothing changes here: Manuscribe is now in your Dock, in a window of its own, and opens without the internet. Open it from the Dock from then on. It keeps its work apart from Safari’s: if you have work here, first <b>Back up everything</b> (below), then <b>Open…</b> that file in the installed one.');
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); asked = e; Install.draw(); });
  window.addEventListener('appinstalled', () => { asked = null; Install.draw(); });

  /* ---------- files opened with the installed app ---------- */
  if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
    window.launchQueue.setConsumer(async (params) => {
      for (const h of (params && params.files) || []) {
        try { const f = await h.getFile(); if (ME.Edition && ME.Edition.importFile) await ME.Edition.importFile(f); } catch (e) { /* not a file Manuscribe opens */ }
      }
    });
  }

  /* ---------- a browser too old ---------- */
  /* What Manuscribe cannot do without, and since when browsers have it. -> [names of what this browser lacks] */
  const NEEDS = [
    ['storage for your work (IndexedDB)', () => !!window.indexedDB],
    ['word division (Intl.Segmenter: Chrome 87, Safari 14.1, Firefox 125)', () => !!(window.Intl && Intl.Segmenter)],
    ['compression, for backups and packages (CompressionStream: Chrome 80, Safari 16.4, Firefox 113)', () => typeof window.CompressionStream === 'function' && typeof window.DecompressionStream === 'function'],
    ['the layout of its screens (CSS :has(): Chrome 105, Safari 15.4, Firefox 121)', () => !!(window.CSS && CSS.supports && CSS.supports('selector(:has(a))'))],
    ['setting text for PDFs (WebAssembly)', () => typeof window.WebAssembly === 'object'],
  ];
  Install.missing = () => NEEDS.filter(([, ok]) => { try { return !ok(); } catch (e) { return true; } }).map(([name]) => name);
  Install.checkBrowser = function () {
    const lack = Install.missing();
    if (lack.length) bar('browser-bar', 'This browser is too old for Manuscribe: it lacks ' + lack.join('; ') + '. Please update it, or use a recent Chrome, Edge, Firefox or Safari. Your work is safe.', { label: 'Why?', href: (ME.SITE && ME.SITE.home) || '#' });
    return lack;
  };

  /* ---------- a downloaded copy: is there a newer version? ---------- */
  const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  Install.newer = newer;
  Install.checkCopy = async function (force) {
    if (web || !ME.SITE || !navigator.onLine) return null;
    const KEY = 'manuscribe.lastCheck';
    try { if (!force && Date.now() - (+localStorage.getItem(KEY) || 0) < 24 * 3600 * 1000) return null; localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* every time, then */ }
    try {
      const r = await fetch(ME.SITE.home + 'app/version.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const v = (await r.json()).version;
      if (v && newer(v, ME.VERSION)) bar('update-bar', 'Manuscribe ' + v + ' is out (this copy is ' + ME.VERSION + '). Download it and unzip it in place of this copy: your work stays in this browser.', { label: 'Download', href: ME.SITE.download });
      return v;
    } catch (e) { return null; }
  };

  window.addEventListener('DOMContentLoaded', () => {
    Install.checkBrowser();
    Install.offline();
    Install.draw();
    Install.checkCopy();
  });
  /* In an installed app with nothing in it yet (Safari keeps an app's work apart from its own): how to bring it in. */
  Install.emptyHint = () => (standalone() && /Safari\//.test(ua) && !/Chrome|Chromium|Edg/.test(ua)
    ? 'Working in Safari before? That work stays in Safari: open Manuscribe there, click Back up everything, and open that file here with Open….' : '');
  Install.bar = bar;
  ME.Install = Install;
})(window.ME);
