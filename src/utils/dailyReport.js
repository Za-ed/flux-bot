// ─── dailyReport.js ───────────────────────────────────────────────────────────
// تقرير يومي تلقائي الساعة 12:00 منتصف الليل (بتوقيت السيرفر)
// يُشغَّل من ready.js عند بدء البوت

const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'dailyStats.json');

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadStats() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return {}; }
}

function saveStats(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) { console.error('[REPORT] فشل الحفظ:', err.message); }
}

let stats = loadStats();
// stats = { guildId: { msgCount: {userId: n}, joinCount: n, date: 'YYYY-MM-DD' } }

function todayKey() { return new Date().toISOString().slice(0, 10); }

// ─── تتبع الرسائل (يُستدعى من messageCreate) ─────────────────────────────────
function trackMessage(guildId, userId) {
  const today = todayKey();
  if (!stats[guildId]) stats[guildId] = {};
  if (stats[guildId].date !== today) {
    // يوم جديد — صفّر
    stats[guildId] = { date: today, msgCount: {}, joinCount: 0 };
  }
  if (!stats[guildId].msgCount) stats[guildId].msgCount = {};
  stats[guildId].msgCount[userId] = (stats[guildId].msgCount[userId] || 0) + 1;
  saveStats(stats);
}

// ─── تتبع الأعضاء الجدد (يُستدعى من guildMemberAdd) ──────────────────────────
function trackJoin(guildId) {
  const today = todayKey();
  if (!stats[guildId]) stats[guildId] = {};
  if (stats[guildId].date !== today) {
    stats[guildId] = { date: today, msgCount: {}, joinCount: 0 };
  }
  stats[guildId].joinCount = (stats[guildId].joinCount || 0) + 1;
  saveStats(stats);
}

// ─── بناء تقرير اليوم ────────────────────────────────────────────────────────
async function sendDailyReport(guild, reportChannel) {
  const guildId = guild.id;
  const today   = todayKey();
  const data    = stats[guildId];

  const msgCounts  = data?.msgCount || {};
  const joinCount  = data?.joinCount || 0;
  const totalMsgs  = Object.values(msgCounts).reduce((s, n) => s + n, 0);

  // أكثر 3 أعضاء نشاطاً
  const topUsers = Object.entries(msgCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const medals = ['🥇', '🥈', '🥉'];

  const topLines = await Promise.all(
    topUsers.map(async ([uid, count], i) => {
      let name = `<@${uid}>`;
      try {
        const m = await guild.members.fetch(uid);
        name = m.user.username;
      } catch {}
      return `${medals[i]} **${name}** — ${count} رسالة`;
    })
  );

  // إحصاءات الصوت
  let voiceText = '—';
  try {
    const voiceXP = require('../events/voiceXP');
    // أكثر شخص وقت في الصوت اليوم (تقريبي)
    voiceText = 'راجع /rank لوقت الصوت';
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(`📊  تقرير يوم ${today}`)
    .setDescription('ملخص نشاط السيرفر لليوم المنتهي 🌙')
    .addFields(
      {
        name:  '📨  إجمالي الرسائل',
        value: `**${totalMsgs.toLocaleString()}** رسالة`,
        inline: true,
      },
      {
        name:  '📥  أعضاء جدد',
        value: `**${joinCount}** عضو`,
        inline: true,
      },
      {
        name:  '👥  إجمالي الأعضاء',
        value: `**${guild.memberCount}** عضو`,
        inline: true,
      },
      {
        name:  '🏆  أكثر الأعضاء نشاطاً',
        value: topLines.length > 0 ? topLines.join('\n') : '_(لا يوجد نشاط اليوم)_',
      },
    )
    .setColor(0x1e90ff)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setFooter({ text: `FLUX • IO  |  يُرسل يومياً الساعة 12 منتصف الليل` })
    .setTimestamp();

  await reportChannel.send({ embeds: [embed] }).catch((err) => {
    console.error('[REPORT] فشل الإرسال:', err.message);
  });

  console.log(`[REPORT] تقرير ${today} أُرسل في ${guild.name}`);

  // صفّر الإحصاءات ليوم جديد
  stats[guildId] = { date: todayKey(), msgCount: {}, joinCount: 0 };
  saveStats(stats);
}

// ─── جدول التقرير اليومي ─────────────────────────────────────────────────────
function scheduleDailyReport(client) {
  function getNextMidnight() {
    const now       = new Date();
    const midnight  = new Date(now);
    midnight.setHours(24, 0, 0, 0); // منتصف الليل القادم
    return midnight - now;
  }

  function runReport() {
    console.log('[REPORT] 🕛 تشغيل التقرير اليومي...');
    client.guilds.cache.forEach(async (guild) => {
      // قناة الإعلانات أو الأخبار أو logs
      const reportChannel =
        guild.channels.cache.find((c) =>
          c.name.toLowerCase().includes('إعلان') ||
          c.name.toLowerCase().includes('announce') ||
          c.name.toLowerCase().includes('general')
        );
      if (reportChannel) await sendDailyReport(guild, reportChannel);
    });

    // جدّد كل 24 ساعة
    setTimeout(runReport, 24 * 60 * 60 * 1000);
  }

  // انتظر لمنتصف الليل القادم ثم ابدأ
  const delay = getNextMidnight();
  console.log(`[REPORT] ⏰ التقرير التالي بعد ${Math.round(delay / 60000)} دقيقة`);
  setTimeout(runReport, delay);
}

module.exports = { scheduleDailyReport, trackMessage, trackJoin };