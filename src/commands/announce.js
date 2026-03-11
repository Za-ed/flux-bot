const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('إرسال إعلان رسمي في قناة معينة.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('القناة المراد الإعلان فيها.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('عنوان الإعلان.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('message').setDescription('نص الإعلان.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('ping')
        .setDescription('من تبي تذكر؟')
        .setRequired(false)
        .addChoices(
          { name: '@everyone', value: '@everyone' },
          { name: '@here', value: '@here' },
          { name: 'لا أحد', value: 'none' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const messageText = interaction.options.getString('message');
    const ping = interaction.options.getString('ping') ?? 'none';

    const announceEmbed = new EmbedBuilder()
      .setTitle(`📢  ${title}`)
      .setDescription(messageText)
      .setColor(0x1e90ff)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({
        text: `إعلان بواسطة ${interaction.user.tag}  |  FLUX • IO`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    const pingContent = ping !== 'none' ? `${ping}` : '';

    await channel.send({
      content: pingContent || undefined,
      embeds: [announceEmbed],
    });

    await interaction.editReply({ content: `✅ تم إرسال الإعلان في ${channel}.` });
    console.log(`[ANNOUNCE] Sent in #${channel.name} by ${interaction.user.tag}`);
  },
};