const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد طرده.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('سبب الطرد.').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';

    if (!target) {
      return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    }

    if (!target.kickable) {
      return interaction.editReply({ content: '❌ لا أملك صلاحية طرد هذا العضو.' });
    }

    if (target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ content: '❌ لا تقدر تطرد عضو يملك رول أعلى منك.' });
    }

    // DM the kicked user
    const dmEmbed = new EmbedBuilder()
      .setTitle('👢  تم طردك')
      .setDescription(`تم طردك من **${interaction.guild.name}**`)
      .addFields(
        { name: 'السبب', value: reason },
        { name: 'المشرف', value: interaction.user.tag }
      )
      .setColor(0xff4444)
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    await target.kick(reason);

    const kickEmbed = new EmbedBuilder()
      .setTitle('👢  تم الطرد')
      .addFields(
        { name: 'العضو', value: `${target.user.tag}`, inline: true },
        { name: 'المشرف', value: `${interaction.user}`, inline: true },
        { name: 'السبب', value: reason }
      )
      .setColor(0xff4444)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.editReply({ embeds: [kickEmbed] });
    console.log(`[KICK] ${target.user.tag} kicked by ${interaction.user.tag} — Reason: ${reason}`);
  },
};