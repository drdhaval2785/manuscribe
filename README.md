<p align="center"><img src="app/img/logo.png" width="96" alt="A scribe's hand holding a feather pen"></p>

<h1 align="center">Manuscribe</h1>

<p align="center">Diplomatic transcription of Sanskrit manuscripts, in your browser, with a scan of the folio above the text you type.</p>

<p align="center"><b><a href="https://drdhaval2785.github.io/manuscribe/">Open Manuscribe</a></b> · <a href="https://github.com/drdhaval2785/manuscribe/releases/latest/download/Manuscribe.zip">Download it, for use without the internet</a></p>

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
- [Editions: many witnesses of one text](#editions-many-witnesses-of-one-text)
- [Exporting](#exporting)
- [Text proposed by recognition or AI](#text-proposed-by-recognition-or-ai)
- [Bringing in an existing transcription](#bringing-in-an-existing-transcription)
- [Folio numbering and missing folios](#folio-numbering-and-missing-folios)
- [Settings](#settings)
- [Saving and backups](#saving-and-backups)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)
- [Citing Manuscribe](#citing-manuscribe)
- [Credits and licences](#credits-and-licences)

## Features

- **Nothing to install.** No server and no account are needed. The internet is needed only to fetch, once, the font
  of a script that needs one (Tiro, 1.5 MB, for Devanagari), which the browser then keeps; Latin, Greek, Arabic,
  Chinese and other scripts every computer has fonts for need nothing. After that it works offline.
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

1. Open **<https://drdhaval2785.github.io/manuscribe/>** and click **Open Manuscribe**.
2. Click **＋ New transcription** and choose the PDF of your manuscript.

That is all. To give Manuscribe an icon and a window of its own, and have it open without the
internet, install it:

- **Chrome, Edge:** click **Install Manuscribe** on its start screen.
- **Safari on a Mac:** with Manuscribe open, choose **File → Add to Dock…**, then **Add**. Nothing
  changes in Safari; Manuscribe is now in the Dock. Open it from there from then on.
- **iPad, iPhone:** in Safari, **Share → Add to Home Screen**, and open it from its icon.

On a Mac, iPad or iPhone, the installed Manuscribe keeps its work apart from Safari's. If you have
already worked in Safari, click **Back up everything** there first, then **Open…** that file in the
installed Manuscribe. (Chrome and Edge share the work between the browser and the installed app.)
A new version is offered with a **Reload** when there is one.

**Without the internet**, use the downloadable copy: download
[Manuscribe.zip](https://github.com/drdhaval2785/manuscribe/releases/latest/download/Manuscribe.zip),
unzip it, and double-click **`Manuscribe.html`**. It needs the internet once, for the font of
your script, and tells you when a newer version is out. (Developers can also clone the
repository and open `Manuscribe.html` the same way.)

Manuscribe is tested in **Chrome** (and so Edge, which shares its engine), **Firefox** and
**Safari**'s engine, on Windows, macOS and Linux: the same tests in all three. Use a recent
version (Firefox 125 or later, Safari 17 or later); an older browser is told what it lacks.
Chrome and Edge can also keep backups in a folder by themselves.

> Use the same browser each time. Each browser keeps its own storage, so a project saved in Chrome
> is not visible in Firefox. Clearing the browser's site data deletes your projects, so keep backup
> files. See [Saving and backups](#saving-and-backups).

## Your first transcription

**1. Create it.** In the New transcription dialog:

- choose the manuscript PDF (and, optionally, an XML transcription you already have);
- give the title of the text and the siglum of this witness;
- choose the language of the text and the script you will type in (the manuscript's own, or Latin for a
  transliteration such as IAST): Manuscribe fetches only the font that script needs;
- pick the layout, and the usual number of lines in each block of a folio side, and of letters (akṣaras) in a
  line: a rough figure, for the scan to follow the letter you type; Manuscribe learns the real one from your lines;
- say which folio the first PDF page shows, and whether each PDF page shows one or two folio sides;
- list any folios missing from the manuscript, such as `7, 12-14, 20v`.

**2. Calibrate.** Manuscribe offers this straight away, or use **⌖ Calibrate** above the PDF later.
While you calibrate, the scan fills the whole window; zoom in with **+** and **−** in the bar (or
Ctrl + wheel) to draw closely, and scroll to reach the rest of the page. Drag a rectangle around the leaf, then one tightly around each block of text, from the top of its
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

**5. Export.** Click **Export…** in the top bar and choose *TEI XML, or an HTML page*. The dialog lists any problems, previews the XML,
and offers **Download .xml** and **Download .html**.

## The screen

| Area | What it holds |
|---|---|
| **Top bar** | Your projects, the title, the save status, Export… (TEI XML, an HTML page, a backup file), Settings, Help, and a button to show or hide the side panel |
| **PDF pane** (top) | The scan, with the current line lit up; zoomed in, it keeps the letter you are typing in the middle. Drag it to look elsewhere (a marginal note, say): it then stays put until you move to another line or press **↩ Follow**. Its tools: zoom (also Ctrl + wheel, or a pinch), Leaf or whole page, rotate, brightness, contrast, greyscale and invert, and Calibrate |
| **Middle bar** | Previous and next folio, the folio list, **⧉ XML** (copy this folio), and the tag toolbar. Drag it to resize the panes |
| **Typing area** (bottom) | The folio you type into. Marginal notes stand outside the red rules, and editorial notes in a panel below the folio |
| **Status bar** | Where you are, the open tags at the cursor, the typing scheme, **A− / A+** for the size of the letters (50–200%), and **− / +** for the size of the whole folio |
| **Side panel** | **Tag** (the tag at the cursor, to edit or remove it), **Folio** (label, layout, lines, calibration, progress), **Cited works**, **Manuscript** (details, numbering, PDF, imports, tag summary, backups) |

### On a phone or a tablet

- **A phone** (up to 700 px wide) shows a *line view*: the typing area has strips the width of the screen, the
  line you are typing between the line above and the line below, and as many more as the screen has room for
  (three at the least, with the keyboard open), each scrolling along its own text, with the notes of the line
  under it; the scan above shows three lines of the page, the one you type between the one above and the one
  below, and follows the line you type: on a calibrated folio it shows two of the three parts of the line, the
  first two until the letter you are typing passes the middle of the line (reckoned from the letters typed and
  the usual number in a line, set when the transcription is made and learnt from the lines you type), then the
  last two, so that the scan does not slide along with every letter you type; pinch to show more or fewer, and
  the scan then moves by half a screen whenever the letter you type comes near its edge. The status bar makes way
  for the text: the position (folio, block, line) is a line
  fixed at the top of the typing area, with **− / +** for the lines of the block; **↑** and **↓** in the folio bar
  go to the line above or below, since a phone's keyboard has no arrows, and so does a swipe up or down on the
  text; and the bar's **⋯** menu holds the
  scan's controls (below) and **Folio**, which shows the whole folio side instead, enlarged until its letters can be read (**3 lines** brings
  the strips back; the choice, and the sizes you choose, are kept for that device, so the project keeps the sizes
  of the computer you mostly type on), the typing scheme, and the size of the typing area (the letter-size
  buttons **A− / A+** are left out there, the folio's **− / +** enlarging the letters too; tap **100%** to come
  back). While the keyboard is open the top bar stays, with the way back and **Export** on it, and the scan and
  the strips are fitted to the room left above the keyboard, whether the browser brings the keyboard over the
  page (Safari) or shrinks the page for it (Chrome on Android). A dialog (New transcription, the settings) is a sheet the height of the screen, its body
  scrolling between the title and the buttons. The tags are behind one **Tags** button, which opens them from the
  bottom of the screen, as does a finger held on the text for a moment; one chosen is applied to the selected
  text and the panel closes. A selection made by a finger is kept by Manuscribe from the moment it is made: a tap
  on **Tags**, on a tag, or the finger held on the passage itself does not lose it (the browser's own selection
  may go; the passage stays marked), and the sheet names what the tag will go round. The side panel (**◧**) is a
  sheet over the text, closed by a tap beside it or by its **✕**; it does not open on its own on a phone,
  whatever the computer chose. The scan's controls (zoom, Leaf or Page, rotate, brightness, whose pop-up has
  **Done** to put it away) are in the folio bar's **⋯** menu, above the folio's own, and **⌖** Calibrate is a
  button in the bar, calibrated or not, since
  some manuscripts need calibrating on every folio side (on a computer a calibrated folio's **Recalibrate** is in
  the Folio tab): nothing lies over a scan three lines tall but **↩ Follow**, which appears at its corner when
  the scan has been moved by hand. While calibrating, the bar's wording is short, the whole
  page is in view below the bar whatever height it has, and **Fit** brings it back after a pinch.
- **A phone held sideways** is a phone too: the scan at the left, the typing area beside it, as tall as the
  screen, in the line view. (A window a browser has shrunk for the keyboard is not taken for a phone held
  sideways: only one well wider than tall is.)
- **A tablet held upright** (up to 900 px) keeps the whole folio, with the same **Tags** button, the long press
  and the side panel as a sheet; held sideways, it has the computer's layout with the side panel docked.
- **With a finger:** every button, field, tick and fold is big enough to touch (36–40 px), fields are 16 px so
  that Safari does not zoom in on them, no interface text is under 12 px, and the keyboard's help and the
  shortcut letters are not shown; the bar between the scan and the typing area can be dragged; two fingers pinch
  to zoom the scan; while calibrating, one finger draws a box.
- **The edition on a phone:** the title has a row of its own; the Collate step's tools row scrolls sideways;
  long explanations are clamped to two lines until tapped; in a block, the rows of buttons fold what does not fit
  into **⋯** menus, Previous and Next staying, and the place opened comes into view under the text.
- Wide tables of an edition scroll sideways in their box, with the column that names the row kept in view.
- **Memory:** only the part of the page shown is drawn, at most 12 megapixels on a phone (24 on a computer), and two
  drawn pages are kept rather than five, so that a large scan does not exhaust a phone's memory.

On a phone, reading the edition and deciding readings work well, and the line view is made for typing a
line at a time; transcribing a whole manuscript is still better on a tablet or a computer.

## Layouts

| Layout | The folio has | Exported as |
|---|---|---|
| **Linear** | One block of text | One stream: base text |
| **Tripāṭha** | Main text in the middle, commentary above and below | Base text, and commentary with `<cb n="top"/>` and `<cb n="bottom"/>` |
| **Pañcapāṭha** | Main text in the middle, commentary in the top, right, left and bottom blocks, read in that order | Base text, and commentary with a `<cb>` for each block |
| **Interlinear** | Main text, with a line of commentary above each line | Base text, and interlinear commentary |

The default layout of the project is set in the Manuscript tab, under *Folios and numbering*. To change a single folio, use the Folio
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

**Shift + arrows** select, and run on over line ends, from one block into the next, and from the last
line of a folio side on to the next folio (which is shown, the selection kept; Shift+← or Shift+↑ at
the start of a folio goes back the same way). Through an addition written in the margin they go
letter by letter of its text, and a tag over such a selection goes into the addition. Shift+click
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

Select across the lines and press the shortcut; `<p>` and `<lg>` then open at the start of the selection and close at
its end. A selection runs on to the next folio with Shift+→ or Shift+↓ (see Moving around). For a tag that ends
far away, on another folio, without selecting all the way:

1. press `.` (⌃⌥. on a Mac) where it starts; a flag (↦) marks the place;
2. go to where it ends, and press the tag's shortcut.

To delete the flag, click its ×, press Esc, or press `.` again at the same place. Pressing `.`
somewhere else moves it.

The parts stay together. On export they become one element containing the `<lb/>` or `<pb/>`, and
editing or removing the tag changes every part.

A paragraph, verse, verse-line or quotation marker that would fall inside a tag such as `<hi>` or
`<unclear>` cuts the tag in two, one tag before the marker and one after it with the same
attributes; Manuscribe asks first. At the edge of a tag the marker simply goes just outside it.

```xml
<del rend="crossed out">chinna
<lb n="4" break="no"/>caturthī</del>
```

### Marginal notes and additions

Notes and additions in a margin stand outside the red rules, level with their line, or above and
below the text for the top and bottom margins. The line keeps a small numbered mark.

- Click into a note to type in it. The same tag shortcuts work there; paragraph and verse markers
  are refused.
- An addition in the margin is part of the line: Shift+→ along the line runs on through its text
  and out again, and a tag over the selection goes into the addition, which stays one. A verse or
  paragraph may begin or end inside it (select to the place and press the shortcut); at export the
  addition is cut at the marker, so that the verse begins where the scribe began it.
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

### In the line itself

`place="inline"` and `place="insitu"` keep the text in the line. An addition is editable there like
the rest of the line, and a note is a small mark holding its text. `insitu` is not offered in the
dialogs, but it is kept and exported as written.

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

In an edition the quotations are kept: each is a stretch of the edited text, set in a shade of blue on the print
page (and so in its PDF), in the reader and in the LaTeX (`\textcolor{quote}{…}`, the colour defined in the
preamble), named for its work when the pointer rests on it; and they are indexed (see Indices). The work's title and
author come from the cited works of the witness the quotation was marked in.

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

## Editions: many witnesses of one text

An edition brings together several transcriptions of a text. Each witness stays an ordinary
transcription that you can open and type in, and the edition adds what holds them together. Start with
**＋ New edition** on the start screen.

**The edition goes in three steps,** shown across the top of its screen, each with a count: **1 Witnesses**,
**2 Collate** and **3 Publish**. Each step shows only its own work. The line under the steps says where the edition
stands, and its button does the next thing: add witnesses, collate, open the first block with a place to decide,
publish.
Above the steps: **‹ Start**, the title, **Export…** (every output, see [Publishing](#publishing)),
**Share…** (at the Full level: compare and merge, GitHub, kept copies), **⚙** Settings and **?** help.

- **1 Witnesses:** a table of sigla, groups, library, date, script, language, folio sides and whether the PDF
  is in this browser. Each witness needs its own siglum. Clicking a title opens that witness, and
  **‹ Edition** in the top bar brings you back. **Add witnesses…** adds them from this browser, from XML files
  or from backup files, and **Relink PDFs…** there matches your PDFs to their witnesses by content.
  - **Works,** in a fold where witnesses carry more than one: which work each part of a witness carries. Two
    manuscripts' commentaries are compared only if they are the same work here.
  - **Citation IDs,** in one line: witnesses are compared by the `xml:id` of their paragraphs and verses.
    Opened, it lists duplicate IDs, automatic IDs, lines outside any paragraph or verse, and IDs a witness
    lacks, with links to the place. The grid shows **All** works at first, each under its own heading, or one
    work. Click an empty cell to explain the gap: lacuna, not yet transcribed, or outside that witness's scope.
  - A fold you open stays open while you change things in it.
- **2 Collate:** how the witnesses are compared, in one line; **Collate with** and **Collation settings…**; **Collate**; the blocks, each with
  its words, the places where the witnesses differ, how many you have decided and how many wait for review (click
  a block to open it and decide); **Edited text and apparatus…** for the whole work, with its indices; and
  **Tools**, the optional tools switched on under ⚙ Settings: metre (with the South Asian pack), agreement, the
  stemmatic workbench in its parts, testimonia, parallels and the concordance, Align again and Import alignment.
  At the Simple level they are a menu; at the Full level every one of them is in view, in a row of its own under
  these controls. The last item, **Switch tools on or off…**, opens Settings.
- **3 Publish** is described below.
- **Export › Edition package** saves a ZIP of plain files, for backup and for moving between computers or
  editors; **Open…** on the start screen reads it back. The edition reminds you when it has never been exported,
  or when the last export is 7 days old and the work has changed. PDFs are never in the package: each is
  recorded by name, size and SHA-256. **Export › TEI for Saktumiva** (with the South Asian pack) saves one TEI
  file per witness of the chosen work, to collate in [Saktumiva](https://chchch.github.io/saktumiva/).

### Normalisation

Before witnesses can be compared, Manuscribe has to know what counts as the same reading. The
**Normalisation** part of the edition screen sets this. It works on a copy: your transcriptions never
change, and every normalised letter knows its place in the manuscript.

- **Profiles:** Classical Sanskrit, Epic Sanskrit, Vedic (minimal), Jain Prakrit and Old Gujarati, and **Any
  language: letters as written**. Jain Prakrit and Old Gujarati are provisional and have not been checked against
  published editions. The Sanskrit profiles compare Devanagari and IAST alike, through Manuscribe's own
  transliteration; the profile for any language compares letters as they are written, in any script, with none of
  the rules of Sanskrit, ignoring only punctuation (of any script) and spaces. With it you can also switch on
  capital and small letters, and marks such as vowel points and accents, where your edition ignores them. A new
  edition of a text in a language other than Sanskrit, Prakrit or Gujarati is offered it.
- **The language of a witness** is set in the Manuscript tab as a language tag: `sa-Latn` for Sanskrit in IAST,
  `sa-Deva` in Devanagari, `ar` for Arabic, `ja` for Japanese, and so on. It goes into the TEI, and tells the print
  edition how to set the text.
- **Rules:** switch any rule on or off for this edition. The Sanskrit rules come from Charles Li's
  Saktumiva 2.0.
- **What each witness is known to do:** for example, that one manuscript writes b and v alike. This applies
  to that witness alone.
- **Marked text that is not compared:** `<surplus>`, `<pc>` and similar stay in the transcription, but
  comparison passes over them.
- **Preview on your text…** shows one citation block, witness by witness: the text as written with each
  change marked, what it is compared as, how far apart the witnesses are before and after the rules, and
  what each rule did. Point at any part to see the reason and the folio, block and line.

A witness has two states where it has corrections: before (`ac`, with `<del>`, without `<add>`) and after
(`pc`, the reverse). Marginal notes are kept apart from the running text. Text you supplied as editor
(`<supplied>`, `<corr>`, editorial notes) is not part of a witness. `<gap>` counts as lost text, not as an
omission. Only text inside a paragraph or verse with an `xml:id` is compared.

Sandhi rules read word spaces, as they do in Saktumiva. If a scribe's space falls inside a word, as in
`त्र यो दश`, the rule sees a word ending in *o* and treats it as *-aḥ*. The preview shows where this happens.

### Collation

**Collate** in the edition screen lines up the witnesses of a work, one citation block at a time. Only blocks
whose text or settings have changed are aligned again, and the page stays usable meanwhile; **Cancel** stops it
and keeps what is done.

- **One witness:** there is nothing to line it up against, so Collate only prepares its text, in seconds however long it is, and offers no method. This is the quick way to see what the text, PDF and HTML will look like.
- **Exporting** a large edition shows a bar at the foot of the screen, with what it is doing and how far it has got.
- **Collate with:** on the Collate step, above the Collate button, three methods, each making the same kind of table.
  **Saktumiva** is Charles Li's aligner from Saktumiva 2.0, with its default scoring, and is what an edition uses
  until you choose otherwise. **Careful, all witnesses together** lines each witness up against all those before it,
  the more trusted first (partial-order alignment). **Against a base text** lines each up on its own against the
  witness you name. Changing the method marks the blocks to collate again; what you have corrected or locked stays.
  Under **Full**, **Line up again…** in a block's own view gives one difficult passage its own method.
  **Compare methods…** beside it shows another method's alignment of the block next to the table as it stands, place by
  place. Nothing changes until you take all of it or, in a block with no corrections, the places you tick.
- **Which method?** Mark as read a few blocks of different kinds, after correcting them; then **Score the methods on
  them** (**Collation settings…** on the Collate step) lines each of those blocks up by every method, compares the result with your corrected
  table, and says which came closest, and how long each took. Your blocks are not changed.

- **Align by:** letters for the languages of South Asia: on a real commentary passage, alignment by letters and by
  akṣaras was far better than by words, as Li advises. For a language that spaces its words (Latin, Greek, Arabic,
  English…), the first Collate chooses words, since a letter aligner pairs letters of different words where one word
  stands for another; for a script written without spaces (Japanese, Chinese, Thai…), letters, with the words found by
  the browser's word segmenter, so that an entry is a word or two, not a run of the sentence; in Tibetan, the tsheg and
  the shad divide the words. **Collation settings…** chooses
  otherwise. Fifteen witnesses of about ten folio sides each collate in one to eight seconds in all
  (`tests/bench-languages.js` measures it in 38 languages).
- **Any script.** Every script Unicode encodes can be collated and published: the 172 of Unicode 17.0, from cuneiform,
  Egyptian hieroglyphs and Linear B to Adlam and Tolong Siki, right to left where the script is, and scripts written
  without spaces (Chinese, Japanese, Thai, Yi, Tangut…) with their words found by the browser's dictionary where it
  has one, else character by character. A script's own signs (Braille, SignWriting) are compared as its letters. A
  script that is not in Unicode cannot be typed, and so cannot be transcribed in Manuscribe or any other program
  until it is encoded; worldswritingsystems.org counts 128 such scripts of the 293 it lists.
- **The table:** click a citation ID. Each row is a witness, or both states of one that has corrections, in the
  order of the aligner's guide tree, so similar witnesses sit together. Columns where witnesses differ are
  shaded, and **Next difference** goes to them. **Show** switches between the normalised form and the text as
  written. Click a cell for its reading, its place, the rules that touched it and, if the witness has its PDF here,
  the line itself from the scan. **Go to this line** opens the witness there.
- **What an empty cell means:** hatched means that witness has nothing there. `‡` means text lost to damage, which
  is not an omission. A witness without the block has its own row saying so, using the reason you gave in the
  citation grid.
- **After the aligner:** a witness that omits a long passage tends to be scattered across it (`kr---at---u`).
  Manuscribe moves a stretch up against its neighbour if it reads the same in its new columns and leaves fewer
  gaps. Nothing else moves.
- **How far the witnesses agree:** a table of each pair, over all blocks or over the passages you tick as samples.
  A lacuna or an absent block counts neither way, so lost text never looks like agreement.
- **Saving and importing:** the table saves as CollateX input, a CollateX table, a TEI corpus for Saktumiva's matrix
  editor, or Manuscribe's own file. **Import alignment…** (under **More**, at the Full level) reads a file saved by Saktumiva, a CollateX table or a TEI
  corpus. It must spell the same text as the block, or it is refused, so that every reading keeps its place in the
  manuscript. An imported alignment stays until its text changes or you choose **More › Align again**.

#### Reading the text, word by word

The table opens on **Text**: the block as most witnesses read it, word by word, with every word where the witnesses
differ coloured. Click one, or press **N** and **P**, to see its readings and who has each. The scan of the line
appears below, if the witness has its PDF here.

- **Most witnesses win.** For each word, the reading most witnesses have is proposed. A witness has one vote: its text
  before correction does not vote, and a witness whose text is lost here abstains.
- **Ties go to the witness you trust most.** Before the first collation you are asked to put the witnesses in order,
  most trusted first; **Collation settings…** in the Collate step changes it at any time, and nothing has to be aligned again.
- **Only real differences are marked.** Readings that differ only in spelling the normalisation rules ignore, or only in
  spacing and punctuation, count as one reading. A long compound with differences far apart is divided around them.
- **Your choice:** the buttons, or the keys 1 to 9, choose another reading. **Follow the votes again** takes it back,
  and Undo works as everywhere. **Join with the next word** makes two words one place of variation.
- **Go through** can be set to only the ties, or only the places you have not chosen yet.
- **Save** can write the proposed text with its differences listed under it.

The proposed text is a starting point for your decisions, not an edition. The letters underneath decide which words
line up, so if a word's readings look wrong, **See the letters** opens the letter table at that place.

#### Decisions

In **Text**, every place where the witnesses differ can carry your decision. All of it is optional except the
choice itself, and each part is one click. **Where every witness is wrong,** click any word, even one they all agree
on, and **Emend…** (or E) gives your own text for it; it is printed as an emendation, with what the witnesses read.
**Several words as one:** drag across them, or click the first and Shift+click the last. The panel shows what each
witness reads over the whole stretch, and your text replaces all of it as one place, with one apparatus entry; this is
how words a scribe split, or ran together, are put right. Decisions on words inside the stretch give way to it, and
come back if you withdraw it. Esc leaves the stretch.

- **The keys are shown above the text,** and work as soon as the window opens: ↓ or N to the next place to decide, ↑
  or P back, A to accept, 1 to 9 to choose, E to emend, Delete to withdraw, ] and [ for the next and previous block.
  ↓ after the last place of a block goes on to the first place of the next, and ↑ before the first back to the last
  of the block before, so that a whole work can be gone through from the keyboard.
  A bar beside the counts shows how many of the places where the witnesses differ you have decided; the Collate
  step shows the same bar for every block, so that you can see what is still to go through.
- **Choose a reading** with its button or the keys 1 to 9; **Accept** (A) makes the proposed one yours, and
  **Withdraw decision** (Delete) takes it back, so that the place follows the witnesses again. **Emend…** opens a field
  for your own text; the crux, lacuna, certainty, reasons, evidence and history are under **More**. **‹ Block** and **Block ›**, or [ and ], go through the blocks of the work without closing the window.
- **Use my text** (or Enter) puts in an emendation or a conjecture; **More** says whose it is, if not yours. The field
  types as a transcription does: with the South Asian pack, a **Typing** menu beside it chooses Harvard-Kyoto, ITRANS
  or SLP1 into Devanagari or IAST, as the first witness typed with a scheme does unless you choose otherwise for the
  edition; any keyboard or input method of your own works too. **Withdraw emendation** takes it back.
- Under **More**, every button and choice says what it is, with an example, when the pointer rests on it, and
  **What these mean** lists them all to read.
- **† crux** marks a corrupt place; **Lacuna** says the text is lost in every witness; **How sure?** sets certain,
  probable or uncertain, and uncertain places get a wavy line in the text.
- **Why** takes any of lectio difficilior, usus scribendi, metre, stemma, sense, parallel or testimonium, grammar,
  and a note.
- **Follow the votes again** returns the place to the proposal. Nothing is overwritten: a new decision supersedes the
  old one, and the earlier ones are listed with it.
- **A decision stays only where its text is.** It remembers what each witness read when you made it. If a witness is
  re-transcribed so that it reads differently there, the decision is not applied, and the place is marked for review.

#### The apparatus

**Apparatus**, in the table, shows the edited text of the block and its apparatus; **Edited text and apparatus…** in the Collate step, on
the edition screen shows the whole work.

- **How it is written:** negative, positive, or negative with a switch to positive where few witnesses have the lemma;
  Latin or English abbreviations, each of which you can rewrite in any language or script; a group siglum for a whole
  group (the Group of each witness in the witness list), with the group's lacking members named if you like; singular
  readings in a tier of their own; spelling variants listed or not. Each setting says what it does when the pointer
  rests on it. The abbreviations are in a table: what each is printed as (a box to write your own), what it stands
  for (*om.*: omittit, omits), what it tells the reader, and an example entry that shows your own abbreviation as you
  type it; ↺ puts back the one of the set.
- **Entries** read `lemma ] reading witnesses`: `om.` for an omission, `post X add. Y` for an addition, `a.c.` for a
  text before correction, `lac. X (what survives)` for a lost passage, `em.` and `conj.` with their source, and hyphens
  for part of a word. Long additions go to an appendix of additional passages, numbered as `c2.1*1`.
- **One witness:** the text printed is the corrected one, and the apparatus says what each correction is. What the
  scribe did is reported as the scribe's: `युद्ध ] add. supra lin. A` (added above the line; `add. infra lin.`,
  `add. in marg.`, `add. in lin.` likewise), `post कुरु ] भीम del. A` (deleted), and a substitution as
  `गोविन्द ] कृष्ण Aa.c.`. What you did is reported as yours: a `<choice>` with `<corr>` as `गगने ] em.; गगन A`,
  `<supplied>` as `पूर्ण ] suppl.; om. A`, `<surplus>` as `post देव ] अधिक A (secl.)`, and `<reg>` plainly as
  `जलं ] जल A`. A word in `<unclear>` is noted `चन्द्र ] A (ut vid.)`, one in `<sic>` as `गगन ] A (sic)`. Words
  added or deleted together are one note. The abbreviations are in the table with the others.
- **Notes are in the apparatus** at the word they stand by: a note of the scribe or a later hand as
  `राम ] adn. in marg. A: टिप्पणी` (`adn. supra lin.`, `adn. infra lin.`, `adn. in lin.` likewise), an editorial
  note (`resp="editorial"`, or in English) as `हरि ] adn. ed.: see v. 12`. Notes tied to no place in the text,
  whose types are listed in Settings as having no mark in the line (a folio number, the name of the work), stay
  out. In the TEI they are `<note>`s inside the `<app>`.
- **Checks:** each witness cited once in each entry, no unknown siglum, group sigla that stand for exactly their
  witnesses, each lemma the edited text and with a witness unless emended, no witness cited where its text is lost,
  and decisions waiting for review. Ties settled only by your trust order are listed to look at.
- **Text and apparatus are linked:** pointing at a word in the edited text lights up its entry, and pointing at an
  entry lights up its words. Clicking a word brings its entry into view.
- **Find where witnesses agree against others**, for instance AK1 and LD1 against AK2. Places where any of them is lost
  are left out.
- **Export › TEI apparatus** writes TEI P5 with the apparatus in parallel segmentation: `<app>`, `<lem>`, `<rdg>`, with `type` for
  orthographic, before-correction and partly lost readings, `<witDetail>` for lacunae, `cert` for doubt, and the reasons
  as `<note>`. Spelling variants are kept even where they are not printed, so that each witness can be read back out of
  the file. **Export › Apparatus as text** writes the edited text with its apparatus under it.
- **Export › DTS files** (at the Full level) writes the edition as static files in the shape of the
  [Distributed Text Services API, version 1.0](https://dtsapi.org): an entry point, a collection, for each work a
  resource and its navigation by citation ID, the work as TEI, and each block in a `dts:wrapper`. A folder of files
  cannot answer queries, so its URI templates name files, and each navigation file holds the whole tree. A release
  (**Issue edition…**) includes them under `output/dts/`.

#### Publishing

In the **Publish** step, give the editor's name, the version, the licence and a DOI if there is one (left empty, the edition is a dated
draft). Every output then carries the same citation line. To release a version, use **Issue edition…** (see
[Sharing and releasing](#sharing-and-releasing)): until a version is issued, its outputs say that they are a draft.

The checks of the apparatus are listed there too. Each problem names its place: click it, and its block opens at
that place, highlighted, to be put right.

Every output below is in **Export…**, by block or by work. The dialog asks first for the kind of file, **PDF**,
**HTML**, **Markdown**, **LaTeX**, **TEI**, **Text** (plain text, and data for other programs) or **Archive**, and then shows only
the options of that kind; it remembers your choice in each.

**Versions.** Every page of the PDF, the print page and the LaTeX edition carries, in small type at its foot, the
edition's version and Manuscribe's: *Draft of 8 November 2026 · Manuscribe 0.10.5*, or *Version 1.0, issued 8
November 2026 · Manuscribe 0.10.5* once a version is issued (Publish › Issue). The citation on the front page, the
reader, the plain text and the TEI (`editionStmt`, `appInfo`) carry them too, and so do a transcription's TEI and
HTML page (Manuscribe's). On screen, Manuscribe's version is beside its name, and an edition's under its title.

**For a book.** Tick **For a book** in Export (PDF, the print page, Markdown, LaTeX, plain text) for only the edited text and
its apparatus, to print in a book of your own: no front page (title, citation, conspectus, principles), no running
head, no indices, and no versions at the foot of the pages. The file is named `….book.pdf`, `….book.print.html` and so on.

- **Reader, one HTML file:** the edited text, the conspectus siglorum and the editorial principles, in one file that
  opens from disk and needs no network (the text and its notes are written into the file, so a viewer that runs no
  script, such as a phone's file preview, shows them too, the notes under the text). It opens on the critical text alone, to be read, the words with variant
  readings underlined with dots: **point at one** and what
  the witnesses read there appears beside it; **click it** and its notes, with the other notes of that passage, stay
  open in a panel at the side (at the foot on a narrow screen), where a click on a reading puts it into the text; Esc
  closes it. **Read** shows the text of any one witness instead. Switches put the whole apparatus under the text, as
  in print, underline the words where the witnesses differ, show or hide spelling variants, singular readings and
  readings before correction, and colour the words by how much the witnesses differ. No block IDs are shown.
  **Print a draft** prints, or saves as PDF: a draft, not a typeset edition.
- **Notes are keyed to the text:** each place with an entry has a small number after its reading, counting from 1
  in each block, and its note at the foot of the page begins with the block and that number. Under **How the
  apparatus is written**, *Notes keyed by* can be set to line numbers instead, as in many printed editions.
- **PDF:** saved at once as a file, in any script, with no print dialog and no new tab. Manuscribe lays the print page
  out in this browser, out of sight, exactly as the HTML page is shown, and writes each word into the PDF where the
  browser put it, set in its font and shaped by [HarfBuzz](https://harfbuzz.github.io/): the PDF looks as the page
  does, its text can be searched and copied, and its markers and notes are linked both ways. The pages are the print
  page's: the paper, margins, sizes, title page and commentaries, the layers set in with their [abbreviations], the
  notes of each page at its foot in the order of the blocks, numbered from 1 on each page with the markers in the text,
  so that no block IDs need be printed. Lines are numbered in the margin on the side the text starts, counted down each
  page from 1 without regard to blocks (or, if you choose, on through the whole text), every fifth line or every line;
  notes keyed by line cite these numbers. **Through this browser's print dialog** is still there, to print on paper.
  Under **Paper and fonts for printing**: the paper (A4, US Letter, or a book of 156 × 234 mm), the size of the text,
  how lines are numbered, the fonts to use, by name, a font file of your own, kept in this browser and put into the
  page, and whether to fetch fonts. **Print page, one HTML file** saves the same page as one HTML file, to open and
  print on any computer. An issued release holds the PDF and the print page.
- **A font for every script, fetched only when it is needed.** A new transcription asks for the language of the text
  and the script you will type in, and Manuscribe fetches only that script's font, once, and keeps it in this
  browser; the app itself carries no font. On screen, Devanagari is set in Tiro Devanagari Sanskrit; the scripts
  every computer and phone has fonts for (Latin, Greek, Cyrillic, Hebrew, Arabic, Thai, Chinese, Japanese, Korean…)
  are left to the browser; any other gets its Noto font. A script typed later gets its font when it first appears.
  In print, an edition with Devanagari is set in Tiro, Latin included. Every other
  script gets its [Noto](https://notofonts.github.io/) font, Google's family for all the world's scripts (serif where
  there is one: Noto Naskh Arabic, Noto Serif Tibetan, Noto Serif JP, SC, TC or KR by the language, Noto Sans Egyptian
  Hieroglyphs…), fetched from the internet the first time an edition needs it and kept in this browser, so that later
  it prints offline. The page and the PDF carry only the glyphs the edition uses, so even a Chinese font adds little:
  a PDF of three witnesses in Arabic, Japanese, Tibetan or hieroglyphs comes to 60–190 KB. Fetching can be switched
  off under **Paper and fonts for printing**; then the page uses the computer's own fonts, and in the PDF a word in a
  script no font at hand has is put in as the browser drew it, with its letters over it, invisible, so that it can
  still be searched. Search and copy are exact in most scripts; where a script draws letters out of their order (a
  Devanagari vowel sign before its consonant), each word also carries its letters in reading order for readers that
  read them (ActualText, as Acrobat and Chrome do).
- **Markdown:** the edition as one `.md` file, for GitHub, Obsidian, Pandoc and other Markdown tools: the title,
  the citation, the conspectus as a table and the principles, then the edited text, a paragraph for each block (a
  commentary set off with `>` and its [abbr]), each note of the apparatus a footnote at its lemma (`[^p1-3]`), with
  its testimonia, singular readings, spelling and decisions; the versions at the end. A transcription exports as
  Markdown too: each folio side with its numbered lines, deletions ~~struck~~, additions and supplied text in ⟨…⟩.
- **LaTeX for reledmac:** a ZIP with `edition.tex` for XeLaTeX and reledmac, its fonts and a README. The fonts are
  those of the print edition: Tiro where the edition has Devanagari, otherwise Noto Serif, and for every other script
  its Noto font, the text set in it run by run; an Arabic, Hebrew or Syriac edition is set right to left (`bidi`),
  and Chinese, Japanese and Thai break between their letters. It is compiled in the tests, with XeTeX (Tectonic), in
  Sanskrit, English, Greek, Arabic and Japanese, with no missing character. Series A holds the
  variants, B testimonia, C singular readings, D spelling variants if listed, and E the reasons for your decisions; uncertain places
  get a wavy line and corrupt ones daggers. Run `xelatex edition.tex` three times so that the line references settle,
  or upload the folder to Overleaf and choose XeLaTeX. Notes are only ever attached at the start of a whole akṣara, so
  that they cannot break a conjunct.

#### Stemmatics

The stemmatic tools weigh what the variants say about how the witnesses are related. They are in the **Tools** menu of the Collate step, at the Full level or once *The stemmatic workbench* is switched on in Settings, each computed only when it is chosen: *Trees…*, *Network and coherence…*, *Copies and contamination…*, *Your stemma…* and *The whole stemmatic workbench…*; *Agreement…* is beside them. The workbench
proposes nothing as the stemma: it shows agreement, computed trees and what contradicts your own stemma, so that you
can judge. A witness whose text is lost at a variant is missing there, and never counts as agreeing.

- **What is analysed:** all passages or only the sample passages; with or without spelling variants; only variants
  shared by two or more witnesses on each side; witnesses left out (they stay in the data). **Save these settings**
  keeps them under a name, and says later whether the evidence is still the same.
- **How far the witnesses agree:** each pair, out of the variants both can be read at, ordered so that close
  witnesses sit together; and a map on which close witnesses stand close.
- **A tree by distance** (neighbour joining) with **How sure?** (100 resamplings of the variants), and **the
  shortest tree** (parsimony) with its length, consistency and retention index. Both are drawn from their
  midpoint, since a computed tree has no top of its own. Both save as Newick.
- **Copies, contamination, changes of exemplar:** possible copies (a witness with all the readings another has
  alone with it, differing only where it stands alone), to be checked against the manuscripts; each witness left out
  in turn, to see whose absence removes the most extra changes; and, passage by passage, how far one witness agrees
  with each other one.
- **Your stemma**, written in DOT, one line from exemplar to copy: `ω -> α; α -> A; α -> B; ω -> C`. Names that are
  not sigla are lost witnesses, an extant witness may be the exemplar of another, and `B -> C [style=dashed]` is a
  second source. It is drawn as you type, and **Start my stemma from this tree** begins from the shortest tree.
  Below it: the archetype the stemma implies, where it differs from your text, with readings in braces where the
  stemma leaves the choice open; and the variants that do not fit it.
- **For other programs:** NEXUS for PAUP* and SplitsTree (variants with more than 32 readings are left out and
  named), the tree as DOT, and the TEI apparatus for teiphy and open-cbgm.
- **A network (NeighborNet):** where the variants pull two ways, as contamination does, a tree hides it and a network
  shows it. The circular order is found as in NeighborNet (Bryant and Moulton), and every split fitting it is given
  a weight by least squares, none below zero; the figure says how much of the distances the splits account for.
  It is drawn as an outline: two parallel edges for each split, as long as its weight; a box is a witness grouped two
  ways at once. Point at an edge to see its split.
- **Coherence**, as in the Coherence-Based Genealogical Method: for a witness, every other one with the share of places
  where they agree (pre-genealogical coherence). Taking the edited text's reading as the source of the others at each
  place, a witness that has the earlier reading more often than the later is a potential ancestor, ranked by agreement;
  **A** stands for the edited text. Full CBGM, with a local stemma at every place, is for open-cbgm, through the TEI.

#### A base text and its commentaries, by their IDs

A text with commentaries, and commentaries on those, to any depth, is told apart and linked by its citation IDs
alone, extending Saktumiva's convention. An ID is **letters, a locus and `-n` numbers**:

- **The letters are the layer.** `b` is always the base. Each commentary on it has one letter of its own (`c`, `r`,
  … but never `b`), and a commentary on a commentary adds one letter to its parent's: `ca` and `cb` on `c`, `caa` on
  `ca`. The number of letters is the depth.
- **The locus is the base passage** the whole chain hangs on: `2.47`. `_` joins several (`c2.47_2.48-1` comments on
  two verses together); `2.0` is before all of chapter 2, and `0` before the whole text.
- **The last `-n` is the block's own paragraph.** `-0` introduces the passage and is printed before it; `-1`, `-2`…
  follow it. Any `-n` before it says which paragraph of the parent it comments on.

| ID | is |
|---|---|
| `b2.47` | the verse |
| `c2.47-0`, `c2.47-1` | commentary `c`: its introduction to the verse, then its first paragraph |
| `ca2.47-1-1` | `ca` on paragraph 1 of `c` (`c2.47-1`) |
| `ca2.47-3` | `ca` on `c`'s whole comment on 2.47 |
| `caa2.47-1-1-1` | `caa` on `ca2.47-1-1` |
| `r2.47-1`, `ra2.47-1-1` | a second commentary on the verse, and a commentary on it |

The base and its commentaries may be written in one box, one after another, as most manuscripts have them, or in
the boxes of a tripāṭha or pañcapāṭha page: the ID says which layer a block is in, wherever it stands. An edition is
layered as soon as a witness has a commentary block by such an ID; IDs like `b1` alone are ordinary ones.

- **Layers,** in the Witnesses step, lists the layers the witnesses use, each after its parent. Name each one, and
  give it the one or two letters printed in [ ] before its blocks, such as [Ś]; the base text may have some too
  (one reader wants [M] before each verse), or none; ↑ and ↓ order commentaries on the same text. Below it are the IDs to look at: a block whose parent no witness has, a layer whose parent layer is
  missing, two layers with one abbreviation, and IDs that look meant as layer IDs but are not (`c3` without its
  `-1`).
- **The citation IDs stand as in the manuscript.** With *All* chosen in the Witnesses step, and at *All layers*
  in Collate, the blocks of the base and of the commentaries come in one list in the order the most trusted
  witness has them (a block only another witness has follows the block before it), each commentary block with its
  [abbreviation]. A block amiss among its neighbours is highlighted, and the pointer on its row says what is
  wrong: a commentary block whose base block no witness has, one on the wrong side of its base (a `-0` block
  introduces its passage and stands before it; the others follow it), or blocks out of their numerical order.
- **Collate** in a layered edition starts at **All layers**: one table of every layer's blocks, each commentary
  block with its [abbreviation], and one Collate for all of them. Each layer is still collated on its own, with only
  its own text, so a witness that lacks one commentary is absent from that one only. The work menu also offers each
  layer alone.
- **Links come from the IDs.** Each commentary block is linked to the blocks it hangs on, and a sub-commentary's
  base text is its commentary: *Edited text and apparatus…* of a layer shows above each block what it comments on.
  An introduction to a chapter or to the text (`c2.0-1`, `c0-1`) hangs on the first base block there. The cases of
  the DHARMA guide that an ID cannot say (a commentary passing over a verse, a base that is absent) are still set
  by hand in **Links to the base text…**, and win over the ID.
- **The text with all its layers.** With **All layers** chosen, *Edited text and apparatus…* and **Export** (the PDF
  in any script, the print page and the reader) give the edition as it is read: each base block with the
  introductions to it before it, then each commentary on it in the order of the Layers list, each followed by the
  commentaries on it, to any depth. Each deeper layer is set in further and a little smaller, and every commentary
  block begins with its abbreviation, as `[Ś]`. The front matter lists the abbreviations, and at the foot of each
  page the notes follow the order of the blocks, numbered from 1 on the page. A block whose
  parent no witness has follows its base verse.
- **TEI.** **Export › TEI apparatus** of All layers has every layer in reading order. Each block names its layer
  with `@ana="#layer-c"`, a category of a taxonomy of layers in the header (nested as the layers comment on one
  another, each with its `<abbr>`), and each commentary block points to the blocks it comments on with
  `@corresp="#w-b2.47"`. The same links are in `<standOff><linkGrp type="commentary">`, and the header has a title for
  each layer (`subtype="base-text"` or `"commentary"`, as in the DHARMA guide) and says what the attributes mean. TEI
  sets no rule for commentaries; this follows its linking attributes and the DHARMA guide. **Export › TEI for
  Saktumiva** keeps the IDs as they are, every part of the page included.

#### Commentaries, evidence and indices

A commentary is a work of its own, with its own witnesses, collation and apparatus. **Links to the base text…**, in the Tools menu of the Collate step at the Full level,
says which work it comments on (the main text, unless you say otherwise; a gloss may comment on
the commentary) and which of its blocks comments on which base blocks. **Propose links where the numbers agree**
suggests `c2.1` for `2.1`, and sets nothing until you accept. A block may comment on several base blocks, or be marked
as having its base text absent, passing over part of it, having none, implying one not known otherwise, or letting it
be reconstructed: the cases of the DHARMA guide for critical editions, §4. The screen also names the witnesses that
carry both texts. Where blocks are linked, the apparatus window and the reader show the base text above each block.

- **Evidence beyond the witnesses:** in the text view, under a place where the witnesses differ, record what a
  commentary or a testimonium says of it: it quotes the reading as its lemma (pratīka), explains it, quotes it (a
  testimonium), reports it as found elsewhere (kvacit), rejects it (apapāṭha), or proposes it (yukta). Each piece names
  its source and, if you like, where in it and its words. Only the first three speak for a reading. **A source that
  says nothing about a place is not counted for any reading of it**: nothing is inferred from the commentary's text.
  Evidence is printed in a testimonia tier, in TEI as `<note type="testimonium">`, and in print as series B. If the
  place it was recorded for is lost after a recollation, the apparatus checks say so.
- **Metre** (with the South Asian pack): where a block is verse, each reading in the text view shows whether the verse
  with that reading fits its metre, or how many faults it has, and **Tools › Metre…** in the Collate step lists the
  metre of every block. Manuscribe knows 1,366 metres counted by syllables: 1,197 with one pattern for
  all four pādas, 134 with one for the odd and one for the even, and 35 with four, from the lists of Shreevatsa
  Rajagopalan's *Sanskrit metres* (the Vṛttaratnākara and a large list, both input by Dr. Dhaval Patel). It checks
  by their rules the śloka with its vipulās, upajāti, the āryā, gīti, upagīti, udgīti and āryāgīti by their gaṇas,
  and the vaitālīya and aupacchandasika by morae and close. A short vowel before a word that begins with a stop and
  r, as *pra* or *bhra*, may count as light. Faults are tolerated only where daṇḍas mark the half and the end of the
  verse where the metre has them; otherwise one at most, so that prose is not taken for verse. Where several metres
  fit equally, all are named. It only ever flags; it never changes a reading.
- **Testimonia and parallels:** a register of passages elsewhere that quote this text or run parallel to it, under
  the apparatus.
- **Concordance:** looks for words in your own witnesses and in texts you bring in, after this edition's
  normalisation and without regard to spaces, so that a passage written across two lines is found too. Nothing comes
  with Manuscribe: bring in plain text (one passage a line, or reference, tab, text), TEI (each `<l>`, `<p>` or `<ab>`)
  or JSON (`[{"ref": …, "text": …}]`), and give its licence, which is shown with every passage found in it. A passage
  found can be added to the parallels. Texts brought in stay in this browser and are not put in the edition package.
- **Indices:** every word of the edited text and every pāda of its verses, in the order of the Sanskrit alphabet, with
  block and word or verse and pāda; and the quotations, in the order of the alphabet with their place and the work
  each is from, and again under the works quoted. They save as text, and every export that is read (PDF, LaTeX,
  the reader and the print page, Markdown, the apparatus as text, the indices as text) carries the ones ticked under
  **Indices** in the Export dialog: pādas of verse, words, quotations in the order of the alphabet, quotations by
  cited work. All four are ticked at first; the choice is remembered in this browser. They are set after the text
  and its apparatus, in columns, each from a new page; in the reader they are folded under the text.

#### Correcting the letters

Select a cell by clicking it or with the arrow keys; Shift selects several. Everything can be undone, including
after closing and reopening.

| Button | Key | What it does |
|---|---|---|
| ◀ Move, Move ▶ | Alt+←, Alt+→ | Moves the selected reading one column. With no room, it gets a column of its own |
| Merge | M | Makes this column and the next one, if no witness has text in both |
| Split | S | This witness's reading is not the same as the others' here: it gets its own column |
| Swap | W | Changes the order of this column and the next, if no witness has text in both |
| Cell is… | | Says what the selected cells are: omission, lacuna, illegible, outside coverage, or ambiguous |
| Boundary | B | Adds or removes a word or lemma boundary before this column |
| Lock | L | Locks the selected columns, so that nothing can change them until you unlock them |
| Transposition | T | Select a passage, click, select where the witness has it instead, click again |
| Undo, Redo | Cmd or Ctrl+Z, with Shift to redo | |
| Previous, Next difference | P, N | |

- **An empty cell counts as an omission** until you say otherwise. Lacuna, illegible, outside coverage and ambiguous
  count neither as agreement nor as difference. A marked transposition counts as neither an omission nor an addition.
- **Whatever you correct stays corrected.** If a witness's text changes, **Collate** aligns the rest again around your
  corrections, which keep their columns exactly. If the text under one of them has itself changed, it is not moved to
  somewhere that looks similar: its lock comes off and it is listed for your review. A new witness is fitted in without
  moving anything. **Take back all** returns the block to what the aligner gave.
- **Places to check** lists what aligners tend to get wrong: possible transpositions, readings broken into pieces, a few
  letters alone between gaps, places where no reading has a majority, marked text among the differences, and differences
  that exist only because a rule acted on one side. These are prompts to look, not findings. A possible transposition
  can be marked from the list.
- **Readings in this unit** shows who reads what between the word or lemma boundaries around the selected column.
- **Mark as read** says that you have read the whole block against the witnesses. It locks the block, and the edition
  screen then shows how much of your version the aligner had right, which is the measure of the aligner on your text.

Tables go into the edition package, in `collation/<work>/<id>.json`, with their settings, a hash of their input, your
corrections and their log. The table also saves as CSV.

### Sharing and releasing

Editors working on one edition each keep a copy and exchange packages, by email, a shared drive or GitHub. One
transcriber to a witness avoids most clashes; the rest Manuscribe shows, and never settles by itself.

- **Share › Compare and merge…** reads a package from another editor, or an older one of your own, and
  shows what differs: transcriptions, with the lines that differ; alignments and decisions, block by block; evidence
  and registers; and settings changed on both sides. Every package carries `manifest.json`, the SHA-256 of each of its
  files, and the edition remembers what both copies had at the last exchange. So a change made in one copy only is
  taken from that copy, and only what both changed is yours to choose, keeping your own unless you choose theirs.
  Without that record (a package made before this), every difference is shown as made on both sides.
- **Decisions are never chosen between.** Both logs are kept whole. Where the two copies decide one place differently,
  both decisions stay, the place is marked, the apparatus checks list it, and the text view shows the two side by side,
  each with who made it and when: **Keep this**, or decide anew, settles it, and both stay in the history. A decision
  whose columns are not in the alignment it is brought into goes to review.
- A transcription changed in both copies cannot be combined line by line: keep one. Where both copies corrected the
  alignment of a block, yours is kept, with all decisions of both. **Nothing is lost:** before every merge both
  copies are kept whole in this browser, until you delete them under **Kept copies**, where each downloads as an
  ordinary package.
- **Share › GitHub…** keeps the package in a repository: give the owner, repository, branch and folder, and paste a
  fine-grained personal access token for that repository with *Contents: read and write*. The token is forgotten when
  the page closes, unless you ask for it to be remembered on this computer. **Send** makes one commit of what has
  changed; it is refused if the repository has changes this copy has not seen, and then **Fetch and merge** brings
  them in, through the same comparison, before you send. PDFs are never sent, and any found in the repository are
  left there and named. This works from a page opened from disk, as from the web.
- **Issue edition…**, in the Publish step, releases a version. Give the editor, the licence of the edition, the version, and for each
  witness where its images are and what rights there are in them; a DOI too, if you have one. A self-check, after the
  criteria of the Institut für Dokumentologie und Editorik (IDE) for reviewing scholarly digital editions, lists what
  a reviewer would look for and Manuscribe can see; a failure (no title, editor or licence, a problem in the
  apparatus, such as a conflict not settled) stops the issue. **Issue this version** then makes every output at
  once, each with the version, its date and the citation: the package; for each work the reader, the print edition
  for LaTeX, the apparatus in TEI and as text, and the indices; `CITATION.cff`; `.zenodo.json`; and `RELEASE.txt`
  with the self-check. A version is issued once. Anything changed afterwards makes the citation read *draft after
  version 1.0* until the next one.
- **A DOI:** at [Zenodo](https://zenodo.org), start a new upload and choose *Reserve DOI*, give that DOI under
  **Issue edition…**, issue, and upload the ZIP to the reserved record. The images of the manuscripts are not in the
  release; their holders' terms decide where they may go.

## Exporting

### TEI XML

**Export › TEI XML** checks the document and lists problems: duplicate `xml:id`s, unclosed quotations, text
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

## Text proposed by recognition or AI

**Import recognised text…** in the Manuscript tab brings in what handwriting or print recognition made, in PAGE-XML
(as from Transkribus, eScriptorium or Kraken) or ALTO, or the output of any other program, AI included, as plain text
(a line for each line; a form feed, or a line of three dashes, starts the next page). Say which folio side each page
is, and for several regions which block each goes to; and what made it: the program, its model, version and date,
and for AI output the prompt, of which only a SHA-256 hash is kept.

- **Nothing you have typed is replaced.** Each recognised line goes to its own line of the block, and only if that
  line is empty. A proposed line shows in a lighter colour, dotted, with its source and confidence when you point at it.
- **Read it, correct it, accept it** with Alt+Y (Ctrl+Alt+Y if that is your modifier); with Shift, every proposed line on the
  folio side. Until it is accepted a proposed line is **not collated**: it counts as text not yet read, neither
  agreeing nor differing. The TEI export names each program in the header (`<appInfo>`) and warns of lines not yet
  accepted.
- **Error rate:** what each line was when proposed is kept, so the Manuscript tab gives each source's character error
  rate on the lines you have corrected and accepted.
- **Does it read, or remember?** A model that knows a famous text may write that text rather than the manuscript's.
  **Test…** takes the accepted lines of a source and the same passage as printed: wherever the manuscript differs
  from the print, it looks at what the source proposed. It passes if at least five such places are tested and at most
  one in ten shows the printed reading. AI output is accepted a line at a time until it passes.
- Manuscribe sends nothing to any AI service.

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

**Exporting and importing again.** Importing an XML file exported by Manuscribe gives back the same
text, tags, attributes, line numbers, cited works, manuscript details and layout, and exporting again
gives the same `<body>`. XML does not carry the PDF, the calibration or your settings: use a Backup file
for those.

**Mismatched tags.** A file in which a note or addition is closed by the wrong tag, or never closed, is not
imported, because reading past it would run the text together. The dialog lists the lines to correct, and
nothing is changed. Other unmatched tags are tolerated, since a copied folio may start inside a `<p>`.

**Replacing folios.** When a file would change text you already have, the dialog lists the lines that
would change, so that an older file cannot silently undo later work. The present state is kept first as an
automatic backup (Manuscript tab → Restore an automatic backup).

## Folio numbering and missing folios

Say which folio the first PDF page with text shows, and whether each PDF page shows one or two folio
sides. The pages after it are numbered 1r, 1v, 2r, 2v and so on. You can change this in the Manuscript
tab, and rename any single folio in the Folio tab (the following ones are not renumbered).

Some manuscripts give every side its own number, so that the back of 5 is 6. For these, choose **side:
neither: each side has its own page number**, and the sides are numbered 1, 2, 3 and so on, with no r or v.

Name the folios the manuscript lacks as `7, 12-14, 20v`. A number leaves out both sides of that folio,
and `20v` leaves out one side. With page numbers, `7, 12-14` are pages. The PDF pages then map to the
folios that remain.

Your text is stored by folio or page number. When you change the numbering of a transcription that has
text, you choose: each side keeps its text beside the same PDF page and takes its new number, or keeps its
number and sits beside another PDF page. A backup is made first either way.

## Settings

**⚙** opens Settings, on the transcription screen and on the edition screen.

**Interface** is about this browser, not the edition: it is kept here, and never changes what an edition holds.

- **How much is shown:** *Simple*, the everyday work, with the rest a click away in Settings (the start for a new
  browser); or *Full*, every tool in view: the screen you are on is drawn again as you close Settings, the tools of
  the Collate step in a row rather than a menu, **Share…** above the steps, the Letters view and the evidence form
  in a block, the folds of normalisation rules, and the exchange formats in Export.
- **Language features:** the *South Asian scripts* pack brings typing schemes and gemination, the Sanskrit, Prakrit
  and Old Gujarati normalisation, akṣara tokens, metre and the pāda index, the Sanskrit names of commentary
  evidence, Export for Saktumiva, and the PDF in Manuscribe's Devanagari font. It is on when a witness's language
  tag calls for it (`sa`, `pra`, `hi`, `gu` and other languages of South Asia, or a Brahmic script such as `Deva` or
  `Shrd`), and can be switched on or off by hand.
- **Each tool on its own:** a switch for every tool beyond the everyday ones: normalisation rule by rule, aligning
  again and importing an alignment, agreement and samples, the letter view, evidence beyond the witnesses, linked
  commentaries, the stemmatic workbench, testimonia, parallels and the concordance, indices, sharing, DTS, the
  exchange formats of a table, the tag summary, and the memorisation test. A ticked tool is shown whatever the level.

**Transcription**, with a transcription open, is about that transcription and goes with it:

| Setting | Choices |
|---|---|
| Shortcut key for tags | ⌥/Alt + letter, or ⌃⌥ + letter (the Mac default, which keeps ⌥ free for typing diacritics) |
| Typing (with the South Asian pack) | Off, or ITRANS, Harvard-Kyoto or SLP1, into Devanagari or IAST |
| Gemination (with the South Asian pack) | Double the consonant after r while typing (off by default) |
| Paper colour | Taken from the PDF, cream or white |
| Line guide on the PDF | Highlight the current line, dim everything else, or off |
| Paragraph, verse and quotation markers | Show or hide |
| Notes without a placeholder | The list of types, `FR, HND, CSP` to begin with |

## Saving and backups

Your work is saved automatically in the browser on this computer, together with the PDF. Clearing
the browser's data deletes it, and Safari clears the data of a website not visited for a while
(not of an installed app), so keep it outside the browser too. The start screen says when it last was.

- **Back up everything** (start screen) saves one file, `Manuscribe backup <date>.zip`, with every
  transcription and every edition, its collation tables and decisions included. **Open…** reads it
  back: what is not in the browser is added, and what is there is replaced only where the backup's
  copy is newer. The PDFs are not in it; Manuscribe asks for each when it is opened.
- **Keep backups in a folder…** (Chrome and Edge): choose a folder once, in Documents or Dropbox for
  example, and Manuscribe writes `Manuscribe backup.zip` there by itself, a few minutes after a change
  and when you leave the window, with a dated copy of each day, the last seven kept. After the
  browser restarts it may ask once more for permission (**Resume backups**).
- **A reminder:** after an hour of work kept only in the browser, a bar offers a backup (or, in
  Chrome and Edge, a folder for backups). **Later** puts it off for an hour.

- **Export › Backup file** (Ctrl/⌘+S) saves a `.manuscribe.json` file. **Open…** on the start screen
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
Manuscribe.html         launcher to double-click (redirects to app/index.html)
index.html              the front page of the website (GitHub Pages); its links come from app/js/site.js
LICENSE                 GNU General Public License, version 3
tools/package.mjs       makes the downloadable copy, Manuscribe.zip (for each release)
.github/workflows/      release.yml: a release with Manuscribe.zip for each version tagged
app/index.html          the application
app/css/app.css         the look of the application
app/img/                the logo, and the icons of the installed app
app/manifest.webmanifest  the app as one to install: name, icons, its own window
app/sw.js               offline: keeps every file of the app in the browser (list written by tools/precache.mjs)
app/version.json        the version, read by downloaded copies to learn of a newer one (written by tools/precache.mjs)
app/js/
  site.js               where Manuscribe is published: the one place to change if it moves
  install.js            offline, updates, the Install button, files opened with the installed app
  safety.js             work kept safe outside the browser: back up everything, a backup folder, the reminder
  device.js             what the screen is: narrow, sheets, tablet, touch, as classes on <body>
  narrow.js             phones: the line view, the bars folded (the scan's controls under ⋯, the status line atop the typing area), the Tags panel, the long press, the keyboard
  util.js               DOM and string helpers
  tei.js                the tag set; stored TEI to editable HTML and back
  translit.js           the typing schemes
  store.js              IndexedDB, with localStorage as a fallback
  model.js              the project, folio numbering, layouts, geometry
  foliostyle.js         the look of a folio (also copied into the HTML export)
  foliolayout.js        sizing and measuring a folio (also copied into the HTML export)
  spans.js              tags over several lines and folios
  importxml.js          the tolerant XML reader, for paste and import
  zip.js                ZIP files, using the browser's own compression
  edition.js            editions: witnesses, citation IDs, packages
  normalize.js          normalisation: writing, rules, profiles, offset map, tokens
  tokens.js             from stored lines to witness layers and tokens with source pointers
  normview.js           the Normalisation part of the edition screen, and its preview
  collate.js            collation: the aligner in a Worker, tables, agreement, exchange formats
  collateedit.js        correcting a table: the operation log, locks, places to check, aligning around locks
  collateview.js        the Collation part of the edition screen, and the table
  apparatus.js          the edited text and apparatus: entries, conventions, checks, search, TEI
  publish.js            the reader file and the reledmac edition, with conspectus, principles and citation
  markdown.js           Markdown: the edition with its apparatus as footnotes; a transcription by folio and line
  stemma.js             stemmatics: agreement, distance, trees, parsimony, copies, reconstruction, NEXUS and DOT
  stemmaview.js         the stemmatic workbench and its drawings
  metre.js              syllable weight, and which metre a verse is in
  layers.js             links between a commentary and its base text, evidence, testimonia and parallels
  concord.js            the concordance over witnesses and brought-in texts, and the word and pāda indices
  layersview.js         the screens for links, the registers, the concordance and the indices
  exchange.js           comparing two copies of an edition, and merging them three ways
  github.js             the edition in a GitHub repository, through the REST API
  release.js            issuing a version: the self-check, and every output at once
  exchangeview.js       the screens for comparing, GitHub, kept copies and issuing
  features.js           what is shown: the level, a switch for each tool, the language packs
  htr.js                text proposed by recognition or AI: PAGE-XML, ALTO and plain text, error rate, memorisation test
  dts.js                the edition as static files in the shape of DTS 1.0
  printhtml.js          the print edition as pages laid out by the browser, in any script, for Save as PDF
  shaper.js             HarfBuzz text shaping, from WebAssembly, for the PDF
  pdfwrite.js           a small PDF writer: shaped glyphs in an embedded font, searchable
  typeset.js            the print edition as a PDF: pages, numbered lines, the apparatus at the foot
  ui.js                 dialogs and forms
  pdfview.js            the PDF pane and calibration
  editor.js             the folio editor
  commands.js           tags, shortcuts, the toolbar, the Tag tab
  export.js             TEI export and its dialog
  exporthtml.js         the HTML export
  teischema.js          elements and attributes allowed by TEI (generated)
  tagsummary.js         the summary of tags and attributes
  app.js                the application and its tabs
app/vendor/             pdf.js 3.11.174; saktumiva-aligner.js, generated from Saktumiva 2.0 by tools/bundle-aligner.mjs
```

**After changing any file in `app/`, run `node tools/precache.mjs`.** It writes the list of files that
`app/sw.js` keeps offline, with a version made from their contents, so that browsers see the change
and offer to reload into it; `tests/t-offline.js` fails while the list is out of date.

**Making a release.** Set `ME.VERSION` in `app/js/util.js`, run `node tools/precache.mjs`, commit,
then tag and push the tag: `git tag v0.9.1 && git push origin v0.9.1`. The Release workflow
(`.github/workflows/release.yml`) checks that the tag and the version agree, makes `Manuscribe.zip`
with `tools/package.mjs`, and attaches it to a GitHub release. The download link on the front page
and in the README always gives the newest one, and copies already downloaded say that it is out.
The website itself is updated by any push to `main` (GitHub Pages), and open apps offer a Reload.

**Where Manuscribe is published** is in `app/js/site.js`: the website, the repository, and the address
of the newest download. To move to a domain of its own, change it there (and set the domain in the
repository's GitHub Pages settings). Browsers keep each person's work under the address they opened
Manuscribe from, so keep the old address up for a while, for people to make a backup there.

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

## Citing Manuscribe

`CITATION.cff` says how to cite Manuscribe itself; GitHub shows it as *Cite this repository*. Every output names the
version of Manuscribe that made it (`ME.VERSION` in `app/js/util.js`). For a DOI of Manuscribe's own, connect the
repository to Zenodo (Zenodo › GitHub, switch the repository on) and publish a GitHub release; Zenodo then gives
that release a DOI, which can be added to `CITATION.cff` as `doi:`.

## Credits and licences

Manuscribe is licensed under the [GNU General Public License, version 3](LICENSE) (GPL-3.0).

It includes these components, which keep their own licences:

| Component | Licence |
|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174, Mozilla | Apache License 2.0 |
| Tiro Devanagari Sanskrit, © The Indigo Project Authors ([Tiro Typeworks](https://github.com/TiroTypeworks/Indigo)), fetched from [google/fonts](https://github.com/google/fonts/tree/main/ofl/tirodevanagarisanskrit) the first time Manuscribe is opened and kept in the browser, never shipped with it; its licence goes with every export that carries it | SIL Open Font License 1.1 |
| Noto fonts, © Google and the Noto Project Authors, fetched when an edition needs them and kept in the browser, never shipped with Manuscribe ([notofonts](https://github.com/notofonts), [google/fonts](https://github.com/google/fonts)) | SIL Open Font License 1.1 |
| The aligner of [Saktumiva 2.0](https://github.com/chchch/saktumiva), Charles Li (`app/vendor/saktumiva-aligner.js`), and its normalisation rules, rewritten as data in `app/js/normalize.js` | GNU GPL 3.0 |
| [HarfBuzz](https://github.com/harfbuzz/harfbuzz), as compiled to WebAssembly by [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) 1.6.4 (`app/vendor/harfbuzz.wasm.js`, made by `tools/bundle-harfbuzz.mjs`) | MIT (harfbuzzjs) and "Old MIT" (HarfBuzz) |
| Metre lists of [Sanskrit metres](https://github.com/shreevatsa/sanskrit), Shreevatsa Rajagopalan, from the Vṛttaratnākara and a large list input by Dr. Dhaval Patel, the latter after Anand Mishra's [Chanda](http://sanskrit.sai.uni-heidelberg.de/Chanda/HTML/) as scraped by Mārcis Gasūns (`app/vendor/metres.js`, made by `tools/bundle-metres.mjs`) | GNU GPL 2.0, as in that project |
| Element and attribute lists from the [TEI P5 Guidelines](https://tei-c.org/) | CC BY 3.0 and BSD 2-Clause, © TEI Consortium |

The tag set follows the [Saktumiva TEI guide](https://www.saktumiva.org/wiki/tei).
