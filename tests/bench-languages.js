// A benchmark, not a test (run.js does not run it): for each language, fifteen witnesses of about ten folio sides
// each, copied from one text down a stemma of three families with errors of their own at each copying; collated,
// and published as the print page, the browser's PDF of it, the reader, TEI and, for Latin script, the direct PDF.
// It reports how long each step takes and what came out, and saves the outputs and a picture of a page of each.
//
//   node tests/bench-languages.js [languages, e.g. la,ar,ja,grc] [witnesses, 15] [folio sides, 10]
const fs = require('fs'), path = require('path');
const { launch, sleep, WORK } = require('./h');

const LANGS = {
  la: {
    name: 'Latin (lorem ipsum)', lang: 'la', join: ' ', perLine: 62, stop: '.', comma: ',',
    words: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus gravida orci odio nullam varius turpis pharetra eros bibendum nec luctus felis sollicitudin mauris integer eu nibh euismod ac tellus risus vulputate vehicula donec lobortis etiam ullamcorper ligula congue sapien quam maecenas fermentum mi pellentesque malesuada sem aliquet eget neque aliquam faucibus dictum nisl diam erat cras mollis scelerisque nunc arcu augue dapibus laoreet aenean molestie feugiat hac habitasse platea dictumst praesent tristique senectus netus fames egestas vitae justo'.split(' '),
    spell: [[/ae/, 'e'], [/ti([aeiou])/, 'ci$1'], [/ll/, 'l'], [/^u/, 'v'], [/ii/, 'i'], [/mm/, 'm']],
  },
  ar: {
    name: 'Arabic', lang: 'ar', join: ' ', perLine: 56, stop: '.', comma: '،',
    words: 'في من على إلى عن مع هذا هذه ذلك تلك التي الذي الذين كان كانت قال يقول قالوا الله كتاب الكتاب علم العلم النحو الصرف المسألة المسائل الفوائد الشيخ الإمام رحمه تعالى الرحمن الرحيم الحمد رب العالمين الصلاة والسلام نبينا محمد وآله وصحبه أجمعين أما بعد فإن هو هي هم لا لم لن قد ثم أو بل حتى إذا إن أن كل بعض غير بين عند قبل حيث كما مثل الكلام الاسم الفعل الحرف المعنى اللفظ القول الأصل الفرع الباب الفصل الوجه الأول الثاني الثالث الحكم الدليل الجواب السؤال يجوز يجب لأن فهو وهو وقد ولا فلا العرب اللغة الشعر البيت القرآن الحديث الفقه الأصول الرواية الإسناد'.split(' '),
    spell: [[/ة$/, 'ه'], [/^أ/, 'ا'], [/^إ/, 'ا'], [/ى$/, 'ي'], [/ي$/, 'ى']],
  },
  ja: {
    name: 'Japanese', lang: 'ja', join: '', perLine: 32, stop: '。', comma: '、',
    words: '私 は 学校 へ 行く 時 に 友達 と 話し ました 春 の 花 が 美しく 咲いて いる 山 川 空 雲 雨 風 月 日 人 心 夢 道 国 王 都 宮 御 女御 更衣 時めき たまふ ありけり いと やむごとなき 際 には あらぬ が すぐれて なかに あまた さぶらひ たまひける いづれ 御時 にか 物語 歌 詠み 書き 言ふ 思ふ 見る 聞く 知る 来る 帰る 待つ 夜 朝 昼 秋 冬 夏 雪 鳥 声 涙 袖 恋 世 中 身 君 我 これ それ あれ ここ そこ'.split(' '),
    spell: [[/ふ$/, 'う'], [/は$/, 'わ'], [/^御/, 'み'], [/^時/, 'とき'], [/^心/, 'こころ'], [/ひ/, 'い']],
  },
  grc: {
    name: 'Greek (polytonic)', lang: 'grc', join: ' ', perLine: 60, stop: '.', comma: ',',
    words: 'ἐν ἀρχῇ ἦν ὁ λόγος καὶ πρὸς τὸν θεόν θεὸς οὗτος πάντα δι᾽ αὐτοῦ ἐγένετο χωρὶς οὐδὲ ἕν ὃ γέγονεν ζωὴ ἡ τῶν ἀνθρώπων φῶς τῇ σκοτίᾳ φαίνει αὐτὸ οὐ κατέλαβεν ἄνθρωπος ἀπεσταλμένος παρὰ ὄνομα αὐτῷ ἦλθεν εἰς μαρτυρίαν ἵνα μαρτυρήσῃ περὶ τοῦ φωτός πιστεύσωσιν ἐκεῖνος ἀλλ᾽ ἀληθινόν κόσμον ψυχή σῶμα ἀρετή δίκη πόλις νόμος φύσις ἀνήρ γυνή παῖς βασιλεύς ἔργον ἡμέρα νύξ ὁδός χρόνος μέν δέ γάρ οὖν ἄρα τε ἀλλά εἰ ὡς ὅτι ἐπεί διά κατά μετά ὑπό ἐπί ἀπό ἐκ σύν λέγει φησίν ἔχει ἐστίν εἰσίν'.split(' '),
    spell: [[/ά/, 'ὰ'], [/έ/, 'ὲ'], [/ή/, 'ὴ'], [/ί/, 'ὶ'], [/ό/, 'ὸ'], [/ύ/, 'ὺ'], [/ώ/, 'ὼ'], [/ν$/, ''], [/ει/, 'ι']],
  },
};

// a seeded random number, so that every run copies the same errors
let seed = 20261107;
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// The text as paragraphs of words, long enough for the folio sides asked for.
function original(L, sides, lines) {
  const budget = sides * lines * L.perLine;
  const paras = [];
  let chars = 0;
  while (chars < budget) {
    const words = [];
    const sentences = 2 + Math.floor(rnd() * 4);
    for (let s = 0; s < sentences; s++) {
      const n = 7 + Math.floor(rnd() * 10);
      for (let k = 0; k < n; k++) words.push(pick(L.words) + (k === n - 1 ? L.stop : rnd() < 0.08 ? L.comma : ''));
    }
    paras.push(words);
    chars += words.join(L.join).length + 1;
  }
  return paras;
}

// One copying: each word may be changed, spelt otherwise, left out, added to or put after the next.
function copy(L, paras, rate) {
  const spell = (w) => { const r = pick(L.spell); return r[0].test(w) ? w.replace(r[0], r[1]) : w; };
  return paras.map((ws) => {
    const out = [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], x = rnd();
      const tail = (w.match(/[.,،。、]$/) || [''])[0], bare = tail ? w.slice(0, -1) : w;
      if (x < rate * 0.35) out.push(pick(L.words) + tail); // another word
      else if (x < rate * 0.6) out.push(spell(bare) + tail); // another spelling
      else if (x < rate * 0.75) { if (tail && out.length) out[out.length - 1] = out[out.length - 1].replace(/[.,،。、]$/, '') + tail; } // left out
      else if (x < rate * 0.88) { out.push(w); out.push(pick(L.words)); } // added
      else if (x < rate && i + 1 < ws.length && !tail) { out.push(ws[i + 1].replace(/[.,،。、]$/, '')); out.push(bare + (ws[i + 1].match(/[.,،。、]$/) || [''])[0]); i++; } // transposed
      else out.push(w);
    }
    return out.filter((w) => w !== undefined && w !== '');
  });
}

// Fifteen witnesses down a stemma: the archetype, three families, five copies in each.
function witnesses(L, n, sides, lines) {
  const O = original(L, sides, lines);
  const families = [copy(L, O, 0.03), copy(L, O, 0.03), copy(L, O, 0.03)];
  const sigla = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, n);
  return sigla.map((s, i) => ({ siglum: s, family: i % 3, paras: copy(L, families[i % 3], 0.015) }));
}

// A witness as Manuscribe holds it: folio sides of lines, each paragraph marked with its citation ID.
function pagesOf(L, paras, lines) {
  const out = [];
  let line = '', page = [];
  // a line that ends between words ends with a space, as a transcriber types it: else the word runs on
  const flush = () => { page.push(line + (L.join ? ' ' : '')); line = ''; if (page.length === lines) { out.push(page); page = []; } };
  paras.forEach((ws, k) => {
    line += '<x-marker type="p-start" id="p' + (k + 1) + '"/>';
    ws.forEach((w, i) => {
      const bare = line.replace(/<[^>]+>/g, '');
      if (bare.length + w.length + 1 > L.perLine && bare.length) flush();
      line += (i && L.join && line.replace(/<[^>]+>/g, '').length ? L.join : '') + w;
    });
    line += '<x-marker type="p-end"/>';
  });
  if (line) flush();
  if (page.length) { while (page.length < lines) page.push(''); out.push(page); }
  return out;
}

const ms = (t) => (t >= 10000 ? (t / 1000).toFixed(1) + ' s' : Math.round(t) + ' ms');

(async () => {
  const which = (process.argv[2] || 'la,ar,ja,grc').split(',');
  const N = +(process.argv[3] || 15), SIDES = +(process.argv[4] || 10), LINES = 26;
  const out = path.join(WORK, 'bench');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await launch('bench');
  if (process.env.BENCH_DEBUG) await page.evaluate(() => { window.BENCH_DEBUG = true; });
  if (process.env.BENCH_TOKENS) await page.evaluate((k) => { window.BENCH_TOKENS = k; }, process.env.BENCH_TOKENS);
  const report = [];
  for (const key of which) {
    const L = LANGS[key];
    const ws = witnesses(L, N, SIDES, LINES);
    const data = ws.map((w) => ({ siglum: w.siglum, pages: pagesOf(L, w.paras, LINES), words: w.paras.reduce((a, p) => a + p.length, 0), chars: w.paras.reduce((a, p) => a + p.join(L.join).length, 0) }));
    const r = { lang: L.name, witnesses: N, sides: data.map((d) => d.pages.length), words: Math.round(data.reduce((a, d) => a + d.words, 0) / N), chars: Math.round(data.reduce((a, d) => a + d.chars, 0) / N), blocks: ws[0].paras.length };
    console.log('\n— ' + L.name + ': ' + N + ' witnesses of ' + Math.min(...r.sides) + '–' + Math.max(...r.sides) + ' folio sides, about ' + r.words + ' words (' + r.chars + ' characters) each, in ' + r.blocks + ' blocks');
    await page.evaluate(async (key, L, data, LINES) => {
      const { Model, Store, Edition } = ME;
      const ed = Edition.create(L.name + ': a test edition');
      ed.editor = 'Benchmark';
      ed.norm = { profile: 'any' };
      // lined up as the app chooses for these languages, unless asked otherwise
      ed.collate = { tokens: window.BENCH_TOKENS || ME.Collate.defaultTokens([L.lang]) };
      window.bench_tokens = ed.collate.tokens;
      const list = [];
      for (const d of data) {
        const p = Model.upgrade(Model.newProject({ meta: { title: 'Codex ' + d.siglum, siglum: d.siglum, textLang: L.lang, repository: 'Bibliotheca', shelfmark: 'Ms. ' + d.siglum }, layoutType: 'linear', lines: { main: LINES }, folios: {} }));
        p.pdf = { name: d.siglum + '.pdf', pages: d.pages.length };
        const labels = Model.entries(p).map((e) => e.label);
        p.pages = {};
        d.pages.forEach((lines, i) => { p.pages[labels[i]] = { boxes: { main: lines } }; });
        await Store.putProject(p);
        const w = { siglum: d.siglum, projectId: p.id, streams: {} };
        ed.witnesses.push(w); list.push({ w, p });
      }
      ed.trust = data.map((d) => d.siglum);
      await Store.putEdition(ed);
      window.bench = { ed, list };
    }, key, { name: L.name, lang: L.lang }, data, LINES);
    // collate, watching its progress
    const t0 = Date.now();
    await page.evaluate(() => {
      window.bench.progress = { i: 0, n: 0 };
      window.bench.done = null;
      const t = performance.now();
      ME.Collate.run(window.bench.ed, window.bench.list, 'main', { onUnit: (i, n) => { window.bench.progress = { i, n }; } })
        .then((res) => { window.bench.done = { ok: true, ms: performance.now() - t, aligned: res.done.length, skipped: res.skipped.length, outside: res.outside.length }; }, (e) => { window.bench.done = { ok: false, error: e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 5).join(' | ') }; });
    });
    let last = 0;
    for (;;) {
      await sleep(1000);
      const st = await page.evaluate(() => ({ p: window.bench.progress, d: window.bench.done }));
      if (st.d) { r.collate = st.d; break; }
      if (Date.now() - last > 15000) { last = Date.now(); console.log('  … collating block ' + (st.p.i + 1) + ' of ' + st.p.n + ', ' + ms(Date.now() - t0)); }
    }
    if (!r.collate.ok) { console.log('  collation failed: ' + r.collate.error); report.push(r); continue; }
    r.tokens = await page.evaluate(() => window.bench_tokens);
    console.log('  collated by ' + r.tokens + 's: ' + r.collate.aligned + ' blocks in ' + ms(r.collate.ms) + ' (' + ms(r.collate.ms / r.collate.aligned) + ' a block)' + (r.collate.skipped ? ', ' + r.collate.skipped + ' skipped' : ''));
    // the apparatus, and the outputs made in the page
    const made = await page.evaluate(async (key) => {
      const { ed, list } = window.bench;
      const T = (f) => { const t = performance.now(); return Promise.resolve(f()).then((v) => [v, performance.now() - t]); };
      const [works, tBuild] = await T(() => ME.Release.works(ed, list));
      const built = works[0].built;
      const entries = built.reduce((a, b) => a + b.entries.length, 0);
      const problems = built.reduce((a, b) => a + ME.Apparatus.validate(ed, b.table, b).filter((p) => p.level === 'error').length, 0);
      const [fonts] = await T(() => ME.PrintHTML.fonts(ed, built));
      const [print, tPrint] = await T(() => ME.PrintHTML.html(ed, list, built, { fonts }));
      const [reader, tReader] = await T(() => ME.Publish.reader(ed, list, built, null));
      const [tei, tTei] = await T(() => ME.Apparatus.tei(ed, built, works[0].work));
      const wellFormed = !new DOMParser().parseFromString(tei, 'application/xml').getElementsByTagName('parsererror').length;
      let direct = null;
      if (key === 'la') {
        const [d, tDirect] = await T(() => ME.Typeset.pdf(ed, list, built));
        const buf = new Uint8Array(await d.blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        direct = { ms: tDirect, pages: d.pages, overfull: d.overfull, missing: d.missing, b64: btoa(bin) };
      }
      const sample = built[0].entries.slice(0, window.BENCH_DEBUG ? 25 : 3).map((e) => ME.Apparatus.format(ed, e).replace(/<\/?sup>/g, ''));
      return { tBuild, entries, problems, print, tPrint, reader, tReader, tei, tTei, wellFormed, direct, sample, words: built.reduce((a, b) => a + b.proposal.count.words, 0) };
    }, key);
    Object.assign(r, { build: made.tBuild, entries: made.entries, problems: made.problems, tei: { ms: made.tTei, wellFormed: made.wellFormed, kb: Math.round(made.tei.length / 1024) } });
    console.log('  apparatus: ' + made.entries + ' entries for ' + made.words + ' words of edited text, built in ' + ms(made.tBuild) + '; ' + made.problems + ' problem(s) in the checks');
    console.log('  e.g. ' + made.sample.join(process.env.BENCH_DEBUG ? '\n       ' : '  |  '));
    fs.writeFileSync(path.join(out, key + '.print.html'), made.print);
    fs.writeFileSync(path.join(out, key + '.reader.html'), made.reader);
    fs.writeFileSync(path.join(out, key + '.tei.xml'), made.tei);
    // the print page: laid out by the browser, then its PDF, as Save as PDF makes it
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 900, height: 1200 });
    let t = Date.now();
    await p2.setContent(made.print, { waitUntil: 'load' });
    for (let k = 0; k < 600 && !(await p2.evaluate(() => !!window.__paginated)); k++) await sleep(100);
    const tLayout = Date.now() - t;
    const lay = await p2.evaluate(() => {
      const R = window.__paginated;
      const strays = R.pagesInfo.reduce((a, pg) => a + pg.inText.filter((k) => !pg.inFoot.includes(k)).length + pg.inFoot.filter((k) => !pg.inText.includes(k)).length, 0);
      return { pages: R.pages, overfull: R.overfull, strays, clear: R.pagesInfo.every((pg) => pg.clear && pg.within), notes: R.pagesInfo.reduce((a, pg) => a + pg.inFoot.length, 0), dir: getComputedStyle(document.querySelector('.txt')).direction };
    });
    const pages = await p2.$$('.page');
    if (pages[2]) await pages[2].screenshot({ path: path.join(out, key + '.print-page3.png') });
    t = Date.now();
    const pdf = await p2.pdf({ preferCSSPageSize: true, printBackground: true });
    const tPdf = Date.now() - t;
    fs.writeFileSync(path.join(out, key + '.browser.pdf'), pdf);
    await p2.close();
    r.print = { html: made.tPrint, layout: tLayout, pdf: tPdf, pages: lay.pages, overfull: lay.overfull, strays: lay.strays, clear: lay.clear, notes: lay.notes, dir: lay.dir, kb: Math.round(pdf.length / 1024) };
    console.log('  print page: made in ' + ms(made.tPrint) + ', laid out in ' + ms(tLayout) + ' as ' + lay.pages + ' pages (' + lay.dir + '); ' + lay.notes + ' notes, ' + lay.strays + ' away from their marker, ' + lay.overfull + ' overfull, ' + (lay.clear ? 'no text over its notes' : 'TEXT OVER NOTES'));
    console.log('  browser PDF: ' + ms(tPdf) + ', ' + r.print.kb + ' KB');
    // the reader
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 1200, height: 800 });
    t = Date.now();
    await p3.setContent(made.reader, { waitUntil: 'load' });
    await sleep(200);
    const rd = await p3.evaluate(() => ({ blocks: document.querySelectorAll('section.block').length, marked: document.querySelectorAll('#text .u').length }));
    const tOpen = Date.now() - t;
    const u = await p3.$$('#text .u');
    if (u[3]) { await u[3].click(); await sleep(150); if (u[1]) await u[1].hover(); await sleep(150); }
    await p3.screenshot({ path: path.join(out, key + '.reader.png') });
    await p3.close();
    r.reader = { ms: made.tReader, open: tOpen, blocks: rd.blocks, marked: rd.marked, kb: Math.round(made.reader.length / 1024) };
    console.log('  reader: made in ' + ms(made.tReader) + ', opens in ' + ms(tOpen) + ', ' + rd.blocks + ' passages, ' + rd.marked + ' words with variants, ' + r.reader.kb + ' KB');
    console.log('  TEI: ' + ms(made.tTei) + ', ' + r.tei.kb + ' KB, ' + (made.wellFormed ? 'well-formed' : 'NOT WELL-FORMED'));
    if (made.direct) {
      fs.writeFileSync(path.join(out, key + '.direct.pdf'), Buffer.from(made.direct.b64, 'base64'));
      r.direct = { ms: made.direct.ms, pages: made.direct.pages, overfull: made.direct.overfull, missing: made.direct.missing };
      console.log('  direct PDF: ' + ms(made.direct.ms) + ', ' + made.direct.pages + ' pages, ' + made.direct.overfull + ' overfull, ' + made.direct.missing + ' letters missing from the font');
    }
    report.push(r);
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('\nOutputs and pictures in ' + out);
  await browser.close();
})().catch((e) => { console.log('crashed: ' + e.stack); process.exitCode = 1; });
