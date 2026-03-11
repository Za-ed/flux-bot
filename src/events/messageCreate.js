const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME = 'Staff';
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3000;
const TIMEOUT_DURATION_MS = 5 * 60 * 1000;

// ─── In-Memory Spam Store ─────────────────────────────────────────────────────
const spamMap = new Map();

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Helper: Split long messages ─────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let current = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.length > maxLength) {
      if (current.length > 0) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }
    if ((current + '\n' + line).length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = current.length === 0 ? line : current + '\n' + line;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ─── Helper: Is Staff ─────────────────────────────────────────────────────────
function isStaff(member) {
  return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME);
}

// ─── Helper: Send Temp Warning ────────────────────────────────────────────────
async function sendTempWarning(channel, content, deleteAfterMs = 5000) {
  try {
    const msg = await channel.send(content);
    setTimeout(() => msg.delete().catch(() => {}), deleteAfterMs);
  } catch { }
}

// ─── Helper: Query Gemini ─────────────────────────────────────────────────────
async function queryGemini(userMessage) {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction:
        'You are FLUX Bot, an expert AI coding assistant in the FLUX • IO developer Discord server. ' +
        'Answer programming questions with precision and clarity. ' +
        'Always format code using markdown code blocks with the correct language (e.g. ```js, ```python). ' +
        'Be concise but thorough. Only answer questions related to software development and technology.',
    });

    const result = await model.generateContent(userMessage);
    const response = result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from Gemini');
    }

    return text;
  } catch (err) {
    console.error('[AI] Gemini error details:', err);
    throw err;
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────
module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const { author, member, channel, guild, content } = message;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — ANTI-LINK
    // ══════════════════════════════════════════════════════════════════════════
    const containsLink = /https?:\/\//i.test(content);

    if (containsLink && !isStaff(member)) {
      try { await message.delete(); } catch { }
      await sendTempWarning(
        channel,
        `⚠️ **${author.username}**، الروابط ممنوعة هنا. فقط الإدارة تقدر تشارك روابط.`,
        6000
      );
      console.log(`[AUTOMOD] Link blocked from ${author.tag} in #${channel.name}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — ANTI-SPAM
    // ══════════════════════════════════════════════════════════════════════════
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
        console.log(`[AUTOMOD] Spam from ${author.tag}`);
        const idsToDelete = [...userData.messageIds];
        spamMap.delete(userId);

        for (const msgId of idsToDelete) {
          await channel.messages.fetch(msgId).then((m) => m.delete().catch(() => {})).catch(() => {});
        }

        try {
          await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
          await sendTempWarning(
            channel,
            `🔇 **${author.username}** تم كتمه لمدة 5 دقائق بسبب السبام.`,
            8000
          );
        } catch (err) {
          console.error(`[AUTOMOD] Timeout failed:`, err.message);
        }
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — AI ASSISTANT
    // ══════════════════════════════════════════════════════════════════════════
    if (channel.name === ASK_FLUX_CHANNEL_NAME) {
      const userQuestion = content.trim();
      if (!userQuestion || userQuestion.length < 2) return;

      console.log(`[AI] Question from ${author.tag}: ${userQuestion.slice(0, 50)}...`);

      // Typing indicator
      await channel.sendTyping().catch(() => {});

      // Keep typing alive for long responses
      const typingInterval = setInterval(() => {
        channel.sendTyping().catch(() => {});
      }, 5000);

      try {
        const aiResponse = await queryGemini(userQuestion);
        clearInterval(typingInterval);

        const chunks = splitMessage(aiResponse, 1900);

        try {
          await message.reply(chunks[0]);
        } catch {
          await channel.send(chunks[0]).catch(() => {});
        }

        for (let i = 1; i < chunks.length; i++) {
          await channel.send(chunks[i]).catch(() => {});
        }

        console.log(`[AI] ✅ Replied to ${author.tag} (${chunks.length} chunk(s))`);

      } catch (err) {
        clearInterval(typingInterval);
        console.error('[AI] Final error:', err.message);

        // محاولة مع نموذج بديل
        try {
          console.log('[AI] Trying gemini-pro as fallback...');
          const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
          const result = await model.generateContent(userQuestion);
          const text = result.response.text();

          await message.reply(text.slice(0, 1900));
          console.log('[AI] ✅ Fallback worked with gemini-pro');
        } catch (fallbackErr) {
          console.error('[AI] Fallback also failed:', fallbackErr.message);
          await message.reply(
            '❌ عذراً، حدث خطأ في الاتصال بالذكاء الاصطناعي. حاول مجدداً بعد قليل.'
          );
        }
      }
    }
  },
};