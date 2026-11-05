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
    const go = U.el('button', { class: 'btn small primary', disabled: !ids.length, onclick: () => CollateView.collate(ed, list, workId, progress, go, redraw, false) }, 'Collate');
    const again = U.el('button', { class: 'btn small', disabled: !ids.length, title: 'Align every block again, even where nothing has changed. An alignment you imported is replaced.', onclick: async () => {
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
        U.el('td', { class: 'num' }, s ? String(s.labels) : ''), U.el('td', { class: 'num' }, s ? String(s.ncols) : ''),
        U.el('td', { class: 'num' }, s && s.ncols ? ((100 * s.variants) / s.ncols).toFixed(0) + '%' : ''));
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
        U.el('button', { class: 'btn small', disabled: ![...summaries.values()].some((s) => s.work === workId), title: 'Replace this work’s tables with an alignment made elsewhere', onclick: () => CollateView.importInto(ed, list, workId, summaries, redraw) }, 'Import alignment…')),
      progress,
      ids.length ? U.el('div', { class: 'ed-scroll cv-units' }, U.el('table', { class: 'ed-table' },
        U.el('thead', null, U.el('tr', null, ['Sample', 'Citation ID', '', 'Rows', 'Columns', 'Columns that differ'].map((h) => U.el('th', null, h)))),
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
      const worry = res.outside.reduce((a, x) => a + x.chars, 0);
      U.toast(bits.join(', ') + ' in ' + secs + ' s.' + (worry ? ' Text outside any citation ID was left out.' : ''), worry || res.skipped.length ? 'warn' : 'ok', 6000);
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
      const table = Collate.fromFile(rec.table, text);
      await Collate.saveImported(ed, await loadFresh(list), table);
      U.toast('Imported the alignment of ' + sel.value + '.', 'ok', 4000);
      redraw();
    } catch (e) {
      U.toast('Not imported: ' + e.message, 'err', 8000);
    }
  };

  /* ---------- the table ---------- */

  function buildTable(table, host, detail, state) {
    const grid = Collate.grid(table);
    const variant = Collate.variantColumns(table, grid);
    const absent = table.absent || [];
    const cw = WIDTH[table.params.tokens] || WIDTH.letter;
    const nrows = table.order.length + absent.length;
    const scroller = U.el('div', { class: 'cv-scroller', tabindex: '0', role: 'grid', 'aria-label': 'Collation table of ' + table.unit });
    const inner = U.el('div', { class: 'cv-inner', style: { width: LABEL + table.ncols * cw + 'px', height: ROW * (nrows + 1) + 'px' } });
    const head = U.el('div', { class: 'cv-row cv-head' }, U.el('div', { class: 'cv-label' }, ''));
    const rowEls = table.order.map((label) => {
      const st = table.states[label];
      return U.el('div', { class: 'cv-row' }, U.el('div', { class: 'cv-label', title: st.layer === 'ac' ? 'Before correction' : st.layer === 'pc' ? 'After correction' : '' }, label));
    });
    const absentEls = absent.map((a) => U.el('div', { class: 'cv-row cv-absent' }, U.el('div', { class: 'cv-label' }, a.siglum), U.el('div', { class: 'cv-absent-note' }, ABSENT[a.state] || a.state)));
    inner.append(head, ...rowEls, ...absentEls);
    scroller.append(inner);
    host.innerHTML = '';
    host.append(scroller);

    const paint = () => {
      const first = Math.max(0, Math.floor((scroller.scrollLeft - LABEL) / cw) - BUFFER);
      const last = Math.min(table.ncols, Math.ceil((scroller.scrollLeft + scroller.clientWidth) / cw) + BUFFER);
      const headCells = [];
      for (let c = first; c < last; c++) {
        const mark = (c + 1) % 10 === 0;
        headCells.push(U.el('div', { class: 'cv-col' + (variant[c] ? ' v' : ''), style: { left: LABEL + c * cw + 'px', width: cw + 'px' } }, mark ? String(c + 1) : ''));
      }
      head.replaceChildren(head.firstChild, ...headCells);
      table.order.forEach((label, r) => {
        const st = table.states[label];
        const g = grid[r];
        const cells = [];
        for (let c = first; c < last; c++) {
          const k = g[c];
          const sel = state.sel && state.sel.r === r && state.sel.c === c;
          let cls = 'cv-cell';
          let text = '';
          if (k < 0) cls += ' blank';
          else {
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
          }
          if (variant[c]) cls += ' v';
          if (sel) cls += ' sel';
          cells.push(U.el('div', { class: cls, dataset: { r: String(r), c: String(c) }, style: { left: LABEL + c * cw + 'px', width: cw + 'px' } }, text));
        }
        rowEls[r].replaceChildren(rowEls[r].firstChild, ...cells);
      });
    };
    let queued = false;
    const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); };
    scroller.addEventListener('scroll', queue);
    scroller.addEventListener('click', (e) => {
      const cell = e.target.closest('.cv-cell');
      if (!cell) return;
      state.sel = { r: +cell.dataset.r, c: +cell.dataset.c };
      showDetail(table, grid, detail, state);
      paint();
    });

    state.jump = (dir) => {
      const here = Math.floor((scroller.scrollLeft + 1) / cw);
      let c = here + dir;
      // from the end of one run of differing columns to the start of the next
      while (c >= 0 && c < table.ncols && variant[c] && variant[c - dir]) c += dir;
      while (c >= 0 && c < table.ncols && !variant[c]) c += dir;
      if (c >= 0 && c < table.ncols) scroller.scrollLeft = Math.max(0, c * cw - cw);
    };
    state.repaint = paint;
    state.count = variant.reduce((a, b) => a + b, 0);
    paint();
    return { scroller, paint };
  }

  const placeLine = (s) => s.folio + ' · ' + (s.box === 'main' ? 'main text' : s.box) + ' · line ' + (s.line + 1);

  function showDetail(table, grid, detail, state) {
    detail.innerHTML = '';
    if (!state.sel) return;
    const label = table.order[state.sel.r];
    const st = table.states[label];
    const k = grid[state.sel.r][state.sel.c];
    if (k < 0) {
      detail.append(U.el('strong', null, label), ' has nothing in this column.');
      return;
    }
    const tok = Collate.token(st, k);
    const src = tok.src.filter((x) => x.folio);
    const why = tok.rules.map((r) => Norm.rule(r)).filter(Boolean).map((r) => r.name);
    const tags = tok.flags.map((f) => f.replace(/^ignored:/, 'not compared: '));
    detail.append(U.el('strong', null, label), ' ',
      U.el('span', { class: 'cv-t' }, tok.t.trim() || '(no letter of its own)'), ' → ', U.el('code', null, tok.n),
      src.length ? ' · ' + placeLine(src[0]) : '',
      why.length ? ' · ' + why.join(', ') : '', tags.length ? ' · ' + tags.join(', ') : '');
    if (src.length && state.go) {
      detail.append(' ', U.el('button', { class: 'btn small', onclick: () => state.go(st.siglum, src[0]) }, 'Go to this line'));
    }
  }

  CollateView.open = async function (ed, list, workId, unit, redraw) {
    const rec = await Store.getCollation(Collate.keyOf(ed.id, workId, unit));
    if (!rec) { U.toast('That table is no longer here', 'warn'); return; }
    const table = rec.table;
    const body = U.el('div', { class: 'cv-view' });
    const host = U.el('div', { class: 'cv-host' });
    const detail = U.el('div', { class: 'cv-detail' }, 'Click a cell to see its reading and its place in the manuscript.');
    const state = { show: 'n', sel: null };
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
      U.el('option', { value: 'cx-in' }, 'CollateX input (tokens)'), U.el('option', { value: 'cx-out' }, 'CollateX table'), U.el('option', { value: 'tei' }, 'TEI corpus (Saktumiva matrix editor)'), U.el('option', { value: 'native' }, 'Manuscribe table (with all settings)'));
    const save = U.el('button', { class: 'btn small', onclick: () => {
      const base = fileSafe(table.unit);
      if (fmt.value === 'cx-in') download(base + '.collatex-input.json', JSON.stringify(Collate.toCollateXInput(table), null, 1));
      else if (fmt.value === 'cx-out') download(base + '.collatex.json', JSON.stringify(Collate.toCollateXTable(table)));
      else if (fmt.value === 'tei') download(base + '.xml', Collate.toTeiCorpus(table), 'application/xml');
      else download(base + '.manuscribe-table.json', JSON.stringify(table, null, 1));
    } }, 'Save');
    const count = U.el('span', { class: 'help cv-count' });
    body.append(...[
      U.el('div', { class: 'nv-head' },
        U.el('label', null, 'Show ', showSel),
        U.el('button', { class: 'btn small', onclick: () => state.jump(-1) }, '‹ Previous difference'),
        U.el('button', { class: 'btn small', onclick: () => state.jump(1) }, 'Next difference ›'),
        count,
        U.el('span', { class: 'cv-spacer' }),
        fmt, save),
      stale.cls === 'warn' ? U.el('div', { class: 'nv-warn cv-stale' }, 'This table may not match the witnesses as they stand now (' + stale.text + '). Click Collate to bring it up to date.') : null,
      host, detail,
      U.el('p', { class: 'nv-legend' },
        U.el('span', { class: 'cv-key v' }, 'differs'), ' ', U.el('span', { class: 'cv-key by-rule' }, 'changed by a rule'), ' ', U.el('span', { class: 'cv-key gap' }, Norm.GAP), ' text lost, not an omission · ',
        (table.imported ? 'Imported: ' + table.imported + '. Tokens by ' : 'Aligned by ' + params.aligner.tool + ' ' + params.aligner.version + ', by ') + params.tokens + ', profile ' + params.profile + '. Rows follow the aligner’s guide tree, so similar witnesses sit together.')].filter(Boolean));
    await UI.modal({
      title: 'Collation: ' + table.unit, body, wide: true, className: 'cv-modal', buttons: [{ label: 'Close', value: null, kind: 'primary' }],
      onOpen: () => {
        buildTable(table, host, detail, state);
        count.textContent = state.count + ' of ' + table.ncols + ' columns differ';
      },
    });
  };

  ME.CollateView = CollateView;
})(window.ME);
