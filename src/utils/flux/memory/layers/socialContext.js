// ─── layers/safetyLayer.js ─────────────────────────────────────────────────────
// طبقة الأمان: كشف الإشارات النفسية الحرجة والتعامل معها
// ══════════════════════════════════════════════════════════════════════════════

const CRISIS_RESPONSES = {
  arabic: [
    'سامعك، وهالكلام ثقيل على القلب. أنا هنا معك الحين.',
    'ما أبيك تشيل هاللحظة لحالك. هل في أحد قريب منك تقدر تكلمه؟',
    'أحس إنك تعبان كثير. في ناس متخصصين بيساعدون أكثر مني، مش عيب تطلب مساعدة.'
  ],
  english: [
    "I hear you, and what you're feeling matters. You don't have to carry this alone.",
    "Please talk to someone you trust right now. You deserve real support.",
    "There are people trained to help with exactly this. It's not weakness to reach out."
  ]
};

function buildCrisisResponse(lang) {
  const pool = lang === 'arabic' ? CRISIS_RESPONSES.arabic : CRISIS_RESPONSES.english;
  return pool.join('\n');
}

module.exports = { buildCrisisResponse };


// ─── layers/socialContext.js ───────────────────────────────────────────────────
// محرك السياق الاجتماعي: يحلل ديناميكية القناة ويقرر مشاركة FLUX
// ══════════════════════════════════════════════════════════════════════════════

// ** مُصدَّر كجزء من نفس الملف لتبسيط الاستيراد **

/**
 * analyzeChannelDynamics() - يحلل نشاط القناة
 * @param {Array}  recentMessages  - آخر الرسائل من ShortTermMemory
 * @param {object} channelState    - حالة القناة من MediumTermMemory
 * @returns {object} - { isActive, participantCount, dominantTone, conversationType }
 */
function analyzeChannelDynamics(recentMessages, channelState) {
  const now             = Date.now();
  const last5min        = recentMessages.filter(m => now - m.timestamp < 5 * 60 * 1000);
  const uniqueUsers     = new Set(last5min.map(m => m.userId)).size;
  const isActive        = last5min.length >= 3;
  const isPrivate       = uniqueUsers <= 2 && last5min.length >= 3;
  const msgRate         = last5min.length / 5; // رسائل/دقيقة

  // تحديد نبرة المحادثة من آخر المشاعر
  const recentEmotions  = (channelState?.emotionHistory || []).slice(-8).map(e => e.emotion);
  const positiveCount   = recentEmotions.filter(e => ['joy','humor','excitement'].includes(e)).length;
  const negativeCount   = recentEmotions.filter(e => ['anger','sadness','anxiety'].includes(e)).length;
  const dominantTone    = positiveCount > negativeCount ? 'positive'
    : negativeCount > positiveCount ? 'supportive' : 'neutral';

  // نوع المحادثة
  const conversationType = isPrivate ? 'private'
    : uniqueUsers >= 4 ? 'group' : 'small_group';

  return {
    isActive,
    isPrivate,
    participantCount: uniqueUsers,
    msgRate,
    dominantTone,
    conversationType,
    fluxSuccessRate: channelState?.fluxEngagement
      ? channelState.fluxEngagement.slice(-10).filter(r => r.wasEngaged).length / 10
      : 0.5
  };
}

/**
 * computeParticipationProbability() - يحسب احتمالية تدخل FLUX
 * @param {object} perception    - نتيجة perceptionLayer.analyze()
 * @param {object} dynamics      - نتيجة analyzeChannelDynamics()
 * @param {object} userProfile   - ملف المستخدم من LongTermMemory
 * @param {number} learnedProb   - الاحتمالية من LearningEngine
 * @returns {number} - (0-1)
 */
function computeParticipationProbability(perception, dynamics, userProfile, learnedProb) {
  let prob = learnedProb ?? 0.50;

  // ── رفع الاحتمالية ─────────────────────────────────────────────────────
  if (perception.warningFlag)                          prob = 1.0;  // خطر: دائماً
  if (perception.needsSupport)                         prob += 0.30;
  if (perception.intent === 'question')                prob += 0.20;
  if (perception.intent === 'celebration')             prob += 0.15;
  if (perception.isHumorous && dynamics.dominantTone === 'positive') prob += 0.15;
  if (perception.intent === 'greeting')                prob += 0.10;
  if (userProfile?.relationshipScore > 0.7)            prob += 0.10; // صديق مقرب

  // ── خفض الاحتمالية ─────────────────────────────────────────────────────
  if (dynamics.isPrivate)                              prob -= 0.25;
  if (dynamics.msgRate > 3)                            prob -= 0.15; // شات سريع جداً
  if (perception.intent === 'sharing' && !perception.needsSupport) prob -= 0.10;
  if (dynamics.participantCount <= 1)                  prob -= 0.20; // يكتب لنفسه؟
  if (dynamics.fluxSuccessRate < 0.3)                  prob -= 0.10; // FLUX مو ناجح هنا

  return Math.max(0.05, Math.min(0.95, prob));
}

module.exports = { analyzeChannelDynamics, computeParticipationProbability };


// ─── (لا حاجة لملف منفصل) ─────────────────────────────────────────────────────
// ملف behaviorSimulator مدمج هنا لتقليل عدد الملفات
// ══════════════════════════════════════════════════════════════════════════════