// ─── commands/setup-rank-panel.js ────────────────────────────────────────────
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-rank-panel')
        .setDescription('إعداد لوحة الرانك في القناة الحالية.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // ✅ reply فوري بدل defer — يمنع timeout
        await interaction.reply({ content: '⏳ جاري الإعداد...', ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('🏆  بطاقة مستواك')
                .setDescription(
                    '> اضغط على الزر أدناه لعرض بطاقة مستواك الخاصة!\n\n' +
                    '📊 **ستظهر لك:**\n' +
                    '• مستواك الحالي ورتبتك في السيرفر\n' +
                    '• شريط تقدمك للمستوى القادم\n' +
                    '• XP الكلي وإحصائيات الصوت\n\n' +
                    '_سيتم فتح ثريد خاص بك ويُحذف تلقائياً بعد دقيقتين._'
                )
                .setColor(0x1e90ff)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ text: 'FLUX • IO  |  نظام المستويات' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_rank_card')
                    .setLabel('اعرض مستواي')
                    .setEmoji('🏆')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: '✅ تم إعداد لوحة الرانك!' });

        } catch (err) {
            console.error('[SETUP-RANK-PANEL]', err.message);
            await interaction.editReply({ content: `❌ خطأ: \`${err.message}\`` }).catch(() => {});
        }
    },
};