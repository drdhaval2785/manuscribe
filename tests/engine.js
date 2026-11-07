// The tests in other browser engines: MANUSCRIBE_ENGINE=firefox or webkit (Safari's engine) runs them through
// Playwright, behind the same few calls the tests make of Puppeteer in Chrome (h.js launch). What only Chrome has
// (its own PDF writer) is said to be so (EngineOnly), and the tests skip it.
//
//   cd tests && npm install && npx playwright install firefox webkit     (once)
//   MANUSCRIBE_ENGINE=firefox node run.js
const ENGINE = (process.env.MANUSCRIBE_ENGINE || 'chrome').toLowerCase();
const OTHER = ENGINE === 'firefox' || ENGINE === 'webkit';

class EngineOnly extends Error { constructor(what) { super(what + ' is only in Chrome'); this.name = 'EngineOnly'; } }

// a function and its arguments, as Playwright takes one argument only
const call = (fn, args) => ({ f: fn.toString(), a: args });
const run = ({ f, a }) => (0, eval)('(' + f + ')').apply(null, a); // eslint-disable-line no-eval

/* A Playwright page with the calls the tests make, as Puppeteer has them. */
function wrapPage(pw, context) {
  const page = {
    _pw: pw,
    errors: [],
    evaluate: (fn, ...args) => (typeof fn === 'string' ? pw.evaluate(fn) : pw.evaluate(run, call(fn, args))),
    evaluateOnNewDocument: (fn, ...args) => pw.addInitScript({ content: '(' + fn.toString() + ').apply(null, ' + JSON.stringify(args) + ');' }),
    goto: (url, o) => pw.goto(url, { waitUntil: (o && o.waitUntil === 'networkidle0') ? 'networkidle' : (o && o.waitUntil) || 'load', timeout: (o && o.timeout) || 60000 }),
    reload: (o) => pw.reload({ waitUntil: (o && o.waitUntil) || 'load' }),
    setContent: (html, o) => pw.setContent(html, { waitUntil: (o && o.waitUntil) || 'load' }),
    setViewport: (v) => pw.setViewportSize({ width: v.width, height: v.height }),
    click: (sel) => pw.click(sel),
    hover: (sel) => pw.hover(sel),
    $: (sel) => pw.$(sel),
    $$: (sel) => pw.$$(sel),
    screenshot: (o) => pw.screenshot(o),
    waitForNavigation: (o) => pw.waitForNavigation({ waitUntil: (o && o.waitUntil) || 'load', timeout: (o && o.timeout) || 30000 }),
    close: () => pw.close(),
    get keyboard() { return pw.keyboard; },
    get mouse() { return { move: (x, y, o) => pw.mouse.move(x, y, o), down: (o) => pw.mouse.down(o), up: (o) => pw.mouse.up(o), click: (x, y, o) => pw.mouse.click(x, y, o) }; },
    pdf: () => { throw new EngineOnly('Its print-to-PDF'); },
    // the file dialog: accept([paths]) as in Puppeteer
    waitForFileChooser: () => pw.waitForEvent('filechooser').then((c) => ({ accept: (files) => c.setFiles(files) })),
    // downloads: the one thing the tests ask of the DevTools protocol, done as Playwright does it
    createCDPSession: async () => ({
      send: async (method, params) => {
        if (method === 'Browser.setDownloadBehavior') {
          const path = require('path');
          pw.on('download', async (d) => { try { await d.saveAs(path.join(params.downloadPath, d.suggestedFilename())); } catch (e) { /* as Chrome would leave it */ } });
          return {};
        }
        throw new EngineOnly('The DevTools protocol');
      },
    }),
    on: (ev, fn) => {
      if (ev === 'console') pw.on('console', (m) => fn({ type: () => (m.type() === 'warning' ? 'warn' : m.type()), text: () => m.text(), location: () => m.location() }));
      else if (ev === 'pageerror') pw.on('pageerror', fn);
      else if (ev === 'dialog') pw.on('dialog', fn);
      else pw.on(ev, fn);
      return page;
    },
    // fonts from the tests' copies (h.js fontsFor), through Playwright's routes
    route: (pattern, handler) => pw.route(pattern, handler),
  };
  return page;
}

/* -> {browser, page} as Puppeteer's: browser.newPage, browser.close, browser.once('targetcreated') */
async function launchOther(dir, viewport) {
  const { firefox, webkit } = require('playwright');
  const type = ENGINE === 'firefox' ? firefox : webkit;
  const context = await type.launchPersistentContext(dir, { headless: true, viewport, serviceWorkers: 'block', acceptDownloads: true });
  const first = context.pages()[0] || (await context.newPage());
  const browser = {
    _context: context,
    newPage: async () => wrapPage(await context.newPage(), context),
    close: () => context.close(),
    once: (ev, fn) => { if (ev === 'targetcreated') context.once('page', (p) => fn({ page: async () => wrapPage(p, context) })); },
  };
  return { browser, page: wrapPage(first, context) };
}

module.exports = { ENGINE, OTHER, EngineOnly, launchOther };
