'use strict';
/* A small PDF writer: pages of shaped text and lines, in one embedded TrueType font. Each glyph is set where the
   shaper put it, by its glyph id (a CID font with Identity-H), so that the conjuncts and marks of Devanagari come
   out as the font draws them; each word carries its letters as ActualText, and a ToUnicode map is given as well,
   so that the text can be searched and copied. Streams are compressed with the browser's own deflate. */
(function (ME) {
  const W = {};

  // the tables of a TrueType font that a PDF needs to describe it
  function readFont(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = v.getUint16(4);
    const t = {};
    for (let i = 0; i < n; i++) { const o = 12 + 16 * i; t[String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])] = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) }; }
    const head = t.head.off, hhea = t.hhea.off, os2 = t['OS/2'] ? t['OS/2'].off : null, post = t.post ? t.post.off : null;
    const upem = v.getUint16(head + 18);
    const bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
    const ascent = v.getInt16(hhea + 4), descent = v.getInt16(hhea + 6), nHM = v.getUint16(hhea + 34);
    const numGlyphs = v.getUint16(t.maxp.off + 4);
    const adv = new Uint16Array(numGlyphs);
    let last = 0;
    for (let g = 0; g < numGlyphs; g++) { if (g < nHM) last = v.getUint16(t.hmtx.off + 4 * g); adv[g] = last; }
    const cap = os2 && v.getUint16(os2) >= 2 ? v.getInt16(os2 + 88) : ascent;
    const italic = post ? v.getInt32(post + 4) / 65536 : 0;
    // the PostScript name, from the name table
    let name = 'Font';
    if (t.name) {
      const nb = t.name.off, count = v.getUint16(nb + 2), strings = nb + v.getUint16(nb + 4);
      for (let i = 0; i < count; i++) {
        const r = nb + 6 + 12 * i;
        if (v.getUint16(r + 6) !== 6) continue;
        const len = v.getUint16(r + 8), off = strings + v.getUint16(r + 10), plat = v.getUint16(r);
        let s = '';
        if (plat === 3 || plat === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k));
        else for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[off + k]);
        if (s) { name = s.replace(/[^\x21-\x7e]/g, ''); break; }
      }
    }
    const k = 1000 / upem;
    return { upem, numGlyphs, adv, name, bbox: bbox.map((x) => Math.round(x * k)), ascent: Math.round(ascent * k), descent: Math.round(descent * k), cap: Math.round(cap * k), italic };
  }

  const enc = new TextEncoder();
  async function deflate(data) {
    if (typeof CompressionStream !== 'function') return null;
    const s = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const hex4 = (n) => n.toString(16).padStart(4, '0');
  const utf16hex = (s) => { let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i)).toUpperCase(); return h; };
  const num = (x) => (Math.round(x * 1000) / 1000).toString();
  const str = (s) => '(' + String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '') + ')';

  /* doc: {page(w, h) -> page, addFont(bytes, shaper) -> index, save() -> Promise<Blob>}. fontBytes: the TTF of
     font 0; shaper: from Shaper.font. Further TrueType fonts may be added. Text can also go in as pictures of words
     drawn by the browser, each with an invisible copy of its letters over it, so that it can be searched and copied:
     the way for a script none of the fonts has. */
  W.doc = function (fontBytes, info, shaper) {
    const fonts = [];
    const pages = [];
    const images = new Map(); // key -> {index, w, h, alpha, color}
    const hidden = new Map(); // character -> CID, for the invisible letters
    const addFont = (bytes, sh) => {
      const font = readFont(bytes);
      fonts.push({ bytes, font, shaper: sh, used: new Map() });
      return fonts.length - 1;
    };
    addFont(fontBytes, shaper);
    const font = fonts[0].font;
    /* What a glyph stands for, for copying text where ActualText is not read. In each cluster, a glyph that is the
       font's own glyph for one of its letters stands for that letter; the letters left over go to the first glyph
       not so matched, as to a conjunct. The first use of a glyph decides. */
    function mapsFor(F, gl, text) {
      const used = F.used, sh = F.shaper;
      const starts = [...new Set(gl.map((g) => g.cl))].sort((a, b) => a - b);
      for (let c = 0; c < starts.length; c++) {
        const idx = gl.map((g, j) => j).filter((j) => gl[j].cl === starts[c]);
        if (idx.every((j) => used.has(gl[j].g))) continue;
        const letters = Array.from(text.slice(starts[c], c + 1 < starts.length ? starts[c + 1] : text.length));
        const said = new Map();
        const left = [];
        for (const ch of letters) {
          const n = sh && sh.nominal ? sh.nominal(ch.codePointAt(0)) : 0;
          const j = idx.find((k) => !said.has(k) && n && gl[k].g === n);
          if (j === undefined) left.push(ch); else said.set(j, ch);
        }
        let rest = idx.filter((k) => !said.has(k));
        // the leftover letters, in syllables: a consonant with its virama, or a sign
        const units = left.join('').match(/[क-हक़-य़](?:़)?्?|./gu) || [];
        if (rest.length > 1) {
          // the short i is drawn before its consonant, and a reph after the rest
          const iAt = units.indexOf('ि');
          if (iAt >= 0) { said.set(rest[0], units.splice(iAt, 1)[0]); rest = rest.slice(1); }
          if (rest.length > 1 && units[0] === 'र्' && letters[0] === 'र') { said.set(rest[rest.length - 1], units.shift()); rest = rest.slice(0, -1); }
        }
        rest.forEach((k, i) => said.set(k, i === rest.length - 1 ? units.slice(i).join('') : units[i] || '​'));
        if (!rest.length && units.length && idx.length) said.set(idx[0], (said.get(idx[0]) || '') + units.join(''));
        for (const k of idx) if (!used.has(gl[k].g) || (!used.get(gl[k].g) && said.get(k))) used.set(gl[k].g, said.get(k) || '');
      }
    }
    const doc = {
      font,
      addFont,
      page(w, h) {
        const ops = [];
        const p = {
          w, h, ops, links: [], index: pages.length, xobjects: new Set(), fontsUsed: new Set([0]),
          /* a link from the box x1..x2, y1..y2 (y down from the top) to a place on a page of this document */
          link(x1, y1, x2, y2, page, y) { p.links.push({ rect: [x1, h - y2, x2, h - y1], page, y }); },
          /* glyphs from the shaper at (x, y), y down from the top; text: what they spell. o: {font: index, scale: the
             word's width over its natural width, to fit the place the browser gave it} */
          glyphs(gl, x, y, size, text, color, o) {
            if (!gl.length) return;
            const fi = (o && o.font) || 0, F = fonts[fi], fnt = F.font;
            p.fontsUsed.add(fi);
            ops.push('/Span <</ActualText <' + utf16hex(text) + '>>> BDC');
            if (color) ops.push(color.map(num).join(' ') + ' rg');
            // bold, where the font has no bold face: the letters are also stroked, in their own colour, a little
            if (o && o.bold) ops.push('q ' + (color || [0, 0, 0]).map(num).join(' ') + ' RG ' + num(size * 0.03) + ' w');
            // the scaling and the rendering mode last beyond a text object: each word sets its own
            ops.push('BT ' + (o && o.bold ? 2 : 0) + ' Tr /F' + (fi + 1) + ' ' + num(size) + ' Tf ' + num(o && o.scale ? o.scale * 100 : 100) + ' Tz 1 0 0 1 ' + num(x) + ' ' + num(h - y) + ' Tm');
            mapsFor(F, gl, text);
            /* One run for the word: each glyph advances by its own width in the font, and the shaper's positions are
               kept by kerning steps, with a rise for marks set above or below, so that readers see one word. */
            let pen = 0, peny = 0, at = 0; // at: where the PDF's pen is, in font units
            let run = [];
            const flushRun = () => { if (run.length) ops.push('[' + run.join(' ') + '] TJ'); run = []; };
            for (const g of gl) {
              const want = pen + g.dx;
              const d = want - at;
              if (Math.abs(d) > 0.5) run.push(num(-d * 1000 / fnt.upem));
              const rise = (peny + g.dy) * size / fnt.upem;
              if (Math.abs(rise) > 0.01) { flushRun(); ops.push(num(rise) + ' Ts'); ops.push('[<' + hex4(g.g) + '>] TJ'); ops.push('0 Ts'); }
              else run.push('<' + hex4(g.g) + '>');
              at = want + fnt.adv[g.g];
              pen += g.ax; peny += g.ay;
            }
            flushRun();
            ops.push('ET');
            if (o && o.bold) ops.push('Q');
            if (color) ops.push('0 0 0 rg');
            ops.push('EMC');
          },
          /* A picture of a word, drawn by the browser: the same picture is kept once and used again. make() ->
             {w, h, alpha: Uint8Array (w*h), color: [r, g, b] 0..1}. Placed in the box x, y (top), width, height. */
          image(key, make, x, y, width, height) {
            if (!images.has(key)) { const im = make(); if (!im) return; images.set(key, Object.assign({ index: images.size + 1 }, im)); }
            const im = images.get(key);
            p.xobjects.add(im.index);
            ops.push('q ' + num(width) + ' 0 0 ' + num(height) + ' ' + num(x) + ' ' + num(h - y - height) + ' cm /Im' + im.index + ' Do Q');
          },
          /* The letters of a word, invisible, over its picture: what search and copying find there. */
          hiddenText(text, x, y, size, width) {
            // in the order it is drawn, as a PDF holds text: a word written right to left, last letter first, so
            // that a reader, putting it back in reading order, gets it right
            const rtl = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u.test(text);
            const cps = rtl ? Array.from(text).reverse() : Array.from(text);
            if (!cps.length || width <= 0) return;
            let codes = '';
            for (const ch of cps) { if (!hidden.has(ch)) hidden.set(ch, hidden.size + 1); codes += hex4(hidden.get(ch)); }
            const natural = (cps.length * 500 * size) / 1000;
            p.hasHidden = true;
            ops.push('BT 3 Tr /FH ' + num(size) + ' Tf ' + num((width / natural) * 100) + ' Tz 1 0 0 1 ' + num(x) + ' ' + num(h - y) + ' Tm <' + codes + '> Tj 0 Tr 100 Tz ET');
          },
          line(x1, y1, x2, y2, width, dash) {
            ops.push(num(width || 0.5) + ' w' + (dash ? ' [' + dash.join(' ') + '] 0 d' : '') + ' ' + num(x1) + ' ' + num(h - y1) + ' m ' + num(x2) + ' ' + num(h - y2) + ' l S' + (dash ? ' [] 0 d' : ''));
          },
        };
        pages.push(p);
        return p;
      },
      async save() {
        const objs = [];
        const add = (body) => { objs.push(body); return objs.length; };
        const streamObj = async (dict, data) => {
          const bytes = typeof data === 'string' ? enc.encode(data) : data;
          const z = await deflate(bytes);
          return { dict: dict + (z ? ' /Filter /FlateDecode' : '') + ' /Length ' + (z || bytes).length, data: z || bytes };
        };
        const cmapOf = (entries) => {
          let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
          for (let i = 0; i < entries.length; i += 100) cmap += Math.min(100, entries.length - i) + ' beginbfchar\n' + entries.slice(i, i + 100).join('\n') + '\nendbfchar\n';
          return cmap + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
        };
        // each font: its file, its description, its glyphs, what they spell
        const fontRefs = [];
        let file0 = 0, desc0 = 0;
        for (const F of fonts) {
          const f = F.font, kk = 1000 / f.upem;
          // only the glyphs this PDF uses (FontLib.subset): numbers kept, the rest emptied
          const data = ME.FontLib ? ME.FontLib.subset(F.bytes, F.used.keys(), 'pdf') : F.bytes;
          const fontFile = add(await streamObj('/Length1 ' + data.length, data));
          const desc = add('<< /Type /FontDescriptor /FontName /' + f.name + ' /Flags 4 /FontBBox [' + f.bbox.join(' ') + '] /ItalicAngle ' + num(f.italic) + ' /Ascent ' + f.ascent + ' /Descent ' + f.descent + ' /CapHeight ' + f.cap + ' /StemV 80 /FontFile2 ' + fontFile + ' 0 R >>');
          if (!file0) { file0 = fontFile; desc0 = desc; }
          const glyphs = [...F.used.keys()].sort((a, b) => a - b);
          const wArr = glyphs.map((g) => g + ' [' + Math.round(f.adv[g] * kk) + ']').join(' ');
          const cid = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + f.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc + ' 0 R /DW 1000 /W [' + wArr + '] /CIDToGIDMap /Identity >>');
          const entries = glyphs.filter((g) => F.used.get(g)).map((g) => '<' + hex4(g) + '> <' + utf16hex(F.used.get(g)).slice(4) + '>');
          const toUni = add(await streamObj('', cmapOf(entries)));
          fontRefs.push(add('<< /Type /Font /Subtype /Type0 /BaseFont /' + f.name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + toUni + ' 0 R >>'));
        }
        // the invisible letters: a font of their own, on the file of font 0, whose codes spell them
        let hiddenRef = 0;
        if (hidden.size) {
          const entries = [...hidden].map(([ch, c]) => '<' + hex4(c) + '> <' + utf16hex(ch).slice(4) + '>');
          const cid = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + fonts[0].font.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc0 + ' 0 R /DW 500 /CIDToGIDMap /Identity >>');
          const toUni = add(await streamObj('', cmapOf(entries)));
          hiddenRef = add('<< /Type /Font /Subtype /Type0 /BaseFont /' + fonts[0].font.name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + toUni + ' 0 R >>');
        }
        void file0;
        // the pictures of words: their colour, shown through their shape
        const imageRefs = new Map();
        for (const im of images.values()) {
          const mask = add(await streamObj('/Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceGray /BitsPerComponent 8', im.alpha));
          const rgb = new Uint8Array(im.color.map((v) => Math.round(v * 255)));
          imageRefs.set(im.index, add(await streamObj('/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ' + mask + ' 0 R', rgb)));
        }
        const pagesId = objs.length + pages.length * 2 + 1; // placed after the pages and their contents
        const pageIds = [];
        // each page is its contents and then itself, so the number of any page is known before it is written
        const first = objs.length + 1;
        const idOfPage = (i) => first + 2 * i + 1;
        for (const p of pages) {
          const content = add(await streamObj('', p.ops.join('\n')));
          const annots = p.links.length ? ' /Annots [' + p.links.map((l) => '<< /Type /Annot /Subtype /Link /Rect [' + l.rect.map(num).join(' ') + '] /Border [0 0 0] /Dest [' + idOfPage(l.page) + ' 0 R /XYZ null ' + num(pages[l.page].h - l.y) + ' null] >>').join(' ') + ']' : '';
          const fontRes = [...p.fontsUsed].map((i) => '/F' + (i + 1) + ' ' + fontRefs[i] + ' 0 R').join(' ') + (p.hasHidden && hiddenRef ? ' /FH ' + hiddenRef + ' 0 R' : '');
          const xRes = p.xobjects.size ? ' /XObject << ' + [...p.xobjects].map((i) => '/Im' + i + ' ' + imageRefs.get(i) + ' 0 R').join(' ') + ' >>' : '';
          pageIds.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + num(p.w) + ' ' + num(p.h) + '] /Resources << /Font << ' + fontRes + ' >>' + xRes + ' >> /Contents ' + content + ' 0 R' + annots + ' >>'));
        }
        const pagesObj = add('<< /Type /Pages /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>');
        if (pagesObj !== pagesId) throw new Error('PDF objects out of order');
        const infoObj = add('<< /Title <' + utf16hex((info && info.title) || '') + '> /Author <' + utf16hex((info && info.author) || '') + '> /Subject <' + utf16hex((info && info.subject) || '') + '> /Creator ' + str('Manuscribe ' + (ME.VERSION || '')) + ' /Producer ' + str('Manuscribe, with HarfBuzz') + ' /CreationDate ' + str('D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z') + ' >>');
        const catalog = add('<< /Type /Catalog /Pages ' + pagesObj + ' 0 R /MarkInfo << /Marked true >> /Lang ' + str((info && info.lang) || 'sa') + ' >>');
        // write it out, with the cross-reference table
        const parts = [];
        let size = 0;
        const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); size += b.length; };
        put('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
        const offsets = [];
        for (let i = 0; i < objs.length; i++) {
          offsets.push(size);
          const o = objs[i];
          if (typeof o === 'string') put((i + 1) + ' 0 obj\n' + o + '\nendobj\n');
          else { put((i + 1) + ' 0 obj\n<<' + o.dict + ' >>\nstream\n'); put(o.data); put('\nendstream\nendobj\n'); }
        }
        const xref = size;
        put('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
        put('trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + infoObj + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
        return new Blob(parts, { type: 'application/pdf' });
      },
    };
    return doc;
  };

  W.readFont = readFont;
  ME.PDFWriter = W;
})(window.ME);
