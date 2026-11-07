// The downloadable copy (tools/package.mjs, made for each release): one folder with Manuscribe.html to
// double-click, the app, the licence, the guide and a "Start here" sheet, and nothing else; small; and, unzipped,
// it opens and runs.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { launch, sleep, checks, ROOT, WORK, fileUrl } = require('./h');

(async () => {
  const T = checks('The downloadable copy');
  const dir = path.join(WORK, 'package');
  fs.rmSync(dir, { recursive: true, force: true });
  const made = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'package.mjs'), dir], { encoding: 'utf8' });
  const zip = path.join(dir, 'Manuscribe.zip');
  if (made.status !== 0 || !fs.existsSync(zip)) { T.check('the zip is made', false, made.stderr || made.stdout); T.done(); return; }
  // the names in the zip, from its central directory
  const b = fs.readFileSync(zip);
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(end + 10);
  let p = b.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < n; i++) { const len = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), com = b.readUInt16LE(p + 32); names.push(b.toString('utf8', p + 46, p + 46 + len)); p += 46 + len + extra + com; }
  const appFiles = [];
  (function walk(d, r) { for (const x of fs.readdirSync(d)) { if (x.startsWith('.')) continue; const f = path.join(d, x); if (fs.statSync(f).isDirectory()) walk(f, r + x + '/'); else appFiles.push('Manuscribe/app/' + r + x); } })(path.join(ROOT, 'app'), '');
  const top = names.filter((x) => !x.startsWith('Manuscribe/app/')).sort();
  T.check('one folder: Manuscribe.html, the app (every file of it), the licence, the guide and “Start here”, and nothing else', JSON.stringify(top) === JSON.stringify(['Manuscribe/LICENSE', 'Manuscribe/Manuscribe.html', 'Manuscribe/README.md', 'Manuscribe/Start here.txt']) && appFiles.every((f) => names.includes(f)) && names.length === appFiles.length + 4, { top, missing: appFiles.filter((f) => !names.includes(f)), n: names.length });
  const mb = fs.statSync(zip).size / 1048576;
  T.check('it is small: ' + mb.toFixed(2) + ' MB', mb < 2, mb);
  // unzipped, it opens and runs
  const unzip = spawnSync('unzip', ['-q', '-o', zip, '-d', dir], { encoding: 'utf8' });
  if (unzip.error) { T.skip('unzipped, it opens', 'no unzip on this computer'); T.done(); return; }
  const start = fs.readFileSync(path.join(dir, 'Manuscribe', 'Start here.txt'), 'utf8');
  const site = /home: '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', 'js', 'site.js'), 'utf8'))[1];
  T.check('“Start here” says to unzip first, to double-click Manuscribe.html, to keep backups, and where the website is', /Extract All/.test(start) && /double-click Manuscribe\.html/.test(start) && /backup/.test(start) && start.includes(site), start.slice(0, 200));
  const { browser, page } = await launch('package');
  try {
  // Manuscribe.html sends the browser on to app/index.html: what is asked meanwhile may meet the page in between
  await page.goto(fileUrl(path.join(dir, 'Manuscribe', 'Manuscribe.html')), { waitUntil: 'load' });
  const ready = () => page.evaluate(() => !!(window.ME && ME.App && document.getElementById('start-home') && /app\/index\.html$/.test(location.href))).catch(() => false);
  for (let k = 0; k < 60 && !(await ready()); k++) await sleep(150);
  await sleep(300);
  const r = await page.evaluate(() => ({ url: location.href, version: window.ME && ME.VERSION, start: !!document.getElementById('start-home') && !document.getElementById('start-home').hidden }));
  const version = /ME\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', 'js', 'util.js'), 'utf8'))[1];
  T.check('unzipped, Manuscribe.html opens the app, of this version', /\/Manuscribe\/app\/index\.html$/.test(r.url) && r.version === version && r.start, r);
  T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
