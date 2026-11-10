'use strict';
/* The screens for layered texts: links between a commentary and its base text, the registers of testimonia
   and parallels, the concordance, and the indices. */
(function (ME) {
  const { U, UI, Edition, Store } = ME;
  const L = ME.Layers;
  const LayersView = {};

  const download = (name, data, type) => U.download(name, new Blob([data], { type: type || 'text/plain' }));
  const fileSafe = (s) => String(s).replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_');
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = U.el('input', { type: 'file', accept });
      inp.addEventListener('change', () => resolve(inp.files[0] || null));
      inp.click();
    });
  }
  const blockIds = (ed, list, workId) => { const reg = Edition.register(ed, list)[workId]; return reg ? reg.order.slice() : []; };

  /* ---------- links between works ---------- */

  LayersView.links = async function (ed, list, workId) {
    const body = U.el('div', { class: 'lv' });
    const draw = () => {
      body.innerHTML = '';
      const baseId = L.baseOf(ed, workId);
      const others = ed.works.filter((w) => w.id !== workId);
      const baseSel = U.el('select', { 'aria-label': 'The text this work comments on', onchange: async () => { L.setBase(ed, workId, baseSel.value); await Edition.save(ed); draw(); } },
        U.el('option', { value: '' }, 'none: it is a text of its own'), others.map((w) => U.el('option', { value: w.id, selected: w.id === baseId }, w.title)));
      body.append(U.el('p', { class: 'help' }, 'A commentary has its own witnesses and its own apparatus. Here you say which block of it comments on which block of its base text, so that the two can be read side by side and its lemmas used as evidence. Nothing is linked unless you say so.'),
        U.el('div', { class: 'nv-head' }, U.el('label', null, 'Comments on ', baseSel)));
      if (!baseId) return;
      const mine = blockIds(ed, list, workId), theirs = blockIds(ed, list, baseId);
      const both = L.embedded(ed, list, baseId, workId);
      body.append(U.el('p', { class: 'help' }, both.length ? 'Witnesses that carry both texts: ' + both.join(' ') + '.' : 'No witness carries both texts.'));
      const dl = U.el('datalist', { id: 'lv-base-ids' }, theirs.map((x) => U.el('option', { value: x })));
      const save = async (unit, base, kind) => { L.setLink(ed, workId, unit, base, kind); await Edition.save(ed); draw(); };
      const rows = mine.map((unit) => {
        const link = L.linkOf(ed, workId, unit);
        const kind = U.el('select', { 'aria-label': 'How ' + unit + ' stands to the base text', onchange: () => save(unit, link ? link.base : [], kind.value) },
          U.el('option', { value: '' }, '—'), Object.entries(L.KINDS).map(([k, t]) => U.el('option', { value: k, selected: link && link.kind === k }, t)));
        const base = U.el('input', { type: 'text', list: 'lv-base-ids', value: link ? link.base.join(' ') : '', placeholder: 'base blocks, e.g. 2.1 2.2', 'aria-label': 'Base blocks of ' + unit,
          onchange: () => { const ids = base.value.split(/[\s,]+/).filter(Boolean); save(unit, ids, ids.length ? (link && link.kind) || 'comments' : link && link.kind !== 'comments' ? link.kind : ''); } });
        const unknown = link ? link.base.filter((x) => !theirs.includes(x)) : [];
        return U.el('tr', null, U.el('td', null, unit), U.el('td', null, kind), U.el('td', null, base), U.el('td', { class: 'help' }, L.caseOf(link), unknown.length ? U.el('span', { class: 'ed-tag bad' }, ' not in the base text: ' + unknown.join(' ')) : null));
      });
      const propose = U.el('button', { class: 'btn small', onclick: async () => {
        const free = mine.filter((x) => !L.linkOf(ed, workId, x));
        const got = L.suggest(free, theirs);
        if (!got.length) { U.toast('No block numbers agree'); return; }
        if (!(await UI.confirm('Link ' + got.length + ' block(s) whose numbers agree with a base block, such as ' + got[0].unit + ' with ' + got[0].base[0] + '? Blocks you have linked are left alone.', { ok: 'Link them' }))) return;
        for (const g of got) L.setLink(ed, workId, g.unit, g.base, 'comments');
        await Edition.save(ed);
        draw();
      } }, 'Propose links where the numbers agree');
      body.append(U.el('div', { class: 'nv-head' }, propose), dl,
        U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table' }, U.el('thead', null, U.el('tr', null, ['Block', 'How it stands', 'Base blocks', ''].map((h) => U.el('th', null, h)))), U.el('tbody', null, rows))));
    };
    draw();
    await UI.modal({ title: 'Links to the base text', body, wide: true, buttons: [{ label: 'Close', value: null }] });
  };

  /* The base text beside a commentary, for the apparatus screen and the reader. -> {title, texts: {unit: text}} or null */
  LayersView.baseTexts = async function (ed, workId) {
    const baseId = L.baseOf(ed, workId);
    if (!baseId) return null;
    const all = await Store.listCollations(ed.id);
    const recs = all.filter((r) => r.work === baseId);
    // in a layered edition the links come from the IDs; else from what the editor set
    const LI = ME.LayerIds;
    const links = LI.layered(ed) && LI.codeOf(workId) ? LI.links(ed, workId, all.filter((r) => r.work === workId).map((r) => r.unit), recs.map((r) => r.unit)) : L.links(ed, workId);
    if (!links.length) return null;
    const texts = {};
    for (const r of recs) texts[r.unit] = ME.Apparatus.entries(ed, ME.CollateEdit.ensure(r.table)).text.trim();
    const w = ed.works.find((x) => x.id === baseId);
    return { title: w ? w.title : baseId, texts, links: links.map((l) => ({ unit: l.unit, base: l.base, kind: l.kind })) };
  };

  /* ---------- registers ---------- */

  function registers(ed, built, redraw) {
    const units = built.map((b) => b.table.unit);
    const rows = L.register(ed).map((r) => U.el('li', null,
      U.el('span', { class: 'ed-tag' }, r.kind === 'testimonium' ? 'testimonium' : 'parallel'), ' ',
      U.el('strong', null, r.title), r.locus ? ' ' + r.locus : '', r.place && r.place.unit ? ' → ' + r.place.unit : '', r.quote ? ': “' + r.quote + '”' : '', r.licence ? U.el('span', { class: 'help' }, ' (' + r.licence + ')') : null, ' ',
      U.el('button', { class: 'btn small', onclick: async () => { L.removeRegister(ed, r.id); await Edition.save(ed); redraw(); } }, 'Remove')));
    const kind = U.el('select', { 'aria-label': 'Testimonium or parallel' }, U.el('option', { value: 'testimonium' }, 'testimonium: a text that quotes this one'), U.el('option', { value: 'parallel' }, 'parallel: a like passage elsewhere'));
    const title = U.el('input', { type: 'text', placeholder: 'text, e.g. Kāvyamīmāṃsā', 'aria-label': 'Text it comes from' });
    const locus = U.el('input', { type: 'text', placeholder: 'where in it', 'aria-label': 'Where in that text' });
    const unit = U.el('select', { 'aria-label': 'Which block of this edition' }, U.el('option', { value: '' }, 'block —'), units.map((x) => U.el('option', { value: x }, x)));
    const quote = U.el('input', { type: 'text', placeholder: 'its words (optional)', 'aria-label': 'Quotation' });
    const add = U.el('button', { class: 'btn small', onclick: async () => {
      try { L.addRegister(ed, { kind: kind.value, title: title.value.trim(), locus: locus.value.trim() || undefined, quote: quote.value.trim() || undefined, place: unit.value ? { work: built[0] && built[0].table.work, unit: unit.value } : undefined }); } catch (err) { U.toast(err.message, 'warn'); return; }
      await Edition.save(ed); redraw();
    } }, 'Add');
    return U.el('details', { class: 'nv-fold' }, U.el('summary', null, 'Testimonia and parallels (' + L.register(ed).length + ')'),
      U.el('p', { class: 'help' }, 'Passages elsewhere that quote this text or run parallel to it. To use one as evidence for a reading, open the place in the text view.'),
      U.el('ul', { class: 'ap-entries' }, rows.length ? rows : U.el('li', { class: 'help' }, 'None yet.')),
      U.el('div', { class: 'nv-head' }, kind, title, locus, unit, quote, add));
  }

  /* ---------- the concordance ---------- */

  LayersView.importPack = async function () {
    const file = await pickFile('.txt,.xml,.json,text/plain,application/xml,application/json');
    if (!file) return null;
    let lines;
    try { lines = ME.Concord.parse(file.name, await file.text()); } catch (e) { U.toast('Could not read ' + file.name + ': ' + e.message, 'warn'); return null; }
    if (!lines.length) { U.toast('No passages found in ' + file.name, 'warn'); return null; }
    const licence = await UI.prompt('Under what terms may you use it?', 'Licence of ' + file.name, '', { help: lines.length + ' passage(s). Give its licence, e.g. CC BY-SA 4.0, or “my own”. It is shown beside every passage found in it.', validate: (v) => (v ? null : 'Say what its licence is') });
    if (!licence) return null;
    const pk = { id: 'pk-' + Date.now().toString(36), name: file.name.replace(/\.[^.]+$/, ''), licence, source: file.name, lines, added: new Date().toISOString() };
    await Store.putPack(pk);
    return pk;
  };

  function concordance(ed, built, witnesses, redraw) {
    const box = U.el('div');
    const fold = U.el('details', { class: 'nv-fold', open: !!LayersView.concordOpen }, U.el('summary', null, 'Concordance: where else a passage occurs'), box);
    const fill = async () => {
      if (!fold.open) return;
      const packs = await Store.listPacks();
      const rules = ME.Norm.settings(ed.norm).on;
      const own = { name: 'your witnesses', licence: 'your transcriptions', lines: ME.Concord.ownLines(witnesses || []) };
      const sources = [own, ...packs];
      const ticks = sources.map((s, i) => U.el('label', null, U.el('input', { type: 'checkbox', checked: true, value: String(i) }), ' ' + s.name + ' (' + s.lines.length + ')'));
      const q = U.el('input', { type: 'text', placeholder: 'words to look for', 'aria-label': 'Words to look for', class: 'lv-query' });
      const out = U.el('ul', { class: 'ap-entries' });
      const run = () => {
        const use = ticks.filter((t) => t.querySelector('input').checked).map((t) => sources[+t.querySelector('input').value]);
        const hits = ME.Concord.search(q.value, use, rules, 300);
        out.innerHTML = '';
        out.append(U.el('li', { class: 'help' }, hits.length + (hits.length >= 300 ? '+' : '') + ' place(s), compared after this edition’s normalisation and without spaces.'));
        for (const h of hits) out.append(U.el('li', null, U.el('span', { class: 'ap-ref' }, h.source.name + ' ' + h.ref), ' ', h.text, ' ', U.el('span', { class: 'help' }, '(' + h.source.licence + ') '),
          h.source === own ? null : U.el('button', { class: 'btn small', onclick: async () => { L.addRegister(ed, { kind: 'parallel', title: h.source.name, locus: h.ref, quote: h.text, licence: h.source.licence }); await Edition.save(ed); U.toast('Added to the parallels'); redraw(); } }, 'Add as a parallel')));
      };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      box.innerHTML = '';
      box.append(U.el('p', { class: 'help' }, 'Looks through your own witnesses and through texts you bring in. Nothing comes with Manuscribe: bring in a text file (one passage a line, or “reference, tab, text”), a TEI file, or JSON, and say under what licence you use it.'),
        U.el('div', { class: 'nv-head' }, q, U.el('button', { class: 'btn small primary', onclick: run }, 'Find'),
          U.el('button', { class: 'btn small', onclick: async () => { if (await LayersView.importPack()) fill(); } }, 'Bring in a text…')),
        U.el('div', { class: 'nv-head' }, ticks),
        packs.length ? U.el('details', null, U.el('summary', { class: 'help' }, 'Texts brought in'), U.el('ul', null, packs.map((p) => U.el('li', null, p.name + ' — ' + p.lines.length + ' passage(s), ' + p.licence + ' ', U.el('button', { class: 'btn small', onclick: async () => { if (await UI.confirm('Remove ' + p.name + ' from this browser?', { ok: 'Remove', danger: true })) { await Store.deletePack(p.id); fill(); } } }, 'Remove'))))) : null,
        out);
    };
    fold.addEventListener('toggle', () => { LayersView.concordOpen = fold.open; fill(); });
    fill();
    return fold;
  }

  /* ---------- indices ---------- */

  LayersView.indicesText = function (ed, built) {
    const words = ME.Concord.wordIndex(built), padas = ME.Concord.padaIndex(built);
    return ME.Publish.citation(ed) + '\n\nIndex of words\n' + words.map((w) => w.word + '  ' + w.refs.join(', ')).join('\n')
      + (padas.length ? '\n\nIndex of pādas\n' + padas.map((p) => p.pada + '  ' + p.ref).join('\n') : '')
      + (ME.Concord.quoteIndex(built).length ? '\n\n' + LayersView.quotesText(ed, built, false) + '\n\n' + LayersView.quotesText(ed, built, true) : '') + '\n';
  };
  /* The quotations as text: in the order of the alphabet, each with its place and work; or by the work quoted. */
  LayersView.quotesText = function (ed, built, byWork) {
    if (!byWork) return 'Index of quotations\n' + ME.Concord.quoteIndex(built).map((q) => q.text + '  ' + q.ref + (q.work ? '  (' + q.work + (q.n ? ' ' + q.n : '') + ')' : '')).join('\n');
    return 'Quotations by work\n' + ME.Concord.quotesByWork(built).map((g) => (g.work || 'Work not named') + '\n' + g.quotes.map((q) => '  ' + q.text + '  ' + q.ref + (q.n ? '  ' + q.n : '')).join('\n')).join('\n');
  };

  function indices(ed, built) {
    const box = U.el('div');
    const fold = U.el('details', { class: 'nv-fold' }, U.el('summary', null, 'Indices of words and pādas'), box);
    fold.addEventListener('toggle', () => {
      if (!fold.open || box.childNodes.length) return;
      const words = ME.Concord.wordIndex(built), padas = ME.Features.on('metre') ? ME.Concord.padaIndex(built) : [];
      box.append(U.el('p', { class: 'help' }, words.length + ' different words in the edited text' + (padas.length ? ', and ' + padas.length + ' pādas of verse' : '') + ', in the order of the alphabet. A reference is block and word.'),
        U.el('div', { class: 'nv-head' }, U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.indices.txt', LayersView.indicesText(ed, built)) }, 'Save as text')),
        padas.length ? U.el('div', { class: 'lv-index' }, U.el('h4', null, 'Pādas'), U.el('ul', null, padas.slice(0, 1000).map((p) => U.el('li', null, p.pada + ' ', U.el('span', { class: 'help' }, p.ref))))) : null,
        U.el('div', { class: 'lv-index' }, U.el('h4', null, 'Words'), U.el('ul', null, words.slice(0, 2000).map((w) => U.el('li', null, w.word + ' ', U.el('span', { class: 'help' }, w.refs.slice(0, 12).join(', ') + (w.refs.length > 12 ? ' … (' + w.refs.length + ')' : '')))))));
    });
    return fold;
  }

  /* The folds under the apparatus. */
  LayersView.folds = (ed, built, witnesses, redraw) => [ME.Features.on('registers') ? registers(ed, built, redraw) : null, ME.Features.on('registers') ? concordance(ed, built, witnesses, redraw) : null, ME.Features.on('indices') ? indices(ed, built) : null].filter(Boolean);

  ME.LayersView = LayersView;
})(window.ME);
