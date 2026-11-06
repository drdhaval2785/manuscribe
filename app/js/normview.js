'use strict';
/* The Normalisation part of the edition screen, and the preview that shows what the rules do to a
   block of the real text, witness by witness. Nothing here touches a transcription. */
(function (ME) {
  const { U, UI, Norm, Tokens, Edition } = ME;
  const NormView = { opened: new Set() }; // which folded parts are open survives a redraw

  const CLASSES = { script: 'Script', punctuation: 'Punctuation', spacing: 'Spaces', gemination: 'Gemination', nasal: 'Nasals', avagraha: 'Avagraha', sandhi: 'Sandhi', orthographic: 'Other spelling' };
  const MAX_DIP = 20000, MAX_TOKENS = 4000;

  const normOf = (ed, list) => {
    if (!ed.norm) {
      const first = list.find((x) => x.p);
      ed.norm = { profile: Norm.suggestProfile(first && first.p.meta.language) };
    }
    return ed.norm;
  };

  function ruleTable(ed, redraw) {
    const s = Norm.settings(ed.norm);
    const inProfile = new Set(s.profile.align);
    const rows = Norm.RULES.filter((r) => !r.always && r.cls !== 'declared').map((r) => {
      const cb = U.el('input', { type: 'checkbox', checked: s.on.has(r.id), 'aria-label': r.name, onchange: async () => {
        ed.norm.rules = ed.norm.rules || {};
        if (cb.checked === inProfile.has(r.id)) delete ed.norm.rules[r.id]; else ed.norm.rules[r.id] = cb.checked;
        await Edition.save(ed);
        redraw();
      } });
      return U.el('tr', { class: s.on.has(r.id) ? '' : 'nv-off' },
        U.el('td', null, cb), U.el('td', null, r.name), U.el('td', null, CLASSES[r.cls] || r.cls), U.el('td', { class: 'nv-src' }, r.source));
    });
    return U.el('div', { class: 'ed-scroll nv-rules' }, U.el('table', { class: 'ed-table' },
      U.el('thead', null, U.el('tr', null, ['Ignore', 'Difference', 'Kind', 'Source'].map((h) => U.el('th', null, h)))),
      U.el('tbody', null, rows)));
  }

  function hideBoxes(ed, redraw) {
    const s = Norm.settings(ed.norm);
    const base = new Set(s.profile.hide);
    return U.el('div', { class: 'nv-checks' }, Object.entries(CLASSES).map(([cls, label]) => {
      const cb = U.el('input', { type: 'checkbox', checked: s.hide.has(cls), onchange: async () => {
        ed.norm.hide = ed.norm.hide || {};
        if (cb.checked === base.has(cls)) delete ed.norm.hide[cls]; else ed.norm.hide[cls] = cb.checked;
        await Edition.save(ed);
        redraw();
      } });
      return U.el('label', null, cb, ' ', label);
    }));
  }

  function tagBoxes(ed, redraw) {
    const s = Norm.settings(ed.norm);
    return U.el('div', { class: 'nv-checks' }, Norm.IGNORE_TAGS.map((name) => {
      const cb = U.el('input', { type: 'checkbox', checked: s.ignoreTags.includes(name), onchange: async () => {
        const now = new Set(Norm.settings(ed.norm).ignoreTags);
        if (cb.checked) now.add(name); else now.delete(name);
        ed.norm.ignoreTags = Norm.IGNORE_TAGS.filter((t) => now.has(t));
        await Edition.save(ed);
        redraw();
      } });
      return U.el('label', null, cb, ' ', U.el('code', null, '<' + name + '>'));
    }));
  }

  function declarationTable(ed, list, redraw) {
    if (!list.length) return U.el('p', { class: 'help' }, 'Appears when the edition has witnesses.');
    return U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table' },
      U.el('thead', null, U.el('tr', null, U.el('th', null, 'Siglum'), Norm.DECLARATIONS.map((d) => U.el('th', null, d.label)))),
      U.el('tbody', null, list.map(({ w }) => U.el('tr', null, U.el('td', { class: 'ed-sig' }, w.siglum), Norm.DECLARATIONS.map((d) => {
        const cb = U.el('input', { type: 'checkbox', checked: (w.declare || []).includes(d.id), 'aria-label': w.siglum + ' ' + d.label, onchange: async () => {
          const now = new Set(w.declare || []);
          if (cb.checked) now.add(d.id); else now.delete(d.id);
          if (now.size) w.declare = Norm.DECLARATIONS.map((x) => x.id).filter((x) => now.has(x)); else delete w.declare;
          await Edition.save(ed);
          redraw();
        } });
        return U.el('td', null, cb);
      }))))));
  }

  NormView.section = function (ed, list, redraw) {
    const norm = normOf(ed, list);
    const s = Norm.settings(norm);
    const pick = U.el('select', { 'aria-label': 'Normalisation profile', onchange: async () => {
      ed.norm = { profile: pick.value };
      await Edition.save(ed);
      redraw();
    } }, Norm.PROFILES.filter((p) => p.id === s.profile.id || p.id === 'any' || ME.Features.on('saProfiles')).map((p) => U.el('option', { value: p.id, selected: p.id === s.profile.id }, p.name + (p.provisional ? ' (provisional)' : ''))));
    const full = ME.Features.on('normRules');
    const changed = Object.keys(norm.rules || {}).length + Object.keys(norm.hide || {}).length + (norm.ignoreTags ? 1 : 0);
    const fold = (key, title, ...body) => {
      const d = U.el('details', { class: 'nv-fold', open: NormView.opened.has(key) }, U.el('summary', null, title), ...body);
      d.addEventListener('toggle', () => { if (d.open) NormView.opened.add(key); else NormView.opened.delete(key); });
      return d;
    };
    return U.el('div', null,
      U.el('p', { class: 'help' }, 'These rules decide what counts as the same reading when witnesses are compared. They work on a copy: your transcriptions never change.'),
      U.el('div', { class: 'nv-head' },
        U.el('label', null, 'Profile ', pick),
        s.profile.provisional ? U.el('span', { class: 'ed-tag warn' }, 'provisional') : null,
        changed ? U.el('span', { class: 'ed-tag ok' }, 'adjusted') : null,
        full ? U.el('button', { class: 'btn small primary', disabled: !list.some((x) => x.p), onclick: () => NormView.preview(ed, list) }, 'Preview on your text…') : null),
      U.el('p', { class: 'help' }, s.profile.note),
      full ? fold('rules', 'Rules used when lining witnesses up (' + s.on.size + ' on)', ruleTable(ed, redraw)) : null,
      !full ? null : fold('witness', 'What each witness is known to do', U.el('p', { class: 'help' }, 'Applied to that witness alone. A witness that writes b for v should not make every other witness’s b count as v.'), declarationTable(ed, list, redraw)),
      !full ? null : fold('tags', 'Marked text that is not compared', U.el('p', { class: 'help' }, 'Text in these tags stays in the transcription, but collation passes over it.'), tagBoxes(ed, redraw)),
      !full ? null : fold('hide', 'Differences an apparatus leaves out', U.el('p', { class: 'help' }, 'Used once the apparatus can be generated. Hidden differences are kept, and can be shown again.'), hideBoxes(ed, redraw)));
  };

  /* ---------- the preview ---------- */

  const isSign = (c) => /\p{M}/u.test(c);
  const VIRAMA = '्';

  // A change marked in Devanagari should not split an akṣara on screen.
  function snap(dip, from, to) {
    let a = from, z = to;
    while (a > 0 && (isSign(dip[a]) || dip[a - 1] === VIRAMA)) a--;
    while (z < dip.length && (isSign(dip[z]) || dip[z - 1] === VIRAMA)) z++;
    return [a, z];
  }

  function diplomatic(st) {
    const dip = st.dip.slice(0, MAX_DIP);
    const marks = [];
    for (const h of st.hits) {
      if (h.from >= dip.length) break;
      const rule = Norm.rule(h.rule);
      const [a, z] = snap(dip, h.from, Math.min(h.to, dip.length));
      marks.push({ a, z, cls: rule.cls === 'punctuation' || rule.cls === 'spacing' ? 'nv-quiet' : 'nv-hit', title: rule.name + ': ' + h.before.trim() + ' → ' + (h.after.trim() || '(nothing)') });
    }
    for (const r of st.runs) {
      if (r.from >= dip.length) break;
      if (r.ignored) marks.push({ a: r.from, z: r.to, cls: 'nv-ig', title: 'Not compared: <' + r.ignored + '>' });
      else if (r.flags && r.flags.includes('add')) marks.push({ a: r.from, z: r.to, cls: 'nv-add', title: 'Addition' });
      else if (r.flags && r.flags.includes('del')) marks.push({ a: r.from, z: r.to, cls: 'nv-del', title: 'Deletion' });
    }
    const cuts = Array.from(new Set([0, dip.length, ...marks.flatMap((m) => [m.a, m.z])])).filter((x) => x <= dip.length).sort((a, b) => a - b);
    marks.sort((a, b) => a.a - b.a);
    const out = [];
    let m0 = 0;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k], z = cuts[k + 1];
      while (m0 < marks.length && marks[m0].z <= a) m0++;
      const here = [];
      for (let j = m0; j < marks.length && marks[j].a < z; j++) if (marks[j].z > a) here.push(marks[j]);
      const text = dip.slice(a, z);
      if (!here.length) out.push(text);
      else out.push(U.el('span', { class: Array.from(new Set(here.map((x) => x.cls))).join(' '), title: Array.from(new Set(here.map((x) => x.title))).join('\n') }, text));
    }
    return U.el('div', { class: 'nv-dip' }, out, st.dip.length > MAX_DIP ? U.el('span', { class: 'help' }, ' … (first ' + MAX_DIP + ' characters)') : null);
  }

  const placeOf = (t) => {
    const s = t.src.find((x) => x.folio);
    return s ? s.folio + ' ' + s.box + ' line ' + (s.line + 1) : '';
  };

  function compared(st) {
    const shown = st.tokens.slice(0, MAX_TOKENS);
    return U.el('div', { class: 'nv-toks' }, shown.map((t) => {
      const cls = 'nv-tok' + (t.gap ? ' gap' : t.rules.some((r) => !['spaces', 'punct', 'verse-number', 'spaces-collapse'].includes(r)) ? ' hit' : '') + (t.flags.some((f) => f === 'unclear') ? ' unclear' : '');
      const why = t.rules.map((r) => Norm.rule(r).name);
      const title = (t.gap ? 'Text lost here (' + (t.gap.reason || 'gap') + ', ' + t.gap.quantity + ' ' + (t.gap.unit || '') + ')' : t.t.trim() + ' → ' + (t.n || '(nothing)')) + '\n' + placeOf(t) + (why.length ? '\n' + why.join('\n') : '');
      return U.el('span', { class: cls, title }, t.n || '∅');
    }), st.tokens.length > MAX_TOKENS ? U.el('span', { class: 'help' }, ' … (first ' + MAX_TOKENS + ' of ' + st.tokens.length + ')') : null);
  }

  function levenshtein(a, b) {
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const c = [i];
      for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = c;
    }
    return p[b.length];
  }

  function distances(unit) {
    const states = unit.states.filter((s) => s.layer !== 'ac');
    if (states.length < 2 || states.length > 8 || states.some((s) => s.text.length > 8000)) return null;
    const raw = states.map((s) => Norm.fromDiplomatic(s.dip).text.replace(/\s+/g, ''));
    const rows = [];
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const before = levenshtein(raw[i], raw[j]), after = levenshtein(states[i].text.replace(/\s+/g, ''), states[j].text.replace(/\s+/g, ''));
        rows.push(U.el('tr', null, U.el('td', null, states[i].label + ' and ' + states[j].label), U.el('td', { class: 'num' }, String(before)), U.el('td', { class: 'num' }, String(after))));
      }
    }
    return U.el('div', null, U.el('h3', null, 'How far apart the witnesses are'),
      U.el('p', { class: 'help' }, 'Letters that would have to change to turn one into the other, in the corrected text. What is left after the rules is closer to the real variants.'),
      U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table nv-narrow' },
        U.el('thead', null, U.el('tr', null, ['Witnesses', 'As written', 'After the rules'].map((h) => U.el('th', null, h)))), U.el('tbody', null, rows))));
  }

  function firings(unit) {
    const states = unit.states;
    const byRule = new Map();
    for (const st of states) {
      for (const h of st.hits) {
        if (!byRule.has(h.rule)) byRule.set(h.rule, { counts: new Map(), examples: new Set() });
        const e = byRule.get(h.rule);
        e.counts.set(st.label, (e.counts.get(st.label) || 0) + 1);
        if (e.examples.size < 4 && !['spaces', 'spaces-collapse'].includes(h.rule)) e.examples.add((h.before.trim() || '␣') + ' → ' + (h.after.trim() || '∅'));
      }
    }
    const rows = Norm.RULES.filter((r) => byRule.has(r.id) && r.id !== 'spaces-collapse').map((r) => {
      const e = byRule.get(r.id);
      return U.el('tr', null, U.el('td', null, r.name), states.map((st) => U.el('td', { class: 'num' }, String(e.counts.get(st.label) || 0))), U.el('td', { class: 'nv-ex' }, Array.from(e.examples).join(' · ')));
    });
    return U.el('div', null, U.el('h3', null, 'What the rules did in this block'),
      U.el('div', { class: 'ed-scroll' }, U.el('table', { class: 'ed-table' },
        U.el('thead', null, U.el('tr', null, U.el('th', null, 'Rule'), states.map((s) => U.el('th', null, s.label)), U.el('th', null, 'Examples'))),
        U.el('tbody', null, rows.length ? rows : U.el('tr', null, U.el('td', { class: 'ed-empty', colspan: states.length + 2 }, 'No rule applied here.'))))));
  }

  function warnings(res, unit, list) {
    const out = [];
    const add = (text) => out.push(U.el('li', null, text));
    if (res.settings.profile.provisional) add('The ' + res.settings.profile.name + ' profile is provisional: its rules have not been checked against published editions.');
    for (const x of res.outside) add(x.siglum + ' has ' + x.chars + ' characters of this work outside any citation ID. They are not compared until they are in a paragraph or verse with an ID.');
    for (const x of res.unreadable) add(x.siglum + ' has a line that could not be read (' + x.label + ' ' + x.box + ' line ' + (x.i + 1) + ').');
    if (unit) {
      if (unit.auto) add('“' + unit.id + '” is an automatic ID, which will not match other witnesses.');
      for (const s of unit.absent) add(s + ' has no “' + unit.id + '”.');
      for (const s of unit.repeatedIn) add(s + ' has “' + unit.id + '” more than once; its parts are read as one text here.');
      const seen = new Set();
      for (const st of unit.states) {
        if (seen.has(st.siglum)) continue;
        seen.add(st.siglum);
        const spaces = (st.dip.match(/\s+/g) || []).length;
        if (st.dip.length > 200 && st.dip.length / (spaces + 1) > 40) add(st.siglum + ' has few word spaces here, so rules for sandhi between words cannot act on it.');
        const x = list.find((y) => y.w.siglum === st.siglum);
        if (x && /[ऀ-ॿ]/.test(st.dip) && /Latn/.test(x.p.meta.textLang || '')) add(st.siglum + ' is typed in Devanagari, but “Script of your transcription” in its Manuscript tab says IAST, so its TEI is labelled sa-Latn. Please change that setting; the comparison here is not affected.');
      }
    }
    return out.length ? U.el('ul', { class: 'nv-warn' }, out) : null;
  }

  NormView.preview = async function (ed, list) {
    ME.App.flush();
    const works = ed.works.filter((k) => list.some(({ w, p }) => p && ME.Export.streamsUsed(p).some((s) => ((w.streams && w.streams[s]) || s) === k.id)));
    const body = U.el('div', { class: 'nv-preview' });
    const state = { work: null, unit: null, kind: 'aksara', cache: new Map() };
    // a work is worth previewing if some witness has a citation block in it
    const resultFor = (workId, kind) => {
      const key = workId + '/' + kind;
      if (!state.cache.has(key)) state.cache.set(key, Tokens.forWork(ed, list, workId, { kind }));
      return state.cache.get(key);
    };
    state.work = (works.find((k) => resultFor(k.id, state.kind).units.length) || works[0] || {}).id;

    const draw = () => {
      body.innerHTML = '';
      if (!state.work) { body.append(U.el('p', { class: 'help' }, 'No text to preview yet.')); return; }
      const res = resultFor(state.work, state.kind);
      if (!res.units.some((u) => u.id === state.unit)) state.unit = res.units.length ? res.units[0].id : null;
      const unit = res.units.find((u) => u.id === state.unit);
      const select = (label, options, value, set) => {
        const sel = U.el('select', { onchange: () => { set(sel.value); draw(); } }, options.map(([v, t]) => U.el('option', { value: v, selected: v === value }, t)));
        return U.el('label', null, label + ' ', sel);
      };
      body.append(U.el('div', { class: 'nv-head' },
        works.length > 1 ? select('Work', works.map((k) => [k.id, k.title]), state.work, (v) => { state.work = v; }) : null,
        unit ? select('Citation ID', res.units.map((u) => [u.id, u.id]), state.unit, (v) => { state.unit = v; }) : null,
        select('Compare by', Object.entries(Norm.TOKENIZERS).map(([k, t]) => [k, t.label]), state.kind, (v) => { state.kind = v; })));
      const warn = warnings(res, unit, list);
      if (warn) body.append(warn);
      if (!unit) { body.append(U.el('p', { class: 'help' }, 'This work has no citation IDs yet, so there is no block to compare. Mark paragraphs and verses in the witnesses, with the same xml:id across witnesses.')); return; }
      body.append(U.el('p', { class: 'nv-legend' },
        U.el('span', { class: 'nv-hit' }, 'changed by a rule'), ' ', U.el('span', { class: 'nv-ig' }, 'not compared'), ' ', U.el('span', { class: 'nv-add' }, 'addition'), ' ', U.el('span', { class: 'nv-del' }, 'deletion'), ' ',
        U.el('span', { class: 'nv-tok gap' }, Norm.GAP), ' text lost. Point at any part for the reason and the place in the manuscript.'));
      for (const st of unit.states) {
        body.append(U.el('div', { class: 'nv-state' },
          U.el('div', { class: 'nv-label' }, st.label, st.layer === 'ac' ? U.el('span', { class: 'help' }, ' before correction') : st.layer === 'pc' ? U.el('span', { class: 'help' }, ' after correction') : null),
          diplomatic(st), compared(st),
          st.layer !== 'ac' && st.marginal.length ? U.el('div', { class: 'nv-marg' }, 'In the margin, not compared: ', st.marginal.map((m) => U.el('span', { class: 'nv-dipinline', title: [m.label, m.box, 'line ' + (m.i + 1)].join(' ') }, m.dip + ' '))) : null));
      }
      const dist = distances(unit);
      if (dist) body.append(dist);
      body.append(firings(unit));
    };
    draw();
    await UI.modal({ title: 'Normalisation preview', body, wide: true, buttons: [{ label: 'Close', value: null, kind: 'primary' }] });
  };

  ME.NormView = NormView;
})(window.ME);
