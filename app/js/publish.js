'use strict';
/* Publishing an edition: for print, a reledmac file for XeLaTeX with its font; for reading, one HTML file that
   needs nothing else and works offline. Both carry the conspectus of witnesses, the editorial principles,
   and the citation and version of the edition. */
(function (ME) {
  const { U, Norm, Collate, Apparatus: A, Model } = ME;
  const Publish = {};

  const longDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // How the edition asks to be cited, with the version. The version is the editor's, or a dated draft.
  /* The edition's version, in words: "version 1.0, issued 8 November 2026", "draft of 8 November 2026"… -> string */
  Publish.versionOf = function (ed, when) {
    const d = when || new Date();
    // an issued version names its date; anything changed after it is a draft again
    const issued = ed.issued && ed.issued.version === ed.version && !ed.issued.changed;
    return issued ? 'version ' + ed.version + ', issued ' + longDate(new Date(ed.issued.date + 'T12:00:00'))
      : ed.issued ? 'draft after version ' + ed.issued.version + ', of ' + longDate(d)
        : ed.version ? 'version ' + ed.version + ' (not yet issued), draft of ' + longDate(d) : 'draft of ' + longDate(d);
  };
  /* The line at the foot of every printed page: the edition's version and Manuscribe's. -> string */
  Publish.versions = (ed, when) => {
    const v = Publish.versionOf(ed, when);
    return v.charAt(0).toUpperCase() + v.slice(1) + ' · Manuscribe ' + ME.VERSION;
  };
  Publish.citation = function (ed, when) {
    const d = when || new Date();
    const issued = ed.issued && ed.issued.version === ed.version && !ed.issued.changed;
    const version = Publish.versionOf(ed, d);
    return (ed.title || 'Untitled edition') + (ed.editor ? ', edited by ' + ed.editor : '') + '. ' + ed.witnesses.length + ' witnesses; ' + version + '.' + (ed.doi && issued ? ' ' + (/^10\./.test(ed.doi) ? 'https://doi.org/' + ed.doi : ed.doi) + '.' : '') + ' Made with Manuscribe ' + ME.VERSION + ' (https://github.com/drdhaval2785/manuscribe).';
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
  /* opts.bare: for a book, only the text and its apparatus: no front matter, no versions at the foot of the pages */
  Publish.tex = function (ed, list, built, opts) {
    const bare = !!(opts && opts.bare);
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
    const doc = '% ' + Publish.citation(ed) + '\n'
      + '% Compile with XeLaTeX, three times so that the line references settle: xelatex edition.tex\n'
      + '\\documentclass[11pt,a4paper]{article}\n'
      + '\\usepackage{fontspec}\n'
      + '\\XeTeXinputnormalization=1\n'
      + fontPreamble(opts && opts.fonts)
      // long words (Tamil, Malayalam, Greek…) and lemmas that may not be broken: a little more room than TeX gives by
      // itself, rather than a line off the page
      + '\\emergencystretch=3em\\tolerance=1000\n'
      + '\\usepackage[normalem]{ulem}\n'
      // the edition's version and Manuscribe's at the foot of every page, under the page number
      + (bare ? '' : '\\makeatletter\\def\\@oddfoot{\\hfil\\thepage\\hfil\\llap{\\raisebox{-2.2ex}[0pt][0pt]{\\makebox[\\textwidth][c]{\\scriptsize ' + tex(Publish.versions(ed)) + '}}}}\\let\\@evenfoot\\@oddfoot\\makeatother\n')
      + '\\usepackage{reledmac}\n'
      + '\\Xarrangement[A]{paragraph}\\Xarrangement[B]{paragraph}\\Xarrangement[C]{paragraph}\\Xarrangement[D]{paragraph}\\Xarrangement[E]{paragraph}\n'
      + '\\Xnumberonlyfirstinline[A]\\Xnumberonlyfirstinline[B]\\Xnumberonlyfirstinline[C]\\Xnumberonlyfirstinline[D]\n'
      + '\\Xsymlinenum[A]{$|$}\n'
      + '\\firstlinenum{5}\\linenumincrement{5}\n'
      + '\\Xbhooknote[B]{\\textit{Testimonia:} }\\Xbhooknote[C]{\\textit{Singular readings:} }\\Xbhooknote[D]{\\textit{Spelling:} }\\Xbhooknote[E]{\\textit{Decisions:} }\n'
      + '\\begin{document}\n'
      + (bare ? '' : '\\begin{center}{\\Large ' + tex(ed.title || 'Edition') + '}\\\\[4pt]\\small ' + tex(Publish.citation(ed)) + '\\end{center}\n\n'
      + '\\section*{Conspectus siglorum}\n\\begin{tabular}{lllll}\n\\textbf{Siglum} & \\textbf{Manuscript} & \\textbf{Date} & \\textbf{Script} & \\textbf{Folio sides}\\\\\n'
      + rows.map((r) => tex(r.siglum) + (r.group ? ' (' + tex(r.group) + ')' : '') + ' & ' + tex([r.place, r.shelfmark || r.title].filter(Boolean).join(', ') || '—') + ' & ' + tex(r.date || '—') + ' & ' + tex(r.script || '—') + ' & ' + r.folios + '\\\\').join('\n')
      + '\n\\end{tabular}\n\n'
      + '\\section*{Editorial principles}\n' + Publish.declaration(ed, built).map(tex).join('\n\n') + '\n\n'
      + '\\section*{Text}\n')
      + '\\beginnumbering\n' + blocks.join('\n\n') + '\n\\endnumbering\n'
      + (stars.length ? '\n\\section*{Additional passages}\n' + stars.map((x) => '\\noindent\\textbf{' + tex(x.id) + '} (' + tex(x.wits.join(' ')) + '): ' + tex(x.text) + '\\par').join('\n') + '\n' : '')
      + '\\end{document}\n';
    return withRuns(doc, opts && opts.fonts);
  };

  /* ---------- the fonts of the LaTeX: by script, as on the print page ---------- */
  const RTL = new Set(['Arab', 'Hebr', 'Syrc', 'Thaa', 'Nkoo', 'Samr', 'Mand', 'Adlm', 'Rohg', 'Yezi', 'Mend', 'Phnx', 'Armi', 'Palm', 'Nbat', 'Hatr', 'Sarb', 'Narb', 'Avst', 'Prti', 'Phli', 'Phlp', 'Mani', 'Sogd', 'Sogo', 'Ougr', 'Elym', 'Chrs', 'Lydi', 'Mero', 'Merc', 'Khar', 'Cprt', 'Hung', 'Orkh']);
  // the default, before there were plans: Tiro, for Devanagari and Latin
  const TIRO_LINE = '\\setmainfont{TiroDevanagariSanskrit-Regular.ttf}[Path=fonts/, Script=Devanagari, AutoFakeSlant=0.15, AutoFakeBold=1.5]\n';
  function fontPreamble(plan) {
    if (!plan) return TIRO_LINE;
    let s = plan.main ? (plan.main.family === 'Tiro' ? TIRO_LINE : '\\setmainfont{' + plan.main.file + '}[Path=fonts/]\n') : '';
    for (const o of plan.others) s += '\\newfontfamily\\' + o.cmd + '{' + o.file + '}[Path=fonts/]\n';
    // a script written without spaces breaks between its letters
    // (and lines without spaces may stretch a little more than TeX allows by itself)
    if (plan.breakLocale) s += '\\XeTeXlinebreaklocale "' + plan.breakLocale + '"\\XeTeXlinebreakskip=0pt plus 1pt\n';
    return s;
  }
  /* Each run of another script in its font, and, where the edition is right to left or quotes a right-to-left
     script, the direction of each run (bidi: \\setRTL for the edition, \\LR and \\RL for the runs). A run is the
     script's words and what joins them (spaces, punctuation, digits), never a brace or a command. */
  function withRuns(doc, plan) {
    if (!plan || (!plan.others.length && !plan.rtl && !plan.breakLocale)) return doc;
    const at = doc.indexOf('\\begin{document}');
    let head = doc.slice(0, at), body = doc.slice(at);
    const set = (chars) => chars.replace(/[\\\]\[^-]/g, '\\$&');
    // words of the class, joined by spaces and the punctuation the run's font has
    const run = (cls, join) => { const J = '[' + set(join || ' ') + ']+'; return new RegExp('(?:' + cls + ')(?:[\\p{M}\\u200c\\u200d]|' + cls + ')*(?:' + J + '(?:' + cls + ')(?:[\\p{M}\\u200c\\u200d]|' + cls + ')*)*', 'gu'); };
    // only the text between LaTeX's own words: commands, \\begin{…}{…}, \\\\[4pt], escaped characters
    const PROTECT = /\\(?:begin|end)\{[^}]*\}(?:\{[lcrp|]*\})?|\\\\\[[^\]]*\]|\\[A-Za-z@]+\*?|\\./g;
    const onText = (str, re, fn) => { let out = '', at = 0; for (const m of str.matchAll(PROTECT)) { out += str.slice(at, m.index).replace(re, fn) + m[0]; at = m.index + m[0].length; } return out + str.slice(at).replace(re, fn); };
    for (const o of plan.others) {
      const dir = plan.rtl ? (o.rtl ? '' : '\\LR') : (o.rtl ? '\\RL' : '');
      const cls = '\\p{Script=' + o.script + '}' + (o.extra ? '|[' + set(o.extra) + ']' : '');
      body = onText(body, run(cls, o.join), (m) => (dir ? dir + '{' : '{') + '\\' + o.cmd + ' ' + m + '}');
    }
    // Tibetan: a line may end after any tsheg or shad, also where a note's lemma begins just after it
    // Thai, Lao, Khmer, Burmese: no spaces between words, and breaking them takes a dictionary that a TeX may not have;
    // the browser's own (Intl.Segmenter, as collation divides them) marks where a line may end
    const DICT = /[\p{Script=Thai}\p{Script=Laoo}\p{Script=Khmr}\p{Script=Mymr}][\p{Script=Thai}\p{Script=Laoo}\p{Script=Khmr}\p{Script=Mymr}\p{M}]*/gu;
    if (DICT.test(body) && typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(plan.breakLocale || undefined, { granularity: 'word' });
      body = onText(body, DICT, (m) => [...seg.segment(m)].map((x) => x.segment).join('\\hskip0pt plus 1pt\\relax{}'));
    }
    // (a little space that stretches, so that lines without spaces can be justified)
    if (/\p{Script=Tibetan}/u.test(body)) body = onText(body, /([\u0F0B\u0F0D-\u0F12])/g, '$1\\hskip0pt plus 1pt\\relax{}');
    if (plan.rtl) {
      // the edition right to left: Latin runs (sigla, om., the principles) left to right in it
      if (!plan.others.some((o) => o.script === 'Latn')) body = onText(body, run('\\p{Script=Latn}|[0-9]', ' .,;:!?()\'-0123456789'), (m) => '\\LR{' + m + '}');
      body = body.replace('\\begin{document}\n', '\\begin{document}\n\\setRTL\n');
    }
    // bidi, last of the packages, wherever anything is right to left
    if (plan.rtl || plan.others.some((o) => o.rtl)) head += '\\usepackage{bidi}\n';
    return head + body;
  }

  /* The fonts the LaTeX of an edition needs: Tiro where it has Devanagari, else Noto Serif (Latin, Greek,
     Cyrillic), as the main font; for every other script, its Noto font (fetched once, kept), cut down to the glyphs
     used where it is large. -> {main, others: [{cmd, family, file, script, rtl, bytes}], rtl, breakLocale, files} */
  Publish.texFonts = async function (ed, list, built) {
    const FL = ME.FontLib;
    const langs = list.map((x) => x.p && x.p.meta && x.p.meta.textLang).filter(Boolean);
    const words = ' Conspectus siglorum Siglum Manuscript Date Script Folio sides Editorial principles Text Additional passages Testimonia Singular readings Spelling Decisions 0123456789 ';
    const text = ME.PrintHTML.textOf(ed, built) + words + Publish.conspectus(ed, list).map((r) => [r.siglum, r.place, r.shelfmark, r.title, r.date, r.script].join(' ')).join(' ');
    let main = null;
    if (FL.needsTiro(text)) { const t = await Publish.font(); if (t) main = { family: 'Tiro', file: 'TiroDevanagariSanskrit-Regular.ttf', bytes: t.bytes, licence: t.licence }; }
    if (!main) { const b = await FL.get('NotoSerif'); if (b) main = { family: 'NotoSerif', file: 'NotoSerif-Regular.ttf', bytes: b }; }
    await ME.Shaper.load();
    const sh = main ? ME.Shaper.font(main.bytes) : null;
    const lacking = [...new Set(Array.from(text))].filter((ch) => /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u.test(ch) && !/[\u200B-\u200D\uFEFF]/.test(ch) && !(sh && sh.nominal(ch.codePointAt(0)))).join('');
    const others = [];
    for (const f of FL.familiesFor(lacking, langs)) {
      if (main && f.family === main.family) continue;
      let bytes = await FL.get(f.family);
      if (!bytes) continue;
      const s2 = ME.Shaper.font(bytes);
      // the letters the main font lacks and this one has go in its runs too: kana with Han, the Arabic comma…
      const extra = [...lacking].filter((ch) => s2.nominal(ch.codePointAt(0)) && !others.some((o) => o.extra.includes(ch))).join('');
      // a large font (Chinese, Japanese, Korean) only with the glyphs the edition uses
      if (bytes.length > 3e6) bytes = FL.subset(bytes, FL.glyphsOf(s2, text), 'web');
      // what may join two words of a run: the spaces and punctuation this font has (a Hebrew font has no Latin comma)
      const join = [...' \u00a0.,;:!?\u060C\u061B\u061F\u05BE()\u00AB\u00BB\u2013\u2014\'-0123456789\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'].filter((ch) => s2.nominal(ch.codePointAt(0))).join('');
      others.push({ cmd: 'mfont' + String.fromCharCode(65 + others.length), family: f.family, file: f.family + '.ttf', script: f.script, rtl: RTL.has(f.script), extra, join, bytes });
    }
    // the edition's own direction: right to left if most of its letters are
    const rtlLetters = (text.match(/[\p{Script=Arab}\p{Script=Hebr}\p{Script=Syrc}\p{Script=Thaa}\p{Script=Nkoo}]/gu) || []).length;
    const letters = (text.match(/\p{L}/gu) || []).length;
    // a script written without spaces breaks between its letters; Tibetan after its tsheg (Unicode's line breaking)
    const unspaced = ME.Norm.UNSPACED.test(text) || /\p{Script=Tibetan}/u.test(text);
    const lang = (langs[0] || '').split('-')[0];
    return {
      main, others, rtl: rtlLetters > letters / 2,
      breakLocale: unspaced ? ({ ja: 'ja', zh: 'zh', th: 'th', lo: 'lo', km: 'km', my: 'my', bo: 'bo', dz: 'dz' }[lang] || 'zh') : '',
      files: [main].concat(others).filter(Boolean),
    };
  };

  // The .tex, the font it names and what to do with them, ready to zip.
  Publish.texFiles = async function (ed, list, built, opts) {
    const plan = await Publish.texFonts(ed, list, built);
    const files = [{ name: 'edition.tex', data: Publish.tex(ed, list, built, Object.assign({}, opts, { fonts: plan })) }];
    for (const f of plan.files) files.push({ name: 'fonts/' + f.file, data: f.bytes });
    // the fonts' licence: Tiro's own text, or the SIL Open Font License of the Noto fonts
    if (plan.files.length) files.push({ name: 'fonts/OFL.txt', data: (plan.main && plan.main.licence) || ('The fonts in this folder (' + plan.files.map((f) => f.family).join(', ') + ') are licensed under the SIL Open Font License, Version 1.1: https://openfontlicense.org\n') });
    files.push({ name: 'README.txt', data: Publish.citation(ed) + '\n\nTo make the PDF: run "xelatex edition.tex" three times, in this folder, with a TeX distribution that has reledmac (TeX Live or MacTeX); or run "tectonic edition.tex" (Tectonic fetches what it needs); or upload the folder to Overleaf and set its compiler to XeLaTeX.\nThe fonts in fonts/ (' + plan.files.map((f) => f.file).join(', ') + ') are under the SIL Open Font License (fonts/OFL.txt).\n' });
    return files;
  };

  // Manuscribe's font, Tiro Devanagari Sanskrit, as a file: fetched once and kept in this browser (FontLib)
  Publish.font = () => ME.FontLib.tiro();

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
          layer: b.layer && b.layer.depth ? { depth: b.layer.depth, abbr: b.layer.abbr, name: b.layer.name } : null,
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
    // one entry of the apparatus, as a list item: what is printed, the reason, testimonia, and each reading to swap in
    const entryItem = (bi, i) => {
      const e = D.blocks[bi].entries[i];
      let p = esc(e.printed).replace(/&lt;sup&gt;/g, '<sup>').replace(/&lt;\/sup&gt;/g, '</sup>');
      if (!state.ac) p = p.replace(/;?\s*[^;]*<sup>[^<]*<\/sup>/g, '');
      const swaps = [e.lemma, ...e.readings.map((r) => r.text), ...e.orth.map((o) => o.text)].map((r, ri) => '<button class="swap" data-k="' + bi + ':' + i + '" data-r="' + ri + '" title="Read this in the text">' + (r ? esc(r) : '(omits)') + '</button>').join(' ');
      const why = e.decision && (e.decision.reasons.length || e.decision.note) ? '<span class="why">' + esc([e.decision.source, ...e.decision.reasons, e.decision.note].filter(Boolean).join('; ')) + '</span>' : '';
      // each note in the direction of its own text: an Arabic lemma with Latin sigla reads right
      if (e.kind === 'testimonium') return '<li dir="auto" data-k="' + bi + ':' + i + '" class="testis">' + p + '</li>';
      const testis = e.testimonia && e.testimonia.length ? '<span class="testis"> Testimonia: ' + esc(e.testimonia.join('; ')) + '</span>' : '';
      return '<li dir="auto" data-k="' + bi + ':' + i + '" class="' + (e.kind === 'orthographic' ? 'orth' : e.singular ? 'single' : '') + '">' + p + why + testis + '<span class="swaps">' + swaps + '</span></li>';
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
          text += esc(lead) + '<span class="' + cls + '" data-k="' + key + '">' + (shown ? esc(shown) : '<span class="om">‸</span>') + '</span>' + esc(tail);
        });
        const items = b.entries.map((e, i) => {
          if ((e.kind === 'orthographic' && !state.orth) || (e.singular && !state.singular)) return '';
          return entryItem(bi, i);
        }).join('');
        const mula = b.base && b.base.length ? '<blockquote class="mula" title="' + esc(D.base.title + ' ' + b.base.map((x) => x[0]).join(', ')) + '"><span class="ref">' + esc(D.base.title + ' ' + b.base.map((x) => x[0]).join(', ')) + '</span> ' + esc(b.base.map((x) => x[1]).join(' ')) + '</blockquote>' : '';
        // a commentary of a layered edition: set in by its depth, with its [abbreviation] first
        const L = b.layer;
        const lay = L ? ' style="margin-inline-start:' + (L.depth * 1.6) + 'em;font-size:' + Math.max(0.78, 1 - L.depth * 0.07).toFixed(2) + 'em"' : '';
        const abbr = L ? '<b class="labl" title="' + esc(L.name) + '">[' + esc(L.abbr) + ']</b> ' : '';
        // no internal reference is shown: the block's id is only its anchor
        html += '<section class="block' + (L ? ' layer' : '') + '" id="b-' + esc(b.id) + '"' + lay + '>' + mula + '<p class="txt">' + abbr + text.trim() + '</p><ol class="app">' + items + '</ol></section>';
      });
      main.innerHTML = html;
      if (state.open) showPanel(state.open);
    };
    /* The apparatus is not in the way of reading: pointing at a word shows its entry beside it, and clicking keeps
       it, with the other entries of its passage, in the panel at the side. */
    const pop = $('#pop'), panel = $('#panel'), panelBody = $('#panel-body');
    const showPop = (u) => {
      const [bi, i] = u.getAttribute('data-k').split(':').map(Number);
      pop.innerHTML = '<ol class="app">' + entryItem(bi, i) + '</ol>';
      pop.hidden = false;
      const r = u.getBoundingClientRect(), w = Math.min(440, window.innerWidth - 16);
      pop.style.maxWidth = w + 'px';
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
      const below = r.bottom + 8, h = pop.offsetHeight;
      pop.style.top = (below + h < window.innerHeight ? below : Math.max(8, r.top - h - 8)) + 'px';
    };
    const showPanel = (key) => {
      const [bi, i] = key.split(':').map(Number);
      const b = D.blocks[bi];
      if (!b || !b.entries[i]) return;
      state.open = key;
      const others = b.entries.map((e, j) => (j === i || (e.kind === 'orthographic' && !state.orth) || (e.singular && !state.singular) ? '' : entryItem(bi, j))).join('');
      panelBody.innerHTML = '<ol class="app here">' + entryItem(bi, i) + '</ol>' + (others ? '<p class="ref">The other notes of this passage</p><ol class="app">' + others + '</ol>' : '');
      document.body.classList.add('panel-open');
      document.querySelectorAll('.u.open').forEach((x) => x.classList.remove('open'));
      document.querySelectorAll('.u[data-k="' + key + '"]').forEach((x) => x.classList.add('open'));
    };
    const closePanel = () => { state.open = null; document.body.classList.remove('panel-open'); document.querySelectorAll('.u.open').forEach((x) => x.classList.remove('open')); };
    $('#panel-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { pop.hidden = true; closePanel(); } });
    document.addEventListener('mouseover', (ev) => { const u = ev.target.closest('#text .u'); if (u) showPop(u); else pop.hidden = true; });
    window.addEventListener('scroll', () => { pop.hidden = true; }, { passive: true });
    const head = document.querySelector('header');
    const placePanel = () => document.documentElement.style.setProperty('--head', head.offsetHeight + 'px');
    window.addEventListener('resize', placePanel);
    placePanel();
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
      const u = ev.target.closest('#text .u');
      if (u) { pop.hidden = true; showPanel(u.getAttribute('data-k')); }
    });
    // the apparatus under the text too, and the places marked, for those who want them
    $('#t-app').addEventListener('change', (ev) => document.body.classList.toggle('show-app', ev.target.checked));
    $('#t-mark').addEventListener('change', (ev) => document.body.classList.toggle('mark', ev.target.checked));
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
.u { cursor: pointer; border-radius: 3px; }
.u:hover, .u.open { background: #fdf0d3; }
/* the words with variant readings are underlined, dotted, so that a reader knows where to point */
body.mark .u { text-decoration: underline dotted #a8916b; text-decoration-thickness: 1.5px; text-underline-offset: 6px; }
body.mark .u.decided { text-decoration-color: #2b8a3e; }
/* the apparatus: hidden under the text unless asked for; a word's entry beside it; the passage's in the panel */
#text ol.app { display: none; }
body.show-app #text ol.app { display: block; }
#pop { position: fixed; z-index: 5; background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(60, 40, 10, .18); padding: 6px 10px; pointer-events: none; }
#pop ol.app { margin: 0; } #pop .swaps { display: none !important; }
#panel { display: none; position: fixed; top: var(--head, 48px); right: 0; bottom: 0; width: 380px; overflow: auto; background: #fbf6ec; border-left: 1px solid var(--line); padding: 10px 14px; z-index: 3; }
#panel h2 { font: 600 14px system-ui, sans-serif; margin: 0; flex: 1; }
.panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
body.panel-open #panel { display: block; }
body.panel-open main, body.panel-open .front, body.panel-open footer { margin-right: 400px; }
#panel ol.app.here li { background: #fdf0d3; }
#panel .swaps { display: inline; }
@media (max-width: 860px) {
  #panel { top: auto; left: 0; width: auto; height: 42vh; border-left: 0; border-top: 1px solid var(--line); }
  body.panel-open main, body.panel-open .front { margin-right: auto; margin-bottom: 44vh; }
}
.u.unsure { text-decoration: underline wavy #8a5a00; text-underline-offset: 6px; }
.u.swapped { background: #d8ecf5; }
.u.heat1 { background: #fdf0d3; } .u.heat2 { background: #fbe0b0; } .u.heat3 { background: #f6c7a8; } .u.heat4 { background: #f0a98c; }
.om { color: var(--muted); font-size: 13px; }
.hl, .u.hl { background: #ffe7a8 !important; }
ol.app { list-style: none; margin: 0 0 12px; padding: 0; font-size: 15px; }
ol.app li { padding: 2px 4px; border-radius: 4px; }
ol.app li.orth { color: var(--muted); } ol.app li.single { font-style: italic; }
ol.app li.testis, .testis { color: #5b4a8a; }
.labl { color: #8c2a17; }
.block.layer { border-inline-start: 2px solid var(--line); padding-inline-start: 10px; }
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
  header, #panel, #pop { display: none !important; }
  body.panel-open main, body.panel-open .front { margin-right: auto; }
  body { background: #fff; font-size: 11pt; }
  .txt { font-size: 13pt; line-height: 1.7; }
  .u { border: 0; text-decoration: none !important; }
  .swaps { display: none !important; }
  .block { break-inside: avoid-page; }
  ol.app { font-size: 9.5pt; column-count: 2; column-gap: 18px; }
}
`;

  Publish.reader = async function (ed, list, built, layered) {
    const data = Publish.readerData(ed, list, built, layered);
    // Tiro, only where the edition has Devanagari
    const font = ME.FontLib.needsTiro(JSON.stringify(data)) ? await Publish.font() : null;
    const esc = (s) => U.escXml(String(s));
    const options = ['<option value="edited">the edited text</option>', ...data.sigla.map((s) => '<option value="' + U.escAttr(s) + '">the text of ' + esc(s) + '</option>')].join('');
    const consp = '<table><tr><th>Siglum</th><th>Manuscript</th><th>Date</th><th>Script</th><th>Folio sides</th></tr>' + data.conspectus.map((r) => '<tr><td>' + esc(r.siglum) + (r.group ? ' (' + esc(r.group) + ')' : '') + '</td><td>' + esc([r.place, r.shelfmark || r.title].filter(Boolean).join(', ') || '—') + '</td><td>' + esc(r.date || '—') + '</td><td>' + esc(r.script || '—') + '</td><td>' + r.folios + '</td></tr>').join('') + '</table>';
    const stars = data.blocks.flatMap((b) => b.stars);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="sa">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + esc(data.title) + '</title>\n<meta name="generator" content="Manuscribe ' + esc(ME.VERSION) + '">\n<meta name="citation" content="' + U.escAttr(data.citation) + '">\n'
      + (font ? '<!-- The font embedded below is Tiro Devanagari Sanskrit.\n' + font.licence.replace(/--+/g, '-') + '\n-->\n<style>@font-face { font-family: \'Tiro Devanagari Sanskrit\'; src: url(\'data:font/ttf;base64,' + font.base64 + '\') format(\'truetype\'); }</style>\n' : '')
      + '<style>' + READER_CSS + '</style>\n</head>\n<body class="mark">\n'
      + '<header><h1>' + esc(data.title) + '</h1>'
      + '<label>Read <select id="view">' + options + '</select></label>'
      + '<label title="Every note under the text, as in a printed edition"><input type="checkbox" id="t-app"> apparatus under the text</label>'
      + '<label title="Underline the words where the witnesses differ"><input type="checkbox" id="t-mark" checked> mark the variants</label>'
      + '<label><input type="checkbox" id="t-orth"> spelling variants</label>'
      + '<label><input type="checkbox" id="t-singular" checked> singular readings</label>'
      + '<label><input type="checkbox" id="t-ac" checked> before correction</label>'
      + '<label><input type="checkbox" id="t-heat"> where the witnesses differ most</label>'
      + '<button id="reset" title="Put the edited text back where you have swapped in a reading">Edited text again</button>'
      + '<button id="print" title="Print, or save as PDF: a draft, not a typeset edition">Print a draft</button></header>\n'
      + '<div class="front"><p class="cite">' + esc(data.citation) + '</p>'
      + '<details><summary>Conspectus siglorum and editorial principles</summary>' + consp + '<div class="principles">' + data.principles.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div></details>'
      + '<p class="cite">The edited text, to read. Point at an underlined word to see what the witnesses read there; click it to keep its notes open at the side, where a click on a reading puts it into the text.</p></div>\n'
      + '<main id="text"></main>\n'
      + '<div id="pop" hidden></div>\n'
      + '<aside id="panel" aria-label="Apparatus"><div class="panel-head"><h2>Apparatus</h2><button id="panel-close" title="Close">×</button></div><div id="panel-body"></div></aside>\n'
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
