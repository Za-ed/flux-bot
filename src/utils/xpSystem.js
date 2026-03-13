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
        console.log('[XP] ✅ Connected to MongoDB');
        return xpCollection;
    } catch (err) {
        console.error('[XP] ❌ MongoDB Error:', err.message);
        return null;
    }
}

// معادلة المستوى (ثابتة كما طلبت)
function xpForLevel(n) {
    return Math.floor(100 * (Math.pow(n, 1.5))) + 50;
}

// دالة إضافة XP الذكية (تعمل بطلبات أقل للداتابيز)
async function addXP(guildId, userId, amount, type = 'msg') {
    const col = await connect();
    if (!col) return null;

    const fieldKey = type === 'msg' ? 'msg_count' : `${type}_xp`;

    // 1. جلب البيانات الحالية أو إنشاء جديد
    let user = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        { 
            $inc: { xp: amount, total_xp: amount, [fieldKey]: 1 },
            $setOnInsert: { created_at: Date.now(), level: 0, streak: 0, last_daily: 0 }
        },
        { upsert: true, returnDocument: 'after' }
    );

    user = user.value || user;
    let leveled = false;
    let currentLevel = user.level || 0;
    let currentXP = user.xp;

    // 2. حساب الليفل أب (Logic Loop)
    while (currentXP >= xpForLevel(currentLevel + 1)) {
        currentXP -= xpForLevel(currentLevel + 1);
        currentLevel++;
        leveled = true;
    }

    // 3. تحديث الليفل فقط إذا تغير (توفير في IO)
    if (leveled) {
        await col.updateOne(
            { guild_id: guildId, user_id: userId },
            { $set: { level: currentLevel, xp: currentXP } }
        );
        user.level = currentLevel;
        user.xp = currentXP;
    }

    return { gain: amount, leveled, user };
}

// إضافة XP الرسائل مع كولداون
async function addMessageXP(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const now = Math.floor(Date.now() / 1000);
    if (cooldownCache.has(key) && (now - cooldownCache.get(key) < 60)) return null;
    
    cooldownCache.set(key, now);
    // نظام "Boost" بسيط: في المستويات العالية جداً، زد الـ XP الممنوح قليلاً
    const baseGain = Math.floor(Math.random() * 11) + 15; // 15-25
    return addXP(guildId, userId, baseGain, 'msg');
}

module.exports = { 
    init: connect, addMessageXP, addInviteXP: (g, u) => addXP(g, u, 50, 'invite'),
    addVoiceXP: (g, u) => addXP(g, u, 10, 'voice'),
    addReactionXP: (g, u) => addXP(g, u, 5, 'reaction'),
    addManualXP: (g, u, amt) => addXP(g, u, amt, 'manual'),
    getUserData: (g, u) => connect().then(c => c?.findOne({ guild_id: g, user_id: u })),
    getUserRank: async (g, u) => {
        const col = await connect();
        const user = await col.findOne({ guild_id: g, user_id: u });
        return user ? (await col.countDocuments({ guild_id: g, total_xp: { $gt: user.total_xp } })) + 1 : null;
    },
    xpForLevel
};