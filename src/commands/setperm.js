// ─── setperm.js ───────────────────────────────────────────────────────────────
// الـ FOUNDER يتحكم من يشوف ويستخدم كل أمر
// يستخدم Discord Guild Command Permissions API

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// ─── اسم رتبة الـ FOUNDER ─────────────────────────────────────────────────────
const FOUNDER_ROLE = 'CORE Founder👑';

function isFounder(member) {
  return member.roles.cache.some((r) => r.name === FOUNDER_ROLE);
}

// ─── قائمة الأوامر العامة (الأعضاء العاديين يشوفونها) ─────────────────────────
const PUBLIC_COMMANDS = ['rank', 'leaderboard', 'daily', 'game', 'suggest'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setperm')
    .setDescription('تحكم بمن يقدر يستخدم أمر معين — للـ FOUNDER فقط.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('allow')
        .setDescription('امنح رتبة صلاحية استخدام أمر.')
        .addStringOption((o) =>
          o.setName('command').setDescription('اسم الأمر').setRequired(true)
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('الرتبة').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('deny')
        .setDescription('اسحب صلاحية رتبة من أمر.')
        .addStringOption((o) =>
          o.setName('command').setDescription('اسم الأمر').setRequired(true)
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('الرتبة').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('عرض صلاحيات أمر معين.')
        .addStringOption((o) =>
          o.setName('command').setDescription('اسم الأمر').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('إعادة ضبط صلاحيات أمر لوضعه الافتراضي.')
        .addStringOption((o) =>
          o.setName('command').setDescription('اسم الأمر').setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // ── FOUNDER فقط ──────────────────────────────────────────────────────
    if (!isFounder(interaction.member)) {
      return interaction.editReply({ content: '❌ هذا الأمر لـ **FOUNDER** فقط.' });
    }

    const sub         = interaction.options.getSubcommand();
    const commandName = interaction.options.getString('command')?.toLowerCase();
    const role        = interaction.options.getRole('role');
    const { guild }   = interaction;

    // ── جلب الأمر من السيرفر ────────────────────────────────────────────
    await guild.commands.fetch();
    const guildCommand = guild.commands.cache.find((c) => c.name === commandName);

    if (!guildCommand && sub !== 'list') {
      return interaction.editReply({
        content: `❌ الأمر \`/${commandName}\` غير موجود.\n\nالأوامر المتاحة:\n${guild.commands.cache.map((c) => `\`/${c.name}\``).join(', ')}`,
      });
    }

    // ── allow ────────────────────────────────────────────────────────────
    if (sub === 'allow') {
      try {
        const current = await guild.commands.permissions.fetch({ command: guildCommand.id }).catch(() => []);

        const newPerms = [
          ...current.filter((p) => p.id !== role.id),
          { id: role.id, type: 1, permission: true }, // type 1 = Role
        ];

        await guild.commands.permissions.set({
          command:     guildCommand.id,
          permissions: newPerms,
        });

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅  صلاحية ممنوحة')
              .setDescription(`رتبة ${role} الحين تقدر تستخدم \`/${commandName}\``)
              .setColor(0x2ecc71)
              .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error('[SETPERM] allow error:', err.message);
        await interaction.editReply({ content: `❌ فشل: ${err.message}` });
      }
      return;
    }

    // ── deny ─────────────────────────────────────────────────────────────
    if (sub === 'deny') {
      try {
        const current = await guild.commands.permissions.fetch({ command: guildCommand.id }).catch(() => []);

        const newPerms = [
          ...current.filter((p) => p.id !== role.id),
          { id: role.id, type: 1, permission: false },
        ];

        await guild.commands.permissions.set({
          command:     guildCommand.id,
          permissions: newPerms,
        });

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🚫  صلاحية مسحوبة')
              .setDescription(`رتبة ${role} ما تقدر تستخدم \`/${commandName}\` بعد الآن`)
              .setColor(0xff4444)
              .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        await interaction.editReply({ content: `❌ فشل: ${err.message}` });
      }
      return;
    }

    // ── list ─────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const cmd = guild.commands.cache.find((c) => c.name === commandName);
      if (!cmd) return interaction.editReply({ content: `❌ الأمر \`/${commandName}\` غير موجود.` });

      try {
        const perms = await guild.commands.permissions.fetch({ command: cmd.id }).catch(() => []);

        const lines = await Promise.all(
          perms.map(async (p) => {
            const icon = p.permission ? '✅' : '❌';
            if (p.type === 1) {
              const r = guild.roles.cache.get(p.id);
              return `${icon} رتبة: ${r ? r.name : p.id}`;
            }
            return `${icon} عضو: <@${p.id}>`;
          })
        );

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`🔐  صلاحيات \`/${commandName}\``)
              .setDescription(lines.length > 0 ? lines.join('\n') : '_(لا توجد صلاحيات مخصصة — الوضع الافتراضي)_')
              .setColor(0x1e90ff)
              .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        await interaction.editReply({ content: `❌ فشل: ${err.message}` });
      }
      return;
    }

    // ── reset ────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      try {
        await guild.commands.permissions.set({
          command:     guildCommand.id,
          permissions: [],
        });

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🔄  تم الإعادة')
              .setDescription(`صلاحيات \`/${commandName}\` رجعت للوضع الافتراضي`)
              .setColor(0xffa500)
              .setFooter({ text: 'FLUX • IO  |  نظام الصلاحيات' })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        await interaction.editReply({ content: `❌ فشل: ${err.message}` });
      }
    }
  },
};