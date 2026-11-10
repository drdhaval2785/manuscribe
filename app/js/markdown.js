'use strict';
/* Markdown, for the editor's own documents and for sites that take Markdown (GitHub, Obsidian, Pandoc, Jekyll…).

   An edition: what the print edition has (PrintHTML.data), in Markdown: the title, the citation, the conspectus as a
   table and the editorial principles; then the edited text, a paragraph for each block (a commentary set off with
   ">" and its [abbr]), each note of the apparatus a footnote at its lemma ([^…]), with its testimonia, singular
   readings, spelling and decisions; then the versions. For a book (opts.bare): the text and its footnotes only.

   A transcription: each folio side with its lines, numbered, block by block, letters as written; a deletion struck
   (~~…~~), an addition and supplied text in ⟨…⟩, a gap as […]. */
(function (ME) {
  const MD = {};

  /* What Markdown would read as its own, in text that is not, and no more: the lemma's "]" of every note stays as
     it is. Emphasis, code and HTML anywhere; a footnote's "[^"; "~~"; and at the start of a line, a heading, a
     quotation or a list. */
  const esc = (s) => String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([*_`<])/g, '\\$1')
    .replace(/\[\^/g, '\\[^')
    .replace(/~~/g, '\\~\\~')
    .replace(/^(\s*)([#>]|[-+]\s)/gm, (m, a, b) => a + '\\' + b)
    .replace(/^(\s*\d+)([.)]\s)/gm, '$1\\$2');
  // in a cell of a table, also its "|"
  const cell = (s) => esc(s).replace(/\|/g, '\\|');

  /* HTML of the print page's data (escaped text, <span class="an">, <sup>…) as Markdown. an(k): the marker of note k */
  function fromHtml(html, an) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const walk = (node) => {
      let out = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) out += esc(c.textContent);
        else if (c.nodeType === 1) {
          if (c.classList.contains('an')) out += an ? an(c.dataset.k) : '';
          else if (c.classList.contains('labl')) out += '**' + esc(c.textContent) + '**';
          else if (c.tagName === 'SUP') out += '<sup>' + esc(c.textContent) + '</sup>';
          else out += walk(c);
        }
      }
      return out;
    };
    return walk(box).replace(/[ \t]+/g, ' ').trim();
  }

  const SERIES = { B: 'Testimonia', C: 'Singular readings', D: 'Spelling', E: 'Decisions' };

  /* The edition, as Markdown. -> string */
  MD.edition = function (ed, list, built, opts) {
    const bare = !!(opts && opts.bare);
    const D = ME.PrintHTML.data(ed, list, built, { bare });
    const out = [];
    if (!bare) {
      out.push('# ' + esc(D.title), '');
      if (D.editor) out.push('*edited by ' + esc(D.editor) + '*', '');
      out.push(esc(D.citation), '');
      out.push('## Conspectus siglorum', '', '| Siglum | Manuscript |', '|---|---|');
      for (const r of D.conspectus) out.push('| ' + cell(r.siglum) + ' | ' + cell(r.desc || '—') + ' |');
      out.push('');
      const layers = (D.layers || []).filter((l) => l.abbr);
      if (layers.length) {
        out.push(layers.some((l) => !l.depth) ? '## The text and its commentaries' : '## The commentaries', '');
        for (const l of layers) out.push('  '.repeat(Math.max(0, l.depth - 1)) + '- **[' + esc(l.abbr) + ']** ' + esc(l.name));
        out.push('');
      }
      out.push('## Editorial principles', '');
      for (const p of D.principles) out.push(esc(p), '');
      out.push('## Text', '');
    }
    const notes = [];
    for (const b of D.blocks) {
      const id = (k) => b.id.replace(/[^\w.-]+/g, '_') + '-' + k;
      const texts = new Map();
      for (const n of b.notes) {
        const parts = [];
        if (n.by.A) parts.push(fromHtml(n.by.A));
        for (const [s, label] of Object.entries(SERIES)) if (n.by[s]) parts.push('*' + label + ':* ' + fromHtml(n.by[s]));
        if (parts.length) texts.set(String(n.k), parts.join(' — '));
      }
      // a note with nothing to say has no footnote, and so no marker, which would show as text
      const para = fromHtml(b.html, (k) => (texts.has(String(k)) ? '[^' + id(k) + ']' : ''));
      out.push((b.depth ? '> '.repeat(b.depth) : '') + para, '');
      for (const [k, text] of texts) notes.push('[^' + id(k) + ']: ' + text);
    }
    if (D.stars && D.stars.length) {
      out.push('## Additional passages', '');
      for (const s of D.stars) out.push('**' + esc(s.id) + '** (' + esc(s.wits) + '): ' + esc(s.text), '');
    }
    if (notes.length) out.push(...notes, '');
    if (!bare && D.versions) out.push('---', '', '*' + esc(D.versions) + '*', '');
    return out.join('\n');
  };

  /* One line of a transcription, as Markdown: letters as written, with the scribe's deletions and additions shown. */
  MD.line = function (str) {
    const root = ME.TEI.parse(str);
    if (!root) return esc(String(str || '').replace(/<[^>]*>/g, ''));
    const walk = (node) => {
      let out = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { out += esc(c.textContent); continue; }
        if (c.nodeType !== 1) continue;
        const name = c.localName;
        const inner = walk(c);
        if (name === 'del' || name === 'surplus') out += inner.trim() ? '~~' + inner + '~~' : '';
        else if (name === 'add' || name === 'supplied') out += '⟨' + inner + '⟩';
        else if (name === 'gap') out += '[…]';
        else if (name === 'note' || name === 'x-marker' || name === 'metamark') out += '';
        else if (name === 'choice') { const first = c.firstElementChild; out += first ? walk(first) : inner; }
        else out += inner;
      }
      return out;
    };
    return walk(root).replace(/[ \t]+/g, ' ').trim();
  };

  /* A transcription, as Markdown. -> string */
  MD.transcription = function (project) {
    const M = ME.Model, m = project.meta || {};
    const out = ['# ' + esc((m.title || 'Untitled') + (m.siglum ? ' (' + m.siglum + ')' : '')), ''];
    const about = [m.repository, m.settlement, m.shelfmark, m.date].filter(Boolean).join(', ');
    if (about) out.push(esc(about), '');
    const seen = new Set();
    for (const e of M.entries(project)) {
      if (seen.has(e.label)) continue;
      seen.add(e.label);
      const pg = project.pages[e.label];
      if (!pg || !M.pageHasContent(pg)) continue;
      out.push('## Folio ' + esc(e.label), '');
      const boxes = M.LAYOUTS[M.pageLayout(project, e.label)].boxes.filter((b) => (pg.boxes[b] || []).some((l) => ME.TEI.hasContent(l)));
      for (const b of boxes) {
        if (boxes.length > 1) out.push('### ' + esc(M.BOX_LABEL[b] || b), '');
        const lines = (pg.boxes[b] || []).map((l) => MD.line(l));
        while (lines.length && !lines[lines.length - 1]) lines.pop();
        // each line of the folio an item of a numbered list, so that the lines keep their numbers
        out.push(lines.map((l, i) => (i + 1) + '. ' + l).join('\n'), '');
      }
    }
    out.push('---', '', '*Exported ' + new Date().toISOString().slice(0, 10) + ' · Made with Manuscribe ' + ME.VERSION + '*', '');
    return out.join('\n');
  };

  ME.Markdown = MD;
})(window.ME);
