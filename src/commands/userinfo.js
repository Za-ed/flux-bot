const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('عرض معلومات تفصيلية عن عضو.')
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد عرض معلوماته.').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const member = interaction.options.getMember('member') ?? interaction.member;
    const user = member.user;

    const roles = member.roles.cache
      .filter((r) => r.id !== interaction.guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`)
      .slice(0, 10)
      .join(', ') || 'لا يوجد';

    const badges = user.flags?.toArray().join(', ') || 'لا يوجد';

    const statusMap = {
      online: '🟢 أونلاين',
      idle: '🟡 غائب',
      dnd: '🔴 لا تزعج',
      offline: '⚫ أوفلاين',
    };

    const presence = member.presence?.status ?? 'offline';

    const embed = new EmbedBuilder()
      .setTitle(`👤  معلومات ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🪪  الاسم الكامل', value: user.tag, inline: true },
        { name: '🆔  الـ ID', value: user.id, inline: true },
        { name: '📶  الحالة', value: statusMap[presence], inline: true },
        {
          name: '📅  تاريخ إنشاء الحساب',
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
        {
          name: '📥  تاريخ الانضمام للسيرفر',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
          inline: false,
        },
        { name: `🎭  الرولات (${member.roles.cache.size - 1})`, value: roles, inline: false },
        { name: '🏅  الشارات', value: badges, inline: false },
        { name: '🤖  بوت؟', value: user.bot ? 'نعم' : 'لا', inline: true },
        {
          name: '💎  البوست؟',
          value: member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : 'لا',
          inline: true,
        }
      )
      .setColor(member.displayHexColor || 0x1e90ff)
      .setFooter({ text: 'FLUX • IO  |  معلومات الأعضاء' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};