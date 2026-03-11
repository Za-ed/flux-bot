// ─── leveling.js ──────────────────────────────────────────────────────────────
// ✅ ملف utility فقط — لا يُصدّر name/execute
// XP من الرسائل يُعالَج في messageCreate.js

const fs   = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// ─── Config ───────────────────────────────────────────────────────────────────
const XP_PER_MESSAGE   = { min: 15, max: 25 };
const XP_COOLDOWN_MS   = 60 * 1000;
const LEVEL_UP_CHANNEL = 'general';
const IGNORED_CHANNELS = ['bot-commands', 'spam'];

// ─── XP Formula ───────────────────────────────────────────────────────────────
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function getTotalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i <= level; i++) total += xpForLevel(i);
  return total;
}

function getLevelFromXp(totalXp) {
  let level   = 0;
  let xpNeeded = 0;
  while (true) {
    xpNeeded += xpForLevel(level + 1);
    if (totalXp < xpNeeded) break;
    level++;
  }
  return level;
}

function getXpInCurrentLevel(totalXp) {
  const level  = getLevelFromXp(totalXp);
  const xpUsed = getTotalXpForLevel(level);
  return totalXp - xpUsed;
}

// ─── Persistent Storage ───────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const XP_FILE  = path.join(DATA_DIR, 'xp.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(XP_FILE))  fs.writeFileSync(XP_FILE, '{}', 'utf8');
}

function loadXP() {
  try {
    ensureFile();
    return JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
  } catch { return {}; }
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
let xpData     = loadXP();
const cooldowns = new Map(); // `${guildId}-${userId}` -> timestamp

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

// ✅ دالة مركزية لإضافة XP — تستخدمها voiceXP و gamingCorner بدل الكتابة المباشرة
function addXP(guildId, userId, amount) {
  const userData = getUserData(guildId, userId);
  const oldLevel = getLevelFromXp(userData.xp);
  userData.xp   += amount;
  xpData[guildId][userId] = userData;
  saveXP(xpData);
  const newLevel = getLevelFromXp(userData.xp);
  return { oldLevel, newLevel, totalXp: userData.xp };
}

// ─── XP من الرسائل (يُستدعى من messageCreate.js) ─────────────────────────────
async function handleMessageXP(message) {
  if (message.author.bot) return;
  if (!message.guild)     return;
  if (IGNORED_CHANNELS.includes(message.channel.name)) return;

  const { author, guild, channel } = message;
  const now = Date.now();

  const cooldownKey = `${guild.id}-${author.id}`;
  const lastGain    = cooldowns.get(cooldownKey) || 0;
  if (now - lastGain < XP_COOLDOWN_MS) return;
  cooldowns.set(cooldownKey, now);

  const gainedXp = Math.floor(
    Math.random() * (XP_PER_MESSAGE.max - XP_PER_MESSAGE.min + 1)
  ) + XP_PER_MESSAGE.min;

  const { oldLevel, newLevel } = addXP(guild.id, author.id, gainedXp);

  // Level Up
  if (newLevel > oldLevel) {
    console.log(`[XP] ${author.tag} ارتقى إلى المستوى ${newLevel}`);

    const levelUpChannel =
      guild.channels.cache.find((c) => c.name === LEVEL_UP_CHANNEL) || channel;

    // تحقق من شارات المستوى
    try {
      const { checkLevelBadges } = require('../utils/badges');
      const newBadges = checkLevelBadges(guild.id, author.id, newLevel);
      if (newBadges.length > 0) {
        const badgeText = newBadges.map((b) => `${b.emoji} **${b.name}**`).join(', ');
        await levelUpChannel.send(`🏅 ${author} كسب شارة جديدة: ${badgeText}`).catch(() => {});
      }
    } catch {}

    const userData = getUserData(guild.id, author.id);
    const embed = new EmbedBuilder()
      .setTitle('🎉  ترقية مستوى!')
      .setDescription(`مبروك ${author}! وصلت للمستوى **${newLevel}** 🚀`)
      .addFields(
        { name: '📊 المستوى الجديد', value: `${newLevel}`,               inline: true },
        { name: '⭐ إجمالي XP',      value: `${userData.xp} XP`,         inline: true },
        { name: '📈 XP التالي',       value: `${xpForLevel(newLevel + 1)} XP`, inline: true }
      )
      .setThumbnail(author.displayAvatarURL({ dynamic: true }))
      .setColor(0xf1c40f)
      .setFooter({ text: 'FLUX • IO  |  نظام المستويات' })
      .setTimestamp();

    await levelUpChannel.send({ content: `${author}`, embeds: [embed] }).catch(() => {});
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
// ✅ لا يوجد name/execute — لا يُسجَّل كـ event
module.exports = {
  // Utility functions
  getLevelFromXp,
  getXpInCurrentLevel,
  xpForLevel,
  getLeaderboard,
  getUserData,
  addXP,
  loadXP,
  saveXP,

  // Called from messageCreate.js
  handleMessageXP,

  // Config
  IGNORED_CHANNELS,
  XP_COOLDOWN_MS,
};