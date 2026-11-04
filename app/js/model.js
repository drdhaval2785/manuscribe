'use strict';
/* Project data model: layouts, folio <-> PDF page mapping, block geometry, stream order. */
(function (ME) {
  const { U } = ME;

  const LAYOUTS = {
    linear: {
      label: 'Linear', desc: 'Text written line after line across the folio.',
      boxes: ['main'], streams: [{ key: 'main', boxes: ['main'] }],
    },
    tripatha: {
      label: 'Tripāṭha', desc: 'Main text in the centre; commentary continues from the top block to the bottom block.',
      boxes: ['top', 'main', 'bottom'], streams: [{ key: 'main', boxes: ['main'] }, { key: 'commentary', boxes: ['top', 'bottom'] }],
    },
    pancapatha: {
      label: 'Pañcapāṭha', desc: 'Main text in the centre; commentary runs top → right → bottom → left.',
      boxes: ['top', 'left', 'main', 'right', 'bottom'], streams: [{ key: 'main', boxes: ['main'] }, { key: 'commentary', boxes: ['top', 'right', 'bottom', 'left'] }],
    },
    interlinear: {
      label: 'Interlinear', desc: 'Main text in lines; the commentary is written above each line.',
      boxes: ['main', 'gloss'], streams: [{ key: 'main', boxes: ['main'] }, { key: 'gloss', boxes: ['gloss'] }],
    },
  };

  const BOX_LABEL = { main: 'Main text', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', gloss: 'Interlinear' };
  const BOX_COLOR = { leaf: '#e7b416', main: '#d9480f', top: '#2b8a3e', bottom: '#1971c2', left: '#9c36b5', right: '#0c8599', gloss: '#c2255c' };
  const STREAMS = {
    main: { label: 'Main text (mūla)', divType: 'base-text' },
    commentary: { label: 'Commentary', divType: 'commentary' },
    gloss: { label: 'Interlinear commentary', divType: 'interlinear-commentary' },
  };
  const DEFAULT_LINES = { main: 8, top: 5, bottom: 5, left: 12, right: 12 };

  const Model = { LAYOUTS, BOX_LABEL, BOX_COLOR, STREAMS, DEFAULT_LINES };

  Model.newProject = function (opts) {
    const now = Date.now();
    return {
      id: U.uid('ms'),
      version: 1,
      created: now,
      modified: now,
      meta: Object.assign({
        title: '', author: '', siglum: '', shelfmark: '', repository: '', settlement: '', country: '',
        scribe: '', date: '', transcriber: '', script: 'sa-Deva', textLang: 'sa-Latn', form: 'pothi', material: '', notes: '',
      }, opts.meta || {}),
      layout: { type: opts.layoutType || 'linear', lines: Object.assign({}, DEFAULT_LINES, opts.lines || {}), regions: {} },
      folios: Object.assign({ firstPage: 1, startNo: 1, startSide: 'r', sidesPerPage: 1, overrides: {}, missing: '', pbWidth: null }, opts.folios || {}),
      pdf: opts.pdf || null,
      works: [],
      pages: {},
      settings: {
        modifier: U.isMac ? 'ctrlalt' : 'alt', translit: 'off', translitLast: 'itrans-deva', geminate: false, paper: 'auto',
        showMarkers: true, textScale: 1, guide: 'band', lastAttrs: {}, noAnchorIds: 'FR, HND, CSP',
      },
      ui: { current: null, split: 0.46, sidebar: window.innerWidth > 1180, sidebarTab: 'tag', pdfMode: 'leaf', pdfZoom: 1, filters: { b: 100, c: 100, inv: false, gray: false } },
    };
  };

  // Fill in fields added in later versions so old saves keep working.
  Model.upgrade = function (p) {
    const fresh = Model.newProject({});
    for (const k of ['meta', 'settings', 'ui']) p[k] = Object.assign({}, fresh[k], p[k] || {});
    p.layout = Object.assign({}, fresh.layout, p.layout || {});
    p.layout.lines = Object.assign({}, DEFAULT_LINES, p.layout.lines || {});
    p.layout.regions = p.layout.regions || {};
    p.folios = Object.assign({}, fresh.folios, p.folios || {});
    p.folios.overrides = p.folios.overrides || {};
    p.works = p.works || [];
    p.pages = p.pages || {};
    for (const pg of Object.values(p.pages)) {
      Model.absorbLb(pg);
      for (const lines of Object.values(pg.boxes || {})) lines.forEach((l, i) => { if (l) lines[i] = ME.TEI.normalizeTags(l); });
    }
    for (const la of Object.values(p.settings.lastAttrs || {})) if (la && la.place) la.place = ME.TEI.plainPlace(la.place);
    return p;
  };

  /* ---------- explicit line breaks ----------
     pg.lb[box][i] = {n, brk}: the number given to line i in imported or pasted XML, and whether
     its <lb> explicitly had break="no". Whether a word runs over a line break otherwise follows
     from the text: a line that does not end in a space continues on the next one. */

  Model.setLb = function (pg, box, i, lb) {
    if (!lb) return;
    const o = {};
    if (lb.n !== undefined && lb.n !== null && lb.n !== '') o.n = String(lb.n);
    if (lb.brk) o.brk = true;
    if (!Object.keys(o).length) return;
    pg.lb = pg.lb || {};
    (pg.lb[box] = pg.lb[box] || {})[i] = o;
  };

  // The number of a line: its own, or counted on from the last one given before it.
  Model.lineNumber = function (project, label, box, i) {
    const pg = project.pages[label];
    const m = pg && pg.lb && pg.lb[box];
    if (m) {
      for (let k = i; k >= 0; k--) {
        if (m[k] && m[k].n !== undefined) {
          if (k === i) return m[k].n;
          const num = parseInt(m[k].n, 10);
          if (String(num) === m[k].n) return String(num + (i - k));
          break;
        }
      }
    }
    return String(i + 1);
  };

  const LB_ATTRS = (a) => ({ n: (/\bn="([^"]*)"/.exec(a) || [])[1], brk: /\bbreak="no"/.test(a) });

  // Lines saved earlier may hold pasted <lb/> tags at their start or end, which were then
  // exported twice. Such a tag only says what the line's own break is: keep that, drop the tag.
  Model.absorbLb = function (pg) {
    for (const [box, lines] of Object.entries(pg.boxes || {})) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l || l.indexOf('<lb') < 0) continue;
        const lead = /^((?:<x-marker\b[^>]*\/>)*)\s*<lb\b([^>]*)\/>/.exec(l);
        if (lead) {
          const lb = LB_ATTRS(lead[2]);
          lines[i] = lead[1] + l.slice(lead[0].length);
          Model.setLb(pg, box, i, lb);
          if (i > 0 && lines[i - 1]) {
            if (lb.brk) lines[i - 1] = lines[i - 1].replace(/\s+$/, '');
            else if (!/[\s|।॥]$/.test(lines[i - 1])) lines[i - 1] += ' ';
          }
        }
        const tail = /\s*<lb\b([^>]*)\/>\s*$/.exec(lines[i]);
        if (tail && i + 1 < lines.length) {
          const kept = lines[i].slice(0, tail.index);
          lines[i] = kept + (!/break="no"/.test(tail[1]) && (/\s/.test(tail[0][0]) || !/[|।॥]$/.test(kept)) ? ' ' : '');
          Model.setLb(pg, box, i + 1, LB_ATTRS(tail[1]));
        }
      }
    }
  };

  /* ---------- folio mapping ---------- */

  // Folios missing from the manuscript, e.g. "7, 12-14, 20v": {set: Set('7r','7v',…,'20v'), bad: [tokens]}
  Model.parseMissing = function (text) {
    const set = new Set(), bad = [];
    for (const tok of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
      let m;
      if ((m = /^(\d+)-(\d+)$/.exec(tok))) {
        for (let f = parseInt(m[1], 10); f <= parseInt(m[2], 10); f++) set.add(f + 'r').add(f + 'v');
      } else if ((m = /^(\d+)$/.exec(tok))) {
        const f = parseInt(m[1], 10);
        set.add(f + 'r').add(f + 'v');
      } else if ((m = /^(\d+)([rv])$/i.exec(tok))) {
        set.add(parseInt(m[1], 10) + m[2].toLowerCase());
      } else bad.push(tok);
    }
    return { set, bad };
  };

  // Ordered list of folio sides: [{key, label, pdfPage, half}]. Folios that are missing from
  // the manuscript are skipped when the PDF pages are numbered.
  Model.entries = function (project) {
    const f = project.folios;
    const n = (project.pdf && project.pdf.pages) || 0;
    const sides = f.sidesPerPage === 2 ? 2 : 1;
    const missing = Model.parseMissing(f.missing).set;
    let side = f.startSide === 'v' ? 1 : 0;
    const nextLabel = () => {
      for (;;) {
        const label = (f.startNo + Math.floor(side / 2)) + (side % 2 ? 'v' : 'r');
        side++;
        if (!missing.has(label)) return label;
      }
    };
    const out = [];
    for (let p = 1; p <= n; p++) {
      for (let h = 0; h < sides; h++) {
        const key = p + ':' + h;
        const ov = f.overrides[key];
        const auto = p < f.firstPage ? 'p' + p + (sides === 2 ? (h ? 'b' : 'a') : '') : nextLabel();
        const custom = ov !== undefined && ov !== '';
        out.push({ key, pdfPage: p, half: sides === 2 ? h : null, label: custom ? ov : auto, custom });
      }
    }
    // pages that have data but no longer map to any PDF page (e.g. after changing the mapping) stay reachable
    const seen = new Set(out.map((e) => e.label));
    for (const label of Object.keys(project.pages)) {
      if (!seen.has(label) && Model.pageHasContent(project.pages[label])) out.push({ key: 'orphan:' + label, pdfPage: null, half: null, label, orphan: true });
    }
    return out;
  };

  // The value of <pb n="…">: 5v stays 5v, or 0005_2 if the transcription came in that form.
  Model.pbValue = function (project, label) {
    const w = project.folios.pbWidth;
    const m = w && /^(\d+)([rv])$/.exec(label);
    return m ? m[1].padStart(w, '0') + '_' + (m[2] === 'r' ? '1' : '2') : label;
  };

  /* ---------- pages ---------- */

  Model.page = function (project, label) {
    if (!project.pages[label]) project.pages[label] = { boxes: {} };
    const pg = project.pages[label];
    pg.boxes = pg.boxes || {};
    return pg;
  };

  Model.pageLayout = (project, label) => (project.pages[label] && project.pages[label].layout) || project.layout.type;

  Model.lineCount = function (project, label, box) {
    const pg = project.pages[label];
    const b = box === 'gloss' ? 'main' : box;
    const n = (pg && pg.lines && pg.lines[b]) || project.layout.lines[b] || DEFAULT_LINES[b] || 8;
    return Math.max(1, n | 0);
  };

  Model.boxLines = function (project, label, box) {
    const pg = Model.page(project, label);
    const n = Model.lineCount(project, label, box);
    const arr = pg.boxes[box] || (pg.boxes[box] = []);
    while (arr.length < n) arr.push('');
    return arr;
  };

  Model.pageHasContent = function (pg) {
    if (!pg || !pg.boxes) return false;
    return Object.values(pg.boxes).some((lines) => lines.some((l) => ME.TEI.hasContent(l)));
  };

  Model.pageProgress = function (project, label) {
    const pg = project.pages[label];
    if (!pg) return 0;
    const type = Model.pageLayout(project, label);
    let total = 0, filled = 0;
    for (const box of LAYOUTS[type].boxes) {
      const n = Model.lineCount(project, label, box);
      total += n;
      const arr = pg.boxes[box] || [];
      for (let i = 0; i < n; i++) if (ME.TEI.hasContent(arr[i])) filled++;
    }
    return total ? filled / total : 0;
  };

  /* ---------- geometry ---------- */

  function slotOf(entry) { return entry && entry.half ? String(entry.half) : '0'; }

  // Calibrated regions (page-normalised [x,y,w,h]) for a folio side, or null.
  Model.regions = function (project, entry) {
    const pg = project.pages[entry.label];
    if (pg && pg.regions) return pg.regions;
    return project.layout.regions[slotOf(entry)] || null;
  };

  Model.setRegions = function (project, entry, regions, scope) {
    if (scope === 'page') { Model.page(project, entry.label).regions = regions; return; }
    project.layout.regions[slotOf(entry)] = regions;
    // a project-wide calibration replaces per-folio ones of the same slot
    for (const e of Model.entries(project)) {
      if (slotOf(e) === slotOf(entry) && project.pages[e.label]) delete project.pages[e.label].regions;
    }
  };

  Model.defaultLeaf = function (entry) {
    if (entry && entry.half !== null && entry.half !== undefined) return [0, entry.half * 0.5, 1, 0.5];
    return [0, 0, 1, 1];
  };

  // Default block rectangles inside the leaf (leaf-normalised).
  Model.defaultBoxes = function (type, lines) {
    const mx = 0.075, my = 0.09;
    const X = mx, Y = my, W = 1 - 2 * mx, H = 1 - 2 * my;
    const c = 0.78; // a commentary line is ~78% of a main-text line
    const gap = 0.025;
    if (type === 'tripatha') {
      const avail = H - 2 * gap;
      const unit = avail / (c * lines.top + lines.main + c * lines.bottom);
      const ht = c * lines.top * unit, hm = lines.main * unit, hb = c * lines.bottom * unit;
      return { top: [X, Y, W, ht], main: [X, Y + ht + gap, W, hm], bottom: [X, Y + ht + gap + hm + gap, W, hb] };
    }
    if (type === 'pancapatha') {
      const avail = H - 2 * gap;
      const unit = avail / (c * lines.top + lines.main + c * lines.bottom);
      const ht = c * lines.top * unit, hm = lines.main * unit, hb = c * lines.bottom * unit;
      const side = 0.17 * W, gx = 0.015;
      const ym = Y + ht + gap;
      return {
        top: [X, Y, W, ht], bottom: [X, ym + hm + gap, W, hb],
        left: [X, ym, side, hm], main: [X + side + gx, ym, W - 2 * side - 2 * gx, hm], right: [X + W - side, ym, side, hm],
      };
    }
    return { main: [X, Y, W, H] };
  };

  // Everything the editor needs to lay out a folio side.
  Model.geometry = function (project, entry, pageSize) {
    const label = entry.label;
    const type = Model.pageLayout(project, label);
    const lines = {};
    for (const b of LAYOUTS[type].boxes) lines[b] = Model.lineCount(project, label, b);
    const reg = Model.regions(project, entry);
    const leaf = (reg && reg.leaf) || Model.defaultLeaf(entry);
    const pw = (pageSize && pageSize.width) || 1000, ph = (pageSize && pageSize.height) || 400;
    const aspect = (leaf[2] * pw) / (leaf[3] * ph);
    const defaults = Model.defaultBoxes(type, lines);
    const boxes = {};
    let calibrated = false;
    for (const b of LAYOUTS[type].boxes) {
      if (b === 'gloss') continue;
      const r = reg && reg.boxes && reg.boxes[b];
      if (r) {
        calibrated = true;
        boxes[b] = [(r[0] - leaf[0]) / leaf[2], (r[1] - leaf[1]) / leaf[3], r[2] / leaf[2], r[3] / leaf[3]];
      } else {
        boxes[b] = defaults[b];
      }
    }
    return { type, lines, leaf, aspect, boxes, calibrated, regions: reg };
  };

  // Page-normalised rectangle of line `i` of `box`, for the reading guide on the PDF.
  Model.lineRect = function (project, entry, box, i) {
    const reg = Model.regions(project, entry);
    if (!reg || !reg.boxes) return null;
    const type = Model.pageLayout(project, entry.label);
    const r = reg.boxes[box === 'gloss' ? 'main' : box];
    if (!r) return null;
    const n = Model.lineCount(project, entry.label, box);
    if (type === 'interlinear') {
      const row = r[3] / n;
      return box === 'gloss' ? [r[0], r[1] + i * row, r[2], row * 0.42] : [r[0], r[1] + i * row + row * 0.38, r[2], row * 0.62];
    }
    return [r[0], r[1] + (i * r[3]) / n, r[2], r[3] / n];
  };

  /* ---------- streams ---------- */

  Model.streamOfBox = function (type, box) {
    return LAYOUTS[type].streams.find((s) => s.boxes.includes(box));
  };

  // Stored lines of a stream that come before (box, line) on folio `label`, in reading order.
  Model.linesBefore = function (project, label, box, lineIdx) {
    const type = Model.pageLayout(project, label);
    const stream = Model.streamOfBox(type, box);
    const out = [];
    for (const e of Model.entries(project)) {
      const pg = project.pages[e.label];
      const t = Model.pageLayout(project, e.label);
      const s = LAYOUTS[t].streams.find((x) => x.key === stream.key);
      if (e.label === label) {
        for (const b of s.boxes) {
          const n = Model.lineCount(project, e.label, b);
          const arr = (pg && pg.boxes[b]) || [];
          for (let i = 0; i < n; i++) {
            if (b === box && i === lineIdx) return out;
            out.push(arr[i] || '');
          }
        }
        return out;
      }
      if (!pg || !s) continue;
      for (const b of s.boxes) {
        const n = Model.lineCount(project, e.label, b);
        const arr = pg.boxes[b] || [];
        for (let i = 0; i < n; i++) out.push(arr[i] || '');
      }
    }
    return out;
  };

  // State of open structures (quote / p / lg) at the end of a list of stored lines.
  Model.openState = function (lines) {
    const st = { quote: null, p: null, lg: null, lastIds: { p: null, lg: null } };
    const re = /<x-marker\b([^>]*)\/>/g;
    for (const l of lines) {
      if (!l || l.indexOf('x-marker') < 0) continue;
      let m;
      while ((m = re.exec(l))) {
        const a = {};
        m[1].replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); });
        switch (a.type) {
          case 'q-start': st.quote = a; break;
          case 'q-end': st.quote = null; break;
          case 'p-start': st.p = a; st.lg = null; st.lastIds.p = a.id || st.lastIds.p; break;
          case 'p-end': st.p = null; st.lg = null; break;
          case 'lg-start': st.lg = a; st.lastIds.lg = a.id || st.lastIds.lg; break;
          case 'lg-end': st.lg = null; break;
          default:
        }
      }
    }
    return st;
  };

  ME.Model = Model;
})(window.ME);
