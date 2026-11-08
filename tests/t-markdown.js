// Markdown, from Export. An edition: the front matter (title, citation with the versions, the conspectus as a table,
// the principles), the edited text, and each note of the apparatus a footnote at its lemma, as many as the print
// edition has; the versions at the end; for a book, only the text and its footnotes. A transcription: each folio side
// with its numbered lines, deletions struck, additions marked. Each is rendered here by markdown-it with its footnote
// plugin, as GitHub, Obsidian and Pandoc read Markdown, and checked as rendered.
const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');
const { launch, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

const md = new MarkdownIt({ html: true }).use(footnote);
const render = (s) => { const html = md.render(s); const d = { html, count: (re) => (html.match(re) || []).length }; return d; };

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
        tr: ME.Markdown.transcription(p),
        file: (await X.format('markdown').make({ kind: 'edition', ed, list, workId: 'main' })).name,
        bookFile: (await X.format('markdown').make({ kind: 'edition', ed, list, workId: 'main', bare: true })).name,
        offered: { edition: X.available({ kind: 'edition', ed, list }).some((f) => f.id === 'markdown'), project: X.available({ kind: 'project', project: p }).some((f) => f.id === 'markdown-tr'), kind: kinds.includes('markdown'), book: X.BOOK.has('markdown') },
      };
    });
    const full = render(r.full);
    T.check('an edition in Markdown has its front matter: the title, the citation with both versions, the conspectus as a table (' + r.witnesses + ' rows), the principles', /^<h1>/.test(full.html) && full.html.includes('Made with Manuscribe ' + r.V) && full.count(/<tr>/g) === r.witnesses + 1 && /<h2>Editorial principles<\/h2>/.test(full.html), full.html.slice(0, 300));
    const refs = full.count(/class="footnote-ref"/g), items = full.count(/class="footnote-item"/g);
    T.check('each note of the apparatus is a footnote at its lemma, as many as in the print edition (' + r.notes + '), each with its note', refs === r.notes && items === r.notes && !/\[\^/.test(full.html.replace(/<[^>]+>/g, '')), { refs, items, notes: r.notes });
    T.check('the lemma’s “]” of a note stays as it is, and the versions close the file', r.full.split('\n').some((l) => /^\[\^[^\]]+\]: \S.* \] \S/.test(l)) && !/\\\]/.test(r.full) && /\*Draft of [^*]+ · Manuscribe [\d.]+\*\s*$/.test(r.full), r.full.slice(-120));
    const book = render(r.book);
    T.check('for a book: only the text and its footnotes, no heading, no versions, no Manuscribe', !/<h[12]>/.test(book.html) && !/Manuscribe|Conspectus|[Dd]raft of/.test(book.html) && book.count(/class="footnote-ref"/g) === r.notes, book.html.slice(0, 200));
    const tr = render(r.tr);
    T.check('a transcription in Markdown: each folio side with its numbered lines, a deletion struck, an addition and a gap marked, text that looks like Markdown kept as text', /<h2>Folio 1r<\/h2>/.test(tr.html) && /<ol>/.test(tr.html) && /<s>द्वे<\/s>/.test(tr.html) && tr.html.includes('⟨त्रीणि⟩') && tr.html.includes('[…]') && tr.html.includes('1. *not* a list') && tr.html.includes('Manuscribe ' + r.V), tr.html);
    T.check('Export offers Markdown for an edition (also for a book) and for a transcription, named .md and .book.md', r.offered.edition && r.offered.project && r.offered.kind && r.offered.book && /\.md$/.test(r.file) && /\.book\.md$/.test(r.bookFile) && !/\.book/.test(r.file), { offered: r.offered, file: r.file, bookFile: r.bookFile });
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
