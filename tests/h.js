// Shared by the tests: a fresh Chrome profile on the app opened from disk, and small helpers for checks. With
// MANUSCRIBE_ENGINE=firefox or webkit, the same tests run in those engines (engine.js), on the app served by a
// local web server, as people using them would open it from the website.
const puppeteer = require('puppeteer-core');
const ENGINE = require('./engine');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(os.tmpdir(), 'manuscribe-tests'); // profiles, downloads, screenshots: never in the repo
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// on GitHub's Linux computers Chrome's sandbox cannot start
const CHROME_ARGS = process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [];
// the owner's own package, used where it is present and never copied into the repository
const SAMPLE = process.env.MANUSCRIBE_SAMPLE || path.join(os.homedir(), 'Downloads', 'saroddhara.edition-2.zip');
fs.mkdirSync(WORK, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a file's address, on every system (C:\\… on Windows too)
const fileUrl = (p) => require('url').pathToFileURL(p).href;

/* Fonts come from jsDelivr (or GitHub, for a file jsDelivr will not serve), as in the app, and the tests keep a copy of each one (WORK/fonts), so that after the
   first run they need no internet. Manuscribe's own Tiro is always to be had; the Noto fonts of other scripts only
   for the tests that ask (noto), and the others see them as not to be had; with noto 'none', no font at all, as on
   a computer that has never been online. */
const FONTS = path.join(WORK, 'fonts');
// -> {status, body} for a font asked of jsDelivr
async function fontFile(url, noto) {
  if (noto === 'none' || (!noto && !/\/tirodevanagarisanskrit\//.test(url))) return { status: 404, body: '' };
  const file = path.join(FONTS, url.replace(/^https:\/\//, '').replace(/[^\w.-]+/g, '_'));
  let body = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!body) {
    try { const r = await fetch(url); if (r.ok) { body = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(FONTS, { recursive: true }); fs.writeFileSync(file, body); } } catch (e) { /* not to be had */ }
  }
  return body ? { status: 200, body } : { status: 404, body: '' };
}
const CORS = { 'access-control-allow-origin': '*' };
async function fontsFor(page, noto) {
  if (page._pw) {
    const give = async (route) => { const r = await fontFile(route.request().url(), noto); await route.fulfill({ status: r.status, headers: CORS, contentType: 'application/octet-stream', body: r.body }); };
    await page.route('https://cdn.jsdelivr.net/**', give);
    await page.route('https://raw.githubusercontent.com/**', give);
    return;
  }
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!/^https:\/\/(cdn\.jsdelivr\.net|raw\.githubusercontent\.com)\//.test(url)) { req.continue(); return; }
    const r = await fontFile(url, noto);
    req.respond({ status: r.status, headers: CORS, contentType: 'application/octet-stream', body: r.body });
  });
}
// the app served, for the other engines: one server for the whole test file
let appServer = null;
async function appUrl() {
  if (!appServer) { appServer = await serve(0); appServer.unref(); }
  return 'http://127.0.0.1:' + appServer.address().port + '/manuscribe/app/index.html';
}

// level: how much Manuscribe shows. The tests see everything ('full') unless they ask for the default, 'simple'.
// opts: level (the interface level the app starts at), fonts, touch (a test of the phone: in Firefox and WebKit
// the browser is then a touch screen from the start, which Chrome gets from setViewport's isMobile and hasTouch)
async function launch(name, opts) {
  const level = (opts && opts.level) || 'full';
  const dir = path.join(WORK, 'profile-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  const other = ENGINE.OTHER;
  const { browser, page } = other ? await ENGINE.launchOther(dir, { width: 1500, height: 1000 }, !!(opts && opts.touch))
    : await (async () => {
      // a browser's first start on a fresh computer can be slow (Edge on Linux): longer to start, and once more
      const go = () => puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: dir, defaultViewport: { width: 1500, height: 1000 }, protocolTimeout: 600000, timeout: 90000, args: CHROME_ARGS });
      let b;
      try { b = await go(); } catch (e) { if (!/Timed out|WS endpoint/i.test(e.message)) throw e; console.log('  (the browser was slow to start; trying once more)'); b = await go(); }
      return { browser: b, page: await b.newPage() };
    })();
  page.errors = [];
  // a font the tests do not give (see fontsFor) is not an error of the page
  page.on('console', (m) => { if (m.type() === 'error' && !(/Failed to load resource/.test(m.text()) && /cdn\.jsdelivr\.net|raw\.githubusercontent\.com/.test((m.location() || {}).url || ''))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('PAGEERROR ' + e.message));
  page.on('dialog', (d) => d.accept());
  // and no look at the website for a newer version (install.js): the tests stay off the internet
  await page.evaluateOnNewDocument((level) => { try { if (!localStorage.getItem('manuscribe.ui')) localStorage.setItem('manuscribe.ui', JSON.stringify({ level })); localStorage.setItem('manuscribe.lastCheck', String(Date.now())); } catch (e) { /* none */ } }, level);
  await fontsFor(page, opts && opts.fonts === 'none' ? 'none' : !!(opts && opts.fonts));
  // the tests give the fonts themselves: whether this computer is online at the moment does not matter
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true }); } catch (e) { /* as it is */ } });
  // on GitHub's computers, slower than one's own: the speed checks allow for it (MANUSCRIBE_CI), and for the engine
  if (process.env.CI) await page.evaluateOnNewDocument(() => { window.MANUSCRIBE_CI = true; });
  await page.evaluateOnNewDocument((e) => { window.MANUSCRIBE_ENGINE = e; }, ENGINE.ENGINE);
  await page.goto(other ? await appUrl() : fileUrl(path.join(ROOT, 'app', 'index.html')));
  await sleep(700);
  // the storage open before anything is asked of it (a slow computer takes longer than the wait above)
  await page.evaluate(() => Promise.race([window.ME && ME.Store && ME.Store.ready, new Promise((r) => setTimeout(r, 30000))])).catch(() => null);
  // every engine the tests run in has all Manuscribe needs
  const lack = await page.evaluate(() => (window.ME && ME.Install ? ME.Install.missing() : ['the app did not start'])).catch((e) => [e.message]);
  if (lack.length) page.errors.push('this browser lacks: ' + lack.join('; '));
  return { browser, page };
}

// Exports through the one Export dialog: opens it with the button named, picks the format, and exports.
async function exportVia(page, opener, format) {
  await page.evaluate((opener) => { const all = [...document.querySelectorAll(opener)]; all[all.length - 1].click(); }, opener);
  await sleep(400);
  const ok = await page.evaluate((format) => {
    const r = document.querySelector('.modal input[name="xp-format"][value="' + format + '"]');
    if (!r) return false;
    r.click();
    document.querySelector('.modal [data-action="export-go"]').click();
    return true;
  }, format);
  return ok;
}

// Results: check(name, ok, detail) prints one line; done() prints the count and sets the exit code.
function checks(title) {
  let pass = 0, fail = 0;
  console.log('— ' + title + (ENGINE.ENGINE !== 'chrome' ? ' (' + ENGINE.ENGINE + ')' : ''));
  return {
    check(name, ok, detail) {
      if (ok) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 400))); }
    },
    skip(name, why) { console.log('  SKIP ' + name + ' (' + why + ')'); },
    done(page) {
      if (page && page.errors.length) { fail++; console.log('  FAIL page errors :: ' + page.errors.slice(0, 3).join(' | ')); }
      console.log('  ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    },
  };
}

// The owner's package imported through the start screen; null if it is not on this computer.
async function importSample(page) {
  if (!fs.existsSync(SAMPLE)) return null;
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('#btn-open')]);
  await chooser.accept([SAMPLE]);
  await sleep(1500);
  return SAMPLE;
}

// The package's witnesses, unzipped, as project objects: {AK1: project, ...}; null if absent.
function sampleProjects() {
  if (!fs.existsSync(SAMPLE)) return null;
  const out = path.join(WORK, 'sample');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  require('child_process').execFileSync('unzip', ['-q', '-o', SAMPLE, '-d', out]);
  const res = {};
  const dir = path.join(out, 'witnesses');
  for (const s of fs.readdirSync(dir)) res[s] = JSON.parse(fs.readFileSync(path.join(dir, s, 'project.json'), 'utf8'));
  return res;
}

/* The repository as a website, on 127.0.0.1 (port 0: any free one), with /manuscribe/ as on GitHub Pages; over:
   published paths with other contents. -> the server; stop(server) closes it */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
// the repository as a website; over: published paths with other contents (a new version)
function serve(port, over) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/manuscribe\//, '/');
    let rel = u.replace(/^\/+/, '') || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const body = over && over[rel] !== undefined ? Buffer.from(over[rel]) : (() => { const f = path.join(ROOT, rel); return f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null; })();
    if (!body) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
const stop = (s) => new Promise((r) => { s.closeAllConnections && s.closeAllConnections(); s.close(() => r()); });

/* An audit of the screen as it is, for a phone or a tablet: what runs past the right edge (not what scrolls sideways
   by design: a scan, a wide table in its box, a folio), the controls too small for a finger (under 36 px, where the
   pointer is a finger), and interface text under 12 px (not the text of a folio or of a block). allow: selectors of
   elements not to count. -> {W, docW, coarse, over, small, tiny} */
async function audit(page, allow) {
  return page.evaluate((allow) => {
    const skipText = '.folio, .pdf-scroller, .line, .ct-text, .tb-btn, .ap-text, .lw-text, .cv-detail .cv-t, .pf-pop' + (allow && allow.length ? ', ' + allow.join(', ') : '');
    const skipOver = '.pdf-scroller, .ed-scroll, .folio-wrap, .line, canvas, .cv-tools.in-view, .folio' + (allow && allow.length ? ', ' + allow.join(', ') : '');
    const inClosed = (e) => { for (let d = e.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { const sm = d.querySelector(':scope > summary'); if (!d.open && !(sm && sm.contains(e))) return true; } return false; };
    const vis = (e) => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && !inClosed(e); };
    // with a dialog open, the dialog is the screen
    const dialogs = document.querySelectorAll('.modal-backdrop');
    const root = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
    const desc = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.textContent && e.textContent.trim() ? ' “' + e.textContent.trim().slice(0, 16) + '”' : '');
    const W = innerWidth;
    const all = [...root.querySelectorAll('*')].filter(vis);
    const over = all.filter((e) => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.left < W && !e.closest(skipOver); }).map((e) => desc(e) + ' right=' + Math.round(e.getBoundingClientRect().right)).slice(0, 12);
    const coarse = matchMedia('(pointer: coarse)').matches;
    // a tick or a radio counts with its label, which is what the finger lands on
    const box = (e) => { if (!e.matches('input[type=checkbox], input[type=radio]')) return e; const l = e.closest('label'); if (l) return l; const td = e.closest('td, th'); return td && td.querySelectorAll('button, input, select, a, summary').length === 1 ? td : e; };
    const targets = all.filter((e) => e.matches('button, select, input:not([type=hidden]):not([type=range]), a[href], summary, textarea') && !e.closest('.line, .folio' + (allow && allow.length ? ', ' + allow.join(', ') : '')));
    const small = coarse ? targets.filter((e) => { const r = box(e).getBoundingClientRect(); return r.height < 36 || r.width < 36; }).map((e) => { const r = box(e).getBoundingClientRect(); return desc(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height); }).slice(0, 14) : [];
    // (the smallest text 12 px is a rule of the finger too, app.css: a window made narrow on a computer keeps its 11 px)
    const tiny = coarse ? all.filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest(skipText)).filter((e) => { const fs = parseFloat(getComputedStyle(e).fontSize); return fs > 0 && fs < 12; }).map((e) => desc(e) + ' ' + getComputedStyle(e).fontSize).slice(0, 10) : [];
    return { W, docW: document.documentElement.scrollWidth, coarse, over, small, tiny };
  }, allow || []);
}

module.exports = { audit, exportVia, launch, sleep, checks, importSample, sampleProjects, ROOT, WORK, SAMPLE, CHROME, serve, stop, fileUrl, CHROME_ARGS, ENGINE: ENGINE.ENGINE, OTHER: ENGINE.OTHER };
