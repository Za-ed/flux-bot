const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('مسح عدد من الرسائل في القناة الحالية.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('عدد الرسائل المراد مسحها (1 - 100).')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('member').setDescription('مسح رسائل عضو معين فقط (اختياري).').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('member');

    let messages = await interaction.channel.messages.fetch({ limit: 100 });

    // Filter by user if specified
    if (targetUser) {
      messages = messages.filter((m) => m.author.id === targetUser.id);
    }

    // Slice to requested amount
    messages = [...messages.values()].slice(0, amount);

    // Discord only allows bulk delete for messages under 14 days old
    const deletable = messages.filter(
      (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (deletable.length === 0) {
      return interaction.editReply({
        content: '❌ لا توجد رسائل قابلة للحذف (الرسائل أقدم من 14 يوم لا يمكن حذفها).',
      });
    }

    const deleted = await interaction.channel.bulkDelete(deletable, true);

    const clearEmbed = new EmbedBuilder()
      .setTitle('🧹  تم مسح الرسائل')
      .setDescription(
        `تم حذف **${deleted.size}** رسالة${targetUser ? ` من ${targetUser}` : ''} بواسطة ${interaction.user}.`
      )
      .setColor(0x1e90ff)
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.editReply({ embeds: [clearEmbed] });
    console.log(`[CLEAR] ${deleted.size} messages deleted in #${interaction.channel.name} by ${interaction.user.tag}`);
  },
};