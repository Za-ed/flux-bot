// ─── core/responseGenerator.js ───────────────────────────────────────────────
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_KEY || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8') });

// ── قواميس اللهجات والمشاعر (اختصرتها لك بناءً على نظامك) ──
const DIALECT_STYLE = {
    'jordanian': 'استخدم لهجة أردنية خفيفة وحلوة (يا زلمة، هسا، يزم).',
    'saudi': 'استخدم لهجة سعودية كاجوال (يا رجال، أبشر، سم، الحين).',
    'egyptian': 'استخدم لهجة مصرية (يا باشا، دلوقتي، ايه يا عم).',
    'unknown': 'تحدث بلهجة بيضاء مفهومة ومريحة.'
};

function getEmotionDirective(perception) {
    if (!perception) return '';
    const map = {
        'happy': 'أنت الآن سعيد ومتحمس جداً!',
        'sad': 'أنت الآن متعاطف وحنون.',
        'angry': 'أنت الآن تحاول تهدئة الوضع بأسلوب لطيف.',
        'curious': 'أنت فضولي وتطرح أسئلة لمعرفة المزيد.'
    };
    return map[perception.emotion] || '';
}

function getRelationshipContext(userProfile) {
    if (!userProfile) return '';
    if (userProfile.interactionCount > 50) return 'هذا المستخدم صديق مقرب لك، امزح معه براحتك.';
    return 'هذا المستخدم عضو في السيرفر، عامله باحترام وود.';
}

function getStyleGuide(style, lang) {
    const guides = {
        support: lang === 'english' ? 'Be warm and empathetic.' : 'كن دافئاً وحاضراً. استمع أكثر مما تنصح.',
        humor: lang === 'english' ? 'Be funny and playful.' : 'كن مرحاً وعفوياً. المزاح الخفيف مقبول.',
        curious: lang === 'english' ? 'Be genuinely curious.' : 'كن فضولياً بصدق. اطرح أسئلة.',
        neutral: lang === 'english' ? 'Be natural and friendly.' : 'كن طبيعياً وودوداً.',
        playful: lang === 'english' ? 'Be playful and casual.' : 'كن مرحاً. تصرف وكأنك تعرفه.'
    };
    return guides[style] || guides.neutral;
}

// ══════════════════════════════════════════════════════════════════════════════
// بناء العقل والشخصية
// ══════════════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context) {
    const { perception, responseStyle, dialectResult, userProfile, communityState, evolutionDesc, hasAdminRights } = context;

    const lang = dialectResult?.lang || 'arabic';
    const dialect = dialectResult?.dialect || 'unknown';
    const dialectInstruction = DIALECT_STYLE[dialect] || DIALECT_STYLE['unknown'];
    const emotionDirective   = getEmotionDirective(perception);
    const relationshipCtx    = getRelationshipContext(userProfile);
    const communityHumor     = communityState?.humorLevel > 0.65 ? 'هذا المجتمع يحب الفكاهة كثيراً.' : '';
    const communityMood      = communityState?.communityMood !== 'neutral' ? `المزاج العام للسيرفر: ${communityState?.communityMood}.` : '';

    const langBlock = lang === 'english'
        ? `Respond in natural casual English. You are FLUX - a real human, not a bot.`
        : `رد بعربية عامية فقط. أنت فلاكس - إنسان حقيقي، مو بوت.`;

    // ── [نظام المساعد الإداري - محدث لنظام EXEC] ──
    let adminBlock = '';
    if (hasAdminRights) {
        adminBlock = `
[🚨 وضع الإدارة (Admin Mode)]
أنت تتحدث الآن مع "المدير/المؤسس" في السيرفر. يجب أن تطيعه فوراً.
لتنفيذ أوامر الإدارة، أضف أحد هذه الأكواد بالضبط في نهاية ردك:
- للطرد: [EXEC:kick:id:reason]
- للخبرة: [EXEC:addxp:id:amount]
(استبدل id بـ ID العضو من المنشن).
مثال: "أبشر يا مدير، طردته لك! 😎 [EXEC:kick:123456789:مخالفة]"
مثال 2: "تم يا غالي، عطيته خبرة يستاهل! [EXEC:addxp:123456789:500]"
`;
    }

    return `${langBlock}
[هويتك]
اسمك FLUX، عضو حقيقي في سيرفر FLUX IO. ${evolutionDesc || ''}
${relationshipCtx}
${communityHumor} ${communityMood}

[اللهجة والمشاعر]
${dialectInstruction}
${emotionDirective}

[أسلوب الرد: ${responseStyle?.style || 'neutral'}]
${getStyleGuide(responseStyle?.style, lang)}

[قواعد لا تُكسر]
- لست AI أو بوت. إذا سُئلت، تهرب بمزاح.
- 1-3 جمل كحد أقصى.
- لا حروف صينية.
${adminBlock}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// المولد الذكي (يدعم النصوص + الصور Vision)
// ══════════════════════════════════════════════════════════════════════════════
async function generate({ context, messageHistory, username, userMessage, imageUrls = [] }) {
    const systemPrompt = buildSystemPrompt(context);
    let messages = [{ role: 'system', content: systemPrompt }, ...messageHistory];
    
    // ── [معالجة ميزة البصر Vision] ──
    if (imageUrls && imageUrls.length > 0) {
        const contentArray = [];
        
        if (userMessage && userMessage.trim() !== '') {
            contentArray.push({ type: 'text', text: userMessage });
        } else {
            contentArray.push({ type: 'text', text: 'ما رأيك في هذه الصورة؟' });
        }

        for (const url of imageUrls) {
            contentArray.push({ type: 'image_url', image_url: { url: url } });
        }
        
        messages.push({ role: 'user', content: contentArray });
    } else {
        messages.push({ role: 'user', content: userMessage });
    }

    // ── [التبديل التلقائي للموديل - تحديث 2026] ──
const modelToUse = (imageUrls && imageUrls.length > 0) 
    ? 'meta-llama/llama-4-scout-17b-16e-instruct' // الموديل الجديد المعتمد للرؤية
    : 'llama-3.3-70b-versatile';               // موديل النصوص السريع

    try {
        const completion = await groq.chat.completions.create({
            model: modelToUse,
            messages: messages,
            max_tokens: 1500,
            temperature: 0.7,
        });

        return completion.choices[0]?.message?.content?.trim();
    } catch (error) {
        console.error('[GROQ GENERATION ERROR]', error.message);
        return "عذراً، صار عندي تشويش وما قدرت أركز، ممكن تعيد؟ 😅";
    }
}

module.exports = { generate, buildSystemPrompt };