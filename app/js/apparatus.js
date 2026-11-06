'use strict';
/* The edited text and its apparatus, made from the collation tables and the editor's decisions. Nothing is
   stored here: the tables hold the readings and the decisions, and this turns them into entries, checks
   them, searches them and writes them out as text or TEI.

   An entry: {unit, ref, lemma, lemWits, readings: [{text, wits}], missing: [{wit, why}], ac: [...],
   decision, kind, prev}, every set of witnesses as sigla. Data stay positive: which witnesses read the
   lemma is always known, whatever the printed form leaves out. */
(function (ME) {
  const { U, Norm, Collate, CollateEdit: E } = ME;
  const App_ = {};

  // Conventions, per edition, as editable strings. The Latin set follows the Helsinki stemmatology glossary;
  // the English one is plain words. Other conventions, Devanagari ones included, can be written in.
  App_.ABBREVIATIONS = {
    latin: { name: 'Latin', om: 'om.', add: 'add.', post: 'post', ante: 'ante', transp: 'transp.', lac: 'lac.', illeg: 'illeg.', ac: 'a.c.', pc: 'p.c.', em: 'em.', conj: 'conj.', omnes: 'omnes', rell: 'rell.', deest: 'deest', crux: '†' },
    english: { name: 'English', om: 'omits', add: 'adds', post: 'after', ante: 'before', transp: 'transposes', lac: 'lost in', illeg: 'illegible in', ac: 'before correction', pc: 'after correction', em: 'emended', conj: 'conjectured', omnes: 'all', rell: 'the rest', deest: 'lacking', crux: '†' },
  };
  App_.DEFAULTS = { polarity: 'auto', abbr: 'latin', groups: true, deest: true, orthographica: false, singular: false, star: 60, custom: null, keys: 'markers' };
  App_.settings = (ed) => Object.assign({}, App_.DEFAULTS, ed.apparatus || {});
  App_.abbr = (ed) => { const s = App_.settings(ed); return Object.assign({}, App_.ABBREVIATIONS[s.abbr] || App_.ABBREVIATIONS.latin, s.custom || {}); };

  const WHY = { lac: 'lac', illeg: 'illeg', na: 'lac', ambig: 'illeg', transposed: 'transp' };
  const trim = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  // two spellings differ only if their letters do: spacing and punctuation are not spelling
  const letters = (s) => String(s || '').replace(/[\s।॥|.,;:!?()[\]"“”‘’-]/g, '');

  /* Entries for one table. trust: sigla, most trusted first. -> {entries, text, stars, unitsOfText, proposal} */
  App_.entries = function (ed, table) {
    E.ensure(table);
    const P = E.proposal(table, Collate.trustOrder(ed));
    const s = App_.settings(ed);
    const entries = [];
    const stars = [];
    let word = 0;
    let prevText = '';
    const ends = (t) => !t || /[\s।॥|]$/.test(t);
    P.units.forEach((u, ui) => {
      const before = ui > 0 ? P.units[ui - 1].text : '';
      const after = ui + 1 < P.units.length;
      const lemma = trim(u.text);
      const ref = table.unit + '.' + (word + 1);
      if (trim(u.text).replace(/[।॥|.,;:]/g, '')) word += trim(u.text).split(' ').length;
      const differs = u.differs || (u.decision && u.decision.type !== 'selectio') || u.review;
      // spellings that differ where the witnesses agree: kept, for the TEI and an orthographica tier
      const spelled = !differs && !u.missing.length && u.groups.some((g) => new Set(g.members.filter((m) => m.votes).map((m) => letters(m.text))).size > 1);
      const hasEvidence = ME.Layers && ME.Layers.evidenceAt(ed, table.work, table.unit, u.key).length > 0;
      if (!differs && !u.missing.length && !spelled && !hasEvidence) { prevText = lemma || prevText; return; }
      const sig = (m) => m.siglum;
      const lemGroup = u.winner;
      const lemWits = lemGroup ? [...new Set(lemGroup.members.filter((m) => m.votes).map(sig))] : [];
      // a witness with a spelling of its own is still a witness of the lemma
      const readings = [];
      const ac = [];
      for (const g of u.groups) {
        const voters = [...new Set(g.members.filter((m) => m.votes).map(sig))];
        // a witness's text before correction is cited only where it differs from its corrected text
        for (const m of g.members.filter((x) => !x.votes)) {
          const own = u.groups.find((x) => x.members.some((y) => y.siglum === m.siglum && y.votes));
          if (own !== g) ac.push({ wit: m.siglum, text: trim(g.form.text), layer: 'ac' });
        }
        if (g === lemGroup || !voters.length) continue;
        // spelling variants inside one reading, for an orthographica tier
        readings.push({ text: trim(g.form.text), wits: voters, n: g.form.n });
      }
      const orth = [];
      for (const g of u.groups) {
        const forms = new Map();
        for (const m of g.members.filter((x) => x.votes)) { const k = letters(m.text); if (!forms.has(k)) forms.set(k, { text: trim(m.text), wits: [] }); forms.get(k).wits.push(m.siglum); }
        if (forms.size > 1) for (const [k, f] of forms) if (k !== letters(g.form.text)) orth.push({ text: f.text, wits: f.wits, of: trim(g.form.text) });
      }
      const missing = u.missing.filter((m) => m.layer !== 'ac').map((m) => ({ wit: m.siglum, why: WHY[m.why] || m.why, label: m.label, text: trim(m.text) })).filter((m, i, arr) => arr.findIndex((x) => x.wit === m.wit) === i);
      const kind = spelled && !hasEvidence ? 'orthographic' : !differs && !spelled && !u.missing.length ? 'testimonium' : !lemma && readings.some((r) => r.text) ? 'addition' : 'variant';
      // inside a word: printed with hyphens, as -यांशज्या-
      const inside = { left: ui > 0 && !ends(before), right: after && !ends(u.text) };
      const testimonia = ME.Layers ? ME.Layers.evidenceAt(ed, table.work, table.unit, u.key) : [];
      const entry = { unit: table.unit, ref, lemma, lemWits, inside, testimonia, readings, ac, missing, orth, decision: u.decision || null, review: u.review || null, kind, prev: prevText, decided: u.decided, fromId: u.fromId, toId: u.toId };
      // a long addition in few witnesses goes to an appendix, as a starred passage
      if (kind === 'addition') {
        for (const r of readings) {
          if (r.text.length >= s.star) {
            const id = table.unit + '*' + (stars.length + 1);
            stars.push({ id, after: prevText, text: r.text, wits: r.wits, unit: table.unit });
            r.star = id;
          }
        }
      }
      entries.push(entry);
      if (lemma) prevText = lemma;
    });
    return { entries, stars, text: P.text, proposal: P };
  };

  /* ---------- printing an entry ---------- */

  function groupsOf(ed) {
    const out = new Map();
    for (const w of ed.witnesses) if (w.group) { if (!out.has(w.group)) out.set(w.group, []); out.get(w.group).push(w.siglum); }
    return out;
  }

  /* Sigla in edition order, with a group siglum for a whole group of extant witnesses. -> {text, expands: [sigla]} */
  App_.sigla = function (ed, wits, extant, s) {
    const order = ed.witnesses.map((w) => w.siglum);
    let rest = order.filter((x) => wits.includes(x)).concat(wits.filter((x) => !order.includes(x)));
    const parts = [];
    const ab = App_.abbr(ed);
    if (s.groups) {
      const groups = [...groupsOf(ed)].sort((a, b) => b[1].length - a[1].length);
      for (const [name, members] of groups) {
        const here = members.filter((m) => extant.includes(m));
        if (here.length < 2 || !here.every((m) => rest.includes(m))) continue;
        const lacking = members.filter((m) => !extant.includes(m));
        parts.push(name + (lacking.length && s.deest ? ' (' + ab.deest + ' ' + lacking.join(' ') + ')' : ''));
        rest = rest.filter((x) => !here.includes(x));
      }
    }
    return { text: parts.concat(rest).join(' '), expands: wits.slice() };
  };

  const shorten = (t) => { const w = trim(t).split(' '); return w.length > 4 ? w[0] + '…' + w[w.length - 1] : trim(t); };

  /* One entry, printed. -> string */
  App_.format = function (ed, e, opts) {
    const s = Object.assign({}, App_.settings(ed), opts);
    const ab = App_.abbr(ed);
    const extant = ed.witnesses.map((w) => w.siglum).filter((x) => !e.missing.some((m) => m.wit === x));
    const present = extant.filter((x) => e.lemWits.includes(x) || e.readings.some((r) => r.wits.includes(x)));
    const sig = (w) => App_.sigla(ed, w, present, s).text;
    const bits = [];
    const d = e.decision;
    const hy = (t) => (t ? (e.inside && e.inside.left ? '-' : '') + t + (e.inside && e.inside.right ? '-' : '') : t);
    let lem = hy(shorten(e.lemma));
    if (d && d.crux) lem = ab.crux + lem + ab.crux;
    const lemWho = d && (d.type === 'emendatio' || d.type === 'conjecture') ? (d.type === 'conjecture' ? ab.conj : ab.em) + (d.source ? ' ' + d.source : '') : sig(e.lemWits);
    // negative leaves out who reads the lemma, unless few do
    const negative = s.polarity === 'negative' || (s.polarity === 'auto' && e.lemWits.length * 2 > present.length && !(d && (d.type === 'emendatio' || d.type === 'conjecture')));
    if (e.kind === 'testimonium') return lem + ' ]' + (e.testimonia || []).map((t) => ' ' + ME.Layers.formatEvidence(t)).join(';');
    if (e.kind === 'orthographic') {
      // spelling only: the forms, each with its witnesses
      return lem + ' ] ' + e.orth.map((o) => hy(o.text) + ' ' + sig(o.wits)).join('; ');
    }
    if (e.kind === 'addition') {
      for (const r of e.readings) bits.push(ab.post + ' ' + (shorten(e.prev).split(' ').pop() || '…') + ' ' + ab.add + ' ' + (r.star ? r.star : r.text) + ' ' + sig(r.wits));
    } else {
      const shown = negative && lemWho === sig(e.lemWits) ? '' : lemWho;
      const rdgs = e.readings.map((r) => (r.text ? hy(r.text) : ab.om) + ' ' + sig(r.wits));
      bits.push((lem || '—') + ' ]' + (shown ? ' ' + shown + (rdgs.length ? ';' : '') : '') + (rdgs.length ? ' ' + rdgs.join('; ') : ''));
    }
    for (const a of e.ac) bits.push((a.text ? hy(a.text) : ab.om) + ' ' + a.wit + '<sup>' + ab.ac + '</sup>');
    if (s.orthographica) for (const o of e.orth) bits.push('(' + o.text + ' ' + sig(o.wits) + ')');
    const lost = e.missing.filter((m) => m.why !== 'transp');
    if (lost.length) {
      const by = {};
      for (const m of lost) (by[m.why] = by[m.why] || []).push(m.wit);
      for (const [why, w] of Object.entries(by)) bits.push((ab[why] || why) + ' ' + w.map((x) => { const m = lost.find((y) => y.wit === x); return x + (m && m.text ? ' (' + hy(m.text.replace(/‡/g, '[…]')) + ')' : ''); }).join(' '));
    }
    // an entry that is only a lacuna reads "lemma ] lac. X", not "lemma ]; lac. X"
    if (bits.length > 1 && /\]$/.test(bits[0])) { const first = bits.shift(); bits[0] = first + ' ' + bits[0]; }
    if (e.missing.some((m) => m.why === 'transp')) bits.push(ab.transp + ' ' + e.missing.filter((m) => m.why === 'transp').map((m) => m.wit).join(' '));
    return bits.join('; ');
  };

  /* The apparatus of a work, as tiers: variants, and optionally singular readings and orthographica. */
  App_.tiers = function (ed, entries) {
    const s = App_.settings(ed);
    const variants = [], singular = [], orthographica = [];
    for (const e of entries) {
      if (e.kind === 'orthographic') { if (s.orthographica) orthographica.push(e); continue; }
      if (e.kind === 'testimonium') continue;
      const single = s.singular && e.readings.length && e.readings.every((r) => r.wits.length === 1) && !e.decision;
      (single ? singular : variants).push(e);
    }
    const testimonia = entries.filter((e) => e.testimonia && e.testimonia.length);
    return { variants, singular, orthographica, testimonia };
  };

  /* The series in which an entry is printed, as in the print editions: A variants, B testimonia, C singular readings,
     D spelling (if listed), E the editor's reasons. */
  App_.series = function (ed, b, e, tiers) {
    const s = tiers || App_.tiers(ed, b.entries);
    const out = [];
    if (e.kind === 'orthographic') { if (s.orthographica.includes(e)) out.push('D'); } else if (e.kind !== 'testimonium') out.push(s.singular.includes(e) ? 'C' : 'A');
    if (e.testimonia && e.testimonia.length) out.push('B');
    if (e.decision && (e.decision.reasons || e.decision.note || e.decision.source)) out.push('E');
    return out;
  };

  /* The note markers of a block: each printed entry, in the order of the text, numbered from 1 in each block.
     -> Map(entry index -> number) */
  App_.markers = function (ed, b) {
    const tiers = App_.tiers(ed, b.entries);
    const out = new Map();
    let n = 0;
    b.entries.forEach((e, i) => { if (App_.series(ed, b, e, tiers).length) out.set(i, ++n); });
    return out;
  };

  /* Where each entry is in the block's edited text: the offset just after its lemma, or, for an omission or
     addition, the place between words. -> {text, anchors: [{i, at, empty}], crux: [[from, to]], unsure: [[from, to]]} */
  App_.anchors = function (b) {
    const byFrom = new Map(b.entries.map((e, i) => [e.fromId, i]));
    let text = '';
    const anchors = [], crux = [], unsure = [];
    for (const u of b.proposal.units) {
      const i = byFrom.get(u.fromId);
      const e = i === undefined ? null : b.entries[i];
      const d = e && e.decision;
      let t = u.text;
      if (d && d.crux) t = t.replace(/^(\s*)(.*?)(\s*)$/, '$1†$2†$3');
      const lead = (t.match(/^\s*/) || [''])[0].length;
      const core = t.trim().length;
      if (e) anchors.push({ i, at: text.length + lead + core, start: text.length + lead, empty: !core });
      if (d && d.confidence === 'low' && core) unsure.push([text.length + lead, text.length + lead + core]);
      text += t;
    }
    return { text, anchors, crux, unsure };
  };

  /* ---------- checks ---------- */

  /* What is wrong, block by block: [{level: 'error'|'warn', unit, ref, text}]. */
  App_.validate = function (ed, table, built) {
    const out = [];
    const b = built || App_.entries(ed, table);
    const sigla = new Set(ed.witnesses.map((w) => w.siglum));
    const groups = groupsOf(ed);
    const states = new Set(Object.values(table.states).map((st) => st.siglum));
    const say = (level, e, text) => out.push({ level, unit: table.unit, ref: e ? e.ref : table.unit, text });
    for (const e of b.entries) {
      const all = [...e.lemWits, ...e.readings.flatMap((r) => r.wits), ...e.missing.map((m) => m.wit)];
      // every extant state exactly once
      const seen = new Map();
      for (const w of all) seen.set(w, (seen.get(w) || 0) + 1);
      for (const [w, n] of seen) if (n > 1) say('error', e, w + ' is cited ' + n + ' times');
      for (const w of states) if (!seen.has(w)) say('error', e, w + ' is in the table but not in the entry');
      for (const w of all) if (!sigla.has(w)) say('error', e, 'Undefined siglum ' + w);
      // a group siglum must expand to exactly its extant members
      const extant = [...states].filter((w) => !e.missing.some((m) => m.wit === w));
      for (const set of [e.lemWits, ...e.readings.map((r) => r.wits)]) {
        const printed = App_.sigla(ed, set, extant, App_.settings(ed));
        const expanded = new Set();
        for (const tok of printed.text.replace(/\([^)]*\)/g, '').split(/\s+/).filter(Boolean)) {
          if (groups.has(tok)) groups.get(tok).filter((m) => extant.includes(m)).forEach((m) => expanded.add(m)); else expanded.add(tok);
        }
        if (expanded.size !== set.length || set.some((w) => !expanded.has(w))) say('error', e, 'The group sigla do not expand to the witnesses: ' + printed.text);
      }
      // the lemma is the edited text
      if (!e.lemWits.length && !(e.decision && /emendatio|conjecture|lacuna/.test(e.decision.type)) && e.lemma) say('error', e, 'The lemma “' + e.lemma + '” has no witness, and is not marked as an emendation or conjecture');
      for (const r of e.readings) if (!r.wits.length) say('error', e, 'A reading has no witness');
      // a witness lost here cannot also be cited for a reading
      for (const m of e.missing) if (e.lemWits.includes(m.wit) || e.readings.some((r) => r.wits.includes(m.wit))) say('error', e, m.wit + ' is cited, but its text is lost here');
      if (e.review) say('error', e, 'A decision needs review: ' + e.review.why);
      if (e.kind === 'orthographic' || e.kind === 'testimonium') continue;
      if (e.decided === 'trust' && !e.decision) say('warn', e, 'A tie, settled only by your trust order');
      if (e.decided === 'plurality' && !e.decision) say('warn', e, 'Most votes, but not most witnesses');
      if (e.decision && e.decision.confidence === 'low') say('warn', e, 'Marked as uncertain');
    }
    for (const rv of table.review || []) say('error', null, 'To review: ' + rv.why);
    for (const k of b.proposal.orphaned) say('error', null, 'A choice no longer fits a word (columns ' + k + ')');
    if (ME.Layers) {
      const live = new Set(b.proposal.units.map((u) => u.key));
      for (const ev of ME.Layers.evidence(ed)) if (ev.work === table.work && ev.unit === table.unit && !live.has(ev.key)) say('error', null, 'Evidence from ' + ev.source.label + ' no longer fits a word (' + (ev.ref || ev.key) + '): place it again');
    }
    return out;
  };

  /* ---------- witnesses agreeing ---------- */

  /* Places where every witness of `with` reads alike and every witness of `against` reads otherwise.
     A witness whose text is lost there makes the place not count. -> [{unit, ref, entry, reading}] */
  App_.agreements = function (ed, built, withW, against) {
    const out = [];
    for (const { entries } of built) {
      for (const e of entries) {
        if (e.missing.some((m) => withW.includes(m.wit) || against.includes(m.wit))) continue;
        const sets = [{ text: e.lemma, wits: e.lemWits }, ...e.readings];
        const hit = sets.find((r) => withW.every((w) => r.wits.includes(w)));
        if (!hit || against.some((w) => hit.wits.includes(w))) continue;
        if (!against.every((w) => sets.some((r) => r !== hit && r.wits.includes(w)))) continue;
        out.push({ unit: e.unit, ref: e.ref, entry: e, reading: hit.text });
      }
    }
    return out;
  };

  /* ---------- TEI ---------- */

  const x = (s) => U.escXml(String(s));
  const a = (s) => U.escAttr(String(s));

  // The edited text of a work, with an apparatus in parallel segmentation, as TEI P5.
  App_.tei = function (ed, built, work) {
    const ab = App_.abbr(ed);
    const groups = groupsOf(ed);
    const listWit = [];
    const inGroup = new Set([...groups.values()].flat());
    for (const [name, members] of groups) {
      listWit.push('<listWit xml:id="' + a(idOf(name)) + '"><head>' + x(name) + '</head>' + members.map((m) => witness(ed, m)).join('') + '</listWit>');
    }
    for (const w of ed.witnesses) if (!inGroup.has(w.siglum)) listWit.push(witness(ed, w.siglum));
    const wit = (list) => list.map((w) => '#' + idOf(w)).join(' ');
    /* A layered edition: each block names its layer (@ana, a category of the taxonomy of layers in the header), and
       a commentary block points to what it comments on (@corresp), worked out from its ID, as the links in
       <standOff> do too. */
    const LI = ME.LayerIds;
    const layered = !!(LI && LI.layered(ed));
    const codeOfBlock = (b) => (b.layer ? b.layer.code : layered ? LI.codeOf(b.table.work) : null);
    const here = new Map();
    for (const b of built) { const c = codeOfBlock(b); if (c) { if (!here.has(c)) here.set(c, []); here.get(c).push(b.table.unit); } }
    const parentsOf = (b) => {
      const code = codeOfBlock(b);
      if (!code || code === LI.BASE) return [];
      const among = here.get(LI.parentCode(code));
      if (among) { const l = LI.links(ed, LI.workId(code), [b.table.unit], among)[0]; return l ? l.base : []; }
      // the parent layer is in another file: the blocks the ID names
      const par = LI.parentOf(LI.parse(b.table.unit));
      return par && par.ids ? par.ids : [];
    };
    const links = [];
    const blocks = built.map((b) => {
      const { table, entries, proposal } = b;
      let body = '';
      const byKey = new Map(entries.map((e) => [e.fromId + ':' + e.toId, e]));
      for (const u of proposal.units) {
        const e = byKey.get(u.fromId + ':' + u.toId);
        const tail = (u.text.match(/\s+$/) || [''])[0];
        if (!e) { body += x(u.text); continue; }
        const d = e.decision;
        let lemAttrs = e.lemWits.length ? ' wit="' + wit(e.lemWits) + '"' : '';
        if (d && (d.type === 'emendatio' || d.type === 'conjecture')) lemAttrs = ' type="' + (d.type === 'conjecture' ? 'conjecture' : 'emendation') + '" resp="#editor"' + (d.source ? ' source="' + a(d.source) + '"' : '');
        if (d && d.confidence === 'low') lemAttrs += ' cert="low"';
        else if (d && d.confidence === 'medium') lemAttrs += ' cert="medium"';
        let lemText = x(e.lemma);
        if (d && d.crux) lemText = '<seg type="crux">' + lemText + '</seg>';
        if (d && d.type === 'lacuna') lemText = '<gap reason="lost"/>';
        let app = '<app' + (e.kind !== 'variant' ? ' type="' + (e.kind === 'testimonium' ? 'testimony' : e.kind) + '"' : '') + '><lem' + lemAttrs + '>' + lemText + '</lem>';
        for (const r of e.readings) app += '<rdg wit="' + wit(r.wits) + '">' + x(r.text) + '</rdg>';
        for (const c of e.ac) app += '<rdg wit="#' + a(idOf(c.wit)) + '" type="ac" varSeq="1">' + x(c.text) + '</rdg>';
        for (const o of e.orth) app += '<rdg wit="' + wit(o.wits) + '" type="orthographic">' + x(o.text) + '</rdg>';
        const lost = e.missing.filter((m) => m.why !== 'transp');
        // what survives of a partly lost reading is kept, with the loss marked
        for (const m of lost) if (m.text) app += '<rdg wit="#' + a(idOf(m.wit)) + '" type="lacunose">' + x(m.text).replace(/‡/g, '<gap reason="lost"/>') + '</rdg>';
        if (lost.length) app += '<witDetail wit="' + wit(lost.map((m) => m.wit)) + '" type="' + (lost[0].why === 'illeg' ? 'illegible' : 'lacuna') + '"/>';
        for (const t of e.testimonia || []) app += '<note type="testimonium" subtype="' + a(t.type) + '">' + x(ME.Layers.formatEvidence(t)) + '</note>';
        if (d && (d.reasons || d.note)) app += '<note type="reason">' + x([...(d.reasons || []), d.note].filter(Boolean).join('; ')) + '</note>';
        app += '</app>';
        body += app + tail;
      }
      const code = codeOfBlock(b);
      const ps = parentsOf(b);
      if (ps.length) links.push('<link type="comments" target="#' + a(idOf(table.unit)) + ' ' + ps.map((q) => '#' + a(idOf(q))).join(' ') + '"/>');
      const lay = code ? ' ana="#layer-' + a(code) + '"' + (ps.length ? ' corresp="' + ps.map((q) => '#' + a(idOf(q))).join(' ') + '"' : '') : '';
      return '<ab xml:id="' + a(idOf(table.unit)) + '" n="' + a(table.unit) + '"' + lay + '>' + body.trim() + '</ab>';
    });
    // the layers, nested as they comment on one another, each with its abbreviation
    const taxonomy = (() => {
      if (!layered || !here.size) return '';
      const all = LI.legend(ed);
      const cat = (l) => '<category xml:id="layer-' + a(l.code) + '" n="' + a(l.code) + '"><catDesc>' + (l.abbr ? '<abbr>' + x(l.abbr) + '</abbr> ' : '') + '<title>' + x(l.name) + '</title></catDesc>'
        + all.filter((k) => k.code !== LI.BASE && LI.parentCode(k.code) === l.code).map(cat).join('') + '</category>';
      return '<classDecl><taxonomy xml:id="layers"><desc>The base text and the commentaries on it. A commentary nests under the text it comments on; its abbreviation is printed in [ ] before its blocks.</desc>'
        + all.filter((k) => k.code === LI.BASE).map(cat).join('') + all.filter((k) => k.code !== LI.BASE && LI.parentCode(k.code) === LI.BASE && !LI.layer(ed, LI.BASE)).map(cat).join('') + '</taxonomy></classDecl>';
    })();
    const layerTitles = layered && here.size ? LI.legend(ed).filter((l) => here.has(l.code)).map((l) => '<title type="sub" subtype="' + (l.code === LI.BASE ? 'base-text' : 'commentary') + '" n="' + a(l.code) + '">' + x(l.name) + '</title>').join('') : '';
    const linking = layered && here.size ? '<projectDesc><p>Each block names its layer with @ana, a category of the taxonomy of layers. On a block of a commentary, @corresp points to the blocks it comments on, as worked out from the citation IDs: b is the base, each commentary has a letter of its own, and a commentary on a commentary adds one; the last -n is the block\'s own paragraph, and any before it the paragraph of its parent. The same links are in the linkGrp of standOff.</p></projectDesc>' : '';
    const standOff = links.length ? '<standOff><linkGrp type="commentary">' + links.join('') + '</linkGrp></standOff>\n' : '';
    const norm = ME.Norm.describe(ed.norm);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0">\n<teiHeader>\n<fileDesc>\n<titleStmt><title>' + x(ed.title || 'Edition') + (work && !(ME.CollateView && work.id === ME.CollateView.ALL) ? ': ' + x(work.title) : '') + '</title>' + layerTitles +
      '<respStmt xml:id="editor"><resp>edited by</resp><name>The editor</name></respStmt></titleStmt>\n' +
      '<publicationStmt><p>' + x(ME.Publish ? ME.Publish.citation(ed) : 'Made with Manuscribe.') + '</p><date when="' + new Date().toISOString().slice(0, 10) + '"/></publicationStmt>\n' +
      '<sourceDesc><listWit>' + listWit.join('') + '</listWit></sourceDesc>\n</fileDesc>\n' +
      '<encodingDesc>' + linking + '<variantEncoding method="parallel-segmentation" location="internal"/>' +
      '<editorialDecl><normalization><p>Readings were compared after normalisation by the ' + x(norm.name) + ' profile (' + x(norm.profile) + ' version ' + x(norm.version) + '), whose rules are: ' + x(norm.rules.map((r) => r.name).join('; ')) + '.</p></normalization>' +
      '<correction><p>Where the witnesses differ, the reading of most witnesses is proposed, and a tie goes to the more trusted witness, in this order: ' + x(Collate.trustOrder(ed).join(', ')) + '. The editor\'s decisions take precedence.</p></correction></editorialDecl>' + taxonomy + '</encodingDesc>\n' +
      '</teiHeader>\n' + standOff + '<text><body>\n<div type="edition">\n' + blocks.join('\n') + '\n</div>\n</body></text>\n</TEI>\n';
  };

  function idOf(s) { return 'w-' + String(s).replace(/[^A-Za-z0-9._-]/g, '_'); }
  function witness(ed, siglum) {
    const w = ed.witnesses.find((v) => v.siglum === siglum);
    return '<witness xml:id="' + a(idOf(siglum)) + '" n="' + a(siglum) + '">' + x(siglum) + (w && w.title ? ' ' + x(w.title) : '') + '</witness>';
  }
  App_.idOf = idOf;

  /* Every witness's text, read back out of the TEI: the lemma where it is cited for it, else its reading.
     -> {siglum: text}. Used to check that the TEI keeps what the witnesses read. */
  App_.readBack = function (xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not well-formed');
    const ids = Array.from(doc.getElementsByTagName('witness')).map((w) => w.getAttribute('xml:id'));
    const out = {};
    for (const id of ids) {
      let text = '';
      const walk = (n) => {
        for (const c of Array.from(n.childNodes)) {
          if (c.nodeType === 3) { text += c.nodeValue; continue; }
          if (c.nodeType !== 1) continue;
          if (c.localName === 'app') {
            const has = (r) => (r.getAttribute('wit') || '').split(/\s+/).includes('#' + id);
            const kids = Array.from(c.children);
            // the witness's own spelling first, then its reading, then the lemma
            const pick = kids.find((r) => r.localName === 'rdg' && has(r) && (r.getAttribute('type') === 'orthographic' || r.getAttribute('type') === 'lacunose')) || kids.find((r) => r.localName === 'rdg' && !r.getAttribute('type') && has(r));
            const lem = kids.find((r) => r.localName === 'lem');
            const lost = kids.some((r) => r.localName === 'witDetail' && has(r));
            if (pick) text += pick.textContent;
            else if (lost) text += '‡';
            else if (lem && (lem.getAttribute('wit') || '').split(/\s+/).includes('#' + id)) text += lem.textContent;
            continue;
          }
          walk(c);
        }
      };
      for (const abEl of Array.from(doc.getElementsByTagName('ab'))) walk(abEl);
      out[doc.querySelector('[*|id="' + id + '"]') ? Array.from(doc.getElementsByTagName('witness')).find((w) => w.getAttribute('xml:id') === id).getAttribute('n') : id] = text;
    }
    return out;
  };

  /* The apparatus as plain text, block by block, and the starred passages after it. */
  App_.text = function (ed, built) {
    const out = [ME.Publish ? ME.Publish.citation(ed) + '\n' : ''];
    const stars = [];
    for (const b of built) {
      out.push(b.table.unit + '\n' + b.text.trim() + '\n');
      const { variants, singular } = App_.tiers(ed, b.entries);
      if (variants.length) out.push(variants.map((e) => e.ref + ' ' + App_.format(ed, e).replace(/<\/?sup>/g, '')).join('  •  ') + '\n');
      if (singular.length) out.push('Singular readings: ' + singular.map((e) => e.ref + ' ' + App_.format(ed, e).replace(/<\/?sup>/g, '')).join('  •  ') + '\n');
      const { orthographica: orth, testimonia } = App_.tiers(ed, b.entries);
      if (testimonia.length) out.push('Testimonia: ' + testimonia.map((e) => e.ref + ' ' + e.lemma + ' ] ' + e.testimonia.map(ME.Layers.formatEvidence).join('; ')).join('  •  ') + '\n');
      if (orth.length) out.push('Orthographica: ' + orth.map((e) => e.ref + ' ' + e.lemma + ' ] ' + e.orth.map((o) => o.text + ' ' + o.wits.join(' ')).join('; ')).join('  •  ') + '\n');
      stars.push(...b.stars);
    }
    if (stars.length) out.push('Additional passages\n' + stars.map((s) => s.id + ' (after ' + (s.after.split(' ').pop() || '…') + ', ' + s.wits.join(' ') + '): ' + s.text).join('\n') + '\n');
    return out.join('\n');
  };

  ME.Apparatus = App_;
})(window.ME);
