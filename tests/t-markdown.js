// Markdown, from Export. An edition: the front matter (title, citation with the versions, the conspectus as a table,
// the principles), the edited text, and each note of the apparatus a footnote at its lemma, as many as the print
// edition has; the versions at the end; for a book, only the text and its notes. A transcription: each folio side
// with its numbered lines, deletions struck, additions marked. Each is rendered here by markdown-it alone, as a viewer
// that knows no footnotes reads it, and the footnote form with its plugin, as Pandoc would; and checked as rendered.
const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');
const { launch, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

const withFootnotes = new MarkdownIt({ html: true }).use(footnote), plain = new MarkdownIt({ html: true });
const shown = (md, s) => { const html = md.render(s); return { html, count: (re) => (html.match(re) || []).length }; };
const render = (s) => shown(plain, s), renderNative = (s) => shown(withFootnotes, s);

(async () => {
  const T = checks('Markdown');
  const { browser, page } = await launch('markdown');
  try {
    await buildInPage(page, LANGS.sa, make('sa', 3, 2, 26, 5), 26);
    const r = await page.evaluate(async () => {
      const { ed, list } = window.lang;
      await ME.Collate.run(ed, list, 'main', {});
      const built = (await ME.Release.works(ed, list))[0].built;
      // the notes the print edition has, to count against
      const D = ME.PrintHTML.data(ed, list, built);
      const notes = D.blocks.reduce((a, b) => a + b.notes.length, 0);
      const witnesses = ed.witnesses.length;
      // a transcription with a deletion, an addition and a gap
      const p = ME.Model.newProject({ meta: { title: 'Codex', siglum: 'K', repository: 'Bibliotheca' }, layoutType: 'linear', lines: { main: 3 }, folios: {} });
      p.pdf = { name: 'x.pdf', pages: 1 };
      p.pages = { '1r': { boxes: { main: ['एकम् <del rend="crossed out">द्वे</del> <add place="above">त्रीणि</add>', 'चत्वारि <gap reason="illegible" quantity="2" unit="akshara"/> पञ्च', '1. *not* a list'] } } };
      const X = ME.ExportView;
      const kinds = Object.keys(X.KINDS);
      return {
        V: ME.VERSION, notes, witnesses,
        full: ME.Markdown.edition(ed, list, built), book: ME.Markdown.edition(ed, list, built, { bare: true }),
        native: ME.Markdown.edition(ed, list, built, { notes: 'footnotes' }), nativeBook: ME.Markdown.edition(ed, list, built, { bare: true, notes: 'footnotes' }),
        layered: (() => {
          // a commentary's block, as the print page gives it, its abbreviation already first; and a note with nothing to say
          const data = ME.PrintHTML.data;
          ME.PrintHTML.data = () => ({ title: 'T', citation: 'C', conspectus: [], principles: [], versions: '', blocks: [{ id: 'c2.1-1', depth: 1, abbr: 'चा', html: '<span class="labl" title="x">[चा]</span> स्वर्ग<span class="an" data-k="1"></span> इति<span class="an" data-k="2"></span>', notes: [{ k: 1, by: { A: 'स्वर्ग ] A' } }, { k: 2, by: {} }] }] });
          try { return { links: ME.Markdown.edition(ed, list, []), footnotes: ME.Markdown.edition(ed, list, [], { notes: 'footnotes' }) }; } finally { ME.PrintHTML.data = data; }
        })(),
        tr: ME.Markdown.transcription(p),
        file: (await X.format('markdown').make({ kind: 'edition', ed, list, workId: 'main' })).name,
        bookFile: (await X.format('markdown').make({ kind: 'edition', ed, list, workId: 'main', bare: true })).name,
        offered: { edition: X.available({ kind: 'edition', ed, list }).some((f) => f.id === 'markdown'), project: X.available({ kind: 'project', project: p }).some((f) => f.id === 'markdown-tr'), kind: kinds.includes('markdown'), book: X.BOOK.has('markdown') },
      };
    });
    const full = render(r.full);
    T.check('an edition in Markdown has its front matter: the title, the citation with both versions, the conspectus as a table (' + r.witnesses + ' rows), the principles', /^<h1>/.test(full.html) && full.html.includes('Made with Manuscribe ' + r.V) && full.count(/<tr>/g) === r.witnesses + 1 && /<h2>Editorial principles<\/h2>/.test(full.html), full.html.slice(0, 300));
    const refs = full.count(/<sup><a id="r\d+" href="#n\d+">\d+<\/a><\/sup>/g), items = full.count(/<a id="n\d+"><\/a><sup><a href="#r\d+">\d+<\/a><\/sup>/g);
    T.check('in a viewer that knows no footnotes, each note is a superscript at its lemma, as many as in the print edition (' + r.notes + '), and no [^ shows', refs === r.notes && items === r.notes && !/\[\^/.test(full.html.replace(/<[^>]+>/g, '')), { refs, items, notes: r.notes });
    const targets = new Set([...full.html.matchAll(/ id="([rn]\d+)"/g)].map((m) => m[1])), hrefs = [...full.html.matchAll(/href="#([rn]\d+)"/g)].map((m) => m[1]);
    T.check('every link has its target, to the note and back', hrefs.length === 2 * r.notes && hrefs.every((h) => targets.has(h)), hrefs.filter((h) => !targets.has(h)).slice(0, 5));
    T.check('the lemma’s “]” of a note stays as it is, and the versions close the file', r.full.split('\n').some((l) => /^<a id="n\d+"><\/a>.* \] \S/.test(l)) && !/\\\]/.test(r.full) && /\*Draft of [^*]+ · Manuscribe [\d.]+\*\s*$/.test(r.full), r.full.slice(-120));
    const book = render(r.book);
    T.check('for a book: only the text and its notes, no heading, no versions, no Manuscribe', !/<h[12]>/.test(book.html) && !/Manuscribe|Conspectus|[Dd]raft of/.test(book.html) && book.count(/<sup><a id="r/g) === r.notes, book.html.slice(0, 200));
    const nat = renderNative(r.native), natBook = renderNative(r.nativeBook);
    T.check('as Markdown footnotes, for Pandoc: each a footnote at its lemma', nat.count(/class="footnote-ref"/g) === r.notes && nat.count(/class="footnote-item"/g) === r.notes && natBook.count(/class="footnote-ref"/g) === r.notes && !/\[\^/.test(nat.html.replace(/<[^>]+>/g, '')), nat.count(/class="footnote-ref"/g));
    const lay = render(r.layered.links), layF = renderNative(r.layered.footnotes);
    T.check('a commentary has its [abbreviation] once, in bold', (lay.html.match(/\[चा\]/g) || []).length === 1 && /<strong>\[चा\]<\/strong> स्वर्ग/.test(lay.html) && (layF.html.match(/\[चा\]/g) || []).length === 1, lay.html);
    T.check('a note with nothing in it leaves no marker', lay.count(/<sup><a id="r/g) === 1 && layF.count(/class="footnote-ref"/g) === 1 && !/\[\^/.test(layF.html.replace(/<[^>]+>/g, '')), lay.html);
    const tr = render(r.tr);
    T.check('a transcription in Markdown: each folio side with its numbered lines, a deletion struck, an addition and a gap marked, text that looks like Markdown kept as text', /<h2>Folio 1r<\/h2>/.test(tr.html) && /<ol>/.test(tr.html) && /<s>द्वे<\/s>/.test(tr.html) && tr.html.includes('⟨त्रीणि⟩') && tr.html.includes('[…]') && tr.html.includes('1. *not* a list') && tr.html.includes('Manuscribe ' + r.V), tr.html);
    T.check('Export offers Markdown for an edition (also for a book) and for a transcription, named .md and .book.md', r.offered.edition && r.offered.project && r.offered.kind && r.offered.book && /\.md$/.test(r.file) && /\.book\.md$/.test(r.bookFile) && !/\.book/.test(r.file), { offered: r.offered, file: r.file, bookFile: r.bookFile });
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
