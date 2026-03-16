// ─── utils/imageGenerator.js ──────────────────────────────────────────────────
// نظام توليد الصور باستخدام Pollinations AI (مجاني — لا يحتاج API key)
// يدعم قناتي ask-flux و imag-gen
// ══════════════════════════════════════════════════════════════════════════════
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.Groq_API_KEY || '',
    timeout: 30000,
});

// ─── الكلمات المحفِّزة لتوليد الصور ─────────────────────────────────────────
const IMAGE_TRIGGERS = [
    // عربي
    'ارسم', 'ارسم لي', 'رسم', 'صورة', 'صوّر', 'صوّرلي', 'توليد صورة',
    'اصنع صورة', 'خلق صورة', 'ابتكر صورة', 'generate image', 'بدي صورة',
    'بدي ارسملي', 'ارسملي', 'رسملي',
    // إنجليزي
    'draw', 'generate', 'create image', 'make image', 'imagine',
    'paint', 'sketch', 'design', 'illustrate',
];

// ─── هل الرسالة تطلب صورة؟ ───────────────────────────────────────────────────
function isImageRequest(content) {
    const lower = content.toLowerCase().trim();
    return IMAGE_TRIGGERS.some(t => lower.startsWith(t) || lower.includes(t));
}

// ─── استخراج الوصف من الرسالة ────────────────────────────────────────────────
async function extractImagePrompt(userMessage, lang = 'arabic') {
    try {
        const completion = await groq.chat.completions.create({
            model:       'llama-3.3-70b-versatile',
            max_tokens:  200,
            temperature: 0.3,
            messages: [
                {
                    role:    'system',
                    content: `أنت مساعد يحوّل طلبات المستخدم إلى وصف دقيق للصورة بالإنجليزية فقط.
قواعد:
- ترجع وصفاً للصورة بالإنجليزية فقط (لا شرح، لا مقدمة)
- الوصف يجب أن يكون تفصيلياً واحترافياً
- اذكر الأسلوب الفني (مثل: digital art, photorealistic, oil painting, anime...)
- الوصف لا يتجاوز 150 كلمة
- ممنوع محتوى غير لائق أو عنيف`,
                },
                {
                    role:    'user',
                    content: `حوّل هذا الطلب لوصف صورة احترافي: "${userMessage}"`,
                },
            ],
        });
        return completion.choices[0]?.message?.content?.trim() || userMessage;
    } catch {
        // fallback: نرجع الرسالة كما هي
        return userMessage;
    }
}

// ─── توليد الصورة عبر Pollinations AI ────────────────────────────────────────
async function generateImage(prompt, options = {}) {
    const {
        width  = 1024,
        height = 1024,
        model  = 'flux',    // flux أفضل جودة
        seed   = Math.floor(Math.random() * 999999),
    } = options;

    // تنظيف الـ prompt من رموز خاصة
    const cleanPrompt = encodeURIComponent(
        prompt.replace(/['"]/g, '').trim()
    );

    // Pollinations API — مجاني وبدون API key
    const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&enhance=true`;

    // جلب الصورة
    const response = await fetch(url, {
        headers: { 'User-Agent': 'FLUX-Discord-Bot/1.0' },
    });

    if (!response.ok) {
        throw new Error(`Pollinations API error: ${response.status}`);
    }

    const buffer     = Buffer.from(await response.arrayBuffer());
    const attachment = new AttachmentBuilder(buffer, { name: 'flux_art.png' });

    return { attachment, url, seed };
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleImageGeneration(message) {
    const { author, channel, content } = message;
    if (author.bot) return false;

    // فحص القناة
    const channelName = channel.name?.toLowerCase() || '';
    const isImageChannel = channelName.includes('imag') || channelName.includes('image-gen');
    const isAskFlux      = channelName.includes('ask-flux');

    if (!isImageChannel && !isAskFlux) return false;

    // فحص إذا كان الطلب للصورة
    if (!isImageRequest(content)) return false;

    // ── بدء التوليد ──────────────────────────────────────────────────────────
    const thinking = await message.reply('🎨 جاري رسم الصورة... قد يأخذ 10-20 ثانية ⏳').catch(() => null);

    try {
        await channel.sendTyping().catch(() => {});

        // تحويل الطلب لـ prompt احترافي
        const lang         = /[\u0600-\u06FF]/.test(content) ? 'arabic' : 'english';
        const imagePrompt  = await extractImagePrompt(content, lang);

        console.log(`[IMAGE-GEN] ${author.tag}: ${imagePrompt.slice(0, 80)}...`);

        // توليد الصورة
        const { attachment, seed } = await generateImage(imagePrompt, {
            width:  isImageChannel ? 1024 : 768,
            height: isImageChannel ? 1024 : 768,
            model:  'flux',
        });

        // ── بناء الـ Embed ────────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🎨  FLUX Art Generator')
            .setDescription(`> ${content.slice(0, 200)}`)
            .setImage('attachment://flux_art.png')
            .addFields(
                { name: '🖌️ الأسلوب',   value: '`Flux — AI Art`', inline: true },
                { name: '📐 الحجم',      value: isImageChannel ? '`1024×1024`' : '`768×768`', inline: true },
                { name: '🎲 Seed',       value: `\`${seed}\``, inline: true },
            )
            .setColor(0x6c35de)
            .setFooter({
                text:    `FLUX • IO  |  طلب من ${author.username}`,
                iconURL: author.displayAvatarURL(),
            })
            .setTimestamp();

        // حذف رسالة "جاري الرسم"
        if (thinking) await thinking.delete().catch(() => {});

        await message.reply({ embeds: [embed], files: [attachment] });
        return true;

    } catch (err) {
        console.error('[IMAGE-GEN] Error:', err.message);
        if (thinking) {
            await thinking.edit(`❌ فشل توليد الصورة: \`${err.message}\``).catch(() => {});
        }
        return true;
    }
}

module.exports = { handleImageGeneration, isImageRequest };