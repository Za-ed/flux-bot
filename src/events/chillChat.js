// ─── events/chillChat.js ──────────────────────────────────────────────────────
const Groq = require('groq-sdk');
const GROQ_KEY = process.env.Groq_API_KEY || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { analyzeChannelDynamics, computeParticipationProbability } = require('../layers/socialContext');
const { shortTerm, mediumTerm, longTerm } = require('../memory/memorySystem');
const learningEngine = require('../memory/learningEngine');

const { isAdmin, isFounder } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');
const { addManualXP } = require('../utils/xpSystem');

const CHILL_CHANNEL_KEYWORD = 'chill';
const MENTION_COOLDOWN_MS   = 1000;
const chillCooldown         = new Map();

async function handleChillMessage(message) {
    const { author, channel, content, member, attachments, guild } = message;

    if (author.bot) return;

    const q = content?.trim() || '';

    // ─── استخراج الصور مع دعم Base64 لتخطي حماية ديسكورد ───
    const imageUrls = [];
    attachments.forEach(att => {
        if (att.url && (att.url.match(/\.(png|jpg|jpeg|gif|webp)/i) || (att.contentType && att.contentType.includes('image')))) {
            imageUrls.push(att.url);
        }
    });

    if (!q && imageUrls.length === 0) return;

    const isChillChannel = channel.name?.toLowerCase().includes(CHILL_CHANNEL_KEYWORD);
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

    if (now - (chillCooldown.get(channel.id) || 0) < MENTION_COOLDOWN_MS) return;
    chillCooldown.set(channel.id, now);

    try {
        await channel.sendTyping().catch(() => {});

        const personalityBias = learningEngine.getPersonalityBias();
        const communityState  = longTerm.getCommunityState();
        const responseStyle   = selectResponseStyle(perception, communityState, personalityBias, userProfile);
        const evolutionDesc   = getEvolutionDescription(communityState.evolutionStage);

        // ── 2. المولد الذكي (مدمج داخلياً لضمان السرعة وعدم التعارض) ──
        const client = new Groq({ apiKey: GROQ_KEY, timeout: 30000 });
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

        // تحديث موديل الرؤية للموديل الرسمي الجديد
// ── داخل ملف events/chillChat.js ──
const modelToUse = imageUrls.length > 0 
    ? 'meta-llama/llama-4-scout-17b-16e-instruct' 
    : 'llama-3.3-70b-versatile';

// 🛑 حطه هون بالضبط:
console.log("🛠️ محاولة الاتصال بالموديل (ChillChat):", modelToUse)

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
    async execute(message, client) {
        await handleChillMessage(message);
    }
};