const { handleCodeRun }      = require('./codeRunner');
const { handleChillMessage } = require('./chillChat');
const Groq = require('groq-sdk');

// ─── Key ──────────────────────────────────────────────────────────────────────
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

// ─── Groq Client (Singleton) ──────────────────────────────────────────────────
const groqClient = new Groq({ apiKey: GROQ_KEY });

// ─── Stores ───────────────────────────────────────────────────────────────────
const spamMap             = new Map();
const conversationHistory = new Map();

// ✅ كولداون منفصل لكل سياق — ask-flux وثريد ما يتشاركون نفس الكولداون
const askFluxCooldowns    = new Map(); // cooldown قناة ask-flux فقط
const threadCooldowns     = new Map(); // cooldown الثريد فقط

const userThreads         = new Map(); // userId -> threadId
const threadTimers        = new Map(); // threadId -> timeoutId

// ─── تنظيف دوري لمنع تسرب الذاكرة ───────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of askFluxCooldowns.entries()) {
        if (now - ts > CACHE_CLEANUP_MS) askFluxCooldowns.delete(key);
    }
    for (const [key, ts] of threadCooldowns.entries()) {
        if (now - ts > CACHE_CLEANUP_MS) threadCooldowns.delete(key);
    }
    for (const [key, data] of spamMap.entries()) {
        const lastTs = data.timestamps.at(-1) ?? 0;
        if (now - lastTs > SPAM_WINDOW_MS * 10) spamMap.delete(key);
    }
}, CACHE_CLEANUP_MS);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
    const chunks = [];
    let current  = '';
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

function isStaff(member) {
    if (!member?.roles) return false;
    return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME);
}

async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
    try {
        const msg = await channel.send(content);
        setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
    } catch {}
}

function detectLanguage(text) {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicChars / text.length > 0.3 ? 'arabic' : 'english';
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
        threadCooldowns.delete(userId);
        console.log(`[THREAD] Auto-deleted thread for user ${userId}`);
    }, THREAD_INACTIVITY_MS);

    threadTimers.set(thread.id, timer);
}

// ─── Thread Creator ───────────────────────────────────────────────────────────
async function getOrCreateThread(message) {
    const { author, guild } = message;

    // ✅ الإصلاح الجوهري: نتحقق أن الثريد فعلاً موجود وليس مجرد ID قديم في الـ Map
    if (userThreads.has(author.id)) {
        const threadId       = userThreads.get(author.id);
        // نحاول نجلب الثريد من الـ cache أولاً، وإن ما كان نجلبه من Discord
        let existingThread   = guild.channels.cache.get(threadId);

        // لو مش في الكاش، نحاول نجلبه من Discord مباشرة
        if (!existingThread) {
            try {
                existingThread = await guild.channels.fetch(threadId);
            } catch {
                existingThread = null; // الثريد محذوف أو غير موجود
            }
        }

        // الثريد موجود وليس مؤرشفاً → أعد استخدامه
        if (existingThread && !existingThread.archived) {
            return existingThread;
        }

        // الثريد محذوف أو مؤرشف → نظّف البيانات القديمة
        userThreads.delete(author.id);
        conversationHistory.delete(author.id);
        threadCooldowns.delete(author.id);
        if (existingThread?.id) threadTimers.delete(existingThread.id);
    }

    // إنشاء ثريد جديد
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
        `> 🧹 اكتب \`!مسح\` أو \`!clear\` لمسح تاريخ المحادثة.\n` +
        `> 📊 اكتب \`!تاريخ\` لعرض عدد الرسائل الحالية في المحادثة.\n` +
        `> ⏰ سيتم حذف الثريد تلقائياً بعد **دقيقتين** من عدم النشاط.`
    );

    return thread;
}

// ─── Groq Query ───────────────────────────────────────────────────────────────
async function queryGroq(userId, userMessage) {
    const lang = detectLanguage(userMessage);

    const systemPrompt = lang === 'arabic'
        ? `أنت FLUX Bot، مساعد ذكي واحترافي في سيرفر FLUX IO على Discord.
قواعد صارمة:
- رد دائماً بالعربية الفصحى السهلة
- المصطلحات التقنية اكتبها بالإنجليزي داخل backticks
- استخدم markdown code blocks مع اسم اللغة عند الكود
- لا تكرر السؤال في ردك
- أسلوبك: واضح، مفيد، ودود، ومختصر`
        : `You are FLUX Bot, a smart and professional assistant in the FLUX IO Discord server.
Rules:
- Always respond in English only
- Use markdown code blocks with language names for code
- Don't repeat the question in your response
- Be clear, helpful, concise, and friendly`;

    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);

    history.push({ role: 'user', content: userMessage });
    if (history.length > MAX_HISTORY_LENGTH) history.splice(0, history.length - MAX_HISTORY_LENGTH);

    const completion = await groqClient.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens:  1500,
        temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');

    history.push({ role: 'assistant', content: text });
    return text;
}

// ─── AI Response Handler ──────────────────────────────────────────────────────
async function handleAIResponse(userId, question, targetChannel, originalMessage = null) {
    let typingInterval = null;

    try {
        await targetChannel.sendTyping().catch(() => {});
        typingInterval = setInterval(() => targetChannel.sendTyping().catch(() => {}), 5000);

        if (originalMessage) await originalMessage.react('⏳').catch(() => {});

        const aiResponse = await queryGroq(userId, question);

        clearInterval(typingInterval);
        typingInterval = null;

        if (originalMessage) {
            await originalMessage.reactions.cache.get('⏳')?.remove().catch(() => {});
            await originalMessage.react('✅').catch(() => {});
        }

        const chunks = splitMessage(aiResponse, 1900);
        for (const chunk of chunks) await targetChannel.send(chunk);

    } catch (err) {
        if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }

        if (originalMessage) {
            await originalMessage.reactions.cache.get('⏳')?.remove().catch(() => {});
            await originalMessage.react('❌').catch(() => {});
        }

        let errMsg = '❌ عذراً، حدث خطأ. حاول مجدداً بعد قليل.';
        if (err?.status === 429 || err?.message?.includes('rate'))         errMsg = '⏳ الخادم مشغول حالياً، انتظر ثوانٍ وحاول مجدداً.';
        if (err?.message?.includes('timeout') || err?.code === 'ETIMEDOUT') errMsg = '⌛ انتهت مهلة الاتصال. حاول مجدداً.';

        await targetChannel.send(errMsg).catch(() => {});
        console.error('[GROQ ERROR]', err.message);
    }
}

// ─── Anti-Spam Handler ────────────────────────────────────────────────────────
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
            idsToDelete.map((id) =>
                channel.messages.fetch(id).then((m) => m.delete()).catch(() => {})
            )
        );

        try {
            await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
            await sendTempWarning(channel, `🔇 **${author.username}** تم كتمه 5 دقائق بسبب السبام.`, 8000);
        } catch (err) {
            console.error('[AUTOMOD] Timeout failed:', err.message);
        }
        return true;
    }
    return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
module.exports = {
    name: 'messageCreate',
    once: false,

    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild)     return;

        const { author, member, channel, content } = message;

        // ── الوحدات الخارجية ──────────────────────────────────────────────────
        try {
            if (typeof handleCodeRun      === 'function') await handleCodeRun(message);
            if (typeof handleChillMessage === 'function') await handleChillMessage(message);
        } catch (err) {
            console.error('[MODULE ERROR]', err.message);
        }

        // ── إحصاءات يومية ────────────────────────────────────────────────────
        try {
            const { trackMessage } = require('../utils/dailyReport');
            if (typeof trackMessage === 'function') trackMessage(message.guild.id, author.id);
        } catch {}

        // ── Anti-Link ─────────────────────────────────────────────────────────
        if (/https?:\/\//i.test(content) && !isStaff(member)) {
            try { await message.delete(); } catch {}
            await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة هنا.`, 6000);
            return;
        }

        // ── Anti-Spam ─────────────────────────────────────────────────────────
        if (!isStaff(member)) {
            const isSpam = await handleAntiSpam(message);
            if (isSpam) return;
        }

        // ── ردود داخل ثريد AI ─────────────────────────────────────────────────
        if (channel.isThread()) {
            // تجاهل أي ثريد ليس خاصاً بهذا المستخدم
            if (userThreads.get(author.id) !== channel.id) return;

            const userQuestion = content.trim();
            if (!userQuestion) return;

            // أوامر خاصة
            if (userQuestion === '!clear' || userQuestion === '!مسح') {
                conversationHistory.delete(author.id);
                await channel.send('🧹 تم مسح تاريخ محادثتك. نبدأ من جديد!');
                resetThreadTimer(channel, author.id);
                return;
            }

            if (userQuestion === '!تاريخ' || userQuestion === '!history') {
                const count = conversationHistory.get(author.id)?.length ?? 0;
                await channel.send(`📊 عدد الرسائل في محادثتك الحالية: **${count}** / ${MAX_HISTORY_LENGTH}`);
                resetThreadTimer(channel, author.id);
                return;
            }

            // كولداون الثريد (مستقل عن ask-flux)
            const lastUsed = threadCooldowns.get(author.id) || 0;
            const now      = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) {
                const remaining = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                await sendTempWarning(channel, `⏳ انتظر **${remaining}** ثانية.`, 3000);
                return;
            }

            threadCooldowns.set(author.id, now);
            resetThreadTimer(channel, author.id);
            await handleAIResponse(author.id, userQuestion, channel, message);
            return;
        }

        // ── قناة ask-flux (إنشاء ثريد + رد أول) ─────────────────────────────
        if (channel.name === ASK_FLUX_CHANNEL_NAME) {
            const userQuestion = content.trim();
            if (!userQuestion) return;

            // كولداون ask-flux (مستقل عن الثريد)
            const lastUsed = askFluxCooldowns.get(author.id) || 0;
            const now      = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) {
                const remaining = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                await sendTempWarning(channel, `⏳ **${author.username}**، انتظر **${remaining}** ثانية.`, 3000);
                return;
            }
            askFluxCooldowns.set(author.id, now);

            let thread;
            try {
                thread = await getOrCreateThread(message);
            } catch (err) {
                console.error('[THREAD CREATION FAILED]', err.message);
                await sendTempWarning(
                    channel,
                    `❌ **${author.username}**، فشل إنشاء الثريد. تأكد أن البوت لديه صلاحية \`Create Threads\`.`,
                    8000
                );
                return;
            }

            resetThreadTimer(thread, author.id);
            await message.react('💬').catch(() => {});

            // ✅ الرد الأول في الثريد مباشرة من ask-flux
            await handleAIResponse(author.id, userQuestion, thread, null);
        }
    },
};
