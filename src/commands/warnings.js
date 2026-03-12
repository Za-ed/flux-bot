
// ─── warnings.js (command) ────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'warnings.json');

function loadWarnings() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return {}; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('عرض تحذيرات عضو.')
    .addUserOption((o) =>
      o.setName('member').setDescription('العضو — اتركه فاضي لتشوف تحذيراتك').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getMember('member') ?? interaction.member;
    const isSelf = target.id === interaction.user.id;

    if (!isSelf && !isAdmin(interaction.member))
      return interaction.editReply({ content: '❌ ما تقدر تشوف تحذيرات غيرك.' });

    const warns = loadWarnings()[`${interaction.guild.id}:${target.id}`] || [];

    if (warns.length === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋  تحذيرات ${target.user.username}`)
            .setDescription('✅ لا يوجد أي تحذيرات!')
            .setColor(0x2ecc71)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' }),
        ],
      });
    }

    const warnFields = warns.slice(0, 10).map((w, i) => ({
      name:  `#${i + 1}  —  ${new Date(w.date).toLocaleDateString('ar-SA')}`,
      value: `📝 ${w.reason}\n🛡️ ${w.moderator}`,
    }));

    const embed = new EmbedBuilder()
      .setTitle(`⚠️  تحذيرات ${target.user.username}`)
      .setDescription(`إجمالي التحذيرات: **${warns.length}**`)
      .addFields(...warnFields)
      .setColor(warns.length >= 3 ? 0xff4444 : 0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
      .setTimestamp();

    const components = [];
    if (isAdmin(interaction.member)) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`clearwarns_${target.id}`)
            .setLabel('🗑️  مسح كل التحذيرات')
            .setStyle(ButtonStyle.Danger),
        )
      );
    }

    await interaction.editReply({ embeds: [embed], components });
  },
};