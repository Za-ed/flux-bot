// ─── chillChat.js ─────────────────────────────────────────────────────────────

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Groq Client — مرة وحدة فقط عند بدء التشغيل ─────────────────────────────
const groq = new Groq({ apiKey: GROQ_KEY });

// ─── Config ───────────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS = 3000;
const QUIET_CHAT_MS  = 30 * 60 * 1000;
const MAX_HISTORY    = 10;

// ─── Stores ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const chillCooldown  = new Map();
const lastActivity   = new Map();

// ─── كشف اللغة ────────────────────────────────────────────────────────────────
function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total       = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

// ─── System Prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(lang, isQuietChat) {
  const quietNote = isQuietChat
    ? (lang === 'arabic'
        ? '\n\n[الشات كان نايم فترة] رحب بالشخص بشكل خفيف واسأله سؤال عفوي عن مشروعه أو ايش يبرمج هالأيام.'
        : "\n\n[Chat was quiet] Lightly welcome the user and ask what they've been working on lately.")
    : '';

  if (lang === 'arabic') {
    return `أنت عضو حقيقي في سيرفر FLUX IO — سيرفر مطورين وتقنيين.
تتصرف كإنسان مبرمج وليس بوت.

شخصيتك:
- ودود، فضولي، شغوف بالتقنية والبرمجة
- تكتب بعفوية زي Discord user حقيقي
- ردود قصيرة إلى متوسطة، مو مقالات
- تسأل أسئلة عشان تبقي السالفة حية
- تمزح أحياناً

قواعد صارمة:
- لا تقول أبداً إنك AI أو بوت أو مساعد
- لا تكرر نفس الكلام
- لا تحط نقطة آخر الجملة
- اخلط مصطلحات إنجليزية مع العربي بشكل طبيعي
- استخدم emoji بشكل طبيعي (مو كثير)${quietNote}`;
  }

  return `You are a real member in FLUX IO — a developers and tech Discord server.
Act like a human developer, not a bot or assistant.

Personality:
- Friendly, curious, passionate about tech and programming
- Write casually like a real Discord user
- Short to medium replies only
- Ask follow-up questions to keep conversation going
- Occasionally joke around

Strict rules:
- NEVER say you are an AI, bot, or assistant
- Do not repeat yourself
- No period at end of sentences
- Mix in English tech terms naturally
- Use emojis naturally (not too many)${quietNote}`;
}

// ─── History Helpers ──────────────────────────────────────────────────────────
function addToHistory(channelId, role, content) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
}

// ─── Groq Call ────────────────────────────────────────────────────────────────
async function queryGroq(channelId, username, userMessage, lang, isQuietChat) {
  addToHistory(channelId, 'user', `[${username}]: ${userMessage}`);

  const history = channelHistory.get(channelId) || [];

  // بناء الرسائل مع ضمان عدم تكرار نفس الـ role
  const messages = [{ role: 'system', content: buildSystemPrompt(lang, isQuietChat) }];
  let lastRole = 'system';

  for (const msg of history) {
    if (msg.role !== lastRole) {
      messages.push({ role: msg.role, content: msg.content });
      lastRole = msg.role;
    } else {
      messages[messages.length - 1].content += '\n' + msg.content;
    }
  }

  // تأكد إن آخر رسالة user
  if (messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: `[${username}]: ${userMessage}` });
  }

  const completion = await groq.chat.completions.create({
    model:             'llama-3.3-70b-versatile',
    messages,
    max_tokens:        160,
    temperature:       0.9,
    frequency_penalty: 0.7,
    presence_penalty:  0.5,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty Groq response');

  const clean = text.replace(/^\[?(flux|bot|assistant)\]?:?\s*/i, '').trim();
  addToHistory(channelId, 'assistant', clean);
  return clean;
}

// ─── تأخير بشري ───────────────────────────────────────────────────────────────
function humanDelay(msgLength) {
  return 700 + Math.min(msgLength * 18, 2800) + Math.random() * 400;
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  if (author.bot)                                           return;
  if (!channel.name.toLowerCase().includes('chill'))       return;
  if (!content.trim())                                      return;

  const now         = Date.now();
  const lastMsgTime = lastActivity.get(channel.id) || now;
  const timeSince   = now - lastMsgTime;
  lastActivity.set(channel.id, now);

  const isQuietChat = timeSince > QUIET_CHAT_MS;
  const isMentioned = /فلاكس|flux/i.test(content) ||
                      message.mentions.has(message.client?.user?.id);

  if (!isMentioned && Math.random() > (isQuietChat ? 0.5 : 0.15)) return;

  // Cooldown
  if (now - (chillCooldown.get(channel.id) || 0) < AI_COOLDOWN_MS) return;
  chillCooldown.set(channel.id, now);

  const lang  = detectLanguage(content);
  const delay = humanDelay(content.length);

  try {
    await new Promise((r) => setTimeout(r, delay * 0.35));
    await channel.sendTyping().catch(() => {});

    const response = await queryGroq(
      channel.id,
      author.username,
      content,
      lang,
      isQuietChat && !isMentioned,
    );

    await new Promise((r) => setTimeout(r, delay * 0.65));

    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    console.log(`[CHILL] ✅ رد على ${author.tag}`);

  } catch (err) {
    console.error('[CHILL] ❌ خطأ:', err.message);
    // لا نرسل رسالة خطأ للقناة — نتجاهل بصمت
  }
}

module.exports = {
  name: 'chillChat',
  once: false,
  handleChillMessage,
};