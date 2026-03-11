// ─── daily.js ─────────────────────────────────────────────────────────────────
const { SlashCommandBuilder } = require('discord.js');
const { getUserTasks, buildDailyEmbed } = require('../events/dailyTasks');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('شوف مهامك اليومية وتقدمك.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const tasks = getUserTasks(interaction.guild.id, interaction.user.id);
    const embed = buildDailyEmbed(interaction.member, tasks);

    await interaction.editReply({ embeds: [embed] });
  },
};