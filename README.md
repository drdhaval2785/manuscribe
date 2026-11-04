<p align="center"><img src="app/img/logo.png" width="96" alt="A scribe's hand holding a feather pen"></p>

<h1 align="center">Manuscribe</h1>

<p align="center">Diplomatic transcription of Sanskrit manuscripts, in your browser, with a scan of the folio above the text you type.</p>

Manuscribe is for anyone preparing a diplomatic transcription of a manuscript. The PDF of the
manuscript is shown at the top. Below it you type into a copy of the folio with the same
proportions, blocks and number of lines, so that each line you type sits opposite its line on the
scan. You mark what the scribe did (deletions, additions, marginal notes, gaps and so on) with
keyboard shortcuts, and export [TEI](https://tei-c.org/) XML in the
[Saktumiva](https://www.saktumiva.org/wiki/tei) subset, or a single HTML page for reading.

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Your first transcription](#your-first-transcription)
- [The screen](#the-screen)
- [Layouts](#layouts)
- [Typing](#typing)
- [Moving around](#moving-around)
- [Tags](#tags)
- [Tag reference](#tag-reference)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Cited works and quotations](#cited-works-and-quotations)
- [Checking tags and attributes](#checking-tags-and-attributes)
- [Exporting](#exporting)
- [Bringing in an existing transcription](#bringing-in-an-existing-transcription)
- [Folio numbering and missing folios](#folio-numbering-and-missing-folios)
- [Settings](#settings)
- [Saving and backups](#saving-and-backups)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)
- [Credits and licences](#credits-and-licences)

## Features

- **Nothing to install.** No server, no account and no internet connection are needed.
- **Your manuscripts stay on your computer.** Nothing is uploaded anywhere.
- **Four layouts:** linear, tripāṭha, pañcapāṭha and interlinear. A single folio can differ from
  the rest of the manuscript.
- **The scan follows your typing.** The current line lights up on the PDF, and both stay in the
  middle of their panes.
- **Built-in typing schemes:** ITRANS, Harvard-Kyoto and SLP1, into Devanagari or IAST. You can
  also use your own keyboard or input method.
- **All the Saktumiva tags,** from the toolbar or the keyboard. They look on screen like what the
  scribe did, and may run across lines and folios.
- **Editable marginal notes,** with their own tags inside them.
- **Cited works list** for `<quote source="…">`, including one passage quoted from several works
  and import from a TSV file.
- **Checks:** well-formed XML, duplicate ids, unclosed quotations, and a summary of every tag and
  attribute that flags anything outside TEI or the Saktumiva guide.
- **Exports:** TEI XML (whole manuscript, one folio, or one file per stream) and a self-contained
  HTML page.
- **Import** of an existing XML transcription, so that you can add markup to it.
- **Automatic saving,** automatic backups, and backup files for moving between computers.

## Getting started

1. Get this folder, either by downloading it or with `git clone`.
2. Double-click **`Manuscriber.html`**, or open `app/index.html` in your browser.
3. Click **＋ New transcription** and choose the PDF of your manuscript.

That is all. Bookmark the page if you like.

Manuscribe is developed and tested in **Google Chrome**. Microsoft Edge uses the same browser
engine. It is written for Firefox and Safari too, but has not been tested in them, so keep backup
files if you use one of those.

> Use the same browser each time. Each browser keeps its own storage, so a project saved in Chrome
> is not visible in Firefox. Clearing the browser's site data deletes your projects, so keep backup
> files. See [Saving and backups](#saving-and-backups).

## Your first transcription

**1. Create it.** In the New transcription dialog:

- choose the manuscript PDF (and, optionally, an XML transcription you already have);
- give the title of the text and the siglum of this witness;
- pick the layout, and the usual number of lines in each block of a folio side;
- say which folio the first PDF page shows, and whether each PDF page shows one or two folio sides;
- list any folios missing from the manuscript, such as `7, 12-14, 20v`.

**2. Calibrate.** Manuscribe offers this straight away, or use **⌖ Calibrate** above the PDF later.
Drag a rectangle around the leaf, then one tightly around each block of text, from the top of its
first line to the bottom of its last. Dashed lines show where the line divisions fall, so you can
compare them with the scan and correct the number of lines. Press Enter or Next to go on. At the
end, apply the calibration to all folio sides or to this one only. One calibration normally fits a
whole manuscript, and you can recalibrate a single folio later.

**3. Type.** Click a line and type. Press **Enter** at the end of each line of the manuscript.

A line that does not end in a space continues its word on the next line, and the export marks this
as `<lb n="…" break="no"/>`. A line ending in a space or a daṇḍa gives a plain `<lb n="…"/>`.

**4. Tag.** Select some text and press a shortcut, or click the toolbar. On a Mac the default is
**⌃⌥ + letter**, and on Windows and Linux **Alt + letter**. **⌃⌥D** or **Alt+D** marks a deletion.
Press **F1** for the full list.

**5. Export.** Click **Export XML** in the top bar. The dialog lists any problems, previews the XML,
and offers **Download .xml** and **Download .html**.

## The screen

| Area | What it holds |
|---|---|
| **Top bar** | Your projects, the title, the default layout, the save status, Backup, Export XML, Settings, Help, and a button to show or hide the side panel |
| **PDF pane** (top) | The scan, with the current line lit up. Its tools: zoom (also Ctrl + wheel), Leaf or whole page, rotate, brightness, contrast, greyscale and invert, and Calibrate |
| **Middle bar** | Previous and next folio, the folio list, **⧉ XML** (copy this folio), and the tag toolbar. Drag it to resize the panes |
| **Typing area** (bottom) | The folio you type into. Marginal notes stand outside the red rules, and editorial notes in a panel below the folio |
| **Status bar** | Where you are, the open tags at the cursor, the typing scheme, **A− / A+** for the size of the letters (50–200%), and **− / +** for the size of the whole folio |
| **Side panel** | **Tag** (the tag at the cursor, to edit or remove it), **Folio** (label, layout, lines, calibration, progress), **Cited works**, **Manuscript** (details, numbering, PDF, imports, tag summary, backups) |

## Layouts

| Layout | The folio has | Exported as |
|---|---|---|
| **Linear** | One block of text | One stream: base text |
| **Tripāṭha** | Main text in the middle, commentary above and below | Base text, and commentary with `<cb n="top"/>` and `<cb n="bottom"/>` |
| **Pañcapāṭha** | Main text in the middle, commentary in the top, right, bottom and left blocks | Base text, and commentary with a `<cb>` for each block |
| **Interlinear** | Main text, with a line of commentary above each line | Base text, and interlinear commentary |

The layout in the top bar is the default for the project. To change a single folio, use the Folio
tab. You can also change the number of lines there, or on any folio with Enter on the last line of a
block (which adds a line), Backspace in that empty new line (which removes it), or the − and + on a
block's label.

## Typing

### Your own keyboard or the built-in schemes

Choose in **Settings → Typing**, or press **⌃⌥K / Alt+K** to turn the scheme on and off.

| Scheme | Into Devanagari | Into IAST |
|---|---|---|
| ITRANS | ✓ | ✓ |
| Harvard-Kyoto | ✓ | ✓ |
| SLP1 | ✓ | ✓ |

- `kRRiShNaM` in ITRANS gives `कृष्णं`.
- `..` gives । and `.,` gives ॥ (`|` and `||` work too).
- Vedic accents are typed with `\'` and `\_`.
- Each word is converted as a whole from the keys you typed, so nothing is doubled, and Backspace
  removes the last key you typed.
- Gemination after r (dharmma, sarvva) is off, and can be switched on in Settings.
- The same scheme works in the tag dialogs: note text, added text, and substitution and correction
  readings. A small badge shows the scheme. An editorial note set to English is typed plainly.

If you prefer an input method such as Keyman, switch the built-in scheme off. If Keyman misbehaves
in the editor (it can duplicate conjuncts), use the matching built-in scheme instead.

Saktumiva's collation works best with IAST, which is the default transcription language
(`<text xml:lang="sa-Latn">`). You can change it to Devanagari in the Manuscript tab.

### Akṣaras and vowel signs

- **→** jumps over a whole akṣara, conjuncts such as क्ष or स्त्र included.
- **←** and **Backspace** go one sign at a time. From the end of कि, one ← puts the cursor between
  क and ि, and the status bar shows `inside akṣara: क|ि`.
- There, Backspace removes the क and leaves the ि, Delete removes the ि, and typing inserts at that
  point.
- **Shift+← / →** selects character by character, so a single vowel sign can be tagged, as in
  `क<del>ि</del>`. The same keys work in the dialog text boxes.

A browser draws an akṣara in one style, so a tagged sign is shown by a small mark: a deleted sign
turns its akṣara reddish, and an added one gets a green line under the akṣara.

### Lines

Lines are kept exactly as typed and are never justified. A line longer than its block is set a
little smaller. The line you are typing gets an extra line of room around it.

### Pasting

- Plain text goes in at the cursor. Text with carriage returns continues over the following lines.
- XML is read properly: `<lb n="18"/>` starts a line with that number, and a tag running over a line
  break stays one element.
- A `<pb>` in a paste is left out with a warning. To bring in several folios, use
  [the import](#bringing-in-an-existing-transcription).

### Deleting and undoing

- **Ctrl/⌘+Z** undoes.
- Backspace or Delete next to a mark (¶, ❦, ❝, a gap, a note and so on) removes it in one keystroke.
  You can also click it and press Backspace.
- To delete text on several lines, select over them and press Backspace or Delete. A dialog shows
  what will go, and its Delete button works only after you tick "Yes, I am sure". The lines stay.

## Moving around

| Keys | Moves to |
|---|---|
| ↑ ↓ | The line above or below |
| Enter | The next line (on the last line of a block, adds a line) |
| **⌥/Alt + ↑ ↓ ← →** | The block above, below, left or right, continuing where you stopped |
| ⌃⌥ PgDn or ] (Alt on Windows and Linux) | The next folio side |
| ⌃⌥ PgUp or [ (Alt on Windows and Linux) | The previous folio side |

The folio list in the middle bar goes to any folio. Drag the scan to move it within its pane.

**Shift + arrows** select, and run on over line ends and from one block into the next. Shift+click
works too.

## Tags

- **With text selected,** a shortcut wraps the selection.
- **With nothing selected,** a wrapping tag starts empty. Type the text, then press the same shortcut
  again (or →) to leave the tag.
- **Shift with a wrapping tag** asks for its attributes first, for example how a deletion is marked:
  crossed out, haritāla, dots above.
- **To edit a tag,** double-click it, press the Enter shortcut, or use the Tag tab.
- **To remove a tag and keep its text,** press the Backspace shortcut, or use the Tag tab.
- **T** finds any tag or command by name.
- **Attributes a dialog does not list** (from an imported file, say) are kept when you save.

### Over several lines or folios

Select across the lines and press the shortcut. For a tag that ends on another folio:

1. press `.` (⌃⌥. on a Mac) where it starts; a flag (↦) marks the place;
2. go to where it ends, and press the tag's shortcut.

To delete the flag, click its ×, press Esc, or press `.` again at the same place. Pressing `.`
somewhere else moves it.

The parts stay together. On export they become one element containing the `<lb/>` or `<pb/>`, and
editing or removing the tag changes every part.

```xml
<del rend="crossed out">chinna
<lb n="4" break="no"/>caturthī</del>
```

### Marginal notes and additions

Notes and additions in a margin stand outside the red rules, level with their line, or above and
below the text for the top and bottom margins. The line keeps a small numbered mark.

- Click into a note to type in it. The same tag shortcuts work there; paragraph and verse markers
  are refused.
- Enter or Esc returns to the line.
- The note's number opens its dialog.
- Text in a margin has the colour of the main text, unless a tag inside it says otherwise, such as
  `<hi rend="red">`.

### Notes without a mark in the line

A marginal note whose `type` or `xml:id` is listed in Settings shows no mark in the line, so the arrow
keys and Backspace do not stop at it. The list starts as `FR, HND, CSP`. This suits things that belong
to the folio and not to a place in the text, such as the name of the work or a folio number. To edit
such a note, double-click it in the margin, or click into it and use the Tag tab.

### Editorial notes

`<note resp="editorial">` (or `#editorial`) is listed below the folio, whatever its `place` says. The
line keeps a numbered mark, and you can type and tag in the note there. Set it with Responsibility in
the note dialog.

### Above and below the line

`place="above"` stands above the line and `place="below"` under it. `supralinear` and `infralinear` in
imported or pasted XML become `above` and `below`, and are exported that way.

### Places in the margin

`top-margin`, `bottom-margin`, `left-margin` and `right-margin`. Forms such as `left` or `margin-left`
in imported files go to the matching margin. Any other place is shown in the bottom margin.

## Tag reference

The shortcut is the letter with ⌃⌥ on a Mac, or Alt on Windows and Linux. You can change this in
Settings.

### What the scribe did

| Key | Tag | Means | Example |
|---|---|---|---|
| D | `<del>` | Struck off. `rend`: crossed out, erased, overwritten, dots above, line above, yellow pigment (haritāla), smudged, bracketed | `sarva<del rend="crossed out">vidyā</del>nām` |
| A | `<add>` | Added by the scribe or a later hand. `place`: above, below, inline, or a margin | `sarva<add place="above">śabdā</add>nām` |
| S | `<subst>` | Deleted text replaced by an addition | `sarva<subst><del rend="crossed out">vidyā</del><add place="above">śabdā</add></subst>nām` |
| R | `<retrace>` | Written over again | `gṛhītaṃ <retrace>gṛha</retrace>śabdena` |
| N | `<note>` | A remark. `place`, `xml:lang`, `type`, `resp`, `hand` | `niṣṭhā<note place="inline">(pa॰ 1\|1\|16)</note>` |

### Your reading of the text

| Key | Tag | Means | Example |
|---|---|---|---|
| C | `<choice>` | Your correction: original and corrected reading | `va<choice><orig>ṃta</orig><corr>rta</corr></choice>mānaḥ` |
| I | `<sic>` | Transcribed as found, without correction | `viśeṣo<sic>pa</sic>dhiḥ` |
| E | `<supplied>` | Supplied by you. `reason` | `ta<supplied>d</supplied> dravyam` |
| X | `<surplus>` | Superfluous, such as a repetition. `reason` | `<surplus reason="repeated after line break">naṃ</surplus>` |
| U | `<unclear>` | Cannot be read with certainty. `reason` | `svarūpānyathā<unclear>t tānāpapaptiḥ</unclear>` |
| G | `<gap>` | Cannot be read at all. `reason`, `unit`, `quantity` | `sā<gap reason="damaged" unit="akṣara" quantity="5"/>rvārthyam` |

### The look of the page

| Key | Tag | Means | Example |
|---|---|---|---|
| B | `<space>` | A blank left in the line, for instance around the string hole. `unit`, `quantity`, `rend` | `ity arthaḥ<space unit="akṣara" quantity="2"/> atha ca` |
| H | `<hi>` | Marked for emphasis, such as rubricated. `rend` | `<hi rend="rubricated">ātma vastu sva</hi>bhāvaś ca` |
| M | `<metamark>` | A sign that is not part of the text, such as a kākapada. `function` | `tat siddhiḥ<metamark function="place marker">✗</metamark>` |
| \\ | `<caesura/>` | A pāda division within a line | `suvarṇarucakādi ya<caesura/>thā yuktaṃ` |
| F | `<milestone>` | A location marker. `n`, `unit` | `<milestone n="34r4" unit="folio"/>jātir vā` |
| - | `<pc>` | Splits a long compound for the apparatus. Use sparingly | `aneka<pc> </pc>viṣaya` |

### The structure of the text

| Key | Tag | Means |
|---|---|---|
| P / ⇧P | `<p>` | Start or end a paragraph. Each needs a unique `xml:id`, which Saktumiva uses for collation |
| V / ⇧V | `<lg>` | Start or end a verse |
| L | `<l>` | The next line of the current verse |
| Q | `<quote>` | A quotation from a [cited work](#cited-works-and-quotations) |

These are shown as markers (¶ ❦ ‖ ❝) and may span lines and folios. On export they become properly
nested elements. You can hide the markers in Settings.

## Keyboard shortcuts

Each letter takes ⌃⌥ on a Mac by default, or Alt on Windows and Linux.

| Key | Action | | Key | Action |
|---|---|---|---|---|
| D | `<del>` | | C | `<choice>` |
| A | `<add>` | | I | `<sic>` |
| S | `<subst>` | | E | `<supplied>` |
| R | `<retrace>` | | X | `<surplus>` |
| N | `<note>` | | U | `<unclear>` |
| G | `<gap>` | | B | `<space>` |
| H | `<hi>` | | M | `<metamark>` |
| \\ | `<caesura/>` | | F | `<milestone>` |
| - | `<pc>` | | P / ⇧P | `<p>` start / end |
| V / ⇧V | `<lg>` start / end | | L | next verse line |
| Q | `<quote>` | | T | find any tag or command |
| Enter | edit the tag at the cursor | | Backspace | remove the tag at the cursor |
| PgDn / ] | next folio side | | PgUp / [ | previous folio side |
| K | typing scheme on / off | | / or F1 | help |
| . | mark where a tag starts | | | |

Without the modifier: **Ctrl/⌘+S** saves a backup file, **Ctrl/⌘+Z** undoes, **F1** opens the help, and
**⌥/Alt + arrows** jump between blocks.

## Cited works and quotations

Select the quoted text and press **Q**, or press Q where the quotation starts and again where it ends.
A quotation may run across lines and folios. Choose the work from the list, or type a new one.

- A cited work needs a short label, and the work or the author. Whichever is missing is recorded as
  "Unknown".
- Works are listed most quoted first. A work whose short label is exactly what you typed comes first.
  The search ignores diacritics.
- A passage quoted from **several works** can name them all: tick each one, or type in the search box
  and press `+` to add the highlighted work (`nand` `+` `mala` Enter).
- Each work's `xml:id` is its short label, made unique if needed.

```xml
<quote source="#NAND #MALA">…</quote>
```

Works are listed in the TEI header as `<bibl>`. In the **Cited works** tab you can edit them, and:

- **Import TSV…** reads a tab-separated file with the columns Short Label, Work, Author. A header row
  is fine, and labels already in the list are skipped.
- **Download as TSV** saves the list, so that you can reuse it for the next manuscript.

## Checking tags and attributes

**Summarise tags and attributes** in the Manuscript tab counts every tag and attribute in the XML the
transcription exports, most frequent first. Open a tag to see its attributes and values, and click a
place to go there. Three lists stand on top, in a red box:

| List | Means | Example |
|---|---|---|
| **Not in TEI** | The TEI schema (P5 4.12.0) does not allow it there. Usually a typing mistake | `<redfont>`, `<note id="…">` |
| **In TEI, but not in the Saktumiva guide** | Valid TEI that [the guide](https://www.saktumiva.org/wiki/tei) does not mention | `<cb>`, `<note type="…">` |
| **Values outside the usual list** | A hint only: the list is what the tag's dialog offers, not a rule of either standard | `<hi rend="redfont">` |

The export itself writes `<div>`, `<cb>` and `break="no"`, so these appear in the second list even in a
correct file. So does `<quote>`, which the guide does not mention.

The summary does not change by itself while you type. Press **Refresh** after correcting something.

## Exporting

### TEI XML

**Export XML** checks the document and lists problems: duplicate `xml:id`s, unclosed quotations, text
outside paragraphs. Text outside any paragraph is wrapped in an automatic `<p xml:id="p-auto1">` and
reported, so mark your paragraphs and verses.

You can include or leave out streams (main text, commentary, interlinear commentary), export the whole
manuscript or this folio side, write one file or one per stream, and copy or download the result.

Every `<pb/>` and `<lb/>` starts a new line of the file, with a blank line before each folio, so the XML
reads easily in a text editor:

```xml
<lb n="2"/>kṣuḥ pūrva<subst>…</subst>madhya
<lb n="3" break="no"/>tara iti…

<pb n="1v"/>
<lb n="1" break="no"/>…
```

These line breaks are only the layout of the file: a word running over a line is marked by
`break="no"`. A tool that goes by whitespace alone and ignores `break="no"` could read a word break
there, so try a file in your own tools first.

### One folio

**⧉ XML** in the middle bar copies the folio on screen to the clipboard, with its `<pb/>`, `<lb/>` and
tags. A `<p>` tag is included only where the paragraph starts or ends on that folio, so a copied folio
can have an unmatched `<p>` or `</p>`.

### HTML page

**Download .html** in the export dialog saves one page holding everything it needs: styles, script and
font. It comes to about 1 MB plus the text. The transcribed folios stand one below the other, looking as
they do in the typing area, with a list for jumping to a folio. Anyone can read it without Manuscribe and
without internet access. It cannot be edited, and it leaves out folios without text.

## Bringing in an existing transcription

Choose an XML file in the New transcription dialog, or use **Import transcription XML…** in the
Manuscript tab. Folios in the file replace the same folios in the project, after a confirmation. Other
folios are left alone.

- `<pb n="0005_1"/>` is folio 5, first side (5r), and `<pb n="0005_2"/>` is its back (5v). The export
  writes them back in the same form.
- `<lb n="18"/>` and `<lb n="18" break="no"/>` start a new line and keep their number and meaning. The
  lines after one are counted on from it.
- On a side with no `<lb/>`, each carriage return is a line. A space before the carriage return gives
  `<lb n="18"/>`, and no space gives `<lb n="18" break="no"/>`.
- A tag open across a line break, such as `<hi>`, stays one element and shows on both lines.
- `source="#NAND #MALA"` is matched to the cited works by short label. A label not in the list is added
  as a work, with the title and author "Unknown".
- `id="FR"` on a note becomes `type="FR"`, because `id` is not valid TEI there.

The reader is tolerant: tags left unclosed or without their start are handled, and reported where
something had to be ignored.

## Folio numbering and missing folios

Say which folio the first PDF page with text shows, and whether each PDF page shows one or two folio
sides. The pages after it are numbered 1r, 1v, 2r, 2v and so on. You can change this in the Manuscript
tab, and rename any single folio in the Folio tab (the following ones are not renumbered).

Name the folios the manuscript lacks as `7, 12-14, 20v`. A number leaves out both sides of that folio,
and `20v` leaves out one side. The PDF pages then map to the folios that remain.

Your text is stored by folio number. Changing the numbering changes which PDF page is shown beside a
folio, not the text of that folio.

## Settings

| Setting | Choices |
|---|---|
| Shortcut key for tags | ⌥/Alt + letter, or ⌃⌥ + letter (the Mac default, which keeps ⌥ free for typing diacritics) |
| Typing | Off, or ITRANS, Harvard-Kyoto or SLP1, into Devanagari or IAST |
| Gemination | Double the consonant after r while typing (off by default) |
| Paper colour | Taken from the PDF, cream or white |
| Line guide on the PDF | Highlight the current line, dim everything else, or off |
| Paragraph, verse and quotation markers | Show or hide |
| Notes without a placeholder | The list of types, `FR, HND, CSP` to begin with |

## Saving and backups

Your work is saved automatically in the browser on this computer, together with the PDF.

- **Backup** (Ctrl/⌘+S) saves a `.manuscribe.json` file. **Import project file…** on the start screen
  reads it back, and reads older `.lipikara.json` files too. Use this to keep a copy and to move to
  another computer.
- **Automatic backups:** one every 20 minutes while you work, the last 25 kept. To restore one, go to
  the Manuscript tab → *Restore an automatic backup*. A backup of the present state is downloaded first.

Please keep backup files. Automatic saving and automatic backups both live in the browser's storage, so
clearing site data removes them along with your projects. Take a backup file before you move or rename
this folder too: some browsers tie the storage of a local page to its location.

## Troubleshooting

| Problem | What to do |
|---|---|
| Conjuncts are doubled while typing | An input method such as Keyman is interfering. Switch it off and use a built-in scheme |
| ⌥ + letter types a symbol on a Mac | The default is ⌃⌥ + letter. See Settings → Shortcut key for tags |
| The PDF is asked for again | The browser could not store it, or its storage was cleared. Select the PDF again; your text is safe |
| "limited storage" in the status bar | The browser does not allow IndexedDB here. Projects are kept in localStorage, and the PDF must be selected each time. Use Backup regularly |
| The lines do not match the scan | Recalibrate (Folio tab), and check the number of lines against the dashed guides |
| A word is split, or joined, across lines in the XML | A line ending in a space ends its word. Add or remove the space at the end of the line |
| Literal `<hi …>` is shown in a line | That line was pasted with an older version. Paste it again |

## For developers

There is no build step and there are no dependencies. The code is plain JavaScript in classic `<script>`
tags on a `window.ME` namespace, because ES modules do not load from `file://`.

```
Manuscriber.html        launcher (redirects to app/index.html)
app/index.html          the application
app/css/app.css         the look of the application
app/img/logo.png        the logo
app/js/
  util.js               DOM and string helpers
  tei.js                the tag set; stored TEI to editable HTML and back
  translit.js           the typing schemes
  store.js              IndexedDB, with localStorage as a fallback
  model.js              the project, folio numbering, layouts, geometry
  foliostyle.js         the look of a folio (also copied into the HTML export)
  foliolayout.js        sizing and measuring a folio (also copied into the HTML export)
  spans.js              tags over several lines and folios
  importxml.js          the tolerant XML reader, for paste and import
  ui.js                 dialogs and forms
  pdfview.js            the PDF pane and calibration
  editor.js             the folio editor
  commands.js           tags, shortcuts, the toolbar, the Tag tab
  export.js             TEI export and its dialog
  exporthtml.js         the HTML export
  teischema.js          elements and attributes allowed by TEI (generated)
  tagsummary.js         the summary of tags and attributes
  app.js                the application and its tabs
app/vendor/             pdf.js 3.11.174
app/fonts/              Tiro Devanagari Sanskrit; tiro-regular.base64.js is the same font as a
                        script, because a page opened from disk cannot fetch a font to embed it
```

**How text is stored.** Each line of a folio is a string of TEI in
`project.pages[label].boxes[box][i]`, and each line on screen is its own contenteditable element.

- Paragraph, verse and quotation tags are stored as `<x-marker type="p-start|p-end|lg-start|lg-end|l|q-start|q-end"/>`, and nested at export.
- A tag over several lines is stored as pieces sharing an `x-span` attribute, and merged at export.
  `x-*` attributes never reach the export.
- Line numbers and explicit breaks from imported XML are in `pg.lb[box][i] = {n, brk}`.

**Things that look odd but are deliberate.**

- The IndexedDB and localStorage names still say `lipikara`, the project's earlier name. Changing them
  would leave everything already saved out of reach.
- No CSS generated text inside editable lines, because it interferes with input methods.
- `foliostyle.js` holds CSS in JavaScript, and `exporthtml.js` copies `folioLayoutSource` with
  `toString()`. A page opened from disk may not read its own stylesheets' rules, and this keeps one
  source for the app and the export.

**Regenerating `teischema.js`.** It is generated from the official `p5subset.xml`
(<https://www.tei-c.org/release/xml/tei/odd/p5subset.xml>) by resolving each element's attribute classes.
It lists 588 elements from TEI P5 4.12.0.

## Credits and licences

Manuscribe itself has **no licence yet**. Until one is added, the default rules of copyright apply.

It includes:

| Component | Licence |
|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174, Mozilla | Apache License 2.0 |
| Tiro Devanagari Sanskrit, © The Indigo Project Authors ([Tiro Typeworks](https://github.com/TiroTypeworks/Indigo)) | SIL Open Font License 1.1 (`app/fonts/OFL.txt`) |
| Element and attribute lists from the [TEI P5 Guidelines](https://tei-c.org/) | CC BY 3.0 and BSD 2-Clause, © TEI Consortium |

The tag set follows the [Saktumiva TEI guide](https://www.saktumiva.org/wiki/tei).
