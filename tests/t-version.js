// The versions, everywhere: the edition's version (a draft and its date, or a version issued) and Manuscribe's are
// at the foot of every printed page (the print page, the PDF made from it, LaTeX) and in every other file (the text,
// the TEI, the reader, a transcription's TEI and page), and on the screen. And for a book: only the text and its
// apparatus, without the front page, the running head and the versions, chosen in Export.
const { launch, sleep, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

(async () => {
  const T = checks('Versions, and a copy for a book');
  const { browser, page } = await launch('version');
  try {
    await buildInPage(page, LANGS.sa, make('sa', 3, 2, 26, 5), 26);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      const V = ME.VERSION, P = ME.Publish;
      // the print page, laid out
      const layout = async (opts) => {
        const html = ME.PrintHTML.html(ed, list, built, opts);
        const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-9999px;width:1200px;height:900px';
        document.body.appendChild(fr);
        await new Promise((res) => { fr.onload = res; fr.srcdoc = html.replace('if (D.autoPrint)', 'if (false)'); });
        for (let k = 0; k < 200 && !fr.contentWindow.__paginated; k++) await new Promise((res) => setTimeout(res, 50));
        const d = fr.contentDocument;
        const pages = [...d.querySelectorAll('.page')];
        const out = { pages: pages.length, versions: pages.map((p) => (p.querySelector('.versions') || {}).textContent || ''), title: !!d.querySelector('h1.title'), consp: !!d.querySelector('.consp'), heads: d.querySelectorAll('.rh').length, notes: d.querySelectorAll('.foot .note').length, text: d.querySelectorAll('.txt').length };
        fr.remove();
        return out;
      };
      const full = await layout({});
      const book = await layout({ bare: true });
      // the PDF, as text
      const pdfText = async (opts) => {
        const c = await ME.Capture.pdf(ed, list, built, opts);
        const buf = new Uint8Array(await c.blob.arrayBuffer());
        await ME.PdfView.ensureWorker();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        // (pdf.js gives the spaces as pieces of their own)
        for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' '));
        return pages;
      };
      const pdf = await pdfText({});
      const pdfBook = await pdfText({ bare: true });
      // LaTeX, text, TEI, reader
      const tex = P.tex(ed, list, built), texBook = P.tex(ed, list, built, { bare: true });
      const text = ME.Apparatus.text(ed, built), textBook = ME.Apparatus.text(ed, built, { bare: true });
      const tei = ME.Apparatus.tei(ed, built, (await ME.Release.works(ed, list))[0].work);
      const teiDoc = new DOMParser().parseFromString(tei, 'application/xml');
      const reader = await P.reader(ed, list, built, null);
      // a version issued
      const was = { version: ed.version, issued: ed.issued };
      ed.version = '1.0'; ed.issued = { version: '1.0', date: '2026-11-08' };
      const issued = P.versions(ed);
      ed.version = was.version; ed.issued = was.issued;
      // the Export formats for a book, by their file names
      const X = ME.ExportView;
      const ctx = { kind: 'edition', ed, list, workId: 'main', bare: true };
      const named = { print: (await X.format('print-page').make(ctx)).name, text: (await X.format('text').make(ctx)).name, latex: (await X.format('latex').make(ctx)).name };
      return {
        V, draft: P.versions(ed), issued, full, book,
        pdf: { pages: pdf.length, every: pdf.every((t) => t.includes('Manuscribe ' + V) && /draft of/i.test(t)), front: /Conspectus siglorum/.test(pdf.join(' ')) },
        pdfBook: { pages: pdfBook.length, none: !pdfBook.some((t) => /Manuscribe|draft of|Conspectus|edited by/.test(t)) },
        tex: { foot: tex.includes('\\@oddfoot') && tex.includes('Manuscribe ' + V), front: /\\section\*\{Conspectus siglorum\}/.test(tex) },
        texBook: { foot: texBook.includes('\\@oddfoot'), front: /Conspectus|\\section\*\{Text\}|Made with Manuscribe/.test(texBook.split('\\begin{document}')[1]), numbered: texBook.includes('\\beginnumbering') },
        text: text.split('\n')[0].includes('Made with Manuscribe ' + V), textBook: !/Manuscribe/.test(textBook) && textBook.trim().length > 50,
        tei: { ok: !teiDoc.querySelector('parsererror'), edition: (teiDoc.querySelector('editionStmt edition') || {}).textContent || '', app: (teiDoc.querySelector('appInfo application') || { getAttribute: () => '' }).getAttribute('version') },
        reader: { gen: (reader.match(/<meta name="generator" content="([^"]+)"/) || [])[1], cite: reader.includes('Made with Manuscribe ' + V) },
        named,
      };
    });
    T.check('the versions read as they should: “Draft of …” or “Version 1.0, issued 8 November 2026”, with Manuscribe’s', /^Draft of \d+ \w+ \d{4} · Manuscribe /.test(r.draft) && r.issued === 'Version 1.0, issued 8 November 2026 · Manuscribe ' + r.V, { draft: r.draft, issued: r.issued });
    T.check('every page of the print page has them at its foot (' + r.full.pages + ' pages), after a front page', r.full.pages > 2 && r.full.versions.every((v) => v === r.draft) && r.full.title && r.full.consp && r.full.heads > 0, r.full);
    T.check('so does every page of the PDF made from it', r.pdf.pages > 2 && r.pdf.every && r.pdf.front, r.pdf);
    T.check('for a book: the print page has only the text and its notes; no front page, no running head, no versions', !r.book.title && !r.book.consp && r.book.heads === 0 && r.book.versions.every((v) => !v) && r.book.notes > 0 && r.book.text > 0 && r.book.pages < r.full.pages, r.book);
    T.check('and so has the PDF for a book: not a word of Manuscribe, the draft, the conspectus or the editor', r.pdfBook.pages > 0 && r.pdfBook.none, r.pdfBook);
    T.check('LaTeX: the versions at the foot of every page; for a book, neither they nor the front matter, the text still numbered', r.tex.foot && r.tex.front && !r.texBook.foot && !r.texBook.front && r.texBook.numbered, { tex: r.tex, texBook: r.texBook });
    T.check('the text begins with the citation and its versions; for a book, it has neither', r.text && r.textBook, { text: r.text, textBook: r.textBook });
    T.check('the TEI names the edition’s version and Manuscribe’s (editionStmt, appInfo), and is well-formed', r.tei.ok && /draft of/i.test(r.tei.edition) && r.tei.app === r.V, r.tei);
    T.check('the reader says which Manuscribe made it, and has the citation with the versions', r.reader.gen === 'Manuscribe ' + r.V && r.reader.cite, r.reader);
    T.check('a copy for a book is named so: .book.print.html, .book.apparatus.txt, .book.latex.zip', /\.book\.print\.html$/.test(r.named.print) && /\.book\.apparatus\.txt$/.test(r.named.text) && /\.book\.latex\.zip$/.test(r.named.latex), r.named);

    // a transcription's TEI and page
    const tr = await page.evaluate(async () => {
      const p = ME.Model.newProject({ meta: { title: 'Codex', siglum: 'K' }, layoutType: 'linear', lines: { main: 3 }, folios: {} });
      p.pdf = { name: 'x.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: ['एकम्', 'द्वे', ''] } } };
      const xml = ME.Export.build(p, {});
      const tei = typeof xml === 'string' ? xml : (xml && (xml.xml || xml.text)) || '';
      const html = await ME.Export.html(p, {});
      const h = typeof html === 'string' ? html : (html && html.html) || '';
      return { app: /<application ident="Manuscribe" version="([^"]+)"/.exec(tei), foot: /<footer class="made">[^<]*Made with Manuscribe ([\d.]+)/.exec(h) };
    });
    T.check('a transcription’s TEI names Manuscribe’s version (appInfo), and its HTML page says it at the foot', tr.app && tr.app[1] === r.V && tr.foot && tr.foot[1] === r.V, tr);

    // the screen, and the Export dialog
    const ui = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      ME.App.showStart(); await new Promise((res) => setTimeout(res, 200));
      const start = (document.querySelector('.start-ver') || {}).textContent;
      const bar = (document.querySelector('.brand-ver') || {}).textContent;
      await ME.Edition.show(ed.id); await new Promise((res) => setTimeout(res, 400));
      const edv = (document.querySelector('[data-action="edition-version"]') || {}).textContent || '';
      ME.ExportView.open({ kind: 'edition', ed, list, workId: 'main' });
      await new Promise((res) => setTimeout(res, 300));
      const row = document.querySelector('.xp-book');
      const pick = (kind) => { document.querySelector('input[name="xp-kind"][value="' + kind + '"]').click(); return !row.hidden; };
      const shown = { pdf: pick('pdf'), html: pick('html'), latex: pick('latex'), tei: pick('tei'), text: pick('text'), archive: pick('archive') };
      document.querySelector('.modal-foot .btn').click();
      return { start, bar, edv, shown };
    });
    T.check('the screen shows Manuscribe’s version (start screen, top bar), and the edition’s under its title', ui.start === r.V && ui.bar === r.V && ui.edv === r.draft, ui);
    T.check('Export offers “For a book” for what is printed (PDF, LaTeX, text, the print page), not for TEI or an archive', ui.shown.pdf && ui.shown.latex && ui.shown.text && !ui.shown.tei && !ui.shown.archive, ui.shown);
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
