// ─── rank.js ──────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('اعرض بطاقة رتبتك أو رتبة عضو آخر.')
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو').setRequired(false)
    ),

  async execute(interaction) {
    // ✅ deferReply أول شيء — يعطي البوت 15 دقيقة بدل 3 ثواني
    try {
      await interaction.deferReply();
    } catch {
      return; // Interaction expired قبل ما نوصلها
    }

    try {
      // ✅ Lazy requires — لو أي ملف فيه مشكلة، نعرف مباشرة
      const leveling = require('../events/leveling');
      const voiceXP  = require('../events/voiceXP');
      const { formatBadges }     = require('../utils/badges');
      const { generateRankCard } = require('../utils/rankCard');
      const { AttachmentBuilder: AB } = require('discord.js');

      const target   = interaction.options.getMember('member') ?? interaction.member;
      const user     = target.user;
      const guildId  = interaction.guild.id;

      const userData  = leveling.getUserData(guildId, user.id);
      const level     = leveling.getLevelFromXp(userData.xp);
      const currentXp = leveling.getXpInCurrentLevel(userData.xp);
      const neededXp  = leveling.xpForLevel(level + 1);

      const lb   = leveling.getLeaderboard(guildId, 100);
      const rank = lb.findIndex((e) => e.userId === user.id) + 1;

      const voiceMins = voiceXP.getTotalMinutes(guildId, user.id);
      const badges    = formatBadges(guildId, user.id);

      const hexColor     = target.displayHexColor;
      const isDefault    = !hexColor || hexColor === '#000000' || hexColor === '#ffffff';
      const accentColor  = isDefault ? '#1e90ff' : hexColor;

      try {
        const buffer = await generateRankCard({
          username:     user.username,
          avatarURL:    user.displayAvatarURL({ extension: 'png', size: 256 }),
          level,
          currentXp,
          neededXp,
          totalXp:      userData.xp,
          rank:         rank || '—',
          voiceMinutes: voiceMins,
          badges,
          accentColor,
        });

        const file = new AttachmentBuilder(buffer, { name: `rank-${user.id}.png` });
        await interaction.editReply({ files: [file] });

      } catch (canvasErr) {
        // Canvas فشل — fallback نصي
        console.error('[RANK] Canvas error:', canvasErr.message);
        await interaction.editReply({
          content:
            `📊 **${user.username}**\n` +
            `🏅 المستوى: **${level}** | ⭐ XP: **${userData.xp}** | 🏆 الترتيب: **#${rank || '—'}**\n` +
            `🎙️ وقت الصوت: **${voiceMins} دقيقة**`,
        });
      }

    } catch (err) {
      console.error('[RANK] Fatal error:', err);
      try {
        await interaction.editReply({ content: `❌ حصل خطأ: \`${err.message}\`` });
      } catch {}
    }
  },
};