// ─── utils/aiNewsScheduler.js ─────────────────────────────────────────────────
// يُرسل تقرير أخبار AI يومياً الساعة 8:00 PM (UTC+3 = 17:00 UTC)
// ══════════════════════════════════════════════════════════════════════════════
require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.Groq_API_KEY || '',
    timeout: 60000,
});

// 8:00 PM UTC+3 = 17:00 UTC
const NEWS_HOUR_UTC = 17;

// اسم قناة الأخبار
const NEWS_CHANNEL_KEYWORD = 'ai-news';

// ─── بناء البرومبت ────────────────────────────────────────────────────────────
function buildNewsPrompt() {
    const today = new Date().toLocaleDateString('ar-SA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Amman',
    });

    return `أنت صحفي تقني متخصص في مجال الذكاء الاصطناعي والتكنولوجيا.
مهمتك: كتابة تقرير يومي شامل عن أهم أحداث يوم ${today} في مجال:
- الذكاء الاصطناعي (AI) وتطوراته
- نماذج اللغة الكبيرة (LLMs)
- تقنية المعلومات والبرمجيات
- الشركات التقنية الكبرى (OpenAI, Google, Meta, Microsoft, Anthropic, xAI...)
- أدوات وتطبيقات AI الجديدة

التقرير يجب أن:
1. يكون باللغة العربية الفصحى السهلة
2. يغطي 5-7 أحداث مهمة مرتبة من الأهم للأقل
3. لكل حدث: عنوان قصير + شرح مختصر (2-3 جمل) + أهميته
4. يُذكر المصادر المحتملة (مواقع: TechCrunch, The Verge, OpenAI Blog, Google Blog, Reuters Tech...)
5. ينتهي بـ "رأي المحرر": جملتان عن أهم توجه لاحظته اليوم

الشكل المطلوب (JSON فقط بدون أي نص خارجه):
{
  "headline": "عنوان رئيسي جذاب لليوم",
  "summary": "ملخص اليوم في جملتين",
  "events": [
    {
      "title": "عنوان الحدث",
      "body": "شرح مختصر",
      "importance": "عالية|متوسطة|منخفضة",
      "source": "اسم المصدر"
    }
  ],
  "editor_note": "رأي المحرر"
}`;
}

// ─── إنشاء الـ Embed ──────────────────────────────────────────────────────────
function buildNewsEmbed(data, client) {
    const today = new Date().toLocaleDateString('ar-SA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Amman',
    });

    const importanceEmoji = { 'عالية': '🔴', 'متوسطة': '🟡', 'منخفضة': '🟢' };

    const embed = new EmbedBuilder()
        .setTitle(`📡  ${data.headline}`)
        .setDescription(
            `> ${data.summary}\n\n` +
            `📅 **${today}** | 🕗 تقرير الساعة 8 مساءً`
        )
        .setColor(0x6c35de)
        .setThumbnail('https://cdn.discordapp.com/emojis/1234567890.png') // اختياري
        .setFooter({
            text: 'FLUX • IO  |  تقرير الذكاء الاصطناعي اليومي — يصدر كل يوم 8 مساءً',
            iconURL: client?.user?.displayAvatarURL(),
        })
        .setTimestamp();

    // إضافة الأحداث
    (data.events || []).forEach((ev, i) => {
        const emoji = importanceEmoji[ev.importance] || '⚪';
        embed.addFields({
            name:  `${emoji}  ${i + 1}. ${ev.title}`,
            value: `${ev.body}\n> 📰 *المصدر: ${ev.source || 'غير محدد'}*`,
        });
    });

    // رأي المحرر
    if (data.editor_note) {
        embed.addFields({
            name:  '✍️  رأي المحرر',
            value: `*${data.editor_note}*`,
        });
    }

    return embed;
}

// ─── جلب الأخبار وإرسالها ────────────────────────────────────────────────────
async function sendAINews(client) {
    console.log('[AI-NEWS] 🤖 جاري إعداد تقرير الذكاء الاصطناعي...');

    try {
        // ── استدعاء Groq مع بحث واسع ────────────────────────────────────────
        const completion = await groq.chat.completions.create({
            model:       'llama-3.3-70b-versatile',
            max_tokens:  2500,
            temperature: 0.4,
            messages: [
                {
                    role:    'system',
                    content: 'أنت صحفي تقني محترف. ترد دائماً بـ JSON صحيح فقط بدون أي نص إضافي.',
                },
                {
                    role:    'user',
                    content: buildNewsPrompt(),
                },
            ],
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '';

        // ── تنظيف وparse الـ JSON ─────────────────────────────────────────────
        let data;
        try {
            const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            data = JSON.parse(cleaned);
        } catch {
            console.error('[AI-NEWS] فشل parse JSON:', raw.slice(0, 200));
            // Fallback embed بسيط
            data = {
                headline:     'تقرير الذكاء الاصطناعي اليومي',
                summary:      'تعذّر تحليل البيانات اليوم، سنعود غداً بتقرير أكثر تفصيلاً.',
                events:       [],
                editor_note:  'نعتذر عن أي إزعاج.',
            };
        }

        const embed = buildNewsEmbed(data, client);

        // ── إيجاد قناة AI-NEWS في كل السيرفرات ──────────────────────────────
        let sent = 0;
        for (const guild of client.guilds.cache.values()) {
            const channel = guild.channels.cache.find(
                c => c.isTextBased() &&
                     c.name.toLowerCase().includes(NEWS_CHANNEL_KEYWORD) &&
                     c.permissionsFor(guild.members.me)?.has('SendMessages')
            );

            if (channel) {
                await channel.send({ embeds: [embed] });
                sent++;
                console.log(`[AI-NEWS] ✅ أُرسل في ${guild.name} → #${channel.name}`);
            } else {
                console.warn(`[AI-NEWS] ⚠️ ما لقيت قناة ${NEWS_CHANNEL_KEYWORD} في ${guild.name}`);
            }
        }

        console.log(`[AI-NEWS] ✅ تم الإرسال في ${sent} سيرفر`);

    } catch (err) {
        console.error('[AI-NEWS] ❌ خطأ:', err.message);
    }
}

// ─── جدولة الإرسال اليومي ─────────────────────────────────────────────────────
function scheduleAINews(client) {
    function msToNewsTime() {
        const now    = new Date();
        const target = new Date(now);

        // 8:00 PM UTC+3 = 17:00 UTC
        target.setUTCHours(NEWS_HOUR_UTC, 0, 0, 0);

        if (target <= now) {
            target.setUTCDate(target.getUTCDate() + 1);
        }

        return target - now;
    }

    async function runNews() {
        await sendAINews(client);
        // جدول للمرة القادمة
        setTimeout(runNews, msToNewsTime());
    }

    const delay = msToNewsTime();
    const mins  = Math.round(delay / 60000);
    const hrs   = Math.floor(mins / 60);
    const rem   = mins % 60;
    console.log(`[AI-NEWS] ⏰ التقرير القادم بعد ${hrs}h ${rem}m (8:00 PM توقيت UTC+3)`);
    setTimeout(runNews, delay);
}

module.exports = { scheduleAINews };