'use strict';
/* The language model when a line is read: how Sanskrit runs, letter by letter, weighed against the recogniser's doubt.
   The port of manuscript_ocr's msocr/lm.py, which builds the models and reads with them in the reference pipeline:
   the same files, the same search, the same text (held to it by the conformance test on the reference's fixtures).

   A model is a character 6-gram over the letters of the Devanagari block (daṇḍas, digits, marks and spaces are one
   boundary symbol, which it neither reads nor judges), its tables sorted integer keys read by a binary search, its
   probabilities in thousandths of a nat. A pack carries two (lexica: the lexica texts; own: the manuscripts'
   transcriptions), mixed by the weights its manifest gives. Reading is a prefix beam search over the recogniser's
   log-probabilities: a hypothesis scores log P(recogniser) + alpha * log P(LM) + beta * its letters (pipeline.json,
   "lm"); the letters of the reading are then aligned back to the columns, and each letter's confidence is the
   recogniser's own probability of it there.

   gunzip(bytes) -> Promise<Uint8Array>       a pack's lexica.bin.gz as bytes to load (DecompressionStream)
   load(bytes) -> model                       one model from its file (decompressed)
   mix([{model, weight}]) -> LM               the models mixed: LM.logp(ctx, s), LM.order, LM.symbol(ch)
   decode(logits, T, C, chars, LM, prm)       -> {text, conf, letters, pcts} as RecogRead.decode gives them, read with
                                              the LM; prm = pipeline.json's "lm" */
(window.ME.recogModule = window.ME.recogModule || function (f) { (window.ME.recogSources = window.ME.recogSources || []).push(f); f(window.ME); })(function (ME) {
  const NEG = -1e30, R = 128;      // 7 bits a symbol in a packed key: 7 symbols fit a double's exact integers

  async function gunzip(buf) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function load(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 12 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'MSLM') throw new Error('not a language model file');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const version = dv.getUint32(4, true), hlen = dv.getUint32(8, true);
    if (version !== 1) throw new Error('a language model file of version ' + version + '; this Manuscribe reads version 1');
    const h = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hlen)));
    if (h.bits !== 7 || h.order > 7) throw new Error('a language model this Manuscribe cannot read (order ' + h.order + ', ' + h.bits + ' bits a symbol)');
    let pos = 12 + hlen;
    const keys = (n, nb) => {
      const out = new Float64Array(n);
      for (let i = 0, o = pos; i < n; i++, o += nb) { let v = 0; for (let j = nb - 1; j >= 0; j--) v = v * 256 + u8[o + j]; out[i] = v; }
      pos += n * nb;
      return out;
    };
    const u16 = (n) => { const out = new Uint16Array(n); for (let i = 0, o = pos; i < n; i++, o += 2) out[i] = u8[o] | (u8[o + 1] << 8); pos += 2 * n; return out; };
    const tabs = [null];
    for (const o of h.orders) {
      const k = keys(o.entries, o.key_bytes), nlp = u16(o.entries), ck = keys(o.contexts, o.context_bytes), nbow = u16(o.contexts);
      tabs[o.k] = { keys: k, nlp, ck, nbow };
    }
    if (pos !== u8.length) throw new Error('a language model file of the wrong length');
    return { order: h.order, symbols: h.symbols, sym: new Map(h.symbols.map((s, i) => [s, i])), tabs, memo: new Map(), logA: Math.log(h.symbols.length), header: h };
  }

  function find(arr, v) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
    return lo < arr.length && arr[lo] === v ? lo : -1;
  }

  // log P(symbol s | ctx), ctx an array of symbol ids, most recent last: the longest n-gram known, backing off below it
  function logp(m, ctx, s) {
    const n = Math.min(m.order - 1, ctx.length);
    let h = 0;
    for (let i = ctx.length - n; i < ctx.length; i++) h = h * R + ctx[i];
    const key = (h * R + s) * 8 + n;        // n too: (0, s1) and (s1,) pack to the same integer
    const hit = m.memo.get(key);
    if (hit !== undefined) return hit;
    let acc = 0, v;
    for (let k = n + 1; k >= 1; k--) {
      const hk = k > 1 ? h % Math.pow(R, k - 1) : 0, t = m.tabs[k];
      const i = find(t.keys, hk * R + s);
      if (i >= 0) { v = acc - t.nlp[i] / 1000; break; }
      const j = find(t.ck, hk);
      if (j >= 0) acc -= t.nbow[j] / 1000;
    }
    if (v === undefined) v = acc - m.logA;
    if (m.memo.size > 500000) m.memo.clear();
    m.memo.set(key, v);
    return v;
  }

  function mix(parts) {
    const tot = parts.reduce((a, p) => a + p.weight, 0);
    const ps = parts.map((p) => ({ m: p.model, w: p.weight / tot }));
    const order = Math.max.apply(null, ps.map((p) => p.m.order)), memo = new Map(), sym = ps[0].m.sym;
    const one = ps.length === 1;
    return {
      order,
      symbols: ps[0].m.symbols,
      symbol: (ch) => { const s = sym.get(ch); return s === undefined ? 0 : s; },
      logp: (ctx, s) => {
        if (one) return logp(ps[0].m, ctx, s);
        const n = Math.min(order - 1, ctx.length);
        let h = 0;
        for (let i = ctx.length - n; i < ctx.length; i++) h = h * R + ctx[i];
        const key = (h * R + s) * 8 + n, hit = memo.get(key);
        if (hit !== undefined) return hit;
        let sum = 0;
        for (const p of ps) sum += p.w * Math.exp(logp(p.m, ctx, s));
        const v = Math.log(sum);
        if (memo.size > 500000) memo.clear();
        memo.set(key, v);
        return v;
      },
    };
  }

  function lse(a, b) {
    if (a < b) { const t = a; a = b; b = t; }
    return b <= NEG ? a : a + Math.log1p(Math.exp(b - a));
  }

  // every column's log-softmax, T x C, in doubles
  function logSoftmax(logits, T, C) {
    const lp = new Float64Array(T * C);
    for (let t = 0; t < T; t++) {
      const o = t * C;
      let m = -Infinity;
      for (let c = 0; c < C; c++) if (logits[o + c] > m) m = logits[o + c];
      let s = 0;
      for (let c = 0; c < C; c++) s += Math.exp(logits[o + c] - m);
      const ls = Math.log(s);
      for (let c = 0; c < C; c++) lp[o + c] = logits[o + c] - m - ls;
    }
    return lp;
  }

  // -> the best prefix, an array of classes (as msocr/lm.py's beam_search, step for step)
  function beamSearch(lp, T, C, chars, LM, prm) {
    const rep = Math.log(prm.boundary_repeat), nCtx = LM.order - 1;
    const sym = [0];
    for (const ch of chars) sym.push(LM.symbol(ch));
    let beams = new Map([['', [0, NEG]]]);          // prefix (its classes as a string) -> [log p ending blank, ending non-blank]
    let state = new Map([['', { total: 0, ctx: [] }]]);
    for (let t = 0; t < T; t++) {
      const o = t * C, cands = [];
      for (let c = 1; c < C; c++) if (lp[o + c] > prm.prune) cands.push(c);
      const nxt = new Map();
      for (const [prefix, pr] of beams) {
        const pb = pr[0], pnb = pr[1], ptot = lse(pb, pnb);
        let e = nxt.get(prefix);
        if (!e) { e = [NEG, NEG]; nxt.set(prefix, e); }
        e[0] = lse(e[0], ptot + lp[o]);
        const last = prefix.length ? prefix.charCodeAt(prefix.length - 1) : -1;
        for (const c of cands) {
          const nw = prefix + String.fromCharCode(c);
          let nn = nxt.get(nw);
          if (!nn) { nn = [NEG, NEG]; nxt.set(nw, nn); }
          if (c === last) { e[1] = lse(e[1], pnb + lp[o + c]); nn[1] = lse(nn[1], pb + lp[o + c]); } else nn[1] = lse(nn[1], ptot + lp[o + c]);
          if (!state.has(nw)) {
            const st = state.get(prefix), s = sym[c];
            let lpl, nctx;
            if (s === 0) { lpl = st.ctx.length && st.ctx[st.ctx.length - 1] === 0 ? rep : LM.logp(st.ctx, 0); nctx = [0]; } else { lpl = LM.logp(st.ctx, s); nctx = st.ctx.concat([s]).slice(-nCtx); }
            state.set(nw, { total: st.total + lpl, ctx: nctx });
          }
        }
      }
      const scored = [];
      for (const [p, v] of nxt) scored.push([p, v, lse(v[0], v[1]) + prm.alpha * state.get(p).total + prm.beta * p.length]);
      scored.sort((x, y) => y[2] - x[2]);
      const kept = new Map(), keep = new Map();
      for (let i = 0; i < scored.length && i < prm.beam; i++) { kept.set(scored[i][0], scored[i][1]); keep.set(scored[i][0], state.get(scored[i][0])); }
      beams = kept;
      state = keep;
    }
    let best = '', bestScore = -Infinity;
    for (const [p, v] of beams) { const sc = lse(v[0], v[1]) + prm.alpha * state.get(p).total + prm.beta * p.length; if (sc > bestScore) { bestScore = sc; best = p; } }
    return Array.from(best, (ch) => ch.charCodeAt(0));
  }

  // the best alignment of the reading on the columns -> each letter's probability (the highest over its columns)
  function align(lp, T, C, classes) {
    const L = classes.length;
    if (!L) return [];
    const ext = [0];
    for (const c of classes) ext.push(c, 0);
    const S = ext.length, dp = new Float64Array(T * S).fill(NEG), back = new Int32Array(T * S);
    dp[0] = lp[0];
    dp[1] = lp[ext[1]];
    for (let t = 1; t < T; t++) {
      const po = (t - 1) * S, o = t * S, lo = t * C;
      for (let s = 0; s < S; s++) {
        let best = dp[po + s], arg = s;
        if (s >= 1 && dp[po + s - 1] > best) { best = dp[po + s - 1]; arg = s - 1; }
        if (s >= 2 && ext[s] !== 0 && ext[s] !== ext[s - 2] && dp[po + s - 2] > best) { best = dp[po + s - 2]; arg = s - 2; }
        dp[o + s] = best + lp[lo + ext[s]];
        back[o + s] = arg;
      }
    }
    let s = dp[(T - 1) * S + S - 1] >= dp[(T - 1) * S + S - 2] ? S - 1 : S - 2;
    const probs = new Array(L).fill(0);
    for (let t = T - 1; t >= 0; t--) {
      if (ext[s] !== 0) { const i = (s - 1) >> 1; probs[i] = Math.max(probs[i], Math.exp(lp[t * C + ext[s]])); }
      s = back[t * S + s];
    }
    return probs;
  }

  function decode(logits, T, C, chars, LM, prm) {
    const lp = logSoftmax(logits, T, C);
    const best = beamSearch(lp, T, C, chars, LM, prm);
    const probs = align(lp, T, C, best);
    let text = '', letters = '', pcts = '', sum = 0;
    best.forEach((c, k) => {
      const ch = chars[c - 1], p = probs[k];
      text += ch;
      sum += p;
      letters += String(Math.min(9, Math.floor(10 * p))).repeat(ch.length);
      pcts += String(Math.min(99, Math.floor(100 * p))).padStart(2, '0').repeat(ch.length);
    });
    return { text, conf: 100 * (best.length ? sum / best.length : 0), letters, pcts };
  }

  ME.RecogLM = { gunzip, load, mix, logp, decode, beamSearch, align, logSoftmax };
});
