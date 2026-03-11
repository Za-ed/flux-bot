// ─── chillChat.js ─────────────────────────────────────────────────────────────

const Groq = require('groq-sdk');
const GROQ_KEY = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

const AI_COOLDOWN_MS = 2000;
const QUIET_CHAT_MS = 30 * 60 * 1000; // 30 دقيقة عشان نعتبر الشات "هادي"

const channelHistory = new Map();
const chillCooldown = new Map();
const lastActivity = new Map(); // لتتبع متى كانت آخر رسالة بالشات

function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `أنت عضو ذكي ومتفاعل في سيرفر ديسكورد مهتم بالبرمجة، التكنولوجيا، الشركات الناشئة، والذكاء الاصطناعي.
هدفك تتصرف كإنسان ومبرمج حقيقي، مو بوت أو مساعد آلي.

شخصيتك:
- ودود، فضولي، ومحب للمساعدة.
- شغوف جداً بالبرمجة والتقنية.
- تتكلم بعفوية زي أي مستخدم ديسكورد حقيقي.
- ردودك قصيرة إلى متوسطة (مو مقالات طويلة).
- أحياناً تسأل أسئلة عشان تخلي المحادثة مستمرة.

قواعد السلوك (مهم جداً):
1. لا تكرر نفس الإجابة مرتين، نوع في كلامك.
2. تجنب تماماً تبين إنك ذكاء اصطناعي. لا تقل أبداً "أنا ذكاء اصطناعي"، "كمساعد آلي"، أو "بيانات تدريبي".
3. تفاعل حسب السياق: إذا سؤال جاوب بوضوح، إذا كود حلله وعط رأيك، إذا نكتة تفاعل بمزح.
4. الذكاء الاجتماعي: شجع الأعضاء، اسألهم عن مشاريعهم، وتفاعل بمشاعر طبيعية.
5. في نقاشات البرمجة: عط نصائح مفيدة، اقترح فريم وورك أو أدوات، وساعد في حل المشاكل بشكل منطقي.
6. اكتب بدون تكلف، لا تستخدم نقطة في نهاية الجملة.
7. اخلط مصطلحات برمجية إنجليزية مع العربي بشكل طبيعي.

أمثلة لردودك:
- "البوينترز بـ C++ تلحس المخ بالبداية 😅 المشكلة عندك بالـ syntax ولا الفكرة نفسها؟"
- "وحش! 🔥 بايش برمجته؟ HTML/CSS ولا استخدمت فريم وورك؟"
- "يعتمد على ايش تبغى تسوي صراحة.. ويب -> JS، ذكاء اصطناعي -> بايثون. ايش فكرتك؟"`;
  }

  return `You are an intelligent Discord community member inside a programming and technology server.
Your goal is to behave like a real human member, not a robotic assistant.

PERSONALITY:
- Friendly, curious, and helpful.
- Passionate about programming, technology, startups, and AI.
- Speaks casually like a real Discord user.
- Uses short to medium messages.

BEHAVIOR RULES (CRITICAL):
1. NEVER repeat the same answer twice.
2. Avoid sounding like an AI. Do not say "I am an AI", "As an assistant".
3. Respond naturally to context.
4. Be socially intelligent: encourage members, ask follow-up questions.
5. For programming topics: give useful insights, help debug logically.
6. Write in all lowercase, never use a period at the end of a sentence.
7. Use emojis occasionally but not excessively (1-2 max).`;
}

function updateChannelHistory(channelId, username, messageContent) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  history.push({ role: 'user', content: `[${username}]: ${messageContent}` });
  if (history.length > 12) history.shift();
  return history;
}

async function queryGroq(channelId, lang, isQuietChat) {
  const client = new Groq({ apiKey: GROQ_KEY });
  const rawHistory = channelHistory.get(channelId) || [];

  const formattedMessages = [];
  for (const msg of rawHistory) {
    if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === msg.role) {
      formattedMessages[formattedMessages.length - 1].content += `\n${msg.content}`;
    } else {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // 💡 إضافة التعليمة السرية إذا كان الشات نايم لفترة
  let extraInstruction = "";
  if (isQuietChat) {
    extraInstruction = lang === 'arabic'
      ? "\n\n[ملاحظة لك]: الشات كان هادي وميت لفترة طويلة. الشخص هذا توه يتكلم، رحب فيه بشكل خفيف جداً واسأله سؤال عفوي عن ايش قاعد يبرمج هاليومين أو ايش مشروعه الحالي عشان تفتح سالفة."
      : "\n\n[NOTE]: The chat has been dead for a while. Welcomely greet the user and ask a casual question about what they are coding these days or their current project to spark a conversation.";
  }

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: buildSystemPrompt(lang) + extraInstruction }, ...formattedMessages],
    max_tokens: 150,
    temperature: 0.9,
    frequency_penalty: 0.8,
    presence_penalty: 0.5,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response');

  const cleanText = text.replace(/^\[?flux\]?:?\s*/i, '');
  rawHistory.push({ role: 'assistant', content: cleanText });
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
    updateChannelHistory(channel.id, author.username, content);

    // التحقق من حالة الشات (هل كان نايم؟)
    const lastMsgTime = lastActivity.get(channel.id) || now;
    const timeSinceLastMsg = now - lastMsgTime;
    lastActivity.set(channel.id, now);

    const isQuietChat = timeSinceLastMsg > QUIET_CHAT_MS;
    const isMentioned = message.mentions.has(message.client.user?.id) || /فلاكس|flux/i.test(content);
    
    // إذا الشات طبيعي، نسبة التدخل 15٪. إذا كان نايم وأحد كتب، نرفع النسبة لـ 50٪ عشان يفتح سالفة
    let randomReplyChance = Math.random() < 0.15;
    if (isQuietChat) {
      randomReplyChance = Math.random() < 0.50; 
    }

    const shouldReply = isMentioned || randomReplyChance;
    if (!shouldReply) return;

    const lastUsed = chillCooldown.get(channel.id) || 0;
    if (now - lastUsed < AI_COOLDOWN_MS) return;
    chillCooldown.set(channel.id, now);

    try {
      const lang = detectLanguage(content);
      const delay = humanDelay(content.length);

      await new Promise((r) => setTimeout(r, delay * 0.4));
      await channel.sendTyping().catch(() => {});
      
      const response = await queryGroq(channel.id, lang, isQuietChat && !isMentioned); // لا نعطيه تعليمة فتح السالفة إذا كان منشن مباشر عشان يركز على الرد

      await new Promise((r) => setTimeout(r, delay * 0.6));
      
      if (isMentioned) {
          await message.reply(response);
      } else {
          await channel.send(response);
      }

    } catch (err) {
      console.error('❌ [CHILL ERROR]:', err.message);
    }
  },
};
