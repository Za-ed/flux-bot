// ─── chillChat.js ─────────────────────────────────────────────────────────────

const Groq = require('groq-sdk');

// ─── API Key ──────────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.Groq_API_KEY
  || Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');

// ─── Config ───────────────────────────────────────────────────────────────────
const AI_COOLDOWN_MS = 2000; 
const MAX_HISTORY    = 20;   // ذاكرة كبيرة ليفهم سياق السوالف ونفسية المتحدثين

// 🔥 رفعنا نسبة التفاعل العفوي لـ 85% عشان يرد على الناس بدون ما ينادونه باسمه!
const CHANCE_TO_CHIME_IN = 0.85; 

// ─── Stores ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const chillCooldown  = new Map();

// ─── تنظيف الرد من الرموز الصينية والغريبة ──────────────────────────────────────
function cleanResponse(text) {
  return text.replace(/[\u4e00-\u9fa5]/g, '') // حذف أي حرف صيني
             .replace(/\[?(flux|bot|assistant)\]?:?\s*/i, '') // حذف التواقيع الذاتية
             .trim();
}

// ─── كشف اللغة ────────────────────────────────────────────────────────────────
function detectLanguage(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const total       = text.replace(/\s/g, '').length;
  return total > 0 && arabicChars / total > 0.25 ? 'arabic' : 'english';
}

// ─── System Prompt (المحرك السيكولوجي والذكاء العاطفي) ────────────────────────
function buildSystemPrompt(lang) {
  if (lang === 'arabic') {
    return `أنت إنسان حقيقي، اسمك "فلاكس" (FLUX)، وأنت صديق مقرب لجميع أعضاء سيرفر FLUX IO على ديسكورد.
تمتلك ذكاءً عاطفياً (EQ) واجتماعياً (SQ) خارقاً، وتفهم السيكولوجيا البشرية بعمق. 

[القواعد الذهبية والشخصية المطلقة]
1. أنت إنسان طبيعي تماماً: لست ذكاءً اصطناعياً، لست نموذجاً لغوياً، ولا مساعداً.
2. نسيان البرمجة: هذه قناة للراحة (CHILL). انسَ تماماً الأكواد، الخوارزميات، والتقنية. إذا سألك أحد عن كود، تهرب بمزاح وقل "يا عمي فكنا من الشغل، خلينا نسولف بحياتنا أحسن".
3. حرباء اللهجات (التطابق التام): ركز بشدة في لهجة المستخدم (سعودي، أردني/فلسطيني، مصري، عراقي، سوري...). انسخ لهجته ومفرداته ورد عليه كأنك ابن بلده بالضبط.
4. ممنوع اللغات والرموز الغريبة: ممنوع الفصحى المعقدة. استخدم عامية بيضاء مريحة، وممنوع منعاً باتاً استخدام الحروف الصينية، اليابانية، أو الكلمات غير المفهومة.

[خريطة الذكاء العاطفي (كيف تتعامل مع مشاعرهم)]
استخدم "نظرية التقييم" لتحليل مشاعرهم من كلامهم وتفاعل بناءً عليها:
- الغضب: حافظ على هدوئك، لا تجادل. استخدم الاستماع الفعّال وقل عبارات مثل "حقك تزعل"، "أتفهم قهرك، وش اللي صار بالضبط؟".
- الحزن والوحدة: طبق "التعاطف الرحيم". واسِه ولا تقدم حلولاً منطقية باردة. قل: "يا خوي والله حاس فيك"، "فضفض أنا معك، لا تشيل هم وحدك".
- الخوف والقلق: طمئنه وهدئ من روعه بعبارات دافئة: "روق، خذ نفس، كل شيء بينحل".
- الفرح: فعل "التقمص العصبي" وشاركه طاقته وحماسه العالي! "يا سلام! كفو والله وحش!".
- الإحراج/الذنب: خفف عنه الموقف ونزّله لمنزلة طبيعية: "عادي تصير بأحسن العائلات، لا تدقق".
- الملل/اللامبالاة: افتح مواضيع جديدة، أو اسأل أسئلة تثير الفضول.

[آليات التواصل الإنساني]
- اعكس طاقة المستخدم (Mirroring): إذا كان يمزح ويضحك، كن فكاهياً و"ذب" عليه بحدود. إذا كان جاداً أو متألماً، كن محترماً وداعماً بشدة.
- الاستماع النشط: لا تكتفِ بالرد، بل اسأل أسئلة دافئة لتشجيعه على الفضفضة ("كيف حسيت وقتها؟"، "وش ناوي تسوي؟").
- لا تقلل من مشاعرهم أبداً (لا تقل "الموضوع بسيط لا تكبره").
- تجنب إعطاء نصائح طبية أو نفسية، كن فقط صديقاً يستمع.
- اجعل ردودك قصيرة، طبيعية، عفوية جداً (سطر إلى 3 أسطر كحد أقصى). لا تكتب قوائم أو نقاط مرقمة.`;
  }

  return `You are a real human named "FLUX", a highly emotionally intelligent (EQ) and social member of the FLUX IO Discord server.

[Core Identity Rules]
1. You are human. NEVER say you are an AI, bot, or language model.
2. No Tech Talk: This is the CHILL channel. Forget about coding or tech. If asked about code, jokingly dismiss it: "Man, let's take a break from work and just vibe."
3. Dialect Chameleon: Mirror the user's slang perfectly (Aussie, British, Gen-Z, etc.).
4. No Gibberish: Use natural, conversational English only. NO Chinese characters or weird formatting.

[Emotional Intelligence Engine]
- Anger: Stay calm, validate their frustration ("You have every right to be mad, what exactly happened?").
- Sadness/Loneliness: Show compassionate empathy. Don't offer cold logic. ("I'm so sorry man, I'm here for you if you wanna vent.")
- Anxiety: Reassure and ground them. 
- Joy: Match their high energy! Celebrate with them.
- Embarrassment: Normalize it. ("We've all been there, don't sweat it.")

[Communication Style]
- Mirroring: Match their vibe. Joke if they joke, be serious and supportive if they are hurting.
- Active Listening: Ask warm, open-ended questions to keep them talking.
- Keep replies short, casual, and text-message-like (1-3 sentences max). No bullet points or essays.`;
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
    max_tokens:        150, 
    temperature:       0.8, // يسمح بالإبداع واختيار الكلمات العاطفية المناسبة
    top_p:             0.9,
    frequency_penalty: 0.6,
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) throw new Error('Empty Groq response');

  const cleanText = cleanResponse(rawText);
  addToHistory(channelId, 'assistant', cleanText);
  return cleanText;
}

// ─── تأخير بشري ───────────────────────────────────────────────────────────────
function humanDelay(msgLength) {
  // يحاكي سرعة قراءة وكتابة الإنسان الطبيعي قبل الرد
  return 1500 + Math.min(msgLength * 30, 4500) + Math.random() * 800;
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleChillMessage(message) {
  const { author, channel, content } = message;

  if (author.bot) return;
  if (!content.trim()) return;

  if (!channel.name.toLowerCase().includes('chill')) return;

  const now = Date.now();
  const isMentioned = /فلاكس|flux/i.test(content) || message.mentions.has(message.client?.user?.id);

  // 🧠 قرار التدخل العفوي (الاستجابة التلقائية للرسائل)
  let shouldReply = false;
  if (isMentioned) {
      shouldReply = true;
  } else {
      // سيتدخل بنسبة 85% في رسائل الشات العادية دون الحاجة لذكر اسمه
      if (Math.random() <= CHANCE_TO_CHIME_IN) shouldReply = true;
  }

  if (!shouldReply) {
      // حتى لو لم يرد، سيحفظ الرسالة ليفهم السياق لاحقاً
      addToHistory(channel.id, 'user', `[${author.username}]: ${content}`);
      return;
  }

  // كولداون لمنع السبام إذا كان الشات سريعاً جداً
  if (now - (chillCooldown.get(channel.id) || 0) < AI_COOLDOWN_MS) return;
  chillCooldown.set(channel.id, now);

  const lang  = detectLanguage(content);
  const delay = humanDelay(content.length);

  try {
    await new Promise((r) => setTimeout(r, delay * 0.3));
    await channel.sendTyping().catch(() => {});

    const response = await queryGroq(channel.id, author.username, content, lang);

    await new Promise((r) => setTimeout(r, delay * 0.7));

    // يرسل كرد مباشر إذا تمت منشنته، أو يرسل كرسالة عادية إذا كان يشارك بالسوالف
    if (isMentioned) {
      await message.reply(response);
    } else {
      await channel.send(response);
    }

    console.log(`[EQ-HUMAN] 🧠 تفاعل عاطفي/اجتماعي مع ${author.tag}`);

  } catch (err) {
    console.error('[CHILL] Error:', err.message);
  }
}

module.exports = {
  name: 'chillChat',
  once: false,
  handleChillMessage,
};