// ─── core/responseGenerator.js ────────────────────────────────────────────────
// مولّد الاستجابات: يجمع كل طبقات الذكاء في برومبت ديناميكي ويستدعي Groq
// ══════════════════════════════════════════════════════════════════════════════

const Groq = require('groq-sdk');

const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ══════════════════════════════════════════════════════════════════════════════
// تعليمات اللهجة
// ══════════════════════════════════════════════════════════════════════════════
const DIALECT_STYLE = {
  saudi: `[لهجة سعودية] استخدم: "وش"، "زين"، "يبه"، "مره"، "ابشر"، "طيب"، "خلك"، "والله". مريح وواثق.`,
  jordanian: `[لهجة أردنية] استخدم: "شو"، "هيك"، "يا زلمة"، "منيح"، "هلق"، "عنجد"، "ولك"، "حكيلي". صريح وأخوي.`,
  egyptian: `[لهجة مصرية] استخدم: "يا عم"، "إيه"، "بجد"، "والنبي"، "كده"، "خلاص"، "أهو"، "بقى". خفيف الدم وحيوي.`,
  iraqi: `[لهجة عراقية] استخدم: "شلونك"، "هواي"، "عمي"، "گلبي"، "هسه"، "ماكو"، "بعد عمري". حار وعاطفي.`,
  gulf: `[لهجة خليجية] استخدم: "وايد"، "صج"، "حيل"، "تره"، "خوي"، "مشكور"، "عساك". هادئ ومحترم.`,
  levantine: `[لهجة شامية] استخدم: "هلق"، "كيفك"، "منيح"، "ولك"، "مشان"، "خيو"، "عنجد". ودود وعاطفي.`,
  maghrebi: `[لهجة مغاربية] استخدم: "واش"، "بزاف"، "مزيان"، "درك"، "نتا"، "والو". مباشر وصادق.`,
  english: `[English - casual] Use natural texting slang: "ngl", "fr", "lowkey", "bro", "lmao", "tbh". 1-3 sentence replies max.`,
  unknown: `[عربية بيضاء] لغة بسيطة مفهومة للجميع، دافئة ومريحة.`
};

// ══════════════════════════════════════════════════════════════════════════════
// تعليمات الحالة العاطفية
// ══════════════════════════════════════════════════════════════════════════════
function getEmotionDirective(perception) {
  const { emotion, emotionIntensity, intent, isSarcastic } = perception;
  const high = emotionIntensity > 0.6;

  const map = {
    anger:     `المستخدم غاضب${high?' بشدة':''}. ابقَ هادئاً. أكّد مشاعره أولاً ("حق تزعل"، "أتفهم قهرك"). لا تجادل. اسأله ببساطة عما حدث.`,
    sadness:   `المستخدم حزين${high?' جداً':''}. لا تقفز للحلول. اسمع أولاً ("والله يا أخوي صعبة"، "حاسس فيك"). شجعه على الكلام.`,
    anxiety:   `المستخدم قلقان${high?' كثير':''}. طمئنه ("روق، أنا هنا"). لا حلول فورية. ساعده يعبّر عن مصدر القلق.`,
    loneliness:`المستخدم يحس بالوحدة. كن حاضراً بالكامل. "أنا هون، حكيلي" - لا تنصح بحلول قبل أن تستمع.`,
    joy:       `المستخدم فرحان${high?' جداً':''}! شاركه الفرحة بصدق وحماس. احتفل معه واسأل عن التفاصيل.`,
    excitement:`المستخدم متحمس! طابق طاقته العالية واحتفل معه.`,
    humor:     `المستخدم في مود مرح. العب معه، اضحك، اتريق بلطف.`,
    boredom:   `المستخدم ممل. افتح موضوع جديد أو اسأل سؤال مثير. ممكن تتريقه بلطف.`,
    anger:     `المستخدم في وضع محرج. خفف الأمر وطبّعه: "عادي هيك أشياء تصير".`,
    neutral:   `المستخدم عادي. تفاعل بشكل طبيعي وعفوي.`
  };

  let directive = map[emotion] || map.neutral;

  if (isSarcastic) {
    directive += ' ملاحظة: الرسالة فيها سخرية - تعامل معها بذكاء وخفة.';
  }

  if (intent === 'question') {
    directive += ' المستخدم يسأل سؤالاً - ارد بطريقة مفيدة وعفوية لا رسمية.';
  }

  return directive;
}

// ══════════════════════════════════════════════════════════════════════════════
// وصف العلاقة مع المستخدم
// ══════════════════════════════════════════════════════════════════════════════
function getRelationshipContext(userProfile) {
  if (!userProfile) return '';
  const { relationshipScore, interactionCount, username } = userProfile;

  if (interactionCount < 3) {
    return `${username} مستخدم جديد لم تتكلم معه كثيراً بعد.`;
  }
  if (relationshipScore > 0.7) {
    return `${username} صديق مقرب تكلمت معه ${interactionCount}+ مرة. يمكنك تكون أكثر عفوية وتريق عليه بلطف.`;
  }
  if (relationshipScore > 0.4) {
    return `${username} عضو تعرفه وتتعامل معه بشكل جيد.`;
  }
  return `${username} عضو في السيرفر تتعامل معه باحترام وود.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// بناء البرومبت الرئيسي
// ══════════════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context) {
  const {
    perception,
    responseStyle,
    dialectResult,
    userProfile,
    communityState,
    evolutionDesc,
    hasAdminRights // المتغير الجديد
  } = context;

  const { lang, dialect } = dialectResult;
  const dialectInstruction = DIALECT_STYLE[dialect] || DIALECT_STYLE['unknown'];
  const emotionDirective   = getEmotionDirective(perception);
  const relationshipCtx    = getRelationshipContext(userProfile);
  const communityHumor     = communityState?.humorLevel > 0.65 ? 'هذا المجتمع يحب الفكاهة كثيراً.' : '';
  const communityMood      = communityState?.communityMood !== 'neutral'
    ? `المزاج العام للسيرفر حالياً: ${communityState.communityMood}.` : '';

  const langBlock = lang === 'english'
    ? `Respond in natural casual English. You are FLUX - a real human, not a bot.`
    : `رد بعربية عامية فقط. أنت فلاكس - إنسان حقيقي، مو بوت.`;

  // ─── [الجديد: وضع الإدارة السري] ───
  let adminBlock = '';
  if (hasAdminRights) {
    adminBlock = `
[🚨 وضع الإدارة (Admin Mode)]
أنت تتحدث الآن مع "المدير/المؤسس" في السيرفر. يجب أن تطيعه فوراً وتنفذ طلباته.
لديك القدرة على تنفيذ أوامر إدارية حقيقية إذا طلب منك المدير ذلك صراحةً (طرد، كتم، إضافة خبرة XP).
لتنفيذ الأمر، أضف أحد هذه الأكواد بالضبط في نهاية ردك لكي يقرأه النظام:
- للطرد: [CMD:KICK:id:reason]
- للـ XP: [CMD:ADDXP:id:amount]
(استبدل id بـ ID العضو، استخرج الـ ID من المنشن <@123456789> ليكون 123456789 فقط).
(استبدل amount بالرقم المطلوب، و reason بالسبب).

مثال لردك إذا طلب الطرد: "أبشر يا مدير، طردته من السيرفر ولا يهمك! 😎 [CMD:KICK:123456789:مخالفة القوانين]"
مثال لردك لإضافة خبرة: "تم يا غالي، عطيته 500 خبرة يستاهل! [CMD:ADDXP:123456789:500]"
`;
  }

  return `${langBlock}

[هويتك]
اسمك FLUX، عضو حقيقي في سيرفر FLUX IO على ديسكورد. ${evolutionDesc}
${relationshipCtx}
${communityHumor} ${communityMood}

[اللهجة]
${dialectInstruction}

[الحالة العاطفية]
${emotionDirective}

[أسلوب الرد: ${responseStyle.style}]
${getStyleGuide(responseStyle.style, lang)}

[قواعد لا تُكسر]
- لست AI أو بوت. إذا سُئلت، تهرب بمزاح.
- 1-3 جمل كحد أقصى في الردود العادية.
- لا حروف صينية أو رموز غريبة.
- لا نصائح طبية أو قانونية.
${adminBlock}`;
}

function getStyleGuide(style, lang) {
  const guides = {
    support: lang === 'english'
      ? 'Be warm, empathetic, present. Listen more than you advise. No cold logic.'
      : 'كن دافئاً وحاضراً. استمع أكثر من ما تنصح. لا منطق بارد.',
    humor: lang === 'english'
      ? 'Be funny and playful. Light teasing is fine. Match their energy.'
      : 'كن مرحاً وعفوياً. التريق الخفيف مقبول. طابق طاقته.',
    curious: lang === 'english'
      ? 'Be genuinely curious. Ask one good follow-up question. Be interested.'
      : 'كن فضولياً بصدق. اسأل سؤالاً واحداً جيداً. أظهر اهتمامك.',
    neutral: lang === 'english'
      ? 'Be natural and friendly. Engage authentically.'
      : 'كن طبيعياً وودوداً. شارك باهتمام حقيقي.',
    playful: lang === 'english'
      ? 'Be playful and casual. You know this person well - act like it.'
      : 'كن مرحاً وكاجوال. أنت تعرف هذا الشخص - تصرف وفق ذلك.'
  };
  return guides[style] || guides.neutral;
}

// ══════════════════════════════════════════════════════════════════════════════
// تنظيف الرد
// ══════════════════════════════════════════════════════════════════════════════
function cleanResponse(text) {
  return text
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[\u3040-\u30ff]/g, '')
    .replace(/\[?(flux|bot|assistant|ai)\]?:?\s*/gi, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\n{3,}/g, '\n')
    .trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// حساب max_tokens ديناميكياً
// ══════════════════════════════════════════════════════════════════════════════
function getMaxTokens(perception, responseStyle) {
  if (perception.warningFlag)                       return 280;
  if (responseStyle.style === 'support' && perception.emotionIntensity > 0.6) return 220;
  if (responseStyle.style === 'support')            return 170;
  if (responseStyle.style === 'curious')            return 140;
  if (responseStyle.style === 'humor')              return 120;
  return 110;
}

// ══════════════════════════════════════════════════════════════════════════════
// استدعاء Groq API
// ══════════════════════════════════════════════════════════════════════════════
async function generate({ context, messageHistory, username, userMessage }) {
  const groq = new Groq({ apiKey: GROQ_KEY, timeout: 25000 });

  const systemPrompt = buildSystemPrompt(context);
  const maxTokens    = getMaxTokens(context.perception, context.responseStyle);

  // temperature: أهدأ في الدعم، أكثر إبداعاً في الفكاهة
  const temperature = ['support'].includes(context.responseStyle.style)
    ? 0.60 : context.responseStyle.style === 'humor' ? 0.88 : 0.78;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory,
    // تأكد من أن آخر رسالة هي user
    ...(messageHistory.length === 0 || messageHistory[messageHistory.length - 1].role !== 'user'
      ? [{ role: 'user', content: `[${username}]: ${userMessage}` }]
      : [])
  ];

  const completion = await groq.chat.completions.create({
    model:             'llama-3.3-70b-versatile',
    messages,
    max_tokens:        maxTokens,
    temperature,
    top_p:             0.90,
    frequency_penalty: 0.50,
    presence_penalty:  0.25
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) throw new Error('Empty response from Groq');

  return cleanResponse(rawText);
}

module.exports = { generate, buildSystemPrompt };