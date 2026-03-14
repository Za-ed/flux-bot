// ─── events/messageCreate.js ─────────────────────────────────────────────────
// الإصدار المطور: يجمع بين الحماية، الثريدات، والطبقات المعرفية الذكية
// ══════════════════════════════════════════════════════════════════════════════

const { handleCodeRun }       = require('./codeRunner');
const { handleGamingMessage } = require('./gamingCorner');
const { trackMessage }        = require('../utils/dailyReport');
const { isAdmin, isFounder }  = require('../utils/permissions');
const { addMessageXP, addManualXP } = require('../utils/xpSystem');

// استيراد الطبقات المعرفية الجديدة
const { analyze } = require('../layers/perceptionLayer');
const { selectResponseStyle, getEvolutionDescription } = require('../layers/personalityEngine');
const { shortTerm, longTerm } = require('../memory/memorySystem');
const { generate } = require('../core/responseGenerator');

// ─── Key (بقي كما هو تماماً) ──────────────────────────────────────────────────
const GROQ_KEY = process.env.GROQ_KEY || Buffer.from(
    'Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=',
    'base64'
).toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME       = 'Staff';
const SPAM_THRESHOLD        = 5;
const SPAM_WINDOW_MS        = 3000;
const TIMEOUT_DURATION_MS   = 5 * 60 * 1000;
const AI_COOLDOWN_MS        = 3000;
const THREAD_INACTIVITY_MS  = 2 * 60 * 1000;
const CACHE_CLEANUP_MS      = 10 * 60 * 1000;
const MAX_HISTORY_LENGTH    = 10;

// ─── Stores ───────────────────────────────────────────────────────────────────
const spamMap             = new Map();
const askFluxCooldowns    = new Map();
const threadCooldowns     = new Map();
const userThreads         = new Map(); // userId -> threadId
const threadTimers        = new Map(); // threadId -> timeoutId

// ─── تنظيف دوري لمنع تسرب الذاكرة ───────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of askFluxCooldowns.entries()) if (now - ts > CACHE_CLEANUP_MS) askFluxCooldowns.delete(k);
    for (const [k, ts] of threadCooldowns.entries())  if (now - ts > CACHE_CLEANUP_MS) threadCooldowns.delete(k);
    for (const [k, data] of spamMap.entries()) if ((now - (data.timestamps.at(-1) ?? 0)) > SPAM_WINDOW_MS * 10) spamMap.delete(k);
}, CACHE_CLEANUP_MS);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
    const chunks = [];
    let current  = '';
    if (!text) return chunks;
    for (const line of text.split('\n')) {
        if (line.length > maxLength) {
            if (current.length > 0) { chunks.push(current); current = ''; }
            for (let i = 0; i < line.length; i += maxLength) chunks.push(line.slice(i, i + maxLength));
            continue;
        }
        const next = current.length === 0 ? line : current + '\n' + line;
        if (next.length > maxLength) { chunks.push(current); current = line; }
        else current = next;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

function isStaffMember(member) {
    if (!member?.roles) return false;
    return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME) || isAdmin(member);
}

async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
    try {
        const msg = await channel.send(content);
        setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
    } catch {}
}

// ─── Thread Timer ─────────────────────────────────────────────────────────────
function resetThreadTimer(thread, userId) {
    if (threadTimers.has(thread.id)) clearTimeout(threadTimers.get(thread.id));
    const timer = setTimeout(async () => {
        try {
            await thread.send('⏰ تم إغلاق هذا الثريد تلقائياً بسبب عدم النشاط.');
            await new Promise((r) => setTimeout(r, 2000));
            await thread.delete('Inactivity timeout').catch(() => {});
        } catch {}
        userThreads.delete(userId);
        threadTimers.delete(thread.id);
        shortTerm.delete(thread.id); // تنظيف الذاكرة المعرفية للثريد
        threadCooldowns.delete(userId);
    }, THREAD_INACTIVITY_MS);
    threadTimers.set(thread.id, timer);
}

// ─── Thread Creator ───────────────────────────────────────────────────────────
async function getOrCreateThread(message) {
    const { author, guild } = message;

    if (userThreads.has(author.id)) {
        const threadId = userThreads.get(author.id);
        let existing   = guild.channels.cache.get(threadId);
        if (!existing) {
            try { existing = await guild.channels.fetch(threadId); } catch { existing = null; }
        }
        if (existing && !existing.archived) return existing;

        userThreads.delete(author.id);
        threadCooldowns.delete(author.id);
        if (threadId) threadTimers.delete(threadId);
    }

    const thread = await message.startThread({
        name:                `💬 ${author.username} — FLUX AI`,
        autoArchiveDuration: 60,
        reason:              `AI thread for ${author.tag}`,
    });

    userThreads.set(author.id, thread.id);

    await thread.send(
        `👋 **أهلاً ${author}!** هذا ثريدك الخاص مع **FLUX AI**.\n\n` +
        `> 💡 اسألني أي شيء — برمجة، معرفة عامة، محادثة عادية.\n` +
        `> ⏰ يُحذف الثريد تلقائياً بعد دقيقتين من عدم النشاط.`
    );

    return thread;
}

// ─── AI Response Handler (المطور باستخدام الطبقات) ───────────────────────────
async function handleAIResponse(message, targetChannel, isAskFlux = false) {
    const { author, member, content, guild } = message;
    let typingInterval = null;

    try {
        await targetChannel.sendTyping().catch(() => {});
        typingInterval = setInterval(() => targetChannel.sendTyping().catch(() => {}), 5000);
        
        // 1. تحليل الإدراك
        const perception = analyze(content);
        
        // 2. تحديث الذاكرة
        shortTerm.add(targetChannel.id, { role: 'user', content, username: author.username });
        
        // 3. بناء السياق المعرفي
        const hasAdmin = isAdmin(member) || isFounder(member);
        const context = {
            perception,
            responseStyle: selectResponseStyle(perception, longTerm.getCommunityState(), 0.5, longTerm.getProfile(author.id, author.username)),
            dialectResult: { lang: perception.lang, dialect: perception.dialect },
            userProfile: longTerm.getProfile(author.id, author.username),
            communityState: longTerm.getCommunityState(),
            evolutionDesc: getEvolutionDescription(1),
            hasAdminRights: hasAdmin
        };

        const messageHistory = shortTerm.buildAPIHistory(targetChannel.id, MAX_HISTORY_LENGTH);

        // 4. التوليد عبر المحرك الجديد
        let aiResponse = await generate({ context, messageHistory, username: author.username, userMessage: content });

        // 5. محرك التنفيذ للإدارة [EXEC:...]
        if (hasAdmin) {
            const execRegex = /\[EXEC:([a-z]+):([^:]+):?([^\]]*)\]/g;
            let match;
            while ((match = execRegex.exec(aiResponse)) !== null) {
                const action = match[1];
                const targetId = match[2].replace(/[<@!>]/g, '').trim();
                const param = match[3];

                try {
                    const targetMember = await guild.members.fetch(targetId).catch(() => null);
                    if (action === 'kick' && targetMember?.kickable) await targetMember.kick(param || 'بأمر إداري');
                    else if (action === 'addxp') await addManualXP(guild.id, targetId, parseInt(param) || 100);
                } catch (e) { console.error('[EXEC ERROR]', e.message); }
            }
            aiResponse = aiResponse.replace(execRegex, '').trim();
        }

        clearInterval(typingInterval); typingInterval = null;

        if (aiResponse) {
            for (const chunk of splitMessage(aiResponse, 1900)) {
                await targetChannel.send(chunk);
            }
            shortTerm.add(targetChannel.id, { role: 'assistant', content: aiResponse });
        }

    } catch (err) {
        if (typingInterval) clearInterval(typingInterval);
        console.error('[AI ERROR]', err);
        await targetChannel.send('❌ حدث خطأ في معالجة طلبك، حاول مجدداً.').catch(() => {});
    }
}

// ─── Anti-Spam ────────────────────────────────────────────────────────────────
async function handleAntiSpam(message) {
    const { author, member, channel } = message;
    const now = Date.now();
    if (!spamMap.has(author.id)) spamMap.set(author.id, { timestamps: [], messageIds: [] });
    const spamData = spamMap.get(author.id);
    spamData.timestamps.push(now);
    spamData.messageIds.push(message.id);
    while (spamData.timestamps.length > 0 && now - spamData.timestamps[0] > SPAM_WINDOW_MS) {
        spamData.timestamps.shift();
        spamData.messageIds.shift();
    }
    if (spamData.timestamps.length >= SPAM_THRESHOLD) {
        const idsToDelete = [...spamData.messageIds];
        spamMap.delete(author.id);
        await Promise.allSettled(
            idsToDelete.map((id) => channel.messages.fetch(id).then((m) => m.delete()).catch(() => {}))
        );
        try {
            await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
            await sendTempWarning(channel, `🔇 **${author.username}** تم كتمه 5 دقائق بسبب السبام.`, 8000);
        } catch (err) { console.error('[AUTOMOD] Timeout failed:', err.message); }
        return true;
    }
    return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
module.exports = {
    name: 'messageCreate',
    once: false,

    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const { author, member, channel, content } = message;

        // ─── 1. نظام الـ XP ───
        try {
            if (!content.startsWith('!') && !/https?:\/\//i.test(content)) {
                const result = await addMessageXP(message.guild.id, author.id);
                if (result && result.leveled) {
                    const { updateTierRole, announceLevelUp } = require('./leveling');
                    await updateTierRole(member, result.user.level);
                    await announceLevelUp(message.guild, member, result.user.level - 1, result.user.level);
                }
            }
        } catch (err) { console.error('[XP ERROR]', err.message); }

        // ─── 2. الوحدات الخارجية (أكواد وألعاب) ───
        try {
            if (typeof handleCodeRun === 'function') await handleCodeRun(message);
            if (typeof handleGamingMessage === 'function') await handleGamingMessage(message);
        } catch (err) { console.error('[MODULE ERROR]', err.message); }

        // ─── 3. إحصاءات يومية ───
        try { if (typeof trackMessage === 'function') trackMessage(message.guild.id, author.id); } catch {}

        // ─── 4. حماية الروابط ───
        if (/https?:\/\//i.test(content) && !isStaffMember(member)) {
            try { await message.delete(); } catch {}
            await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة هنا.`, 6000);
            return;
        }

        // ─── 5. حماية السبام ───
        if (!isStaffMember(member) && await handleAntiSpam(message)) return;

        // ─── 6. ثريد AI (داخل الثريد) ───
        if (channel.isThread()) {
            if (userThreads.get(author.id) !== channel.id) return;
            const q = content.trim();
            if (!q) return;

            const lastUsed = threadCooldowns.get(author.id) || 0;
            const now = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) return;
            
            threadCooldowns.set(author.id, now);
            resetThreadTimer(channel, author.id);
            await handleAIResponse(message, channel);
            return;
        }

        // ─── 7. قناة ask-flux ───
        if (channel.name?.toLowerCase().trim() === ASK_FLUX_CHANNEL_NAME) {
            const q = content.trim();
            if (!q) return;

            const lastUsed = askFluxCooldowns.get(author.id) || 0;
            const now = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) return;
            askFluxCooldowns.set(author.id, now);

            try {
                const thread = await getOrCreateThread(message);
                resetThreadTimer(thread, author.id);
                await message.react('💬').catch(() => {});
                await handleAIResponse(message, thread, true);
            } catch (threadErr) {
                console.error('[ASK-FLUX] Thread Err:', threadErr.message);
                await handleAIResponse(message, channel);
            }
        }
    },
};