'use strict';
/* Manuscribe without the internet. When the app is opened from its website, every file of it is kept in the browser,
   so that it opens again offline. A new version on the website is fetched quietly; the app then offers to reload
   (it asks this worker to take over with "skip-waiting"). Not used when the app is opened from a file.

   The list below is written by tools/precache.mjs, with a version made from the files' contents: a change to any
   file changes it, and the browser sees a new version. tests/t-offline.js checks that it is up to date. */
// precache:start (written by tools/precache.mjs)
const VERSION = "0.10.2-9292207258";
const FILES = [
  './',
  "css/app.css",
  "img/apple-touch-icon.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/icon-maskable-512.png",
  "img/logo.png",
  "index.html",
  "js/app.js",
  "js/apparatus.js",
  "js/capture.js",
  "js/collate.js",
  "js/collateedit.js",
  "js/collateview.js",
  "js/commands.js",
  "js/concord.js",
  "js/dts.js",
  "js/edition.js",
  "js/editor.js",
  "js/engines.js",
  "js/exchange.js",
  "js/exchangeview.js",
  "js/export.js",
  "js/exporthtml.js",
  "js/exportview.js",
  "js/features.js",
  "js/foliolayout.js",
  "js/foliostyle.js",
  "js/follow.js",
  "js/fontlib.js",
  "js/github.js",
  "js/htr.js",
  "js/importxml.js",
  "js/install.js",
  "js/layerids.js",
  "js/layers.js",
  "js/layersview.js",
  "js/markdown.js",
  "js/metre.js",
  "js/model.js",
  "js/narrow.js",
  "js/normalize.js",
  "js/normview.js",
  "js/pdfview.js",
  "js/pdfwrite.js",
  "js/printhtml.js",
  "js/publish.js",
  "js/release.js",
  "js/safety.js",
  "js/shaper.js",
  "js/site.js",
  "js/spans.js",
  "js/stemma.js",
  "js/stemmaview.js",
  "js/steps.js",
  "js/store.js",
  "js/tagsummary.js",
  "js/tei.js",
  "js/teischema.js",
  "js/tokens.js",
  "js/translit.js",
  "js/typeset.js",
  "js/ui.js",
  "js/util.js",
  "js/zip.js",
  "manifest.webmanifest",
  "vendor/harfbuzz.wasm.js",
  "vendor/metres.js",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "vendor/saktumiva-aligner.js",
  "version.json",
];
// precache:end
const CACHE = 'manuscribe-' + VERSION;

self.addEventListener('install', (e) => {
  // from the website itself, not from the browser's cache of it
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('manuscribe-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
});

// the app's own files from the browser; anything else (fonts from jsDelivr) as usual
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(r, { ignoreSearch: true }).then((hit) => hit || fetch(r))));
});
