// ─── chillChat.js (النسخة المتطورة - Full EQ + Dialect Engine) ─────────────────
// الإصدار: 3.0 | المطور: FLUX IO Team
// المحرك: Groq API | النموذج: llama-3.3-70b-versatile

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── ثوابت الإعداد ────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS      = 2500;  // مهلة بين الردود المتتالية (ms)
const MAX_HISTORY         = 30;    // ذاكرة موسعة لفهم السياق العاطفي والسلوكي
const BASE_CHIME_CHANCE   = 0.55;  // نسبة التدخل الأساسية (تتغير ديناميكياً)
const MENTION_COOLDOWN_MS = 500;   // مهلة مختصرة عند المنشن المباشر

// ─── مخازن الحالة ─────────────────────────────────────────────────────────────
const channelHistory    = new Map(); // تاريخ المحادثات لكل قناة
const chillCooldown     = new Map(); // كولداون لكل قناة
const userEmotionCache  = new Map(); // آخر حالة عاطفية رُصدت لكل مستخدم
const conversationDepth = new Map(); // عمق الحوار بين FLUX ومستخدم معين

// ══════════════════════════════════════════════════════════════════════════════
// ١. محرك كشف اللهجة (Dialect Detection Engine)
// ══════════════════════════════════════════════════════════════════════════════

// قاموس الكلمات المفتاحية لكل لهجة
const DIALECT_LEXICON = {
  saudi: {
    words: [
      'وش','زين','يبه','عيال','حلو','مره','ابشر','شنو','كيفك','ايش',
      'ولا','فهد','بعدين','صح','خوك','بغيت','وايل','ثمانيه','فهمت',
      'تعبت','طيب','ياله','لول','جد','وشو','خلك','قهوة','قاعد',
      'يسلموا','ماشي','خلص','شلونك','عادل','حسبي','يلا روح'
    ],
    weight: 1.0
  },
  jordanian: {
    words: [
      'شو','هيك','يسطا','يزاك','اشي','منيح','هلق','كتير','زلمة',
      'والله','ولك','مشان','ما في','انبسط','ياخي','هاد','يخي',
      'عنجد','معهم','قديش','بدك','روح','بتعرف','مزبوط','منيح كتير',
      'يا زلمة','شو بدك','هلأ','حكيلي','اشتغلت','تكسلت','عم'
    ],
    weight: 1.0
  },
  egyptian: {
    words: [
      'إيه','ازيك','كده','مش','عارف','والنبي','أهو','بقى','يسطا',
      'ماشي','إزيك','بجد','يعني','طيب','اللي','علطول','أيوه','لأ',
      'ده','دي','امتى','فين','عايز','هنا','جاي','خلاص','تمام',
      'يا عم','انت','معاك','مبروك','امتى','فاهم','ابقى','اكيد'
    ],
    weight: 1.0
  },
  iraqi: {
    words: [
      'شلونك','گلبي','ابو','هواي','دخيلك','يمه','عمي','بعد عمري',
      'لازم','شگد','پارة','ماكو','اكو','انت','رواق','شنو','مال',
      'يبه','للا','هسه','حچي','ياخي','بالله','شبيك','منو','گصة'
    ],
    weight: 1.0
  },
  gulf: {
    words: [
      'وايد','صج','عيل','ليش','حيل','باين','مالت','تره','بس','اهوه',
      'يبيلك','شفيت','اتقلب','مهوب','اتحمل','ماخذ','خوي','ابوك',
      'يزاك الله','مشكور','الله يعطيك','عساك','لين'
    ],
    weight: 0.9
  },
  levantine: {
    words: [
      'هلق','كيفك','منيح','ولك','مشان','ما في','انبسط','هاد',
      'عنجد','معهم','قديش','بدك','بعرف','مزبوط','يلا','ماشي',
      'شو في','خيو','يا خيي','اشتقتلك','تسلم','والله منيح'
    ],
    weight: 0.9
  },
  maghrebi: {
    words: [
      'واش','نتا','بزاف','مزيان','كيداير','والو','درك','بغيت',
      'هاد','فين','كيفاش','ماشي','علاش','مع','حتى','باش','نحب'
    ],
    weight: 0.9
  }
};

/**
 * detectDialect() - يحلل النص ويعيد اللغة واللهجة المحددة
 * @param {string} text - نص الرسالة
 * @returns {{ lang: string, dialect: string, confidence: number }}
 */
function detectDialect(text) {
  const lowerText = text.toLowerCase();
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars  = text.replace(/\s/g, '').length;
  const arabicRatio = totalChars > 0 ? arabicChars / totalChars : 0;

  // ── إذا كان النص إنجليزي ─────────────────────────────────────────────────
  if (arabicRatio < 0.25) {
    return { lang: 'english', dialect: 'english', confidence: 0.9 };
  }

  // ── تحديد اللهجة العربية بالأوزان ────────────────────────────────────────
  const scores = {};
  for (const [dialect, data] of Object.entries(DIALECT_LEXICON)) {
    let score = 0;
    for (const word of data.words) {
      if (lowerText.includes(word)) {
        score += data.weight;
      }
    }
    scores[dialect] = score;
  }

  const sorted      = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topDialect  = sorted[0][0];
  const topScore    = sorted[0][1];
  const confidence  = topScore > 0 ? Math.min(topScore / 3, 1.0) : 0.3;

  return {
    lang:      'arabic',
    dialect:   topScore > 0 ? topDialect : 'unknown',
    confidence
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٢. محرك الذكاء العاطفي (Emotional Intelligence Engine)
// ══════════════════════════════════════════════════════════════════════════════

// قاموس المشاعر العربي والإنجليزي
const EMOTION_LEXICON = {
  // ── مشاعر سلبية ────────────────────────────────────────────────────────────
  anger: {
    ar: ['غاضب','زعلان','مو طايق','كاره','قاهرني','حانقي','عصبي','بتموت','مجنن','مو عاجبني',
         'ماعاد اتحمل','غبي','حمار','اتنرفز','نرفزة','حرقت دمي','تعبني','مشكله','ايش هذا'],
    en: ['angry','mad','pissed','frustrated','furious','annoyed','hate','cant stand','fed up'],
    intensity_boost: { high: ['جداً','كثير','مرة','ماعاد','يقتلني','extremely','so much','really'] }
  },
  sadness: {
    ar: ['حزين','زهقت','بكيت','ما في أمل','تعبت','ما عندي حيل','خسرت','راح','ضاع','وجع',
         'مكسور','مدمر','نهايتي','صعب','موجوع','تعب','وحيد','ما في أحد','اشتقت'],
    en: ['sad','depressed','crying','hopeless','lost','broken','hurt','devastated','miss','lonely'],
    intensity_boost: { high: ['جداً','كثير','ما أقدر','cant stop','so much'] }
  },
  anxiety: {
    ar: ['خايف','قلقان','متوتر','مو عارف','مشكلة','خوف','قلق','ضغط','صعب','مو قادر أنام',
         'تفكير','مو مرتاح','خوفني','مو واثق','مو عارف ايش أسوي'],
    en: ['anxious','worried','nervous','scared','stressed','overwhelmed','panic','fear','dread'],
    intensity_boost: { high: ['كثير','جداً','مو قادر','cant','cant stop'] }
  },
  loneliness: {
    ar: ['وحيد','ما في أحد','ما عندي أحد','مو مع أحد','غايب','منسي','بعيد',
         'ما أحد يسأل','حاسس إني وحدي','مو موجود لي أحد','اشتقت'],
    en: ['alone','lonely','no one','isolated','nobody','missing','forgotten'],
    intensity_boost: { high: ['كثير','جداً','always','really'] }
  },
  joy: {
    ar: ['مبسوط','فرحان','نجحت','عملتها','الحمدلله','سعيد','ممتاز','رائع','حبيت','عجبني',
         'اشتريت','اتوظفت','خلصت','انتهى','وصلت','ربحت','مو صدق','ماشالله','يلا'],
    en: ['happy','excited','great','amazing','won','passed','got','love','awesome','finally','yay'],
    intensity_boost: { high: ['كثير','جداً','مو صدق','omg','so much'] }
  },
  boredom: {
    ar: ['مال','ملول','مو في شي','ممل','فاضي','ما في شي أسوي','ما أبي شي','بطيء','ما في موضوع'],
    en: ['bored','boring','nothing','nothing to do','dead','slow'],
    intensity_boost: { high: ['جداً','كثير','really','so'] }
  },
  embarrassment: {
    ar: ['خجلت','حرجت','وايد انحرجت','مو طبيعي','ما أقدر أنسى','كلهم شافوا','فضحت','مقصر'],
    en: ['embarrassed','ashamed','awkward','cringe','fail'],
    intensity_boost: { high: ['جداً','كثير','really','so'] }
  },
  // ── إشارات الخطر ───────────────────────────────────────────────────────────
  warning: {
    ar: ['ما أبي أكمل','تعبت من كل شي','ودي أختفي','ما أبي أحيا','حياتي ما تستاهل',
         'ودي أنهي','ما عاد أقدر','ما في فايدة مني','أنا ما يستاهل أعيش','نهايتي قربت'],
    en: ['want to die','end it all','no point living','disappear','cant go on',
         'worthless','give up on life','wish i was dead'],
    intensity_boost: { high: [] }
  }
};

/**
 * detectEmotion() - يحلل المشاعر في النص
 * @param {string} text
 * @returns {{ emotion: string, intensity: 'low'|'medium'|'high', needsSupport: boolean, warningFlag: boolean }}
 */
function detectEmotion(text) {
  const lower = text.toLowerCase();
  const scores = {};

  for (const [emotion, data] of Object.entries(EMOTION_LEXICON)) {
    let score = 0;

    // فحص الكلمات العربية
    for (const word of (data.ar || [])) {
      if (lower.includes(word)) score += 1.5;
    }
    // فحص الكلمات الإنجليزية
    for (const word of (data.en || [])) {
      if (lower.includes(word)) score += 1.2;
    }
    // فحص مضخمات الشدة
    const boostWords = data.intensity_boost?.high || [];
    for (const word of boostWords) {
      if (lower.includes(word)) score += 0.8;
    }

    scores[emotion] = score;
  }

  // ── إشارة الخطر لها أولوية قصوى ──────────────────────────────────────────
  if (scores['warning'] > 0) {
    return {
      emotion:     'warning',
      intensity:   'high',
      needsSupport: true,
      warningFlag: true
    };
  }

  // ── تحديد المشاعر الأخرى ──────────────────────────────────────────────────
  const sorted = Object.entries(scores)
    .filter(([k]) => k !== 'warning')
    .sort((a, b) => b[1] - a[1]);

  const topEmotion = sorted[0];

  if (!topEmotion || topEmotion[1] === 0) {
    return { emotion: 'neutral', intensity: 'low', needsSupport: false, warningFlag: false };
  }

  const topScore = topEmotion[1];
  const intensity = topScore > 3.5 ? 'high' : topScore > 1.5 ? 'medium' : 'low';
  const negativeSupportEmotions = ['sadness', 'anxiety', 'loneliness', 'anger'];
  const needsSupport = negativeSupportEmotions.includes(topEmotion[0]) && intensity !== 'low';

  return {
    emotion:     topEmotion[0],
    intensity,
    needsSupport,
    warningFlag: false
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٣. محرك قرار التدخل (Smart Reply Decision Engine)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * shouldReply() - يقرر ديناميكياً إذا كان يجب الرد على الرسالة
 * @param {object} message - رسالة Discord
 * @param {object} emotionResult - نتيجة detectEmotion()
 * @param {boolean} isMentioned - هل تم ذكر FLUX
 * @returns {{ reply: boolean, reason: string }}
 */
function shouldReply(message, emotionResult, isMentioned) {
  const { content, author, channel } = message;
  const lower = content.toLowerCase();

  // ── الأولوية القصوى: المنشن المباشر ──────────────────────────────────────
  if (isMentioned) {
    return { reply: true, reason: 'direct_mention' };
  }

  // ── أولوية عالية: إشارة خطر ───────────────────────────────────────────────
  if (emotionResult.warningFlag) {
    return { reply: true, reason: 'safety_warning' };
  }

  // ── ابدأ بالنسبة الأساسية ─────────────────────────────────────────────────
  let chance = BASE_CHIME_CHANCE;

  // ── رفع النسبة عند مؤشرات المشاركة ──────────────────────────────────────
  // الرسائل التي فيها سؤال
  if (/[؟?]/.test(content) || /\b(ايش|وش|كيف|شو|ليش|ليه|إيه|امتى|فين|منو|وين)\b/.test(lower)) {
    chance += 0.25;
  }
  // رسائل فيها مشاعر قوية
  if (emotionResult.needsSupport || emotionResult.intensity === 'high') {
    chance += 0.30;
  }
  // رسائل الفرح والإنجازات
  if (emotionResult.emotion === 'joy' && emotionResult.intensity !== 'low') {
    chance += 0.20;
  }
  // رسائل فيها رأي أو نقاش
  if (/\b(برايك|رأيك|شو تفكر|ايش تقول|تعتقد|صح ولا غلط)\b/.test(lower)) {
    chance += 0.20;
  }

  // ── خفض النسبة عند مؤشرات الخصوصية ──────────────────────────────────────
  // محادثة خاصة بين مستخدمين (رسائل قصيرة ومتبادلة بسرعة)
  const history = channelHistory.get(channel.id) || [];
  const recentMessages = history.slice(-4);
  const uniqueUsers = new Set(recentMessages.map(m => m.username).filter(Boolean));
  if (uniqueUsers.size <= 2 && recentMessages.length >= 3) {
    chance -= 0.20;
  }

  // رسائل قصيرة جداً (GIF أو ستيكر أو كلمة وحدة)
  if (content.trim().split(' ').length <= 1) {
    chance -= 0.30;
  }

  // ── تطبيق الحد المنطقي ────────────────────────────────────────────────────
  chance = Math.max(0.10, Math.min(chance, 0.95));

  if (Math.random() <= chance) {
    return { reply: true, reason: `dynamic_chance_${Math.round(chance * 100)}pct` };
  }

  return { reply: false, reason: 'random_skip' };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٤. بناء البرومبت الديناميكي (Dynamic System Prompt Builder)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getDialectInstructions() - تعليمات اللهجة المحددة
 */
function getDialectInstructions(dialect) {
  const instructions = {
    saudi: `
[لهجتك: سعودي خالص]
- استخدم: "وش"، "زين"، "يبه"، "مره"، "حلو"، "ابشر"، "طيب"، "ياله"، "خلك"، "والله"
- أسلوبك: مريح، واثق، خفيف ودافئ. أحياناً تضرب مثل أو مقولة.
- أمثلة: "وش صاير؟"، "يبه والله تعبت معك"، "زين ما جيت"، "الله يعافيك"`,

    jordanian: `
[لهجتك: أردني/فلسطيني]
- استخدم: "شو"، "هيك"، "يا زلمة"، "منيح"، "هلق"، "كتير"، "عنجد"، "ولك"، "حكيلي"
- أسلوبك: صريح، مباشر، أخوي بعمق. الصداقة عندك أمانة.
- أمثلة: "شو في معك؟"، "يا زلمة هاد موضوع"، "منيح كتير"، "عنجد؟ حكيلي أكتر"`,

    egyptian: `
[لهجتك: مصري خالص]
- استخدم: "يا عم"، "إيه"، "بجد"، "والنبي"، "كده"، "خلاص"، "أهو"، "بقى"، "يسطا"
- أسلوبك: خفيف الدم، حيوي، مرح، عندك نكتة دايماً.
- أمثلة: "إيه اللي بيحصل؟"، "بجد يا عم؟"، "والنبي كده؟"، "خلاص تمام"`,

    iraqi: `
[لهجتك: عراقي]
- استخدم: "شلونك"، "هواي"، "عمي"، "گلبي"، "بعد عمري"، "هسه"، "ماكو"، "اكو"، "شگد"
- أسلوبك: حار جداً، عاطفي، صادق. الكلمة عندك تجي من القلب.
- أمثلة: "شلونك عمي؟"، "هواي زين"، "گلبي ليش هيجي؟"، "هسه فاهم عليك"`,

    gulf: `
[لهجتك: خليجي عام]
- استخدم: "وايد"، "صج"، "حيل"، "تره"، "بس"، "مهوب"، "خوي"، "مشكور"
- أسلوبك: هادئ، محترم، دافئ مع اللي تعرفه.
- أمثلة: "وايد صعبة"، "صج هيك؟"، "حيل تعبان"، "تره أنا هنا"`,

    levantine: `
[لهجتك: شامي/لبناني/سوري]
- استخدم: "هلق"، "كيفك"، "منيح"، "ولك"، "مشان"، "ما في"، "خيو"، "عنجد"
- أسلوبك: ودود، أنيق بالكلام، عاطفي.
- أمثلة: "كيفك هلق؟"، "ولك شو في؟"، "عنجد حكيلي"، "مشان الله لا تشيل هم"`,

    maghrebi: `
[لهجتك: مغاربي (مروكي/جزائري/تونسي)]
- استخدم: "واش"، "بزاف"، "مزيان"، "درك"، "نتا"، "والو"
- أسلوبك: مباشر، صادق، دافئ.
- أمثلة: "واش راك؟"، "بزاف صعبة"، "درك فاهم عليك"`,

    english: `
[Your Style: Natural English - text message vibe]
- Use casual slang: "ngl", "fr", "lowkey", "bro", "lmao", "omg", "tbh", "yeah", "nah", "kinda"
- Be concise and chill. Sound like a real friend texting back.
- Examples: "ngl that sounds rough", "fr tho what happened?", "bro that's actually insane"`,

    unknown: `
[لهجتك: عربية بيضاء مريحة ومحايدة]
- استخدم لغة بسيطة مفهومة للجميع، بدون كلمات خاصة بمنطقة معينة.
- أسلوبك: دافئ، مباشر، مريح.`
  };

  return instructions[dialect] || instructions['unknown'];
}

/**
 * getEmotionInstructions() - تعليمات التعامل مع الحالة العاطفية
 */
function getEmotionInstructions(emotionResult) {
  const { emotion, intensity, needsSupport, warningFlag } = emotionResult;

  // ── إشارة خطر: أعلى أولوية ───────────────────────────────────────────────
  if (warningFlag) {
    return `
[⚠️ تحذير: إشارة ضائقة نفسية شديدة]
STOP - لا تتجاهل هذا أبداً.
- تعامل بجدية تامة وحضور كامل. لا ترد بشكل خفيف أو مزاحي.
- اعترف بمشاعره أولاً: "سامعك، وهاد الكلام ثقيل"
- كن حاضراً معه: "أنا هون معك"
- اذكر المساعدة المتخصصة بشكل داعم لا مخيف: "في ناس متخصصين بيساعدوا أكثر مني، مش عيب تطلب مساعدة"
- لا تسأل عن التفاصيل الكثيرة، فقط اجعله يحس أنه مسموع.`;
  }

  const emotionMap = {
    anger: `
[الحالة العاطفية: غضب - شدة: ${intensity}]
- لا تجادله أو تدافع. هدوئك هو الرد الأذكى.
- أكد مشاعره: "حق تزعل"، "أتفهم قهرك"
- اسأله ببساطة: "وش صاير بالضبط؟" أو "حكيلي شو صار"
- إذا كان الغضب شديداً: ابدأ بالتحقق منه أولاً قبل أي كلام ثاني.`,

    sadness: `
[الحالة العاطفية: حزن - شدة: ${intensity}]
- لا تقفز للحلول. الاستماع أولاً وأهم.
- لا تقل "لا تحزن" أو "اتشجع" - هذه تقلل من مشاعره.
- قل: "حاسس فيك"، "والله يا أخوي صعبة"
- شجعه على الكلام: "بدك تحكيلي شو عندك؟"
- كن صبوراً، قد يحتاج وقتاً.`,

    anxiety: `
[الحالة العاطفية: قلق/خوف - شدة: ${intensity}]
- ابدأ بالطمأنة الدافئة قبل أي شيء: "روق، أنا هنا"
- لا تعطِ حلولاً جاهزة فوراً. افهم مصدر القلق أولاً.
- إذا كان القلق شديداً: "خلنا نفكر مع بعض، وش اللي ماشخك؟"
- أسلوب هادئ ومطمئن في كل جملة.`,

    loneliness: `
[الحالة العاطفية: وحدة - شدة: ${intensity}]
- هذه حالة تحتاج حضورك الكامل. لا تكن سطحياً.
- اعترف بالوحدة كمشاعر حقيقية: "الوحدة تعبانة فعلاً"
- كن موجوداً: "أنا هون، حكيلي"
- لا تنصحه بـ"اطلع مع ناس" مباشرة - أنصت أولاً.`,

    joy: `
[الحالة العاطفية: فرح/إنجاز - شدة: ${intensity}]
- شاركه الفرحة بصدق وحماس! لا تكن بارداً.
- احتفل معه: "يا سلام! كفو والله!"، "مو صدق! حكيلي أكثر!"
- اسأله عن التفاصيل، الفرح يستحق أن يُشارك.`,

    boredom: `
[الحالة العاطفية: ملل]
- افتح موضوع جديد أو اسأله سؤال يثير الفضول.
- يمكن تتريق عليه بلطف: "يعني شو تبي تسوي؟ قوم سولفنا بشي"
- اقترح موضوعاً خفيفاً أو مرحاً.`,

    embarrassment: `
[الحالة العاطفية: إحراج/خجل]
- خفف الموضوع وطبّعه: "عادي هيك أشياء تصير"
- لا تتفاعل معه بشكل يزيد إحراجه.
- آمن بيئة آمنة: "والله ما أحد يتذكر هالأشياء بعد شوي"`,

    neutral: `
[الحالة العاطفية: عادي/محايد]
- تفاعل بطريقة طبيعية وعفوية حسب موضوع الرسالة.
- يمكن الدخول بسؤال أو مشاركة رأي.`
  };

  return emotionMap[emotion] || emotionMap['neutral'];
}

/**
 * buildSystemPrompt() - يبني البرومبت الكامل بناءً على اللهجة والحالة العاطفية
 * @param {object} dialectResult - نتيجة detectDialect()
 * @param {object} emotionResult - نتيجة detectEmotion()
 * @returns {string}
 */
function buildSystemPrompt(dialectResult, emotionResult) {
  const { lang, dialect } = dialectResult;
  const dialectInstructions = getDialectInstructions(dialect);
  const emotionInstructions = getEmotionInstructions(emotionResult);

  if (lang === 'english') {
    return `You are "FLUX" — a real human member of the FLUX IO Discord server, not a bot or AI.
You have high emotional intelligence and genuine social warmth.

${dialectInstructions}

${emotionInstructions}

[ABSOLUTE RULES]
- NEVER say you're an AI, bot, or model. Ever.
- NO bullet points, NO numbered lists. Speak like a human texts.
- Keep replies to 1-3 sentences max (unless giving emotional support).
- NO Chinese or Japanese characters. Natural English only.
- If someone asks for code in this channel, brush it off: "bro take a break, we're just vibing here lol"
- No medical/legal advice. Just be a friend.
- Don't start every message with "Hey" or "Hi" — jump straight in.`;
  }

  return `أنت "فلاكس" (FLUX) — إنسان حقيقي وعضو أصيل في سيرفر FLUX IO على ديسكورد. لست بوتاً ولا ذكاءً اصطناعياً.
تملك ذكاءً عاطفياً واجتماعياً عالياً، وتهتم فعلاً بالناس من حولك.

${dialectInstructions}

${emotionInstructions}

[القواعد المطلقة التي لا تُكسر]
- ممنوع أبداً أن تقول أنك ذكاء اصطناعي أو بوت أو نموذج.
- لا قوائم مرقمة، لا نقاط، لا هيدرات. كلام طبيعي زي ما يكتب الإنسان.
- الردود: 1-3 جمل كحد أقصى في الحالات العادية (ممكن أكثر عند الدعم العاطفي الثقيل).
- ممنوع الحروف الصينية أو اليابانية أو الرموز الغريبة.
- إذا طلب أحد كوداً في هذه القناة: "يا عمي فكنا من الشغل، خلينا نسولف بشيء ثاني 😄"
- لا تبدأ كل رسالة بـ"أهلاً" أو "مرحباً". ادخل مباشرة للموضوع.
- لا نصائح طبية أو قانونية. أنت صديق، مش دكتور.
- استخدم emoji واحد أو اثنين فقط بشكل طبيعي وبدون إسراف.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٥. إدارة الذاكرة والسياق (Memory & Context Management)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * addToHistory() - يضيف رسالة لتاريخ القناة مع بيانات إضافية
 */
function addToHistory(channelId, role, content, username = null) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  history.push({ role, content, username, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.shift();
}

/**
 * buildMessageHistory() - يبني تسلسل الرسائل للـ API بشكل صحيح
 */
function buildMessageHistory(channelId, systemPrompt, username, userMessage) {
  const history = channelHistory.get(channelId) || [];
  const messages = [{ role: 'system', content: systemPrompt }];

  // بناء سجل المحادثة مع دمج الرسائل المتتالية لنفس الدور
  for (const msg of history) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === msg.role) {
      lastMsg.content += '\n' + msg.content;
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // تأكد أن آخر رسالة هي من المستخدم
  if (messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: `[${username}]: ${userMessage}` });
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٦. نداء Groq API مع إعدادات ديناميكية
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getTokenLimit() - يحدد حد الـ tokens بناءً على الحالة العاطفية
 */
function getTokenLimit(emotionResult) {
  if (emotionResult.warningFlag) return 250;
  if (emotionResult.intensity === 'high' && emotionResult.needsSupport) return 200;
  if (emotionResult.intensity === 'medium' && emotionResult.needsSupport) return 160;
  return 110;
}

/**
 * queryGroq() - استدعاء Groq API مع جميع المعطيات
 */
async function queryGroq(channelId, username, userMessage, dialectResult, emotionResult) {
  const groq = new Groq({ apiKey: GROQ_KEY, timeout: 25000 });

  // إضافة الرسالة للتاريخ قبل الاستدعاء
  addToHistory(channelId, 'user', `[${username}]: ${userMessage}`, username);

  const systemPrompt = buildSystemPrompt(dialectResult, emotionResult);
  const messages     = buildMessageHistory(channelId, systemPrompt, username, userMessage);
  const maxTokens    = getTokenLimit(emotionResult);

  // ضبط Temperature بناءً على الموقف العاطفي
  const temperature = emotionResult.needsSupport || emotionResult.warningFlag
    ? 0.65  // أكثر تحكماً وتماسكاً في المواقف الحساسة
    : 0.82; // أكثر إبداعاً وعفوية في المحادثات العادية

  const completion = await groq.chat.completions.create({
    model:             'llama-3.3-70b-versatile',
    messages,
    max_tokens:        maxTokens,
    temperature,
    top_p:             0.90,
    frequency_penalty: 0.55,
    presence_penalty:  0.30,
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) throw new Error('Empty Groq response');

  const cleanText = cleanResponse(rawText);
  addToHistory(channelId, 'assistant', cleanText);

  return cleanText;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٧. تنظيف النص والمساعدات (Text Cleaning & Utilities)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * cleanResponse() - ينظف الرد من الرموز غير المرغوبة والتواقيع
 */
function cleanResponse(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, '')            // حذف الحروف الصينية
    .replace(/[\u3040-\u30ff]/g, '')             // حذف الحروف اليابانية
    .replace(/\[?(flux|bot|assistant|ai)\]?:?\s*/gi, '') // حذف التواقيع الذاتية
    .replace(/^["']|["']$/g, '')                 // حذف علامات التنصيص الخارجية
    .replace(/\n{3,}/g, '\n\n')                  // تنظيف السطور الزائدة
    .trim();
}

/**
 * humanDelay() - يحاكي تأخير الكتابة البشري
 * @param {number} msgLength - طول الرسالة المستلمة
 * @param {object} emotionResult - الحالة العاطفية
 * @returns {number} - التأخير بالمللي ثانية
 */
function humanDelay(msgLength, emotionResult) {
  // تأخير أطول قليلاً في المواقف العاطفية الثقيلة (يعكس التفكير)
  const baseDelay  = emotionResult.needsSupport ? 2200 : 1200;
  const readDelay  = Math.min(msgLength * 28, 4000);
  const randomJitter = Math.random() * 900;
  return baseDelay + readDelay + randomJitter;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٨. المعالج الرئيسي (Main Handler)
// ══════════════════════════════════════════════════════════════════════════════

async function handleChillMessage(message) {
  const { author, channel, content } = message;

  // ── فلاتر أساسية ──────────────────────────────────────────────────────────
  if (author.bot)          return;
  if (!content?.trim())    return;
  if (!channel.name?.toLowerCase().includes('chill')) return;

  const now         = Date.now();
  const isMentioned = /فلاكس|flux/i.test(content)
    || message.mentions?.has(message.client?.user?.id);

  // ── تحليل الرسالة ─────────────────────────────────────────────────────────
  const dialectResult = detectDialect(content);
  const emotionResult = detectEmotion(content);

  // ── تحديث كاش المشاعر للمستخدم ───────────────────────────────────────────
  userEmotionCache.set(author.id, { ...emotionResult, updatedAt: now });

  // ── قرار الرد ─────────────────────────────────────────────────────────────
  const replyDecision = shouldReply(message, emotionResult, isMentioned);

  if (!replyDecision.reply) {
    // حتى عند تخطي الرد، احفظ الرسالة للسياق
    addToHistory(channel.id, 'user', `[${author.username}]: ${content}`, author.username);
    return;
  }

  // ── كولداون (مرن: أقصر عند المنشن أو إشارة الخطر) ─────────────────────────
  const cooldownPeriod = (isMentioned || emotionResult.warningFlag)
    ? MENTION_COOLDOWN_MS
    : AI_COOLDOWN_MS;

  if (now - (chillCooldown.get(channel.id) || 0) < cooldownPeriod) return;
  chillCooldown.set(channel.id, now);

  // ── احسب التأخير البشري ───────────────────────────────────────────────────
  const delay = humanDelay(content.length, emotionResult);

  try {
    // مرحلة الكتابة (تبدأ بسرعة لتعطي إحساساً بالقراءة)
    await new Promise(r => setTimeout(r, delay * 0.25));
    await channel.sendTyping().catch(() => {});

    // استدعاء الـ API
    const response = await queryGroq(
      channel.id,
      author.username,
      content,
      dialectResult,
      emotionResult
    );

    // تأخير إضافي يحاكي وقت الكتابة الفعلي
    await new Promise(r => setTimeout(r, delay * 0.75));

    // ── إرسال الرد ────────────────────────────────────────────────────────
    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    // ── لوغ مفيد ──────────────────────────────────────────────────────────
    console.log(
      `[FLUX-EQ] 🧠 ${author.tag} | ` +
      `لهجة: ${dialectResult.dialect} (${Math.round(dialectResult.confidence * 100)}%) | ` +
      `مشاعر: ${emotionResult.emotion} [${emotionResult.intensity}] | ` +
      `سبب الرد: ${replyDecision.reason}`
    );

  } catch (err) {
    console.error(`[FLUX-EQ] ❌ خطأ: ${err.message}`);

    // رد احتياطي فقط عند المنشن المباشر أو إشارة الخطر
    if (isMentioned || emotionResult.warningFlag) {
      const fallbackMsg = dialectResult.lang === 'arabic'
        ? 'معي مشكلة صغيرة هسة، بس أنا هنا 🙏'
        : 'having a small issue rn, but I got you 🙏';
      await channel.send(fallbackMsg).catch(() => {});
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// التصدير
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  name:               'chillChat',
  once:               false,
  handleChillMessage,
  // تصدير الدوال المساعدة للاختبار والتطوير
  detectDialect,
  detectEmotion,
  shouldReply,
  buildSystemPrompt,
};