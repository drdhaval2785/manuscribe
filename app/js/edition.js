'use strict';
/* An edition: many witnesses of a text. Each witness stays an ordinary project, so transcription
   works as before; the edition adds what holds them together: sigla and groups, which stream of a
   witness carries which work, which citation IDs each witness has, and a package of plain files
   that can travel and be archived. PDFs never go into the package: they are known by hash. */
(function (ME) {
  const { U, TEI, Model, Store, Export, UI, Importer, Zip } = ME;

  const Edition = { current: null };
  const SCHEMA = 1;
  const REMIND_AFTER_DAYS = 7;
  const COVERAGE = { lacuna: 'lacuna', pending: 'not yet transcribed', outside: 'outside its scope' };
  const COVERAGE_ORDER = [null, 'lacuna', 'pending', 'outside'];
  const STREAM_NAMES = { main: 'Main text', commentary: 'Commentary', gloss: 'Interlinear commentary' };

  const safeName = (s) => String(s).normalize('NFC').replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_') || 'witness';

  Edition.create = (title) => ({
    id: U.uid('ed'), schema: SCHEMA, title: title || '', created: Date.now(), modified: Date.now(), lastPackage: 0, licence: '',
    witnesses: [], groups: [],
    works: [{ id: 'main', title: 'Main text' }, { id: 'commentary', title: 'Commentary' }, { id: 'gloss', title: 'Interlinear commentary' }],
    coverage: {},
  });

  async function saveEdition(ed) {
    ed.modified = Date.now();
    await Store.putEdition(ed);
  }

  /* ---------- the witnesses of an edition ---------- */

  async function loadWitnesses(ed) {
    const out = [];
    for (const w of ed.witnesses) {
      const p = await Store.getProject(w.projectId);
      if (p) Model.upgrade(p);
      out.push({ w, p });
    }
    return out;
  }

  // a free siglum, from what the project calls itself
  function freeSiglum(ed, wanted) {
    const taken = new Set(ed.witnesses.map((w) => w.siglum));
    const base = String(wanted || '').trim() || 'W' + (ed.witnesses.length + 1);
    let s = base, k = 2;
    while (taken.has(s)) s = base + k++;
    return s;
  }

  function addWitness(ed, p) {
    const siglum = freeSiglum(ed, p.meta.siglum);
    ed.witnesses.push({ siglum, projectId: p.id, group: '', streams: {} });
    return siglum;
  }

  const workOf = (w, stream) => (w.streams && w.streams[stream]) || stream;

  /* ---------- the citation register ---------- */

  // What citation IDs a witness has, per work, and where its text stands outside any of them.
  Edition.scanWitness = function (w, p) {
    const works = {};
    const place = (work) => works[work] || (works[work] = { units: new Map(), order: [], outside: [], auto: [] });
    const seen = new Set();
    for (const e of Model.entries(p)) {
      if (seen.has(e.label)) continue;
      seen.add(e.label);
      const pg = p.pages[e.label];
      if (!pg) continue;
      const type = Model.pageLayout(p, e.label);
      for (const s of Model.LAYOUTS[type].streams) {
        const rec = place(workOf(w, s.key));
        rec.open = rec.open || {};
        for (const box of s.boxes) {
          const arr = (pg.boxes && pg.boxes[box]) || [];
          const n = Math.max(arr.length, 0);
          for (let i = 0; i < n; i++) {
            const line = arr[i];
            if (!line) continue;
            const at = { label: e.label, box, i, n: Model.lineNumber(p, e.label, box, i) };
            let last = 0;
            let flagged = false; // a line counts once, however many markers divide it
            const check = (piece) => { if (!flagged && piece.trim() && !rec.open[s.key]) { rec.outside.push(at); flagged = true; } };
            for (const m of line.matchAll(/<x-marker\b[^>]*\/>/g)) {
              check(line.slice(last, m.index));
              last = m.index + m[0].length;
              const kind = (/\btype="([^"]*)"/.exec(m[0]) || [])[1];
              const id = (/\bid="([^"]*)"/.exec(m[0]) || [])[1];
              if (kind === 'p-start' || kind === 'lg-start') {
                rec.open[s.key] = true;
                if (!id) continue;
                if (/-auto\d+$/.test(id)) rec.auto.push({ id, at });
                if (!rec.units.has(id)) { rec.units.set(id, []); rec.order.push(id); }
                rec.units.get(id).push(at);
              } else if (kind === 'p-end' || kind === 'lg-end') rec.open[s.key] = false;
            }
            check(line.slice(last));
          }
        }
      }
    }
    return works;
  };

  /* All witnesses together: for each work, its units in a common order, and what each witness has.
     A unit a witness lacks is a problem unless the editor has explained it (Edition coverage). */
  Edition.register = function (ed, list) {
    const out = {};
    const scans = list.filter((x) => x.p).map(({ w, p }) => ({ w, scan: Edition.scanWitness(w, p) }));
    for (const work of ed.works) {
      const order = [];
      for (const { scan } of scans) {
        const rec = scan[work.id];
        if (!rec) continue;
        let prev = -1;
        for (const id of rec.order) {
          if (/-auto\d+$/.test(id)) continue; // reported for its own witness: others are not missing it
          let at = order.indexOf(id);
          if (at < 0) { at = prev + 1; order.splice(at, 0, id); }
          prev = at;
        }
      }
      const cover = (ed.coverage && ed.coverage[work.id]) || {};
      const witnesses = scans.filter(({ scan }) => scan[work.id]).map(({ w, scan }) => {
        const rec = scan[work.id];
        const missing = order.filter((id) => !rec.units.has(id) && !(cover[id] && cover[id][w.siglum]));
        const duplicates = rec.order.filter((id) => rec.units.get(id).length > 1).map((id) => ({ id, places: rec.units.get(id) }));
        return { siglum: w.siglum, projectId: w.projectId, units: rec.units, missing, duplicates, outside: rec.outside, auto: rec.auto };
      });
      if (order.length || witnesses.some((x) => x.outside.length)) out[work.id] = { work, order, witnesses, cover };
    }
    return out;
  };

  /* ---------- package ---------- */

  async function sha256(blob) {
    if (!window.crypto || !crypto.subtle) return null;
    const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // keys in a fixed order, so that the same content always gives the same bytes
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = stable(v[k]);
      return o;
    }
    return v;
  }
  const canonical = (v) => JSON.stringify(stable(v), null, 1) + '\n';

  const projectFile = (p) => {
    const c = U.clone(p);
    for (const k of ['id', 'modified', 'ui']) delete c[k];
    return c;
  };

  const README = (ed) => `${ed.title || 'Edition'}

An edition package made with Manuscribe (https://github.com/drdhaval2785/manuscribe).

edition.json                  the edition: witnesses, groups, works, coverage
witnesses/<siglum>/project.json   a witness, as Manuscribe holds it
witnesses/<siglum>/images.json    its PDF, by name, size and SHA-256; the PDF itself is not included
output/tei/<siglum>.xml       TEI of each witness, made from the above and safe to regenerate

To open it, use Import edition package on Manuscribe's start screen.
`;

  Edition.buildPackage = async function (ed) {
    const list = await loadWitnesses(ed);
    const files = [];
    const head = U.clone(ed);
    for (const k of ['modified', 'lastPackage']) delete head[k];
    head.witnesses = ed.witnesses.map((w) => {
      const c = U.clone(w);
      delete c.projectId;
      c.dir = safeName(w.siglum);
      return c;
    });
    files.push({ name: 'edition.json', data: canonical(head) });
    files.push({ name: 'README.txt', data: README(ed) });
    const missing = [];
    for (const { w, p } of list) {
      if (!p) { missing.push(w.siglum); continue; }
      const dir = safeName(w.siglum);
      const blob = await Store.getPdf(p.id);
      if (blob && p.pdf && !p.pdf.sha256) {
        const hash = await sha256(blob);
        if (hash) { p.pdf.sha256 = hash; await Store.putProject(p); }
      }
      files.push({ name: 'witnesses/' + dir + '/project.json', data: canonical(projectFile(p)) });
      files.push({ name: 'witnesses/' + dir + '/images.json', data: canonical(p.pdf ? { file: p.pdf.name || '', bytes: p.pdf.bytes || (blob && blob.size) || null, pages: p.pdf.pages || null, sha256: p.pdf.sha256 || null } : {}) });
      const named = Object.assign({}, p, { meta: Object.assign({}, p.meta, { siglum: w.siglum }) });
      files.push({ name: 'output/tei/' + dir + '.xml', data: Export.build(named, {}).xml });
    }
    return { files, missing };
  };

  Edition.exportPackage = async function (ed) {
    ME.App.flush();
    const { files, missing } = await Edition.buildPackage(ed);
    if (missing.length) U.toast('Not in this browser, so left out: ' + missing.join(', '), 'warn', 6000);
    U.download(safeName(ed.title || 'edition') + '.edition.zip', await Zip.write(files));
    ed.lastPackage = Date.now();
    await Store.putEdition(ed);
    U.toast('Saved the edition package (' + ed.witnesses.length + ' witnesses). PDFs are not included.', 'ok', 4500);
  };

  // Reads a package into this browser. Witnesses of an edition already here are replaced, each
  // after an automatic backup; otherwise they become new projects.
  Edition.importPackage = async function (file, choose) {
    const zip = await Zip.read(file);
    if (!zip.has('edition.json')) throw new Error('this ZIP file has no edition.json');
    const head = JSON.parse(Zip.text(zip.get('edition.json')));
    if (!head.id || !Array.isArray(head.witnesses)) throw new Error('edition.json is not an edition');
    if (head.schema > SCHEMA) throw new Error('this package was made by a newer version of Manuscribe');
    const old = await Store.getEdition(head.id);
    let mode = 'new';
    if (old) {
      mode = await choose(old, head);
      if (!mode) return null;
    }
    const byDir = new Map(old && mode === 'replace' ? old.witnesses.map((w) => [safeName(w.siglum), w]) : []);
    const ed = Object.assign({}, head, { modified: Date.now(), lastPackage: old && mode === 'replace' ? old.lastPackage : 0 });
    if (mode === 'copy') { ed.id = U.uid('ed'); ed.title = (ed.title || 'Edition') + ' (copy)'; }
    ed.witnesses = [];
    for (const w of head.witnesses) {
      const raw = zip.get('witnesses/' + w.dir + '/project.json');
      if (!raw) throw new Error('the package lacks witness ' + w.siglum);
      const p = JSON.parse(Zip.text(raw));
      const prior = byDir.get(w.dir);
      p.id = prior ? prior.projectId : U.uid('ms');
      Model.upgrade(p);
      p.modified = Date.now();
      const here = prior && (await Store.getProject(p.id));
      if (here) await Store.backupNow(here);
      await Store.putProject(p);
      const c = Object.assign({}, w, { projectId: p.id });
      delete c.dir;
      ed.witnesses.push(c);
    }
    await Store.putEdition(ed);
    return ed;
  };

  // Stored PDFs are found again by content, whatever the file is called now.
  Edition.relinkPdfs = async function (ed, files) {
    const list = (await loadWitnesses(ed)).filter((x) => x.p && x.p.pdf);
    const hashes = new Map();
    const done = [], unused = [];
    for (const f of files) {
      const hash = await sha256(f);
      hashes.set(f, hash);
      let hit = hash && list.find((x) => x.p.pdf.sha256 === hash);
      if (!hit) hit = list.find((x) => !x.p.pdf.sha256 && x.p.pdf.name === f.name && (!x.p.pdf.bytes || x.p.pdf.bytes === f.size));
      if (!hit) { unused.push(f.name); continue; }
      if (await Store.putPdf(hit.p.id, f)) {
        hit.p.pdf.name = f.name;
        hit.p.pdf.bytes = f.size;
        if (hash) hit.p.pdf.sha256 = hash;
        await Store.putProject(hit.p);
        done.push(hit.w.siglum);
      }
    }
    return { done, unused };
  };

  // One TEI file per witness of a work, for collating in Saktumiva.
  Edition.saktumivaFiles = function (ed, list, workId) {
    const files = [];
    for (const { w, p } of list) {
      if (!p) continue;
      const streams = Export.streamsUsed(p).filter((s) => workOf(w, s) === workId);
      if (!streams.length) continue;
      const named = Object.assign({}, p, { meta: Object.assign({}, p.meta, { siglum: w.siglum }) });
      files.push({ name: safeName(w.siglum) + '.xml', data: Export.build(named, { streams }).xml });
    }
    return files;
  };

  /* ---------- bringing witnesses in ---------- */

  function pickFiles(accept, multiple) {
    return new Promise((resolve) => {
      const inp = U.el('input', { type: 'file', accept, multiple });
      inp.addEventListener('change', () => resolve(Array.from(inp.files)));
      inp.click();
    });
  }

  // A new project from one XML file, as if it had been made for it. -> {project} or {problem}
  Edition.projectFromXml = function (name, src) {
    const res = Importer.parse(src, {});
    if (!res.lines.length) return { problem: 'no transcription found' };
    const bad = Importer.tagProblems(src);
    if (bad.length) {
      const x = bad[0];
      return { problem: bad.length + ' mismatched tag(s), first at line ' + (x.line || x.openLine) };
    }
    const p = Model.upgrade(Model.newProject({ meta: {}, layoutType: 'linear', lines: {}, folios: {} }));
    Importer.apply(p, res, '1r', { fresh: true });
    p.layout.lines = Object.assign({}, p.layout.lines);
    if (!p.meta.title) p.meta.title = name.replace(/\.[^.]+$/, '');
    return { project: p, warnings: res.warnings };
  };

  async function addFromXml(ed) {
    const files = await pickFiles('.xml,application/xml,text/xml', true);
    if (!files.length) return;
    const added = [], failed = [];
    for (const f of files) {
      const r = Edition.projectFromXml(f.name, await f.text());
      if (r.problem) { failed.push(f.name + ': ' + r.problem); continue; }
      await Store.putProject(r.project);
      added.push(addWitness(ed, r.project));
    }
    await saveEdition(ed);
    report(added, failed);
  }

  async function addFromBackups(ed) {
    const files = await pickFiles('.json,application/json', true);
    if (!files.length) return;
    const added = [], failed = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        const p = Model.upgrade(data.project || data);
        if (!p.pages) throw new Error('not a Manuscribe project file');
        p.id = U.uid('ms');
        await Store.putProject(p);
        added.push(addWitness(ed, p));
      } catch (e) { failed.push(f.name + ': ' + e.message); }
    }
    await saveEdition(ed);
    report(added, failed);
  }

  function report(added, failed) {
    if (added.length) U.toast('Added ' + added.length + ' witness(es): ' + added.join(', '), 'ok', 4000);
    if (failed.length) {
      UI.modal({
        title: 'Some files were not added',
        body: U.el('div', null, U.el('p', { class: 'confirm-text' }, 'Please correct these and add them again.'), U.el('pre', { class: 'bulk-preview' }, failed.join('\n'))),
        buttons: [{ label: 'OK', kind: 'primary', value: null }],
      });
    }
  }

  async function addFromBrowser(ed) {
    const inEdition = new Set(ed.witnesses.map((w) => w.projectId));
    const all = (await Store.listProjects()).filter((p) => !inEdition.has(p.id));
    if (!all.length) { U.toast('Every transcription in this browser is already in this edition'); return; }
    const boxes = all.map((p) => ({ p, cb: U.el('input', { type: 'checkbox' }) }));
    const ok = await UI.modal({
      title: 'Add transcriptions from this browser',
      body: U.el('div', { class: 'ed-pick' }, boxes.map(({ p, cb }) => U.el('label', { class: 'backup-item' }, cb, ' ', (p.meta.siglum ? p.meta.siglum + ' · ' : '') + (p.meta.title || 'Untitled')))),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }],
    });
    if (!ok) return;
    for (const { p, cb } of boxes) if (cb.checked) addWitness(ed, Model.upgrade(p));
    await saveEdition(ed);
  }

  /* ---------- the dashboard ---------- */

  const view = () => document.getElementById('edition-view');
  const home = () => document.getElementById('start-home');

  Edition.show = async function (id) {
    if (ME.App.project) ME.App.flush();
    ME.App.project = null;
    document.body.classList.add('no-project');
    const ed = await Store.getEdition(id);
    if (!ed) { U.toast('That edition is not in this browser', 'warn'); Edition.current = null; ME.App.showStart(); return; }
    Edition.current = ed;
    home().hidden = true;
    view().hidden = false;
    Edition.draw();
  };

  // how long since the work was last saved outside the browser; null if there is nothing to remind of
  Edition.reminder = function (ed, list, now) {
    const t = now || Date.now();
    const changed = Math.max(ed.modified || 0, ...list.filter((x) => x.p).map((x) => x.p.modified || 0));
    if (!ed.witnesses.length || (ed.lastPackage && changed <= ed.lastPackage)) return null;
    if (!ed.lastPackage) return 'never';
    const days = Math.floor((t - ed.lastPackage) / 86400000);
    return days >= REMIND_AFTER_DAYS ? days : null;
  };

  const tag = (text, kind) => U.el('span', { class: 'ed-tag ' + kind }, text);

  function witnessTable(ed, list, redraw) {
    const groups = Array.from(new Set(ed.witnesses.map((w) => w.group).filter(Boolean)));
    const listId = 'ed-groups';
    const rows = list.map(({ w, p }) => {
      const sig = U.el('input', { type: 'text', value: w.siglum, 'aria-label': 'Siglum', onchange: async () => {
        const v = sig.value.trim();
        if (!v || ed.witnesses.some((x) => x !== w && x.siglum === v)) { U.toast('Each witness needs its own siglum', 'warn'); sig.value = w.siglum; return; }
        for (const units of Object.values(ed.coverage || {})) for (const cells of Object.values(units)) if (cells[w.siglum]) { cells[v] = cells[w.siglum]; delete cells[w.siglum]; }
        w.siglum = v;
        await saveEdition(ed);
        redraw();
      } });
      const grp = U.el('input', { type: 'text', value: w.group || '', list: listId, 'aria-label': 'Group', placeholder: '—', onchange: async () => { w.group = grp.value.trim(); await saveEdition(ed); redraw(); } });
      const remove = U.el('button', { class: 'btn small danger-ghost', title: 'Take it out of this edition; the transcription itself stays', onclick: async () => {
        if (!(await UI.confirm('Take ' + w.siglum + ' out of this edition? The transcription stays in this browser.', { ok: 'Take out' }))) return;
        ed.witnesses = ed.witnesses.filter((x) => x !== w);
        await saveEdition(ed);
        redraw();
      } }, 'Remove');
      if (!p) return U.el('tr', { class: 'ed-gone' }, U.el('td', null, sig), U.el('td', null, grp), U.el('td', { colspan: 5 }, 'This transcription is no longer in this browser.'), U.el('td', null, remove));
      const m = p.meta;
      const folios = Object.keys(p.pages).filter((l) => Model.pageHasContent(p.pages[l])).length;
      const place = [m.repository, m.settlement, m.shelfmark].filter(Boolean).join(', ');
      const pdfCell = U.el('td', { class: 'ed-pdf' }, p.pdf ? '…' : 'none');
      if (p.pdf) Store.getPdf(p.id).then((b) => { pdfCell.textContent = ''; pdfCell.append(b ? tag('stored', 'ok') : tag('missing', 'warn')); pdfCell.title = p.pdf.name || ''; });
      return U.el('tr', null,
        U.el('td', { class: 'ed-sig' }, sig), U.el('td', { class: 'ed-grp' }, grp),
        U.el('td', null, U.el('button', { class: 'link', title: 'Open this witness', onclick: () => ME.App.open(p.id) }, m.title || 'Untitled')),
        U.el('td', null, place || '—'), U.el('td', null, [m.date, m.script, m.language].filter(Boolean).join(' · ')),
        U.el('td', { class: 'num' }, String(folios)), pdfCell, U.el('td', null, remove));
    });
    return U.el('div', { class: 'ed-scroll' },
      U.el('datalist', { id: listId }, groups.map((g) => U.el('option', { value: g }))),
      U.el('table', { class: 'ed-table' },
        U.el('thead', null, U.el('tr', null, ['Siglum', 'Group', 'Transcription', 'Library', 'Date, script, language', 'Folio sides', 'PDF', ''].map((h) => U.el('th', null, h)))),
        U.el('tbody', null, rows.length ? rows : U.el('tr', null, U.el('td', { colspan: 8, class: 'ed-empty' }, 'No witnesses yet. Add some below.')))));
  }

  function streamTable(ed, list, redraw) {
    const used = list.filter((x) => x.p).map((x) => ({ w: x.w, streams: Export.streamsUsed(x.p) }));
    const streams = Object.keys(STREAM_NAMES).filter((s) => used.some((u) => u.streams.includes(s)));
    if (streams.length < 1 || !used.length) return null;
    const rows = used.map(({ w, streams: mine }) => U.el('tr', null, U.el('td', { class: 'ed-sig' }, w.siglum), streams.map((s) => {
      if (!mine.includes(s)) return U.el('td', { class: 'muted' }, '—');
      const sel = U.el('select', { 'aria-label': STREAM_NAMES[s] + ' of ' + w.siglum, onchange: async () => { w.streams = Object.assign({}, w.streams, { [s]: sel.value }); await saveEdition(ed); redraw(); } },
        ed.works.map((k) => U.el('option', { value: k.id, selected: k.id === workOf(w, s) }, k.title)));
      return U.el('td', null, sel);
    })));
    const add = U.el('button', { class: 'btn small', onclick: async () => {
      const title = await UI.prompt('Add a work', 'Title of the work, e.g. a second commentary', '', {});
      if (!title) return;
      ed.works.push({ id: U.uid('w'), title });
      await saveEdition(ed);
      redraw();
    } }, 'Add a work');
    return U.el('div', null,
      U.el('p', { class: 'help' }, 'Which work each part of a witness carries. Two manuscripts’ commentaries are collated together only if they are the same work here.'),
      U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table' }, U.el('thead', null, U.el('tr', null, U.el('th', null, 'Siglum'), streams.map((s) => U.el('th', null, STREAM_NAMES[s])))), U.el('tbody', null, rows))),
      U.el('div', { class: 'btn-row' }, add));
  }

  const placeText = (at) => at.label + ' ' + (at.box === 'main' ? '' : at.box + ' ') + 'line ' + at.n;

  function openPlace(projectId, stream, at) {
    ME.App.open(projectId).then(() => ME.App.goPlace({ label: at.label, box: at.box, stream, n: at.n }));
  }

  // Problems for each witness, most serious first; each names places to go to.
  function problemsList(reg, ed) {
    const items = [];
    for (const { work, witnesses } of Object.values(reg)) {
      for (const x of witnesses) {
        const go = (at) => U.el('button', { class: 'ts-loc', title: 'Go to this place', onclick: () => openPlace(x.projectId, work.id, at) }, placeText(at));
        for (const d of x.duplicates) items.push(U.el('li', null, tag('duplicate', 'bad'), ' ', x.siglum + ' has ', U.el('code', null, d.id), ' ' + d.places.length + ' times ', d.places.slice(0, 4).map(go)));
        if (x.auto.length) items.push(U.el('li', null, tag('automatic', 'warn'), ' ', x.siglum + ' has ' + x.auto.length + ' automatic ID(s), which will not match other witnesses ', x.auto.slice(0, 4).map((a) => go(a.at))));
        if (x.outside.length) items.push(U.el('li', null, tag('no ID', 'warn'), ' ', x.siglum + ' has ' + x.outside.length + ' line(s) of ' + work.title.toLowerCase() + ' outside any paragraph or verse ', x.outside.slice(0, 4).map(go)));
        if (x.missing.length) items.push(U.el('li', null, tag('missing', 'warn'), ' ', x.siglum + ' lacks ' + x.missing.length + ' unit(s) of ' + work.title.toLowerCase() + ': ', U.el('code', null, x.missing.slice(0, 6).join(', ') + (x.missing.length > 6 ? ' …' : ''))));
      }
    }
    if (!items.length) return ed.witnesses.length > 1 ? U.el('p', { class: 'ed-ok' }, '✓ Every witness has every citation ID, or the gap is explained.') : null;
    return U.el('ul', { class: 'ed-problems' }, items);
  }

  const GRID_LIMIT = 400;

  function coverageGrid(ed, reg, redraw) {
    const works = Object.values(reg).filter((r) => r.order.length);
    if (!works.length) return U.el('p', { class: 'help' }, 'No citation IDs yet. Mark paragraphs and verses in the witnesses, each with the same xml:id across witnesses, and they appear here.');
    Edition.gridWork = works.some((r) => r.work.id === Edition.gridWork) ? Edition.gridWork : works[0].work.id;
    const r = works.find((x) => x.work.id === Edition.gridWork);
    const pick = U.el('select', { onchange: () => { Edition.gridWork = pick.value; redraw(); } }, works.map((x) => U.el('option', { value: x.work.id, selected: x === r }, x.work.title + ' (' + x.order.length + ')')));
    const cell = (id, x) => {
      const places = x.units.get(id);
      if (places) {
        return U.el('td', { class: 'cov has' + (places.length > 1 ? ' dup' : '') }, U.el('button', { title: places.map(placeText).join(', '), onclick: () => openPlace(x.projectId, r.work.id, places[0]) }, places.length > 1 ? String(places.length) : '✓'));
      }
      const now = r.cover[id] && r.cover[id][x.siglum];
      return U.el('td', { class: 'cov ' + (now || 'gap') }, U.el('button', {
        title: (now ? COVERAGE[now] : 'Missing and not explained') + '. Click to change.',
        onclick: async () => {
          const next = COVERAGE_ORDER[(COVERAGE_ORDER.indexOf(now || null) + 1) % COVERAGE_ORDER.length];
          ed.coverage = ed.coverage || {};
          const units = ed.coverage[r.work.id] || (ed.coverage[r.work.id] = {});
          const cells = units[id] || (units[id] = {});
          if (next) cells[x.siglum] = next;
          else { delete cells[x.siglum]; if (!Object.keys(cells).length) delete units[id]; }
          await saveEdition(ed);
          redraw();
        },
      }, now ? { lacuna: 'lac', pending: '…', outside: '–' }[now] : ''));
    };
    const shown = r.order.slice(0, GRID_LIMIT);
    return U.el('div', null,
      U.el('div', { class: 'ed-grid-head' }, U.el('label', null, 'Work ', pick),
        U.el('span', { class: 'help' }, '✓ present · number: times it occurs · empty: missing · click an empty cell to explain it: lac = lacuna, … = not yet transcribed, – = outside its scope')),
      U.el('div', { class: 'ed-scroll ed-grid' }, U.el('table', { class: 'ed-table cov-table' },
        U.el('thead', null, U.el('tr', null, U.el('th', { class: 'unit' }, 'Citation ID'), r.witnesses.map((x) => U.el('th', null, x.siglum)))),
        U.el('tbody', null, shown.map((id) => U.el('tr', null, U.el('th', { class: 'unit' }, id), r.witnesses.map((x) => cell(id, x))))))),
      r.order.length > GRID_LIMIT ? U.el('p', { class: 'help' }, 'Showing the first ' + GRID_LIMIT + ' of ' + r.order.length + ' IDs.') : null);
  }

  async function batchForSaktumiva(ed, list) {
    ME.App.flush();
    const candidates = ed.works.filter((k) => Edition.saktumivaFiles(ed, list, k.id).length);
    if (!candidates.length) { U.toast('No text to export yet', 'warn'); return; }
    let workId = candidates[0].id;
    if (candidates.length > 1) {
      const sel = U.el('select', null, candidates.map((k) => U.el('option', { value: k.id }, k.title)));
      const ok = await UI.modal({ title: 'Export for Saktumiva', body: U.el('label', { class: 'field' }, U.el('span', null, 'Which work?'), sel), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Export', value: true, kind: 'primary' }] });
      if (!ok) return;
      workId = sel.value;
    }
    const files = Edition.saktumivaFiles(ed, list, workId);
    U.download(safeName(ed.title || 'edition') + '-saktumiva.zip', await Zip.write(files));
    U.toast('Saved ' + files.length + ' TEI files. Unzip them and load them in Saktumiva.', 'ok', 5000);
  }

  Edition.draw = async function () {
    const ed = Edition.current;
    if (!ed) return;
    const host = view();
    const scroller = document.getElementById('start');
    const top = scroller.scrollTop;
    const list = await loadWitnesses(ed);
    const redraw = () => Edition.draw();
    const reg = Edition.register(ed, list);
    const title = U.el('input', { type: 'text', class: 'ed-title', value: ed.title, placeholder: 'Title of the edition', onchange: async () => { ed.title = title.value.trim(); await saveEdition(ed); } });
    const due = Edition.reminder(ed, list);
    const remind = due === null ? null : U.el('div', { class: 'ed-remind' }, due === 'never'
      ? 'This edition has never been saved outside this browser. Clearing the browser’s data would delete it, so please export a package.'
      : 'Your last package export was ' + due + ' days ago, and the work has changed since. Please export a new one.');
    host.innerHTML = '';
    host.append(
      U.el('div', { class: 'ed-bar' },
        U.el('button', { class: 'btn small', onclick: () => ME.App.showStart() }, '‹ Start screen'),
        title,
        U.el('button', { class: 'btn small primary', onclick: () => Edition.exportPackage(ed).then(redraw) }, 'Export package'),
        U.el('button', { class: 'btn small', onclick: () => batchForSaktumiva(ed, list) }, 'Export for Saktumiva')),
      remind,
      U.el('h2', null, 'Witnesses (' + ed.witnesses.length + ')'),
      witnessTable(ed, list, redraw),
      U.el('div', { class: 'btn-row' },
        U.el('button', { class: 'btn small', onclick: () => addFromBrowser(ed).then(redraw) }, 'Add from this browser…'),
        U.el('button', { class: 'btn small', onclick: () => addFromXml(ed).then(redraw) }, 'Add XML files…'),
        U.el('button', { class: 'btn small', onclick: () => addFromBackups(ed).then(redraw) }, 'Add backup files…'),
        U.el('button', { class: 'btn small', title: 'Choose your PDFs; each is matched to its witness by content', onclick: async () => {
          const files = await pickFiles('application/pdf,.pdf', true);
          if (!files.length) return;
          const r = await Edition.relinkPdfs(ed, files);
          U.toast('Relinked ' + r.done.length + ' PDF(s)' + (r.unused.length ? '. No witness matches: ' + r.unused.join(', ') : ''), r.unused.length ? 'warn' : 'ok', 6000);
          redraw();
        } }, 'Relink PDFs…')),
      U.el('h2', null, 'Works'),
      streamTable(ed, list, redraw) || U.el('p', { class: 'help' }, 'Appears when the edition has witnesses.'),
      U.el('h2', null, 'Citation IDs'),
      problemsList(reg, ed),
      coverageGrid(ed, reg, redraw));
    scroller.scrollTop = top;
  };

  /* ---------- on the start screen ---------- */

  Edition.renderList = async function () {
    const box = document.getElementById('edition-list');
    if (!box) return;
    box.innerHTML = '';
    const all = await Store.listEditions();
    if (!all.length) {
      box.appendChild(U.el('p', { class: 'help' }, 'An edition brings together several transcriptions of one text.'));
      return;
    }
    for (const ed of all) {
      box.appendChild(U.el('div', { class: 'project-card', onclick: () => Edition.show(ed.id) },
        U.el('div', { class: 'pc-main' },
          U.el('div', { class: 'pc-title' }, ed.title || 'Untitled edition'),
          U.el('div', { class: 'pc-meta' }, ed.witnesses.length + ' witness(es) · ' + U.timeAgo(ed.modified))),
        U.el('div', { class: 'pc-actions' },
          U.el('button', { class: 'btn small danger-ghost', title: 'The transcriptions themselves stay', onclick: async (e) => {
            e.stopPropagation();
            if (await UI.confirm('Delete the edition “' + (ed.title || 'Untitled') + '” from this browser? Its transcriptions stay as they are.', { ok: 'Delete', danger: true })) {
              await Store.deleteEdition(ed.id);
              Edition.renderList();
            }
          } }, 'Delete'))));
    }
  };

  Edition.init = function () {
    document.getElementById('btn-new-edition').onclick = async () => {
      const title = await UI.prompt('New edition', 'Title of the text being edited', '', {});
      if (title === null || title === undefined) return;
      const ed = Edition.create(title);
      await Store.putEdition(ed);
      Edition.show(ed.id);
    };
    document.getElementById('btn-import-edition').onclick = async () => {
      const [file] = await pickFiles('.zip,application/zip', false);
      if (!file) return;
      try {
        const ed = await Edition.importPackage(file, (old, head) => UI.modal({
          title: 'This edition is already here',
          body: U.el('p', { class: 'confirm-text' }, '“' + (old.title || 'Untitled') + '” already has ' + old.witnesses.length + ' witness(es) in this browser; the package has ' + head.witnesses.length + '. Replacing keeps an automatic backup of each witness first.'),
          buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: 'Keep both', value: 'copy' }, { label: 'Replace', value: 'replace', kind: 'danger' }],
        }));
        if (ed) Edition.show(ed.id);
      } catch (e) {
        U.toast('Could not read ' + file.name + ': ' + e.message, 'err', 6000);
      }
    };
    document.getElementById('btn-edition').onclick = () => { if (Edition.current) Edition.show(Edition.current.id); };
  };

  ME.Edition = Edition;
})(window.ME);
