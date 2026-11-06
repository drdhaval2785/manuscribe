'use strict';
/* What Manuscribe shows. Every tool beyond the everyday ones is a feature here, with the interface level at which it
   appears (simple or full) and, if it belongs to one, a language pack. Each person chooses, in this browser, the level,
   and can switch any feature on or off on its own; a pack is switched on by the language tags of the witnesses, or
   by hand. What is shown never changes the data: an edition made with every feature opens with none, intact. */
(function (ME) {
  const F = {};
  const KEY = 'manuscribe.ui';

  F.LEVELS = { simple: 'Simple: the everyday work, with the rest a click away in Settings', full: 'Full: every tool in view' };

  /* Packs: features particular to a family of languages and scripts, switched on by these language tags (BCP 47:
     a language, or a script subtag). */
  F.PACKS = {
    'south-asian': {
      name: 'South Asian scripts: Sanskrit, Prakrit and related languages',
      desc: 'Typing schemes and gemination while typing, Sanskrit, Prakrit and Old Gujarati normalisation, akṣara tokens, metre and the pāda index, the Sanskrit names of commentary evidence, Export for Saktumiva, and the PDF in Manuscribe’s Devanagari font.',
      langs: ['sa', 'pra', 'pi', 'hi', 'mr', 'gu', 'ne', 'bn', 'or', 'pa', 'kn', 'te', 'ta', 'ml', 'si', 'new', 'mai', 'bho', 'awa', 'raj'],
      scripts: ['Deva', 'Shrd', 'Gran', 'Sidd', 'Newa', 'Beng', 'Gujr', 'Guru', 'Orya', 'Knda', 'Telu', 'Taml', 'Mlym', 'Sinh', 'Brah', 'Nand', 'Modi', 'Tirh', 'Takr'],
    },
  };

  /* The features. group: where it is, for the Settings list. */
  F.LIST = [
    { id: 'normRules', group: 'Comparing', label: 'Normalisation rule by rule, declarations per witness, and the preview', level: 'full' },
    { id: 'alignMore', group: 'Comparing', label: 'Align again, and import an alignment made elsewhere', level: 'full' },
    { id: 'agreement', group: 'Comparing', label: 'How far the witnesses agree, and sample passages', level: 'full' },
    { id: 'letters', group: 'Editing', label: 'Correcting the alignment letter by letter', level: 'full' },
    { id: 'evidence', group: 'Editing', label: 'Evidence beyond the witnesses: commentaries and testimonia', level: 'full' },
    { id: 'layers', group: 'Editing', label: 'Commentaries linked to their base text', level: 'full' },
    { id: 'stemmatics', group: 'Analysing', label: 'The stemmatic workbench', level: 'full' },
    { id: 'registers', group: 'Analysing', label: 'Testimonia and parallels, and the concordance', level: 'full' },
    { id: 'indices', group: 'Analysing', label: 'Indices of words', level: 'simple' },
    { id: 'share', group: 'Sharing', label: 'Compare and merge copies, GitHub, kept copies', level: 'full' },
    { id: 'dts', group: 'Output', label: 'Files for DTS (Distributed Text Services)', level: 'full' },
    { id: 'exchange', group: 'Output', label: 'Exchange formats of a table: CollateX, TEI corpus, CSV', level: 'full' },
    { id: 'tagSummary', group: 'Transcribing', label: 'The summary of tags and attributes', level: 'full' },
    { id: 'memTest', group: 'Transcribing', label: 'The memorisation test for text proposed by AI', level: 'full' },
    { id: 'translit', group: 'Transcribing', label: 'Typing schemes (Harvard-Kyoto, ITRANS, IAST…) and gemination while typing', level: 'simple', pack: 'south-asian' },
    { id: 'saProfiles', group: 'Comparing', label: 'Sanskrit, Prakrit and Old Gujarati normalisation', level: 'simple', pack: 'south-asian' },
    { id: 'aksara', group: 'Comparing', label: 'Akṣara tokens for alignment', level: 'simple', pack: 'south-asian' },
    { id: 'metre', group: 'Editing', label: 'Metre: each reading in the metre of its verse, and the pāda index', level: 'simple', pack: 'south-asian' },
    { id: 'saEvidence', group: 'Editing', label: 'The Sanskrit names of commentary evidence (pratīka, kvacit, apapāṭha, yukta)', level: 'simple', pack: 'south-asian' },
    { id: 'saktumiva', group: 'Output', label: 'Export for Saktumiva', level: 'simple', pack: 'south-asian' },
    { id: 'pdfDeva', group: 'Output', label: 'The PDF made directly in Manuscribe’s Devanagari and Latin font', level: 'simple', pack: 'south-asian' },
  ];
  const BY = new Map(F.LIST.map((f) => [f.id, f]));

  /* ---------- the person's choices, in this browser ---------- */

  let prefs = null;
  F.prefs = function () {
    if (prefs) return prefs;
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { p = {}; }
    prefs = { level: p.level === 'full' ? 'full' : 'simple', on: p.on || {}, packs: p.packs || {} };
    return prefs;
  };
  F.save = function (next) {
    prefs = Object.assign(F.prefs(), next);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* kept for this visit only */ }
    for (const fn of listeners) fn();
  };
  const listeners = [];
  F.onChange = (fn) => listeners.push(fn);

  /* ---------- the languages in view ---------- */

  // What the screen is about: the witnesses of an edition, or one transcription. Set by the screens as they open.
  let context = { langs: [] };
  F.setContext = (langs) => { context = { langs: (langs || []).filter(Boolean) }; };
  F.contextLangs = () => context.langs.slice();
  F.langsOf = (list) => list.map((x) => (x.p && x.p.meta && x.p.meta.textLang) || 'sa-Latn');

  // Does a language tag call for a pack?
  F.packFits = function (pack, tag) {
    const P = F.PACKS[pack];
    const parts = String(tag || '').split('-');
    return P.langs.includes(parts[0].toLowerCase()) || parts.slice(1).some((x) => P.scripts.includes(x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()));
  };
  /* Is a pack in force? By hand ('on' or 'off'), else by the languages in view. -> {active, why} */
  F.pack = function (pack, langs, opts) {
    const set = opts && opts.auto ? undefined : F.prefs().packs[pack];
    if (set === 'on') return { active: true, why: 'switched on by hand' };
    if (set === 'off') return { active: false, why: 'switched off by hand' };
    const ls = langs || context.langs;
    const hit = ls.find((l) => F.packFits(pack, l));
    return hit ? { active: true, why: 'the text is ' + hit } : { active: false, why: ls.length ? 'no witness is in such a language' : 'no language yet' };
  };

  /* Is a feature shown here? Its own switch decides if set; else its level; and a pack feature needs its pack. */
  F.on = function (id, langs) {
    const f = BY.get(id);
    if (!f) return true;
    if (f.pack && !F.pack(f.pack, langs).active) return false;
    const p = F.prefs();
    if (p.on[id] !== undefined) return !!p.on[id];
    return p.level === 'full' || f.level === 'simple';
  };
  F.feature = (id) => BY.get(id);

  /* ---------- the Interface section of Settings ---------- */

  F.panel = function (U) {
    const p = F.prefs();
    const box = U.el('div', { class: 'ft-panel' });
    const draw = () => {
      const q = F.prefs();
      box.innerHTML = '';
      box.append(U.el('h4', null, 'How much is shown'),
        ...Object.entries(F.LEVELS).map(([k, t]) => U.el('label', { class: 'ft-row' }, U.el('input', { type: 'radio', name: 'ft-level', value: k, checked: q.level === k, onchange: () => { F.save({ level: k }); draw(); } }), ' ' + t)));
      box.append(U.el('h4', null, 'Language features'));
      for (const [id, P] of Object.entries(F.PACKS)) {
        const st = F.pack(id);
        const sel = U.el('select', { 'aria-label': P.name, onchange: () => { const v = sel.value; F.save({ packs: Object.assign({}, q.packs, { [id]: v === 'auto' ? undefined : v }) }); draw(); } },
          U.el('option', { value: 'auto', selected: !q.packs[id] }, 'by the language of the text'), U.el('option', { value: 'on', selected: q.packs[id] === 'on' }, 'on'), U.el('option', { value: 'off', selected: q.packs[id] === 'off' }, 'off'));
        box.append(U.el('div', { class: 'ft-pack' }, U.el('label', null, U.el('strong', null, P.name), ' ', sel), U.el('div', { class: 'help' }, P.desc + ' Now ' + (st.active ? 'on' : 'off') + ': ' + st.why + '.')));
      }
      box.append(U.el('h4', null, 'Each tool on its own'), U.el('p', { class: 'help' }, 'Ticked tools are shown whatever the level. A grey tick follows the level or the language.'));
      const groups = [...new Set(F.LIST.map((f) => f.group))];
      for (const g of groups) {
        box.append(U.el('div', { class: 'ft-group' }, g));
        for (const f of F.LIST.filter((x) => x.group === g)) {
          const own = q.on[f.id];
          const cb = U.el('input', { type: 'checkbox', checked: F.on(f.id), onchange: () => { F.save({ on: Object.assign({}, q.on, { [f.id]: cb.checked }) }); draw(); } });
          if (own === undefined) cb.classList.add('ft-auto');
          const reset = own !== undefined ? U.el('button', { class: 'btn small ghost', title: 'Follow the level and the language again', onclick: () => { const on = Object.assign({}, q.on); delete on[f.id]; F.save({ on }); draw(); } }, 'as the level') : null;
          box.append(U.el('label', { class: 'ft-row' + (f.pack && !F.pack(f.pack).active ? ' ft-off' : '') }, cb, ' ' + f.label, f.pack ? U.el('span', { class: 'help' }, ' (' + F.PACKS[f.pack].name.split(':')[0] + ')') : null, reset));
        }
      }
    };
    void p;
    draw();
    return box;
  };

  ME.Features = F;
})(window.ME);
