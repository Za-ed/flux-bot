// ─── utils/codeRunner.js ──────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { generate } = require('../core/responseGenerator');

async function handleCodeRun(message) {
    const regex = /```(js|javascript|py|python|cpp|c\+\+|java|c#|php|html|css)\n([\s\S]*?)```/i;
    const match = message.content.match(regex);

    if (!match) return false;

    const lang = match[1].toLowerCase();
    const code = match[2];

    await message.react('🧠').catch(() => {});

    try {
        const codePrompt = `أنت الآن "محاكي برمجيات" (Code Sandbox).
المطلوب منك:
1. تحليل الكود التالي بلغة (${lang}).
2. توقع المخرجات (Output) بدقة وكأنك مترجم حقيقي.
3. إذا كان هناك خطأ برمجي (Syntax Error)، وضحه باختصار شديد.
4. الرد يجب أن يكون فقط بنتيجة التشغيل داخل بلوك نصي.

الكود:
${code}`;

        // محاكاة سياق بسيط للذكاء الاصطناعي
        const context = {
            perception: { lang: 'arabic', dialect: 'none' },
            responseStyle: { style: 'technical' },
            dialectResult: { lang: 'arabic', dialect: 'none' },
            hasAdminRights: false
        };

        const aiResult = await generate({
            context,
            messageHistory: [],
            username: message.author.username,
            userMessage: codePrompt
        });

        const embed = new EmbedBuilder()
            .setTitle('🤖 محاكاة تشغيل الذكاء الاصطناعي')
            .addFields(
                { name: '💻 اللغة', value: `\`${lang}\``, inline: true },
                { name: '📤 النتيجة المتوقعة', value: `\`\`\`text\n${aiResult || 'لا يوجد مخرجات.'}\n\`\`\`` }
            )
            .setColor(0x00ffcc)
            .setFooter({ text: 'FLUX AI • Virtual Execution' });

        await message.reply({ embeds: [embed] });
        return true; // نجح في معالجة الكود

    } catch (err) {
        console.error('[CODE RUNNER ERROR]', err);
        return false;
    }
}

module.exports = { handleCodeRun };