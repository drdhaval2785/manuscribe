'use strict';
/* Layered texts: a mūla and the commentaries on it, each with its own witnesses and apparatus, linked block by
   block; evidence for a reading from outside the manuscripts (a commentary, a testimonium); and registers of
   testimonia and parallels.

   Evidence is only ever what the editor has recorded. A commentary that says nothing about a word is not
   counted for any reading of it: silence is not support. */
(function (ME) {
  const Layers = {};

  /* How a block of a commentary stands to its base text, after the cases of the DHARMA Encoding Guide for Critical
     Editions, §4. Several base blocks to one commentary block is a link with more than one base. */
  Layers.KINDS = {
    comments: 'Comments on these base blocks',
    absent: 'Its base text is absent here',
    ignored: 'Passes over this part of the base text',
    none: 'Has no base text',
    implied: 'Implies a base text not known otherwise',
    reconstructible: 'Its base text can be reconstructed from it',
  };

  /* What evidence says of a reading. supports: whether it speaks for the reading. After Ajotikar, Ajotikar and
     Scharf on the Kāśikāvṛtti, with two plainer kinds. */
  Layers.EVIDENCE = {
    pratika: { label: 'pratīka', plain: 'lemma', supports: true, desc: 'quotes it as its lemma' },
    explains: { label: 'explains', plain: 'explains', supports: true, desc: 'explains or glosses this reading' },
    quotes: { label: 'quotes', plain: 'quotes', supports: true, desc: 'a testimonium quotes it' },
    kvacit: { label: 'kvacit', plain: 'reports', supports: false, desc: 'reports it as found elsewhere' },
    apapatha: { label: 'apapāṭha', plain: 'rejects', supports: false, desc: 'rejects it as a wrong reading' },
    yukta: { label: 'yukta', plain: 'proposes', supports: false, desc: 'proposes it, though not received' },
  };
  /* The name of a kind: the Sanskrit term where the witnesses are in a language of South Asia, a plain one elsewhere.
     It follows the witnesses' languages alone, not what this browser shows, so that an edition prints the same for
     everyone. */
  Layers.label = (type) => {
    const k = Layers.EVIDENCE[type];
    if (!k) return type;
    const F = ME.Features;
    // with no language known yet, the names Manuscribe has always printed
    const sa = !F || !F.contextLangs().length || F.pack('south-asian', undefined, { auto: true }).active;
    return sa ? k.label : k.plain;
  };

  // Which work a work comments on: the editor's word, else commentaries and glosses on the main text.
  Layers.baseOf = function (ed, workId) {
    const r = ed.roles && ed.roles[workId];
    if (r) return r.on || null;
    return workId === 'main' ? null : 'main';
  };
  Layers.setBase = (ed, workId, baseId) => { ed.roles = Object.assign({}, ed.roles, { [workId]: { on: baseId || null } }); };
  Layers.dependents = (ed, baseId) => ed.works.filter((w) => w.id !== baseId && Layers.baseOf(ed, w.id) === baseId);

  /* ---------- links ---------- */

  Layers.links = (ed, workId) => (ed.links || []).filter((l) => !workId || l.work === workId);
  Layers.linkOf = (ed, workId, unit) => (ed.links || []).find((l) => l.work === workId && l.unit === unit) || null;

  // Sets the link of one commentary block. base: ids of base blocks; kind from Layers.KINDS.
  Layers.setLink = function (ed, workId, unit, base, kind) {
    const rest = (ed.links || []).filter((l) => !(l.work === workId && l.unit === unit));
    if (kind || (base && base.length)) rest.push({ work: workId, unit, base: (base || []).slice(), kind: kind || 'comments' });
    ed.links = rest;
  };

  /* The DHARMA case a link stands for, in words. */
  Layers.caseOf = function (link) {
    if (!link) return 'not linked';
    if (link.kind === 'comments') return link.base.length > 1 ? 'one block on ' + link.base.length + ' base blocks (§4: several base sections, one dependent section)' : 'comments on ' + (link.base[0] || '—');
    return Layers.KINDS[link.kind] || link.kind;
  };

  /* Links proposed where the numbers agree: c2.1 with m2.1 or 2.1. Only proposals: nothing is set. */
  Layers.suggest = function (depIds, baseIds) {
    const num = (id) => (String(id).match(/(\d+(?:[.\-_]\d+)*)\s*$/) || [null, null])[1];
    const byNum = new Map();
    for (const b of baseIds) { const n = num(b); if (n && !byNum.has(n)) byNum.set(n, b); }
    return depIds.map((d) => ({ unit: d, base: byNum.has(num(d)) ? [byNum.get(num(d))] : [] })).filter((x) => x.base.length);
  };

  // Witnesses whose manuscripts carry both texts (§4: the base text embedded in the dependent one).
  Layers.embedded = function (ed, list, baseId, depId) {
    const has = (w, p, work) => ME.Export.streamsUsed(p).some((s) => ((w.streams && w.streams[s]) || s) === work && Object.values(p.pages).some((pg) => {
      const type = ME.Model.pageLayout(p, Object.keys(p.pages).find((k) => p.pages[k] === pg));
      const st = ME.Model.LAYOUTS[type].streams.find((x) => x.key === s);
      return st && st.boxes.some((b) => (pg.boxes[b] || []).some(ME.TEI.hasContent));
    }));
    return list.filter(({ w, p }) => p && has(w, p, baseId) && has(w, p, depId)).map(({ w }) => w.siglum);
  };

  /* ---------- evidence ---------- */

  Layers.evidence = (ed) => ed.evidence || [];
  Layers.evidenceAt = (ed, work, unit, key) => Layers.evidence(ed).filter((e) => e.work === work && e.unit === unit && e.key === key);

  /* Adds evidence. e: {work, unit, key, ref, reading, type, source: {label, work?, unit?, locus?}, quote, note} */
  Layers.addEvidence = function (ed, e) {
    if (!Layers.EVIDENCE[e.type]) throw new Error('Unknown kind of evidence');
    if (!e.source || !String(e.source.label || '').trim()) throw new Error('Say where the evidence is from');
    ed.evidenceSeq = (ed.evidenceSeq || 0) + 1;
    ed.evidence = Layers.evidence(ed).concat(Object.assign({ id: 'ev' + ed.evidenceSeq }, e));
    return ed.evidence[ed.evidence.length - 1];
  };
  Layers.removeEvidence = (ed, id) => { ed.evidence = Layers.evidence(ed).filter((x) => x.id !== id); };

  // One piece of evidence, printed: Comm. (pratīka) x
  Layers.formatEvidence = (ev) => ev.source.label + (ev.source.locus ? ' ' + ev.source.locus : '') + ' (' + Layers.label(ev.type) + ')' + (ev.reading !== undefined ? ' ' + (ev.reading || 'om.') : '') + (ev.quote ? ': “' + ev.quote + '”' : '');

  /* For each reading of a place, the evidence that speaks for it, and what speaks otherwise. Never more than
     was recorded. -> {for: Map(reading -> [ev]), other: [ev]} */
  Layers.supportOf = function (evs) {
    const out = { for: new Map(), other: [] };
    for (const ev of evs) {
      if (Layers.EVIDENCE[ev.type].supports) { if (!out.for.has(ev.reading)) out.for.set(ev.reading, []); out.for.get(ev.reading).push(ev); } else out.other.push(ev);
    }
    return out;
  };

  /* ---------- registers ---------- */

  // A testimonium or a parallel: {kind, title, locus, quote, place: {work, unit, ref}, licence, note}
  Layers.register = (ed, kind) => (ed.registers || []).filter((r) => !kind || r.kind === kind);
  Layers.addRegister = function (ed, r) {
    if (!['testimonium', 'parallel'].includes(r.kind)) throw new Error('A register entry is a testimonium or a parallel');
    if (!String(r.title || '').trim()) throw new Error('Name the text it comes from');
    ed.registerSeq = (ed.registerSeq || 0) + 1;
    ed.registers = Layers.register(ed).concat(Object.assign({ id: 'rg' + ed.registerSeq }, r));
    return ed.registers[ed.registers.length - 1];
  };
  Layers.removeRegister = (ed, id) => { ed.registers = Layers.register(ed).filter((x) => x.id !== id); };

  ME.Layers = Layers;
})(window.ME);
