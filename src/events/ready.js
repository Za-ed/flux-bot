// ─── events/ready.js ──────────────────────────────────────────────────────────
const { ActivityType, Events } = require('discord.js');
const { cacheInvites }         = require('./guildMemberAdd');
const { scheduleDailyReport }  = require('../utils/dailyReport');
const { restoreTickets }       = require('./interactionCreate'); // ✅ استرجاع التذاكر

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`\n[READY] ✅ Logged in as ${client.user.tag}`);
    console.log(`[READY] Serving ${client.guilds.cache.size} guild(s).\n`);

    // ── كاش الدعوات عند البدء ─────────────────────────────────────────────
    for (const guild of client.guilds.cache.values()) {
      await cacheInvites(guild).catch(() => {});
    }
    console.log('[READY] Invite cache loaded');

    // ── استرجاع التذاكر المفتوحة بعد كل restart ──────────────────────────
    for (const guild of client.guilds.cache.values()) {
      await restoreTickets(guild).catch(() => {});
    }
    console.log('[READY] Open tickets restored');

    // ── جدول التقرير اليومي ───────────────────────────────────────────────
    scheduleDailyReport(client);

    client.user.setPresence({
      activities: [{ name: '/ask-flux | FLUX • IO', type: ActivityType.Watching }],
      status: 'online',
    });
  },
};