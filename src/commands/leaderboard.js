// ─── commands/leaderboard.js ──────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard, xpForLevel } = require('../utils/xpSystem'); // ✅ من xpSystem مباشرة

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('عرض أعلى 10 أعضاء في المستويات.'),

    async execute(interaction) {
        await interaction.deferReply();

        // ── جلب البيانات من MongoDB ────────────────────────────────────────
        const lb = await getLeaderboard(interaction.guild.id, 10);

        if (!lb || lb.length === 0) {
            return interaction.editReply({
                content: '❌ لا يوجد بيانات بعد. ابدأوا بالكلام! 💬',
            });
        }

        const medals = ['🥇', '🥈', '🥉'];

        // ── جلب أسماء الأعضاء دفعة واحدة ─────────────────────────────────
        const memberIds     = lb.map((e) => e.user_id);
        const fetchedNames  = new Map();

        await Promise.allSettled(
            memberIds.map((id) =>
                interaction.guild.members.fetch(id)
                    .then((m) => fetchedNames.set(id, m.displayName || m.user.username))
                    .catch(() => fetchedNames.set(id, null))
            )
        );

        // ── بناء الأسطر ────────────────────────────────────────────────────
        const lines = lb.map((entry, i) => {
            const name      = fetchedNames.get(entry.user_id) ?? `<@${entry.user_id}>`;
            const prefix    = medals[i] ?? `**${i + 1}.**`;
            const level     = entry.level     ?? 0;
            const totalXP   = entry.total_xp  ?? 0;
            const currentXP = entry.xp        ?? 0;
            const xpNeeded  = xpForLevel(level + 1);

            // شريط XP مصغر
            const bar = buildProgressBar(currentXP, xpNeeded, 8);

            return (
                `${prefix} **${name}**\n` +
                `> ⭐ المستوى **${level}** • ${bar} • ${currentXP}/${xpNeeded} XP\n` +
                `> 📊 المجموع الكلي: **${totalXP.toLocaleString()}** XP`
            );
        });

        // ── بناء الـ Embed ─────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🏆  لوحة المتصدرين — FLUX IO')
            .setDescription(lines.join('\n\n'))
            .setColor(0xf1c40f)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setFooter({
                text: `FLUX • IO  |  نظام المستويات • ${lb.length} أعضاء`,
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

// ─── Helper: شريط تقدم مصغر ──────────────────────────────────────────────────
function buildProgressBar(current, max, size = 8) {
    if (max <= 0) return '`░░░░░░░░`';
    const filled = Math.round((current / max) * size);
    const empty  = size - filled;
    return `\`${'█'.repeat(Math.max(0, filled))}${'░'.repeat(Math.max(0, empty))}\``;
}