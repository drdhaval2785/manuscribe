// The memory recognition takes, in WebKit (Safari's engine) on macOS: a side of linear.pdf read again and again
// through Manuscribe's own path (RecogView.run), and after each the footprint macOS charges the test browser's web
// content process (the page and its workers) and its GPU process, which is what Safari goes by when it reloads a page
// "using significant memory". Not in the suite (run.js runs t-*.js): run it by hand after a change to recognition.
//
//   MANUSCRIBE_ENGINE=webkit node mem-recognise.js [sides=12] [label]
//     BACKEND=wasm                    the models on WebAssembly only
//     SESSION_OPTS='{"...": ...}'     ONNX Runtime session options for the worker; "closeAfter": true closes the
//                                     worker after each side (in WebKit that leaks its WebGPU memory: see recogview.js)
// Site: MANUSCRIBE_RECOG_SITE, or ../../lexicon_manuscripts/manuscribe-models.
const T = __dirname;
process.chdir(T);
const fs = require('fs'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const { launch, sleep, ROOT } = require('./h');
const SITE = process.env.MANUSCRIBE_RECOG_SITE || path.resolve(T, '..', '..', '..', 'lexicon_manuscripts', 'manuscribe-models');
const RUNS = +(process.argv[2] || 12), LABEL = process.argv[3] || '', BACKEND = process.env.BACKEND || 'auto', OPTS = process.env.SESSION_OPTS ? JSON.parse(process.env.SESSION_OPTS) : null;
// the footprint macOS charges each of the test browser's processes (what Safari goes by), MB: the web content process
// (the page and its workers, and the GPU memory it is charged for) and the GPU process
function rss() {
  const rows = execSync('ps -axo pid,command').toString().split('\n').filter((l) => /ms-playwright\/webkit/i.test(l));
  const fp = (re) => rows.filter((l) => re.test(l)).map((l) => {
    const out = execSync('footprint -p ' + l.trim().split(/\s+/)[0] + ' 2>/dev/null || true').toString();
    const m = /Footprint: ([\d.]+) (KB|MB|GB)/.exec(out);
    return m ? +m[1] * ({ KB: 1 / 1024, MB: 1, GB: 1024 })[m[2]] : 0;
  });
  const web = Math.max(0, ...fp(/WebContent/)), gpu = Math.max(0, ...fp(/\.GPU|GPUProcess/));
  rss.gpu = Math.round(gpu);
  return Math.round(web);
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''), f = path.join(SITE, rel);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
  res.writeHead(200, { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'access-control-allow-origin': '*' });
  res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const { browser, page } = await launch('memtest');
  try {
    await page.evaluate(async (url, backend, opts) => {
      await ME.RecogPack.install(url); ME.RecogPack.savePrefs({ backend });
      window.CLOSE_AFTER = !!(opts && opts.closeAfter); if (opts) delete opts.closeAfter;
      if (opts && Object.keys(opts).length) { const load = ME.RecogPack.load; ME.RecogPack.load = async () => Object.assign(await load(), { sessionOptions: opts }); }
    }, url, BACKEND, OPTS);
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const p = ME.Model.newProject({ meta: { title: 'Mem' }, layoutType: 'linear', lines: { main: 8 }, folios: {}, pdf: { name: 'linear.pdf', bytes: bytes.length } });
      const info = await ME.PdfView.load(blob);
      p.pdf.pages = info.pages; p.pdf.size = { width: info.width, height: info.height };
      await ME.Store.putProject(p); await ME.Store.putPdf(p.id, blob); await ME.App.open(p.id);
    }, fs.readFileSync(path.join(ROOT, 'linear.pdf')).toString('base64'));
    for (let k = 0; k < 40 && !(await page.evaluate(() => !!document.querySelector('.pdf-stage canvas'))); k++) await sleep(200);
    await sleep(1000);
    const base = rss();
    console.log(`${LABEL} before: web ${base} MB, gpu ${rss.gpu} MB`);
    const seen = [];
    for (let k = 1; k <= RUNS; k++) {
      const t0 = Date.now();
      const r = await page.evaluate(async () => {
        const p = ME.App.project, e = ME.App.entries[ME.App.idx];
        p.pages[e.label] = { boxes: {} };
        const t = await ME.RecogView.run(p, [e], { space: true });
        if (window.CLOSE_AFTER) ME.RecogView.stop();
        return { placed: t.placed, error: t.error, backends: t.times[0] && t.times[0].backends };
      });
      await sleep(300);
      const m = rss();
      seen.push(m);
      console.log(`${LABEL} side ${String(k).padStart(2)}: web ${m} MB (+${m - base}), gpu ${rss.gpu} MB, ${Date.now() - t0} ms placed ${r.placed}${r.error ? ' ERROR ' + r.error : ''}${k === 1 ? ' ' + JSON.stringify(r.backends) : ''}`);
    }
    const tail = seen.slice(-4);
    console.log(`${LABEL} growth from side 2 to ${RUNS}: ${seen[seen.length - 1] - seen[1]} MB, ${((seen[seen.length - 1] - seen[1]) / Math.max(1, RUNS - 2)).toFixed(1)} MB a side`);
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.log('crashed', e.stack); process.exit(1); });
