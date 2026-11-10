'use strict';
/* Layered citation IDs: a base text and the commentaries on it, nested to any depth, told apart and linked by their
   xml:ids alone. It extends the convention of Saktumiva (v3.2.1 for a verse, c3.2.1-0, c3.2.1-1 for the commentary
   on it):

     letters  the layer: b is the base; each commentary on it has one letter of its own (c, r, …, never b); a
              commentary on a commentary adds one letter to its parent's (ca, cb on c; caa on ca). So the number of
              letters is the depth.
     locus    where in the base the chain hangs: digits and dots (2.47); _ joins several (2.47_2.48). x.0 is before
              all of x (c2.0-1 introduces chapter 2), and 0 before the whole text.
     -n …     the last is the block's own paragraph: -0 introduces the passage and is printed before it, -1, -2…
              follow it. The ones before it say which paragraph of the parent it comments on: ca2.47-1-2 is
              paragraph 2 of ca on c2.47-1. With fewer of them than the depth, it hangs on the parent's whole
              comment there: ca2.47-3 is on all of c at 2.47.

   b2.47 · c2.47-0 · c2.47-1 · ca2.47-1-1 · caa2.47-1-1-1 · r2.47-1 · ra2.47-1-1 · c2.47_2.48-1

   Every one is a valid xml:id. An ID that does not have this shape is an ordinary citation ID, and belongs to the
   work of the part of the page it is written in, as before. */
(function (ME) {
  const LI = {};
  LI.BASE = 'b';
  const RE = /^([A-Za-z]+)(\d+(?:\.\d+)*(?:_\d+(?:\.\d+)*)*)((?:-\d+)*)$/;

  /* -> {id, code, base, depth, loci, locus, segs, own} or null */
  LI.parse = function (id) {
    const m = RE.exec(String(id || ''));
    if (!m) return null;
    const code = m[1], locus = m[2], loci = locus.split('_');
    const segs = m[3] ? m[3].slice(1).split('-').map(Number) : [];
    if (code === LI.BASE) return segs.length === 0 && loci.length === 1 ? { id, code, base: true, depth: 0, loci, locus, segs, own: null } : null;
    if (code[0] === LI.BASE) return null;
    if (!segs.length || segs.length > code.length) return null;
    return { id, code, base: false, depth: code.length, loci, locus, segs, own: segs[segs.length - 1] };
  };

  /* Why an ID of nearly this shape is not a layer ID, for the checks of a layered edition; null if it is one, or
     looks nothing like one. */
  LI.whyNot = function (id) {
    const m = RE.exec(String(id || ''));
    if (!m || LI.parse(id)) return null;
    const code = m[1], segs = m[3] ? m[3].slice(1).split('-') : [];
    if (code === LI.BASE) return segs.length ? 'a base block has no -n: ' + LI.BASE + m[2] + '?' : 'a base block has one locus';
    if (code[0] === LI.BASE) return 'only the base begins with ' + LI.BASE;
    if (!segs.length) return 'a commentary block needs its paragraph number: ' + id + '-1?';
    return 'more -n than the ' + code.length + ' letter(s) of its layer allow';
  };

  LI.workId = (code) => 'L-' + code;
  LI.codeOf = (workId) => (typeof workId === 'string' && workId.startsWith('L-') ? workId.slice(2) : null);
  LI.parentCode = (code) => (code === LI.BASE ? null : code.length === 1 ? LI.BASE : code.slice(0, -1));

  /* What a block hangs on: {code, ids} (exact blocks) or {code, prefix} (all the parent's blocks beginning so). */
  LI.parentOf = function (x) {
    if (!x || x.base) return null;
    if (x.depth === 1) return { code: LI.BASE, ids: x.loci.map((l) => LI.BASE + l) };
    const code = x.code.slice(0, -1);
    const path = code + x.locus + x.segs.slice(0, -1).map((n) => '-' + n).join('');
    return x.segs.length === x.depth ? { code, ids: [path] } : { code, prefix: path + '-' };
  };

  /* The blocks a block hangs on, among the blocks its parent layer has: the exact ones, or all those of the whole
     comment it is on. c2.0-1 and c0-1, before a chapter or the text, hang on its first base block. */
  LI.parentsAmong = function (id, parentIds) {
    const x = LI.parse(id);
    const par = LI.parentOf(x);
    if (!par) return [];
    if (par.prefix) return parentIds.filter((t) => t.startsWith(par.prefix));
    const hit = par.ids.filter((t) => parentIds.includes(t));
    if (hit.length || par.code !== LI.BASE) return hit;
    const lead = x.loci[0].replace(/(^|\.)0$/, '');
    const first = parentIds.find((t) => !lead || t.slice(1) === lead || t.slice(1).startsWith(lead + '.'));
    return first && /(^|\.)0$/.test(x.loci[0]) ? [first] : [];
  };

  /* Links of a layer's blocks to its parent layer's, from their IDs; the editor's own (Layers.setLink) win. */
  LI.links = function (ed, workId, ids, parentIds) {
    const own = new Map(((ed && ed.links) || []).filter((l) => l.work === workId).map((l) => [l.unit, l]));
    return ids.map((id) => own.get(id) || { work: workId, unit: id, base: LI.parentsAmong(id, parentIds), kind: 'comments', fromId: true }).filter((l) => l.base.length || l.kind !== 'comments');
  };

  /* ---------- the text with all its layers, in reading order ---------- */

  /* The blocks of every layer as one text: each base block, with before it the introductions to it (-0, and to a
     chapter or the text), and after it each commentary on it in the order of the register, each followed by the
     commentaries on it, to any depth. works: [{work, built}] (Release.works). -> the built blocks in that order,
     each with layer: {code, depth, abbr, name}. A block whose parent no witness has follows its base verse, or
     comes at the end. */
  LI.weave = function (ed, works) {
    const byCode = new Map();
    for (const w of works) { const code = LI.codeOf(w.work.id); if (code) byCode.set(code, w.built); }
    const nodes = new Map();
    const key = (code, id) => code + '|' + id;
    for (const [code, built] of byCode) for (const b of built) nodes.set(key(code, b.table.unit), { code, id: b.table.unit, b, pre: [], post: [], lead: false });
    const idsOf = (code) => (byCode.get(code) || []).map((b) => b.table.unit);
    const loose = [];
    for (const [code, built] of byCode) {
      if (code === LI.BASE) continue;
      for (const b of built) {
        const me = nodes.get(key(code, b.table.unit));
        const x = LI.parse(me.id);
        if (!x) { loose.push(me); continue; }
        const par = LI.parentOf(x);
        let found = LI.parentsAmong(me.id, idsOf(par.code));
        let before = x.own === 0, at = par.code;
        // before a chapter, or the whole text
        if (par.code === LI.BASE && found.length && !idsOf(LI.BASE).includes(LI.BASE + x.loci[0])) { before = true; me.lead = true; }
        // its parent is not there: it follows its base verse
        if (!found.length && idsOf(LI.BASE).includes(LI.BASE + x.loci[0])) { found = [LI.BASE + x.loci[0]]; at = LI.BASE; before = false; }
        if (!found.length) { loose.push(me); continue; }
        const host = nodes.get(key(at, before ? found[0] : found[found.length - 1]));
        (before ? host.pre : host.post).push(me);
      }
    }
    const ownOf = (n) => { const x = LI.parse(n.id); return x && x.own !== null ? x.own : 0; };
    const sort = (arr) => arr.slice().sort((p, q) => (q.lead - p.lead) || LI.order(ed, p.code, q.code) || ownOf(p) - ownOf(q) || (p.id < q.id ? -1 : 1));
    const out = [];
    const emit = (n) => {
      for (const c of sort(n.pre)) emit(c);
      const depth = n.code === LI.BASE ? 0 : n.code.length;
      out.push(Object.assign({}, n.b, { layer: { code: n.code, depth, abbr: LI.shownAbbr(ed, n.code), name: LI.name(ed, n.code) } }));
      for (const c of sort(n.post)) emit(c);
    };
    for (const b of byCode.get(LI.BASE) || []) emit(nodes.get(key(LI.BASE, b.table.unit)));
    for (const n of loose) emit(n);
    return out;
  };

  // The layers in the order they are shown, for a legend: [{code, depth, abbr, name}]
  LI.legend = (ed) => ((ed && ed.layers) || []).slice().sort((x, y) => (x.code === LI.BASE ? -1 : y.code === LI.BASE ? 1 : LI.order(ed, x.code, y.code)))
    .map((l) => ({ code: l.code, depth: l.code === LI.BASE ? 0 : l.code.length, abbr: LI.shownAbbr(ed, l.code), name: LI.name(ed, l.code) }));

  /* ---------- the register of layers: what each letter stands for ---------- */

  LI.layered = (ed) => !!(ed && ed.layers && ed.layers.length);
  LI.layer = (ed, code) => ((ed && ed.layers) || []).find((l) => l.code === code) || null;
  LI.abbr = (ed, code) => { const l = LI.layer(ed, code); return l && l.abbr ? l.abbr : code.toUpperCase().slice(0, 2); };
  // the letters printed in [ ] before a block of the layer: every commentary has some; the base only if given one
  LI.shownAbbr = (ed, code) => { if (code !== LI.BASE) return LI.abbr(ed, code); const l = LI.layer(ed, code); return l && l.abbr ? l.abbr : ''; };
  LI.name = (ed, code) => { const l = LI.layer(ed, code); return l && l.name ? l.name : LI.defaultName(code); };
  LI.defaultName = (code) => (code === LI.BASE ? 'Base text' : code.length === 1 ? 'Commentary ' + code : 'Sub-commentary ' + code + ' (on ' + code.slice(0, -1) + ')');
  // the order of the layers: as the editor has them, a new one after its parent's family
  LI.rank = (ed) => new Map(((ed && ed.layers) || []).map((l, i) => [l.code, i]));

  /* The order of two layers when shown together: a parent before its family, and commentaries on the same text in
     the order of the register. */
  LI.order = function (ed, a, b) {
    if (a === b) return 0;
    const rank = LI.rank(ed);
    const chain = (c) => { const out = []; for (let k = 1; k <= c.length; k++) out.push(c.slice(0, k)); return out; };
    const ca = chain(a), cb = chain(b);
    for (let k = 0; k < Math.min(ca.length, cb.length); k++) {
      if (ca[k] !== cb[k]) return (rank.has(ca[k]) ? rank.get(ca[k]) : 1e6) - (rank.has(cb[k]) ? rank.get(cb[k]) : 1e6) || (ca[k] < cb[k] ? -1 : 1);
    }
    return ca.length - cb.length;
  };

  const graphemes = (s) => { try { return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).length; } catch (e) { return Array.from(s).length; } };
  LI.abbrProblem = (abbr) => (!abbr ? 'needs an abbreviation' : graphemes(abbr) > 2 ? 'an abbreviation is one or two letters' : null);

  function freeAbbr(taken, code) {
    const up = code.toUpperCase();
    const tries = [up.length <= 2 ? up : up[0] + up[up.length - 1], up[0], ...'123456789'.split('').map((d) => up[0] + d)];
    return tries.find((t) => !taken.has(t)) || up.slice(0, 2);
  }

  /* Brings the register up to the codes the witnesses use: a code not yet in it is added, named and abbreviated
     by default, after its parent's family; and each layer is a work of the edition. -> true if anything changed */
  LI.sync = function (ed, codes) {
    const have = new Set((ed.layers || []).map((l) => l.code));
    const fresh = Array.from(codes).filter((c) => !have.has(c)).sort();
    if (!fresh.length && (!ed.layers || ed.layers.every((l) => ed.works.some((w) => w.id === LI.workId(l.code))))) return false;
    const layers = (ed.layers || []).slice();
    const taken = new Set(layers.map((l) => l.abbr).filter(Boolean));
    for (const code of fresh) {
      const abbr = code === LI.BASE ? '' : freeAbbr(taken, code);
      if (abbr) taken.add(abbr);
      const item = { code, name: LI.defaultName(code), abbr };
      // after the last of its parent's family, else at the end; the base first
      let at = layers.length;
      if (code === LI.BASE) at = 0;
      else {
        const fam = LI.parentCode(code) === LI.BASE ? null : LI.parentCode(code);
        if (fam) { const last = layers.map((l) => l.code).reduce((k, c, i) => (c.startsWith(fam) ? i : k), -1); if (last >= 0) at = last + 1; }
      }
      layers.splice(at, 0, item);
    }
    ed.layers = layers;
    for (const l of layers) {
      const id = LI.workId(l.code);
      const w = ed.works.find((x) => x.id === id);
      if (!w) ed.works.push({ id, title: l.name, layer: l.code });
      else w.title = l.name;
    }
    return true;
  };

  // Renames a layer, and the work it is.
  LI.rename = function (ed, code, name, abbr) {
    const l = LI.layer(ed, code);
    if (!l) return;
    if (name !== undefined) l.name = String(name).trim() || LI.defaultName(code);
    if (abbr !== undefined) l.abbr = String(abbr).trim();
    const w = ed.works.find((x) => x.id === LI.workId(code));
    if (w) w.title = l.name;
  };

  /* ---------- checks ---------- */

  /* What is wrong in a layered edition's IDs: register (Edition.register) -> [{id, work, text}] */
  LI.check = function (ed, reg) {
    const out = [];
    if (!LI.layered(ed)) return out;
    const blocks = (code) => { const r = reg[LI.workId(code)]; return r ? r.order : []; };
    for (const l of ed.layers) {
      const pc = LI.parentCode(l.code);
      if (pc && !LI.layer(ed, pc)) out.push({ id: l.code, text: 'layer ' + l.code + ' comments on ' + pc + ', which no witness has' });
      if (l.code !== LI.BASE || l.abbr) { const why = LI.abbrProblem(l.abbr); if (why) out.push({ id: l.code, text: 'layer ' + l.code + ' ' + why }); }
    }
    const abbrs = new Map();
    for (const l of ed.layers) if (l.abbr) { if (abbrs.has(l.abbr)) out.push({ id: l.code, text: 'layers ' + abbrs.get(l.abbr) + ' and ' + l.code + ' share the abbreviation [' + l.abbr + ']' }); else abbrs.set(l.abbr, l.code); }
    for (const l of ed.layers) {
      if (l.code === LI.BASE) continue;
      for (const id of blocks(l.code)) {
        const x = LI.parse(id);
        const par = LI.parentOf(x);
        if (!par || !LI.layer(ed, par.code)) continue;
        const theirs = blocks(par.code);
        if (par.ids) {
          for (const pid of par.ids) {
            if (theirs.includes(pid)) continue;
            // c2.0-1, c0-1: before a chapter, or the whole text
            const lead = /(^|\.)0$/.test(x.loci[0]) && par.code === LI.BASE;
            if (!lead) out.push({ id, work: LI.workId(l.code), text: id + ' comments on ' + pid + ', which no witness has' });
          }
        } else if (!theirs.some((t) => t.startsWith(par.prefix))) out.push({ id, work: LI.workId(l.code), text: id + ' comments on ' + par.prefix.slice(0, -1) + ', where ' + par.code + ' has no block' });
      }
    }
    // ordinary IDs that were meant to be layer IDs
    for (const [workId, r] of Object.entries(reg)) {
      if (LI.codeOf(workId)) continue;
      for (const id of r.order) { const why = LI.whyNot(id); if (why) out.push({ id, work: workId, text: id + ' is not a layer ID (' + why + '), so it is read as an ordinary block' }); }
    }
    return out;
  };

  ME.LayerIds = LI;
})(window.ME);
