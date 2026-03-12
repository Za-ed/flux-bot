// ─── commands/rank.js ─────────────────────────────────────────────────────────
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateRankCard, getTier }  = require('../utils/rankCard');
const { getUserLevel, getLeaderboard, xpForLevel } = require('../events/leveling');
const { getUserBadges } = require('../utils/badges');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('اعرض بطاقة رانكك أو رانك أي عضو.')
    .addUserOption((o) =>
      o.setName('member').setDescription('العضو — اتركه فاضي لرانكك أنت').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getMember('member') ?? interaction.member;
    const { guild } = interaction;

    // ── بيانات الـ XP ─────────────────────────────────────────────────────
    const userData = getUserLevel(guild.id, target.id);
    const { level, xp } = userData;
    const xpNeeded  = xpForLevel(level + 1);
    const tier      = getTier(level);

    // ── الترتيب في اللوحة ─────────────────────────────────────────────────
    const leaderboard = getLeaderboard(guild.id, 1000);
    const rankPos     = leaderboard.findIndex((u) => u.userId === target.id) + 1;

    // ── الشارات ───────────────────────────────────────────────────────────
    let badges = [];
    try { badges = getUserBadges(guild.id, target.id); } catch {}

    // ── Voice Minutes ─────────────────────────────────────────────────────
    let voiceMinutes = 0;
    try {
      const voiceData = require('../data/voiceTime.json');
      voiceMinutes = Math.floor((voiceData?.[guild.id]?.[target.id] || 0) / 60);
    } catch {}

    // ── توليد البطاقة ────────────────────────────────────────────────────
    const avatarURL = target.user.displayAvatarURL({ extension: 'png', size: 256 });

    const cardBuffer = await generateRankCard({
      username:    target.user.username,
      displayName: target.displayName,
      avatarURL,
      level,
      currentXP:  xp,
      xpForNext:  xpNeeded,
      rank:        rankPos || '?',
      voiceMinutes,
      badges,
    });

    const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });

    await interaction.editReply({
      content: `${tier.emoji} **${target.displayName}** — ${tier.name} • مستوى ${level}`,
      files:   [attachment],
    });
  },
};