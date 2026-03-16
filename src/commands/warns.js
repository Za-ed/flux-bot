// ─── commands/warns.js ────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isModerator }                       = require('../utils/permissions');
const { getWarnings }                       = require('../utils/warningsDB');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warns')
        .setDescription('عرض تحذيرات عضو.')
        .addUserOption(opt =>
            opt.setName('member')
               .setDescription('العضو المراد عرض تحذيراته.')
               .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!isModerator(interaction.member))
            return interaction.editReply({ content: '❌ هذا الأمر للـ Moderator والأعلى فقط.' });

        const target = interaction.options.getMember('member');
        if (!target)
            return interaction.editReply({ content: '❌ العضو غير موجود.' });

        const { total, warns } = await getWarnings(interaction.guild.id, target.id);

        if (total === 0) {
            return interaction.editReply({
                content: `✅ **${target.user.tag}** ليس عنده أي تحذيرات.`,
            });
        }

        // ── بناء قائمة التحذيرات ──────────────────────────────────────────────
        const lines = warns.slice(-10).map((w, i) => {
            const date = new Date(w.timestamp || w.date).toLocaleDateString('ar-SA');
            return `**${i + 1}.** ${w.reason}\n> 🛡️ ${w.moderator} • 📅 ${date}`;
        });

        if (warns.length > 10) {
            lines.unshift(`_(يُعرض آخر 10 من أصل ${total})_\n`);
        }

        // ── لون حسب عدد التحذيرات ─────────────────────────────────────────────
        const color = total >= 5 ? 0xff0000 : total >= 3 ? 0xff4444 : 0xffa500;

        const embed = new EmbedBuilder()
            .setTitle(`⚠️  تحذيرات ${target.user.tag}`)
            .setDescription(lines.join('\n\n'))
            .addFields({ name: '🔢 المجموع', value: `**${total}** تحذير`, inline: true })
            .setColor(color)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
            .setTimestamp();

        // ── تنبيه إذا وصل للحد الحرج ─────────────────────────────────────────
        if (total >= 5) {
            embed.setDescription(
                `🚨 **تحذير: وصل لـ ${total} تحذيرات — يستحق إجراءً!**\n\n` + lines.join('\n\n')
            );
        }

        await interaction.editReply({ embeds: [embed] });
    },
};