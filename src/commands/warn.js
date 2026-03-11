const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');

const warningsMap = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('تحذير عضو في السيرفر.')
    .addUserOption((opt) => opt.setName('member').setDescription('العضو المراد تحذيره.').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('سبب التحذير.').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isAdmin(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر لـ **CORE Admin🛡** و **CORE Founder👑** فقط.' });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason');

    if (!target) return interaction.editReply({ content: '❌ العضو غير موجود.' });
    if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ لا تقدر تحذر نفسك.' });

    if (!warningsMap.has(target.id)) warningsMap.set(target.id, []);
    warningsMap.get(target.id).push({ reason, date: new Date().toISOString(), moderator: interaction.user.tag });
    const total = warningsMap.get(target.id).length;

    const dmEmbed = new EmbedBuilder()
      .setTitle('⚠️  لقيت تحذير')
      .setDescription(`لقيت تحذير في **${interaction.guild.name}**`)
      .addFields(
        { name: 'السبب',           value: reason },
        { name: 'المشرف',          value: interaction.user.tag },
        { name: 'مجموع التحذيرات', value: `${total}` }
      )
      .setColor(0xffa500).setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    await logAction(interaction.guild, {
      type:      'warn',
      moderator: interaction.user,
      target,
      reason: `${reason} (تحذير #${total})`,
    });

    const embed = new EmbedBuilder()
      .setTitle('⚠️  تحذير صدر')
      .addFields(
        { name: 'العضو',           value: `${target}`,            inline: true },
        { name: 'المشرف',          value: `${interaction.user}`,  inline: true },
        { name: 'السبب',           value: reason },
        { name: 'مجموع التحذيرات', value: `${total}` }
      )
      .setColor(0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};