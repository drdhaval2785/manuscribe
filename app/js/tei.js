'use strict';
/* TEI layer.
   - ELEMENTS: the Saktumiva tag subset (https://www.saktumiva.org/wiki/tei) with UI metadata.
   - Conversion between the stored form of a line (a TEI inline fragment string) and the
     HTML that is shown inside an editable line.
   Structural divisions that may span lines/folios (<p>, <lg>, <l>, <quote>) are stored
   inside lines as <x-marker type="..."/> milestones and become real nesting on export. */
(function (ME) {
  const { U } = ME;

  const HAND = { n: 'hand', label: 'Hand', type: 'select', options: ['', '#scribe', '#later'], labels: ['(not specified)', 'Main scribe', 'Later hand / annotator'] };
  const PLACES = ['above', 'below', 'inline', 'top-margin', 'bottom-margin', 'left-margin', 'right-margin'];
  const MARGINS = ['top-margin', 'bottom-margin', 'left-margin', 'right-margin'];

  // kind:
  //   wrap    - wraps editable text (selection) in the line
  //   chip    - non-editable inline object (empty element or element whose content is edited in a dialog)
  //   subst / choice - compound elements
  //   marker  - structural milestone handled by export
  const ELEMENTS = {
    del: {
      label: 'Deletion', key: 'D', kind: 'wrap', group: 'scribal',
      desc: 'Text the scribe struck off / deleted.',
      example: 'sarva<del rend="crossed out">vidyā</del>nām',
      attrs: [{ n: 'rend', label: 'How it is deleted', type: 'combo', options: ['crossed out', 'erased', 'overwritten', 'dots above', 'line above', 'yellow pigment (haritāla)', 'smudged', 'bracketed'], def: 'crossed out' }, HAND],
    },
    add: {
      label: 'Addition', key: 'A', kind: 'add', group: 'scribal',
      desc: 'Letters or words added by the scribe or a later hand, e.g. above the line where they had been omitted, or in a margin.',
      example: 'sarva<add place="above">śabdā</add>nām',
      content: { label: 'Added text', required: true },
      attrs: [{ n: 'place', label: 'Where it is written', type: 'select', options: PLACES, def: 'above' }, HAND],
    },
    subst: {
      label: 'Substitution', key: 'S', kind: 'subst', group: 'scribal',
      desc: 'Deleted text replaced by an addition (select the deleted text first).',
      example: 'sarva<subst><del rend="crossed out">vidyā</del><add place="above">śabdā</add></subst>nām',
    },
    retrace: {
      label: 'Retraced', key: 'R', kind: 'wrap', group: 'scribal',
      desc: 'Text that has been retraced (written over again).',
      example: 'gṛhītaṃ <retrace>gṛha</retrace>śabdena', attrs: [],
    },
    note: {
      label: 'Note', key: 'N', kind: 'chip', group: 'scribal',
      desc: 'A note, e.g. a marginal remark of the scribe or a later annotator, or an editorial note in English.',
      example: 'niṣṭhā<note place="inline">(pa॰ 1|1|16)</note>',
      content: { label: 'Note text', required: true, multiline: true },
      attrs: [{ n: 'place', label: 'Place', type: 'select', options: ['', 'top-margin', 'bottom-margin', 'left-margin', 'right-margin', 'above', 'below', 'inline', 'footer', 'appendix'], def: 'top-margin' },
        { n: 'xml:lang', label: 'Language', type: 'select', options: ['', 'en'], labels: ['Sanskrit (transliterated)', 'English (editorial note)'] },
        { n: 'type', label: 'Type (optional, e.g. FR, HND, CSP)', type: 'combo', options: [], def: '' },
        { n: 'resp', label: 'Responsibility (editorial: shown below the folio)', type: 'combo', options: ['editorial'], def: '' }, HAND],
    },
    choice: {
      label: 'Correction', key: 'C', kind: 'choice', group: 'editorial',
      desc: 'Your correction of the text: original reading (select it first) and corrected reading.',
      example: 'va<choice><orig>ṃta</orig><corr>rta</corr></choice>mānaḥ',
    },
    sic: {
      label: 'Sic', key: 'I', kind: 'wrap', group: 'editorial',
      desc: 'Transcribed exactly as found, without correction.',
      example: 'viśeṣo<sic>pa</sic>dhiḥ', attrs: [],
    },
    supplied: {
      label: 'Supplied', key: 'E', kind: 'wrap', group: 'editorial',
      desc: 'Text supplied by you, the transcriber/editor.',
      example: 'ta<supplied>d</supplied> dravyam',
      attrs: [{ n: 'reason', label: 'Reason', type: 'combo', options: ['', 'omitted', 'damage', 'illegible'], def: '' }],
    },
    surplus: {
      label: 'Surplus', key: 'X', kind: 'wrap', group: 'editorial',
      desc: 'Text you consider superfluous (e.g. repeated).',
      example: 'darśanaṃ<lb n="5"/><surplus reason="repeated after line break">naṃ</surplus>',
      attrs: [{ n: 'reason', label: 'Reason', type: 'combo', options: ['repeated', 'repeated after line break', 'dittography', ''], def: 'repeated' }],
    },
    unclear: {
      label: 'Unclear', key: 'U', kind: 'wrap', group: 'editorial',
      desc: 'A passage you cannot read with certainty.',
      example: 'svarūpānyathā<unclear>t tānāpapaptiḥ</unclear>',
      attrs: [{ n: 'reason', label: 'Reason', type: 'combo', options: ['', 'faded', 'damaged', 'smudged', 'ambiguous akṣara', 'eaten by insects'], def: '' }],
    },
    gap: {
      label: 'Gap', key: 'G', kind: 'chip', group: 'editorial',
      desc: 'Text that cannot be read at all.',
      example: 'sā<gap reason="damaged" unit="akṣara" quantity="5"/>rvārthyam',
      attrs: [{ n: 'reason', label: 'Reason', type: 'combo', options: ['damaged', 'illegible', 'eaten by insects', 'faded', 'torn', 'stained', 'missing folio'], def: 'damaged' },
        { n: 'unit', label: 'Unit', type: 'combo', options: ['akṣara', 'character', 'word', 'line'], def: 'akṣara' },
        { n: 'quantity', label: 'Quantity', type: 'number', def: '1', focus: true }],
    },
    space: {
      label: 'Space', key: 'B', kind: 'chip', group: 'layout',
      desc: 'A blank space left in the line (B for "blank"), e.g. around the string hole.',
      example: 'ity arthaḥ<space unit="akṣara" quantity="2"/> atha ca',
      attrs: [{ n: 'unit', label: 'Unit', type: 'combo', options: ['akṣara', 'character', 'line'], def: 'akṣara' },
        { n: 'quantity', label: 'Quantity', type: 'number', def: '2', focus: true },
        { n: 'rend', label: 'Kind', type: 'combo', options: ['', 'string hole', 'decoration'], def: '' }],
    },
    hi: {
      label: 'Highlighted', key: 'H', kind: 'wrap', group: 'layout',
      desc: 'Text marked for emphasis, e.g. rubricated (red ink).',
      example: '<hi rend="rubricated">ātma vastu sva</hi>bhāvaś ca',
      attrs: [{ n: 'rend', label: 'How it is marked', type: 'combo', options: ['rubricated', 'red ink', 'yellow pigment', 'underlined', 'overlined', 'large'], def: 'rubricated' }],
    },
    metamark: {
      label: 'Metamark', key: 'M', kind: 'chip', group: 'layout',
      desc: 'A sign that is not part of the text, e.g. kākapada insertion mark or place marker.',
      example: 'tat siddhiḥ<metamark function="place marker">✗</metamark>',
      content: { label: 'Sign', required: true, choices: ['⋎', '∧', '^', '✗', '×', '+', '°', '॰', '⁘', '‸', '|'] , def: '⋎' },
      attrs: [{ n: 'function', label: 'Function', type: 'combo', options: ['insertion', 'place marker', 'deletion', 'transposition', 'reference'], def: 'insertion' }],
    },
    caesura: {
      label: 'Caesura', key: 'Backslash', keyLabel: '\\', kind: 'chip', group: 'layout',
      desc: 'Caesura in a line of verse (pāda division within a line).',
      example: 'suvarṇarucakādi ya<caesura/>thā yuktaṃ', attrs: [],
    },
    milestone: {
      label: 'Milestone', key: 'F', kind: 'chip', group: 'layout',
      desc: 'A location marker, e.g. the folio/line a passage starts on ("From folio 34r4").',
      example: '<milestone n="34r4" unit="folio"/>jātir vā',
      attrs: [{ n: 'n', label: 'Number', type: 'text', def: '', focus: true }, { n: 'unit', label: 'Unit', type: 'combo', options: ['folio', 'page', 'line', 'chapter'], def: 'folio' }],
    },
    pc: {
      label: 'Compound split', key: 'Minus', keyLabel: '-', kind: 'chip', group: 'layout',
      desc: 'Splits a long compound for the apparatus (<pc> </pc>). Use sparingly.',
      example: 'aneka<pc> </pc>viṣaya', attrs: [],
    },
    // components of compound elements (not inserted directly)
    orig: { label: 'Original', kind: 'wrap', internal: true, attrs: [] },
    corr: { label: 'Corrected', kind: 'chip', internal: true, content: { label: 'Corrected reading', required: true }, attrs: [] },
  };

  const STRUCT = {
    p: { label: 'Paragraph', key: 'P', desc: 'Start a paragraph (prose) here. Each needs a unique xml:id (used for collation). Shift = end it.' },
    lg: { label: 'Verse', key: 'V', desc: 'Start a verse (<lg>) here. Shift = end it.' },
    l: { label: 'Verse line', key: 'L', desc: 'Start the next line (<l>) of the current verse, e.g. the second half-verse.' },
    quote: { label: 'Quotation', key: 'Q', desc: 'Mark a quotation from a cited work. Select the quoted text, or press once at the start and once at the end.' },
  };

  const MARKER_LABEL = {
    'p-start': (a) => '¶ ' + (a.id || ''),
    'p-end': () => '¶⟩',
    'lg-start': (a) => '❦ ' + (a.id || ''),
    'lg-end': () => '❦⟩',
    'l': () => '‖',
    'q-start': (a) => '❝ ' + (TEI.workLabel(a.source) || '?') + (a.n ? ' ' + a.n : ''),
    'q-end': () => '❞',
  };
  const MARKER_TITLE = {
    'p-start': 'paragraph <p> starts', 'p-end': 'paragraph ends', 'lg-start': 'verse <lg> starts', 'lg-end': 'verse ends',
    'l': 'next verse line <l>', 'q-start': 'quotation <quote> starts', 'q-end': 'quotation ends',
  };

  const TEI = { ELEMENTS, STRUCT, PLACES, MARGINS, HAND };
  TEI.workLabel = () => '';   // replaced by app (looks up cited works)

  /* Notes not tied to a place in the text (name of the work, folio number, author …) are shown in
     the margin only, without a placeholder in the line. Which ones: the types listed in Settings. */
  TEI.unanchored = new Set();
  TEI.setUnanchored = (text) => { TEI.unanchored = new Set(String(text || '').split(/[\s,;]+/).filter(Boolean)); };
  TEI.isUnanchored = (name, a) => name === 'note' && !['above', 'below', 'inline'].includes(TEI.placeOf(name, a)) &&
    [a.type, a['xml:id'], a.id].some((v) => v && TEI.unanchored.has(v));

  // Where a note or addition is shown, whatever the place is called in the file:
  // above, below, inline, top, bottom, left, right, or foot (editorial notes, below the folio).
  TEI.placeOf = function (name, a) {
    if (name === 'note' && /^#?editorial$/i.test(a.resp || '')) return 'foot';
    const p = String(a.place || (name === 'note' ? 'top' : 'above')).toLowerCase();
    if (p === 'above' || p === 'below' || p === 'inline') return p;
    if (p === 'insitu') return 'inline';
    const side = /top|bottom|left|right/.exec(p);
    return side ? side[0] : 'bottom';
  };

  const PLACE_WORD = { supralinear: 'above', infralinear: 'below' };
  TEI.plainPlace = (p) => PLACE_WORD[p] || p;

  // Markup coming into the project, from files or older saves, in the form used here:
  // above and below for supralinear and infralinear, and a note's label in type (id is not a
  // TEI attribute on a note).
  TEI.normalizeTags = (str) => String(str)
    .replace(/<note\b[^>]*>/g, (tag) => (/\stype="/.test(tag) ? tag : tag.replace(/\sid="/, ' type="')))
    .replace(/(<(?:add|note)\b[^>]*\splace=")(supralinear|infralinear)"/g, (m, a, w) => a + PLACE_WORD[w] + '"');

  /* ---------- parsing stored fragments ---------- */

  TEI.parse = function (str) {
    const doc = new DOMParser().parseFromString('<r>' + (str || '') + '</r>', 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc.documentElement;
  };

  TEI.attrsOf = function (xmlEl) {
    const a = {};
    for (const at of Array.from(xmlEl.attributes)) a[at.name] = at.value;
    return a;
  };

  TEI.attrString = function (attrs) {
    let s = '';
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === '' || v === undefined || v === null) continue;
      s += ' ' + k + '="' + U.escAttr(v) + '"';
    }
    return s;
  };

  TEI.innerXml = function (xmlEl) {
    const ser = new XMLSerializer();
    let s = '';
    for (const c of Array.from(xmlEl.childNodes)) s += c.nodeType === 3 ? U.escXml(c.nodeValue) : ser.serializeToString(c);
    // XMLSerializer may add xmlns="" on children of the wrapper; strip it
    return s.replace(/ xmlns=""/g, '');
  };

  TEI.plainText = function (str) {
    const r = TEI.parse(str);
    if (!r) return String(str || '').replace(/<[^>]*>/g, '');
    return r.textContent;
  };

  TEI.hasContent = (str) => !!(str && str.replace(/\s+/g, '').length);

  /* ---------- stored TEI -> editable HTML ---------- */

  // x-* attributes are internal (e.g. x-span links the pieces of a tag that runs over several lines)
  function describe(name, attrs) {
    const parts = Object.entries(attrs).filter(([k, v]) => v !== '' && !k.startsWith('x-')).map(([k, v]) => k + ': ' + v);
    const def = ELEMENTS[name];
    return '<' + name + '>' + (def ? ' ' + def.label : '') + (parts.length ? ' · ' + parts.join(', ') : '') + (attrs['x-span'] ? '\n(continues across lines — part of one element)' : '');
  }
  TEI.describe = describe;

  function baseSpan(name, attrs, chip) {
    const span = document.createElement('span');
    span.className = 't t-' + name.replace(/[^a-z0-9-]/gi, '_') + (chip ? ' chip' : '') + (attrs['x-span'] ? ' spans' : '');
    span.dataset.t = name;
    span.dataset.a = JSON.stringify(attrs);
    if (chip) span.contentEditable = 'false';
    span.title = describe(name, attrs);
    return span;
  }


  // Fill in the visible part of a chip from its data-* (also used after attribute edits).
  TEI.paintChip = function (span) {
    const name = span.dataset.t;
    const a = JSON.parse(span.dataset.a || '{}');
    const content = span.dataset.c || '';
    span.title = describe(name === 'x-marker' ? a.type : name, a) + (content ? '\n' + TEI.plainText(content) : '');
    span.textContent = '';
    span.classList.remove('above', 'below', 'in-margin');
    span.classList.toggle('no-anchor', TEI.isUnanchored(name, a));
    const q = Math.max(0, parseInt(a.quantity, 10) || 1);
    switch (name) {
      case 'gap': {
        const dots = a.unit === 'line' ? '— ' + q + ' line' + (q > 1 ? 's' : '') + ' —' : '·'.repeat(Math.min(q, 12)) + (q > 12 ? '×' + q : '');
        span.textContent = '[' + dots + ']';
        break;
      }
      case 'space':
        span.style.width = (a.unit === 'line' ? 4 : Math.min(q, 20) * 0.85) + 'em';
        span.textContent = ' ';
        break;
      case 'caesura': span.textContent = '¦'; break;
      case 'pc': span.textContent = '◦'; break;
      case 'metamark': span.textContent = TEI.plainText(content) || '⋎'; break;
      case 'milestone': span.textContent = '⟨' + (a.n || '?') + '⟩'; break;
      case 'lb': span.textContent = '↵' + (a.n || ''); break;
      case 'pb': span.textContent = '⎘' + (a.n || ''); break;
      case 'note':
      case 'add': {
        const place = TEI.placeOf(name, a);
        const text = TEI.plainText(content);
        if (name === 'add') span.appendChild(U.el('span', { class: 'caretmark' }, '‸'));
        if (place === 'above' || place === 'below') {
          span.classList.add(place);
          // a lone sign (ः) on a blank base, or the font draws it on a dotted circle
          span.appendChild(U.el('span', { class: 'float' }, (TEI.isSignsOnly(text) ? '\u00A0' : '') + text));
        } else if (place === 'inline' && name === 'note') {
          span.appendChild(U.el('span', { class: 'inline-note' }, text));
        } else {
          span.classList.add('in-margin');
          span.appendChild(U.el('span', { class: 'anchor' }, span.dataset.num || '*'));
        }
        break;
      }
      case 'corr': {
        span.classList.add('above');
        span.appendChild(U.el('span', { class: 'float' }, TEI.plainText(content)));
        break;
      }
      case 'x-marker':
        span.className = 't chip t-x-marker m-' + a.type;
        span.textContent = (MARKER_LABEL[a.type] || (() => a.type))(a);
        span.title = (MARKER_TITLE[a.type] || a.type) + (a.id ? ' · xml:id ' + a.id : '') + (a.source ? ' · ' + (TEI.workLabel(a.source, true) || a.source) : '') + (a.n ? ' · ' + a.n : '');
        break;
      default:
        span.textContent = '⟨' + name + '⟩' + TEI.plainText(content);
    }
  };

  TEI.makeChip = function (name, attrs, content) {
    const span = baseSpan(name, attrs || {}, true);
    if (content) span.dataset.c = content;
    TEI.paintChip(span);
    return span;
  };

  TEI.makeWrap = function (name, attrs) {
    return baseSpan(name, attrs || {}, false);
  };

  TEI.makeMarker = function (type, attrs) {
    return TEI.makeChip('x-marker', Object.assign({ type }, attrs || {}));
  };

  function renderNode(node, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(node.nodeValue)); return; }
    if (node.nodeType !== 1) return;
    const name = node.nodeName;
    const attrs = TEI.attrsOf(node);
    const def = ELEMENTS[name];
    let span;
    if (name === 'x-marker') {
      span = TEI.makeChip('x-marker', attrs);
    } else if (name === 'add' && (TEI.placeOf(name, attrs) === 'inline' || attrs['x-span'])) {
      span = TEI.makeWrap('add', attrs);
      for (const c of Array.from(node.childNodes)) renderNode(c, span);
    } else if (name === 'add' || name === 'corr' || (def && def.kind === 'chip') || (!def && !node.childNodes.length && name !== 'subst' && name !== 'choice')) {
      // an empty tag we have no special use for (e.g. a <lb/> inside a line) is kept and shown as a mark
      span = TEI.makeChip(name, attrs, TEI.innerXml(node));
    } else {
      // wrap, subst, choice, orig and unknown elements: keep the children editable
      span = TEI.makeWrap(name, attrs);
      for (const c of Array.from(node.childNodes)) renderNode(c, span);
    }
    out.appendChild(span);
  }

  // Returns a DocumentFragment of HTML for a stored line.
  TEI.toHtml = function (str) {
    const frag = document.createDocumentFragment();
    if (!str) return frag;
    const r = TEI.parse(str);
    if (!r) { frag.appendChild(document.createTextNode(String(str))); return frag; }
    for (const c of Array.from(r.childNodes)) renderNode(c, frag);
    TEI.decorateSigns(frag);
    return frag;
  };

  /* A tag around only a vowel sign or other mark (e.g. the ि of कि) cannot be styled itself:
     the browser draws the whole akṣara in one style. Such tags get a small mark of their own
     under (or, for a deletion, through) the akṣara. The mark is an empty element - no text -
     so it is invisible to input methods and is not saved. */
  TEI.isSignsOnly = (s) => !!s && /^[\p{M}‌‍]+$/u.test(s);
  TEI.decorateSigns = function (root) {
    for (const t of Array.from(root.querySelectorAll('.t:not(.chip)'))) {
      let text = '';
      for (const n of t.childNodes) if (n.nodeType === 3) text += n.nodeValue.replace(/​/g, ''); else if (n.classList && n.classList.contains('t')) text += 'x';
      const signs = TEI.isSignsOnly(text);
      const deco = Array.from(t.children).find((c) => c.classList.contains('sign-deco'));
      t.classList.toggle('signs-only', signs);
      if (signs && !deco) t.appendChild(Object.assign(document.createElement('i'), { className: 'sign-deco', contentEditable: 'false' }));
      else if (!signs && deco) deco.remove();
    }
  };

  /* ---------- editable HTML -> stored TEI ---------- */

  function serialize(node) {
    let out = '';
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        out += U.escXml(n.nodeValue.replace(/[​﻿]/g, '').replace(/ /g, ' '));
      } else if (n.nodeType === 1) {
        if (n.classList && n.classList.contains('t')) {
          const name = n.dataset.t;
          const attrs = JSON.parse(n.dataset.a || '{}');
          if (n.classList.contains('chip')) {
            const c = n.dataset.c;
            out += c ? '<' + name + TEI.attrString(attrs) + '>' + c + '</' + name + '>' : '<' + name + TEI.attrString(attrs) + '/>';
          } else {
            const inner = serialize(n);
            if (inner === '' && name !== 'subst' && name !== 'choice') continue; // emptied wrapper: drop
            out += '<' + name + TEI.attrString(attrs) + '>' + inner + '</' + name + '>';
          }
        } else if (n.tagName !== 'BR') {
          out += serialize(n); // stray markup from the browser: keep its text only
        }
      }
    }
    return out;
  }
  TEI.fromHtml = serialize;

  // Accepts user-typed text which may contain TEI inline markup; returns a valid fragment string.
  TEI.sanitizeInput = function (text) {
    if (/[<&]/.test(text)) {
      const r = TEI.parse(text);
      if (r) return TEI.normalizeTags(TEI.innerXml(r));
    }
    return U.escXml(text);
  };

  ME.TEI = TEI;
})(window.ME);
