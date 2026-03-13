// ─── layers/perceptionLayer.js ─────────────────────────────────────────────────
// طبقة الإدراك: تحلل كل رسالة وتستخرج منها بيانات منظمة
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// ١. قاموس اللهجات الموسّع
// ══════════════════════════════════════════════════════════════════════════════
const DIALECT_LEXICON = {
  saudi: {
    words: ['وش','وشو','زين','يبه','عيال','حلو','مره','ابشر','شنو','ايش',
            'بغيت','طيب','ياله','خلك','يسلموا','خلص','شلونك','قاعد','ماشي',
            'يلا روح','كيفك سعودي','ايه هذا','والله كذا','وايه','بعدين صح',
            'تعب','ماخذ','خوك','ابوك','من هنا','زبالة','يا شيخ','بحر'],
    weight: 1.2
  },
  jordanian: {
    words: ['شو','هيك','يسطا','يزاك','اشي','منيح','هلق','كتير','زلمة',
            'ولك','مشان','ما في','انبسط','ياخي','هاد','يخي','عنجد',
            'قديش','بدك','بتعرف','مزبوط','حكيلي','اشتغلت','عم','هلأ',
            'بدي','بحكيلك','سو','مزبوط هيك','شو في'],
    weight: 1.2
  },
  egyptian: {
    words: ['إيه','ازيك','كده','مش','عارف','والنبي','أهو','بقى','يسطا',
            'ماشي','إزيك','بجد','يعني','طيب','علطول','أيوه','لأ','ده',
            'دي','امتى','فين','عايز','هنا','جاي','خلاص','يا عم','انت',
            'معاك','مبروك','فاهم','ابقى','اكيد','زيك','حتة','اللي','ابن'],
    weight: 1.2
  },
  iraqi: {
    words: ['شلونك','گلبي','هواي','دخيلك','يمه','عمي','بعد عمري',
            'شگد','ماكو','اكو','رواق','هسه','حچي','ياخي','منو','گصة',
            'پارة','للا','للمره','عزيزي','ابن عمي','چنه','صاحبي','روحي'],
    weight: 1.2
  },
  gulf: {
    words: ['وايد','صج','عيل','ليش','حيل','باين','مالت','تره','اهوه',
            'يبيلك','مهوب','اتحمل','خوي','يزاك الله','مشكور','الله يعطيك',
            'عساك','لين','اتقلب','ودي','ابى','يحلى','ما قصر','شوف'],
    weight: 1.1
  },
  levantine: {
    words: ['كيفك','منيح','ولك','مشان','ما في','انبسط','هاد','عنجد',
            'قديش','بدك','بعرف','مزبوط','يلا','شو في','خيو','يا خيي',
            'اشتقتلك','تسلم','شو عم','معلش','مو هيك','انشالله رح'],
    weight: 1.0
  },
  maghrebi: {
    words: ['واش','نتا','بزاف','مزيان','كيداير','والو','درك','بغيت',
            'هاد','فين','كيفاش','علاش','باش','نحب','نروح','بلاصة',
            'راك','كي','دابا','هاو','شي حاجة','سير','نتما'],
    weight: 1.0
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ٢. قواميس المشاعر والنوايا
// ══════════════════════════════════════════════════════════════════════════════
const EMOTION_LEXICON = {
  anger: {
    ar: ['غاضب','زعلان','مو طايق','كاره','قاهرني','حانقي','عصبي','بتموت',
         'مجنن','ماعاد اتحمل','حمار','اتنرفز','حرقت دمي','تعبني','مشكله'],
    en: ['angry','mad','pissed','furious','frustrated','hate','annoyed','fed up'],
    humor_signal: false
  },
  sadness: {
    ar: ['حزين','زهقت','بكيت','ما في أمل','تعبت','ما عندي حيل','خسرت','راح',
         'ضاع','وجع','مكسور','مدمر','موجوع','اشتقت','وحيد','ما في أحد'],
    en: ['sad','depressed','crying','hopeless','lost','broken','hurt','miss','lonely'],
    humor_signal: false
  },
  anxiety: {
    ar: ['خايف','قلقان','متوتر','مو عارف','مشكلة','خوف','قلق','ضغط',
         'مو قادر أنام','مو مرتاح','خوفني','مو واثق'],
    en: ['anxious','worried','nervous','scared','stressed','overwhelmed','panic'],
    humor_signal: false
  },
  loneliness: {
    ar: ['وحيد','ما في أحد','ما عندي أحد','غايب','منسي','بعيد',
         'ما أحد يسأل','حاسس إني وحدي','اشتقت'],
    en: ['alone','lonely','isolated','nobody','forgotten','missing'],
    humor_signal: false
  },
  joy: {
    ar: ['مبسوط','فرحان','نجحت','عملتها','الحمدلله','سعيد','ممتاز','رائع',
         'حبيت','عجبني','اشتريت','اتوظفت','خلصت','انتهى','ربحت','مو صدق','ماشالله'],
    en: ['happy','excited','great','amazing','won','passed','love','awesome','finally'],
    humor_signal: true
  },
  excitement: {
    ar: ['مو صدق','جد','جدياً','ما صدقت','يلا','بسرعة','ابشر','يييي','وووو'],
    en: ['omg','wow','cant believe','finally','yesss','letsgo','hyped'],
    humor_signal: true
  },
  boredom: {
    ar: ['مال','ملول','مو في شي','ممل','فاضي','ما في شي','بطيء','ما في موضوع'],
    en: ['bored','boring','nothing','nothing to do','dead','slow'],
    humor_signal: false
  },
  humor: {
    ar: ['ههه','هههه','😂','🤣','هيي','يموت','تموت من الضحك','سالفة','نكتة','دزتها'],
    en: ['lmao','lol','haha','😂','🤣','dead','💀','bruh','tf','ngl bro'],
    humor_signal: true
  },
  warning: {
    ar: ['ما أبي أكمل','تعبت من كل شي','ودي أختفي','ما أبي أحيا',
         'حياتي ما تستاهل','ودي أنهي','ما عاد أقدر','ما في فايدة مني',
         'أنا ما يستاهل أعيش','نهايتي','خلاص منهي'],
    en: ['want to die','end it all','no point living','disappear',
         'cant go on','worthless','give up on life','wish i was dead','kill myself'],
    humor_signal: false
  }
};

const INTENT_PATTERNS = {
  question: {
    ar: /[؟?]|^(كيف|وش|ايش|شو|ليش|ليه|إيه|امتى|فين|منو|وين|هل|من|ما هو|ما هي)/i,
    en: /^(how|what|why|when|where|who|is|are|can|could|would|should|do|does)/i
  },
  celebration: {
    ar: /(نجحت|عملتها|الحمدلله|ربحت|خلصت|اتوظفت|اشتريت|مبسوط)/i,
    en: /(won|passed|got|made it|finally|yay|celebrating|graduated)/i
  },
  venting: {
    ar: /(تعبت|زهقت|مو طايق|ما أقدر|مو قادر|كافي)/i,
    en: /(tired of|cant take|fed up|exhausted|so done|over it)/i
  },
  seek_help: {
    ar: /(ساعدني|محتاج|أبي مساعدة|ما أعرف|مو عارف كيف|نصيحة|رأيك)/i,
    en: /(help me|need help|dont know how|advice|what should|recommendation)/i
  },
  humor: {
    ar: /(هههه|😂|🤣|نكتة|سالفة|يموت|تموت)/i,
    en: /(lmao|lol|haha|💀|bruh|😂|🤣|joke|funny)/i
  },
  greeting: {
    ar: /^(السلام|مرحبا|هلا|اهلين|كيفكم|كيفك|هلو|هاي|يو)/i,
    en: /^(hey|hi|hello|sup|wassup|yo|heya|good morning|gm)/i
  },
  sharing: {
    ar: /(شوفوا|بقولكم|خبركم|اسمعوا|والله|تعرفون)/i,
    en: /(guys|listen|so basically|you know what|ngl|honestly|real talk)/i
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ٣. كاشف السخرية (Sarcasm Detector)
// ══════════════════════════════════════════════════════════════════════════════
const SARCASM_PATTERNS = {
  ar: [
    /طبعاً.*ما/i, /أكيد.*لأ/i, /جزاك الله.*عليك/i, /شكراً.*جداً/i,
    /يسلموا.*هالكلام/i, /بالتوفيق.*لو/i, /ممتاز.*صح/i
  ],
  en: [
    /oh great/i, /yeah right/i, /sure thing/i, /totally/i,
    /obviously/i, /wow thanks/i, /how wonderful/i, /so helpful/i
  ],
  markers: ['🙃','😒','🤦','🙄','😤'],
  negation_positive: /^(تمام|زين|ممتاز|رائع|مبروك|جميل)\s*(بس|لكن|ما|مو|لو)/i
};

function detectSarcasm(text) {
  let score = 0;

  // فحص الأنماط العربية والإنجليزية
  for (const p of SARCASM_PATTERNS.ar) { if (p.test(text)) score += 0.3; }
  for (const p of SARCASM_PATTERNS.en) { if (p.test(text)) score += 0.3; }

  // فحص الرموز التعبيرية
  for (const m of SARCASM_PATTERNS.markers) { if (text.includes(m)) score += 0.2; }

  // إيجابية متبوعة بنفي = سخرية محتملة
  if (SARCASM_PATTERNS.negation_positive.test(text)) score += 0.25;

  // الجمل القصيرة جداً مع علامة تعجب واحدة = سخرية محتملة
  if (text.trim().length < 15 && text.includes('!') && !text.includes('!!')) score += 0.1;

  return Math.min(score, 1.0);
}

// ══════════════════════════════════════════════════════════════════════════════
// ٤. واجهة الإدراك الرئيسية
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PerceptionResult
 * @property {string}  lang           - 'arabic' | 'english' | 'mixed'
 * @property {string}  dialect        - اللهجة المحددة
 * @property {number}  dialectConf    - الثقة في اللهجة (0-1)
 * @property {string}  emotion        - المشاعر الرئيسية
 * @property {number}  emotionIntensity - شدة المشاعر (0-1)
 * @property {boolean} needsSupport   - هل يحتاج دعماً
 * @property {boolean} warningFlag    - إشارة خطر
 * @property {string}  intent         - النية ('question'|'venting'|'humor'...)
 * @property {string}  topic          - الموضوع المستنتج
 * @property {boolean} isSarcastic    - هل هو ساخر
 * @property {number}  sarcasmScore   - درجة السخرية
 * @property {boolean} isHumorous     - هل فيه فكاهة
 * @property {string}  sentiment      - 'positive'|'negative'|'neutral'
 */

function analyze(text) {
  const lower = text.toLowerCase();

  // ── اكتشاف اللغة ────────────────────────────────────────────────────────
  const arabicChars  = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars   = text.replace(/\s/g, '').length || 1;
  const arabicRatio  = arabicChars / totalChars;
  const lang = arabicRatio > 0.6 ? 'arabic' : arabicRatio > 0.2 ? 'mixed' : 'english';

  // ── اكتشاف اللهجة ────────────────────────────────────────────────────────
  let dialectScores = {};
  for (const [dialect, { words, weight }] of Object.entries(DIALECT_LEXICON)) {
    let score = 0;
    for (const w of words) { if (lower.includes(w)) score += weight; }
    dialectScores[dialect] = score;
  }
  const sortedDialects = Object.entries(dialectScores).sort((a, b) => b[1] - a[1]);
  const topDialect     = sortedDialects[0];
  const dialect        = (topDialect[1] > 0) ? topDialect[0]
    : lang === 'english' ? 'english' : 'unknown';
  const dialectConf    = Math.min(topDialect[1] / 4, 1.0);

  // ── اكتشاف المشاعر ───────────────────────────────────────────────────────
  let emotionScores = {};
  for (const [em, data] of Object.entries(EMOTION_LEXICON)) {
    let score = 0;
    for (const w of (data.ar || [])) { if (lower.includes(w)) score += 1.5; }
    for (const w of (data.en || [])) { if (lower.includes(w)) score += 1.2; }
    emotionScores[em] = score;
  }

  // الخطر أولاً
  const warningFlag = emotionScores['warning'] > 0;
  if (warningFlag) {
    return {
      lang, dialect, dialectConf,
      emotion: 'warning', emotionIntensity: 1.0,
      needsSupport: true, warningFlag: true,
      intent: 'distress', topic: 'mental_health',
      isSarcastic: false, sarcasmScore: 0,
      isHumorous: false, sentiment: 'negative'
    };
  }

  const sortedEmotions = Object.entries(emotionScores)
    .filter(([k]) => k !== 'warning')
    .sort((a, b) => b[1] - a[1]);

  const topEmotion      = sortedEmotions[0];
  const emotion         = (topEmotion[1] > 0) ? topEmotion[0] : 'neutral';
  const rawIntensity    = topEmotion[1];
  const emotionIntensity = Math.min(rawIntensity / 5, 1.0);
  const negativeEmotions = ['anger','sadness','anxiety','loneliness'];
  const needsSupport    = negativeEmotions.includes(emotion) && rawIntensity > 1.5;

  // ── اكتشاف النية ─────────────────────────────────────────────────────────
  let intent = 'sharing';
  for (const [intentName, { ar, en }] of Object.entries(INTENT_PATTERNS)) {
    if (lang !== 'english' && ar.test(text)) { intent = intentName; break; }
    if (lang !== 'arabic'  && en.test(text)) { intent = intentName; break; }
  }

  // ── اكتشاف الموضوع (بسيط) ───────────────────────────────────────────────
  let topic = 'general';
  const topicKeywords = {
    gaming:     /[گg]يم|لعبة|game|gaming|ps5|xbox|pc|ranked|level/i,
    work:       /شغل|عمل|وظيفة|boss|مدير|راتب|work|job|office/i,
    study:      /دراسة|جامعة|اختبار|امتحان|study|exam|college|school/i,
    relationship: /حبيب|علاقة|حب|breakup|crush|relationship|dating/i,
    food:       /أكل|مطعم|food|eat|restaurant|وجبة/i,
    tech:       /كود|code|برمجة|AI|app|تقنية|tech|dev/i
  };
  for (const [t, pattern] of Object.entries(topicKeywords)) {
    if (pattern.test(text)) { topic = t; break; }
  }

  // ── اكتشاف السخرية ───────────────────────────────────────────────────────
  const sarcasmScore = detectSarcasm(text);
  const isSarcastic  = sarcasmScore > 0.35;

  // ── الفكاهة ──────────────────────────────────────────────────────────────
  const isHumorous = emotion === 'humor' || emotion === 'joy'
    || EMOTION_LEXICON.humor.ar.some(w => text.includes(w))
    || EMOTION_LEXICON.humor.en.some(w => lower.includes(w));

  // ── المشاعر الإجمالية ────────────────────────────────────────────────────
  const positiveEmotions = ['joy','excitement','humor'];
  const sentiment = warningFlag || negativeEmotions.includes(emotion) ? 'negative'
    : positiveEmotions.includes(emotion) ? 'positive' : 'neutral';

  return {
    lang, dialect, dialectConf,
    emotion, emotionIntensity,
    needsSupport, warningFlag,
    intent, topic,
    isSarcastic, sarcasmScore,
    isHumorous, sentiment
  };
}

module.exports = { analyze, detectSarcasm };