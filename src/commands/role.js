const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('إضافة أو إزالة رول من عضو.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('الإجراء المراد تنفيذه.')
        .setRequired(true)
        .addChoices(
          { name: 'إضافة رول', value: 'add' },
          { name: 'إزالة رول', value: 'remove' }
        )
    )
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد تعديل رولاته.').setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('الرول المراد إضافته أو إزالته.').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const action = interaction.options.getString('action');
    const target = interaction.options.getMember('member');
    const role = interaction.options.getRole('role');

    if (!target) {
      return interaction.editReply({ content: '❌ العضو غير موجود.' });
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.editReply({ content: '❌ الرول أعلى من رول البوت، لا أقدر أعدّله.' });
    }

    if (role.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ content: '❌ الرول أعلى من رولك، لا تقدر تعدّله.' });
    }

    if (action === 'add') {
      if (target.roles.cache.has(role.id)) {
        return interaction.editReply({ content: `❌ ${target} يملك بالفعل رول ${role}.` });
      }
      await target.roles.add(role);
    } else {
      if (!target.roles.cache.has(role.id)) {
        return interaction.editReply({ content: `❌ ${target} لا يملك رول ${role}.` });
      }
      await target.roles.remove(role);
    }

    const embed = new EmbedBuilder()
      .setTitle(action === 'add' ? '✅  تمت إضافة الرول' : '✅  تمت إزالة الرول')
      .addFields(
        { name: 'العضو', value: `${target}`, inline: true },
        { name: 'الرول', value: `${role}`, inline: true },
        { name: 'المشرف', value: `${interaction.user}`, inline: true }
      )
      .setColor(action === 'add' ? 0x2ecc71 : 0xff4444)
      .setFooter({ text: 'FLUX • IO  |  نظام الرولات' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[ROLE] ${action.toUpperCase()} ${role.name} ${action === 'add' ? 'to' : 'from'} ${target.user.tag}`);
  },
};