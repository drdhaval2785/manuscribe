'use strict';
/* One Export, for everything Manuscribe can write: chosen by what it is for (print, read, exchange, archive), then
   by format, and for an edition by how much (this block, a work). Each format is a recipe that makes a file, or opens
   the screen that makes it, so that the dialog and the tests make exactly the same thing. */
(function (ME) {
  const { U, UI } = ME;
  const X = {};
  const KEY = 'manuscribe.export';
  const fileSafe = (s) => String(s).replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_');
  const F = () => ME.Features;

  X.GROUPS = { print: 'Print', read: 'Read on screen', exchange: 'Exchange with other programs', archive: 'Keep and archive' };
  /* What the dialog asks first: the kind of file. Each format is of one kind; the options of a kind are shown only
     when it is chosen. */
  X.KINDS = { pdf: 'PDF', html: 'HTML', latex: 'LaTeX', tei: 'TEI', text: 'Text', archive: 'Archive' };
  const KIND_OF = { 'pdf-any': 'pdf', 'pdf-direct': 'pdf', reader: 'html', 'print-page': 'html', latex: 'latex', tei: 'tei', saktumiva: 'tei', 'tei-corpus': 'tei', 'tei-xml': 'tei', package: 'archive', release: 'archive', backup: 'archive' };
  X.kindOf = (f) => KIND_OF[f.id] || 'text';
  const KIND_HELP = { pdf: 'Pages to print or to send.', html: 'A page to read on screen, or to print later; it opens with no network.', latex: 'For XeLaTeX and reledmac.', tei: 'XML for other editions and programs.', text: 'Plain text, and data for other programs.', archive: 'Everything, to keep, to move or to publish in an archive.' };

  /* ---------- what an edition export works on ---------- */

  // The built tables for a scope: one block, or a work. -> {built, work, recs}
  async function scoped(ctx) {
    const { ed } = ctx;
    if (ctx.scope === 'block' && ctx.tables && ctx.tables.length === 1) {
      const t = ME.CollateEdit.ensure(ctx.tables[0]);
      return { built: [Object.assign({ table: t }, ME.Apparatus.entries(ed, t))], work: ed.works.find((k) => k.id === t.work), tables: [t] };
    }
    const workId = ctx.workId || (ctx.tables && ctx.tables[0] && ctx.tables[0].work);
    const works = await ME.Release.works(ed, ctx.list || []);
    // every layer of a layered edition, as one text in reading order
    if (ME.CollateView && workId === ME.CollateView.ALL) {
      const layers = works.filter((x) => ME.LayerIds.codeOf(x.work.id));
      if (!layers.length) throw new Error('Collate first: there is nothing to export yet');
      const base = layers.find((x) => x.work.id === ME.LayerIds.workId(ME.LayerIds.BASE)) || layers[0];
      return { built: ME.LayerIds.weave(ed, layers), work: { id: ME.CollateView.ALL, title: ed.title || 'All layers', base: base.work }, tables: layers.flatMap((x) => x.recs.map((r) => r.table)), layered: layers };
    }
    const w = works.find((x) => x.work.id === workId) || works[0];
    if (!w) throw new Error('Collate first: there is nothing to export yet');
    return { built: w.built, work: w.work, tables: w.recs.map((r) => r.table) };
  }
  const base = (ctx) => fileSafe(ctx.ed.title || 'edition');
  const file = (name, data, type) => ({ name, data, type: type || 'application/octet-stream' });

  /* Each format: {id, group, label, desc, on: (ctx) -> shown?, scopes: which, make(ctx) -> file | null (it opened a screen)} */
  X.FORMATS = [
    // an edition
    { id: 'pdf-any', for: 'edition', group: 'print', label: 'PDF, in any script', desc: 'The edition laid out as pages by this browser, in any script and font; then choose Save as PDF in the print dialog.',
      opensWindow: true,
      make: async (ctx) => {
        const s = await scoped(ctx);
        try { await ME.PrintHTML.open(ctx.ed, ctx.list, s.built, ctx.win); return null; } catch (e) {
          // the browser would not open a tab: the page is saved instead, to open and print
          U.toast('The browser did not open a new tab, so the print page is saved instead: open it, and print it or save it as PDF.', 'warn', 9000);
          return file(base(ctx) + '.print.html', ME.PrintHTML.html(ctx.ed, ctx.list, s.built, { autoPrint: true, fonts: await ME.PrintHTML.fonts(ctx.ed, s.built) }), 'text/html');
        }
      } },
    { id: 'pdf-direct', for: 'edition', group: 'print', label: 'PDF file, Devanagari and Latin', desc: 'A PDF made directly in Manuscribe’s own font, with nothing to print.', on: () => F().on('pdfDeva'),
      make: async (ctx) => { const s = await scoped(ctx); const r = await ME.Typeset.pdf(ctx.ed, ctx.list, s.built); return file(base(ctx) + '.pdf', r.blob, 'application/pdf'); } },
    { id: 'latex', for: 'edition', group: 'print', label: 'LaTeX for reledmac', desc: 'A folder for XeLaTeX with its font: the finest print, on your computer or on Overleaf.',
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.latex.zip', await ME.Zip.write(await ME.Publish.texFiles(ctx.ed, ctx.list, s.built)), 'application/zip'); } },
    { id: 'reader', for: 'edition', group: 'read', label: 'Reader, one HTML file', desc: 'The edited text and its apparatus, linked, with each witness’s text; opens with no network.',
      make: async (ctx) => { const s = await scoped(ctx); const layered = ME.LayersView ? await ME.LayersView.baseTexts(ctx.ed, s.work.id) : null; return file(base(ctx) + '.reader.html', await ME.Publish.reader(ctx.ed, ctx.list, s.built, layered), 'text/html'); } },
    { id: 'print-page', for: 'edition', group: 'read', label: 'Print page, one HTML file', desc: 'The print edition as a page, to open and print later on any computer.',
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.print.html', ME.PrintHTML.html(ctx.ed, ctx.list, s.built, { fonts: await ME.PrintHTML.fonts(ctx.ed, s.built) }), 'text/html'); } },
    { id: 'tei', for: 'edition', group: 'exchange', label: 'TEI apparatus', desc: 'TEI P5, parallel segmentation: for other editions, teiphy and open-cbgm.',
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.edition.xml', ME.Apparatus.tei(ctx.ed, s.built, s.work), 'application/xml'); } },
    { id: 'text', for: 'edition', group: 'exchange', label: 'Apparatus as text', desc: 'The edited text with its apparatus under it, plain text.',
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.apparatus.txt', ME.Apparatus.text(ctx.ed, s.built), 'text/plain'); } },
    { id: 'indices', for: 'edition', group: 'exchange', label: 'Indices, as text', desc: 'Every word of the edited text, and every pāda where there is verse.', on: () => F().on('indices'),
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.indices.txt', ME.LayersView.indicesText(ctx.ed, s.built), 'text/plain'); } },
    { id: 'dts', for: 'edition', group: 'exchange', label: 'DTS files', desc: 'Static files in the shape of the Distributed Text Services API 1.0.', on: () => F().on('dts'),
      make: async (ctx) => { const s = await scoped(ctx); return file(base(ctx) + '.dts.zip', await ME.Zip.write(ME.DTS.files(ctx.ed, [{ work: s.work, built: s.built }])), 'application/zip'); } },
    { id: 'saktumiva', for: 'edition', group: 'exchange', label: 'TEI for Saktumiva', desc: 'Each witness as TEI, as Saktumiva reads it, in one ZIP.', on: () => F().on('saktumiva'),
      make: async (ctx) => { const s = await scoped(ctx); const files = ME.Edition.saktumivaFiles(ctx.ed, ctx.list, s.work.id); if (!files.length) throw new Error('No text to export yet'); return file(base(ctx) + '-saktumiva.zip', await ME.Zip.write(files), 'application/zip'); } },
    { id: 'nexus', for: 'edition', group: 'exchange', label: 'NEXUS', desc: 'The variants as characters, for PAUP* and SplitsTree.', on: () => F().on('stemmatics'),
      make: async (ctx) => { const s = await scoped(ctx); const m = ME.Stemma.matrix(ctx.ed, s.built, Object.assign({}, ME.Stemma.DEFAULTS, ctx.ed.stemma && ctx.ed.stemma.settings), (ctx.ed.samples && ctx.ed.samples[s.work.id]) || []); return file(base(ctx) + '.nex', ME.Stemma.nexus(m, { citation: ME.Publish.citation(ctx.ed) }).text, 'text/plain'); } },
    { id: 'newick', for: 'edition', group: 'exchange', label: 'Newick: the tree by distance', desc: 'The neighbour-joining tree, drawn from its midpoint.', on: () => F().on('stemmatics'),
      make: async (ctx) => { const s = await scoped(ctx); const S = ME.Stemma; const m = S.matrix(ctx.ed, s.built, Object.assign({}, S.DEFAULTS, ctx.ed.stemma && ctx.ed.stemma.settings), (ctx.ed.samples && ctx.ed.samples[s.work.id]) || []); return file(base(ctx) + '.nj.tre', S.newick(S.midpoint(S.nj(S.distances(m))), m.taxa) + '\n', 'text/plain'); } },
    { id: 'dot', for: 'edition', group: 'exchange', label: 'DOT: your stemma', desc: 'The stemma you wrote on the workbench, for Graphviz, Stemmaweb and open-cbgm.', on: (ctx) => F().on('stemmatics') && !!(ctx.ed.stemma && ctx.ed.stemma.dot),
      make: async (ctx) => file(base(ctx) + '.stemma.dot', ctx.ed.stemma.dot, 'text/plain') },
    { id: 'collatex-in', for: 'edition', group: 'exchange', label: 'CollateX input (tokens)', desc: 'The tokens of this block, for CollateX.', scope: 'block', on: () => F().on('exchange'),
      make: async (ctx) => { const s = await scoped(ctx); return file(fileSafe(s.tables[0].unit) + '.collatex-input.json', JSON.stringify(ME.Collate.toCollateXInput(s.tables[0]), null, 1), 'application/json'); } },
    { id: 'collatex', for: 'edition', group: 'exchange', label: 'CollateX table', desc: 'This block’s alignment, as CollateX writes it.', scope: 'block', on: () => F().on('exchange'),
      make: async (ctx) => { const s = await scoped(ctx); return file(fileSafe(s.tables[0].unit) + '.collatex.json', JSON.stringify(ME.Collate.toCollateXTable(s.tables[0])), 'application/json'); } },
    { id: 'tei-corpus', for: 'edition', group: 'exchange', label: 'TEI corpus', desc: 'This block’s alignment, for Saktumiva’s matrix editor.', scope: 'block', on: () => F().on('exchange'),
      make: async (ctx) => { const s = await scoped(ctx); return file(fileSafe(s.tables[0].unit) + '.xml', ME.Collate.toTeiCorpus(s.tables[0]), 'application/xml'); } },
    { id: 'csv', for: 'edition', group: 'exchange', label: 'CSV', desc: 'This block’s alignment, a column for each place, for a spreadsheet.', scope: 'block', on: () => F().on('exchange'),
      make: async (ctx) => { const s = await scoped(ctx); return file(fileSafe(s.tables[0].unit) + '.csv', ME.Collate.toCsv(s.tables[0], 'n'), 'text/csv'); } },
    { id: 'table-json', for: 'edition', group: 'exchange', label: 'Manuscribe table', desc: 'This block’s table as Manuscribe keeps it, with its corrections and decisions.', scope: 'block', on: () => F().on('exchange'),
      make: async (ctx) => { const s = await scoped(ctx); return file(fileSafe(s.tables[0].unit) + '.manuscribe-table.json', JSON.stringify(s.tables[0], null, 1), 'application/json'); } },
    { id: 'package', for: 'edition', group: 'archive', label: 'Edition package', desc: 'Everything of the edition but the PDFs, as plain files in one ZIP: to keep, to move, to share.', whole: true,
      make: async (ctx) => { await ME.Edition.exportPackage(ctx.ed); return null; } },
    { id: 'release', for: 'edition', group: 'archive', label: 'A release (Issue edition…)', desc: 'Freeze a version, check it, and make every output at once, for an archive such as Zenodo.', whole: true,
      make: async (ctx) => { await ME.ExchangeView.issue(ctx.ed, ctx.list, ctx.redraw); return null; } },
    // a transcription
    { id: 'tei-xml', for: 'project', group: 'exchange', label: 'TEI XML, or an HTML page', desc: 'The transcription as TEI for Saktumiva and other programs, or as a page to read: the whole manuscript or one folio side.',
      make: async (ctx) => { ME.App.flush(); ME.Export.open(ctx.project, ctx.entry); return null; } },
    { id: 'backup', for: 'project', group: 'archive', label: 'Backup file', desc: 'The whole project in one file, to keep or to move to another computer (Ctrl+S).',
      make: async () => { await ME.App.saveToFile(); return null; } },
  ];
  X.format = (id) => X.FORMATS.find((f) => f.id === id);

  // Makes the file of a format, or opens its screen. -> file or null
  X.make = (id, ctx) => X.format(id).make(ctx);

  X.available = (ctx) => X.FORMATS.filter((f) => f.for === ctx.kind && (!f.on || f.on(ctx)) && (f.scope !== 'block' || ctx.blockScope));

  /* ---------- the dialog ---------- */

  let last = {};
  try { last = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { last = {}; }

  /* ctx: {kind: 'edition', ed, list, workId?, tables?, redraw} or {kind: 'project', project, entry}. A context with one table
     can export that block. */
  X.open = async function (ctx) {
    ctx.blockScope = ctx.kind === 'edition' && ctx.tables && ctx.tables.length === 1;
    const formats = X.available(ctx);
    let pick = formats.find((f) => f.id === last[ctx.kind]) || formats[0];
    const scope = ctx.kind === 'edition' ? U.el('select', { 'aria-label': 'How much', dataset: { action: 'export-scope' } },
      ctx.blockScope ? U.el('option', { value: 'block' }, 'This block, ' + ctx.tables[0].unit) : null,
      U.el('option', { value: 'work' }, 'The whole work')) : null;
    // first the kind of file; then, under it, only its own options
    const kinds = Object.keys(X.KINDS).filter((k) => formats.some((f) => X.kindOf(f) === k));
    const kindRow = U.el('div', { class: 'xp-kinds', role: 'radiogroup', 'aria-label': 'Kind of file' });
    const kindRadios = {};
    for (const k of kinds) {
      kindRadios[k] = U.el('input', { type: 'radio', name: 'xp-kind', value: k, checked: X.kindOf(pick) === k, onchange: () => { pick = formats.find((f) => f.id === (last[ctx.kind + ':' + k] || '')) || formats.find((f) => X.kindOf(f) === k); sync(); } });
      kindRow.append(U.el('label', { class: 'xp-kind', dataset: { kind: k } }, kindRadios[k], ' ' + X.KINDS[k]));
    }
    const kindHelp = U.el('p', { class: 'help xp-kind-help' });
    const list = U.el('div', { class: 'xp-list' });
    const rows = [];
    for (const f of formats) {
      const radio = U.el('input', { type: 'radio', name: 'xp-format', value: f.id, checked: f === pick, onchange: () => { pick = f; sync(); } });
      const row = U.el('label', { class: 'xp-row', dataset: { format: f.id, kind: X.kindOf(f) } }, radio, U.el('span', null, U.el('strong', null, f.label), U.el('span', { class: 'help' }, ' ' + f.desc)));
      rows.push({ f, row, radio });
      list.append(row);
    }
    const scopeRow = scope ? U.el('label', { class: 'xp-scope' }, 'How much: ', scope) : null;
    const sync = () => {
      const k = X.kindOf(pick);
      for (const [kk, r] of Object.entries(kindRadios)) r.checked = kk === k;
      for (const x of rows) { x.row.hidden = X.kindOf(x.f) !== k; x.radio.checked = x.f === pick; }
      kindHelp.textContent = KIND_HELP[k] || '';
      if (scopeRow) scopeRow.hidden = !!pick.whole || pick.scope === 'block';
    };
    sync();
    const go = U.el('button', { class: 'btn primary', dataset: { action: 'export-go' }, onclick: async () => {
      go.disabled = true;
      const was = go.textContent;
      go.textContent = 'Making it…';
      let c = null;
      try {
        last[ctx.kind] = pick.id;
        last[ctx.kind + ':' + X.kindOf(pick)] = pick.id;
        try { localStorage.setItem(KEY, JSON.stringify(last)); } catch (e) { /* not kept */ }
        c = Object.assign({}, ctx, { scope: pick.scope === 'block' ? 'block' : scope ? scope.value : null });
        /* A format that opens a tab opens it now, in the click itself, before anything is waited for: Safari, and
           other browsers with a strict pop-up blocker, allow a new tab only then. It is filled when ready. */
        if (pick.opensWindow) {
          c.win = window.open('', '_blank');
          if (c.win) { try { c.win.document.write('<!doctype html><meta charset="utf-8"><title>Laying out the edition…</title><p style="font:16px system-ui,sans-serif;padding:2em;color:#6b5a3e">Laying out the edition…</p>'); } catch (e) { /* filled later */ } }
        }
        // this dialog closes first, since a format may open a screen of its own
        const dlg = go.closest('.modal-backdrop');
        if (dlg) dlg.querySelector('.modal-foot .btn').click();
        const f = await pick.make(c);
        if (f) { U.download(f.name, f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type })); U.toast('Saved ' + f.name, 'ok'); }
      } catch (e) {
        U.toast('Not exported: ' + e.message, 'err', 8000);
        if (c && c.win && !c.win.closed) { try { if (/Laying out/.test(c.win.document.title)) c.win.close(); } catch (x) { /* leave it */ } }
      }
      go.disabled = false;
      go.textContent = was;
    } }, 'Export');
    await UI.modal({ title: 'Export', body: U.el('div', { class: 'xp' }, kindRow, kindHelp, list, U.el('div', { class: 'nv-head xp-foot' }, scopeRow, U.el('span', { class: 'cv-spacer' }), go)), wide: true, buttons: [{ label: 'Close', value: null }] });
  };

  ME.ExportView = X;
})(window.ME);
