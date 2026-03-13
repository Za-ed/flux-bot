// ─── events/chillChat.js ──────────────────────────────────────────────────────
// الإصدار: 4.0 (النسخة المعرفية الذكية - Modular Layers)
// المحرك: Groq API | النموذج: llama-3.3-70b-versatile
// ══════════════════════════════════════════════════════════════════════════════

// ── إبقاء المفتاح كما طلبت دون أي تغيير ──
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ── استيراد الطبقات الذكية ──
// (تأكد من أن المجلدات layers, memory, core موجودة في نفس المسار الموضح)
const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { analyzeChannelDynamics, computeParticipationProbability } = require('../layers/socialContext');
const { shortTerm, mediumTerm, longTerm } = require('../memory/memorySystem');
const learningEngine = require('../memory/learningEngine');
const { generate } = require('../core/responseGenerator');

// ── ثوابت ──
const CHILL_CHANNEL_KEYWORD = 'chill';
const MENTION_COOLDOWN_MS   = 1000;
const chillCooldown         = new Map();

// ══════════════════════════════════════════════════════════════════════════════
// المعالج الرئيسي للرسائل في قنوات السوالف
// ══════════════════════════════════════════════════════════════════════════════
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  // تجاهل البوتات والرسائل الفارغة والقنوات غير المخصصة
  if (author.bot) return;
  if (!content?.trim()) return;
  if (!channel.name?.toLowerCase().includes(CHILL_CHANNEL_KEYWORD)) return;

  const now = Date.now();
  const isMentioned = /فلاكس|flux/i.test(content) || message.mentions?.has(message.client?.user?.id);

  // ── 1. طبقة الإدراك (Perception) ──
  const perception = analyze(content);

  // ── 2. تحديث الذاكرة (Memory) ──
  shortTerm.add(channel.id, {
    role: 'user', content, username: author.username, userId: author.id,
    emotion: perception.emotion, dialect: perception.dialect, intent: perception.intent
  });

  mediumTerm.recordMessage(channel.id, {
    userId: author.id, username: author.username, emotion: perception.emotion,
    topic: perception.topic, isHumorous: perception.isHumorous
  });

  const userProfile = longTerm.updateProfile(author.id, author.username, {
    emotion: perception.emotion, topic: perception.topic,
    dialect: perception.dialect, dialectConf: perception.dialectConf,
    isHumorous: perception.isHumorous
  });

  longTerm.updateCommunity({
    dialect: perception.dialect,
    topic: perception.topic,
    mood: perception.sentiment
  });

  // ── 3. السياق الاجتماعي وقرار التدخل (Social Context) ──
  const recentMsgs   = shortTerm.getHistory(channel.id);
  const channelState = mediumTerm.getChannelState(channel.id);
  const dynamics     = analyzeChannelDynamics(recentMsgs, channelState);

  const learnedProb = learningEngine.getRecommendedReplyProb(perception.emotion, perception.dialect);
  const prob        = computeParticipationProbability(perception, dynamics, userProfile, learnedProb);
  
  // قرار الرد: إما منشن مباشر، أو إشارة خطر، أو بناءً على الاحتمالية المحسوبة
  const shouldReply = isMentioned || perception.warningFlag || (Math.random() <= prob);

  if (!shouldReply) return;

  // نظام تبريد بسيط لمنع السبام إذا تم عمل منشن متكرر
  if (now - (chillCooldown.get(channel.id) || 0) < MENTION_COOLDOWN_MS) return;
  chillCooldown.set(channel.id, now);

  // ── 4. تحضير الشخصية وتوليد الرد (Personality & Generation) ──
  try {
    // إظهار حالة الكتابة لمحاكاة البشر
    await channel.sendTyping().catch(() => {});

    const personalityBias = learningEngine.getPersonalityBias();
    const communityState  = longTerm.getCommunityState();
    const responseStyle   = selectResponseStyle(perception, communityState, personalityBias, userProfile);
    const evolutionDesc   = getEvolutionDescription(communityState.evolutionStage);

    // تجهيز السياق لمولد الردود
    const context = {
      perception, 
      responseStyle, 
      dialectResult: { lang: perception.lang, dialect: perception.dialect },
      userProfile, 
      communityState, 
      evolutionDesc
    };

    const messageHistory = shortTerm.buildAPIHistory(channel.id, 12); // جلب آخر 12 رسالة للسياق

    // استدعاء Groq API عبر responseGenerator
    const response = await generate({ 
      context, 
      messageHistory, 
      username: author.username, 
      userMessage: content 
    });

    // ── 5. إرسال الرد وتحديث محرك التعلم ──
    let sentMessage;
    if (isMentioned || perception.warningFlag) {
      sentMessage = await message.reply(response);
    } else {
      sentMessage = await channel.send(response);
    }

    // حفظ رد البوت في الذاكرة
    shortTerm.add(channel.id, { role: 'assistant', content: response });
    mediumTerm.recordFluxResponse(channel.id, true);

    // تتبع الرد للتعلم التعزيزي (هل سيتفاعل معه المستخدمون؟)
    if (sentMessage) {
        learningEngine.trackResponse(sentMessage.id, {
            channelId: channel.id, userId: author.id, emotion: perception.emotion,
            dialect: perception.dialect, intent: perception.intent,
            style: responseStyle.style, topic: perception.topic
        });
    }

    console.log(
      `[FLUX-AI] 🧠 ${author.tag} | ` +
      `لهجة: ${perception.dialect} | مشاعر: ${perception.emotion} | ` +
      `أسلوب الرد: ${responseStyle.style}`
    );

  } catch (err) {
    console.error(`[FLUX-AI] ❌ خطأ أثناء توليد الرد: ${err.message}`);
    // رد طوارئ في حال فشل الـ API وكان المستخدم بحاجة ماسة للرد
    if (isMentioned || perception.warningFlag) {
      const fallbackMsg = perception.lang === 'arabic' 
        ? 'معي مشكلة صغيرة بالاتصال هسة، بس أنا هنا وأسمعك 🙏' 
        : 'Having a slight connection issue rn, but I got you 🙏';
      await channel.send(fallbackMsg).catch(() => {});
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// التصدير
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    await handleChillMessage(message);
  }
};