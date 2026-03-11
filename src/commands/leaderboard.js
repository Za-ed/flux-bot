const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../events/leveling');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('عرض أعلى 10 أعضاء في المستويات.'),

  async execute(interaction) {
    await interaction.deferReply();

    const lb = leveling.getLeaderboard(interaction.guild.id, 10);

    if (lb.length === 0) {
      return interaction.editReply({ content: '❌ لا يوجد بيانات بعد. ابدأوا بالكلام! 💬' });
    }

    const medals = ['🥇', '🥈', '🥉'];

    // ✅ fetch الأعضاء مرة وحدة دفعة بدل 10 requests منفصلة
    const memberIds = lb.map((e) => e.userId);
    const fetchedMembers = new Map();
    await Promise.allSettled(
      memberIds.map((id) =>
        interaction.guild.members.fetch(id)
          .then((m) => fetchedMembers.set(id, m.user.username))
          .catch(() => fetchedMembers.set(id, null))
      )
    );

    const lines = lb.map((entry, i) => {
      const username = fetchedMembers.get(entry.userId) ?? `<@${entry.userId}>`;
      const prefix   = medals[i] ?? `**${i + 1}.**`;
      const xpBar    = buildMiniBar(entry.xp);
      return `${prefix} **${username}** — المستوى **${entry.level}** • ${entry.xp} XP ${xpBar}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆  لوحة المتصدرين')
      .setDescription(lines.join('\n'))
      .setColor(0xf1c40f)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: `FLUX • IO  |  نظام المستويات • ${lb.length} أعضاء` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// مساعد صغير — شريط XP مصغر
function buildMiniBar(xp) {
  const bars  = Math.min(Math.floor(xp / 500), 10);
  const empty = 10 - bars;
  return `\`${'█'.repeat(bars)}${'░'.repeat(empty)}\``;
}