'use strict';
/* Text from handwriting or print recognition (PAGE-XML, ALTO), or from any other program, AI included, as plain
   text: brought in as proposed lines, never over what you have typed. A proposed line shows in the folio to be
   read and corrected; until you accept it, it is not collated (it counts as text not yet read). What it was is
   kept, so the error rate of each source is measured on the lines you have corrected.

   Manuscribe calls no AI service. Output of one is brought in like any other, with its model, version, date and a
   hash of its prompt; and before it may be accepted a folio at a time, it must pass a test of whether it keeps the
   manuscript's own readings or writes the text it already knows. */
(function (ME) {
  const { U, TEI, Model, Norm } = ME;
  const H = {};

  /* ---------- reading the files ---------- */

  const kids = (el, name) => Array.from(el.children).filter((c) => c.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const all = (el, name) => Array.from(el.getElementsByTagNameNS('*', name));

  /* -> {format, pages: [{image, width, height, regions: [{id, type, lines: [{text, conf}]}]}], meta: {software, version, date, note}} */
  H.parse = function (name, text) {
    const t = String(text || '');
    if (!/^\s*</.test(t)) {
      // plain text: a line for each line; a form feed, or a line of three dashes, starts the next page
      const pages = t.replace(/\r/g, '').split(/\f|\n-{3,}\s*\n/).map((chunk) => ({ image: '', regions: [{ id: 'r1', type: '', lines: chunk.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => ({ text: x, conf: null })) }] }));
      return { format: 'text', pages: pages.filter((p) => p.regions[0].lines.length), meta: {} };
    }
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('this is not well-formed XML');
    const root = doc.documentElement;
    if (root.localName === 'PcGts') return parsePage(root);
    if (root.localName === 'alto') return parseAlto(root);
    throw new Error('this is neither PAGE-XML nor ALTO');
  };

  function parsePage(root) {
    const md = kid(root, 'Metadata');
    const txt = (el, n) => { const x = el && kid(el, n); return x ? x.textContent.trim() : ''; };
    const meta = { software: txt(md, 'Creator'), version: '', date: txt(md, 'LastChange') || txt(md, 'Created'), note: txt(md, 'Comments') };
    const pages = all(root, 'Page').map((pg) => {
      // reading order, where it is given; else as in the file
      const order = new Map();
      all(pg, 'RegionRefIndexed').forEach((r) => order.set(r.getAttribute('regionRef'), +r.getAttribute('index')));
      const regions = all(pg, 'TextRegion').filter((r) => !r.parentNode || r.parentNode.localName !== 'TextRegion').map((r, k) => {
        const lines = kids(r, 'TextLine').map((l) => {
          const eq = kids(l, 'TextEquiv');
          const best = eq.sort((a, b) => (+a.getAttribute('index') || 0) - (+b.getAttribute('index') || 0))[0];
          const uni = best && kid(best, 'Unicode');
          return { text: uni ? uni.textContent.replace(/\s+/g, ' ').trim() : '', conf: best && best.getAttribute('conf') !== null ? +best.getAttribute('conf') : null };
        });
        const custom = r.getAttribute('custom') || '';
        return { id: r.getAttribute('id') || 'r' + (k + 1), type: r.getAttribute('type') || ((custom.match(/structure\s*\{\s*type:\s*([^;}]+)/) || [])[1] || '').trim(), lines, at: order.has(r.getAttribute('id')) ? order.get(r.getAttribute('id')) : 1000 + k };
      }).sort((a, b) => a.at - b.at);
      return { image: pg.getAttribute('imageFilename') || '', width: +pg.getAttribute('imageWidth') || null, height: +pg.getAttribute('imageHeight') || null, regions };
    });
    return { format: 'PAGE', pages, meta };
  }

  function parseAlto(root) {
    const sw = all(root, 'processingSoftware')[0];
    const step = all(root, 'ocrProcessingStep')[0] || all(root, 'processingStep')[0];
    const val = (el, n) => { const x = el && all(el, n)[0]; return x ? x.textContent.trim() : ''; };
    const meta = { software: [val(sw, 'softwareCreator'), val(sw, 'softwareName')].filter(Boolean).join(' '), version: val(sw, 'softwareVersion'), date: val(step, 'processingDateTime'), note: val(step, 'processingStepSettings') };
    const file = val(root, 'fileName');
    const pages = all(root, 'Page').map((pg, k) => ({
      image: k === 0 ? file : '', width: +pg.getAttribute('WIDTH') || null, height: +pg.getAttribute('HEIGHT') || null,
      regions: all(pg, 'TextBlock').map((b, j) => ({
        id: b.getAttribute('ID') || 'b' + (j + 1), type: '',
        lines: kids(b, 'TextLine').map((l) => {
          let s = '';
          const confs = [];
          for (const c of Array.from(l.children)) {
            if (c.localName === 'String') { s += c.getAttribute('CONTENT') || ''; if (c.getAttribute('WC') !== null) confs.push(+c.getAttribute('WC')); }
            else if (c.localName === 'SP') s += ' ';
            else if (c.localName === 'HYP') s += c.getAttribute('CONTENT') || '-';
          }
          return { text: s.replace(/\s+/g, ' ').trim(), conf: confs.length ? confs.reduce((a, x) => a + x, 0) / confs.length : null };
        }),
      })),
    }));
    return { format: 'ALTO', pages, meta };
  }

  /* ---------- sources ---------- */

  H.KINDS = { htr: 'handwriting recognition', ocr: 'print recognition', ai: 'an AI model (a large language or vision model)', other: 'another program' };

  H.hash = async function (s) {
    if (!s || !window.crypto || !crypto.subtle) return null;
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  };

  // A source: {id, kind, software, model, version, date, promptHash, file, format, added}
  H.addSource = function (p, s) {
    if (s.kind === 'ai' && (!s.model || !s.version || !s.date)) throw new Error('For AI output, give the model, its version and the date it was made');
    p.sources = p.sources || [];
    const id = 'src' + (p.sources.length + 1);
    const src = Object.assign({ id, added: new Date().toISOString() }, s);
    p.sources.push(src);
    return src;
  };
  H.source = (p, id) => (p.sources || []).find((s) => s.id === id) || null;
  H.describe = (s) => [s.model || s.software || 'Unnamed program', s.version ? 'version ' + s.version : '', s.date ? s.date.slice(0, 10) : '', s.kind === 'ai' && s.promptHash ? 'prompt SHA-256 ' + s.promptHash.slice(0, 12) + '…' : ''].filter(Boolean).join(', ');

  /* ---------- placing proposed lines ---------- */

  const entryOf = (pg, box, i) => pg && pg.proposed && pg.proposed[box] && pg.proposed[box][i];
  H.pending = (pg, box, i) => { const e = entryOf(pg, box, i); return !!e && !e.accepted; };

  /* Puts the pages' lines into folios. plan: {labels: [label for each page], boxes: [box for each region index], src}.
     A line that already has text is left alone. -> {placed, skipped, folios} */
  H.place = function (p, parsed, plan) {
    const out = { placed: 0, skipped: 0, folios: [] };
    parsed.pages.forEach((page, k) => {
      const label = plan.labels[k];
      if (!label) return;
      if (!p.pages[label]) p.pages[label] = { boxes: {} };
      const pg = p.pages[label];
      pg.boxes = pg.boxes || {};
      const next = {};
      page.regions.forEach((r, j) => {
        const box = plan.boxes[j] || plan.boxes[plan.boxes.length - 1] || 'main';
        const arr = pg.boxes[box] || (pg.boxes[box] = []);
        if (next[box] === undefined) next[box] = 0;
        for (const l of r.lines) {
          // line k of the region goes to line k of the box, so that lines stay where they are on the page
          const i = next[box]++;
          if (!l.text) continue;
          if (TEI.hasContent(arr[i])) { out.skipped++; continue; }
          while (arr.length < i) arr.push('');
          const tei = U.escXml(l.text);
          arr[i] = tei;
          pg.proposed = pg.proposed || {};
          pg.proposed[box] = pg.proposed[box] || {};
          pg.proposed[box][i] = { text: tei, src: plan.src, conf: l.conf };
          out.placed++;
        }
        const n = (pg.lines && pg.lines[box]) || p.layout.lines[box] || 0;
        if (arr.length > n) { pg.lines = pg.lines || {}; pg.lines[box] = arr.length; }
      });
      out.folios.push(label);
    });
    return out;
  };

  // Accepts a line as read: what it says now is kept beside what was proposed.
  H.accept = function (p, label, box, i) {
    const pg = p.pages[label];
    const e = entryOf(pg, box, i);
    if (!e || e.accepted) return false;
    e.accepted = Date.now();
    e.final = (pg.boxes[box] || [])[i] || '';
    return true;
  };
  H.pendingOn = function (p, label) {
    const pg = p.pages[label];
    const out = [];
    for (const [box, lines] of Object.entries((pg && pg.proposed) || {})) for (const [i, e] of Object.entries(lines)) if (!e.accepted) out.push({ box, i: +i, src: e.src });
    return out;
  };

  /* ---------- measuring ---------- */

  // edit distance over code points
  function distance(a, b) {
    const x = Array.from(a), y = Array.from(b);
    let prev = new Array(y.length + 1), cur = new Array(y.length + 1);
    for (let j = 0; j <= y.length; j++) prev[j] = j;
    for (let i = 1; i <= x.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[y.length];
  }
  H.distance = distance;
  const plain = (tei) => TEI.plainText(tei || '').normalize('NFC').replace(/\s+/g, ' ').trim();

  /* For each source: lines proposed, accepted, and the character error rate of what it proposed against what you
     accepted. -> [{src, proposed, accepted, chars, errors, cer}] */
  H.stats = function (p) {
    const by = new Map((p.sources || []).map((s) => [s.id, { src: s, proposed: 0, accepted: 0, chars: 0, errors: 0, cer: null }]));
    for (const pg of Object.values(p.pages)) for (const lines of Object.values(pg.proposed || {})) for (const e of Object.values(lines)) {
      const r = by.get(e.src);
      if (!r) continue;
      r.proposed++;
      if (!e.accepted) continue;
      r.accepted++;
      const f = plain(e.final), o = plain(e.text);
      r.chars += Array.from(f).length;
      r.errors += distance(o, f);
    }
    for (const r of by.values()) r.cer = r.chars ? r.errors / r.chars : null;
    return [...by.values()];
  };

  /* Whether a source writes what the manuscript has, or the text it already knows. reference: the same passage
     as printed (a vulgate). Where the corrected lines differ from it, the source's own proposal there either kept the
     manuscript's reading, wrote the printed one (memorised), or something else. -> {places, kept, memorised, other,
     pass, tested} */
  H.deviationTest = function (p, srcId, reference) {
    const truth = [], output = [];
    for (const label of Object.keys(p.pages)) {
      const pg = p.pages[label];
      for (const [box, lines] of Object.entries(pg.proposed || {})) for (const i of Object.keys(lines).map(Number).sort((a, b) => a - b)) {
        const e = lines[i];
        if (e.src !== srcId || !e.accepted) continue;
        truth.push(plain(e.final)); output.push(plain(e.text));
      }
    }
    const words = (s) => s.split(/\s+/).filter(Boolean);
    const key = (w) => Norm.fromDiplomatic(w).text.replace(/[|.,;:'"()\-\s]/g, '');
    const T = words(truth.join(' ')), O = words(output.join(' ')), R = words(String(reference || ''));
    const align = (A, B) => {
      // global alignment of words, each pair matching only if the same after normalisation
      const n = A.length, m = B.length;
      const ka = A.map(key), kb = B.map(key);
      const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
      for (let i = 0; i <= n; i++) D[i][0] = i;
      for (let j = 0; j <= m; j++) D[0][j] = j;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (ka[i - 1] === kb[j - 1] ? 0 : 1));
      const at = new Array(n).fill(-1), extra = []; // extra: [after A index, B index]
      let i = n, j = m;
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (ka[i - 1] === kb[j - 1] ? 0 : 1)) { at[i - 1] = j - 1; i--; j--; }
        else if (i > 0 && D[i][j] === D[i - 1][j] + 1) i--;
        else { extra.push([i - 1, j - 1]); j--; }
      }
      return { at, extra, ka, kb };
    };
    if (T.length < 20) return { tested: false, why: 'Accept at least 20 words of this source’s lines first', places: [], kept: 0, memorised: 0, other: 0, pass: false };
    if (R.length < 20) return { tested: false, why: 'Give the printed text of the same passage', places: [], kept: 0, memorised: 0, other: 0, pass: false };
    const tr = align(T, R), to = align(T, O);
    const places = [];
    for (let t = 0; t < T.length; t++) {
      const r = tr.at[t];
      if (r >= 0 && tr.ka[t] === tr.kb[r]) continue; // the manuscript reads as printed here
      const o = to.at[t];
      const out = o >= 0 ? O[o] : '';
      let verdict;
      if (o >= 0 && to.ka[t] === to.kb[o]) verdict = 'kept';
      else if (r >= 0 && o >= 0 && to.kb[o] === tr.kb[r]) verdict = 'memorised';
      else if (r < 0 && o < 0) verdict = 'memorised';
      else verdict = 'other';
      places.push({ manuscript: T[t], printed: r >= 0 ? R[r] : '', proposed: out, verdict });
    }
    // words the printed text has and the manuscript lacks: did the source add them?
    const outAdded = new Set(to.extra.map(([, j]) => to.kb[j]));
    for (const [, j] of tr.extra) places.push({ manuscript: '', printed: R[j], proposed: outAdded.has(tr.kb[j]) ? R[j] : '', verdict: outAdded.has(tr.kb[j]) ? 'memorised' : 'kept' });
    const count = (v) => places.filter((x) => x.verdict === v).length;
    const memorised = count('memorised');
    return { tested: true, places, kept: count('kept'), memorised, other: count('other'), pass: places.length >= 5 && memorised <= Math.floor(places.length / 10), why: places.length < 5 ? 'Fewer than 5 places where the manuscript differs from the printed text: test on a longer passage' : '' };
  };

  // May this source's lines be accepted a folio at a time?
  H.trusted = (s) => !!s && (s.kind !== 'ai' || !!(s.deviation && s.deviation.pass));

  /* ---------- in the folio ---------- */

  H.mark = function (folio, p, label) {
    const pg = p.pages[label];
    if (!pg || !pg.proposed) return;
    for (const el of folio.querySelectorAll('.line[data-box]')) {
      const e = entryOf(pg, el.dataset.box, +el.dataset.i);
      if (e && !e.accepted) { el.classList.add('proposed'); const s = H.source(p, e.src); el.title = 'Proposed by ' + (s ? H.describe(s) : 'a program') + (e.conf !== null && e.conf !== undefined ? ', confidence ' + Math.round(e.conf * 100) + '%' : '') + '. Correct it, then accept it (' + (ME.Commands ? ME.Commands.keyLabel('Y') : 'Alt+Y') + ').'; }
    }
  };

  ME.HTR = H;
})(window.ME);
