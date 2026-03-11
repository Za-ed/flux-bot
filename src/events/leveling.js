const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// ─── Config ───────────────────────────────────────────────────────────────────
const XP_PER_MESSAGE    = { min: 15, max: 25 };
const XP_COOLDOWN_MS    = 60 * 1000; // دقيقة بين كل رسالة تكسب XP
const LEVEL_UP_CHANNEL  = 'general'; // اسم القناة اللي تظهر فيها رسائل الترقية
const IGNORED_CHANNELS  = ['bot-commands', 'spam']; // قنوات ما تعطي XP

// ─── XP Formula ───────────────────────────────────────────────────────────────
// XP المطلوب للمستوى N = 100 * N^1.5
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function getTotalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i <= level; i++) total += xpForLevel(i);
  return total;
}

function getLevelFromXp(totalXp) {
  let level = 0;
  let xpNeeded = 0;
  while (true) {
    xpNeeded += xpForLevel(level + 1);
    if (totalXp < xpNeeded) break;
    level++;
  }
  return level;
}

function getXpInCurrentLevel(totalXp) {
  let level = getLevelFromXp(totalXp);
  let xpUsed = getTotalXpForLevel(level);
  return totalXp - xpUsed;
}

// ─── Persistent Storage ───────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, '..', 'data');
const XP_FILE   = path.join(DATA_DIR, 'xp.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(XP_FILE))  fs.writeFileSync(XP_FILE, '{}', 'utf8');
}

function loadXP() {
  try {
    ensureFile();
    return JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveXP(data) {
  try {
    ensureFile();
    fs.writeFileSync(XP_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[XP] فشل حفظ xp.json:', err.message);
  }
}

// ─── In-Memory ────────────────────────────────────────────────────────────────
let xpData     = loadXP();        // { guildId: { userId: { xp, lastMessage } } }
const cooldowns = new Map();       // userId -> timestamp

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGuildData(guildId) {
  if (!xpData[guildId]) xpData[guildId] = {};
  return xpData[guildId];
}

function getUserData(guildId, userId) {
  const guild = getGuildData(guildId);
  if (!guild[userId]) guild[userId] = { xp: 0, lastMessage: 0 };
  return guild[userId];
}

function getLeaderboard(guildId, limit = 10) {
  const guild = getGuildData(guildId);
  return Object.entries(guild)
    .map(([userId, data]) => ({ userId, xp: data.xp, level: getLevelFromXp(data.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

// ─── Module Export ────────────────────────────────────────────────────────────
module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild)     return;
    if (IGNORED_CHANNELS.includes(message.channel.name)) return;

    const { author, guild, channel } = message;
    const now = Date.now();

    // ── Cooldown ──────────────────────────────────────────────────────────
    const lastGain = cooldowns.get(`${guild.id}-${author.id}`) || 0;
    if (now - lastGain < XP_COOLDOWN_MS) return;
    cooldowns.set(`${guild.id}-${author.id}`, now);

    // ── إضافة XP ──────────────────────────────────────────────────────────
    const userData  = getUserData(guild.id, author.id);
    const oldLevel  = getLevelFromXp(userData.xp);
    const gainedXp  = Math.floor(Math.random() * (XP_PER_MESSAGE.max - XP_PER_MESSAGE.min + 1)) + XP_PER_MESSAGE.min;

    userData.xp          += gainedXp;
    userData.lastMessage  = now;
    xpData[guild.id][author.id] = userData;
    saveXP(xpData);

    const newLevel = getLevelFromXp(userData.xp);

    // ── Level Up ──────────────────────────────────────────────────────────
    if (newLevel > oldLevel) {
      console.log(`[XP] ${author.tag} ارتقى إلى المستوى ${newLevel}`);

      const levelUpChannel =
        guild.channels.cache.find((c) => c.name === LEVEL_UP_CHANNEL) || channel;

      const embed = new EmbedBuilder()
        .setTitle('🎉  ترقية مستوى!')
        .setDescription(`مبروك ${author}! وصلت للمستوى **${newLevel}** 🚀`)
        .addFields(
          { name: '📊 المستوى الجديد', value: `${newLevel}`,          inline: true },
          { name: '⭐ إجمالي XP',      value: `${userData.xp} XP`,    inline: true },
          { name: '📈 XP التالي',       value: `${xpForLevel(newLevel + 1)} XP`, inline: true }
        )
        .setThumbnail(author.displayAvatarURL({ dynamic: true }))
        .setColor(0xf1c40f)
        .setFooter({ text: 'FLUX • IO  |  نظام المستويات' })
        .setTimestamp();

      await levelUpChannel.send({ content: `${author}`, embeds: [embed] }).catch(() => {});
    }
  },

  // ── دوال مساعدة تُستخدم في الأوامر ──────────────────────────────────────
  getLevelFromXp,
  getXpInCurrentLevel,
  xpForLevel,
  getLeaderboard,
  getUserData,
  loadXP,
};