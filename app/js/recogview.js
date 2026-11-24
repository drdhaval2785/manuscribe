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
   askConsent(p)         the per-manuscript question; withdraw(p), with the request that withdraws the lines sent
   contribute(p)         the corrected lines chosen, and the folio sides that can teach the segmenter
                         (sideForSegmenter: blocks drawn, each holding as many lines of text as it was given), sealed
                         (sealedPackages) to the key the models' site publishes (contribute.json), saved, and the issue
                         form of the inbox it names opened on GitHub, filled in, for the user to attach them to: nothing
                         leaves this browser but as a file the user sends. Every package names the manuscript's language
                         and script (scriptOf), so that no model of one learns from another's.
   CONSENT               the consent text, approved by the maintainer: version 2 (24 November 2026) gives lines and
                         whole folio sides, version 1 gave lines only; a new wording gets a new version and is a draft
                         (approved: false) until it is approved: nothing is then asked and nothing can be contributed

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
    version: '2',
    date: '2026-11-24',
    // approved by the maintainer; the inbox takes packages given on the wordings its approved.json lists. Wording 1
    // (24 November 2026) gave lines only; wording 2 gives folio sides as well, and names the language and script
    approved: true,
    title: 'Corrected lines and folio sides for training the recognition models',
    paragraphs: [
      'Manuscribe reads manuscript pages with recognition models that run in this browser. The models read better when they learn from pages that people have read and corrected. You may choose to give the corrected lines and folio sides of this manuscript for that.',
      'What is given: for each line that Manuscribe read and you accepted after correcting it, the image of that line as Manuscribe cut it from the scan, its text as you corrected it, the text the model first proposed, the folio side and block it belongs to, and which model read it. And for each folio side whose blocks you have drawn (Calibrate) and whose every block holds as many lines of text as you gave it, the image of that whole side as Manuscribe draws it from the scan, the blocks you drew and the number of lines in each. With them, the language and script of the manuscript, as you state them below. Not the PDF itself, not your notes or markup, not other manuscripts.',
      'How it is given: never automatically. “Contribute corrected lines” makes a file (a zip) and seals the lines and the images in it, so that only the maintainer of the models can open them. You send it yourself, by attaching it to a new issue in the GitHub repository drdhaval2785/manuscribe-contributions, which Manuscribe opens for you (a GitHub account is needed). That issue is public: it shows the name you give this manuscript below, its language and script, the number of lines and folio sides, the date and wording of this consent, and your GitHub account, but not the lines or the images. They are kept by the maintainer of the models, who can be written to at drdhaval2785@gmail.com.',
      'How it is used: only to train the line segmenter (which finds the lines on a page) and the line recogniser (which reads them), and only those for the manuscript’s own language and script: the lines and pages of one language or script are never mixed into the training of another’s. The models trained on them are published under CC BY-SA 4.0, and each model’s card names the manuscripts it learned from, this one included, by the name you give below. The images and their texts are not republished.',
      'Your rights: give them only if you have the right to share these images, of lines and of whole folio sides, for this purpose. Many libraries restrict the reuse of their scans.',
      'Withdrawing: you can withdraw at any time in the Manuscript tab; nothing more is contributed after that. For lines and sides already sent, Manuscribe opens a withdrawal request in the same repository (without a GitHub account, write to drdhaval2785@gmail.com): they are then deleted from the store of contributions and left out of every model trained after the withdrawal. Models already trained on them while the consent was given remain, and are not withdrawn.',
    ],
    question: 'May the corrected lines and folio sides of this manuscript be used to train the recognition models?',
    rights: 'I have the right to share these images (of lines and of whole folio sides) for this purpose.',
    // the wordings that give folio sides, not lines only
    sides: ['2'],
  };
  // the language and script tags (BCP 47: language-Script) offered for a manuscript, as in the Manuscript tab
  RV.SCRIPTS = ['sa-Deva', 'sa-Shrd', 'sa-Newa', 'sa-Beng', 'sa-Gujr', 'sa-Mlym', 'sa-Telu', 'sa-Knda', 'sa-Taml', 'sa-Gran', 'sa-Orya', 'sa-Sidd', 'pra-Deva', 'pi-Sinh', 'hi-Deva', 'mr-Deva', 'ne-Deva', 'gu-Gujr', 'bn-Beng', 'ta-Taml', 'te-Telu', 'kn-Knda', 'ml-Mlym', 'or-Orya', 'pa-Guru', 'bo-Tibt'];
  RV.TAG = /^[a-z]{2,3}-[A-Z][a-z]{3}$/;
  const tagOf = (p) => { const t = (p && p.meta && p.meta.script) || ''; return RV.TAG.test(t) ? t : ''; };
  const DRAFT_NOTE = 'The consent text is a draft awaiting the maintainer’s approval: until it is approved, the question is not asked and nothing can be contributed.';
  // where contributions go, as the consent text names it (the models' site, contribute.json, says it again, with the key)
  RV.INBOX = { inbox: 'drdhaval2785/manuscribe-contributions', email: 'drdhaval2785@gmail.com' };
  const inboxOf = () => Object.assign({}, RV.INBOX, (Pack() && Pack().prefs().contribute) || {});
  // a new issue in the inbox with its form filled in (form: contribution or withdrawal)
  RV.issueUrl = (inbox, form, fields) => 'https://github.com/' + inbox + '/issues/new?' + new URLSearchParams(Object.assign({ template: form + '.yml' }, fields)).toString();
  const openUrl = (url) => window.open(url, '_blank', 'noopener');
  const sentIds = (p) => [...new Set(((p.consent && p.consent.history) || []).filter((h) => h.what === 'contributed').flatMap((h) => h.ids || []))];

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
    const list = U.el('datalist', { id: 'recog-scripts' }, RV.SCRIPTS.map((t) => U.el('option', { value: t })));
    const tag = U.el('input', { type: 'text', value: tagOf(p) || 'sa-Deva', list: 'recog-scripts', 'data-recog': 'script', 'aria-label': 'Language and script of the manuscript' });
    const err = U.el('div', { class: 'field-error' });
    const body = U.el('div', null, consentText(),
      U.el('p', null, U.el('strong', null, RV.CONSENT.question)),
      U.el('label', { class: 'field checkbox' }, rights, U.el('span', null, RV.CONSENT.rights)),
      U.el('label', { class: 'field' }, U.el('span', null, 'How the model cards name this manuscript'), name),
      U.el('label', { class: 'field' }, U.el('span', null, 'Language and script of the manuscript (as sa-Deva: Sanskrit in Devanagari; ta-Taml: Tamil in Tamil script)'), tag, list), err);
    const v = await UI.modal({ title: RV.CONSENT.title, body, wide: true, className: 'recog-consent-dialog', buttons: [
      { label: 'No', value: 'no', kind: 'ghost' },
      { label: 'Yes, they may', value: 'yes', kind: 'primary', validate: () => { const ok = rights.checked && name.value.trim() && RV.TAG.test(tag.value.trim()); err.textContent = ok ? '' : 'Confirm that you have the right to share the images, give the manuscript a name, and state its language and script as a tag like sa-Deva.'; return !!ok; } }] });
    if (v === 'yes') record(p, 'yes', { training: { answer: 'yes', rights: true, name: name.value.trim(), script: tag.value.trim() } });
    else if (v === 'no') record(p, 'no', { training: { answer: 'no' } });
    else RV._notNow = p.id;                              // closed: nothing given; not asked again in this visit
    return v;
  };

  RV.withdraw = async function (p) {
    const r = RV.consentRecord(p);
    if (!r || r.answer !== 'yes') return;
    const ids = sentIds(p);
    if (!await UI.confirm('Withdraw the consent given on ' + r.date.slice(0, 10) + '? Nothing more of this manuscript can then be contributed.'
      + (ids.length ? ' For the lines already sent (' + ids.length + ' package' + (ids.length > 1 ? 's' : '') + '), a withdrawal request on GitHub comes next: they are then deleted, and left out of every model trained afterwards; models already trained on them remain.' : ''),
    { title: 'Withdraw consent', ok: 'Withdraw', danger: true })) return;
    record(p, 'withdrawn', { training: Object.assign({}, r, { answer: 'withdrawn', withdrawn: new Date().toISOString() }) });
    rerenderMs();
    if (ids.length) await RV.requestWithdrawal(p);
  };

  // the withdrawal request of the lines sent, in the inbox they were sent to
  RV.requestWithdrawal = async function (p) {
    const r = RV.consentRecord(p) || {}, ids = sentIds(p);
    if (!ids.length) return false;
    const sent = p.consent.history.filter((h) => h.what === 'contributed' && h.inbox);
    const box = inboxOf(), inbox = sent.length ? sent[sent.length - 1].inbox : box.inbox;
    const url = RV.issueUrl(inbox, 'withdrawal', { title: 'Withdrawal: ' + (r.name || msName(p)), manuscript: r.name || msName(p), ids: ids.join('\n') });
    const v = await UI.modal({ title: 'Withdraw the lines sent', wide: true, className: 'recog-withdraw-dialog', body: U.el('div', null,
      U.el('p', null, 'The lines already sent from this manuscript, in ' + ids.length + ' package' + (ids.length > 1 ? 's' : '') + ' (' + ids.join(', ') + '), are withdrawn by a request in ' + inbox + ' on GitHub, filled in for you: submit it, and a bot deletes them, if they were sent from the same GitHub account (otherwise the maintainer does). They are then left out of every model trained afterwards; models already trained on them remain.'),
      U.el('p', { class: 'help' }, 'Without a GitHub account, write to ' + box.email + ' with these package ids.')),
    buttons: [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Open the withdrawal request on GitHub', value: true, kind: 'primary' }] });
    if (v) openUrl(url);
    return !!v;
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
    // a pack reads one language and script: another's manuscript would be read as if it were in them
    const want = man.script, have = tagOf(p);
    if (want && have && want !== have && !await UI.confirm('This recognition pack reads ' + want + ' (language-script); this manuscript is marked ' + have + ' in its Manuscript tab. Its lines would be read as if they were in ' + want + '. Read it all the same?', { title: 'Another language or script', ok: 'Read all the same' })) return;
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

  const wording = () => ({ version: RV.CONSENT.version, date: RV.CONSENT.date, approved: RV.CONSENT.approved, title: RV.CONSENT.title, paragraphs: RV.CONSENT.paragraphs, question: RV.CONSENT.question, rights: RV.CONSENT.rights, sides: RV.CONSENT.sides });
  // whether a consent record gives whole folio sides (wording 2 on), not lines only
  RV.givesSides = (rec) => !!rec && rec.answer === 'yes' && RV.CONSENT.sides.includes(rec.wording);
  // the manuscript's language and script (a tag as sa-Deva): as its editor stated them with the consent, else as its
  // Manuscript tab gives them; the training of one language or script never takes another's
  RV.scriptOf = (p, rec) => (rec && RV.TAG.test(rec.script || '') && rec.script) || tagOf(p) || '';
  const fileSafe = (label) => String(label).replace(/[^\p{L}\p{N}._-]+/gu, '_');

  // the lines' images cut again from the PDF, each side rendered once -> [{l, base, png}]
  async function cropLines(lines) {
    const out = [], byRender = new Map();
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
        out.push({ l, base: 'lines/' + fileSafe(l.label) + '_' + l.box + '_' + String(l.i + 1).padStart(2, '0'), png: await pngOf(crop) });
      }
    }
    return out;
  }

  /* A folio side that can teach the segmenter, which finds the lines on a page: of a layout in blocks (linear,
     tripāṭha, pañcapāṭha), its blocks drawn (Calibrate: a rectangle for each), and each block holding exactly as many
     lines of text as it was given, its first lines and none after -> {layout, boxes: {box: {region, lines}}}, or
     {why} where it cannot. The segmenter's own lines on the side are then held to these counts before it learns from
     them (manuscript_ocr's msocr/sidequality.py). */
  RV.sideForSegmenter = function (p, e) {
    const type = Model.pageLayout(p, e.label);
    if (!['linear', 'tripatha', 'panchapatha'].includes(type)) return { why: 'its layout is not one the segmenter learns' };
    const reg = Model.regions(p, e);
    if (!reg || !reg.boxes) return { why: 'its blocks are not drawn (Calibrate)' };
    const pg = p.pages[e.label] || {};
    const boxes = {};
    for (const b of Model.LAYOUTS[type].boxes) {
      const name = (Model.BOX_LABEL && Model.BOX_LABEL[b]) || b;
      if (!reg.boxes[b]) return { why: 'block ' + name + ' is not drawn' };
      const n = (pg.lines && pg.lines[b]) || (p.layout.lines && p.layout.lines[b]);
      if (!n) return { why: 'block ' + name + ' has no line count' };
      const arr = (pg.boxes && pg.boxes[b]) || [];
      const filled = arr.filter((l) => ME.TEI.hasContent(l)).length;
      const first = arr.slice(0, n).filter((l) => ME.TEI.hasContent(l)).length;
      if (filled !== n || first !== n) return { why: 'block ' + name + ' has ' + filled + ' line(s) of text, not ' + n };
      boxes[b] = { region: reg.boxes[b], lines: n };
    }
    return { layout: type, boxes };
  };

  const jpegOf = (px) => new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = px.width; c.height = px.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer, px.data.byteOffset, px.width * px.height * 4), px.width, px.height), 0, 0);
    c.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/jpeg', 0.92);
  });

  // the side drawn as the segmenter learned from sides (at the pack's page height), a JPEG, with its blocks, and the
  // lines Manuscribe found on it where it read it at this very rendering, all in the image's own pixels
  async function sideImage(p, e, side, H) {
    const px = await RV.sidePixels(e, H);
    const [rx, ry, rw, rh] = px.render.rect;
    const r1 = (v) => Math.round(v * 10) / 10;
    const toPx = (r) => [r1((r[0] - rx) / rw * px.width), r1((r[1] - ry) / rh * px.height), r1(r[2] / rw * px.width), r1(r[3] / rh * px.height)];
    const boxes = {};
    for (const [b, x] of Object.entries(side.boxes)) boxes[b] = { rect: toPx(x.region), lines: x.lines };
    const found = {}, here = JSON.stringify([px.render.scale, px.render.rotation, px.render.rect]);
    for (const [b, ls] of Object.entries((p.pages[e.label] || {}).proposed || {})) {
      for (const [i, pr] of Object.entries(ls)) {
        if (pr.cut && JSON.stringify([pr.cut.r.scale, pr.cut.r.rotation, pr.cut.r.rect]) === here) (found[b] = found[b] || []).push({ line: +i + 1, baseline: pr.cut.b, outline: pr.cut.o });
      }
    }
    return { jpg: await jpegOf(px), about: { folio: e.label, layout: side.layout, width: px.width, height: px.height, render: px.render, boxes, found } };
  }

  // the package, unsealed: contribution.json (version 2), lines/ and sides/ -> Blob
  function linesPackage(p, crops, made, part, sides) {
    const rec = RV.consentRecord(p), files = [], list = [], sl = [];
    for (const { l, base, png } of crops) {
      files.push({ name: base + '.png', data: png }, { name: base + '.txt', data: l.text.trim() + '\n' });
      list.push({ image: base + '.png', text: l.text.trim(), proposed: l.proposed, folio: l.label, block: l.box, line: l.i + 1, conf: l.conf, model: l.src.version + ' (' + l.src.model + ')' });
    }
    for (const sd of sides || []) {
      const base = 'sides/' + fileSafe(sd.about.folio);
      files.push({ name: base + '.jpg', data: sd.jpg }, { name: base + '.json', data: JSON.stringify(sd.about) });
      sl.push({ image: base + '.jpg', geometry: base + '.json', folio: sd.about.folio, layout: sd.about.layout, lines: Object.fromEntries(Object.entries(sd.about.boxes).map(([b, x]) => [b, x.lines])) });
    }
    const about = { format: 'manuscribe-contribution', version: 2, made, manuscribe: ME.VERSION, part, manuscript: { name: rec.name, script: RV.scriptOf(p, rec) }, consent: rec, wording: wording(), lines: list, sides: sl };
    files.unshift({ name: 'contribution.json', data: JSON.stringify(about, null, 1) });
    return ME.Zip.write(files);
  }

  // the package of a manuscript's corrected lines, unsealed, for the folio sides chosen -> {name, blob, lines}
  RV.contributionPackage = async function (p, lines) {
    const made = new Date().toISOString(), rec = RV.consentRecord(p);
    const safe = (rec.name || 'manuscript').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
    return { name: 'contribution ' + safe + ' ' + made.slice(0, 10) + '.zip', blob: await linesPackage(p, await cropLines(lines), made, [1, 1], []), lines: lines.length };
  };

  /* Sealed for the maintainer: the lines' package in AES-256-GCM under a key of its own, that key wrapped by RSA-OAEP
     (SHA-256) to the public key of the models' site (contribute.json: {id: the first 16 hex digits of the SHA-256 of
     its SPKI, spki: base64}); manuscript_ocr's msocr.seal and the inbox's tools/inbox.py open it. -> {seal, sealed} */
  const SEAL = 'RSA-OAEP-256+A256GCM';
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const b64 = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  RV.seal = async function (bytes, key) {
    const spki = Uint8Array.from(atob(key.spki), (c) => c.charCodeAt(0));
    const id = hex(await crypto.subtle.digest('SHA-256', spki)).slice(0, 16);
    if (key.id !== id) throw new Error('the key published for contributions is not the one its id names');
    if (key.alg && key.alg !== SEAL) throw new Error('the key published for contributions is for ' + key.alg + ', which this Manuscribe does not make');
    const pub = await crypto.subtle.importKey('spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, bytes));
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, await crypto.subtle.exportKey('raw', aes)));
    return { seal: { alg: SEAL, key: id, wrapped: b64(wrapped), iv: b64(iv), file: 'sealed.bin', bytes: sealed.length, sha256: hex(await crypto.subtle.digest('SHA-256', sealed)) }, sealed };
  };

  // GitHub takes attachments of up to 25 MB: the lines go in parts of at most this many bytes of images
  RV.LIMIT = 20e6;

  /* The sealed packages of these lines, for the inbox and key cfg names (contribute.json) -> [{id, name, blob, count}]:
     each a zip of contribution.json (version 2, in the clear: its id, the manuscript's name for the model cards, the
     number of lines, the part, the consent record and its wording, the seal) and sealed.bin (the lines' package). Its
     id is c<date>-<the first 12 hex digits of the SHA-256 of sealed.bin>. */
  RV.sealedPackages = async function (p, lines, cfg, limit = RV.LIMIT, sides = []) {
    const rec = RV.consentRecord(p), crops = await cropLines(lines);
    const items = crops.map((c) => ({ c, n: c.png.length + 3 * c.l.text.length + 400 })).concat(sides.map((sd) => ({ sd, n: sd.jpg.length + 4000 })));
    const groups = [[]];
    let size = 0;
    for (const it of items) {
      if (groups[groups.length - 1].length && size + it.n > limit) { groups.push([]); size = 0; }
      groups[groups.length - 1].push(it);
      size += it.n;
    }
    const out = [];
    for (let k = 0; k < groups.length; k++) {
      const made = new Date().toISOString(), part = [k + 1, groups.length];
      const gl = groups[k].filter((x) => x.c).map((x) => x.c), gs = groups[k].filter((x) => x.sd).map((x) => x.sd);
      const inner = await linesPackage(p, gl, made, part, gs);
      const { seal, sealed } = await RV.seal(new Uint8Array(await inner.arrayBuffer()), cfg.key);
      const id = 'c' + made.slice(0, 10).replace(/-/g, '') + '-' + seal.sha256.slice(0, 12);
      const about = { format: 'manuscribe-contribution', version: 2, sealed: true, id, made, manuscribe: ME.VERSION, inbox: cfg.inbox,
        manuscript: { name: rec.name, script: RV.scriptOf(p, rec) }, count: gl.length, sides: gs.length, part, consent: rec, wording: wording(), seal };
      const blob = await ME.Zip.write([{ name: 'contribution.json', data: JSON.stringify(about, null, 1) }, { name: 'sealed.bin', data: sealed }]);
      out.push({ id, name: 'manuscribe-contribution-' + id + '.zip', blob, count: gl.length, sides: gs.length });
    }
    return out;
  };

  RV.contribute = async function (p) {
    const rec = RV.consentRecord(p);
    if (!RV.CONSENT.approved) { U.toast(DRAFT_NOTE, 'warn', 7000); return null; }
    if (!rec || rec.answer !== 'yes') { U.toast('This manuscript’s corrected lines may be contributed only once you have said yes (Manuscript tab)', 'warn', 6000); return null; }
    if (!ME.PdfView.doc) { U.toast('The PDF is not open', 'warn'); return null; }
    // what was sent before is not sent again
    const hist = ((p.consent && p.consent.history) || []).filter((h) => h.what === 'contributed');
    const sentLines = new Set(hist.flatMap((h) => h.sent || [])), sentSides = new Set(hist.flatMap((h) => h.sentSides || []));
    const lineKey = (l) => l.label + '|' + l.box + '|' + l.i;
    const lines = RV.corrected(p).filter((l) => !sentLines.has(lineKey(l))), withSides = RV.givesSides(rec);
    const sideOf = new Map(App().entries.filter((e) => !e.orphan && e.pdfPage).map((e) => [e.label, { e, s: RV.sideForSegmenter(p, e) }]));
    const okSides = withSides ? [...sideOf.values()].filter((x) => !x.s.why && !sentSides.has(x.e.label)) : [];
    if (!lines.length && !okSides.length) {
      U.toast('Nothing new to contribute: lines read here and accepted after correcting them (' + ME.Commands.keyLabel('Y') + '), or, '
        + (withSides ? 'folio sides whose drawn blocks each hold as many lines of text as you gave them' : 'with the consent asked again, folio sides'), 'info', 7000);
      return null;
    }
    const order = App().entries.map((e) => e.label);
    const folios = order.filter((f) => lines.some((l) => l.label === f) || okSides.some((x) => x.e.label === f));
    const boxes = folios.map((f) => U.el('input', { type: 'checkbox', checked: true, 'aria-label': 'Folio side ' + f, 'data-folio': f }));
    const sideCell = (f) => { const x = sideOf.get(f); return !withSides ? '—' : x && !x.s.why ? 'the whole side' : (x ? x.s.why : '—'); };
    const ok = await UI.modal({ title: 'Contribute corrected lines and folio sides', wide: true, className: 'recog-contribute-dialog', body: U.el('div', null,
      U.el('p', { class: 'help' }, 'A file (zip) with the image and corrected text of each line below, the text the model first proposed, '
        + (withSides ? 'the image of each whole folio side marked below with the blocks you drew and their line counts, ' : '')
        + 'the manuscript’s language and script (' + (RV.scriptOf(p, rec) || 'not stated') + ') and its consent record; nothing else. All of it is sealed, so that only the maintainer of the models can open it. It is saved to your computer; you then attach it to a GitHub issue that Manuscribe opens for you, filled in. Leave out any folio side you wish.'),
      withSides ? null : U.el('p', { class: 'help', 'data-recog': 'sides-need-consent' }, 'Your consent was given on wording ' + rec.wording + ', which gives corrected lines only. To give whole folio sides as well (they teach the segmenter), answer the question again in the Manuscript tab.'),
      U.el('table', { class: 'ed-table' }, U.el('tbody', null, folios.map((f, k) => U.el('tr', null, U.el('td', null, boxes[k]), U.el('td', null, 'Folio side ' + f),
        U.el('td', { class: 'num' }, lines.filter((l) => l.label === f).length + ' line(s)'), U.el('td', { class: 'help' }, sideCell(f))))))),
    buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the file', value: true, kind: 'primary' }] });
    if (!ok) return null;
    const keep = new Set(boxes.filter((b) => b.checked).map((b) => b.dataset.folio));
    const chosen = lines.filter((l) => keep.has(l.label));
    const chosenSides = okSides.filter((x) => keep.has(x.e.label));
    if (!chosen.length && !chosenSides.length) return null;
    let cfg;
    try { cfg = await Pack().contribution(); } catch (err) {
      U.toast('The key that seals contributed lines could not be read from ' + Pack().source() + 'contribute.json (' + (err.message || err) + '): try again online', 'err', 9000);
      return null;
    }
    if (cfg.wordings && !cfg.wordings.includes(rec.wording)) { U.toast('The models’ site no longer takes contributions given on this consent’s wording (' + rec.wording + '): answer the question again in the Manuscript tab', 'warn', 9000); return null; }
    const inst = await Pack().installed();
    const H = (inst && inst.manifest.page_height && inst.manifest.page_height.median) || 685;
    const sides = [];
    for (const x of chosenSides) sides.push(await sideImage(p, x.e, x.s, H));
    const pkgs = await RV.sealedPackages(p, chosen, cfg, RV.LIMIT, sides);
    for (const k of pkgs) U.download(k.name, k.blob, 'application/zip');
    const ids = pkgs.map((k) => k.id);
    const what = [chosen.length ? chosen.length + ' lines' : '', sides.length ? sides.length + ' sides' : ''].filter(Boolean).join(', ');
    const url = RV.issueUrl(cfg.inbox, 'contribution', { title: 'Contribution: ' + rec.name + ' (' + what + ')', manuscript: rec.name, ids: ids.join(' '), lines: String(chosen.length), sides: String(sides.length), script: RV.scriptOf(p, rec) });
    record(p, 'contributed', { history: { lines: chosen.length, sides: sides.length, folios: [...keep], files: pkgs.map((k) => k.name), ids, inbox: cfg.inbox, issue: url,
      sent: chosen.map(lineKey), sentSides: chosenSides.map((x) => x.e.label) } });
    rerenderMs();
    await sendDialog(pkgs, url, cfg);
    return { packages: pkgs, url, lines: chosen.length, sides: sides.length };
  };

  async function sendDialog(pkgs, url, cfg) {
    const n = pkgs.reduce((a, k) => a + k.count, 0), ns = pkgs.reduce((a, k) => a + (k.sides || 0), 0), bytes = pkgs.reduce((a, k) => a + k.blob.size, 0);
    const v = await UI.modal({ title: 'Send the contribution', wide: true, className: 'recog-send-dialog', body: U.el('div', null,
      U.el('p', null, 'Saved to your computer: ', pkgs.flatMap((k, i) => [i ? ', ' : '', U.el('code', null, k.name)]), ' (' + n + ' lines' + (ns ? ', ' + ns + ' folio sides' : '') + ', ' + MB(bytes) + '). What ' + (pkgs.length > 1 ? 'they hold is' : 'it holds is') + ' sealed: only the maintainer of the models can open it.'),
      U.el('p', null, 'Now open a new issue in ' + cfg.inbox + ' on GitHub: its form is filled in for you. Drag the file' + (pkgs.length > 1 ? 's' : '') + ' into its “Sealed package” box and submit. The issue is public, the lines and images are not; a bot answers on it once they are registered.'),
      U.el('p', { class: 'help' }, 'Questions: ' + (cfg.email || RV.INBOX.email) + '.')),
    buttons: [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Open the issue form on GitHub', value: true, kind: 'primary' }] });
    if (v) openUrl(url);
  }

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
      : r.answer === 'yes' ? 'You said yes on ' + r.date.slice(0, 10) + ' (wording ' + r.wording + '), as “' + r.name + '”' + (RV.scriptOf(p, r) ? ', ' + RV.scriptOf(p, r) : '') + '. ' + n + ' corrected line(s) can be contributed'
          + (RV.givesSides(r) ? ', and ' + App().entries.filter((e) => !e.orphan && e.pdfPage && !RV.sideForSegmenter(p, e).why).length + ' folio side(s) whose drawn blocks each hold as many lines of text as you gave them.' : '. That wording gives lines only: to give whole folio sides as well, answer again.')
        : r.answer === 'withdrawn' ? 'Consent withdrawn on ' + r.withdrawn.slice(0, 10) + ': nothing more is contributed.'
          : 'You said no on ' + r.date.slice(0, 10) + ': nothing is contributed.'));
    const sent = ((p.consent && p.consent.history) || []).filter((h) => h.what === 'contributed');
    if (sent.length) out.push(U.el('p', { class: 'help' }, 'Contributions made: ' + sent.map((h) => h.date.slice(0, 10) + ' (' + h.lines + ' lines' + (h.sides ? ', ' + h.sides + ' sides' : '') + (h.ids ? ': ' + h.ids.join(', ') : '') + ')').join('; ') + '.'));
    const last = sent.filter((h) => h.issue).pop();
    out.push(U.el('div', { class: 'btn-row' },
      !r || r.answer !== 'yes' || !RV.givesSides(r) ? U.el('button', { class: 'btn small', 'data-action': 'answer-consent', onclick: async () => { RV._notNow = null; await RV.askConsent(p); rerenderMs(); } }, r ? 'Answer again…' : 'Answer…') : null,
      r && r.answer === 'yes' ? U.el('button', { class: 'btn small', 'data-action': 'contribute', onclick: () => RV.contribute(p) }, 'Contribute corrected lines…') : null,
      r && r.answer === 'yes' && last ? U.el('button', { class: 'btn small ghost', 'data-action': 'send-again', title: 'The issue form for the files saved on ' + last.date.slice(0, 10), onclick: () => openUrl(last.issue) }, 'Open the issue form again…') : null,
      r && r.answer === 'yes' ? U.el('button', { class: 'btn small ghost', onclick: () => RV.withdraw(p) }, 'Withdraw…') : null,
      r && r.answer === 'withdrawn' && sentIds(p).length ? U.el('button', { class: 'btn small ghost', 'data-action': 'request-withdrawal', onclick: () => RV.requestWithdrawal(p) }, 'Request the withdrawal on GitHub…') : null,
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
        U.el('p', { class: 'help' + (RV.CONSENT.approved ? '' : ' recog-draft') }, RV.CONSENT.approved ? 'Off unless you tick it. Nothing is ever contributed without a yes for that manuscript, and then only as a sealed file you send yourself, attached to a GitHub issue.' : DRAFT_NOTE),
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
