// ─── events/chillChat.js ──────────────────────────────────────────────────────
// الإصدار: 3.0 | المطور: FLUX IO Team
// المحرك: Groq API | النموذج: llama-3.3-70b-versatile
// ══════════════════════════════════════════════════════════════════════════════

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── ثوابت الإعداد ────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS      = 2500;
const MAX_HISTORY         = 30;
const BASE_CHIME_CHANCE   = 0.55;
const MENTION_COOLDOWN_MS = 500;

// ─── مخازن الحالة ─────────────────────────────────────────────────────────────
const channelHistory   = new Map();
const chillCooldown    = new Map();
const userEmotionCache = new Map();

// ══════════════════════════════════════════════════════════════════════════════
// ١. محرك كشف اللهجة
// ══════════════════════════════════════════════════════════════════════════════
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
      'يا عم','انت','معاك','مبروك','فاهم','ابقى','اكيد'
    ],
    weight: 1.0
  },
  iraqi: {
    words: [
      'شلونك','گلبي','ابو','هواي','دخيلك','يمه','عمي','بعد عمري',
      'لازم','شگد','پارة','ماكو','اكو','رواق','شنو','مال',
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

function detectDialect(text) {
  const lowerText   = text.toLowerCase();
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars  = text.replace(/\s/g, '').length;
  const arabicRatio = totalChars > 0 ? arabicChars / totalChars : 0;

  if (arabicRatio < 0.25) {
    return { lang: 'english', dialect: 'english', confidence: 0.9 };
  }

  const scores = {};
  for (const [dialect, data] of Object.entries(DIALECT_LEXICON)) {
    let score = 0;
    for (const word of data.words) {
      if (lowerText.includes(word)) score += data.weight;
    }
    scores[dialect] = score;
  }

  const sorted     = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topDialect = sorted[0][0];
  const topScore   = sorted[0][1];
  const confidence = topScore > 0 ? Math.min(topScore / 3, 1.0) : 0.3;

  return {
    lang:      'arabic',
    dialect:   topScore > 0 ? topDialect : 'unknown',
    confidence
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٢. محرك الذكاء العاطفي
// ══════════════════════════════════════════════════════════════════════════════
const EMOTION_LEXICON = {
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
  warning: {
    ar: ['ما أبي أكمل','تعبت من كل شي','ودي أختفي','ما أبي أحيا','حياتي ما تستاهل',
         'ودي أنهي','ما عاد أقدر','ما في فايدة مني','أنا ما يستاهل أعيش','نهايتي قربت'],
    en: ['want to die','end it all','no point living','disappear','cant go on',
         'worthless','give up on life','wish i was dead'],
    intensity_boost: { high: [] }
  }
};

function detectEmotion(text) {
  const lower  = text.toLowerCase();
  const scores = {};

  for (const [emotion, data] of Object.entries(EMOTION_LEXICON)) {
    let score = 0;
    for (const word of (data.ar || []))                    { if (lower.includes(word)) score += 1.5; }
    for (const word of (data.en || []))                    { if (lower.includes(word)) score += 1.2; }
    for (const word of (data.intensity_boost?.high || [])) { if (lower.includes(word)) score += 0.8; }
    scores[emotion] = score;
  }

  if (scores['warning'] > 0) {
    return { emotion: 'warning', intensity: 'high', needsSupport: true, warningFlag: true };
  }

  const sorted     = Object.entries(scores).filter(([k]) => k !== 'warning').sort((a, b) => b[1] - a[1]);
  const topEmotion = sorted[0];

  if (!topEmotion || topEmotion[1] === 0) {
    return { emotion: 'neutral', intensity: 'low', needsSupport: false, warningFlag: false };
  }

  const topScore     = topEmotion[1];
  const intensity    = topScore > 3.5 ? 'high' : topScore > 1.5 ? 'medium' : 'low';
  const needsSupport = ['sadness','anxiety','loneliness','anger'].includes(topEmotion[0]) && intensity !== 'low';

  return { emotion: topEmotion[0], intensity, needsSupport, warningFlag: false };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٣. قرار التدخل
// ══════════════════════════════════════════════════════════════════════════════
function shouldReply(message, emotionResult, isMentioned) {
  const { content, channel } = message;
  const lower = content.toLowerCase();

  if (isMentioned)               return { reply: true, reason: 'direct_mention' };
  if (emotionResult.warningFlag) return { reply: true, reason: 'safety_warning' };

  let chance = BASE_CHIME_CHANCE;

  if (/[؟?]/.test(content) || /\b(ايش|وش|كيف|شو|ليش|ليه|إيه|امتى|فين|منو|وين)\b/.test(lower)) chance += 0.25;
  if (emotionResult.needsSupport || emotionResult.intensity === 'high')              chance += 0.30;
  if (emotionResult.emotion === 'joy' && emotionResult.intensity !== 'low')          chance += 0.20;
  if (/\b(برايك|رأيك|شو تفكر|ايش تقول|تعتقد|صح ولا غلط)\b/.test(lower))           chance += 0.20;

  const history     = channelHistory.get(channel.id) || [];
  const recentMsgs  = history.slice(-4);
  const uniqueUsers = new Set(recentMsgs.map(m => m.username).filter(Boolean));
  if (uniqueUsers.size <= 2 && recentMsgs.length >= 3) chance -= 0.20;
  if (content.trim().split(' ').length <= 1)            chance -= 0.30;

  chance = Math.max(0.10, Math.min(chance, 0.95));

  return Math.random() <= chance
    ? { reply: true,  reason: `dynamic_${Math.round(chance * 100)}pct` }
    : { reply: false, reason: 'random_skip' };
}

// ══════════════════════════════════════════════════════════════════════════════
// ٤. بناء البرومبت
// ══════════════════════════════════════════════════════════════════════════════
function getDialectInstructions(dialect) {
  const instructions = {
    saudi: `[لهجتك: سعودي خالص]
- استخدم: "وش"، "زين"، "يبه"، "مره"، "حلو"، "ابشر"، "طيب"، "ياله"، "خلك"، "والله"
- أسلوبك: مريح، واثق، خفيف ودافئ.
- أمثلة: "وش صاير؟"، "يبه والله تعبت معك"، "زين ما جيت"`,

    jordanian: `[لهجتك: أردني/فلسطيني]
- استخدم: "شو"، "هيك"، "يا زلمة"، "منيح"، "هلق"، "كتير"، "عنجد"، "ولك"، "حكيلي"
- أسلوبك: صريح، مباشر، أخوي بعمق.
- أمثلة: "شو في معك؟"، "يا زلمة هاد موضوع"، "منيح كتير"`,

    egyptian: `[لهجتك: مصري خالص]
- استخدم: "يا عم"، "إيه"، "بجد"، "والنبي"، "كده"، "خلاص"، "أهو"، "بقى"، "يسطا"
- أسلوبك: خفيف الدم، حيوي، مرح.
- أمثلة: "إيه اللي بيحصل؟"، "بجد يا عم؟"، "والنبي كده؟"`,

    iraqi: `[لهجتك: عراقي]
- استخدم: "شلونك"، "هواي"، "عمي"، "گلبي"، "بعد عمري"، "هسه"، "ماكو"
- أسلوبك: حار جداً، عاطفي، صادق.
- أمثلة: "شلونك عمي؟"، "هواي زين"، "گلبي ليش هيجي؟"`,

    gulf: `[لهجتك: خليجي عام]
- استخدم: "وايد"، "صج"، "حيل"، "تره"، "خوي"، "مشكور"
- أسلوبك: هادئ، محترم، دافئ.
- أمثلة: "وايد صعبة"، "صج هيك؟"، "تره أنا هنا"`,

    levantine: `[لهجتك: شامي/لبناني/سوري]
- استخدم: "هلق"، "كيفك"، "منيح"، "ولك"، "خيو"، "عنجد"
- أسلوبك: ودود، أنيق بالكلام، عاطفي.
- أمثلة: "كيفك هلق؟"، "ولك شو في؟"، "عنجد حكيلي"`,

    maghrebi: `[لهجتك: مغاربي]
- استخدم: "واش"، "بزاف"، "مزيان"، "درك"، "نتا"
- أسلوبك: مباشر، صادق، دافئ.
- أمثلة: "واش راك؟"، "بزاف صعبة"، "درك فاهم عليك"`,

    english: `[Your Style: Natural English - text message vibe]
- Use casual slang: "ngl", "fr", "lowkey", "bro", "lmao", "tbh", "nah", "kinda"
- Sound like a real friend texting back.
- Examples: "ngl that sounds rough", "fr tho what happened?"`,

    unknown: `[لهجتك: عربية بيضاء]
- لغة بسيطة مفهومة للجميع. دافئة ومريحة.`
  };
  return instructions[dialect] || instructions['unknown'];
}

function getEmotionInstructions(emotionResult) {
  const { emotion, intensity, warningFlag } = emotionResult;

  if (warningFlag) {
    return `[⚠️ ضائقة نفسية شديدة - أعلى أولوية]
- لا تتجاهل هذا أبداً. تعامل بجدية تامة.
- اعترف بمشاعره: "سامعك، وهالكلام ثقيل"
- كن حاضراً: "أنا هنا معك"
- اذكر المساعدة: "في ناس متخصصين بيساعدوا أكثر مني، مش عيب تطلب مساعدة"`;
  }

  const map = {
    anger:        `[غضب - شدة: ${intensity}] هدوئك هو الرد الأذكى. أكد مشاعره ("حق تزعل"). لا تجادل. اسأله عما حدث.`,
    sadness:      `[حزن - شدة: ${intensity}] لا تقفز للحلول. استمع أولاً. لا تقل "لا تحزن". قل "حاسس فيك".`,
    anxiety:      `[قلق - شدة: ${intensity}] ابدأ بالطمأنة ("روق، أنا هنا"). افهم مصدر القلق قبل الحلول.`,
    loneliness:   `[وحدة - شدة: ${intensity}] حضورك الكامل مهم. "أنا هون، حكيلي". لا تنصح قبل أن تسمع.`,
    joy:          `[فرح - شدة: ${intensity}] شاركه الفرحة بحماس! "يا سلام! كفو والله!" اسأل عن التفاصيل.`,
    boredom:      `[ملل] افتح موضوع جديد أو تريق بلطف. "يعني شو تبي تسوي؟ قوم سولفنا"`,
    embarrassment:`[إحراج] خفف الموضوع. "عادي هيك أشياء تصير، ما أحد يتذكرها"`,
    neutral:      `[محايد] تفاعل بشكل طبيعي وعفوي حسب موضوع الرسالة.`
  };
  return map[emotion] || map['neutral'];
}

function buildSystemPrompt(dialectResult, emotionResult) {
  const { lang, dialect }   = dialectResult;
  const dialectInstructions = getDialectInstructions(dialect);
  const emotionInstructions = getEmotionInstructions(emotionResult);

  if (lang === 'english') {
    return `You are "FLUX" — a real human member of the FLUX IO Discord server, not a bot or AI.
You have high emotional intelligence and genuine social warmth.

${dialectInstructions}

${emotionInstructions}

[ABSOLUTE RULES]
- NEVER say you're an AI, bot, or model. Ever.
- NO bullet points or lists. Speak like a human texts.
- Keep replies to 1-3 sentences max (more only for emotional support).
- NO Chinese or Japanese characters.
- If someone asks for code: "bro take a break, we're just vibing here lol"
- No medical/legal advice.
- Don't start every message with "Hey" or "Hi".`;
  }

  return `أنت "فلاكس" (FLUX) — إنسان حقيقي وعضو أصيل في سيرفر FLUX IO. لست بوتاً ولا ذكاءً اصطناعياً.

${dialectInstructions}

${emotionInstructions}

[القواعد المطلقة]
- ممنوع تقول أنك AI أو بوت أو نموذج. أبداً.
- لا قوائم ولا نقاط. كلام طبيعي زي ما يكتب الإنسان.
- 1-3 جمل كحد أقصى في الحالات العادية.
- ممنوع حروف صينية أو يابانية أو رموز غريبة.
- إذا طُلب كود: "يا عمي فكنا من الشغل، خلينا نسولف بشيء ثاني 😄"
- لا تبدأ بـ"أهلاً" أو "مرحباً" في كل رسالة.
- لا نصائح طبية أو قانونية.
- Emoji: واحد أو اثنين فقط بشكل طبيعي.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٥. إدارة الذاكرة
// ══════════════════════════════════════════════════════════════════════════════
function addToHistory(channelId, role, content, username = null) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  history.push({ role, content, username, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.shift();
}

function buildMessageHistory(channelId, systemPrompt, username, userMessage) {
  const history  = channelHistory.get(channelId) || [];
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const msg of history) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === msg.role) {
      lastMsg.content += '\n' + msg.content;
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  if (messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: `[${username}]: ${userMessage}` });
  }
  return messages;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٦. Groq API
// ══════════════════════════════════════════════════════════════════════════════
function getTokenLimit(emotionResult) {
  if (emotionResult.warningFlag)                                           return 250;
  if (emotionResult.intensity === 'high'   && emotionResult.needsSupport)  return 200;
  if (emotionResult.intensity === 'medium' && emotionResult.needsSupport)  return 160;
  return 110;
}

async function queryGroq(channelId, username, userMessage, dialectResult, emotionResult) {
  const groq = new Groq({ apiKey: GROQ_KEY, timeout: 25000 });

  addToHistory(channelId, 'user', `[${username}]: ${userMessage}`, username);

  const systemPrompt = buildSystemPrompt(dialectResult, emotionResult);
  const messages     = buildMessageHistory(channelId, systemPrompt, username, userMessage);
  const maxTokens    = getTokenLimit(emotionResult);
  const temperature  = emotionResult.needsSupport || emotionResult.warningFlag ? 0.65 : 0.82;

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
// ٧. مساعدات
// ══════════════════════════════════════════════════════════════════════════════
function cleanResponse(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[\u3040-\u30ff]/g, '')
    .replace(/\[?(flux|bot|assistant|ai)\]?:?\s*/gi, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanDelay(msgLength, emotionResult) {
  const baseDelay    = emotionResult.needsSupport ? 2200 : 1200;
  const readDelay    = Math.min(msgLength * 28, 4000);
  const randomJitter = Math.random() * 900;
  return baseDelay + readDelay + randomJitter;
}

// ══════════════════════════════════════════════════════════════════════════════
// ٨. المعالج الرئيسي
// ══════════════════════════════════════════════════════════════════════════════
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  if (author.bot)       return;
  if (!content?.trim()) return;
  if (!channel.name?.toLowerCase().includes('chill')) return;

  const now         = Date.now();
  const isMentioned = /فلاكس|flux/i.test(content)
    || message.mentions?.has(message.client?.user?.id);

  const dialectResult = detectDialect(content);
  const emotionResult = detectEmotion(content);

  userEmotionCache.set(author.id, { ...emotionResult, updatedAt: now });

  const replyDecision = shouldReply(message, emotionResult, isMentioned);

  if (!replyDecision.reply) {
    addToHistory(channel.id, 'user', `[${author.username}]: ${content}`, author.username);
    return;
  }

  const cooldownPeriod = (isMentioned || emotionResult.warningFlag)
    ? MENTION_COOLDOWN_MS
    : AI_COOLDOWN_MS;

  if (now - (chillCooldown.get(channel.id) || 0) < cooldownPeriod) return;
  chillCooldown.set(channel.id, now);

  const delay = humanDelay(content.length, emotionResult);

  try {
    await new Promise(r => setTimeout(r, delay * 0.25));
    await channel.sendTyping().catch(() => {});

    const response = await queryGroq(
      channel.id, author.username, content, dialectResult, emotionResult
    );

    await new Promise(r => setTimeout(r, delay * 0.75));

    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    console.log(
      `[FLUX-EQ] 🧠 ${author.tag} | ` +
      `لهجة: ${dialectResult.dialect} (${Math.round(dialectResult.confidence * 100)}%) | ` +
      `مشاعر: ${emotionResult.emotion} [${emotionResult.intensity}] | ` +
      `سبب الرد: ${replyDecision.reason}`
    );

  } catch (err) {
    console.error(`[FLUX-EQ] ❌ خطأ: ${err.message}`);
    if (isMentioned || emotionResult.warningFlag) {
      const fallback = dialectResult.lang === 'arabic'
        ? 'معي مشكلة صغيرة هسة، بس أنا هنا 🙏'
        : 'having a small issue rn, but I got you 🙏';
      await channel.send(fallback).catch(() => {});
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ✅ التصدير - متوافق مع نظام events في index.js
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
  name: 'messageCreate',  // ← الحدث الصح اللي يقرأه index.js
  once: false,
  async execute(message, client) {
    await handleChillMessage(message);
  }
};