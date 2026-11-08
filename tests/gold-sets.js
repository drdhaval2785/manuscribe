// Gold sets: real witnesses whose alignment scholars have made by hand, for tests/bench-collate.js. Each is
// downloaded once (from its source, under its licence) and kept in the tests' work folder.
//
// A set: {name, lang, licence, source, blocks: [{id, witnesses: [{siglum, words: [{t, key, scope}]}]}]}. Two words
// of different witnesses truly belong together when they have the same key. Where a place's readings differ in
// length, the words of different readings cannot be paired word by word: they share a scope, and the score neither
// credits nor counts against a method for putting them together.
const fs = require('fs'), path = require('path'), os = require('os');

const CACHE = path.join(os.tmpdir(), 'manuscribe-tests', 'gold');
async function fetchText(url, name) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const r = await fetch(url);
  if (!r.ok) throw new Error('could not fetch ' + url + ' (' + r.status + ')');
  const t = await r.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, t);
  return t;
}
// as the ECM transcribes manuscripts: lower case, no accents or breathings, no elision mark
const plainGreek = (t) => t.normalize('NFD').replace(/[\u0300-\u036f\u02bc\u2019']/g, '').toLowerCase().normalize('NFC');
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* 3 John, Greek: the Editio Critica Maior's collation of 137 witnesses, as open-cbgm gives it (MIT), each variation
   unit with every witness's reading; the words no witness varies in, from the SBL Greek New Testament (CC BY 4.0),
   whose words are numbered as the ECM numbers them (verse 4, where they differ in number, is left out). A unit's
   address is in the ECM's way: an even number is a word (2 the first), an odd one the place between two words. */
async function john3() {
  const xml = await fetchText('https://raw.githubusercontent.com/jjmccollum/open-cbgm/master/examples/3_john_collation.xml', '3john-collation.xml');
  const sbl = await fetchText('https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/3John.txt', 'sblgnt-3john.txt');
  const verses = {};
  for (const line of sbl.replace(/^﻿/, '').split('\n')) {
    const m = /^3John 1:(\d+)\t(.*)$/.exec(line.trim());
    if (m) verses[+m[1]] = m[2].replace(/[⸀-⸅]/g, '').replace(/[.,;·:]/g, '').split(/\s+/).filter(Boolean);
  }
  const witnesses = [...xml.matchAll(/<witness n="([^"]+)"/g)].map((m) => m[1]).filter((w) => w !== 'A' && w !== 'Byz');
  const units = [...xml.matchAll(/<app n="B25K1V(\d+)U(\d+)(?:-(\d+))?">([\s\S]*?)<\/app>/g)].map((m) => {
    const rdgs = [...m[4].matchAll(/<rdg n="([^"]+)"[^>]*?wit="([^"]*)"\s*(?:\/>|>([^<]*)<\/rdg>)/g)].map((r) => ({ n: r[1], wits: r[2].split(/\s+/).filter(Boolean), words: unescape(r[3] || '').split(/\s+/).filter(Boolean) }));
    return { verse: +m[1], a: +m[2], b: +(m[3] || m[2]), id: 'V' + m[1] + 'U' + m[2] + (m[3] ? '-' + m[3] : ''), rdgs };
  });
  const blocks = [];
  for (const v of Object.keys(verses).map(Number).sort((x, y) => x - y)) {
    if (v === 4) continue; // the SBL has one word more than the ECM's base here, so its numbering does not hold
    const base = verses[v];
    const us = units.filter((u) => u.verse === v);
    // a witness, only where it is cited in every unit of the verse (otherwise lost or unclear there)
    const cited = (u, w) => u.rdgs.some((r) => r.wits.includes(w));
    const wits = witnesses.filter((w) => us.every((u) => cited(u, w)));
    const readingOf = (u, w) => u.rdgs.find((r) => r.wits.includes(w));
    const out = [];
    for (const w of wits) {
      // the units this witness's text comes from: a long unit where it reads otherwise than the base, else the short ones in it
      const take = us.filter((u) => {
        const outer = us.find((o) => o !== u && o.a <= u.a && o.b >= u.b && (o.a !== u.a || o.b !== u.b));
        return !(outer && readingOf(outer, w).n !== 'a');
      }).filter((u) => !us.some((i) => i !== u && u.a <= i.a && u.b >= i.b && (i.a !== u.a || i.b !== u.b) && readingOf(u, w).n === 'a'));
      const words = [];
      // the readings of a unit: if all that have words are as long, a word's place is its position; else its reading
      const keyOf = (u, r, k) => { const lens = new Set(u.rdgs.filter((x) => x.words.length).map((x) => x.words.length)); return lens.size === 1 ? u.id + ':' + k : u.id + ':' + r.n + ':' + k; };
      for (let addr = 1; addr <= base.length * 2 + 1; addr++) {
        const u = take.find((x) => x.a === addr);
        if (u) {
          const r = readingOf(u, w);
          r.words.forEach((t, k) => words.push({ t: plainGreek(t), key: keyOf(u, r, k), scope: u.id }));
          addr = u.b;
          continue;
        }
        if (addr % 2 === 0) words.push({ t: plainGreek(base[addr / 2 - 1]), key: 'w' + addr, scope: null });
      }
      out.push({ siglum: w, words });
    }
    blocks.push({ id: '3 John ' + v, witnesses: out });
  }
  return { name: '3 John (Greek): the ECM collation, 137 manuscripts', lang: 'grc', licence: 'collation MIT (open-cbgm, from the ECM); text CC BY 4.0 (SBL Greek New Testament)', source: 'https://github.com/jjmccollum/open-cbgm', blocks };
}

module.exports = { john3, CACHE };

if (require.main === module) (async () => {
  const s = await john3();
  console.log(s.name + ': ' + s.blocks.length + ' verses');
  for (const b of s.blocks) console.log('  ' + b.id + ': ' + b.witnesses.length + ' witnesses, ' + Math.min(...b.witnesses.map((w) => w.words.length)) + '–' + Math.max(...b.witnesses.map((w) => w.words.length)) + ' words; e.g. ' + b.witnesses[0].siglum + ': ' + b.witnesses[0].words.map((x) => x.t).join(' ').slice(0, 70));
})().catch((e) => { console.log('Failed: ' + e.message); process.exitCode = 1; });
