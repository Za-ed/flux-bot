// ─── events/messageCreate.js ─────────────────────────────────────────────────
// الإصدار الموحد: حماية + ثريدات + AI Code Runner
// ══════════════════════════════════════════════════════════════════════════════

// لاحظ تغيير المسار لـ codeRunner ليقرأ من مجلد utils (نسخة الـ AI)
const { handleCodeRun }       = require('../utils/codeRunner'); 
const { handleGamingMessage } = require('./gamingCorner');
const { trackMessage }        = require('../utils/dailyReport');
const { isAdmin, isFounder }  = require('../utils/permissions');
const { addMessageXP, addManualXP } = require('../utils/xpSystem');

const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { shortTerm, longTerm } = require('../memory/memorySystem');
const { generate } = require('../core/responseGenerator');

// ─── Key (محمي) ──────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.GROQ_KEY || Buffer.from(
    'Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=',
    'base64'
).toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME       = 'Staff';
const SPAM_THRESHOLD        = 5;
const SPAM_WINDOW_MS        = 3000;
const AI_COOLDOWN_MS        = 3000;
const THREAD_INACTIVITY_MS  = 2 * 60 * 1000;

const spamMap             = new Map();
const askFluxCooldowns    = new Map();
const threadCooldowns     = new Map();
const userThreads         = new Map(); 
const threadTimers        = new Map(); 

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isStaffMember(member) {
    return member?.roles?.cache.some((r) => r.name === STAFF_ROLE_NAME) || isAdmin(member);
}

async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
    const msg = await channel.send(content).catch(()=>{});
    if(msg) setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
}

function resetThreadTimer(thread, userId) {
    if (threadTimers.has(thread.id)) clearTimeout(threadTimers.get(thread.id));
    const timer = setTimeout(async () => {
        try {
            await thread.send('⏰ تم إغلاق الثريد تلقائياً لعدم النشاط.');
            userThreads.delete(userId);
            threadTimers.delete(thread.id);
            await thread.delete().catch(() => {});
        } catch {}
    }, THREAD_INACTIVITY_MS);
    threadTimers.set(thread.id, timer);
}

// ─── AI Handler ──────────────────────────────────────────────────────────────
async function handleAIResponse(message, targetChannel) {
    try {
        await targetChannel.sendTyping().catch(() => {});
        const perception = analyze(message.content);
        shortTerm.add(targetChannel.id, { role: 'user', content: message.content, username: message.author.username });

        const context = {
            perception,
            responseStyle: selectResponseStyle(perception, longTerm.getCommunityState(), 0.5, longTerm.getProfile(message.author.id, message.author.username)),
            dialectResult: { lang: perception.lang, dialect: perception.dialect },
            userProfile: longTerm.getProfile(message.author.id, message.author.username),
            communityState: longTerm.getCommunityState(),
            evolutionDesc: getEvolutionDescription(1),
            hasAdminRights: isAdmin(message.member) || isFounder(message.member)
        };

        const aiResponse = await generate({ context, messageHistory: shortTerm.buildAPIHistory(targetChannel.id, 10), username: message.author.username, userMessage: message.content });

        if (aiResponse) {
            await targetChannel.send(aiResponse);
            shortTerm.add(targetChannel.id, { role: 'assistant', content: aiResponse });
        }
    } catch (err) { console.error('[AI ERROR]', err); }
}

// ─── Main Execute ─────────────────────────────────────────────────────────────
module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        const { author, member, channel, content } = message;

        // 1. مشغل الأكواد الذكي (AI Code Runner)
        // إذا كانت الرسالة عبارة عن بلوك كود، سيقوم الـ AI بحله ويتوقف الكود هنا
        if (content.startsWith('```')) {
            try {
                const handled = await handleCodeRun(message);
                if (handled) return; // توقف فوراً ولا تحسب XP أو ردود أخرى
            } catch (e) { console.error('[CODE RUN ERROR]', e); }
        }

        // 2. نظام الـ XP
        if (!content.startsWith('!') && !/https?:\/\//i.test(content)) {
            addMessageXP(message.guild.id, author.id).then(res => {
                if (res?.leveled) {
                    const { announceLevelUp } = require('./leveling');
                    announceLevelUp(message.guild, member, res.user.level - 1, res.user.level);
                }
            }).catch(()=>{});
        }

        // 3. حماية الروابط والسبام
        if (/https?:\/\//i.test(content) && !isStaffMember(member)) {
            return message.delete().then(() => sendTempWarning(channel, `⚠️ الروابط ممنوعة يا ${author.username}`)).catch(()=>{});
        }

        // 4. ثريد AI وقناة ask-flux
        if (channel.isThread() && userThreads.get(author.id) === channel.id) {
            resetThreadTimer(channel, author.id);
            return handleAIResponse(message, channel);
        }

        if (channel.name?.toLowerCase().trim() === ASK_FLUX_CHANNEL_NAME) {
            const thread = await message.startThread({ name: `💬 ${author.username} — AI` });
            userThreads.set(author.id, thread.id);
            resetThreadTimer(thread, author.id);
            return handleAIResponse(message, thread);
        }
    }
};