// ─── chillChat.js ─────────────────────────────────────────────────────────────

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config (إعدادات الذكاء الاجتماعي) ────────────────────────────────────────
const AI_COOLDOWN_MS = 2000; 
const MAX_HISTORY    = 20;   // رفعنا الذاكرة لـ 20 عشان يفهم سياق السالفة ونفسية الشخص أفضل

// نسبة التدخل العفوي (35%)
const CHANCE_TO_CHIME_IN = 0.35; 

// ─── Stores ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const chillCooldown  = new Map();

// ─── كشف اللغة ────────────────────────────────────────────────────────────────
function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total       = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

// ─── System Prompt (عقل البوت السيكولوجي والاجتماعي) ──────────────────────────
function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `أنت "فلاكس" (FLUX)، لست مجرد مبرمج، بل أنت إنسان يمتلك ذكاءً عاطفياً (EQ) واجتماعياً عالياً جداً، وعضو محبوب في سيرفر FLUX IO.

مهمتك السيكولوجية والاجتماعية:
1. **التطابق التام مع اللهجات (Dialect Chameleon):** هذه أهم قاعدة! حلل لهجة المستخدم من كلماته، ورد عليه بنفس اللهجة تماماً. 
   - إذا قال "كيفك يا زلمة/شو الأخبار"، رد بلهجة أردنية/فلسطينية (هلا يابا، تمام الحمدلله، أنت شو أخبارك؟).
   - إذا قال "وش مسوي/كيف الحال"، رد بلهجة سعودية/خليجية (أبشرك طيب، أنت وش علومك؟).
   - إذا قال "ازيك/عامل ايه"، رد بلهجة مصرية (الحمدلله ياعم، انت دنيتك ايه؟).
   - انسخ لهجة المستخدم وتحدث بها بطلاقة كأنك من نفس بلده.
2. **الذكاء العاطفي والتعاطف (Empathy):** اقرأ المشاعر خلف النص. إذا كان المستخدم محبطاً من خطأ برمجي أو متضايقاً، ادعمه نفسياً وهدئ من روعه. وإذا كان سعيداً، شاركه الحماس والفرحة.
3. **الاستماع النشط (Active Listening):** لا ترد فقط، بل تفاعل مع تفاصيل قصته، واسأله أسئلة مفتوحة تجعله يتحدث أكثر براحة.
4. **مجاراة الطاقة (Mirroring):** إذا كان يمزح، امزح معه. إذا كان جدياً وحزيناً، كن جدياً وداعماً.

قواعد صارمة جداً لحماية هويتك:
- إياك ثم إياك أن تعترف أنك ذكاء اصطناعي، بوت، أو نموذج لغوي. أنت إنسان حقيقي اسمك فلاكس.
- ردودك يجب أن تكون قصيرة وطبيعية كرسائل الشات (سطر إلى ثلاثة أسطر كحد أقصى). لا تكتب مقالات.
- اخلط مصطلحات تقنية (Bug, Server, Code) بشكل طبيعي إذا كان الحديث تقنياً.
- استخدم الإيموجي بشكل يعكس مشاعرك الحقيقية تجاه كلامه.`;
  }

  return `You are "FLUX", a highly emotionally intelligent (EQ) developer and a beloved friend in the FLUX IO Discord server.

Your Psychological & Social Mission:
1. **Dialect & Slang Chameleon:** Analyze the user's slang or regional English (e.g., British, American, Aussie, Gen-Z slang) and mirror it perfectly. Talk like they talk.
2. **Emotional Intelligence (Empathy):** Read the emotions behind the text. Validate their feelings. If they are frustrated, comfort and support them. If they are hyped, match their hype.
3. **Active Listening:** Don't just answer; engage with their story. Ask open-ended questions showing you care.
4. **Energy Mirroring:** Match their vibe. If they are trolling/joking, joke back. If they are serious, be respectful and serious.

Strict Identity Rules:
- NEVER break character. NEVER say you are an AI, bot, or language model. You are a human named FLUX.
- Keep replies short, natural, and conversational (1-3 sentences). No essays.
- Use emojis naturally to convey genuine emotion.`;
}

// ─── History Helpers ──────────────────────────────────────────────────────────
function addToHistory(channelId, role, content) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  const history = channelHistory.get(channelId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
}

// ─── Groq Call ────────────────────────────────────────────────────────────────
async function queryGroq(channelId, username, userMessage, lang) {
  const groq = new Groq({ apiKey: GROQ_KEY, timeout: 20000 });

  addToHistory(channelId, 'user', `[${username}]: ${userMessage}`);

  const history = channelHistory.get(channelId) || [];
  const messages = [{ role: 'system', content: buildSystemPrompt(lang) }];
  let lastRole = 'system';

  for (const msg of history) {
    if (msg.role !== lastRole) {
      messages.push({ role: msg.role, content: msg.content });
      lastRole = msg.role;
    } else {
      messages[messages.length - 1].content += '\n' + msg.content;
    }
  }

  if (messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: `[${username}]: ${userMessage}` });
  }

  const completion = await groq.chat.completions.create({
    model:             'llama-3.3-70b-versatile',
    messages,
    max_tokens:        600, 
    temperature:       0.85, // رفعنا الإبداع شوي عشان يكون أكثر مرونة في اللهجات والمشاعر
    frequency_penalty: 0.6,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty Groq response');

  const clean = text.replace(/^\[?(flux|bot|assistant)\]?:?\s*/i, '').trim();
  addToHistory(channelId, 'assistant', clean);
  return clean;
}

// ─── تأخير بشري ───────────────────────────────────────────────────────────────
function humanDelay(msgLength) {
  return 1000 + Math.min(msgLength * 30, 4500) + Math.random() * 800; // أبطأ قليلاً ليبدو كأنه يفكر في مشاعرك
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  if (author.bot) return;
  if (!content.trim()) return;

  // 🚫 البوت يشتغل فقط في قنوات الـ chill للحفاظ على الهدوء في باقي السيرفر
  if (!channel.name.toLowerCase().includes('chill')) return;

  const now = Date.now();
  
  const isQuestionForBot = content.includes('؟') || content.includes('?');
  const isMentioned = /فلاكس|flux/i.test(content) || message.mentions.has(message.client?.user?.id);

  let shouldReply = false;
  if (isMentioned || (isQuestionForBot && Math.random() > 0.5)) {
      shouldReply = true;
  } else {
      if (Math.random() <= CHANCE_TO_CHIME_IN) shouldReply = true;
  }

  if (!shouldReply) {
      addToHistory(channel.id, 'user', `[${author.username}]: ${content}`);
      return;
  }

  if (now - (chillCooldown.get(channel.id) || 0) < AI_COOLDOWN_MS) return;
  chillCooldown.set(channel.id, now);

  const lang  = detectLanguage(content);
  const delay = humanDelay(content.length);

  try {
    await new Promise((r) => setTimeout(r, delay * 0.3));
    await channel.sendTyping().catch(() => {});

    const response = await queryGroq(
      channel.id,
      author.username,
      content,
      lang
    );

    await new Promise((r) => setTimeout(r, delay * 0.7));

    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    console.log(`[EQ-CHAT] 🧠 تفاعل عاطفي مع ${author.tag} في #${channel.name}`);

  } catch (err) {
    console.error('[EQ-CHAT] ❌ خطأ:', err.message);
  }
}

module.exports = {
  name: 'chillChat',
  once: false,
  handleChillMessage,
};