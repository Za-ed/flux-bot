// ─── utils/videoGenerator.js ──────────────────────────────────────────────────
/*const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.Groq_API_KEY || '',
    timeout: 30000,
});

// ─── الكلمات المحفِّزة للفيديو ───────────────────────────────────────────────
const VIDEO_TRIGGERS = [
    'فيديو', 'اصنع فيديو', 'سوي فيديو', 'ارسم فيديو', 'ولد فيديو',
    'video', 'generate video', 'make video', 'create video'
];

function isVideoRequest(content) {
    const lower = content.toLowerCase().trim();
    return VIDEO_TRIGGERS.some(t => lower.startsWith(t) || lower.includes(t));
}

// ─── تحويل الطلب لـ Prompt احترافي للفيديو ──────────────────────────────────
async function extractVideoPrompt(userMessage) {
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 150,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: 'Convert the user request to a detailed English video prompt. Return ONLY the prompt. Describe the scene, camera movement (pan, zoom, tilt), lighting, and motion clearly.',
                },
                { role: 'user', content: userMessage },
            ],
        });
        return completion.choices[0]?.message?.content?.trim() || userMessage;
    } catch {
        return userMessage;
    }
}

// ─── توليد الفيديو من Pollinations ─────────────────────────────────────────
async function generateVideo(prompt) {
    const cleanPrompt = encodeURIComponent(prompt.replace(/['"]/g, '').trim());
    const pollinationsKey = process.env.POLLINATIONS_API_KEY || '';

    // نستخدم نموذج veo مع مدة 4 ثوانٍ (أفضل توازن بين الجودة والسرعة)
    const url = `https://gen.pollinations.ai/video/${cleanPrompt}?model=veo&duration=4`;

    console.log(`[VIDEO-GEN] جاري توليد الفيديو...`);

    // المهلة هنا 120 ثانية (دقيقتين) لأن الفيديو يحتاج وقت للمنتاج والرفع
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 120000); 

    const fetchHeaders = { 
        'User-Agent': 'Mozilla/5.0 FLUX-Bot/1.0' 
    };
    
    if (pollinationsKey) {
        fetchHeaders['Authorization'] = `Bearer ${pollinationsKey}`;
    }

    try {
        const response = await fetch(url, {
            headers: fetchHeaders,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`خطأ من الخادم: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('video')) {
            throw new Error('الخادم لم يرجع ملف فيديو صالح.');
        }

        const buffer     = Buffer.from(await response.arrayBuffer());
        
        // التحقق من حجم الفيديو (ديسكورد يقبل أقصى حد 25MB للسيرفرات العادية)
        const sizeInMB = buffer.length / (1024 * 1024);
        console.log(`[VIDEO-GEN] ✅ نجح التوليد — حجم الفيديو: ${sizeInMB.toFixed(2)} MB`);
        
        const attachment = new AttachmentBuilder(buffer, { name: 'flux_video.mp4' });
        return { attachment };

    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

// ─── Handler الرئيسي للفيديو ───────────────────────────────────────────────
async function handleVideoGeneration(message) {
    const { author, channel, content } = message;
    if (author.bot) return false;

    // التحقق من القنوات المسموحة (نفس قنوات الصور)
    const channelName = channel.name?.toLowerCase() || '';
    const isAllowed   =
        channelName.includes('imag') ||
        channelName.includes('ask')  ||
        channelName.includes('flux') ||
        channelName.includes('chill')||
        channelName.includes('bot')  ||
        channelName.includes('general') ||
        channelName.includes('video');

    if (!isAllowed)              return false;
    if (!isVideoRequest(content)) return false;

    console.log(`[VIDEO-GEN] 🎬 ${author.tag} طلب فيديو: ${content.slice(0, 60)}`);

    const thinking = await message.reply('🎬 جاري إخراج الفيديو... الموضوع بياخذ شوية وقت ⏳').catch(() => null);

    try {
        await channel.sendTyping().catch(() => {});

        const videoPrompt = await extractVideoPrompt(content);
        console.log(`[VIDEO-GEN] Prompt: ${videoPrompt.slice(0, 100)}`);

        const { attachment } = await generateVideo(videoPrompt);

        const embed = new EmbedBuilder()
            .setTitle('🎬 FLUX Video Generator')
            .setDescription(`> ${content.slice(0, 200)}`)
            .addFields(
                { name: '🎥 النموذج', value: '`Veo AI`',  inline: true },
                { name: '⏱️ المدة', value: '`4 ثوانٍ`',    inline: true },
            )
            .setColor(0xff0055)
            .setFooter({
                text:    `FLUX • IO  |  إخراج: ${author.username}`,
                iconURL: author.displayAvatarURL(),
            })
            .setTimestamp();

        if (thinking) await thinking.delete().catch(() => {});
        
        // إرسال الفيديو بدون إضافته داخل الـ Embed (الديسكورد يشغل الـ mp4 بره الـ Embed أفضل)
        await message.reply({ embeds: [embed], files: [attachment] });
        return true;

    } catch (err) {
        console.error('[VIDEO-GEN] ❌ خطأ:', err.message);
        if (thinking) {
            await thinking.edit(
                `❌ فشل توليد الفيديو: \`${err.message}\`\n💡 جرب وصف أسهل أو حاول بعد قليل.`
            ).catch(() => {});
        }
        return true;
    }
}

module.exports = { handleVideoGeneration, isVideoRequest };*/