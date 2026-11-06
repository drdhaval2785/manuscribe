'use strict';
/* The screens for sharing and releasing an edition: comparing and merging another copy, GitHub, the copies kept
   before merging, and issuing a version. */
(function (ME) {
  const { U, UI, Edition, Store, Zip } = ME;
  const X = ME.Exchange;
  const XV = {};

  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = U.el('input', { type: 'file', accept });
      inp.addEventListener('change', () => resolve(inp.files[0] || null));
      inp.click();
    });
  }
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'an unknown time');

  const WSTATUS = {
    same: 'the same in both', mine: 'changed here only', theirs: 'changed in theirs only', both: 'changed in both',
    'mine-new': 'only here', 'theirs-new': 'only in theirs',
  };

  /* ---------- compare and merge ---------- */

  XV.compareFile = async function (ed, redraw) {
    const file = await pickFile('.zip,application/zip');
    if (!file) return;
    let theirs;
    try { theirs = Edition.readPackage(await Zip.read(file)); } catch (e) { U.toast('Could not read ' + file.name + ': ' + e.message, 'err', 6000); return; }
    await XV.compare(ed, theirs, file.name, redraw);
  };

  /* Shows what differs and merges on the editor's word. -> the merge's result, or null */
  XV.compare = async function (ed, theirs, label, redraw) {
    ME.App.flush();
    const mine = await X.mine(ed);
    const r = await X.compare(ed, mine, theirs);
    if (!r.sameEdition && !(await UI.confirm('“' + label + '” is a package of another edition (' + (r.title || 'untitled') + '), not a copy of this one. Compare it anyway?', { ok: 'Compare' }))) return null;
    const body = U.el('div', { class: 'xv' });
    body.append(U.el('p', { class: 'help' }, 'From ' + label + (r.by ? ', by ' + r.by : '') + ', made ' + when(r.made) + '. ' + (r.hasBase
      ? 'Compared with what both copies had at the last exchange, so a change made on one side only is taken from that side.'
      : 'This copy has no record of an earlier exchange, so every difference is shown as made on both sides, and your own is kept unless you choose theirs.')));
    // witnesses
    const changed = r.witnesses.filter((w) => w.status !== 'same');
    body.append(U.el('h3', null, 'Transcriptions'), changed.length ? U.el('table', { class: 'ed-table' },
      U.el('thead', null, U.el('tr', null, ['Witness', '', 'Lines that differ', 'Keep'].map((h) => U.el('th', null, h)))),
      U.el('tbody', null, changed.map((w) => {
        const sel = U.el('select', { 'aria-label': 'Which transcription of ' + w.siglum, onchange: () => { w.choice = sel.value; } },
          U.el('option', { value: 'mine', selected: w.choice === 'mine' }, w.status === 'theirs-new' ? 'leave it out' : 'mine'),
          w.status === 'mine-new' ? null : U.el('option', { value: 'theirs', selected: w.choice === 'theirs' }, 'theirs'));
        const lines = w.lines.length ? U.el('details', null, U.el('summary', null, String(w.lines.length)), U.el('ul', { class: 'xv-lines' }, w.lines.slice(0, 60).map((l) => U.el('li', null, U.el('span', { class: 'help' }, l.label + ' ' + l.box + ' ' + (l.i + 1) + ': '), U.el('del', null, ME.TEI.plainText(l.mine) || '∅'), ' → ', U.el('ins', null, ME.TEI.plainText(l.theirs) || '∅'))))) : '';
        return U.el('tr', null, U.el('td', null, w.siglum), U.el('td', null, U.el('span', { class: 'ed-tag ' + (w.status === 'both' ? 'warn' : '') }, WSTATUS[w.status])), U.el('td', null, lines), U.el('td', null, sel));
      }))) : U.el('p', { class: 'help' }, 'The transcriptions are the same in both copies.'));
    if (changed.some((w) => w.status === 'both')) body.append(U.el('p', { class: 'help' }, 'A transcription changed in both copies cannot be combined line by line here: keep one. The other stays in the copies kept before merging.'));
    // collation and decisions
    const tables = r.tables.filter((t) => t.status !== 'same');
    const conflicts = r.tables.reduce((a, t) => a + t.conflicts, 0);
    body.append(U.el('h3', null, 'Alignments and decisions'), tables.length ? U.el('table', { class: 'ed-table' },
      U.el('thead', null, U.el('tr', null, ['Block', '', 'Decisions to bring in', 'Conflicts', 'To review'].map((h) => U.el('th', null, h)))),
      U.el('tbody', null, tables.map((t) => U.el('tr', null, U.el('td', null, t.unit), U.el('td', null, WSTATUS[t.status] + (t.alignmentKept ? '' : '; their changes to the alignment are kept only in the copies kept before merging')),
        U.el('td', { class: 'num' }, String(t.incoming)), U.el('td', { class: 'num' }, t.conflicts ? U.el('span', { class: 'ed-tag warn' }, String(t.conflicts)) : '0'), U.el('td', { class: 'num' }, String(t.review)))))) : U.el('p', { class: 'help' }, 'The alignments and decisions are the same in both copies.'));
    body.append(U.el('p', { class: 'help' }, 'Decisions are never chosen between: both logs are kept whole. Where the copies decide one place differently, both decisions stay and the place is marked for you to settle in the text view.' + (conflicts ? ' There will be ' + conflicts + ' such place(s).' : '')));
    // lists and settings
    const lists = [];
    if (r.lists.evidence.incoming || r.lists.evidence.removed) lists.push(r.lists.evidence.incoming + ' piece(s) of evidence to bring in' + (r.lists.evidence.removed ? ', ' + r.lists.evidence.removed + ' removed in theirs' : ''));
    if (r.lists.registers.incoming || r.lists.registers.removed) lists.push(r.lists.registers.incoming + ' testimonia or parallels to bring in' + (r.lists.registers.removed ? ', ' + r.lists.registers.removed + ' removed in theirs' : ''));
    if (lists.length) body.append(U.el('p', null, lists.join('; ') + '.'));
    if (r.conflicts.length) {
      body.append(U.el('h3', null, 'Settings changed in both'), U.el('table', { class: 'ed-table' }, U.el('tbody', null, r.conflicts.map((c) => {
        const sel = U.el('select', { 'aria-label': 'Which value of ' + c.id, onchange: () => { c.choice = sel.value; } }, U.el('option', { value: 'mine' }, 'mine'), U.el('option', { value: 'theirs' }, 'theirs'));
        const show = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 80 ? s.slice(0, 80) + '…' : s === undefined ? '—' : s; };
        return U.el('tr', null, U.el('td', null, c.id), U.el('td', null, 'mine: ' + show(c.mine)), U.el('td', null, 'theirs: ' + show(c.theirs)), U.el('td', null, sel));
      }))));
    }
    const nothing = !changed.length && !tables.length && !lists.length && !r.conflicts.length;
    if (nothing) body.append(U.el('p', { class: 'nv-ok' }, 'The two copies hold the same edition.'));
    const go = await UI.modal({ title: 'Compare with another copy', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }].concat(nothing ? [] : [{ label: 'Merge', value: true, kind: 'primary' }]) });
    if (!go) return null;
    try {
      const res = await X.merge(ed, mine, theirs, r);
      U.toast('Merged: ' + res.witnesses + ' transcription(s) taken, ' + res.decisions + ' decision(s) brought in' + (res.conflicts ? ', ' + res.conflicts + ' place(s) to settle' : '') + (res.review ? ', ' + res.review + ' to review' : '') + '. Both copies as they were are kept.', res.conflicts ? 'warn' : 'ok', 8000);
      if (redraw) redraw();
      return res;
    } catch (e) { U.toast('Not merged: ' + e.message, 'err', 8000); return null; }
  };

  // The copies kept before each merge, to download or delete.
  XV.kept = async function (ed) {
    const all = await X.kept(ed);
    const body = U.el('div');
    const draw = (items) => {
      body.innerHTML = '';
      body.append(U.el('p', { class: 'help' }, 'Before each merge both copies are kept whole in this browser, until you delete them here. Each downloads as an ordinary edition package.'));
      if (!items.length) { body.append(U.el('p', { class: 'help' }, 'None yet.')); return; }
      body.append(U.el('ul', null, items.map((m) => U.el('li', null, new Date(m.when).toLocaleString() + (m.by ? ', with ' + m.by : '') + ' ',
        U.el('button', { class: 'btn small', onclick: () => U.download(Edition.safeName(m.title || 'edition') + '.before-merge.mine.zip', m.mine) }, 'Mine'),
        U.el('button', { class: 'btn small', onclick: () => U.download(Edition.safeName(m.title || 'edition') + '.before-merge.theirs.zip', m.theirs) }, 'Theirs'),
        U.el('button', { class: 'btn small danger-ghost', onclick: async () => { if (await UI.confirm('Delete both copies kept from this merge?', { ok: 'Delete', danger: true })) { await Store.deleteMerge(m.id); draw(await X.kept(ed)); } } }, 'Delete')))));
    };
    draw(all);
    await UI.modal({ title: 'Copies kept before merging', body, buttons: [{ label: 'Close', value: null }] });
  };

  /* ---------- GitHub ---------- */

  XV.github = async function (ed, redraw) {
    const G = ME.GitHub;
    G.loadToken();
    const c = Object.assign({ owner: '', repo: '', branch: 'main', folder: '' }, ed.github);
    const f = (k, label, ph) => U.el('label', { class: 'field' }, U.el('span', null, label), U.el('input', { type: 'text', value: c[k] || '', placeholder: ph || '', 'aria-label': label, oninput: (e) => { c[k] = e.target.value.trim(); } }));
    const token = U.el('input', { type: 'password', value: G.token || '', placeholder: 'a fine-grained token with Contents: read and write', 'aria-label': 'GitHub token', autocomplete: 'off' });
    const remember = U.el('input', { type: 'checkbox', checked: G.remembered() });
    const status = U.el('div', { class: 'help' }, c.lastCommit ? 'Last fetched or sent: commit ' + c.lastCommit.slice(0, 7) + (c.lastSync ? ', ' + new Date(c.lastSync).toLocaleString() : '') : 'Not yet sent or fetched.');
    const message = U.el('input', { type: 'text', placeholder: 'what changed (for the commit)', 'aria-label': 'Commit message' });
    const save = async () => { G.setToken(token.value, remember.checked); ed.github = Object.assign({}, ed.github, { owner: c.owner, repo: c.repo, branch: c.branch || 'main', folder: c.folder }); await Edition.save(ed); };
    const busy = (b, on) => { b.disabled = on; };
    const send = U.el('button', { class: 'btn small primary', onclick: async () => {
      busy(send, true);
      try {
        await save();
        const res = await G.push(ed, message.value.trim());
        U.toast(res.changed ? 'Sent ' + res.changed + ' file(s) as commit ' + res.commit.slice(0, 7) : 'Nothing to send: the repository has this already', 'ok', 5000);
        status.textContent = 'Last sent: commit ' + res.commit.slice(0, 7) + ', ' + new Date().toLocaleString();
      } catch (e) { U.toast(e.message, e.behind ? 'warn' : 'err', 8000); }
      busy(send, false);
    } }, 'Send');
    const fetchBtn = U.el('button', { class: 'btn small', onclick: async () => {
      busy(fetchBtn, true);
      try {
        await save();
        const mine = await X.mine(ed);
        const got = await G.fetch(ed.github, mine.files);
        if (got.refused.length) U.toast('Left in the repository, not fetched: ' + got.refused.join(', '), 'warn', 6000);
        const theirs = Edition.readPackage(got.zip);
        const r = await X.compare(ed, mine, theirs);
        const nothing = r.witnesses.every((w) => w.status === 'same') && r.tables.every((t) => t.status === 'same') && !r.conflicts.length;
        let res = null;
        if (!nothing) res = await XV.compare(ed, theirs, ed.github.owner + '/' + ed.github.repo + ' at ' + got.head.slice(0, 7), null);
        if (nothing || res) {
          ed.github.lastCommit = got.head; ed.github.lastSync = Date.now();
          if (nothing) await Edition.remember(ed, theirs);
          await Edition.save(ed);
          status.textContent = 'Last fetched: commit ' + got.head.slice(0, 7) + ', ' + new Date().toLocaleString();
          if (nothing) U.toast('This copy already has everything in the repository', 'ok');
        }
      } catch (e) { U.toast(e.message, 'err', 8000); }
      busy(fetchBtn, false);
    } }, 'Fetch and merge');
    const body = U.el('div', { class: 'xv' },
      U.el('p', { class: 'help' }, 'Keeps the edition package in a GitHub repository: each send is one commit. A send is refused if the repository has changes this copy has not seen: fetch and merge them first. PDFs are never sent; they stay on your computer, known by their hash.'),
      U.el('div', { class: 'xv-grid' }, f('owner', 'Owner', 'user or organisation'), f('repo', 'Repository'), f('branch', 'Branch', 'main'), f('folder', 'Folder', 'empty for the top')),
      U.el('label', { class: 'field' }, U.el('span', null, 'Token'), token),
      U.el('label', null, remember, ' Remember the token on this computer (otherwise it is forgotten when the page closes)'),
      U.el('p', { class: 'help' }, 'Make a fine-grained personal access token on GitHub (Settings › Developer settings), for this repository only, with Contents: read and write. Anyone who uses this browser could use a remembered token.'),
      status,
      U.el('div', { class: 'nv-head' }, message, send, fetchBtn));
    await UI.modal({ title: 'GitHub', body, wide: true, buttons: [{ label: 'Close', value: null }] });
    if (redraw) redraw();
  };

  /* ---------- issuing a version ---------- */

  XV.issue = async function (ed, list, redraw) {
    const R = ME.Release;
    const body = U.el('div', { class: 'xv' });
    const checksBox = U.el('div');
    const v = (k) => ed[k] || '';
    const set = async (k, value) => { ed[k] = value || undefined; await Edition.save(ed); refresh(); };
    const licences = Object.keys(R.LICENCES);
    const lic = U.el('select', { 'aria-label': 'Licence', onchange: () => { other.hidden = lic.value !== '*'; if (lic.value !== '*') set('licence', lic.value); } },
      U.el('option', { value: '' }, '— choose —'), licences.map((l) => U.el('option', { value: l, selected: ed.licence === l }, l)), U.el('option', { value: '*', selected: ed.licence && !licences.includes(ed.licence) }, 'another…'));
    const other = U.el('input', { type: 'text', value: ed.licence && !licences.includes(ed.licence) ? ed.licence : '', hidden: !(ed.licence && !licences.includes(ed.licence)), placeholder: 'its name', 'aria-label': 'Another licence', onchange: (e) => set('licence', e.target.value.trim()) });
    const field = (k, label, ph) => U.el('label', { class: 'field' }, U.el('span', null, label), U.el('input', { type: 'text', value: v(k), placeholder: ph || '', 'aria-label': label, onchange: (e) => set(k, e.target.value.trim()) }));
    const version = U.el('input', { type: 'text', value: ed.version && !(ed.releases || []).some((x) => x.version === ed.version) ? ed.version : '', placeholder: 'e.g. 1.0', 'aria-label': 'Version' });
    const rights = U.el('table', { class: 'ed-table' }, U.el('thead', null, U.el('tr', null, ['Witness', 'Where its images are (URL, IIIF manifest or DOI)', 'Rights in the images'].map((h) => U.el('th', null, h)))),
      U.el('tbody', null, ed.witnesses.map((w) => U.el('tr', null, U.el('td', null, w.siglum),
        U.el('td', null, U.el('input', { type: 'text', value: w.images || '', 'aria-label': 'Images of ' + w.siglum, onchange: async (e) => { w.images = e.target.value.trim() || undefined; await Edition.save(ed); refresh(); } })),
        U.el('td', null, U.el('input', { type: 'text', value: w.rights || '', placeholder: 'e.g. © the library; not for redistribution', 'aria-label': 'Rights in the images of ' + w.siglum, onchange: async (e) => { w.rights = e.target.value.trim() || undefined; await Edition.save(ed); refresh(); } }))))));
    const issueBtn = U.el('button', { class: 'btn primary', onclick: async () => {
      issueBtn.disabled = true;
      try {
        const res = await R.issue(ed, list, version.value);
        U.download(res.name, res.zip);
        U.toast('Issued version ' + ed.version + ' of ' + ed.issued.date + ': ' + res.files.length + ' files', 'ok', 6000);
        refresh();
      } catch (e) { U.toast(e.message, 'err', 10000); }
      issueBtn.disabled = false;
    } }, 'Issue this version');
    async function refresh() {
      const checks = await R.check(ed, list);
      checksBox.innerHTML = '';
      const areas = [...new Set(checks.map((c) => c.area))];
      checksBox.append(U.el('p', { class: 'help' }, 'A self-check after the criteria of the Institut für Dokumentologie und Editorik for reviewing scholarly digital editions: what a reviewer would look for and Manuscribe can see. A failure stops the issue.'),
        ...areas.map((a) => U.el('div', null, U.el('h4', null, a), U.el('ul', { class: 'xv-checks' }, checks.filter((c) => c.area === a).map((c) => U.el('li', { class: c.level }, U.el('span', { class: 'ed-tag ' + (c.level === 'fail' ? 'bad' : c.level === 'warn' ? 'warn' : '') }, c.level === 'ok' ? '✓' : c.level === 'warn' ? 'look' : 'fails'), ' ', c.text))))));
      issueBtn.title = checks.some((c) => c.level === 'fail') ? 'Some checks fail' : '';
    }
    const past = (ed.releases || []).length ? U.el('p', { class: 'help' }, 'Issued before: ' + ed.releases.map((x) => x.version + ' (' + x.date + ')').join(', ') + '.') : null;
    body.append(
      U.el('p', { class: 'help' }, 'Issuing freezes a version with its date. Every output is made at once, each carrying the version, date and citation: the package, and for each work the reader, the print edition for LaTeX, the apparatus in TEI and as text, and the indices; with CITATION.cff and Zenodo metadata, in one ZIP for an archive. Anything changed afterwards makes the outputs drafts again until the next version.'),
      past,
      U.el('div', { class: 'xv-grid' }, field('editor', 'Edited by', 'your name'), U.el('label', { class: 'field' }, U.el('span', null, 'Licence of the edition'), lic, other), field('doi', 'DOI (optional)', 'e.g. 10.5281/zenodo.1234567'), U.el('label', { class: 'field' }, U.el('span', null, 'Version'), version)),
      U.el('p', { class: 'help' }, 'For a DOI, reserve one at Zenodo before you issue (New upload › Reserve DOI), give it here, and upload the ZIP there. The images of the manuscripts are not in the release: say where they are and what may be done with them.'),
      rights, checksBox, U.el('div', { class: 'nv-head' }, issueBtn));
    await refresh();
    await UI.modal({ title: 'Issue edition', body, wide: true, buttons: [{ label: 'Close', value: null }] });
    if (redraw) redraw();
  };

  ME.ExchangeView = XV;
})(window.ME);
