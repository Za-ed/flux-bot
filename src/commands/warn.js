const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

// In-memory warnings store: userId -> [{ reason, date, moderator }]
const warningsMap = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('تحذير عضو في السيرفر.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد تحذيره.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('سبب التحذير.').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason');
    const moderator = interaction.member;

    if (!target) {
      return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    }

    if (target.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ لا تقدر تحذر نفسك.' });
    }

    if (target.roles.highest.position >= moderator.roles.highest.position) {
      return interaction.editReply({ content: '❌ لا تقدر تحذر عضو يملك رول أعلى منك.' });
    }

    // Save warning
    if (!warningsMap.has(target.id)) warningsMap.set(target.id, []);
    warningsMap.get(target.id).push({
      reason,
      date: new Date().toISOString(),
      moderator: interaction.user.tag,
    });

    const totalWarnings = warningsMap.get(target.id).length;

    // DM the warned user
    const dmEmbed = new EmbedBuilder()
      .setTitle('⚠️ لقيت تحذير')
      .setDescription(`لقيت تحذير في **${interaction.guild.name}**`)
      .addFields(
        { name: 'السبب', value: reason },
        { name: 'المشرف', value: interaction.user.tag },
        { name: 'مجموع تحذيراتك', value: `${totalWarnings}` }
      )
      .setColor(0xffa500)
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    // Reply in channel
    const warnEmbed = new EmbedBuilder()
      .setTitle('⚠️  تحذير صدر')
      .addFields(
        { name: 'العضو', value: `${target}`, inline: true },
        { name: 'المشرف', value: `${interaction.user}`, inline: true },
        { name: 'السبب', value: reason },
        { name: 'مجموع التحذيرات', value: `${totalWarnings}` }
      )
      .setColor(0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
      .setTimestamp();

    await interaction.editReply({ embeds: [warnEmbed] });
    console.log(`[WARN] ${target.user.tag} warned by ${interaction.user.tag} — Reason: ${reason}`);
  },
};