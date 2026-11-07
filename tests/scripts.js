// Every script Unicode encodes, ancient and modern: dummy words made of each script's own letters and marks, as
// Unicode gives them, for the script test and the benchmark. A witness in a script is tagged und-Xxxx (a language
// not said, in that script), as a transcriber of a text in an unknown or unnamed language would tag it.

// ISO 15924 code -> English name, for every script in Unicode 17.0
const NAMES = {
  Adlm: 'Adlam', Aghb: 'Caucasian Albanian', Ahom: 'Ahom', Arab: 'Arabic', Armi: 'Imperial Aramaic', Armn: 'Armenian', Avst: 'Avestan',
  Bali: 'Balinese', Bamu: 'Bamum', Bass: 'Bassa Vah', Batk: 'Batak', Beng: 'Bengali', Berf: 'Beria Erfe', Bhks: 'Bhaiksuki', Bopo: 'Bopomofo',
  Brah: 'Brahmi', Brai: 'Braille', Bugi: 'Buginese', Buhd: 'Buhid', Cakm: 'Chakma', Cans: 'Canadian Syllabics', Cari: 'Carian', Cham: 'Cham',
  Cher: 'Cherokee', Chrs: 'Chorasmian', Copt: 'Coptic', Cpmn: 'Cypro-Minoan', Cprt: 'Cypriot', Cyrl: 'Cyrillic', Deva: 'Devanagari',
  Diak: 'Dives Akuru', Dogr: 'Dogra', Dsrt: 'Deseret', Dupl: 'Duployan', Egyp: 'Egyptian hieroglyphs', Elba: 'Elbasan', Elym: 'Elymaic',
  Ethi: 'Ethiopic', Gara: 'Garay', Geor: 'Georgian', Glag: 'Glagolitic', Gong: 'Gunjala Gondi', Gonm: 'Masaram Gondi', Goth: 'Gothic',
  Gran: 'Grantha', Grek: 'Greek', Gujr: 'Gujarati', Gukh: 'Gurung Khema', Guru: 'Gurmukhi', Hang: 'Hangul', Hani: 'Han', Hano: 'Hanunoo',
  Hatr: 'Hatran', Hebr: 'Hebrew', Hira: 'Hiragana', Hluw: 'Anatolian hieroglyphs', Hmng: 'Pahawh Hmong', Hmnp: 'Nyiakeng Puachue Hmong',
  Hung: 'Old Hungarian', Ital: 'Old Italic', Java: 'Javanese', Kali: 'Kayah Li', Kana: 'Katakana', Kawi: 'Kawi', Khar: 'Kharoshthi',
  Khmr: 'Khmer', Khoj: 'Khojki', Kits: 'Khitan small script', Knda: 'Kannada', Krai: 'Kirat Rai', Kthi: 'Kaithi', Lana: 'Tai Tham', Laoo: 'Lao',
  Latn: 'Latin', Lepc: 'Lepcha', Limb: 'Limbu', Lina: 'Linear A', Linb: 'Linear B', Lisu: 'Lisu', Lyci: 'Lycian', Lydi: 'Lydian',
  Mahj: 'Mahajani', Maka: 'Makasar', Mand: 'Mandaic', Mani: 'Manichaean', Marc: 'Marchen', Medf: 'Medefaidrin', Mend: 'Mende Kikakui',
  Merc: 'Meroitic cursive', Mero: 'Meroitic hieroglyphs', Mlym: 'Malayalam', Modi: 'Modi', Mong: 'Mongolian', Mroo: 'Mro', Mtei: 'Meetei Mayek',
  Mult: 'Multani', Mymr: 'Myanmar', Nagm: 'Nag Mundari', Nand: 'Nandinagari', Narb: 'Old North Arabian', Nbat: 'Nabataean', Newa: 'Newa',
  Nkoo: "N'Ko", Nshu: 'Nüshu', Ogam: 'Ogham', Olck: 'Ol Chiki', Onao: 'Ol Onal', Orkh: 'Old Turkic', Orya: 'Odia', Osge: 'Osage', Osma: 'Osmanya',
  Ougr: 'Old Uyghur', Palm: 'Palmyrene', Pauc: 'Pau Cin Hau', Perm: 'Old Permic', Phag: 'Phags-pa', Phli: 'Inscriptional Pahlavi',
  Phlp: 'Psalter Pahlavi', Phnx: 'Phoenician', Plrd: 'Miao', Prti: 'Inscriptional Parthian', Rjng: 'Rejang', Rohg: 'Hanifi Rohingya',
  Runr: 'Runic', Samr: 'Samaritan', Sarb: 'Old South Arabian', Saur: 'Saurashtra', Sgnw: 'SignWriting', Shaw: 'Shavian', Shrd: 'Sharada',
  Sidd: 'Siddham', Sidt: 'Sidetic', Sind: 'Khudawadi', Sinh: 'Sinhala', Sogd: 'Sogdian', Sogo: 'Old Sogdian', Sora: 'Sora Sompeng', Soyo: 'Soyombo',
  Sund: 'Sundanese', Sunu: 'Sunuwar', Sylo: 'Syloti Nagri', Syrc: 'Syriac', Tagb: 'Tagbanwa', Takr: 'Takri', Tale: 'Tai Le', Talu: 'New Tai Lue',
  Taml: 'Tamil', Tang: 'Tangut', Tavt: 'Tai Viet', Tayo: 'Tai Yo', Telu: 'Telugu', Tfng: 'Tifinagh', Tglg: 'Tagalog', Thaa: 'Thaana',
  Thai: 'Thai', Tibt: 'Tibetan', Tirh: 'Tirhuta', Tnsa: 'Tangsa', Todr: 'Todhri', Tols: 'Tolong Siki', Toto: 'Toto', Tutg: 'Tulu-Tigalari',
  Ugar: 'Ugaritic', Vaii: 'Vai', Vith: 'Vithkuqi', Wara: 'Warang Citi', Wcho: 'Wancho', Xpeo: 'Old Persian', Xsux: 'Cuneiform', Yezi: 'Yezidi',
  Yiii: 'Yi', Zanb: 'Zanabazar Square',
};

// written right to left: their letters are of the strong right-to-left classes
const RTL = new Set('Adlm Arab Armi Avst Chrs Cprt Elym Gara Hatr Hebr Hung Khar Lydi Mand Mani Mend Merc Mero Narb Nbat Nkoo Orkh Ougr Palm Phli Phlp Phnx Prti Rohg Samr Sarb Sidt Sogd Sogo Syrc Thaa Yezi'.split(' '));
// written without spaces between words
const UNSPACED = new Set('Hani Hira Kana Bopo Yiii Tang Nshu Kits Thai Laoo Khmr Mymr Tibt Lana Tale Talu Tavt'.split(' '));

let seed = 977;
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;

// The characters of a script, as Unicode assigns them: its letters (or, where it has none, its signs and numbers), and its marks.
function charsOf(code) {
  const inScript = new RegExp('^\\p{Script=' + code + '}$', 'u');
  const letters = [], signs = [], marks = [];
  for (let cp = 0x20; cp < 0x32400; cp++) {
    if (cp >= 0xD800 && cp < 0xE000) continue;
    const ch = String.fromCodePoint(cp);
    if (!inScript.test(ch)) continue;
    if (/\p{L}/u.test(ch)) letters.push(ch);
    else if (/[\p{So}\p{No}\p{Nl}]/u.test(ch)) signs.push(ch);
    else if (/\p{M}/u.test(ch)) marks.push(ch);
  }
  return { letters: letters.length >= 8 ? letters : letters.concat(signs), marks };
}

// Words of a script: one to two signs for a script of thousands (Han, Tangut, cuneiform…), else two to six letters,
// some with a mark after them.
function wordsOf(code, n) {
  const { letters, marks } = charsOf(code);
  const big = letters.length > 1500;
  const pool = big ? Array.from({ length: 300 }, () => letters[Math.floor(rnd() * letters.length)]) : letters;
  const out = new Set();
  for (let k = 0; out.size < n && k < n * 20; k++) {
    const len = big ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 5);
    let w = '';
    for (let i = 0; i < len; i++) { w += pool[Math.floor(rnd() * pool.length)]; if (marks.length && rnd() < 0.3) w += marks[Math.floor(rnd() * marks.length)]; }
    out.add(w);
  }
  return { words: [...out], letters: letters.length, marks: marks.length };
}

// The scripts, each as a language spec for languages.js: {code, name, tag, words, stop, join, rtl, perLine}
function specs(only) {
  const codes = (only || Object.keys(NAMES)).filter((c) => { try { new RegExp('\\p{Script=' + c + '}', 'u'); return true; } catch (e) { return false; } });
  return codes.map((code) => {
    const w = wordsOf(code, 60);
    return { code, name: NAMES[code], tag: 'und-' + code, words: w.words, nLetters: w.letters, nMarks: w.marks, stop: '.', comma: ',', join: code === 'Tibt' ? '་' : UNSPACED.has(code) ? '' : ' ', rtl: RTL.has(code), perLine: UNSPACED.has(code) ? 40 : 60 };
  }).filter((s) => s.words.length >= 10);
}

module.exports = { NAMES, specs, RTL, UNSPACED };
