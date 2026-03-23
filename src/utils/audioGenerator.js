// ─── utils/audioGenerator.js ──────────────────────────────────────────────────
/*const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || process.env.Groq_API_KEY || '',
    timeout: 30000,
});

// ─── الكلمات المحفِّزة للصوت والموسيقى ─────────────────────────────────────────
const AUDIO_TRIGGERS = [
    'صوت', 'انطق', 'تحدث', 'سجل', 'موسيقى', 'لحن', 'اغنية', 'أغنية',
    'voice', 'speak', 'say', 'music', 'song', 'sing'
];

function isAudioRequest(content) {
    const lower = content.toLowerCase().trim();
    return AUDIO_TRIGGERS.some(t => lower.startsWith(t) || lower.includes(t));
}

// ─── تنظيف الطلب (فصل الأمر عن النص المطلوب نطقه) ──────────────────────────
async function extractAudioPrompt(userMessage) {
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 150,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: 'You are an AI assistant. If the user wants text-to-speech, extract ONLY the exact text they want spoken. If they want music, translate/format the request into a short English music description. Return ONLY the final text or prompt without any explanations.',
                },
                { role: 'user', content: userMessage },
            ],
        });
        return completion.choices[0]?.message?.content?.trim() || userMessage;
    } catch {
        return userMessage;
    }
}

// ─── توليد الصوت من Pollinations ───────────────────────────────────────────
async function generateAudio(prompt) {
    const cleanPrompt = encodeURIComponent(prompt.trim());
    const pollinationsKey = process.env.POLLINATIONS_API_KEY || '';

    // مسار الصوت يدعم النطق والموسيقى
    const url = `https://gen.pollinations.ai/audio/${cleanPrompt}`;

    console.log(`[AUDIO-GEN] جاري توليد الصوت...`);

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 60000); // دقيقة كحد أقصى

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
        if (!contentType.includes('audio')) {
            throw new Error('الخادم لم يرجع ملف صوتي صالح.');
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const attachment = new AttachmentBuilder(buffer, { name: 'flux_audio.mp3' });
        
        console.log(`[AUDIO-GEN] ✅ نجح التوليد — حجم الملف: ${(buffer.length / 1024).toFixed(2)} KB`);
        return { attachment };

    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

// ─── Handler الرئيسي للصوت ──────────────────────────────────────────────────
async function handleAudioGeneration(message) {
    const { author, channel, content } = message;
    if (author.bot) return false;

    const channelName = channel.name?.toLowerCase() || '';
    const isAllowed   =
        channelName.includes('imag') ||
        channelName.includes('ask')  ||
        channelName.includes('flux') ||
        channelName.includes('chill')||
        channelName.includes('bot')  ||
        channelName.includes('voice')||
        channelName.includes('general');

    if (!isAllowed)               return false;
    if (!isAudioRequest(content)) return false;

    console.log(`[AUDIO-GEN] 🔊 ${author.tag} طلب صوت: ${content.slice(0, 60)}`);

    const thinking = await message.reply('🔊 جاري تحضير الصوت... ⏳').catch(() => null);

    try {
        await channel.sendTyping().catch(() => {});

        const audioPrompt = await extractAudioPrompt(content);
        console.log(`[AUDIO-GEN] Prompt: ${audioPrompt.slice(0, 100)}`);

        const { attachment } = await generateAudio(audioPrompt);

        const embed = new EmbedBuilder()
            .setTitle('🔊 FLUX Audio Generator')
            .setDescription(`> ${content.slice(0, 200)}`)
            .setColor(0x00ffaa)
            .setFooter({
                text:    `FLUX • IO  |  طلب من: ${author.username}`,
                iconURL: author.displayAvatarURL(),
            })
            .setTimestamp();

        if (thinking) await thinking.delete().catch(() => {});
        
        // إرسال الملف الصوتي مع الرسالة
        await message.reply({ embeds: [embed], files: [attachment] });
        return true;

    } catch (err) {
        console.error('[AUDIO-GEN] ❌ خطأ:', err.message);
        if (thinking) {
            await thinking.edit(
                `❌ فشل توليد الصوت: \`${err.message}\`\n💡 حاول مرة ثانية بعد قليل.`
            ).catch(() => {});
        }
        return true;
    }
}

module.exports = { handleAudioGeneration, isAudioRequest };*/