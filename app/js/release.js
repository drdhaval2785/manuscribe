'use strict';
/* Issuing an edition: a version frozen with its date, checked strictly, and every output of it made at once,
   each carrying that version, date and citation, in one ZIP ready for an archive such as Zenodo. Before it, a
   self-check after the criteria of the Institut für Dokumentologie und Editorik (IDE) for reviewing scholarly
   digital editions: what a reviewer would look for and Manuscribe can see. It is a prompt, not a review. */
(function (ME) {
  const { U, Edition, Store, Collate, Norm, Zip } = ME;
  const R = {};

  R.LICENCES = { 'CC BY 4.0': 'CC-BY-4.0', 'CC BY-SA 4.0': 'CC-BY-SA-4.0', 'CC BY-NC 4.0': 'CC-BY-NC-4.0', 'CC BY-NC-SA 4.0': 'CC-BY-NC-SA-4.0', 'CC0 1.0': 'CC0-1.0' };

  // Every work's tables, built, in the order of their citation IDs. -> [{work, built}]
  R.works = async function (ed, list) {
    const recs = await Store.listCollations(ed.id);
    const reg = Edition.register(ed, list);
    const out = [];
    for (const w of ed.works) {
      const mine = recs.filter((r) => r.work === w.id);
      if (!mine.length) continue;
      const order = reg[w.id] ? reg[w.id].order : [];
      mine.sort((a, b) => order.indexOf(a.unit) - order.indexOf(b.unit));
      out.push({ work: w, recs: mine, built: mine.map((r) => Object.assign({ table: ME.CollateEdit.ensure(r.table) }, ME.Apparatus.entries(ed, r.table))) });
    }
    return out;
  };

  /* -> [{area, level: 'ok'|'warn'|'fail', text}]. A failure stops the issue. */
  R.check = async function (ed, list, works) {
    const out = [];
    const say = (area, level, t) => out.push({ area, level, text: t });
    const W = works || (await R.works(ed, list));
    // bibliographic description
    const B = 'Bibliographic description';
    say(B, ed.title ? 'ok' : 'fail', ed.title ? 'Title: ' + ed.title : 'The edition has no title');
    say(B, ed.editor ? 'ok' : 'fail', ed.editor ? 'Editor: ' + ed.editor : 'No editor is named (Edited by, under Publish)');
    say(B, ed.licence ? 'ok' : 'fail', ed.licence ? 'Licence of the edited text and apparatus: ' + ed.licence : 'No licence is given for the edition');
    say(B, ed.doi ? 'ok' : 'warn', ed.doi ? 'Persistent identifier: ' + ed.doi : 'No DOI yet: reserve one at your archive and give it here, so that it is printed in every output');
    // the sources
    const S = 'The sources';
    for (const w of ed.witnesses) {
      const x = list.find((y) => y.w === w);
      const m = (x && x.p && x.p.meta) || {};
      const lacks = [];
      if (!m.repository && !m.settlement) lacks.push('where it is kept');
      if (!m.shelfmark) lacks.push('shelfmark');
      if (!m.date) lacks.push('date');
      if (!w.images && !(x && x.p && x.p.pdf && x.p.pdf.sha256)) lacks.push('where its images are');
      if (!w.rights) lacks.push('rights in its images');
      say(S, !x || !x.p ? 'fail' : lacks.length ? 'warn' : 'ok', !x || !x.p ? w.siglum + ' is not in this browser' : w.siglum + (lacks.length ? ': not recorded: ' + lacks.join(', ') : ': described, with its images and their rights'));
    }
    // method
    const M = 'Editorial method';
    const n = Norm.describe(ed.norm);
    say(M, n.provisional ? 'warn' : 'ok', 'Normalisation: the ' + n.name + ' profile' + (n.provisional ? ', which is provisional' : '') + ', ' + n.rules.length + ' rules, stated in the principles');
    say(M, ed.trust ? 'ok' : 'warn', ed.trust ? 'Trust order for ties: ' + ed.trust.join(' › ') : 'The trust order for ties was never set: it is the order of the witness list');
    // text and apparatus
    const T = 'Text and apparatus';
    if (!W.length) say(T, 'fail', 'Nothing has been collated');
    const summaries = await Collate.summaries(ed.id);
    for (const { work, recs, built } of W) {
      const stale = recs.filter((r) => { const s = summaries.get(r.key); return s && Collate.isCurrent(ed, list, s) === false; }).map((r) => r.unit);
      const problems = built.flatMap((b) => ME.Apparatus.validate(ed, b.table, b));
      const errors = problems.filter((p) => p.level === 'error');
      const ties = problems.filter((p) => /trust order/.test(p.text)).length;
      const conflicts = built.reduce((a, b) => a + b.proposal.units.filter((u) => u.review && u.review.conflict).length, 0);
      say(T, stale.length ? 'warn' : 'ok', work.title + ': ' + recs.length + ' block(s)' + (stale.length ? '; aligned before a change of settings: ' + stale.join(', ') : ', aligned with the settings in force'));
      say(T, errors.length ? 'fail' : 'ok', work.title + ': ' + (errors.length ? errors.length + ' problem(s) in the apparatus' + (conflicts ? ', ' + conflicts + ' of them places where two copies decide differently' : '') + ', for example ' + errors[0].ref + ': ' + errors[0].text : 'the apparatus passes every check'));
      if (ties) say(T, 'warn', work.title + ': ' + ties + ' place(s) settled only by the trust order');
    }
    // data and access
    const D = 'Data and access';
    say(D, 'ok', 'The transcriptions as TEI, the apparatus in TEI parallel segmentation, the alignments and decisions as JSON: open formats, all in the release');
    say(D, 'ok', 'A reader in one HTML file that opens without a network, and a reledmac file for print');
    say(D, ed.witnesses.every((w) => w.rights) ? 'ok' : 'warn', 'Images are not in the release; ' + (ed.witnesses.every((w) => w.rights) ? 'their rights are recorded per witness' : 'record their rights per witness'));
    // sustainability
    const Y = 'Sustainability';
    say(Y, ed.lastPackage || (ed.github && ed.github.lastCommit) ? 'ok' : 'warn', ed.lastPackage || (ed.github && ed.github.lastCommit) ? 'Kept outside this browser' + (ed.github && ed.github.lastCommit ? ', in ' + ed.github.owner + '/' + ed.github.repo : '') : 'Never exported or sent: it exists only in this browser');
    say(Y, 'ok', 'Made with Manuscribe ' + ME.VERSION + ', named in every output');
    return out;
  };

  const yaml = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

  // CITATION.cff for the edition, so that GitHub, Zenodo and reference managers cite it as the editor wishes.
  R.cff = function (ed) {
    const spdx = R.LICENCES[ed.licence];
    return 'cff-version: 1.2.0\nmessage: "If you use this edition, please cite it as below."\ntype: dataset\n'
      + 'title: ' + yaml(ed.title) + '\nauthors:\n  - name: ' + yaml(ed.editor) + '\n'
      + 'version: ' + yaml(ed.version) + '\ndate-released: ' + ed.issued.date + '\n'
      + (spdx ? 'license: ' + spdx + '\n' : '') + (ed.doi ? 'doi: ' + yaml(ed.doi.replace(/^https?:\/\/doi\.org\//, '')) + '\n' : '')
      + 'keywords:\n  - critical edition\n  - Sanskrit\n  - TEI\n'
      + 'abstract: ' + yaml(ME.Publish.citation(ed)) + '\n';
  };

  // Metadata for a Zenodo deposit of the release.
  R.zenodo = function (ed, principles) {
    const spdx = R.LICENCES[ed.licence];
    return JSON.stringify({
      title: ed.title + ', version ' + ed.version, upload_type: 'dataset', version: ed.version, publication_date: ed.issued.date,
      creators: [{ name: ed.editor }], description: ME.Publish.citation(ed) + '\n\n' + principles.join('\n\n'),
      license: spdx ? spdx.toLowerCase() : undefined, keywords: ['critical edition', 'Sanskrit', 'TEI', 'Manuscribe'],
      notes: 'Made with Manuscribe ' + ME.VERSION + '. The manuscripts\' images are not included; see the conspectus and witnesses/*/images.json.',
    }, null, 1) + '\n';
  };

  /* Issues the version: refuses if a check fails. -> {zip, name, checks, files: [names]} */
  R.issue = async function (ed, list, version) {
    if (!String(version || '').trim()) throw new Error('Give the version, such as 1.0');
    if ((ed.releases || []).some((r) => r.version === version.trim())) throw new Error('Version ' + version.trim() + ' has been issued already: give a new one');
    ed.version = version.trim();
    let works = await R.works(ed, list);
    const checks = await R.check(ed, list, works);
    const failed = checks.filter((c) => c.level === 'fail');
    if (failed.length) { const e = new Error('Not issued: ' + failed.map((c) => c.text).join('; ')); e.checks = checks; throw e; }
    const now = new Date();
    ed.issued = { version: ed.version, date: now.toISOString().slice(0, 10), when: Date.now() };
    ed.releases = (ed.releases || []).concat({ version: ed.version, date: ed.issued.date, manuscribe: ME.VERSION });
    await Edition.save(ed);
    works = await R.works(ed, list);
    const { files } = await Edition.buildPackage(ed);
    const out = files.slice();
    const principles = ME.Publish.declaration(ed, works.flatMap((x) => x.built));
    for (const { work, built } of works) {
      const dir = 'output/' + Edition.safeName(work.id) + '/';
      const layered = ME.LayersView ? await ME.LayersView.baseTexts(ed, work.id) : null;
      out.push({ name: dir + 'reader.html', data: await ME.Publish.reader(ed, list, built, layered) });
      out.push({ name: dir + 'apparatus.xml', data: ME.Apparatus.tei(ed, built, work) });
      out.push({ name: dir + 'apparatus.txt', data: ME.Apparatus.text(ed, built) });
      if (ME.LayersView) out.push({ name: dir + 'indices.txt', data: ME.LayersView.indicesText(ed, built) });
      for (const f of await ME.Publish.texFiles(ed, list, built)) out.push({ name: dir + 'latex/' + f.name, data: f.data });
      // the PDF, where Manuscribe can make it (Devanagari and Latin); else the print page, to print or save as PDF
      if (ME.Typeset && ME.Typeset.fits(list)) { const pdf = await ME.Typeset.pdf(ed, list, built); out.push({ name: dir + 'edition.pdf', data: new Uint8Array(await pdf.blob.arrayBuffer()) }); }
      else out.push({ name: dir + 'print.html', data: ME.PrintHTML.html(ed, list, built, { fonts: await ME.PrintHTML.fonts(ed, built) }) });
    }
    if (ME.DTS) out.push(...ME.DTS.files(ed, works, 'output/dts/'));
    out.push({ name: 'CITATION.cff', data: R.cff(ed) });
    out.push({ name: '.zenodo.json', data: R.zenodo(ed, principles) });
    out.push({ name: 'RELEASE.txt', data: ME.Publish.citation(ed) + '\n\nIssued on ' + ed.issued.date + ' with Manuscribe ' + ME.VERSION + '.\n\nSelf-check, after the IDE criteria for reviewing scholarly digital editions:\n'
      + checks.map((c) => '  [' + (c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'look' : 'FAIL') + '] ' + c.area + ': ' + c.text).join('\n') + '\n' });
    return { zip: await Zip.write(out), name: Edition.safeName((ed.title || 'edition') + '-' + ed.version) + '.zip', checks, files: out.map((f) => f.name) };
  };

  ME.Release = R;
})(window.ME);
