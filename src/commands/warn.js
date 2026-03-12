// ─── warn.js ──────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin }   = require('../utils/permissions');
const { logAction } = require('../utils/modLog');
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'warnings.json');

function loadWarnings() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return {}; }
}

function saveWarnings(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function addWarning(guildId, userId, warn) {
  const db  = loadWarnings();
  const key = `${guildId}:${userId}`;
  if (!db[key]) db[key] = [];
  db[key].push(warn);
  saveWarnings(db);
  return db[key].length;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('تحذير عضو في السيرفر.')
    .addUserOption((o) => o.setName('member').setDescription('العضو المراد تحذيره').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب التحذير').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isAdmin(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason');

    if (!target)                           return interaction.editReply({ content: '❌ العضو غير موجود.' });
    if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ ما تقدر تحذر نفسك.' });
    if (target.user.bot)                   return interaction.editReply({ content: '❌ ما تقدر تحذر بوت.' });

    const total = addWarning(interaction.guild.id, target.id, {
      reason,
      moderator:   interaction.user.tag,
      moderatorId: interaction.user.id,
      date:        new Date().toISOString(),
    });

    // DM للعضو
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️  لقيت تحذير')
          .setDescription(`لقيت تحذير في **${interaction.guild.name}**`)
          .addFields(
            { name: '📝  السبب',           value: reason,               inline: false },
            { name: '🛡️  المشرف',          value: interaction.user.tag, inline: true  },
            { name: '🔢  مجموع تحذيراتك',  value: `${total} تحذير`,     inline: true  },
          )
          .setColor(0xffa500)
          .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
          .setTimestamp(),
      ],
    }).catch(() => {});

    // Mod Log
    await logAction(interaction.guild, {
      type: 'warn', moderator: interaction.user, target,
      reason: `${reason} (تحذير #${total})`,
    }).catch(() => {});

    // رد في القناة
    const embed = new EmbedBuilder()
      .setTitle('⚠️  تحذير صدر')
      .addFields(
        { name: '👤  العضو',           value: `${target}`,           inline: true  },
        { name: '🛡️  المشرف',          value: `${interaction.user}`, inline: true  },
        { name: '📝  السبب',           value: reason,                inline: false },
        { name: '🔢  مجموع التحذيرات', value: `**${total}** تحذير`,  inline: true  },
      )
      .setColor(total >= 3 ? 0xff4444 : 0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
      .setTimestamp();

    if (total >= 3)
      embed.setDescription(`🚨 **تنبيه:** ${target} وصل لـ **${total} تحذيرات!**`);

    await interaction.editReply({ embeds: [embed] });
  },
};