'use strict';
/* Live transliteration while typing (ITRANS, Harvard-Kyoto, SLP1 -> Devanagari or IAST).
   The editor keeps the raw keys typed for the current word and re-converts the whole
   word on every key, replacing what it showed before. Because the output is always
   computed from the keys, nothing can be doubled, and Backspace removes the last key. */
(function (ME) {
  const SCHEMES = {
    off: { label: 'Off — type Unicode directly (or use your own keyboard / Keyman)' },
    'itrans-deva': { label: 'ITRANS → देवनागरी', short: 'ITRANS→देव' },
    'itrans-iast': { label: 'ITRANS → IAST', short: 'ITRANS→IAST' },
    'hk-deva': { label: 'Harvard-Kyoto → देवनागरी', short: 'HK→देव' },
    'hk-iast': { label: 'Harvard-Kyoto → IAST', short: 'HK→IAST' },
    'slp1-deva': { label: 'SLP1 → देवनागरी', short: 'SLP1→देव' },
    'slp1-iast': { label: 'SLP1 → IAST', short: 'SLP1→IAST' },
  };

  // Phonemes are identified by their IAST spelling.
  const CONS = {
    k: 'क', kh: 'ख', g: 'ग', gh: 'घ', 'ṅ': 'ङ', c: 'च', ch: 'छ', j: 'ज', jh: 'झ', 'ñ': 'ञ',
    'ṭ': 'ट', 'ṭh': 'ठ', 'ḍ': 'ड', 'ḍh': 'ढ', 'ṇ': 'ण', t: 'त', th: 'थ', d: 'द', dh: 'ध', n: 'न',
    p: 'प', ph: 'फ', b: 'ब', bh: 'भ', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', 'ś': 'श', 'ṣ': 'ष', s: 'स', h: 'ह', 'ḻ': 'ळ',
  };
  const VOW = { // [independent, sign]
    a: ['अ', ''], 'ā': ['आ', 'ा'], i: ['इ', 'ि'], 'ī': ['ई', 'ी'], u: ['उ', 'ु'], 'ū': ['ऊ', 'ू'],
    'ṛ': ['ऋ', 'ृ'], 'ṝ': ['ॠ', 'ॄ'], 'ḷ': ['ऌ', 'ॢ'], 'ḹ': ['ॡ', 'ॣ'], e: ['ए', 'े'], ai: ['ऐ', 'ै'], o: ['ओ', 'ो'], au: ['औ', 'ौ'],
  };
  const VIRAMA = '्';
  const O = (deva, iast) => ({ deva, iast });
  const DIGITS = {};
  '0123456789'.split('').forEach((d, i) => { DIGITS[d] = O('०१२३४५६७८९'[i], d); });
  // dandas: '..' and '.,' are quicker to reach than '|' and '||'
  const COMMON = Object.assign({ '|': O('।', '|'), '||': O('॥', '||'), '..': O('।', '|'), '.,': O('॥', '||') }, DIGITS);

  // raw -> ['v', id] | ['c', [ids]] | ['o', {deva, iast}]
  function table(vowels, cons, other) {
    const t = {};
    for (const [raw, id] of Object.entries(vowels)) t[raw] = ['v', id];
    for (const [raw, ids] of Object.entries(cons)) t[raw] = ['c', Array.isArray(ids) ? ids : [ids]];
    for (const [raw, o] of Object.entries(Object.assign({}, COMMON, other))) t[raw] = ['o', o];
    return t;
  }

  const TABLES = {
    itrans: table(
      { a: 'a', aa: 'ā', A: 'ā', i: 'i', ii: 'ī', I: 'ī', u: 'u', uu: 'ū', U: 'ū', RRi: 'ṛ', 'R^i': 'ṛ', RRI: 'ṝ', 'R^I': 'ṝ', LLi: 'ḷ', 'L^i': 'ḷ', LLI: 'ḹ', 'L^I': 'ḹ', e: 'e', ai: 'ai', o: 'o', au: 'au' },
      {
        k: 'k', kh: 'kh', g: 'g', gh: 'gh', '~N': 'ṅ', 'N^': 'ṅ', ch: 'c', c: 'c', Ch: 'ch', chh: 'ch', j: 'j', jh: 'jh', '~n': 'ñ', JN: 'ñ',
        T: 'ṭ', Th: 'ṭh', D: 'ḍ', Dh: 'ḍh', N: 'ṇ', t: 't', th: 'th', d: 'd', dh: 'dh', n: 'n', p: 'p', ph: 'ph', b: 'b', bh: 'bh', m: 'm',
        y: 'y', r: 'r', l: 'l', v: 'v', w: 'v', sh: 'ś', Sh: 'ṣ', shh: 'ṣ', s: 's', h: 'h', L: 'ḻ',
        x: ['k', 'ṣ'], kSh: ['k', 'ṣ'], GY: ['j', 'ñ'], dny: ['j', 'ñ'], 'j~n': ['j', 'ñ'],
      },
      {
        M: O('ं', 'ṃ'), '.n': O('ं', 'ṃ'), '.m': O('ं', 'ṃ'), H: O('ः', 'ḥ'), '.N': O('ँ', 'm̐'), '.a': O('ऽ', "'"), '.h': O(VIRAMA, ''),
        OM: O('ॐ', 'oṃ'), "\\'": O('॑', '́'), '\\_': O('॒', '̱'), '\\"': O('᳚', '̋'),
      }),
    hk: table(
      { a: 'a', A: 'ā', i: 'i', I: 'ī', u: 'u', U: 'ū', R: 'ṛ', RR: 'ṝ', lR: 'ḷ', lRR: 'ḹ', e: 'e', ai: 'ai', o: 'o', au: 'au' },
      {
        k: 'k', kh: 'kh', g: 'g', gh: 'gh', G: 'ṅ', c: 'c', ch: 'ch', j: 'j', jh: 'jh', J: 'ñ', T: 'ṭ', Th: 'ṭh', D: 'ḍ', Dh: 'ḍh', N: 'ṇ',
        t: 't', th: 'th', d: 'd', dh: 'dh', n: 'n', p: 'p', ph: 'ph', b: 'b', bh: 'bh', m: 'm', y: 'y', r: 'r', l: 'l', v: 'v', z: 'ś', S: 'ṣ', s: 's', h: 'h',
      },
      { M: O('ं', 'ṃ'), H: O('ः', 'ḥ'), '~': O('ँ', 'm̐'), "'": O('ऽ', "'") }),
    slp1: table(
      { a: 'a', A: 'ā', i: 'i', I: 'ī', u: 'u', U: 'ū', f: 'ṛ', F: 'ṝ', x: 'ḷ', X: 'ḹ', e: 'e', E: 'ai', o: 'o', O: 'au' },
      {
        k: 'k', K: 'kh', g: 'g', G: 'gh', N: 'ṅ', c: 'c', C: 'ch', j: 'j', J: 'jh', Y: 'ñ', w: 'ṭ', W: 'ṭh', q: 'ḍ', Q: 'ḍh', R: 'ṇ',
        t: 't', T: 'th', d: 'd', D: 'dh', n: 'n', p: 'p', P: 'ph', b: 'b', B: 'bh', m: 'm', y: 'y', r: 'r', l: 'l', v: 'v', S: 'ś', z: 'ṣ', s: 's', h: 'h', L: 'ḻ',
      },
      { M: O('ं', 'ṃ'), H: O('ः', 'ḥ'), '~': O('ँ', 'm̐'), "'": O('ऽ', "'") }),
  };
  const KEYS = {};
  const ALPHA = {};
  for (const [s, t] of Object.entries(TABLES)) {
    KEYS[s] = Object.keys(t).sort((a, b) => b.length - a.length);
    ALPHA[s] = new Set(Object.keys(t).join('').split(''));
  }

  function phonemes(scheme, raw) {
    const t = TABLES[scheme], keys = KEYS[scheme];
    const out = [];
    let i = 0;
    while (i < raw.length) {
      const k = keys.find((x) => raw.startsWith(x, i));
      if (!k) { out.push({ k: 'lit', s: raw[i] }); i++; continue; }
      const [kind, val] = t[k];
      if (kind === 'c') for (const id of val) out.push({ k: 'c', id });
      else if (kind === 'v') out.push({ k: 'v', id: val });
      else out.push({ k: 'o', o: val });
      i += k.length;
    }
    return out;
  }

  // Scribal gemination after repha: dharma -> dharmma, sarva -> sarvva
  function geminate(ph) {
    const out = [];
    for (let i = 0; i < ph.length; i++) {
      const p = ph[i], prev = out[out.length - 1];
      if (p.k === 'c' && prev && prev.k === 'c' && prev.id === 'r' && p.id !== 'r' && p.id !== 'h' && !(ph[i + 1] && ph[i + 1].k === 'c' && ph[i + 1].id === p.id)) out.push({ k: 'c', id: p.id });
      out.push(p);
    }
    return out;
  }

  function render(ph, deva) {
    let s = '';
    for (let i = 0; i < ph.length; i++) {
      const p = ph[i];
      if (p.k === 'lit') s += p.s;
      else if (p.k === 'o') s += deva ? p.o.deva : p.o.iast;
      else if (!deva) s += p.id;
      else if (p.k === 'v') s += VOW[p.id][0];
      else {
        s += CONS[p.id];
        const nx = ph[i + 1];
        if (nx && nx.k === 'v') { s += VOW[nx.id][1]; i++; } else s += VIRAMA;
      }
    }
    return s;
  }

  const Translit = {
    SCHEMES,
    // does this key belong to the scheme (and therefore to the word being typed)?
    isAlpha(mode, ch) {
      if (!mode || mode === 'off') return false;
      return ALPHA[mode.split('-')[0]].has(ch);
    },
    convert(mode, raw, opts) {
      const [scheme, out] = mode.split('-');
      let ph = phonemes(scheme, raw);
      if (opts && opts.geminate) ph = geminate(ph);
      return render(ph, out === 'deva');
    },
  };

  /* Text boxes marked data-translit (e.g. the text of a note or an addition in a tag dialog)
     use the same live input as the folio lines. getSettings() returns {translit, geminate}.
     A text box is left alone when its dialog sets the language to English. */
  const boxes = new WeakMap(); // input -> {raw, shown, pos}
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('sa', { granularity: 'grapheme' }) : null;
  // is `off` strictly inside an akṣara (e.g. between क and ि)?
  const insideCluster = (text, off) => {
    if (!segmenter || off <= 0 || off >= text.length) return false;
    for (const seg of segmenter.segment(text)) { if (seg.index === off) return false; if (seg.index > off) break; }
    return true;
  };
  const isBox = (el) => el && el.dataset && el.dataset.translit === '1';
  function nextAksaraEnd(text, off) {
    if (off >= text.length) return text.length;
    const ends = segmenter ? Array.from(segmenter.segment(text), (x) => x.index + x.segment.length) : Array.from(text, (c, k) => k + 1);
    let b = ends.find((e) => e > off) || text.length;
    while (b < text.length && /[\u094D\u200C\u200D]/.test(text[b - 1]) && /[\u0915-\u0939\u0958-\u095F\u0978-\u097F]/.test(text[b])) {
      b = ends.find((e) => e > b) || text.length;
    }
    return b;
  }

  Translit.attachToInputs = function (getSettings) {
    // ← → move, Shift+← → select, one character at a time - also inside an akṣara
    document.addEventListener('keydown', (e) => {
      const el = e.target;
      if (!isBox(el) || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      boxes.delete(el);
      const dir = e.key === 'ArrowRight' ? 1 : -1, len = el.value.length;
      const a = el.selectionStart, b = el.selectionEnd, back = el.selectionDirection === 'backward';
      if (e.shiftKey) {
        const anchor = a === b ? a : back ? b : a;
        const focus = Math.max(0, Math.min(len, (a === b ? a : back ? a : b) + dir));
        el.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus), focus < anchor ? 'backward' : 'forward');
      } else {
        // → over a whole akṣara (conjuncts included), ← one sign at a time
        const p = a !== b ? (dir < 0 ? a : b) : dir < 0 ? Math.max(0, a - 1) : nextAksaraEnd(el.value, a);
        el.setSelectionRange(p, p);
      }
    }, true);

    document.addEventListener('beforeinput', (e) => {
      const el = e.target;
      if (!isBox(el) || e.isComposing) return;
      const s = getSettings(el);
      // with the caret inside an akṣara the browser would act on the whole akṣara: do it by hand
      {
        const v = el.value, a = el.selectionStart;
        const tl = s && s.translit && s.translit !== 'off';
        if (a === el.selectionEnd && insideCluster(v, a) && (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward' ||
            (e.inputType === 'insertText' && e.data && !(tl && e.data.length === 1 && Translit.isAlpha(s.translit, e.data))))) {
          e.preventDefault();
          boxes.delete(el);
          let caret = a;
          if (e.inputType === 'deleteContentBackward') { el.value = v.slice(0, a - 1) + v.slice(a); caret = a - 1; }
          else if (e.inputType === 'deleteContentForward') el.value = v.slice(0, a) + v.slice(a + 1);
          else { el.value = v.slice(0, a) + e.data + v.slice(a); caret = a + e.data.length; }
          el.setSelectionRange(caret, caret);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }
      const mode = s && s.translit;
      const lang = el.closest('.modal') && el.closest('.modal').querySelector('[data-n="xml:lang"]');
      if (!mode || mode === 'off' || (lang && lang.value === 'en')) { boxes.delete(el); return; }
      const v = el.value, a = el.selectionStart, b = el.selectionEnd;
      let st = boxes.get(el);
      const continues = st && a === b && a === st.pos && v.slice(0, a).endsWith(st.shown);
      let raw;
      if (e.inputType === 'insertText' && e.data && e.data.length === 1 && Translit.isAlpha(mode, e.data)) {
        if (!continues) st = { raw: '', shown: '', pos: a };
        raw = st.raw + e.data;
      } else if (e.inputType === 'deleteContentBackward' && continues && st.raw) {
        raw = st.raw.slice(0, -1); // Backspace removes the last key typed
      } else {
        boxes.delete(el);
        return;
      }
      e.preventDefault();
      const out = raw ? Translit.convert(mode, raw, { geminate: !!s.geminate }) : '';
      const start = a - st.shown.length;
      el.value = v.slice(0, start) + out + v.slice(b);
      const caret = start + out.length;
      el.setSelectionRange(caret, caret);
      if (raw) boxes.set(el, { raw, shown: out, pos: caret }); else boxes.delete(el);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
  };

  ME.Translit = Translit;
})(window.ME);
