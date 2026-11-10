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
    const was = ed.modified || 0;
    ed.modified = Date.now();
    // a change after an issue makes the outputs drafts again
    if (ed.issued && !ed.issued.changed && ed.issued.when && was >= ed.issued.when) ed.issued.changed = true;
    await Store.putEdition(ed);
  }

  Edition.save = saveEdition;

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
  // layered: whether layer IDs make works of their own (a layered edition), or are ordinary IDs
  Edition.scanWitness = function (w, p, layered) {
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
                // a layer ID belongs to its layer, wherever on the page it is written
                const lx = layered && ME.LayerIds && ME.LayerIds.parse(id);
                const into = lx ? place(ME.LayerIds.workId(lx.code)) : rec;
                if (/-auto\d+$/.test(id)) into.auto.push({ id, at });
                if (!into.units.has(id)) { into.units.set(id, []); into.order.push(id); }
                // with where in the line it starts: several blocks may begin in one line (c1.2-0, b1.2, c1.2-1)
                into.units.get(id).push(Object.assign({ pos: m.index }, at));
              } else if (kind === 'p-end' || kind === 'lg-end') rec.open[s.key] = false;
            }
            check(line.slice(last));
          }
        }
      }
    }
    return works;
  };

  /* The layers the witnesses' IDs use, in the register of the edition, each a work of it. -> true if it changed */
  Edition.syncLayers = function (ed, list) {
    const codes = new Set();
    for (const { w, p } of list) {
      if (!p) continue;
      for (const k of Object.keys(Edition.scanWitness(w, p, true))) { const c = ME.LayerIds.codeOf(k); if (c) codes.add(c); }
    }
    // an edition is layered once it has a commentary by layer ID; IDs like b1 alone are ordinary ones
    if (![...codes].some((c) => c !== ME.LayerIds.BASE) && !ME.LayerIds.layered(ed)) return false;
    return ME.LayerIds.sync(ed, codes);
  };

  /* All witnesses together: for each work, its units in a common order, and what each witness has.
     A unit a witness lacks is a problem unless the editor has explained it (Edition coverage). */
  Edition.register = function (ed, list) {
    const out = {};
    const layered = ME.LayerIds && ME.LayerIds.layered(ed);
    const scans = list.filter((x) => x.p).map(({ w, p }) => ({ w, scan: Edition.scanWitness(w, p, layered) }));
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

  /* The blocks of every work in the order they stand in the manuscript: that of the most trusted witness, a block
     only other witnesses have put after the block before it. The base and the commentaries of a layered edition
     thus come interleaved, as the scribe wrote them, and what is amiss shows: a commentary block whose base block no
     witness has, or that stands on the wrong side of it (a -0 block introduces its passage and stands before it,
     the others follow it), and blocks out of their numerical order. -> [{id, work, problem}] */
  Edition.manuscriptOrder = function (ed, list, reg) {
    const LI = ME.LayerIds;
    const R = reg || Edition.register(ed, list);
    const layered = LI.layered(ed);
    const trust = ME.Collate ? ME.Collate.trustOrder(ed) : ed.witnesses.map((w) => w.siglum);
    const rank = (s) => { const i = trust.indexOf(s); return i < 0 ? trust.length : i; };
    const byTrust = list.filter((x) => x.p).slice().sort((a, b) => rank(a.w.siglum) - rank(b.w.siglum));
    const key = (x) => x.work + '\u0000' + x.id;
    const order = [];
    for (const { w, p } of byTrust) {
      const scan = Edition.scanWitness(w, p, layered);
      const labels = Model.entries(p).map((e) => e.label);
      const pos = [];
      for (const [work, rec] of Object.entries(scan)) {
        if (!R[work]) continue;
        for (const [id, places] of rec.units) {
          if (/-auto\d+$/.test(id)) continue;
          const at = places[0];
          pos.push({ id, work, k: [labels.indexOf(at.label), Model.LAYOUTS[Model.pageLayout(p, at.label)].boxes.indexOf(at.box), at.i, at.pos || 0] });
        }
      }
      pos.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.k[3] - b.k[3]);
      let prev = -1;
      for (const x of pos) {
        let at = order.findIndex((y) => key(y) === key(x));
        if (at < 0) { at = prev + 1; order.splice(at, 0, { id: x.id, work: x.work }); }
        prev = at;
      }
    }
    if (!layered) return order;
    const index = new Map(order.map((x, i) => [key(x), i]));
    const num = (s) => s.split('.').map(Number);
    const cmpLoci = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
    const last = {};
    for (const x of order) {
      const lx = LI.parse(x.id);
      if (!lx) continue;
      const problems = [];
      const par = LI.parentOf(lx);
      if (par) {
        const pw = LI.workId(par.code);
        const pids = par.ids || order.filter((y) => y.work === pw && y.id.startsWith(par.prefix)).map((y) => y.id);
        const there = pids.filter((pid) => index.has(pw + '\u0000' + pid));
        const lead = /(^|\.)0$/.test(lx.loci[0]) && par.code === LI.BASE;
        if (!there.length && !lead) problems.push((par.ids ? 'its base block ' + pids.join(', ') + ' is' : 'the blocks of ' + par.code + ' at ' + par.prefix.slice(0, -1) + ' are') + ' missing');
        else if (there.length) {
          const i = index.get(key(x)), introduces = lx.own === 0;
          const wrong = there.filter((pid) => { const j = index.get(pw + '\u0000' + pid); return introduces ? j < i : j > i; });
          if (wrong.length) problems.push('it stands ' + (introduces ? 'after' : 'before') + ' its base block ' + wrong.join(', '));
        }
      }
      const prev = last[lx.code];
      if (prev) {
        const d = cmpLoci(lx.loci[0], prev.loci[0]);
        const sameLocus = lx.locus === prev.locus && lx.segs.length === prev.segs.length;
        const earlier = d < 0 || (sameLocus && lx.segs.every((n, i) => (i === lx.segs.length - 1 ? n < prev.segs[i] : n === prev.segs[i])));
        if (earlier) problems.push('it comes after ' + prev.id + ', out of order');
      }
      last[lx.code] = lx;
      if (problems.length) x.problem = x.id + ': ' + problems.join('; ');
    }
    return order;
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
profiles/<name>.json          the normalisation rules in force, for the record
output/tei/<siglum>.xml       TEI of each witness, made from the above and safe to regenerate
collation/<work>/<id>.json    the alignment of each citation block, with its settings and input hashes
manifest.json                 a SHA-256 of each file above, to compare copies of the edition

To open it, use Import edition package on Manuscribe's start screen.
`;

  Edition.buildPackage = async function (ed) {
    const list = await loadWitnesses(ed);
    const files = [];
    const head = U.clone(ed);
    for (const k of ['modified', 'lastPackage', 'exchange', 'github']) delete head[k];
    head.witnesses = ed.witnesses.map((w) => {
      const c = U.clone(w);
      delete c.projectId;
      c.dir = safeName(w.siglum);
      return c;
    });
    files.push({ name: 'edition.json', data: canonical(head) });
    files.push({ name: 'README.txt', data: README(ed) });
    const rules = ME.Norm.describe(ed.norm);
    files.push({ name: 'profiles/' + rules.profile + '.json', data: canonical(rules) });
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
      files.push({ name: 'witnesses/' + dir + '/images.json', data: canonical(Object.assign(p.pdf ? { file: p.pdf.name || '', bytes: p.pdf.bytes || (blob && blob.size) || null, pages: p.pdf.pages || null, sha256: p.pdf.sha256 || null } : {}, { location: w.images || null, rights: w.rights || null })) });
      const named = Object.assign({}, p, { meta: Object.assign({}, p.meta, { siglum: w.siglum }) });
      files.push({ name: 'output/tei/' + dir + '.xml', data: Export.build(named, {}).xml });
    }
    for (const table of await ME.Collate.forPackage(ed.id, ed, list)) {
      files.push({ name: 'collation/' + safeName(table.work) + '/' + safeName(table.unit) + '.json', data: canonical(table) });
    }
    const manifest = await Edition.manifest(ed, files);
    files.push({ name: 'manifest.json', data: canonical(manifest) });
    return { files, missing, manifest };
  };

  // What a copy of the edition holds, by the SHA-256 of each file: derived files and the readme aside.
  const HASHED = (name) => !name.startsWith('output/') && name !== 'README.txt' && name !== 'manifest.json';
  Edition.hashText = async function (text) {
    if (!window.crypto || !crypto.subtle) return null;
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  Edition.manifest = async function (ed, files) {
    const hashes = {};
    for (const f of files) if (HASHED(f.name) && typeof f.data === 'string') hashes[f.name] = await Edition.hashText(f.data);
    return { edition: ed.id, title: ed.title || '', made: new Date().toISOString(), by: ed.editor || '', manuscribe: ME.VERSION, files: hashes };
  };
  Edition.canonical = canonical;
  Edition.safeName = safeName;
  Edition.HASHED = HASHED;

  /* A package read without storing anything: {head, witnesses: [{w, dir, p}], tables, manifest, files}. files
     maps each name to its text. */
  Edition.readPackage = function (zip) {
    if (!zip.has('edition.json')) throw new Error('this ZIP file has no edition.json');
    const files = new Map();
    for (const [name, bytes] of zip) if (!/\.pdf$/i.test(name)) files.set(name, typeof bytes === 'string' ? bytes : Zip.text(bytes));
    const head = JSON.parse(files.get('edition.json'));
    if (!head.id || !Array.isArray(head.witnesses)) throw new Error('edition.json is not an edition');
    if (head.schema > SCHEMA) throw new Error('this package was made by a newer version of Manuscribe');
    const witnesses = head.witnesses.map((w) => {
      const raw = files.get('witnesses/' + w.dir + '/project.json');
      if (!raw) throw new Error('the package lacks witness ' + w.siglum);
      return { w, dir: w.dir, p: Model.upgrade(JSON.parse(raw)) };
    });
    const tables = [];
    for (const [name, text] of files) if (name.startsWith('collation/')) tables.push({ name, table: JSON.parse(text) });
    const manifest = files.has('manifest.json') ? JSON.parse(files.get('manifest.json')) : null;
    return { head, witnesses, tables, manifest, files };
  };

  // The state both copies knew after an exchange: the hashes of its files, and its edition.json.
  Edition.remember = async function (ed, pkg) {
    const hashes = {};
    for (const [name, text] of pkg.files) if (HASHED(name)) hashes[name] = await Edition.hashText(text);
    const head = JSON.parse(pkg.files.get('edition.json'));
    ed.exchange = { when: Date.now(), by: (pkg.manifest && pkg.manifest.by) || '', files: hashes, head };
  };

  Edition.exportPackage = async function (ed) {
    ME.App.flush();
    const { files, missing } = await Edition.buildPackage(ed);
    if (missing.length) U.toast('Not in this browser, so left out: ' + missing.join(', '), 'warn', 6000);
    U.download(safeName(ed.title || 'edition') + '.edition.zip', await Zip.write(files));
    await Edition.remember(ed, { files: new Map(files.map((f) => [f.name, f.data])), manifest: null });
    ed.lastPackage = Date.now();
    await Store.putEdition(ed);
    U.toast('Saved the edition package (' + ed.witnesses.length + ' witnesses). PDFs are not included.', 'ok', 4500);
    if (ME.Safety) ME.Safety.savedOutside();
  };

  // Reads a package into this browser. Witnesses of an edition already here are replaced, each
  // after an automatic backup; otherwise they become new projects.
  Edition.importPackage = async function (file, choose) {
    const zip = file instanceof Map ? file : await Zip.read(file);
    const pkg = Edition.readPackage(zip);
    const head = pkg.head;
    const old = await Store.getEdition(head.id);
    let mode = 'new';
    if (old) {
      mode = await choose(old, head);
      if (!mode) return null;
    }
    const byDir = new Map(old && mode === 'replace' ? old.witnesses.map((w) => [safeName(w.siglum), w]) : []);
    const ed = Object.assign({}, head, { modified: Date.now(), lastPackage: old && mode === 'replace' ? old.lastPackage : 0 });
    if (mode === 'copy') { ed.id = U.uid('ed'); ed.title = (ed.title || 'Edition') + ' (copy)'; }
    if (old && mode === 'replace' && old.github) ed.github = old.github;
    ed.witnesses = [];
    for (const w of head.witnesses) {
      const raw = zip.get('witnesses/' + w.dir + '/project.json');
      if (!raw) throw new Error('the package lacks witness ' + w.siglum);
      const p = JSON.parse(typeof raw === 'string' ? raw : Zip.text(raw));
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
    await Edition.remember(ed, pkg);
    await Store.putEdition(ed);
    await ME.Collate.fromPackage(ed.id, pkg.tables.map((x) => x.table));
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
      // a layered edition's IDs say the layers: every part of the page goes, as Saktumiva reads it
      const streams = ME.LayerIds.codeOf(workId) || (ME.CollateView && workId === ME.CollateView.ALL) ? Export.streamsUsed(p) : Export.streamsUsed(p).filter((s) => workOf(w, s) === workId);
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
    await Edition.draw();
  };

  // how long since the work was last saved outside the browser; null if there is nothing to remind of
  Edition.reminder = function (ed, list, now) {
    const t = now || Date.now();
    const changed = Math.max(ed.modified || 0, ...list.filter((x) => x.p).map((x) => x.p.modified || 0));
    if (!ed.witnesses.length || (ed.lastPackage && changed <= ed.lastPackage)) return null;
    // backups to a folder keep it safe already
    if (ME.Safety && ME.Safety.state() === 'ok') return null;
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
        if (ed.trust) ed.trust = ed.trust.map((x) => (x === w.siglum ? v : x));
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
      U.el('table', { class: 'ed-table ed-boxed' },
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
      U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table ed-boxed' }, U.el('thead', null, U.el('tr', null, U.el('th', null, 'Siglum'), streams.map((s) => U.el('th', null, STREAM_NAMES[s])))), U.el('tbody', null, rows))),
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

  const GRID_ALL = '*all';
  function coverageGrid(ed, reg, redraw, list) {
    const works = Object.values(reg).filter((r) => r.order.length);
    if (!works.length) return U.el('p', { class: 'help' }, 'No citation IDs yet. Mark paragraphs and verses in the witnesses, each with the same xml:id across witnesses, and they appear here.');
    // every work, the default, or one
    if (ME.LayerIds.layered(ed)) works.sort((a, b) => { const ca = ME.LayerIds.codeOf(a.work.id), cb = ME.LayerIds.codeOf(b.work.id); return ca && cb ? ME.LayerIds.order(ed, ca, cb) : ca ? -1 : cb ? 1 : 0; });
    const all = works.length > 1;
    if (!(Edition.gridWork === GRID_ALL && all) && !works.some((r) => r.work.id === Edition.gridWork)) Edition.gridWork = all ? GRID_ALL : works[0].work.id;
    const showAll = Edition.gridWork === GRID_ALL;
    const shownWorks = showAll ? works : works.filter((x) => x.work.id === Edition.gridWork);
    const total = shownWorks.reduce((n, x) => n + x.order.length, 0);
    const pick = U.el('select', { 'aria-label': 'Which work', onchange: () => { Edition.gridWork = pick.value; redraw(); } },
      all ? U.el('option', { value: GRID_ALL, selected: showAll }, 'All (' + works.reduce((n, x) => n + x.order.length, 0) + ')') : null,
      works.map((x) => U.el('option', { value: x.work.id, selected: !showAll && x.work.id === Edition.gridWork }, x.work.title + ' (' + x.order.length + ')')));
    // the witnesses across: every one that has a part of the works shown
    const sigla = ed.witnesses.map((w) => w.siglum).filter((sg) => shownWorks.some((x) => x.witnesses.some((y) => y.siglum === sg)));
    const cell = (id, x, r) => {
      if (!x) return U.el('td', { class: 'cov muted', title: 'This witness does not carry this work' }, '—');
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
    let left = GRID_LIMIT;
    const body = [];
    let amiss = 0;
    if (showAll && list) {
      // every work's blocks as they stand in the manuscript, each with its layer or work; what is amiss highlighted
      const LI = ME.LayerIds;
      const seq = Edition.manuscriptOrder(ed, list, reg).filter((x) => reg[x.work] && reg[x.work].order.length);
      for (const x of seq.slice(0, left)) {
        const r = reg[x.work], code = LI.codeOf(x.work);
        const mark = code && code !== LI.BASE ? U.el('span', { class: 'ly-abbr-tag', style: 'margin-inline-start: ' + ((code.length - 1) * 0.9) + 'em', title: LI.name(ed, code) }, '[' + LI.abbr(ed, code) + '] ')
          : !code && works.length > 1 ? U.el('span', { class: 'ly-abbr-tag', title: r.work.title }, '[' + r.work.title.slice(0, 1).toUpperCase() + '] ') : null;
        if (x.problem) amiss++;
        body.push(U.el('tr', { class: x.problem ? 'cov-bad' : '', title: x.problem || null }, U.el('th', { class: 'unit' }, mark, x.id), sigla.map((sg) => cell(x.id, r.witnesses.find((y) => y.siglum === sg), r))));
      }
    } else {
      for (const r of shownWorks) {
        if (left <= 0) break;
        for (const id of r.order.slice(0, left)) body.push(U.el('tr', null, U.el('th', { class: 'unit' }, id), sigla.map((sg) => cell(id, r.witnesses.find((y) => y.siglum === sg), r))));
        left -= r.order.length;
      }
    }
    return U.el('div', null,
      U.el('div', { class: 'ed-grid-head' }, U.el('label', null, 'Work ', pick),
        U.el('span', { class: 'help' }, (showAll && works.length > 1 ? 'in the order of the manuscript · ' : '') + '✓ present · number: times it occurs · empty: missing · click an empty cell to explain it: lac = lacuna, … = not yet transcribed, – = outside its scope')),
      amiss ? U.el('p', { class: 'ed-warn' }, amiss + ' block(s) highlighted: a commentary block without its base block, on the wrong side of it, or out of order (the pointer on a row says which). Check them in Collate.') : null,
      U.el('div', { class: 'ed-scroll ed-grid' }, U.el('table', { class: 'ed-table cov-table' },
        U.el('thead', null, U.el('tr', null, U.el('th', { class: 'unit' }, 'Citation ID'), sigla.map((sg) => U.el('th', null, sg)))),
        U.el('tbody', null, body))),
      total > GRID_LIMIT ? U.el('p', { class: 'help' }, 'Showing the first ' + GRID_LIMIT + ' of ' + total + ' IDs.') : null);
  }

  /* The edition screen: three steps, Witnesses, Collate (deciding included) and Publish, each showing only its own
     work, under a sentence that says where the edition stands and offers the next thing to do. */
  Edition.STEPS = [['witnesses', 'Witnesses'], ['collate', 'Collate'], ['publish', 'Publish']];
  Edition.stepOf = {};

  // Where the edition stands, for the work in view.
  async function standing(ed, list, reg) {
    const summaries = await ME.Collate.summaries(ed.id);
    const work = ME.CollateView.work;
    const regs = Object.values(reg).filter((r) => r.order.length);
    // all the layers of a layered edition at once, or one work
    const chosen = work === ME.CollateView.ALL ? regs.filter((x) => ME.LayerIds.codeOf(x.work.id)) : [regs.find((x) => x.work.id === work) || regs[0]].filter(Boolean);
    const r = chosen[0];
    const pairs = chosen.flatMap((x) => x.order.map((id) => ({ work: x.work.id, id })));
    const ids = pairs.map((x) => x.id);
    const sums = pairs.map((x) => summaries.get(ME.Collate.keyOf(ed.id, x.work, x.id))).filter(Boolean);
    const stale = sums.filter((x) => ME.Collate.isCurrent(ed, list, x) === false).length;
    // the first block with something to look at: a decision to review, else a difference not yet decided
    const first = sums.find((x) => x.review) || sums.find((x) => (x.differ || 0) > (x.decided || 0));
    const open = first ? first.unit : null;
    return { witnesses: ed.witnesses.length, blocks: ids.length, collated: sums.length, stale, open, work: first ? first.work : r ? r.work.id : null,
      decided: sums.reduce((a, x) => a + (x.decided || 0), 0), differ: sums.reduce((a, x) => a + (x.differ || 0), 0), review: sums.reduce((a, x) => a + (x.review || 0), 0) };
  }

  // What to say, and what to offer next.
  const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  function advice(st, go, openBlock) {
    if (!st.witnesses) return { sentence: 'Begin with the transcriptions of the manuscripts you are editing: add them as witnesses.', next: { label: 'Add witnesses…', run: () => go('witnesses', 'add') } };
    if (st.witnesses < 2) return { sentence: 'One witness so far: add the others, to compare them.', next: { label: 'Add witnesses…', run: () => go('witnesses', 'add') } };
    if (!st.blocks) return { sentence: 'The witnesses have no citation IDs in common yet. Mark each paragraph and verse with the same xml:id in every witness, so that they can be compared block by block.', next: null };
    if (st.collated < st.blocks) return { sentence: (st.blocks === 1 ? 'The block is' : (st.blocks - st.collated) + ' of ' + st.blocks + ' blocks are') + ' not yet collated.', next: { label: 'Collate', run: () => go('collate', 'collate') } };
    if (st.stale) return { sentence: n(st.stale, 'block was', 'blocks were') + ' aligned before a change of settings: collate again.', next: { label: 'Collate', run: () => go('collate', 'collate') } };
    if (st.review) return { sentence: (st.blocks === 1 ? 'The block is' : 'All ' + st.blocks + ' blocks are') + ' collated; ' + n(st.review, 'place waits', 'places wait') + ' for your review.', next: { label: 'Review ' + st.open, run: () => openBlock(st.open) } };
    return { sentence: (st.blocks === 1 ? 'The block is' : 'All ' + st.blocks + ' blocks are') + ' collated: ' + n(st.differ, 'place', 'places') + ' where the witnesses differ, ' + st.decided + ' decided by you.', next: st.decided || st.differ === 0 || !st.open ? { label: 'Publish', run: () => go('publish') } : { label: 'Decide in ' + st.open, run: () => openBlock(st.open) } };
  }

  Edition.draw = async function () {
    const ed = Edition.current;
    if (!ed) return;
    const host = view();
    const scroller = document.getElementById('start');
    const top = scroller.scrollTop;
    const list = await loadWitnesses(ed);
    const F = ME.Features;
    F.setContext(F.langsOf(list));
    const redraw = () => Edition.draw();
    if (Edition.syncLayers(ed, list)) await saveEdition(ed);
    const reg = Edition.register(ed, list);
    const layered = ME.LayerIds.layered(ed);
    if (layered && (!ME.CollateView.work || !reg[ME.CollateView.work])) ME.CollateView.work = ME.CollateView.ALL;
    else if (!layered && (!ME.CollateView.work || !reg[ME.CollateView.work])) { const first = Object.values(reg).find((x) => x.order.length); if (first) ME.CollateView.work = first.work.id; }
    const st = await standing(ed, list, reg);
    const known = Edition.STEPS.some(([k]) => k === Edition.stepOf[ed.id]);
    const step = known ? Edition.stepOf[ed.id] : st.witnesses < 2 ? 'witnesses' : 'collate';
    const go = async (k, then) => {
      Edition.stepOf[ed.id] = k;
      await Edition.draw();
      if (then === 'add') addWitnesses(ed, redraw);
      if (then === 'collate') { const b = document.querySelector('#edition-view [data-action="collate"]'); if (b && !b.disabled) b.click(); }
    };
    const title = U.el('input', { type: 'text', class: 'ed-title', value: ed.title, placeholder: 'Title of the edition', onchange: async () => { ed.title = title.value.trim(); await saveEdition(ed); } });
    const due = Edition.reminder(ed, list);
    const remind = due === null ? null : U.el('div', { class: 'ed-remind' }, due === 'never'
      ? 'This edition has never been saved outside this browser. Clearing the browser’s data would delete it: Export › Edition package.'
      : 'Your last package export was ' + due + ' days ago, and the work has changed since: Export › Edition package.');
    const count = { witnesses: String(st.witnesses), collate: st.blocks ? st.collated + '/' + st.blocks : '', publish: ed.issued ? ed.issued.version : '' };
    const steps = U.el('nav', { class: 'ed-steps', 'aria-label': 'Steps of the edition' }, Edition.STEPS.map(([k, label], i) => U.el('button', { class: 'ed-step' + (k === step ? ' on' : ''), dataset: { action: 'step-' + k }, 'aria-current': k === step ? 'step' : null, onclick: () => go(k) },
      U.el('span', { class: 'ed-step-n' }, String(i + 1)), ' ' + label, count[k] ? U.el('span', { class: 'ed-step-c' }, count[k]) : null)));
    const openBlock = (unit) => ME.CollateView.open(ed, list, st.work, unit, redraw);
    const a = advice(st, go, openBlock);
    const here = a.next && a.next.label === 'Publish' && step === 'publish';
    const status = U.el('div', { class: 'ed-status' }, U.el('span', null, a.sentence), a.next && !here ? U.el('button', { class: 'btn small primary', dataset: { action: 'next' }, onclick: a.next.run }, a.next.label) : null);
    let body;
    if (step === 'witnesses') body = witnessesStep(ed, list, reg, redraw);
    else if (step === 'collate') body = await ME.CollateView.section(ed, list, redraw);
    else body = await ME.Steps.publish(ed, list, redraw);
    // what the editor opened or closed stays so when the screen is drawn again
    const foldKey = (d) => d.dataset.fold || (d.querySelector('summary') ? d.querySelector('summary').textContent.replace(/\d+/g, '#').slice(0, 60) : null);
    for (const d of host.querySelectorAll('details')) { const k = foldKey(d); if (k) Edition.folds[k] = d.open; }
    host.innerHTML = '';
    host.append(...[
      U.el('div', { class: 'ed-bar' },
        U.el('button', { class: 'btn small', onclick: () => ME.App.showStart() }, '‹ Start'),
        title,
        U.el('button', { class: 'btn small primary', title: 'Every output of the edition: print, read, exchange, archive', dataset: { action: 'export' }, onclick: () => ME.ExportView.open({ kind: 'edition', ed, list, workId: ME.CollateView.work, redraw }) }, 'Export…'),
        F.on('share') || (ed.github && ed.github.repo) ? U.el('button', { class: 'btn small', title: 'Compare and merge another copy, GitHub, and the copies kept before merging', dataset: { action: 'share' }, onclick: () => ME.Steps.share(ed, redraw) }, 'Share…') : null,
        U.el('button', { class: 'btn small icon', title: 'Settings: how much is shown, language features', dataset: { action: 'settings' }, onclick: () => ME.App.showSettings() }, '⚙'),
        U.el('button', { class: 'btn small icon', title: 'How the edition goes, and its keys', dataset: { action: 'help' }, onclick: () => ME.Steps.help() }, '?')),
      // the edition's version, and Manuscribe's (also on every page it prints)
      U.el('p', { class: 'ed-version', dataset: { action: 'edition-version' } }, ME.Publish.versions(ed)),
      steps, status, remind,
      U.el('div', { class: 'ed-stepbody', dataset: { step } }, body)].filter(Boolean)); // append would write an empty value out as "null"
    for (const d of host.querySelectorAll('details')) { const k = foldKey(d); if (k && Object.prototype.hasOwnProperty.call(Edition.folds, k)) d.open = Edition.folds[k]; }
    scroller.scrollTop = top;
  };
  Edition.folds = {};

  // Step 1: the witnesses, one way to add them, and their citation IDs in one line.
  function witnessesStep(ed, list, reg, redraw) {
    const problems = problemsList(reg, ed);
    const nProblems = problems && problems.tagName === 'UL' ? problems.children.length : 0;
    const manyStreams = list.some((x) => x.p && Export.streamsUsed(x.p).length > 1);
    const ids = Object.values(reg).reduce((a, r) => a + r.order.length, 0);
    return U.el('div', null,
      U.el('div', { class: 'nv-head' }, U.el('h2', null, 'Witnesses (' + ed.witnesses.length + ')'),
        U.el('button', { class: 'btn small primary', dataset: { action: 'add-witnesses' }, onclick: () => addWitnesses(ed, redraw) }, 'Add witnesses…')),
      ed.witnesses.length ? witnessTable(ed, list, redraw) : U.el('p', { class: 'help' }, 'An edition brings together the transcriptions of several manuscripts of one text. Add them here: from this browser, or from XML or backup files.'),
      manyStreams ? U.el('details', { class: 'nv-fold', dataset: { fold: 'works' } }, U.el('summary', null, 'Works: ' + ed.works.filter((w) => list.some((x) => x.p && Export.streamsUsed(x.p).some((k) => ((x.w.streams && x.w.streams[k]) || k) === w.id))).map((w) => w.title.toLowerCase()).join(', ') + ', in each witness'), streamTable(ed, list, redraw)) : null,
      ed.witnesses.length ? U.el('details', { class: 'nv-fold', dataset: { fold: 'ids' }, open: nProblems > 0 && nProblems < 8 }, U.el('summary', null, !ids ? 'No citation IDs yet' : nProblems ? 'Citation IDs: ' + nProblems + ' thing(s) to look at' : 'Citation IDs: ' + ids + ' block(s), in every witness'),
        problems, coverageGrid(ed, reg, redraw, list)) : null,
      ME.LayerIds.layered(ed) ? layersFold(ed, reg, redraw) : null);
  }

  /* The layers of a layered edition: what each letter of the IDs stands for, its abbreviation in [ ], and the
     order of commentaries on the same text; with what is wrong in the IDs. */
  function layersFold(ed, reg, redraw) {
    const LI = ME.LayerIds;
    const problems = LI.check(ed, reg);
    const count = (code) => { const r = reg[LI.workId(code)]; return r ? r.order.length : 0; };
    const siblings = (code) => ed.layers.filter((l) => LI.parentCode(l.code) === LI.parentCode(code));
    const move = async (code, d) => {
      const sib = siblings(code);
      const i = sib.findIndex((l) => l.code === code), j = i + d;
      if (j < 0 || j >= sib.length) return;
      const a = ed.layers.indexOf(sib[i]), b = ed.layers.indexOf(sib[j]);
      [ed.layers[a], ed.layers[b]] = [ed.layers[b], ed.layers[a]];
      await saveEdition(ed); redraw();
    };
    const save = async () => { await saveEdition(ed); redraw(); };
    const rows = ed.layers.slice().sort((x, y) => (x.code === LI.BASE ? -1 : y.code === LI.BASE ? 1 : 0) || LI.order(ed, x.code, y.code)).map((l) => {
      const depth = l.code === LI.BASE ? 0 : l.code.length;
      const name = U.el('input', { type: 'text', value: l.name, 'aria-label': 'Name of layer ' + l.code, onchange: () => { LI.rename(ed, l.code, name.value); save(); } });
      const abbr = l.code === LI.BASE ? U.el('span', { class: 'help' }, '—') : U.el('input', { type: 'text', class: 'ly-abbr', value: l.abbr || '', maxlength: 8, 'aria-label': 'Abbreviation of layer ' + l.code, onchange: () => { LI.rename(ed, l.code, undefined, abbr.value); save(); } });
      const sib = siblings(l.code), i = sib.indexOf(l);
      return U.el('tr', null,
        U.el('td', { class: 'ly-code', style: 'padding-inline-start: ' + (0.4 + depth * 1.1) + 'em' }, U.el('code', null, l.code)),
        U.el('td', null, name), U.el('td', null, abbr),
        U.el('td', { class: 'num' }, String(count(l.code))),
        U.el('td', { class: 'help' }, l.code === LI.BASE ? '' : LI.name(ed, LI.parentCode(l.code))),
        U.el('td', null, l.code === LI.BASE || sib.length < 2 ? null : [
          U.el('button', { class: 'btn small', title: 'Before the commentary above it', disabled: i === 0, onclick: () => move(l.code, -1) }, '↑'),
          U.el('button', { class: 'btn small', title: 'After the commentary below it', disabled: i === sib.length - 1, onclick: () => move(l.code, 1) }, '↓')]));
    });
    return U.el('details', { class: 'nv-fold ly-fold', dataset: { fold: 'layers' }, open: problems.length > 0 && problems.length < 12 },
      U.el('summary', null, 'Layers: ' + ed.layers.length + (problems.length ? ' · ' + problems.length + ' thing(s) to look at' : '')),
      U.el('p', { class: 'help' }, 'The IDs say which layer each block is in and what it comments on: b2.47 is the base, c2.47-1 a commentary on it, ca2.47-1-1 a commentary on c2.47-1. Name each layer here, and give it the one or two letters printed in [ ] before its blocks.'),
      U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table ed-boxed ly-table' },
        U.el('thead', null, U.el('tr', null, ['Letters', 'Layer', 'In [ ]', 'Blocks', 'Comments on', ''].map((h) => U.el('th', null, h)))),
        U.el('tbody', null, rows))),
      problems.length ? U.el('ul', { class: 'ap-problems' }, problems.slice(0, 200).map((p) => U.el('li', { class: 'warn' }, U.el('span', { class: 'ed-tag warn' }, 'look'), ' ', p.text))) : null);
  }

  // One way in for every kind of witness.
  async function addWitnesses(ed, redraw) {
    const choice = await UI.modal({ title: 'Add witnesses', body: U.el('div', { class: 'xv' },
      U.el('p', { class: 'help' }, 'Each witness is a transcription of one manuscript. It stays an ordinary transcription, which you can go on working on.')),
    buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: 'From backup files…', value: 'backup' }, { label: 'From XML files…', value: 'xml' }, { label: 'From this browser…', value: 'browser', kind: 'primary' }].concat(ed.witnesses.length ? [{ label: 'Relink PDFs…', value: 'relink', left: true }] : []) });
    if (choice === 'browser') await addFromBrowser(ed);
    else if (choice === 'xml') await addFromXml(ed);
    else if (choice === 'backup') await addFromBackups(ed);
    else if (choice === 'relink') {
      const files = await pickFiles('application/pdf,.pdf', true);
      if (files.length) {
        const r = await Edition.relinkPdfs(ed, files);
        U.toast('Relinked ' + r.done.length + ' PDF(s)' + (r.unused.length ? '. No witness matches: ' + r.unused.join(', ') : ''), r.unused.length ? 'warn' : 'ok', 6000);
      }
    }
    if (choice) redraw();
  }
  Edition.addWitnesses = addWitnesses;

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
    document.getElementById('btn-open').onclick = async () => {
      const [file] = await pickFiles('.json,.zip,.xml,.txt,application/json,application/zip,application/xml,text/xml', false);
      if (!file) return;
      if (/\.json$/i.test(file.name)) { ME.App.importProjectFile(file); return; }
      if (/\.(xml|txt)$/i.test(file.name)) { ME.App.newProject({ xml: file }); return; }
      Edition.importFile(file);
    };
    Edition.importFile = async (file) => {
      try {
        const zip = await ME.Zip.read(file);
        // a backup of everything (safety.js)
        if (ME.Safety && ME.Safety.isBackup(zip)) {
          const n = await ME.Safety.restore(zip);
          if (n) { U.toast('Restored: ' + n.added + ' added, ' + n.replaced + ' replaced by newer copies, ' + n.kept + ' kept as they were here.', 'ok', 7000); ME.App.showStart(); }
          return;
        }
        const ed = await Edition.importPackage(zip, (old, head) => UI.modal({
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
