'use strict';
/* Keeping work safe outside the browser. A browser keeps Manuscribe's work, and clearing its data, or Safari's
   clearing of a site not visited for a while, deletes it; the automatic backups are in the browser too. So:

   - Back up everything: one file (a ZIP) with every transcription and every edition, its collation tables and
     merges included, as they are in this browser; Open… reads it back, adding what is not here and replacing only
     what the backup has newer. The PDFs are not in it: they are the editor's own files, and are asked for again.
   - A backup folder (Chrome, Edge): chosen once; Manuscribe then writes "Manuscribe backup.zip" there by itself,
     a few minutes after a change and when the window is left, with a dated copy of each day, the last seven kept.
   - A reminder elsewhere (Safari, Firefox), or while the folder waits for permission: after an hour of work not
     saved outside the browser, a bar offers a backup. */
(function (ME) {
  const Safety = {};
  const { Store } = ME;
  const HOUR = 3600 * 1000, SOON = 2 * 60 * 1000, DAYS_KEPT = 7;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) { /* this visit only */ } },
  };
  // when work was last saved outside the browser, and since when it has changed without being
  const OUTSIDE = 'manuscribe.savedOutside', SINCE = 'manuscribe.unsavedSince';
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';
  const stamp = (d) => d.toISOString().slice(0, 10);

  /* ---------- changes ---------- */
  // what is written to the store is what may need saving outside it; the raw writes, for restoring
  const raw = { putProject: Store.putProject.bind(Store), putEdition: Store.putEdition.bind(Store), putCollation: Store.putCollation.bind(Store) };
  let muted = 0;
  const changed = () => { if (muted) return; if (!ls.get(SINCE)) ls.set(SINCE, Date.now()); Safety.soon(); };
  Store.putProject = async (p) => { const r = await raw.putProject(p); changed(); return r; };
  Store.putEdition = async (ed) => { const r = await raw.putEdition(ed); changed(); return r; };
  Store.putCollation = async (rec) => { const r = await raw.putCollation(rec); changed(); return r; };

  /* Work saved outside the browser: by a backup of everything, a write to the folder, a project's backup file
     (Ctrl+S) or an edition package. */
  Safety.savedOutside = function () {
    ls.set(OUTSIDE, Date.now());
    ls.set(SINCE, null);
    const b = document.getElementById('safety-bar');
    if (b) b.remove();
    Safety.draw();
  };
  Safety.lastOutside = () => +ls.get(OUTSIDE) || 0;
  Safety.unsavedSince = () => +ls.get(SINCE) || 0;

  /* ---------- everything, in one file ---------- */
  /* -> {files: [{name, data}], counts} */
  Safety.everything = async function () {
    if (ME.App && ME.App.flush) ME.App.flush();
    const savedAt = new Date().toISOString();
    const projects = await Store.listProjects();
    const editions = await Store.listEditions();
    const files = [];
    for (const p of projects) {
      const full = (await Store.getProject(p.id)) || p;
      const m = full.meta || {};
      files.push({ name: 'transcriptions/' + safe([m.title, m.siglum].filter(Boolean).join(' ')) + ' ' + full.id + '.manuscribe.json', data: JSON.stringify({ manuscribe: 1, savedAt, project: full }) });
    }
    for (const ed of editions) {
      const collations = await Store.listCollations(ed.id);
      const merges = await Store.listMerges(ed.id);
      files.push({ name: 'editions/' + safe(ed.title) + ' ' + ed.id + '.json', data: JSON.stringify({ manuscribe: 1, kind: 'edition', savedAt, edition: ed, collations, merges }) });
    }
    const packs = await Store.listPacks();
    if (packs.length) files.push({ name: 'packs.json', data: JSON.stringify(packs) });
    const counts = { transcriptions: projects.length, editions: editions.length };
    files.unshift({ name: 'manuscribe-backup.json', data: JSON.stringify({ manuscribe: 1, kind: 'everything', savedAt, version: ME.VERSION, counts, note: 'Every transcription and edition of one browser, made by Manuscribe. Open it with Open… on the start screen. The PDFs are not included.' }, null, 1) });
    return { files, counts };
  };

  Safety.backupAll = async function () {
    const { files, counts } = await Safety.everything();
    ME.U.download('Manuscribe backup ' + stamp(new Date()) + '.zip', await ME.Zip.write(files));
    Safety.savedOutside();
    ME.U.toast('Saved a backup of ' + counts.transcriptions + ' transcription(s) and ' + counts.editions + ' edition(s). The PDFs are not in it: keep your PDF files.', 'ok', 6000);
  };

  /* A backup of everything, read back: what is not here is added, what is here is replaced only if the backup's is
     newer (after an automatic backup of it). zip: Map(name -> bytes). -> {added, replaced, kept} or null */
  Safety.isBackup = (zip) => zip instanceof Map && zip.has('manuscribe-backup.json');
  Safety.restore = async function (zip, opts) {
    const text = (b) => (typeof b === 'string' ? b : new TextDecoder().decode(b));
    const head = JSON.parse(text(zip.get('manuscribe-backup.json')));
    if (!(opts && opts.quiet)) {
      const ok = await ME.UI.confirm('This backup of ' + new Date(head.savedAt).toLocaleString() + ' holds ' + head.counts.transcriptions + ' transcription(s) and ' + head.counts.editions + ' edition(s). What is not in this browser is added; what is here already is replaced only where the backup’s copy is newer. The PDFs are not in a backup: Manuscribe asks for each when it is opened.', { title: 'Restore a backup', ok: 'Restore' });
      if (!ok) return null;
    }
    const n = { added: 0, replaced: 0, kept: 0 };
    muted++;
    try {
      for (const [name, bytes] of zip) {
        if (/^transcriptions\/.*\.json$/.test(name)) {
          const p = ME.Model.upgrade(JSON.parse(text(bytes)).project);
          const here = await Store.getProject(p.id);
          if (here && (here.modified || 0) >= (p.modified || 0)) { n.kept++; continue; }
          if (here) { await Store.backupNow(here); n.replaced++; } else n.added++;
          await raw.putProject(p);
        } else if (/^editions\/.*\.json$/.test(name)) {
          const d = JSON.parse(text(bytes));
          const here = await Store.getEdition(d.edition.id);
          if (here && (here.modified || 0) >= (d.edition.modified || 0)) { n.kept++; continue; }
          if (here) { await Store.deleteCollations(here.id); n.replaced++; } else n.added++;
          await raw.putEdition(d.edition);
          for (const c of d.collations || []) await raw.putCollation(c);
          for (const m of d.merges || []) await Store.putMerge(m);
        } else if (name === 'packs.json') {
          for (const pk of JSON.parse(text(bytes))) await Store.putPack(pk);
        }
      }
    } finally { muted--; }
    return n;
  };

  /* ---------- the backup folder ---------- */
  Safety.canFolder = () => typeof window.showDirectoryPicker === 'function';
  let folder = null, state = 'none', writing = null, timer = null;
  Safety.state = () => state;
  Safety.folderName = () => (folder ? folder.name : '');
  Safety.lastWrite = 0;

  // (a handle may also be given, as the tests give one of the browser's own private folder)
  Safety.useFolder = async function (handle) {
    folder = handle;
    await Store.putSetting({ id: 'backup-folder', handle }).catch(() => false);
    state = 'ok';
    await Safety.write(true);
  };
  Safety.chooseFolder = async function () {
    try {
      const h = await window.showDirectoryPicker({ id: 'manuscribe-backups', mode: 'readwrite', startIn: 'documents' });
      await Safety.useFolder(h);
      ME.U.toast('Backups now go to the folder “' + h.name + '”, by themselves.', 'ok', 5000);
    } catch (e) { if (e && e.name !== 'AbortError') ME.U.toast('Could not use that folder: ' + e.message, 'err', 6000); }
  };
  Safety.stopFolder = async function () {
    folder = null; state = 'none';
    await Store.deleteSetting('backup-folder').catch(() => {});
    Safety.draw();
  };
  // the browser asks again after a restart, unless it was told to allow it always: one click
  Safety.resume = async function () {
    if (!folder) return;
    try { if ((await folder.requestPermission({ mode: 'readwrite' })) === 'granted') { state = 'ok'; await Safety.write(true); } } catch (e) { /* stays paused */ }
    Safety.draw();
  };
  async function permitted() {
    // a folder without permissions to ask for (the browser's own private one) may always be written
    if (typeof folder.queryPermission !== 'function') return true;
    try { return (await folder.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
  }
  async function put(dir, name, blob) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }
  /* Writes everything to the folder, if anything changed since the last time (or always). */
  Safety.write = async function (always) {
    if (!folder) return false;
    if (writing) return writing;
    if (!always && !Safety.unsavedSince()) return false;
    writing = (async () => {
      if (!(await permitted())) { state = 'paused'; return false; }
      try {
        const { files } = await Safety.everything();
        const blob = await ME.Zip.write(files);
        await put(folder, 'Manuscribe backup.zip', blob);
        // a copy of each day, the last few kept
        const today = 'Manuscribe backup ' + stamp(new Date()) + '.zip';
        await put(folder, today, blob);
        const days = [];
        for await (const [name] of folder.entries()) if (/^Manuscribe backup \d{4}-\d\d-\d\d\.zip$/.test(name)) days.push(name);
        for (const old of days.sort().slice(0, Math.max(0, days.length - DAYS_KEPT))) await folder.removeEntry(old).catch(() => {});
        state = 'ok';
        Safety.lastWrite = Date.now();
        Safety.savedOutside();
        return true;
      } catch (e) { state = 'failed'; Safety.error = e.message; return false; }
    })();
    try { return await writing; } finally { writing = null; Safety.draw(); }
  };
  Safety.soon = function () {
    if (!folder || timer) return;
    timer = setTimeout(() => { timer = null; Safety.write(); }, SOON);
  };
  Safety.flush = function () { if (timer) { clearTimeout(timer); timer = null; } return Safety.write(); };

  /* ---------- the reminder ---------- */
  let snoozed = 0;
  Safety.check = function (now) {
    const t = now || Date.now();
    const since = Safety.unsavedSince();
    if (!since || t - since < HOUR || t - snoozed < HOUR || state === 'ok' || document.getElementById('safety-bar')) return false;
    const bar = ME.Install && ME.Install.bar;
    if (!bar) return false;
    const later = () => { snoozed = Date.now(); };
    if (state === 'paused') bar('safety-bar', 'Backups to the folder “' + folder.name + '” are waiting for your permission.', { label: 'Resume backups' }, () => Safety.resume(), later);
    else if (Safety.canFolder()) bar('safety-bar', 'Your work of the last hour is only in this browser. Choose a folder, and Manuscribe keeps a backup there by itself.', { label: 'Choose a folder…' }, () => Safety.chooseFolder(), later);
    else bar('safety-bar', 'Your work of the last hour is only in this browser. Save a backup file of everything, to keep it safe.', { label: 'Back up everything' }, () => Safety.backupAll(), later);
    return true;
  };

  /* ---------- on the start screen ---------- */
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  Safety.draw = function () {
    const row = document.getElementById('safety-row');
    if (!row) return;
    const U = ME.U;
    row.innerHTML = '';
    const say = U.el('p', { class: 'safety-say' });
    const btns = U.el('span', { class: 'safety-btns' });
    btns.appendChild(U.el('button', { class: 'btn small', dataset: { action: 'backup-all' }, title: 'Every transcription and edition of this browser in one file, to keep or to take to another computer (not the PDFs)', onclick: () => Safety.backupAll() }, '⤓ Back up everything'));
    if (folder && state === 'paused') {
      say.append('Backups to the folder ', U.el('b', null, folder.name), ' are waiting for your permission.');
      btns.appendChild(U.el('button', { class: 'btn small primary', onclick: () => Safety.resume() }, 'Resume backups'));
    } else if (folder) {
      say.append(state === 'failed' ? '⚠ The last backup to ' : '✓ Backups go to the folder ', U.el('b', null, folder.name), state === 'failed' ? ' failed: ' + (Safety.error || '') : ' by themselves; the last ' + ago(Safety.lastWrite || Safety.lastOutside()) + '.');
      btns.appendChild(U.el('button', { class: 'btn small ghost', onclick: () => Safety.chooseFolder() }, 'Change folder'));
      btns.appendChild(U.el('button', { class: 'btn small ghost', onclick: () => Safety.stopFolder() }, 'Stop'));
    } else {
      say.append('Saved outside this browser: ', U.el('b', null, ago(Safety.lastOutside())), '. ');
      if (Safety.canFolder()) {
        say.append('Choose a folder, and Manuscribe keeps a backup there by itself.');
        btns.appendChild(U.el('button', { class: 'btn small', dataset: { action: 'backup-folder' }, onclick: () => Safety.chooseFolder() }, 'Keep backups in a folder…'));
      } else say.append('Clearing the browser’s data deletes your work: back it up now and then.');
    }
    row.append(say, btns);
  };

  /* ---------- starting ---------- */
  Safety.start = async function () {
    if (Safety.canFolder()) {
      const rec = await Store.getSetting('backup-folder').catch(() => null);
      if (rec && rec.handle) { folder = rec.handle; state = (await permitted()) ? 'ok' : 'paused'; if (state === 'ok') Safety.soon(); }
    }
    Safety.draw();
    setInterval(() => { Safety.check(); if (document.getElementById('safety-row')) Safety.draw(); }, 5 * 60 * 1000);
    // leaving the window: write now, if anything changed
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Safety.flush(); });
  };

  ME.Safety = Safety;
})(window.ME);
