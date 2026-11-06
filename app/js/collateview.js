'use strict';
/* The Collation part of the edition screen, and the table itself. The table only ever puts on the page the
   cells that are in view, so that a long block with many witnesses scrolls as easily as a short one. */
(function (ME) {
  const { U, UI, Norm, Collate, Edition, Store } = ME;
  const CollateView = { running: null };

  const WIDTH = { letter: 30, aksara: 58, word: 130 };
  const ROW = 30, LABEL = 96, BUFFER = 12;
  const ABSENT = { missing: 'does not have this block', lacuna: 'lacuna', pending: 'not yet transcribed', outside: 'outside its scope' };

  const worksWithText = (ed, list) => ed.works.filter((k) => list.some(({ w, p }) => p && ME.Export.streamsUsed(p).some((s) => ((w.streams && w.streams[s]) || s) === k.id)));

  const download = (name, data, type) => U.download(name, new Blob([data], { type: type || 'application/json' }));
  const fileSafe = (s) => String(s).replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_');

  /* ---------- the part of the edition screen ---------- */

  function statusOf(ed, list, s) {
    if (!s) return { text: 'not collated', cls: 'warn' };
    const c = Collate.isCurrent(ed, list, s);
    if (c === false) return { text: 'settings changed', cls: 'warn' };
    if (c === null) return { text: 'collate to check', cls: 'warn' };
    if (s.review) return { text: s.review + ' to review', cls: 'warn' };
    if (s.checked) return { text: '✓ read through', cls: 'ok' };
    return { text: s.imported ? 'imported' : 'up to date', cls: 'ok' };
  }

  function agreementTable(tables) {
    if (!tables.length) return U.el('p', { class: 'help' }, 'Collate first.');
    const a = Collate.agreement(tables);
    if (a.sigla.length < 2) return U.el('p', { class: 'help' }, 'This needs at least two witnesses.');
    return U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table cv-agree' },
      U.el('thead', null, U.el('tr', null, U.el('th', null, ''), a.sigla.map((s) => U.el('th', null, s)))),
      U.el('tbody', null, a.sigla.map((x) => U.el('tr', null, U.el('th', null, x), a.sigla.map((y) => {
        const p = a.of(x, y);
        if (!p) return U.el('td', { class: 'muted' }, '—');
        if (!p.sites) return U.el('td', { class: 'muted', title: 'No place where both can be read' }, 'n/a');
        const pct = (100 * p.same) / p.sites;
        return U.el('td', { class: 'num', style: { background: 'rgba(43,138,62,' + (Math.max(0, pct - 50) / 100).toFixed(2) + ')' }, title: p.same + ' of ' + p.sites + ' places where both can be read' }, pct.toFixed(1) + '%');
      }))))));
  }

  /* ---------- how far each witness is trusted ---------- */

  // A list the editor reorders, most trusted first. -> {el, order()}
  CollateView.trustEditor = function (ed) {
    const order = Collate.trustOrder(ed);
    const titleOf = (s) => { const w = ed.witnesses.find((x) => x.siglum === s); return w ? w.siglum : s; };
    const box = U.el('ol', { class: 'cv-trust' });
    const draw = () => {
      box.innerHTML = '';
      order.forEach((s, i) => {
        const move = (d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(); box.querySelectorAll('button')[Math.max(0, 2 * j + (d < 0 ? 0 : 1))].focus(); };
        box.append(U.el('li', null, U.el('strong', null, titleOf(s)), ' ',
          U.el('button', { class: 'btn small', 'aria-label': 'Trust ' + s + ' more', disabled: i === 0, onclick: () => move(-1) }, '↑'),
          U.el('button', { class: 'btn small', 'aria-label': 'Trust ' + s + ' less', disabled: i === order.length - 1, onclick: () => move(1) }, '↓')));
      });
    };
    draw();
    return { el: box, order: () => order.slice() };
  };

  // -> true if the editor set it, false if they cancelled
  CollateView.askTrust = async function (ed, first) {
    const editor = CollateView.trustEditor(ed);
    const ok = await UI.modal({
      title: 'Which witnesses do you trust most?',
      body: U.el('div', null,
        U.el('p', { class: 'confirm-text' }, 'Most trusted first. Where witnesses tie, the reading of the most trusted one is proposed. Otherwise the reading most witnesses have is proposed. You can change this at any time; nothing has to be aligned again.'),
        editor.el),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: first ? 'Save and collate' : 'Save', value: true, kind: 'primary' }],
    });
    if (!ok) return false;
    ed.trust = editor.order();
    await Edition.save(ed);
    return true;
  };

  CollateView.section = async function (ed, list, redraw) {
    if (Store.fallback) return U.el('p', { class: 'help' }, 'Collation needs the browser’s database, which this browser does not allow for a page opened from disk. Try another browser, or the copy on the web.');
    const works = worksWithText(ed, list);
    if (!works.length) return U.el('p', { class: 'help' }, 'Appears when the edition has witnesses with text.');
    const summaries = await Collate.summaries(ed.id);
    const blocksOf = (workId) => {
      const reg = Edition.register(ed, list)[workId];
      const ids = reg ? reg.order.slice() : [];
      for (const s of summaries.values()) if (s.work === workId && !ids.includes(s.unit)) ids.push(s.unit);
      return ids;
    };
    CollateView.work = works.some((k) => k.id === CollateView.work) ? CollateView.work : (works.find((k) => blocksOf(k.id).length) || works[0]).id;
    const workId = CollateView.work;
    const ids = blocksOf(workId);
    const kind = Collate.tokenKind(ed);
    const pick = U.el('select', { 'aria-label': 'Work to collate', onchange: () => { CollateView.work = pick.value; redraw(); } }, works.map((k) => U.el('option', { value: k.id, selected: k.id === workId }, k.title)));
    const tok = U.el('select', { 'aria-label': 'Align by', onchange: async () => { ed.collate = Object.assign({}, ed.collate, { tokens: tok.value }); await Edition.save(ed); redraw(); } },
      Object.entries(Norm.TOKENIZERS).map(([k, t]) => U.el('option', { value: k, selected: k === kind }, t.label)));
    const progress = U.el('div', { class: 'cv-progress', hidden: true });
    const go = U.el('button', { class: 'btn small primary', disabled: !ids.length, onclick: async () => {
      if (!ed.trust && ed.witnesses.length > 1 && !(await CollateView.askTrust(ed, true))) return;
      CollateView.collate(ed, list, workId, progress, go, redraw, false);
    } }, 'Collate');
    const trustLine = U.el('p', { class: 'help cv-trustline' }, 'Trust, most trusted first: ', U.el('strong', null, Collate.trustOrder(ed).join(' › ')), ed.trust ? '' : ' (not set yet: as listed above) ',
      U.el('button', { class: 'btn small', onclick: async () => { if (await CollateView.askTrust(ed, false)) redraw(); } }, 'Change…'));
    const again = U.el('button', { class: 'btn small', disabled: !ids.length, title: 'Align every block again, even where nothing has changed. What you have corrected or locked stays; an alignment you imported is replaced.', onclick: async () => {
      if ([...summaries.values()].some((s) => s.work === workId && s.imported) && !(await UI.confirm('This replaces the alignments you imported for this work. Continue?', { ok: 'Align again' }))) return;
      CollateView.collate(ed, list, workId, progress, go, redraw, true);
    } }, 'Align again');
    const samples = new Set((ed.samples && ed.samples[workId]) || []);
    const rows = ids.map((id) => {
      const s = summaries.get(Collate.keyOf(ed.id, workId, id));
      const st = statusOf(ed, list, s);
      const cb = U.el('input', { type: 'checkbox', checked: samples.has(id), 'aria-label': 'Use ' + id + ' as a sample passage', onchange: async () => {
        const now = new Set((ed.samples && ed.samples[workId]) || []);
        if (cb.checked) now.add(id); else now.delete(id);
        ed.samples = Object.assign({}, ed.samples, { [workId]: ids.filter((x) => now.has(x)) });
        await Edition.save(ed);
        redraw();
      } });
      return U.el('tr', null,
        U.el('td', null, cb),
        U.el('td', { class: 'cv-unit' }, s ? U.el('button', { class: 'link', title: 'Open the table', onclick: () => CollateView.open(ed, list, workId, id, redraw) }, id) : id),
        U.el('td', null, U.el('span', { class: 'ed-tag ' + st.cls }, st.text)),
        U.el('td', { class: 'num' }, s ? String(s.labels) : ''), U.el('td', { class: 'num' }, s && s.words !== undefined ? String(s.words) : ''),
        U.el('td', { class: 'num' }, s && s.words !== undefined ? String(s.differ) : ''), U.el('td', { class: 'num' }, s && s.words !== undefined ? String(s.ties) : ''),
        U.el('td', { class: 'num' }, s && s.corrections ? String(s.corrections) : ''),
        U.el('td', { class: 'num' }, s && s.accuracy ? (100 * s.accuracy.recall).toFixed(1) + '%' : ''));
    });
    const opened = CollateView.agreeOpen;
    const agreeBox = U.el('div');
    const fold = U.el('details', { class: 'nv-fold', open: opened }, U.el('summary', null, samples.size ? 'How far the witnesses agree, in the ' + samples.size + ' sample passage(s)' : 'How far the witnesses agree'), agreeBox);
    const fillAgreement = async () => {
      if (!fold.open) return;
      const recs = (await Store.listCollations(ed.id)).filter((r) => r.work === workId && (!samples.size || samples.has(r.unit)));
      agreeBox.innerHTML = '';
      agreeBox.append(U.el('p', { class: 'help' }, 'Places where two witnesses agree, out of the places where both can be read, in the corrected text. A lacuna or a witness without the block counts neither way. An omission counts as a difference. Tick passages below to look only at those.'), agreementTable(recs.map((r) => r.table)));
    };
    fold.addEventListener('toggle', () => { CollateView.agreeOpen = fold.open; fillAgreement(); });
    fillAgreement();
    return U.el('div', null,
      U.el('p', { class: 'help' }, 'Lines up the witnesses, block by block, by their citation IDs, using Charles Li’s aligner from Saktumiva. This only reads your transcriptions. A block whose text has not changed keeps its table.'),
      U.el('div', { class: 'nv-head' },
        works.length > 1 ? U.el('label', null, 'Work ', pick) : null,
        U.el('label', null, 'Align by ', tok),
        go, again,
        U.el('button', { class: 'btn small', disabled: ![...summaries.values()].some((s) => s.work === workId), title: 'Replace this work’s tables with an alignment made elsewhere', onclick: () => CollateView.importInto(ed, list, workId, summaries, redraw) }, 'Import alignment…'),
        U.el('button', { class: 'btn small', disabled: ![...summaries.values()].some((s) => s.work === workId), title: 'The edited text of the whole work, its apparatus, checks, search, and TEI', onclick: () => CollateView.workApparatus(ed, list, workId) }, 'Edited text and apparatus…'),
        U.el('button', { class: 'btn small', disabled: ![...summaries.values()].some((s) => s.work === workId), title: 'Agreement, trees, your stemma and what contradicts it', onclick: () => ME.StemmaView.open(ed, list, workId) }, 'Stemmatics…'),
        ed.works.length > 1 ? U.el('button', { class: 'btn small', title: 'Which block of this work comments on which block of its base text', onclick: () => ME.LayersView.links(ed, list, workId) }, 'Links to the base text…') : null),
      trustLine,
      progress,
      ids.length ? U.el('div', { class: 'ed-scroll cv-units' }, U.el('table', { class: 'ed-table' },
        U.el('thead', null, U.el('tr', null, ['Sample', 'Citation ID', '', 'Rows', 'Words', 'Words that differ', 'Ties', 'Corrections', 'Aligner against your reading'].map((h) => U.el('th', { title: h === 'Aligner against your reading' ? 'In blocks you have marked as read: of the letters you have in one column, how many the aligner had there too' : h === 'Ties' ? 'Places where witnesses tie, so your trust order decides' : null }, h)))),
        U.el('tbody', null, rows))) : U.el('p', { class: 'help' }, 'This work has no citation IDs yet, so there is nothing to collate. Mark paragraphs and verses in the witnesses, with the same xml:id across witnesses.'),
      fold);
  };

  CollateView.collate = async function (ed, list, workId, box, button, redraw, force) {
    if (CollateView.running) { U.toast('A collation is already running'); return; }
    ME.App.flush();
    const ctl = new AbortController();
    CollateView.running = ctl;
    const text = U.el('span', null, 'Reading the witnesses…');
    const bar = U.el('progress', { max: 1, value: 0 });
    box.innerHTML = '';
    box.append(bar, ' ', text, ' ', U.el('button', { class: 'btn small', onclick: () => ctl.abort() }, 'Cancel'));
    box.hidden = false;
    button.disabled = true;
    let at = 0, total = 1, id = '';
    const started = performance.now();
    let longNote = '';
    const show = (f) => { bar.value = (at + (f || 0)) / total; text.textContent = 'Block ' + (at + 1) + ' of ' + total + ': ' + id + longNote; };
    try {
      const fresh = await loadFresh(list);
      const res = await Collate.run(ed, fresh, workId, {
        force, signal: ctl.signal,
        onUnit: (i, n, u) => { at = i; total = n; id = u; longNote = ''; show(0); },
        onEstimate: (secs) => { longNote = secs >= 60 ? ' (a long block: perhaps ' + Math.round(secs / 60) + ' min. Marking smaller citation IDs would shorten this.)' : ''; show(0); },
        onProgress: show,
      });
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      const bits = [res.done.length + ' block(s) aligned', res.kept.length + ' unchanged'];
      if (res.removed.length) bits.push(res.removed.length + ' no longer in any witness, removed');
      if (res.reviewed) bits.push(res.reviewed + ' locked passage(s) to review, because their text changed');
      const worry = res.outside.reduce((a, x) => a + x.chars, 0);
      U.toast(bits.join(', ') + ' in ' + secs + ' s.' + (worry ? ' Text outside any citation ID was left out.' : ''), worry || res.skipped.length || res.reviewed ? 'warn' : 'ok', 6000);
    } catch (e) {
      if (e.cancelled) U.toast('Stopped. Blocks already aligned are kept.', 'warn', 4000);
      else U.toast('Collation stopped: ' + e.message, 'err', 8000);
    } finally {
      CollateView.running = null;
      redraw();
    }
  };

  // the screen may have been open while a witness was edited in another tab
  async function loadFresh(list) {
    const out = [];
    for (const x of list) {
      const p = await Store.getProject(x.w.projectId);
      out.push({ w: x.w, p: p ? ME.Model.upgrade(p) : null });
    }
    return out;
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = U.el('input', { type: 'file', accept });
      inp.addEventListener('change', () => resolve(inp.files[0] || null));
      inp.click();
    });
  }

  CollateView.importInto = async function (ed, list, workId, summaries, redraw) {
    const ids = [...summaries.values()].filter((s) => s.work === workId).map((s) => s.unit);
    const sel = U.el('select', null, ids.map((id) => U.el('option', { value: id }, id)));
    const ok = await UI.modal({
      title: 'Import an alignment',
      body: U.el('div', null,
        U.el('p', { class: 'confirm-text' }, 'A file saved by Saktumiva, a CollateX JSON table, or a TEI corpus from Manuscribe. It must spell this block’s text, so that every reading keeps its place in the manuscript. Anything else is refused.'),
        U.el('label', { class: 'field' }, U.el('span', null, 'Which block?'), sel)),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Choose a file…', value: true, kind: 'primary' }],
    });
    if (!ok) return;
    const file = await pickFile('.json,.xml,application/json,application/xml,text/xml');
    if (!file) return;
    const rec = await Store.getCollation(Collate.keyOf(ed.id, workId, sel.value));
    try {
      const text = await file.text();
      if ((rec.table.ops || []).length && !(await UI.confirm('This replaces the ' + rec.table.ops.length + ' correction(s) you made to ' + sel.value + '. Continue?', { ok: 'Replace', danger: true }))) return;
      const table = Collate.fromFile(rec.table, text);
      await Collate.saveImported(ed, await loadFresh(list), table);
      U.toast('Imported the alignment of ' + sel.value + '.', 'ok', 4000);
      redraw();
    } catch (e) {
      U.toast('Not imported: ' + e.message, 'err', 8000);
    }
  };

  /* ---------- the apparatus ---------- */

  // Settings, the apparatus itself, its checks and the search. tables: one or all of a work's tables.
  CollateView.apparatusView = function (ed, tables, redraw, goRef, witnesses, layered) {
    const A = ME.Apparatus;
    const s = A.settings(ed);
    const built = tables.map((t) => Object.assign({ table: t }, A.entries(ed, t)));
    const set = async (k, v) => { ed.apparatus = Object.assign({}, ed.apparatus, { [k]: v }); await Edition.save(ed); redraw(); };
    const sel = (k, label, opts) => U.el('label', null, label + ' ', U.el('select', { onchange: (e) => set(k, e.target.value) }, opts.map(([v, t]) => U.el('option', { value: v, selected: String(s[k]) === String(v) }, t))));
    const tick = (k, label) => U.el('label', null, U.el('input', { type: 'checkbox', checked: !!s[k], onchange: (e) => set(k, e.target.checked) }), ' ' + label);
    const ab = A.abbr(ed);
    const abbrFields = ['om', 'add', 'post', 'transp', 'lac', 'ac', 'em', 'conj', 'deest'];
    const abbrBox = U.el('div', { class: 'ap-abbr' }, abbrFields.map((k) => U.el('label', null, k + ' ', U.el('input', { type: 'text', value: ab[k], 'aria-label': 'Abbreviation for ' + k, onchange: (e) => set('custom', Object.assign({}, s.custom, { [k]: e.target.value })) }))));
    const settings = U.el('details', { class: 'nv-fold' }, U.el('summary', null, 'How the apparatus is written'),
      U.el('div', { class: 'nv-head' },
        sel('polarity', 'Polarity', [['auto', 'negative, positive where few have the lemma'], ['negative', 'negative'], ['positive', 'positive']]),
        sel('abbr', 'Abbreviations', Object.entries(A.ABBREVIATIONS).map(([k, v]) => [k, v.name])),
        tick('groups', 'Group sigla for whole groups'), tick('deest', 'Say which members of a group are lacking'),
        tick('singular', 'Singular readings apart'), tick('orthographica', 'List spelling variants')),
      U.el('p', { class: 'help' }, 'Abbreviations, which you can write in any language or script:'), abbrBox,
      U.el('p', { class: 'help' }, 'Groups are the Group of each witness in the witness list. A group siglum stands for a group only where all its witnesses that can be read agree.'));
    const list = U.el('div', { class: 'ap-list' });
    for (const b of built) {
      const { variants, singular, orthographica, testimonia } = A.tiers(ed, b.entries);
      // the edited text, with each word that has an entry linked to it
      const shown = new Set([...variants, ...singular, ...orthographica, ...testimonia]);
      const linkOf = (e) => b.table.unit + '|' + e.fromId;
      const byFrom = new Map(b.entries.filter((e) => shown.has(e)).map((e) => [e.fromId, e]));
      let html = '';
      for (const u of b.proposal.units) {
        const e = byFrom.get(u.fromId);
        const t = U.escXml(u.text);
        if (!e) { html += t; continue; }
        const lead = (u.text.match(/^\s*/) || [''])[0], tail = (u.text.match(/\s*$/) || [''])[0];
        const core = u.text.trim() ? U.escXml(u.text.trim()) : '<span class="ct-om">⌀</span>';
        html += U.escXml(lead) + '<span class="ap-u" data-link="' + U.escAttr(linkOf(e)) + '" title="' + U.escAttr(e.ref) + '">' + core + '</span>' + U.escXml(tail);
      }
      // the base text this block comments on
      const link = layered && layered.links.find((l) => l.unit === b.table.unit);
      const baseText = link ? link.base.map((x) => layered.texts[x]).filter(Boolean) : [];
      list.append(U.el('h3', null, b.table.unit), baseText.length ? U.el('blockquote', { class: 'ap-base', title: layered.title + ' ' + link.base.join(', ') }, baseText.join(' ')) : null, U.el('p', { class: 'ap-text', html: html.trim() }));
      const entry = (e) => U.el('li', { class: e.review ? 'ap-bad' : e.decision ? 'ap-decided' : '', dataset: { link: linkOf(e) } }, U.el('button', { class: 'link', title: 'Show this place', onclick: () => goRef && goRef(e) }, e.ref), ' ', U.el('span', { class: 'ap-entry', html: U.escXml(A.format(ed, e)).replace(/&lt;sup&gt;/g, '<sup>').replace(/&lt;\/sup&gt;/g, '</sup>') }));
      if (variants.length) list.append(U.el('ul', { class: 'ap-entries' }, variants.map(entry)));
      if (singular.length) list.append(U.el('div', { class: 'ap-tier' }, 'Singular readings'), U.el('ul', { class: 'ap-entries' }, singular.map(entry)));
      if (orthographica.length) list.append(U.el('div', { class: 'ap-tier' }, 'Spelling variants'), U.el('ul', { class: 'ap-entries' }, orthographica.map((e) => U.el('li', { dataset: { link: linkOf(e) } }, e.ref + ' ' + e.lemma + ' ] ' + e.orth.map((o) => o.text + ' ' + o.wits.join(' ')).join('; ')))));
      if (testimonia.length) list.append(U.el('div', { class: 'ap-tier' }, 'Testimonia'), U.el('ul', { class: 'ap-entries' }, testimonia.map((e) => U.el('li', { dataset: { link: linkOf(e) } }, e.ref + ' ' + (e.lemma || '⌀') + ' ] ' + e.testimonia.map(ME.Layers.formatEvidence).join('; ')))));
      if (b.stars.length) list.append(U.el('div', { class: 'ap-tier' }, 'Additional passages'), U.el('ul', { class: 'ap-entries' }, b.stars.map((x) => U.el('li', null, x.id + ' (' + x.wits.join(' ') + '): ' + x.text))));
    }
    // pointing at a word lights up its entry, and pointing at an entry lights up its words
    let lit = null;
    const light = (link) => {
      if (lit === link) return;
      for (const el of list.querySelectorAll('.ap-hl')) el.classList.remove('ap-hl');
      lit = link;
      if (link) for (const el of list.querySelectorAll('[data-link="' + CSS.escape(link) + '"]')) el.classList.add('ap-hl');
    };
    list.addEventListener('mouseover', (ev) => { const el = ev.target.closest('[data-link]'); light(el ? el.dataset.link : null); });
    list.addEventListener('mouseleave', () => light(null));
    list.addEventListener('click', (ev) => {
      const w = ev.target.closest('.ap-u');
      if (!w) return;
      const li = list.querySelector('li[data-link="' + CSS.escape(w.dataset.link) + '"]');
      if (li) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); li.classList.add('ap-flash'); setTimeout(() => li.classList.remove('ap-flash'), 900); }
    });
    const problems = built.flatMap((b) => A.validate(ed, b.table, b));
    const errors = problems.filter((p) => p.level === 'error');
    const checks = U.el('details', { class: 'nv-fold', open: errors.length > 0 }, U.el('summary', null, errors.length ? errors.length + ' problem(s) in the apparatus' + (problems.length > errors.length ? ', ' + (problems.length - errors.length) + ' place(s) to look at' : '') : problems.length ? '✓ No problems; ' + problems.length + ' place(s) to look at' : '✓ The apparatus passes every check'),
      U.el('p', { class: 'help' }, 'Checked: each witness cited once in each entry; no unknown siglum; group sigla stand for exactly the witnesses they replace; each lemma is the edited text, with a witness unless it is an emendation; no witness cited where its text is lost; decisions that need review.'),
      U.el('ul', { class: 'ap-problems' }, problems.map((p) => U.el('li', { class: p.level }, U.el('span', { class: 'ed-tag ' + (p.level === 'error' ? 'bad' : 'warn') }, p.level === 'error' ? 'problem' : 'look'), ' ', p.ref + ': ' + p.text))));
    // which witnesses agree against which
    const sigla = ed.witnesses.map((w) => w.siglum);
    const pickBox = (name) => U.el('span', { class: 'ap-pick' }, sigla.map((x) => U.el('label', null, U.el('input', { type: 'checkbox', value: x, name }), ' ' + x)));
    const withBox = pickBox('with'), againstBox = pickBox('against');
    const found = U.el('ul', { class: 'ap-entries' });
    const search = U.el('details', { class: 'nv-fold' }, U.el('summary', null, 'Find where witnesses agree against others'),
      U.el('div', { class: 'nv-head' }, U.el('span', null, 'These agree:'), withBox),
      U.el('div', { class: 'nv-head' }, U.el('span', null, 'against:'), againstBox,
        U.el('button', { class: 'btn small primary', onclick: () => {
          const w = [...withBox.querySelectorAll('input:checked')].map((i) => i.value), g = [...againstBox.querySelectorAll('input:checked')].map((i) => i.value);
          found.innerHTML = '';
          if (!w.length) { found.append(U.el('li', { class: 'help' }, 'Tick at least one witness that agrees.')); return; }
          const res = A.agreements(ed, built, w, g);
          found.append(U.el('li', { class: 'help' }, res.length + ' place(s). Places where any of them is lost are left out.'), ...res.map((r) => U.el('li', null, U.el('button', { class: 'link', onclick: () => goRef && goRef(r.entry) }, r.ref), ' ', r.reading || '(omits)', ' — ' + A.format(ed, r.entry).replace(/<\/?sup>/g, ''))));
        } }, 'Find')), found);
    const version = U.el('input', { type: 'text', value: ed.version || '', placeholder: 'e.g. 1.0, or empty for a dated draft', 'aria-label': 'Version of the edition', onchange: async () => { ed.version = version.value.trim() || undefined; await Edition.save(ed); redraw(); } });
    const editor = U.el('input', { type: 'text', value: ed.editor || '', placeholder: 'your name', 'aria-label': 'Editor', onchange: async () => { ed.editor = editor.value.trim() || undefined; await Edition.save(ed); redraw(); } });
    const base = fileSafe(ed.title || 'edition');
    const publish = U.el('div', { class: 'ap-publish' },
      U.el('h3', null, 'Publish'),
      U.el('p', { class: 'help' }, 'Every output carries this citation: ', U.el('em', null, ME.Publish.citation(ed))),
      U.el('div', { class: 'nv-head' }, U.el('label', null, 'Edited by ', editor), U.el('label', null, 'Version ', version)),
      U.el('div', { class: 'nv-head' },
        U.el('button', { class: 'btn small primary', title: 'One HTML file that works offline: the edited text, its apparatus, the text of each witness, and a draft for printing', onclick: async () => download(base + '.reader.html', await ME.Publish.reader(ed, witnesses || [], built, layered), 'text/html') }, 'Reader (one HTML file)'),
        U.el('button', { class: 'btn small primary', title: 'The print edition as a PDF, typeset here in the browser: nothing to install', onclick: async (ev) => {
          const btn = ev.currentTarget; btn.disabled = true; const was = btn.textContent; btn.textContent = 'Typesetting…';
          try { const r = await ME.Typeset.pdf(ed, witnesses || [], built); U.download(base + '.pdf', r.blob); U.toast('PDF of ' + r.pages + ' page(s)' + (r.overfull ? '; ' + r.overfull + ' page(s) with more notes than fit' : ''), r.overfull ? 'warn' : 'ok'); } catch (e) { U.toast('No PDF: ' + e.message, 'err', 8000); }
          btn.disabled = false; btn.textContent = was;
        } }, 'Print edition (PDF)'),
        U.el('button', { class: 'btn small', title: 'A reledmac file for XeLaTeX, with its font, to typeset on your computer or on Overleaf', onclick: async () => download(base + '.latex.zip', await ME.Zip.write(await ME.Publish.texFiles(ed, witnesses || [], built)), 'application/zip') }, 'Print edition (LaTeX)')),
      U.el('p', { class: 'help' }, 'The PDF is typeset here, in the browser, with the text shaped by HarfBuzz in the edition’s font: the text with numbered lines, and the apparatus of each page at its foot. For the finest print, the LaTeX folder runs on XeLaTeX with reledmac: run xelatex three times, or upload it to Overleaf.'));
    const exports = U.el('div', { class: 'nv-head' },
      U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.edition.xml', A.tei(ed, built, ed.works.find((k) => k.id === (tables[0] && tables[0].work))), 'application/xml') }, 'Save as TEI'),
      U.el('button', { class: 'btn small', onclick: () => download(fileSafe(ed.title || 'edition') + '.apparatus.txt', A.text(ed, built), 'text/plain') }, 'Save as text'),
      ME.DTS ? U.el('button', { class: 'btn small', title: 'The edition as static files in the shape of the Distributed Text Services API 1.0', onclick: async () => { const work = ed.works.find((k) => k.id === (tables[0] && tables[0].work)); download(fileSafe(ed.title || 'edition') + '.dts.zip', await ME.Zip.write(ME.DTS.files(ed, [{ work, built }])), 'application/zip'); } }, 'Save for DTS') : null);
    return U.el('div', null, settings, checks, list, search, ...(ME.LayersView ? ME.LayersView.folds(ed, built, witnesses, redraw) : []), exports, publish);
  };

  CollateView.workApparatus = async function (ed, list, workId) {
    const recs = (await Store.listCollations(ed.id)).filter((r) => r.work === workId);
    const order = Edition.register(ed, list)[workId];
    const ids = order ? order.order : [];
    recs.sort((a, b) => ids.indexOf(a.unit) - ids.indexOf(b.unit));
    if (!recs.length) { U.toast('Collate first', 'warn'); return; }
    const body = U.el('div', { class: 'cv-view' });
    const layered = ME.LayersView ? await ME.LayersView.baseTexts(ed, workId) : null;
    const draw = () => { body.innerHTML = ''; body.append(CollateView.apparatusView(ed, recs.map((r) => ME.CollateEdit.ensure(r.table)), draw, null, list, layered)); };
    draw();
    await UI.modal({ title: 'Edited text and apparatus', body, wide: true, className: 'cv-modal', buttons: [{ label: 'Close', value: null }] });
  };

  /* ---------- the scan beside a reading ---------- */

  const Scan = { docs: new Map(), pages: new Map(), seq: 0 };

  async function scanDoc(p) {
    if (Scan.docs.has(p.id)) return Scan.docs.get(p.id);
    const blob = await Store.getPdf(p.id);
    if (!blob) return null;
    await ME.PdfView.ensureWorker();
    const task = window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    Scan.docs.set(p.id, task);
    if (Scan.docs.size > 3) {
      const [first] = Scan.docs.keys();
      Scan.docs.get(first).then((d) => d.destroy()).catch(() => {});
      Scan.docs.delete(first);
    }
    return task;
  }

  async function scanPage(p, pageNo) {
    const key = p.id + '/' + pageNo + '/' + ((p.ui && p.ui.rotation) || 0);
    if (Scan.pages.has(key)) return Scan.pages.get(key);
    const doc = await scanDoc(p);
    if (!doc) return null;
    const page = await doc.getPage(pageNo);
    // turned as the witness is shown, since its calibration was done that way
    const rotation = (p.ui && p.ui.rotation) || 0;
    const first = page.getViewport({ scale: 1, rotation });
    const scale = Math.min(4, 2400 / first.width);
    const view = page.getViewport({ scale, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = view.width;
    canvas.height = view.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
    Scan.pages.set(key, canvas);
    if (Scan.pages.size > 4) Scan.pages.delete(Scan.pages.keys().next().value);
    return canvas;
  }

  /* Puts the line a reading stands on into `host`. -> what it showed, for the tests and for telling the editor. */
  CollateView.showScan = async function (host, p, src) {
    const seq = ++Scan.seq;
    host.innerHTML = '';
    const note = (text) => { host.append(U.el('p', { class: 'help cv-scan-note' }, text)); return { shown: false, why: text }; };
    if (!p.pdf) return note('This witness has no PDF.');
    if (!window.pdfjsLib) return note('The PDF reader is not available.');
    const entry = ME.Model.entries(p).find((e) => e.label === src.folio);
    if (!entry) return note('Folio ' + src.folio + ' is not in the present numbering of this witness.');
    let page;
    try { page = await scanPage(p, entry.pdfPage); } catch (e) { return note('The PDF could not be read: ' + e.message); }
    if (seq !== Scan.seq) return { shown: false, why: 'superseded' };
    if (!page) return note('This witness’s PDF is not stored in this browser. Relink PDFs to see the scan here.');
    const rect = ME.Model.lineRect(p, entry, src.box, src.line);
    const regions = ME.Model.regions(p, entry);
    const leaf = (regions && regions.leaf) || ME.Model.defaultLeaf(entry);
    const area = rect ? [Math.max(0, rect[0] - 0.015), Math.max(0, rect[1] - rect[3] * 1.2), Math.min(1, rect[2] + 0.03), rect[3] * 3.4] : leaf;
    const sw = area[2] * page.width, sh = Math.min(area[3], 1 - area[1]) * page.height;
    const width = Math.max(320, host.clientWidth || 900);
    const canvas = U.el('canvas', { class: 'cv-scan', width: Math.round(width), height: Math.round((width * sh) / sw) });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(page, area[0] * page.width, area[1] * page.height, sw, sh, 0, 0, canvas.width, canvas.height);
    if (rect) {
      const k = canvas.width / sw;
      ctx.fillStyle = 'rgba(255, 196, 0, .22)';
      ctx.fillRect((rect[0] * page.width - area[0] * page.width) * k, (rect[1] * page.height - area[1] * page.height) * k, rect[2] * page.width * k, rect[3] * page.height * k);
    }
    host.append(canvas);
    if (!rect) host.append(U.el('p', { class: 'help cv-scan-note' }, 'This folio is not calibrated, so the whole leaf is shown. Calibrate it in the witness to see just the line.'));
    return { shown: true, line: !!rect, rect, area, canvas: [canvas.width, canvas.height] };
  };

  /* ---------- the table ---------- */

  const escHtml = (s) => U.escXml(String(s));
  const STATE_SHORT = { om: 'om', lac: 'lac', illeg: 'ill', na: 'n/a', ambig: '?' };
  const lower = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };

  function buildTable(table, host, ui, state) {
    const E = ME.CollateEdit;
    const absent = table.absent || [];
    const cw = WIDTH[table.params.tokens] || WIDTH.letter;
    const nrows = table.order.length + absent.length;
    const scroller = U.el('div', { class: 'cv-scroller', tabindex: '0', role: 'grid', 'aria-label': 'Collation table of ' + table.unit + '. Arrow keys move; Alt and an arrow moves the reading.' });
    const inner = U.el('div', { class: 'cv-inner' });
    const head = U.el('div', { class: 'cv-row cv-head' }, U.el('div', { class: 'cv-label' }, ''), U.el('div', { class: 'cv-cells' }));
    const rowEls = table.order.map((label) => {
      const st = table.states[label];
      return U.el('div', { class: 'cv-row', dataset: { label } }, U.el('div', { class: 'cv-label', title: st.layer === 'ac' ? 'Before correction' : st.layer === 'pc' ? 'After correction' : '' }, label), U.el('div', { class: 'cv-cells' }));
    });
    const absentEls = absent.map((a) => U.el('div', { class: 'cv-row cv-absent' }, U.el('div', { class: 'cv-label' }, a.siglum), U.el('div', { class: 'cv-absent-note' }, ABSENT[a.state] || a.state)));
    inner.append(head, ...rowEls, ...absentEls);
    scroller.append(inner);
    host.innerHTML = '';
    host.append(scroller);

    let grid, variant, locks, cuts, linked;
    const measure = () => {
      grid = Collate.grid(table);
      variant = Collate.variantColumns(table, grid);
      locks = E.lockMap(table);
      cuts = E.cutMap(table);
      linked = E.linked(table);
      inner.style.width = LABEL + table.ncols * cw + 'px';
      inner.style.height = ROW * (nrows + 1) + 'px';
      state.count = variant.reduce((a, b) => a + b, 0);
    };

    const paint = () => {
      const first = Math.max(0, Math.floor((scroller.scrollLeft - LABEL) / cw) - BUFFER);
      const last = Math.min(table.ncols, Math.ceil((scroller.scrollLeft + scroller.clientWidth) / cw) + BUFFER);
      const pos = (c) => 'left:' + c * cw + 'px;width:' + cw + 'px';
      let h = '';
      for (let c = first; c < last; c++) {
        const mark = (c + 1) % 10 === 0;
        h += '<div class="cv-col' + (variant[c] ? ' v' : '') + (locks[c] === 2 ? ' lk2' : locks[c] ? ' lk1' : '') + (cuts[c] ? ' cut' : '') + '" style="' + pos(c) + '">' + (mark ? c + 1 : '') + '</div>';
      }
      head.lastChild.innerHTML = h;
      const sel = state.sel;
      table.order.forEach((label, r) => {
        const st = table.states[label];
        const g = grid[r];
        const row = table.cells[label];
        const link = linked[label];
        let out = '';
        for (let c = first; c < last; c++) {
          const k = g[c];
          let cls = 'cv-cell';
          let text = '';
          const cellState = row ? row[table.colIds[c]] : null;
          if (k < 0) {
            cls += ' blank';
            if (cellState) { cls += ' st-' + cellState; text = STATE_SHORT[cellState]; }
          } else {
            const tok = st.n[k];
            if (tok === Norm.GAP) { cls += ' gap'; text = Norm.GAP; }
            else if (state.show === 'dip') {
              const from = st.from[k], to = k + 1 < st.from.length ? st.from[k + 1] : st.dip.length;
              const t = st.dip.slice(from, to).trim();
              text = t || '·';
              cls += ' dip' + (t ? '' : ' implied');
            } else text = tok;
            if (st.rules[k] && st.rules[k].some((x) => !['spaces', 'punct', 'verse-number'].includes(x))) cls += ' by-rule';
            if (st.flags[k] && st.flags[k].includes('unclear')) cls += ' unclear';
            if (cellState) cls += ' st-' + cellState;
          }
          if (variant[c]) cls += ' v';
          if (locks[c]) cls += ' lk';
          if (cuts[c]) cls += ' cut';
          if (link && link.has(c)) cls += ' linked';
          if (sel && sel.r === r && c >= sel.c1 && c <= sel.c2) cls += ' sel';
          out += '<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '" style="' + pos(c) + '">' + escHtml(text) + '</div>';
        }
        rowEls[r].lastChild.innerHTML = out;
      });
    };
    let queued = false;
    const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); };
    scroller.addEventListener('scroll', queue);

    const reveal = (c) => {
      const left = c * cw, right = left + cw, viewL = scroller.scrollLeft, viewR = viewL + scroller.clientWidth - LABEL;
      if (left < viewL) scroller.scrollLeft = left; else if (right > viewR) scroller.scrollLeft = right - (scroller.clientWidth - LABEL);
    };
    const select = (r, c1, c2, keepDetail) => {
      const a = Math.max(0, Math.min(c1, c2)), z = Math.min(table.ncols - 1, Math.max(c1, c2));
      state.sel = { r, c1: a, c2: z, anchor: c1 };
      if (!keepDetail) ui.detail();
      ui.buttons();
      paint();
    };
    scroller.addEventListener('click', (e) => {
      const cell = e.target.closest('.cv-cell');
      if (!cell) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (e.shiftKey && state.sel && state.sel.r === r) select(r, state.sel.anchor, c);
      else select(r, c, c);
      scroller.focus({ preventScroll: true });
    });
    scroller.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ui.redo(); else ui.undo(); return; }
      if (mod) return;
      const k = e.key;
      if (!state.sel && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) { select(0, Math.max(0, Math.floor(scroller.scrollLeft / cw)), Math.max(0, Math.floor(scroller.scrollLeft / cw))); e.preventDefault(); return; }
      const s = state.sel;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        const d = k === 'ArrowRight' ? 1 : -1;
        if (e.altKey) { ui.move(d); return; }
        if (e.shiftKey) { const end = (s.anchor === s.c1 ? s.c2 : s.c1) + d; select(s.r, s.anchor, Math.max(0, Math.min(table.ncols - 1, end))); reveal(end); return; }
        const c = Math.max(0, Math.min(table.ncols - 1, (d > 0 ? s.c2 : s.c1) + d));
        select(s.r, c, c); reveal(c);
      } else if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        select(Math.max(0, Math.min(table.order.length - 1, s.r + (k === 'ArrowDown' ? 1 : -1))), s.c1, s.c2);
      } else if (!e.altKey && !e.shiftKey && ui.keys[k.toLowerCase()]) {
        e.preventDefault();
        ui.keys[k.toLowerCase()]();
      }
    });

    state.jump = (dir) => {
      const here = state.sel ? (dir > 0 ? state.sel.c2 : state.sel.c1) : Math.floor((scroller.scrollLeft + 1) / cw);
      let c = here + dir;
      // from the end of one run of differing columns to the start of the next
      while (c >= 0 && c < table.ncols && variant[c] && variant[c - dir]) c += dir;
      while (c >= 0 && c < table.ncols && !variant[c]) c += dir;
      if (c >= 0 && c < table.ncols) {
        scroller.scrollLeft = Math.max(0, c * cw - 3 * cw);
        select(state.sel ? state.sel.r : 0, c, c);
      }
    };
    state.goTo = (c1, c2, label) => {
      const r = Math.max(0, label ? table.order.indexOf(label) : (state.sel ? state.sel.r : 0));
      scroller.scrollLeft = Math.max(0, c1 * cw - 3 * cw);
      select(r, c1, Math.max(c1, Math.min(c1 + 60, c2)));
    };
    state.repaint = paint;
    state.refresh = () => {
      measure();
      if (state.sel) {
        state.sel.c1 = Math.min(state.sel.c1, table.ncols - 1);
        state.sel.c2 = Math.min(state.sel.c2, table.ncols - 1);
      }
      paint();
    };
    state.gridNow = () => grid;
    state.scroller = scroller;
    measure();
    paint();
  }

  const placeLine = (s) => s.folio + ' · ' + (s.box === 'main' ? 'main text' : s.box) + ' · line ' + (s.line + 1);

  CollateView.open = async function (ed, list, workId, unit, redraw) {
    const E = ME.CollateEdit;
    const rec = await Store.getCollation(Collate.keyOf(ed.id, workId, unit));
    if (!rec) { U.toast('That table is no longer here', 'warn'); return; }
    const table = E.ensure(rec.table);
    const body = U.el('div', { class: 'cv-view' });
    const host = U.el('div', { class: 'cv-host' });
    const detailBox = U.el('div', { class: 'cv-detail' }, 'Click a cell to see its reading and its place in the manuscript. Shift and click selects several.');
    const scanBox = U.el('div', { class: 'cv-scanbox' });
    const unitBox = U.el('div', { class: 'cv-unitbox' });
    const state = { show: 'n', sel: null, linkA: null };

    let saving = null;
    const saveNow = async () => { if (saving) { clearTimeout(saving); saving = null; } await Collate.saveTable(ed, rec); };
    const saveSoon = () => { if (saving) clearTimeout(saving); saving = setTimeout(() => { saving = null; Collate.saveTable(ed, rec); }, 600); };

    const status = U.el('span', { class: 'help cv-count' });
    const showStatus = () => {
      const bits = [];
      if (state.mode === 'text') {
        const c = text.proposal ? text.proposal.count : null;
        if (c) bits.push(c.words + ' words · ' + c.differ + ' differ: ' + c.majority + ' by majority' + (c.plurality ? ', ' + c.plurality + ' by most votes' : '') + ', ' + c.trust + ' by your trust order' + (c.chosen ? ', ' + c.chosen + ' chosen by you' : '') + (c.decided ? ' · ' + c.decided + ' decision(s)' : '') + (c.review ? ' · ' + c.review + ' to review' : ''));
        if (text.proposal && text.proposal.orphaned.length) bits.push(text.proposal.orphaned.length + ' choice(s) no longer fit a word');
      } else bits.push(state.count + ' of ' + table.ncols + ' columns differ');
      if (table.ops.length) bits.push(table.ops.length + ' correction(s)');
      if (table.checked) {
        const acc = E.againstCorrections(table);
        bits.push('read through: the aligner had ' + (100 * acc.recall).toFixed(1) + '% as you have it');
      }
      status.textContent = bits.join(' · ');
    };

    const selTokens = () => {
      const s = state.sel;
      if (!s) return null;
      const label = table.order[s.r];
      const st = table.states[label];
      const k1 = lower(st.cols, s.c1), k2 = lower(st.cols, s.c2 + 1) - 1;
      return { label, st, k1, k2, any: k1 <= k2 };
    };

    const act = (op, then) => {
      try {
        E.perform(table, op);
      } catch (e) {
        U.toast(e.message, 'warn', 3500);
        return false;
      }
      if (state.refresh) state.refresh();
      if (then) then();
      after();
      return true;
    };
    const after = () => {
      saveSoon();
      text.render();
      showStatus();
      ui.buttons();
      if (state.refresh) { ui.detail(); places.refreshSoon(); }
    };

    const ui = { keys: {} };
    ui.move = (d) => {
      const x = selTokens();
      if (!x) { U.toast('Select a reading first'); return; }
      if (!x.any) { U.toast('There is nothing to move in the selected cells'); return; }
      const s = state.sel;
      if (act({ op: 'shift', label: x.label, k1: x.k1, k2: x.k2, delta: d })) {
        // the selection stays on the reading, wherever it now stands
        const a = x.st.cols[x.k1];
        state.sel = { r: s.r, c1: a, c2: x.st.cols[x.k2], anchor: a };
        state.repaint();
        ui.detail();
        ui.buttons();
      }
    };
    ui.merge = () => {
      const s = state.sel;
      if (!s) { U.toast('Select a column first'); return; }
      act({ op: 'merge', at: table.colIds[s.c1] });
    };
    ui.split = () => {
      const s = state.sel;
      if (!s) { U.toast('Select the witness to set apart'); return; }
      act({ op: 'split', at: table.colIds[s.c1], labels: [table.order[s.r]] });
    };
    ui.swap = () => {
      const s = state.sel;
      if (!s) { U.toast('Select a column first'); return; }
      act({ op: 'swap', at: table.colIds[s.c1] });
    };
    ui.setState = (v) => {
      const s = state.sel;
      if (!s) { U.toast('Select the cells first'); return; }
      act({ op: 'state', label: table.order[s.r], from: table.colIds[s.c1], to: table.colIds[s.c2], state: v || null });
    };
    ui.cut = () => {
      const s = state.sel;
      if (!s) { U.toast('Select a column first'); return; }
      const cuts = E.cutMap(table);
      act({ op: 'cut', at: table.colIds[s.c1], on: !cuts[s.c1] });
    };
    ui.lock = () => {
      const s = state.sel;
      if (!s) { U.toast('Select the columns first'); return; }
      const m = E.lockMap(table);
      let manual = false; // what you corrected is locked lightly, and can still be changed; this is the firm kind
      for (let c = s.c1; c <= s.c2; c++) if (m[c] === 2) manual = true;
      act({ op: manual ? 'unlock' : 'lock', from: table.colIds[s.c1], to: table.colIds[s.c2] });
    };
    ui.transpose = () => {
      const s = state.sel;
      if (!s) { U.toast('Select one of the two passages first'); return; }
      const here = { label: table.order[s.r], from: table.colIds[s.c1], to: table.colIds[s.c2] };
      if (!state.linkA) {
        state.linkA = here;
        U.toast('Now select the other place, in the same row, and click Transposition again', 'ok', 5000);
        ui.buttons();
        return;
      }
      const a = state.linkA;
      state.linkA = null;
      if (a.label !== here.label) { U.toast('Both places must be in the same witness', 'warn'); ui.buttons(); return; }
      act({ op: 'link', label: a.label, a: [a.from, a.to], b: [here.from, here.to] });
    };
    ui.undo = () => { const op = E.undo(table); if (!op) { U.toast('Nothing to undo'); return; } if (state.refresh) state.refresh(); U.toast('Undid: ' + E.opName(op)); after(); };
    ui.redo = () => { const op = E.redo(table); if (!op) { U.toast('Nothing to redo'); return; } if (state.refresh) state.refresh(); U.toast('Redid: ' + E.opName(op)); after(); };
    ui.checked = () => { act({ op: 'check', on: !table.checked }); };
    ui.reset = async () => {
      if (!table.ops.length) { U.toast('There are no corrections to take back'); return; }
      if (!(await UI.confirm('Take back all ' + table.ops.length + ' correction(s) to this block, including its locks? This cannot be undone.', { ok: 'Take back', danger: true }))) return;
      E.reset(table);
      if (state.refresh) state.refresh();
      after();
    };
    Object.assign(ui.keys, { m: ui.merge, s: ui.split, w: ui.swap, l: ui.lock, b: ui.cut, t: ui.transpose, n: () => state.jump(1), p: () => state.jump(-1) });

    ui.detail = () => {
      if (!state.gridNow) return;
      detailBox.innerHTML = '';
      unitBox.innerHTML = '';
      const s = state.sel;
      if (!s) return;
      const label = table.order[s.r];
      const st = table.states[label];
      const g = state.gridNow();
      const k = g[s.r][s.c1];
      const cellState = E.stateOf(table, label, table.colIds[s.c1]);
      if (k < 0) {
        detailBox.append(U.el('strong', null, label), ' has nothing in this column', cellState ? ': ' + E.STATES[cellState] : '. An empty cell counts as an omission unless you say otherwise.');
        scanBox.innerHTML = '';
      } else {
        const tok = Collate.token(st, k);
        const src = tok.src.filter((x) => x.folio);
        const why = tok.rules.map((r) => Norm.rule(r)).filter(Boolean).map((r) => r.name);
        const tags = tok.flags.map((f) => f.replace(/^ignored:/, 'not compared: '));
        detailBox.append(U.el('strong', null, label), ' ',
          U.el('span', { class: 'cv-t' }, tok.t.trim() || '(no letter of its own)'), ' → ', U.el('code', null, tok.n),
          src.length ? ' · ' + placeLine(src[0]) : '',
          why.length ? ' · ' + why.join(', ') : '', tags.length ? ' · ' + tags.join(', ') : '', cellState ? ' · ' + E.STATES[cellState] : '');
        const x = list.find((y) => y.w.siglum === st.siglum);
        if (src.length && x && x.p) {
          detailBox.append(' ', U.el('button', { class: 'btn small', onclick: () => state.go(st.siglum, src[0]) }, 'Go to this line'));
          state.scanResult = CollateView.showScan(scanBox, x.p, src[0]);
        } else scanBox.innerHTML = '';
      }
      // the readings of the variation unit this column is in
      const unitNow = E.units(table).find((u) => s.c1 >= u.from && s.c1 <= u.to);
      if (unitNow) {
        unitBox.append(U.el('div', { class: 'cv-unit-head' }, 'Readings in this unit (columns ' + (unitNow.from + 1) + '–' + (unitNow.to + 1) + ')'),
          U.el('ul', null, unitNow.readings.map((rd) => U.el('li', null, U.el('code', null, rd.n || '(nothing)'), ' ', rd.wits.join(' '))),
            unitNow.missing.map((m) => U.el('li', { class: 'muted' }, m.wit + ': ' + m.state))));
      }
    };

    const moveBtn = (d) => U.el('button', { class: 'btn small', title: 'Move the selected reading one column ' + (d < 0 ? 'left' : 'right') + ' (Alt+' + (d < 0 ? '←' : '→') + '). With no room, it gets a new column.', onclick: () => ui.move(d) }, d < 0 ? '◀ Move' : 'Move ▶');
    const stateSel = U.el('select', { 'aria-label': 'What the selected cells are', title: 'Say what the selected cells are', onchange: () => { const v = stateSel.value; stateSel.value = ''; if (v) ui.setState(v === 'clear' ? null : v); } },
      U.el('option', { value: '' }, 'Cell is…'), Object.entries(E.STATES).map(([k, t]) => U.el('option', { value: k }, t.split(':')[0])), U.el('option', { value: 'clear' }, 'Clear'));
    const lockBtn = U.el('button', { class: 'btn small', title: 'Lock the selected columns against change, or unlock them (L). Whatever you correct is locked against aligning again anyway.', onclick: () => ui.lock() }, 'Lock');
    const linkBtn = U.el('button', { class: 'btn small', title: 'Mark that a witness has a passage in another place: select one, click here, select the other, click again (T)', onclick: () => ui.transpose() }, 'Transposition');
    const undoBtn = U.el('button', { class: 'btn small', title: 'Undo (Ctrl or Cmd+Z)', onclick: () => ui.undo() }, 'Undo');
    const redoBtn = U.el('button', { class: 'btn small', title: 'Redo (Ctrl or Cmd+Shift+Z)', onclick: () => ui.redo() }, 'Redo');
    const checkBtn = U.el('button', { class: 'btn small', title: 'You have read this whole block against the witnesses. It locks the block, and measures how close the aligner came to your version.', onclick: () => ui.checked() }, 'Mark as read');
    ui.buttons = () => {
      undoBtn.disabled = !table.ops.length;
      redoBtn.disabled = !(table.redo && table.redo.length);
      checkBtn.textContent = table.checked ? '✓ Read through' : 'Mark as read';
      if (!state.gridNow) return;
      linkBtn.classList.toggle('primary', !!state.linkA);
      if (state.sel) {
        const m = E.lockMap(table);
        let any = false;
        for (let c = state.sel.c1; c <= state.sel.c2; c++) if (m[c] === 2) any = true;
        lockBtn.textContent = any ? 'Unlock' : 'Lock';
      }
    };

    /* ---------- word by word ---------- */
    const DECIDED = {
      selectio: 'You chose this reading.', emendatio: 'Your emendation.', conjecture: 'A conjecture.', lacuna: 'You marked the text as lost here.',
    };
    const SETTLED = {
      majority: 'Most witnesses read this.',
      plurality: 'More witnesses read this than any other reading, though not most of them.',
      trust: 'The witnesses tie here, so the reading of the most trusted one is proposed.',
      chosen: 'You chose this reading.',
      same: 'All the witnesses that can be read agree.',
    };
    const textBox = U.el('div', { class: 'ct-text', tabindex: '0', role: 'document', 'aria-label': 'Proposed text. N and P go to the next and previous difference; 1 to 9 choose a reading.' });
    const textPanel = U.el('div', { class: 'ct-panel' });
    const textScan = U.el('div', { class: 'cv-scanbox' });
    const filterSel = U.el('select', { 'aria-label': 'Which places to go through', onchange: () => { text.filter = filterSel.value; } },
      U.el('option', { value: 'differs' }, 'Every difference'), U.el('option', { value: 'trust' }, 'Only ties, settled by trust'), U.el('option', { value: 'open' }, 'Only those you have not chosen'));
    const text = {
      proposal: null, sel: null, filter: 'differs',
      render() {
        const P = E.proposal(table, Collate.trustOrder(ed));
        text.proposal = P;
        let h = '';
        P.units.forEach((u, i) => {
          const shown = escHtml(u.text);
          if (!u.others) { h += shown; return; }
          const dd = u.decision;
          const cls = 'ct-u ' + (u.review ? 'd-review' : dd ? 'd-decided d-' + dd.type : u.differs ? 'd-' + u.decided : 'd-lost') + (dd && dd.confidence === 'low' ? ' unsure' : '') + (text.sel && text.sel.fromId === u.fromId ? ' sel' : '');
          let inner = shown.trim() ? shown : '<span class="ct-om">⌀</span>' + shown;
          if (dd && dd.crux) inner = '†' + inner.replace(/(\s*)$/, '†$1');
          h += '<span class="' + cls + '" data-u="' + i + '">' + inner + '</span>';
        });
        textBox.innerHTML = h;
        if (text.sel) {
          const again = P.units.findIndex((u) => u.fromId === text.sel.fromId);
          if (again >= 0) text.choose(again, true); else { text.sel = null; textPanel.innerHTML = ''; }
        }
      },
      wanted(u) {
        if (!u.differs) return false;
        if (text.filter === 'trust') return u.decided === 'trust';
        if (text.filter === 'open') return u.decided !== 'chosen';
        return true;
      },
      jump(d) {
        const units = text.proposal.units;
        let i = text.sel ? units.findIndex((u) => u.fromId === text.sel.fromId) : (d > 0 ? -1 : units.length);
        for (i += d; i >= 0 && i < units.length; i += d) if (text.wanted(units[i])) { text.choose(i); return; }
        U.toast(d > 0 ? 'No more places after this one' : 'No more places before this one');
      },
      showScanOf(m) {
        const st = table.states[m.label];
        const k = m.k1 <= m.k2 ? m.k1 : Math.min(m.k1, st.n.length - 1);
        const x = list.find((y) => y.w.siglum === st.siglum);
        if (k < 0 || !x || !x.p) { textScan.innerHTML = ''; return; }
        const src = Collate.token(st, k).src.find((y) => y.folio);
        if (!src) { textScan.innerHTML = ''; return; }
        textScan.innerHTML = '';
        textScan.append(U.el('div', { class: 'help' }, m.label + ' · ' + placeLine(src) + ' ', U.el('button', { class: 'btn small', onclick: () => state.go(st.siglum, src) }, 'Go to this line')));
        const pic = U.el('div');
        textScan.append(pic);
        text.scanResult = CollateView.showScan(pic, x.p, src);
      },
      decide(u, extra) {
        const quote = {};
        for (const g of u.groups) for (const m of g.members) quote[m.label] = m.text;
        for (const m of u.missing) if (m.text) quote[m.label] = m.text;
        const cur = u.decision || {};
        const keep = extra.type === 'votes' ? {} : { reasons: cur.reasons, note: cur.note, confidence: cur.confidence, crux: cur.crux };
        return act(Object.assign({ op: 'decide', from: u.fromId, to: u.toId, quote, resp: ed.editor || undefined }, keep, extra));
      },
      choose(i, quiet) {
        const u = text.proposal.units[i];
        text.sel = u;
        for (const el of textBox.querySelectorAll('.ct-u.sel')) el.classList.remove('sel');
        const el = textBox.querySelector('[data-u="' + i + '"]');
        if (el) { el.classList.add('sel'); if (!quiet) el.scrollIntoView({ block: 'nearest' }); }
        textPanel.innerHTML = '';
        const winners = u.winner;
        // how each reading sits in the metre of the verse, if the block is verse
        const metreOf = (() => {
          if (!ME.Metre) return null;
          const whole = ME.Metre.identify(text.proposal.text);
          if (!whole.metre) return null;
          const fit = (reading) => ME.Metre.faultsIn(text.proposal.units.map((x, j) => (j === i ? reading : x.text)).join(''), whole.metre);
          return { metre: whole.metre, fit };
        })();
        const evs = ME.Layers ? ME.Layers.evidenceAt(ed, table.work, table.unit, u.key) : [];
        const support = ME.Layers ? ME.Layers.supportOf(evs) : { for: new Map(), other: [] };
        const rows = u.groups.map((g, gi) => {
          const n = metreOf ? metreOf.fit(g.form.text) : null;
          const backing = support.for.get(g.form.text.trim()) || [];
          const isWinner = g === winners;
          const members = g.members.map((m) => U.el('button', { class: 'link ct-wit', title: 'See this line in the scan', onclick: () => text.showScanOf(m) }, m.label + (m.layer === 'ac' ? ' (before correction)' : '')));
          return U.el('li', { class: isWinner ? 'win' : '' },
            U.el('button', { class: 'btn small' + (isWinner ? ' primary' : ''), title: 'Use this reading (' + (gi + 1) + ')', disabled: isWinner && u.decided === 'chosen', onclick: () => text.decide(u, { type: 'selectio', label: g.form.label }) }, isWinner ? '✓ ' + (gi + 1) : String(gi + 1)),
            ' ', U.el('span', { class: 'ct-reading' }, g.form.text.trim() || '(omits)'), ' ',
            U.el('span', { class: 'help' }, g.votes ? g.votes + ' vote' + (g.votes > 1 ? 's' : '') + ': ' : 'no vote: '), members,
            metreOf ? U.el('span', { class: 'ct-metre ' + (n === 0 ? 'ok' : 'bad'), title: 'The verse with this reading, in ' + metreOf.metre }, n === 0 ? ' metre ✓' : n === Infinity ? ' out of metre' : ' metre: ' + n + ' fault' + (n > 1 ? 's' : '')) : null,
            backing.length ? U.el('span', { class: 'ct-backing', title: backing.map(ME.Layers.formatEvidence).join('\n') }, ' + ' + backing.map((x) => x.source.label + ' (' + ME.Layers.EVIDENCE[x.type].label + ')').join(', ')) : null);
        });
        const missing = u.missing.map((m) => U.el('li', { class: 'muted' }, m.label + ': ' + ({ lac: 'text lost', illeg: 'illegible', na: 'outside its coverage', ambig: 'uncertain', transposed: 'has this elsewhere' }[m.why] || m.why) + ', so no vote'));
        const d = u.decision;
        // the editor's own text, a crux, doubt and reasons: all optional, all one step
        const emendText = U.el('input', { type: 'text', class: 'ct-emend', value: d && d.text ? d.text : '', placeholder: 'your text for this place', 'aria-label': 'Emended text' });
        const emendKind = U.el('select', { 'aria-label': 'Kind of correction' }, U.el('option', { value: 'emendatio' }, 'emendation'), U.el('option', { value: 'conjecture', selected: d && d.type === 'conjecture' }, 'conjecture'));
        const source = U.el('input', { type: 'text', value: d && d.source ? d.source : '', placeholder: 'whose, if not yours (e.g. Kielhorn)', 'aria-label': 'Source of the emendation' });
        const confidence = U.el('select', { 'aria-label': 'How sure', onchange: () => text.decide(u, { type: d ? d.type : 'selectio', label: d ? d.label : u.form, text: d ? d.text : undefined, source: d ? d.source : undefined, confidence: confidence.value || undefined }) },
          U.el('option', { value: '' }, 'How sure? —'), U.el('option', { value: 'high', selected: d && d.confidence === 'high' }, 'certain'), U.el('option', { value: 'medium', selected: d && d.confidence === 'medium' }, 'probable'), U.el('option', { value: 'low', selected: d && d.confidence === 'low' }, 'uncertain (marked in the text)'));
        const REASONS = ['lectio difficilior', 'usus scribendi', 'metre', 'stemma', 'sense', 'parallel or testimonium', 'grammar'];
        const chips = REASONS.map((r) => {
          const on = !!(d && d.reasons && d.reasons.includes(r));
          return U.el('button', { class: 'btn small ct-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => {
            const now = new Set((d && d.reasons) || []);
            if (now.has(r)) now.delete(r); else now.add(r);
            text.decide(u, { type: d ? d.type : 'selectio', label: d ? d.label : u.form, text: d ? d.text : undefined, source: d ? d.source : undefined, reasons: Array.from(now) });
          } }, r);
        });
        const note = U.el('input', { type: 'text', class: 'ct-note', value: d && d.note ? d.note : '', placeholder: 'a note on the reason (optional)', 'aria-label': 'Note', onchange: () => text.decide(u, { type: d ? d.type : 'selectio', label: d ? d.label : u.form, text: d ? d.text : undefined, source: d ? d.source : undefined, note: note.value.trim() }) });
        const history = table.decisions.filter((x) => x.key === u.key && x.status !== 'accepted');
        textPanel.append(...[
          U.el('div', { class: 'ct-settled' }, d ? DECIDED[d.type] || SETTLED.chosen : SETTLED[u.decided] || '', !d && u.decided === 'trust' ? ' Your trust order: ' + Collate.trustOrder(ed).join(' › ') + '.' : ''),
          u.review && u.review.conflict ? conflictBox(u) : u.review ? U.el('div', { class: 'nv-warn' }, 'Your decision here is waiting for review: ' + u.review.why + '. Decide again to settle it.') : null,
          U.el('ol', { class: 'ct-readings' }, rows, missing),
          U.el('div', { class: 'ct-decide' },
            !d ? U.el('button', { class: 'btn small', title: 'Make the proposed reading your decision (A)', onclick: () => text.decide(u, { type: 'selectio', label: u.form }) }, 'Accept the proposal') : null,
            U.el('span', { class: 'ct-group' }, emendText, emendKind, source, U.el('button', { class: 'btn small', onclick: () => text.decide(u, { type: emendKind.value, text: emendText.value, source: source.value.trim() }) }, 'Use my text')),
            U.el('button', { class: 'btn small' + (d && d.crux ? ' on' : ''), title: 'Mark this place as corrupt, between daggers', onclick: () => text.decide(u, { type: d ? d.type : 'selectio', label: d ? d.label : u.form, text: d ? d.text : undefined, source: d ? d.source : undefined, crux: !(d && d.crux) }) }, '† crux'),
            U.el('button', { class: 'btn small', title: 'The text is lost here in every witness', onclick: () => text.decide(u, { type: 'lacuna' }) }, 'Lacuna'),
            confidence),
          U.el('div', { class: 'ct-reasons' }, U.el('span', { class: 'help' }, 'Why (optional): '), chips, note),
          ME.Layers ? evidenceBox(u, evs) : null,
          history.length ? U.el('details', { class: 'ct-history' }, U.el('summary', null, history.length + ' earlier decision(s) here'), U.el('ul', null, history.map((h) => U.el('li', null, h.id + ': ' + (h.type === 'selectio' ? h.label : h.type + ' ' + (h.text || '')) + (h.reasons ? ' · ' + h.reasons.join(', ') : '') + ' · ' + h.status + (h.why ? ' (' + h.why + ')' : ''))))) : null,
          U.el('div', { class: 'nv-head' },
            d || u.decided === 'chosen' ? U.el('button', { class: 'btn small', onclick: () => (u.decided === 'chosen' && !d ? act({ op: 'pick', from: u.fromId, to: u.toId, label: null }) : text.decide(u, { type: 'votes' })) }, 'Follow the votes again') : null,
            i + 1 < text.proposal.units.length ? U.el('button', { class: 'btn small', title: 'This and the next word are one unit of variation', onclick: () => act({ op: 'cut', at: text.proposal.units[i + 1].fromId, on: false }) }, 'Join with the next word') : null,
            U.el('button', { class: 'btn small', title: 'The letters behind this word, to correct how they are lined up', onclick: () => showLetters(u.from, u.to) }, 'See the letters'))].filter(Boolean));
        const first = (winners && winners.members.find((m) => m.votes)) || (winners && winners.members[0]);
        if (first) text.showScanOf(first); else textScan.innerHTML = '';
      },
    };
    // two copies of the edition decided this place differently: each, side by side, to keep one or decide anew
    function conflictBox(u) {
      const say = (c) => (c.type === 'selectio' ? 'reads ' + (((u.groups.find((g) => g.members.some((m) => m.label === c.label)) || {}).form || {}).text || c.label).trim() + ' (as ' + c.label + ')' : c.type === 'lacuna' ? 'marks a lacuna' : (c.type === 'conjecture' ? 'conjectures ' : 'emends to ') + c.text);
      return U.el('div', { class: 'nv-warn ct-conflict' },
        U.el('strong', null, 'Two copies of the edition decide this place differently.'), ' Keep one, or decide anew: either settles it, and both stay in the history.',
        U.el('ul', null, u.review.conflict.map((c) => U.el('li', null,
          U.el('button', { class: 'btn small', onclick: () => text.decide(u, { type: c.type, label: c.label, text: c.text, source: c.source, reasons: c.reasons, note: c.note, confidence: c.confidence, crux: c.crux }) }, 'Keep this'), ' ',
          (c.resp || 'unnamed editor') + (c.when ? ', ' + new Date(c.when).toLocaleDateString() : '') + ': ' + say(c) + (c.reasons ? ' · ' + c.reasons.join(', ') : '') + (c.note ? ' · ' + c.note : '')))));
    }

    // evidence from outside the witnesses for this place: only what you record here counts
    function evidenceBox(u, evs) {
      const L = ME.Layers;
      const readings = [...new Set(u.groups.map((g) => g.form.text.trim()))];
      const type = U.el('select', { 'aria-label': 'Kind of evidence' }, Object.entries(L.EVIDENCE).map(([k, v]) => U.el('option', { value: k, title: v.desc }, v.label + ' — ' + v.desc)));
      const reading = U.el('select', { 'aria-label': 'For which reading' }, readings.map((r) => U.el('option', { value: r }, r || '(omits)')), U.el('option', { value: '\u0000' }, 'another reading…'));
      const other = U.el('input', { type: 'text', placeholder: 'the reading it has', 'aria-label': 'Its reading', hidden: true });
      reading.addEventListener('change', () => { other.hidden = reading.value !== '\u0000'; });
      const sources = [...new Set(L.evidence(ed).map((x) => x.source.label))];
      const label = U.el('input', { type: 'text', placeholder: 'source, e.g. Comm. or Bhaṭṭotpala', 'aria-label': 'Source of the evidence', list: 'ct-ev-sources' });
      const locus = U.el('input', { type: 'text', placeholder: 'where in it (optional)', 'aria-label': 'Where in the source' });
      const quote = U.el('input', { type: 'text', placeholder: 'its words (optional)', 'aria-label': 'Quotation' });
      const add = U.el('button', { class: 'btn small', onclick: async () => {
        try {
          L.addEvidence(ed, { work: table.work, unit: table.unit, key: u.key, ref: table.unit + ' ' + (u.text.trim() || '⌀'), reading: reading.value === '\u0000' ? other.value.trim() : reading.value, type: type.value, source: { label: label.value.trim(), locus: locus.value.trim() || undefined }, quote: quote.value.trim() || undefined });
        } catch (err) { U.toast(err.message, 'warn'); return; }
        await Edition.save(ed);
        text.render();
      } }, 'Add');
      return U.el('details', { class: 'ct-evidence', open: evs.length > 0 },
        U.el('summary', null, evs.length ? 'Evidence beyond the witnesses (' + evs.length + ')' : 'Evidence beyond the witnesses'),
        U.el('p', { class: 'help' }, 'What a commentary or a testimonium says of this place. A source that says nothing here is not counted for any reading.'),
        U.el('ul', null, evs.map((x) => U.el('li', null, L.formatEvidence(x), ' ', U.el('button', { class: 'btn small', onclick: async () => { L.removeEvidence(ed, x.id); await Edition.save(ed); text.render(); } }, 'Remove')))),
        U.el('datalist', { id: 'ct-ev-sources' }, sources.map((x) => U.el('option', { value: x }))),
        U.el('div', { class: 'nv-head' }, label, locus, type, reading, other, quote, add));
    }

    textBox.addEventListener('click', (e) => {
      const el = e.target.closest('.ct-u');
      if (el) text.choose(+el.dataset.u, true);
    });
    textBox.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ui.redo(); else ui.undo(); return; }
      if (mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n' || k === 'arrowdown' || k === 'j') { e.preventDefault(); text.jump(1); }
      else if (k === 'p' || k === 'arrowup' || k === 'k') { e.preventDefault(); text.jump(-1); }
      else if (/^[1-9]$/.test(k) && text.sel) {
        const g = text.sel.groups[+k - 1];
        if (g) { e.preventDefault(); text.decide(text.sel, { type: 'selectio', label: g.form.label }); }
      } else if (k === 'a' && text.sel && !text.sel.decision && text.sel.form) { e.preventDefault(); text.decide(text.sel, { type: 'selectio', label: text.sel.form }); }
    });

    /* ---------- places to check ---------- */
    const placesList = U.el('ul', { class: 'cv-places' });
    const placesTitle = U.el('summary', null, 'Places to check');
    const placesBox = U.el('details', { class: 'nv-fold cv-places-fold' }, placesTitle, U.el('p', { class: 'help' }, 'Where aligners tend to go wrong. These are prompts to look, not findings.'), placesList);
    const places = {
      timer: null,
      refreshSoon() { clearTimeout(places.timer); places.timer = setTimeout(places.refresh, 250); },
      refresh() {
        const items = E.attention(table);
        placesTitle.textContent = 'Places to check (' + items.length + ')';
        placesList.innerHTML = '';
        const show = items.slice(0, 200);
        for (const it of show) {
          const go = U.el('button', { class: 'link', onclick: () => { if (!it.review) state.goTo(it.c1, it.c2, it.label); } }, E.KINDS[it.kind]);
          const extra = [];
          if (it.fix) extra.push(U.el('button', { class: 'btn small', onclick: () => act(it.fix) }, 'Mark as a transposition'));
          if (it.review) {
            const rv = table.review.find((x) => x.id === it.review);
            if (rv) {
              const at = new Map(table.colIds.map((id, c) => [id, c]));
              if (at.has(rv.from)) extra.push(U.el('button', { class: 'btn small', onclick: () => state.goTo(at.get(rv.from), at.get(rv.to)) }, 'Show'));
              extra.push(U.el('button', { class: 'btn small', onclick: () => { table.review = table.review.filter((x) => x !== rv); after(); } }, 'Dismiss'));
            }
          }
          placesList.append(U.el('li', { class: 'cv-place k-' + it.kind }, go, ' ', it.review ? it.text + ' (was: ' + (table.review.find((x) => x.id === it.review) || {}).was + ')' : (it.c1 === it.c2 ? 'column ' + (it.c1 + 1) : 'columns ' + (it.c1 + 1) + '–' + (it.c2 + 1)) + ': ' + it.text, ' ', extra));
        }
        if (items.length > show.length) placesList.append(U.el('li', { class: 'help' }, '…and ' + (items.length - show.length) + ' more.'));
        if (!items.length) placesList.append(U.el('li', { class: 'help' }, 'Nothing here stands out.'));
      },
    };

    state.go = (siglum, s) => {
      const x = list.find((y) => y.w.siglum === siglum);
      if (!x) return;
      const closeBtn = body.closest('.modal') && body.closest('.modal').querySelector('.modal-foot .btn');
      if (closeBtn) closeBtn.click();
      const work = Object.entries(x.w.streams || {}).find(([, v]) => v === workId);
      ME.App.open(x.w.projectId).then(() => ME.App.goPlace({ label: s.folio, box: s.box, stream: work ? work[0] : workId, n: ME.Model.lineNumber(x.p, s.folio, s.box, s.line) }));
    };
    const showSel = U.el('select', { 'aria-label': 'Show', onchange: () => { state.show = showSel.value; state.repaint(); } },
      U.el('option', { value: 'n' }, 'Normalised'), U.el('option', { value: 'dip' }, 'As written'));
    const params = table.params;
    const stale = statusOf(ed, list, (await Collate.summaries(ed.id)).get(rec.key));
    const fmt = U.el('select', { 'aria-label': 'Export format' },
      U.el('option', { value: 'cx-in' }, 'CollateX input (tokens)'), U.el('option', { value: 'cx-out' }, 'CollateX table'), U.el('option', { value: 'tei' }, 'TEI corpus (Saktumiva matrix editor)'), U.el('option', { value: 'text' }, 'Proposed text, with its differences'), U.el('option', { value: 'csv' }, 'CSV (spreadsheet)'), U.el('option', { value: 'native' }, 'Manuscribe table (with all settings)'));
    const save = U.el('button', { class: 'btn small', onclick: () => {
      const base = fileSafe(table.unit);
      if (fmt.value === 'cx-in') download(base + '.collatex-input.json', JSON.stringify(Collate.toCollateXInput(table), null, 1));
      else if (fmt.value === 'cx-out') download(base + '.collatex.json', JSON.stringify(Collate.toCollateXTable(table)));
      else if (fmt.value === 'tei') download(base + '.xml', Collate.toTeiCorpus(table), 'application/xml');
      else if (fmt.value === 'text') {
        const P = E.proposal(table, Collate.trustOrder(ed));
        const lines = P.units.filter((u) => u.differs).map((u) => u.text.trim() + ' ] ' + u.groups.filter((g) => g.votes && g !== u.winner).map((g) => (g.form.text.trim() || 'om.') + ' ' + g.members.filter((m) => m.votes).map((m) => m.siglum).join(' ')).join('; ') + '  (' + u.winner.members.filter((m) => m.votes).map((m) => m.siglum).join(' ') + '; ' + u.decided + ')');
        download(base + '.txt', P.text.trim() + '\n\n' + lines.join('\n') + '\n', 'text/plain');
      } else if (fmt.value === 'csv') download(base + '.csv', Collate.toCsv(table, state.show), 'text/csv');
      else download(base + '.manuscribe-table.json', JSON.stringify(table, null, 1));
    } }, 'Save');
    const textTab = U.el('button', { class: 'btn small', 'aria-pressed': 'true', onclick: () => setMode('text') }, 'Text');
    const letterTab = U.el('button', { class: 'btn small', 'aria-pressed': 'false', onclick: () => setMode('letters') }, 'Letters');
    const appTab = U.el('button', { class: 'btn small', 'aria-pressed': 'false', onclick: () => setMode('apparatus') }, 'Apparatus');
    const appPane = U.el('div', { class: 'ap-pane', hidden: true });
    const drawApparatus = () => {
      appPane.innerHTML = '';
      appPane.append(CollateView.apparatusView(ed, [table], () => drawApparatus(), (entry) => {
        setMode('text');
        const i = text.proposal.units.findIndex((x) => x.fromId === entry.fromId);
        if (i >= 0) text.choose(i);
      }, list));
    };
    const textPane = U.el('div', { class: 'ct-pane' },
      U.el('div', { class: 'nv-head' },
        U.el('button', { class: 'btn small', title: 'P', onclick: () => text.jump(-1) }, '‹ Previous'),
        U.el('button', { class: 'btn small', title: 'N', onclick: () => text.jump(1) }, 'Next ›'),
        U.el('label', null, 'Go through ', filterSel),
        U.el('button', { class: 'btn small', onclick: async () => { if (await CollateView.askTrust(ed, false)) { text.render(); showStatus(); } } }, 'Trust order…'),
        U.el('button', { class: 'btn small', title: 'Undo (Ctrl or Cmd+Z)', onclick: () => ui.undo() }, 'Undo')),
      U.el('p', { class: 'help' }, 'The text most witnesses read, word by word. Coloured words differ between witnesses: click one to see the readings, or press N. Words that differ only in spelling the rules ignore, or only in spacing and punctuation, are not marked.'),
      textBox, textPanel, textScan,
      U.el('p', { class: 'nv-legend' }, U.el('span', { class: 'ct-u d-majority' }, 'most witnesses'), ' ', U.el('span', { class: 'ct-u d-plurality' }, 'most votes, not most witnesses'), ' ', U.el('span', { class: 'ct-u d-trust' }, 'a tie, settled by trust'), ' ', U.el('span', { class: 'ct-u d-chosen' }, 'your choice'), ' ', U.el('span', { class: 'ct-u d-lost' }, 'a witness cannot be read here'), ' · ⌀ the proposed reading omits the word'));
    const letterPane = U.el('div', { class: 'cv-letters', hidden: true });
    let lettersBuilt = false;
    const setMode = (m) => {
      state.mode = m;
      textTab.setAttribute('aria-pressed', String(m === 'text'));
      letterTab.setAttribute('aria-pressed', String(m === 'letters'));
      appTab.setAttribute('aria-pressed', String(m === 'apparatus'));
      textPane.hidden = m !== 'text';
      letterPane.hidden = m !== 'letters';
      appPane.hidden = m !== 'apparatus';
      if (m === 'apparatus') { drawApparatus(); ui.buttons(); showStatus(); return; }
      if (m === 'letters' && !lettersBuilt) {
        lettersBuilt = true;
        buildTable(table, host, ui, state);
        places.refresh();
      }
      if (m === 'letters') { state.refresh(); state.scroller.focus({ preventScroll: true }); } else { text.render(); textBox.focus({ preventScroll: true }); }
      ui.buttons();
      showStatus();
    };
    const showLetters = (c1, c2) => { setMode('letters'); state.goTo(c1, c2); };
    state.mode = 'text';
    letterPane.append(...[
      U.el('div', { class: 'nv-head' },
        U.el('label', null, 'Show ', showSel),
        U.el('button', { class: 'btn small', title: 'P', onclick: () => state.jump(-1) }, '‹ Previous difference'),
        U.el('button', { class: 'btn small', title: 'N', onclick: () => state.jump(1) }, 'Next difference ›')),
      U.el('div', { class: 'nv-head cv-tools' },
        moveBtn(-1), moveBtn(1),
        U.el('button', { class: 'btn small', title: 'Make this column and the next one, if no witness has text in both (M)', onclick: () => ui.merge() }, 'Merge'),
        U.el('button', { class: 'btn small', title: 'This witness’s reading is not the same as the others’ here: give it its own column (S)', onclick: () => ui.split() }, 'Split'),
        U.el('button', { class: 'btn small', title: 'Change the order of this column and the next, if no witness has text in both (W)', onclick: () => ui.swap() }, 'Swap'),
        stateSel,
        U.el('button', { class: 'btn small', title: 'Add or remove a word or lemma boundary before this column (B)', onclick: () => ui.cut() }, 'Boundary'),
        lockBtn, linkBtn, undoBtn, redoBtn,
        U.el('span', { class: 'cv-spacer' }),
        U.el('button', { class: 'btn small danger-ghost', title: 'Take back all corrections to this block', onclick: () => ui.reset() }, 'Take back all')),
      host, detailBox, scanBox, unitBox, placesBox,
      U.el('p', { class: 'nv-legend' },
        U.el('span', { class: 'cv-key v' }, 'differs'), ' ', U.el('span', { class: 'cv-key by-rule' }, 'changed by a rule'), ' ', U.el('span', { class: 'cv-key gap' }, Norm.GAP), ' text lost, not an omission · ', U.el('span', { class: 'cv-key lk' }, 'locked'), ' · ', U.el('span', { class: 'cv-key linked' }, 'transposition'), ' · ',
        (table.imported ? 'Imported: ' + table.imported + '. Tokens by ' : 'Aligned by ' + params.aligner.tool + ' ' + params.aligner.version + ', by ') + params.tokens + ', profile ' + params.profile + '. Rows follow the aligner’s guide tree, so similar witnesses sit together.')]);
    body.append(...[
      U.el('div', { class: 'nv-head' }, textTab, letterTab, appTab, status, U.el('span', { class: 'cv-spacer' }), checkBtn, fmt, save),
      stale.cls === 'warn' && !table.imported ? U.el('div', { class: 'nv-warn cv-stale' }, 'This table may not match the witnesses as they stand now (' + stale.text + '). Click Collate to bring it up to date. Your corrections stay.') : null,
      textPane, letterPane, appPane].filter(Boolean));
    await UI.modal({
      title: 'Collation: ' + table.unit, body, wide: true, className: 'cv-modal', buttons: [{ label: 'Close', value: null }],
      onOpen: () => {
        setMode('text');
        CollateView.lastOpen = { table, state, ui, rec, text, setMode };
      },
    });
    clearTimeout(places.timer);
    await saveNow();
    CollateView.lastOpen = null;
    if (redraw) redraw();
  };

  ME.CollateView = CollateView;
})(window.ME);
