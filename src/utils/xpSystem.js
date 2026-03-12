const { MongoClient } = require('mongodb');

// استخدم البيئة المحيطة دائماً للأمان
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'fluxbot';
const COL_NAME = 'xp';

let dbClient = null;
let xpCollection = null;

// كاش بسيط لتقليل الضغط على الداتابيز (اختياري لكن مفيد)
const cooldownCache = new Map(); 

async function connect() {
    if (xpCollection) return xpCollection;
    try {
        dbClient = new MongoClient(MONGO_URI);
        await dbClient.connect();
        const db = dbClient.db(DB_NAME);
        xpCollection = db.collection(COL_NAME);

        // فهارس للسرعة - ضرورية جداً مع كبر حجم البيانات
        await xpCollection.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
        await xpCollection.createIndex({ guild_id: 1, total_xp: -1 });

        console.log('[XP] ✅ Connected to MongoDB');
        return xpCollection;
    } catch (err) {
        console.error('[XP] ❌ MongoDB Connection Error:', err.message);
        return null;
    }
}

const XP_CONFIG = {
    MSG_MIN: 15, MSG_MAX: 25, MSG_COOLDOWN: 60,
    VOICE_PER_MIN: 10, REACTION_XP: 5, INVITE_XP: 50,
    DAILY_BASE: 100, STREAK_BONUS: 20, STREAK_MAX: 500,
};

// معادلة المستوى (جعلتها أكثر توازناً)
function xpForLevel(n) {
    return Math.floor(100 * (n ** 1.5)) + 50; 
}

// ─── التحسين الجوهري: استخدام Atomic Updates ──────────────────────────────
async function addXP(guildId, userId, amount, type = 'msg') {
    const col = await connect();
    if (!col) return null;

    // استخدام $inc يجعل العملية تتم داخل الداتابيز مباشرة (أسرع وأضمن)
    const result = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        { 
            $inc: { xp: amount, total_xp: amount, [type === 'msg' ? 'msg_count' : type + '_xp']: 1 },
            $setOnInsert: { created_at: Date.now(), level: 0, streak: 0, last_daily: 0 }
        },
        { upsert: true, returnDocument: 'after' }
    );

    let user = result; // في الإصدارات الجديدة من MongoDB قد تحتاج result.value
    
    // فحص الترقية (Level Up)
    let leveled = false;
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
}

// ─── وظائف الـ XP المبسطة ──────────────────────────────────────────────────

async function addMessageXP(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const now = Math.floor(Date.now() / 1000);
    
    // فحص الكاش قبل لمس الداتابيز (توفير موارد)
    if (cooldownCache.has(key) && (now - cooldownCache.get(key) < XP_CONFIG.MSG_COOLDOWN)) return null;
    
    cooldownCache.set(key, now);
    const gain = Math.floor(Math.random() * (XP_CONFIG.MSG_MAX - XP_CONFIG.MSG_MIN + 1)) + XP_CONFIG.MSG_MIN;
    return await addXP(guildId, userId, gain, 'msg');
}

async function addInviteXP(guildId, userId) {
    return await addXP(guildId, userId, XP_CONFIG.INVITE_XP, 'invite');
}

async function claimDaily(guildId, userId) {
    const col = await connect();
    const user = await col.findOne({ guild_id: guildId, user_id: userId }) || { last_daily: 0, streak: 0 };
    
    const now = Math.floor(Date.now() / 1000);
    const oneDay = 86400;
    const timeSince = now - user.last_daily;

    if (timeSince < oneDay) return { success: false, remaining: oneDay - timeSince };

    let newStreak = (timeSince > oneDay * 2) ? 1 : (user.streak || 0) + 1;
    const bonus = Math.min(XP_CONFIG.STREAK_BONUS * (newStreak - 1), XP_CONFIG.STREAK_MAX);
    const totalGain = XP_CONFIG.DAILY_BASE + bonus;

    await col.updateOne(
        { guild_id: guildId, user_id: userId },
        { 
            $inc: { xp: totalGain, total_xp: totalGain },
            $set: { last_daily: now, streak: newStreak },
            $setOnInsert: { level: 0 }
        },
        { upsert: true }
    );

    return { success: true, gain: totalGain, streak: newStreak };
}

async function getLeaderboard(guildId, limit = 10) {
    const col = await connect();
    if (!col) return [];
    return col.find({ guild_id: guildId }).sort({ total_xp: -1 }).limit(limit).toArray();
}

module.exports = {
    init: connect,
    addMessageXP,
    addInviteXP,
    claimDaily,
    getLeaderboard,
    xpForLevel
};