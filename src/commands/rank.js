const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateRankCard, getTier }               = require('../utils/rankCard');
const { getUserData, getUserRank, xpForLevel }    = require('../utils/xpSystem');
const { getUserBadges }                           = require('../utils/badges');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('اعرض بطاقة رانكك أو رانك أي عضو.')
        .addUserOption((o) =>
            o.setName('member')
             .setDescription('العضو — اتركه فاضي لرانكك أنت')
             .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const target    = interaction.options.getMember('member') ?? interaction.member;
        const { guild } = interaction;

        try {
            // ── جلب البيانات والترتيب بالتوازي ────────────────────────────────
            const [userData, rankPos] = await Promise.all([
                getUserData(guild.id, target.id),
                getUserRank(guild.id, target.id),
            ]);

            const safeData = userData || {};
            const level    = safeData.level || 0;
            const xp       = safeData.xp    || 0;
            const xpNeeded = xpForLevel(level + 1);

            // ── تأمين كائن الـ Tier ──────────────────────────────────────────
            const tierRaw = getTier(level);
            const tier    = typeof tierRaw === 'string'
                ? { name: tierRaw, emoji: '✦' }
                : (tierRaw || { name: 'مبتدئ', emoji: '✦' });

            // ── الشارات ──────────────────────────────────────────────────────
            let badges = [];
            try {
                if (typeof getUserBadges === 'function') {
                    badges = getUserBadges(guild.id, target.id) || [];
                }
            } catch { /* لا نوقف التنفيذ إذا فشلت الشارات */ }

            // ── دقائق الصوت ──────────────────────────────────────────────────
            let voiceMinutes = 0;
            try {
                const voiceData  = require('../data/voiceTime.json');
                voiceMinutes     = Math.floor((voiceData?.[guild.id]?.[target.id] || 0) / 60);
            } catch {
                voiceMinutes = safeData.voice_xp ? Math.floor(safeData.voice_xp / 10) : 0;
            }

            // ── توليد بطاقة الرانك ───────────────────────────────────────────
            const avatarURL  = target.user.displayAvatarURL({ extension: 'png', size: 256 });

            const rankBuffer = await generateRankCard({
                username:    target.user.username,
                displayName: target.displayName,
                avatarURL,
                level,
                currentXP:   xp,
                xpForNext:   xpNeeded,
                rank:        rankPos ?? '—',
                voiceMinutes,
                badges,
            });

            const attachment = new AttachmentBuilder(buffer, { name: 'rank.gif' });

            await interaction.editReply({
                content: `${tier.emoji} **${target.displayName}** — ${tier.name} • مستوى ${level}`,
                files:   [attachment],
            });

        } catch (error) {
            console.error('[RANK ERROR]:', error);

            // ── رد احتياطي نصي عند الفشل ─────────────────────────────────────
            try {
                const fallback = (await getUserData(guild.id, target.id)) || {};
                const fallbackRank = await getUserRank(guild.id, target.id);

                await interaction.editReply({
                    content: `📊 **إحصائيات ${target.displayName}**\n` +
                             `• المستوى: \`${fallback.level || 0}\`\n` +
                             `• الخبرة:  \`${fallback.xp    || 0}\`\n` +
                             `• الترتيب: \`#${fallbackRank ?? '—'}\``,
                });
            } catch {
                await interaction.editReply({ content: '❌ حدث خطأ غير متوقع. حاول مرة أخرى.' }).catch(() => {});
            }
        }
    },
};