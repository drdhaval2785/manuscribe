'use strict';
/* Recognition in Manuscribe: a folio side read in this browser, by the models of the recognition pack kept here
   (recogpack.js), in a worker (recogworker.js), its lines brought in as proposed lines through htr.js, never over
   what has been typed; and the consent and the contribution of corrected lines for training the models.

   settingsPanel()       Settings › Recognition: the pack (fetched from the site, or read from files on disk; what it
                         is, what its models learned from), how it runs, and the training question asked once of the user
   folioSection()        the Folio tab's "Recognise this side…"
   recognise()           this side, or this and the next ones: rendered from the PDF at the scale the segmenter learned
                         from, read, and proposed (the command palette too, and the tag key with J)
   msFold(p)             the Manuscript tab's fold: what was read here, the manuscript's consent, the contribution
   askConsent(p)         the per-manuscript question; contribute(p) the package of corrected lines; withdraw(p)
   CONSENT               the consent text: a DRAFT until the maintainer approves it, and until then nothing can be
                         contributed (approved: false)

   A proposed line read here keeps where it was cut from (pg.proposed[box][i].cut: its baseline and outline in the
   rendered side, and how the side was rendered), so that once corrected and accepted its line image can be cut again
   for a contribution. The manuscript's consent is kept in the project (p.consent: the answer, its date, the wording's
   version, the confirmation of the right to share, and a history), so it travels with backups and packages. */
(function (ME) {
  const { U, UI, Model } = ME;
  const RV = {};
  const SOFTWARE = 'Manuscribe recognition';
  const App = () => ME.App;
  const Pack = () => ME.RecogPack;
  const MB = (b) => (b / 1e6).toFixed(1) + ' MB';
  const runOf = (man, k) => { const s = (man.models[k] && man.models[k].source) || ''; return s.split('/').slice(-2, -1)[0] || k; };

  /* ---------- the consent text ---------- */

  RV.CONSENT = {
    version: 'draft-1',
    // the maintainer approves the wording, who keeps the lines, how to reach them, and the withdrawal policy; until
    // then the question is not asked and nothing can be contributed
    approved: false,
    title: 'Corrected lines for training the recognition models',
    paragraphs: [
      'Manuscribe reads manuscript pages with recognition models that run in this browser. The models read better when they learn from lines that people have read and corrected. You may choose to give the corrected lines of this manuscript for that.',
      'What is given: for each line that Manuscribe read and you accepted after correcting it, the image of that line as Manuscribe cut it from the scan, its text as you corrected it, the text the model first proposed, the folio side and block it belongs to, and which model read it. Not the PDF, not your notes or markup, not other manuscripts.',
      'How it is given: never automatically. “Contribute corrected lines” makes a file (a zip) that shows what it holds; you send it yourself to the maintainer of the models. [DRAFT: the maintainer’s address, and who keeps the lines.]',
      'How it is used: only to train the line segmenter and the line recogniser. The models trained on them are published under CC BY-SA 4.0, and each model’s card names the manuscripts it learned from, this one included, by the name you give below. The line images and their texts are not republished.',
      'Your rights: give them only if you have the right to share these images for this purpose. Many libraries restrict the reuse of their scans.',
      'Withdrawing: you can withdraw at any time in the Manuscript tab; nothing more is contributed after that. [DRAFT: lines already sent are deleted from the training store on request and left out of the next model trained; models already published are not withdrawn.]',
    ],
    question: 'May the corrected lines of this manuscript be used to train the recognition models?',
    rights: 'I have the right to share these line images for this purpose.',
  };
  const DRAFT_NOTE = 'The consent text is a draft awaiting the maintainer’s approval: until it is approved, the question is not asked and nothing can be contributed.';

  RV.consentRecord = (p) => (p && p.consent && p.consent.training) || null;
  function record(p, what, extra) {
    p.consent = p.consent || { history: [] };
    p.consent.history = p.consent.history || [];
    const date = new Date().toISOString();
    p.consent.history.push(Object.assign({ date, what, wording: RV.CONSENT.version }, extra && extra.history));
    if (extra && extra.training) p.consent.training = Object.assign({ date, wording: RV.CONSENT.version }, extra.training);
    App().changed();
  }
  const consentText = () => U.el('div', { class: 'recog-consent' },
    RV.CONSENT.approved ? null : U.el('p', { class: 'recog-draft' }, 'DRAFT (' + RV.CONSENT.version + '). ' + DRAFT_NOTE),
    RV.CONSENT.paragraphs.map((t) => U.el('p', null, t)));

  RV.showConsentText = () => UI.modal({ title: RV.CONSENT.title, body: consentText(), wide: true });

  const msName = (p) => { const m = p.meta || {}; return [m.repository, m.shelfmark, m.title].filter(Boolean).join(', ') || m.siglum || 'this manuscript'; };

  RV.askConsent = async function (p) {
    if (!RV.CONSENT.approved) { U.toast(DRAFT_NOTE, 'warn', 7000); return null; }
    const rights = U.el('input', { type: 'checkbox', 'data-recog': 'rights' });
    const name = U.el('input', { type: 'text', value: msName(p), 'aria-label': 'Name in the model cards' });
    const err = U.el('div', { class: 'field-error' });
    const body = U.el('div', null, consentText(),
      U.el('p', null, U.el('strong', null, RV.CONSENT.question)),
      U.el('label', { class: 'field checkbox' }, rights, U.el('span', null, RV.CONSENT.rights)),
      U.el('label', { class: 'field' }, U.el('span', null, 'How the model cards name this manuscript'), name), err);
    const v = await UI.modal({ title: RV.CONSENT.title, body, wide: true, className: 'recog-consent-dialog', buttons: [
      { label: 'No', value: 'no', kind: 'ghost' },
      { label: 'Yes, they may', value: 'yes', kind: 'primary', validate: () => { const ok = rights.checked && name.value.trim(); err.textContent = ok ? '' : 'Confirm that you have the right to share the images, and give the manuscript a name.'; return !!ok; } }] });
    if (v === 'yes') record(p, 'yes', { training: { answer: 'yes', rights: true, name: name.value.trim() } });
    else if (v === 'no') record(p, 'no', { training: { answer: 'no' } });
    else RV._notNow = p.id;                              // closed: nothing given; not asked again in this visit
    return v;
  };

  RV.withdraw = async function (p) {
    const r = RV.consentRecord(p);
    if (!r || r.answer !== 'yes') return;
    if (!await UI.confirm('Withdraw the consent given on ' + r.date.slice(0, 10) + '? Nothing more of this manuscript can then be contributed. Lines already sent are dealt with as the consent text says.', { title: 'Withdraw consent', ok: 'Withdraw', danger: true })) return;
    record(p, 'withdrawn', { training: Object.assign({}, r, { answer: 'withdrawn', withdrawn: new Date().toISOString() }) });
    rerenderMs();
  };

  /* ---------- the side's pixels ---------- */

  async function renderSide(page, scale, rotation, rect) {
    const vp = page.getViewport({ scale, rotation });
    const x0 = Math.round(rect[0] * vp.width), y0 = Math.round(rect[1] * vp.height);
    const w = Math.max(1, Math.round(rect[2] * vp.width)), h = Math.max(1, Math.round(rect[3] * vp.height));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale, rotation, offsetX: -x0, offsetY: -y0 }) }).promise;
    const img = ctx.getImageData(0, 0, w, h);
    return { data: new Uint8Array(img.data.buffer), width: w, height: h, channels: 4, render: { scale, rotation, rect } };
  }

  // the side (the page, or its half) as the segmenter learned from sides: at the height of its training images
  RV.sidePixels = async function (e, targetH) {
    const PV = ME.PdfView;
    if (PV.ensureWorker) await PV.ensureWorker();
    if (!PV.doc) throw new Error('the PDF is not open');
    const page = await PV.doc.getPage(e.pdfPage);
    const rotation = PV.rotation || 0;
    const rect = Model.defaultLeaf(e);
    const vp1 = page.getViewport({ scale: 1, rotation });
    const scale = Math.max(0.05, Math.min(8, targetH / (vp1.height * rect[3])));
    return renderSide(page, scale, rotation, rect);
  };

  /* ---------- the worker, kept while it is used ---------- */

  async function worker(m) {
    const w = RV._worker;
    if (w && w.pack === m.pack && w.date === m.date) { clearTimeout(w.idle); return w; }
    if (w) w.api.close();
    RV._worker = null;
    const bundle = await Pack().load();
    const api = ME.RecogWorker.start(bundle);
    const entry = { api, pack: m.pack, date: m.date, P: bundle.P };
    try { await api.ready; } catch (err) { api.close(); throw err; }
    RV._worker = entry;
    return entry;
  }
  function idle() {
    const w = RV._worker;
    if (w) w.idle = setTimeout(() => { if (RV._worker === w) { w.api.close(); RV._worker = null; } }, 5 * 60 * 1000);
  }
  RV.stop = () => { if (RV._worker) { RV._worker.api.close(); RV._worker = null; } };

  /* ---------- placing what was read ---------- */

  function sourceFor(p, man, space) {
    const model = SOFTWARE + ': segmenter ' + runOf(man, 'segmenter') + ', recogniser ' + runOf(man, 'recogniser') + (space ? ', word spacer ' + runOf(man, 'spacer') : '');
    const s = (p.sources || []).find((x) => x.software === SOFTWARE && x.version === man.pack && x.model === model);
    return s || ME.HTR.addSource(p, { kind: 'htr', software: SOFTWARE, model, version: man.pack, date: new Date().toISOString().slice(0, 10), format: 'read in this browser', file: '' });
  }

  // -> {placed, skipped, lost}
  function place(p, e, res, src, render, space, smooth) {
    const boxes = Model.LAYOUTS[Model.pageLayout(p, e.label)].boxes;
    const regions = [], names = [];
    let lost = 0;
    for (const [box, rows] of Object.entries(res.boxes)) {
      if (!rows.length) continue;
      if (!boxes.includes(box)) { lost += rows.length; continue; }
      regions.push({ id: box, type: box, lines: rows.map((r) => ({ text: space && typeof r.spaced === 'string' ? r.spaced : r.text, conf: r.conf })) });
      names.push(box);
    }
    if (!regions.length) return { placed: 0, skipped: 0, lost };
    const out = ME.HTR.place(p, { pages: [{ regions }] }, { labels: [e.label], boxes: names, src: src.id });
    const pg = p.pages[e.label];
    regions.forEach((r, j) => {
      const box = names[j];
      res.boxes[box].forEach((row, i) => {
        const pr = pg.proposed && pg.proposed[box] && pg.proposed[box][i];
        if (pr && pr.src === src.id && !pr.accepted && pr.text === U.escXml(r.lines[i].text)) pr.cut = { b: row.baseline, o: row.outline, r: Object.assign({ smooth }, render) };
      });
    });
    return { placed: out.placed, skipped: out.skipped, lost };
  }

  /* ---------- recognising ---------- */

  RV.recognise = async function () {
    const A = App(), p = A && A.project;
    if (!p || !A.entries.length) return;
    if (A.flush) A.flush();
    const m = await Pack().installed();
    if (!m) {
      const go = await UI.modal({ title: 'Recognise this folio side', body: U.el('p', null, 'There is no recognition pack in this browser yet. Settings › Recognition fetches one (about 45 MB, once), or reads one from files on disk; recognition then runs here, offline, and sends nothing anywhere.'),
        buttons: [{ label: 'Close', value: false, kind: 'ghost' }, { label: 'Settings…', value: true, kind: 'primary' }] });
      if (go) A.showSettings('recognition');
      return;
    }
    if (!ME.PdfView.doc) { U.toast('The PDF is not open', 'warn'); return; }
    const prefs = Pack().prefs(), e0 = A.entries[A.idx], left = A.entries.length - A.idx;
    const count = U.el('input', { type: 'number', min: '1', max: String(left), value: '1', 'aria-label': 'Folio sides', 'data-recog': 'count' });
    const space = U.el('input', { type: 'checkbox', checked: prefs.space !== false, 'data-recog': 'space' });
    const man = m.manifest;
    const ok = await UI.modal({ title: 'Recognise folio sides', body: U.el('div', null,
      U.el('p', { class: 'help' }, 'Read in this browser with ' + man.pack + ' (segmenter ' + runOf(man, 'segmenter') + ', recogniser ' + runOf(man, 'recogniser') + '). The lines found go, as proposed lines, into the lines of their blocks that are still empty: nothing you have typed is changed, and nothing is sent anywhere. Read and correct each line, then accept it with ' + ME.Commands.keyLabel('Y') + '.'),
      U.el('label', { class: 'field small' }, U.el('span', null, 'Folio sides, from ' + e0.label), count),
      U.el('label', { class: 'field checkbox' }, space, U.el('span', null, 'Put in word spaces (a line that ends in a space ends its word)'))),
    buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Recognise', value: true, kind: 'primary' }] });
    if (!ok) return;
    Pack().savePrefs({ space: space.checked });
    const n = Math.max(1, Math.min(left, parseInt(count.value, 10) || 1));
    const sides = A.entries.slice(A.idx, A.idx + n).filter((e) => !e.orphan && e.pdfPage);
    await RV.run(p, sides, { space: space.checked });
  };

  // read these sides and propose their lines -> {placed, skipped, lost, sides, stopped, error}
  RV.run = async function (p, sides, opts) {
    const A = App(), m = await Pack().installed(), man = m.manifest;
    const say = U.el('p', { class: 'help', 'data-recog': 'status' }, 'Starting the models…');
    const bar = U.el('progress', { max: 1, value: 0 });
    let close = null, finished = false, stopped = false;
    UI.modal({ title: 'Recognition', body: U.el('div', null, say, bar), buttons: [{ label: 'Stop', value: 'stop', kind: 'ghost' }], onOpen: (d, c) => { close = c; } })
      .then(() => { if (!finished) { stopped = true; RV.stop(); } });
    const tot = { placed: 0, skipped: 0, lost: 0, sides: 0, stopped: false, error: null, times: [] };
    try {
      const w = await worker(m);
      const src = sourceFor(p, man, opts.space);
      await ME.Store.backupNow(p);
      const targetH = (man.page_height && man.page_height.median) || 700;
      for (let k = 0; k < sides.length && !stopped; k++) {
        const e = sides[k], of = sides.length > 1 ? ' (' + (k + 1) + ' of ' + sides.length + ')' : '';
        say.textContent = 'Folio side ' + e.label + of + ': rendering';
        const px = await RV.sidePixels(e, targetH);
        const res = await w.api.read(px, Model.pageLayout(p, e.label), { space: opts.space }, (pr) => {
          say.textContent = 'Folio side ' + e.label + of + ': ' + ({ segment: 'finding the lines', read: 'reading line ' + (pr.k + 1) + ' of ' + pr.n, space: 'putting in word spaces', done: 'done' }[pr.stage] || pr.stage);
          bar.value = (k + (pr.stage === 'read' ? 0.2 + 0.7 * pr.k / Math.max(1, pr.n) : pr.stage === 'segment' ? 0.05 : 0.95)) / sides.length;
        });
        if (stopped) break;
        const r = place(p, e, res, src, px.render, opts.space, w.P.cutter.smooth);
        tot.placed += r.placed; tot.skipped += r.skipped; tot.lost += r.lost; tot.sides++;
        tot.times.push(Object.assign({ label: e.label, backends: res.backends }, res.times));
        A.changed();
      }
    } catch (err) {
      tot.error = err.message || String(err);
    }
    finished = true;
    tot.stopped = stopped;
    if (close) close('done');
    idle();
    A.changed();
    if (A.rerender) A.rerender();
    rerenderMs();
    RV.last = tot;
    if (tot.error && !stopped) U.toast('Recognition stopped: ' + tot.error, 'err', 8000);
    else U.toast((stopped ? 'Stopped. ' : '') + tot.placed + ' line(s) proposed on ' + tot.sides + ' folio side(s)' + (tot.skipped ? '; ' + tot.skipped + ' left out where you had typed already' : '') + (tot.lost ? '; ' + tot.lost + ' in blocks this layout does not have' : ''), 'ok', 6000);
    // the manuscript's own question, for a user who asked to be asked
    if (!stopped && tot.placed && Pack().prefs().askTraining && RV.CONSENT.approved && !RV.consentRecord(p) && RV._notNow !== p.id) await RV.askConsent(p);
    return tot;
  };

  /* ---------- the corrected lines and their contribution ---------- */

  // lines read here, accepted, with where they were cut from: [{label, box, i, text, proposed, conf, cut, src}]
  RV.corrected = function (p) {
    const ours = new Map((p.sources || []).filter((s) => s.software === SOFTWARE).map((s) => [s.id, s]));
    const out = [];
    for (const e of App().entries) {
      const pg = p.pages[e.label];
      if (!pg || !pg.proposed) continue;
      for (const [box, lines] of Object.entries(pg.proposed)) {
        for (const [i, pr] of Object.entries(lines)) {
          if (!pr.accepted || !pr.cut || !ours.has(pr.src)) continue;
          const now = (pg.boxes && pg.boxes[box] && pg.boxes[box][i]) || '';
          const text = ME.TEI.plainText(now).replace(/\s+$/, ' ').replace(/^\s+/, '');
          if (!text.trim()) continue;
          out.push({ label: e.label, entry: e, box, i: +i, text, proposed: ME.TEI.plainText(pr.text), conf: pr.conf, cut: pr.cut, src: ours.get(pr.src) });
        }
      }
    }
    return out;
  };

  const pngOf = (crop) => new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = crop.width; c.height = crop.height;
    const rgba = new Uint8ClampedArray(crop.width * crop.height * 4);
    for (let i = 0, j = 0; i < crop.width * crop.height; i++, j += crop.channels) {
      rgba[i * 4] = crop.data[j]; rgba[i * 4 + 1] = crop.data[j + (crop.channels > 2 ? 1 : 0)]; rgba[i * 4 + 2] = crop.data[j + (crop.channels > 2 ? 2 : 0)]; rgba[i * 4 + 3] = 255;
    }
    c.getContext('2d').putImageData(new ImageData(rgba, crop.width, crop.height), 0, 0);
    c.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/png');
  });

  // the package of a manuscript's corrected lines, for the folio sides chosen -> {name, blob, lines}
  RV.contributionPackage = async function (p, lines) {
    const rec = RV.consentRecord(p), files = [], list = [];
    const byRender = new Map();
    for (const l of lines) {
      const k = l.label + '|' + JSON.stringify([l.cut.r.scale, l.cut.r.rotation, l.cut.r.rect]);
      if (!byRender.has(k)) byRender.set(k, []);
      byRender.get(k).push(l);
    }
    for (const group of byRender.values()) {
      const l0 = group[0];
      const page = await ME.PdfView.doc.getPage(l0.entry.pdfPage);
      const px = await renderSide(page, l0.cut.r.scale, l0.cut.r.rotation, l0.cut.r.rect);
      for (const l of group) {
        const crop = ME.RecogRead.cut(px.data, px.width, px.height, 4, l.cut.b, l.cut.o, { cutter: { smooth: l.cut.r.smooth } });
        const base = 'lines/' + l.label + '_' + l.box + '_' + String(l.i + 1).padStart(2, '0');
        files.push({ name: base + '.png', data: await pngOf(crop) }, { name: base + '.txt', data: l.text.trim() + '\n' });
        list.push({ image: base + '.png', text: l.text.trim(), proposed: l.proposed, folio: l.label, block: l.box, line: l.i + 1, conf: l.conf, model: l.src.version + ' (' + l.src.model + ')' });
      }
    }
    const made = new Date().toISOString();
    const about = {
      format: 'manuscribe-contribution', version: 1, made, manuscribe: ME.VERSION,
      manuscript: { name: rec.name, meta: p.meta },
      consent: rec, wording: { version: RV.CONSENT.version, approved: RV.CONSENT.approved, title: RV.CONSENT.title, paragraphs: RV.CONSENT.paragraphs, question: RV.CONSENT.question, rights: RV.CONSENT.rights },
      lines: list,
    };
    files.unshift({ name: 'contribution.json', data: JSON.stringify(about, null, 1) });
    const safe = (rec.name || 'manuscript').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
    return { name: 'contribution ' + safe + ' ' + made.slice(0, 10) + '.zip', blob: await ME.Zip.write(files), lines: list.length };
  };

  RV.contribute = async function (p) {
    const rec = RV.consentRecord(p);
    if (!RV.CONSENT.approved) { U.toast(DRAFT_NOTE, 'warn', 7000); return null; }
    if (!rec || rec.answer !== 'yes') { U.toast('This manuscript’s corrected lines may be contributed only once you have said yes (Manuscript tab)', 'warn', 6000); return null; }
    if (!ME.PdfView.doc) { U.toast('The PDF is not open', 'warn'); return null; }
    const lines = RV.corrected(p);
    if (!lines.length) { U.toast('No corrected lines yet: lines read here and accepted after correcting them (' + ME.Commands.keyLabel('Y') + ') can be contributed', 'info', 6000); return null; }
    const folios = [...new Set(lines.map((l) => l.label))];
    const boxes = folios.map((f) => U.el('input', { type: 'checkbox', checked: true, 'aria-label': 'Folio side ' + f, 'data-folio': f }));
    const ok = await UI.modal({ title: 'Contribute corrected lines', wide: true, body: U.el('div', null,
      U.el('p', { class: 'help' }, 'A file (zip) with the image and corrected text of each line below, the text the model first proposed, and this manuscript’s consent record; nothing else. It is saved to your computer: look at it, then send it yourself. Leave out any folio side you wish.'),
      U.el('table', { class: 'ed-table' }, U.el('tbody', null, folios.map((f, k) => U.el('tr', null, U.el('td', null, boxes[k]), U.el('td', null, 'Folio side ' + f), U.el('td', { class: 'num' }, lines.filter((l) => l.label === f).length + ' line(s)')))))),
    buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the file', value: true, kind: 'primary' }] });
    if (!ok) return null;
    const keep = new Set(boxes.filter((b) => b.checked).map((b) => b.dataset.folio));
    const chosen = lines.filter((l) => keep.has(l.label));
    if (!chosen.length) return null;
    const pkg = await RV.contributionPackage(p, chosen);
    U.download(pkg.name, pkg.blob, 'application/zip');
    record(p, 'contributed', { history: { lines: pkg.lines, folios: [...keep], file: pkg.name } });
    rerenderMs();
    U.toast(pkg.lines + ' line(s) put in ' + pkg.name, 'ok', 6000);
    return pkg;
  };

  /* ---------- the panels ---------- */

  function rerenderMs() {
    const A = App(), el = document.getElementById('tab-ms');
    if (A && A.renderMsTab && el && !el.hidden) A.renderMsTab();
  }

  RV.folioSection = function () {
    return [
      U.el('h4', null, 'Recognition'),
      U.el('p', { class: 'help' }, 'Read this side with the recognition models kept in this browser: its lines are proposed in the empty lines of its blocks, for you to correct and accept.'),
      U.el('div', { class: 'btn-row' }, U.el('button', { class: 'btn small', 'data-action': 'recognise', onclick: () => RV.recognise() }, 'Recognise this side…')),
    ];
  };

  RV.msFold = function (p) {
    const out = [];
    const ours = (p.sources || []).filter((s) => s.software === SOFTWARE);
    out.push(U.el('p', { class: 'help' }, ours.length
      ? 'Read in this browser with: ' + ours.map((s) => s.version).join('; ') + '. Each source’s lines and error rate are in “Bring in text”.'
      : 'Folio sides can be read in this browser (Folio tab › Recognise this side…, or ' + ME.Commands.keyLabel('J') + '), with the models of the recognition pack (Settings › Recognition).'));
    out.push(U.el('h4', null, 'Training the models with this manuscript'));
    if (!RV.CONSENT.approved) {
      out.push(U.el('p', { class: 'help recog-draft' }, DRAFT_NOTE), U.el('button', { class: 'btn small ghost', onclick: () => RV.showConsentText() }, 'Read the draft…'));
      return out;
    }
    const r = RV.consentRecord(p);
    const n = RV.corrected(p).length;
    out.push(U.el('p', { class: 'help', 'data-recog': 'consent' }, !r ? 'Not asked yet: its corrected lines are not contributed.'
      : r.answer === 'yes' ? 'You said yes on ' + r.date.slice(0, 10) + ' (wording ' + r.wording + '), as “' + r.name + '”. ' + n + ' corrected line(s) can be contributed.'
        : r.answer === 'withdrawn' ? 'Consent withdrawn on ' + r.withdrawn.slice(0, 10) + ': nothing more is contributed.'
          : 'You said no on ' + r.date.slice(0, 10) + ': nothing is contributed.'));
    const sent = ((p.consent && p.consent.history) || []).filter((h) => h.what === 'contributed');
    if (sent.length) out.push(U.el('p', { class: 'help' }, 'Contribution files made: ' + sent.map((h) => h.date.slice(0, 10) + ' (' + h.lines + ' lines)').join('; ') + '.'));
    out.push(U.el('div', { class: 'btn-row' },
      !r || r.answer !== 'yes' ? U.el('button', { class: 'btn small', onclick: async () => { RV._notNow = null; await RV.askConsent(p); rerenderMs(); } }, r ? 'Answer again…' : 'Answer…') : null,
      r && r.answer === 'yes' ? U.el('button', { class: 'btn small', 'data-action': 'contribute', onclick: () => RV.contribute(p) }, 'Contribute corrected lines…') : null,
      r && r.answer === 'yes' ? U.el('button', { class: 'btn small ghost', onclick: () => RV.withdraw(p) }, 'Withdraw…') : null,
      U.el('button', { class: 'btn small ghost', onclick: () => RV.showConsentText() }, 'Read the consent text…')));
    return out;
  };

  RV.settingsPanel = function () {
    const host = U.el('div', { class: 'recog-settings', 'data-recog': 'settings' });
    const draw = async () => {
      const m = await Pack().installed(), prefs = Pack().prefs();
      host.innerHTML = '';
      const status = U.el('div', { class: 'recog-status', 'data-recog': 'installed' });
      if (m) {
        const man = m.manifest, cards = (k) => (man.models[k] && man.models[k].card) || {};
        const lineage = (cards('recogniser').lineage || []).slice().reverse().map((s) => s.run + ' on ' + s.manuscript).join(', then ');
        const segMs = Object.keys(cards('segmenter').manuscripts || {}).length;
        status.append(
          U.el('p', null, U.el('strong', null, man.pack), ' · ' + MB(m.bytes) + ' · kept ' + m.date.slice(0, 10) + ' · from ' + (m.source === 'files' ? 'files on disk' : m.source)),
          U.el('ul', { class: 'help' },
            U.el('li', null, 'Segmenter ' + runOf(man, 'segmenter') + (segMs ? ', learned from ' + segMs + ' manuscripts' : '')),
            U.el('li', null, 'Recogniser ' + runOf(man, 'recogniser') + (lineage ? ', trained ' + lineage : '') + '. It reads the hands it learned from well, others poorly.'),
            U.el('li', null, 'Word spacer ' + runOf(man, 'spacer') + (cards('spacer').texts ? ', learned from ' + cards('spacer').texts : '')),
            U.el('li', null, 'Weights under CC BY-SA 4.0; ONNX Runtime Web ' + m.runtime.version + ' (' + m.runtime.licence + '), ' + (m.runtime.variant === 'webgpu' ? 'with WebGPU' : 'WebAssembly only'))));
      } else status.append(U.el('p', null, 'No recognition pack in this browser yet.'));
      const src = U.el('input', { type: 'text', value: Pack().source(), 'aria-label': 'Site of the recognition packs', 'data-recog': 'source' });
      const list = U.el('div', { class: 'recog-list' });
      const bar = U.el('progress', { max: 1, value: 0, hidden: true }), say = U.el('p', { class: 'help', 'data-recog': 'progress' });
      const progress = (pr) => { bar.hidden = false; bar.value = pr.total ? pr.got / pr.total : 0; say.textContent = pr.name + ' · ' + MB(pr.got) + (pr.total ? ' of ' + MB(pr.total) : ''); };
      const done = (rec) => { bar.hidden = true; say.textContent = ''; U.toast('Recognition pack ' + rec.pack + ' kept in this browser', 'ok'); RV.stop(); draw(); };
      const fail = (err) => { bar.hidden = true; say.textContent = ''; U.toast(err.message || String(err), 'err', 8000); };
      const check = async () => {
        list.innerHTML = '';
        Pack().setSource(src.value.trim());
        try {
          const idx = await Pack().catalogue(src.value.trim());
          list.append(U.el('table', { class: 'ed-table' }, U.el('tbody', null, (idx.packs || []).slice().reverse().map((pk) => U.el('tr', null,
            U.el('td', null, pk.id + (pk.id === idx.latest ? ' (newest)' : ''), U.el('div', { class: 'help' }, Object.entries(pk.models || {}).map(([k, v]) => k + ' ' + v).join(', '))),
            U.el('td', { class: 'num' }, pk.bytes ? MB(pk.bytes) : ''),
            U.el('td', null, pk.problem ? U.el('span', { class: 'help' }, pk.problem)
              : U.el('button', { class: 'btn small', 'data-action': 'fetch-pack', disabled: m && m.pack === pk.id && m.source === Pack().source(), onclick: () => Pack().install(src.value.trim(), pk.id, progress).then(done, fail) }, m && m.pack === pk.id ? 'Kept' : 'Fetch')))))));
        } catch (err) { list.append(U.el('p', { class: 'help' }, 'Could not read the site: ' + (err.message || err))); }
      };
      const fromFiles = () => {
        const inp = U.el('input', { type: 'file', multiple: true, webkitdirectory: true });
        inp.addEventListener('change', () => { if (inp.files.length) Pack().installFiles(inp.files, progress).then(done, fail); });
        inp.click();
      };
      const backend = U.el('select', { 'aria-label': 'How the models run', onchange: () => { Pack().savePrefs({ backend: backend.value }); RV.stop(); } },
        U.el('option', { value: 'auto', selected: prefs.backend !== 'wasm' }, 'WebGPU where this browser has it (faster), else WebAssembly'),
        U.el('option', { value: 'wasm', selected: prefs.backend === 'wasm' }, 'WebAssembly only'));
      const ask = U.el('input', { type: 'checkbox', checked: !!prefs.askTraining && RV.CONSENT.approved, disabled: !RV.CONSENT.approved, 'data-recog': 'ask', onchange: () => Pack().savePrefs({ askTraining: ask.checked }) });
      host.append(
        U.el('h4', null, 'Recognition pack'), status,
        U.el('p', { class: 'help' }, 'The models that read folio sides (a line segmenter, a line recogniser for Devanagari and a Sanskrit word spacer) and the runtime that runs them, about 45 MB, fetched once and kept in this browser: recognition then runs here, offline, and sends nothing anywhere. Every file is checked against the checksum its manifest gives.'),
        U.el('label', { class: 'field' }, U.el('span', null, 'Site'), src),
        U.el('div', { class: 'btn-row' },
          U.el('button', { class: 'btn small', 'data-action': 'check-packs', onclick: check }, 'See its packs'),
          U.el('button', { class: 'btn small ghost', onclick: fromFiles }, 'Read a pack from a folder…'),
          m ? U.el('button', { class: 'btn small ghost', 'data-action': 'remove-pack', onclick: async () => { if (await UI.confirm('Remove the recognition pack from this browser? Lines already proposed stay.', { ok: 'Remove', danger: true })) { RV.stop(); await Pack().remove(); draw(); } } }, 'Remove') : null),
        list, bar, say,
        U.el('label', { class: 'field' }, U.el('span', null, 'How the models run'), backend),
        U.el('h4', null, 'Training the models'),
        U.el('label', { class: 'field checkbox' }, ask, U.el('span', null, 'Ask me, for each manuscript I read here, whether its corrected lines may help train the recognition models')),
        U.el('p', { class: 'help' + (RV.CONSENT.approved ? '' : ' recog-draft') }, RV.CONSENT.approved ? 'Off unless you tick it. Nothing is ever contributed without a yes for that manuscript, and then only as a file you send yourself.' : DRAFT_NOTE),
        U.el('button', { class: 'btn small ghost', onclick: () => RV.showConsentText() }, 'Read the consent text…'));
    };
    draw();
    return host;
  };

  // the palette and the tag key with J
  if (ME.Commands && ME.Commands.REG && !ME.Commands.REG.some((c) => c.id === 'recognise')) {
    ME.Commands.REG.push({ id: 'recognise', label: 'Recognise folio sides…', key: 'J', group: 'tools', desc: 'Read this folio side (or this and the next) with the recognition models kept in this browser (Settings › Recognition): its lines are proposed in the empty lines of its blocks.', run: () => RV.recognise() });
  }

  ME.RecogView = RV;
})(window.ME);
