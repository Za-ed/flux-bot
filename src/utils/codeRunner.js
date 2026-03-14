const { exec } = require('child_process');
const { EmbedBuilder } = require('discord.js');

async function handleCodeRun(message) {
    // نتحقق أن الرسالة تبدأ بـ ``` (Code Block)
    if (!message.content.startsWith('```') || message.author.bot) return;

    const regex = /```(js|javascript|py|python)\n([\s\S]*?)```/;
    const match = message.content.match(regex);

    if (!match) return;

    const lang = match[1];
    const code = match[2];

    // إظهار ريأكشن أن البوت بدأ يعالج الكود
    await message.react('⚙️').catch(() => {});

    let command = '';
    if (['js', 'javascript'].includes(lang)) {
        command = `node -e "${code.replace(/"/g, '\\"')}"`;
    } else if (['py', 'python'].includes(lang)) {
        command = `python3 -c "${code.replace(/"/g, '\\"')}"`;
    }

    if (!command) return;

    exec(command, { timeout: 5000 }, async (error, stdout, stderr) => {
        const output = stdout || stderr || (error ? error.message : 'No output');
        
        const embed = new EmbedBuilder()
            .setTitle('🖥️ مخرجات الكود')
            .setColor(stderr || error ? 0xff4444 : 0x2ecc71)
            .addFields(
                { name: 'اللغة', value: `\`${lang}\``, inline: true },
                { name: 'الحالة', value: stderr || error ? '❌ خطأ' : '✅ نجاح', inline: true },
                { name: 'النتيجة', value: `\`\`\`text\n${output.slice(0, 1000)}\n\`\`\`` }
            )
            .setFooter({ text: 'FLUX Bot • Code Runner' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    });
}

module.exports = { handleCodeRun };