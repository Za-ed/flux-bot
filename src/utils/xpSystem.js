// ─── utils/xpSystem.js ────────────────────────────────────────────────────
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'xp';

let xpCollection = null;
const cooldownCache = new Map();

async function connect() {
    if (xpCollection) return xpCollection;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        xpCollection = dbClient.db(DB_NAME).collection(COL_NAME);
        await xpCollection.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
        // ─── Index إضافي لتسريع الـ Leaderboard ─────────────────────────────
        await xpCollection.createIndex({ guild_id: 1, total_xp: -1 });
        console.log('[XP] ✅ Connected to MongoDB');
        return xpCollection;
    } catch (err) {
        console.error('[XP] ❌ MongoDB Error:', err.message);
        return null;
    }
}

// ─── معادلة المستوى ────────────────────────────────────────────────────────
function xpForLevel(n) {
    return Math.floor(100 * (Math.pow(n, 1.5))) + 50;
}

// ─── دالة إضافة XP الذكية ─────────────────────────────────────────────────
async function addXP(guildId, userId, amount, type = 'msg') {
    const col = await connect();
    if (!col) return null;

    const fieldKey = type === 'msg' ? 'msg_count' : `${type}_xp`;

    // ── جلب أو إنشاء المستخدم ──────────────────────────────────────────────
    // إصلاح: MongoDB Driver 5+ أزال .value — نستخدم النتيجة مباشرة
    const user = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        {
            $inc: { xp: amount, total_xp: amount, [fieldKey]: 1 },
            $setOnInsert: { created_at: Date.now(), level: 0, streak: 0, last_daily: 0 }
        },
        { upsert: true, returnDocument: 'after' }
    );

    // حماية: لو الداتابيز رجعت null لسبب غير متوقع
    if (!user) {
        console.error(`[XP] findOneAndUpdate returned null for ${userId}`);
        return null;
    }

    let leveled       = false;
    let currentLevel  = user.level || 0;
    let currentXP     = user.xp;

    // ── حساب Level Up ──────────────────────────────────────────────────────
    while (currentXP >= xpForLevel(currentLevel + 1)) {
        currentXP -= xpForLevel(currentLevel + 1);
        currentLevel++;
        leveled = true;
    }

    // ── تحديث الليفل فقط إذا تغيّر ────────────────────────────────────────
    if (leveled) {
        await col.updateOne(
            { guild_id: guildId, user_id: userId },
            { $set: { level: currentLevel, xp: currentXP } }
        );
        user.level = currentLevel;
        user.xp    = currentXP;
    }

    return { gain: amount, leveled, user };
}

// ─── XP الرسائل مع كولداون ────────────────────────────────────────────────
async function addMessageXP(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const now = Math.floor(Date.now() / 1000);
    if (cooldownCache.has(key) && (now - cooldownCache.get(key) < 60)) return null;

    cooldownCache.set(key, now);
    const baseGain = Math.floor(Math.random() * 11) + 15; // 15-25 XP
    return addXP(guildId, userId, baseGain, 'msg');
}

// ─── Leaderboard (الدالة الجديدة) ─────────────────────────────────────────
/**
 * يجلب أعلى N أعضاء من حيث total_xp في السيرفر
 * @param {string} guildId
 * @param {number} limit  - عدد الأعضاء (افتراضي 10)
 * @returns {Promise<Array<{user_id, level, xp, total_xp}>>}
 */
async function getLeaderboard(guildId, limit = 10) {
    const col = await connect();
    if (!col) return [];

    try {
        const results = await col
            .find({ guild_id: guildId })
            .sort({ total_xp: -1 })
            .limit(limit)
            .project({ user_id: 1, level: 1, xp: 1, total_xp: 1, _id: 0 })
            .toArray();

        return results;
    } catch (err) {
        console.error('[XP] getLeaderboard error:', err.message);
        return [];
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────
module.exports = {
    init:           connect,
    addMessageXP,
    addInviteXP:    (g, u)      => addXP(g, u, 50,  'invite'),
    addVoiceXP:     (g, u)      => addXP(g, u, 10,  'voice'),
    addReactionXP:  (g, u)      => addXP(g, u, 5,   'reaction'),
    addManualXP:    (g, u, amt) => addXP(g, u, amt, 'manual'),
    getUserData:    (g, u)      => connect().then(c => c?.findOne({ guild_id: g, user_id: u })),
    getUserRank:    async (g, u) => {
        const col  = await connect();
        if (!col) return null;
        const user = await col.findOne({ guild_id: g, user_id: u });
        if (!user) return null;
        return (await col.countDocuments({ guild_id: g, total_xp: { $gt: user.total_xp } })) + 1;
    },
    getLeaderboard, // ✅ الدالة الجديدة
    xpForLevel,
};