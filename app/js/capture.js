'use strict';
/* The print page, captured as a PDF: no print dialog, no new tab. The page is laid out by this browser, out of sight,
   exactly as it is shown, in any script; then every word is written into the PDF where the browser put it.

   A word in a font Manuscribe has (its Devanagari and Latin font, or the edition's own font file) is set as text in
   that font, shaped by HarfBuzz, sharp at any size and copied letter for letter. A word in any other script is
   drawn by the browser itself, in the fonts it used on the page, and put in as a picture with its letters over it,
   invisible, so that it can still be searched and copied: the page looks as the browser shows it, whatever the
   script and whatever fonts the computer has. */
(function (ME) {
  const C = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const RES = 4; // a picture of a word: four pixels to the CSS pixel, about 380 dots to the inch

  // 'rgb(140, 42, 23)' -> [0.55, 0.16, 0.09]
  const colourOf = (css) => { const m = String(css).match(/[\d.]+/g) || [0, 0, 0]; return [+m[0] / 255, +m[1] / 255, +m[2] / 255]; };
  const isTrueType = (b) => b.length > 4 && ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || String.fromCharCode(b[0], b[1], b[2], b[3]) === 'true');

  /* -> {blob, pages, words: {text, pictures}} */
  C.pdf = async function (ed, list, built, opts) {
    const o = opts || {};
    const say = o.onProgress || (() => {});
    say(0.18, 'Getting the fonts…');
    await ME.Shaper.load();
    const embedded = await ME.PrintHTML.fonts(ed, built, list);
    say(0.22, 'Laying out the pages…');
    const html = ME.PrintHTML.html(ed, list, built, { fonts: embedded, bare: !!o.bare });
    // the fonts Manuscribe can set text in: those of the page that are TrueType, in the page's order
    // (Tiro is among them where the edition has Devanagari); the first is the document's own font
    const tiro = embedded.some((f) => f.kind === 'tiro') ? await ME.Publish.font() : null;
    const files = embedded.map((f) => ({ f, bytes: f.kind === 'tiro' ? tiro && tiro.bytes : fromB64(f.data) })).filter((x) => x.bytes && isTrueType(x.bytes));
    if (!files.length) throw new Error('No font could be had for the text: connect to the internet once, and the fonts of its scripts are fetched and kept from then on');
    const baseShaper = ME.Shaper.font(files[0].bytes);
    const doc = ME.PDFWriter.doc(files[0].bytes, { title: ed.title || 'Edition', author: ed.editor || '', subject: ME.Publish.citation(ed), lang: (list.map((x) => x.p && x.p.meta && x.p.meta.textLang).find(Boolean) || 'und').split('-')[0] }, baseShaper);
    const vector = files.map(({ f, bytes }, i) => {
      const shaper = i === 0 ? baseShaper : ME.Shaper.font(bytes);
      const index = i === 0 ? 0 : doc.addFont(bytes, shaper);
      return { family: f.name, kind: f.kind, shaper, index, font: index === 0 ? doc.font : ME.PDFWriter.readFont(bytes) };
    });
    // the page's order: the edition's font file, then the fonts the editor names, then Tiro, then the Noto font of each
    // other script; a word the named fonts may have drawn is drawn by the browser
    const named = (ME.PrintHTML.settings(ed).font || '').trim();

    // the page, laid out out of sight
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:1000px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    try {
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html.replace('if (D.autoPrint)', 'if (false)'); });
      const win = frame.contentWindow, d = frame.contentDocument;
      // however long it takes, as long as it is getting on
      for (let stalled = 0, was = -1; !win.__paginated && stalled < 1200; stalled++) {
        await sleep(50);
        const p = win.__paginating || 0;
        if (p !== was) { was = p; stalled = 0; say(0.22 + 0.38 * p, 'Laying out the pages: ' + Math.round(100 * p) + '%'); }
      }
      if (!win.__paginated) throw new Error('the page did not lay itself out');
      const paper = ME.PrintHTML.PAPER[ME.PrintHTML.settings(ed).paper] || ME.PrintHTML.PAPER.a4;
      const toPt = (v) => { const m = /^([\d.]+)(mm|in)$/.exec(v); return m[2] === 'mm' ? (+m[1] * 72) / 25.4 : +m[1] * 72; };
      const W = toPt(paper.w), H = toPt(paper.h);
      const pageEls = [...d.querySelectorAll('.page')];
      const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
      const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const count = { text: 0, pictures: 0 };
      const canvas = d.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // the font Manuscribe would set a word in, if the browser drew it in that font too: else null
      const fontFor = (word) => {
        const cps = Array.from(word).filter((ch) => /\S/.test(ch) && !/[​-‍﻿]/.test(ch));
        for (const v of vector) {
          if (cps.every((ch) => v.shaper.nominal(ch.codePointAt(0)))) {
            // the editor's named fonts stand before Tiro and Noto: what they may have drawn is drawn as the browser drew it
            if (named && v.kind !== 'edition') return null;
            return v;
          }
        }
        return null;
      };
      const onePage = (pageEl, pi) => {
        const pr = pageEl.getBoundingClientRect();
        const k = W / pr.width; // points to the CSS pixel
        const page = doc.page(W, H);
        // rules: the lines under the running head and over the notes
        for (const el of pageEl.querySelectorAll('*')) {
          const st = win.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          const bt = parseFloat(st.borderTopWidth), bb = parseFloat(st.borderBottomWidth);
          if (bt > 0 && st.borderTopStyle !== 'none') page.line((r.left - pr.left) * k, (r.top - pr.top + bt / 2) * k, (r.right - pr.left) * k, (r.top - pr.top + bt / 2) * k, Math.max(0.3, bt * k));
          if (bb > 0 && st.borderBottomStyle !== 'none') page.line((r.left - pr.left) * k, (r.bottom - pr.top - bb / 2) * k, (r.right - pr.left) * k, (r.bottom - pr.top - bb / 2) * k, Math.max(0.3, bb * k));
          // an uncertain reading: dotted under its words
          if (/underline/.test(st.textDecorationLine) && el.closest('.body')) for (const rr of el.getClientRects()) page.line((rr.left - pr.left) * k, (rr.bottom - pr.top - 1) * k, (rr.right - pr.left) * k, (rr.bottom - pr.top - 1) * k, 0.5, [1.2, 1.2]);
        }
        // the words
        const walker = d.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
        const range = d.createRange();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.nodeValue;
          if (!t || !t.trim()) continue;
          const el = n.parentElement;
          const st = win.getComputedStyle(el);
          if (st.visibility === 'hidden' || st.display === 'none') continue;
          const px = parseFloat(st.fontSize);
          const colour = colourOf(st.color);
          // the soft hyphen of a word broken at the end of this line: the browser draws it, and so must the PDF
          const lineEndsAfter = (rect) => {
            let next = el.nextElementSibling;
            if (!next && el.parentElement.classList.contains('unsure')) next = el.parentElement.nextElementSibling;
            const r = next && next.getClientRects()[0];
            return !!r && r.top > rect.top + rect.height / 2;
          };
          const hyphenAfter = (rect) => {
            const v = fontFor('-');
            if (!v) return;
            const asc = v.font.ascent, desc = -v.font.descent;
            page.glyphs(v.shaper.shape('-'), (rect.right - pr.left) * k, (rect.top - pr.top) * k + rect.height * k * (asc / (asc + desc)), px * k, '\u00AD', colour.some((c) => c > 0.01) ? colour : null, { font: v.index, scale: 1, bold: +st.fontWeight >= 600 });
          };
          const place = (word, at, soft) => {
            range.setStart(n, at); range.setEnd(n, at + word.length);
            const rects = [...range.getClientRects()].filter((r) => r.width > 0);
            if (!rects.length) return;
            if (rects.length > 1) {
              // across a line break: each letter where it stands
              let off = 0;
              for (const g of graphemes.segment(word)) { place1(g.segment, at + g.index, null); off += g.segment.length; }
              return;
            }
            place1(word, at, rects[0]);
            if (soft && lineEndsAfter(rects[0])) hyphenAfter(rects[0]);
          };
          const place1 = (word, at, rect) => {
            if (!rect) {
              range.setStart(n, at); range.setEnd(n, at + word.length);
              rect = range.getBoundingClientRect();
              if (!rect.width) return;
            }
            const x = (rect.left - pr.left) * k, top = (rect.top - pr.top) * k, width = rect.width * k, height = rect.height * k;
            const size = px * k;
            const v = fontFor(word);
            if (v) {
              // set as text, in the font the browser used, where the browser put it
              const f = v.font;
              const gl = v.shaper.shape(word);
              const asc = f.ascent, desc = -f.descent; // per 1000
              const base = top + height * (asc / (asc + desc));
              /* At its own width: the font is the one the browser used, so the word is as wide as on the page. The
                 width a browser reports for a word can be less (Safari's, at the end of a line), and fitting the word
                 to it squeezed it; the place of each word, with the space justification gives, is the browser's. */
              void width;
              page.glyphs(gl, x, base, size, word, colour.some((c) => c > 0.01) ? colour : null, { font: v.index, scale: 1, bold: +st.fontWeight >= 600 });
              count.text++;
              return;
            }
            // drawn by the browser, as on the page, with its letters over it
            const cw = Math.max(1, Math.ceil(rect.width * RES) + 2), ch = Math.max(1, Math.ceil(rect.height * RES) + 2);
            const key = word + '\u0001' + st.fontStyle + st.fontWeight + px + st.fontFamily + '\u0001' + cw + 'x' + ch;
            page.image(key, () => {
              canvas.width = cw; canvas.height = ch;
              ctx.setTransform(RES, 0, 0, RES, RES * (1 / RES), RES * (1 / RES));
              ctx.clearRect(-1, -1, cw, ch);
              ctx.font = st.fontStyle + ' ' + st.fontWeight + ' ' + px + 'px ' + st.fontFamily;
              ctx.fillStyle = '#000';
              ctx.textBaseline = 'alphabetic';
              const m = ctx.measureText(word);
              const A = m.fontBoundingBoxAscent || px * 0.8, D = m.fontBoundingBoxDescent || px * 0.2;
              const y = (rect.height - (A + D)) / 2 + A;
              const x0 = Math.abs(m.width - rect.width) > 1 ? (rect.width - m.width) / 2 : 0;
              ctx.fillText(word, x0, y);
              const data = ctx.getImageData(0, 0, cw, ch).data;
              const alpha = new Uint8Array(cw * ch);
              let any = false;
              for (let i = 0; i < alpha.length; i++) { alpha[i] = data[i * 4 + 3]; if (alpha[i]) any = true; }
              return any ? { w: cw, h: ch, alpha, color: colour } : null;
            }, x - k / RES, top - k / RES, (cw / RES) * k, (ch / RES) * k);
            page.hiddenText(word, x, top + height * 0.8, size, width);
            count.pictures++;
          };
          for (const s of seg.segment(t)) {
            const soft = s.segment.endsWith('\u00AD'), word = soft ? s.segment.slice(0, -1) : s.segment;
            if (word.trim()) place(word, s.index, soft);
          }
        }
        // the links: a marker to its note, a note back to its marker
        for (const a of pageEl.querySelectorAll('a[href^="#"]')) {
          const target = d.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
          if (!target) continue;
          const tp = target.closest('.page');
          const ti = pageEls.indexOf(tp);
          if (ti < 0) continue;
          const r = a.getBoundingClientRect(), tr = target.getBoundingClientRect(), tpr = tp.getBoundingClientRect();
          page.link((r.left - pr.left) * k - 1, (r.top - pr.top) * k, (r.right - pr.left) * k + 1, (r.bottom - pr.top) * k, ti, Math.max(0, (tr.top - tpr.top) * (W / tpr.width) - 6));
        }
        void pi;
      };
      const breathe = ME.U.breather();
      for (let pi = 0; pi < pageEls.length; pi++) {
        onePage(pageEls[pi], pi);
        if (await breathe()) say(0.6 + 0.34 * ((pi + 1) / pageEls.length), 'Writing page ' + (pi + 1) + ' of ' + pageEls.length);
      }
      say(0.95, 'Compressing the PDF…');
      const blob = await doc.save();
      return { blob, pages: pageEls.length, words: count, report: win.__paginated };
    } finally {
      if (!o.keep) frame.remove();
    }
  };

  ME.Capture = C;
})(window.ME);
