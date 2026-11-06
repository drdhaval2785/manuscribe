'use strict';
/* Metre: syllables, their weight, and which metre a verse is in. It only flags and never changes a text.
   The rules of the śloka, the upajāti and the metres counted by morae were written for Manuscribe from Kedārabhaṭṭa's
   Vṛttaratnākara and the appendix on prosody in Apte's Practical Sanskrit-English Dictionary; the patterns of the
   other metres come from vendor/metres.js.

   A syllable is heavy (g, guru) if its vowel is long, or is followed by anusvāra or visarga, or by two or more
   consonants, also across a word boundary; otherwise light (l, laghu). The last syllable of a pāda may be either. */
(function (ME) {
  const { Norm } = ME;
  const Metre = {};

  // one character per sound (Norm's writing): K = kh, E = ai, O = au
  const SHORT = new Set(['a', 'i', 'u', 'ṛ']);
  const LONG = new Set(['ā', 'ī', 'ū', 'ṝ', 'e', 'E', 'o', 'O']);
  const STOP = new Set('kKgGcCjJṭṬḍḌtTdDpPbBh'.split(''));
  const CONS = new Set('kKgGṅcCjJñṭṬḍḌṇtTdDnpPbBmyrlvśṣshḻẏ'.split(''));

  /* -> [{w: 'l'|'g', at: offset in the text}] from Devanagari or IAST. A daṇḍa ends a half verse: it is kept as
     {half: true} between syllables. */
  Metre.syllables = function (text) {
    const st = Norm.fromDiplomatic(text);
    const s = st.text, at = st.at;
    const out = [];
    let i = 0;
    let pending = null;
    while (i < s.length) {
      const c = s[i];
      if (c === '|') { if (pending) { out.push(pending); pending = null; } if (out.length && !out[out.length - 1].half) out.push({ half: true }); while (s[i] === '|') i++; continue; }
      const vocalicL = c === 'l' && s[i + 1] === '̥';
      if (SHORT.has(c) || LONG.has(c) || vocalicL) {
        if (pending) out.push(pending);
        let long = LONG.has(c) || (vocalicL && s[i + 2] === '̄');
        let start = i;
        // the syllable starts at its first consonant
        let j = i - 1;
        while (j >= 0 && (CONS.has(s[j]) || s[j] === ' ')) j--;
        start = j + 1;
        while (start < i && s[start] === ' ') start++;
        i += vocalicL ? (s[i + 2] === '̄' ? 3 : 2) : 1;
        while (s[i] === '̐') i++; // the candrabindu mark
        if (s[i] === 'ṃ' || s[i] === 'ḥ' || s[i] === 'ḵ') { long = true; i++; }
        // count the consonants before the next vowel, across spaces
        let k = i, cons = 0;
        const run = [];
        let space = false;
        while (k < s.length && (CONS.has(s[k]) || s[k] === ' ' || s[k] === "'" || /\p{M}/u.test(s[k]))) { if (CONS.has(s[k])) { cons++; run.push(s[k]); } else if (s[k] === ' ' && !run.length) space = true; k++; }
        // a short vowel before a word that begins with a stop and r, as pra or bhra, may be light (Vṛttaratnākara 1.10)
        const opt = !long && cons === 2 && space && STOP.has(run[0]) && run[1] === 'r';
        if (cons >= 2) long = true;
        pending = { w: long ? 'g' : 'l', at: at[start], end: at[Math.min(k, s.length)] };
        if (opt) pending.opt = true;
        continue;
      }
      i++;
    }
    if (pending) out.push(pending);
    return out;
  };

  /* ---------- the metres ---------- */

  /* The vṛttas, metres counted by syllables, come from the lists bundled in vendor/metres.js (see there for their
     sources): sama, the same pattern in all four pādas; ardhasama, one for the odd and one for the even; viṣama,
     four. The śloka, the upajāti and the metres counted by morae are checked here by their rules. */
  const GANA = { y: 'lgg', m: 'ggg', t: 'ggl', r: 'glg', j: 'lgl', bh: 'gll', n: 'lll', s: 'llg', l: 'l', g: 'g' };
  const ganas = (f) => f.split(' ').map((x) => GANA[x]).join('');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const VRTTA = ((ME.METRES && ME.METRES.list) || []).map(([name, kind, pats, yati, tier, aliases]) => {
    const four = (kind === 'sama' ? [pats[0], pats[0], pats[0], pats[0]] : kind === 'ardhasama' ? [pats[0], pats[1], pats[0], pats[1]] : pats).map((p) => p.toLowerCase());
    return { name: cap(name), kind, four, lens: four.map((p) => p.length), total: four.reduce((a, p) => a + p.length, 0), tier, aliases: aliases.map(cap), yati };
  });
  const byTotal = new Map();
  for (const m of VRTTA) { if (!byTotal.has(m.total)) byTotal.set(m.total, []); byTotal.get(m.total).push(m); }
  Metre.count = () => ({ vrtta: VRTTA.length, sama: VRTTA.filter((m) => m.kind === 'sama').length, ardhasama: VRTTA.filter((m) => m.kind === 'ardhasama').length, visama: VRTTA.filter((m) => m.kind === 'viṣama').length, matra: MATRA.length + ARYA.length });
  Metre.find = (name) => VRTTA.find((m) => m.name === name || m.aliases.includes(name)) || null;

  /* The śloka (anuṣṭubh): eight syllables a pāda. The fifth is light and the sixth heavy in every pāda; the
     seventh is light in the even pādas and heavy in the odd ones (pathyā). In odd pādas the vipulās are
     accepted too. Syllables two and three are not both light. */
  const VIPULA = { 'lgg': 'pathyā', 'lll': 'na-vipulā', 'gll': 'bha-vipulā', 'ggg': 'ma-vipulā', 'glg': 'ra-vipulā' };

  function checkSloka(pada, k) {
    const faults = [];
    if (pada.length !== 8) return { faults: [{ pos: -1, why: pada.length + ' syllables, not 8' }], form: null };
    const w = pada.map((x) => x.w).join('');
    if (w[1] === 'l' && w[2] === 'l') faults.push({ pos: 2, why: 'syllables 2 and 3 are both light' });
    let form = null;
    if (k % 2 === 1) { // even pāda (b, d)
      if (w.slice(4, 7) !== 'lgl') faults.push({ pos: w[4] !== 'l' ? 4 : w[5] !== 'g' ? 5 : 6, why: 'an even pāda has light, heavy, light at 5 to 7' });
      form = 'pathyā';
    } else {
      form = VIPULA[w.slice(4, 7)] || null;
      if (!form) faults.push({ pos: 4, why: 'syllables 5 to 7 fit neither the pathyā nor a vipulā' });
    }
    return { faults, form };
  }

  // The halves of a verse, where daṇḍas mark them, and its syllables without them.
  function halvesOf(syl) {
    const halves = [[]];
    for (const x of syl) { if (x.half) { if (halves[halves.length - 1].length) halves.push([]); } else halves[halves.length - 1].push(x); }
    return { real: halves.filter((h) => h.length), flat: syl.filter((x) => !x.half) };
  }

  /* The verse cut into pādas of the lengths given: by the daṇḍas if they mark four pādas or two halves, else by
     count. */
  function cut(syl, lens) {
    const { real, flat } = halvesOf(syl);
    if (real.length === 4) return real;
    if (real.length === 2) return [real[0].slice(0, lens[0]), real[0].slice(lens[0]), real[1].slice(0, lens[2]), real[1].slice(lens[2])];
    const out = [];
    let at = 0;
    for (let k = 0; k < 4; k++) { const n = k === 3 ? flat.length - at : lens[k]; out.push(flat.slice(at, at + n)); at += n; }
    return out;
  }

  const PADA = 'abcd';

  // Each pāda against its pattern; its last syllable may be either.
  function againstPatterns(ps, four) {
    const faults = [];
    ps.forEach((p, k) => {
      const pat = four[k], L = pat.length;
      if (p.length !== L) faults.push({ pada: PADA[k], pos: 0, why: p.length + ' syllables, not ' + L, at: (p[0] || {}).at });
      for (let i = 0; i < Math.min(L - 1, p.length); i++) if (p[i].w !== pat[i] && !p[i].opt) faults.push({ pada: PADA[k], pos: i + 1, why: 'should be ' + (pat[i] === 'g' ? 'heavy' : 'light'), at: p[i].at });
    });
    return faults;
  }

  /* Metres counted by morae (mātrā): the morae of each pāda, and for the vaitālīya family a fixed close. The
     āryā family counts the last syllable of each half as heavy; the vaitālīya family the last of each pāda. */
  const MATRA = [
    { name: 'Vaitālīya', morae: [14, 16, 14, 16], close: 'glglg', anceps: 'pada' },
    { name: 'Aupacchandasika', morae: [16, 18, 16, 18], close: 'glglgg', anceps: 'pada' },
  ];

  function checkMatra(syl, m) {
    const { real, flat } = halvesOf(syl);
    const ps = [];
    const faults = [];
    let i = 0;
    for (let k = 0; k < 4; k++) {
      const t = m.morae[k];
      const free = m.anceps === 'pada' || k % 2 === 1;
      const p = [];
      let s = 0;
      while (i < flat.length) {
        const x = flat[i];
        const w = x.w === 'g' ? 2 : 1;
        p.push(x); i++; s += w;
        if (k === 3) continue;
        if (s >= t) break;
        // a light syllable at the end of a pāda may stand for a heavy one
        const next = flat[i];
        if (free && w === 1 && s === t - 1 && (!next || s + (next.w === 'g' ? 2 : 1) > t)) { s = t; break; }
      }
      if (k === 3 && p.length && p[p.length - 1].w === 'l' && s === t - 1) s = t;
      if (s !== t) faults.push({ pada: PADA[k], pos: 0, why: s + ' morae, not ' + t, at: (p[0] || {}).at });
      if (m.close) {
        const w = p.map((x) => x.w).join('');
        const tail = w.slice(-m.close.length);
        for (let j = 0; j < m.close.length - 1; j++) if (tail[j] !== m.close[j]) { faults.push({ pada: PADA[k], pos: p.length - m.close.length + j + 1, why: 'the close should be ' + m.close.replace(/g/g, '–').replace(/l/g, '⏑'), at: (p[p.length - m.close.length + j] || {}).at }); break; }
      }
      ps.push(p);
    }
    // where daṇḍas mark the halves, the second pāda must end at the first
    if (real.length === 2 && ps[0].length + ps[1].length !== real[0].length) faults.push({ pada: 'b', pos: 0, why: 'the first half does not end where the daṇḍa is', at: (ps[1][0] || {}).at });
    return { metre: m.name, faults, padas: ps, length: 0, tier: 0, morae: ps.map((p) => p.reduce((a, x) => a + (x.w === 'g' ? 2 : 1), 0)) };
  }

  /* The āryā family, by its gaṇas of four morae: a half has seven and a half, the odd ones never ⏑–⏑ (ja), the
     sixth ⏑–⏑ or four light in a long half and one light in a short half, the last syllable either. The first
     pāda ends after the third gaṇa. As in the Vṛttaratnākara, ch. 2. */
  const ODD = '(?:GG|LLG|GLL|LLLL)', EVEN = '(?:GG|LLG|GLL|LLLL|LGL)', END = '(?:L|G)';
  const P12 = ODD + EVEN + ODD;
  const HALF = {
    long: '(' + P12 + ')(' + EVEN + ODD + '(?:LGL|LLLL)' + ODD + END + ')',
    short: '(' + P12 + ')(' + EVEN + ODD + 'L' + ODD + END + ')',
    giti: '(' + P12 + ')(' + EVEN + ODD + '(?:LGL|LLLL)' + ODD + '(?:GG|LLG|GLL|LLLL|LGL|GL|LLL)' + END + ')',
  };
  const ARYA = [
    { name: 'Āryā', halves: ['long', 'short'] }, { name: 'Gīti', halves: ['long', 'long'] }, { name: 'Upagīti', halves: ['short', 'short'] },
    { name: 'Udgīti', halves: ['short', 'long'] }, { name: 'Āryāgīti', halves: ['giti', 'giti'] },
  ];
  // a syllable that may be either matches either
  const RX = new Map();
  const rx = (k) => { if (!RX.has(k)) RX.set(k, new RegExp('^' + HALF[k].replace(/L/g, '[LX]').replace(/G/g, '[GX]') + '$')); return RX.get(k); };
  const letters = (h) => h.map((x) => (x.opt ? 'X' : x.w.toUpperCase())).join('');

  function checkArya(syl, m) {
    const { real, flat } = halvesOf(syl);
    // where the halves are marked, those; else the cut that fits best
    const cuts = real.length === 2 ? [real[0].length] : flat.map((x, i) => i).filter((i) => i > 8 && i < flat.length - 8);
    let best = null;
    for (const c of cuts) {
      const hs = [flat.slice(0, c), flat.slice(c)];
      const got = hs.map((h, k) => rx(m.halves[k]).exec(letters(h)));
      const faults = [];
      got.forEach((g, k) => { if (!g) faults.push({ pada: k ? 'cd' : 'ab', pos: 0, why: 'the ' + (k ? 'second' : 'first') + ' half does not divide into the gaṇas of the ' + m.name.toLowerCase(), at: (hs[k][0] || {}).at }); });
      if (!best || faults.length < best.faults.length) {
        const ps = [];
        hs.forEach((h, k) => { const n1 = got[k] ? got[k][1].length : Math.min(h.length, Math.round(h.length * 0.4)); ps.push(h.slice(0, n1), h.slice(n1)); });
        best = { metre: m.name, faults, padas: ps, length: 0, tier: 2 };
      }
      if (!faults.length) break;
    }
    return best;
  }

  /* Which metre, and what does not fit it. -> {metre, names, kind, form, faults: [{pada: 'a'..'d', pos: 1-based,
     why, at}], syllables, padas: [[syllables]]} or {metre: null} when it is not verse in any metre known here.
     A metre of the large list is accepted only with at most one fault, since it has so many rare metres that a
     sentence of prose would otherwise fit one of them. */
  Metre.identify = function (text) {
    const syl = Metre.syllables(text);
    const n = syl.filter((x) => !x.half).length;
    if (n < 16) return { metre: null, syllables: n, why: 'too short for a verse' };
    const tries = [];
    // śloka, if the count is near 32
    if (Math.abs(n - 32) <= 2) {
      const ps = cut(syl, [8, 8, 8, 8]);
      const faults = [];
      const forms = [];
      ps.forEach((p, k) => { const r = checkSloka(p, k); forms.push(r.form); for (const f of r.faults) faults.push({ pada: PADA[k], pos: f.pos + 1, why: f.why, at: f.pos >= 0 && p[f.pos] ? p[f.pos].at : (p[0] || {}).at }); });
      tries.push({ metre: 'Śloka (anuṣṭubh)', kind: 'śloka', form: forms.filter(Boolean).join(', '), faults, padas: ps, length: 8, tier: -1 });
    }
    // the vṛttas whose length is near
    for (let t = n - 2; t <= n + 2; t++) {
      for (const m of byTotal.get(t) || []) {
        const ps = cut(syl, m.lens);
        tries.push({ metre: m.name, names: [m.name, ...m.aliases], kind: m.kind, faults: againstPatterns(ps, m.four), padas: ps, length: m.kind === 'sama' ? m.lens[0] : 0, tier: m.tier, yati: m.yati });
      }
    }
    // upajāti: pādas of two metres that differ only in their first syllable, mixed
    for (const [a, b] of [['t t j g g', 'j t j g g'], ['j t j r', 't t j r']]) {
      const pa = ganas(a), pb = ganas(b);
      const L = pa.length;
      if (Math.abs(n - 4 * L) > 2) continue;
      const ps = cut(syl, [L, L, L, L]);
      const four = ps.map((p) => {
        const w = p.map((x) => x.w).join('');
        const da = [...w].filter((c, i) => i < L - 1 && c !== pa[i]).length, db = [...w].filter((c, i) => i < L - 1 && c !== pb[i]).length;
        return da <= db ? pa : pb;
      });
      // all four of one kind is that metre, not an upajāti
      if (new Set(four).size > 1) tries.push({ metre: 'Upajāti', kind: 'upajāti', form: L === 11 ? 'of Indravajrā and Upendravajrā' : 'of Vaṃśastha and Indravaṃśā', faults: againstPatterns(ps, four), padas: ps, length: L, tier: 0 });
    }
    // the metres counted by morae, where the morae are near
    const morae = syl.filter((x) => !x.half).reduce((a, x) => a + (x.w === 'g' ? 2 : 1), 0);
    for (const m of MATRA) {
      const total = m.morae.reduce((a, x) => a + x, 0);
      if (Math.abs(morae - total) <= 4) tries.push(Object.assign({ kind: 'mātrā' }, checkMatra(syl, m)));
    }
    if (morae >= 50 && morae <= 70) for (const m of ARYA) { const r = checkArya(syl, m); if (r) tries.push(Object.assign({ kind: 'mātrā' }, r)); }
    /* Faults are borne only where daṇḍas mark the halves where the metre has them and close the verse: in a
       sentence of prose some metre is always only two or three syllables away. Otherwise one fault is allowed, and
       none in a metre of the large list, which allows one at most. */
    const { real } = halvesOf(syl);
    const halfAt = (x) => (x.padas && x.padas.length === 4 ? x.padas[0].length + x.padas[1].length : -1);
    const ends = syl.length > 0 && !!syl[syl.length - 1].half;
    const marked = (x) => ends && real.length === 2 && (x.kind === 'mātrā' ? true : Math.abs(real[0].length - halfAt(x)) <= 1 && x.padas.every((p) => p.length));
    const allowed = (x) => x.faults.length <= (!marked(x) ? (x.tier >= 2 ? 0 : 1) : x.tier >= 2 ? 1 : 2 + Math.floor(n / 24));
    tries.sort((a, b) => a.faults.length - b.faults.length || a.tier - b.tier);
    const best = tries.find(allowed);
    if (!best) return { metre: null, syllables: n, why: 'fits no metre known here', closest: tries[0] ? tries[0].metre : null };
    // metres that fit just as well: lists differ in names, and some metres differ only in a free last syllable
    const names = [];
    for (const x of tries) if (x.faults.length === best.faults.length && allowed(x)) for (const nm of x.names || [x.metre]) if (!names.includes(nm)) names.push(nm);
    names.sort((a, b) => (a === best.metre ? -1 : b === best.metre ? 1 : 0));
    return Object.assign({ syllables: n }, best, { names: best.faults.length ? (best.names || [best.metre]) : names });
  };

  // How many faults the text has in the metre given: the measure for comparing readings.
  Metre.faultsIn = function (text, metre) {
    const r = Metre.identify(text);
    if (r.metre === metre) return r.faults.length;
    return Infinity;
  };

  Metre.weights = (text) => Metre.syllables(text).map((x) => (x.half ? '|' : x.w)).join('');

  ME.Metre = Metre;
})(window.ME);
