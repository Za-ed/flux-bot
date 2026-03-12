// ─── clearwarns.js (command) ──────────────────────────────────────────────────
const { SlashCommandBuilder } = require('discord.js');
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

function saveWarnings(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('مسح كل تحذيرات عضو.')
    .addUserOption((o) =>
      o.setName('member').setDescription('العضو').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAdmin(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });

    const target = interaction.options.getMember('member');
    if (!target) return interaction.editReply({ content: '❌ العضو غير موجود.' });

    const db  = loadWarnings();
    const key = `${interaction.guild.id}:${target.id}`;
    const old = db[key]?.length || 0;
    db[key]   = [];
    saveWarnings(db);

    await interaction.editReply({
      content: old > 0
        ? `✅ تم مسح **${old} تحذير** من ${target.user.tag}`
        : `ℹ️ ${target.user.tag} ما عنده تحذيرات أصلاً.`,
    });

    console.log(`[WARNS] ${interaction.user.tag} مسح ${old} تحذير من ${target.user.tag}`);
  },
};