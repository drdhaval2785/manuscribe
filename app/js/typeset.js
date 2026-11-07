'use strict';
/* The print edition as a PDF, made in the browser: no TeX, nothing to install, nothing sent anywhere. HarfBuzz shapes
   the text in the edition's font, and this lays it out as the print page in the browser does (PrintHTML): a title
   page with the conspectus, the commentaries and the principles, then each block of the edited text, the layers of a
   layered edition set in with their [abbreviations], the lines numbered down each page, and under it, on each page,
   the apparatus of the lines on that page, in series: A variants, B testimonia, C singular readings, D spelling,
   E reasons. A line goes to the next page if it and its notes do not fit. */
(function (ME) {
  const T = {};
  const A4 = { w: 595.28, h: 841.89 };
  T.DEFAULTS = { size: 12, lead: 19, appSize: 8.6, appLead: 11.4, small: 9, top: 62, bottom: 58, inner: 64, outer: 58, every: 5 };

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const segmenter = (() => { try { return new Intl.Segmenter('sa', { granularity: 'grapheme' }); } catch (e) { return null; } })();
  const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : Array.from(s));

  /* ---------- paragraphs ---------- */

  // An atom: {t, size, rise, gap (space before it, in points), mark?}; a paragraph is a list of atoms.
  function makeLayout(font) {
    const bare = (a) => font.width(a.t, { lang: 'sa' }) * a.size / font.upem;
    // a word's note markers ride on it, raised and small, and are never parted from it
    const supSize = (a) => a.size * 0.62;
    const supW = (a) => (a.sup ? font.width(a.sup) * supSize(a) / font.upem + a.size * 0.04 : 0);
    const width = (a) => bare(a) + supW(a);
    const space = (size) => font.width(' ') * size / font.upem;
    // a word too long for the line is broken between letters, with a hyphen
    function split(a, w) {
      const parts = [];
      let cur = '';
      for (const g of graphemes(a.t)) {
        if (cur && bare(Object.assign({}, a, { t: cur + g + '-' })) > w - supW(a)) { parts.push(cur + '-'); cur = g; } else cur += g;
      }
      parts.push(cur);
      return parts.map((t, i) => Object.assign({}, a, { t, gap: i ? 0 : a.gap, cont: i > 0, sup: i === parts.length - 1 ? a.sup : undefined, entries: i === parts.length - 1 ? a.entries : [] }));
    }
    /* -> [{atoms: [{...a, x, w}], end: bool (last of the paragraph), natural}] */
    function lines(atoms, w, justify) {
      const out = [];
      let cur = [], x = 0;
      const flush = (last) => {
        if (!cur.length) return;
        const natural = x;
        const gaps = cur.slice(1).filter((a) => a.gap > 0).length;
        const extra = w - natural;
        if (justify && !last && gaps && extra > 0 && extra / gaps < 3 * space(cur[0].size)) {
          let shift = 0;
          for (let i = 0; i < cur.length; i++) { if (i && cur[i].gap > 0) shift += extra / gaps; cur[i].x += shift; }
        }
        out.push({ atoms: cur, end: last, natural });
        cur = []; x = 0;
      };
      for (let a of atoms) {
        let aw = width(a);
        const pieces = aw > w ? split(a, w) : [a];
        for (const p of pieces) {
          aw = width(p);
          const gap = cur.length ? p.gap : 0;
          if (cur.length && x + gap + aw > w + 0.01) { flush(false); }
          const g = cur.length ? p.gap : 0;
          cur.push(Object.assign({}, p, { x: x + g, w: aw }));
          x += g + aw;
        }
      }
      flush(true);
      return out;
    }
    // atoms from text: words, with the size and a space between them
    const words = (text, size, extra) => String(text).split(/ +/).filter(Boolean).map((t, i) => Object.assign({ t, size, rise: 0, gap: i ? space(size) : 0 }, extra));
    // atoms from a printed apparatus entry, with its <sup> as raised small atoms
    const rich = (html, size) => {
      const out = [];
      const re = /<sup>([^<]*)<\/sup>/g;
      let last = 0, m;
      const push = (t, sup) => {
        const parts = t.split(/( +)/);
        for (const part of parts) {
          if (!part) continue;
          if (/^ +$/.test(part)) { out.pendingGap = true; continue; }
          out.push({ t: part, size: sup ? size * 0.7 : size, rise: sup ? size * 0.35 : 0, gap: out.length && (out.pendingGap || !sup) && !(out.glue) ? (out.pendingGap ? space(size) : 0) : 0 });
          out.pendingGap = false;
        }
      };
      while ((m = re.exec(html))) { push(html.slice(last, m.index), false); push(m[1], true); last = m.index + m[0].length; }
      push(html.slice(last), false);
      return out;
    };
    return { lines, words, rich, width, space, bare, supSize };
  }

  /* ---------- the edited text of a block ---------- */

  /* The block's text as words. Each entry is anchored after its lemma (an omission or addition, after the word
     before it), and the word there carries the entry and, if notes are keyed by markers, its number. */
  function blockWords(ed, b, size, L, markers) {
    const { text: raw, anchors, unsure } = ME.Apparatus.anchors(b);
    const text = raw.replace(/\s/g, ' ');
    const atoms = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) atoms.push({ t: m[0].normalize('NFC'), size, rise: 0, gap: atoms.length ? L.space(size) : 0, from: m.index, to: m.index + m[0].length, entries: [] });
    for (const an of anchors) {
      let a;
      if (!an.empty) a = atoms.find((x) => x.from < an.at && x.to >= an.at);
      if (!a) a = atoms.filter((x) => x.to <= an.start).pop() || atoms.find((x) => x.from >= an.start) || atoms[atoms.length - 1];
      if (!a) continue;
      a.entries.push(an.i);
      if (markers && markers.has(an.i)) a.sup = (a.sup ? a.sup + ',' : '') + markers.get(an.i);
    }
    for (const a of atoms) a.unsure = unsure.some(([f, t]) => f < a.to && t > a.from);
    return atoms;
  }

  /* ---------- the apparatus of a page ---------- */

  const SERIES = [['A', ''], ['B', 'Testimonia: '], ['C', 'Singular readings: '], ['D', 'Spelling: '], ['E', 'Decisions: ']];

  const seriesOf = (ed, b, e) => ME.Apparatus.series(ed, b, e);

  // colours of the print page: the block's reference, and the accent of markers, note numbers and [abbreviations]
  const MUTED = [0.42, 0.35, 0.24], ACCENT = [0.55, 0.16, 0.09];

  // the atoms of one note, as on the print page: ([abbreviation]) block, number or line, lemma ] readings
  function noteAtoms(ed, note, s, L, size) {
    const { e, line, unit, first, marker, abbr } = note;
    const head = [];
    if (first && abbr) head.push({ t: '[' + abbr + ']', size, rise: 0, gap: 0, mark: 'accent' });
    if (first) head.push({ t: unit, size, rise: 0, gap: head.length ? L.space(size) : 0, mark: 'unit' });
    head.push({ t: String(marker || line), size, rise: 0, gap: head.length ? L.space(size) : 0, mark: 'accent' });
    let body;
    if (s === 'B') body = (e.lemma || '⌀') + ' ] ' + e.testimonia.map(ME.Layers.formatEvidence).join('; ');
    else if (s === 'E') { const d = e.decision; body = (e.lemma || '⌀') + ' ] ' + [d.type === 'selectio' ? 'chosen' : d.type, d.source, ...(d.reasons || []), d.note].filter(Boolean).join('; '); }
    else body = ME.Apparatus.format(ed, e);
    const atoms = L.rich(body.replace(/‡/g, '[…]'), size);
    if (atoms.length) atoms[0].gap = L.space(size);
    return head.concat(atoms);
  }

  /* ---------- the document ---------- */

  const toPt = (v) => { const m = /^([\d.]+)(mm|in)$/.exec(v); return m ? (m[2] === 'mm' ? (+m[1] * 72) / 25.4 : +m[1] * 72) : 0; };
  const mm = (v) => (v * 72) / 25.4;
  // a layer of a layered edition: set in by its depth, and a little smaller, as on the print page
  const INDENT = [0, 1.4, 2.8, 4.2, 5.4, 6.4, 7.2];
  const SCALE = [1, 0.93, 0.87, 0.82, 0.78, 0.78, 0.78];

  /* The same page as the print page in the browser (PrintHTML): its paper, margins and sizes, its front matter,
     the layers set in with their [abbreviations], the lines numbered down the page (or through the text), and the
     notes of each page at its foot in series, in the order of the blocks. -> {blob, pages, overfull} */
  T.pdf = async function (ed, list, built, options) {
    const PS = ME.PrintHTML.settings(ed);
    const paper = ME.PrintHTML.PAPER[PS.paper] || ME.PrintHTML.PAPER.a4;
    const size = PS.size || 12;
    const o = Object.assign({}, T.DEFAULTS, { size, lead: size * 1.55, appSize: size * 0.72, appLead: size * 0.72 * 1.38, small: size * 0.72, top: mm(20), bottom: mm(18), inner: mm(20), outer: mm(18), every: PS.every === 1 ? 1 : 5 }, options);
    await ME.Shaper.load();
    const fontData = await ME.Publish.font();
    if (!fontData) throw new Error('the font could not be loaded');
    const bytes = fromB64(fontData.base64);
    const font = ME.Shaper.font(bytes);
    const L = makeLayout(font);
    const doc = ME.PDFWriter.doc(bytes, { title: ed.title || 'Edition', author: ed.editor || '', subject: ME.Publish.citation(ed), lang: 'sa' }, font);
    const W = toPt(paper.w) || A4.w, H = toPt(paper.h) || A4.h;
    const bodyW = W - o.inner - o.outer;
    let page = null, y = 0, pageNo = 0, overfull = 0, missing = 0;
    const layout = []; // for each page of the edition: its lines and its notes, to check that notes stay with their lines
    const left = () => o.inner;
    const colourOf = (a) => (a.mark === 'unit' || a.mark === 'num' ? MUTED : a.mark === 'accent' ? ACCENT : null);
    const draw = (atoms, x0, base) => {
      for (const a of atoms) {
        const t = a.t;
        const gl = font.shape(t, { lang: 'sa' });
        missing += gl.filter((g) => g.g === 0).length;
        page.glyphs(gl, x0 + a.x, base - (a.rise || 0), a.size, t, colourOf(a));
        if (a.sup) { const ss = L.supSize(a); page.glyphs(font.shape(a.sup), x0 + a.x + L.bare(a) + a.size * 0.04, base - a.size * 0.38, ss, a.sup, ACCENT); }
        if (a.unsure) page.line(x0 + a.x, base + 2.5, x0 + a.x + L.bare(a), base + 2.5, 0.5, [1.5, 1.2]);
      }
    };
    const header = (title) => {
      if (!title) return;
      const t = L.words(title, o.small);
      const ls = L.lines(t, bodyW * 0.8, false);
      const base = mm(10) + o.small;
      draw(ls[0].atoms, left(), base);
      const nl = L.lines(L.words(String(pageNo), o.small), 60, false)[0];
      draw(nl.atoms, left() + bodyW - nl.natural, base);
      page.line(left(), base + mm(1.5) + 1, left() + bodyW, base + mm(1.5) + 1, 0.4);
    };
    let textLines = 0, pageLines = 0;
    const newPage = (title) => { textLines += pageLines; pageLines = 0; page = doc.page(W, H); pageNo++; y = o.top; header(title); };
    // flowing paragraphs, for the front matter and the additional passages
    const para = (atoms, lead, opts) => {
      const tab = (opts && opts.tab) || 0;
      const ls = L.lines(atoms, bodyW - tab, !(opts && opts.ragged));
      ls.forEach((l, k) => {
        if (y + lead > H - o.bottom) newPage(opts && opts.running);
        if (tab && k === 0 && opts.label) draw(L.lines(opts.label, tab, false)[0].atoms, left(), y + lead * 0.75);
        const x0 = opts && opts.center ? left() + (bodyW - l.natural) / 2 : left() + tab;
        draw(l.atoms, x0, y + lead * 0.75);
        y += lead;
      });
    };
    const gapY = (h) => { y += h; };
    const heading = (t) => { gapY(mm(6)); para(L.words(t, size * 1.1), size * 1.1 * 1.5, { ragged: true }); gapY(mm(2)); };

    // ---- the front matter, as on the print page ----
    newPage(null);
    gapY(mm(45));
    para(L.words(ed.title || 'Edition', size * 2), size * 2 * 1.3, { center: true, ragged: true });
    gapY(mm(4));
    if (ed.editor) { para(L.words('edited by ' + ed.editor, size * 1.05), size * 1.05 * 1.5, { center: true, ragged: true }); gapY(mm(6)); }
    para(L.words(ME.Publish.citation(ed), size * 0.75), size * 0.75 * 1.5, { center: true, ragged: true });
    gapY(mm(14));
    heading('Conspectus siglorum');
    const cs = size * 0.85;
    for (const r of ME.Publish.conspectus(ed, list)) {
      const desc = [[r.place, r.shelfmark || r.title].filter(Boolean).join(', '), r.date, r.script].filter(Boolean).join('; ') || '—';
      para(L.words(desc, cs), cs * 1.55, { ragged: true, tab: cs * 3.4, label: L.words(r.siglum + (r.group ? ' (' + r.group + ')' : ''), cs) });
    }
    const legend = built.some((b) => b.layer && b.layer.depth) ? ME.LayerIds.legend(ed).filter((l) => l.depth) : [];
    if (legend.length) {
      heading('The commentaries');
      for (const l of legend) para(L.words(l.name, cs), cs * 1.55, { ragged: true, tab: cs * 3.4 + (l.depth - 1) * cs * 1.2, label: L.words('[' + l.abbr + ']', cs, { mark: 'accent' }) });
    }
    heading('Editorial principles');
    for (const p of ME.Publish.declaration(ed, built)) { para(L.words(p, cs), cs * 1.5, { running: ed.title }); gapY(mm(2)); }

    // ---- the edition ----
    newPage(ed.title);
    const running = ed.title || '';
    const avail = () => H - o.bottom;
    let notes = []; // on this page: {e, b, line, unit, series, first}
    let bodyLines = []; // to draw at the end of the page: {atoms, base, num, x}
    const footHeight = (ns) => {
      if (!ns.length) return 0;
      let h = 10; // the rule and the space above it
      for (const [s, label] of SERIES) {
        const here = ns.filter((n) => n.series.includes(s));
        if (!here.length) continue;
        let atoms = label ? L.words(label.trim(), o.appSize, { mark: 'label' }) : [];
        let lastUnit = null;
        here.forEach((n, k) => {
          const a = noteAtoms(ed, Object.assign({}, n, { first: n.unit !== lastUnit }), s, L, o.appSize);
          lastUnit = n.unit;
          if (atoms.length && a.length) a[0].gap = k || label ? L.space(o.appSize) * 2.2 : 0;
          atoms = atoms.concat(a);
        });
        h += L.lines(atoms, bodyW, true).length * o.appLead + 2;
      }
      return h;
    };
    const finishPage = () => {
      const rec = { page: pageNo, lines: bodyLines.filter((l) => l.unit).map((l) => l.unit + ':' + l.n), notes: notes.map((n) => n.unit + ':' + n.bline), markers: bodyLines.flatMap((l) => (l.atoms || []).filter((a) => a.sup).flatMap((a) => a.sup.split(',').map((x) => l.unit + '#' + x))), noted: notes.filter((n) => n.marker).map((n) => n.unit + '#' + n.marker), bodyEnd: bodyLines.length ? bodyLines[bodyLines.length - 1].base + o.size * 0.3 : 0, footTop: notes.length ? H - o.bottom - footHeight(notes) + 4 : H - o.bottom, limit: H - o.bottom, numbers: bodyLines.filter((l) => l.num).map((l) => l.num) };
      if (bodyLines.length) layout.push(rec);
      for (const l of bodyLines) {
        draw(l.atoms, left() + (l.x || 0), l.base);
        if (l.num) { const n = L.lines(L.words(String(l.num), size * 0.66), 30, false)[0]; draw(n.atoms.map((a) => Object.assign({}, a, { mark: 'num' })), mm(9), l.base); }
      }
      if (notes.length) {
        // the apparatus, from the foot of the page upward, under a rule across the page
        const h = footHeight(notes);
        let fy = H - o.bottom - h + 10;
        page.line(left(), fy - 6, left() + bodyW, fy - 6, 0.4);
        for (const [s, label] of SERIES) {
          const here = notes.filter((n) => n.series.includes(s));
          if (!here.length) continue;
          let atoms = label ? L.words(label.trim(), o.appSize, { mark: 'label' }) : [];
          let lastUnit = null;
          here.forEach((n, k) => {
            const a = noteAtoms(ed, Object.assign({}, n, { first: n.unit !== lastUnit }), s, L, o.appSize);
            lastUnit = n.unit;
            if (atoms.length && a.length) a[0].gap = k || label ? L.space(o.appSize) * 2.2 : 0;
            atoms = atoms.concat(a);
          });
          for (const l of L.lines(atoms, bodyW, true)) { draw(l.atoms, left(), fy + o.appLead * 0.75); fy += o.appLead; }
          fy += 2;
        }
      }
      notes = []; bodyLines = [];
    };
    const room = (extra, extraNotes) => y + extra + footHeight(notes.concat(extraNotes)) <= avail();
    const byMarkers = ME.Apparatus.settings(ed).keys !== 'lines';
    // the number of the next line, as printed in the margin
    const nextLine = () => (PS.lines === 'text' ? textLines : 0) + pageLines + 1;
    for (const b of built) {
      const depth = Math.min(b.layer ? b.layer.depth : 0, 6);
      const bsize = size * SCALE[depth], blead = bsize * 1.55, indent = size * INDENT[depth];
      const markers = byMarkers ? ME.Apparatus.markers(ed, b) : null;
      const atoms = blockWords(ed, b, bsize, L, markers);
      if (depth && b.layer.abbr) { if (atoms.length) atoms[0].gap = L.space(bsize); atoms.unshift({ t: '[' + b.layer.abbr + ']', size: bsize, rise: 0, gap: 0, mark: 'accent', entries: [] }); }
      const abbr = depth ? b.layer.abbr : '';
      const note = (ei, bline, line) => ({ e: b.entries[ei], line, bline, marker: markers ? markers.get(ei) : null, unit: b.table.unit, abbr, series: seriesOf(ed, b, b.entries[ei]) });
      const lines = L.lines(atoms, bodyW - indent, true);
      // the block's reference, kept with its first two lines
      const first = lines.slice(0, 2);
      const firstNotes = [];
      first.forEach((l, i) => { for (const a of l.atoms) for (const ei of a.entries || []) firstNotes.push(note(ei, i + 1, nextLine() + i)); });
      if (!room(o.small * 2.2 + first.length * blead, firstNotes) && (bodyLines.length || notes.length)) { finishPage(); newPage(running); }
      y += o.small * 0.7;
      bodyLines.push({ atoms: L.lines(L.words(b.table.unit, o.small, { mark: 'unit' }), bodyW, false)[0].atoms, base: y + o.small, x: indent });
      y += o.small * 1.5;
      lines.forEach((l, i) => {
        const here = [];
        for (const a of l.atoms) for (const ei of a.entries || []) here.push(note(ei, i + 1, nextLine()));
        if (!room(blead, here) && bodyLines.length) {
          finishPage(); newPage(running);
          if (!room(blead, here)) overfull++;
          for (const n of here) n.line = nextLine();
        }
        const num = nextLine();
        pageLines++;
        bodyLines.push({ atoms: l.atoms, base: y + bsize, num: num % o.every === 0 ? num : null, unit: b.table.unit, n: i + 1, x: indent });
        notes.push(...here.filter((n) => n.series.length));
        y += blead;
      });
      y += bsize * 0.4; // the space after a block, as on the print page
    }
    finishPage();
    // ---- additional passages ----
    const stars = built.flatMap((b) => b.stars);
    if (stars.length) {
      newPage(running);
      heading('Additional passages');
      for (const s of stars) para([{ t: s.id, size: 10, rise: 0, gap: 0, mark: 'unit' }].concat(L.words('(' + s.wits.join(' ') + '): ' + s.text, 10).map((a, i) => (i ? a : Object.assign(a, { gap: 8 })))), 15, { running });
    }
    const blob = await doc.save();
    return { blob, pages: pageNo, overfull, missing, layout };
  };

  ME.Typeset = T;
})(window.ME);
