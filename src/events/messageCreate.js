// ─── events/messageCreate.js ─────────────────────────────────────────────────

// 1. تحميل الإعدادات من ملف .env (أول سطر دائماً)
require('dotenv').config();
const Groq = require("groq-sdk");

const { handleCodeRun }       = require('./codeRunner');
const { handleGamingMessage } = require('./gamingCorner');
const { trackMessage }        = require('../utils/dailyReport');

// 2. استدعاء مكتبة Groq وتجهيز المفتاح من المتغيرات المخفية
// الكود رح يدور على المفتاح بالكابيتال، وإذا ما لقاه رح يدور بالسمول
const rawKey = process.env.GROQ_API_KEY || process.env.Groq_API_KEY || "";
const groqApiKey = rawKey.trim();
// عشان تتأكد بعينك إن البوت شاف المفتاح (رح يطبع أول 4 أحرف بس عشان الأمان)
console.log("🔑 مفتاح Groq المقروء يبدأ بـ:", groqApiKey ? groqApiKey.substring(0, 5) + "..." : "غير موجود! ❌");

const client = new Groq({ apiKey: groqApiKey, timeout: 30000 });

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME  = 'ask-flux';
const CODE_RUN_CHANNEL_NAME  = 'code-run';
const STAFF_ROLE_NAME        = 'Staff';
const SPAM_THRESHOLD         = 5;
const SPAM_WINDOW_MS         = 3000;
const TIMEOUT_DURATION_MS    = 5 * 60 * 1000;
const AI_COOLDOWN_MS         = 3000;
const THREAD_INACTIVITY_MS   = 2 * 60 * 1000;
const CACHE_CLEANUP_MS       = 10 * 60 * 1000;
const MAX_HISTORY_LENGTH     = 10;

// ─── Stores ───────────────────────────────────────────────────────────────────
const spamMap             = new Map();
const conversationHistory = new Map();
const askFluxCooldowns    = new Map();
const threadCooldowns     = new Map();
const userThreads         = new Map();
const threadTimers        = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, ts]   of askFluxCooldowns.entries()) if (now - ts   > CACHE_CLEANUP_MS)    askFluxCooldowns.delete(k);
    for (const [k, ts]   of threadCooldowns.entries())  if (now - ts   > CACHE_CLEANUP_MS)    threadCooldowns.delete(k);
    for (const [k, data] of spamMap.entries())          if ((now - (data.timestamps.at(-1) ?? 0)) > SPAM_WINDOW_MS * 10) spamMap.delete(k);
}, CACHE_CLEANUP_MS);

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
    if (!text) return 'arabic';
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicChars / text.length > 0.3 ? 'arabic' : 'english';
}

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
        conversationHistory.delete(userId);
        threadCooldowns.delete(userId);
    }, THREAD_INACTIVITY_MS);
    threadTimers.set(thread.id, timer);
}

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
        conversationHistory.delete(author.id);
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
        `> 🖼️ **أرسل أي صورة (كود أو ميمز) وسأقوم بتحليلها فوراً!**\n` +
        `> ⏰ يُحذف الثريد تلقائياً بعد دقيقتين من عدم النشاط.`
    );

    return thread;
}

// ─── دالة queryGroq المُصححة ──────────────────────────────────────────────────
async function queryGroq(userId, userMessage, imageUrls = []) {
    // ✅ نستخدم الـ client المعرف في الأعلى — لا نُنشئ instance جديد في كل طلب
    const lang   = detectLanguage(userMessage || 'صورة');

    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);

    let apiMessages = [];

    // التبديل الصارم للموديل (تحديث 2026)
    const modelToUse = (imageUrls && imageUrls.length > 0) 
        ? 'meta-llama/llama-4-scout-17b-16e-instruct' 
        : 'llama-3.3-70b-versatile';

    console.log("🔍 [DEBUG] الموديل المطلوب في MessageCreate:", modelToUse);

    if (imageUrls && imageUrls.length > 0) {
        const contentArray = [];
        contentArray.push({ type: 'text', text: (userMessage || 'اشرح لي محتوى هذه الصورة بدقة.') });

        for (const url of imageUrls) {
            try {
                const res = await fetch(url);
                const buffer = Buffer.from(await res.arrayBuffer());
                const mime = res.headers.get('content-type') || 'image/png';
                contentArray.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } });
            } catch (e) { console.error('[VISION FETCH ERROR]', e); }
        }
        apiMessages.push({ role: 'user', content: contentArray });
    } else {
        const systemPrompt = lang === 'arabic'
            ? `أنت FLUX Bot، مساعد ذكي في سيرفر FLUX IO. رد بعربية فصحى سهلة، استخدم code blocks للبرمجة.`
            : `You are FLUX Bot. Respond in English only. Use markdown for code blocks.`;
        
        apiMessages.push({ role: 'system', content: systemPrompt });
        apiMessages = apiMessages.concat(history);
        apiMessages.push({ role: 'user', content: userMessage });
    }

    const completion = await client.chat.completions.create({
        model:       modelToUse,
        messages:    apiMessages,
        max_tokens:  1500,
        temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');

    history.push({ role: 'user', content: userMessage || '[صورة]' });
    history.push({ role: 'assistant', content: text });
    if (history.length > MAX_HISTORY_LENGTH) history.splice(0, history.length - MAX_HISTORY_LENGTH);

    return text;
}

// ─── AI Response Handler ──────────────────────────────────────────────────────
async function handleAIResponse(userId, question, targetChannel, originalMessage = null, imageUrls = []) {
    let typingInterval = null;
    try {
        await targetChannel.sendTyping().catch(() => {});
        typingInterval = setInterval(() => targetChannel.sendTyping().catch(() => {}), 5000);
        if (originalMessage) await originalMessage.react('⏳').catch(() => {});

        const aiResponse = await queryGroq(userId, question, imageUrls);

        clearInterval(typingInterval); typingInterval = null;
        if (originalMessage) {
            await originalMessage.reactions.cache.get('⏳')?.remove().catch(() => {});
            await originalMessage.react('✅').catch(() => {});
        }
        for (const chunk of splitMessage(aiResponse, 1900)) await targetChannel.send(chunk);

    } catch (err) {
        if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
        if (originalMessage) {
            await originalMessage.reactions.cache.get('⏳')?.remove().catch(() => {});
            await originalMessage.react('❌').catch(() => {});
        }
        let errMsg = '❌ عذراً، حدث خطأ. حاول مجدداً.';
        if (err?.status === 400 && imageUrls.length > 0) errMsg = '⚠️ حجم الصورة كبير أو التنسيق غير مدعوم، جرب صورة ثانية!';
        else if (err?.status === 429)                    errMsg = '⏳ الخادم مشغول، انتظر ثوانٍ وحاول مجدداً.';
        else if (err?.message?.includes('timeout'))      errMsg = '⌛ انتهت مهلة الاتصال. حاول مجدداً.';
        await targetChannel.send(errMsg).catch(() => {});
        console.error('[GROQ ERROR]', err?.status, err?.message);
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
        } catch (err) {}
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

        try {
            if (typeof handleCodeRun       === 'function') await handleCodeRun(message);
            if (typeof handleGamingMessage === 'function') await handleGamingMessage(message);
        } catch (err) {}

        try {
            if (typeof trackMessage === 'function') trackMessage(message.guild.id, author.id);
        } catch {}

        const isCodeRunChannel = channel.name?.toLowerCase().includes(CODE_RUN_CHANNEL_NAME);

        // ── فلترة الروابط (غير Staff وخارج code-run) ──────────────────────────
        if (/https?:\/\//i.test(content) && !isStaff(member) && !isCodeRunChannel) {
            try {
                await message.delete();
                const warn = await channel.send(
                    `⛔ ${author} الروابط ممنوعة هنا. استخدم التذاكر إذا أردت مشاركة رابط.`
                );
                setTimeout(() => warn.delete().catch(() => {}), 6000);
                console.log(`[LINK-FILTER] حُذف رابط من ${author.tag} في #${channel.name}`);
            } catch (err) {
                console.error('[LINK-FILTER] فشل الحذف:', err.message);
            }
            return;
        }

        if (!isStaff(member) && await handleAntiSpam(message)) return;

        // 1. استخراج الصور
        let imageUrls = [];
        message.attachments.forEach(att => {
            if (att.url && (att.url.match(/\.(png|jpg|jpeg|gif|webp)/i) || (att.contentType && att.contentType.includes('image')))) {
                imageUrls.push(att.url);
            }
        });

        // ════════════════════════════════════════════════════════════════════
        // ── ثريد AI (داخل الثريد)
        // ════════════════════════════════════════════════════════════════════
        if (channel.isThread()) {
            if (userThreads.get(author.id) !== channel.id) return;

            const q = content.trim();
            if (!q && imageUrls.length === 0) return;

            if (q === '!clear' || q === '!مسح') {
                conversationHistory.delete(author.id);
                await channel.send('🧹 تم مسح تاريخ محادثتك. نبدأ من جديد!');
                resetThreadTimer(channel, author.id);
                return;
            }
            if (q === '!تاريخ' || q === '!history') {
                const count = conversationHistory.get(author.id)?.length ?? 0;
                await channel.send(`📊 **${count}** / ${MAX_HISTORY_LENGTH} رسائل في المحادثة الحالية.`);
                resetThreadTimer(channel, author.id);
                return;
            }

            const lastUsed = threadCooldowns.get(author.id) || 0;
            const now      = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) {
                const rem = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                await sendTempWarning(channel, `⏳ انتظر **${rem}** ثانية.`, 3000);
                return;
            }
            threadCooldowns.set(author.id, now);
            resetThreadTimer(channel, author.id);
            await handleAIResponse(author.id, q, channel, message, imageUrls);
            return;
        }

        // ════════════════════════════════════════════════════════════════════
        // ── قناة ask-flux
        // ════════════════════════════════════════════════════════════════════
        if (channel.name?.toLowerCase().trim() === ASK_FLUX_CHANNEL_NAME) {
            const q = content.trim();
            if (!q && imageUrls.length === 0) return;

            const lastUsed = askFluxCooldowns.get(author.id) || 0;
            const now = Date.now();
            if (now - lastUsed < AI_COOLDOWN_MS) {
                const rem = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
                await sendTempWarning(channel, `⏳ **${author.username}**، انتظر **${rem}** ثانية.`, 3000);
                return;
            }
            askFluxCooldowns.set(author.id, now);

            let targetChannel = channel;
            let usingThread = false;

            try {
                const thread = await getOrCreateThread(message);
                targetChannel = thread;
                usingThread = true;
                resetThreadTimer(thread, author.id);
                await message.react('💬').catch(() => {});
            } catch (threadErr) {
                console.error("خطأ في إنشاء الثريد:", threadErr.message);
            }

            await handleAIResponse(author.id, q, targetChannel, usingThread ? null : message, imageUrls);
        }
    },
};