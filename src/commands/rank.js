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
    // 1. تأجيل الرد عشان البوت ياخذ وقته بتصميم الصورة بدون ما يطلع (التطبيق لا يستجيب)
    await interaction.deferReply();

    const target = interaction.options.getMember('member') ?? interaction.member;
    const { guild } = interaction;

    // ── بيانات الـ XP ─────────────────────────────────────────────────────
    const userData = getUserLevel(guild.id, target.id) || {};
    const level = userData.level || 0;
    const xp = userData.xp || 0;
    const xpNeeded  = xpForLevel(level + 1);
    const tier      = getTier(level) || { name: 'مبتدئ', emoji: '✦' };

    // ── الترتيب في اللوحة ─────────────────────────────────────────────────
    let rankPos = '?';
    try {
        const leaderboard = getLeaderboard(guild.id, 1000) || [];
        const index = leaderboard.findIndex((u) => u.userId === target.id);
        if (index !== -1) rankPos = index + 1;
    } catch {}

    // ── الشارات ───────────────────────────────────────────────────────────
    let badges = [];
    try { badges = getUserBadges(guild.id, target.id) || []; } catch {}

    // ── Voice Minutes ─────────────────────────────────────────────────────
    let voiceMinutes = 0;
    try {
      const voiceData = require('../data/voiceTime.json');
      voiceMinutes = Math.floor((voiceData?.[guild.id]?.[target.id] || 0) / 60);
    } catch {}

    // ── توليد البطاقة ────────────────────────────────────────────────────
    const avatarURL = target.user.displayAvatarURL({ extension: 'png', size: 256 });

    try {
        const rankBuffer = await generateRankCard({
          username:    target.user.username,
          displayName: target.displayName,
          avatarURL,
          level,
          currentXP:  xp,
          xpForNext:  xpNeeded,
          rank:        rankPos,
          voiceMinutes,
          badges,
        });

        const attachment = new AttachmentBuilder(rankBuffer, { name: 'rank.gif' });

        // 2. إرسال الرد النهائي (هنا نستخدم editReply لأننا عملنا deferReply فوق)
        await interaction.editReply({
          content: `${tier.emoji} **${target.displayName}** — ${tier.name} • مستوى ${level}`,
          files:   [attachment],
        });
        
    } catch (error) {
        console.error('[RANK ERROR]:', error);
        await interaction.editReply('❌ حدث خطأ أثناء توليد بطاقة الرانك الخاصة بك.');
    }
  },
};