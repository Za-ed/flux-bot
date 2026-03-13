// ─── events/leveling.js ───────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { getTier } = require('../utils/rankCard');

const XP_FILE = path.join(__dirname, '..', 'data', 'xp.json');

// ─── Config ───────────────────────────────────────────────────────────────────
const XP_PER_MSG  = { min: 15, max: 25 };
const COOLDOWN_MS = 60 * 1000;

// ─── رتب Discord التلقائية ────────────────────────────────────────────────────
const TIER_ROLES = {
  'مبتدئ':   { minLevel: 0   },
  'مطور':    { minLevel: 10  },
  'محترف':   { minLevel: 20  },
  'خبير':    { minLevel: 40  },
  'أسطورة':  { minLevel: 60  },
  'PRESTIGE':{ minLevel: 100 },
};

const TIER_ROLE_NAMES = Object.keys(TIER_ROLES);

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadXP() {
  try {
    if (!fs.existsSync(XP_FILE)) return {};
    return JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
  } catch { return {}; }
}

function saveXP(data) {
  try {
    const dir = path.dirname(XP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(XP_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

// ─── XP Helpers ───────────────────────────────────────────────────────────────
function xpForLevel(n)  { return Math.floor(100 * Math.pow(n, 1.5)); }

function getUserData(db, guildId, userId) {
  if (!db[guildId])         db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = { xp: 0, level: 0, lastMsg: 0 };
  return db[guildId][userId];
}

// ─── تحديث رتبة Discord ───────────────────────────────────────────────────────
async function updateTierRole(member, newLevel) {
  try {
    const guild       = member.guild;
    const newTierName = getTier(newLevel).name;

    for (const roleName of TIER_ROLE_NAMES) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
      }
    }

    const newRole = guild.roles.cache.find((r) => r.name === newTierName);
    if (newRole) await member.roles.add(newRole).catch(() => {});

  } catch (err) {
    console.error('[LEVELING] فشل تحديث الرتبة:', err.message);
  }
}

// ─── إعلان الترقية ────────────────────────────────────────────────────────────
async function announceLevelUp(guild, member, oldLevel, newLevel) {
  const channel = guild.channels.cache.find(
    (c) => c.isTextBased() &&
           (c.name.includes('general') || c.name.includes('عام') || c.name.includes('announce'))
  );
  if (!channel) return;

  const oldTier = getTier(oldLevel);
  const newTier = getTier(newLevel);
  const tierUp  = oldTier.name !== newTier.name;

  const embed = new EmbedBuilder()
    .setColor(newTier.glow ?? 0x1e90ff)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: 'FLUX • IO  |  نظام المستويات' });

  if (tierUp) {
    embed
      .setTitle(`${newTier.emoji}  ترقية رتبة!`)
      .setDescription(
        `${member} وصل لرتبة **${newTier.name}**! 🎉\n\n` +
        `${oldTier.emoji} ${oldTier.name}  →  ${newTier.emoji} **${newTier.name}**\n` +
        `المستوى: **${newLevel}**`
      );
  } else {
    embed
      .setTitle(`⬆️  ترقية مستوى!`)
      .setDescription(
        `${member} وصل للمستوى **${newLevel}**! 🎊\n` +
        `${newTier.emoji} ${newTier.name}`
      );
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── Cooldown Map ─────────────────────────────────────────────────────────────
const cooldowns = new Map();

// ─── Handler ──────────────────────────────────────────────────────────────────
async function handleXP(message) {
  if (message.author.bot)         return;
  if (!message.guild)             return;
  if (message.channel.isThread()) return; // ✅ تجاهل الثريدات — هذا كان يتعارض مع messageCreate.js

  const { author, guild } = message;
  const now = Date.now();

  const lastTime = cooldowns.get(`${guild.id}:${author.id}`) || 0;
  if (now - lastTime < COOLDOWN_MS) return;
  cooldowns.set(`${guild.id}:${author.id}`, now);

  const db   = loadXP();
  const user = getUserData(db, guild.id, author.id);

  const xpGain = Math.floor(Math.random() * (XP_PER_MSG.max - XP_PER_MSG.min + 1)) + XP_PER_MSG.min;
  user.xp     += xpGain;
  user.lastMsg = now;

  const oldLevel = user.level;
  while (user.xp >= xpForLevel(user.level + 1)) {
    user.xp    -= xpForLevel(user.level + 1);
    user.level += 1;
  }

  saveXP(db);

  if (user.level > oldLevel) {
    const member = guild.members.cache.get(author.id);
    if (member) {
      await updateTierRole(member, user.level);
      await announceLevelUp(guild, member, oldLevel, user.level);
    }
    console.log(`[LEVELING] ⬆️ ${author.tag} → مستوى ${user.level}`);
  }
}

// ─── دوال مساعدة للأوامر ──────────────────────────────────────────────────────
function getUserLevel(guildId, userId) {
  const db = loadXP();
  return getUserData(db, guildId, userId);
}

function getLeaderboard(guildId, top = 10) {
  const db    = loadXP();
  const guild = db[guildId] || {};
  return Object.entries(guild)
    .map(([uid, d]) => ({ userId: uid, level: d.level, xp: d.xp }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, top);
}

function addXP(guildId, userId, amount) {
  const db   = loadXP();
  const user = getUserData(db, guildId, userId);
  user.xp   += amount;
  while (user.xp >= xpForLevel(user.level + 1)) {
    user.xp    -= xpForLevel(user.level + 1);
    user.level += 1;
  }
  saveXP(db);
  return user;
}

module.exports = {
  name:    'messageCreate',
  once:    false,
  execute: handleXP,        // ✅ هذه كانت ناقصة — السبب الجذري لعدم عمل AI
  // ✅ هذه كانت ناقصة — reactionXP.js و voiceXP.js يحتاجونها
  updateTierRole,
  announceLevelUp,
  // دوال الأوامر
  getUserLevel,
  getLeaderboard,
  addXP,
  xpForLevel,
  getTier,
};