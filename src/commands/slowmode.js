const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('تفعيل أو تعطيل السلو مود في القناة الحالية.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((opt) =>
      opt
        .setName('seconds')
        .setDescription('المدة بالثواني (0 لتعطيل السلو مود).')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const seconds = interaction.options.getInteger('seconds');

    await interaction.channel.setRateLimitPerUser(
      seconds,
      `Slowmode set by ${interaction.user.tag}`
    );

    const embed = new EmbedBuilder()
      .setTitle(seconds === 0 ? '✅  تم تعطيل السلو مود' : '🐢  تم تفعيل السلو مود')
      .setDescription(
        seconds === 0
          ? `تم تعطيل السلو مود في ${interaction.channel} بواسطة ${interaction.user}.`
          : `تم تفعيل السلو مود في ${interaction.channel} — **${seconds} ثانية** بين كل رسالة.\nبواسطة ${interaction.user}.`
      )
      .setColor(seconds === 0 ? 0x2ecc71 : 0xffa500)
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[SLOWMODE] #${interaction.channel.name} set to ${seconds}s by ${interaction.user.tag}`);
  },
};