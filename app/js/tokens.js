'use strict';
/* From a witness's stored lines to what collation compares: for each citation block, the text of
   each layer of the witness, every letter of it knowing its folio, block, line and place in the line.

   A line's text is read, never changed. What a layer takes:
     ac        the text as first written: with <del>, without <add>
     pc        the text as corrected: without <del>, with <add>
     marginal  <note>s of the manuscript, kept apart from the running text
   and what neither takes, because the editor wrote it and the witness did not: <supplied>, <corr>,
   <reg>, <expan>, <ex> and editorial notes. Tags in Norm.IGNORE_TAGS stay in the layer's text but are
   not compared. A witness with no corrections in a block has just one state there, "base". */
(function (ME) {
  const { TEI, Model, Spans, Export, Norm } = ME;
  const Tokens = {};

  const EDITORIAL = new Set(['supplied', 'corr', 'reg', 'expan', 'ex']);
  const FLAGGED = new Set(['unclear', 'sic', 'abbr', 'damage', 'retrace']);

  const builder = () => ({ dip: '', runs: [], gaps: [], lastLine: null });

  /* Reads the lines of the given streams. -> {blocks: Map(id or null -> block), account, unreadable}
     A block: {id, auto, repeated, ac, pc, marginal: [...], first: {label, box, i}}. */
  Tokens.read = function (project, keys, opts) {
    const ignore = new Set((opts && opts.ignoreTags) || Norm.IGNORE_TAGS);
    const blocks = new Map();
    const account = { total: 0, shared: 0, acOnly: 0, pcOnly: 0, marginal: 0, editorial: 0 };
    const unreadable = [];

    const blockFor = (id) => {
      if (!blocks.has(id)) blocks.set(id, { id, auto: !!id && /-auto\d+$/.test(id), repeated: false, ac: builder(), pc: builder(), marginal: [], first: null, lines: 0 });
      return blocks.get(id);
    };

    for (const key of keys) {
      let para = null, verse = null; // ids of the enclosing paragraph and verse group
      let prev = { open: false, spaced: true, rawSpaced: true };
      const started = new Set();
      for (const { label, box, i } of Spans.streamSeq(project, key)) {
        const pg = project.pages[label];
        const fragment = (pg && pg.boxes && pg.boxes[box] && pg.boxes[box][i]) || '';
        const has = TEI.hasContent(fragment);
        const meta = pg && pg.lb && pg.lb[box] && pg.lb[box][i];
        const line = { key: label + '/' + box + '/' + i, label, box, i, brk: has && (prev.open || (!!(meta && meta.brk) && !prev.rawSpaced)) };
        prev = has ? Export.lineEnd(fragment) : { open: false, spaced: true, rawSpaced: true };
        if (!has) continue;
        const root = TEI.parse(fragment);
        if (!root) { unreadable.push(line); continue; }

        let offs = 0;
        const current = () => blockFor(verse || para);
        let touched = null;
        const put = (b, text, from, flags, ignored) => {
          if (b.lastLine !== line.key) {
            if (b.dip && !line.brk && !/\s$/.test(b.dip)) { b.runs.push({ from: b.dip.length, to: b.dip.length + 1, sep: true }); b.dip += ' '; }
            b.lastLine = line.key;
          }
          b.runs.push({ from: b.dip.length, to: b.dip.length + text.length, label, box, i, offs: from, flags, ignored: ignored || null });
          b.dip += text;
        };
        const seen = (blk) => { if (touched !== blk) { touched = blk; blk.lines++; if (!blk.first) blk.first = { label, box, i }; } };

        const walk = (node, ctx) => {
          for (const c of Array.from(node.childNodes)) {
            if (c.nodeType === 3) {
              const text = c.nodeValue, from = offs;
              offs += text.length;
              account.total += text.length;
              if (ctx.into === 'editorial') { account.editorial += text.length; continue; }
              if (ctx.into) { put(ctx.into, text, from, ctx.flags, ctx.ignored); account.marginal += text.length; continue; }
              const blk = current();
              if (text.trim()) seen(blk);
              if (ctx.layer !== 'pc') put(blk.ac, text, from, ctx.flags, ctx.ignored);
              if (ctx.layer !== 'ac') put(blk.pc, text, from, ctx.flags, ctx.ignored);
              account[ctx.layer === 'ac' ? 'acOnly' : ctx.layer === 'pc' ? 'pcOnly' : 'shared'] += text.length;
              continue;
            }
            if (c.nodeType !== 1) continue;
            const name = c.nodeName;
            const a = TEI.attrsOf(c);
            if (name === 'x-marker') {
              if (ctx.into) continue;
              if (a.type === 'p-start' || a.type === 'lg-start') {
                if (a.id && started.has(a.id)) blockFor(a.id).repeated = true;
                if (a.id) started.add(a.id);
              }
              if (a.type === 'p-start') { para = a.id || null; verse = null; }
              else if (a.type === 'p-end') { para = null; verse = null; }
              else if (a.type === 'lg-start') verse = a.id || null;
              else if (a.type === 'lg-end') verse = null;
              else if (a.type === 'l') {
                // a new verse line is a word break, whatever the spacing around it
                const blk = current();
                for (const b of [blk.ac, blk.pc]) if (b.dip && !/\s$/.test(b.dip)) { b.runs.push({ from: b.dip.length, to: b.dip.length + 1, sep: true }); b.dip += ' '; }
              }
              continue;
            }
            if (name === 'gap') {
              if (ctx.into || a.reason === 'ellipsis') continue;
              const blk = current();
              const quantity = Math.max(1, parseInt(a.quantity, 10) || 1);
              seen(blk);
              for (const [b, layer] of [[blk.ac, 'pc'], [blk.pc, 'ac']]) {
                if (ctx.layer === layer) continue;
                put(b, '', offs, ctx.flags); // keeps the word break right, and has no letters of its own
                b.gaps.push({ at: b.dip.length, quantity, reason: a.reason || '', unit: a.unit || '', label, box, i, offs });
              }
              continue;
            }
            if (name === 'note') {
              if (ctx.into) { walk(c, ctx); continue; }
              if (a.resp === 'editorial' || a['xml:lang'] === 'en') { walk(c, Object.assign({}, ctx, { into: 'editorial' })); continue; }
              const m = builder();
              const blk = current();
              blk.marginal.push(Object.assign(m, { place: a.place || '', type: a.type || '', anchor: blk.pc.dip.length, label, box, i }));
              walk(c, Object.assign({}, ctx, { into: m, flags: ctx.flags, ignored: null }));
              continue;
            }
            if (EDITORIAL.has(name)) { walk(c, Object.assign({}, ctx, { into: 'editorial' })); continue; }
            if (name === 'del') {
              if (ctx.into) walk(c, Object.assign({}, ctx, { ignored: 'del', flags: ctx.flags.concat('del') }));
              else walk(c, Object.assign({}, ctx, { layer: 'ac', flags: ctx.flags.concat('del') }));
              continue;
            }
            if (name === 'add') {
              const place = TEI.placeOf('add', a);
              const fl = ['add'].concat(['top', 'bottom', 'left', 'right'].includes(place) ? 'margin' : []);
              if (ctx.into) walk(c, Object.assign({}, ctx, { flags: ctx.flags.concat(fl) }));
              else walk(c, Object.assign({}, ctx, { layer: 'pc', flags: ctx.flags.concat(fl) }));
              continue;
            }
            if (ignore.has(name)) { walk(c, Object.assign({}, ctx, { ignored: name })); continue; }
            walk(c, FLAGGED.has(name) ? Object.assign({}, ctx, { flags: ctx.flags.concat(name) }) : ctx);
          }
        };
        walk(root, { layer: 'both', into: null, flags: [], ignored: null });
      }
    }
    return { blocks, account, unreadable };
  };

  const skipsOf = (b) => {
    const skip = [];
    for (const r of b.runs) if (r.ignored && r.to > r.from) skip.push([r.from, r.to]);
    return skip;
  };

  /* One state of a block: the layer's text, normalised and cut into tokens.
     Each token: {id, t, n, src, rules, flags, gap?}. t is the diplomatic text, n the normalised form.
     src is its places in the manuscript: {folio, box, line, offs, len}, or {sep: ' '} for a space that
     stands for a line break and has no letter of its own. */
  Tokens.state = function (b, opts) {
    const o = opts || {};
    const tok = Norm.TOKENIZERS[o.kind] || Norm.TOKENIZERS.letter;
    const rules = new Set(o.rules);
    if (tok.keepSpaces) rules.delete('spaces');
    const res = Norm.apply(b.dip, { rules, declared: o.declared, skip: skipsOf(b), gaps: b.gaps });
    // tokens, runs and hits all run in text order, so one pass over each is enough, however long the block
    let run0 = 0, hit0 = 0, gap0 = 0;
    const tokens = Norm.split(res, o.kind).map((p, k) => {
      const fired = new Set();
      while (hit0 < res.hits.length && res.hits[hit0].to <= p.from) hit0++;
      for (let h = hit0; h < res.hits.length && res.hits[h].from < p.to; h++) if (res.hits[h].to > p.from) fired.add(res.hits[h].rule);
      const flags = new Set();
      const src = [];
      while (run0 < b.runs.length && b.runs[run0].to <= p.from) run0++;
      for (let j = run0; j < b.runs.length && b.runs[j].from < p.to; j++) {
        const r = b.runs[j];
        if (r.to <= p.from) continue;
        if (r.flags) r.flags.forEach((f) => flags.add(f));
        if (r.ignored) flags.add('ignored:' + r.ignored);
        const a = Math.max(p.from, r.from), z = Math.min(p.to, r.to);
        if (r.sep) src.push({ sep: b.dip.slice(a, z) });
        else src.push({ folio: r.label, box: r.box, line: r.i, offs: r.offs + (a - r.from), len: z - a });
      }
      const t = b.dip.slice(p.from, p.to);
      if (t.includes('॰')) flags.add('abbr');
      const out = { id: (o.prefix || '') + 't' + (k + 1), t, n: p.n, src, rules: Array.from(fired), flags: Array.from(flags) };
      if (p.n.includes(Norm.GAP)) {
        while (gap0 < b.gaps.length && b.gaps[gap0].at < p.from) gap0++;
        const g = b.gaps[gap0];
        if (g && g.at <= p.to) out.gap = { reason: g.reason, unit: g.unit, quantity: g.quantity, folio: g.label, box: g.box, line: g.i, offs: g.offs };
      }
      return out;
    });
    return { dip: b.dip, text: res.text, n: Norm.fromSlp(res.text), at: res.at, hits: res.hits, tokens, runs: b.runs };
  };

  /* All witnesses of a work: {units: [{id, states: [{siglum, w, layer, label, ...state}], absent: [sigla]}],
     outside: [{siglum, chars}], order}. */
  Tokens.forWork = function (ed, list, workId, opts) {
    const o = opts || {};
    const settings = Norm.settings(ed.norm);
    const rules = new Set(settings.on);
    const units = new Map();
    const order = [];
    const outside = [];
    const unreadable = [];
    const here = list.filter((x) => x.p);
    for (const { w, p } of here) {
      const keys = Export.streamsUsed(p).filter((s) => ((w.streams && w.streams[s]) || s) === workId);
      if (!keys.length) continue;
      const { blocks, unreadable: bad } = Tokens.read(p, keys, { ignoreTags: settings.ignoreTags });
      for (const u of bad) unreadable.push(Object.assign({ siglum: w.siglum }, u));
      let prev = -1;
      for (const [id, b] of blocks) {
        if (id === null) {
          if (b.pc.dip.trim() || b.ac.dip.trim()) outside.push({ siglum: w.siglum, chars: b.pc.dip.length, first: b.first });
          continue;
        }
        if (!units.has(id)) {
          units.set(id, { id, states: [], auto: b.auto, repeatedIn: [] });
          order.splice(prev + 1, 0, id);
        }
        prev = order.indexOf(id);
        const unit = units.get(id);
        if (b.repeated) unit.repeatedIn.push(w.siglum);
        const make = (src, layer) => Object.assign(
          { siglum: w.siglum, layer, label: layer === 'base' ? w.siglum : w.siglum + layer, marginal: b.marginal },
          Tokens.state(src, { kind: o.kind, rules, declared: w.declare, prefix: w.siglum + (layer === 'base' ? '' : layer) + '.' + id + '.' }));
        const same = b.ac.dip === b.pc.dip && JSON.stringify(b.ac.gaps.map((g) => g.at)) === JSON.stringify(b.pc.gaps.map((g) => g.at));
        if (same) unit.states.push(make(b.pc, 'base'));
        else unit.states.push(make(b.ac, 'ac'), make(b.pc, 'pc'));
      }
    }
    const all = new Set(here.map((x) => x.w.siglum));
    return {
      settings, outside, unreadable,
      units: order.map((id) => {
        const u = units.get(id);
        const has = new Set(u.states.map((s) => s.siglum));
        return Object.assign(u, { absent: Array.from(all).filter((s) => !has.has(s)) });
      }),
    };
  };

  ME.Tokens = Tokens;
})(window.ME);
