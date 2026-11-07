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

  /* doc: {page(w, h) -> page, save() -> Promise<Blob>}. fontBytes: the TTF; shaper: from Shaper.font. */
  W.doc = function (fontBytes, info, shaper) {
    const font = readFont(fontBytes);
    const pages = [];
    const used = new Map(); // glyph -> text it stands for, for ToUnicode
    const k = 1000 / font.upem;
    /* What a glyph stands for, for copying text where ActualText is not read. In each cluster, a glyph that is the
       font's own glyph for one of its letters stands for that letter; the letters left over go to the first glyph
       not so matched, as to a conjunct. The first use of a glyph decides. */
    function mapsFor(gl, text) {
      const starts = [...new Set(gl.map((g) => g.cl))].sort((a, b) => a - b);
      for (let c = 0; c < starts.length; c++) {
        const idx = gl.map((g, j) => j).filter((j) => gl[j].cl === starts[c]);
        if (idx.every((j) => used.has(gl[j].g))) continue;
        const letters = Array.from(text.slice(starts[c], c + 1 < starts.length ? starts[c + 1] : text.length));
        const said = new Map();
        const left = [];
        for (const ch of letters) {
          const n = shaper && shaper.nominal ? shaper.nominal(ch.codePointAt(0)) : 0;
          const j = idx.find((k) => !said.has(k) && n && gl[k].g === n);
          if (j === undefined) left.push(ch); else said.set(j, ch);
        }
        let rest = idx.filter((k) => !said.has(k));
        // the leftover letters, in syllables: a consonant with its virama, or a sign
        const units = left.join('').match(/[\u0915-\u0939\u0958-\u095F](?:\u093C)?\u094D?|./gu) || [];
        if (rest.length > 1) {
          // the short i is drawn before its consonant, and a reph after the rest
          const iAt = units.indexOf('\u093F');
          if (iAt >= 0) { said.set(rest[0], units.splice(iAt, 1)[0]); rest = rest.slice(1); }
          if (rest.length > 1 && units[0] === '\u0930\u094D' && letters[0] === '\u0930') { said.set(rest[rest.length - 1], units.shift()); rest = rest.slice(0, -1); }
        }
        rest.forEach((k, i) => said.set(k, i === rest.length - 1 ? units.slice(i).join('') : units[i] || '\u200B'));
        if (!rest.length && units.length && idx.length) said.set(idx[0], (said.get(idx[0]) || '') + units.join(''));
        for (const k of idx) if (!used.has(gl[k].g) || (!used.get(gl[k].g) && said.get(k))) used.set(gl[k].g, said.get(k) || '');
      }
    }
    const doc = {
      font,
      page(w, h) {
        const ops = [];
        const p = {
          w, h, ops, links: [], index: pages.length,
          /* a link from the box x1..x2, y1..y2 (y down from the top) to a place on a page of this document */
          link(x1, y1, x2, y2, page, y) { p.links.push({ rect: [x1, h - y2, x2, h - y1], page, y }); },
          /* glyphs from the shaper at (x, y), y down from the top; text: what they spell */
          glyphs(gl, x, y, size, text, color) {
            if (!gl.length) return;
            const s = size / font.upem;
            ops.push('/Span <</ActualText <' + utf16hex(text) + '>>> BDC');
            if (color) ops.push(color.map(num).join(' ') + ' rg');
            ops.push('BT /F1 ' + num(size) + ' Tf 1 0 0 1 ' + num(x) + ' ' + num(h - y) + ' Tm');
            mapsFor(gl, text);
            /* One run for the word: each glyph advances by its own width in the font, and the shaper's positions are
               kept by kerning steps, with a rise for marks set above or below, so that readers see one word. */
            let pen = 0, peny = 0, at = 0; // at: where the PDF's pen is, in font units
            let run = [];
            const flushRun = () => { if (run.length) ops.push('[' + run.join(' ') + '] TJ'); run = []; };
            for (const g of gl) {
              const want = pen + g.dx;
              const d = want - at;
              if (Math.abs(d) > 0.5) run.push(num(-d * 1000 / font.upem));
              const rise = (peny + g.dy) * size / font.upem;
              if (Math.abs(rise) > 0.01) { flushRun(); ops.push(num(rise) + ' Ts'); ops.push('[<' + hex4(g.g) + '>] TJ'); ops.push('0 Ts'); }
              else run.push('<' + hex4(g.g) + '>');
              at = want + font.adv[g.g];
              pen += g.ax; peny += g.ay;
            }
            flushRun();
            ops.push('ET');
            if (color) ops.push('0 0 0 rg');
            ops.push('EMC');
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
        const fontFile = add(await streamObj('/Length1 ' + fontBytes.length, fontBytes));
        const desc = add('<< /Type /FontDescriptor /FontName /' + font.name + ' /Flags 4 /FontBBox [' + font.bbox.join(' ') + '] /ItalicAngle ' + num(font.italic) + ' /Ascent ' + font.ascent + ' /Descent ' + font.descent + ' /CapHeight ' + font.cap + ' /StemV 80 /FontFile2 ' + fontFile + ' 0 R >>');
        const glyphs = [...used.keys()].sort((a, b) => a - b);
        const wArr = glyphs.map((g) => g + ' [' + Math.round(font.adv[g] * k) + ']').join(' ');
        const cid = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + font.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc + ' 0 R /DW 1000 /W [' + wArr + '] /CIDToGIDMap /Identity >>');
        const entries = glyphs.filter((g) => used.get(g)).map((g) => '<' + hex4(g) + '> <' + utf16hex(used.get(g)).slice(4) + '>');
        let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
        for (let i = 0; i < entries.length; i += 100) cmap += Math.min(100, entries.length - i) + ' beginbfchar\n' + entries.slice(i, i + 100).join('\n') + '\nendbfchar\n';
        cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
        const toUni = add(await streamObj('', cmap));
        const type0 = add('<< /Type /Font /Subtype /Type0 /BaseFont /' + font.name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + toUni + ' 0 R >>');
        const pagesId = objs.length + pages.length * 2 + 1; // placed after the pages and their contents
        const pageIds = [];
        // each page is its contents and then itself, so the number of any page is known before it is written
        const first = objs.length + 1;
        const idOfPage = (i) => first + 2 * i + 1;
        for (const p of pages) {
          const content = add(await streamObj('', p.ops.join('\n')));
          const annots = p.links.length ? ' /Annots [' + p.links.map((l) => '<< /Type /Annot /Subtype /Link /Rect [' + l.rect.map(num).join(' ') + '] /Border [0 0 0] /Dest [' + idOfPage(l.page) + ' 0 R /XYZ null ' + num(pages[l.page].h - l.y) + ' null] >>').join(' ') + ']' : '';
          pageIds.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + num(p.w) + ' ' + num(p.h) + '] /Resources << /Font << /F1 ' + type0 + ' 0 R >> >> /Contents ' + content + ' 0 R' + annots + ' >>'));
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
