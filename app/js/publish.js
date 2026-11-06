'use strict';
/* Publishing an edition: for print, a reledmac file for XeLaTeX with its font; for reading, one HTML file that
   needs nothing else and works offline. Both carry the conspectus of witnesses, the editorial principles,
   and the citation and version of the edition. */
(function (ME) {
  const { U, Norm, Collate, Apparatus: A, Model } = ME;
  const Publish = {};

  const longDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // How the edition asks to be cited, with the version. The version is the editor's, or a dated draft.
  Publish.citation = function (ed, when) {
    const d = when || new Date();
    const version = ed.version ? 'version ' + ed.version : 'draft of ' + longDate(d);
    return (ed.title || 'Untitled edition') + (ed.editor ? ', edited by ' + ed.editor : '') + '. ' + ed.witnesses.length + ' witnesses; ' + version + '. Made with Manuscribe (https://github.com/drdhaval2785/manuscribe).';
  };

  /* The witnesses, for a conspectus siglorum: [{siglum, place, date, script, material, folios, group, trust}] */
  Publish.conspectus = function (ed, list) {
    const order = Collate.trustOrder(ed);
    return ed.witnesses.map((w) => {
      const x = list.find((y) => y.w === w || y.w.siglum === w.siglum);
      const m = (x && x.p && x.p.meta) || {};
      const folios = x && x.p ? Object.keys(x.p.pages).filter((l) => Model.pageHasContent(x.p.pages[l])).length : 0;
      return {
        siglum: w.siglum, place: [m.repository, m.settlement, m.country].filter(Boolean).join(', '), shelfmark: m.shelfmark || '', title: m.title || '',
        date: m.date || '', script: m.script || '', material: m.material || '', folios, group: w.group || '', trust: order.indexOf(w.siglum) + 1,
      };
    });
  };

  // The principles of the edition, as plain paragraphs, from the settings in force.
  Publish.declaration = function (ed, built) {
    const n = Norm.describe(ed.norm);
    const s = A.settings(ed);
    const ab = A.abbr(ed);
    const decided = built.reduce((acc, b) => acc + b.entries.filter((e) => e.decision).length, 0);
    const emended = built.reduce((acc, b) => acc + b.entries.filter((e) => e.decision && /emendatio|conjecture/.test(e.decision.type)).length, 0);
    return [
      'The witnesses were transcribed diplomatically and lined up by computer, block by block, by their citation IDs, with the aligner of Saktumiva 2.0 by Charles Li; the alignment was then checked and corrected by the editor.',
      'Readings were compared after normalisation by the ' + n.name + ' profile' + (n.provisional ? ' (provisional)' : '') + ', with ' + n.rules.length + ' rules: ' + n.rules.map((r) => r.name.toLowerCase()).join('; ') + '. Text marked as ' + n.ignoredTags.map((t) => '<' + t + '>').join(', ') + ' was not compared.',
      'Where the witnesses differ, the reading of most witnesses was proposed, and where readings tie, that of the more trusted witness, in this order: ' + Collate.trustOrder(ed).join(', ') + '. The editor decided ' + decided + ' place(s)' + (emended ? ', of which ' + emended + ' by emendation or conjecture' : '') + '.',
      'The apparatus is ' + (s.polarity === 'auto' ? 'negative, and positive where few witnesses have the lemma' : s.polarity) + '. ' + ab.om + ' = omits, ' + ab.add + ' = adds, ' + ab.ac + ' = before correction, ' + ab.lac + ' = lost, ' + ab.em + ' = emended, ' + ab.conj + ' = conjectured; † marks a corrupt place, and a wavy line an uncertain one. A hyphen marks part of a word.' + (s.groups && ed.witnesses.some((w) => w.group) ? ' A group siglum stands for all its members that can be read at that place.' : ''),
    ];
  };

  /* ---------- print: reledmac on XeLaTeX ---------- */

  const tex = (s) => String(s).replace(/[\\{}$&#^_%~]/g, (c) => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\textasciicircum{}', _: '\\_', '%': '\\%', '~': '\\textasciitilde{}' }[c])).replace(/‡/g, '[…]').normalize('NFC');
  const texEntry = (html) => tex(html.replace(/<sup>([^<]*)<\/sup>/g, '\u0001$1\u0002')).replace(/\u0001([^\u0002]*)\u0002/g, '\\textsuperscript{$1}');

  /* -> string. Series A variants; B testimonia; C singular readings; D spelling variants; E the editor's reasons. */
  Publish.tex = function (ed, list, built) {
    const s = A.settings(ed);
    const rows = Publish.conspectus(ed, list);
    const blocks = built.map((b) => {
      const { singular, orthographica } = A.tiers(ed, b.entries);
      const tierOf = (e) => (e.kind === 'testimonium' ? null : e.kind === 'orthographic' ? (orthographica.includes(e) ? 'D' : null) : singular.includes(e) ? 'C' : 'A');
      const testis = (e) => (e && e.testimonia && e.testimonia.length ? '\\Bfootnote{' + tex(e.testimonia.map(ME.Layers.formatEvidence).join('; ')) + '}' : '');
      const byFrom = new Map(b.entries.map((e) => [e.fromId, e]));
      const pieces = []; // {text, notes: [tex]}
      for (const u of b.proposal.units) {
        const e = byFrom.get(u.fromId);
        const tier = e && tierOf(e);
        const d = e && e.decision;
        const reason = d && (d.reasons || d.note || d.source) ? '\\Efootnote{' + tex([d.type === 'selectio' ? 'chosen' : d.type, d.source, ...(d.reasons || []), d.note].filter(Boolean).join('; ')) + '}' : '';
        if (e && tier && e.kind === 'addition' && pieces.length) {
          // an addition is noted on the word before it
          const printed = A.format(ed, e);
          const prevWord = (e.prev || '').split(' ').pop();
          pieces[pieces.length - 1].notes.push({ lemma: prevWord, note: '\\' + tier + 'footnote{' + texEntry(printed.replace(/^\S+\s+\S+\s+/, '')) + '}' + reason });
          continue;
        }
        const piece = { text: u.text, notes: [], unsure: d && d.confidence === 'low', crux: d && d.crux };
        if (e && tier) {
          const printed = A.format(ed, e);
          const cut = printed.indexOf(' ]');
          piece.notes.push({ lemma: cut >= 0 ? printed.slice(0, cut) : '', note: '\\' + tier + 'footnote{' + texEntry(cut >= 0 ? printed.slice(cut + 2).trim() : printed) + '}' + reason + testis(e) });
        } else if (testis(e)) piece.notes.push({ lemma: '', note: testis(e) });
        pieces.push(piece);
      }
      const body = pieces.map((p) => {
        if (!p.notes.length && !p.unsure && !p.crux) return tex(p.text);
        const lead = (p.text.match(/^\s*/) || [''])[0], tail = (p.text.match(/\s*$/) || [''])[0];
        let core = tex(p.text.trim());
        if (p.crux) core = '†' + core + '†';
        if (p.unsure) core = '\\uwave{' + core + '}';
        // reledmac takes one note per series: further ones nest
        for (const n of p.notes) core = '\\edtext{' + core + '}{' + (n.lemma ? '\\lemma{' + texEntry(n.lemma) + '}' : '') + n.note + '}';
        return tex(lead) + core + tex(tail);
      }).join('');
      return '\\pstart\n\\noindent\\textbf{' + tex(b.table.unit) + '}\\quad ' + body.trim() + '\n\\pend';
    });
    const stars = built.flatMap((b) => b.stars);
    return '% ' + Publish.citation(ed) + '\n'
      + '% Compile with XeLaTeX, three times so that the line references settle: xelatex edition.tex\n'
      + '\\documentclass[11pt,a4paper]{article}\n'
      + '\\usepackage{fontspec}\n'
      + '\\XeTeXinputnormalization=1\n'
      + '\\setmainfont{TiroDevanagariSanskrit-Regular.ttf}[Path=fonts/, Script=Devanagari, AutoFakeSlant=0.15, AutoFakeBold=1.5]\n'
      + '\\usepackage[normalem]{ulem}\n'
      + '\\usepackage{reledmac}\n'
      + '\\Xarrangement[A]{paragraph}\\Xarrangement[B]{paragraph}\\Xarrangement[C]{paragraph}\\Xarrangement[D]{paragraph}\\Xarrangement[E]{paragraph}\n'
      + '\\Xnumberonlyfirstinline[A]\\Xnumberonlyfirstinline[B]\\Xnumberonlyfirstinline[C]\\Xnumberonlyfirstinline[D]\n'
      + '\\Xsymlinenum[A]{$|$}\n'
      + '\\firstlinenum{5}\\linenumincrement{5}\n'
      + '\\Xbhooknote[B]{\\textit{Testimonia:} }\\Xbhooknote[C]{\\textit{Singular readings:} }\\Xbhooknote[D]{\\textit{Spelling:} }\\Xbhooknote[E]{\\textit{Decisions:} }\n'
      + '\\begin{document}\n'
      + '\\begin{center}{\\Large ' + tex(ed.title || 'Edition') + '}\\\\[4pt]\\small ' + tex(Publish.citation(ed)) + '\\end{center}\n\n'
      + '\\section*{Conspectus siglorum}\n\\begin{tabular}{lllll}\n\\textbf{Siglum} & \\textbf{Manuscript} & \\textbf{Date} & \\textbf{Script} & \\textbf{Folio sides}\\\\\n'
      + rows.map((r) => tex(r.siglum) + (r.group ? ' (' + tex(r.group) + ')' : '') + ' & ' + tex([r.place, r.shelfmark || r.title].filter(Boolean).join(', ') || '—') + ' & ' + tex(r.date || '—') + ' & ' + tex(r.script || '—') + ' & ' + r.folios + '\\\\').join('\n')
      + '\n\\end{tabular}\n\n'
      + '\\section*{Editorial principles}\n' + Publish.declaration(ed, built).map(tex).join('\n\n') + '\n\n'
      + '\\section*{Text}\n\\beginnumbering\n' + blocks.join('\n\n') + '\n\\endnumbering\n'
      + (stars.length ? '\n\\section*{Additional passages}\n' + stars.map((x) => '\\noindent\\textbf{' + tex(x.id) + '} (' + tex(x.wits.join(' ')) + '): ' + tex(x.text) + '\\par').join('\n') + '\n' : '')
      + '\\end{document}\n';
  };

  // The .tex, the font it names and what to do with them, ready to zip.
  Publish.texFiles = async function (ed, list, built) {
    const font = await Publish.font();
    const files = [{ name: 'edition.tex', data: Publish.tex(ed, list, built) }];
    if (font) {
      files.push({ name: 'fonts/TiroDevanagariSanskrit-Regular.ttf', data: Uint8Array.from(atob(font.base64), (c) => c.charCodeAt(0)) });
      files.push({ name: 'fonts/OFL.txt', data: font.licence });
    }
    files.push({ name: 'README.txt', data: Publish.citation(ed) + '\n\nTo make the PDF: run "xelatex edition.tex" three times, in this folder, with a TeX distribution that has reledmac (TeX Live or MacTeX), or upload the folder to Overleaf and set its compiler to XeLaTeX.\nThe font is Tiro Devanagari Sanskrit, under the SIL Open Font License (fonts/OFL.txt).\n' });
    return files;
  };

  Publish.font = () => new Promise((resolve) => {
    if (ME.FONT) { resolve(ME.FONT); return; }
    const s = U.el('script', { src: 'fonts/tiro-regular.base64.js' });
    s.onload = () => resolve(ME.FONT || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  /* ---------- reading: one HTML file ---------- */

  // What the reader needs, and nothing of the editing: the text, the entries, the witnesses.
  Publish.readerData = function (ed, list, built, layered) {
    const linkOf = (unit) => (layered ? layered.links.find((l) => l.unit === unit) : null);
    return {
      base: layered ? { title: layered.title } : null,
      indices: ME.Concord ? { words: ME.Concord.wordIndex(built).map((w) => [w.word, w.refs]), padas: ME.Concord.padaIndex(built).map((p) => [p.pada, p.ref]) } : null,
      title: ed.title || 'Edition', citation: Publish.citation(ed), principles: Publish.declaration(ed, built), conspectus: Publish.conspectus(ed, list),
      sigla: ed.witnesses.map((w) => w.siglum),
      blocks: built.map((b) => {
        const { singular } = A.tiers(ed, b.entries);
        const byFrom = new Map(b.entries.map((e, i) => [e.fromId, i]));
        return {
          id: b.table.unit,
          base: linkOf(b.table.unit) ? linkOf(b.table.unit).base.map((x) => [x, layered.texts[x] || '']).filter((x) => x[1]) : [],
          units: b.proposal.units.map((u) => { const i = byFrom.get(u.fromId); return i === undefined ? [u.text] : [u.text, i]; }),
          entries: b.entries.map((e) => ({
            ref: e.ref, kind: e.kind, singular: singular.includes(e), printed: A.format(ed, e), lemma: e.lemma, lemWits: e.lemWits,
            testimonia: (e.testimonia || []).map(ME.Layers.formatEvidence),
            readings: e.readings.map((r) => ({ text: r.text, wits: r.wits })), orth: e.orth.map((o) => ({ text: o.text, wits: o.wits })),
            ac: e.ac.map((c) => ({ text: c.text, wit: c.wit })), missing: e.missing.map((m) => ({ wit: m.wit, why: m.why, text: m.text || '' })),
            decision: e.decision ? { type: e.decision.type, confidence: e.decision.confidence || null, crux: !!e.decision.crux, reasons: e.decision.reasons || [], note: e.decision.note || '', source: e.decision.source || '' } : null,
          })),
          stars: b.stars,
        };
      }),
    };
  };

  // Runs inside the reader file, so it can use nothing from outside itself.
  function reader() {
    const D = JSON.parse(document.getElementById('edition-data').textContent);
    const $ = (s, r) => (r || document).querySelector(s);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const state = { view: 'edited', swapped: {}, orth: false, singular: true, ac: true, heat: false };
    const witnessText = (e, w) => {
      const lost = e.missing.find((m) => m.wit === w);
      if (lost) return lost.text ? lost.text.replace(/‡/g, '[…]') : '[…]';
      const o = e.orth.find((x) => x.wits.includes(w));
      if (o) return o.text;
      const r = e.readings.find((x) => x.wits.includes(w));
      if (r) return r.text;
      return e.lemma;
    };
    const draw = () => {
      const main = $('#text');
      let html = '';
      D.blocks.forEach((b, bi) => {
        let text = '';
        b.units.forEach(([t, i]) => {
          if (i === undefined) { text += esc(t); return; }
          const e = b.entries[i];
          const lead = (t.match(/^\s*/) || [''])[0], tail = (t.match(/\s*$/) || [''])[0];
          let shown = t.trim();
          let cls = 'u';
          const key = bi + ':' + i;
          if (state.view !== 'edited') shown = witnessText(e, state.view);
          else if (state.swapped[key] !== undefined) { shown = state.swapped[key]; cls += ' swapped'; }
          const hidden = (e.kind === 'orthographic' && !state.orth) || (e.singular && !state.singular);
          if (hidden && state.view === 'edited' && state.swapped[key] === undefined) { text += esc(t); return; }
          if (e.decision) cls += ' decided';
          if (e.decision && e.decision.confidence === 'low') cls += ' unsure';
          if (state.heat) cls += ' heat' + Math.min(4, e.readings.length + (e.missing.length ? 1 : 0));
          if (e.decision && e.decision.crux && state.view === 'edited') shown = '†' + shown + '†';
          text += esc(lead) + '<span class="' + cls + '" data-k="' + key + '" title="' + esc(e.ref) + '">' + (shown ? esc(shown) : '<span class="om">‸</span>') + '</span>' + esc(tail);
        });
        const items = b.entries.map((e, i) => {
          if ((e.kind === 'orthographic' && !state.orth) || (e.singular && !state.singular)) return '';
          let p = esc(e.printed).replace(/&lt;sup&gt;/g, '<sup>').replace(/&lt;\/sup&gt;/g, '</sup>');
          if (!state.ac) p = p.replace(/;?\s*[^;]*<sup>[^<]*<\/sup>/g, '');
          // each reading can be put into the text, to read it there
          const swaps = [e.lemma, ...e.readings.map((r) => r.text), ...e.orth.map((o) => o.text)].map((r, ri) => '<button class="swap" data-k="' + bi + ':' + i + '" data-r="' + ri + '" title="Read this in the text">' + (r ? esc(r) : '(omits)') + '</button>').join(' ');
          const why = e.decision && (e.decision.reasons.length || e.decision.note) ? '<span class="why">' + esc([e.decision.source, ...e.decision.reasons, e.decision.note].filter(Boolean).join('; ')) + '</span>' : '';
          if (e.kind === 'testimonium') return '<li data-k="' + bi + ':' + i + '" class="testis"><span class="ref">' + esc(e.ref) + '</span> ' + p + '</li>';
          const testis = e.testimonia && e.testimonia.length ? '<span class="testis"> Testimonia: ' + esc(e.testimonia.join('; ')) + '</span>' : '';
          return '<li data-k="' + bi + ':' + i + '" class="' + (e.kind === 'orthographic' ? 'orth' : e.singular ? 'single' : '') + '"><span class="ref">' + esc(e.ref) + '</span> ' + p + why + testis + '<span class="swaps">' + swaps + '</span></li>';
        }).join('');
        const mula = b.base && b.base.length ? '<blockquote class="mula" title="' + esc(D.base.title + ' ' + b.base.map((x) => x[0]).join(', ')) + '"><span class="ref">' + esc(D.base.title + ' ' + b.base.map((x) => x[0]).join(', ')) + '</span> ' + esc(b.base.map((x) => x[1]).join(' ')) + '</blockquote>' : '';
        html += '<section class="block" id="b-' + esc(b.id) + '"><h2>' + esc(b.id) + '</h2>' + mula + '<p class="txt">' + text.trim() + '</p><ol class="app">' + items + '</ol></section>';
      });
      main.innerHTML = html;
    };
    let lit = null;
    const light = (k) => {
      if (lit === k) return;
      document.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl'));
      lit = k;
      if (k) document.querySelectorAll('[data-k="' + k + '"]').forEach((x) => { if (!x.classList.contains('swap')) x.classList.add('hl'); });
    };
    document.addEventListener('mouseover', (ev) => { const x = ev.target.closest('[data-k]'); light(x ? x.getAttribute('data-k') : null); });
    document.addEventListener('click', (ev) => {
      const sw = ev.target.closest('.swap');
      if (sw) {
        const [bi, i] = sw.getAttribute('data-k').split(':').map(Number);
        const e = D.blocks[bi].entries[i];
        const r = +sw.getAttribute('data-r');
        const key = bi + ':' + i;
        const all = [e.lemma, ...e.readings.map((x) => x.text), ...e.orth.map((x) => x.text)];
        if (r === 0) delete state.swapped[key]; else state.swapped[key] = all[r];
        state.view = 'edited'; $('#view').value = 'edited';
        draw();
        return;
      }
      const u = ev.target.closest('.u');
      if (u) { const li = document.querySelector('li[data-k="' + u.getAttribute('data-k') + '"]'); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    $('#view').addEventListener('change', (ev) => { state.view = ev.target.value; draw(); });
    for (const k of ['orth', 'singular', 'ac', 'heat']) $('#t-' + k).addEventListener('change', (ev) => { state[k] = ev.target.checked; draw(); });
    $('#reset').addEventListener('click', () => { state.swapped = {}; draw(); });
    $('#print').addEventListener('click', () => window.print());
    draw();
  }

  const READER_CSS = `
:root { --ink: #2a2118; --muted: #7a6c58; --line: #e6dccb; --paper: #fffaf2; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 'Tiro Devanagari Sanskrit', 'Noto Serif Devanagari', serif; }
header { position: sticky; top: 0; z-index: 2; background: #f4eee2; border-bottom: 1px solid var(--line); padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; font: 13px system-ui, sans-serif; }
header h1 { font: 600 16px system-ui, sans-serif; margin: 0 12px 0 0; }
header label { white-space: nowrap; }
button { font: 13px system-ui, sans-serif; border: 1px solid #c9bfae; background: #fff; border-radius: 6px; padding: 2px 8px; cursor: pointer; }
main, .front { max-width: 980px; margin: 0 auto; padding: 0 16px; }
.cite { font: 13px system-ui, sans-serif; color: var(--muted); }
.block h2 { font: 600 14px system-ui, sans-serif; margin: 22px 0 4px; color: var(--muted); }
.txt { font-size: 20px; line-height: 2; margin: 0 0 8px; }
.u { border-bottom: 1px dotted #b9a98c; cursor: pointer; border-radius: 3px; }
.u.decided { border-bottom-color: #2b8a3e; }
.u.unsure { text-decoration: underline wavy #8a5a00; text-underline-offset: 6px; }
.u.swapped { background: #d8ecf5; }
.u.heat1 { background: #fdf0d3; } .u.heat2 { background: #fbe0b0; } .u.heat3 { background: #f6c7a8; } .u.heat4 { background: #f0a98c; }
.om { color: var(--muted); font-size: 13px; }
.hl, .u.hl { background: #ffe7a8 !important; }
ol.app { list-style: none; margin: 0 0 12px; padding: 0; font-size: 15px; }
ol.app li { padding: 2px 4px; border-radius: 4px; }
ol.app li.orth { color: var(--muted); } ol.app li.single { font-style: italic; }
ol.app li.testis, .testis { color: #5b4a8a; }
blockquote.mula { margin: 4px 0 8px; padding: 4px 12px; border-left: 3px solid var(--line); font-size: 17px; color: #4a3f30; }
.indices ul { columns: 3 220px; list-style: none; padding: 0; font-size: 15px; } .indices li { break-inside: avoid; }
.ref { font: 12px system-ui, sans-serif; color: var(--muted); margin-right: 4px; }
.why { font: 12px system-ui, sans-serif; color: #1e6b22; margin-left: 8px; }
.swaps { display: none; margin-left: 8px; } li:hover .swaps, li.hl .swaps { display: inline; }
.swap { font: 13px 'Tiro Devanagari Sanskrit', serif; margin: 0 2px; }
table { border-collapse: collapse; font: 13px system-ui, sans-serif; margin: 6px 0 12px; }
td, th { border-bottom: 1px solid var(--line); padding: 3px 8px; text-align: left; }
.principles p { font: 14px/1.55 system-ui, sans-serif; }
footer { max-width: 980px; margin: 30px auto; padding: 0 16px; }
@media print {
  header { display: none; }
  body { background: #fff; font-size: 11pt; }
  .txt { font-size: 13pt; line-height: 1.7; }
  .u { border: 0; }
  .swaps { display: none !important; }
  .block { break-inside: avoid-page; }
  ol.app { font-size: 9.5pt; column-count: 2; column-gap: 18px; }
}
`;

  Publish.reader = async function (ed, list, built, layered) {
    const font = await Publish.font();
    const data = Publish.readerData(ed, list, built, layered);
    const esc = (s) => U.escXml(String(s));
    const options = ['<option value="edited">the edited text</option>', ...data.sigla.map((s) => '<option value="' + U.escAttr(s) + '">the text of ' + esc(s) + '</option>')].join('');
    const consp = '<table><tr><th>Siglum</th><th>Manuscript</th><th>Date</th><th>Script</th><th>Folio sides</th></tr>' + data.conspectus.map((r) => '<tr><td>' + esc(r.siglum) + (r.group ? ' (' + esc(r.group) + ')' : '') + '</td><td>' + esc([r.place, r.shelfmark || r.title].filter(Boolean).join(', ') || '—') + '</td><td>' + esc(r.date || '—') + '</td><td>' + esc(r.script || '—') + '</td><td>' + r.folios + '</td></tr>').join('') + '</table>';
    const stars = data.blocks.flatMap((b) => b.stars);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="sa">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + esc(data.title) + '</title>\n<meta name="generator" content="Manuscribe">\n<meta name="citation" content="' + U.escAttr(data.citation) + '">\n'
      + (font ? '<!-- The font embedded below is Tiro Devanagari Sanskrit.\n' + font.licence.replace(/--+/g, '-') + '\n-->\n<style>@font-face { font-family: \'Tiro Devanagari Sanskrit\'; src: url(\'data:font/ttf;base64,' + font.base64 + '\') format(\'truetype\'); }</style>\n' : '')
      + '<style>' + READER_CSS + '</style>\n</head>\n<body>\n'
      + '<header><h1>' + esc(data.title) + '</h1>'
      + '<label>Read <select id="view">' + options + '</select></label>'
      + '<label><input type="checkbox" id="t-orth"> spelling variants</label>'
      + '<label><input type="checkbox" id="t-singular" checked> singular readings</label>'
      + '<label><input type="checkbox" id="t-ac" checked> before correction</label>'
      + '<label><input type="checkbox" id="t-heat"> where the witnesses differ most</label>'
      + '<button id="reset" title="Put the edited text back where you have swapped in a reading">Edited text again</button>'
      + '<button id="print" title="Print, or save as PDF: a draft, not a typeset edition">Print a draft</button></header>\n'
      + '<div class="front"><p class="cite">' + esc(data.citation) + '</p>'
      + '<details><summary>Conspectus siglorum and editorial principles</summary>' + consp + '<div class="principles">' + data.principles.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div></details>'
      + '<p class="cite">Point at a word to see its entry, and at an entry to see its words. Click a reading in an entry to read it in the text.</p></div>\n'
      + '<main id="text"></main>\n'
      + (stars.length ? '<div class="front"><h2>Additional passages</h2>' + stars.map((x) => '<p><b>' + esc(x.id) + '</b> (' + esc(x.wits.join(' ')) + '): ' + esc(x.text) + '</p>').join('') + '</div>\n' : '')
      + (data.indices && data.indices.words.length ? '<div class="front indices"><details><summary>Indices</summary>'
        + (data.indices.padas.length ? '<h2>Pādas</h2><ul>' + data.indices.padas.map(([p, r]) => '<li>' + esc(p) + ' <span class="ref">' + esc(r) + '</span></li>').join('') + '</ul>' : '')
        + '<h2>Words</h2><ul>' + data.indices.words.map(([w, r]) => '<li>' + esc(w) + ' <span class="ref">' + esc(r.join(', ')) + '</span></li>').join('') + '</ul></details></div>\n' : '')
      + '<footer class="cite">' + esc(data.citation) + '</footer>\n'
      + '<script type="application/json" id="edition-data">' + json + '</script>\n'
      + '<script>(' + reader.toString().replace(/<\/script/gi, '<\\/script') + ')();</' + 'script>\n</body>\n</html>\n';
  };

  ME.Publish = Publish;
})(window.ME);
