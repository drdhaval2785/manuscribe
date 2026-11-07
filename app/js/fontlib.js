'use strict';
/* A font for every script. Each script Unicode encodes has its Noto font (Google's family for all the world's
   scripts, SIL Open Font Licence), serif where Noto has one. The print page and the PDF carry the fonts of the
   scripts in the edition, so that they look the same on every computer, whatever fonts it has.

   A font is fetched the first time an edition needs it, from the Noto project's files on jsDelivr, and kept in this
   browser: after that, nothing is fetched again, and the edition prints offline. Devanagari and Latin are set in
   Tiro Devanagari Sanskrit, fetched in the same way, but only when a transcription or an edition has Devanagari
   (FL.forScreen, FL.needsTiro), so that the app itself carries no font. On screen, Latin is left to the browser,
   which sets it well everywhere; each other script gets its Noto font. Only the glyphs the edition uses go into a page or a PDF (subset), so
   that even a Chinese font adds little. */
(function (ME) {
  const FL = {};
  const NOTO = 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/';
  const GOOGLE = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/';
  const UNHINTED = new Set(['NotoSansOldTurkic', 'NotoSerifKhmer', 'NotoSerifYezidi']);
  // Chinese, Japanese and Korean: Google's variable fonts of Noto Serif, by the edition's language
  const CJK = { NotoSerifJP: 'notoserifjp/NotoSerifJP%5Bwght%5D.ttf', NotoSerifSC: 'notoserifsc/NotoSerifSC%5Bwght%5D.ttf', NotoSerifTC: 'notoseriftc/NotoSerifTC%5Bwght%5D.ttf', NotoSerifKR: 'notoserifkr/NotoSerifKR%5Bwght%5D.ttf' };
  // Manuscribe's own font, for Devanagari and Latin, with its licence
  const TIRO = 'tirodevanagarisanskrit/';
  const OWN = { TiroDevanagariSanskrit: TIRO + 'TiroDevanagariSanskrit-Regular.ttf', 'TiroDevanagariSanskrit-Italic': TIRO + 'TiroDevanagariSanskrit-Italic.ttf', 'TiroDevanagariSanskrit-OFL': TIRO + 'OFL.txt' };
  FL.urlOf = (family) => (OWN[family] ? GOOGLE + OWN[family] : CJK[family] ? GOOGLE + CJK[family] : NOTO + family + '/' + (UNHINTED.has(family) ? 'unhinted' : 'hinted') + '/ttf/' + family + '-Regular.ttf');

  // ISO 15924 script -> its Noto family. Han, Hiragana, Katakana, Bopomofo and Hangul are chosen by the language.
  const S = (s) => Object.fromEntries(s.trim().split(/\s+/).map((x) => x.split(':')));
  FL.SCRIPTS = S(`Latn:NotoSerif Grek:NotoSerif Cyrl:NotoSerif Arab:NotoNaskhArabic Armn:NotoSerifArmenian Hebr:NotoSerifHebrew
    Syrc:NotoSansSyriac Thaa:NotoSansThaana Deva:NotoSerifDevanagari Beng:NotoSerifBengali Guru:NotoSerifGurmukhi Gujr:NotoSerifGujarati
    Orya:NotoSerifOriya Taml:NotoSerifTamil Telu:NotoSerifTelugu Knda:NotoSerifKannada Mlym:NotoSerifMalayalam Sinh:NotoSerifSinhala
    Thai:NotoSerifThai Laoo:NotoSerifLao Tibt:NotoSerifTibetan Mymr:NotoSerifMyanmar Geor:NotoSerifGeorgian Ethi:NotoSerifEthiopic
    Khmr:NotoSerifKhmer Adlm:NotoSansAdlam Aghb:NotoSansCaucasianAlbanian Ahom:NotoSerifAhom Armi:NotoSansImperialAramaic
    Avst:NotoSansAvestan Bali:NotoSerifBalinese Bamu:NotoSansBamum Bass:NotoSansBassaVah Batk:NotoSansBatak Bhks:NotoSansBhaiksuki
    Brah:NotoSansBrahmi Brai:NotoSansSymbols2 Bugi:NotoSansBuginese Buhd:NotoSansBuhid Cakm:NotoSansChakma Cans:NotoSansCanadianAboriginal
    Cari:NotoSansCarian Cham:NotoSansCham Cher:NotoSansCherokee Chrs:NotoSansChorasmian Copt:NotoSansCoptic Cpmn:NotoSansCyproMinoan
    Cprt:NotoSansCypriot Diak:NotoSerifDivesAkuru Dogr:NotoSerifDogra Dsrt:NotoSansDeseret Dupl:NotoSansDuployan
    Egyp:NotoSansEgyptianHieroglyphs Elba:NotoSansElbasan Elym:NotoSansElymaic Glag:NotoSansGlagolitic Gong:NotoSansGunjalaGondi
    Gonm:NotoSansMasaramGondi Goth:NotoSansGothic Gran:NotoSerifGrantha Hano:NotoSansHanunoo Hatr:NotoSansHatran
    Hluw:NotoSansAnatolianHieroglyphs Hmng:NotoSansPahawhHmong Hmnp:NotoSerifNPHmong Hung:NotoSansOldHungarian Ital:NotoSansOldItalic
    Java:NotoSansJavanese Kali:NotoSansKayahLi Kawi:NotoSansKawi Khar:NotoSansKharoshthi Khoj:NotoSerifKhojki
    Kits:NotoSerifKhitanSmallScript Kthi:NotoSansKaithi Lana:NotoSansTaiTham Lepc:NotoSansLepcha Limb:NotoSansLimbu Lina:NotoSansLinearA
    Linb:NotoSansLinearB Lisu:NotoSansLisu Lyci:NotoSansLycian Lydi:NotoSansLydian Mahj:NotoSansMahajani Maka:NotoSerifMakasar
    Mand:NotoSansMandaic Mani:NotoSansManichaean Marc:NotoSansMarchen Medf:NotoSansMedefaidrin Mend:NotoSansMendeKikakui
    Merc:NotoSansMeroitic Mero:NotoSansMeroitic Modi:NotoSansModi Mong:NotoSansMongolian Mroo:NotoSansMro Mtei:NotoSansMeeteiMayek
    Mult:NotoSansMultani Nagm:NotoSansNagMundari Nand:NotoSansNandinagari Narb:NotoSansOldNorthArabian Nbat:NotoSansNabataean
    Newa:NotoSansNewa Nkoo:NotoSansNKo Nshu:NotoSansNushu Ogam:NotoSansOgham Olck:NotoSansOlChiki Orkh:NotoSansOldTurkic
    Osge:NotoSansOsage Osma:NotoSansOsmanya Ougr:NotoSerifOldUyghur Palm:NotoSansPalmyrene Pauc:NotoSansPauCinHau Perm:NotoSansOldPermic
    Phag:NotoSansPhagsPa Phli:NotoSansInscriptionalPahlavi Phlp:NotoSansPsalterPahlavi Phnx:NotoSansPhoenician Plrd:NotoSansMiao
    Prti:NotoSansInscriptionalParthian Rjng:NotoSansRejang Rohg:NotoSansHanifiRohingya Runr:NotoSansRunic Samr:NotoSansSamaritan
    Sarb:NotoSansOldSouthArabian Saur:NotoSansSaurashtra Sgnw:NotoSansSignWriting Shaw:NotoSansShavian Shrd:NotoSansSharada
    Sidd:NotoSansSiddham Sind:NotoSansKhudawadi Sogd:NotoSansSogdian Sogo:NotoSansOldSogdian Sora:NotoSansSoraSompeng
    Soyo:NotoSansSoyombo Sund:NotoSansSundanese Sunu:NotoSansSunuwar Sylo:NotoSansSylotiNagri Tagb:NotoSansTagbanwa Takr:NotoSansTakri
    Tale:NotoSansTaiLe Talu:NotoSansNewTaiLue Tang:NotoSerifTangut Tavt:NotoSansTaiViet Tfng:NotoSansTifinagh Tglg:NotoSansTagalog
    Tirh:NotoSansTirhuta Tnsa:NotoSansTangsa Todr:NotoSerifTodhri Toto:NotoSerifToto Ugar:NotoSansUgaritic Vaii:NotoSansVai
    Vith:NotoSerifVithkuqi Wara:NotoSansWarangCiti Wcho:NotoSansWancho Xpeo:NotoSansOldPersian Xsux:NotoSansCuneiform
    Yezi:NotoSerifYezidi Yiii:NotoSansYi Zanb:NotoSansZanabazarSquare Hani: Hira: Kana: Bopo: Hang:`);
  const has = (code) => { try { return new RegExp('\\p{Script=' + code + '}', 'u'); } catch (e) { return null; } };
  const RE = Object.fromEntries(Object.keys(FL.SCRIPTS).map((c) => [c, has(c)]).filter((x) => x[1]));

  // Han and the rest by the language: Japanese, Korean, Chinese simplified or traditional
  function cjkFamily(code, langs) {
    const ls = (langs || []).map((l) => String(l).toLowerCase());
    if (code === 'Hira' || code === 'Kana' || ls.some((l) => /^ja\b/.test(l))) return 'NotoSerifJP';
    if (code === 'Hang' || ls.some((l) => /^ko\b/.test(l))) return 'NotoSerifKR';
    if (ls.some((l) => /^zh-(hans|cn|sg)\b/.test(l))) return 'NotoSerifSC';
    return 'NotoSerifTC';
  }

  /* The scripts of a text, and the Noto family for each. -> [{script, family}] */
  FL.familiesFor = function (text, langs) {
    const t = String(text || '');
    const out = new Map();
    for (const [code, re] of Object.entries(RE)) {
      if (!re.test(t)) continue;
      const family = FL.SCRIPTS[code] || cjkFamily(code, langs);
      if (family && !out.has(family)) out.set(family, code);
    }
    return [...out].map(([family, script]) => ({ family, script }));
  };

  /* Whether fonts may be fetched: a choice of each person, in this browser (Paper and fonts for printing). Fonts
     already kept are used either way. */
  const KEY = 'manuscribe.fonts';
  FL.fetchAllowed = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  FL.setFetch = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* this visit only */ } };

  /* A family's file: from this browser, or fetched and kept. -> Uint8Array, or null if it cannot be had now */
  const memo = new Map();
  FL.get = async function (family, onFetch) {
    if (memo.has(family)) return memo.get(family);
    const id = 'noto:' + family;
    const kept = ME.Store && ME.Store.getFont ? await ME.Store.getFont(id).catch(() => null) : null;
    if (kept && kept.bytes) { const b = new Uint8Array(kept.bytes); memo.set(family, b); return b; }
    if (!FL.fetchAllowed() || typeof fetch !== 'function' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    try {
      if (onFetch) onFetch(family);
      const r = await fetch(FL.urlOf(family));
      if (!r.ok) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      if (ME.Store && ME.Store.putFont) await ME.Store.putFont({ id, name: family, format: 'ttf', bytes: b, licence: 'SIL Open Font License 1.1', source: FL.urlOf(family) }).catch(() => {});
      memo.set(family, b);
      return b;
    } catch (e) { return null; }
  };

  /* Tiro Devanagari Sanskrit: fetched once, kept, and given to the page as its font for Devanagari and Latin, upright
     and italic. Until it is in (the first time, or with fetching off and nothing kept), the browser's own Devanagari
     font stands in. -> Promise of true if the font is in */
  let tiroFaces = null;
  FL.loadTiro = function () {
    if (!tiroFaces) {
      tiroFaces = (async () => {
        if (typeof FontFace !== 'function' || typeof document === 'undefined') return false;
        let any = false;
        for (const [family, style] of [['TiroDevanagariSanskrit', 'normal'], ['TiroDevanagariSanskrit-Italic', 'italic']]) {
          const b = await FL.get(family);
          if (!b) continue;
          try { const f = new FontFace('Tiro Devanagari Sanskrit', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { style }); await f.load(); document.fonts.add(f); any = true; } catch (e) { /* the browser's font stays */ }
        }
        if (!any) tiroFaces = null; // tried again another time
        return any;
      })();
    }
    return tiroFaces;
  };

  /* Whether a text needs Tiro: if it has Devanagari. (Latin alone is set in the browser's fonts on screen and in Noto
     Serif in print.) */
  FL.needsTiro = (text) => /\p{Script=Devanagari}/u.test(String(text || ''));

  /* The script of a language tag: sa-Latn is Latin, sa (by itself) Devanagari, ar Arabic. -> ISO 15924 code, or null.
     A script written in the tag wins; then these, where browsers' data differ or do not know (Safari's says Ancient
     Greek is Cypriot and Pali Sinhala; Urdu's Aran is Arabic in its Nastaliq style); then the browser's likely one. */
  const LIKELY = { sa: 'Deva', pra: 'Deva', pi: 'Latn', grc: 'Grek', ur: 'Arab', ks: 'Arab' };
  FL.scriptOfTag = (tag) => {
    if (!tag) return null;
    try {
      const l = new Intl.Locale(tag);
      const s = l.script || LIKELY[l.language] || l.maximize().script || null;
      return s === 'Aran' ? 'Arab' : s;
    } catch (e) { return null; }
  };

  /* The font that sets a script on screen: Tiro for Devanagari; none for the scripts every computer and phone has
     fonts for (Latin, Greek, Cyrillic, Armenian, Georgian, Hebrew, Arabic, Thai, Chinese, Japanese, Korean: the
     Chinese, Japanese and Korean Noto fonts are many megabytes); the Noto font for any other. Print and the PDF carry
     their own fonts whatever is on screen. -> family, or null */
  const BROWSER = new Set(['Latn', 'Grek', 'Cyrl', 'Armn', 'Geor', 'Hebr', 'Arab', 'Thai', 'Hani', 'Hira', 'Kana', 'Hang', 'Bopo', 'Jpan', 'Hans', 'Hant', 'Kore', 'Zyyy', 'Zinh', 'Zzzz']);
  FL.screenFamily = (code, langs) => (code === 'Deva' ? 'TiroDevanagariSanskrit' : BROWSER.has(code) ? null : FL.SCRIPTS[code] !== undefined ? FL.SCRIPTS[code] || cjkFamily(code, langs) : null);

  /* Fonts on screen for a transcription: the script of its language tag (what the editor said they would type) and
     the scripts of its text, each font fetched once (where fetching is allowed), kept, and given to the page; the
     Noto families go into the typing area's font stack (--script) after Tiro. onAdded(families): called when fonts
     came in, so that what was laid out can be laid out again. -> Promise of the families added */
  const onScreen = new Map(); // family -> Promise of true if it is in
  FL.onScreen = () => [...onScreen.keys()];
  function setStack() {
    const noto = [...onScreen.keys()].filter((f) => f !== 'TiroDevanagariSanskrit');
    if (!noto.length || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--script', ["'Tiro Devanagari Sanskrit'"].concat(noto.map((f) => "'" + f + "'"), ["'Noto Serif Devanagari'", "'Kohinoor Devanagari'", "'Nirmala UI'", "'Mangal'", 'serif']).join(', '));
  }
  async function screenFace(family) {
    const b = await FL.get(family);
    if (!b || typeof FontFace !== 'function') return false;
    try { const f = new FontFace(family, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); await f.load(); document.fonts.add(f); return true; } catch (e) { return false; }
  }
  FL.forScreen = function (tag, text, onAdded) {
    const langs = tag ? [tag] : [];
    const codes = new Set();
    const own = FL.scriptOfTag(tag);
    if (own) codes.add(own);
    for (const f of FL.familiesFor(String(text || '').slice(0, 60000), langs)) codes.add(f.script);
    const fams = [...new Set([...codes].map((c) => FL.screenFamily(c, langs)).filter(Boolean))].filter((f) => !onScreen.has(f));
    if (!fams.length) return Promise.resolve([]);
    for (const f of fams) onScreen.set(f, (f === 'TiroDevanagariSanskrit' ? FL.loadTiro() : screenFace(f)).then((ok) => { if (!ok) onScreen.delete(f); return ok; }));
    return Promise.all(fams.map((f) => onScreen.get(f))).then((oks) => {
      const added = fams.filter((_, i) => oks[i]);
      if (added.length) { setStack(); if (onAdded) onAdded(added); }
      return added;
    });
  };

  /* Tiro as a file, for the PDF, the print page and the exports: {bytes, base64, licence}, or null if it cannot be
     had now */
  let tiroFile = null;
  FL.tiro = async function () {
    if (tiroFile) return tiroFile;
    const bytes = await FL.get('TiroDevanagariSanskrit');
    if (!bytes) return null;
    const lic = await FL.get('TiroDevanagariSanskrit-OFL');
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    tiroFile = { bytes, base64: btoa(s), licence: lic ? new TextDecoder().decode(lic) : 'SIL Open Font License, Version 1.1 (https://openfontlicense.org)' };
    return tiroFile;
  };

  /* The fonts a text needs, as {family, script, bytes}; those that cannot be had now are left out (missing). text:
     the letters no font at hand has. */
  FL.ensure = async function (text, langs, onFetch) {
    const want = FL.familiesFor(text, langs);
    const out = [], missing = [];
    for (const w of want) {
      const bytes = await FL.get(w.family, onFetch);
      if (bytes) out.push(Object.assign({ bytes }, w)); else missing.push(w);
    }
    return { fonts: out, missing };
  };

  /* ---------- subsetting: only the glyphs used ---------- */

  function tables(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = v.getUint16(4), t = {};
    for (let i = 0; i < n; i++) { const o = 12 + 16 * i; t[String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])] = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) }; }
    return { v, t, version: v.getUint32(0) };
  }

  /* A TrueType font with the glyphs not in `keep` emptied: their numbers stay, so that text set by glyph number is
     unchanged, and composite glyphs keep their parts. mode 'web': the tables a browser lays text out with stay;
     'pdf': only those a PDF draws with. A font of another kind (CFF) is returned as it is. */
  FL.subset = function (bytes, keep, mode) {
    const { v, t } = tables(bytes);
    if (!t.glyf || !t.loca || !t.head || !t.maxp) return bytes;
    const numGlyphs = v.getUint16(t.maxp.off + 4);
    const longLoca = v.getInt16(t.head.off + 50) === 1;
    const loc = (g) => (longLoca ? v.getUint32(t.loca.off + 4 * g) : v.getUint16(t.loca.off + 2 * g) * 2);
    const want = new Set([0]);
    for (const g of keep) if (g < numGlyphs) want.add(g);
    // the parts of composite glyphs
    const stack = [...want];
    while (stack.length) {
      const g = stack.pop();
      const a = t.glyf.off + loc(g), z = t.glyf.off + loc(g + 1);
      if (z - a < 10 || v.getInt16(a) >= 0) continue;
      let p = a + 10;
      for (;;) {
        const flags = v.getUint16(p), comp = v.getUint16(p + 2);
        if (!want.has(comp)) { want.add(comp); stack.push(comp); }
        p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
        if (!(flags & 0x20)) break;
      }
    }
    // the new glyf and loca
    const parts = [];
    let size = 0;
    const loca = new Uint8Array(4 * (numGlyphs + 1));
    const lv = new DataView(loca.buffer);
    for (let g = 0; g < numGlyphs; g++) {
      lv.setUint32(4 * g, size);
      if (!want.has(g)) continue;
      const a = t.glyf.off + loc(g), z = t.glyf.off + loc(g + 1);
      if (z <= a) continue;
      const len = z - a, pad = (4 - (len % 4)) % 4;
      parts.push(bytes.subarray(a, z));
      if (pad) parts.push(new Uint8Array(pad));
      size += len + pad;
    }
    lv.setUint32(4 * numGlyphs, size);
    const glyf = new Uint8Array(size);
    { let o = 0; for (const p of parts) { glyf.set(p, o); o += p.length; } }
    const head = bytes.slice(t.head.off, t.head.off + t.head.len);
    new DataView(head.buffer).setInt16(50, 1);
    new DataView(head.buffer).setUint32(8, 0); // checkSumAdjustment, set below
    const PDF = new Set(['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cvt ', 'fpgm', 'prep', 'name', 'OS/2', 'post', 'cmap']);
    // the outlines of a variable font's other weights go: the page and the PDF use the regular one
    const DROP = new Set(['gvar', 'DSIG']);
    const out = [];
    for (const [tag, r] of Object.entries(t)) {
      if (mode === 'pdf' ? !PDF.has(tag) : DROP.has(tag)) continue;
      if (tag === 'glyf') out.push([tag, glyf]);
      else if (tag === 'loca') out.push([tag, loca]);
      else if (tag === 'head') out.push([tag, head]);
      else out.push([tag, bytes.subarray(r.off, r.off + r.len)]);
    }
    out.sort((x, y) => (x[0] < y[0] ? -1 : 1));
    // the file: its table directory, then each table on four bytes
    const n = out.length;
    let es = 0; while (1 << (es + 1) <= n) es++;
    const dirLen = 12 + 16 * n;
    let total = dirLen;
    for (const [, d] of out) total += d.length + ((4 - (d.length % 4)) % 4);
    const f = new Uint8Array(total);
    const fv = new DataView(f.buffer);
    fv.setUint32(0, 0x00010000); fv.setUint16(4, n); fv.setUint16(6, 16 << es); fv.setUint16(8, es); fv.setUint16(10, n * 16 - (16 << es));
    const sum = (d) => { let s = 0; const dv = new DataView(d.buffer, d.byteOffset, d.length); let i = 0; for (; i + 4 <= d.length; i += 4) s = (s + dv.getUint32(i)) >>> 0; let last = 0; for (let k = 0; i < d.length; i++, k++) last |= d[i] << (24 - 8 * k); return (s + last) >>> 0; };
    let at = dirLen, headAt = 0;
    out.forEach(([tag, d], i) => {
      const o = 12 + 16 * i;
      for (let k = 0; k < 4; k++) f[o + k] = tag.charCodeAt(k);
      fv.setUint32(o + 4, sum(d)); fv.setUint32(o + 8, at); fv.setUint32(o + 12, d.length);
      f.set(d, at);
      if (tag === 'head') headAt = at;
      at += d.length + ((4 - (d.length % 4)) % 4);
    });
    if (headAt) fv.setUint32(headAt + 8, (0xB1B0AFBA - sum(f)) >>> 0);
    return f;
  };

  /* The glyphs a text takes in a font, shaped word by word as the page and the PDF shape it, with each letter's own
     glyph as well. shaper: from Shaper.font. -> Set */
  FL.glyphsOf = function (shaper, text) {
    const used = new Set();
    const seen = new Set();
    const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const ch of new Set(Array.from(text))) { const g = shaper.nominal(ch.codePointAt(0)); if (g) used.add(g); }
    for (const piece of [...seg.segment(text)].map((x) => x.segment).concat(text.split(/\s+/))) {
      if (!piece.trim() || seen.has(piece)) continue;
      seen.add(piece);
      for (const g of shaper.shape(piece)) used.add(g.g);
    }
    return used;
  };

  ME.FontLib = FL;
})(window.ME);
