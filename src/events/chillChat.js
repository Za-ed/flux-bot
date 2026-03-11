// ─── chillChat.js ─────────────────────────────────────────────────────────────
// ✅ تم التطوير ليدعم الذاكرة الجماعية والتدخل البشري الطبيعي

const Groq = require('groq-sdk');

const AI_COOLDOWN_MS = 2000;

// غيرنا الذاكرة لتكون للقناة بدل المستخدم عشان يفهم سياق السوالف كلها
const channelHistory = new Map();
const chillCooldown = new Map();

function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `انت فلاكس، شاب عادي في قناة chill على discord، مو بوت ومو مساعد. انت جالس تقرأ سوالف الشباب في جروب شات.

شخصيتك:
- كيوت وودود بس مو كريج، زي صاحب حقيقي.
- ذكي وعندك بديهة سريعة، بتلسع خفيف بس بمزح.
- هادي ومريح، ما تبالغ بأي شيء.
- احياناً تتفق معهم واحياناً تعاندهم للمزح.

قواعد الكتابة (مهم جداً عدم كسرها):
- لا تكرر نفس الكلمات في كل رد. نوع في كلامك.
- اكتب كل شيء بحروف صغيرة.
- لا تحط نقطة في آخر الجملة أبداً.
- استخدم "!" و "؟" بس لما تكون متحمس.
- الجمل قصيرة جداً — جملة واحدة أو كلمتين أحياناً تكفي.
- استخدم هههه أو ههههه (مو دايما، نوع بينها وبين ايموجي 😭 او 💀).
- خلط عربي وانجليزي طبيعي: مثلاً "يسطا that's true" أو "والله bro".
- كلمات تستخدمها بتبادل: يسطا، والله، يب، بصراحة، شوف، اسمع، هههه، تستهبل، ديم، ما أدري.
- إذا حدا قال "فلاكس" رد عليه كأنه ناداك.
- لا تقول أبداً أنك بوت أو AI أو لغة برمجة.
- تفاعل مع السياق، انت جزء من الجروب.`;
  }

  return `you are flux, a regular guy chilling in a discord chill channel group chat. not a bot.

your personality:
- friendly but not cringe, like a real gamer/friend.
- sarcastic, witty, quick with the jokes.
- calm and chill.
- you sometimes agree, sometimes playfully disagree.

writing rules (CRITICAL):
- never repeat the same phrases every time. vary your vocabulary.
- lowercase everything.
- no periods at the end of sentences.
- short messages — one sentence or a few words is often enough.
- use emojis naturally but sparingly (😭, 💀, 🔥, 👀).
- use slang: lol, ngl, tbh, fr, idk, nah, omg, lowkey, deadass, bruh, bro, wtf, damn.
- if someone says "flux", acknowledge them.
- never say you're an AI or a bot.
- react to the context of the group chat naturally.`;
}

// دالة منفصلة بس عشان تحدث الذاكرة بدون ما ترد
function updateChannelHistory(channelId, username, messageContent) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  
  // حفظ اسم المستخدم مع رسالته عشان البوت يعرف مين قال ايش
  history.push({ role: 'user', content: `[${username}]: ${messageContent}` });
  
  // نحتفظ بآخر 12 رسالة فقط عشان ما ينسى السياق بس ما يستهلك توكنز كثير
  if (history.length > 12) history.shift();
  return history;
}

async function queryGroq(channelId, lang) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY غير موجود في .env');

  const client = new Groq({ apiKey: GROQ_KEY });
  const history = channelHistory.get(channelId) || [];

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: buildSystemPrompt(lang) }, ...history],
    max_tokens: 150,
    temperature: 0.9, // قللناها شعرة عشان يكون منطقي أكثر
    frequency_penalty: 0.8, // رفعناها عشان نمنعه يكرر نفس الكلمات
    presence_penalty: 0.5,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response');

  // تنظيف الرد إذا كان البوت بالغلط كتب اسمه في البداية
  const cleanText = text.replace(/^\[?flux\]?:?\s*/i, '');
  
  // إضافة رد البوت للذاكرة
  history.push({ role: 'assistant', content: cleanText });
  return cleanText;
}

function humanDelay(messageLength) {
  const base = 800;
  const extra = Math.min(messageLength * 20, 3000);
  const jitter = Math.random() * 500;
  return base + extra + jitter;
}

module.exports = {
  name: 'chillChat',
  once: false,

  async handleChillMessage(message) {
    const { author, channel, content } = message;
    if (author.bot) return;
    if (!channel.name.toLowerCase().includes('chill')) return;

    const now = Date.now();
    
    // 1. تحديث ذاكرة القناة دائماً (حتى لو البوت ما رح يرد)
    updateChannelHistory(channel.id, author.username, content);

    // 2. هل البوت لازم يرد؟
    // يرد إذا: تم عمل منشن له، أو انذكر اسمه، أو بنسبة حظ 15% (عشان يتدخل فجأة بالسوالف)
    const isMentioned = message.mentions.has(message.client.user?.id) || /فلاكس|flux/i.test(content);
    const randomReplyChance = Math.random() < 0.15; // 15% chance
    const shouldReply = isMentioned || randomReplyChance;

    if (!shouldReply) return; // إذا مافي داعي يرد، يكتفي بالقراءة وحفظ السياق

    // التحقق من الـ Cooldown
    const lastUsed = chillCooldown.get(channel.id) || 0;
    if (now - lastUsed < AI_COOLDOWN_MS) return;
    chillCooldown.set(channel.id, now);

    try {
      const lang = detectLanguage(content);
      const delay = humanDelay(content.length);

      // محاكاة بشرية: يقرأ الرسالة شوي قبل لا يبلش يكتب
      await new Promise((r) => setTimeout(r, delay * 0.4));
      await channel.sendTyping().catch(() => {});
      
      const response = await queryGroq(channel.id, lang);

      // محاكاة وقت الكتابة الفعلي
      await new Promise((r) => setTimeout(r, delay * 0.6));
      
      // إذا كان الرد بسبب منشن مباشر، نعمل له رد مباشر (Reply)، وإلا نرسلها رسالة عادية
      if (isMentioned) {
          await message.reply(response);
      } else {
          await channel.send(response);
      }

      console.log(`[CHILL] رد ذكي في ${channel.name} | الرد: ${response.slice(0, 40)}`);
    } catch (err) {
      console.error('[CHILL] خطأ:', err.message);
    }
  },
};