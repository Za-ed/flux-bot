// ─── commands/badges.js ───────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ALL_BADGES, getUserBadges, formatBadges } = require('../utils/badges');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('badges')
        .setDescription('عرض شاراتك أو شارات عضو آخر.')
        .addUserOption(opt =>
            opt.setName('member')
               .setDescription('العضو المراد عرض شاراته (اتركه فارغاً لشاراتك).')
               .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser   = interaction.options.getUser('member') ?? interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const guildId = interaction.guild.id;
        const userId  = targetUser.id;

        const ownedIds = getUserBadges(guildId, userId);

        // ── تقسيم الشارات إلى مكتسبة وغير مكتسبة ────────────────────────────
        const owned   = ALL_BADGES.filter(b => ownedIds.includes(b.id));
        const missing = ALL_BADGES.filter(b => !ownedIds.includes(b.id));

        // ── بناء قسم الشارات المكتسبة ────────────────────────────────────────
        const ownedLines = owned.length > 0
            ? owned.map(b => `${b.emoji} **${b.name}** — _${b.desc}_`).join('\n')
            : '_لا توجد شارات مكتسبة بعد._';

        // ── بناء قسم الشارات المتاحة (غير المكتسبة) حسب النوع ────────────────
        const levelBadges   = missing.filter(b => b.type === 'level');
        const achievBadges  = missing.filter(b => b.type !== 'level' && b.type !== 'special');
        const specialBadges = missing.filter(b => b.type === 'special');

        const missingLines = [];
        if (levelBadges.length)
            missingLines.push(
                '**🏅 مستويات:**\n' +
                levelBadges.map(b => `> ${b.emoji} ~~${b.name}~~ — المستوى ${b.threshold}`).join('\n')
            );
        if (achievBadges.length)
            missingLines.push(
                '**🎯 إنجازات:**\n' +
                achievBadges.map(b => `> ${b.emoji} ~~${b.name}~~ — ${b.desc}`).join('\n')
            );
        if (specialBadges.length)
            missingLines.push(
                '**⭐ خاصة:**\n' +
                specialBadges.map(b => `> ${b.emoji} ~~${b.name}~~ — ${b.desc}`).join('\n')
            );

        // ── نسبة الاكتمال ─────────────────────────────────────────────────────
        const total      = ALL_BADGES.length;
        const pct        = total > 0 ? Math.round((owned.length / total) * 100) : 0;
        const barFilled  = Math.round(pct / 10);
        const progressBar = `\`${'█'.repeat(barFilled)}${'░'.repeat(10 - barFilled)}\` ${pct}%`;

        const embed = new EmbedBuilder()
            .setTitle(`🏅  شارات ${targetMember?.displayName ?? targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name:  `✅ المكتسبة (${owned.length}/${total})`,
                    value: ownedLines,
                },
                {
                    name:  '📊 التقدم',
                    value: progressBar,
                    inline: false,
                },
            )
            .setColor(owned.length === total ? 0xf1c40f : owned.length > 0 ? 0x1e90ff : 0x95a5a6)
            .setFooter({ text: 'FLUX • IO  |  نظام الشارات' })
            .setTimestamp();

        // ── أضف قسم الناقصة فقط لو في مساحة ─────────────────────────────────
        if (missingLines.length > 0) {
            embed.addFields({
                name:  `🔒 غير مكتسبة (${missing.length})`,
                value: missingLines.join('\n\n').slice(0, 1000), // حد Discord
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};