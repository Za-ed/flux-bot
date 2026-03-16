// ─── commands/clearwarns.js ───────────────────────────────────────────────────
const { SlashCommandBuilder } = require('discord.js');
const { isAdmin }             = require('../utils/permissions');
const { clearWarnings }       = require('../utils/warningsDB'); // ✅ MongoDB

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('مسح كل تحذيرات عضو.')
        .addUserOption(o =>
            o.setName('member').setDescription('العضو').setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!isAdmin(interaction.member))
            return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });

        const target = interaction.options.getMember('member');
        if (!target)
            return interaction.editReply({ content: '❌ العضو غير موجود.' });

        const cleared = await clearWarnings(interaction.guild.id, target.id);

        await interaction.editReply({
            content: cleared > 0
                ? `✅ تم مسح **${cleared} تحذير** من ${target.user.tag}`
                : `ℹ️ ${target.user.tag} ما عنده تحذيرات أصلاً.`,
        });

        console.log(`[WARNS] ${interaction.user.tag} مسح ${cleared} تحذير من ${target.user.tag}`);
    },
};