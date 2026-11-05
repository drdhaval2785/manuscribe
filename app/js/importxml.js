'use strict';
/* Reading transcriptions in XML, from a file or pasted into a line.
   A tolerant reader rather than an XML parser: pasted pieces are often not well-formed on their
   own (a <hi> closed on a later line, <pb n="…"> without the slash, a </p> without its start).
   The text is cut into physical lines: at <lb/>, or at carriage returns where a folio side has
   no <lb/> at all. A tag still open at a line break is split into pieces that share an x-span id
   (see spans.js), and paragraph / verse / quotation tags become x-marker milestones. */
(function (ME) {
  const { U, TEI, Model } = ME;
  const Importer = {};

  const VOID = new Set(['pb', 'lb', 'cb', 'milestone', 'gap', 'space', 'caesura', 'anchor', 'ptr', 'graphic']);
  const IGNORED = new Set(['TEI', 'teiCorpus', 'text', 'body', 'front', 'back', 'group', 'cit', 'r']);
  // the export lays these out on lines of their own: the white space around them is not text
  const LAYOUT = new Set(['p', 'ab', 'lg', 'l', 'div', 'body', 'text']);
  const isLayout = (k) => !!k && (((k.t === 'open' || k.t === 'close') && LAYOUT.has(k.name)) || (k.t === 'empty' && (k.name === 'pb' || k.name === 'cb')));

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decode = (s) => s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] !== '#') return e in ENTITIES ? ENTITIES[e] : m;
    return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });

  const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/\s*([A-Za-z_][^\s>]*)\s*>|<([A-Za-z_][^\s/>]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

  function tokenize(src) {
    const out = [];
    let last = 0, m;
    const text = (s) => { if (s) out.push({ t: 'text', s: decode(s) }); };
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      text(src.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1] !== undefined) out.push({ t: 'text', s: m[1] });
      else if (m[2]) out.push({ t: 'close', name: m[2] });
      else if (m[3]) {
        const attrs = {};
        (m[4] || '').replace(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = decode(a !== undefined ? a : b); return ''; });
        out.push({ t: m[5] || VOID.has(m[3]) ? 'empty' : 'open', name: m[3], attrs });
      }
    }
    text(src.slice(last));
    return out;
  }

  // <pb n="0005_2"> is folio 5, second side
  function folioLabel(n, res) {
    const m = /^(\d+)[_-]([12])$/.exec(String(n || '').trim());
    if (!m) return String(n || '').trim();
    res.pbWidth = m[1].length;
    return parseInt(m[1], 10) + (m[2] === '1' ? 'r' : 'v');
  }

  function readHeader(toks, res) {
    let stmt = '';
    for (let i = 0; i < toks.length; i++) {
      const k = toks[i];
      if (k.t !== 'open' && k.t !== 'close') continue;
      if (k.t === 'open' && (k.name === 'titleStmt' || k.name === 'msItem' || k.name === 'notesStmt')) stmt = k.name;
      if (k.t === 'close' && k.name === stmt) stmt = '';
      if (k.t !== 'open') continue;
      const textOf = () => { let s = ''; for (let j = i + 1; j < toks.length && !(toks[j].t === 'close' && toks[j].name === k.name); j++) if (toks[j].t === 'text') s += toks[j].s; return s.trim(); };
      if (k.name === 'bibl') {
        const w = { xmlId: k.attrs['xml:id'] || k.attrs.id || '', title: '', author: '', abbr: '' };
        for (let j = i + 1; j < toks.length && !(toks[j].t === 'close' && toks[j].name === 'bibl'); j++) {
          const c = toks[j];
          if (c.t === 'open' && (c.name === 'title' || c.name === 'author' || c.name === 'abbr') && toks[j + 1] && toks[j + 1].t === 'text') w[c.name] = toks[j + 1].s.trim();
        }
        res.works.push(w);
      } else if (k.name === 'idno' && k.attrs.type === 'siglum') res.meta.siglum = res.meta.siglum || textOf();
      else if (stmt === 'titleStmt' && k.name === 'title') res.meta.title = res.meta.title || textOf();
      else if (stmt === 'titleStmt' && k.name === 'author') res.meta.author = res.meta.author || textOf();
      else if (stmt === 'titleStmt' && k.name === 'name') res.meta.transcriber = res.meta.transcriber || textOf();
      else if (stmt === 'notesStmt' && k.name === 'note') res.meta.notes = res.meta.notes || textOf();
      else if (k.name === 'idno' && k.attrs.type === 'shelfmark') res.meta.shelfmark = textOf();
      else if (k.name === 'country' || k.name === 'settlement' || k.name === 'repository') res.meta[k.name] = textOf();
      else if (k.name === 'origDate') res.meta.date = textOf();
      else if (k.name === 'objectDesc' && k.attrs.form) res.meta.form = k.attrs.form;
      else if (k.name === 'supportDesc' && k.attrs.material) res.meta.material = k.attrs.material;
      else if (k.name === 'textLang') { if (k.attrs.mainLang) res.meta.script = k.attrs.mainLang; res.meta.language = textOf(); }
      else if (k.name === 'handNote' && k.attrs.scribe) res.meta.scribe = k.attrs.scribe.replace(/_/g, ' ');
      else if (k.name === 'layout') {
        // "Lines per folio side: main text 8, top 5." as the export writes it
        const lines = {};
        if (k.attrs.writtenLines) lines.main = +k.attrs.writtenLines;
        const stated = /Lines per folio side: (.*?)\./.exec(textOf());
        if (stated) {
          for (const part of stated[1].split(', ')) {
            const m = /^(.*) (\d+)$/.exec(part);
            const box = m && Object.keys(Model.BOX_LABEL).find((b) => Model.BOX_LABEL[b].toLowerCase() === m[1]);
            if (box) lines[box] = +m[2];
          }
        }
        res.meta.lines = lines;
      }
    }
  }

  // -> {lines: [{page, stream, box, tei, lb: {n, brk}}], pages: [labels], works, meta, warnings, pbWidth}
  Importer.parse = function (src, opts) {
    const o = opts || {};
    const res = { lines: [], pages: [], works: [], meta: {}, warnings: [], pbWidth: null };
    let toks = tokenize(String(src).replace(/\r\n?/g, '\n'));

    // the header is read separately
    const textTag = toks.find((k) => k.t === 'open' && k.name === 'text');
    if (textTag && textTag.attrs['xml:lang']) res.meta.textLang = textTag.attrs['xml:lang'];
    const hs = toks.findIndex((k) => k.t === 'open' && k.name === 'teiHeader');
    if (hs >= 0) {
      let he = toks.findIndex((k, i) => i > hs && k.t === 'close' && k.name === 'teiHeader');
      if (he < 0) he = hs;
      readHeader(toks.slice(hs + 1, he), res);
      toks = toks.slice(0, hs).concat(toks.slice(he + 1));
    }

    // carriage returns separate the lines only on folio sides that have no <lb/>
    const hasLb = [false];
    for (const k of toks) {
      if (k.t === 'empty' && k.name === 'pb') hasLb.push(false);
      else if (k.t === 'empty' && k.name === 'lb') hasLb[hasLb.length - 1] = true;
    }
    let seg = 0;

    let page = o.page || null, stream = 'main', box = null;
    let pendingPage = null, pendingBox = null;
    let lgFresh = false;
    let autoP = false; // inside a <p> the export made up for text outside any paragraph
    const stack = []; // open inline elements
    const blank = () => ({ chunks: [], hasText: false, lb: null });
    let cur = blank();

    const inChip = () => stack.some((e) => e.chip);
    const isChip = (name, attrs) => {
      if (name === 'add') return TEI.placeOf(name, attrs) !== 'inline';
      const def = TEI.ELEMENTS[name];
      return !!def && def.kind === 'chip';
    };
    const raw = (x) => cur.chunks.push({ x });
    const emptyTag = (name, attrs) => '<' + name + TEI.attrString(attrs) + '/>';
    const addText = (t) => { if (t) { cur.chunks.push({ t: U.escXml(t) }); if (/\S/.test(t)) cur.hasText = true; } };
    const closeChunk = (e) => {
      const last = cur.chunks[cur.chunks.length - 1];
      if (last && last.o === e) cur.chunks.pop(); else cur.chunks.push({ c: e });
    };
    const lineText = (l) => l.chunks.map((c) => {
      if (c.x !== undefined) return c.x;
      if (c.t !== undefined) return c.t;
      if (c.c) return '</' + c.c.name + '>';
      return '<' + c.o.name + TEI.attrString(c.o.span ? Object.assign({}, c.o.attrs, { 'x-span': c.o.span }) : c.o.attrs) + '>';
    }).join('');

    function pushLine() {
      const str = lineText(cur);
      if (!cur.hasText && !cur.lb) {
        if (!str) return;
        // only markers: they belong to the end of the previous line
        const prev = res.lines[res.lines.length - 1];
        if (prev && prev.page === page && prev.stream === stream) { prev.tei += str; return; }
      }
      res.lines.push({ page, stream, box, tei: TEI.normalizeTags(str), lb: cur.lb });
    }

    function finishLine() {
      const open = stack.slice();
      for (const e of open) e.span = e.span || ME.Spans.newId();
      for (const e of open.slice().reverse()) closeChunk(e);
      pushLine();
      cur = blank();
      for (const e of open) cur.chunks.push({ o: e });
    }

    function applyPending() {
      if (pendingPage !== null) { page = pendingPage; pendingPage = null; }
      if (pendingBox !== null) { box = pendingBox; pendingBox = null; }
    }

    // the last text of the line, before closing tags and markers
    function tailText(stopAtChip) {
      for (let k = cur.chunks.length - 1; k >= 0; k--) {
        const c = cur.chunks[k];
        if (c.c && c.c.chip) {
          if (stopAtChip) return null;
          while (k > 0 && cur.chunks[k].o !== c.c) k--; // a note is not the text of the line
          continue;
        }
        if (c.t !== undefined) { if (c.t) return c; continue; }
        if (c.o || c.c) continue;
        if (c.x && c.x.startsWith('<x-marker')) continue;
        return null;
      }
      return null;
    }
    function trimEnd() {
      // a space before a note or addition is text: only what ends the line itself goes
      for (let c = tailText(true); c; c = tailText(true)) {
        c.t = c.t.replace(/\s+$/, '');
        if (c.t) break;
      }
    }
    function ensureSpace() {
      const c = tailText();
      if (!c || !/[\s|।॥]$/.test(c.t)) cur.chunks.push({ t: ' ' });
    }

    for (let ti = 0; ti < toks.length; ti++) {
      const k = toks[ti];
      if (k.t === 'text') {
        if (inChip()) { addText(k.s.replace(/\s*\n\s*/g, ' ')); continue; }
        if (hasLb[seg] && !stack.length && !/\S/.test(k.s) && k.s.includes('\n') && (isLayout(toks[ti - 1]) || isLayout(toks[ti + 1]))) continue;
        if (pendingPage !== null || pendingBox !== null) {
          if (!/\S/.test(k.s)) continue;
          finishLine();
          applyPending();
        }
        if (hasLb[seg]) {
          // a carriage return just before <lb/> or <pb/> is only the layout of the file; a space typed before it counts
          const nx = toks[ti + 1];
          const atBreak = nx && nx.t === 'empty' && (nx.name === 'lb' || nx.name === 'pb' || nx.name === 'cb');
          const t = (atBreak ? k.s.replace(/\s*\n\s*$/, (m) => (/^[ \t]/.test(m) ? ' ' : '')) : k.s).replace(/\s*\n\s*/g, ' ');
          addText(cur.hasText ? t : t.replace(/^\s+/, ''));
        } else {
          k.s.split('\n').forEach((part, j) => {
            if (j > 0 && cur.hasText) finishLine();
            addText(cur.hasText ? part : part.replace(/^\s+/, ''));
          });
        }
        continue;
      }
      const name = k.name, a = k.attrs || {};
      if (k.t === 'empty') {
        if (inChip()) { raw(emptyTag(name, a)); continue; }
        if (name === 'pb') {
          const label = folioLabel(a.n, res);
          seg++;
          if (!label) { res.warnings.push('A <pb> without a number was ignored.'); continue; }
          res.pages.push(label);
          if (cur.hasText) pendingPage = label; else page = label;
        } else if (name === 'cb') {
          if (cur.hasText) pendingBox = a.n || ''; else box = a.n || null;
        } else if (name === 'lb') {
          const brk = a.break === 'no';
          if (cur.hasText) {
            if (brk) trimEnd(); else ensureSpace();
            finishLine();
            applyPending();
          } else if (cur.lb) {
            pushLine();
            cur = blank();
          }
          cur.lb = { n: a.n, brk };
        } else {
          if (name === 'x-marker') raw(emptyTag(name, a));
          else { raw(emptyTag(name, a)); cur.hasText = true; }
        }
        continue;
      }
      if (k.t === 'open') {
        const structural = !stack.length;
        if (IGNORED.has(name)) continue;
        if (name === 'div') {
          if (cur.hasText) finishLine();
          applyPending();
          const ty = String(a.type || '');
          stream = /interlin|gloss/i.test(ty) ? 'gloss' : /comment/i.test(ty) ? 'commentary' : 'main';
          box = null;
          continue;
        }
        if (name === 'p' || name === 'ab' || name === 'lg' || name === 'l' || name === 'quote') {
          if (structural) {
            // it is made up again on the next export, with the same id
            if (name === 'p' && /^[a-z]+-auto\d+$/.test(a['xml:id'] || '')) { autoP = true; continue; }
            if (name === 'p' || name === 'ab') raw('<x-marker' + TEI.attrString({ type: 'p-start', id: a['xml:id'] || a.id }) + '/>');
            else if (name === 'lg') { raw('<x-marker' + TEI.attrString({ type: 'lg-start', id: a['xml:id'] || a.id }) + '/>'); lgFresh = true; }
            else if (name === 'l') { if (!lgFresh) raw('<x-marker type="l"/>'); lgFresh = false; }
            else raw('<x-marker' + TEI.attrString({ type: 'q-start', source: a.source, n: a.n }) + '/>');
            continue;
          }
          if (name !== 'quote') { res.warnings.push('<' + name + '> inside another tag was ignored.'); continue; }
        }
        const e = { name, attrs: a, span: null, chip: inChip() || isChip(name, a) };
        cur.chunks.push({ o: e });
        if (e.chip) cur.hasText = true;
        stack.push(e);
        continue;
      }
      // closing tag
      if (IGNORED.has(name) || VOID.has(name)) continue;
      if (name === 'div') { if (cur.hasText) finishLine(); applyPending(); continue; }
      if (!stack.some((e) => e.name === name)) {
        if (name === 'p' && autoP) autoP = false;
        else if (name === 'p' || name === 'ab') raw('<x-marker type="p-end"/>');
        else if (name === 'lg') raw('<x-marker type="lg-end"/>');
        else if (name === 'quote') raw('<x-marker type="q-end"/>');
        else if (name !== 'l') res.warnings.push('</' + name + '> without its start was ignored.');
        continue;
      }
      for (;;) {
        const e = stack.pop();
        closeChunk(e);
        if (e.name === name) break;
      }
    }
    for (const e of stack.slice().reverse()) closeChunk(e);
    stack.length = 0;
    pushLine();
    if (pendingPage !== null) res.warnings.push('The last <pb> has no text after it.');
    res.pbWidth = res.pbWidth || null;
    return res;
  };

  /* ---------- cited works ---------- */

  function newWork(project, w) {
    let n = project.works.length + 1;
    while (project.works.some((x) => x.id === 'w' + n)) n++;
    const work = { id: 'w' + n, title: w.title || 'Unknown', author: w.author || 'Unknown', abbr: w.abbr || w.xmlId || '' };
    project.works.push(work);
    return work;
  }

  // source="#NAND #MALA" in the lines becomes the ids of the project's cited works
  Importer.resolveSources = function (project, res) {
    const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    const map = {};
    for (const hw of res.works) {
      const found = project.works.find((w) => (hw.abbr && eq(w.abbr, hw.abbr)) || (hw.xmlId && eq(w.abbr, hw.xmlId)));
      if (hw.xmlId) map[hw.xmlId] = (found || newWork(project, hw)).id;
    }
    const resolve = (ref) => {
      const key = ref.replace(/^#/, '');
      if (map[key]) return map[key];
      if (!ref.startsWith('#') && project.works.some((w) => w.id === key)) return key;
      const found = project.works.find((w) => eq(w.abbr, key));
      map[key] = (found || newWork(project, { abbr: key })).id;
      return map[key];
    };
    for (const l of res.lines) {
      l.tei = l.tei.replace(/(<(?:x-marker|quote)\b[^>]*\bsource=")([^"]*)(")/g, (m, a, v, c) => a + v.split(/\s+/).filter(Boolean).map(resolve).join(' ') + c);
    }
  };

  /* ---------- a whole transcription ---------- */

  // The layout a folio side needs for what the file has on it; null if any layout will do.
  function layoutNeeded(lines) {
    const boxes = new Set(lines.map((l) => l.box));
    if (lines.some((l) => l.stream === 'gloss')) return 'interlinear';
    if (boxes.has('left') || boxes.has('right')) return 'pancapatha';
    if (lines.some((l) => l.stream === 'commentary') || boxes.has('top') || boxes.has('bottom')) return 'tripatha';
    return null;
  }

  // Writes the parsed lines into the project; the folio sides in the file are replaced.
  // opts.fresh: the project was just made for this file, so the file's settings count too.
  Importer.apply = function (project, res, fallbackLabel, opts) {
    Importer.resolveSources(project, res);
    const m = res.meta;
    for (const k of ['title', 'author', 'siglum', 'country', 'settlement', 'repository', 'shelfmark', 'scribe', 'date', 'material', 'transcriber', 'notes']) if (m[k] && !project.meta[k]) project.meta[k] = m[k];
    if (opts && opts.fresh) for (const k of ['form', 'script', 'textLang', 'language']) if (m[k]) project.meta[k] = m[k];
    if (res.pbWidth) project.folios.pbWidth = res.pbWidth;
    const needs = {};
    for (const l of res.lines) { const label = l.page || fallbackLabel; (needs[label] = needs[label] || []).push(l); }
    const wanted = Object.values(needs).map(layoutNeeded);
    if (opts && opts.fresh && wanted[0] && wanted.every((w) => w === wanted[0])) project.layout.type = wanted[0];
    const fits = (type, lines) => lines.every((l) => {
      const s = Model.LAYOUTS[type].streams.find((x) => x.key === l.stream);
      return s && (!l.box || s.boxes.includes(l.box));
    });
    const fresh = new Set();
    const counts = {};
    let noPb = false;
    for (const l of res.lines) {
      const label = l.page || fallbackLabel;
      if (!l.page) noPb = true;
      const pg = Model.page(project, label);
      if (!fresh.has(label)) {
        fresh.add(label); pg.boxes = {}; delete pg.lb; delete pg.lines;
        // never fold commentary into the main text: this folio takes the layout the file has
        if (!fits(Model.pageLayout(project, label), needs[label])) pg.layout = layoutNeeded(needs[label]);
      }
      const type = Model.pageLayout(project, label);
      const stream = Model.LAYOUTS[type].streams.find((s) => s.key === l.stream);
      if (!stream && !res.warnings.some((w) => w.includes(l.stream))) res.warnings.push('The file has text for “' + Model.STREAMS[l.stream].label + '”, which the ' + Model.LAYOUTS[type].label + ' layout does not have; it was put in the main text.');
      const boxes = stream ? stream.boxes : ['main'];
      const box = boxes.includes(l.box) ? l.box : boxes[0];
      const arr = pg.boxes[box] || (pg.boxes[box] = []);
      arr.push(l.tei);
      Model.setLb(pg, box, arr.length - 1, l.lb);
      if (box !== 'gloss') (counts[box] = counts[box] || []).push(label);
    }
    if (noPb) res.warnings.push('Text without a <pb> before it was put on folio ' + fallbackLabel + '.');
    // the usual number of lines per block is the most common one in the file
    for (const box of Object.keys(counts)) {
      const per = {};
      for (const label of fresh) { const n = (project.pages[label].boxes[box] || []).length; if (n) per[n] = (per[n] || 0) + 1; }
      const stated = m.lines && m.lines[box]; // blank lines at the end of a folio are not in the text
      const usual = stated || +Object.keys(per).sort((a, b) => per[b] - per[a])[0];
      if (usual && usual !== project.layout.lines[box]) {
        // folios that are not in the file keep the number of lines they had
        for (const [label, pg] of Object.entries(project.pages)) {
          if (!fresh.has(label) && (pg.boxes[box] || []).some(TEI.hasContent) && !(pg.lines && pg.lines[box])) pg.lines = Object.assign(pg.lines || {}, { [box]: project.layout.lines[box] });
        }
        project.layout.lines[box] = usual;
      }
      for (const label of fresh) {
        const pg = project.pages[label];
        const n = (pg.boxes[box] || []).length;
        if (n && (stated ? n > usual : n !== usual)) pg.lines = Object.assign(pg.lines || {}, { [box]: n });
      }
    }
    const known = new Set(Model.entries(project).filter((e) => !e.orphan).map((e) => e.label));
    return { folios: Array.from(fresh), lines: res.lines.length, unmapped: Array.from(fresh).filter((l) => !known.has(l)), warnings: res.warnings };
  };

  /* Tags that a whole file cannot be read past: an unclosed note or addition would take in all the
     text after it. Other unmatched tags stay tolerated, as a copied folio may start inside a <p>. */
  Importer.tagProblems = function (src) {
    const body = Math.max(0, src.indexOf('</teiHeader>'));
    const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:\s[^<>]*?)?)(\/?)>/g;
    const lineOf = (at) => src.slice(0, at).split('\n').length;
    const chip = (name, attrs) => {
      if (name === 'add') return TEI.placeOf('add', { place: (/\splace="([^"]*)"/.exec(attrs) || [])[1] }) !== 'inline';
      const def = TEI.ELEMENTS[name];
      return !!def && def.kind === 'chip';
    };
    const stack = [], out = [];
    tag.lastIndex = body;
    for (let m = tag.exec(src); m; m = tag.exec(src)) {
      const name = m[2];
      if (!name || m[4] || VOID.has(name) || LAYOUT.has(name) || IGNORED.has(name) || name === 'quote') continue;
      if (!m[1]) { stack.push({ name, at: m.index, chip: chip(name, m[3]) }); continue; }
      const top = stack[stack.length - 1];
      if (top && top.name === name) { stack.pop(); continue; }
      if (top && top.chip) {
        out.push({ line: lineOf(m.index), found: name, open: top.name, openLine: lineOf(top.at) });
        stack.pop();
      }
      const k = stack.map((e) => e.name).lastIndexOf(name);
      if (k >= 0) stack.length = k;
    }
    for (const e of stack) if (e.chip) out.push({ line: null, found: null, open: e.name, openLine: lineOf(e.at) });
    return out;
  };

  // The lines of these folio sides that differ between two states of a project.
  Importer.changedLines = function (before, after, labels) {
    const clean = (l) => (l || '').replace(/ x-span="[^"]*"/g, '');
    const out = [];
    for (const label of labels) {
      const a = (before.pages[label] || {}).boxes || {}, b = (after.pages[label] || {}).boxes || {};
      for (const box of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const x = a[box] || [], y = b[box] || [];
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          if (clean(x[i]) !== clean(y[i])) out.push({ label, box, i, from: clean(x[i]), to: clean(y[i]) });
        }
      }
    }
    return out;
  };

  ME.Importer = Importer;
})(window.ME);
