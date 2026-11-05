'use strict';
/* TEI export in the Saktumiva subset.
   Each stream (main text, commentary, interlinear commentary) is read across all folios
   in order: <pb n="folio"/>, <cb n="block"/> when a stream uses several blocks of a folio,
   <lb n="line"/> for each physical line, then the line's inline markup. The x-marker
   milestones are turned into properly nested <p>, <lg>/<l> and <quote> elements. */
(function (ME) {
  const { U, TEI, Model, UI } = ME;

  // elements whose content is not mixed: pretty-printed with one child per line
  const ELEMENT_ONLY = new Set(['TEI', 'teiHeader', 'fileDesc', 'titleStmt', 'publicationStmt', 'notesStmt', 'sourceDesc', 'msDesc', 'msIdentifier', 'msContents', 'msItem',
    'physDesc', 'objectDesc', 'layoutDesc', 'handDesc', 'history', 'origin', 'listBibl', 'respStmt', 'revisionDesc', 'text', 'body', 'div', 'lg', 'supportDesc']);

  const LANG_CODE = { Sanskrit: 'sa', Prakrit: 'pra', Gujarati: 'gu', 'Old Gujarati': 'gu', Hindi: 'hi' };

  const node = (name, attrs, children) => ({ name, attrs: attrs || {}, children: children || [] });

  // x-* attributes are internal to the editor
  const publicAttrs = (a) => { const o = {}; for (const [k, v] of Object.entries(a)) if (!k.startsWith('x-')) o[k] = v; return o; };

  // Text in a file: every folio and every line starts a new line of the file, without indent
  // (spaces there would be spaces in the text). A blank line sets off each folio.
  const breakBefore = (c) => (c.name === 'pb' ? '\n\n' : c.name === 'lb' || c.name === 'cb' ? '\n' : '');
  const mixed = (children, depth) => children.map((c) => breakBefore(c) + serialize(c, depth)).join('');

  function serialize(n, depth) {
    if (typeof n === 'string') return U.escXml(n);
    if (n.raw !== undefined) return n.raw;
    const open = '<' + n.name + TEI.attrString(publicAttrs(n.attrs));
    if (!n.children.length) return open + '/>';
    let inner;
    if (ELEMENT_ONLY.has(n.name)) {
      const pad = '\n' + '  '.repeat(depth + 1);
      inner = n.children.filter((c) => typeof c !== 'string' || c.trim()).map((c) => pad + serialize(c, depth + 1)).join('') + '\n' + '  '.repeat(depth);
    } else {
      inner = mixed(n.children, depth);
    }
    return open + '>' + inner + '</' + n.name + '>';
  }

  function fromXml(x) {
    if (x.nodeType === 3) return x.nodeValue;
    const n = node(x.nodeName, TEI.attrsOf(x));
    for (const c of Array.from(x.childNodes)) if (c.nodeType === 1 || c.nodeType === 3) n.children.push(fromXml(c));
    return n;
  }

  /* ---------- token streams ---------- */

  /* Does a line end a word? A line ending in a space (or a daṇḍa) does; otherwise its last word
     continues on the next line, which then starts with <lb break="no"/>. Notes, additions written
     outside the line and markers at the end of a line do not count. An explicit break="no" is kept
     unless the line now really ends in a space. */
  function lineEnd(tei) {
    const r = TEI.parse(tei);
    if (!r) return { open: false, spaced: true, rawSpaced: true };
    for (const el of Array.from(r.querySelectorAll('note, metamark, x-marker, pc, milestone, corr, add'))) {
      if (el.nodeName !== 'add' || TEI.placeOf('add', TEI.attrsOf(el)) !== 'inline') el.remove();
    }
    const text = r.textContent.replace(/\u200B/g, '');
    const spaced = !text.trim() || /\s$/.test(text);
    return { open: !spaced && !/[|।॥]$/.test(text), spaced, rawSpaced: /\s(?:<[^>]+>)*$/.test(tei) };
  }

  // How the stream stands at the end of the folio sides before entries[idx]
  function endBefore(project, key, entries, idx) {
    for (let k = idx - 1; k >= 0; k--) {
      const pg = project.pages[entries[k].label];
      if (!pg) continue;
      const s = Model.LAYOUTS[Model.pageLayout(project, entries[k].label)].streams.find((x) => x.key === key);
      if (!s) continue;
      for (const box of s.boxes.slice().reverse()) {
        const arr = (pg.boxes[box] || []).slice(0, Model.lineCount(project, entries[k].label, box));
        for (let i = arr.length - 1; i >= 0; i--) if (TEI.hasContent(arr[i])) return lineEnd(arr[i]);
      }
    }
    return { open: false, spaced: true, rawSpaced: true };
  }

  // a <quote> inside a marginal note is a plain tag: its source points to the cited works too
  function mapNestedQuotes(n, ctx) {
    if (typeof n === 'string') return;
    if (n.name === 'quote' && n.attrs.source) n.attrs.source = sourceValue(n.attrs.source, ctx);
    n.children.forEach((c) => mapNestedQuotes(c, ctx));
  }

  // one or more works: source="#NAND #MALA"
  function sourceValue(source, ctx) {
    const ids = source.split(/\s+/).filter(Boolean);
    ids.forEach((id) => ctx.works.add(id));
    return ids.map((id) => '#' + (ctx.workIds[id] || id)).join(' ');
  }

  function streamTokens(project, key, entries, ctx, startEnd) {
    const tokens = [];
    let prev = startEnd || { open: false, spaced: true, rawSpaced: true }; // how the previous line of this stream ended
    for (const e of entries) {
      const pg = project.pages[e.label];
      if (!pg) continue;
      const type = Model.pageLayout(project, e.label);
      const s = Model.LAYOUTS[type].streams.find((x) => x.key === key);
      if (!s) continue;
      const pageTokens = [];
      for (const box of s.boxes) {
        const n = Model.lineCount(project, e.label, box);
        const arr = pg.boxes[box] || [];
        const meta = (pg.lb && pg.lb[box]) || {};
        let last = -1;
        for (let i = 0; i < n; i++) if (TEI.hasContent(arr[i])) last = i;
        if (last < 0) continue;
        if (s.boxes.length > 1) pageTokens.push({ t: 'cb', n: box });
        for (let i = 0; i <= last; i++) {
          const has = TEI.hasContent(arr[i]);
          const brk = has && (prev.open || (meta[i] && meta[i].brk && !prev.rawSpaced));
          pageTokens.push({ t: 'lb', n: Model.lineNumber(project, e.label, box, i), brk });
          prev = has ? lineEnd(arr[i]) : { open: false, spaced: true, rawSpaced: true };
          const where = e.label + ' · ' + Model.BOX_LABEL[box].toLowerCase() + ' · line ' + (i + 1);
          if (!arr[i]) continue;
          const r = TEI.parse(arr[i]);
          if (!r) { ctx.warn('Could not read the markup of ' + where + ' — exported as plain text', where); pageTokens.push({ t: 'node', n: arr[i].replace(/<[^>]*>/g, ''), where }); continue; }
          for (const c of Array.from(r.childNodes)) {
            const nd = fromXml(c);
            if (nd.name !== 'x-marker') mapNestedQuotes(nd, ctx);
            pageTokens.push({ t: 'node', n: nd, where });
          }
        }
      }
      if (pageTokens.length) tokens.push({ t: 'pb', n: Model.pbValue(project, e.label) }, ...pageTokens);
    }
    return tokens;
  }

  /* A tag over several lines is stored as pieces sharing an x-span id. A piece that follows
     the previous piece with only <lb/>/<pb/>/<cb/> in between is merged into it, so that
     the milestones end up inside one element: <del>abc<lb n="4"/>def</del>. */
  const isMilestone = (c) => c && typeof c !== 'string' && (c.name === 'lb' || c.name === 'pb' || c.name === 'cb');
  const sameSpan = (a, b) => a && b && typeof a !== 'string' && typeof b !== 'string' && a.name === b.name && a.attrs['x-span'] && a.attrs['x-span'] === b.attrs['x-span'];

  function mergeInto(prev, cur, between) {
    const pl = prev.children[prev.children.length - 1], cf = cur.children[0];
    if (sameSpan(pl, cf)) {
      mergeInto(pl, cf, between);
      prev.children.push(...cur.children.slice(1));
    } else {
      prev.children.push(...between, ...cur.children);
    }
  }

  function mergeSpan(container, n) {
    if (!n.attrs['x-span']) return false;
    let k = container.children.length - 1;
    while (k >= 0 && isMilestone(container.children[k])) k--;
    if (!sameSpan(container.children[k], n)) return false;
    mergeInto(container.children[k], n, container.children.splice(k + 1));
    return true;
  }

  function buildDiv(tokens, key, ctx) {
    const div = node('div', { type: Model.STREAMS[key].divType });
    const stack = [div];
    const top = () => stack[stack.length - 1];
    const open = (name, attrs, extra) => { const n = Object.assign(node(name, attrs), extra || {}); top().children.push(n); stack.push(n); return n; };
    const indexOf = (name) => { for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === name) return i; return -1; };
    const closeFrom = (i) => { const closed = stack.splice(i); return closed; };
    let autoN = 0;
    const prefix = { main: 'p', commentary: 'c', gloss: 'g' }[key];

    const ensureText = () => {
      const t = top();
      if (t.name === 'div') { autoN++; ctx.autoP++; open('p', { 'xml:id': prefix + '-auto' + autoN }, { auto: true }); }
      else if (t.name === 'lg') open('l', {});
    };

    for (const tok of tokens) {
      if (tok.t === 'pb' || tok.t === 'lb' || tok.t === 'cb') {
        top().children.push(node(tok.t, tok.brk ? { n: tok.n, break: 'no' } : { n: tok.n }));
        continue;
      }
      const n = tok.n;
      if (typeof n === 'string') {
        if (n.trim()) ensureText();
        top().children.push(n);
        continue;
      }
      if (n.name !== 'x-marker') {
        if (mergeSpan(top(), n)) { walkHands(n, ctx); continue; }
        ensureText();
        top().children.push(n);
        if (n.attrs.hand) ctx.hands.add(n.attrs.hand.replace(/^#/, ''));
        walkHands(n, ctx);
        continue;
      }
      const a = n.attrs;
      switch (a.type) {
        case 'p-start': {
          const q = indexOf('quote');
          if (q > 0) ctx.warn('A quotation was still open where paragraph ' + a.id + ' starts; it has been closed there.', tok.where);
          closeFrom(1);
          open('p', { 'xml:id': a.id });
          if (a.id) ctx.id(a.id, tok.where);
          break;
        }
        case 'p-end': {
          const i = indexOf('p');
          if (i < 0) { ctx.warn('Paragraph end without an open paragraph — ignored.', tok.where); break; }
          if (indexOf('quote') > i) ctx.warn('A quotation was still open at the end of a paragraph; it has been closed there.', tok.where);
          closeFrom(i);
          break;
        }
        case 'lg-start': {
          const i = indexOf('lg');
          if (i > 0) closeFrom(i);
          if (top().name === 'l') closeFrom(stack.length - 1);
          open('lg', { 'xml:id': a.id });
          open('l', {});
          if (a.id) ctx.id(a.id, tok.where);
          break;
        }
        case 'lg-end': {
          const i = indexOf('lg');
          if (i < 0) { ctx.warn('Verse end without an open verse — ignored.', tok.where); break; }
          closeFrom(i);
          break;
        }
        case 'l': {
          const i = indexOf('lg');
          if (i < 0) { ctx.warn('Verse line marker outside a verse — ignored.', tok.where); break; }
          // quotations that run across the verse line are continued in the next <l>
          const reopen = stack.slice(i + 1).filter((x) => x.name === 'quote').map((x) => x.attrs);
          closeFrom(i + 1);
          open('l', {});
          for (const qa of reopen) open('quote', Object.assign({}, qa));
          break;
        }
        case 'q-start': {
          if (indexOf('quote') > 0) { ctx.warn('A new quotation starts before the previous one was closed; the previous one has been closed.', tok.where); closeFrom(indexOf('quote')); }
          if (top().name === 'div') { autoN++; ctx.autoP++; open('p', { 'xml:id': prefix + '-auto' + autoN }, { auto: true }); }
          else if (top().name === 'lg') open('l', {});
          const qa = {};
          if (a.source) qa.source = sourceValue(a.source, ctx);
          if (a.n) qa.n = a.n;
          open('quote', qa, { where: tok.where });
          break;
        }
        case 'q-end': {
          const i = indexOf('quote');
          if (i < 0) { ctx.warn('Quotation end without an open quotation — ignored.', tok.where); break; }
          closeFrom(i);
          break;
        }
        default:
      }
    }
    const q = indexOf('quote');
    if (q > 0) ctx.warn('A quotation started at ' + (stack[q].where || '?') + ' is never closed; it was closed at the end of the text.', stack[q].where);
    for (const s of stack) delete s.where;
    return div;
  }

  function walkHands(n, ctx) {
    for (const c of n.children) if (typeof c !== 'string') { if (c.attrs.hand) ctx.hands.add(c.attrs.hand.replace(/^#/, '')); walkHands(c, ctx); }
  }

  /* ---------- header ---------- */

  function header(project, ctx, titleSuffix) {
    const m = project.meta;
    const t = (s) => (s ? [s] : []);
    const titleStmt = node('titleStmt', {}, [node('title', {}, [(m.title || 'Untitled') + (titleSuffix || '')])]);
    if (m.author) titleStmt.children.push(node('author', {}, [m.author]));
    if (m.transcriber) titleStmt.children.push(node('respStmt', {}, [node('resp', {}, ['Diplomatic transcription']), node('name', {}, [m.transcriber])]));
    const fileDesc = node('fileDesc', {}, [titleStmt, node('publicationStmt', {}, [node('p', {}, ['Unpublished diplomatic transcription, prepared with Manuscribe.'])])]);
    if (m.notes) fileDesc.children.push(node('notesStmt', {}, [node('note', {}, [m.notes])]));

    const msIdentifier = node('msIdentifier');
    if (m.country) msIdentifier.children.push(node('country', {}, t(m.country)));
    if (m.settlement) msIdentifier.children.push(node('settlement', {}, t(m.settlement)));
    if (m.repository) msIdentifier.children.push(node('repository', {}, t(m.repository)));
    if (m.shelfmark) msIdentifier.children.push(node('idno', { type: 'shelfmark' }, t(m.shelfmark)));
    msIdentifier.children.push(node('idno', { type: 'siglum' }, t(m.siglum || 'A')));
    if (!m.siglum) ctx.warn('No siglum is set (Manuscript tab); "A" was used. Saktumiva uses the siglum in the apparatus.');

    const msItem = node('msItem', {}, [node('title', {}, [m.title || 'Untitled'])]);
    if (m.author) msItem.children.push(node('author', {}, [m.author]));
    const language = m.language || 'Sanskrit';
    const code = LANG_CODE[language];
    const mainLang = m.script || 'sa-Deva';
    msItem.children.push(node('textLang', { mainLang: code ? mainLang.replace(/^[a-z]+/, code) : mainLang }, [language]));

    const types = new Set(Object.keys(project.pages).map((l) => Model.pageLayout(project, l)));
    types.add(project.layout.type);
    const lines = Object.entries(project.layout.lines).filter(([b]) => Model.LAYOUTS[project.layout.type].boxes.includes(b));
    const layoutP = Array.from(types).map((x) => Model.LAYOUTS[x].label).join(' / ') + ' layout. Lines per folio side: ' + lines.map(([b, n]) => Model.BOX_LABEL[b].toLowerCase() + ' ' + n).join(', ') + '.';
    const objectDesc = node('objectDesc', { form: m.form || 'pothi' });
    if (m.material) objectDesc.children.push(node('supportDesc', { material: m.material }, [node('support', {}, [node('p', {}, [m.material])])]));
    objectDesc.children.push(node('layoutDesc', {}, [node('layout', { writtenLines: String(project.layout.lines.main) }, [node('p', {}, [layoutP])])]));
    const physDesc = node('physDesc', {}, [objectDesc]);
    if (ctx.hands.size || m.scribe) {
      const hd = node('handDesc');
      const hands = new Set(ctx.hands);
      if (m.scribe) hands.add('scribe');
      for (const h of hands) {
        const label = h === 'scribe' ? 'Main scribe' + (m.scribe ? ': ' + m.scribe : '') : h === 'later' ? 'A later hand (annotator / corrector)' : h;
        hd.children.push(node('handNote', Object.assign({ 'xml:id': h }, h === 'scribe' && m.scribe ? { scribe: m.scribe.replace(/\s+/g, '_') } : {}), [node('p', {}, [label])]));
      }
      physDesc.children.push(hd);
    }
    const msDesc = node('msDesc', {}, [msIdentifier, node('msContents', {}, [msItem]), physDesc]);
    if (m.date) msDesc.children.push(node('history', {}, [node('origin', {}, [node('origDate', {}, [m.date])])]));
    const sourceDesc = node('sourceDesc', {}, [msDesc]);
    const works = project.works.filter((w) => ctx.works.has(w.id) || ctx.allWorks);
    if (works.length) {
      sourceDesc.children.push(node('listBibl', {}, works.map((w) => {
        const b = node('bibl', { 'xml:id': ctx.workIds[w.id] || w.id }, [node('title', {}, [w.title])]);
        if (w.author) b.children.push(node('author', {}, [w.author]));
        if (w.abbr) b.children.push(node('abbr', {}, [w.abbr]));
        return b;
      })));
    }
    for (const id of ctx.works) if (!project.works.some((w) => w.id === id)) ctx.warn('A quotation refers to a cited work that has been deleted (' + id + ').');
    fileDesc.children.push(sourceDesc);
    const today = new Date().toISOString().slice(0, 10);
    return node('teiHeader', {}, [fileDesc, node('revisionDesc', {}, [node('change', { when: today }, ['Exported from Manuscribe.'])])]);
  }

  /* The xml:id of a cited work is its short label (e.g. NAND), made valid as an XML name and
     unique - also against the xml:ids of paragraphs and verses. */
  function workXmlIds(project) {
    const taken = new Set();
    const re = /<x-marker\b[^>]*\bid="([^"]*)"/g;
    for (const pg of Object.values(project.pages)) {
      for (const lines of Object.values(pg.boxes || {})) for (const l of lines) { let m; while ((m = re.exec(l || ''))) taken.add(m[1]); }
    }
    const out = {};
    for (const w of project.works) {
      let base = String(w.abbr || w.title || w.id).normalize('NFC').trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{M}\p{N}._-]/gu, '_');
      if (!/^[\p{L}_]/u.test(base)) base = 'w_' + base;
      let id = base, k = 2;
      while (taken.has(id)) id = base + '-' + k++;
      taken.add(id);
      out[w.id] = id;
    }
    return out;
  }

  /* ---------- public ---------- */

  const Export = {};

  Export.streamsUsed = function (project) {
    const keys = new Set(Model.LAYOUTS[project.layout.type].streams.map((s) => s.key));
    for (const label of Object.keys(project.pages)) for (const s of Model.LAYOUTS[Model.pageLayout(project, label)].streams) keys.add(s.key);
    return ['main', 'commentary', 'gloss'].filter((k) => keys.has(k));
  };

  // opts: {streams: [keys], folios: [labels] | null, titleSuffix}
  Export.build = function (project, opts) {
    const o = opts || {};
    const warnings = [];
    const ids = new Map();
    const ctx = {
      workIds: workXmlIds(project),
      autoP: 0, hands: new Set(), works: new Set(), allWorks: false,
      warn: (msg, where) => warnings.push({ msg, where }),
      id: (id, where) => { if (ids.has(id)) warnings.push({ msg: 'Duplicate xml:id "' + id + '" (also at ' + ids.get(id) + ')', where, error: true }); else ids.set(id, where); },
    };
    let entries = Model.entries(project);
    if (o.folios) entries = entries.filter((e) => o.folios.includes(e.label));
    const seen = new Map();
    for (const e of entries) { if (seen.has(e.label) && Model.pageHasContent(project.pages[e.label])) warnings.push({ msg: 'Folio label "' + e.label + '" is used for two PDF pages (' + seen.get(e.label) + ' and ' + e.pdfPage + ')', error: true }); seen.set(e.label, e.pdfPage); }
    const uniq = entries.filter((e, i) => entries.findIndex((x) => x.label === e.label) === i);
    const streams = o.streams || Export.streamsUsed(project);
    const divs = [];
    let lineCount = 0;
    for (const key of streams) {
      const tokens = streamTokens(project, key, uniq, ctx);
      lineCount += tokens.filter((t) => t.t === 'lb').length;
      if (!tokens.length) continue;
      divs.push(buildDiv(tokens, key, ctx));
    }
    if (!divs.length) divs.push(node('div', {}, [node('p', { 'xml:id': 'empty' }, ['(nothing transcribed yet)'])]));
    if (ctx.autoP) warnings.push({ msg: ctx.autoP + ' passage(s) were not inside a paragraph or verse and were wrapped in automatic <p xml:id="…-autoN">. Mark paragraphs (' + ME.Commands.keyLabel('P') + ') and verses (' + ME.Commands.keyLabel('V') + ') so that Saktumiva can collate them.' });
    const tei = node('TEI', { xmlns: 'http://www.tei-c.org/ns/1.0' }, [
      header(project, ctx, o.titleSuffix),
      node('text', { 'xml:lang': project.meta.textLang || 'sa-Latn' }, [node('body', {}, divs)]),
    ]);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + serialize(tei, 0) + '\n';
    const check = new DOMParser().parseFromString(xml, 'application/xml');
    const perr = check.getElementsByTagName('parsererror')[0];
    if (perr) warnings.unshift({ msg: 'The generated XML is not well-formed: ' + perr.textContent.slice(0, 300), error: true });
    return { xml, warnings, stats: { lines: lineCount, folios: uniq.filter((e) => project.pages[e.label] && Model.pageHasContent(project.pages[e.label])).length, ids: ids.size, chars: xml.length } };
  };

  /* The XML of one folio side, for pasting into a larger file: only the text as it stands inside
     <p>, with its <pb/>, <lb/> and tags. Paragraph, verse and quotation tags that start or end on
     this folio are written where they stand; the ones that merely run through it are left out. */
  Export.folioXml = function (project, entry) {
    const entries = Model.entries(project);
    const idx = entries.findIndex((e) => e.label === entry.label);
    const ctx = {
      workIds: workXmlIds(project), autoP: 0, hands: new Set(), works: new Set(),
      warn: () => {}, id: () => {},
    };
    const type = Model.pageLayout(project, entry.label);
    const out = [];
    let lines = 0;
    for (const s of Model.LAYOUTS[type].streams) {
      const tokens = streamTokens(project, s.key, [entries[idx]], ctx, endBefore(project, s.key, entries, idx));
      if (!tokens.length) continue;
      const before = Model.linesBefore(project, entry.label, s.boxes[0], 0);
      const st = Model.openState(before);
      let p = !!st.p, lg = !!st.lg, q = !!st.quote;
      const flat = node('flat');
      const raw = (x) => flat.children.push({ raw: x });
      for (const tok of tokens) {
        if (tok.t === 'pb' || tok.t === 'lb' || tok.t === 'cb') {
          flat.children.push(node(tok.t, tok.brk ? { n: tok.n, break: 'no' } : { n: tok.n }));
          if (tok.t === 'lb') lines++;
        } else if (typeof tok.n === 'string') flat.children.push(tok.n);
        else if (tok.n.name !== 'x-marker') { if (!mergeSpan(flat, tok.n)) flat.children.push(tok.n); }
        else {
          const a = tok.n.attrs;
          const id = TEI.attrString({ 'xml:id': a.id });
          switch (a.type) {
            case 'p-start':
              if (q) { raw('</quote>'); q = false; }
              if (lg) { raw('</l></lg>'); lg = false; }
              if (p) raw('</p>');
              raw('<p' + id + '>');
              p = true;
              break;
            case 'p-end': if (lg) { raw('</l></lg>'); lg = false; } raw('</p>'); p = false; break;
            case 'lg-start': if (lg) raw('</l></lg>'); raw('<lg' + id + '><l>'); lg = true; break;
            case 'lg-end': raw('</l></lg>'); lg = false; break;
            case 'l': raw('</l><l>'); break;
            case 'q-start': raw('<quote' + TEI.attrString({ source: a.source ? sourceValue(a.source, ctx) : '', n: a.n }) + '>'); q = true; break;
            case 'q-end': raw('</quote>'); q = false; break;
            default:
          }
        }
      }
      out.push(mixed(flat.children, 0).trim());
    }
    return { xml: out.join('\n\n'), lines };
  };

  Export.highlight = function (xml) {
    return U.escHtml(xml)
      .replace(/(&lt;\/?)([\w:-]+)((?:\s+[\w:-]+=&quot;[^&]*?&quot;)*)\s*(\/?&gt;)/g, (m0, a, name, attrs, close) =>
        '<span class="x-p">' + a + '</span><span class="x-n">' + name + '</span>' +
        attrs.replace(/([\w:-]+)=(&quot;[^&]*?&quot;)/g, '<span class="x-a">$1</span>=<span class="x-v">$2</span>') +
        '<span class="x-p">' + close + '</span>');
  };

  Export.open = async function (project, entry) {
    const streams = Export.streamsUsed(project);
    const multi = streams.length > 1;
    const sel = {};
    const streamBoxes = U.el('div', { class: 'export-streams' }, streams.map((k) => {
      const cb = U.el('input', { type: 'checkbox', checked: true, onchange: () => { sel[k] = cb.checked; refresh(); } });
      sel[k] = true;
      return U.el('label', { class: 'field check' }, cb, U.el('span', null, Model.STREAMS[k].label));
    }));
    const scope = U.el('select', { onchange: () => refresh() }, U.el('option', { value: 'all' }, 'Whole manuscript'), U.el('option', { value: 'folio' }, 'This folio side only (' + entry.label + ')'));
    const split = U.el('select', { onchange: () => refresh() }, U.el('option', { value: 'one' }, 'One file (one <div> per stream)'), U.el('option', { value: 'separate' }, 'A separate file per stream'));
    const warnBox = U.el('div', { class: 'export-warnings' });
    const statBox = U.el('div', { class: 'export-stats' });
    const pre = U.el('pre', { class: 'xml-preview' });
    let results = [];

    const base = (project.meta.siglum || project.meta.title || 'transcription').replace(/[^\wÀ-ɏऀ-ॿ.-]+/g, '_');
    function refresh() {
      const keys = streams.filter((k) => sel[k]);
      const folios = scope.value === 'folio' ? [entry.label] : null;
      results = [];
      if (split.value === 'separate' && keys.length > 1) {
        for (const k of keys) results.push(Object.assign({ name: base + '_' + k + '.xml' }, Export.build(project, { streams: [k], folios, titleSuffix: ' (' + Model.STREAMS[k].label.toLowerCase() + ')' })));
      } else {
        results.push(Object.assign({ name: base + '.xml' }, Export.build(project, { streams: keys, folios })));
      }
      const all = results.flatMap((r) => r.warnings);
      const uniqW = all.filter((w, i) => all.findIndex((x) => x.msg === w.msg) === i);
      warnBox.innerHTML = '';
      if (!uniqW.length) warnBox.appendChild(U.el('div', { class: 'ok' }, '✓ Well-formed TEI. No problems found.'));
      for (const w of uniqW) warnBox.appendChild(U.el('div', { class: w.error ? 'err' : 'warn' }, (w.error ? '✕ ' : '⚠ ') + w.msg + (w.where && !w.msg.includes(w.where) ? '  [' + w.where + ']' : '')));
      const r0 = results[0];
      statBox.textContent = results.map((r) => r.name).join(', ') + ' — ' + r0.stats.folios + ' folio side(s), ' + results.reduce((s, r) => s + r.stats.lines, 0) + ' lines, ' + r0.stats.ids + ' paragraphs/verses';
      // colouring is what takes time on a long manuscript: only the beginning is shown
      const LIMIT = 40000;
      pre.innerHTML = Export.highlight(r0.xml.length > LIMIT ? r0.xml.slice(0, LIMIT) : r0.xml);
      if (r0.xml.length > LIMIT) pre.appendChild(U.el('div', { class: 'preview-more' }, '… only the beginning is shown here; the file and the copy have everything.'));
    }
    refresh();
    const body = U.el('div', { class: 'export' },
      U.el('div', { class: 'export-opts' },
        multi ? U.el('div', null, U.el('div', { class: 'opt-title' }, 'Include'), streamBoxes) : null,
        U.el('label', { class: 'field' }, U.el('span', null, 'Scope'), scope),
        multi ? U.el('label', { class: 'field' }, U.el('span', null, 'Files'), split) : null),
      statBox, warnBox, pre);
    const res = await UI.modal({
      title: 'Export Saktumiva TEI XML', body, wide: true,
      buttons: [
        { label: 'Copy XML', kind: 'ghost', left: true, value: 'copy' },
        { label: 'Close', kind: 'ghost', value: null },
        { label: 'Download .html', kind: 'ghost', value: 'html' },
        { label: 'Download .xml', kind: 'primary', value: 'download' },
      ],
    });
    if (res === 'download') {
      for (const r of results) U.download(r.name, r.xml, 'application/xml');
      U.toast('Saved ' + results.map((r) => r.name).join(', '), 'ok');
    } else if (res === 'html') {
      const page = await Export.html(project, { folios: scope.value === 'folio' ? [entry.label] : null });
      if (!page.folios) { U.toast('No transcribed folio to export', 'warn'); return; }
      U.download(base + '.html', page.html, 'text/html');
      U.toast('Saved ' + base + '.html (' + page.folios + ' folio side(s))' + (page.font ? '' : '. The font could not be embedded: the page uses the fonts of the reader’s computer.'), page.font ? 'ok' : 'warn', page.font ? 2600 : 6000);
    } else if (res === 'copy') {
      if (await U.copyText(results[0].xml)) U.toast('XML copied to the clipboard', 'ok'); else U.toast('Could not copy to the clipboard', 'warn');
    }
  };

  ME.Export = Export;
})(window.ME);
