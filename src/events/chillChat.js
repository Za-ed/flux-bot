// ─── events/chillChat.js ──────────────────────────────────────────────────────
// الإصدار: 4.1 (النسخة المعرفية الذكية + وضع الإدارة المخفي)
// المحرك: Groq API | النموذج: llama-3.3-70b-versatile
// ══════════════════════════════════════════════════════════════════════════════

// ── إبقاء المفتاح كما طلبت دون أي تغيير ──
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ── استيراد الطبقات الذكية ──
// ─── events/chillChat.js ──────────────────────────────────────────────────────
const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { analyzeChannelDynamics, computeParticipationProbability } = require('../layers/socialContext');
const { shortTerm, mediumTerm, longTerm } = require('../memory/memorySystem');
const learningEngine = require('../memory/learningEngine');
const { generate } = require('../core/responseGenerator');

const { isAdmin, isFounder } = require('../utils/permissions');
const { addManualXP } = require('../utils/xpSystem');

const CHILL_CHANNEL_KEYWORD = 'chill';
const MENTION_COOLDOWN_MS   = 1000;
const chillCooldown         = new Map();

module.exports = {
    name: 'messageCreate', // يعمل كحدث مستقل
    once: false,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const { author, channel, content, member, guild, attachments } = message;
        
        // لا تتدخل في قناة ask-flux أو ثريداتها (لأن messageCreate.js يهتم بها)
        if (channel.name?.toLowerCase().includes('ask-flux') || channel.isThread()) return;

        // ─── [التقاط الصور] ───
        const imageUrls = attachments.filter(a => a.contentType?.startsWith('image/')).map(a => a.url);

        // إذا ما في نص ولا صورة، تجاهل الرسالة
        if (!content.trim() && imageUrls.length === 0) return;

        const isChillChannel = channel.name?.toLowerCase().includes(CHILL_CHANNEL_KEYWORD);
        const hasAdminRights = isAdmin(member) || isFounder(member);
        const isMentioned    = /فلاكس|flux/i.test(content) || message.mentions.has(client.user.id);

        // قاعدة التواجد: في تشيل نرد، خارج تشيل للأدمن فقط
        if (!isChillChannel && (!hasAdminRights || !isMentioned)) return;

        const now = Date.now();
        
        // تحليل النص (نمرر كلمة "صورة" عشان الإدراك ما يضرب إذا النص فاضي)
        const perception = analyze(content.trim() || 'صورة');

        // حفظ بالذاكرة عشان السياق وما يضرب الموديل العادي بعدين
        const memoryContent = imageUrls.length > 0 ? `${content} [أرسل صورة]` : content;
        shortTerm.add(channel.id, { role: 'user', content: memoryContent, username: author.username });

        if (isChillChannel) {
            const recentMsgs = shortTerm.getHistory(channel.id);
            const prob = computeParticipationProbability(perception, analyzeChannelDynamics(recentMsgs, {}), {}, 0.55);
            if (!isMentioned && !perception.warningFlag && Math.random() > prob) return;
        }

        if (now - (chillCooldown.get(channel.id) || 0) < MENTION_COOLDOWN_MS) return;
        chillCooldown.set(channel.id, now);

        await channel.sendTyping().catch(() => {});

        try {
            const context = {
                perception,
                responseStyle: selectResponseStyle(perception, longTerm.getCommunityState(), 0.5, longTerm.getProfile(author.id, author.username)),
                dialectResult: { lang: perception.lang, dialect: perception.dialect },
                userProfile: longTerm.getProfile(author.id, author.username),
                communityState: longTerm.getCommunityState(),
                evolutionDesc: getEvolutionDescription(1),
                hasAdminRights // تفعيل الأوامر المخفية للأدمن
            };

            const history = shortTerm.buildAPIHistory(channel.id, 10);
            
            // ─── [المولد الذكي مع دعم الصور] ───
            let response = await generate({ 
                context, 
                messageHistory: history, 
                username: author.username, 
                userMessage: content.trim(),
                imageUrls: imageUrls // إرسال الصور لمحرك الرؤية
            });

            // تنفيذ الأوامر الإدارية المخفية (للمدراء فقط)
            if (hasAdminRights) {
                const execRegex = /\[EXEC:([a-z]+):([^:]+):?([^\]]*)\]/g;
                let match;
                while ((match = execRegex.exec(response)) !== null) {
                    const action = match[1];
                    const targetId = match[2].replace(/[<@!>]/g, '').trim();
                    const param = match[3];

                    try {
                        const targetMember = await guild.members.fetch(targetId).catch(() => null);
                        if (action === 'kick' && targetMember?.kickable) await targetMember.kick(param || 'بأمر إداري');
                        else if (action === 'addxp') await addManualXP(guild.id, targetId, parseInt(param) || 100);
                    } catch (e) { console.error('[EXEC ERROR]', e); }
                }
                response = response.replace(execRegex, '').trim();
            }

            if (!response) response = "أبشر، تم!";

            if (isMentioned || !isChillChannel) await message.reply(response);
            else await channel.send(response);

            shortTerm.add(channel.id, { role: 'assistant', content: response });

        } catch (err) { console.error('[CHILL ERROR]', err); }
    }
};