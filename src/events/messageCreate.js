const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const chillChat = require('./chillChat'); // ← نظام الـ chill

// ─── Key ──────────────────────────────────────────────────────────────────────
const GROQ_KEY = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const ASK_FLUX_CHANNEL_NAME = 'ask-flux';
const STAFF_ROLE_NAME = 'Staff';
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3000;
const TIMEOUT_DURATION_MS = 5 * 60 * 1000;
const AI_COOLDOWN_MS = 3000;
const THREAD_INACTIVITY_MS = 2 * 60 * 1000;

// ─── Persistent Storage ───────────────────────────────────────────────────────
const THREADS_FILE = path.join(__dirname, '..', 'data', 'threads.json');

function ensureDataDir() {
  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(THREADS_FILE)) fs.writeFileSync(THREADS_FILE, '{}', 'utf8');
}

function loadThreads() {
  try { ensureDataDir(); return JSON.parse(fs.readFileSync(THREADS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveThreads(data) {
  try { ensureDataDir(); fs.writeFileSync(THREADS_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (err) { console.error('[THREADS] Failed to save:', err.message); }
}

// ─── In-Memory Stores ─────────────────────────────────────────────────────────
const spamMap = new Map();
const conversationHistory = new Map();
const userCooldowns = new Map();
const threadTimers = new Map();
let persistedThreads = loadThreads();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (line.length > maxLength) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += maxLength) chunks.push(line.slice(i, i + maxLength));
      continue;
    }
    if ((current + '\n' + line).length > maxLength) { chunks.push(current); current = line; }
    else { current = current ? current + '\n' + line : line; }
  }
  if (current) chunks.push(current);
  return chunks;
}

function isStaff(member) {
  return member.roles.cache.some((r) => r.name === STAFF_ROLE_NAME);
}

async function sendTempWarning(channel, content, ms = 5000) {
  try { const m = await channel.send(content); setTimeout(() => m.delete().catch(() => {}), ms); } catch {}
}

function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'arabic' : 'english';
}

// ─── Thread Timer ─────────────────────────────────────────────────────────────
function resetThreadTimer(thread, userId) {
  if (threadTimers.has(thread.id)) clearTimeout(threadTimers.get(thread.id));
  const timer = setTimeout(async () => {
    try {
      await thread.send('⏰ تم إغلاق هذا الثريد تلقائياً بسبب عدم النشاط.');
      await new Promise((r) => setTimeout(r, 2000));
      await thread.delete('Inactivity').catch(() => {});
    } catch {}
    delete persistedThreads[userId];
    saveThreads(persistedThreads);
    threadTimers.delete(thread.id);
    conversationHistory.delete(userId);
  }, THREAD_INACTIVITY_MS);
  threadTimers.set(thread.id, timer);
}

// ─── Get or Create Thread ─────────────────────────────────────────────────────
async function getOrCreateThread(message) {
  const { author, guild } = message;
  if (persistedThreads[author.id]) {
    let t = guild.channels.cache.get(persistedThreads[author.id]);
    if (!t) { try { t = await guild.channels.fetch(persistedThreads[author.id]); } catch { t = null; } }
    if (t && !t.archived && !t.deleted) return t;
    delete persistedThreads[author.id];
    saveThreads(persistedThreads);
    conversationHistory.delete(author.id);
  }
  const thread = await message.startThread({
    name: `💬 ${author.username} — FLUX AI`,
    autoArchiveDuration: 60,
  });
  persistedThreads[author.id] = thread.id;
  saveThreads(persistedThreads);
  await thread.send(
    `👋 **أهلاً ${author}!**\n\n` +
    `> 💡 اسألني أي شيء.\n` +
    `> 🧹 اكتب \`!مسح\` لمسح تاريخ المحادثة.\n` +
    `> ⏰ يُحذف الثريد بعد **دقيقتين** من عدم النشاط.`
  );
  return thread;
}

// ─── Query Groq (ask-flux) ────────────────────────────────────────────────────
async function queryGroq(userId, userMessage) {
  const client = new Groq({ apiKey: GROQ_KEY });
  const lang = detectLanguage(userMessage);
  const systemPrompt = lang === 'arabic'
    ? `أنت FLUX Bot مساعد ذكي في سيرفر FLUX IO. رد بالعربية فقط، استخدم code blocks للكود، كن واضحاً ومفيداً.`
    : `You are FLUX Bot, a smart assistant in FLUX IO Discord server. Reply in English only, use code blocks for code, be clear and helpful.`;

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
  if (!text?.trim()) throw new Error('Empty response');
  history.push({ role: 'assistant', content: text });
  return text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message) {
    if (message.author.bot) return;
    const { trackMessage } = require('../utils/dailyReport');
           trackMessage(message.guild?.id, message.author.id);
    if (!message.guild) return;

    const { author, member, channel, content } = message;

    // ── 😎 CHILL — يرد كعضو عادي بشخصية ────────────────────────────────────
    if (channel.name.toLowerCase().includes('chill')) {
      await chillChat.handleChillMessage(message);
      return;
    }

    // ── ثريدات AI ─────────────────────────────────────────────────────────────
    if (message.channel.isThread()) {
      const thread = message.channel;
      if (persistedThreads[author.id] === thread.id) {
        const userQuestion = content.trim();
        if (userQuestion === '!clear' || userQuestion === '!مسح') {
          conversationHistory.delete(author.id);
          await thread.send('🧹 تم مسح تاريخ المحادثة!');
          resetThreadTimer(thread, author.id);
          return;
        }
        const lastUsed = userCooldowns.get(author.id) || 0;
        const now = Date.now();
        if (now - lastUsed < AI_COOLDOWN_MS) {
          await sendTempWarning(thread, `⏳ انتظر **${((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1)}** ثانية.`, 3000);
          return;
        }
        userCooldowns.set(author.id, now);
        resetThreadTimer(thread, author.id);
        const ti = setInterval(() => thread.sendTyping().catch(() => {}), 5000);
        await thread.sendTyping().catch(() => {});
        await message.react('⏳').catch(() => {});
        try {
          const res = await queryGroq(author.id, userQuestion);
          clearInterval(ti);
          await message.reactions.cache.get('⏳')?.remove().catch(() => {});
          await message.react('✅').catch(() => {});
          for (const chunk of splitMessage(res)) await thread.send(chunk).catch(() => {});
        } catch (err) {
          clearInterval(ti);
          await message.reactions.cache.get('⏳')?.remove().catch(() => {});
          await message.react('❌').catch(() => {});
          await thread.send('❌ حدث خطأ، حاول مجدداً.');
        }
      }
      return;
    }

    // ── ANTI-LINK ─────────────────────────────────────────────────────────────
    if (/https?:\/\//i.test(content) && !isStaff(member)) {
      try { await message.delete(); } catch {}
      await sendTempWarning(channel, `⚠️ **${author.username}**، الروابط ممنوعة. فقط الإدارة تشارك روابط.`, 6000);
      return;
    }

    // ── ANTI-SPAM ─────────────────────────────────────────────────────────────
    if (!isStaff(member)) {
      const now = Date.now();
      if (!spamMap.has(author.id)) spamMap.set(author.id, { timestamps: [], messageIds: [] });
      const ud = spamMap.get(author.id);
      ud.timestamps.push(now); ud.messageIds.push(message.id);
      while (ud.timestamps.length && now - ud.timestamps[0] > SPAM_WINDOW_MS) { ud.timestamps.shift(); ud.messageIds.shift(); }
      if (ud.timestamps.length >= SPAM_THRESHOLD) {
        const ids = [...ud.messageIds]; spamMap.delete(author.id);
        for (const id of ids) await channel.messages.fetch(id).then((m) => m.delete().catch(() => {})).catch(() => {});
        try {
          await member.timeout(TIMEOUT_DURATION_MS, 'Auto spam detection');
          await sendTempWarning(channel, `🔇 **${author.username}** تم كتمه 5 دقائق بسبب السبام.`, 8000);
        } catch {}
        return;
      }
    }

    // ── AI — قناة ask-flux ────────────────────────────────────────────────────
    if (channel.name === ASK_FLUX_CHANNEL_NAME) {
      const userQuestion = content.trim();
      if (!userQuestion) return;
      const lastUsed = userCooldowns.get(author.id) || 0;
      const now = Date.now();
      if (now - lastUsed < AI_COOLDOWN_MS) {
        await sendTempWarning(channel, `⏳ **${author.username}**، انتظر **${((AI_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1)}** ثانية.`, 3000);
        return;
      }
      userCooldowns.set(author.id, now);
      try {
        const thread = await getOrCreateThread(message);
        resetThreadTimer(thread, author.id);
        await message.react('💬').catch(() => {});
        const ti = setInterval(() => thread.sendTyping().catch(() => {}), 5000);
        await thread.sendTyping().catch(() => {});
        try {
          const res = await queryGroq(author.id, userQuestion);
          clearInterval(ti);
          for (const chunk of splitMessage(res)) await thread.send(chunk).catch(() => {});
        } catch (err) {
          clearInterval(ti);
          await thread.send('❌ حدث خطأ، حاول مجدداً.');
        }
      } catch (err) {
        await sendTempWarning(channel, `❌ **${author.username}**، حدث خطأ في إنشاء الثريد.`, 5000);
      }
    }
  },
};