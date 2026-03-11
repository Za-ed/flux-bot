const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر عضو من السيرفر.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد حظره.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('سبب الحظر.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('days')
        .setDescription('حذف رسائل العضو (بالأيام) — من 0 إلى 7.')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';
    const days = interaction.options.getInteger('days') ?? 0;

    if (!target) {
      return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    }

    if (!target.bannable) {
      return interaction.editReply({ content: '❌ لا أملك صلاحية حظر هذا العضو.' });
    }

    if (target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ content: '❌ لا تقدر تحظر عضو يملك رول أعلى منك.' });
    }

    // DM before ban
    const dmEmbed = new EmbedBuilder()
      .setTitle('🔨  تم حظرك')
      .setDescription(`تم حظرك من **${interaction.guild.name}**`)
      .addFields(
        { name: 'السبب', value: reason },
        { name: 'المشرف', value: interaction.user.tag }
      )
      .setColor(0x8b0000)
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    await target.ban({ deleteMessageDays: days, reason });

    const banEmbed = new EmbedBuilder()
      .setTitle('🔨  تم الحظر')
      .addFields(
        { name: 'العضو', value: `${target.user.tag}`, inline: true },
        { name: 'المشرف', value: `${interaction.user}`, inline: true },
        { name: 'السبب', value: reason },
        { name: 'حذف الرسائل', value: `${days} يوم` }
      )
      .setColor(0x8b0000)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.editReply({ embeds: [banEmbed] });
    console.log(`[BAN] ${target.user.tag} banned by ${interaction.user.tag} — Reason: ${reason}`);
  },
};