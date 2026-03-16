// ─── utils/permManager.js ─────────────────────────────────────────────────────
// نظام صلاحيات — MongoDB مع Cache محلي فوري
// ══════════════════════════════════════════════════════════════════════════════
const { MongoClient } = require('mongodb');

const MONGO_URI    = process.env.MONGO_URI;
const DB_NAME      = 'fluxbot';
const COL_NAME     = 'cmd_perms';
const FOUNDER_ROLE = 'CORE Founder👑';

let permsCol  = null;
// ── Cache دائم في الذاكرة — يُحدَّث في الخلفية ────────────────────────────
let permCache  = {};        // { commandName: [roleId, ...] }
let cacheReady = false;     // هل تم التحميل الأولي؟
const CACHE_TTL = 60_000;   // دقيقة
let lastRefresh = 0;

// ─── Connection ───────────────────────────────────────────────────────────────
async function connect() {
    if (permsCol) return permsCol;
    try {
        const client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 1500, // ✅ أقل من نصف ثانية للـ timeout
            connectTimeoutMS: 1500,
            tls: true,
        });
        await client.connect();
        permsCol = client.db(DB_NAME).collection(COL_NAME);
        await permsCol.createIndex({ command: 1 }, { unique: true });
        console.log('[PERMS] ✅ Connected to MongoDB');
        return permsCol;
    } catch (err) {
        console.error('[PERMS] ❌ MongoDB:', err.message);
        return null;
    }
}

// ─── تحديث الـ Cache في الخلفية (لا يُبطئ الـ interaction) ──────────────────
async function refreshCacheBackground() {
    if (Date.now() - lastRefresh < CACHE_TTL) return;
    lastRefresh = Date.now();
    try {
        const col  = await connect();
        if (!col) return;
        const docs = await col.find({}).toArray();
        const fresh = {};
        for (const doc of docs) fresh[doc.command] = doc.roles ?? [];
        permCache  = fresh;
        cacheReady = true;
    } catch (err) {
        console.error('[PERMS] Cache refresh error:', err.message);
    }
}

// ─── استدعاء أولي عند تحميل الملف (في الخلفية — لا يبلوك) ──────────────────
refreshCacheBackground().catch(() => {});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isFounder(member) {
    return member.roles.cache.some(r => r.name === FOUNDER_ROLE);
}

// ─── canUseCommand — فوري من الـ Cache ───────────────────────────────────────
// لا async — لا await — لا تأخير على الـ interaction
function canUseCommand(member, commandName) {
    // FOUNDER يقدر يستخدم أي شيء دائماً
    if (isFounder(member)) return true;

    // لو الـ Cache ما اتحمل بعد → اسمح مؤقتاً وحدّث في الخلفية
    if (!cacheReady) {
        refreshCacheBackground().catch(() => {});
        return true;
    }

    const allowedRoles = permCache[commandName] ?? [];

    // لو ما في قائمة — الأمر محجوب
    if (allowedRoles.length === 0) return false;

    return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

// ─── العمليات الكتابية (async — تُستدعى من /setperm فقط) ────────────────────
async function allowRole(commandName, roleId) {
    const col = await connect();
    if (!col) return;
    await col.updateOne(
        { command: commandName },
        { $addToSet: { roles: roleId } },
        { upsert: true }
    );
    // تحديث الـ Cache المحلي فوراً
    if (!permCache[commandName]) permCache[commandName] = [];
    if (!permCache[commandName].includes(roleId)) permCache[commandName].push(roleId);
}

async function denyRole(commandName, roleId) {
    const col = await connect();
    if (!col) return;
    await col.updateOne({ command: commandName }, { $pull: { roles: roleId } });
    if (permCache[commandName]) {
        permCache[commandName] = permCache[commandName].filter(id => id !== roleId);
    }
}

async function resetCommand(commandName) {
    const col = await connect();
    if (!col) return;
    await col.deleteOne({ command: commandName });
    delete permCache[commandName];
}

async function getAllowedRoles(commandName) {
    return permCache[commandName] ?? [];
}

module.exports = {
    isFounder,
    canUseCommand,   // ✅ sync — لا يبطئ الـ interactions
    allowRole,
    denyRole,
    resetCommand,
    getAllowedRoles,
};
