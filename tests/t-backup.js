// Work kept safe outside the browser (safety.js): a backup of everything holds every transcription and edition,
// collation tables included, and reads back into an empty browser as it was, adding what is missing and replacing
// only what is older; a backup folder (here the browser's own private folder stands in for one chosen) gets
// "Manuscribe backup.zip" and a copy of each day, the last seven kept, rewritten after a change; and an hour of work
// kept only in the browser brings a reminder, which offers the folder where the browser has one, a backup file where
// it has not, and can be put off. (The private folder cannot be had from a page opened from a file: that part runs
// on the app served by a local web server.)
const { launch, sleep, checks, serve, stop } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');

(async () => {
  const T = checks('Work kept safe outside the browser');
  const { browser, page } = await launch('backup');
  let server = null;
  try {
  await buildInPage(page, LANGS.sa, make('sa', 3, 1, 12, 4), 12);
  const r = await page.evaluate(async () => {
    const { Store, Safety, Zip, Model } = ME;
    const { ed, list } = window.lang;
    await ME.Collate.run(ed, list, 'main', {});
    // and one transcription of no edition
    const lone = Model.newProject({ meta: { title: 'Lone', siglum: 'L' }, layoutType: 'linear', lines: { main: 3 }, folios: {} });
    lone.pages = { '1r': { boxes: { main: ['एकम्', '', ''] } } };
    await Store.putProject(lone);
    const tables = (await Store.listCollations(ed.id)).length;
    const { files, counts } = await Safety.everything();
    const zip = await Zip.read(await Zip.write(files));
    const names = [...zip.keys()];
    // an empty browser
    for (const p of await Store.listProjects()) await Store.deleteProject(p.id);
    for (const e of await Store.listEditions()) await Store.deleteEdition(e.id);
    const emptied = (await Store.listProjects()).length + (await Store.listEditions()).length;
    const first = await Safety.restore(zip, { quiet: true });
    const back = { projects: (await Store.listProjects()).length, editions: (await Store.listEditions()).length, tables: (await Store.listCollations(ed.id)).length };
    const ed2 = await Store.getEdition(ed.id);
    const linked = await Promise.all(ed2.witnesses.map(async (w) => !!(await Store.getProject(w.projectId))));
    const again = await Safety.restore(zip, { quiet: true });
    // a newer copy in a backup replaces the older one here, after an automatic backup of it
    const k = names.find((n) => /Lone/.test(n));
    const d = JSON.parse(new TextDecoder().decode(zip.get(k)));
    d.project.modified = Date.now() + 60000; d.project.pages['1r'].boxes.main[0] = 'द्वितीयम्';
    const z2 = new Map(zip); z2.set(k, JSON.stringify(d));
    const third = await Safety.restore(z2, { quiet: true });
    const lone2 = await Store.getProject(lone.id);
    return { counts, names: names.map((n) => n.replace(/ [\w-]+\.(manuscribe\.)?json$/, '')), tables, emptied, first, back, linked, again, third, newText: lone2.pages['1r'].boxes.main[0], hadBackup: (await Store.listBackups(lone.id)).length > 0 };
  });
  T.check('a backup of everything holds every transcription and edition, with its collation tables (' + r.counts.transcriptions + ' transcriptions, 1 edition, ' + r.tables + ' tables)', r.counts.transcriptions === 4 && r.counts.editions === 1 && r.names.includes('manuscribe-backup.json') && r.names.filter((n) => n.startsWith('transcriptions/')).length === 4 && r.names.filter((n) => n.startsWith('editions/')).length === 1 && r.tables > 0, r.names);
  T.check('read into an empty browser, all of it comes back as it was, the edition with its witnesses and tables', r.emptied === 0 && r.first.added === 5 && r.back.projects === 4 && r.back.editions === 1 && r.back.tables === r.tables && r.linked.every(Boolean), { first: r.first, back: r.back, linked: r.linked });
  T.check('read again, nothing changes; a newer copy in a backup replaces the older one, after an automatic backup of it', r.again.added === 0 && r.again.replaced === 0 && r.again.kept === 5 && r.third.replaced === 1 && r.newText === 'द्वितीयम्' && r.hadBackup, { again: r.again, third: r.third });

  // Open… reads a backup of everything, after asking
  const opened = await page.evaluate(async () => {
    const { files } = await ME.Safety.everything();
    const blob = await ME.Zip.write(files);
    const file = new File([blob], 'Manuscribe backup.zip', { type: 'application/zip' });
    const done = ME.Edition.importFile(file);
    for (let k = 0; k < 40 && !document.querySelector('.modal-foot .btn.primary'); k++) await new Promise((r) => setTimeout(r, 50));
    const asked = (document.querySelector('.modal') || {}).textContent || '';
    document.querySelector('.modal-foot .btn.primary').click();
    await done;
    return { asked: /Restore a backup/.test(asked) && /not in a backup/.test(asked) };
  });
  T.check('Open… reads a backup of everything, saying first what it will do (and that the PDFs are not in it)', opened.asked, opened);

  // the backup folder: the browser's own private folder stands in for one chosen (from a website only)
  server = await serve(0);
  const web = await browser.newPage();
  await web.goto('http://127.0.0.1:' + server.address().port + '/manuscribe/app/index.html', { waitUntil: 'load' });
  await sleep(700);
  const f = await web.evaluate(async () => {
    const { Safety, Store, Zip, Model } = ME;
    const lone = Model.newProject({ meta: { title: 'Web', siglum: 'W' }, layoutType: 'linear', lines: { main: 2 }, folios: {} });
    await Store.putProject(lone);
    const e0 = ME.Edition.create('Web edition'); e0.witnesses = [{ siglum: 'W', projectId: lone.id, streams: {} }];
    await Store.putEdition(e0);
    const dir = await navigator.storage.getDirectory();
    for await (const [n] of dir.entries()) await dir.removeEntry(n, { recursive: true });
    // nine days of copies already there
    for (let d = 1; d <= 9; d++) { const h = await dir.getFileHandle('Manuscribe backup 2020-01-0' + d + '.zip', { create: true }); const w = await h.createWritable(); await w.write('old'); await w.close(); }
    await Safety.useFolder(dir);
    const list = async () => { const out = []; for await (const [n] of dir.entries()) out.push(n); return out.sort(); };
    const after = await list();
    const zip = await Zip.read(await (await dir.getFileHandle('Manuscribe backup.zip')).getFile());
    ME.App.showStart(); await new Promise((r) => setTimeout(r, 200));
    const row = document.getElementById('safety-row').textContent;
    // a change, then leaving the window: written again
    const t0 = Safety.lastWrite;
    const p = (await Store.listProjects())[0];
    p.meta.notes = 'changed'; p.modified = Date.now();
    await Store.putProject(p);
    const pending = Safety.unsavedSince() > 0;
    await new Promise((r) => setTimeout(r, 20));
    await Safety.flush();
    const ed = (await Store.listEditions())[0];
    return { after, isBackup: Safety.isBackup(zip), state: Safety.state(), row, pending, rewritten: Safety.lastWrite > t0, cleared: !Safety.unsavedSince(), noEditionNag: ME.Edition.reminder(ed, []) === null };
  });
  await web.close();
  const dated = f.after.filter((n) => /\d{4}-\d\d-\d\d/.test(n));
  T.check('a folder chosen gets “Manuscribe backup.zip”, a backup of everything, and a copy of each day, the last seven kept', f.after.includes('Manuscribe backup.zip') && f.isBackup && dated.length === 7 && !dated.includes('Manuscribe backup 2020-01-01.zip') && f.state === 'ok', f.after);
  T.check('the start screen says where backups go; a change is written again when the window is left, and the edition no longer asks for a package', /Backups go to the folder/.test(f.row) && f.pending && f.rewritten && f.cleared && f.noEditionNag, f);

  // the reminder
  const rm = await page.evaluate(async () => {
    const { Safety } = ME;
    await Safety.stopFolder();
    localStorage.setItem('manuscribe.unsavedSince', String(Date.now() - 2 * 3600 * 1000));
    const shown = Safety.check();
    const bar = document.getElementById('safety-bar');
    const withFolder = bar ? bar.textContent : '';
    bar.querySelector('.btn.ghost').click();
    const putOff = !Safety.check() && !document.getElementById('safety-bar');
    // a browser that cannot write to a folder (Safari, Firefox), an hour after being put off
    const keep = window.showDirectoryPicker; delete window.showDirectoryPicker; window.showDirectoryPicker = undefined;
    const later = Safety.check(Date.now() + 3 * 3600 * 1000);
    const without = (document.getElementById('safety-bar') || {}).textContent || '';
    window.showDirectoryPicker = keep;
    document.getElementById('safety-bar').remove();
    // soon after a change, nothing
    const at = Date.now() + 5 * 3600 * 1000;
    localStorage.setItem('manuscribe.unsavedSince', String(at - 10 * 60 * 1000));
    const early = Safety.check(at);
    return { shown, withFolder, putOff, later, without, early };
  });
  T.check('an hour of work only in the browser brings a reminder: a folder where the browser has one, a backup file where it has not; Later puts it off', rm.shown && /Choose a folder/.test(rm.withFolder) && rm.putOff && rm.later && /Back up everything/.test(rm.without) && !rm.early, rm);
  T.done(page);
  } finally { await browser.close(); if (server) await stop(server); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
