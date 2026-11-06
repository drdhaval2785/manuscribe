// Makes app/vendor/metres.js from the metre lists of Shreevatsa Rajagopalan's "sanskrit" project
// (https://github.com/shreevatsa/sanskrit, GPL-2.0), whose Vṛttaratnākara list and large list were input by
// Dr. Dhaval Patel. A page opened from disk cannot fetch a JSON file, so the lists become one script.
//
//   node tools/bundle-metres.mjs <folder with ganesh.json curated.json vrttaratnakara.json mishra.json> <commit>
//
// Each metre: [name, kind, patterns, yati, tier, aliases]. kind is sama (one pattern for all four pādas),
// ardhasama (odd and even) or viṣama (four). Patterns are of L and G only; yati lists, per pāda, the syllables
// after which the source marks a caesura. tier: 0 the best known (Ganesh, curated), 1 the Vṛttaratnākara, 2 the
// large list. A metre with the same patterns as one before it adds its name to that one's aliases.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const [dir, commit] = process.argv.slice(2);
if (!dir || !commit) { console.error('usage: node tools/bundle-metres.mjs <data folder> <commit>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [['ganesh', 0], ['curated', 0], ['vrttaratnakara', 1], ['mishra', 2]];

const out = [];
const byKey = new Map();
const skipped = [];
const pada = (s) => {
  // spaces and dashes mark caesuras; anything else but L and G is a pattern this cannot use
  const yati = [];
  let pat = '';
  for (const c of s) {
    if (c === 'L' || c === 'G') pat += c;
    else if (/[\s—–-]/.test(c)) { if (pat.length && yati[yati.length - 1] !== pat.length) yati.push(pat.length); }
    else return null;
  }
  return pat.length ? { pat, yati: yati.filter((y) => y < pat.length) } : null;
};
for (const [file, tier] of SOURCES) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file + '.json'), 'utf8'));
  for (const [name, desc] of data.metres) {
    let d = desc;
    if (d && !Array.isArray(d) && typeof d === 'object') {
      if (!d.pattern) { skipped.push(name + ' (' + file + ': ' + (d.regex ? 'a regex' : 'no pattern') + ')'); continue; }
      d = d.pattern;
    }
    const list = Array.isArray(d) ? d : [d];
    if (![1, 2, 4].includes(list.length)) { skipped.push(name + ' (' + file + ': ' + list.length + ' patterns)'); continue; }
    const ps = list.map(pada);
    if (ps.some((p) => !p)) { skipped.push(name + ' (' + file + ': not L and G)'); continue; }
    const kind = ps.length === 1 ? 'sama' : ps.length === 2 ? 'ardhasama' : 'viṣama';
    const key = kind + ':' + ps.map((p) => p.pat).join('/');
    if (byKey.has(key)) { const m = byKey.get(key); if (m[0] !== name && !m[5].includes(name)) m[5].push(name); continue; }
    const m = [name, kind, ps.map((p) => p.pat), ps.map((p) => p.yati), tier, []];
    byKey.set(key, m);
    out.push(m);
  }
}
const head = '/* Generated from the metre lists of "sanskrit" by Shreevatsa Rajagopalan (GPL-2.0),\n'
  + '   https://github.com/shreevatsa/sanskrit, commit ' + commit.slice(0, 7) + ', data/{ganesh,curated,vrttaratnakara,mishra}.json.\n'
  + '   The Vṛttaratnākara list and the large list were input by Dr. Dhaval Patel; the large list is based on Marcis\n'
  + '   Gasuns\'s scraping of the site by Anand Mishra, http://sanskrit.sai.uni-heidelberg.de/Chanda/HTML/.\n'
  + '   Made by tools/bundle-metres.mjs. Do not edit by hand.\n'
  + '   Each metre: [name, kind, patterns, yati, tier, aliases]. */\n';
const body = 'window.ME = window.ME || {};\nME.METRES = {\n  source: ' + JSON.stringify('shreevatsa/sanskrit@' + commit.slice(0, 7)) + ',\n  list: [\n'
  + out.map((m) => '    ' + JSON.stringify(m)).join(',\n') + ',\n  ],\n};\n';
fs.writeFileSync(path.join(ROOT, 'app/vendor/metres.js'), head + body);
const count = (k) => out.filter((m) => m[1] === k).length;
console.log(out.length + ' metres: ' + count('sama') + ' sama, ' + count('ardhasama') + ' ardhasama, ' + count('viṣama') + ' viṣama; '
  + out.reduce((a, m) => a + m[5].length, 0) + ' further names; skipped ' + skipped.length + ': ' + skipped.join('; '));
