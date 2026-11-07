'use strict';
/* Normalisation for comparing witnesses. Nothing here changes a transcription: it works on a copy
   and always knows which diplomatic letters each normalised letter came from.

   Internally each sound is one character, as in Saktumiva ("slpish": K = kh, E = ai, O = au), so a
   rule never has to tell the h of kh from a real h, and i before a vowel never catches the i of ai.

   `at` is the whole of the offset map: at[j] is where normalised character j starts in the diplomatic
   text, and at[length] is the end of that text. It never decreases, so any stretch of normalised text
   has exactly one stretch of diplomatic text, and together they cover all of it. Deleted letters
   simply belong to the character before them.

   The Sanskrit rules are from Charles Li's Saktumiva 2.0, lib/normalize.mjs (commit 132a83e, GPL-3.0),
   rewritten as data. On the same text they give the same result as his code, with one difference
   that matters: his route writes Devanagari e and o as ē and ō, which his rules for e and o then
   miss, and here they are plain e and o, so those rules act on Devanagari as on IAST. */
(function (ME) {
  const Norm = {};

  /* ---------- writing: Devanagari or IAST -> one character per sound ---------- */

  const CONS = {
    क: 'k', ख: 'K', ग: 'g', घ: 'G', ङ: 'ṅ', च: 'c', छ: 'C', ज: 'j', झ: 'J', ञ: 'ñ',
    ट: 'ṭ', ठ: 'Ṭ', ड: 'ḍ', ढ: 'Ḍ', ण: 'ṇ', त: 't', थ: 'T', द: 'd', ध: 'D', न: 'n',
    प: 'p', फ: 'P', ब: 'b', भ: 'B', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'ś', ष: 'ṣ', स: 's', ह: 'h', ळ: 'ḻ',
    'क़': 'k', 'ख़': 'K', 'ग़': 'g', 'ज़': 'j', 'ड़': 'ḍ', 'ढ़': 'Ḍ', 'फ़': 'P', 'य़': 'ẏ',
  };
  const VOWEL = { अ: 'a', आ: 'ā', इ: 'i', ई: 'ī', उ: 'u', ऊ: 'ū', ऋ: 'ṛ', ॠ: 'ṝ', ऌ: 'l̥', ॡ: 'l̥̄', ए: 'e', ऐ: 'E', ओ: 'o', औ: 'O' };
  const SIGN = { 'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū', 'ृ': 'ṛ', 'ॄ': 'ṝ', 'ॢ': 'l̥', 'ॣ': 'l̥̄', 'े': 'e', 'ै': 'E', 'ो': 'o', 'ौ': 'O' };
  const OTHER = { 'ं': 'ṃ', 'ः': 'ḥ', 'ँ': 'm̐', ऽ: "'", '।': '|', '॥': '||', ॐ: 'oṃ',
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
  const VIRAMA = '्', NUKTA = '़';
  const INVISIBLE = /[​-‍﻿]/;
  const DIGRAPH = { kh: 'K', gh: 'G', ch: 'C', jh: 'J', ṭh: 'Ṭ', ḍh: 'Ḍ', th: 'T', dh: 'D', ph: 'P', bh: 'B', ai: 'E', au: 'O' };
  const UNDIGRAPH = Object.fromEntries(Object.entries(DIGRAPH).map(([a, b]) => [b, a]));

  Norm.GAP = '‡';

  Norm.fromSlp = (s) => s.replace(/[KGCJṬḌTDPBEO]/g, (c) => UNDIGRAPH[c]);

  /* -> {text, at}. opts.skip: [[from, to]] of diplomatic text not to be compared; opts.gaps: [{at, quantity}]
     places where the witness has lost text, written as GAP characters that have no diplomatic letters. */
  Norm.fromDiplomatic = function (dip, opts) {
    if (opts && opts.raw) return asWritten(dip, opts);
    const skip = (opts && opts.skip) || [];
    const gaps = ((opts && opts.gaps) || []).slice().sort((a, b) => a.at - b.at);
    const out = [], at = [];
    const push = (s, pos) => { for (let k = 0; k < s.length; k++) { out.push(s[k]); at.push(pos); } };
    let sk = 0, g = 0;
    const kept = (i) => { // the next position at or after i that is compared
      for (;;) {
        while (sk < skip.length && skip[sk][1] <= i) sk++;
        if (sk < skip.length && skip[sk][0] <= i) { i = skip[sk][1]; continue; }
        if (i < dip.length && INVISIBLE.test(dip[i])) { i++; continue; }
        return i;
      }
    };
    const gapsUpTo = (i) => { while (g < gaps.length && gaps[g].at <= i) { push(Norm.GAP.repeat(gaps[g].quantity || 1), gaps[g].at); g++; } };
    let i = kept(0);
    while (i < dip.length) {
      gapsUpTo(i);
      const c = dip[i];
      if (CONS[c]) {
        push(CONS[c], i);
        let j = kept(i + 1);
        if (dip[j] === NUKTA) {
          if (c === 'ड') { out[out.length - 1] = 'ḍ'; } else if (c === 'ढ') { out[out.length - 1] = 'Ḍ'; }
          j = kept(j + 1);
        }
        const gapHere = g < gaps.length && gaps[g].at <= j;
        if (!gapHere && dip[j] === VIRAMA) { i = kept(j + 1); continue; }
        if (!gapHere && SIGN[dip[j]]) { push(SIGN[dip[j]], j); i = kept(j + 1); continue; }
        push('a', i + 1); // the vowel the script does not write
        i = j;
        continue;
      }
      if (VOWEL[c]) push(VOWEL[c], i);
      else if (SIGN[c]) push(SIGN[c], i);   // no consonant before it: a line can begin this way
      else if (c === VIRAMA || c === NUKTA) { /* nothing to say on its own */ }
      else if (OTHER[c]) push(OTHER[c], i);
      else if (/\p{Script=Latin}/u.test(c)) {
        // IAST: one letter, whatever way its diacritics were typed, then pairs that are one sound
        let e = i + 1;
        while (e < dip.length && /\p{M}/u.test(dip[e])) e++;
        const one = dip.slice(i, e).normalize('NFC').toLowerCase();
        const next = kept(e);
        const nextOne = next < dip.length && /\p{Script=Latin}/u.test(dip[next]) ? (() => { let x = next + 1; while (x < dip.length && /\p{M}/u.test(dip[x])) x++; return { x, s: dip.slice(next, x).normalize('NFC').toLowerCase() }; })() : null;
        if (nextOne && DIGRAPH[one + nextOne.s]) { push(DIGRAPH[one + nextOne.s], i); i = kept(nextOne.x); continue; }
        push(one, i);
        i = kept(e);
        continue;
      } else push(c, i);
      i = kept(i + 1);
    }
    gapsUpTo(Infinity);
    at.push(dip.length);
    at[0] = 0;
    return { text: out.join(''), at };
  };

  /* ---------- rules ---------- */

  const LI = 'C. Li, Saktumiva 2.0, lib/normalize.mjs (132a83e)';
  const MAAS = 'P. A. Maas 2010, WZKS';
  const R = (id, name, cls, search, replace, source, extra) => Object.assign({ id, name, cls, search, replace, source }, extra);

  // In the order they run: several depend on what an earlier one has left.
  Norm.RULES = [
    R('spaces-collapse', 'Runs of spaces count as one', 'spacing', '\\s+', ' ', 'Manuscribe', { always: true }),
    R('verse-number', 'Verse numbers between daṇḍas', 'punctuation', '\\|+\\s*\\d+\\s*\\|+', '', 'Manuscribe; Li strips all digits, but Sukthankar shows numerals can matter'),
    R('numerals', 'All other numerals', 'punctuation', '\\d+', '', LI),
    R('punct', 'Punctuation, daṇḍas and ॰', 'punctuation', '[()\\[\\],:;?!|¦_"“”‘’·\\-–—―=+.\\/॰෴]+', '', LI + '; Maas 2010'),
    R('iast-anusvara', 'ṁ as ṃ', 'orthographic', 'ṁ', 'ṃ', 'Manuscribe'),
    R('iso-r', 'r̥ as ṛ', 'orthographic', 'r̥', 'ṛ', 'Manuscribe'),
    R('ya-dot', 'ẏ as y', 'orthographic', 'ẏ', 'y', LI),
    R('candrabindu', 'Candrabindu as anusvāra', 'nasal', 'm̐', 'ṃ', LI),
    R('gem-aspirate', 'Doubled aspirates (cch, ddh)', 'gemination', 'k(?=K)|g(?=G)|c(?=C)|j(?=J)|ṭ(?=Ṭ)|ḍ(?=Ḍ)|t(?=T)|d(?=D)|p(?=P)|b(?=B)', '', LI),
    R('gem-hm', 'Doubled m after h', 'gemination', '(?:ṃhm|hmm)', 'hm', LI),
    R('gem-t', 'Doubled t (sattva, patra)', 'gemination', '([rṛi]|p[aā])tt|tt(?=[rvy]\\S)', '$1t', LI + '; Maas 2010'),
    R('gem-after-r', 'Doubled consonant after r', 'gemination', '([rṛ]\\s*)([kgcjṭḍṇtdnpbmyvl])\\2{1,2}', '$1$2', LI + '; Maas 2010'),
    R('nasal-final', 'Final nasal variants', 'nasal', '(?:[ṃṅ][lṣs]|nn)(?!\\S)', 'n', LI),
    R('nasal-internal', 'Anusvāra and class nasal, within a word', 'nasal', '[mnṅñṇ](?=[pPbBvmdDtTnṭṬḍḌcCjJkKgGsś])', 'ṃ', LI + '; Maas 2010'),
    R('nasal-final-anusvara', 'Anusvāra and nasal at the end of a word', 'nasal', 'ṃ?[mṅ](?!\\S)|n(?=\\s+[tTdDn])|ñ(?=\\s+[jJcC])', 'ṃ', LI + ' (A 8.4.59)'),
    R('vis-voiced', 'aḥ before voiced consonants', 'sandhi', "(?:a[ḥr]|[o])(?=\\s+['gGjJḍḌdDnbBmrylvh])", 'aḥ', LI),
    R('vis-vowel', 'aḥ before vowels', 'sandhi', 'aḥ(?=\\s+[āiīeuūoṛ])', 'a', LI),
    R('vis-unvoiced', 'o for aḥ a before unvoiced consonants', 'sandhi', 'o\\s+(?=[kKcCṭṬtTpPśṣsṃ])', 'aḥ a', LI),
    R('vis-long', 'āḥ variants', 'sandhi', 'āḥ(?=\\s+[aāiīeEuūUogGjJḍḌdDbBnmyrlvh])', 'ā', LI),
    R('vis-other', 'Other visarga variants', 'sandhi', 'ḥ?[rśṣs](?!\\S)', 'ḥ', LI),
    R('avagraha-extra', 'Avagraha within a word', 'avagraha', "(\\S)'+", '$1', LI),
    R('avagraha-double', 'Double avagraha', 'avagraha', "''", 'ā', LI),
    R('avagraha-a', 'Avagraha as short a', 'avagraha', "'", 'a', LI),
    R('avagraha-none', 'Remove avagrahas altogether', 'avagraha', "'", '', LI),
    R('vis-internal', 'Internal visarga variants', 'sandhi', 'ṣ(?=[kK])|s(?=s)', 'ḥ', LI),
    R('final-av', 'Final āv for au', 'sandhi', 'āv(?!\\S)', 'O', LI),
    R('final-su', 'Final -v for -u after s', 'sandhi', '(?<=[sṣ])v(?=\\s+[aāiīuūoOeE])', 'u', LI),
    R('final-v', 'Other final -v for -u', 'sandhi', '(?<=[cjṭṬḍḌṇtTdDnpbmyrlśṣsh])v(?=\\s+[aāiīuūoOeE])', 'u', LI),
    R('final-i', 'Final i before a vowel', 'sandhi', 'i(?=\\s+[aāuūoOeE])', 'y', LI),
    R('kcch', 'kcch and kś', 'sandhi', 'k(\\s*)(?:ś|c?C)', 'k$1ś', LI),
    R('ncch', 'ñcch and nś', 'sandhi', '[ñṃ](\\s+)C', 'n$1ś', LI + ': written for this, though his pattern never fires; off, as it misfires on ṃ ch'),
    R('tś', 'cś, chś and tś', 'sandhi', '[tcC](\\s*)ś', 'c$1C', LI),
    R('cch', 'ch and cch', 'gemination', '([aāiīuūeEoO])C', '$1cC', LI + '; Maas 2010'),
    R('t-hi', 'Final t before hi', 'sandhi', 'd(\\s+)D(?=[iy](?:\\s|$))', 't$1h', LI),
    R('t-voiced', 'Final t before a voiced sound', 'sandhi', 'd(?=(?:\\s+[aāiīeEuūoOgGdDbByrv]|\\s*$))', 't', LI),
    R('t-nasal', 'Final t before n or m', 'sandhi', '([ai])n(?=\\s+[nm])', '$1t', LI),
    R('t-palatal', 'Final t before c or j', 'sandhi', 'j(?=\\s+j)|c(?=\\s+c)', 't', LI),
    R('y-vowel', 'i or y before a vowel', 'sandhi', 'y(?=\\s+[aāuūeEoO])', 'i', LI),
    R('bhd', 'bhd for bdh', 'orthographic', 'Bd', 'bD', LI),
    R('aspirate-s', 'ṣṭh and ṣṭ', 'orthographic', 'ṣṬ', 'ṣṭ', MAAS),
    // not in any profile unless asked for
    R('pk-nasal', 'Anusvāra and class nasal (Prakrit)', 'nasal', '[mnṅñṇ](?=[pPbBmdDtTnṭṬḍḌcCjJkKgGñ])', 'ṃ', LI + ', Pali group'),
    R('pk-ya', 'Ya-śruti', 'orthographic', '([aā])y(?=[aā])', '$1', 'Upadhye, Līlāvaī: an open editorial question'),
    R('pk-n', 'ṇ and n', 'orthographic', 'ṇ', 'n', 'Upadhye, Līlāvaī: an open editorial question'),
    R('gu-ai', '-ai and -e', 'orthographic', 'E', 'e', 'Lead from P. B. Pandit; check the introduction before use'),
    R('gu-au', '-au and -o', 'orthographic', 'O', 'o', 'Lead from P. B. Pandit; check the introduction before use'),
    R('decl-bv', 'ba and va', 'declared', 'b', 'v', LI + '; Saktumiva 1 script-ba-va'),
    R('decl-sibilant', 'śa, ṣa and sa', 'declared', '[śṣ]', 's', 'Wujastyk, per-manuscript foibles'),
    R('decl-th', 'ṭha and ṭa', 'declared', 'Ṭ', 'ṭ', 'Saktumiva 1 script note'),
    R('spaces', 'Spaces', 'spacing', '\\s', '', LI),
  ];
  const BY_ID = new Map(Norm.RULES.map((r) => [r.id, r]));
  Norm.rule = (id) => BY_ID.get(id);
  // For a text in any script: no transliteration, and rules that hold for any script.
  Norm.RULES.push(
    R('raw', 'Letters as written, in any script (no transliteration)', 'script', '(?!)', '', 'Manuscribe', { raw: true }),
    R('u-punct', 'Punctuation of any script', 'punctuation', '[\\p{P}\\p{S}]+', '', 'Unicode, general categories P and S', { flags: 'gu' }),
    R('u-case', 'Capital and small letters', 'orthographic', '\\p{Lu}', '', 'Unicode case folding', { flags: 'gu', fn: (m) => m.toLowerCase() }),
    R('u-marks', 'Marks over and under letters, as vowel points and accents', 'orthographic', '\\p{Mn}+', '', 'Unicode, general category Mn, after canonical decomposition', { flags: 'gu' }),
  );
  for (const r of Norm.RULES) { r.re = new RegExp(r.search, r.flags || 'g'); BY_ID.set(r.id, r); }

  // What a witness may be declared to do: applied to that witness alone, not to the others.
  Norm.DECLARATIONS = [
    { id: 'decl-bv', label: 'writes b and v alike' },
    { id: 'decl-sibilant', label: 'confuses ś, ṣ and s' },
    { id: 'decl-th', label: 'writes ṭh as ṭ' },
    { id: 'pk-ya', label: 'uses ya-śruti' },
    { id: 'pk-n', label: 'writes ṇ and n alike' },
  ];

  const SANSKRIT = ['verse-number', 'punct', 'iast-anusvara', 'iso-r', 'ya-dot', 'candrabindu', 'gem-aspirate', 'gem-hm', 'gem-t', 'gem-after-r',
    'nasal-final', 'nasal-internal', 'nasal-final-anusvara', 'vis-voiced', 'vis-vowel', 'vis-unvoiced', 'vis-long', 'vis-other',
    'avagraha-extra', 'avagraha-double', 'avagraha-a', 'vis-internal', 'final-av', 'final-su', 'final-v', 'final-i',
    'kcch', 'tś', 'cch', 't-hi', 't-voiced', 't-nasal', 't-palatal', 'y-vowel', 'bhd', 'aspirate-s', 'spaces'];

  /* align: rules used when lining witnesses up, where a false mismatch does harm.
     hide: classes of difference an apparatus leaves out by default; the rest stay visible. */
  Norm.PROFILES = [
    { id: 'sa-classical', version: 1, name: 'Classical Sanskrit', align: SANSKRIT,
      hide: ['punctuation', 'spacing', 'gemination', 'nasal', 'avagraha', 'sandhi'],
      note: 'Ignores the differences most editors of Sanskrit ignore: punctuation, nasals, gemination and external sandhi. Numerals stay, apart from verse numbers.' },
    { id: 'sa-epic', version: 1, name: 'Epic Sanskrit', align: SANSKRIT,
      hide: ['punctuation', 'spacing', 'gemination', 'nasal', 'avagraha'],
      note: 'Lines witnesses up as for Classical Sanskrit, but sandhi stays visible, since Sukthankar finds that epic emendations “concern merely metre and sandhi”.' },
    { id: 'sa-vedic', version: 1, name: 'Vedic (minimal)', align: ['verse-number', 'punct', 'spaces'],
      hide: ['punctuation', 'spacing'],
      note: 'Ignores only punctuation and spaces: accents, nasals and sandhi all stay as differences.' },
    { id: 'pra-jain', version: 1, name: 'Jain Prakrit', provisional: true, align: ['verse-number', 'punct', 'iast-anusvara', 'candrabindu', 'pk-nasal', 'avagraha-extra', 'spaces'],
      hide: ['punctuation', 'spacing', 'nasal', 'avagraha'],
      note: 'Provisional: not checked against published Prakrit editions. Ya-śruti and ṇ/n are never merged unless you declare them for a witness, because they are unsettled editorial questions.' },
    { id: 'any', version: 1, name: 'Any language: letters as written', align: ['raw', 'u-punct', 'spaces'],
      hide: ['punctuation', 'spacing'],
      note: 'For a text in any script: letters are compared as they are written, with no transliteration and none of the rules of Sanskrit. Only punctuation and spaces are ignored. Switch on capital and small letters, or marks such as vowel points and accents, if your edition ignores them too.' },
    { id: 'gu-old', version: 1, name: 'Old Gujarati', provisional: true, align: ['verse-number', 'punct', 'iast-anusvara', 'spaces'],
      hide: ['punctuation', 'spacing'],
      note: 'Provisional: not checked against published editions. Only punctuation and spaces are ignored; -ai/-e, -au/-o and nasal signs stay visible unless you switch them on.' },
  ];
  Norm.profile = (id) => Norm.PROFILES.find((p) => p.id === id) || Norm.PROFILES[0];

  // Tags whose text is in the manuscript but does not take part in the comparison.
  Norm.IGNORE_TAGS = ['surplus', 'pc', 'metamark', 'head', 'label', 'num', 'trailer', 'locus', 'rt'];

  Norm.suggestProfile = function (language) {
    const l = String(language || '').toLowerCase();
    if (/prakrit|prākṛt|ardhamāgadh/.test(l)) return 'pra-jain';
    if (/gujar/.test(l)) return 'gu-old';
    if (!l || /sanskrit|saṃskṛt|samskrit/.test(l)) return 'sa-classical';
    return 'any';
  };

  // The rules in force for an edition's settings, in running order.
  Norm.settings = function (norm) {
    const n = norm || {};
    const profile = Norm.profile(n.profile);
    const on = new Set(profile.align);
    for (const [id, v] of Object.entries(n.rules || {})) { if (v) on.add(id); else on.delete(id); }
    const hide = new Set(profile.hide);
    for (const [cls, v] of Object.entries(n.hide || {})) { if (v) hide.add(cls); else hide.delete(cls); }
    return { profile, on, hide, ignoreTags: n.ignoreTags || Norm.IGNORE_TAGS };
  };

  // A record of exactly what is in force, for the edition package and the printed preface.
  Norm.describe = function (norm) {
    const s = Norm.settings(norm);
    return {
      profile: s.profile.id, version: s.profile.version, name: s.profile.name, provisional: !!s.profile.provisional,
      ignoredTags: s.ignoreTags, hiddenInApparatus: Array.from(s.hide),
      rules: Norm.RULES.filter((r) => s.on.has(r.id)).map(({ id, name, cls, search, replace, source }) => ({ id, name, class: cls, search, replace, source })),
    };
  };

  function applyRule(st, rule, hits, raw) {
    const matches = Array.from(st.text.matchAll(rule.re));
    if (!matches.length) return st;
    let text = '', pos = 0;
    const at = [];
    const copy = (a, b) => { text += st.text.slice(a, b); for (let k = a; k < b; k++) at.push(st.at[k]); };
    for (const m of matches) {
      const a = m.index, b = a + m[0].length;
      const r = rule.fn ? rule.fn(m[0]) : rule.replace.replace(/\$(\d)/g, (_, k) => m[+k] || '');
      copy(pos, a);
      // what the match and its replacement share keeps its exact place in the manuscript
      let p = 0, s = 0;
      while (p < m[0].length && p < r.length && m[0][p] === r[p]) p++;
      while (s < m[0].length - p && s < r.length - p && m[0][m[0].length - 1 - s] === r[r.length - 1 - s]) s++;
      copy(a, a + p);
      const removed = m[0].length - p - s, inserted = r.slice(p, r.length - s);
      for (let k = 0; k < inserted.length; k++) { text += inserted[k]; at.push(st.at[a + p + Math.min(k, removed)]); }
      copy(b - s, b);
      pos = b;
      if (hits) hits.push({ rule: rule.id, from: st.at[a], to: st.at[b], before: raw ? m[0] : Norm.fromSlp(m[0]), after: raw ? r : Norm.fromSlp(r) });
    }
    copy(pos, st.text.length);
    at.push(st.at[st.text.length]);
    return { text, at };
  }

  /* Normalises one text. rules: Set of rule ids; declared: rule ids for this witness alone.
     -> {text, at, hits}; `text` has one character per sound (Norm.fromSlp makes it readable). */
  Norm.apply = function (dip, opts) {
    const o = opts || {};
    const raw = !!(o.rules && o.rules.has('raw'));
    let st = Norm.fromDiplomatic(dip, { skip: o.skip, gaps: o.gaps, raw });
    const hits = [];
    for (const rule of Norm.RULES) {
      if (rule.raw) continue;
      // the rules of Sanskrit act on Manuscribe's transliteration, and so not on letters as written
      if (raw && !rule.always && !/^u-|^spaces$/.test(rule.id)) continue;
      if (rule.always || o.rules.has(rule.id) || (o.declared && o.declared.includes(rule.id))) st = applyRule(st, rule, hits, raw);
    }
    hits.sort((a, b) => a.from - b.from);
    return { text: st.text, at: st.at, hits, raw };
  };

  // Letters as written: only what is skipped, invisible or lost is handled, and marks are decomposed so that a rule
  // can take them off. -> {text, at}
  function asWritten(dip, opts) {
    const skip = opts.skip || [];
    const gaps = (opts.gaps || []).slice().sort((a, b) => a.at - b.at);
    const out = [], at = [];
    let sk = 0, g = 0;
    for (let i = 0; i <= dip.length; i++) {
      while (g < gaps.length && gaps[g].at <= i) { for (let q = 0; q < (gaps[g].quantity || 1); q++) { out.push(Norm.GAP); at.push(gaps[g].at); } g++; }
      if (i === dip.length) break;
      while (sk < skip.length && skip[sk][1] <= i) sk++;
      if (sk < skip.length && skip[sk][0] <= i) continue;
      if (INVISIBLE.test(dip[i])) continue;
      for (const c of dip[i].normalize('NFD')) { out.push(c); at.push(i); }
    }
    at.push(dip.length);
    return { text: out.join(''), at };
  }

  // Do two readings count as the same? The declarations of both witnesses apply to both readings.
  Norm.sameReading = function (a, b, rules, declaredA, declaredB) {
    const declared = Array.from(new Set([...(declaredA || []), ...(declaredB || [])]));
    return Norm.apply(a, { rules, declared }).text === Norm.apply(b, { rules, declared }).text;
  };

  /* ---------- tokens ---------- */

  const C = 'kKgGṅcCjJñṭṬḍḌṇtTdDnpPbBmyrlvśṣshḻẏ';
  const V = 'aāiīuūoōeēEOṛṝ';
  const AKSARA = new RegExp('(?:[' + C + '](?!\\u0325))*(?:[' + V + ']|l\\u0325\\u0304?)[ṃḥḵ\\p{M}]*|(?:[' + C + '](?!\\u0325)\\p{M}*)+|\\s+|.', 'gu');

  Norm.TOKENIZERS = {
    letter: { label: 'Letters (consonants and vowels apart)', re: /\s+|\P{M}\p{M}*/gu },
    aksara: { label: 'Akṣaras', re: AKSARA },
    word: { label: 'Words, as spaced in the witness', re: /\s+|\S+/g, keepSpaces: true },
  };

  // Cuts normalised text into pieces, each with its stretch of diplomatic text: [{from, to, n}]
  Norm.split = function (st, kind) {
    const re = (Norm.TOKENIZERS[kind] || Norm.TOKENIZERS.letter).re;
    const out = [];
    let lead = null;
    for (const m of st.text.matchAll(re)) {
      // spaces and the like belong to the token before them; those before the first, to the first. A token of
      // nothing but a space would have no letters, and an aligner takes an empty token for a gap.
      if (!m[0].trim()) { if (out.length) out[out.length - 1].end = m.index + m[0].length; else if (lead === null) lead = m.index; continue; }
      out.push({ start: lead !== null && !out.length ? lead : m.index, end: m.index + m[0].length });
    }
    if (!out.length) return [{ from: 0, to: st.at[st.at.length - 1], slp: '', n: '' }];
    return out.map((t) => {
      const slp = st.text.slice(t.start, t.end).trim();
      return { from: st.at[t.start], to: st.at[t.end], slp, n: st.raw ? slp.normalize('NFC') : Norm.fromSlp(slp) };
    });
  };

  ME.Norm = Norm;
})(window.ME);
