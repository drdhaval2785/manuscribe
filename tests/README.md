# Tests

Browser tests: each opens Manuscribe from disk in a fresh Chrome profile and checks what the phases of the
roadmap promise.

```
cd tests
PUPPETEER_SKIP_DOWNLOAD=1 npm install    # once: puppeteer-core, which drives the Chrome you have
node run.js                              # every test file
node run.js stemma collate               # only those whose names contain these words
```

| File | What it checks |
|---|---|
| `t-xml.js` | XML out and back in gives the same text in all four layouts; folio and page numbering |
| `t-normalize.js` | Tokens map back to their lines; before- and after-correction layers; the rules and their published examples |
| `t-collate.js` | Editing operations and undo; on the sample, tokens back to their lines, identical re-runs, exchange formats, and locks that survive random edits |
| `t-apparatus.js` | The proposal by majority and trust; faulty entries caught; decisions never moved silently; witnesses read back from the TEI |
| `t-stemma.js` | Trees, copies and the archetype on a tradition with a known stemma; lacunae never agree; NEXUS; timings |
| `t-metre.js` | Metres recognised in known verses; seeded faults flagged; prose fits no metre |
| `t-layers.js` | Tripāṭha and pañcapāṭha give the same text; links in every DHARMA case; recorded evidence only, silence never support; metre per reading; concordance, packs and indices; the reader beside its base text |
| `t-screens.js` | Copying several lines; with the sample, the trust order, text view, apparatus, workbench, and the reader opened offline |

Some tests use a real edition package: by default `~/Downloads/saroddhara.edition-2.zip`, or the file named in
`MANUSCRIBE_SAMPLE`. Without it they are skipped; the package is never copied into the repository. Chrome is
looked for in `/Applications`; set `CHROME` to use another. Profiles and downloads go to the system's temporary
folder, under `manuscribe-tests`.
