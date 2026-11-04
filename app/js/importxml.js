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
      if (k.t === 'open' && (k.name === 'titleStmt' || k.name === 'msItem')) stmt = k.name;
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
    }
  }

  // -> {lines: [{page, stream, box, tei, lb: {n, brk}}], pages: [labels], works, meta, warnings, pbWidth}
  Importer.parse = function (src, opts) {
    const o = opts || {};
    const res = { lines: [], pages: [], works: [], meta: {}, warnings: [], pbWidth: null };
    let toks = tokenize(String(src).replace(/\r\n?/g, '\n'));

    // the header is read separately
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
    const stack = []; // open inline elements
    const blank = () => ({ chunks: [], hasText: false, lb: null });
    let cur = blank();

    const inChip = () => stack.some((e) => e.chip);
    const isChip = (name, attrs) => {
      if (name === 'add') return attrs.place !== 'inline';
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
    function tailText() {
      for (let k = cur.chunks.length - 1; k >= 0; k--) {
        const c = cur.chunks[k];
        if (c.c && c.c.chip) { while (k > 0 && cur.chunks[k].o !== c.c) k--; continue; } // a note is not the text of the line
        if (c.t !== undefined) { if (c.t) return c; continue; }
        if (c.o || c.c) continue;
        if (c.x && c.x.startsWith('<x-marker')) continue;
        return null;
      }
      return null;
    }
    function trimEnd() {
      for (let c = tailText(); c; c = tailText()) {
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
        if (name === 'p' || name === 'ab') raw('<x-marker type="p-end"/>');
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

  // Writes the parsed lines into the project; the folio sides in the file are replaced.
  Importer.apply = function (project, res, fallbackLabel) {
    Importer.resolveSources(project, res);
    const m = res.meta;
    for (const k of ['title', 'author', 'siglum']) if (m[k] && !project.meta[k]) project.meta[k] = m[k];
    if (res.pbWidth) project.folios.pbWidth = res.pbWidth;
    const fresh = new Set();
    const counts = {};
    let noPb = false;
    for (const l of res.lines) {
      const label = l.page || fallbackLabel;
      if (!l.page) noPb = true;
      const pg = Model.page(project, label);
      if (!fresh.has(label)) { fresh.add(label); pg.boxes = {}; delete pg.lb; delete pg.lines; }
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
      const usual = +Object.keys(per).sort((a, b) => per[b] - per[a])[0];
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
        if (n && n !== usual) pg.lines = Object.assign(pg.lines || {}, { [box]: n });
      }
    }
    const known = new Set(Model.entries(project).filter((e) => !e.orphan).map((e) => e.label));
    return { folios: Array.from(fresh), lines: res.lines.length, unmapped: Array.from(fresh).filter((l) => !known.has(l)), warnings: res.warnings };
  };

  ME.Importer = Importer;
})(window.ME);
