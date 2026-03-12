// ─── commands/setperm.js ──────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isFounder, allowRole, denyRole, resetCommand, getAllowedRoles } = require('../utils/permManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setperm')
    .setDescription('تحكم بمن يقدر يستخدم أي أمر — للـ FOUNDER فقط 👑')
    .addSubcommand((s) =>
      s.setName('allow')
        .setDescription('امنح رتبة صلاحية أمر.')
        .addStringOption((o) => o.setName('command').setDescription('اسم الأمر').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('الرتبة').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('deny')
        .setDescription('اسحب صلاحية رتبة من أمر.')
        .addStringOption((o) => o.setName('command').setDescription('اسم الأمر').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('الرتبة').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('list')
        .setDescription('شوف من يقدر يستخدم أمر.')
        .addStringOption((o) => o.setName('command').setDescription('اسم الأمر').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('reset')
        .setDescription('احجب أمر عن الكل (إعادة ضبط).')
        .addStringOption((o) => o.setName('command').setDescription('اسم الأمر').setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isFounder(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر لـ **FOUNDER** فقط 👑' });

    const sub     = interaction.options.getSubcommand();
    const cmdName = interaction.options.getString('command').toLowerCase();
    const role    = interaction.options.getRole('role');
    const guild   = interaction.guild;

    // ── allow ─────────────────────────────────────────────────────────────
    if (sub === 'allow') {
      allowRole(cmdName, role.id);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅  صلاحية ممنوحة')
            .setDescription(`رتبة **${role.name}** الحين تقدر تستخدم \`/${cmdName}\``)
            .setColor(0x2ecc71)
            .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
            .setTimestamp(),
        ],
      });
    }

    // ── deny ──────────────────────────────────────────────────────────────
    if (sub === 'deny') {
      denyRole(cmdName, role.id);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚫  صلاحية مسحوبة')
            .setDescription(`رتبة **${role.name}** ما تقدر تستخدم \`/${cmdName}\` بعد الآن`)
            .setColor(0xff4444)
            .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
            .setTimestamp(),
        ],
      });
    }

    // ── list ──────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const roleIds = getAllowedRoles(cmdName);
      const lines   = roleIds.map((id) => {
        const r = guild.roles.cache.get(id);
        return r ? `✅ ${r.name}` : `✅ \`${id}\` _(رتبة محذوفة)_`;
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🔐  صلاحيات \`/${cmdName}\``)
            .setDescription(
              lines.length > 0
                ? lines.join('\n')
                : '_(محجوب عن الكل — ما في رتب مسموحة)_'
            )
            .setColor(0x1e90ff)
            .addFields({ name: '👑  FOUNDER', value: 'دائماً يقدر يستخدم أي أمر', inline: false })
            .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
            .setTimestamp(),
        ],
      });
    }

    // ── reset ─────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      resetCommand(cmdName);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔄  تم الإعادة')
            .setDescription(`\`/${cmdName}\` محجوب الآن عن الكل\nاستخدم \`/setperm allow\` لمنح صلاحيات`)
            .setColor(0xffa500)
            .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
            .setTimestamp(),
        ],
      });
    }
  },
};