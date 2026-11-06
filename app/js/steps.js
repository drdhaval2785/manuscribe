'use strict';
/* The later steps of the edition screen: Analyse, a card for each way of looking at the witnesses, computed only
   when it is opened; and Publish, the citation, the conventions of the apparatus, its checks, and the outputs. And
   the Share menu. */
(function (ME) {
  const { U, UI, Edition } = ME;
  const Steps = {};
  const F = () => ME.Features;

  /* ---------- Share ---------- */

  Steps.share = async function (ed, redraw) {
    const X = ME.ExchangeView;
    const choice = await UI.modal({ title: 'Share', body: U.el('div', { class: 'xv' },
      U.el('p', { class: 'help' }, 'Editors working on one edition each keep a copy, and exchange packages by email, a shared drive or GitHub. Decisions are never chosen between: where two copies decide a place differently, both stay, for you to settle.'),
      U.el('ul', { class: 'st-list' },
        U.el('li', null, U.el('strong', null, 'Compare and merge…'), ' another editor’s package, or an older one of yours, with this copy.'),
        U.el('li', null, U.el('strong', null, 'GitHub…'), ' keeps the package in a repository: send, and fetch and merge.'),
        U.el('li', null, U.el('strong', null, 'Kept copies'), ': both copies as they were before each merge.'))),
    buttons: [{ label: 'Close', value: null, kind: 'ghost' }, { label: 'Kept copies', value: 'kept' }, { label: 'GitHub…', value: 'github' }, { label: 'Compare and merge…', value: 'compare', kind: 'primary' }] });
    if (choice === 'compare') X.compareFile(ed, redraw);
    else if (choice === 'github') X.github(ed, redraw);
    else if (choice === 'kept') X.kept(ed);
  };

  /* ---------- Analyse ---------- */

  async function builtOf(ed, list) {
    const works = await ME.Release.works(ed, list);
    return works.find((w) => w.work.id === ME.CollateView.work) || works[0] || null;
  }

  // a card: its title, what it shows, and what opening it does
  const card = (title, desc, open, action) => U.el('div', { class: 'an-card' }, U.el('h3', null, title), U.el('p', { class: 'help' }, desc),
    U.el('button', { class: 'btn small', dataset: { action }, onclick: open }, 'Open'));

  const panel = (title, body) => UI.modal({ title, body, wide: true, buttons: [{ label: 'Close', value: null }] });

  Steps.analyse = async function (ed, list, redraw) {
    const w = await builtOf(ed, list);
    if (!w) return U.el('p', { class: 'help' }, 'Collate first: then the witnesses can be compared here.');
    const workId = w.work.id;
    const cards = [];
    if (F().on('agreement')) cards.push(card('Agreement', 'How often each pair of witnesses reads alike, in the corrected text; and where some agree against others.', () => {
      const built = w.built;
      const A = ME.Apparatus;
      const sigla = ed.witnesses.map((x) => x.siglum);
      const pickBox = (name) => U.el('span', { class: 'ap-pick' }, sigla.map((x) => U.el('label', null, U.el('input', { type: 'checkbox', value: x, name }), ' ' + x)));
      const withBox = pickBox('with'), againstBox = pickBox('against');
      const found = U.el('ul', { class: 'ap-entries' });
      panel('Agreement', U.el('div', null, ME.CollateView.agreement(ed, list, workId),
        U.el('h3', null, 'Where witnesses agree against others'),
        U.el('div', { class: 'nv-head' }, U.el('span', null, 'These agree:'), withBox),
        U.el('div', { class: 'nv-head' }, U.el('span', null, 'against:'), againstBox, U.el('button', { class: 'btn small primary', onclick: () => {
          const a = [...withBox.querySelectorAll('input:checked')].map((i) => i.value), g = [...againstBox.querySelectorAll('input:checked')].map((i) => i.value);
          found.innerHTML = '';
          if (!a.length) { found.append(U.el('li', { class: 'help' }, 'Tick at least one witness that agrees.')); return; }
          const res = A.agreements(ed, built, a, g);
          found.append(U.el('li', { class: 'help' }, res.length + ' place(s). Places where any of them is lost are left out.'), ...res.map((r) => U.el('li', null, r.ref + ' ' + (r.reading || '(omits)') + ' — ' + A.format(ed, r.entry).replace(/<\/?sup>/g, ''))));
        } }, 'Find')), found));
    }, 'an-agreement'));
    if (F().on('stemmatics')) {
      // the workbench in its parts, each opened on its own
      const SV = ME.StemmaView;
      cards.push(card('Trees', 'A tree by distance (neighbour joining) with how sure each group is, a map of the witnesses, and the shortest tree (parsimony).', () => SV.open(ed, list, workId, 'trees'), 'an-trees'));
      cards.push(card('Network and coherence', 'A NeighborNet, where the variants pull two ways; and each witness’s closest relatives and potential ancestors.', () => SV.open(ed, list, workId, 'network'), 'an-network'));
      cards.push(card('Copies and contamination', 'Possible copies, each witness left out in turn, and passage by passage how far one witness agrees with each other.', () => SV.open(ed, list, workId, 'copies'), 'an-copies'));
      cards.push(card('Your stemma', 'Write your stemma, see the archetype it implies, and the variants that do not fit it.', () => SV.open(ed, list, workId, 'stemma'), 'an-stemma'));
      cards.push(card('The whole workbench', 'All of the above, and agreement, on one page.', () => SV.open(ed, list, workId), 'stemmatics'));
    }
    if (F().on('registers')) cards.push(card('Testimonia, parallels, concordance', 'Passages elsewhere that quote this text or run beside it, and where else a passage occurs, in your witnesses and in texts you bring in.', () => {
      const folds = ME.LayersView.folds(ed, w.built, list, redraw).filter((x) => !/Indices/.test(x.textContent));
      for (const f of folds) f.open = true;
      panel('Testimonia, parallels, concordance', U.el('div', null, ...folds));
    }, 'an-registers'));
    if (F().on('indices')) cards.push(card('Indices', 'Every word of the edited text, in the order of the alphabet, with where it stands' + (F().on('metre') ? '; and every pāda of its verse' : '') + '.', () => {
      const f = ME.LayersView.folds(ed, w.built, list, redraw).find((x) => /Indices/.test(x.textContent));
      if (f) { panel('Indices', U.el('div', null, f)); f.open = true; f.dispatchEvent(new Event('toggle')); }
    }, 'an-indices'));
    if (F().on('metre')) cards.push(card('Metre', 'The metre of each verse block of the edited text, and what does not fit it.', () => {
      const rows = w.built.map((b) => { const r = ME.Metre.identify(b.text.trim()); return U.el('tr', null, U.el('td', null, b.table.unit), U.el('td', null, r.metre ? r.names.slice(0, 2).join(', ') : '—'), U.el('td', { class: 'num' }, r.metre ? String(r.faults.length) : ''), U.el('td', { class: 'help' }, r.metre ? r.faults.slice(0, 3).map((f) => 'pāda ' + f.pada + ', ' + (f.pos ? 'syllable ' + f.pos + ': ' : '') + f.why).join('; ') : r.why || '')); });
      panel('Metre', U.el('table', { class: 'ed-table' }, U.el('thead', null, U.el('tr', null, ['Block', 'Metre', 'Faults', ''].map((h) => U.el('th', null, h)))), U.el('tbody', null, rows)));
    }, 'an-metre'));
    const off = ['agreement', 'stemmatics', 'registers'].filter((id) => !F().on(id)).map((id) => ({ agreement: 'agreement', stemmatics: 'stemmatics', registers: 'testimonia, parallels and the concordance' }[id]));
    const more = off.length ? U.el('p', { class: 'help' }, 'Also: ' + off.join(', ') + '. Switch them on under ⚙ Settings, or choose the Full level there.') : null;
    if (!cards.length) return U.el('div', null, more);
    return U.el('div', null, U.el('div', { class: 'an-cards' }, cards), more);
  };

  /* ---------- Publish ---------- */

  Steps.publish = async function (ed, list, redraw) {
    const R = ME.Release;
    const field = (k, label, ph) => U.el('label', { class: 'field' }, U.el('span', null, label), U.el('input', { type: 'text', value: ed[k] || '', placeholder: ph || '', 'aria-label': label, onchange: async (e) => { ed[k] = e.target.value.trim() || undefined; await Edition.save(ed); redraw(); } }));
    const licences = Object.keys(R.LICENCES);
    const lic = U.el('select', { 'aria-label': 'Licence', onchange: async () => { ed.licence = lic.value || undefined; await Edition.save(ed); redraw(); } },
      U.el('option', { value: '' }, '— choose —'), licences.map((l) => U.el('option', { value: l, selected: ed.licence === l }, l)), ed.licence && !licences.includes(ed.licence) ? U.el('option', { value: ed.licence, selected: true }, ed.licence) : null);
    // the checks of the apparatus, as a count
    const works = await R.works(ed, list);
    const problems = works.flatMap(({ built }) => built.flatMap((b) => ME.Apparatus.validate(ed, b.table, b)));
    const errors = problems.filter((p) => p.level === 'error');
    const checks = U.el('details', { class: 'nv-fold', open: errors.length > 0 && errors.length < 10 }, U.el('summary', null, !works.length ? 'Collate first' : errors.length ? errors.length + ' problem(s) in the apparatus' : '✓ The apparatus passes every check' + (problems.length ? '; ' + problems.length + ' place(s) to look at' : '')),
      U.el('ul', { class: 'ap-problems' }, problems.slice(0, 200).map((p) => U.el('li', { class: p.level }, U.el('span', { class: 'ed-tag ' + (p.level === 'error' ? 'bad' : 'warn') }, p.level === 'error' ? 'problem' : 'look'), ' ', p.ref + ': ' + p.text))));
    return U.el('div', null,
      U.el('h2', null, 'How the edition is cited'),
      U.el('div', { class: 'xv-grid' }, field('editor', 'Edited by', 'your name'), field('version', 'Version', 'e.g. 1.0, or empty for a dated draft'), U.el('label', { class: 'field' }, U.el('span', null, 'Licence'), lic), field('doi', 'DOI (optional)', 'e.g. 10.5281/zenodo.1234567')),
      U.el('p', { class: 'help' }, 'Every output carries this citation: ', U.el('em', null, ME.Publish.citation(ed))),
      U.el('h2', null, 'The apparatus'),
      checks,
      ME.CollateView.apparatusSettings(ed, redraw),
      ME.CollateView.printSettings(ed, redraw),
      U.el('div', { class: 'nv-head st-actions' },
        U.el('button', { class: 'btn primary', dataset: { action: 'export' }, onclick: () => ME.ExportView.open({ kind: 'edition', ed, list, workId: ME.CollateView.work, redraw }) }, 'Export…'),
        U.el('button', { class: 'btn', title: 'Freeze a version, check it, and make every output of it at once', dataset: { action: 'issue' }, onclick: () => ME.ExchangeView.issue(ed, list, redraw) }, 'Issue edition…')));
  };

  /* ---------- help for the edition screen ---------- */

  Steps.help = function () {
    const rows = (items) => U.el('table', { class: 'keys' }, items.map(([a, b]) => U.el('tr', null, U.el('td', null, U.el('kbd', null, a)), U.el('td', null, b))));
    return UI.modal({ title: 'The edition, step by step', wide: true, body: U.el('div', { class: 'help-body' },
      U.el('ol', { class: 'st-list' },
        U.el('li', null, U.el('strong', null, 'Witnesses: '), 'add the transcriptions of your manuscripts, and check that their citation IDs match.'),
        U.el('li', null, U.el('strong', null, 'Collate: '), 'line them up, block by block. Change… says what counts as the same reading.'),
        U.el('li', null, U.el('strong', null, 'Edit: '), 'open a block, and decide where the witnesses differ. The proposal is the reading of most witnesses, or of the most trusted.'),
        U.el('li', null, U.el('strong', null, 'Analyse: '), 'agreement, trees, a network, copies, your stemma, the concordance and indices, each opened when you need it.'),
        U.el('li', null, U.el('strong', null, 'Publish: '), 'say how the edition is cited, check the apparatus, and Export… it: a PDF, a reader, TEI, LaTeX and more.')),
      U.el('p', { class: 'help' }, 'The line under the steps says where the edition stands and offers what comes next. Less used tools are switched on under ⚙ Settings, or all at once with the Full level.'),
      U.el('h3', null, 'In a block'),
      rows([
        ['N  P', 'The next or previous place where the witnesses differ'],
        ['1 … 9', 'Choose that reading'],
        ['A', 'Accept the proposal as your decision'],
        [']  [', 'The next or previous block'],
        [(U.isMac ? '⌘' : 'Ctrl') + '+Z', 'Undo; with Shift, redo'],
      ])), buttons: [{ label: 'Close', value: null }] });
  };

  ME.Steps = Steps;
})(window.ME);
