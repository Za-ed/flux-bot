const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Deploy the ticket panel to the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // ── Defer so we have time to respond ──────────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('🎫  FLUX • IO  Support Center')
      .setDescription(
        'Need help? Have a report? Looking to partner with us?\n' +
        'Select the appropriate category below to open a **private ticket**.\n\n' +
        '> 💻 **Support** — Technical help, questions, or general assistance.\n' +
        '> 🚨 **Report** — Report a rule-breaking member or incident.\n' +
        '> 🤝 **Partnership** — Propose a collaboration or partnership.\n\n' +
        '*Our staff will respond as soon as possible.*'
      )
      .setColor(0x1e90ff)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({
        text: 'FLUX • IO  |  One ticket per issue, please.',
        iconURL: interaction.guild.iconURL({ dynamic: true }),
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_support')
        .setLabel('Support')
        .setEmoji('💻')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_report')
        .setLabel('Report')
        .setEmoji('🚨')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_partnership')
        .setLabel('Partnership')
        .setEmoji('🤝')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ Ticket panel deployed successfully.' });
  },
};