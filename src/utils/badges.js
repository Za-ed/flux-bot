// ─── utils/badges.js ──────────────────────────────────────────────────────────
// نظام الشارات — MongoDB بدل JSON
// ══════════════════════════════════════════════════════════════════════════════
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'badges';

let badgesCol = null;

async function connect() {
    if (badgesCol) return badgesCol;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        badgesCol = dbClient.db(DB_NAME).collection(COL_NAME);
        await badgesCol.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
        console.log('[BADGES] ✅ Connected to MongoDB');
        return badgesCol;
    } catch (err) {
        console.error('[BADGES] ❌ MongoDB Error:', err.message);
        return null;
    }
}

// ─── تعريف كل الشارات ────────────────────────────────────────────────────────
const ALL_BADGES = [
    { id: 'level_5',   emoji: '🌱', name: 'ناشئ',      desc: 'وصل للمستوى 5',             type: 'level',   threshold: 5   },
    { id: 'level_10',  emoji: '⚡', name: 'نشيط',       desc: 'وصل للمستوى 10',            type: 'level',   threshold: 10  },
    { id: 'level_20',  emoji: '🔥', name: 'محترف',      desc: 'وصل للمستوى 20',            type: 'level',   threshold: 20  },
    { id: 'level_50',  emoji: '💎', name: 'أسطورة',     desc: 'وصل للمستوى 50',            type: 'level',   threshold: 50  },
    { id: 'level_100', emoji: '👑', name: 'إمبراطور',   desc: 'وصل للمستوى 100',           type: 'level',   threshold: 100 },
    { id: 'trivia_10', emoji: '🧠', name: 'عارف',       desc: 'أجاب على 10 أسئلة تريفيا', type: 'trivia',  threshold: 10  },
    { id: 'trivia_50', emoji: '🎓', name: 'موسوعة',     desc: 'أجاب على 50 سؤال تريفيا',  type: 'trivia',  threshold: 50  },
    { id: 'games_10',  emoji: '🕹️', name: 'لاعب',       desc: 'فاز في 10 ألعاب',           type: 'games',   threshold: 10  },
    { id: 'games_50',  emoji: '🏆', name: 'بطل',        desc: 'فاز في 50 لعبة',            type: 'games',   threshold: 50  },
    { id: 'daily_7',   emoji: '📅', name: 'منتظم',      desc: 'أكمل مهام 7 أيام متتالية', type: 'streak',  threshold: 7   },
    { id: 'daily_30',  emoji: '🗓️', name: 'ملتزم',      desc: 'أكمل مهام 30 يوم متتالي',  type: 'streak',  threshold: 30  },
    { id: 'og',        emoji: '🌟', name: 'OG',         desc: 'من أوائل الأعضاء',          type: 'special', threshold: 0   },
];

// ─── جلب شارات مستخدم ────────────────────────────────────────────────────────
async function getUserBadges(guildId, userId) {
    const col = await connect();
    if (!col) return [];
    const doc = await col.findOne({ guild_id: guildId, user_id: userId });
    return doc?.badges ?? [];
}

// ─── هل عنده شارة معينة ──────────────────────────────────────────────────────
async function hasBadge(guildId, userId, badgeId) {
    const badges = await getUserBadges(guildId, userId);
    return badges.includes(badgeId);
}

// ─── منح شارة ────────────────────────────────────────────────────────────────
async function awardBadge(guildId, userId, badgeId) {
    const col = await connect();
    if (!col) return false;

    const result = await col.updateOne(
        { guild_id: guildId, user_id: userId, badges: { $ne: badgeId } },
        {
            $push:        { badges: badgeId },
            $setOnInsert: { created_at: Date.now() },
        },
        { upsert: true }
    );

    return result.modifiedCount > 0 || result.upsertedCount > 0;
}

// ─── فحص شارات المستوى ───────────────────────────────────────────────────────
async function checkLevelBadges(guildId, userId, level) {
    const newBadges = [];
    for (const badge of ALL_BADGES.filter(b => b.type === 'level')) {
        if (level >= badge.threshold) {
            const isNew = await awardBadge(guildId, userId, badge.id);
            if (isNew) newBadges.push(badge);
        }
    }
    return newBadges;
}

// ─── فحص شارات الإنجازات ─────────────────────────────────────────────────────
async function checkStatBadges(guildId, userId, type, count) {
    const newBadges = [];
    for (const badge of ALL_BADGES.filter(b => b.type === type)) {
        if (count >= badge.threshold) {
            const isNew = await awardBadge(guildId, userId, badge.id);
            if (isNew) newBadges.push(badge);
        }
    }
    return newBadges;
}

// ─── عرض الشارات كنص ─────────────────────────────────────────────────────────
async function formatBadges(guildId, userId) {
    const ids = await getUserBadges(guildId, userId);
    if (ids.length === 0) return '_(لا توجد شارات بعد)_';
    return ids
        .map(id => ALL_BADGES.find(b => b.id === id))
        .filter(Boolean)
        .map(b => `${b.emoji} **${b.name}**`)
        .join('  ');
}

module.exports = {
    ALL_BADGES,
    getUserBadges,
    hasBadge,
    awardBadge,
    checkLevelBadges,
    checkStatBadges,
    formatBadges,
};