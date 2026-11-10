'use strict';
/* A concordance over the editor's own witnesses and over text packs the editor brings in, each with its licence;
   and the word and pāda indices of an edited text. No corpus comes with Manuscribe: what may be used, and on
   what terms, varies from file to file. */
(function (ME) {
  const { Norm, TEI, Model, Spans, Metre } = ME;
  const Concord = {};

  /* ---------- packs ---------- */

  /* Lines from a file: plain text (one passage a line, optionally "reference<TAB>text"), TEI (each <l>, <p> or
     <ab>, referred to by its n or xml:id), or JSON ([{ref, text}]). -> [{ref, text}] */
  Concord.parse = function (name, text) {
    const t = String(text || '');
    if (/\.json$/i.test(name) || /^\s*\[/.test(t)) {
      const data = JSON.parse(t);
      if (!Array.isArray(data)) throw new Error('a JSON pack is a list of {ref, text}');
      return data.filter((x) => x && x.text).map((x, i) => ({ ref: String(x.ref || i + 1), text: String(x.text) }));
    }
    if (/^\s*</.test(t)) {
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('this is not well-formed XML');
      const out = [];
      let k = 0;
      for (const el of Array.from(doc.getElementsByTagName('*'))) {
        if (!['l', 'p', 'ab'].includes(el.localName)) continue;
        if (el.localName === 'p' && el.getElementsByTagName('l').length) continue;
        k++;
        const ref = el.getAttribute('n') || el.getAttribute('xml:id') || (el.parentNode && el.parentNode.getAttribute && (el.parentNode.getAttribute('n') || el.parentNode.getAttribute('xml:id'))) || String(k);
        const s = el.textContent.replace(/\s+/g, ' ').trim();
        if (s) out.push({ ref, text: s });
      }
      return out;
    }
    return t.split(/\r?\n/).map((line, i) => {
      const tab = line.indexOf('\t');
      return tab > 0 ? { ref: line.slice(0, tab).trim(), text: line.slice(tab + 1).trim() } : { ref: 'line ' + (i + 1), text: line.trim() };
    }).filter((x) => x.text);
  };

  /* ---------- searching ---------- */

  // What is compared: the letters after the edition's rules, without spaces, so that word division and spelling
  // the rules ignore do not hide a passage.
  const keyOf = (s, rules) => Norm.apply(s, { rules }).text.replace(/\s+/g, '');

  // The editor's witnesses, line by line, as {ref, text, place}.
  Concord.ownLines = function (list) {
    const out = [];
    for (const { w, p } of list) {
      if (!p) continue;
      for (const key of ME.Export.streamsUsed(p)) {
        for (const { label, box, i } of Spans.streamSeq(p, key)) {
          const pg = p.pages[label];
          const l = pg && pg.boxes && pg.boxes[box] && pg.boxes[box][i];
          if (!TEI.hasContent(l)) continue;
          out.push({ ref: w.siglum + ' ' + label + ' ' + box + ' ' + Model.lineNumber(p, label, box, i), text: TEI.plainText(l), place: { siglum: w.siglum, projectId: w.projectId, label, box, i } });
        }
      }
    }
    return out;
  };

  /* Where the query occurs. sources: [{name, licence, lines}]; a passage that runs over two lines is found too.
     -> [{source, ref, text, at}] */
  Concord.search = function (query, sources, rules, limit) {
    const q = keyOf(query, rules);
    if (q.length < 2) return [];
    const out = [];
    for (const src of sources) {
      const keys = src._keys || (src._keys = src.lines.map((l) => keyOf(l.text, rules)));
      for (let i = 0; i < keys.length && out.length < (limit || 300); i++) {
        const here = keys[i], joined = here + (keys[i + 1] || '');
        const at = joined.indexOf(q);
        if (at >= 0 && at < here.length) out.push({ source: src, ref: src.lines[i].ref, text: src.lines[i].text + (at + q.length > here.length && src.lines[i + 1] ? ' / ' + src.lines[i + 1].text : ''), place: src.lines[i].place || null });
      }
    }
    return out;
  };

  /* ---------- indices ---------- */

  const collator = (() => { try { return new Intl.Collator('sa'); } catch (e) { return new Intl.Collator(); } })();

  /* Every word of the edited text, in the order of the Sanskrit alphabet, with where it stands. built: as from
     Apparatus.entries. -> [{word, refs: [ref]}] */
  Concord.wordIndex = function (built) {
    const map = new Map();
    for (const b of built) {
      let k = 0;
      for (const raw of b.text.split(/\s+/)) {
        const word = raw.replace(/[।॥|.,;:'"“”‘’()[\]॰،؛؟-]+/g, '').trim();
        if (!word || /^[\d०-९]+$/.test(word)) continue;
        k++;
        if (!map.has(word)) map.set(word, []);
        map.get(word).push(b.table.unit + '.' + k);
      }
    }
    return [...map].map(([word, refs]) => ({ word, refs })).sort((a, b) => collator.compare(a.word, b.word));
  };

  /* Every quotation marked in the text, in the order of the alphabet by its words, with its place (block and word)
     and the work it is from. built: as from Apparatus.entries. -> [{text, ref, work, abbr, n}] */
  Concord.quoteIndex = function (built) {
    const out = [];
    for (const b of built) {
      const { text, quotes } = ME.Apparatus.anchors(b);
      for (const q of quotes || []) {
        const t = text.slice(q.from, q.to).replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const word = text.slice(0, q.from).split(/\s+/).filter(Boolean).length + 1;
        out.push({ text: t, ref: b.table.unit + '.' + word, work: q.work || '', abbr: q.abbr || '', n: q.n || '' });
      }
    }
    return out.sort((a, b) => collator.compare(a.text, b.text));
  };

  /* The same by the work quoted: the works in the order of the alphabet, the quotations of each likewise, those from
     no named work last. -> [{work, quotes: [{text, ref, n}]}] */
  Concord.quotesByWork = function (built) {
    const by = new Map();
    for (const q of Concord.quoteIndex(built)) { if (!by.has(q.work)) by.set(q.work, []); by.get(q.work).push(q); }
    return [...by].map(([work, quotes]) => ({ work, quotes })).sort((a, b) => (a.work ? 0 : 1) - (b.work ? 0 : 1) || collator.compare(a.work, b.work));
  };

  /* The pādas of the blocks that are verse, alphabetically, each with its verse and letter. -> [{pada, ref, metre}] */
  Concord.padaIndex = function (built) {
    const out = [];
    for (const b of built) {
      const text = b.text.trim();
      const r = Metre.identify(text);
      if (!r.metre || !r.padas) continue;
      r.padas.forEach((p, k) => {
        if (!p.length) return;
        // from its first syllable to the first of the next pāda: a syllable's consonants belong to the vowel after them
        const next = r.padas.slice(k + 1).find((x) => x.length);
        const from = p[0].at, to = next ? next[0].at : text.length;
        const pada = text.slice(from, to).replace(/[।॥|]+/g, '').trim();
        if (pada) out.push({ pada, ref: b.table.unit + ('abcd'[k] || ''), metre: r.metre });
      });
    }
    return out.sort((a, b) => collator.compare(a.pada, b.pada));
  };

  /* ---------- the indices chosen ---------- */

  /* which: {padas, words, quotes, byWork}, each true to have it; all four when not given. -> the same, as booleans */
  Concord.choice = (which) => (which ? { padas: !!which.padas, words: !!which.words, quotes: !!which.quotes, byWork: !!which.byWork } : { padas: true, words: true, quotes: true, byWork: true });
  /* The indices chosen, each computed only if chosen. -> {padas, words, quotes, byWork}, [] where not chosen */
  Concord.indices = function (built, which) {
    const c = Concord.choice(which);
    return { padas: c.padas ? Concord.padaIndex(built) : [], words: c.words ? Concord.wordIndex(built) : [], quotes: c.quotes ? Concord.quoteIndex(built) : [], byWork: c.byWork ? Concord.quotesByWork(built) : [] };
  };
  /* The same as plain arrays, for a page that carries them as JSON: words [word, refs], pādas [pāda, ref], quotations
     [text, ref, work, n], by work [work, [[text, ref, n]]]. */
  Concord.indicesData = function (built, which) {
    const ix = Concord.indices(built, which);
    return { words: ix.words.map((w) => [w.word, w.refs]), padas: ix.padas.map((p) => [p.pada, p.ref]), quotes: ix.quotes.map((q) => [q.text, q.ref, q.work, q.n]), byWork: ix.byWork.map((g) => [g.work, g.quotes.map((q) => [q.text, q.ref, q.n])]) };
  };
  /* What an exporter's options ask for: none for a book (opts.bare: the text and its apparatus, nothing else), else
     opts.indices, else (undefined) all four. */
  Concord.wanted = (opts) => (opts && opts.bare ? { padas: false, words: false, quotes: false, byWork: false } : opts && opts.indices);
  Concord.any = (ix) => !!(ix && ((ix.padas || []).length || (ix.words || []).length || (ix.quotes || []).length || (ix.byWork || []).length));
  Concord.TITLES = { padas: 'Index of pādas', words: 'Index of words', quotes: 'Index of quotations', byWork: 'Quotations by work' };

  ME.Concord = Concord;
})(window.ME);
