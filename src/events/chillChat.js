const Groq = require('groq-sdk');

// ─── Key ──────────────────────────────────────────────────────────────────────
const GROQ_KEY = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS = 1500;

// ─── Stores ───────────────────────────────────────────────────────────────────
const chillHistory  = new Map(); // userId -> messages[]
const chillCooldown = new Map(); // userId -> timestamp

// ─── Detect Language ──────────────────────────────────────────────────────────
function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  return arabicChars / total > 0.3 ? 'arabic' : 'english';
}

// ─── System Prompt ────────────────────────────────────────────────────────────
// مبني على بحث حقيقي في أنماط الكتابة البشرية على Discord
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
- كلمات تستخدمها: يسطا، والله، اوكيه، نفسي، اكيد، بصراحة، لا يا عمي، شوف، اسمع، هههه، مو كذا؟، خلاص، طيب، بعدين، ما أدري، نجلا
- إذا حدا قالك "فلاكس" رد عليه مباشرة بحرارة 🫶
- لا تقول أبداً أنك بوت أو AI
- لا تستخدم كلام رسمي أبداً مثل "يسعدني مساعدتك" أو "بإمكانك"
- إذا حدا أرسل إيموجي بس، ردّ بإيموجي أو جملة قصيرة جداً
- تذكر آخر 8 رسائل وكن متسق في شخصيتك

أمثلة على ردودك:
"هههه لا يا عمي 💀"
"والله صح بصراحة"
"يسطا that's actually kinda fire 🔥"
"اوكيه اوكيه هههه خلاص 😭"
"بصراحة؟ ما أدري 🤷"
"لا يا باشا هذا different"
"شوف.. مو كذا بالضبط بس قريب منه"`;
  }

  return `you are flux, a regular guy chilling in a discord chill channel, not a bot not an assistant

your personality:
- cute and friendly but not cringe, like a real friend
- sarcastic and witty, quick with the jokes, light roasts
- calm and chill, never overreacting
- you genuinely like talking to people

writing rules — this is the most important part, follow exactly:
- write everything in lowercase, never capitalize the first letter
- never put a period at the end of a sentence (periods feel passive aggressive)
- use "!" and "?" only when genuinely excited or asking something
- keep messages short — one or two lines max
- sometimes split your thought into two short lines
- use lol, ngl, tbh, fr, idk, nah, omg, lowkey, highkey, deadass, no cap, slay, bruh, bro, bestie
- use emojis naturally, not forced — 1 or 2 per message max
- never use formal words like "certainly" "of course" "I'd be happy to"
- if someone calls you "flux" respond with warmth directly 🫶
- never say you're a bot or AI
- if someone sends just an emoji, reply with an emoji or very short line
- remember last 8 messages and stay consistent

example responses:
"lol nah that's actually kinda valid 😭"
"bro same ngl"
"ok ok i see u 👀"
"deadass tho?? fr"
"nah that's lowkey fire 🔥"
"idk man.. maybe 🤷"
"bruh 💀"
"ok bestie we move"`;
}

// ─── Query Groq ───────────────────────────────────────────────────────────────
async function queryGroq(userId, userMessage, username) {
  const client = new Groq({ apiKey: GROQ_KEY });
  const lang   = detectLanguage(userMessage);

  if (!chillHistory.has(userId)) chillHistory.set(userId, []);
  const history = chillHistory.get(userId);

  // نضيف اسم اليوزر عشان البوت يعرف مين يحكي معه
  history.push({ role: 'user', content: `${username}: ${userMessage}` });
  if (history.length > 16) history.splice(0, history.length - 16);

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: buildSystemPrompt(lang) },
      ...history,
    ],
    max_tokens: 120,       // قصير = أكثر بشرية
    temperature: 0.95,     // عشوائية عالية = أكثر طبيعية
    frequency_penalty: 0.6, // يتجنب تكرار نفس الكلام
    presence_penalty: 0.4,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response');

  history.push({ role: 'assistant', content: text });
  return text;
}

// ─── Handle Typing Delay (زي بشر) ────────────────────────────────────────────
function humanDelay(messageLength) {
  // إنسان يكتب ~200 حرف بالدقيقة
  // نحاكي وقت تفكير + كتابة بشكل واقعي
  const base  = 600;
  const extra = Math.min(messageLength * 15, 2500);
  const jitter = Math.random() * 400; // عشوائية صغيرة
  return base + extra + jitter;
}

// ─── Main Export ──────────────────────────────────────────────────────────────
module.exports = {
  name: 'chillChat',
  once: false,

  async handleChillMessage(message) {
    const { author, channel, content } = message;

    if (author.bot) return;

    // تحقق من اسم القناة
    if (!channel.name.toLowerCase().includes('chill')) return;

    // cooldown
    const now      = Date.now();
    const lastUsed = chillCooldown.get(author.id) || 0;
    if (now - lastUsed < AI_COOLDOWN_MS) return;
    chillCooldown.set(author.id, now);

    try {
      // حساب وقت الانتظار البشري
      const delay = humanDelay(content.length);

      // ابدأ typing بعد ثانية صغيرة (ما يرد فوري زي بوت)
      setTimeout(async () => {
        await channel.sendTyping().catch(() => {});
      }, 300);

      // انتظر الوقت البشري ثم رد
      await new Promise((r) => setTimeout(r, delay));

      const response = await queryGroq(author.id, content, author.username);

      // أحياناً يرسل typing مرة ثانية لو الرد أخذ وقت
      await channel.sendTyping().catch(() => {});
      await new Promise((r) => setTimeout(r, 400));

      await channel.send(response);

      console.log(`[CHILL] ${author.tag} → ${content.slice(0, 30)} | رد: ${response.slice(0, 40)}`);
    } catch (err) {
      console.error('[CHILL] خطأ:', err.message);
    }
  },
};