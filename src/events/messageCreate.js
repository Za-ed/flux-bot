const Groq = require('groq-sdk');

// ─── Key ──────────────────────────────────────────────────────────────────────
const GROQ_KEY = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME = 'Staff';
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3000;
const TIMEOUT_DURATION_MS = 5 * 60 * 1000;
const AI_COOLDOWN_MS = 3000;
const THREAD_INACTIVITY_MS = 2 * 60 * 1000; // دقيقتين

// ─── Stores ───────────────────────────────────────────────────────────────────
const spamMap = new Map();
const conversationHistory = new Map();
const userCooldowns = new Map();
const userThreads = new Map();      // userId -> threadId
const threadTimers = new Map();     // threadId -> timeoutRef

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let current = '';
  const lines = text.split('\n');
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
  return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME);
}

async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
  try {
    const msg = await channel.send(content);
    setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
  } catch { }
}

function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'arabic' : 'english';
}

// ─── إدارة تايمر الثريد ────────────────────────────────────────────────────────
function resetThreadTimer(thread, userId) {
  if (threadTimers.has(thread.id)) {
    clearTimeout(threadTimers.get(thread.id));
  }

  const timer = setTimeout(async () => {
    try {
      await thread.send('⏰ تم إغلاق هذا الثريد تلقائياً بسبب عدم النشاط لمدة دقيقتين.');
      await new Promise((r) => setTimeout(r, 2000));
      await thread.delete('Inactivity timeout').catch(() => {});
    } catch { }
    userThreads.delete(userId);
    threadTimers.delete(thread.id);
    conversationHistory.delete(userId);
    console.log(`[THREAD] Auto-deleted thread for user ${userId}`);
  }, THREAD_INACTIVITY_MS);

  threadTimers.set(thread.id, timer);
}

// ─── جلب أو إنشاء ثريد لليوزر ────────────────────────────────────────────────
async function getOrCreateThread(message) {
  const { author, guild } = message;

  if (userThreads.has(author.id)) {
    const existingThreadId = userThreads.get(author.id);
    const existingThread = guild.channels.cache.get(existingThreadId);
    if (existingThread && !existingThread.archived && !existingThread.deleted) {
      return existingThread;
    }
    userThreads.delete(author.id);
    conversationHistory.delete(author.id);
  }

  const thread = await message.startThread({
    name: `💬 ${author.username} — FLUX AI`,
    autoArchiveDuration: 60,
    reason: `AI thread for ${author.tag}`,
  });

  userThreads.set(author.id, thread.id);

  await thread.send(
    `👋 **أهلاً ${author}!**\n` +
    `هذا ثريدك الخاص مع **FLUX AI**.\n\n` +
    `> 💡 اسألني أي شيء — برمجة، معرفة عامة، أو محادثة عادية.\n` +
    `> 🧹 اكتب \`!مسح\` لمسح تاريخ المحادثة.\n` +
    `> ⏰ سيتم حذف الثريد تلقائياً بعد **دقيقتين** من عدم النشاط.`
  );

  console.log(`[THREAD] Created thread for ${author.tag}: ${thread.name}`);
  return thread;
}

// ─── Query Groq ───────────────────────────────────────────────────────────────
async function queryGroq(userId, userMessage) {
  const client = new Groq({ apiKey: GROQ_KEY });
  const lang = detectLanguage(userMessage);

  const systemPrompt = lang === 'arabic'
    ? `أنت FLUX Bot، مساعد ذكي واحترافي في سيرفر FLUX IO على Discord.
قواعد صارمة يجب اتباعها:
- يجب أن ترد دائماً باللغة العربية الفصحى السهلة فقط بدون أي استثناء
- ممنوع منعاً باتاً الكتابة بأي لغة أخرى غير العربية حتى لو كان السؤال تقنياً
- المصطلحات التقنية مثل (function, variable, array) اكتبها بالإنجليزي فقط داخل backticks
- عند كتابة كود استخدم markdown code blocks مع اسم اللغة
- أسلوبك: واضح، مفيد، ودود، ومفصّل عند الحاجة
- لا تكتب أي كلمة صينية أو يابانية أو كورية أبداً`
    : `You are FLUX Bot, a smart and professional assistant in the FLUX IO Discord server.
Strict rules:
- Always respond in English only, no exceptions
- Never write in Chinese, Japanese, Korean, or any other language
- Format all code using markdown code blocks with the language name
- Be clear, helpful, friendly, and detailed when needed`;

  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  const history = conversationHistory.get(userId);
  history.push({ role: 'user', content: userMessage });
  if (history.length > 10) history.splice(0, history.length - 10);

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    max_tokens: 1500,
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
    if (!message.guild) return;

    const { author, member, channel, content } = message;

    // ── معالجة الرسائل داخل ثريدات AI ────────────────────────────────────────
    if (message.channel.isThread()) {
      const thread = message.channel;

      if (userThreads.get(author.id) === thread.id) {
        const userQuestion = content.trim();

        if (userQuestion === '!clear' || userQuestion === '!مسح') {
          conversationHistory.delete(author.id);
          await thread.send('🧹 تم مسح تاريخ محادثتك. نبدأ من جديد!');
          resetThreadTimer(thread, author.id);
          return;
        }

        const lastUsed = userCooldowns.get(author.id) || 0;
        const now = Date.now();
        if (now - lastUsed < AI_COOLDOWN_MS) {
          const remaining = ((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
          await sendTempWarning(thread, `⏳ انتظر **${remaining}** ثانية.`, 3000);
          return;
        }
        userCooldowns.set(author.id, now);

        resetThreadTimer(thread, author.id);

        console.log(`[AI] Thread question from ${author.tag}: ${userQuestion.slice(0, 60)}`);

        const typingInterval = setInterval(() => thread.sendTyping().catch(() => {}), 5000);
        await thread.sendTyping().catch(() => {});
        await message.react('⏳').catch(() => {});

        try {
          const aiResponse = await queryGroq(author.id, userQuestion);
          clearInterval(typingInterval);
          await message.reactions.cache.get('⏳')?.remove().catch(() => {});
          await message.react('✅').catch(() => {});
          const chunks = splitMessage(aiResponse, 1900);
          for (const chunk of chunks) await thread.send(chunk).catch(() => {});
          console.log(`[AI] ✅ Replied to ${author.tag} (${chunks.length} chunk(s))`);
        } catch (err) {
          clearInterval(typingInterval);
          console.error('[AI] Error:', err.message);
          await message.reactions.cache.get('⏳')?.remove().catch(() => {});
          await message.react('❌').catch(() => {});
          await thread.send('❌ عذراً، حدث خطأ. حاول مجدداً بعد قليل.');
        }
      }
      return;
    }

    // ── ANTI-LINK ─────────────────────────────────────────────────────────────
    const containsLink = /https?:\/\//i.test(content);
    if (containsLink && !isStaff(member)) {
      try { await message.delete(); } catch { }
      await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة هنا. فقط الإدارة تقدر تشارك روابط.`, 6000);
      console.log(`[AUTOMOD] Link blocked from ${author.tag}`);
      return;
    }

    // ── ANTI-SPAM ─────────────────────────────────────────────────────────────
    if (!isStaff(member)) {
      const now = Date.now();
      const userId = author.id;
      if (!spamMap.has(userId)) spamMap.set(userId, { timestamps: [], messageIds: [] });
      const userData = spamMap.get(userId);
      userData.timestamps.push(now);
      userData.messageIds.push(message.id);
      while (userData.timestamps.length > 0 && now - userData.timestamps[0] > SPAM_WINDOW_MS) {
        userData.timestamps.shift();
        userData.messageIds.shift();
      }
      if (userData.timestamps.length >= SPAM_THRESHOLD) {
        const idsToDelete = [...userData.messageIds];
        spamMap.delete(userId);
        for (const msgId of idsToDelete) {
          await channel.messages.fetch(msgId).then((m) => m.delete().catch(() => {})).catch(() => {});
        }
        try {
          await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
          await sendTempWarning(channel, `🔇 **${author.username}** تم كتمه لمدة 5 دقائق بسبب السبام.`, 8000);
          console.log(`[AUTOMOD] Timed out ${author.tag}`);
        } catch (err) {
          console.error('[AUTOMOD] Timeout failed:', err.message);
        }
        return;
      }
    }

    // ── AI ASSISTANT — قناة ask-flux ──────────────────────────────────────────
    if (channel.name === ASK_FLUX_CHANNEL_NAME) {
      const userQuestion = content.trim();
      if (!userQuestion || userQuestion.length < 1) return;

      const lastUsed = userCooldowns.get(author.id) || 0;
      const now = Date.now();
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

        console.log(`[AI] Question from ${author.tag}: ${userQuestion.slice(0, 60)}`);

        const typingInterval = setInterval(() => thread.sendTyping().catch(() => {}), 5000);
        await thread.sendTyping().catch(() => {});

        try {
          const aiResponse = await queryGroq(author.id, userQuestion);
          clearInterval(typingInterval);
          const chunks = splitMessage(aiResponse, 1900);
          for (const chunk of chunks) await thread.send(chunk).catch(() => {});
          console.log(`[AI] ✅ Replied to ${author.tag} in thread`);
        } catch (err) {
          clearInterval(typingInterval);
          console.error('[AI] Error:', err.message);
          await thread.send('❌ عذراً، حدث خطأ. حاول مجدداً بعد قليل.');
        }
      } catch (err) {
        console.error('[THREAD] Failed to create thread:', err.message);
        await sendTempWarning(channel, `❌ **${author.username}**، حدث خطأ في إنشاء الثريد.`, 5000);
      }
    }
  },
};