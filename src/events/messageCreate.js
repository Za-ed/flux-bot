const { handleCodeRun }      = require('./codeRunner');
const { handleChillMessage } = require('./chillChat');
const Groq = require('groq-sdk');

// ─── Key ──────────────────────────────────────────────────────────────────────
const GROQ_KEY = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME       = 'Staff';
const SPAM_THRESHOLD        = 5;
const SPAM_WINDOW_MS        = 3000;
const TIMEOUT_DURATION_MS   = 5 * 60 * 1000;
const AI_COOLDOWN_MS        = 3000;
const THREAD_INACTIVITY_MS  = 2 * 60 * 1000;

// ─── Stores ───────────────────────────────────────────────────────────────────
const spamMap             = new Map();
const conversationHistory = new Map();
const userCooldowns       = new Map();
const userThreads         = new Map();
const threadTimers        = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
    const chunks = [];
    let current  = '';
    const lines  = text.split('\n');
    for (const line of lines) {
        if (line.length > maxLength) {
            if (current.length > 0) { chunks.push(current); current = ''; }
            for (let i = 0; i < line.length; i += maxLength) chunks.push(line.slice(i, i + maxLength));
            continue;
        }
        if ((current + '\n' + line).length > maxLength) { chunks.push(current); current = line; }
        else { current = current.length === 0 ? line : current + '\n' + line; }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

function isStaff(member) {
    if (!member || !member.roles) return false;
    return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME);
}

async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
    try {
        const msg = await channel.send(content);
        setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
    } catch {}
}

function detectLanguage(text) {
    return /[\u0600-\u06FF]/.test(text) ? 'arabic' : 'english';
}

// ─── Thread Timer ─────────────────────────────────────────────────────────────
function resetThreadTimer(thread, userId) {
    if (threadTimers.has(thread.id)) clearTimeout(threadTimers.get(thread.id));

    const timer = setTimeout(async () => {
        try {
            await thread.send('⏰ تم إغلاق هذا الثريد تلقائياً بسبب عدم النشاط لمدة دقيقتين.');
            await new Promise((r) => setTimeout(r, 2000));
            await thread.delete('Inactivity timeout').catch(() => {});
        } catch {}
        userThreads.delete(userId);
        threadTimers.delete(thread.id);
        conversationHistory.delete(userId);
        console.log(`[THREAD] Auto-deleted thread for user ${userId}`);
    }, THREAD_INACTIVITY_MS);

    threadTimers.set(thread.id, timer);
}

// ─── Thread Creator ───────────────────────────────────────────────────────────
async function getOrCreateThread(message) {
    const { author, guild } = message;

    if (userThreads.has(author.id)) {
        const existingThread = guild.channels.cache.get(userThreads.get(author.id));
        if (existingThread && !existingThread.archived && !existingThread.deleted) return existingThread;
        userThreads.delete(author.id);
        conversationHistory.delete(author.id);
    }

    const thread = await message.startThread({
        name:                `💬 ${author.username} — FLUX AI`,
        autoArchiveDuration: 60,
        reason:              `AI thread for ${author.tag}`,
    });

    userThreads.set(author.id, thread.id);

    await thread.send(
        `👋 **أهلاً ${author}!**\n` +
        `هذا ثريدك الخاص مع **FLUX AI**.\n\n` +
        `> 💡 اسألني أي شيء — برمجة، معرفة عامة، أو محادثة عادية.\n` +
        `> 🧹 اكتب \`!مسح\` لمسح تاريخ المحادثة.\n` +
        `> ⏰ سيتم حذف الثريد تلقائياً بعد **دقيقتين** من عدم النشاط.`
    );

    return thread;
}

// ─── Groq Query ───────────────────────────────────────────────────────────────
async function queryGroq(userId, userMessage) {
    const client = new Groq({ apiKey: GROQ_KEY });
    const lang   = detectLanguage(userMessage);

    const systemPrompt = lang === 'arabic'
        ? `أنت FLUX Bot، مساعد ذكي واحترافي في سيرفر FLUX IO على Discord.
قواعد صارمة:
- رد دائماً بالعربية الفصحى السهلة
- المصطلحات التقنية اكتبها بالإنجليزي داخل backticks
- استخدم markdown code blocks مع اسم اللغة عند الكود
- أسلوبك: واضح، مفيد، ودود`
        : `You are FLUX Bot, a smart assistant in FLUX IO Discord server.
Rules:
- Always respond in English only
- Format code using markdown code blocks with language name
- Be clear, helpful, and friendly`;

    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);
    history.push({ role: 'user', content: userMessage });
    if (history.length > 10) history.splice(0, history.length - 10);

    const completion = await client.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens:  1500,
        temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text || text.trim().length === 0) throw new Error('Empty response');
    history.push({ role: 'assistant', content: text });
    return text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
module.exports = {
    name: 'messageCreate',
    once: false,

    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild)     return;

        const { author, member, channel, content } = message;

        // 1. تشغيل الملفات الخارجية (مع الحماية بـ Try/Catch)
        try {
            if (handleCodeRun) await handleCodeRun(message);
            if (handleChillMessage) await handleChillMessage(message);
        } catch (err) {
            console.error('[MODULE ERROR]', err.message);
        }

        // 2. تتبع الإحصاءات اليومية
        try {
            const { trackMessage } = require('../utils/dailyReport');
            if (trackMessage) trackMessage(message.guild.id, author.id);
        } catch {}

        // ── Anti-Link (قبل الـ AI والـ Spam لتخفيف الضغط) ──────────────
        if (/https?:\/\//i.test(content) && !isStaff(member)) {
            try { await message.delete(); } catch {}
            await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة هنا.`, 6000);
            return;
        }

        // ── Anti-Spam ──────────────────────────────────────────────────
        if (!isStaff(member)) {
            const now    = Date.now();
            if (!spamMap.has(author.id)) spamMap.set(author.id, { timestamps: [], messageIds: [] });
            
            const userData = spamMap.get(author.id);
            userData.timestamps.push(now);
            userData.messageIds.push(message.id);
            
            while (userData.timestamps.length > 0 && now - userData.timestamps[0] > SPAM_WINDOW_MS) {
                userData.timestamps.shift();
                userData.messageIds.shift();
            }
            
            if (userData.timestamps.length >= SPAM_THRESHOLD) {
                const idsToDelete = [...userData.messageIds];
                spamMap.delete(author.id);
                
                for (const msgId of idsToDelete) {
                    await channel.messages.fetch(msgId).then((m) => m.delete().catch(() => {})).catch(() => {});
                }
                try {
                    await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
                    await sendTempWarning(channel, `🔇 **${author.username}** تم كتمه 5 دقائق بسبب السبام.`, 8000);
                } catch (err) {
                    console.error('[AUTOMOD] Timeout failed:', err.message);
                }
                return;
            }
        }

        // ── ثريدات AI (داخل الثريد نفسه) ────────────────────────────────
        if (channel.isThread()) {
            if (userThreads.get(author.id) === channel.id) {
                const userQuestion = content.trim();

                if (userQuestion === '!clear' || userQuestion === '!مسح') {
                    conversationHistory.delete(author.id);
                    await channel.send('🧹 تم مسح تاريخ محادثتك. نبدأ من جديد!');
                    resetThreadTimer(channel, author.id);
                    return;
                }

                const lastUsed = userCooldowns.get(author.id) || 0;
                const now      = Date.now();
                if (now - lastUsed < AI_COOLDOWN_MS) {
                    const remaining = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                    await sendTempWarning(channel, `⏳ انتظر **${remaining}** ثانية.`, 3000);
                    return;
                }
                userCooldowns.set(author.id, now);
                resetThreadTimer(channel, author.id);

                let typingInterval;
                try {
                    typingInterval = setInterval(() => channel.sendTyping().catch(() => {}), 5000);
                    await channel.sendTyping().catch(() => {});
                    await message.react('⏳').catch(() => {});

                    const aiResponse = await queryGroq(author.id, userQuestion);
                    
                    clearInterval(typingInterval);
                    await message.reactions.cache.get('⏳')?.remove().catch(() => {});
                    await message.react('✅').catch(() => {});
                    
                    const chunks = splitMessage(aiResponse, 1900);
                    for (const chunk of chunks) await channel.send(chunk).catch(() => {});
                } catch (err) {
                    if (typingInterval) clearInterval(typingInterval);
                    await message.reactions.cache.get('⏳')?.remove().catch(() => {});
                    await message.react('❌').catch(() => {});
                    await channel.send('❌ عذراً، حدث خطأ. حاول مجدداً بعد قليل.');
                    console.error('[GROQ ERROR]', err.message);
                }
            }
            return;
        }

        // ── إنشاء ثريد AI — قناة ask-flux ──────────────────────────────
        if (channel.name === ASK_FLUX_CHANNEL_NAME) {
            const userQuestion = content.trim();
            if (!userQuestion) return;

            const lastUsed = userCooldowns.get(author.id) || 0;
            const now      = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) {
                const remaining = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                await sendTempWarning(channel, `⏳ **${author.username}**، انتظر **${remaining}** ثانية.`, 3000);
                return;
            }
            userCooldowns.set(author.id, now);

            try {
                const thread = await getOrCreateThread(message);
                resetThreadTimer(thread, author.id);
                await message.react('💬').catch(() => {});

                let typingInterval;
                try {
                    typingInterval = setInterval(() => thread.sendTyping().catch(() => {}), 5000);
                    await thread.sendTyping().catch(() => {});

                    const aiResponse = await queryGroq(author.id, userQuestion);
                    
                    clearInterval(typingInterval);
                    const chunks = splitMessage(aiResponse, 1900);
                    for (const chunk of chunks) await thread.send(chunk).catch(() => {});
                } catch (err) {
                    if (typingInterval) clearInterval(typingInterval);
                    await thread.send('❌ عذراً، حدث خطأ. حاول مجدداً بعد قليل.');
                    console.error('[GROQ INIT ERROR]', err.message);
                }
            } catch (err) {
                console.error('[THREAD CREATION FAILED]', err.message);
                await sendTempWarning(channel, `❌ **${author.username}**، حدث خطأ في إنشاء الثريد.`, 5000);
            }
        }
    },
};