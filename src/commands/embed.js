const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('إنشاء embed مخصص وإرساله في قناة.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('القناة المراد الإرسال فيها.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('عنوان الـ Embed.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('نص الـ Embed.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('color')
        .setDescription('لون الـ Embed بصيغة Hex (مثال: #1E90FF).')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('image').setDescription('رابط صورة للـ Embed (اختياري).').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('footer').setDescription('نص الـ Footer (اختياري).').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const colorInput = interaction.options.getString('color') ?? '#1E90FF';
    const image = interaction.options.getString('image');
    const footer = interaction.options.getString('footer');

    // Validate hex color
    const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
    const colorMatch = colorInput.replace('#', '');
    const color = hexRegex.test(`#${colorMatch}`) ? parseInt(colorMatch, 16) : 0x1e90ff;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer });

    await channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ تم إرسال الـ Embed في ${channel}.` });
    console.log(`[EMBED] Sent in #${channel.name} by ${interaction.user.tag}`);
  },
};