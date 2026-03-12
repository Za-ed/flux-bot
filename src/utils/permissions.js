// ─── utils/permissions.js ─────────────────────────────────────────────────────
const { canUseCommand } = require('./permManager');

// ─── Roles ────────────────────────────────────────────────────────────────────
const ROLES = {
  FOUNDER:   'CORE Founder👑',
  ADMIN:     'CORE Admin🛡',
  MODERATOR: 'CORE Moderator🔧',
};

function hasRole(member, ...roleNames) {
  return member.roles.cache.some((r) => roleNames.includes(r.name));
}

function isFounder(member)   { return hasRole(member, ROLES.FOUNDER); }
function isAdmin(member)     { return hasRole(member, ROLES.FOUNDER, ROLES.ADMIN); }
function isModerator(member) { return hasRole(member, ROLES.FOUNDER, ROLES.ADMIN, ROLES.MODERATOR); }

function getRoleLevel(member) {
  if (member.roles.cache.some((r) => r.name === ROLES.FOUNDER))   return 3;
  if (member.roles.cache.some((r) => r.name === ROLES.ADMIN))     return 2;
  if (member.roles.cache.some((r) => r.name === ROLES.MODERATOR)) return 1;
  return 0;
}

function isOnlyModerator(member) {
  return isModerator(member) && !isAdmin(member);
}

module.exports = {
  ROLES,
  isFounder,
  isAdmin,
  isModerator,
  isOnlyModerator,
  getRoleLevel,
  canUseCommand, // ← من permManager
};