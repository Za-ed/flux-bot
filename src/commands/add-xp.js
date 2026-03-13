const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addManualXP } = require('../utils/xpSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-xp')
        .setDescription('إضافة XP لعضو محدد (للإدارة فقط)')
        .addUserOption(opt => opt.setName('member').setDescription('العضو المراد تزويده').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('كمية الـ XP').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // للمسؤولين فقط

    async execute(interaction) {
        const target = interaction.options.getMember('member');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) return interaction.reply({ content: '❌ الكمية لازم تكون أكثر من صفر!', ephemeral: true });

        await interaction.deferReply();

        try {
            const result = await addManualXP(interaction.guild.id, target.id, amount);

            const embed = new EmbedBuilder()
                .setTitle('✨ تم إضافة XP بنجاح')
                .setDescription(`تم منح **${amount}** XP للعضو ${target}.`)
                .addFields(
                    { name: 'المستوى الحالي', value: `\`${result.user.level}\``, inline: true },
                    { name: 'إجمالي الـ XP', value: `\`${result.user.total_xp}\``, inline: true }
                )
                .setColor(0x2ecc71)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // إذا ارتفع ليفله، نرسل تبريك في القناة
            if (result.leveled) {
                await interaction.followUp(`🎉 كفو! ${target} ارتفع مستواه إلى **المستوى ${result.user.level}** بسبب الهدية!`);
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ حدث خطأ أثناء إضافة الـ XP.');
        }
    }
};