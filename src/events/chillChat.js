// ─── events/chillChat.js ──────────────────────────────────────────────────────
// 1. تحميل الإعدادات من ملف .env (يجب أن يكون في أعلى الملف)
require('dotenv').config();
const Groq = require("groq-sdk");

const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { analyzeChannelDynamics, computeParticipationProbability, buildCrisisResponse } = require('../layers/socialContext');
const { shortTerm, mediumTerm, longTerm } = require('../memory/memorySystem');
const learningEngine = require('../memory/learningEngine');

const { isAdmin, isFounder } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');
const { addManualXP } = require('../utils/xpSystem');

// 2. إعداد مكتبة Groq باستخدام المتغير المخفي
// الكود رح يدور على المفتاح بالكابيتال، وإذا ما لقاه رح يدور بالسمول
const rawKey = process.env.GROQ_API_KEY || process.env.Groq_API_KEY || "";
const groqApiKey = rawKey.trim();
// عشان تتأكد بعينك إن البوت شاف المفتاح (رح يطبع أول 4 أحرف بس عشان الأمان)
console.log("🔑 مفتاح Groq المقروء يبدأ بـ:", groqApiKey ? groqApiKey.substring(0, 5) + "..." : "غير موجود! ❌");

const client = new Groq({ apiKey: groqApiKey, timeout: 30000 });

const CHILL_CHANNEL_KEYWORD = 'chill';
const MENTION_COOLDOWN_MS   = 1000;
const chillCooldown         = new Map();

async function handleChillMessage(message) {
    const { author, channel, content, member, attachments, guild } = message;

    if (author.bot) return;

    // 1. الحارس الصارم: إذا اسم القناة ما فيه كلمة chill، اخرج فوراً ولا تكمل
    const isChillChannel = channel.name?.toLowerCase().includes(CHILL_CHANNEL_KEYWORD);
    if (!isChillChannel) return; 

    // هسا البوت ما رح يوصل لهون إلا إذا كان فعلاً في قناة Chill
    const q = content?.trim() || '';
    
    // ─── استخراج الصور مع دعم Base64 لتخطي حماية ديسكورد ───
    const imageUrls = [];
    attachments.forEach(att => {
        if (att.url && (att.url.match(/\.(png|jpg|jpeg|gif|webp)/i) || (att.contentType && att.contentType.includes('image')))) {
            imageUrls.push(att.url);
        }
    });

    if (!q && imageUrls.length === 0) return;

    const hasAdminRights = member ? (isAdmin(member) || isFounder(member)) : false;
    const isMentioned    = /فلاكس|flux/i.test(q) || message.mentions?.has(message.client.user.id);

    if (!isChillChannel) {
        if (!hasAdminRights || !isMentioned) return;
    }

    const now = Date.now();
    const perception = analyze(q || 'صورة');

    // ── 1. تحديث الذاكرة العميقة (نسختك الأصلية لحماية البوت من الانهيار) ──
    shortTerm.add(channel.id, {
        role: 'user', content: imageUrls.length > 0 ? `${q} [صورة]` : q, username: author.username, userId: author.id,
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

    longTerm.updateCommunity({ dialect: perception.dialect, topic: perception.topic, mood: perception.sentiment });

    const recentMsgs   = shortTerm.getHistory(channel.id);
    const channelState = mediumTerm.getChannelState(channel.id);
    const dynamics     = analyzeChannelDynamics(recentMsgs, channelState);

    const learnedProb = learningEngine.getRecommendedReplyProb(perception.emotion, perception.dialect);
    const prob        = computeParticipationProbability(perception, dynamics, userProfile, learnedProb);
    
    let shouldReply = false;
    if (isChillChannel) {
        shouldReply = isMentioned || perception.warningFlag || (Math.random() <= prob);
    } else {
        shouldReply = true;
    }

    if (!shouldReply) return;

    // ─── اعتراض حرج: حالة خطر نفسي — لا نرسل AI أبداً ──────────────────────
    if (perception.warningFlag) {
        const crisisMsg = buildCrisisResponse(perception.lang);
        try {
            await message.reply(crisisMsg);
            // تسجيل في الـ mod-log لإعلام الإدارة
            const { guild } = message;
            const logChannel = guild.channels.cache.find(
                c => c.name.toLowerCase().includes('log') && c.isTextBased()
            );
            if (logChannel) {
                const { EmbedBuilder } = require('discord.js');
                const alertEmbed = new EmbedBuilder()
                    .setTitle('🚨  تنبيه: إشارة خطر نفسي')
                    .setDescription(
                        `العضو ${message.author} أرسل رسالة تحتوي على إشارات خطر.

` +
                        `**القناة:** ${channel}
` +
                        `**الرسالة:** ||${q.slice(0, 200)}||`
                    )
                    .setColor(0xff0000)
                    .setFooter({ text: 'FLUX • IO  |  نظام الأمان النفسي' })
                    .setTimestamp();
                await logChannel.send({ embeds: [alertEmbed] }).catch(() => {});
            }
        } catch (e) {
            console.error('[CRISIS] فشل إرسال رسالة الأزمة:', e.message);
        }
        return; // لا تكمل للـ AI أبداً
    }

    if (now - (chillCooldown.get(channel.id) || 0) < MENTION_COOLDOWN_MS) return;
    chillCooldown.set(channel.id, now);

    try {
        await channel.sendTyping().catch(() => {});

        const personalityBias = learningEngine.getPersonalityBias();
        const communityState  = longTerm.getCommunityState();
        const responseStyle   = selectResponseStyle(perception, communityState, personalityBias, userProfile);
        const evolutionDesc   = getEvolutionDescription(communityState.evolutionStage);

        // ── 2. المولد الذكي ──
        let apiMessages = [];

        const sysPrompt = `أنت FLUX Bot، مساعد ذكي ومرح في سيرفر FLUX IO.
${evolutionDesc}
تحدث بلهجة: ${perception.dialect}. مزاجك: ${perception.emotion}.
أسلوبك: ${responseStyle.style}.
أنت لست بوت، أنت إنسان حقيقي وصديق للأعضاء.
${hasAdminRights ? 'أنت تتحدث مع الإدارة. لتنفيذ أمر استخدم [EXEC:kick:id:سبب] أو [EXEC:addxp:id:رقم].' : ''}`;

        if (imageUrls.length > 0) {
            const contentArray = [];
            contentArray.push({ type: 'text', text: sysPrompt + '\nاشرح الصورة أو تفاعل معها:' + q });
            
            // تحويل الصور لـ Base64
            for (const url of imageUrls) {
                try {
                    const response = await fetch(url);
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const mimeType = response.headers.get('content-type') || 'image/png';
                    contentArray.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } });
                } catch (e) { console.error('Image Fetch Error:', e); }
            }
            apiMessages.push({ role: 'user', content: contentArray });
        } else {
            apiMessages.push({ role: 'system', content: sysPrompt });
            apiMessages = apiMessages.concat(shortTerm.buildAPIHistory(channel.id, 10));
            apiMessages.push({ role: 'user', content: q });
        }

        const modelToUse = imageUrls.length > 0 
            ? 'meta-llama/llama-4-scout-17b-16e-instruct' 
            : 'llama-3.3-70b-versatile';

        console.log("🔍 [DEBUG] الموديل المطلوب في ChillChat:", modelToUse);

        // تم استخدام client المعرف في الأعلى بدلاً من إنشاء واحد جديد في كل رسالة
        const completion = await client.chat.completions.create({
            model: modelToUse,
            messages: apiMessages,
            max_tokens: 1500,
            temperature: 0.7,
        });

        let response = completion.choices[0]?.message?.content?.trim();
        if (!response) response = "أبشر!";

        // ── 3. معالجة الأوامر الإدارية ──
        if (hasAdminRights) {
            const execRegex = /\[EXEC:([a-z]+):([^:]+):?([^\]]*)\]/ig;
            let match;
            while ((match = execRegex.exec(response)) !== null) {
                const action = match[1].toLowerCase();
                const targetId = match[2].replace(/[<@!>]/g, '').trim();
                const param = match[3];

                try {
                    const targetMember = await guild.members.fetch(targetId).catch(() => null);
                    if (action === 'kick' && targetMember?.kickable) {
                        await targetMember.kick(param || 'بأمر إداري');
                        if (logAction) await logAction(guild, { type: 'kick', moderator: author, target: targetMember, reason: param });
                    }
                    else if (action === 'addxp') {
                        if (addManualXP) await addManualXP(guild.id, targetId, parseInt(param) || 100);
                    }
                } catch (e) { console.error('[EXEC ERROR]', e.message); }
            }
            response = response.replace(execRegex, '').trim();
        }

        if (!response) response = "تم التنفيذ!";

        let sentMessage;
        if (isMentioned || !isChillChannel || perception.warningFlag) {
            sentMessage = await message.reply(response);
        } else {
            sentMessage = await channel.send(response);
        }

        shortTerm.add(channel.id, { role: 'assistant', content: response });
        mediumTerm.recordFluxResponse(channel.id, true);

        if (sentMessage && isChillChannel) {
            learningEngine.trackResponse(sentMessage.id, {
                channelId: channel.id, userId: author.id, emotion: perception.emotion,
                dialect: perception.dialect, intent: perception.intent,
                style: responseStyle.style, topic: perception.topic
            });
        }

    } catch (err) {
        console.error(`[FLUX-AI] ❌ خطأ: ${err.message}`);
        if (isMentioned || !isChillChannel) await message.reply('معي مشكلة صغيرة بالاتصال هسة، ثواني وبرجعلك 🙏').catch(()=>{});
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, clientArg) {
        await handleChillMessage(message);
    }
};