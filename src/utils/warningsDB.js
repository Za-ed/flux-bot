// ─── utils/warningsDB.js ──────────────────────────────────────────────────────
// نظام التحذيرات عبر MongoDB (بدل JSON الذي يُمسح عند كل restart)
// ══════════════════════════════════════════════════════════════════════════════
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'warnings';

let warningsCol = null;

async function connect() {
    if (warningsCol) return warningsCol;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        warningsCol = dbClient.db(DB_NAME).collection(COL_NAME);
        // Index لتسريع الاستعلامات
        await warningsCol.createIndex({ guild_id: 1, user_id: 1 });
        console.log('[WARNINGS-DB] ✅ Connected');
        return warningsCol;
    } catch (err) {
        console.error('[WARNINGS-DB] ❌ Error:', err.message);
        return null;
    }
}

/**
 * إضافة تحذير — يرجع عدد التحذيرات الكلي بعد الإضافة
 */
async function addWarning(guildId, userId, { reason, moderator, moderatorId }) {
    const col = await connect();
    if (!col) return 0;

    const entry = {
        reason,
        moderator,
        moderatorId,
        date: new Date().toISOString(),
        timestamp: Date.now(),
    };

    const result = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        {
            $push: { warns: entry },
            $inc:  { total: 1 },
            $setOnInsert: { created_at: Date.now() },
        },
        { upsert: true, returnDocument: 'after' }
    );

    return result?.total ?? 1;
}

/**
 * جلب كل تحذيرات عضو — يرجع { total, warns[] }
 */
async function getWarnings(guildId, userId) {
    const col = await connect();
    if (!col) return { total: 0, warns: [] };

    const doc = await col.findOne({ guild_id: guildId, user_id: userId });
    return {
        total: doc?.total ?? 0,
        warns: doc?.warns ?? [],
    };
}

/**
 * مسح كل تحذيرات عضو — يرجع عدد التحذيرات التي مُسحت
 */
async function clearWarnings(guildId, userId) {
    const col = await connect();
    if (!col) return 0;

    const doc = await col.findOneAndUpdate(
        { guild_id: guildId, user_id: userId },
        { $set: { warns: [], total: 0 } },
        { returnDocument: 'before' }
    );

    return doc?.total ?? 0;
}

/**
 * حذف تحذير واحد بالـ index
 */
async function removeWarning(guildId, userId, index) {
    const col = await connect();
    if (!col) return false;

    const doc = await col.findOne({ guild_id: guildId, user_id: userId });
    if (!doc || !doc.warns[index]) return false;

    doc.warns.splice(index, 1);

    await col.updateOne(
        { guild_id: guildId, user_id: userId },
        { $set: { warns: doc.warns, total: doc.warns.length } }
    );
    return true;
}

module.exports = { addWarning, getWarnings, clearWarnings, removeWarning };