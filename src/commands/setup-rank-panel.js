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

        // ── دالة مساعدة ترسل الخطأ للـ logs ──────────────────────────────────
        async function sendErrorLog(err, stage) {
            try {
                const logChannel = interaction.guild.channels.cache.find(
                    c => c.isTextBased() && c.name.toLowerCase().includes('log')
                );
                if (!logChannel) return;

                const errEmbed = new EmbedBuilder()
                    .setTitle('🔴  خطأ في /setup-rank-panel')
                    .addFields(
                        { name: '📍 المرحلة',   value: stage,                            inline: false },
                        { name: '❌ الخطأ',      value: `\`\`\`${err.message}\`\`\``,    inline: false },
                        { name: '📋 Stack',      value: `\`\`\`${(err.stack || '').slice(0, 500)}\`\`\``, inline: false },
                        { name: '👤 نفّذه',      value: `${interaction.user.tag}`,        inline: true  },
                        { name: '📌 القناة',     value: `${interaction.channel}`,         inline: true  },
                    )
                    .setColor(0xff0000)
                    .setFooter({ text: 'FLUX • IO  |  Error Logger' })
                    .setTimestamp();

                await logChannel.send({ embeds: [errEmbed] });
            } catch (logErr) {
                console.error('[ERROR-LOG] فشل إرسال الخطأ للـ logs:', logErr.message);
            }
        }

        // ── رد فوري عشان ما ينتهي الـ 3 ثواني ──────────────────────────────
        try {
            await interaction.reply({ content: '⏳ جاري الإعداد...', ephemeral: true });
        } catch (err) {
            await sendErrorLog(err, 'interaction.reply — الرد الأولي');
            return;
        }

        // ── بناء الـ Embed ─────────────────────────────────────────────────
        let embed, row;
        try {
            embed = new EmbedBuilder()
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

            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_rank_card')
                    .setLabel('اعرض مستواي')
                    .setEmoji('🏆')
                    .setStyle(ButtonStyle.Primary)
            );
        } catch (err) {
            await sendErrorLog(err, 'بناء EmbedBuilder أو ButtonBuilder');
            await interaction.editReply({ content: `❌ خطأ في بناء البطاقة: \`${err.message}\`` }).catch(() => {});
            return;
        }

        // ── إرسال الـ Embed في القناة ──────────────────────────────────────
        try {
            await interaction.channel.send({ embeds: [embed], components: [row] });
        } catch (err) {
            await sendErrorLog(err, 'interaction.channel.send — إرسال الـ embed');
            await interaction.editReply({ content: `❌ فشل الإرسال: \`${err.message}\`` }).catch(() => {});
            return;
        }

        // ── تأكيد النجاح ──────────────────────────────────────────────────
        try {
            await interaction.editReply({ content: '✅ تم إعداد لوحة الرانك!' });
        } catch (err) {
            await sendErrorLog(err, 'editReply — تأكيد النجاح');
        }
    },
};
