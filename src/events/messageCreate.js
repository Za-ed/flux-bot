const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME = 'Staff';
const SPAM_THRESHOLD = 5;          // messages
const SPAM_WINDOW_MS = 3000;       // 3 seconds
const TIMEOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ─── In-Memory Stores ─────────────────────────────────────────────────────────
// spamMap: userId -> { count: Number, timestamps: Number[], messageIds: String[] }
const spamMap = new Map();

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Helper: Split long messages ─────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let current = '';

  // Try to split cleanly on newlines when possible
  const lines = text.split('\n');

  for (const line of lines) {
    // If a single line itself is too long, hard-split it
    if (line.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
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
  } catch {
    // Channel may be unavailable; fail silently
  }
}

// ─── Helper: Query Gemini ─────────────────────────────────────────────────────
async function queryGemini(userMessage) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const systemInstruction =
    'You are FLUX Bot, an expert AI coding assistant embedded in the FLUX • IO developer Discord server. ' +
    'You answer programming questions with precision, clarity, and depth. ' +
    'Always format code snippets using markdown code blocks with the correct language identifier (e.g. ```js, ```python). ' +
    'Be concise but thorough. If a question is ambiguous, ask for clarification. ' +
    'Do not answer questions unrelated to software development, programming, or technology.';

  const result = await model.generateContent([
    { text: systemInstruction },
    { text: userMessage },
  ]);

  const response = await result.response;
  return response.text();
}

// ─── Main Export ──────────────────────────────────────────────────────────────
module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message) {
    // Ignore bots and DMs globally
    if (message.author.bot) return;
    if (!message.guild) return;

    const { author, member, channel, guild, content } = message;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — ANTI-LINK MODERATION
    // ══════════════════════════════════════════════════════════════════════════
    const containsLink = /https?:\/\//i.test(content);

    if (containsLink && !isStaff(member)) {
      try {
        await message.delete();
      } catch {
        // Message may already be deleted
      }

      await sendTempWarning(
        channel,
        `⚠️ **${author.username}**, links are not permitted here. Only Staff members may share links.`,
        6000
      );

      console.log(`[AUTOMOD] Link blocked from ${author.tag} in #${channel.name}`);
      return; // Stop further processing for this message
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — ANTI-SPAM MODERATION
    // ══════════════════════════════════════════════════════════════════════════
    if (!isStaff(member)) {
      const now = Date.now();
      const userId = author.id;

      if (!spamMap.has(userId)) {
        spamMap.set(userId, { timestamps: [], messageIds: [] });
      }

      const userData = spamMap.get(userId);

      // Push current message data
      userData.timestamps.push(now);
      userData.messageIds.push(message.id);

      // Purge entries older than the spam window
      while (userData.timestamps.length > 0 && now - userData.timestamps[0] > SPAM_WINDOW_MS) {
        userData.timestamps.shift();
        userData.messageIds.shift();
      }

      if (userData.timestamps.length >= SPAM_THRESHOLD) {
        console.log(`[AUTOMOD] Spam detected from ${author.tag} — ${userData.timestamps.length} msgs in ${SPAM_WINDOW_MS}ms`);

        // Delete all tracked spam messages
        const idsToDelete = [...userData.messageIds];
        spamMap.delete(userId); // Reset immediately

        for (const msgId of idsToDelete) {
          await channel.messages.fetch(msgId).then((m) => m.delete().catch(() => {})).catch(() => {});
        }

        // Timeout the user (mute) for 5 minutes
        try {
          await member.timeout(TIMEOUT_DURATION_MS, 'Automatic spam detection by FLUX Bot.');
          await sendTempWarning(
            channel,
            `🔇 **${author.username}** has been **timed out for 5 minutes** for spamming. Cool it down.`,
            8000
          );
          console.log(`[AUTOMOD] Timed out ${author.tag} for ${TIMEOUT_DURATION_MS / 1000}s in ${guild.name}`);
        } catch (err) {
          console.error(`[AUTOMOD] Failed to timeout ${author.tag}:`, err.message);
          await sendTempWarning(
            channel,
            `⚠️ **${author.username}**, please stop spamming or you will be timed out.`,
            6000
          );
        }

        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — AI CODING ASSISTANT (ask-flux channel)
    // ══════════════════════════════════════════════════════════════════════════
    if (channel.name === ASK_FLUX_CHANNEL_NAME) {
      const userQuestion = content.trim();

      if (!userQuestion || userQuestion.length < 2) return;

      // Show typing indicator
      await channel.sendTyping().catch(() => {});

      let aiResponse;

      try {
        aiResponse = await queryGemini(userQuestion);
      } catch (err) {
        console.error('[AI] Gemini API error:', err.message);
        await message.reply(
          '❌ I encountered an error while contacting the AI service. Please try again in a moment.'
        );
        return;
      }

      if (!aiResponse || aiResponse.trim().length === 0) {
        await message.reply('🤖 The AI returned an empty response. Please rephrase your question.');
        return;
      }

      // Split response if it exceeds Discord's 2000-character limit
      const chunks = splitMessage(aiResponse, 1900);

      // Reply to the first chunk so the user gets a mention
      try {
        await message.reply(chunks[0]);
      } catch {
        await channel.send(chunks[0]).catch(() => {});
      }

      // Send subsequent chunks as follow-up messages (no reply ping)
      for (let i = 1; i < chunks.length; i++) {
        await channel.send(chunks[i]).catch((err) => {
          console.error(`[AI] Failed to send chunk ${i + 1}:`, err.message);
        });
      }

      console.log(`[AI] Responded to ${author.tag} in #${channel.name} (${chunks.length} chunk(s))`);
    }
  },
};