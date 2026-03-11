const { ActivityType } = require('discord.js');

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

    // ✅ Lazy require داخل execute — يتجنب circular dependency أثناء التحميل
    try {
      const { scheduleDailyReport } = require('../utils/dailyReport');
      if (typeof scheduleDailyReport !== 'function') {
        throw new Error('scheduleDailyReport ليست دالة — تحقق من dailyReport.js');
      }
      scheduleDailyReport(client);
      console.log('[READY] 📊 Daily report scheduler started.');
    } catch (err) {
      console.error('[READY] ⚠️ فشل تشغيل التقرير اليومي:', err.message);
    }
  },
};