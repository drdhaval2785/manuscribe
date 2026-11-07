// Dummy texts in many languages, by language code, for the language tests and the benchmark: a list of common words
// for each, how its sentences end, whether it spaces its words, and a seeded copying of witnesses down a stemma.
// The words only need to be real words in the right script: the sentences they make mean nothing.

const W = (s) => s.trim().split(/\s+/);

const LANGS = {
  en: { name: 'English', words: W('the and of to in that it was he for on are with as his they be at one have this from by word but what some is you or had we can out other were all there when up use your how said each she which do their time if will way about many then them write would like so these her long make thing see him two has look more day could go come did number sound no most people my over know water than call first who may down side been now find'), stop: '.' },
  es: { name: 'Spanish', words: W('el la de que y en un ser se no haber por con su para como estar tener le lo todo pero más hacer o poder decir este ir otro ese si me ya ver porque dar cuando él muy sin vez mucho saber qué sobre mi alguno mismo yo también hasta año dos querer entre así primero desde grande eso ni nos llegar pasar tiempo ella sí día uno bien poco deber entonces poner cosa tanto hombre parecer nuestro tan donde ahora parte después vida quedar siempre creer hablar'), stop: '.' },
  fr: { name: 'French', words: W('le de un être et à il avoir ne je son que se qui ce dans en du elle au pour pas vous par sur faire plus dire me on mon lui nous comme mais pouvoir avec tout aller voir bien où sans tu ou leur homme si deux moi vouloir te femme venir quand grand celui notre devoir là jour prendre même votre rien petit encore aussi quelque dont mer trouver donner temps peu falloir sous parler alors main chose'), stop: '.' },
  de: { name: 'German', words: W('der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis mehr durch man sein wurde sei hatte kann gegen vom können schon wenn habe seine ihre dann unter wir soll ich eines Jahr zwei diese dieser wieder keine seiner worden'), stop: '.' },
  it: { name: 'Italian', words: W('il di che e la per un in essere a non avere con si da lo come io ma questo ci tu anche fare più o se mi quello potere dire suo tutto lui cosa me dovere andare noi bene ancora sapere volere vedere stare grande nostro dare quando molto altro solo tempo giorno uomo così niente sempre prima casa poi parte anno ora vita venire due mondo primo'), stop: '.' },
  pt: { name: 'Portuguese', words: W('o de a e que do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós'), stop: '.' },
  la: { name: 'Latin', words: W('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus gravida orci odio nullam varius turpis pharetra eros bibendum nec luctus felis sollicitudin mauris integer eu nibh euismod ac tellus risus vulputate vehicula donec lobortis etiam ullamcorper ligula congue sapien quam maecenas fermentum mi pellentesque malesuada sem aliquet eget neque aliquam faucibus dictum'), stop: '.' },
  ru: { name: 'Russian', words: W('и в не на я быть он с что а по это она этот к но они мы как из у который то за свой весь год от так о для ты же все тот мочь вы человек такой его сказать только или ещё бы себя один уже до время если сам когда другой вот говорить наш мой знать стать при чтобы дело жизнь кто первый очень два день её новый рука даже во со раз где там под можно ну какой после их работа без самый потом надо хотеть ли слово идти большой должен место иметь ничто'), stop: '.' },
  el: { name: 'Greek', words: W('και το να η της είναι ο για με που τα των στο σε τον θα την από δεν στην οι ένα τη μια τις στη στα αλλά ή μας τους μου κάθε όπως αυτό όταν πολύ έχει ότι ακόμα σας μετά πριν χωρίς επειδή τώρα εδώ εκεί ημέρα χρόνος άνθρωπος σπίτι νερό ζωή κόσμος λόγος'), stop: '.' },
  grc: { name: 'Ancient Greek', words: W('ἐν ἀρχῇ ἦν ὁ λόγος καὶ πρὸς τὸν θεόν θεὸς οὗτος πάντα δι᾽ αὐτοῦ ἐγένετο χωρὶς οὐδὲ ἕν ὃ γέγονεν ζωὴ ἡ τῶν ἀνθρώπων φῶς τῇ σκοτίᾳ φαίνει αὐτὸ οὐ κατέλαβεν ἄνθρωπος ἀπεσταλμένος παρὰ ὄνομα αὐτῷ ἦλθεν εἰς μαρτυρίαν ἵνα μαρτυρήσῃ περὶ τοῦ φωτός πιστεύσωσιν ἐκεῖνος ἀλλ᾽ ἀληθινόν κόσμον ψυχή σῶμα ἀρετή δίκη πόλις νόμος φύσις ἀνήρ γυνή παῖς βασιλεύς ἔργον ἡμέρα νύξ ὁδός χρόνος μέν δέ γάρ οὖν ἄρα τε ἀλλά εἰ ὡς ὅτι ἐπεί διά κατά μετά ὑπό ἐπί ἀπό ἐκ σύν λέγει φησίν ἔχει ἐστίν εἰσίν'), stop: '.' },
  ka: { name: 'Georgian', words: W('და არის ეს რომ ის არ მე შენ ჩვენ თქვენ ისინი ერთი ორი სამი დიდი პატარა კარგი ცუდი სახლი წყალი დღე ღამე კაცი ქალი ბავშვი ქალაქი სოფელი ღმერთი სიტყვა წიგნი გზა მზე მთვარე ცა მიწა ხე ყვავილი გული სიყვარული მეფე ტყე მთა ზღვა'), stop: '.' },
  hy: { name: 'Armenian', words: W('և է այս որ նա չէ ես դու մենք դուք նրանք մեկ երկու երեք մեծ փոքր լավ վատ տուն ջուր օր գիշեր մարդ կին երեխա քաղաք գյուղ Աստված խոսք գիրք ճանապարհ արև լուսին երկինք երկիր ծառ ծաղիկ սիրտ սեր թագավոր անտառ լեռ ծով'), stop: '։' },
  ar: { name: 'Arabic', words: W('في من على إلى عن مع هذا هذه ذلك تلك التي الذي الذين كان كانت قال يقول قالوا الله كتاب الكتاب علم العلم النحو الصرف المسألة المسائل الفوائد الشيخ الإمام رحمه تعالى الرحمن الرحيم الحمد رب العالمين الصلاة والسلام نبينا محمد وآله وصحبه أجمعين أما بعد فإن هو هي هم لا لم لن قد ثم أو بل حتى إذا إن أن كل بعض غير بين عند قبل حيث كما مثل الكلام الاسم الفعل الحرف المعنى اللفظ القول الأصل الفرع الباب الفصل'), stop: '.', comma: '،', rtl: true },
  fa: { name: 'Persian', words: W('و در به از که این را با است برای آن یک خود تا کرد بر هم نیز گفت شود وی شد دارد ما اما یا شده باید هر آنها بود او دیگر دو مورد می کند پس بین کار مردم روز سال خانه آب جهان کتاب سخن دل شب'), stop: '.', comma: '،', rtl: true },
  ur: { name: 'Urdu', words: W('اور کے کی میں ہے کہ سے کو یہ نے ایک پر بھی تو ہیں وہ تھا کیا ہو گیا جو کر اس کہا تھے لیے ساتھ دن رات گھر پانی دنیا کتاب بات دل لوگ وقت زندگی'), stop: '۔', comma: '،', rtl: true },
  he: { name: 'Hebrew', words: W('של את על לא הוא זה היה עם כל אם גם אבל אני היא אל הם יש או כי מה רק עוד אחד שני גדול קטן טוב בית מים יום לילה איש אשה ילד עיר אלהים דבר ספר דרך שמש ירח שמים ארץ'), stop: '.', rtl: true },
  syc: { name: 'Syriac', words: W('ܡܢ ܥܠ ܗܘ ܗܝ ܗܢܐ ܗܕܐ ܐܢܐ ܐܢܬ ܚܢܢ ܐܢܘܢ ܚܕ ܬܪܝܢ ܪܒܐ ܙܥܘܪܐ ܛܒܐ ܒܝܬܐ ܡܝܐ ܝܘܡܐ ܠܠܝܐ ܓܒܪܐ ܐܢܬܬܐ ܛܠܝܐ ܡܕܝܢܬܐ ܐܠܗܐ ܡܠܬܐ ܟܬܒܐ ܐܘܪܚܐ ܫܡܫܐ ܣܗܪܐ ܫܡܝܐ ܐܪܥܐ ܐܝܠܢܐ ܠܒܐ ܚܘܒܐ ܡܠܟܐ'), stop: '.', rtl: true },
  sa: { name: 'Sanskrit', words: W('धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय रामः वनं गच्छति सीता लक्ष्मणः अनुगच्छति राजा नगरम् देवः ऋषिः धर्मः अर्थः कामः मोक्षः ज्ञानम् कर्म भक्तिः योगः आत्मा ब्रह्म सत्यम् वाक् मनः हृदयम् पुत्रः पिता माता गुरुः शिष्यः च तु हि एव अपि इति'), stop: '।' },
  hi: { name: 'Hindi', words: W('और का के की में है यह को से एक पर भी हैं था वह कि जो कर नहीं तो ही या हो गया किया लिए साथ बहुत अपने दिन रात घर पानी दुनिया किताब बात दिल लोग समय जीवन राजा नगर गाँव'), stop: '।' },
  mr: { name: 'Marathi', words: W('आणि हे आहे तो ती ते एक मी तू आम्ही तुम्ही नाही होता होती केले काय कसे घर पाणी दिवस रात्र माणूस स्त्री मूल शहर गाव देव शब्द पुस्तक रस्ता सूर्य चंद्र आकाश पृथ्वी झाड फूल हृदय प्रेम राजा'), stop: '.' },
  ne: { name: 'Nepali', words: W('र को मा छ यो त्यो एक म तिमी हामी उनीहरू होइन थियो गर्यो के कसरी घर पानी दिन रात मान्छे महिला बच्चा सहर गाउँ भगवान शब्द किताब बाटो सूर्य चन्द्रमा आकाश पृथ्वी रूख फूल मुटु माया राजा'), stop: '।' },
  gu: { name: 'Gujarati', words: W('અને છે આ તે એક હું તમે અમે તેઓ નથી હતો હતી કર્યું શું કેવી રીતે ઘર પાણી દિવસ રાત માણસ સ્ત્રી બાળક શહેર ગામ ભગવાન શબ્દ પુસ્તક રસ્તો સૂર્ય ચંદ્ર આકાશ પૃથ્વી ઝાડ ફૂલ હૃદય પ્રેમ રાજા'), stop: '.' },
  bn: { name: 'Bengali', words: W('এবং হয় এই সে এক আমি তুমি আমরা তারা না ছিল করেছিল কি কেমন ঘর জল দিন রাত মানুষ নারী শিশু শহর গ্রাম ঈশ্বর শব্দ বই পথ সূর্য চাঁদ আকাশ পৃথিবী গাছ ফুল হৃদয় প্রেম রাজা'), stop: '।' },
  pa: { name: 'Punjabi', words: W('ਅਤੇ ਹੈ ਇਹ ਉਹ ਇੱਕ ਮੈਂ ਤੁਸੀਂ ਅਸੀਂ ਉਹਨਾਂ ਨਹੀਂ ਸੀ ਕੀਤਾ ਕੀ ਘਰ ਪਾਣੀ ਦਿਨ ਰਾਤ ਆਦਮੀ ਔਰਤ ਬੱਚਾ ਸ਼ਹਿਰ ਪਿੰਡ ਰੱਬ ਸ਼ਬਦ ਕਿਤਾਬ ਰਾਹ ਸੂਰਜ ਚੰਨ ਅਸਮਾਨ ਧਰਤੀ ਰੁੱਖ ਫੁੱਲ ਦਿਲ ਪਿਆਰ ਰਾਜਾ'), stop: '।' },
  or: { name: 'Odia', words: W('ଏବଂ ଅଟେ ଏହି ସେ ଏକ ମୁଁ ତୁମେ ଆମେ ସେମାନେ ନାହିଁ ଥିଲା କଲା କଣ ଘର ପାଣି ଦିନ ରାତି ମଣିଷ ନାରୀ ପିଲା ସହର ଗାଁ ଭଗବାନ ଶବ୍ଦ ବହି ବାଟ ସୂର୍ଯ୍ୟ ଚନ୍ଦ୍ର ଆକାଶ ପୃଥିବୀ ଗଛ ଫୁଲ ହୃଦୟ ପ୍ରେମ ରାଜା'), stop: '।' },
  ta: { name: 'Tamil', words: W('மற்றும் உள்ளது இந்த அந்த ஒரு நான் நீ நாங்கள் அவர்கள் இல்லை இருந்தது செய்தது என்ன வீடு நீர் நாள் இரவு மனிதன் பெண் குழந்தை நகரம் கிராமம் கடவுள் சொல் புத்தகம் வழி சூரியன் சந்திரன் வானம் பூமி மரம் பூ இதயம் அன்பு அரசன்'), stop: '.' },
  te: { name: 'Telugu', words: W('మరియు ఉంది ఈ ఆ ఒక నేను నువ్వు మేము వారు లేదు ఉండేది చేసింది ఏమి ఇల్లు నీరు రోజు రాత్రి మనిషి స్త్రీ బిడ్డ నగరం గ్రామం దేవుడు మాట పుస్తకం దారి సూర్యుడు చంద్రుడు ఆకాశం భూమి చెట్టు పువ్వు హృదయం ప్రేమ రాజు'), stop: '.' },
  kn: { name: 'Kannada', words: W('ಮತ್ತು ಇದೆ ಈ ಆ ಒಂದು ನಾನು ನೀನು ನಾವು ಅವರು ಇಲ್ಲ ಇತ್ತು ಮಾಡಿತು ಏನು ಮನೆ ನೀರು ದಿನ ರಾತ್ರಿ ಮನುಷ್ಯ ಹೆಣ್ಣು ಮಗು ನಗರ ಹಳ್ಳಿ ದೇವರು ಮಾತು ಪುಸ್ತಕ ದಾರಿ ಸೂರ್ಯ ಚಂದ್ರ ಆಕಾಶ ಭೂಮಿ ಮರ ಹೂವು ಹೃದಯ ಪ್ರೀತಿ ರಾಜ'), stop: '.' },
  ml: { name: 'Malayalam', words: W('ഒപ്പം ആണ് ഈ ആ ഒരു ഞാൻ നീ ഞങ്ങൾ അവർ ഇല്ല ആയിരുന്നു ചെയ്തു എന്ത് വീട് വെള്ളം ദിവസം രാത്രി മനുഷ്യൻ സ്ത്രീ കുട്ടി നഗരം ഗ്രാമം ദൈവം വാക്ക് പുസ്തകം വഴി സൂര്യൻ ചന്ദ്രൻ ആകാശം ഭൂമി മരം പൂവ് ഹൃദയം സ്നേഹം രാജാവ്'), stop: '.' },
  si: { name: 'Sinhala', words: W('සහ ඇත මෙම ඒ එක මම ඔබ අපි ඔවුන් නැත විය කළා කුමක් ගෙදර වතුර දවස රාත්‍රිය මිනිසා කාන්තාව දරුවා නගරය ගම දෙවියන් වචනය පොත මාර්ගය සූර්යයා සඳ අහස පොළොව ගස මල හදවත ආදරය රජු'), stop: '.' },
  bo: { name: 'Tibetan', words: W('ང་ ཁྱེད་ ཁོ་ བོད་ ཡུལ་ ལ་ ཆུ་ ཉི་མ་ ཟླ་བ་ ནམ་མཁའ་ ས་ ཤིང་ མེ་ཏོག་ སེམས་ བྱམས་པ་ རྒྱལ་པོ་ མི་ བུད་མེད་ ཕྲུ་གུ་ གྲོང་ཁྱེར་ ཡིག་ཆ་ དཔེ་ཆ་ ལམ་ ཆོས་ སངས་རྒྱས་ བླ་མ་ དགོན་པ་ ཤེས་རབ་'), stop: '།', comma: '།', join: '' },
  th: { name: 'Thai', words: W('และ เป็น นี้ นั้น หนึ่ง ฉัน คุณ เรา พวกเขา ไม่ มี ทำ อะไร บ้าน น้ำ วัน กลางคืน คน ผู้หญิง เด็ก เมือง หมู่บ้าน พระเจ้า คำ หนังสือ ทาง ดวงอาทิตย์ ดวงจันทร์ ท้องฟ้า โลก ต้นไม้ ดอกไม้ หัวใจ ความรัก พระราชา'), stop: ' ', join: '' },
  km: { name: 'Khmer', words: W('និង គឺ នេះ នោះ មួយ ខ្ញុំ អ្នក យើង ពួកគេ មិន មាន ធ្វើ អ្វី ផ្ទះ ទឹក ថ្ងៃ យប់ មនុស្ស ស្ត្រី កូន ទីក្រុង ភូមិ ព្រះ ពាក្យ សៀវភៅ ផ្លូវ ព្រះអាទិត្យ ព្រះចន្ទ មេឃ ផែនដី ដើមឈើ ផ្កា បេះដូង ស្នេហា ស្តេច'), stop: '។', join: '' },
  my: { name: 'Burmese', words: W('နှင့် ဖြစ် ဒီ ထို တစ် ကျွန်ုပ် သင် ကျွန်ုပ်တို့ သူတို့ မ ရှိ လုပ် ဘာ အိမ် ရေ နေ့ ည လူ မိန်းမ ကလေး မြို့ ရွာ ဘုရား စကား စာအုပ် လမ်း နေ လ ကောင်းကင် ကမ္ဘာ သစ်ပင် ပန်း နှလုံး အချစ် ဘုရင်'), stop: '။', join: '' },
  zh: { name: 'Chinese (classical)', tag: 'zh-Hant', words: W('天 地 人 山 水 日 月 風 花 雪 心 道 王 國 家 書 文 言 學 生 年 時 春 秋 夏 冬 東 西 南 北 君 子 臣 民 父 母 兄 弟 之 而 其 者 也 以 於 不 有 無 為 所 可 曰 故 則 是 此 大 小 上 下 中 長 古 今 聖 賢 仁 義 禮 智 信'), stop: '。', comma: '，', join: '' },
  ja: { name: 'Japanese', words: W('私 は 学校 へ 行く 時 に 友達 と 話し ました 春 の 花 が 美しく 咲いて いる 山 川 空 雲 雨 風 月 日 人 心 夢 道 国 王 都 宮 御 女御 更衣 時めき たまふ ありけり いと やむごとなき 際 には あらぬ すぐれて なかに あまた さぶらひ たまひける いづれ 御時 にか 物語 歌 詠み 書き 言ふ 思ふ 見る 聞く 知る 来る 帰る 待つ 夜 朝 昼 秋 冬 夏 雪 鳥 声 涙 袖 恋 世 中 身 君 我 これ それ'), stop: '。', comma: '、', join: '' },
  ko: { name: 'Korean', words: W('그리고 이다 이 그 하나 나 너 우리 그들 아니다 있었다 했다 무엇 집 물 날 밤 사람 여자 아이 도시 마을 하나님 말 책 길 해 달 하늘 땅 나무 꽃 마음 사랑 왕 산 바다 바람 노래 시간'), stop: '.' },
  am: { name: 'Amharic', words: W('እና ነው ይህ ያ አንድ እኔ አንተ እኛ እነሱ አይደለም ነበር አደረገ ምን ቤት ውሃ ቀን ሌሊት ሰው ሴት ልጅ ከተማ መንደር እግዚአብሔር ቃል መጽሐፍ መንገድ ፀሐይ ጨረቃ ሰማይ ምድር ዛፍ አበባ ልብ ፍቅር ንጉሥ'), stop: '።', comma: '፣' },
};
for (const [code, L] of Object.entries(LANGS)) {
  L.code = code;
  L.tag = L.tag || code;
  if (L.join === undefined) L.join = ' ';
  L.comma = L.comma || ',';
  // characters on a line of a folio side: fewer where each is a whole syllable or word
  L.perLine = L.join === '' && /^(ja|zh)/.test(code) ? 32 : L.join === '' ? 48 : 60;
}

// a seeded random number, so that every run copies the same errors
function rng(seed) {
  let s = seed || 20261107;
  const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  return { r, pick: (a) => a[Math.floor(r() * a.length)] };
}

const PUNCT = /[.,،۔。、，।॥։።፣།។။]$/;

// The text as paragraphs of words, long enough for the folio sides asked for.
function original(L, sides, lines, R) {
  const budget = sides * lines * L.perLine;
  const paras = [];
  let chars = 0;
  while (chars < budget) {
    const words = [];
    const sentences = 2 + Math.floor(R.r() * 4);
    for (let s = 0; s < sentences; s++) {
      const n = 7 + Math.floor(R.r() * 10);
      for (let k = 0; k < n; k++) words.push(R.pick(L.words) + (k === n - 1 ? L.stop : R.r() < 0.08 ? L.comma : ''));
    }
    paras.push(words.map((w) => w.replace(/ $/, '')).filter(Boolean));
    chars += words.join(L.join).length + 1;
  }
  return paras;
}

// Another spelling of a word: a letter doubled, or the last but one left out, or a mark dropped.
function respell(w, R) {
  const g = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(w)].map((x) => x.segment);
  if (g.length < 2) return w;
  const x = R.r();
  if (x < 0.4) { const i = Math.floor(R.r() * g.length); g.splice(i, 0, g[i]); return g.join(''); }
  if (x < 0.7 && g.length > 2) { g.splice(g.length - 2, 1); return g.join(''); }
  const plain = w.normalize('NFD').replace(/\p{M}/u, '').normalize('NFC');
  return plain !== w ? plain : g.slice(0, -1).join('');
}

// One copying: each word may be changed, spelt otherwise, left out, added to or put after the next.
function copy(L, paras, rate, R) {
  return paras.map((ws) => {
    const out = [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], x = R.r();
      const tail = (w.match(PUNCT) || [''])[0], bare = tail ? w.slice(0, -1) : w;
      if (x < rate * 0.35) out.push(R.pick(L.words) + tail);
      else if (x < rate * 0.6) out.push(respell(bare, R) + tail);
      else if (x < rate * 0.75) { if (tail && out.length) out[out.length - 1] = out[out.length - 1].replace(PUNCT, '') + tail; }
      else if (x < rate * 0.88) { out.push(w); out.push(R.pick(L.words)); }
      else if (x < rate && i + 1 < ws.length && !tail) { out.push(ws[i + 1].replace(PUNCT, '')); out.push(bare + (ws[i + 1].match(PUNCT) || [''])[0]); i++; }
      else out.push(w);
    }
    return out.filter(Boolean);
  });
}

// Witnesses down a stemma: the archetype, three families, the copies of each in turn.
function witnesses(L, n, sides, lines, seed) {
  const R = rng(seed);
  const O = original(L, sides, lines, R);
  const families = [copy(L, O, 0.03, R), copy(L, O, 0.03, R), copy(L, O, 0.03, R)];
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, n).map((s, i) => ({ siglum: s, paras: copy(L, families[i % 3], 0.015, R) }));
}

// A witness as Manuscribe holds it: folio sides of lines, each paragraph marked with its citation ID. A line that
// ends between words ends with a space, as a transcriber types it; else the word runs on.
function pagesOf(L, paras, lines) {
  const out = [];
  let line = '', page = [];
  const flush = () => { page.push(line + (L.join ? ' ' : '')); line = ''; if (page.length === lines) { out.push(page); page = []; } };
  paras.forEach((ws, k) => {
    line += '<x-marker type="p-start" id="p' + (k + 1) + '"/>';
    ws.forEach((w, i) => {
      const bare = line.replace(/<[^>]+>/g, '');
      if (bare.length + w.length + 1 > L.perLine && bare.length) flush();
      line += (i && L.join && line.replace(/<[^>]+>/g, '').length ? L.join : '') + w;
    });
    line += '<x-marker type="p-end"/>' + (L.join ? ' ' : '');
  });
  if (line) flush();
  if (page.length) { while (page.length < lines) page.push(''); out.push(page); }
  return out;
}

// The witnesses of a language, ready to be put into the page: [{siglum, pages, words, chars}]
function make(code, n, sides, lines, seed) {
  const L = LANGS[code];
  return witnesses(L, n, sides, lines, seed).map((w) => ({ siglum: w.siglum, pages: pagesOf(L, w.paras, lines), words: w.paras.reduce((a, p) => a + p.length, 0), chars: w.paras.reduce((a, p) => a + p.join(L.join).length, 0), blocks: w.paras.length }));
}

/* In the page: an edition of these witnesses, set up as Manuscribe sets one up for their language (the comparison
   profile and how they are lined up, as the first Collate chooses), collated. -> window.lang = {ed, list} */
async function buildInPage(page, L, data, lines) {
  return page.evaluate(async (L, data, lines) => {
    const { Model, Store, Edition, Collate } = ME;
    const ed = Edition.create(L.name + ': a test edition');
    ed.editor = 'Test';
    const list = [];
    for (const d of data) {
      const p = Model.upgrade(Model.newProject({ meta: { title: 'Codex ' + d.siglum, siglum: d.siglum, textLang: L.tag, repository: 'Bibliotheca', shelfmark: 'Ms. ' + d.siglum }, layoutType: 'linear', lines: { main: lines }, folios: {} }));
      p.pdf = { name: d.siglum + '.pdf', pages: d.pages.length };
      const labels = Model.entries(p).map((e) => e.label);
      p.pages = {};
      d.pages.forEach((ls, i) => { p.pages[labels[i]] = { boxes: { main: ls } }; });
      await Store.putProject(p);
      const w = { siglum: d.siglum, projectId: p.id, streams: {} };
      ed.witnesses.push(w); list.push({ w, p });
    }
    ed.trust = data.map((d) => d.siglum);
    ME.Features.setContext(ME.Features.langsOf(list));
    Collate.chooseFor(ed, ME.Features.langsOf(list));
    await Store.putEdition(ed);
    window.lang = { ed, list, profile: ME.Norm.settings(ed.norm).profile.id, tokens: Collate.tokenKind(ed), pack: ME.Features.pack('south-asian', ME.Features.langsOf(list), { auto: true }).active };
    return { profile: window.lang.profile, tokens: window.lang.tokens, pack: window.lang.pack };
  }, { name: L.name, tag: L.tag }, data, lines);
}

module.exports = { LANGS, make, buildInPage };
