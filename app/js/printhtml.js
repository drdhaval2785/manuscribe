'use strict';
/* The print edition as a page that lays itself out in the browser that opens it, for any language and script: the
   browser shapes the text, breaks its lines and sets right-to-left scripts as it does any web page, in whatever fonts
   are named or given. The page then cuts the edition into pages itself, with the notes of each page at its foot,
   keyed to markers in the text, and the browser's Print, or Save as PDF, makes the PDF: with the fonts embedded and
   the text searchable, in any script. */
(function (ME) {
  const { U } = ME;
  const P = {};

  P.PAPER = { a4: { name: 'A4', w: '210mm', h: '297mm' }, letter: { name: 'US Letter', w: '8.5in', h: '11in' }, book: { name: 'Book, 156 × 234 mm', w: '156mm', h: '234mm' } };
  // lines: numbered afresh on each page, or through the whole text; every: which lines carry their number
  P.DEFAULTS = { paper: 'a4', size: 12, font: '', fontId: null, lines: 'page', every: 5 };
  P.settings = (ed) => Object.assign({}, P.DEFAULTS, ed.print || {});

  const esc = (s) => U.escXml(String(s));
  // an apparatus entry as printed, with its <sup> kept and everything else as text
  const rich = (s) => esc(s).replace(/&lt;sup&gt;/g, '<sup>').replace(/&lt;\/sup&gt;/g, '</sup>').replace(/‡/g, '[…]');

  // a script as its name: sa-Deva or Deva is Devanagari; anything else as written
  const scriptName = (t) => {
    const m = /^(?:[a-z]{2,3}-)?([A-Z][a-z]{3})$/.exec(String(t || '').trim());
    if (!m) return t;
    try { return new Intl.DisplayNames(['en'], { type: 'script' }).of(m[1]) || t; } catch (e) { return t; }
  };
  // the language of the edited text, from its witnesses
  const langOf = (list) => { const l = list.map((x) => x.p && x.p.meta && x.p.meta.textLang).find(Boolean); return l || 'und'; };

  /* What the page needs: front matter, and each block's text with its anchors, and its notes by series. */
  P.data = function (ed, list, built) {
    const A = ME.Apparatus;
    const byMarkers = A.settings(ed).keys !== 'lines';
    const blocks = built.map((b) => {
      const markers = A.markers(ed, b);
      const { text, anchors, unsure } = A.anchors(b);
      // the text, with an anchor after each lemma
      const cuts = [];
      for (const an of anchors) if (markers.has(an.i)) cuts.push({ at: an.empty ? an.start : an.at, k: markers.get(an.i) });
      for (const [f, t] of unsure) { cuts.push({ at: f, open: true }); cuts.push({ at: t, close: true }); }
      cuts.sort((x, y) => x.at - y.at || (x.close ? -1 : 0) - (y.close ? -1 : 0));
      let html = '', pos = 0;
      for (const c of cuts) {
        html += esc(text.slice(pos, c.at));
        pos = c.at;
        if (c.open) html += '<span class="unsure">';
        else if (c.close) html += '</span>';
        else html += '<span class="an" data-k="' + c.k + '">' + (byMarkers ? '<sup>' + c.k + '</sup>' : '') + '</span>';
      }
      html += esc(text.slice(pos));
      const tiers = A.tiers(ed, b.entries);
      const notes = [];
      b.entries.forEach((e, i) => {
        if (!markers.has(i)) return;
        const series = A.series(ed, b, e, tiers);
        const by = {};
        for (const s of series) {
          if (s === 'B') by.B = esc((e.lemma || '⌀') + ' ] ' + e.testimonia.map(ME.Layers.formatEvidence).join('; '));
          else if (s === 'E') { const d = e.decision; by.E = esc((e.lemma || '⌀') + ' ] ' + [d.type === 'selectio' ? 'chosen' : d.type, d.source, ...(d.reasons || []), d.note].filter(Boolean).join('; ')); }
          else by[s] = rich(A.format(ed, e));
        }
        notes.push({ k: markers.get(i), by });
      });
      // a layer of a layered edition: set in by its depth, with its [abbreviation] first
      const L = b.layer;
      const lead = L && L.depth ? '<span class="labl" title="' + esc(L.name) + '">[' + esc(L.abbr) + ']</span> ' : '';
      return { id: b.table.unit, html: lead + html.replace(/\s+/g, ' ').trim(), notes, depth: L ? L.depth : 0, layer: L && L.depth ? L.code : '', abbr: L && L.depth ? L.abbr : '' };
    });
    const layered = blocks.some((b) => b.depth);
    const s = P.settings(ed);
    return {
      title: ed.title || 'Edition', editor: ed.editor || '', citation: ME.Publish.citation(ed), lang: langOf(list),
      conspectus: ME.Publish.conspectus(ed, list).map((r) => ({ siglum: r.siglum + (r.group ? ' (' + r.group + ')' : ''), desc: [[r.place, r.shelfmark || r.title].filter(Boolean).join(', '), r.date, scriptName(r.script)].filter(Boolean).join('; ') })),
      principles: ME.Publish.declaration(ed, built), byMarkers, blocks,
      unspaced: ME.Norm.unspacedText(built.map((b) => b.text).join(' ').slice(0, 20000)),
      layers: layered ? ME.LayerIds.legend(ed) : [],
      stars: built.flatMap((b) => b.stars).map((x) => ({ id: x.id, wits: x.wits.join(' '), text: x.text })),
      labels: { B: 'Testimonia:', C: 'Singular readings:', D: 'Spelling:', E: 'Decisions:' },
      paper: P.PAPER[s.paper] || P.PAPER.a4, size: s.size, lines: s.lines === 'text' ? 'text' : 'page', every: s.every === 1 ? 1 : 5,
    };
  };

  /* ---------- the layout, which runs in the page ---------- */

  // Runs inside the print page and may use nothing from outside it.
  function paginate() {
    const D = JSON.parse(document.getElementById('edition-data').textContent);
    const book = document.getElementById('book');
    const el = (tag, cls, html) => { const x = document.createElement(tag); if (cls) x.className = cls; if (html !== undefined) x.innerHTML = html; return x; };
    /* The text is cut into pieces whose lines are measured. Words, where a language spaces them; letters, where it
       does not (Japanese, Chinese, Thai…), since a line may break inside a word there and a word would be counted
       on one line though it runs onto the next. */
    const unspaced = D.unspaced || /^(ja|zh|yue|th|lo|km|my|bo)\b/i.test(D.lang);
    const seg = (() => { try { return new Intl.Segmenter(D.lang === 'und' ? undefined : D.lang, { granularity: unspaced ? 'grapheme' : 'word' }); } catch (e) { return null; } })();
    let pageNo = 0;
    const report = { pages: 0, overfull: 0, pagesInfo: [] };
    let pg = null, textLines = 0;
    function newPage(running) {
      // the lines of the page before go into the count through the text
      if (pg && pg.lines) textLines += pg.lines;
      const p = el('section', 'page');
      pageNo++;
      p.id = 'page-' + pageNo;
      p.innerHTML = (running ? '<header class="rh"><span class="rt"></span><span class="pn">' + pageNo + '</span></header>' : '') + '<div class="body"></div><div class="foot"></div>';
      if (running) p.querySelector('.rt').textContent = D.title;
      book.appendChild(p);
      return { el: p, body: p.querySelector('.body'), foot: p.querySelector('.foot'), notes: [], running, no: pageNo };
    }
    // does the page's body still clear its notes, and the page's bottom?
    const fits = (pg) => {
      const page = pg.el.getBoundingClientRect(), body = pg.body.getBoundingClientRect();
      const limit = pg.foot.childElementCount ? pg.foot.getBoundingClientRect().top - 8 : page.bottom - parseFloat(getComputedStyle(pg.el).paddingBottom);
      return body.bottom <= limit + 0.5;
    };
    const SER = ['A', 'B', 'C', 'D', 'E'];
    let textDir = '';
    // in a layered edition, the notes keep the order of the blocks: a verse's, then its commentary's under its [abbreviation]
    const abbrOf = new Map(D.layers.map((l) => [l.code, l.abbr]));
    function drawNotes(pg) {
      pg.foot.innerHTML = '';
      // the notes run in the direction of the text, right to left for Arabic or Hebrew
      if (textDir) pg.foot.dir = textDir;
      for (const s of SER) {
        const here = pg.notes.filter((n) => n.note.by[s]);
        if (!here.length) continue;
        const p = el('p', 'ser ser-' + s);
        if (D.labels[s]) p.appendChild(el('span', 'lab', D.labels[s]));
        for (const n of here) {
          const span = el('span', 'note');
          span.dataset.k = n.block + '#' + n.note.k;
          // the note's number on this page (or its line), a link back to its place in the text
          const i = pg.notes.indexOf(n) + 1;
          span.innerHTML = '<a class="nk" id="fn-' + pg.no + '-' + i + '" href="#fr-' + pg.no + '-' + i + '">' + (D.byMarkers ? i : n.line) + '</a> ' + n.note.by[s];
          p.appendChild(span);
          p.appendChild(document.createTextNode(' '));
        }
        pg.foot.appendChild(p);
      }
      // the markers in the text take the same numbers, 1 on, on each page, and lead to their notes
      pg.notes.forEach((n, j) => {
        const an = [...pg.body.querySelectorAll('[data-block] .an[data-k="' + n.note.k + '"]')].find((x) => x.closest('[data-block]').dataset.block === n.block);
        if (!an) return;
        an.id = 'fr-' + pg.no + '-' + (j + 1);
        const sup = an.querySelector('sup');
        if (sup) sup.innerHTML = '<a href="#fn-' + pg.no + '-' + (j + 1) + '">' + (j + 1) + '</a>';
      });
    }
    // ---- front matter ----
    pg = newPage(false);
    const front = (node) => { pg.body.appendChild(node); if (!fits(pg) && pg.body.childElementCount > 1) { pg.body.removeChild(node); pg = newPage(false); pg.body.appendChild(node); } };
    { const x = el('h1', 'title'); x.textContent = D.title; front(x); }
    if (D.editor) { const x = el('p', 'editor'); x.textContent = 'edited by ' + D.editor; front(x); }
    { const x = el('p', 'cite'); x.textContent = D.citation; front(x); }
    front(el('h2', null, 'Conspectus siglorum'));
    { const t = el('table', 'consp'); for (const r of D.conspectus) { const tr = el('tr'); const a = el('td', 'sig'); a.textContent = r.siglum; const b = el('td'); b.textContent = r.desc; tr.append(a, b); t.appendChild(tr); } front(t); }
    if (D.layers.some((l) => l.depth)) {
      front(el('h2', null, 'The commentaries'));
      const t = el('table', 'consp');
      for (const l of D.layers.filter((x) => x.depth)) { const tr = el('tr'); const a = el('td', 'sig'); a.textContent = '[' + l.abbr + ']'; const b = el('td'); b.textContent = l.name; b.style.paddingInlineStart = ((l.depth - 1) * 1.2) + 'em'; tr.append(a, b); t.appendChild(tr); }
      front(t);
    }
    front(el('h2', null, 'Editorial principles'));
    for (const text of D.principles) { const x = el('p', 'pr'); x.textContent = text; front(x); }
    // ---- the edition ----
    pg = newPage(true);
    const measure = el('div', 'body measure');
    for (const b of D.blocks) {
      // the whole block, at the width of the page, to find its lines
      const page0 = pg.el;
      measure.style.width = pg.body.getBoundingClientRect().width + 'px';
      page0.appendChild(measure);
      const depthCls = b.depth ? ' d' + Math.min(b.depth, 6) : '';
      const full = el('p', 'txt' + depthCls);
      full.lang = D.lang; full.dir = 'auto';
      full.innerHTML = b.html;
      // measured with the numbers its markers will have on this page, so that renumbering them cannot make a line
      // longer (on the next page they start again from 1, and are no wider)
      if (D.byMarkers) { let k = pg.notes.length; for (const sup of full.querySelectorAll('.an sup')) sup.textContent = String(++k); }
      measure.innerHTML = '';
      measure.appendChild(full);
      if (!textDir) textDir = getComputedStyle(full).direction;
      // cut its text into words, each in a span, so that each knows its line
      const items = [];
      const walk = (node, into) => {
        for (const c of Array.from(node.childNodes)) {
          if (c.nodeType === 3) {
            const parts = seg ? Array.from(seg.segment(c.nodeValue), (x) => x.segment) : c.nodeValue.split(/(\s+)/);
            const frag = document.createDocumentFragment();
            for (const t of parts) { if (!t) continue; const s = el('span', 'w'); s.textContent = t; frag.appendChild(s); into.push({ node: s }); }
            c.replaceWith(frag);
          } else if (c.classList && c.classList.contains('an')) into.push({ node: c, anchor: +c.dataset.k });
          else if (c.classList && c.classList.contains('unsure')) { const inner = []; walk(c, inner); for (const x of inner) x.unsure = true; into.push(...inner); }
          else into.push({ node: c });
        }
      };
      walk(full, items);
      // a new line where a piece starts below the bottom of the line so far: pieces set in different fonts (kanji
      // and kana, say) sit a little higher or lower on one line, and are not a line each
      let line = -1, bottom = -Infinity;
      for (const it of items) {
        const r = it.node.getClientRects()[0] || it.node.getBoundingClientRect();
        if (it.node.textContent.trim() || it.anchor) {
          if (r.top >= bottom - 1) { line++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom);
        }
        it.line = Math.max(0, line);
      }
      const nLines = line + 1;
      page0.removeChild(measure);
      const noteOf = (k) => b.notes.find((n) => n.k === k);
      const lineOfAnchor = new Map(items.filter((x) => x.anchor).map((x) => [x.anchor, x.line + 1]));
      // a fragment of the block: lines a..z, as a paragraph of its own
      const fragment = (a, z) => {
        const p = el('p', 'txt' + depthCls + (z < nLines - 1 ? ' cont' : '') + (a === 0 ? ' first' : ''));
        p.lang = D.lang; p.dir = 'auto';
        let un = null;
        for (const it of items) {
          if (it.line < a || it.line > z) continue;
          const node = it.node.cloneNode(true);
          if (it.unsure) { if (!un) { un = el('span', 'unsure'); p.appendChild(un); } un.appendChild(node); } else { un = null; p.appendChild(node); }
        }
        p.dataset.from = a; p.dataset.block = b.id;
        return p;
      };
      // a note cites its line as numbered in the margin: on the page, or through the text
      const notesIn = (a, z) => items.filter((x) => x.anchor && x.line >= a && x.line <= z).map((x) => ({ block: b.id, layer: b.layer, note: noteOf(x.anchor), line: lineBase(pg) + (x.line - a) + 1 })).filter((n) => n.note);
      // place it: on each page, as many lines as fit with their notes. No internal reference is printed: a reader
      // finds a place by the page, its lines and the notes' numbers
      let a = 0;
      while (a < nLines) {
        const headEl = null;
        let best = -1, shown = null;
        for (let z = a; z < nLines; z++) {
          const p = fragment(a, z);
          if (shown) shown.replaceWith(p); else pg.body.appendChild(p);
          shown = p;
          const kept = pg.notes;
          pg.notes = kept.concat(notesIn(a, z));
          drawNotes(pg);
          const ok = fits(pg);
          pg.notes = kept;
          if (!ok) break;
          best = z;
        }
        if (best < 0) {
          shown.remove();
          if (headEl) headEl.remove();
          drawNotes(pg);
          if (pg.body.childElementCount) { pg = newPage(true); continue; }
          // not one line fits even on an empty page: it is set anyway, and counted
          if (headEl) pg.body.appendChild(headEl);
          const p = fragment(a, a);
          pg.body.appendChild(p);
          pg.notes = pg.notes.concat(notesIn(a, a));
          drawNotes(pg);
          report.overfull++;
          numberLines(pg, p);
          a++;
          if (a < nLines) pg = newPage(true);
          continue;
        }
        const p = fragment(a, best);
        shown.replaceWith(p);
        pg.notes = pg.notes.concat(notesIn(a, best));
        drawNotes(pg);
        numberLines(pg, p);
        a = best + 1;
        if (a < nLines) pg = newPage(true);
      }
    }
    // the lines of the text, counted down the page, or on through the text; every fifth (or every one) numbered
    function lineBase(page) { return (D.lines === 'text' ? textLines : 0) + (page.lines || 0); }
    function numberLines(page, p) {
      const tops = [];
      let bottom = -Infinity;
      const rects = [...p.querySelectorAll('.w')].filter((s) => s.textContent.trim()).map((s) => s.getClientRects()[0]).filter(Boolean).sort((x, y) => x.top - y.top);
      for (const r of rects) { if (r.top >= bottom - 1) { tops.push(r.top); bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom); }
      const base = page.el.getBoundingClientRect();
      const rtl = getComputedStyle(p).direction === 'rtl';
      const from = lineBase(page);
      page.lines = (page.lines || 0) + tops.length;
      tops.forEach((t, i) => {
        const n = from + i + 1;
        if (n % D.every) return;
        const m = el('span', 'ln' + (rtl ? ' rtl' : ''));
        m.textContent = n;
        m.style.top = (t - base.top) + 'px';
        page.el.appendChild(m);
      });
    }
    // ---- additional passages ----
    if (D.stars.length) {
      pg = newPage(true);
      pg.body.appendChild(el('h2', null, 'Additional passages'));
      for (const s of D.stars) { const x = el('p', 'star'); x.lang = D.lang; x.dir = 'auto'; x.textContent = s.id + ' (' + s.wits + '): ' + s.text; pg.body.appendChild(x); if (!fits(pg)) { pg.body.removeChild(x); pg = newPage(true); pg.body.appendChild(x); } }
    }
    // for checking: on each page, the markers in its text and the notes at its foot
    for (const p of document.querySelectorAll('.page')) {
      const inText = [...p.querySelectorAll('.body .an')].map((x) => x.closest('[data-block]').dataset.block + '#' + x.dataset.k);
      const inFoot = [...new Set([...p.querySelectorAll('.foot .note')].map((x) => x.dataset.k))];
      const body = p.querySelector('.body').getBoundingClientRect(), foot = p.querySelector('.foot'), fr = foot.getBoundingClientRect(), pr = p.getBoundingClientRect();
      report.pagesInfo.push({ inText, inFoot, clear: !foot.childElementCount || body.bottom <= fr.top + 0.5, within: fr.bottom <= pr.bottom + 0.5 });
    }
    report.pages = pageNo;
    window.__paginated = report;
    if (D.autoPrint) setTimeout(() => window.print(), 300);
  }

  const CSS = (d) => `
@page { size: ${d.paper.w} ${d.paper.h}; margin: 0; }
:root { --pw: ${d.paper.w}; --ph: ${d.paper.h}; --size: ${d.size}pt; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #e9e5dc; }
body { font-family: var(--font); color: #1d1a16; }
#book { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px 0; }
.page { position: relative; width: var(--pw); height: var(--ph); background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.18); padding: 20mm 18mm 18mm 20mm; overflow: hidden; break-after: page; page-break-after: always; }
.rh { position: absolute; top: 10mm; left: 20mm; right: 18mm; display: flex; justify-content: space-between; font-size: calc(var(--size) * 0.72); border-bottom: 0.4pt solid #555; padding-bottom: 1.5mm; }
.body { font-size: var(--size); line-height: 1.55; }
.measure { position: absolute; visibility: hidden; left: 0; top: 0; }
.txt { margin: 0 0 0.4em; text-align: justify; hyphens: auto; }
.txt.cont { text-align-last: justify; }
.bid { font-size: calc(var(--size) * 0.72); color: #6b5a3e; margin-top: 0.7em; }
/* the layers of a layered edition: each deeper one set in further, and smaller */
.d1 { margin-inline-start: calc(var(--size) * 1.4); } .d2 { margin-inline-start: calc(var(--size) * 2.8); } .d3 { margin-inline-start: calc(var(--size) * 4.2); }
.d4 { margin-inline-start: calc(var(--size) * 5.4); } .d5 { margin-inline-start: calc(var(--size) * 6.4); } .d6 { margin-inline-start: calc(var(--size) * 7.2); }
.txt.d1 { font-size: 0.93em; } .txt.d2 { font-size: 0.87em; } .txt.d3 { font-size: 0.82em; } .txt.d4, .txt.d5, .txt.d6 { font-size: 0.78em; }
.labl { font-weight: 600; color: #8c2a17; }
.ser-layer .labl { margin-inline-end: 0.4em; }
.an sup, .nk { color: #8c2a17; }
.an sup a { color: inherit; text-decoration: none; }
a.nk { color: #8c2a17; text-decoration: none; }
.txt.first { margin-top: 0.45em; }
.an sup { font-size: 0.6em; line-height: 0; }
.unsure { text-decoration: underline dotted; text-underline-offset: 0.25em; }
.ln { position: absolute; left: 9mm; font-size: calc(var(--size) * 0.66); color: #6b5a3e; line-height: 1.6; }
.ln.rtl { left: auto; right: 8mm; }
.foot { position: absolute; left: 20mm; right: 18mm; bottom: 18mm; font-size: calc(var(--size) * 0.72); line-height: 1.38; border-top: 0.4pt solid #555; padding-top: 2mm; }
.foot:empty { display: none; }
.ser { margin: 0 0 1mm; text-align: justify; }
.lab { font-style: italic; margin-inline-end: 0.4em; }
.note { margin-inline-end: 1.1em; unicode-bidi: isolate; }
.nk { font-weight: 700; }
.bid, .foot .bid { font-weight: 600; }
h1.title { font-size: calc(var(--size) * 2); font-weight: 600; text-align: center; margin: 45mm 0 4mm; }
.editor { text-align: center; font-size: calc(var(--size) * 1.05); margin: 0 0 6mm; }
.cite { text-align: center; font-size: calc(var(--size) * 0.75); margin: 0 0 14mm; }
h2 { font-size: calc(var(--size) * 1.1); font-weight: 600; margin: 6mm 0 2mm; }
.consp { border-collapse: collapse; font-size: calc(var(--size) * 0.85); }
.consp td { padding: 0.5mm 4mm 0.5mm 0; vertical-align: top; }
.consp .sig { font-weight: 600; white-space: nowrap; }
.pr { font-size: calc(var(--size) * 0.85); text-align: justify; margin: 0 0 2mm; }
@media print { html, body { background: #fff; } #book { display: block; padding: 0; } .page { box-shadow: none; margin: 0; } }
`;

  /* The whole page, as a string: open it in a browser, or print it. fonts: [{name, data: base64, format}] */
  P.html = function (ed, list, built, opts) {
    const d = P.data(ed, list, built);
    d.autoPrint = !!(opts && opts.autoPrint);
    const s = P.settings(ed);
    const faces = ((opts && opts.fonts) || []).map((f) => "@font-face { font-family: '" + f.name.replace(/'/g, '') + "'; src: url(data:font/" + (f.format || 'ttf') + ';base64,' + f.data + "); }").join('\n');
    // the edition's font file, then the fonts the editor names, then Manuscribe's own, then the browser's
    const q = (f) => "'" + f.name.replace(/'/g, '') + "'";
    const given = (opts && opts.fonts) || [];
    const stack = [].concat(given.filter((f) => f.kind === 'edition' || (!f.kind && f.name !== 'Tiro Devanagari Sanskrit')).map(q), s.font ? [s.font] : [], given.filter((f) => f.name === 'Tiro Devanagari Sanskrit').map(q), given.filter((f) => f.kind === 'noto').map(q), ["'Noto Serif'", "'Times New Roman'", 'serif']).join(', ');
    const json = JSON.stringify(d).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="' + esc(d.lang) + '">\n<head>\n<meta charset="utf-8">\n<title>' + esc(d.title) + '</title>\n<meta name="generator" content="Manuscribe ' + esc(ME.VERSION) + '">\n'
      + '<style>' + faces + '\n:root { --font: ' + stack + '; }' + CSS(d) + '</style>\n</head>\n<body>\n<div id="book"></div>\n'
      + '<script type="application/json" id="edition-data">' + json + '</script>\n'
      + '<script>(function () { const go = () => (' + paginate.toString().replace(/<\/script/gi, '<\\/script') + ')(); if (document.fonts && document.fonts.ready) Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready).then(go, go); else window.addEventListener("load", go); })();</' + 'script>\n</body>\n</html>\n';
  };

  /* The fonts to embed: the editor's own, if given, and the Devanagari font of Manuscribe where the text needs it. */
  /* The fonts the page carries, in the order it tries them: the edition's own font file; Manuscribe's Tiro, for
     Devanagari and Latin; and for every other letter of the edition, the Noto font of its script (FontLib), fetched
     once and kept in this browser, with only the glyphs the edition uses. list: the witnesses, whose languages choose
     between the Chinese, Japanese and Korean fonts. -> [{name, data (base64), format, kind}] */
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  P.textOf = (ed, built) => [ed.title || '', ed.editor || '', ME.Publish.citation(ed), ...ME.Publish.declaration(ed, built), ...built.map((b) => b.text),
    ...built.flatMap((b) => b.entries.map((e) => ME.Apparatus.format(ed, e))), ...ME.LayerIds.legend(ed).map((l) => l.abbr + ' ' + l.name)].join('\n');
  P.fonts = async function (ed, built, list) {
    const out = [];
    const s = P.settings(ed);
    if (s.fontId && ME.Store.getFont) { const f = await ME.Store.getFont(s.fontId); if (f) out.push({ name: 'Edition ' + f.name, data: f.data, format: f.format, kind: 'edition' }); }
    // Manuscribe's own font, always: the page and the PDF captured from it then set Latin and Devanagari alike
    const t = await ME.Publish.font();
    if (t) out.push({ name: 'Tiro Devanagari Sanskrit', data: t.base64, format: 'ttf', kind: 'tiro' });
    if (!t || !ME.FontLib || !ME.Shaper || typeof WebAssembly === 'undefined') return out;
    try {
      await ME.Shaper.load();
      if (!P.tiro) P.tiro = ME.Shaper.font(Uint8Array.from(atob(t.base64), (c) => c.charCodeAt(0)));
      const text = P.textOf(ed, built);
      // the letters Tiro has not: the scripts whose fonts the page needs
      const lacking = [...new Set(Array.from(text))].filter((ch) => /\S/.test(ch) && !/[\u200B-\u200D\uFEFF]/.test(ch) && !P.tiro.nominal(ch.codePointAt(0))).join('');
      if (!lacking) return out;
      const langs = (list || []).map((x) => x.p && x.p.meta && x.p.meta.textLang).filter(Boolean);
      const got = await ME.FontLib.ensure(lacking, langs, (family) => { if (ME.U && ME.U.toast) ME.U.toast('Getting the font for ' + family.replace(/^Noto(Sans|Serif)?/, '').replace(/([a-z])([A-Z])/g, '$1 $2') + ' (Noto), once: it is kept in this browser', 'info', 4000); });
      for (const f of got.fonts) {
        const sh = ME.Shaper.font(f.bytes);
        const keep = ME.FontLib.glyphsOf(sh, text);
        out.push({ name: f.family, data: b64(ME.FontLib.subset(f.bytes, keep, 'web')), format: 'ttf', kind: 'noto', script: f.script });
      }
      P.missingFonts = got.missing;
    } catch (e) { /* the page then uses the browser's fonts */ }
    return out;
  };

  // Opens the edition, laid out, in a new window, and asks the browser to print it.
  // win: a tab opened already, in the click that asked for it (as Safari requires); else one is opened now
  P.open = async function (ed, list, built, win) {
    const html = P.html(ed, list, built, { autoPrint: true, fonts: await P.fonts(ed, built) });
    const w = win && !win.closed ? win : window.open('', '_blank');
    if (!w) throw new Error('the browser blocked the new window: allow pop-ups for this page, or save the page and open it');
    w.document.open(); w.document.write(html); w.document.close();
    return w;
  };

  ME.PrintHTML = P;
})(window.ME);
