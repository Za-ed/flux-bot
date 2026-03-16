// ─── utils/permManager.js ─────────────────────────────────────────────────────
// نظام صلاحيات مخصص — MongoDB بدل JSON
// ══════════════════════════════════════════════════════════════════════════════
const { MongoClient } = require('mongodb');

const MONGO_URI    = process.env.MONGO_URI;
const DB_NAME      = 'fluxbot';
const COL_NAME     = 'cmd_perms';
const FOUNDER_ROLE = 'CORE Founder👑';

let permsCol  = null;
// Cache محلي لتقليل ضغط الداتابيز (يُحدَّث عند كل تغيير)
let permCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // دقيقة واحدة

// ─── Connection ───────────────────────────────────────────────────────────────
async function connect() {
    if (permsCol) return permsCol;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        permsCol = dbClient.db(DB_NAME).collection(COL_NAME);
        await permsCol.createIndex({ command: 1 }, { unique: true });
        console.log('[PERMS] ✅ Connected to MongoDB');
        return permsCol;
    } catch (err) {
        console.error('[PERMS] ❌ MongoDB Error:', err.message);
        return null;
    }
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────
async function getAll() {
    if (permCache && Date.now() - cacheTime < CACHE_TTL) return permCache;
    const col  = await connect();
    if (!col) return {};
    const docs = await col.find({}).toArray();
    permCache  = {};
    for (const doc of docs) permCache[doc.command] = doc.roles ?? [];
    cacheTime  = Date.now();
    return permCache;
}

function invalidateCache() {
    permCache = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isFounder(member) {
    return member.roles.cache.some(r => r.name === FOUNDER_ROLE);
}

// ─── هل العضو يملك صلاحية الأمر؟ ────────────────────────────────────────────
async function canUseCommand(member, commandName) {
    if (isFounder(member)) return true;
    const db           = await getAll();
    const allowedRoles = db[commandName] ?? [];
    if (allowedRoles.length === 0) return false;
    return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

// ─── منح صلاحية رتبة لأمر ────────────────────────────────────────────────────
async function allowRole(commandName, roleId) {
    const col = await connect();
    if (!col) return;
    await col.updateOne(
        { command: commandName },
        { $addToSet: { roles: roleId } },
        { upsert: true }
    );
    invalidateCache();
}

// ─── سحب صلاحية رتبة من أمر ──────────────────────────────────────────────────
async function denyRole(commandName, roleId) {
    const col = await connect();
    if (!col) return;
    await col.updateOne(
        { command: commandName },
        { $pull: { roles: roleId } }
    );
    invalidateCache();
}

// ─── إعادة ضبط أمر ───────────────────────────────────────────────────────────
async function resetCommand(commandName) {
    const col = await connect();
    if (!col) return;
    await col.deleteOne({ command: commandName });
    invalidateCache();
}

// ─── جلب الرتب المسموحة لأمر ─────────────────────────────────────────────────
async function getAllowedRoles(commandName) {
    const db = await getAll();
    return db[commandName] ?? [];
}

module.exports = {
    isFounder,
    canUseCommand,
    allowRole,
    denyRole,
    resetCommand,
    getAllowedRoles,
};