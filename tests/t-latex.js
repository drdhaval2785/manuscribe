// The LaTeX that Export writes, compiled: a Sanskrit edition (Devanagari, its apparatus, Tiro) and an English one,
// each as it is and for a book, compiled with XeLaTeX (xelatex, or Tectonic, which runs the same XeTeX engine) as
// the README tells the editor to. Each compiles without an error and without a missing character; the pages of the
// edition carry the versions at their foot, and those for a book neither the versions nor the front matter.
// Skipped where neither xelatex nor tectonic is installed (macOS: brew install tectonic).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { launch, checks, WORK } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

const which = (cmd) => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\n')[0].trim() : null; };

(async () => {
  const T = checks('LaTeX, compiled');
  const xelatex = which('xelatex'), tectonic = which('tectonic');
  if (!xelatex && !tectonic) { T.skip('all', 'neither xelatex nor tectonic is installed'); T.done(); return; }
  const compile = (dir) => {
    // three runs, as the README says, so that the line references settle (Tectonic reruns by itself)
    const run = xelatex
      ? () => { let r; for (let k = 0; k < 3; k++) { r = spawnSync(xelatex, ['-interaction=nonstopmode', '-halt-on-error', 'edition.tex'], { cwd: dir, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 }); if (r.status !== 0) break; } return r; }
      : () => spawnSync(tectonic, ['--keep-logs', 'edition.tex'], { cwd: dir, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20 });
    const r = run();
    const log = fs.existsSync(path.join(dir, 'edition.log')) ? fs.readFileSync(path.join(dir, 'edition.log'), 'utf8') : '';
    const pdf = path.join(dir, 'edition.pdf');
    // lines that run off the page (more than 10 pt too wide): a script whose lines TeX could not break
    const overfull = [...log.matchAll(/Overfull \\hbox \(([\d.]+)pt too wide\)/g)].map((m) => +m[1]).filter((w) => w > 10);
    return { ok: r.status === 0 && fs.existsSync(pdf), status: r.status, errors: ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /^(error|!)/.test(l)).slice(0, 3), missing: (log.match(/Missing character/g) || []).length, overfull: overfull.length, widest: Math.max(0, ...overfull), pdf: fs.existsSync(pdf) ? pdf : null };
  };
  const { browser, page } = await launch('latex', { fonts: true });
  try {
    // by default a few that between them try every kind of font and direction; LATEX_LANGS=all for every language
    const langs = process.env.LATEX_LANGS === 'all' ? Object.keys(LANGS) : (process.env.LATEX_LANGS || 'sa,en,grc,ar,ja').split(',');
    for (const code of langs) {
      await buildInPage(page, LANGS[code], make(code, 3, 2, 26, 5), 26);
      const sets = await page.evaluate(async () => {
        const { ed, list } = window.lang;
        await ME.Collate.run(ed, list, 'main', {});
        const built = (await ME.Release.works(ed, list))[0].built;
        const enc = (files) => files.map((f) => ({ name: f.name, b64: typeof f.data === 'string' ? btoa(unescape(encodeURIComponent(f.data))) : btoa(Array.from(f.data, (c) => String.fromCharCode(c)).join('')) }));
        return { V: ME.VERSION, full: enc(await ME.Publish.texFiles(ed, list, built)), book: enc(await ME.Publish.texFiles(ed, list, built, { bare: true })) };
      });
      const out = {};
      for (const kind of ['full', 'book']) {
        const dir = path.join(WORK, 'latex', code + '-' + kind);
        fs.rmSync(dir, { recursive: true, force: true });
        for (const f of sets[kind]) { const p = path.join(dir, f.name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(f.b64, 'base64')); }
        const c = compile(dir);
        // the pages, as text (pdf.js in the page)
        c.pages = c.pdf ? await page.evaluate(async (b64) => {
          const buf = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
          await ME.PdfView.ensureWorker();
          const doc = await pdfjsLib.getDocument({ data: buf }).promise;
          const pages = [];
          for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' '));
          return pages;
        }, fs.readFileSync(c.pdf).toString('base64')) : [];
        out[kind] = c;
      }
      const name = LANGS[code].name;
      T.check(name + ': the LaTeX compiles with ' + (xelatex ? 'xelatex' : 'Tectonic (XeTeX)') + ', with no error, no missing character and no line off the page, as it is and for a book', out.full.ok && out.book.ok && !out.full.missing && !out.book.missing && !out.full.overfull && !out.book.overfull, { full: { status: out.full.status, errors: out.full.errors, missing: out.full.missing, overfull: out.full.overfull, widest: out.full.widest }, book: { status: out.book.status, missing: out.book.missing, overfull: out.book.overfull, widest: out.book.widest } });
      T.check(name + ': every page has the versions at its foot (' + out.full.pages.length + ' pages), and the edition its front matter', out.full.pages.length > 1 && out.full.pages.every((t) => t.includes('Manuscribe ' + sets.V) && /Draft of/.test(t)) && /Conspectus siglorum/.test(out.full.pages[0]), out.full.pages.map((t) => t.slice(-60)));
      T.check(name + ': for a book, no page has the versions, Manuscribe, or the front matter', out.book.pages.length > 0 && out.book.pages.every((t) => !/Manuscribe|Draft of|Conspectus|Editorial principles/.test(t)), out.book.pages.map((t) => t.slice(0, 60)));
    }
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
