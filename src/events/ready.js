const { ActivityType }           = require('discord.js');
const { scheduleDailyReport }    = require('../utils/dailyReport');

module.exports = {
  name: 'ready',
  once: true,

  execute(client) {
    console.log(`\n[READY] ✅ Logged in as ${client.user.tag}`);
    console.log(`[READY] Serving ${client.guilds.cache.size} guild(s).\n`);

    client.user.setPresence({
      activities: [{ name: '/ask-flux | FLUX • IO', type: ActivityType.Watching }],
      status: 'online',
    });

    // ✅ تشغيل التقرير اليومي — كان ناقصاً تماماً
    scheduleDailyReport(client);
    console.log('[READY] 📊 Daily report scheduler started.');
  },
};