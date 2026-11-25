'use strict';
/* Recognition in the browser: a folio side read from its pixels to the text of its rows, as the reference pipeline's
   run_page does it (manuscript_ocr's msocr/reference.py), with word spaces put in as the spacer's reference does
   (sanskrit_spacer/spacer_reference.py). The networks are functions handed in, so that the same code runs under Node
   in the tests and in the recognition worker (recogworker.js) with ONNX Runtime Web.

   run(page, layout, nets, pack, opts) -> {boxes: {box: [{baseline, outline, text, conf, spaced}]}, lines, times}
     page    {data, width, height, channels}: the side's pixels as read (grey, RGB or RGBA)
     layout  'linear' | 'tripatha' | 'panchapatha' (Manuscribe's own names are mapped by layoutOf)
     nets    {segment(x, h, W) -> Promise<Float32Array of 3 x h x W>,
              recognise(x, h, w) -> Promise<{data: Float32Array, T, C}>,
              space(ids: BigInt64Array, n) -> Promise<Float32Array of n logits>, only when spacing: the spacer
              as recogspace.js takes it, a window at a time (RecogSpace.ortNetwork); or spaceBatch([ids]) ->
              Promise<[logits]>, its windows run together (RecogSpace.ortBatchNetwork: for a spacer exported at a
              fixed length, where a window costs the whole length however few its letters)}
     pack    {P: pipeline.json, chars: the recogniser's characters, S: spacer.json, threshold: the spacer's,
              lm: the language model as RecogLM.mix gives it, or null: lines are then read with it (RecogLM.decode)}
     opts    {space: put in word spaces, progress(stage, k, n), untold: the lines segmented and the blocks they fall
              into found, the layout not given, and nothing read -> {untold: {box: rows}, lines, size, times}}
   `text` is the row as read, `conf` the mean probability of its letters (0-1); `spaced` the row with word spaces:
   each block's rows are spaced as one text, as the reference does, and the spaces given back to the rows, a space
   that falls between two rows ending the first (a row that ends in a space ends a word; one that does not runs on).

   layoutOf(name)       Manuscribe's layout name -> the reference's ('pancapatha' -> 'panchapatha'; interlinear and
                        anything else read as linear)
   splitSpaced(rows, spaced)   the spaced text of a block given back to its rows -> [row text] (null if the letters
                        do not match, which would be a bug: the rows are then left unspaced) */
(window.ME.recogModule = window.ME.recogModule || function (f) { (window.ME.recogSources = window.ME.recogSources || []).push(f); f(window.ME); })(function (ME) {
  const layoutOf = (name) => (name === 'pancapatha' || name === 'panchapatha' ? 'panchapatha' : name === 'tripatha' ? 'tripatha' : 'linear');

  function splitSpaced(rows, spaced) {
    const out = [];
    let pos = 0;
    for (let k = 0; k < rows.length; k++) {
      let line = '';
      for (const c of rows[k]) {
        if (/\s/.test(c)) continue;
        // whitespace before a row's first letter ends the row before it
        while (pos < spaced.length && /\s/.test(spaced[pos])) { if (line || !out.length) line += spaced[pos]; else out[out.length - 1] += spaced[pos]; pos++; }
        if (spaced[pos] !== c) return null;
        line += c; pos++;
      }
      out.push(line);
    }
    while (pos < spaced.length && /\s/.test(spaced[pos])) pos++;
    if (pos !== spaced.length) return null;
    // a row ends in one space at most, and begins with none
    return out.map((l) => l.replace(/^\s+/, '').replace(/\s+$/, (m) => (m ? ' ' : '')));
  }

  async function run(page, layout, nets, pack, opts) {
    opts = opts || {};
    const R = ME.RecogImage, V = ME.RecogVector, RR = ME.RecogRows, RD = ME.RecogRead;
    const { P, chars } = pack;
    const say = opts.progress || (() => {});
    const times = {}, t0 = Date.now();
    let t = t0;
    const lap = (k) => { const n = Date.now(); times[k] = n - t; t = n; };
    const { width: w, height: h, channels: ch } = page;
    const g = ch === 1 ? page.data : R.grey(page.data, w, h, ch);

    // the segmenter: the page in grey, ink high, at the segmenter's height, padded to a multiple of pad_to
    say('segment', 0, 1);
    const [sw, sh] = R.segmenterSize(w, h, P.segmenter.img_h);
    const small = R.resize(g, w, h, sw, sh);
    const W = Math.ceil(sw / P.segmenter.pad_to) * P.segmenter.pad_to;
    const x = new Float32Array(sh * W);
    for (let y = 0; y < sh; y++) for (let c = 0; c < sw; c++) x[y * W + c] = Math.fround(1 - Math.fround(small[y * sw + c] / 255));
    const raw = await nets.segment(x, sh, W);
    lap('segment');
    const m = V.maps(raw, sh, W, sw, P.segmenter);
    const lines = V.vectorize(m.pbase, m.up, m.down, sh, sw, P.segmenter.img_h / h, P.segmenter);
    // opts.untold: only the blocks the lines fall into, the layout not given (a manuscript's layout told from its sides)
    if (opts.untold) {
      const untold = RR.untold(lines, g, w, h, P);
      lap('rows');
      times.total = Date.now() - t0;
      say('done', 1, 1);
      return { untold, lines: lines.length, size: [w, h], times };
    }
    const rows = RR.rows(lines, g, w, h, layoutOf(layout), P);
    lap('rows');

    // every row cut out, read and decoded
    const boxes = {};
    const n = Object.values(rows).reduce((a, rs) => a + rs.length, 0);
    let done = 0;
    for (const box of Object.keys(rows)) {
      boxes[box] = [];
      for (const [baseline, outline] of rows[box]) {
        say('read', done, n);
        const xi = RD.input(RD.cut(page.data, w, h, ch, baseline, outline, P), P);
        const y = await nets.recognise(xi.data, xi.height, xi.width);
        const r = pack.lm ? ME.RecogLM.decode(y.data, y.T, y.C, chars, pack.lm, P.lm) : RD.decode(y.data, y.T, y.C, chars);
        boxes[box].push({ baseline, outline, text: r.text, conf: r.conf / 100, letters: r.letters, pcts: r.pcts });
        done++;
      }
    }
    lap('read');

    // word spaces, a block at a time
    if (opts.space && (nets.space || nets.spaceBatch) && ME.RecogSpace) {
      say('space', 0, 1);
      const S = pack.S;
      for (const box of Object.keys(boxes)) {
        const texts = boxes[box].map((r) => r.text);
        const spaced = nets.spaceBatch ? await ME.RecogSpace.spaceTextBatched(texts.join(''), nets.spaceBatch, S, pack.threshold) : await ME.RecogSpace.spaceText(texts.join(''), nets.space, S, pack.threshold);
        const back = splitSpaced(texts, spaced);
        boxes[box].forEach((r, k) => { r.spaced = back ? back[k] : r.text; });
        if (!back) boxes[box].unspaced = true;
      }
      lap('space');
    }
    times.total = Date.now() - t0;
    say('done', 1, 1);
    return { boxes, lines: lines.length, size: [w, h], times };
  }

  ME.RecogPage = { run, layoutOf, splitSpaced };
});
