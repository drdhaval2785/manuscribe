# Tests

Browser tests: each opens Manuscribe from disk in a fresh Chrome profile and checks what the phases of the
roadmap promise.

```
cd tests
PUPPETEER_SKIP_DOWNLOAD=1 npm install    # once: puppeteer-core, which drives the Chrome you have
node run.js                              # every test file
node run.js stemma collate               # only those whose names contain these words
```

Each check is shown as it runs, with a running count after each file and a line every 20 seconds while a file is
still at work. A file that runs longer than 5 minutes (`MANUSCRIBE_TEST_LIMIT`, in seconds) is stopped and counted
as failed, with the line it stopped at; one that crashes is ended at once. The tests see every tool (the Full level),
apart from `t-features.js`, which starts at the default.

| File | What it checks |
|---|---|
| `t-xml.js` | XML out and back in gives the same text in all four layouts; folio and page numbering |
| `t-normalize.js` | Tokens map back to their lines; before- and after-correction layers; the rules and their published examples |
| `t-collate.js` | Editing operations and undo; on the sample, tokens back to their lines, identical re-runs, exchange formats, and locks that survive random edits |
| `t-apparatus.js` | The proposal by majority and trust; faulty entries caught; decisions never moved silently; witnesses read back from the TEI |
| `t-stemma.js` | Trees, copies and the archetype on a tradition with a known stemma; lacunae never agree; NEXUS; timings |
| `t-metre.js` | Metres recognised in known verses, among them an ardhasama and an āryā; every metre of the list from a verse made to its pattern; seeded faults flagged; no run of words of a prose passage taken for verse |
| `t-layers.js` | Tripāṭha and pañcapāṭha give the same text; links in every DHARMA case; recorded evidence only, silence never support; metre per reading; concordance, packs and indices; the reader beside its base text |
| `t-features.js` | At the Simple level, in a fresh browser: what is hidden and shown; the South Asian pack by language and by hand; one tool on its own; the level remembered; the edition package the same whatever is shown |
| `t-exchange.js` | Two editors in two browsers: packages compared three ways and merged, a seeded conflict settled, nothing lost; sending and fetching through a stand-in for GitHub (`mock-github.js`), behind refused, PDFs never sent; a version issued, its outputs carrying version and date |
| `t-assists.js` | PAGE-XML, ALTO and text read; proposed lines never over typed ones and not collated until accepted; error rate; the memorisation test tells a source that reads from one that remembers; the shortcut; NeighborNet gives back a tree and draws 50 witnesses without crossings; coherence; DTS files of version 1.0 |
| `t-pdf.js` | The PDF typeset in the browser: valid and read back by pdf.js, every glyph in the font, every note on the page of its line over many pages, text searchable, the button; and the owner's package |
| `t-print.js` | Arabic, Japanese, English and Sanskrit editions from witnesses to print: letters compared as written; the print page laid out with every note on the page of its marker, Arabic right to left; the browser's PDF of it searchable; markers in the direct PDF; notes by line instead |
| `t-export.js` | One Export: each format the same as from its old button; offered only where it fits; the choice saved and remembered |
| `t-edit.js` | The table window at Simple: a place shows at most 6 controls; Accept, Emend…, More; going through the blocks; the letter tools in two groups |
| `t-fonts.js` | A font for every script: each script finds its Noto font; a subset draws what it kept exactly as the whole font does; with the internet, fonts are fetched once and kept, and the PDFs of Arabic, Japanese, Tibetan and hieroglyph editions are all text (skipped without the internet). The other tests run with fetching off |
| `t-scripts.js` | All 172 scripts of Unicode 17.0, from cuneiform and hieroglyphs to Adlam: three witnesses in each, of words made of the script's own letters and marks (`scripts.js`), tagged und-Xxxx; collated and published, every output checked as in `t-languages.js`. `SCRIPTS=Brai,Tibt` runs some only |
| `t-languages.js` | Thirty-eight languages by their codes (en, es, fr, de, it, pt, la, ru, el, grc, ka, hy, ar, fa, ur, he, syc, sa, hi, mr, ne, gu, bn, pa, or, ta, te, kn, ml, si, bo, th, km, my, zh, ja, ko, am): set up as Manuscribe sets them up, collated, published; the apparatus passes its checks with lemmas of a word or two, the print page lays out (right to left where it should), the reader opens, TEI is well-formed, and the direct PDF is offered only where its font has the letters. `LANGS=gu,ta` runs some only |
| `t-layered.js` | Layers by their IDs (b, c, ca, r): found, named, abbreviated and ordered; the parent of an ID; the checks; All layers in Collate, each layer with its own text; links from the IDs; the layers woven in reading order, in the app, the print page (set in by depth, [abbreviation], notes by layer) and the reader; TEI with @ana, @corresp, the taxonomy of layers and standOff links, every element and attribute TEI P5 |
| `t-emend.js` | Emending any word (E), and a stretch of several chosen by Shift+click or by dragging, typed in Harvard-Kyoto as Devanagari; in the edited text and the apparatus as one emendation; Esc; withdrawing an emendation (Delete) and an accepted reading |
| `t-tools.js` | The three steps; the Tools menu of Collate, each tool switched on, nothing computed until chosen; the workbench in its parts; at Simple, Tools leads to Settings |
| `t-tidy.js` | The start screen's three actions and Open…; the transcription bar, the PDF's View menu, the Manuscript tab in folds |
| `t-survey.js` | At Simple, every screen within the targets of the usability roadmap; and a walk from witnesses to a PDF that follows only the prompts |
| `t-screens.js` | Copying several lines; with the sample, the trust order, text view, apparatus, workbench, and the reader opened offline |

Some tests use a real edition package: by default `~/Downloads/saroddhara.edition-2.zip`, or the file named in
`MANUSCRIBE_SAMPLE`. Without it they are skipped; the package is never copied into the repository. Chrome is
looked for in `/Applications`; set `CHROME` to use another. Profiles and downloads go to the system's temporary
folder, under `manuscribe-tests`.

`bench-languages.js` is a benchmark, not a test, and `run.js` does not run it: `node tests/bench-languages.js [language codes, or all] [witnesses] [folio sides]` makes, for each language (from `languages.js`, shared with `t-languages.js`), fifteen witnesses of about ten folio sides copied down a stemma of three families, collates them, publishes the print page, the browser's PDF of it, the reader and TEI, and reports how long each step takes; the outputs and a picture of a page of each are saved with the test files.

`make-edition.js` makes a dummy edition in one language and saves what Export would give: `node tests/make-edition.js <code> [witnesses, 15] [folio sides, 10] [folder]` writes the PDF, the print page and the reader to `~/Downloads/manuscribe-<code>/` (or the folder given). `<code>` is a language code of `languages.js` (en, ar, sa, ja, bo…) or a Unicode script code of `scripts.js` (Xsux, Egyp, Linb…). It fetches the Noto fonts as the app does; `MANUSCRIBE_FONTS=off` uses the computer's own.
