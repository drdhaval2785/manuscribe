// Metre: known verses are recognised; a seeded set of faults is flagged where it was made.
const { launch, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('metre');
  const T = checks('Metre');
  const res = await page.evaluate(() => {
    const M = ME.Metre;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const verses = [
      ['Bhagavadgītā 1.1, śloka', 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः । मामकाः पाण्डवाश्चैव किमकुर्वत संजय ॥', 'Śloka (anuṣṭubh)'],
      ['Raghuvaṃśa 1.1, śloka', 'वागर्थाविव संपृक्तौ वागर्थप्रतिपत्तये । जगतः पितरौ वन्दे पार्वतीपरमेश्वरौ ॥', 'Śloka (anuṣṭubh)'],
      ['Abhidhānacintāmaṇi 1.1, śloka', 'प्रणिपत्यार्हतः सिद्धसाङ्गशब्दानुशासनः । रूढयौगिकमिश्राणां नाम्नां मालां तनोम्यहम् ॥', 'Śloka (anuṣṭubh)'],
      ['Meghadūta 1, mandākrāntā', 'कश्चित्कान्ताविरहगुरुणा स्वाधिकारात्प्रमत्तः शापेनास्तंगमितमहिमा वर्षभोग्येण भर्तुः । यक्षश्चक्रे जनकतनयास्नानपुण्योदकेषु स्निग्धच्छायातरुषु वसतिं रामगिर्याश्रमेषु ॥', 'Mandākrāntā'],
      ['Kumārasaṃbhava 1.1, upajāti', 'अस्त्युत्तरस्यां दिशि देवतात्मा हिमालयो नाम नगाधिराजः । पूर्वापरौ तोयनिधी वगाह्य स्थितः पृथिव्या इव मानदण्डः ॥', 'Upajāti'],
      ['Kirātārjunīya 1.1, vaṃśastha', 'श्रियः कुरूणामधिपस्य पालनीं प्रजासु वृत्तिं यमयुङ्क्त वेदितुम् । स वर्णलिङ्गी विदितः समाययौ युधिष्ठिरं द्वैतवने वनेचरः ॥', 'Vaṃśastha'],
      ['Śiśupālavadha 1.1, vaṃśastha', 'श्रियः पतिः श्रीमति शासितुं जगज्जगन्निवासो वसुदेवसद्मनि । वसन्ददर्शावतरन्तमम्बराद्धिरण्यगर्भाङ्गभुवं मुनिं हरिः ॥', 'Vaṃśastha'],
    ];
    for (const [name, text, want] of verses) {
      const r = M.identify(text);
      ok(name + ' is ' + want + (r.metre === want ? '' : ' (found ' + r.metre + ')'), r.metre === want && r.faults.length === 0, { metre: r.metre, faults: r.faults.slice(0, 3), w: M.weights(text) });
    }
    // a light syllable made heavy, a syllable dropped, one added: each flagged in its pāda
    const base = 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः । मामकाः पाण्डवाश्चैव किमकुर्वत संजय ॥';
    const seeded = [
      ['the 5th of pāda d made heavy', base.replace('किमकुर्वत', 'किमकुर्वता'), 'd'],
      ['the 7th of pāda b made heavy', base.replace('युयुत्सवः', 'युयुत्सावः'), 'b'],
      ['syllables 2 and 3 of pāda a made light', base.replace('धर्मक्षेत्रे', 'अभिमतं'), 'a'],
      ['a syllable dropped from pāda d', base.replace('किमकुर्वत', 'किकुर्वत'), 'd'],
      ['a syllable added to pāda a', base.replace('धर्मक्षेत्रे', 'धर्मक्षेत्रेषु'), 'a'],
    ];
    for (const [name, text, pada] of seeded) {
      const r = M.identify(text);
      const hit = r.metre && r.faults.some((f) => f.pada.includes(pada));
      ok('flagged: ' + name, hit, { metre: r.metre, faults: r.faults });
    }
    // prose is not verse
    const prose = 'स्वर्गनामानि स्वर्ग इत्यादीनि सुरालय इत्यंतानि द्वादश द्योशब्दः चतुर्थवर्गतृतीयांतस्थाद्यत्रयोदशस्वरः गोशब्दवद्रूपैः';
    ok('prose fits no metre', M.identify(prose).metre === null, M.identify(prose));
    // weights: a long vowel, anusvāra, a cluster across a word boundary
    ok('weights: मा म काः पा ण्ड वा is heavy, light, heavy, heavy, light, heavy', M.weights('मामकाः पाण्डवा') === 'glgglg', M.weights('मामकाः पाण्डवा'));
    ok('a ma-vipulā in an odd pāda is accepted', (() => { const r = M.identify(base.replace('पाण्डवा', 'पाण्डावा')); return r.metre && !r.faults.length && /ma-vipulā/.test(r.form); })());
    return out;
  });
  for (const [n, ok, x] of res) T.check(n, ok, x);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
