// ─── events/messageCreate.js ─────────────────────────────────────────────────
// ⚠️ chillChat.js أُزيل من هنا لأنه يعمل كـ event مستقل تلقائياً
// ══════════════════════════════════════════════════════════════════════════════

const { handleCodeRun }       = require('./codeRunner');
const { handleGamingMessage } = require('./gamingCorner');
const { trackMessage }        = require('../utils/dailyReport');
const Groq = require('groq-sdk');

// ─── Key ──────────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.GROQ_KEY || Buffer.from(
    'Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=',
    'base64'
).toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME  = 'ask-flux';
const CODE_RUN_CHANNEL_NAME  = 'code-run';   // ← مستثنى من anti-link
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

// ─── تنظيف دوري لمنع تسرب الذاكرة ───────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const [k, ts]   of askFluxCooldowns.entries()) if (now - ts   > CACHE_CLEANUP_MS)    askFluxCooldowns.delete(k);
    for (const [k, ts]   of threadCooldowns.entries())  if (now - ts   > CACHE_CLEANUP_MS)    threadCooldowns.delete(k);
    for (const [k, data] of spamMap.entries())          if ((now - (data.timestamps.at(-1) ?? 0)) > SPAM_WINDOW_MS * 10) spamMap.delete(k);
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
            await thread.send('⏰ تم إغلاق هذا الثريد تلقائياً بسبب عدم النشاط.');
            await new Promise((r) => setTimeout(r, 2000));
            await thread.delete('Inactivity timeout').catch(() => {});
        } catch {}
        userThreads.delete(userId);
        threadTimers.delete(thread.id);
        conversationHistory.delete(userId);
        threadCooldowns.delete(userId);
        console.log(`[THREAD] Auto-deleted for user ${userId}`);
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
        `> 🧹 \`!مسح\` لمسح تاريخ المحادثة.\n` +
        `> 📊 \`!تاريخ\` لعرض عدد الرسائل الحالية.\n` +
        `> ⏰ يُحذف الثريد تلقائياً بعد دقيقتين من عدم النشاط.`
    );

    return thread;
}

// ─── Groq Query ───────────────────────────────────────────────────────────────
// ─── Groq Query (Vision Supported) ───────────────────────────────────────────────
async function queryGroq(userId, userMessage, imageUrls = []) {
    const client = new Groq({ apiKey: GROQ_KEY, timeout: 20000 });
    const lang   = detectLanguage(userMessage || 'صورة');

    const systemPrompt = lang === 'arabic'
        ? `أنت FLUX Bot، مساعد ذكي واحترافي في سيرفر FLUX IO على Discord.
قواعد:
- رد بالعربية الفصحى السهلة دائماً
- إذا أرسل المستخدم صورة، حللها بدقة (إذا كانت كود برمجي، اكتشف الأخطاء واشرحها).
- استخدم code blocks مع اسم اللغة
- لا تكرر السؤال في ردك
- كن واضحاً، مفيداً، ودوداً، ومختصراً`
        : `You are FLUX Bot, a smart assistant in FLUX IO Discord server.
Rules:
- Respond in English only
- If there is an image, analyze it perfectly (explain code or images).
- Use markdown code blocks with language names
- Be clear, helpful, concise, friendly`;

    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);

    // تجهيز مصفوفة الرسائل للـ API
    let apiMessages = [{ role: 'system', content: systemPrompt }, ...history];

    if (imageUrls && imageUrls.length > 0) {
        const contentArray = [];
        contentArray.push({ type: 'text', text: userMessage || 'اشرح لي محتوى هذه الصورة بدقة.' });
        for (const url of imageUrls) {
            contentArray.push({ type: 'image_url', image_url: { url: url } });
        }
        apiMessages.push({ role: 'user', content: contentArray });
    } else {
        apiMessages.push({ role: 'user', content: userMessage });
    }

    // التبديل التلقائي لموديل البصر
    const modelToUse = (imageUrls && imageUrls.length > 0) ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';

    const completion = await client.chat.completions.create({
        model:       modelToUse,
        messages:    apiMessages,
        max_tokens:  1500,
        temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');

    // حفظ النص فقط في الذاكرة لمنع الانهيار
    history.push({ role: 'user', content: userMessage || '[تم إرسال صورة كود/ميمز]' });
    history.push({ role: 'assistant', content: text });
    if (history.length > MAX_HISTORY_LENGTH) history.splice(0, history.length - MAX_HISTORY_LENGTH);

    return text;
}
// ─── AI Response Handler ──────────────────────────────────────────────────────
// ─── AI Response Handler ──────────────────────────────────────────────────────
async function handleAIResponse(userId, question, targetChannel, originalMessage = null, imageUrls = []) {
    let typingInterval = null;
    try {
        await targetChannel.sendTyping().catch(() => {});
        typingInterval = setInterval(() => targetChannel.sendTyping().catch(() => {}), 5000);
        if (originalMessage) await originalMessage.react('⏳').catch(() => {});

        // تمرير الصور هنا
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
        if (err?.status === 429 || err?.message?.includes('rate'))          errMsg = '⏳ الخادم مشغول، انتظر ثوانٍ وحاول مجدداً.';
        if (err?.message?.includes('timeout') || err?.code === 'ETIMEDOUT') errMsg = '⌛ انتهت مهلة الاتصال. حاول مجدداً.';
        if (err?.status === 401)                                             errMsg = '🔑 خطأ في مفتاح Groq API. تواصل مع المسؤول.';
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
        if (message.author.bot) return;
        if (!message.guild)     return;

        const { author, member, channel, content } = message;

        // ── الوحدات الخارجية ──────────────────────────────────────────────────
        // chillChat.js يعمل كـ event مستقل — لا تستدعيه هنا
        try {
            if (typeof handleCodeRun       === 'function') await handleCodeRun(message);
            if (typeof handleGamingMessage === 'function') await handleGamingMessage(message);
        } catch (err) { console.error('[MODULE ERROR]', err.message); }

        // ── إحصاءات يومية ────────────────────────────────────────────────────
        try {
            if (typeof trackMessage === 'function') trackMessage(message.guild.id, author.id);
        } catch {}

        // ── Anti-Link ─────────────────────────────────────────────────────────
        // ✅ إصلاح: code-run مستثنى لأن الكود قد يحتوي على روابط
        const isCodeRunChannel = channel.name?.toLowerCase().includes(CODE_RUN_CHANNEL_NAME);
        if (/https?:\/\//i.test(content) && !isStaff(member) && !isCodeRunChannel) {
            try { await message.delete(); } catch {}
            await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة هنا.`, 6000);
            return;
        }

        // ── Anti-Spam ─────────────────────────────────────────────────────────
        if (!isStaff(member) && await handleAntiSpam(message)) return;

        // ════════════════════════════════════════════════════════════════════
        // ── ثريد AI (رسائل داخل الثريد الخاص بالمستخدم) ──────────────────
        // ════════════════════════════════════════════════════════════════════
        // ════════════════════════════════════════════════════════════════════
        // ── ثريد AI (رسائل داخل الثريد الخاص بالمستخدم) ──────────────────
        // ════════════════════════════════════════════════════════════════════
        if (channel.isThread()) {
            if (userThreads.get(author.id) !== channel.id) return;

            const q = content.trim();
            // التقاط الصور
            const imageUrls = message.attachments.filter(a => a.contentType?.startsWith('image/')).map(a => a.url);

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
        // ── قناة ask-flux ─────────────────────────────────────────────────
        // ════════════════════════════════════════════════════════════════════
        if (channel.name?.toLowerCase().trim() !== ASK_FLUX_CHANNEL_NAME) return;

        const q = content.trim();
        // التقاط الصور من المرفقات
        const imageUrls = message.attachments.filter(a => a.contentType?.startsWith('image/')).map(a => a.url);

        // تعديل الشرط: إذا ما في نص ولا صورة، تجاهل
        if (!q && imageUrls.length === 0) return;

        console.log(`[ASK-FLUX] ${author.tag}: ${q.slice(0, 80) || '[صورة]'}`);

        const lastUsed = askFluxCooldowns.get(author.id) || 0;
        const now      = Date.now();
        if (now - lastUsed < AI_COOLDOWN_MS) {
            const rem = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
            await sendTempWarning(channel, `⏳ **${author.username}**، انتظر **${rem}** ثانية.`, 3000);
            return;
        }
        askFluxCooldowns.set(author.id, now);

        let targetChannel = channel;
        let usingThread   = false;

        try {
            const thread  = await getOrCreateThread(message);
            targetChannel = thread;
            usingThread   = true;
            resetThreadTimer(thread, author.id);
            await message.react('💬').catch(() => {});
            console.log(`[ASK-FLUX] Thread ready: ${thread.id}`);
        } catch (threadErr) {
            console.error('[ASK-FLUX] Thread creation failed:', threadErr.message);
            await channel.send(`⚠️ ما قدرت أنشئ ثريد، سأرد هنا مباشرة ${author}.`).catch(() => {});
        }

        // تمرير الصور للـ AI
        await handleAIResponse(author.id, q, targetChannel, usingThread ? null : message, imageUrls);
    },
};