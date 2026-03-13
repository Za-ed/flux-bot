// ─── events/chillChat.js ──────────────────────────────────────────────────────
// الإصدار: 4.1 (النسخة المعرفية الذكية + وضع الإدارة المخفي)
// المحرك: Groq API | النموذج: llama-3.3-70b-versatile
// ══════════════════════════════════════════════════════════════════════════════

// ── إبقاء المفتاح كما طلبت دون أي تغيير ──
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ── استيراد الطبقات الذكية ──
const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { analyzeChannelDynamics, computeParticipationProbability } = require('../layers/socialContext');
const { shortTerm, mediumTerm, longTerm } = require('../memory/memorySystem');
const learningEngine = require('../memory/learningEngine');
const { generate } = require('../core/responseGenerator');

// ── استيرادات نظام الإدارة (الجديدة) ──
const { isAdmin, isFounder } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');
const { addManualXP } = require('../utils/xpSystem');

// ── ثوابت ──
const CHILL_CHANNEL_KEYWORD = 'chill';
const MENTION_COOLDOWN_MS   = 1000;
const chillCooldown         = new Map();

// ══════════════════════════════════════════════════════════════════════════════
// المعالج الرئيسي للرسائل في قنوات السوالف + نظام الإدارة
// ══════════════════════════════════════════════════════════════════════════════
async function handleChillMessage(message) {
  const { author, channel, content, member } = message;

  // تجاهل البوتات والرسائل الفارغة
  if (author.bot) return;
  if (!content?.trim()) return;

  const isChillChannel = channel.name?.toLowerCase().includes(CHILL_CHANNEL_KEYWORD);
  const hasAdminRights = member ? (isAdmin(member) || isFounder(member)) : false;
  const isMentioned    = /فلاكس|flux/i.test(content) || message.mentions?.has(message.client?.user?.id);

  // ── [نظام التواجد الذكي] ──
  // إذا لم تكن القناة chill، نتجاهل الرسالة تماماً، إلا إذا كان إداري ونادى البوت
  if (!isChillChannel) {
    if (!hasAdminRights || !isMentioned) return;
  }

  const now = Date.now();

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
  
  // قرار الرد: في الإدارة خارج chill نرد دائماً، في chill نستخدم الاحتمالية العادية
  let shouldReply = false;
  if (isChillChannel) {
      shouldReply = isMentioned || perception.warningFlag || (Math.random() <= prob);
  } else {
      shouldReply = true; // لأنه اجتاز شرط الأدمن والمنشن في الأعلى
  }

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
      evolutionDesc,
      hasAdminRights // إخبار العقل بأن المتحدث مدير لتفعيل وضع الأوامر
    };

    const messageHistory = shortTerm.buildAPIHistory(channel.id, 12); // جلب آخر 12 رسالة للسياق

    // استدعاء Groq API عبر responseGenerator
    let response = await generate({ 
      context, 
      messageHistory, 
      username: author.username, 
      userMessage: content 
    });

    // ── [قراءة الأوامر الإدارية المخفية وتنفيذها] ──
    if (hasAdminRights) {
        // نبحث عن الأكواد مثل [CMD:KICK:123456789:سبب]
        const cmdRegex = /\[CMD:([A-Z]+):([^:]+):?([^\]]*)\]/g;
        let match;
        while ((match = cmdRegex.exec(response)) !== null) {
            const action = match[1];
            const targetId = match[2].replace(/[<@!>]/g, ''); // تنظيف المنشن لاستخراج الـ ID النقي
            const param = match[3];

            try {
                const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
                
                if (action === 'KICK' && targetMember) {
                    await targetMember.kick(param || 'بأمر من الإدارة عبر FLUX الذكي');
                    if (logAction) await logAction(message.guild, { type: 'kick', moderator: author, target: targetMember, reason: param || 'بأمر من الإدارة عبر FLUX الذكي' });
                
                } else if (action === 'ADDXP' && targetId) {
                    const amount = parseInt(param) || 0;
                    if (addManualXP) await addManualXP(message.guild.id, targetId, amount);
                }
            } catch (e) {
                console.error('[ADMIN CMD ERROR]', e.message);
            }
        }
        // إزالة الكود السري من الرسالة لكي لا يراه الأعضاء
        response = response.replace(cmdRegex, '').trim();
    }

    if (!response) response = "أبشر، تم التنفيذ!"; // حماية في حال كان الرد كله كود مخفي

    // ── 5. إرسال الرد وتحديث محرك التعلم ──
    let sentMessage;
    // إذا كانت رسالة أدمن خارج الـ chill، الرد يكون reply مباشر
    if (isMentioned || perception.warningFlag || !isChillChannel) {
      sentMessage = await message.reply(response);
    } else {
      sentMessage = await channel.send(response);
    }

    // حفظ رد البوت في الذاكرة
    shortTerm.add(channel.id, { role: 'assistant', content: response });
    mediumTerm.recordFluxResponse(channel.id, true);

    // نتعلم فقط من التفاعل في قنوات السوالف، لتجنب تشويه شخصيته بسبب الأوامر الإدارية
    if (sentMessage && isChillChannel) {
        learningEngine.trackResponse(sentMessage.id, {
            channelId: channel.id, userId: author.id, emotion: perception.emotion,
            dialect: perception.dialect, intent: perception.intent,
            style: responseStyle.style, topic: perception.topic
        });
    }

    console.log(
      `[FLUX-AI] 🧠 ${author.tag} | ` +
      `لهجة: ${perception.dialect} | أسلوب الرد: ${responseStyle.style} ` +
      `${hasAdminRights && !isChillChannel ? '(رد إداري خاص)' : ''}`
    );

  } catch (err) {
    console.error(`[FLUX-AI] ❌ خطأ أثناء توليد الرد: ${err.message}`);
    if (isMentioned || perception.warningFlag || !isChillChannel) {
      const fallbackMsg = perception.lang === 'arabic' 
        ? 'معي مشكلة صغيرة بالاتصال هسة، بس أنا هنا وأسمعك 🙏' 
        : 'Having a slight connection issue rn, but I got you 🙏';
      await message.reply(fallbackMsg).catch(() => {});
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