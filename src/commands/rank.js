// ─── rank.js ──────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const leveling             = require('../events/leveling');
const { formatBadges }     = require('../utils/badges');
const voiceXP              = require('../events/voiceXP');
const { generateRankCard } = require('../utils/rankCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('اعرض بطاقة رتبتك أو رتبة عضو آخر.')
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target    = interaction.options.getMember('member') ?? interaction.member;
    const user      = target.user;
    const guildId   = interaction.guild.id;

    const userData  = leveling.getUserData(guildId, user.id);
    const level     = leveling.getLevelFromXp(userData.xp);
    const currentXp = leveling.getXpInCurrentLevel(userData.xp);
    const neededXp  = leveling.xpForLevel(level + 1);

    const lb        = leveling.getLeaderboard(guildId, 100);
    const rank      = lb.findIndex((e) => e.userId === user.id) + 1;

    const voiceMins = voiceXP.getTotalMinutes(guildId, user.id);
    const badges    = formatBadges(guildId, user.id);

    const accentColor = target.displayHexColor !== '#000000'
      ? target.displayHexColor
      : '#1e90ff';

    try {
      const buffer = await generateRankCard({
        username:     user.username,
        avatarURL:    user.displayAvatarURL({ extension: 'png', size: 256 }),
        level,
        currentXp,
        neededXp,
        totalXp:      userData.xp,
        rank,
        voiceMinutes: voiceMins,
        badges,
        accentColor,
      });

      const file = new AttachmentBuilder(buffer, { name: `rank-${user.id}.png` });
      await interaction.editReply({ files: [file] });

    } catch (err) {
      console.error('[RANK] Canvas error:', err.message);
      await interaction.editReply({
        content: `📊 **${user.username}** — المستوى **${level}** | ${userData.xp} XP | #${rank}`,
      });
    }
  },
};