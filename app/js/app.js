'use strict';
/* Application shell: start screen, project lifecycle, folio navigation, side panel,
   calibration, settings, help, autosave and backups. */
(function (ME) {
  const { U, TEI, Model, Store, PdfView, Editor, Commands, Export, UI, Translit, Importer } = ME;

  const App = {
    project: null,
    entries: [],
    idx: 0,
    pageSizes: {},
    fileHandle: null,
    saveState: 'saved',
    lastSaved: 0,
  };
  ME.App = App;

  const $ = (id) => document.getElementById(id);
  const entry = () => App.entries[App.idx];

  /* ---------- boot ---------- */

  App.boot = async function () {
    await Store.open();
    TEI.workLabel = Commands.workLabel;
    // dialog text boxes for manuscript text type with the same scheme as the folio
    Translit.attachToInputs(() => App.project && App.project.settings);
    UI.translitBadge = () => {
      const tl = App.project && App.project.settings.translit;
      return tl && tl !== 'off' ? Translit.SCHEMES[tl].short : '';
    };
    PdfView.init($('pdf-view'), {
      onPageSize: onPageSize,
      onPaper: (rgb) => Editor.applyPaper(rgb),
      onFileDrop: (f) => App.replacePdf(f),
      onZoom: (z) => { $('pdf-zoom').textContent = Math.round(z * 100) + '%'; if (App.project) { App.project.ui.pdfZoom = z; App.changed(true); } },
    });
    Editor.init($('editor-pane'), {
      onChange: () => App.changed(),
      onLineFocus: onLineFocus,
      onCaret: onCaret,
      onLinesChange: (box, n) => App.setLines(box, n),
      onAddLine: (box) => App.addLine(box),
      onRemoveLine: (box) => App.removeLastLine(box),
      onGrowLines: (box, n, focus) => { const pg = Model.page(App.project, entry().label); pg.lines = Object.assign(pg.lines || {}, { [box === 'gloss' ? 'main' : box]: n }); App.changed(); rerender(focus); },
      onRerender: (focus) => rerender(focus),
      onMulti: () => updateStatus(Editor.current),
      onEditChip: (el) => Commands.editTag(el),
    });
    Commands.buildToolbar($('toolbar'));
    wireChrome();
    document.addEventListener('keydown', Commands.onKeyDown, true);
    window.addEventListener('beforeunload', () => { App.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) App.flush(); });
    if (Store.fallback) $('storage-warning').hidden = false;

    const last = localStorage.getItem('lipikara.last');
    if (last && (await Store.getProject(last))) await App.open(last);
    else await App.showStart();
  };

  /* ---------- saving ---------- */

  const saveSoon = U.debounce(() => App.save(), 700);

  App.changed = function (quiet) {
    if (!App.project) return;
    App.project.modified = Date.now();
    if (!quiet) setSaveState('dirty');
    saveSoon();
    if (!quiet) updateProgress();
  };

  App.save = async function () {
    if (!App.project) return;
    try {
      await Store.putProject(App.project);
      App.lastSaved = Date.now();
      setSaveState('saved');
    } catch (e) {
      console.error(e);
      setSaveState('error');
      U.toast('Could not save in the browser: ' + e.message + ' — use Backup to save a copy', 'err', 6000);
    }
  };

  App.flush = function () {
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('line')) Editor.commit(a);
    saveSoon.flush();
    if (App.project && App.saveState === 'dirty') App.save();
  };

  function setSaveState(s) {
    App.saveState = s;
    const el = $('save-status');
    el.className = 'save-status ' + s;
    el.textContent = s === 'dirty' ? 'Saving…' : s === 'error' ? 'Not saved!' : 'Saved';
    el.title = s === 'saved' ? 'All changes are saved in this browser' + (App.lastSaved ? ' (' + new Date(App.lastSaved).toLocaleTimeString() + ')' : '') : '';
  }

  function projectJson() {
    return JSON.stringify({ manuscribe: 1, savedAt: new Date().toISOString(), project: App.project }, null, 1);
  }
  function baseName() {
    const m = App.project.meta;
    return (m.siglum || m.title || 'transcription').replace(/[^\wÀ-ɏऀ-ॿ.-]+/g, '_');
  }

  // Ctrl+S: write the project to a file (re-using the same file in Chromium browsers)
  App.saveToFile = async function () {
    if (!App.project) return;
    App.flush();
    const json = projectJson();
    if (window.showSaveFilePicker) {
      try {
        if (!App.fileHandle) {
          App.fileHandle = await window.showSaveFilePicker({ suggestedName: baseName() + '.manuscribe.json', types: [{ description: 'Manuscribe project', accept: { 'application/json': ['.json'] } }] });
        }
        const w = await App.fileHandle.createWritable();
        await w.write(json);
        await w.close();
        U.toast('Backup saved to ' + App.fileHandle.name, 'ok');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        App.fileHandle = null;
      }
    }
    U.download(baseName() + '-' + new Date().toISOString().slice(0, 10) + '.manuscribe.json', json, 'application/json');
    U.toast('Backup downloaded', 'ok');
  };

  /* ---------- start screen ---------- */

  App.showStart = async function () {
    if (App.project) App.flush();
    App.project = null;
    document.body.classList.add('no-project');
    const list = $('project-list');
    list.innerHTML = '';
    const projects = await Store.listProjects();
    if (!projects.length) {
      list.appendChild(U.el('div', { class: 'empty-list' }, U.el('p', null, 'No transcriptions yet.'), U.el('p', { class: 'help' }, 'Start a new one with a manuscript PDF, or import a project backup (.manuscribe.json).')));
    }
    for (const p of projects) {
      Model.upgrade(p);
      const labels = Object.keys(p.pages).filter((l) => Model.pageHasContent(p.pages[l]));
      list.appendChild(U.el('div', { class: 'project-card', onclick: () => App.open(p.id) },
        U.el('div', { class: 'pc-main' },
          U.el('div', { class: 'pc-title' }, p.meta.title || 'Untitled', p.meta.siglum ? U.el('span', { class: 'pc-siglum' }, p.meta.siglum) : null),
          U.el('div', { class: 'pc-meta' }, Model.LAYOUTS[p.layout.type].label + ' · ' + labels.length + ' folio side(s) transcribed' + (p.pdf ? ' · ' + (p.pdf.pages || '?') + ' PDF pages' : '') + ' · ' + U.timeAgo(p.modified))),
        U.el('div', { class: 'pc-actions' },
          U.el('button', { class: 'btn small ghost', title: 'Download a backup of this project', onclick: (e) => { e.stopPropagation(); U.download((p.meta.siglum || p.meta.title || 'project').replace(/\W+/g, '_') + '.manuscribe.json', JSON.stringify({ lipikara: 1, project: p }, null, 1), 'application/json'); } }, 'Backup'),
          U.el('button', { class: 'btn small danger-ghost', title: 'Delete this project from the browser', onclick: async (e) => {
            e.stopPropagation();
            if (await UI.confirm('Delete “' + (p.meta.title || 'Untitled') + '” and its stored PDF from this browser? This cannot be undone. (Download a backup first if unsure.)', { ok: 'Delete', danger: true })) {
              await Store.deleteProject(p.id);
              if (localStorage.getItem('lipikara.last') === p.id) localStorage.removeItem('lipikara.last');
              App.showStart();
            }
          } }, 'Delete'))));
    }
  };

  /* ---------- new project ---------- */

  function layoutCards(current, onPick) {
    const wrap = U.el('div', { class: 'layout-cards' });
    for (const [k, L] of Object.entries(Model.LAYOUTS)) {
      const card = U.el('button', { type: 'button', class: 'layout-card' + (k === current ? ' sel' : ''), dataset: { k }, onclick: () => { U.$$('.layout-card', wrap).forEach((c) => c.classList.toggle('sel', c === card)); onPick(k); } },
        U.el('div', { class: 'lc-diagram lc-' + k }, U.el('i', { class: 'd-top' }), U.el('i', { class: 'd-left' }), U.el('i', { class: 'd-main' }), U.el('i', { class: 'd-right' }), U.el('i', { class: 'd-bottom' })),
        U.el('div', { class: 'lc-name' }, L.label), U.el('div', { class: 'lc-desc' }, L.desc));
      wrap.appendChild(card);
    }
    return wrap;
  }

  function linesInputs(type, values) {
    const wrap = U.el('div', { class: 'lines-inputs' });
    const inputs = {};
    const draw = (t) => {
      wrap.innerHTML = '';
      for (const b of Model.LAYOUTS[t].boxes) {
        if (b === 'gloss') continue;
        const inp = inputs[b] || (inputs[b] = U.el('input', { type: 'number', min: '1', max: '80', value: values[b] || Model.DEFAULT_LINES[b] }));
        wrap.appendChild(U.el('label', { class: 'field small' }, U.el('span', null, (t === 'interlinear' ? 'Lines of text' : Model.BOX_LABEL[b] + (b === 'main' ? '' : ' block'))), inp));
      }
    };
    draw(type);
    return { el: wrap, draw, values: () => { const o = {}; for (const [b, i] of Object.entries(inputs)) o[b] = Math.max(1, parseInt(i.value, 10) || 1); return o; } };
  }

  App.newProject = async function () {
    let file = null;
    let type = 'linear';
    const fileInput = U.el('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'file-input' });
    const fileName = U.el('span', { class: 'file-name' }, 'No file chosen');
    const pickBtn = U.el('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Choose manuscript PDF…');
    fileInput.addEventListener('change', () => {
      file = fileInput.files[0] || null;
      fileName.textContent = file ? file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)' : 'No file chosen';
      if (file && !title.value) title.value = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
    });
    let xmlFile = null;
    const xmlInput = U.el('input', { type: 'file', accept: '.xml,.txt,application/xml,text/xml,text/plain', class: 'file-input' });
    const xmlName = U.el('span', { class: 'file-name' }, 'None — I will type the transcription');
    const xmlBtn = U.el('button', { type: 'button', class: 'btn', onclick: () => xmlInput.click() }, 'Choose XML…');
    xmlInput.addEventListener('change', () => {
      xmlFile = xmlInput.files[0] || null;
      xmlName.textContent = xmlFile ? xmlFile.name : 'None — I will type the transcription';
    });
    const title = U.el('input', { type: 'text', placeholder: 'e.g. Haimanāmamālā with ṭīkā' });
    const siglum = U.el('input', { type: 'text', placeholder: 'e.g. P1', style: { maxWidth: '8em' } });
    const lines = linesInputs(type, {});
    const cards = layoutCards(type, (k) => { type = k; lines.draw(k); });
    const firstPage = U.el('input', { type: 'number', min: '1', value: '1' });
    const startNo = U.el('input', { type: 'number', min: '0', value: '1' });
    const startSide = U.el('select', null, U.el('option', { value: 'r' }, 'recto (r)'), U.el('option', { value: 'v' }, 'verso (v)'));
    const sides = U.el('select', null, U.el('option', { value: '1' }, 'one folio side'), U.el('option', { value: '2' }, 'two folio sides (upper & lower half)'));
    const missing = U.el('input', { type: 'text', placeholder: 'e.g. 7, 12-14, 20v' });
    const err = U.el('div', { class: 'field-error' });
    const body = U.el('div', { class: 'new-project' },
      U.el('section', null, U.el('h3', null, '1 · Manuscript PDF'), U.el('div', { class: 'file-row' }, pickBtn, fileName, fileInput),
        U.el('p', { class: 'help' }, 'The PDF stays on this computer; it is stored in the browser so you do not have to select it again.'),
        U.el('div', { class: 'file-row' }, xmlBtn, xmlName, xmlInput),
        U.el('p', { class: 'help' }, 'Optional: a transcription you already have, as XML, to add markup to. <pb n="0005_1"> is folio 5, first side; <pb n="0005_2"> its back side.')),
      U.el('section', null, U.el('h3', null, '2 · Text'), U.el('div', { class: 'row2' },
        U.el('label', { class: 'field' }, U.el('span', null, 'Title of the text'), title),
        U.el('label', { class: 'field' }, U.el('span', null, 'Siglum of this witness'), siglum))),
      U.el('section', null, U.el('h3', null, '3 · Layout of the folios'), cards,
        U.el('div', { class: 'opt-title' }, 'Usual number of lines per folio side'), lines.el,
        U.el('p', { class: 'help' }, 'Individual folios can differ — you can change the number of lines on any folio while typing.')),
      U.el('section', null, U.el('h3', null, '4 · Folio numbering'), U.el('div', { class: 'row4' },
        U.el('label', { class: 'field' }, U.el('span', null, 'First PDF page with text'), firstPage),
        U.el('label', { class: 'field' }, U.el('span', null, 'is folio number'), startNo),
        U.el('label', { class: 'field' }, U.el('span', null, 'side'), startSide),
        U.el('label', { class: 'field' }, U.el('span', null, 'Each PDF page shows'), sides)),
        U.el('label', { class: 'field' }, U.el('span', null, 'Folios missing from the manuscript (optional)'), missing),
        U.el('p', { class: 'help' }, 'Following pages are numbered 1r, 1v, 2r, 2v…, skipping the missing folios. Any page can be renamed later (Folio tab).')),
      err);
    const ok = await UI.modal({
      title: 'New transcription', body, wide: true,
      buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, {
        label: 'Create', kind: 'primary', value: true,
        validate: () => {
          if (!file) { err.textContent = 'Please choose the manuscript PDF.'; return false; }
          const bad = Model.parseMissing(missing.value).bad;
          if (bad.length) { err.textContent = 'Missing folios: “' + bad[0] + '” is not understood. Write e.g. 7, 12-14, 20v'; return false; }
          return true;
        },
      }],
    });
    if (!ok) return;
    const p = Model.newProject({
      meta: { title: title.value.trim(), siglum: siglum.value.trim() },
      layoutType: type, lines: lines.values(),
      folios: { firstPage: Math.max(1, +firstPage.value || 1), startNo: Math.max(0, +startNo.value || 0), startSide: startSide.value, sidesPerPage: +sides.value, missing: missing.value.trim() },
      pdf: { name: file.name, bytes: file.size },
    });
    try {
      const info = await PdfView.load(file);
      p.pdf.pages = info.pages;
      p.pdf.size = { width: info.width, height: info.height };
    } catch (e) {
      U.toast('Could not read this PDF: ' + e.message, 'err', 6000);
      return;
    }
    await Store.putProject(p);
    const stored = await Store.putPdf(p.id, file);
    if (!stored) U.toast('The PDF could not be stored in the browser; you will need to select it again next time', 'warn', 6000);
    await App.open(p.id, { pdfAlreadyLoaded: true });
    // crop to the leaf straight away if it can be found on the scan
    await App.pdfShown;
    for (let k = 0; k < 20 && !document.querySelector('.pdf-stage canvas'); k++) await new Promise((r) => setTimeout(r, 200));
    const leaf = PdfView.detectLeaf();
    if (leaf) {
      Model.setRegions(App.project, entry(), { leaf, boxes: {} }, 'all');
      App.changed();
      rerender();
    }
    if (xmlFile) await App.importXml(xmlFile, { fresh: true });
    setTimeout(async () => {
      if (await UI.confirm('To make the typing area match the manuscript exactly, draw rectangles around the leaf and the text blocks on the PDF. You can do this now or later (Folio tab → Calibrate).', { title: 'Calibrate the layout?', ok: 'Calibrate now' })) App.calibrate();
    }, 300);
  };

  /* ---------- a transcription that exists already ---------- */

  App.pickXml = function () {
    const inp = U.el('input', { type: 'file', accept: '.xml,.txt,application/xml,text/xml,text/plain' });
    inp.addEventListener('change', () => { if (inp.files[0]) App.importXml(inp.files[0]); });
    inp.click();
  };

  App.importXml = async function (file, opts) {
    const p = App.project;
    App.flush();
    let res;
    try {
      res = Importer.parse(await file.text(), {});
    } catch (e) {
      U.toast('Could not read ' + file.name + ': ' + e.message, 'err', 6000);
      return;
    }
    if (!res.lines.length) { U.toast('No transcription found in ' + file.name, 'warn', 5000); return; }
    const labels = Array.from(new Set(res.pages));
    const overwritten = labels.filter((l) => Model.pageHasContent(p.pages[l]));
    if (!(opts && opts.fresh) && overwritten.length && !(await UI.confirm(overwritten.length + ' of the ' + labels.length + ' folio sides in this file already have text here (' + overwritten.slice(0, 6).join(', ') + (overwritten.length > 6 ? ' …' : '') + '). Their text and tags will be replaced by the file.', { title: 'Replace these folio sides?', ok: 'Replace', danger: true }))) return;
    const rep = Importer.apply(p, res, entry().label);
    App.entries = Model.entries(p);
    App.changed();
    const first = App.entries.findIndex((e) => e.label === rep.folios[0]);
    await App.go(first < 0 ? App.idx : first, { noFocus: true });
    $('proj-title').textContent = (p.meta.title || 'Untitled') + (p.meta.siglum ? '  ·  ' + p.meta.siglum : '');
    if (!rep.unmapped.length && !rep.warnings.length) { U.toast('Imported ' + rep.folios.length + ' folio side(s), ' + rep.lines + ' lines from ' + file.name, 'ok', 4500); return; }
    await UI.modal({
      title: 'Transcription imported',
      body: U.el('div', null,
        U.el('p', null, rep.folios.length + ' folio side(s), ' + rep.lines + ' lines from ' + file.name + '.'),
        rep.unmapped.length ? U.el('p', { class: 'help' }, rep.unmapped.length + ' of them have no PDF page with the present numbering (' + rep.unmapped.slice(0, 8).join(', ') + (rep.unmapped.length > 8 ? ' …' : '') + '). Check the folio numbering and the missing folios in the Manuscript tab.') : null,
        rep.warnings.length ? U.el('pre', { class: 'bulk-preview' }, rep.warnings.join('\n')) : null),
      buttons: [{ label: 'OK', kind: 'primary', value: null }],
    });
  };

  App.importProject = function () {
    const inp = U.el('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const p = Model.upgrade(data.project || data);
        if (!p.id || !p.pages) throw new Error('not a Manuscribe project file');
        const existing = await Store.getProject(p.id);
        if (existing) {
          const choice = await UI.modal({
            title: 'Project already exists',
            body: U.el('p', null, '“' + (existing.meta.title || 'Untitled') + '” is already in this browser (last changed ' + U.timeAgo(existing.modified) + '). The file was saved ' + U.timeAgo(p.modified) + '.'),
            buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Import as a copy', value: 'copy' }, { label: 'Replace', kind: 'danger', value: 'replace' }],
          });
          if (!choice) return;
          if (choice === 'copy') { p.id = U.uid('ms'); p.meta.title = (p.meta.title || 'Untitled') + ' (copy)'; }
          else { const pdf = await Store.getPdf(existing.id); if (pdf) await Store.putPdf(p.id, pdf); }
        }
        await Store.putProject(p);
        await App.open(p.id);
      } catch (e) {
        U.toast('Could not import: ' + e.message, 'err', 5000);
      }
    });
    inp.click();
  };

  /* ---------- opening ---------- */

  App.open = async function (id, opts) {
    const raw = await Store.getProject(id);
    if (!raw) { U.toast('Project not found', 'err'); return App.showStart(); }
    const p = Model.upgrade(raw);
    App.project = p;
    App.fileHandle = null;
    TEI.setUnanchored(p.settings.noAnchorIds);
    localStorage.setItem('lipikara.last', id);
    document.body.classList.remove('no-project');
    $('proj-title').textContent = (p.meta.title || 'Untitled') + (p.meta.siglum ? '  ·  ' + p.meta.siglum : '');
    document.title = (p.meta.title || 'Untitled') + ' — Manuscribe';
    Commands.buildToolbar($('toolbar'));
    applyUiState();
    if (!(opts && opts.pdfAlreadyLoaded)) {
      PdfView.unload();
      const blob = await Store.getPdf(id);
      if (blob) {
        try { await loadPdfInfo(blob); } catch (e) { U.toast('Could not open the stored PDF: ' + e.message, 'err'); showPdfMissing(); }
      } else showPdfMissing();
    }
    App.entries = Model.entries(p);
    let idx = App.entries.findIndex((e) => e.label === p.ui.current);
    if (idx < 0) idx = Math.min(Math.max(0, App.entries.findIndex((e) => e.pdfPage === p.folios.firstPage)), Math.max(0, App.entries.length - 1));
    if (!App.entries.length) {
      // no PDF known: offer a single placeholder folio so typing is still possible
      p.pdf = p.pdf || { name: '', pages: 1 };
      p.pdf.pages = p.pdf.pages || 1;
      App.entries = Model.entries(p);
    }
    await App.go(idx, { noFocus: true });
    setSaveState('saved');
  };

  async function loadPdfInfo(blob) {
    const info = await PdfView.load(blob);
    const p = App.project;
    if (p.pdf && p.pdf.pages && p.pdf.pages !== info.pages) U.toast('This PDF has ' + info.pages + ' pages, the project expected ' + p.pdf.pages, 'warn', 5000);
    p.pdf = Object.assign({}, p.pdf || {}, { pages: info.pages, size: { width: info.width, height: info.height } });
    if (blob.name) p.pdf.name = blob.name;
  }

  function showPdfMissing() {
    const p = App.project;
    PdfView.showEmpty('');
    const btn = U.el('button', { class: 'btn primary', onclick: () => App.pickPdf() }, 'Select the PDF…');
    const box = U.el('div', { class: 'pdf-empty-inner' },
      U.el('p', null, 'The manuscript PDF is not available in this browser' + (p.pdf && p.pdf.name ? ' (expected “' + p.pdf.name + '”)' : '') + '.'),
      btn, U.el('p', { class: 'help' }, 'You can also drop the PDF file here.'));
    const host = U.$('.pdf-empty', $('pdf-view'));
    host.innerHTML = '';
    host.appendChild(box);
    host.hidden = false;
    U.$('.pdf-scroller', $('pdf-view')).hidden = true;
  }

  App.pickPdf = function () {
    const inp = U.el('input', { type: 'file', accept: 'application/pdf,.pdf' });
    inp.addEventListener('change', () => { if (inp.files[0]) App.replacePdf(inp.files[0]); });
    inp.click();
  };

  App.replacePdf = async function (file) {
    if (!App.project) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { U.toast('Please drop a PDF file', 'warn'); return; }
    try {
      await loadPdfInfo(file);
      await Store.putPdf(App.project.id, file);
      App.pageSizes = {};
      App.entries = Model.entries(App.project);
      App.changed();
      await App.go(Math.min(App.idx, App.entries.length - 1));
      U.toast('PDF loaded: ' + file.name, 'ok');
    } catch (e) {
      U.toast('Could not read this PDF: ' + e.message, 'err', 6000);
    }
  };

  /* ---------- navigation ---------- */

  App.go = async function (idx, opts) {
    const p = App.project;
    if (!p) return;
    const a = document.activeElement;
    const prevBox = Editor.current && Editor.current.box;
    if (a && a.classList && a.classList.contains('line')) { Editor.commit(a); a.blur(); }
    App.idx = U.clamp(idx, 0, App.entries.length - 1);
    const e = entry();
    p.ui.current = e.label;
    fillFolioSelect();
    const g = Model.geometry(p, e, App.pageSizes[e.pdfPage] || (p.pdf && p.pdf.size));
    App.pdfShown = PdfView.doc ? PdfView.show(e, g.leaf).catch((err) => console.warn(err)) : Promise.resolve();
    Editor.render(p, e, App.pageSizes[e.pdfPage] || (p.pdf && p.pdf.size));
    $('calib-hint').hidden = g.calibrated || !PdfView.doc;
    PdfView.setGuide(null);
    App.refreshSidebar();
    updateStatus();
    App.changed(true);
    if (!(opts && opts.noFocus)) {
      const boxes = Model.LAYOUTS[g.type].boxes;
      Editor.focusLine(boxes.includes(prevBox) ? prevBox : 'main', 0, 'start');
    }
  };

  // To a place named by the tag summary: {label, box, stream, n}
  App.goPlace = async function (w) {
    const p = App.project;
    const idx = App.entries.findIndex((e) => e.label === w.label);
    if (idx < 0) { U.toast('Folio ' + w.label + ' is not in the present numbering', 'warn'); return; }
    await App.go(idx, { noFocus: true });
    const s = Model.LAYOUTS[Model.pageLayout(p, w.label)].streams.find((x) => x.key === w.stream);
    const box = w.box || (s ? s.boxes[0] : 'main');
    const n = Model.lineCount(p, w.label, box);
    for (let i = 0; i < n; i++) if (String(Model.lineNumber(p, w.label, box, i)) === String(w.n)) { Editor.focusLine(box, i, 'start'); return; }
    Editor.focusLine(box, 0, 'start');
  };

  App.step = function (d) {
    if (!App.project) return;
    const n = App.idx + d;
    if (n < 0 || n >= App.entries.length) { U.toast(d > 0 ? 'This is the last folio side' : 'This is the first folio side'); return; }
    App.go(n);
  };

  function onPageSize(e, size) {
    const prev = App.pageSizes[e.pdfPage];
    App.pageSizes[e.pdfPage] = size;
    if (e !== entry()) return;
    const cur = Editor.pageSize || {};
    if (!prev && cur.width && Math.abs(size.width / size.height - cur.width / cur.height) > 0.01) {
      const pos = Editor.current;
      const line = pos && Editor.lineEl(pos.box, pos.i);
      const off = line && document.activeElement === line ? Editor.caretOffset(line) : null;
      Editor.render(App.project, e, size);
      if (pos && off !== null) Editor.focusLine(pos.box, pos.i, off);
    }
  }

  function fillFolioSelect() {
    const sel = $('sel-folio');
    sel.innerHTML = '';
    App.entries.forEach((e, i) => {
      const prog = Model.pageProgress(App.project, e.label);
      const mark = prog >= 0.999 ? '●' : prog > 0 ? '◐' : '○';
      sel.appendChild(U.el('option', { value: String(i), selected: i === App.idx }, mark + '  ' + e.label + (e.pdfPage ? '   ·  PDF p. ' + e.pdfPage + (e.half !== null ? (e.half ? ' (lower)' : ' (upper)') : '') : '   ·  not in PDF')));
    });
    $('folio-count').textContent = (App.idx + 1) + ' / ' + App.entries.length;
  }

  const updateProgress = U.debounce(() => {
    if (!App.project) return;
    const sel = $('sel-folio');
    const opt = sel.options[App.idx];
    const e = entry();
    if (opt && e) {
      const prog = Model.pageProgress(App.project, e.label);
      opt.textContent = (prog >= 0.999 ? '●' : prog > 0 ? '◐' : '○') + opt.textContent.slice(1);
    }
  }, 600);

  /* ---------- editor hooks ---------- */

  function onLineFocus(pos) {
    const e = entry();
    const rect = Model.lineRect(App.project, e, pos.box, pos.i);
    PdfView.setGuide(rect, App.project.settings.guide);
    updateStatus(pos);
  }

  function onCaret(pos, stack) {
    updateStatus(pos, stack);
    const line = Editor.activeLine();
    if (line) PdfView.followX(Editor.caretFraction(line));
    if (App.project.ui.sidebarTab === 'tag') Commands.renderInspector($('tab-tag'), stack);
  }

  function updateStatus(pos, stack) {
    const p = App.project;
    if (!p) return;
    const e = entry();
    const parts = [U.el('b', null, 'Folio ' + e.label)];
    if (pos) {
      const type = Model.pageLayout(p, e.label);
      const n = Model.lineCount(p, e.label, pos.box);
      const stream = Model.streamOfBox(type, pos.box);
      parts.push(' · ' + Model.STREAMS[stream.key].label + (stream.boxes.length > 1 ? ' (' + Model.BOX_LABEL[pos.box].toLowerCase() + ')' : '') + ' · line ' + (pos.i + 1) + ' of ' + n);
    }
    if (stack && stack.length) {
      parts.push(U.el('span', { class: 'crumbs' }, stack.map((el) => {
        const a = JSON.parse(el.dataset.a || '{}');
        return U.el('span', { class: 'crumb' }, el.dataset.t === 'x-marker' ? a.type : '<' + el.dataset.t + '>');
      })));
    }
    const ak = Editor.insideAksara();
    if (ak) parts.push(U.el('span', { class: 'pending-status', title: 'The cursor stands inside an akṣara' }, '  ·  inside akṣara: ' + ak));
    if (Editor.multi) parts.push(U.el('span', { class: 'pending-status' }, '  ·  selection over several lines — press a tag shortcut'));
    const pd = Editor.pending;
    if (pd) {
      parts.push(U.el('span', { class: 'pending-status' }, '  ·  ↦ tag starts at ' + pd.label + ', ' + Model.BOX_LABEL[pd.box].toLowerCase() + ' line ' + (pd.i + 1) + ' — put the cursor at its end and press the tag’s shortcut ',
        U.el('button', { title: 'Cancel (Esc)', onclick: () => { Editor.setPending(null); } }, '×')));
    }
    const host = $('status-pos');
    host.innerHTML = '';
    host.append(...parts);
    const tl = p.settings.translit;
    const badge = $('translit-badge');
    badge.textContent = tl && tl !== 'off' ? Translit.SCHEMES[tl].short : 'Unicode';
    badge.classList.toggle('on', !!tl && tl !== 'off');
    badge.title = 'Typing: ' + Translit.SCHEMES[tl || 'off'].label + ' — click or ' + Commands.keyLabel('K') + ' to toggle';
  }

  App.toggleTranslit = function () {
    const s = App.project.settings;
    if (s.translit && s.translit !== 'off') { s.translitLast = s.translit; s.translit = 'off'; } else s.translit = s.translitLast || 'itrans-deva';
    App.changed(true);
    updateStatus(Editor.current);
    U.$$('.tl-badge').forEach((b) => { b.textContent = UI.translitBadge(); });
    U.toast('Typing: ' + Translit.SCHEMES[s.translit].label);
  };

  /* ---------- lines & layout ---------- */

  App.setLines = async function (box, n, scope, focus) {
    const p = App.project;
    const e = entry();
    if (n < 1 || n > 120) return;
    const b = box === 'gloss' ? 'main' : box;
    const pg = Model.page(p, e.label);
    const affected = [b];
    if (Model.pageLayout(p, e.label) === 'interlinear' && b === 'main') affected.push('gloss');
    const lost = affected.some((x) => (pg.boxes[x] || []).slice(n).some(TEI.hasContent));
    if (lost && !(await UI.confirm('Lines after line ' + n + ' of the ' + Model.BOX_LABEL[b].toLowerCase() + ' block contain text, which will be deleted.', { ok: 'Delete those lines', danger: true }))) return;
    if (scope === 'default') {
      p.layout.lines[b] = n;
    } else {
      pg.lines = pg.lines || {};
      pg.lines[b] = n;
    }
    for (const x of affected) if (pg.boxes[x] && pg.boxes[x].length > n) pg.boxes[x].length = n;
    App.changed();
    rerender(focus);
  };

  // Enter on the last line of a block: the block gets one more line on this folio.
  App.addLine = function (box) {
    const p = App.project;
    const b = box === 'gloss' ? 'main' : box;
    const n = Model.lineCount(p, entry().label, b);
    if (n >= 120) return;
    Editor.capture('command');
    const pg = Model.page(p, entry().label);
    pg.lines = Object.assign(pg.lines || {}, { [b]: n + 1 });
    App.changed();
    rerender({ box, i: n, offset: 'start' });
  };

  // Backspace in an empty added last line removes it again.
  App.removeLastLine = function (box) {
    const p = App.project;
    const b = box === 'gloss' ? 'main' : box;
    const pg = Model.page(p, entry().label);
    const n = Model.lineCount(p, entry().label, b);
    const boxes = Model.pageLayout(p, entry().label) === 'interlinear' && b === 'main' ? ['main', 'gloss'] : [b];
    if (n <= 1 || boxes.some((x) => TEI.hasContent((pg.boxes[x] || [])[n - 1]))) return false;
    Editor.capture('command');
    pg.lines = Object.assign(pg.lines || {}, { [b]: n - 1 });
    for (const x of boxes) if (pg.boxes[x] && pg.boxes[x].length > n - 1) pg.boxes[x].length = n - 1;
    App.changed();
    rerender({ box, i: n - 2, offset: 'end' });
    return true;
  };

  // focus: {box, i, offset: number | 'start' | 'end'}; default keeps the current line
  function rerender(focus) {
    const e = entry();
    const pos = focus || Editor.current;
    const g = Model.geometry(App.project, e, App.pageSizes[e.pdfPage] || (App.project.pdf && App.project.pdf.size));
    if (PdfView.doc) App.pdfShown = PdfView.show(e, g.leaf);
    Editor.render(App.project, e, App.pageSizes[e.pdfPage] || (App.project.pdf && App.project.pdf.size));
    $('calib-hint').hidden = g.calibrated || !PdfView.doc;
    App.refreshSidebar();
    if (pos && g.lines[pos.box] && Editor.lineEl(pos.box, Math.min(pos.i, g.lines[pos.box] - 1))) {
      Editor.focusLine(pos.box, Math.min(pos.i, g.lines[pos.box] - 1), pos.offset === undefined ? 'end' : pos.offset);
    }
  }
  App.rerender = rerender;

  // Text kept in blocks a layout does not have (it is not lost, but hidden and not exported).
  function hiddenText(p, label, type) {
    const pg = p.pages[label];
    if (!pg) return false;
    const boxes = Model.LAYOUTS[type].boxes;
    return Object.entries(pg.boxes).some(([b, lines]) => !boxes.includes(b) && lines.some(TEI.hasContent));
  }

  App.setLayout = async function (type, scope) {
    const p = App.project;
    const e = entry();
    if (scope === 'page') {
      const pg = Model.page(p, e.label);
      if (hiddenText(p, e.label, type || p.layout.type) && !(await UI.confirm('This folio has text in blocks that the ' + Model.LAYOUTS[type || p.layout.type].label + ' layout does not have. That text is kept, but hidden and not exported until you switch back.', { ok: 'Change layout' }))) return App.refreshSidebar();
      if (type) pg.layout = type; else delete pg.layout;
    } else {
      const n = Object.keys(p.pages).filter((l) => !p.pages[l].layout && hiddenText(p, l, type)).length;
      if (n && !(await UI.confirm(n + ' folio side(s) have text in blocks that the ' + Model.LAYOUTS[type].label + ' layout does not have. That text is kept, but hidden and not exported until you switch back.', { ok: 'Change layout' }))) { $('sel-layout').value = p.layout.type; return; }
      p.layout.type = type;
    }
    App.changed();
    rerender();
  };

  /* ---------- calibration ---------- */

  App.calibrate = async function () {
    const p = App.project;
    const e = entry();
    if (!PdfView.doc || !e.pdfPage) { U.toast('Load the PDF first', 'warn'); return; }
    const type = Model.pageLayout(p, e.label);
    const boxes = Model.LAYOUTS[type].boxes.filter((b) => b !== 'gloss');
    const blockText = {
      main: type === 'linear' ? 'the block of text lines' : type === 'interlinear' ? 'the text block, including the interlinear commentary lines' : 'the central block of the main text',
      top: 'the top block of commentary', bottom: 'the bottom block of commentary', left: 'the left block of commentary', right: 'the right block of commentary',
    };
    const steps = [{ key: 'leaf', title: 'Leaf', color: Model.BOX_COLOR.leaf, label: 'Drag a rectangle around the leaf — the folio itself, without the scanner background or page header.' }]
      .concat(boxes.map((b) => ({ key: b, title: Model.BOX_LABEL[b], color: Model.BOX_COLOR[b], lines: Model.lineCount(p, e.label, b), label: 'Drag a rectangle tightly around ' + blockText[b] + ' (top of its first line to bottom of its last line), then check the number of lines.' })));
    const reg = Model.regions(p, e);
    const existing = reg ? Object.assign({ leaf: reg.leaf }, reg.boxes || {}) : {};
    if (!existing.leaf) { const leaf = PdfView.detectLeaf(); if (leaf) existing.leaf = leaf; }
    const res = await PdfView.calibrate(steps, existing);
    if (!res) return;
    const regions = { leaf: res.rects.leaf || Model.defaultLeaf(e), boxes: {} };
    for (const b of boxes) if (res.rects[b]) regions.boxes[b] = res.rects[b];
    const scope = await UI.modal({
      title: 'Apply calibration to…',
      body: U.el('p', null, 'Manuscripts are usually scanned consistently, so one calibration normally fits every folio side. You can recalibrate single folios later.'),
      buttons: [{ label: 'This folio side only', value: 'page' }, { label: e.half !== null ? 'All ' + (e.half ? 'lower' : 'upper') + ' halves' : 'All folio sides', kind: 'primary', value: 'all' }],
    });
    Model.setRegions(p, e, regions, scope === 'page' ? 'page' : 'all');
    // line counts set while calibrating: the usual count for the manuscript, or for this folio only
    const pg = Model.page(p, e.label);
    for (const [b, n0] of Object.entries(res.lines || {})) {
      const sameBoxes = type === 'interlinear' && b === 'main' ? ['main', 'gloss'] : [b];
      let last = 0;
      for (const x of sameBoxes) (pg.boxes[x] || []).forEach((l, k) => { if (TEI.hasContent(l)) last = Math.max(last, k + 1); });
      const n = Math.max(n0, last);
      if (n !== n0) U.toast(Model.BOX_LABEL[b] + ': kept ' + n + ' lines, because line ' + last + ' has text', 'warn', 4000);
      if (scope === 'page') pg.lines = Object.assign(pg.lines || {}, { [b]: n });
      else { p.layout.lines[b] = n; if (pg.lines) delete pg.lines[b]; }
    }
    App.changed();
    rerender();
    U.toast('Calibrated. The typing area now follows the manuscript; a soft band on the PDF follows your line.', 'ok', 4500);
  };

  /* ---------- side panel ---------- */

  App.refreshSidebar = function () {
    const p = App.project;
    if (!p) return;
    const tab = p.ui.sidebarTab || 'tag';
    U.$$('.side-tab').forEach((t) => t.classList.toggle('sel', t.dataset.tab === tab));
    U.$$('.side-panel').forEach((t) => { t.hidden = t.id !== 'tab-' + tab; });
    if (tab === 'tag') Commands.renderInspector($('tab-tag'), Editor.tagStack());
    if (tab === 'folio') renderFolioTab();
    if (tab === 'works') renderWorksTab();
    if (tab === 'ms') renderMsTab();
  };

  function renderFolioTab() {
    const p = App.project;
    const e = entry();
    const host = $('tab-folio');
    host.innerHTML = '';
    const pg = p.pages[e.label] || {};
    const type = Model.pageLayout(p, e.label);
    const ovKey = e.key;
    const labelInp = U.el('input', { type: 'text', value: e.label });
    const renameBtn = U.el('button', { class: 'btn small', onclick: async () => {
      const v = labelInp.value.trim();
      if (!v || v === e.label) return;
      if (App.entries.some((x) => x.label === v)) { U.toast('Folio ' + v + ' already exists', 'warn'); return; }
      if (e.orphan) { U.toast('This folio is not mapped to a PDF page', 'warn'); return; }
      if (p.pages[e.label]) { p.pages[v] = p.pages[e.label]; delete p.pages[e.label]; }
      p.folios.overrides[ovKey] = v;
      App.entries = Model.entries(p);
      App.changed();
      App.go(App.entries.findIndex((x) => x.label === v), { noFocus: true });
    } }, 'Rename');
    const layoutSel = U.el('select', { onchange: () => App.setLayout(layoutSel.value || null, 'page') },
      U.el('option', { value: '' }, 'Project default (' + Model.LAYOUTS[p.layout.type].label + ')'),
      Object.entries(Model.LAYOUTS).map(([k, L]) => U.el('option', { value: k, selected: pg.layout === k }, L.label)));
    const linesBox = U.el('div', { class: 'lines-inputs' });
    for (const b of Model.LAYOUTS[type].boxes) {
      if (b === 'gloss') continue;
      const n = Model.lineCount(p, e.label, b);
      const custom = pg.lines && pg.lines[b];
      const inp = U.el('input', { type: 'number', min: '1', max: '120', value: n, onchange: () => App.setLines(b, parseInt(inp.value, 10) || 1) });
      linesBox.appendChild(U.el('label', { class: 'field small' + (custom ? ' custom' : '') }, U.el('span', null, Model.BOX_LABEL[b]), inp));
    }
    const reg = Model.regions(p, e);
    const ownReg = !!pg.regions;
    host.append(
      U.el('h4', null, 'Folio side ' + e.label + (e.pdfPage ? ' · PDF page ' + e.pdfPage : '')),
      U.el('div', { class: 'inline-field' }, U.el('label', null, 'Label'), labelInp, renameBtn),
      U.el('p', { class: 'help' }, 'Rename to fix the numbering (e.g. a missing or doubled folio). Following folios are not renumbered.'),
      U.el('h4', null, 'Layout'), layoutSel,
      U.el('h4', null, 'Lines on this folio side'), linesBox,
      pg.lines ? U.el('button', { class: 'btn small ghost', onclick: () => { delete pg.lines; App.changed(); rerender(); } }, 'Use the project defaults') : null,
      U.el('h4', null, 'Calibration'),
      U.el('p', { class: 'help' }, reg ? (ownReg ? 'This folio side has its own calibration.' : 'Calibrated (shared with other folio sides).') + ' The typing area copies the blocks drawn on the PDF.' : 'Not calibrated: the typing area uses a standard layout and the line guide on the PDF is off.'),
      U.el('div', { class: 'btn-row' },
        U.el('button', { class: 'btn small primary', onclick: () => App.calibrate() }, reg ? 'Recalibrate…' : 'Calibrate…'),
        ownReg ? U.el('button', { class: 'btn small ghost', onclick: () => { delete pg.regions; App.changed(); rerender(); } }, 'Use shared calibration') : null),
      U.el('h4', null, 'Progress'),
      U.el('div', { class: 'progress' }, U.el('i', { style: { width: Math.round(Model.pageProgress(p, e.label) * 100) + '%' } })),
      U.el('p', { class: 'help' }, Math.round(Model.pageProgress(p, e.label) * 100) + '% of the lines of this folio side have text.'),
    );
  }

  function renderWorksTab() {
    const p = App.project;
    const host = $('tab-works');
    host.innerHTML = '';
    const usage = Commands.workUsage();
    host.appendChild(U.el('p', { class: 'help' }, 'Works cited in this manuscript, most quoted first. When marking a quotation (' + Commands.keyLabel('Q') + ') you choose one of these; they are listed in the TEI header as <bibl>.'));
    for (const w of Commands.worksByUse()) {
      const t = U.el('input', { type: 'text', value: w.title, placeholder: 'Title', onchange: () => { w.title = t.value.trim(); App.changed(); Editor.refreshAll(); } });
      const a = U.el('input', { type: 'text', value: w.author, placeholder: 'Author', onchange: () => { w.author = a.value.trim(); App.changed(); } });
      const ab = U.el('input', { type: 'text', value: w.abbr || '', placeholder: 'Short label', onchange: () => { w.abbr = ab.value.trim(); App.changed(); Editor.refreshAll(); } });
      host.appendChild(U.el('div', { class: 'work-edit' }, t, U.el('div', { class: 'row2' }, a, ab),
        U.el('div', { class: 'work-foot' }, U.el('span', { class: 'help' }, (usage[w.id] || 0) + ' quotation(s) · id ' + w.id),
          U.el('button', { class: 'btn small danger-ghost', onclick: async () => {
            if (usage[w.id] && !(await UI.confirm('This work is quoted ' + usage[w.id] + ' time(s). Delete it anyway? The quotations stay, without a source.', { ok: 'Delete', danger: true }))) return;
            p.works = p.works.filter((x) => x !== w);
            App.changed();
            renderWorksTab();
            Editor.refreshAll();
          } }, 'Delete'))));
    }
    const nb = U.el('input', { type: 'text', placeholder: 'Short label (required), e.g. AK' });
    const nt = U.el('input', { type: 'text', placeholder: 'Work, e.g. Amarakośa' });
    const na = U.el('input', { type: 'text', placeholder: 'Author, e.g. Amarasiṃha' });
    const err = U.el('div', { class: 'field-error' });
    host.appendChild(U.el('div', { class: 'work-new' }, U.el('h4', null, 'Add a cited work'), nb, nt, na,
      U.el('p', { class: 'help' }, 'A short label and the work or the author are needed; a missing work or author is recorded as “Unknown”.'), err,
      U.el('button', { class: 'btn small primary', onclick: () => {
        const w = { abbr: nb.value, title: nt.value, author: na.value };
        const m = Commands.checkWork(w);
        if (m) { err.textContent = m; return; }
        Commands.addWork(w);
        renderWorksTab();
      } }, 'Add work')));
    host.appendChild(U.el('div', { class: 'work-new' }, U.el('h4', null, 'Import / export'),
      U.el('p', { class: 'help' }, 'A TSV file (tab-separated, e.g. saved from a spreadsheet) with the columns Short Label, Work, Author — one work per row. Use it to bring the list of cited works from an earlier transcription.'),
      U.el('div', { class: 'btn-row' },
        U.el('button', { class: 'btn small', onclick: () => importWorksTsv() }, 'Import TSV…'),
        p.works.length ? U.el('button', { class: 'btn small ghost', onclick: () => exportWorksTsv() }, 'Download as TSV') : null)));
  }

  // rows of: Short Label <tab> Work <tab> Author (a header row is recognised and skipped)
  function parseWorksTsv(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l, k) => ({ line: k + 1, cells: l.split('\t').map((c) => c.trim()) }))
      .filter((r) => r.cells.some((c) => c));
    if (rows.length && /short|label|abbr/i.test(rows[0].cells[0] || '') && /work|title/i.test(rows[0].cells[1] || '')) rows.shift();
    return rows.map((r) => ({ line: r.line, abbr: r.cells[0] || '', title: r.cells[1] || '', author: r.cells[2] || '' }));
  }

  function importWorksTsv() {
    const inp = U.el('input', { type: 'file', accept: '.tsv,.txt,.tab,text/tab-separated-values,text/plain' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      const rows = parseWorksTsv(await f.text());
      let added = 0;
      const skipped = [], invalid = [];
      for (const r of rows) {
        const m = Commands.checkWork(r);
        if (!m) { Commands.addWork(r, true); added++; } else if (/already used/.test(m)) skipped.push(r); else invalid.push('line ' + r.line + ': ' + m);
      }
      if (added) App.changed();
      App.refreshSidebar();
      if (!skipped.length && !invalid.length) { U.toast('Imported ' + added + ' cited work(s) from ' + f.name, 'ok'); return; }
      UI.modal({
        title: 'Cited works imported',
        body: U.el('div', null,
          U.el('p', null, added + ' work(s) added from ' + f.name + '.'),
          skipped.length ? U.el('p', { class: 'help' }, skipped.length + ' row(s) skipped because the short label is already in the list: ' + skipped.map((r) => r.abbr).join(', ')) : null,
          invalid.length ? U.el('div', null, U.el('p', { class: 'help' }, invalid.length + ' row(s) not imported:'), U.el('pre', { class: 'bulk-preview' }, invalid.join('\n'))) : null),
        buttons: [{ label: 'OK', kind: 'primary', value: null }],
      });
    });
    inp.click();
  }

  function exportWorksTsv() {
    const clean = (v) => String(v || '').replace(/[\t\r\n]+/g, ' ');
    const lines = ['Short Label\tWork\tAuthor'].concat(App.project.works.map((w) => [w.abbr, w.title, w.author].map(clean).join('\t')));
    U.download(baseName() + '-cited-works.tsv', lines.join('\n') + '\n', 'text/tab-separated-values');
  }

  function renderMsTab() {
    const p = App.project;
    const host = $('tab-ms');
    host.innerHTML = '';
    const f = UI.form([
      { n: 'title', label: 'Title of the text', type: 'text' },
      { n: 'author', label: 'Author', type: 'text' },
      { n: 'siglum', label: 'Siglum (used in the apparatus)', type: 'text' },
      { n: 'repository', label: 'Repository / library', type: 'text' },
      { n: 'settlement', label: 'Place', type: 'text' },
      { n: 'shelfmark', label: 'Accession / shelf number', type: 'text' },
      { n: 'scribe', label: 'Scribe', type: 'text' },
      { n: 'date', label: 'Date of copying', type: 'text', placeholder: 'e.g. VS 1745' },
      { n: 'material', label: 'Material', type: 'combo', options: ['paper', 'palm leaf', 'birch bark'] },
      { n: 'form', label: 'Form', type: 'select', options: ['pothi', 'codex', 'book'] },
      { n: 'script', label: 'Script of the manuscript', type: 'combo', options: ['sa-Deva', 'sa-Shrd', 'sa-Newa', 'sa-Beng', 'sa-Gujr', 'sa-Mlym', 'sa-Telu', 'sa-Knda', 'sa-Taml', 'sa-Gran', 'sa-Orya', 'sa-Sidd'], help: 'Written as textLang/@mainLang in the header.' },
      { n: 'textLang', label: 'Script of your transcription', type: 'select', options: ['sa-Latn', 'sa-Deva'], labels: ['IAST (sa-Latn) — recommended for Saktumiva', 'Devanagari (sa-Deva)'] },
      { n: 'transcriber', label: 'Transcribed by', type: 'text' },
      { n: 'notes', label: 'Notes', type: 'textarea' },
    ], p.meta);
    f.el.addEventListener('change', () => {
      Object.assign(p.meta, f.values());
      $('proj-title').textContent = (p.meta.title || 'Untitled') + (p.meta.siglum ? '  ·  ' + p.meta.siglum : '');
      App.changed();
    });
    // defaults
    const lines = linesInputs(p.layout.type, p.layout.lines);
    lines.el.addEventListener('change', async () => {
      const v = lines.values();
      let kept = 0;
      for (const [b, n] of Object.entries(v)) {
        if (n === p.layout.lines[b]) continue;
        // folios with more written lines than the new default keep their own count
        for (const pg of Object.values(p.pages)) {
          if (pg.lines && pg.lines[b]) continue;
          const arr = pg.boxes[b] || [];
          if (arr.slice(n).some(TEI.hasContent)) { pg.lines = pg.lines || {}; pg.lines[b] = p.layout.lines[b]; kept++; }
          else if (arr.length > n) arr.length = n;
        }
        p.layout.lines[b] = n;
      }
      if (kept) U.toast(kept + ' folio side(s) with more lines keep their own line count', 'info', 4000);
      App.changed();
      rerender();
    });
    const fo = p.folios;
    const numbering = UI.form([
      { n: 'firstPage', label: 'First PDF page with text', type: 'number' },
      { n: 'startNo', label: 'is folio number', type: 'number' },
      { n: 'startSide', label: 'side', type: 'select', options: ['r', 'v'], labels: ['recto', 'verso'] },
      { n: 'sidesPerPage', label: 'Each PDF page shows', type: 'select', options: ['1', '2'], labels: ['one folio side', 'two folio sides'] },
      { n: 'missing', label: 'Folios missing from the manuscript', type: 'text', placeholder: 'e.g. 7, 12-14, 20v', help: 'These numbers are skipped when the PDF pages are numbered, so that the pages after a gap keep their true folio numbers.' },
    ], { firstPage: fo.firstPage, startNo: fo.startNo, startSide: fo.startSide, sidesPerPage: String(fo.sidesPerPage), missing: fo.missing || '' });
    numbering.el.addEventListener('change', async () => {
      const v = numbering.values();
      const next = { firstPage: Math.max(1, +v.firstPage || 1), startNo: Math.max(0, +v.startNo || 0), startSide: v.startSide, sidesPerPage: +v.sidesPerPage, missing: v.missing };
      const bad = Model.parseMissing(v.missing).bad;
      if (bad.length) { U.toast('Missing folios: “' + bad[0] + '” is not understood. Write e.g. 7, 12-14, 20v', 'warn', 5000); return; }
      const hasData = Object.values(p.pages).some(Model.pageHasContent);
      if (hasData && !(await UI.confirm('Your transcription is stored by folio number. Changing the numbering changes which PDF page is shown next to each transcribed folio (the text itself stays with its folio number).', { ok: 'Change numbering' }))) { renderMsTab(); return; }
      Object.assign(p.folios, next);
      App.entries = Model.entries(p);
      App.changed();
      App.go(Math.min(App.idx, App.entries.length - 1), { noFocus: true });
    });
    host.append(
      U.el('h4', null, 'Manuscript & text'), f.el,
      U.el('h4', null, 'Default layout'), U.el('p', { class: 'help' }, Model.LAYOUTS[p.layout.type].label + ' (change it in the top bar). Usual lines per folio side:'), lines.el,
      U.el('h4', null, 'Folio numbering'), numbering.el,
      U.el('h4', null, 'PDF'),
      U.el('p', { class: 'help' }, p.pdf && p.pdf.name ? p.pdf.name + ' · ' + (p.pdf.pages || '?') + ' pages' : 'No PDF'),
      U.el('button', { class: 'btn small', onclick: () => App.pickPdf() }, 'Replace PDF…'),
      U.el('h4', null, 'Transcription XML'),
      U.el('p', { class: 'help' }, 'Bring in a transcription you already have, to add markup to it. <pb n="0005_1"> is folio 5, first side; <pb n="0005_2"> its back side. Line numbers in <lb n="…"> are kept; on a folio side without <lb> each carriage return starts a new line, and a line that does not end in a space continues its word on the next.'),
      U.el('button', { class: 'btn small', onclick: () => App.pickXml() }, 'Import transcription XML…'),
      U.el('h4', null, 'Tags and attributes'),
      ME.TagSummary.panel(p, () => App.flush(), App.goPlace),
      U.el('h4', null, 'Project file'),
      U.el('p', { class: 'help' }, 'Everything is saved automatically in this browser. Keep a backup file as well (Ctrl+S), especially before clearing browser data or moving to another computer.'),
      U.el('div', { class: 'btn-row' },
        U.el('button', { class: 'btn small', onclick: () => App.saveToFile() }, 'Save backup file'),
        U.el('button', { class: 'btn small ghost', onclick: () => App.showBackups() }, 'Restore an automatic backup…')),
    );
  }

  App.showBackups = async function () {
    const list = await Store.listBackups(App.project.id);
    if (!list.length) { U.toast('No automatic backups yet (one is kept every 20 minutes while you work)'); return; }
    const box = U.el('div', { class: 'backup-list' });
    let pick = null;
    for (const b of list) {
      const d = JSON.parse(b.data);
      const n = Object.values(d.pages || {}).filter(Model.pageHasContent).length;
      box.appendChild(U.el('label', { class: 'backup-item' }, U.el('input', { type: 'radio', name: 'bk', onchange: () => { pick = b; } }), new Date(b.when).toLocaleString() + ' — ' + n + ' folio side(s) with text'));
    }
    const ok = await UI.modal({
      title: 'Automatic backups', body: U.el('div', null, U.el('p', { class: 'help' }, 'Restoring replaces the current state of the project (a backup of the current state is downloaded first).'), box),
      buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Restore', kind: 'danger', value: true, validate: () => !!pick }],
    });
    if (!ok || !pick) return;
    U.download(baseName() + '-before-restore.manuscribe.json', projectJson(), 'application/json');
    const p = Model.upgrade(JSON.parse(pick.data));
    await Store.putProject(p);
    await App.open(p.id);
    U.toast('Backup restored', 'ok');
  };

  /* ---------- settings & help ---------- */

  App.showSettings = async function () {
    const s = App.project.settings;
    const f = UI.form([
      { n: 'modifier', label: 'Shortcut key for tags', type: 'select', options: ['alt', 'ctrlalt'], labels: [U.isMac ? 'Option ⌥ + letter' : 'Alt + letter', U.isMac ? 'Control ⌃ + Option ⌥ + letter (keeps ⌥ free for typing diacritics)' : 'Ctrl + Alt + letter'] },
      { n: 'translit', label: 'Typing', type: 'select', options: Object.keys(Translit.SCHEMES), labels: Object.values(Translit.SCHEMES).map((x) => x.label), help: 'If an input method such as Keyman misbehaves here, choose the matching built-in scheme and switch Keyman off.' },
      { n: 'geminate', label: 'Gemination: double the consonant after r while typing (dharmma, sarvva)', type: 'checkbox' },
      { n: 'paper', label: 'Paper colour of the typing area', type: 'select', options: ['auto', 'cream', 'white'], labels: ['Taken from the PDF', 'Cream', 'White'] },
      { n: 'guide', label: 'Line guide on the PDF', type: 'select', options: ['band', 'dim', 'off'], labels: ['Highlight the current line', 'Dim everything except the current line', 'Off'] },
      { n: 'showMarkers', label: 'Show paragraph / verse / quotation markers', type: 'checkbox' },
      { n: 'noAnchorIds', label: 'Notes without a placeholder in the text (types, separated by commas)', type: 'text', help: 'Notes with one of these types (e.g. the name of the work, the folio number, the author) are shown only in the margin, with no mark in the line.' },
    ], s);
    const v = await UI.modal({ title: 'Settings', body: f.el, buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Apply', kind: 'primary', value: () => f.values() }] });
    if (!v) return;
    if (v.translit !== 'off') v.translitLast = v.translit;
    Object.assign(s, v);
    TEI.setUnanchored(s.noAnchorIds);
    App.changed(true);
    Commands.buildToolbar($('toolbar'));
    rerender();
  };

  App.showHelp = function () {
    const k = Commands.keyLabel;
    const rows = (items) => U.el('table', { class: 'keys' }, items.map(([a, b]) => U.el('tr', null, U.el('td', null, U.el('kbd', null, a)), U.el('td', null, b))));
    const tagRows = Commands.REG.filter((c) => c.tag).map((c) => [k(c.key), c.label + ' <' + c.tag + '>' + (c.shiftRun ? (c.group === 'structure' ? ' — with Shift: end it' : ' — with Shift: choose attributes first') : '')]);
    const body = U.el('div', { class: 'help-body' },
      U.el('div', { class: 'help-cols' },
        U.el('div', null,
          U.el('h3', null, 'Typing'),
          rows([
            ['Enter', 'Go to the next line; on the last line of a block, a new line is added. The line being typed stays in the middle of the pane, and so does its line on the PDF'],
            ['Backspace', 'In an empty line that was added: remove it again'],
            ['↑ ↓', 'Line above / below — also across blocks'],
            [U.isMac ? '⌥ ↑ ↓ ← →' : 'Alt + arrows', 'Go to the block above / below / left / right (e.g. the top commentary)'],
            ['Tab / Shift+Tab', 'Next / previous block'],
            ['Shift+arrows, drag, Shift+click', 'Select over several lines, then press a tag shortcut'],
            ['Backspace / Delete', 'On a selection over several lines: delete its text (asks you to confirm twice)'],
            ['→ · ← · Shift+← →', '→ jumps a whole akṣara (conjuncts too); ← and Backspace go one sign at a time, e.g. between क and ि of कि; Shift+← → select sign by sign, and go on to the next line at the end of a line'],
            ['In a marginal note', 'Click its text and type or tag as in a line. Enter or Esc goes back to the line; its number opens the place, language and hand'],
            [k('Period'), 'Mark where a tag starts; then press the tag shortcut where it ends (any line or folio)'],
            ['← at start · → at end', 'Previous / next line'],
            ['→ at the end of a tag', 'Leave the tag and continue typing outside it'],
            [U.isMac ? '⌘Z  ⌘⇧Z' : 'Ctrl+Z  Ctrl+Y', 'Undo / redo (per folio side)'],
            [k('K'), 'Transliteration input on/off (set the scheme in Settings)'],
            [k('PageDown') + ' / ' + k('BracketRight'), 'Next folio side'],
            [k('PageUp') + ' / ' + k('BracketLeft'), 'Previous folio side'],
            [U.isMac ? '⌘S' : 'Ctrl+S', 'Save a backup file of the project'],
          ]),
          U.el('h3', null, 'Working with tags'),
          rows([
            [k('Enter'), 'Edit the tag at the cursor (or double-click it)'],
            [k('Backspace'), 'Remove the tag at the cursor (keeps the text)'],
            [k('T'), 'Find any tag or command by name'],
            [k('Slash') + ' or F1', 'This help'],
          ]),
          U.el('p', { class: 'help' }, 'Select text and press a shortcut to tag it. With nothing selected, wrapping tags (deletion, unclear…) start empty: type the text, then press the shortcut again or → to leave. Paragraph, verse and quotation markers may run across lines and folios; they become nested <p>, <lg>/<l> and <quote> on export.')),
        U.el('div', null, U.el('h3', null, 'Tags (Saktumiva TEI)'), rows(tagRows))),
      U.el('h3', null, 'Calibration'),
      U.el('p', null, 'Folio tab → Calibrate: draw the leaf and each block on the PDF. The typing area then has exactly the proportions of the manuscript and a band on the PDF follows the line you are typing.'));
    UI.modal({ title: 'Shortcuts & tag guide', body, wide: true, buttons: [{ label: 'Close', kind: 'primary', value: null }] });
  };

  /* ---------- chrome ---------- */

  function applyUiState() {
    const p = App.project;
    const ui = p.ui;
    $('pdf-pane').style.height = Math.round(U.clamp(ui.split || 0.46, 0.12, 0.85) * 100) + '%';
    document.body.classList.toggle('sidebar-open', !!ui.sidebar);
    $('sel-layout').value = p.layout.type;
    PdfView.mode = ui.pdfMode || 'leaf';
    PdfView.zoom = ui.pdfZoom || 1;
    PdfView.rotation = ui.rotation || 0;
    $('pdf-zoom').textContent = Math.round(PdfView.zoom * 100) + '%';
    $('btn-pdf-mode').textContent = PdfView.mode === 'leaf' ? 'Leaf' : 'Page';
    PdfView.setFilters(ui.filters || {});
    Editor.zoom = ui.editorZoom || 1;
    $('ed-zoom').textContent = Math.round(Editor.zoom * 100) + '%';
    $('font-size').textContent = Math.round((p.settings.textScale || 1) * 100) + '%';
  }

  function wireChrome() {
    $('btn-new').onclick = () => App.newProject();
    $('btn-import').onclick = () => App.importProject();
    $('btn-projects').onclick = () => App.showStart();
    $('btn-export').onclick = () => { App.flush(); Export.open(App.project, entry()); };
    $('btn-backup').onclick = () => App.saveToFile();
    $('btn-settings').onclick = () => App.showSettings();
    $('btn-help').onclick = () => App.showHelp();
    $('btn-sidebar').onclick = () => { App.project.ui.sidebar = !App.project.ui.sidebar; document.body.classList.toggle('sidebar-open', App.project.ui.sidebar); App.changed(true); };
    $('sel-layout').innerHTML = '';
    for (const [k, L] of Object.entries(Model.LAYOUTS)) $('sel-layout').appendChild(U.el('option', { value: k }, L.label));
    $('sel-layout').onchange = (e) => App.setLayout(e.target.value, 'default');
    $('sel-folio').onchange = (e) => App.go(+e.target.value);
    $('btn-prev').onclick = () => App.step(-1);
    $('btn-next').onclick = () => App.step(1);
    $('btn-copy-folio').addEventListener('mousedown', (e) => e.preventDefault());
    $('btn-copy-folio').onclick = async () => {
      App.flush();
      const r = Export.folioXml(App.project, entry());
      if (!r.xml) { U.toast('Folio ' + entry().label + ' has no text yet', 'warn'); return; }
      if (await U.copyText(r.xml)) U.toast('Copied the XML of folio ' + entry().label + ' (' + r.lines + ' lines)', 'ok');
      else U.toast('Could not copy to the clipboard', 'warn');
    };
    $('translit-badge').onclick = () => App.toggleTranslit();
    for (const t of U.$$('.side-tab')) t.onclick = () => { App.project.ui.sidebarTab = t.dataset.tab; App.changed(true); App.refreshSidebar(); };

    // PDF controls
    $('btn-zoom-in').onclick = () => PdfView.setZoom(PdfView.zoom * 1.2);
    $('btn-zoom-out').onclick = () => PdfView.setZoom(PdfView.zoom / 1.2);
    $('pdf-zoom').onclick = () => PdfView.setZoom(1);
    $('btn-pdf-mode').onclick = () => {
      const m = PdfView.mode === 'leaf' ? 'page' : 'leaf';
      App.project.ui.pdfMode = m;
      $('btn-pdf-mode').textContent = m === 'leaf' ? 'Leaf' : 'Page';
      PdfView.setMode(m);
      App.changed(true);
    };
    $('btn-rotate').onclick = () => { App.project.ui.rotation = ((App.project.ui.rotation || 0) + 90) % 360; PdfView.setRotation(App.project.ui.rotation); App.changed(true); };
    $('btn-calibrate').onclick = () => App.calibrate();
    $('btn-filters').onclick = () => {
      const pop = $('filters-pop');
      pop.hidden = !pop.hidden;
      if (!pop.hidden) {
        const f = App.project.ui.filters;
        $('f-b').value = f.b; $('f-c').value = f.c; $('f-inv').checked = !!f.inv; $('f-gray').checked = !!f.gray;
      }
    };
    const onFilter = () => {
      const f = { b: +$('f-b').value, c: +$('f-c').value, inv: $('f-inv').checked, gray: $('f-gray').checked };
      App.project.ui.filters = f;
      PdfView.setFilters(f);
      App.changed(true);
    };
    ['f-b', 'f-c', 'f-inv', 'f-gray'].forEach((id) => $(id).addEventListener('input', onFilter));
    $('f-reset').onclick = () => { $('f-b').value = 100; $('f-c').value = 100; $('f-inv').checked = false; $('f-gray').checked = false; onFilter(); };

    // editor zoom
    const setEd = (z) => { Editor.setZoom(z); App.project.ui.editorZoom = Editor.zoom; $('ed-zoom').textContent = Math.round(Editor.zoom * 100) + '%'; App.changed(true); };
    $('btn-ed-in').onclick = () => setEd(Editor.zoom * 1.15);
    $('btn-ed-out').onclick = () => setEd(Editor.zoom / 1.15);
    $('ed-zoom').onclick = () => setEd(1);

    // size of the letters in the typing area (the lines and blocks keep their places)
    const setFont = (f) => {
      const s = App.project.settings;
      s.textScale = Math.round(U.clamp(f, 0.5, 2) * 20) / 20;
      $('font-size').textContent = Math.round(s.textScale * 100) + '%';
      Editor.relayout();
      App.changed(true);
    };
    $('btn-font-up').onclick = () => setFont((App.project.settings.textScale || 1) + 0.05);
    $('btn-font-down').onclick = () => setFont((App.project.settings.textScale || 1) - 0.05);
    $('font-size').onclick = () => setFont(1);
    for (const id of ['btn-font-up', 'btn-font-down', 'font-size']) $(id).addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in the line

    // splitter between the PDF and the typing area
    const grip = $('midbar-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const ws = $('workspace').getBoundingClientRect();
      const move = (ev) => {
        const frac = U.clamp((ev.clientY - ws.top) / ws.height, 0.1, 0.85);
        $('pdf-pane').style.height = frac * 100 + '%';
        App.project.ui.split = frac;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); App.changed(true); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    App.boot().catch((e) => { console.error(e); U.toast('Startup failed: ' + e.message, 'err', 10000); });
  });
})(window.ME);
