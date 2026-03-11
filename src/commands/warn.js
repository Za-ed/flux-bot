const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');
const fs   = require('fs');
const path = require('path');

// ─── Persistent Warnings Storage ─────────────────────────────────────────────
const WARNINGS_FILE = path.join(__dirname, '../data/warnings.json');

function loadWarnings() {
  try {
    if (!fs.existsSync(WARNINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  try {
    const dir = path.dirname(WARNINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[WARN] Failed to save warnings:', err.message);
  }
}

function getUserWarnings(userId) {
  const data = loadWarnings();
  return data[userId] ?? [];
}

function addWarning(userId, entry) {
  const data = loadWarnings();
  if (!data[userId]) data[userId] = [];
  data[userId].push(entry);
  saveWarnings(data);
  return data[userId].length;
}
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('تحذير عضو في السيرفر.')
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد تحذيره.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('سبب التحذير.').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isAdmin(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر لـ **CORE Admin🛡** و **CORE Founder👑** فقط.' });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason');

    if (!target)
      return interaction.editReply({ content: '❌ العضو غير موجود.' });
    if (target.id === interaction.user.id)
      return interaction.editReply({ content: '❌ لا تقدر تحذر نفسك.' });
    if (target.user.bot)
      return interaction.editReply({ content: '❌ لا تقدر تحذر بوت.' });

    // ✅ حفظ دائم في ملف JSON
    const total = addWarning(target.id, {
      reason,
      date:      new Date().toISOString(),
      moderator: interaction.user.tag,
      guildId:   interaction.guild.id,
    });

    // DM للعضو
    const dmEmbed = new EmbedBuilder()
      .setTitle('⚠️  لقيت تحذير')
      .setDescription(`لقيت تحذير في **${interaction.guild.name}**`)
      .addFields(
        { name: 'السبب',           value: reason },
        { name: 'المشرف',          value: interaction.user.tag },
        { name: 'مجموع التحذيرات', value: `${total}` }
      )
      .setColor(0xffa500)
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    await logAction(interaction.guild, {
      type:      'warn',
      moderator: interaction.user,
      target,
      reason:    `${reason} (تحذير #${total})`,
    }).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('⚠️  تحذير صدر')
      .addFields(
        { name: 'العضو',           value: `${target}`,           inline: true },
        { name: 'المشرف',          value: `${interaction.user}`, inline: true },
        { name: 'السبب',           value: reason },
        { name: 'مجموع التحذيرات', value: `${total}` }
      )
      .setColor(0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[WARN] ${target.user.tag} warned by ${interaction.user.tag} — #${total}`);
  },
};