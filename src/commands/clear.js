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
      opt.setName('amount')
        .setDescription('عدد الرسائل المراد مسحها (1 - 100).')
        .setMinValue(1).setMaxValue(100).setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('member')
        .setDescription('مسح رسائل عضو معين فقط (اختياري).')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const amount     = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('member');

    // ✅ لو في فلتر لعضو معين، نجلب أكثر لأننا ننقح منهم
    // لو ما في فلتر، نجلب بالضبط ما طلبه المستخدم
    const fetchLimit = targetUser ? 100 : amount;

    let messages = await interaction.channel.messages.fetch({ limit: fetchLimit });

    if (targetUser) {
      // فلتر برسائل العضو المحدد ثم خذ العدد المطلوب
      messages = [...messages.values()]
        .filter((m) => m.author.id === targetUser.id)
        .slice(0, amount);
    } else {
      messages = [...messages.values()].slice(0, amount);
    }

    // Discord: bulk delete يقبل فقط رسائل أقل من 14 يوم
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const deletable = messages.filter(
      (m) => Date.now() - m.createdTimestamp < TWO_WEEKS
    );

    if (deletable.length === 0) {
      return interaction.editReply({
        content: targetUser
          ? `❌ ما وجدت رسائل حديثة لـ ${targetUser.tag} قابلة للحذف (الرسائل أقدم من 14 يوم).`
          : '❌ لا توجد رسائل قابلة للحذف (أقدم من 14 يوم).',
      });
    }

    const deleted = await interaction.channel.bulkDelete(deletable, true);

    const clearEmbed = new EmbedBuilder()
      .setTitle('🧹  تم مسح الرسائل')
      .setDescription(
        `تم حذف **${deleted.size}** رسالة` +
        `${targetUser ? ` من ${targetUser}` : ''}` +
        ` بواسطة ${interaction.user}.` +
        (deletable.length < messages.length
          ? `\n⚠️ ${messages.length - deletable.length} رسالة تجاوزت 14 يوم ولم تُحذف.`
          : '')
      )
      .setColor(0x1e90ff)
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.editReply({ embeds: [clearEmbed] });
    console.log(`[CLEAR] ${deleted.size} messages deleted in #${interaction.channel.name} by ${interaction.user.tag}`);
  },
};