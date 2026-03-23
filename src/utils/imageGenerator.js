// ─── utils/imageGenerator.js ──────────────────────────────────────────────────
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.Groq_API_KEY || '',
    timeout: 30000,
});

// ─── الكلمات المحفِّزة ────────────────────────────────────────────────────────
const IMAGE_TRIGGERS = [
    'ارسم', 'رسم لي', 'رسملي', 'ارسم لي', 'ارسملي',
    'صورة', 'صوّر', 'صوّرلي', 'صورلي', 'صور لي',
    'توليد صورة', 'ولّد صورة', 'اصنع صورة', 'ابتكر صورة',
    'بدي صورة', 'بدي ارسم', 'بدي رسم', 'حابب صورة',
    'خلق صورة', 'اعمللي صورة', 'عمللي صورة',
    'draw', 'generate image', 'create image', 'make image',
    'imagine', 'paint', 'sketch', 'illustrate', 'img:', '/imagine',
];

function isImageRequest(content) {
    const lower = content.toLowerCase().trim();
    return IMAGE_TRIGGERS.some(t => lower.startsWith(t) || lower.includes(t));
}

// ─── تحويل الطلب لـ prompt ────────────────────────────────────────────────────
async function extractImagePrompt(userMessage) {
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 150,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: 'Convert the user request to a detailed English image prompt. Return ONLY the prompt, no explanation. Include art style like: digital art, photorealistic, anime, oil painting, etc.',
                },
                { role: 'user', content: userMessage },
            ],
        });
        return completion.choices[0]?.message?.content?.trim() || userMessage;
    } catch {
        return userMessage;
    }
}

// ─── توليد الصورة مع retry ────────────────────────────────────────────────────
async function generateImage(prompt, retries = 3) {
    const seed = Math.floor(Math.random() * 999999);
    const cleanPrompt = encodeURIComponent(prompt.replace(/['"]/g, '').trim());

    // قائمة APIs للـ fallback
    const APIS = [
        // Pollinations - نموذج flux
        `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true&enhance=true`,
        // Pollinations - نموذج turbo (أسرع)
        `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=turbo&seed=${seed}&nologo=true`,
        // Pollinations - بدون خيارات (أبسط)
        `https://image.pollinations.ai/prompt/${cleanPrompt}?width=768&height=768&seed=${seed}`,
    ];

    for (let attempt = 0; attempt < APIS.length; attempt++) {
        const url = APIS[attempt];
        try {
            console.log(`[IMAGE-GEN] محاولة ${attempt + 1}/${APIS.length}...`);

            const controller = new AbortController();
            const timeout    = setTimeout(() => controller.abort(), 25000); // 25 ثانية

            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 FLUX-Bot/1.0' },
                signal:  controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                console.warn(`[IMAGE-GEN] API ${attempt + 1} فشل: ${response.status} - جرب التالي`);
                continue;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('image')) {
                console.warn(`[IMAGE-GEN] API ${attempt + 1} ما أرجع صورة: ${contentType}`);
                continue;
            }

            const buffer     = Buffer.from(await response.arrayBuffer());
            const attachment = new AttachmentBuilder(buffer, { name: 'flux_art.png' });

            console.log(`[IMAGE-GEN] ✅ نجح API ${attempt + 1} — حجم: ${buffer.length} bytes`);
            return { attachment, seed, apiUsed: attempt + 1 };

        } catch (err) {
            console.warn(`[IMAGE-GEN] API ${attempt + 1} خطأ: ${err.message}`);
            if (attempt < APIS.length - 1) {
                await new Promise(r => setTimeout(r, 1500)); // انتظر 1.5 ثانية
            }
        }
    }

    throw new Error('كل APIs فشلت — جرب مرة ثانية بعد قليل');
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleImageGeneration(message) {
    const { author, channel, content } = message;
    if (author.bot) return false;

    const channelName = channel.name?.toLowerCase() || '';
    const isAllowed   =
        channelName.includes('imag') ||
        channelName.includes('ask')  ||
        channelName.includes('flux') ||
        channelName.includes('chill')||
        channelName.includes('bot')  ||
        channelName.includes('general');

    if (!isAllowed)              return false;
    if (!isImageRequest(content)) return false;

    console.log(`[IMAGE-GEN] 🎨 ${author.tag} في #${channel.name}: ${content.slice(0, 60)}`);

    const thinking = await message.reply('🎨 جاري رسم الصورة... ⏳').catch(() => null);

    try {
        await channel.sendTyping().catch(() => {});

        const imagePrompt = await extractImagePrompt(content);
        console.log(`[IMAGE-GEN] Prompt: ${imagePrompt.slice(0, 100)}`);

        const { attachment, seed } = await generateImage(imagePrompt);

        const embed = new EmbedBuilder()
            .setTitle('🎨  FLUX Art Generator')
            .setDescription(`> ${content.slice(0, 200)}`)
            .setImage('attachment://flux_art.png')
            .addFields(
                { name: '🖌️ الأسلوب', value: '`Flux AI Art`',  inline: true },
                { name: '📐 الحجم',    value: '`1024×1024`',    inline: true },
                { name: '🎲 Seed',     value: `\`${seed}\``,    inline: true },
            )
            .setColor(0x6c35de)
            .setFooter({
                text:    `FLUX • IO  |  طلب من ${author.username}`,
                iconURL: author.displayAvatarURL(),
            })
            .setTimestamp();

        if (thinking) await thinking.delete().catch(() => {});
        await message.reply({ embeds: [embed], files: [attachment] });
        return true;

    } catch (err) {
        console.error('[IMAGE-GEN] ❌ نهائي:', err.message);
        if (thinking) {
            await thinking.edit(
                `❌ فشل توليد الصورة: \`${err.message}\`\n💡 جرب مرة ثانية أو غيّر الوصف`
            ).catch(() => {});
        }
        return true;
    }
}

module.exports = { handleImageGeneration, isImageRequest };