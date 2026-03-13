// ─── events/ready.js ──────────────────────────────────────────────────────────
const { ActivityType } = require('discord.js');
const { cacheInvites } = require('./guildMemberAdd');
const { scheduleDailyReport } = require('../utils/dailyReport'); // ✅ كانت ناقصة

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`\n[READY] ✅ Logged in as ${client.user.tag}`);
    console.log(`[READY] Serving ${client.guilds.cache.size} guild(s).\n`);

    // ── كاش الدعوات عند البدء ─────────────────────────────────────────────
    for (const guild of client.guilds.cache.values()) {
      await cacheInvites(guild).catch(() => {});
    }
    console.log('[READY] Invite cache loaded');

    // ── جدول التقرير اليومي ───────────────────────────────────────────────
    // ✅ كانت ناقصة — التقرير ما كان يُرسل أبداً بدون هذا السطر
    scheduleDailyReport(client);

    client.user.setPresence({
      activities: [{ name: '/ask-flux | FLUX • IO', type: ActivityType.Watching }],
      status: 'online',
    });
  },
};