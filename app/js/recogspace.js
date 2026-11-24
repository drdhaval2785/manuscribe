'use strict';
/* Word spaces in Devanagari text, in the browser: the Sanskrit word spacer's reference pipeline
   (sanskrit_spacer/spacer_reference.py), function by function. Checked against the reference's fixtures by
   tests/t-recog-spacer.js.

   units(run, S)                        a run's orthographic units -> [[devanagari, slp1], ...]: a consonant with its
                                        nukta, virama or vowel sign, or any other character, each with any candrabindu,
                                        anusvāra and visarga after it; null (the run left as it is) if the SLP1 is empty
                                        or leaves the 52-letter alphabet
   letterIds(slp, S)                    the network's ids of SLP1 letters (alphabet position + 2; unk_id otherwise)
   probabilities(slp, network, S)       async: the sigmoid of the network's logit for every letter (Float64Array); a run
                                        longer than max_len in windows of max_len every window_step letters, the first
                                        window kept up to window_keep[1], the last from window_keep[0], the others
                                        between, a letter taken from the first window that keeps it
   spaceRun(run, network, threshold, S) async: a space after every unit but the last where the probability at its last
                                        letter reaches the threshold
   spacePunctuation(s, S)               one space on each side of every run of dandas or digits, where there is no
                                        whitespace (Python's str.isspace) and not at the ends
   spaceText(text, network, S, threshold = S.threshold, punct = true)   async: spaces and tabs between run characters
                                        taken out, every run spaced, then the punctuation
   spaceTextBatched(text, batchNetwork, S, threshold, punct, size)   async: the same, the windows run `size` at a time
   ortBatchNetwork(ort, session, S, fixed)   the batch network of an ONNX Runtime (Web) session: async ([ids]) -> [logits]
   ortNetwork(ort, session, S, fixed)   the network of an ONNX Runtime (Web) session of spacer.onnx, exported at the
                                        fixed length max_len: ids padded with pad_id, logits cut back to n
   S is the parsed spacer.json (its tables and parameters). A network is an async function (ids: BigInt64Array, n) ->
   Float32Array of n logits; the runs are spaced one after another, never two calls at once. Text is read by code
   point, as Python reads it. */
(window.ME.recogModule = window.ME.recogModule || function (f) { (window.ME.recogSources = window.ME.recogSources || []).push(f); f(window.ME); })(function (ME) {
  const prepared = new WeakMap();

  // what Python builds once from spacer.json at import: lookups, the alphabet, and the regular expressions
  function prep(S) {
    let T = prepared.get(S);
    if (T) return T;
    if (S.version !== 1) throw new Error('spacer.json version ' + S.version + ': this port follows version 1');
    const map = (o) => new Map(Object.entries(o));
    const cls = S.run_ranges.map(([a, b]) => '\\u{' + a.toString(16) + '}-\\u{' + b.toString(16) + '}').join('');
    T = {
      cons: map(S.consonant_base), nukta: map(S.consonant_nukta), sign: map(S.vowel_sign), mod: map(S.modifier),
      other: map(S.other), alpha: new Set(S.alphabet),
      idx: new Map(Array.from(S.alphabet, (c, i) => [c, i + 2])),
      punct: new Set(S.punctuation.dandas + S.punctuation.digits),
      run: new RegExp('[' + cls + ']+', 'gu'),
      wsBetween: new RegExp('(?<=[' + cls + '])[ \\t]+(?=[' + cls + '])', 'gu'),
    };
    prepared.set(S, T);
    return T;
  }

  // a dict lookup that fails as Python's does (a KeyError), not with undefined
  function get(m, k, what) {
    const v = m.get(k);
    if (v === undefined) throw new Error('spacer.json has no ' + what + ' for U+' + k.codePointAt(0).toString(16).toUpperCase());
    return v;
  }

  function units(run, S) {
    const T = prep(S), c = Array.from(run), n = c.length, out = [];
    let i = 0;
    while (i < n) {
      let j = i + 1, x;
      if (T.cons.has(c[i])) {
        let base = T.cons.get(c[i]), vow;
        if (j < n && c[j] === S.nukta) { base = get(T.nukta, c[i], 'nukta form'); j++; }
        if (j < n && c[j] === S.virama) { vow = ''; j++; }
        else if (j < n && T.sign.has(c[j])) { vow = T.sign.get(c[j]); j++; }
        else vow = S.inherent;
        x = base + vow;
      } else {
        x = get(T.other, c[i], 'letter');
      }
      while (j < n && T.mod.has(c[j])) { x += T.mod.get(c[j]); j++; }
      out.push([c.slice(i, j).join(''), x]);
      i = j;
    }
    const s = out.map((u) => u[1]).join('');
    if (!s || Array.from(s).some((ch) => !T.alpha.has(ch))) return null;
    return out;
  }

  function letterIds(slp, S) {
    const T = prep(S);
    return BigInt64Array.from(Array.from(slp), (c) => BigInt(T.idx.has(c) ? T.idx.get(c) : S.unk_id));
  }

  async function probabilities(slp, network, S) {
    const c = Array.from(slp), n = c.length, L = S.max_len;
    const sig = (z) => 1 / (1 + Math.exp(-z));                 // in float64, as numpy does it
    if (n <= L) return Float64Array.from(await network(letterIds(slp, S), n), sig);
    const step = S.window_step, [keep0, keep1] = S.window_keep;
    const wins = [];
    for (let a = 0; a <= n - L; a += step) wins.push([a, a + L]);
    wins.push([n - L, n]);                                     // the last window ends with the run (it may repeat one)
    const out = new Float64Array(n), set = new Uint8Array(n);
    for (let k = 0; k < wins.length; k++) {
      const [a, b] = wins[k];
      const z = await network(letterIds(c.slice(a, b).join(''), S), b - a);
      const [lo, hi] = k === 0 ? [0, keep1] : k === wins.length - 1 ? [keep0, L] : [keep0, keep1];
      for (let i = lo; i < Math.min(hi, z.length); i++) {
        if (!set[a + i]) { out[a + i] = sig(z[i]); set[a + i] = 1; }
      }
    }
    return out;
  }

  async function spaceRun(run, network, threshold, S) {
    const u = units(run, S);
    if (u === null) return run;
    const p = await probabilities(u.map((x) => x[1]).join(''), network, S);
    const out = [];
    let pos = 0;
    for (let k = 0; k < u.length; k++) {
      out.push(u[k][0]);
      pos += Array.from(u[k][1]).length;
      // p[pos - 1] as Python indexes it: a unit with no letters (a stray virama) at the start of a run reads p[-1],
      // the run's last letter
      if (k < u.length - 1 && p.at(pos - 1) >= threshold) out.push(' ');
    }
    return out.join('');
  }

  const TOKENS = /[।॥]+|[०-९0-9]+|[^।॥०-९0-9]+/gu;
  // Python's str.isspace: JavaScript's \s without U+FEFF, with U+001C-001F and U+0085
  const SPACE = /^[\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/;
  const first = (t) => String.fromCodePoint(t.codePointAt(0));
  const last = (t) => {
    const lo = t.charCodeAt(t.length - 1);
    return t.length > 1 && lo >= 0xdc00 && lo <= 0xdfff && t.codePointAt(t.length - 2) > 0xffff ? t.slice(-2) : t.slice(-1);
  };

  function spacePunctuation(s, S) {
    const P = prep(S).punct, toks = s.match(TOKENS) || [], out = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (k) {
        const a = last(toks[k - 1]), b = first(t);
        if ((P.has(b) || P.has(a)) && !SPACE.test(b) && !SPACE.test(a)) out.push(' ');
      }
      out.push(t);
    }
    return out.join('');
  }

  async function spaceText(text, network, S, threshold = S.threshold, punct = true) {
    const T = prep(S);
    text = text.replace(T.wsBetween, '');
    let out = '', end = 0;
    for (const m of text.matchAll(T.run)) {                    // re.sub with a function, one run at a time
      out += text.slice(end, m.index) + await spaceRun(m[0], network, threshold, S);
      end = m.index + m[0].length;
    }
    text = out + text.slice(end);
    return punct ? spacePunctuation(text, S) : text;
  }

  // fixed: the length a spacer exported at a fixed length takes (the first packs: max_len), ids padded to it; null
  // for a spacer that takes any length up to max_len, given the letters as they are (the manifest's input shape says)
  function ortNetwork(ort, session, S, fixed = S.max_len) {
    const input = session.inputNames[0], output = session.outputNames[0];
    return async (ids, n) => {
      if (n > S.max_len) throw new Error('the spacer takes at most ' + S.max_len + ' letters at a time, not ' + n);
      const L = fixed || n, x = new BigInt64Array(L).fill(BigInt(S.pad_id));
      x.set(ids.subarray(0, n));
      const r = await session.run({ [input]: new ort.Tensor('int64', x, [1, L]) });
      return r[output].data.slice(0, n);
    };
  }

  /* spaceText with the network's windows run together, `size` at a time (the exported spacer takes a batch): the
     windows are found first, as they depend on the text alone, run in batches, and the text then spaced with their
     logits. Under Node on one thread a page's text took 5 s a window at a time. batchNetwork: async ([ids]) ->
     [Float32Array of logits, one per window] */
  async function spaceTextBatched(text, batchNetwork, S, threshold = S.threshold, punct = true, size = 16) {
    const key = (ids, n) => Array.prototype.join.call(ids.subarray(0, n), ',');
    const got = new Map(), todo = [];
    await spaceText(text, async (ids, n) => {
      const k = key(ids, n);
      if (!got.has(k)) { got.set(k, null); todo.push(ids.slice(0, n)); }
      return new Float32Array(n);
    }, S, threshold, punct);
    for (let i = 0; i < todo.length; i += size) {
      const part = todo.slice(i, i + size), out = await batchNetwork(part);
      part.forEach((ids, j) => got.set(key(ids, ids.length), out[j]));
    }
    return spaceText(text, async (ids, n) => got.get(key(ids, n)), S, threshold, punct);
  }

  // the batch network of an ONNX Runtime (Web) session of spacer.onnx: every window padded to the fixed length, or,
  // for a spacer of any length (fixed null), to the batch's longest
  function ortBatchNetwork(ort, session, S, fixed = S.max_len) {
    const input = session.inputNames[0], output = session.outputNames[0];
    return async (list) => {
      const L = fixed || Math.max(...list.map((ids) => ids.length));
      const x = new BigInt64Array(list.length * L).fill(BigInt(S.pad_id));
      list.forEach((ids, j) => { if (ids.length > S.max_len) throw new Error('the spacer takes at most ' + S.max_len + ' letters at a time'); x.set(ids, j * L); });
      const y = (await session.run({ [input]: new ort.Tensor('int64', x, [list.length, L]) }))[output].data;
      return list.map((ids, j) => y.slice(j * L, j * L + ids.length));
    };
  }

  ME.RecogSpace = { units, letterIds, probabilities, spaceRun, spacePunctuation, spaceText, ortNetwork, spaceTextBatched, ortBatchNetwork };
});
