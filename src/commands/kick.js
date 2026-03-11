const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر.')
    .addUserOption((opt) => opt.setName('member').setDescription('العضو المراد طرده.').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('سبب الطرد.').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isAdmin(interaction.member)) {
      return interaction.editReply({ content: '❌ هذا الأمر لـ **CORE Admin🛡** و **CORE Founder👑** فقط.' });
    }

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';

    if (!target) return interaction.editReply({ content: '❌ العضو غير موجود.' });
    if (!target.kickable) return interaction.editReply({ content: '❌ لا أملك صلاحية طرد هذا العضو.' });

    const dmEmbed = new EmbedBuilder()
      .setTitle('👢  تم طردك')
      .setDescription(`تم طردك من **${interaction.guild.name}**`)
      .addFields({ name: 'السبب', value: reason }, { name: 'المشرف', value: interaction.user.tag })
      .setColor(0xff4444).setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});
    await target.kick(reason);

    const embed = new EmbedBuilder()
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

    await interaction.editReply({ embeds: [embed] });
    console.log(`[KICK] ${target.user.tag} kicked by ${interaction.user.tag}`);
  },
};