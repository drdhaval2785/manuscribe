// An edition of one witness: the text printed is the corrected one (<add>, <del>, <subst>, and the editor's <corr>,
// <reg>, <supplied>), and the apparatus says what each correction is: the scribe's (added, and where; deleted; a
// substitution as before correction) or the editor's (emended, supplied, excluded, regularised), and marks a word
// unclear or sic; in the print edition and the HTML reader. With two witnesses nothing of this applies: the scribes'
// own words are compared.
const { launch, checks } = require('./h');
const P = (id) => '<x-marker type="p-start" id="' + id + '"/>', END = '<x-marker type="p-end"/>';
const lines = [
  P('v1') + 'धर्म <add place="above">युद्ध</add> क्षेत्रे' + END,
  P('v2') + 'कुरु <del rend="crossed out">भीम</del> पाण्डु' + END,
  P('v3') + 'राम <subst><del rend="crossed out">कृष्ण</del><add place="above">गोविन्द</add></subst> सीता' + END,
  P('v4') + 'हरि <choice><sic>गगन</sic><corr>गगने</corr></choice> शिव' + END,
  P('v5') + 'गंगा <choice><orig>जल</orig><reg>जलं</reg></choice> यमुना' + END,
  P('v6') + 'देव <surplus>अधिक</surplus> मुनि' + END,
  P('v7') + 'नर <supplied>पूर्ण</supplied> नारी' + END,
  P('v8') + 'सूर्य <unclear>चन्द्र</unclear> तारा' + END,
  P('v9') + 'अग्नि <add place="left-margin">मालाशिलो<choice><orig>च्छं</orig><corr>ञ्छं</corr></choice> जल</add> वायु' + END,
  // the scribe's sign that a word goes on in the next line
  P('v10') + 'राम लक्ष\u0964\u094D', 'मण सीता \u0964\u094D हरि' + END,
  P('v11') + 'सूर्य चन्द<del rend="crossed out">\u0964\u094D</del>', ' र तारा' + END,
  P('v12') + 'अग्नि शोके <surplus>\u0964\u094D</surplus>', 'वायु' + END,
];
(async () => {
  const { browser, page } = await launch('sole', { fonts: true });
  const T = checks('An edition of one witness');
  try {
    const out = await page.evaluate(async (lines) => {
      const { Model, Store, Edition, Collate, PrintHTML } = ME;
      const make = async (sigla, tokens) => {
        const ed = Edition.create('t'), list = [];
        for (const s of sigla) {
          const p = Model.upgrade(Model.newProject({ meta: { title: s, siglum: s, textLang: 'sa-Deva' }, layoutType: 'linear', lines: { main: lines.length }, folios: {} }));
          p.pdf = { name: 'x.pdf', pages: 1 }; p.pages = { '1r': { boxes: { main: lines.slice() } } };
          await Store.putProject(p);
          const w = { siglum: s, projectId: p.id, streams: {} }; ed.witnesses.push(w); list.push({ w, p });
        }
        ed.trust = sigla; ed.collate = { tokens };
        ME.Features.setContext(ME.Features.langsOf(list));
        Collate.chooseFor(ed, ME.Features.langsOf(list), list);
        await Store.putEdition(ed);
        await Collate.run(ed, list, 'main', {});
        const built = (await ME.Release.works(ed, list))[0].built;
        const D = PrintHTML.data(ed, list, built);
        const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('sup').forEach((s) => { if (s.closest('.an')) s.remove(); }); return d.textContent.replace(/\s+/g, ' ').trim(); };
        const rows = {};
        for (const b of D.blocks) rows[b.id] = { text: strip(b.html), notes: b.notes.map((n) => strip(n.by.A || '')) };
        const reader = await ME.ExportView.format('reader').make({ kind: 'edition', ed, list, workId: 'main' });
        const html = typeof reader.data === 'string' ? reader.data : await reader.data.text();
        return { rows, principles: D.principles.join(' '), reader: html, current: (await Collate.summaries(ed.id)).size };
      };
      // a very long block, its two versions drifting apart by thousands of tokens: each token finds its own
      let seed = 5; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      const after = [], before = [], same = [];
      for (let i = 0; i < 500000; i++) {
        const t = 'w' + rnd(40);
        const r = rnd(150);
        if (r === 0) { const len = 1 + rnd(120); for (let k = 0; k < len; k++) after.push('a' + rnd(40)); }
        else if (r === 1) { const len = 1 + rnd(5); for (let k = 0; k < len; k++) before.push('b' + rnd(40)); }
        same.push([before.length, after.length]);
        before.push(t); after.push(t);
      }
      const t0 = performance.now();
      const aligned = await Collate.align([{ label: 'Aac', n: before }, { label: 'Apc', n: after }], { engine: 'base', settings: { base: 'Aac' } });
      let right = 0;
      for (const [x, y] of same) if (aligned.cols.Aac[x] === aligned.cols.Apc[y]) right++;
      const long = { right, total: same.length, drift: Math.abs(before.length - after.length), seconds: (performance.now() - t0) / 1000 };
      return { long, word: await make(['A'], 'word'), letter: await make(['A'], 'letter'), two: await make(['A', 'B'], 'word') };
    }, lines);
    T.check('a block of 500,000 tokens, its versions ' + out.long.drift + ' apart: every shared token lined up (' + out.long.seconds.toFixed(1) + ' s)', out.long.right / out.long.total > 0.999 && out.long.drift > 1000, out.long);
    const w = out.word.rows;
    const say = (o) => JSON.stringify(o);
    T.check('an addition is in the text, noted as the scribe’s, and where it was written (not as omitted)', w.v1.text === 'धर्म युद्ध क्षेत्रे' && w.v1.notes.join() === 'युद्ध ] add. supra lin. A', say(w.v1));
    T.check('a deletion is out of the text, and noted as the scribe’s', w.v2.text === 'कुरु पाण्डु' && w.v2.notes.join() === 'post कुरु ] भीम del. A', say(w.v2));
    T.check('a substitution prints what replaced, and notes what was replaced as before correction', w.v3.text === 'राम गोविन्द सीता' && w.v3.notes.join() === 'गोविन्द ] कृष्ण Aa.c.', say(w.v3));
    T.check('<choice>: the correction is printed as the editor’s emendation, the witness’s reading after it', w.v4.text === 'हरि गगने शिव' && w.v4.notes.join() === 'गगने ] em.; गगन A', say(w.v4));
    T.check('<choice> with <orig> and <reg>: the witness’s spelling, with nothing of “before correction”', w.v5.text === 'गंगा जलं यमुना' && w.v5.notes.join() === 'जलं ] जल A', say(w.v5));
    T.check('<supplied> is in the text, noted as supplied and omitted by the witness', w.v7.text === 'नर पूर्ण नारी' && w.v7.notes.join() === 'पूर्ण ] suppl.; om. A', say(w.v7));
    T.check('<surplus> stays out, noted as the witness’s and excluded; unclear text is as it is, and noted as it seems', w.v6.text === 'देव मुनि' && w.v6.notes.join() === 'post देव ] अधिक A (secl.)' && w.v8.text === 'सूर्य चन्द्र तारा' && w.v8.notes.join() === 'चन्द्र ] A (ut vid.)', say([w.v6, w.v8]));
    T.check('a correction inside an addition in the margin: the corrected form printed, the two words one note, in the margin', w.v9.text === 'अग्नि मालाशिलोञ्छं जल वायु' && w.v9.notes.join() === 'मालाशिलोञ्छं जल ] add. in marg. A', say(w.v9));
    T.check('the sign at the end of a line is dropped, and the word joined over the line', w.v10.text === 'राम लक्षमण सीता \u0964\u094D हरि', say(w.v10));
    T.check('in a tag too, and it makes no note', w.v11.text === 'सूर्य चन्दर तारा' && !w.v11.notes.length, say(w.v11));
    T.check('a space before the sign: the word had ended, and the two stay apart', w.v12.text === 'अग्नि शोके वायु' && !w.v12.notes.length, say(w.v12));
    const l = out.letter.rows;
    T.check('collated by letters, the text is the same', Object.keys(w).every((k) => l[k].text === w[k].text), say(l));
    T.check('and the same blocks have their notes', Object.keys(w).every((k) => !!l[k].notes.length === !!w[k].notes.length) && l.v4.notes.every((n) => /em\./.test(n)), say([l.v2, l.v4]));
    T.check('the principles say the text is the corrected one', /corrected one/.test(out.word.principles) && !/lined up by computer/.test(out.word.principles), out.word.principles.slice(0, 200));
    T.check('the HTML reader carries the readings before correction, and the switch for them', out.word.reader.includes('गगन') && out.word.reader.includes('a.c.') && out.word.reader.includes('before correction'), out.word.reader.length);
    const t = out.two.rows;
    T.check('with two witnesses, the scribes’ words are compared, and agreeing corrections are not noted', t.v4.text === 'हरि गगन शिव' && !t.v4.notes.length && t.v7.text === 'नर नारी' && !t.v2.notes.length, say([t.v4, t.v7, t.v2]));
    T.check('and the same with several witnesses', out.two.rows.v10.text === 'राम लक्षमण सीता \u0964\u094D हरि', say(out.two.rows.v10));
    T.done(page);
  } finally { await browser.close(); }
})().catch((e) => { console.log('  FAIL crashed :: ' + e.stack); process.exitCode = 1; });
