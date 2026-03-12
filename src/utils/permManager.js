// ─── utils/permManager.js ────────────────────────────────────────────────────
// نظام صلاحيات مخصص — يحفظ في JSON ويُفحص داخل كل أمر

const fs   = require('fs');
const path = require('path');

const DATA_FILE    = path.join(__dirname, '..', 'data', 'cmdPerms.json');
const FOUNDER_ROLE = 'CORE Founder👑';

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
  } catch (err) { console.error('[PERMS] فشل الحفظ:', err.message); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isFounder(member) {
  return member.roles.cache.some((r) => r.name === FOUNDER_ROLE);
}

// هل العضو يملك صلاحية تشغيل الأمر؟
function canUseCommand(member, commandName) {
  // الـ FOUNDER يقدر يستخدم أي أمر دائماً
  if (isFounder(member)) return true;

  const db = load();
  const allowedRoles = db[commandName] || [];

  // لو ما في قائمة — الأمر محجوب عن الكل
  if (allowedRoles.length === 0) return false;

  // تحقق إذا عنده رتبة مسموحة
  return member.roles.cache.some((r) => allowedRoles.includes(r.id));
}

// منح صلاحية رتبة لأمر
function allowRole(commandName, roleId) {
  const db = load();
  if (!db[commandName]) db[commandName] = [];
  if (!db[commandName].includes(roleId)) db[commandName].push(roleId);
  save(db);
}

// سحب صلاحية رتبة من أمر
function denyRole(commandName, roleId) {
  const db = load();
  if (!db[commandName]) return;
  db[commandName] = db[commandName].filter((id) => id !== roleId);
  save(db);
}

// إعادة ضبط أمر
function resetCommand(commandName) {
  const db = load();
  delete db[commandName];
  save(db);
}

// جلب الرتب المسموحة لأمر
function getAllowedRoles(commandName) {
  return load()[commandName] || [];
}

module.exports = { isFounder, canUseCommand, allowRole, denyRole, resetCommand, getAllowedRoles };