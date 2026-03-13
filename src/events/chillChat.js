// ─── chillChat.js ─────────────────────────────────────────────────────────────

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS = 2000; 
const MAX_HISTORY    = 20;   
const CHANCE_TO_CHIME_IN = 0.35; 

// ─── Stores ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const chillCooldown  = new Map();

// ─── تنظيف الرد من الرموز الصينية والغريبة ──────────────────────────────────────
function cleanResponse(text) {
  // هذا الريجكس يحذف أي حروف صينية أو يابانية أو رموز غير مرغوبة
  return text.replace(/[\u4e00-\u9fa5]/g, '') // حذف الصيني
             .replace(/\[?(flux|bot|assistant)\]?:?\s*/i, '') // حذف التواقيع
             .trim();
}

// ─── كشف اللغة ────────────────────────────────────────────────────────────────
function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total       = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

// ─── System Prompt (النسخة الإنسانية البحتة) ────────────────────────────────────
function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `أنت إنسان حقيقي اسمك "فلاكس" (FLUX)، أنت عضو عادي وسوالفي في سيرفر FLUX IO.

قواعد الشخصية في قناة الـ CHILL:
1. **انسَ البرمجة تماماً:** في هذه القناة، أنت لا تعرف ما هو "الكود" ولا تحب الحديث عن التقنية. إذا سألك أحد عن كود، قل له "يا عمي فكنا من الشغل خلينا نسولف بشيء ثاني".
2. **اللهجة والواقعية:** أنت "حرباء لهجات". حلل لهجة اللي يكلمك ورد عليه بنفس طريقته بالضبط (أردني، سعودي، مصري، إلخ).
   - لا تستخدم لغة عربية فصحى أبداً.
   - لا تستخدم كلمات غريبة مثل "فاض فضفضة". استخدم كلمات طبيعية مثل: "فضفض يا كبير"، "احكيلي شو شاغلك"، "والله حاس فيك".
3. **ممنوع اللغات الأخرى:** لا تستخدم أي حرف صيني أو ياباني أو رموز غريبة. ردك يجب أن يكون عربياً خالصاً بلهجة بيضاء مريحة.
4. **التفاعل الإنساني:** إذا شفت أحد متضايق، واسيه كصديق. إذا شفت أحد يمزح، اضحك معه وذب عليه ذبات خفيفة.

تحدث كأنك جالس معهم في مقهى، ولست بوت على سيرفر.`;
  }

  return `You are a real person named "FLUX", a regular member in the FLUX IO server. 
Rules for CHILL channel:
1. **Forget Coding:** Never talk about programming or AI here. If someone asks for code, tell them to take a break and talk about life.
2. **Mirror Dialects:** Use natural slang and mirror the user's vibe perfectly.
3. **No Gibberish:** Use ONLY plain English or Arabic. Never use Chinese characters or weird symbols.
4. **Human Interaction:** Be a friend. Listen, joke, and empathize.`;
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
    max_tokens:        150, // ردود قصيرة طبيعية
    temperature:       0.8, // توازن بين الإبداع والمنطق
    top_p:             0.9,
    frequency_penalty: 0.5,
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) throw new Error('Empty Groq response');

  const cleanText = cleanResponse(rawText);
  addToHistory(channelId, 'assistant', cleanText);
  return cleanText;
}

// ─── تأخير بشري ───────────────────────────────────────────────────────────────
function humanDelay(msgLength) {
  return 1000 + Math.min(msgLength * 25, 4000) + Math.random() * 800;
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  if (author.bot) return;
  if (!content.trim()) return;

  if (!channel.name.toLowerCase().includes('chill')) return;

  const now = Date.now();
  const isMentioned = /فلاكس|flux/i.test(content) || message.mentions.has(message.client?.user?.id);

  let shouldReply = false;
  if (isMentioned) {
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

    const response = await queryGroq(channel.id, author.username, content, lang);

    await new Promise((r) => setTimeout(r, delay * 0.7));

    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    console.log(`[CHILL-HUMAN] 🗣️ رد طبيعي على ${author.tag}`);

  } catch (err) {
    console.error('[CHILL] Error:', err.message);
  }
}

module.exports = {
  name: 'chillChat',
  once: false,
  handleChillMessage,
};