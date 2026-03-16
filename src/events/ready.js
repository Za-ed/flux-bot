// ─── events/ready.js ──────────────────────────────────────────────────────────
const { ActivityType, Events }    = require('discord.js');
const { cacheInvites }            = require('./guildMemberAdd');
const { scheduleDailyReport }     = require('../utils/dailyReport');
const { restoreTickets }          = require('./interactionCreate');
const { scheduleAINews }          = require('../utils/aiNewsScheduler'); // ✅ أخبار AI

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`\n[READY] ✅ Logged in as ${client.user.tag}`);
    console.log(`[READY] Serving ${client.guilds.cache.size} guild(s).\n`);

    // ── كاش الدعوات ───────────────────────────────────────────────────────
    for (const guild of client.guilds.cache.values()) {
      await cacheInvites(guild).catch(() => {});
    }
    console.log('[READY] Invite cache loaded');

    // ── استرجاع التذاكر المفتوحة ──────────────────────────────────────────
    for (const guild of client.guilds.cache.values()) {
      await restoreTickets(guild).catch(() => {});
    }
    console.log('[READY] Open tickets restored');

    // ── تقرير السيرفر اليومي (12:00 AM UTC+3) ────────────────────────────
    scheduleDailyReport(client);

    // ── تقرير أخبار AI اليومي (8:00 PM UTC+3) ────────────────────────────
    scheduleAINews(client);

    client.user.setPresence({
      activities: [{ name: '/ask-flux | FLUX • IO', type: ActivityType.Watching }],
      status: 'online',
    });
  },
};