// Shared by the tests: a fresh Chrome profile on the app opened from disk, and small helpers for checks.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(os.tmpdir(), 'manuscribe-tests'); // profiles, downloads, screenshots: never in the repo
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// the owner's own package, used where it is present and never copied into the repository
const SAMPLE = process.env.MANUSCRIBE_SAMPLE || path.join(os.homedir(), 'Downloads', 'saroddhara.edition-2.zip');
fs.mkdirSync(WORK, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Fonts come from jsDelivr, as in the app, and the tests keep a copy of each one (WORK/fonts), so that after the
   first run they need no internet. Manuscribe's own Tiro is always to be had; the Noto fonts of other scripts only
   for the tests that ask (noto), and the others see them as not to be had; with noto 'none', no font at all, as on
   a computer that has never been online. */
const FONTS = path.join(WORK, 'fonts');
async function fontsFor(page, noto) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!/^https:\/\/cdn\.jsdelivr\.net\//.test(url)) { req.continue(); return; }
    if (noto === 'none' || (!noto && !/\/tirodevanagarisanskrit\//.test(url))) { req.respond({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' }); return; }
    const file = path.join(FONTS, url.replace(/^https:\/\//, '').replace(/[^\w.-]+/g, '_'));
    let body = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!body) {
      try { const r = await fetch(url); if (r.ok) { body = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(FONTS, { recursive: true }); fs.writeFileSync(file, body); } } catch (e) { /* not to be had */ }
    }
    if (body) req.respond({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/octet-stream', body });
    else req.respond({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
}

// level: how much Manuscribe shows. The tests see everything ('full') unless they ask for the default, 'simple'.
async function launch(name, opts) {
  const level = (opts && opts.level) || 'full';
  const dir = path.join(WORK, 'profile-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: dir, defaultViewport: { width: 1500, height: 1000 }, protocolTimeout: 600000 });
  const page = await browser.newPage();
  page.errors = [];
  // a font the tests do not give (see fontsFor) is not an error of the page
  page.on('console', (m) => { if (m.type() === 'error' && !(/Failed to load resource/.test(m.text()) && /cdn\.jsdelivr\.net/.test((m.location() || {}).url || ''))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('PAGEERROR ' + e.message));
  page.on('dialog', (d) => d.accept());
  // and no look at the website for a newer version (install.js): the tests stay off the internet
  await page.evaluateOnNewDocument((level) => { try { if (!localStorage.getItem('manuscribe.ui')) localStorage.setItem('manuscribe.ui', JSON.stringify({ level })); localStorage.setItem('manuscribe.lastCheck', String(Date.now())); } catch (e) { /* none */ } }, level);
  await fontsFor(page, opts && opts.fonts === 'none' ? 'none' : !!(opts && opts.fonts));
  await page.goto('file://' + ROOT + '/app/index.html');
  await sleep(700);
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
  console.log('— ' + title);
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

module.exports = { exportVia, launch, sleep, checks, importSample, sampleProjects, ROOT, WORK, SAMPLE, CHROME };
