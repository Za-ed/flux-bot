// ─── badges.js ────────────────────────────────────────────────────────────────
// نظام الشارات — تُكسب بالمستوى والإنجازات

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'badges.json');

// ─── تعريف كل الشارات ────────────────────────────────────────────────────────
const ALL_BADGES = [
  // شارات المستوى
  { id: 'level_5',    emoji: '🌱', name: 'ناشئ',        desc: 'وصل للمستوى 5',          type: 'level',    threshold: 5   },
  { id: 'level_10',   emoji: '⚡', name: 'نشيط',         desc: 'وصل للمستوى 10',         type: 'level',    threshold: 10  },
  { id: 'level_20',   emoji: '🔥', name: 'محترف',        desc: 'وصل للمستوى 20',         type: 'level',    threshold: 20  },
  { id: 'level_50',   emoji: '💎', name: 'أسطورة',       desc: 'وصل للمستوى 50',         type: 'level',    threshold: 50  },
  { id: 'level_100',  emoji: '👑', name: 'إمبراطور',     desc: 'وصل للمستوى 100',        type: 'level',    threshold: 100 },

  // شارات الإنجازات
  { id: 'trivia_10',  emoji: '🧠', name: 'عارف',         desc: 'أجاب على 10 أسئلة تريفيا', type: 'trivia',  threshold: 10  },
  { id: 'trivia_50',  emoji: '🎓', name: 'موسوعة',       desc: 'أجاب على 50 سؤال تريفيا',  type: 'trivia',  threshold: 50  },
  { id: 'games_10',   emoji: '🕹️', name: 'لاعب',         desc: 'فاز في 10 ألعاب',           type: 'games',   threshold: 10  },
  { id: 'games_50',   emoji: '🏆', name: 'بطل',          desc: 'فاز في 50 لعبة',            type: 'games',   threshold: 50  },
  { id: 'daily_7',    emoji: '📅', name: 'منتظم',        desc: 'أكمل مهام 7 أيام متتالية',  type: 'streak',  threshold: 7   },
  { id: 'daily_30',   emoji: '🗓️', name: 'ملتزم',        desc: 'أكمل مهام 30 يوم متتالي',   type: 'streak',  threshold: 30  },
  { id: 'og',         emoji: '🌟', name: 'OG',           desc: 'من أوائل الأعضاء',           type: 'special', threshold: 0   },
];

// ─── Storage ──────────────────────────────────────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) { console.error('[BADGES] فشل الحفظ:', err.message); }
}

let db = load();

function getUserBadges(guildId, userId) {
  return db[guildId]?.[userId] ?? [];
}

function hasBadge(guildId, userId, badgeId) {
  return getUserBadges(guildId, userId).includes(badgeId);
}

function awardBadge(guildId, userId, badgeId) {
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = [];
  if (!db[guildId][userId].includes(badgeId)) {
    db[guildId][userId].push(badgeId);
    save(db);
    return true; // شارة جديدة
  }
  return false;
}

// ─── تحقق وامنح شارات المستوى ─────────────────────────────────────────────────
// يرجع مصفوفة الشارات الجديدة المكتسبة
function checkLevelBadges(guildId, userId, level) {
  const newBadges = [];
  for (const badge of ALL_BADGES.filter((b) => b.type === 'level')) {
    if (level >= badge.threshold && !hasBadge(guildId, userId, badge.id)) {
      awardBadge(guildId, userId, badge.id);
      newBadges.push(badge);
    }
  }
  return newBadges;
}

// ─── تحقق وامنح شارات الإنجازات ──────────────────────────────────────────────
function checkStatBadges(guildId, userId, type, count) {
  const newBadges = [];
  for (const badge of ALL_BADGES.filter((b) => b.type === type)) {
    if (count >= badge.threshold && !hasBadge(guildId, userId, badge.id)) {
      awardBadge(guildId, userId, badge.id);
      newBadges.push(badge);
    }
  }
  return newBadges;
}

// ─── عرض الشارات كنص ─────────────────────────────────────────────────────────
function formatBadges(guildId, userId) {
  const ids    = getUserBadges(guildId, userId);
  if (ids.length === 0) return '_(لا توجد شارات بعد)_';
  return ids
    .map((id) => ALL_BADGES.find((b) => b.id === id))
    .filter(Boolean)
    .map((b) => `${b.emoji} **${b.name}**`)
    .join('  ');
}

module.exports = {
  ALL_BADGES,
  getUserBadges,
  awardBadge,
  checkLevelBadges,
  checkStatBadges,
  formatBadges,
};