'use strict';
/* Metre: syllables, their weight, and which metre a verse is in. It only flags and never changes a text.
   Written for Manuscribe from the rules of Sanskrit prosody, as in Kedārabhaṭṭa's Vṛttaratnākara and the
   appendix on prosody in Apte's Practical Sanskrit-English Dictionary.

   A syllable is heavy (g, guru) if its vowel is long, or is followed by anusvāra or visarga, or by two or more
   consonants, also across a word boundary; otherwise light (l, laghu). The last syllable of a pāda may be either. */
(function (ME) {
  const { Norm } = ME;
  const Metre = {};

  // one character per sound (Norm's writing): K = kh, E = ai, O = au
  const SHORT = new Set(['a', 'i', 'u', 'ṛ']);
  const LONG = new Set(['ā', 'ī', 'ū', 'ṝ', 'e', 'E', 'o', 'O']);
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
        while (k < s.length && (CONS.has(s[k]) || s[k] === ' ' || s[k] === "'" || /\p{M}/u.test(s[k]))) { if (CONS.has(s[k])) cons++; k++; }
        if (cons >= 2) long = true;
        pending = { w: long ? 'g' : 'l', at: at[start], end: at[Math.min(k, s.length)] };
        continue;
      }
      i++;
    }
    if (pending) out.push(pending);
    return out;
  };

  /* ---------- the metres ---------- */

  // Even metres, the same pattern in each pāda, written out from their gaṇa formulas in the Vṛttaratnākara.
  const GANA = { y: 'lgg', m: 'ggg', t: 'ggl', r: 'glg', j: 'lgl', bh: 'gll', n: 'lll', s: 'llg', l: 'l', g: 'g' };
  const ganas = (f) => f.split(' ').map((x) => GANA[x]).join('');
  const FORMULA = {
    Indravajrā: 't t j g g', Upendravajrā: 'j t j g g', Rathoddhatā: 'r n r l g', Svāgatā: 'r n bh g g', Śālinī: 'm t t g g',
    Vaṃśastha: 'j t j r', Indravaṃśā: 't t j r', Drutavilambita: 'n bh bh r', Bhujaṅgaprayāta: 'y y y y', Toṭaka: 's s s s',
    Praharṣiṇī: 'm n j r g', Vasantatilakā: 't bh j j g g', Mālinī: 'n n m y y',
    Mandākrāntā: 'm bh n t t g g', Śikhariṇī: 'y m n s bh l g', Pṛthvī: 'j s j s y l g', Hariṇī: 'n s m r s l g',
    Śārdūlavikrīḍita: 'm s j s t t g', Sragdharā: 'm r bh n y y y',
  };
  Metre.SAMA = Object.entries(FORMULA).map(([name, f]) => [name, ganas(f)]);

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

  /* The verse cut into four pādas: by the daṇḍas into halves if they are there, else by count. */
  function padas(syl, per) {
    const halves = [[]];
    for (const x of syl) { if (x.half) { if (halves[halves.length - 1].length) halves.push([]); } else halves[halves.length - 1].push(x); }
    const real = halves.filter((h) => h.length);
    const flat = syl.filter((x) => !x.half);
    if (real.length === 2) {
      // each half split in two where its length says
      const cut = (h) => { const mid = per ? Math.min(per, h.length) : Math.ceil(h.length / 2); return [h.slice(0, mid), h.slice(mid)]; };
      return [...cut(real[0]), ...cut(real[1])];
    }
    const n = per || Math.ceil(flat.length / 4);
    return [flat.slice(0, n), flat.slice(n, 2 * n), flat.slice(2 * n, 3 * n), flat.slice(3 * n)];
  }

  const PADA = 'abcd';

  /* Which metre, and what does not fit it. -> {metre, form, faults: [{pada: 'a'..'d', pos: 1-based, why, at}],
     syllables, padas: [[syllables]]} or {metre: null} when it is not verse in any metre known here. */
  Metre.identify = function (text) {
    const syl = Metre.syllables(text);
    const n = syl.filter((x) => !x.half).length;
    if (n < 16) return { metre: null, syllables: n, why: 'too short for a verse' };
    const tries = [];
    // śloka, if the count is near 32
    if (Math.abs(n - 32) <= 2) {
      const ps = padas(syl, 8);
      const faults = [];
      const forms = [];
      ps.forEach((p, k) => { const r = checkSloka(p, k); forms.push(r.form); for (const f of r.faults) faults.push({ pada: PADA[k], pos: f.pos + 1, why: f.why, at: f.pos >= 0 && p[f.pos] ? p[f.pos].at : (p[0] || {}).at }); });
      tries.push({ metre: 'Śloka (anuṣṭubh)', form: forms.filter(Boolean).join(', '), faults, padas: ps, length: 8 });
    }
    // even metres, and upajāti (Indravajrā and Upendravajrā mixed)
    for (const [name, pat] of Metre.SAMA) {
      const L = pat.length;
      if (Math.abs(n - 4 * L) > 2) continue;
      const ps = padas(syl, L);
      const faults = [];
      ps.forEach((p, k) => {
        if (p.length !== L) faults.push({ pada: PADA[k], pos: 0, why: p.length + ' syllables, not ' + L, at: (p[0] || {}).at });
        for (let i = 0; i < Math.min(L - 1, p.length); i++) if (p[i].w !== pat[i]) faults.push({ pada: PADA[k], pos: i + 1, why: 'should be ' + (pat[i] === 'g' ? 'heavy' : 'light'), at: p[i].at });
      });
      tries.push({ metre: name, faults, padas: ps, length: L });
    }
    {
      const iv = ganas(FORMULA.Indravajrā), uv = ganas(FORMULA.Upendravajrā);
      if (Math.abs(n - 44) <= 2) {
        const ps = padas(syl, 11);
        const faults = [];
        ps.forEach((p, k) => {
          const w = p.map((x) => x.w).join('').slice(0, 10);
          const a = [...w].filter((c, i) => c !== iv[i]).length, b = [...w].filter((c, i) => c !== uv[i]).length;
          const pat = a <= b ? iv : uv;
          if (p.length !== 11) faults.push({ pada: PADA[k], pos: 0, why: p.length + ' syllables, not 11', at: (p[0] || {}).at });
          for (let i = 0; i < Math.min(10, p.length); i++) if (p[i].w !== pat[i]) faults.push({ pada: PADA[k], pos: i + 1, why: 'should be ' + (pat[i] === 'g' ? 'heavy' : 'light'), at: p[i].at });
        });
        tries.push({ metre: 'Upajāti', faults, padas: ps, length: 11 });
      }
    }
    // āryā, by morae: 12 + 18 in the first half, 12 + 15 in the second, the last syllable of each half counted heavy
    {
      const halves = [[]];
      for (const x of syl) { if (x.half) { if (halves[halves.length - 1].length) halves.push([]); } else halves[halves.length - 1].push(x); }
      const real = halves.filter((h) => h.length);
      if (real.length === 2) {
        const morae = (h) => h.reduce((acc, x, i) => acc + (i === h.length - 1 ? 2 : x.w === 'g' ? 2 : 1), 0);
        const m1 = morae(real[0]), m2 = morae(real[1]);
        const faults = [];
        if (m1 !== 30) faults.push({ pada: 'ab', pos: 0, why: m1 + ' morae in the first half, not 30', at: real[0][0].at });
        if (m2 !== 27) faults.push({ pada: 'cd', pos: 0, why: m2 + ' morae in the second half, not 27', at: real[1][0].at });
        tries.push({ metre: 'Āryā', faults, padas: real, length: 0, morae: [m1, m2] });
      }
    }
    tries.sort((a, b) => a.faults.length - b.faults.length);
    const best = tries[0];
    // too many faults: it is not this metre, nor perhaps verse at all
    // a verse with a fault or two is still that verse; more, and it is something else
    if (!best || best.faults.length > 2 + Math.floor(n / 24)) return { metre: null, syllables: n, why: 'fits no metre known here', closest: best ? best.metre : null };
    return Object.assign({ syllables: n }, best);
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
