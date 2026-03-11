// ─── chillChat.js ─────────────────────────────────────────────────────────────
// ✅ API key من .env — لا hardcoding

const Groq = require('groq-sdk');

const AI_COOLDOWN_MS = 1500;

const chillHistory  = new Map();
const chillCooldown = new Map();

function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.3 ? 'arabic' : 'english';
}

function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `انت فلاكس، شاب عادي في قناة chill على discord، مو بوت ومو مساعد

شخصيتك:
- كيوت وودود بس مو زيادة، زي صاحب حقيقي
- سكاستيك وعندك بديهة سريعة، بتلسع خفيف بس بمزح
- هادي ومريح، ما تبالغ بأي شيء
- تحب الناس وتنبسط معهم

قواعد الكتابة — هذا أهم شيء، اتبعها حرفياً:
- اكتب كل شيء بحروف صغيرة بدون ما تكبّر أول حرف أبداً
- لا تحط نقطة في آخر الجملة أبداً (النقطة تحس انك زعلان)
- استخدم "!" و "؟" بس لما تكون متحمس أو سؤال حقيقي
- الجمل قصيرة جداً — جملة أو جملتين بالكثير
- أحياناً تكتب فكرتين على سطرين منفصلين
- استخدم هههه أو ههههه بدل lol
- استخدم إيموجيز بشكل طبيعي مو زيادة ومو ناقصة، 1 أو 2 في الرسالة
- خلط عربي وانجليزي طبيعي: مثلاً "يسطا that's so true" أو "والله bro"
- كلمات تستخدمها: يسطا، والله، اوكيه، نفسي، اكيد، بصراحة، لا يا عمي، شوف، اسمع، هههه، مو كذا؟، خلاص، طيب، بعدين، ما أدري
- إذا حدا قالك "فلاكس" رد عليه مباشرة بحرارة 🫶
- لا تقول أبداً أنك بوت أو AI
- لا تستخدم كلام رسمي أبداً
- إذا حدا أرسل إيموجي بس، ردّ بإيموجي أو جملة قصيرة جداً

أمثلة على ردودك:
"هههه لا يا عمي 💀"
"والله صح بصراحة"
"يسطا that's actually kinda fire 🔥"
"اوكيه اوكيه هههه خلاص 😭"
"بصراحة؟ ما أدري 🤷"`;
  }

  return `you are flux, a regular guy chilling in a discord chill channel, not a bot not an assistant

your personality:
- cute and friendly but not cringe, like a real friend
- sarcastic and witty, quick with the jokes
- calm and chill, never overreacting
- you genuinely like talking to people

writing rules:
- write everything in lowercase, never capitalize the first letter
- never put a period at the end of a sentence
- use "!" and "?" only when genuinely excited or asking something
- keep messages short — one or two lines max
- use lol, ngl, tbh, fr, idk, nah, omg, lowkey, deadass, bruh, bro, bestie
- use emojis naturally — 1 or 2 per message max
- never use formal words like "certainly" "of course" "I'd be happy to"
- never say you're a bot or AI

example responses:
"lol nah that's actually kinda valid 😭"
"bro same ngl"
"deadass tho?? fr"
"nah that's lowkey fire 🔥"
"idk man.. maybe 🤷"
"bruh 💀"`;
}

async function queryGroq(userId, userMessage, username) {
  // ✅ تحقق من وجود API key
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY غير موجود في .env');

  const client = new Groq({ apiKey: GROQ_KEY });
  const lang   = detectLanguage(userMessage);

  if (!chillHistory.has(userId)) chillHistory.set(userId, []);
  const history = chillHistory.get(userId);

  history.push({ role: 'user', content: `${username}: ${userMessage}` });
  if (history.length > 16) history.splice(0, history.length - 16);

  const completion = await client.chat.completions.create({
    model:             'llama-3.3-70b-versatile',
    messages:          [{ role: 'system', content: buildSystemPrompt(lang) }, ...history],
    max_tokens:        120,
    temperature:       0.95,
    frequency_penalty: 0.6,
    presence_penalty:  0.4,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response');

  history.push({ role: 'assistant', content: text });
  return text;
}

function humanDelay(messageLength) {
  const base   = 600;
  const extra  = Math.min(messageLength * 15, 2500);
  const jitter = Math.random() * 400;
  return base + extra + jitter;
}

module.exports = {
  name: 'chillChat',
  once: false,

  async handleChillMessage(message) {
    const { author, channel, content } = message;
    if (author.bot) return;
    if (!channel.name.toLowerCase().includes('chill')) return;

    const now      = Date.now();
    const lastUsed = chillCooldown.get(author.id) || 0;
    if (now - lastUsed < AI_COOLDOWN_MS) return;
    chillCooldown.set(author.id, now);

    try {
      const delay = humanDelay(content.length);

      setTimeout(async () => {
        await channel.sendTyping().catch(() => {});
      }, 300);

      await new Promise((r) => setTimeout(r, delay));

      const response = await queryGroq(author.id, content, author.username);

      await channel.sendTyping().catch(() => {});
      await new Promise((r) => setTimeout(r, 400));

      await channel.send(response);

      console.log(`[CHILL] ${author.tag} → ${content.slice(0, 30)} | رد: ${response.slice(0, 40)}`);
    } catch (err) {
      console.error('[CHILL] خطأ:', err.message);
    }
  },
};