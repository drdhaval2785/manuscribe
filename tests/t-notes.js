// How a note reads: the text's own punctuation is not printed with a lemma or a reading, unless the punctuation is
// the variant; readings that then print alike are given once; all the additions at a place share one "post X add.",
// and an addition before the first word of a block is placed by the word after it; single-letter sigla are set close
// and kept on one line, and still expand to their witnesses.
const { launch, checks } = require('./h');

(async () => {
  const T = checks('How a note reads');
  const { browser, page } = await launch('notes');
  const r = await page.evaluate(() => {
    const A = ME.Apparatus;
    const ed = { witnesses: 'ABCDEF'.split('').map((s) => ({ siglum: s })), apparatus: {} };
    const entry = (o) => Object.assign({ lemma: '', lemWits: [], inside: { left: false, right: false }, readings: [], ac: [], missing: [], orth: [], decision: null, kind: 'variant', prev: '' }, o);
    const f = (o, opts) => A.format(ed, entry(o), opts).replace(/ /g, '_');
    const many = { witnesses: [{ siglum: 'Ox1' }, { siglum: 'Pa2' }, { siglum: 'C' }], apparatus: {} };
    return {
      punct: f({ lemma: 'ἀνήρ.', lemWits: ['A', 'B'], readings: [{ text: 'ἀνρ.', wits: ['C', 'D', 'E'] }] }, { polarity: 'positive' }),
      onlyPunct: f({ lemma: 'ἀνήρ.', lemWits: ['A', 'B', 'C'], readings: [{ text: 'ἀνήρ,', wits: ['D'] }] }),
      alike: f({ lemma: 'λόγος.', lemWits: ['A', 'B', 'C'], readings: [{ text: 'λέγει.', wits: ['D'] }, { text: 'λέγει,', wits: ['E'] }] }),
      adds: f({ kind: 'addition', prev: 'λόγος χωρὶς,', lemWits: ['A', 'B', 'C', 'D'], readings: [{ text: 'ἐπί', wits: ['E'] }, { text: 'ἐστίν', wits: ['F'] }] }),
      start: f({ kind: 'addition', prev: '', next: 'φύσις, πόλις', lemWits: ['A', 'B', 'C', 'D', 'E'], readings: [{ text: 'ἀλλά', wits: ['F'] }] }),
      dandas: f({ lemma: 'रामः।', lemWits: ['A', 'B', 'C', 'D'], readings: [{ text: 'रामा।', wits: ['E', 'F'] }] }),
      brackets: f({ lemma: '⟨λόγος⟩', lemWits: ['A', 'B', 'C', 'D', 'E'], readings: [{ text: '', wits: ['F'] }] }),
      long: A.format(many, entry({ lemma: 'x', lemWits: ['C'], readings: [{ text: 'y', wits: ['Ox1', 'Pa2'] }] })),
      expands: (() => { const g = { witnesses: 'ABCDE'.split('').map((s) => ({ siglum: s, group: s < 'D' ? 'α' : '' })).concat([{ siglum: 'F' }]), apparatus: {} }; return A.sigla(g, ['A', 'B', 'C', 'F'], ['A', 'B', 'C', 'D', 'E', 'F'], A.settings(g)).text.replace(/ /g, '_'); })(),
    };
  });
  T.check('the text\'s punctuation is not printed: ἀνήρ. ] ἀνρ. is ἀνήρ ] ἀνρ', r.punct === 'ἀνήρ ] A_B; ἀνρ C_D_E', r.punct);
  T.check('where punctuation is the variant, it is printed', r.onlyPunct === 'ἀνήρ. ] ἀνήρ, D', r.onlyPunct);
  T.check('readings that differ only by punctuation are printed once, with all their witnesses', r.alike === 'λόγος ] λέγει D_E', r.alike);
  T.check('all the additions at a place share one "post X add."', r.adds === 'post χωρὶς add. ἐπί E; ἐστίν F', r.adds);
  T.check('an addition before the first word of a block is placed by the word after it', r.start === 'ante φύσις add. ἀλλά F', r.start);
  T.check('dandas go as other punctuation; the editor\'s brackets stay', r.dandas === 'रामः ] रामा E_F' && r.brackets === '⟨λόγος⟩ ] om. F', [r.dandas, r.brackets]);
  T.check('single-letter sigla are set close, on one line; longer sigla keep their spaces', r.long === 'x ] C; y Ox1 Pa2' && /^α_F$/.test(r.expands), [r.long, r.expands]);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
