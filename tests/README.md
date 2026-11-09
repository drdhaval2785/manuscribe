# Tests

Browser tests: each opens Manuscribe from disk in a fresh Chrome profile and checks what the phases of the
roadmap promise.

```
cd tests
PUPPETEER_SKIP_DOWNLOAD=1 npm install    # once: puppeteer-core, which drives the Chrome you have, and Playwright
node run.js                              # every test file, but the long survey of all scripts
node run.js --all                        # every test file, t-scripts.js included
node run.js stemma collate               # only those whose names contain these words
```

**In Firefox and Safari's engine (WebKit) too.** The same tests run there through Playwright (`engine.js`), on the
app served by a local web server, as people using those browsers open it from the website:

```
npx playwright install firefox webkit    # once: about 300 MB each, kept outside the repository
MANUSCRIBE_ENGINE=firefox node run.js
MANUSCRIBE_ENGINE=webkit node run.js
```

What only Chrome has (its own PDF of a page, its service worker driven by hand in `t-offline.js`) is skipped there.
Every test also checks, as it starts, that the browser has all Manuscribe needs (`Install.missing`). On GitHub, the
Tests workflow (`.github/workflows/tests.yml`) runs them on Windows, macOS and Linux in all three, and in Microsoft
Edge (`MANUSCRIBE_ENGINE=edge`, with `CHROME` set to where Edge is: the same tests as in Chrome), after each push.

Each check is shown as it runs, with a running count after each file and a line every 20 seconds while a file is
still at work. A file that runs longer than 5 minutes (`MANUSCRIBE_TEST_LIMIT`, in seconds) is stopped and counted
as failed, with the line it stopped at; one that crashes is ended at once. The tests see every tool (the Full level),
apart from `t-features.js`, which starts at the default.

| File | What it checks |
|---|---|
| `t-xml.js` | XML out and back in gives the same text in all four layouts; folio and page numbering |
| `t-normalize.js` | Tokens map back to their lines; before- and after-correction layers; the rules and their published examples |
| `t-collate.js` | Editing operations and undo; on the sample, tokens back to their lines, identical re-runs, exchange formats, and locks that survive random edits |
| `t-calibrate.js` | Calibration in one pane: the PDF takes the whole window while the boxes are drawn, zooms in to draw closely, a box drawn zoomed in lands where it was drawn, and the typing area comes back as it was (skipped without `linear.pdf`) |
| `t-apparatus.js` | The proposal by majority and trust; faulty entries caught; decisions never moved silently; witnesses read back from the TEI |
| `t-engines.js` | The methods of lining up witnesses: every token kept in order on hard random text, very long blocks, changing method, one block its own way, comparing and taking places, scoring on blocks read through |
| `t-deleted.js` | Text deleted from the transcriptions after collation: gone from what is shown and exported, its saved tables cleared by the next Collate, and a warning when blocks have changed since they were collated |
| `t-progress.js` | Export shows a bar that moves through its stages and goes away, and the page is not frozen while a PDF is made |
| `t-hyphen.js` | A long word of an Indian script breaks between akṣaras with a hyphen, never in a cluster or overflowing the margin, on the page and in the PDF |
| `t-paragraph.js` | `<p>` and `<lg>` on what is selected: within a line, over lines with the mouse, over folios from a marked start |
| `t-sole.js` | An edition of one witness: the corrected text is printed, each reading before correction is in the apparatus and the HTML, and a very long block still lines up |
| `t-stemma.js` | Trees, copies and the archetype on a tradition with a known stemma; lacunae never agree; NEXUS; timings |
| `t-metre.js` | Metres recognised in known verses, among them an ardhasama and an āryā; every metre of the list from a verse made to its pattern; seeded faults flagged; no run of words of a prose passage taken for verse |
| `t-mobile.js` | Phones and tablets: on a phone (390 × 844, touch) the line view enlarges the letters to about 16 px and the scan with them, with the device's own sizes; the folio bar on one row, the Tags panel from the bottom that closes when a tag is chosen; buttons for a finger; no page scrolls sideways; calibration by touch (a finger draws, two pinch); on a tablet held upright the project's sizes and the Tags panel; on a computer, as before; wide tables with the naming column in view |
| `t-layers.js` | Tripāṭha and pañcapāṭha give the same text; links in every DHARMA case; recorded evidence only, silence never support; metre per reading; concordance, packs and indices; the reader beside its base text |
| `t-features.js` | At the Simple level, in a fresh browser: what is hidden and shown; the South Asian pack by language and by hand; one tool on its own; the level remembered; the edition package the same whatever is shown |
| `t-exchange.js` | Two editors in two browsers: packages compared three ways and merged, a seeded conflict settled, nothing lost; sending and fetching through a stand-in for GitHub (`mock-github.js`), behind refused, PDFs never sent; a version issued, its outputs carrying version and date |
| `t-assists.js` | PAGE-XML, ALTO and text read; proposed lines never over typed ones and not collated until accepted; error rate; the memorisation test tells a source that reads from one that remembers; the shortcut; NeighborNet gives back a tree and draws 50 witnesses without crossings; coherence; DTS files of version 1.0 |
| `t-pdf.js` | The PDF typeset in the browser: valid and read back by pdf.js, every glyph in the font, every note on the page of its line over many pages, text searchable, the button; and the owner's package |
| `t-print.js` | Arabic, Japanese, English and Sanskrit editions from witnesses to print: letters compared as written; the print page laid out with every note on the page of its marker, Arabic right to left; the browser's PDF of it searchable; markers in the direct PDF; notes by line instead |
| `t-export.js` | One Export: each format the same as from its old button; offered only where it fits; the choice saved and remembered |
| `t-edit.js` | The table window at Simple: a place shows at most 6 controls; Accept, Emend…, More; going through the blocks; the letter tools in two groups |
| `t-fonts.js` | A font for every script: Manuscribe's own Tiro is fetched once and kept, upright and italic, and the typing area is set in it; on a computer never online the app still opens and a PDF says the font needs the internet once; each script finds its Noto font; a subset draws what it kept exactly as the whole font does; with the internet, fonts are fetched once and kept, and the PDFs of Arabic, Japanese, Tibetan, hieroglyph and Greek editions are all text, with the text clear of the notes once the fonts are in (skipped without the internet). The tests keep a copy of every font they fetch, outside the repository, so that after the first run they need no internet; only those that ask get the Noto fonts |
| `t-notes.js` | How a note reads: the text's punctuation is left off lemmas and readings unless it is the variant; readings that then print alike are given once; one "post X add." for all the additions at a place, and "ante X add." at the start of a block; single-letter sigla set close, on one line |
| `t-offline.js` | Manuscribe from its website, as an app (a local web server stands in): it keeps every file of itself and opens with the server gone; a new version is offered with Reload, which brings it in; the browser's offer to install becomes a button; Safari is told how to add it to the Dock and that the added app keeps its work apart, and the front page carries the app's manifest; a downloaded copy learns of a newer version; the offline list is up to date |
| `t-package.js` | The downloadable copy (`tools/package.mjs`): one folder with Manuscribe.html, the app, the licence, the guide and "Start here", nothing else; under 2 MB; unzipped, it opens the app of this version |
| `t-backup.js` | Work kept safe outside the browser: a backup of everything reads back into an empty browser as it was (editions, witnesses, tables), adds what is missing and replaces only what is older; Open… asks first; a backup folder (the browser's private folder stands in, on a served page) gets the backup and seven daily copies, rewritten after a change; the reminder after an hour, with a folder or a file, and Later |
| `t-scripts.js` | *Run now and then, with `--all` or by name, when collation, normalisation or the fonts change.* All 172 scripts of Unicode 17.0, from cuneiform and hieroglyphs to Adlam: three witnesses in each, of words made of the script's own letters and marks (`scripts.js`), tagged und-Xxxx; collated and published, every output checked as in `t-languages.js`. `SCRIPTS=Brai,Tibt` runs some only |
| `t-languages.js` | Thirty-eight languages by their codes (en, es, fr, de, it, pt, la, ru, el, grc, ka, hy, ar, fa, ur, he, syc, sa, hi, mr, ne, gu, bn, pa, or, ta, te, kn, ml, si, bo, th, km, my, zh, ja, ko, am): set up as Manuscribe sets them up, collated, published; the apparatus passes its checks with lemmas of a word or two, the print page lays out (right to left where it should), the reader opens, TEI is well-formed, and the direct PDF is offered only where its font has the letters. `LANGS=gu,ta` runs some only |
| `t-latex.js` | The LaTeX of Export, compiled with XeLaTeX (xelatex, or Tectonic): Sanskrit, English, Greek, Arabic and Japanese (`LATEX_LANGS=all` for every language), as it is and for a book, with no error and no missing character; the versions at the foot of every page, and none of them or the front matter for a book. Skipped without xelatex or tectonic (`brew install tectonic`) |
| `t-markdown.js` | Markdown from Export, rendered by markdown-it with footnotes: an edition's front matter, its text and a footnote at each lemma, as many as the print edition has; the versions at the end; for a book, the text and its footnotes only; a transcription by folio and numbered line, deletions struck, additions marked |
| `t-layered.js` | Layers by their IDs (b, c, ca, r): found, named, abbreviated and ordered; the parent of an ID; the checks; All layers in Collate, each layer with its own text; links from the IDs; the layers woven in reading order, in the app, the print page (set in by depth, [abbreviation], notes by layer) and the reader; TEI with @ana, @corresp, the taxonomy of layers and standOff links, every element and attribute TEI P5 |
| `t-emend.js` | Emending any word (E), and a stretch of several chosen by Shift+click or by dragging, typed in Harvard-Kyoto as Devanagari; in the edited text and the apparatus as one emendation; Esc; withdrawing an emendation (Delete) and an accepted reading |
| `t-tools.js` | The three steps; the Tools menu of Collate, each tool switched on, nothing computed until chosen; the workbench in its parts; at Simple, Tools leads to Settings |
| `t-version.js` | The versions, everywhere: the edition's (a draft, or a version issued) and Manuscribe's at the foot of every page of the print page, its PDF and LaTeX, and in the text, the TEI, the reader, a transcription's TEI and page, and on screen; for a book (Export), only the text and its apparatus: no front page, no running head, no versions, and the files named `.book` |
| `t-tidy.js` | The start screen's three actions and Open…; the transcription bar, the PDF's View menu, the Manuscript tab in folds |
| `t-survey.js` | At Simple, every screen within the targets of the usability roadmap; and a walk from witnesses to a PDF that follows only the prompts |
| `t-screens.js` | Copying several lines; with the sample, the trust order, text view, apparatus, workbench, and the reader opened offline |

Some tests use a real edition package: by default `~/Downloads/saroddhara.edition-2.zip`, or the file named in
`MANUSCRIBE_SAMPLE`. Without it they are skipped; the package is never copied into the repository. Chrome is
looked for in `/Applications`; set `CHROME` to use another. Profiles and downloads go to the system's temporary
folder, under `manuscribe-tests`.

`bench-collate.js` is a benchmark too: it lines up generated witnesses, whose true alignment is known, with every collation method (Manuscribe today, Saktumiva alone and with refinement, partial-order alignment, alignment to a base text, a diff, and CollateX when `CX_PYTHON` names a Python with collatex), and reports time and precision, recall and F1 of the word pairs each puts together: `node tests/bench-collate.js [quick|full] [engines]`. The findings are in `reports/Collation algorithms.md`.

`node tests/bench-collate.js gold [methods]` scores the methods on real witnesses that scholars have collated (`gold-sets.js`: 3 John in Greek and the Frankenstein Variorum in English, each downloaded once). With `CX_PYTHON` set it includes CollateX.

`keyboard-probe.html` is a page, not a test: opened on a phone (https://drdhaval2785.github.io/manuscribe/tests/keyboard-probe.html), it records what the phone's keyboard sends to a web page (key events, beforeinput, composition, the visual viewport), for the work on typing on phones; **Copy log** puts the record on the clipboard.

`bench-languages.js` is a benchmark, not a test, and `run.js` does not run it: `node tests/bench-languages.js [language codes, or all] [witnesses] [folio sides]` makes, for each language (from `languages.js`, shared with `t-languages.js`), fifteen witnesses of about ten folio sides copied down a stemma of three families, collates them, publishes the print page, the browser's PDF of it, the reader and TEI, and reports how long each step takes; the outputs and a picture of a page of each are saved with the test files.

`make-edition.js` makes a dummy edition in one language and saves what Export would give: `node tests/make-edition.js <code> [witnesses, 15] [folio sides, 10] [folder]` writes the PDF, the print page and the reader to `~/Downloads/manuscribe-<code>/` (or the folder given). `<code>` is a language code of `languages.js` (en, ar, sa, ja, bo…) or a Unicode script code of `scripts.js` (Xsux, Egyp, Linb…). It fetches the Noto fonts as the app does; `MANUSCRIBE_FONTS=off` uses the computer's own.
