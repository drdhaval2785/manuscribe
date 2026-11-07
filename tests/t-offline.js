// Manuscribe from its website, as an app: served here from a small local web server, it keeps every file of itself
// in the browser and opens with the server gone; a new version on the server is offered with a Reload, which brings
// it in; the browser's offer to install becomes a button; and a downloaded copy, opened from a file, learns of a
// newer version. The list of files the app keeps is up to date (tools/precache.mjs).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const { launch, sleep, checks, ROOT, WORK, CHROME, serve, stop } = require('./h');

(async () => {
  const T = checks('Manuscribe from its website, as an app');
  const pre = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'precache.mjs'), '--check'], { encoding: 'utf8' });
  T.check('the list of files the app keeps offline is up to date (node tools/precache.mjs)', pre.status === 0, pre.stdout.trim());

  let server = await serve(0);
  const port = server.address().port;
  const url = 'http://127.0.0.1:' + port + '/manuscribe/app/index.html';
  const dir = path.join(WORK, 'profile-offline');
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: dir, defaultViewport: { width: 1300, height: 900 } });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  const kept = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let k = 0; k < 100; k++) { const keys = await caches.keys(); if (keys.length) { const c = await caches.open(keys[0]); const n = (await c.keys()).length; if (n > 60) return { keys, n }; } await new Promise((r) => setTimeout(r, 100)); }
    return { keys: await caches.keys(), n: 0 };
  });
  const sw = fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8');
  const listed = (sw.match(/^ {2}["'][^"']+["'],$/gm) || []).length;
  T.check('opened from the website, the app keeps every file of itself in the browser (' + kept.n + ' files)', kept.n === listed && kept.keys.length === 1 && /^manuscribe-0\./.test(kept.keys[0]), { kept, listed });
  const man = await page.evaluate(async () => {
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    const sizes = await Promise.all(m.icons.map((i) => new Promise((r) => { const im = new Image(); im.onload = () => r(im.naturalWidth + 'x' + im.naturalHeight + ':' + i.sizes); im.onerror = () => r('missing ' + i.src); im.src = new URL(i.src, document.querySelector('link[rel=manifest]').href); })));
    return { name: m.name, display: m.display, start: m.start_url, sizes };
  });
  T.check('it can be installed: a manifest with its name, its own window and icons of the sizes it says', man.name === 'Manuscribe' && man.display === 'standalone' && man.sizes.every((s) => { const [a, b] = s.split(':'); return a === b; }), man);

  // the server gone: the app still opens, in this tab and in a new one
  await stop(server);
  await page.reload({ waitUntil: 'load' });
  await sleep(800);
  const off = await page.evaluate(() => ({ app: !!(window.ME && ME.App && ME.Collate), start: !document.getElementById('start-home').hidden, controlled: !!navigator.serviceWorker.controller }));
  const p2 = await browser.newPage();
  await p2.goto(url, { waitUntil: 'load' }).catch(() => null);
  await sleep(800);
  const off2 = await p2.evaluate(() => !!(window.ME && ME.App)).catch(() => false);
  await p2.close();
  T.check('without the internet it opens as before, in an open tab and in a new one', off.app && off.start && off.controlled && off2 && !errors.length, { off, off2, errors });

  // a new version on the website: offered, and brought in by Reload
  const next = sw.replace(/const VERSION = "[^"]*";/, 'const VERSION = "9.9.9-test";');
  server = await serve(port, { 'app/sw.js': next });
  await page.evaluate(() => ME.Install.registration.update());
  for (let k = 0; k < 60 && !(await page.$('#update-bar button.primary')); k++) await sleep(100);
  const offered = await page.evaluate(() => { const b = document.getElementById('update-bar'); return b ? b.textContent : ''; });
  T.check('a new version on the website is fetched quietly and offered: “A new version of Manuscribe is ready. Reload”', /new version of Manuscribe is ready/.test(offered), offered);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), page.click('#update-bar button.primary')]);
  await sleep(800);
  const after = await page.evaluate(async () => ({ keys: await caches.keys(), bar: !!document.getElementById('update-bar'), app: !!(window.ME && ME.App) }));
  T.check('Reload brings it in: the new version runs, and the old copy is cleared away', after.app && !after.bar && after.keys.length === 1 && after.keys[0] === 'manuscribe-9.9.9-test', after);

  // the browser's offer to install becomes a button on the start screen
  const inst = await page.evaluate(async () => {
    let prompted = false;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
    const b = document.querySelector('#install-row [data-action="install"]');
    const shown = !!b && !document.getElementById('install-row').hidden;
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 50));
    return { shown, prompted, gone: !document.querySelector('#install-row [data-action="install"]') };
  });
  T.check('where the browser can install it, the start screen has an Install button, which asks the browser', inst.shown && inst.prompted && inst.gone, inst);
  await browser.close();

  // a copy opened from a file looks for a newer version on the website
  const { browser: b2, page: fp } = await launch('offline-copy');
  await stop(server);
  server = await serve(port, { 'app/version.json': JSON.stringify({ version: '9.9.9' }) });
  const copy = await fp.evaluate(async (home) => {
    ME.SITE.home = home;
    const v = await ME.Install.checkCopy(true);
    const bar = document.getElementById('update-bar');
    const a = bar && bar.querySelector('a');
    return { v, text: bar ? bar.textContent : '', href: a ? a.href : '', ownVersion: ME.VERSION };
  }, 'http://127.0.0.1:' + port + '/manuscribe/');
  T.check('a copy opened from a file learns of a newer version, and is offered the download', copy.v === '9.9.9' && /Manuscribe 9\.9\.9 is out/.test(copy.text) && /releases\/latest\/download\/Manuscribe\.zip$/.test(copy.href), copy);
  // (a website not to be reached is a failed request, not an error of the page)
  fp.errors.length = 0;
  const same = await fp.evaluate(async () => { document.getElementById('update-bar').remove(); ME.SITE.home = 'http://127.0.0.1:1/'; const v = await ME.Install.checkCopy(true); return { v, bar: !!document.getElementById('update-bar') }; });
  T.check('and says nothing when the website cannot be reached', same.v === null && !same.bar, same);
  fp.errors = fp.errors.filter((e) => !/Failed to load resource/.test(e));
  T.done(fp);
  await b2.close();
  await stop(server);
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
