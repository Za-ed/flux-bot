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
      return interaction.editReply({ content: '❌ لا يوجد بيانات بعد.' });
    }

    const medals = ['🥇', '🥈', '🥉'];

    const description = await Promise.all(
      lb.map(async (entry, i) => {
        let username = `<@${entry.userId}>`;
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          username = member.user.username;
        } catch {}

        const prefix = medals[i] ?? `**${i + 1}.**`;
        return `${prefix} ${username} — المستوى **${entry.level}** • ${entry.xp} XP`;
      })
    );

    const embed = new EmbedBuilder()
      .setTitle('🏆  لوحة المتصدرين')
      .setDescription(description.join('\n'))
      .setColor(0xf1c40f)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام المستويات' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};