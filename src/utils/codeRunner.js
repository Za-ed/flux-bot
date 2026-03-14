const { EmbedBuilder } = require('discord.js');
const { generate } = require('../core/responseGenerator');

async function handleCodeRun(message) {
    // 1. التحقق من وجود بلوك كود ولغة مدعومة
    const regex = /```(js|javascript|py|python|cpp|c\+\+|java|c#|php|html|css)\n([\s\S]*?)```/i;
    const match = message.content.match(regex);

    if (!match) return false;

    const lang = match[1].toLowerCase();
    const code = match[2];

    await message.react('🧠').catch(() => {});

    try {
        // 2. إعداد "برومبت" خاص للذكاء الاصطناعي ليعمل كمحاكي نظام
        const codePrompt = `
أنت الآن "محاكي برمجيات" (Code Sandbox). 
المطلوب منك:
1. تحليل الكود التالي بلغة (${lang}).
2. توقع المخرجات (Output) بدقة وكأنك مترجم رسمي.
3. إذا كان هناك خطأ برمي (Syntax Error)، وضحه باختصار.
4. الرد يجب أن يكون فقط بنتيجة التشغيل داخل بلوك نصي.

الكود:
${code}
        `;

        // 3. استدعاء الذكاء الاصطناعي (باستخدام نفس الـ API الخاص بك)
        const aiResult = await generate({
            context: { perception: { lang: 'arabic' }, responseStyle: { style: 'technical' } },
            messageHistory: [],
            username: message.author.username,
            userMessage: codePrompt
        });

        // 4. تنسيق النتيجة في Embed فخم
        const embed = new EmbedBuilder()
            .setTitle('🤖 محاكاة تشغيل الذكاء الاصطناعي')
            .setDescription(`تم تحليل كود **${lang.toUpperCase()}** بنجاح.`)
            .addFields(
                { name: '💻 الكود المرسل', value: `\`\`\`${lang}\n${code.slice(0, 200)}${code.length > 200 ? '...' : ''}\n\`\`\`` },
                { name: '📤 المخرجات المتوقعة', value: `\`\`\`text\n${aiResult || 'لا يوجد مخرجات نصية.'}\n\`\`\`` }
            )
            .setColor(0x00ffcc)
            .setFooter({ text: 'FLUX AI • Virtual Execution Environment' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        return true;

    } catch (err) {
        console.error('[VISION CODE ERROR]', err);
        await message.reply('❌ فشل الذكاء الاصطناعي في تحليل الكود حالياً.');
        return true;
    }
}

module.exports = { handleCodeRun };