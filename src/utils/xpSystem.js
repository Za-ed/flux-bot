const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'xp';

let dbClient     = null;
let xpCollection = null;

const cooldownCache = new Map();

// ─── الاتصال بالداتابيز ────────────────────────────────────────────────────
async function connect() {
    if (xpCollection) return xpCollection;
    try {
        // إضافة خيارات الاتصال لمنع التعليق وإصلاح الـ SSL
        dbClient = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 3000, // فشل سريع إذا لم يتصل خلال 3 ثوانٍ لمنع تعليق ديسكورد
            tls: true
        });
        
        await dbClient.connect();
        const db  = dbClient.db(DB_NAME);
        xpCollection = db.collection(COL_NAME);

        // فهارس ضرورية للسرعة
        await xpCollection.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
        await xpCollection.createIndex({ guild_id: 1, total_xp: -1 });

        console.log('[XP] ✅ Connected to MongoDB');
        return xpCollection;
    } catch (err) {
        console.error('[XP] ❌ MongoDB Connection Error:', err.message);
        throw err; // رمي الخطأ حتى لا يعتقد النظام أنه متصل
    }
}

// ─── إعدادات الـ XP ────────────────────────────────────────────────────────
const XP_CONFIG = {
    MSG_MIN:      15,
    MSG_MAX:      25,
    MSG_COOLDOWN: 60,
    VOICE_PER_MIN: 10,
    REACTION_XP:   5,
    INVITE_XP:    50,
    DAILY_BASE:  100,
    STREAK_BONUS:  20,
    STREAK_MAX:   500,
};

// ─── معادلة المستوى ────────────────────────────────────────────────────────
function xpForLevel(n) {
    return Math.floor(100 * (n ** 1.5)) + 50;
}

// ─── دالة addXP الأساسية ───────────────────────────────────────────────────
async function addXP(guildId, userId, amount, type = 'msg') {
    try {
        const col = await connect();
        if (!col) return null;

        const fieldKey = type === 'msg' ? 'msg_count' : `${type}_xp`;

        const result = await col.findOneAndUpdate(
            { guild_id: guildId, user_id: userId },
            {
                $inc:         { xp: amount, total_xp: amount, [fieldKey]: 1 },
                $setOnInsert: { created_at: Date.now(), level: 0, streak: 0, last_daily: 0 },
            },
            { upsert: true, returnDocument: 'after' }
        );

        let user = result?.value ?? result;
        if (!user) return null;

        let leveled      = false;
        let currentLevel = user.level || 0;

        while (user.xp >= xpForLevel(currentLevel + 1)) {
            user.xp -= xpForLevel(currentLevel + 1);
            currentLevel++;
            leveled = true;
        }

        if (leveled) {
            await col.updateOne(
                { guild_id: guildId, user_id: userId },
                { $set: { level: currentLevel, xp: user.xp } }
            );
            user.level = currentLevel;
        }

        return { gain: amount, leveled, user };
    } catch (err) {
        console.error(`[XP] Failed to add XP: ${err.message}`);
        return null;
    }
}

// ─── XP الرسائل (مع cooldown) ─────────────────────────────────────────────
async function addMessageXP(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const now = Math.floor(Date.now() / 1000);

    if (cooldownCache.has(key) && (now - cooldownCache.get(key) < XP_CONFIG.MSG_COOLDOWN)) return null;

    cooldownCache.set(key, now);
    const gain = Math.floor(Math.random() * (XP_CONFIG.MSG_MAX - XP_CONFIG.MSG_MIN + 1)) + XP_CONFIG.MSG_MIN;
    return addXP(guildId, userId, gain, 'msg');
}

// ─── XP الدعوات ────────────────────────────────────────────────────────────
async function addInviteXP(guildId, userId) {
    return addXP(guildId, userId, XP_CONFIG.INVITE_XP, 'invite');
}

// ─── XP اليومي (مع Streak) ─────────────────────────────────────────────────
async function claimDaily(guildId, userId) {
    try {
        const col  = await connect();
        if (!col) return { success: false, remaining: 0 };

        const user     = await col.findOne({ guild_id: guildId, user_id: userId }) || { last_daily: 0, streak: 0 };
        const now      = Math.floor(Date.now() / 1000);
        const oneDay   = 86400;
        const timeSince = now - user.last_daily;

        if (timeSince < oneDay) return { success: false, remaining: oneDay - timeSince };

        const newStreak = timeSince > oneDay * 2 ? 1 : (user.streak || 0) + 1;
        const bonus     = Math.min(XP_CONFIG.STREAK_BONUS * (newStreak - 1), XP_CONFIG.STREAK_MAX);
        const totalGain = XP_CONFIG.DAILY_BASE + bonus;

        await col.updateOne(
            { guild_id: guildId, user_id: userId },
            {
                $inc:         { xp: totalGain, total_xp: totalGain },
                $set:         { last_daily: now, streak: newStreak },
                $setOnInsert: { level: 0 },
            },
            { upsert: true }
        );

        return { success: true, gain: totalGain, streak: newStreak };
    } catch (err) {
        console.error(`[XP] Daily Claim Error: ${err.message}`);
        return { success: false, remaining: 0 };
    }
}

// ─── لوحة المتصدرين ────────────────────────────────────────────────────────
async function getLeaderboard(guildId, limit = 10) {
    try {
        const col = await connect();
        if (!col) return [];
        return await col.find({ guild_id: guildId }).sort({ total_xp: -1 }).limit(limit).toArray();
    } catch (err) {
        return [];
    }
}

// ─── بيانات مستخدم واحد ───────────────────────────────────────────────────
async function getUserData(guildId, userId) {
    try {
        const col = await connect();
        if (!col) return null;
        return await col.findOne({ guild_id: guildId, user_id: userId });
    } catch (err) {
        return null;
    }
}

// ─── ترتيب المستخدم (#1, #2 …) ────────────────────────────────────────────
async function getUserRank(guildId, userId) {
    try {
        const col = await connect();
        if (!col) return null;

        const user = await col.findOne({ guild_id: guildId, user_id: userId });
        if (!user) return null;

        const rank = await col.countDocuments({
            guild_id:  guildId,
            total_xp:  { $gt: user.total_xp || 0 },
        });

        return rank + 1;
    } catch (err) {
        return null;
    }
}

// ─── XP الصوت (كل دقيقة) ──────────────────────────────────────────────────
async function addVoiceXP(guildId, userId) {
    return addXP(guildId, userId, XP_CONFIG.VOICE_PER_MIN, 'voice');
}

// ─── XP التفاعلات ──────────────────────────────────────────────────────────
async function addReactionXP(guildId, userId) {
    return addXP(guildId, userId, XP_CONFIG.REACTION_XP, 'reaction');
}

// ─── إضافة XP يدوياً من الإدارة ───────────────────────────────────────────
async function addManualXP(guildId, userId, amount) {
    const col = await connect();
    if (!col) throw new Error('قاعدة البيانات غير متصلة');

    const result = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        {
            $inc:         { xp: amount, total_xp: amount },
            $setOnInsert: { created_at: Date.now(), level: 0, streak: 0, last_daily: 0 },
        },
        { upsert: true, returnDocument: 'after' }
    );

    let user = result?.value ?? result;
    if (!user) throw new Error('فشل جلب بيانات المستخدم بعد التعديل');

    let leveled      = false;
    let currentLevel = user.level || 0;

    while (user.xp >= xpForLevel(currentLevel + 1)) {
        user.xp -= xpForLevel(currentLevel + 1);
        currentLevel++;
        leveled = true;
    }

    if (leveled) {
        await col.updateOne(
            { guild_id: guildId, user_id: userId },
            { $set: { level: currentLevel, xp: user.xp } }
        );
        user.level = currentLevel;
    }

    return { leveled, user };
}

// ─── Exports ───────────────────────────────────────────────────────────────
module.exports = {
    init: connect,
    addMessageXP,
    addInviteXP,
    addVoiceXP,      
    addReactionXP,   
    addManualXP,
    claimDaily,
    getLeaderboard,
    getUserData,
    getUserRank,
    xpForLevel,
};