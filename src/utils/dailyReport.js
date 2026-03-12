// ─── dailyReport.js ───────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'dailyStats.json');

// ─── القناة المستهدفة للتقرير ─────────────────────────────────────────────────
// يبحث عن قناة اسمها يحتوي على "stats" أو "إحصاء"
const REPORT_CHANNEL_KEYWORDS = ['stats', 'إحصاء', 'إحصائيات'];

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
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) { console.error('[REPORT] فشل الحفظ:', err.message); }
}

let stats = loadStats();

function todayKey() { return new Date().toISOString().slice(0, 10); }

// ─── تتبع الرسائل (يُستدعى من messageCreate) ─────────────────────────────────
function trackMessage(guildId, userId) {
  if (!guildId || !userId) return;
  const today = todayKey();
  if (!stats[guildId]) stats[guildId] = {};
  if (stats[guildId].date !== today) {
    stats[guildId] = { date: today, msgCount: {}, joinCount: 0 };
  }
  stats[guildId].msgCount[userId] = (stats[guildId].msgCount[userId] || 0) + 1;
  saveStats(stats);
}

// ─── تتبع الأعضاء الجدد (يُستدعى من guildMemberAdd) ──────────────────────────
function trackJoin(guildId) {
  if (!guildId) return;
  const today = todayKey();
  if (!stats[guildId]) stats[guildId] = {};
  if (stats[guildId].date !== today) {
    stats[guildId] = { date: today, msgCount: {}, joinCount: 0 };
  }
  stats[guildId].joinCount = (stats[guildId].joinCount || 0) + 1;
  saveStats(stats);
}

// ─── إيجاد قناة الـ stats ────────────────────────────────────────────────────
function findReportChannel(guild) {
  for (const kw of REPORT_CHANNEL_KEYWORDS) {
    const ch = guild.channels.cache.find(
      (c) =>
        c.isTextBased() &&
        !c.isThread() &&
        c.name.toLowerCase().includes(kw.toLowerCase()) &&
        c.permissionsFor(guild.members.me)?.has('SendMessages')
    );
    if (ch) return ch;
  }
  return null;
}

// ─── بناء وإرسال التقرير ─────────────────────────────────────────────────────
async function sendDailyReport(guild) {
  const guildId = guild.id;
  const today   = todayKey();
  const data    = stats[guildId] || {};

  const msgCounts = data.msgCount  || {};
  const joinCount = data.joinCount || 0;
  const totalMsgs = Object.values(msgCounts).reduce((s, n) => s + n, 0);

  // أكثر 3 أعضاء نشاطاً
  const topUsers = Object.entries(msgCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const medals   = ['🥇', '🥈', '🥉'];
  const topLines = await Promise.all(
    topUsers.map(async ([uid, count], i) => {
      let name = `<@${uid}>`;
      try { name = (await guild.members.fetch(uid)).user.username; } catch {}
      return `${medals[i]} **${name}** — ${count} رسالة`;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle(`📊  تقرير يوم ${today}`)
    .setDescription('ملخص نشاط السيرفر لليوم 🌙')
    .addFields(
      { name: '📨  إجمالي الرسائل', value: `**${totalMsgs.toLocaleString()}**`, inline: true },
      { name: '📥  أعضاء جدد',      value: `**${joinCount}**`,                  inline: true },
      { name: '👥  إجمالي الأعضاء', value: `**${guild.memberCount}**`,           inline: true },
      {
        name:  '🏆  أكثر الأعضاء نشاطاً',
        value: topLines.length > 0 ? topLines.join('\n') : '_(لا يوجد نشاط اليوم)_',
      },
    )
    .setColor(0x1e90ff)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setFooter({ text: 'FLUX • IO  |  تقرير يومي تلقائي — 📊・stats' })
    .setTimestamp();

  // ── إرسال في قناة stats فقط ───────────────────────────────────────────────
  const reportChannel = findReportChannel(guild);
  if (reportChannel) {
    await reportChannel.send({ embeds: [embed] }).catch((err) =>
      console.error('[REPORT] فشل الإرسال:', err.message)
    );
    console.log(`[REPORT] ✅ تقرير ${today} → #${reportChannel.name}`);
  } else {
    console.warn('[REPORT] ⚠️ ما لقيت قناة stats! تأكد من وجود قناة اسمها يحتوي على "stats"');
  }

  // ── صفّر إحصاءات اليوم ───────────────────────────────────────────────────
  stats[guildId] = { date: todayKey(), msgCount: {}, joinCount: 0 };
  saveStats(stats);
}

// ─── جدول التقرير اليومي (منتصف الليل) ──────────────────────────────────────
function scheduleDailyReport(client) {
  function msToMidnight() {
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
  }

  async function runReport() {
    console.log('[REPORT] 🕛 إرسال التقرير اليومي...');
    for (const guild of client.guilds.cache.values()) {
      await sendDailyReport(guild).catch((err) =>
        console.error(`[REPORT] خطأ في ${guild.name}:`, err.message)
      );
    }
    setTimeout(runReport, 24 * 60 * 60 * 1000);
  }

  const delay = msToMidnight();
  console.log(`[REPORT] ⏰ التقرير التالي بعد ${Math.round(delay / 60000)} دقيقة`);
  setTimeout(runReport, delay);
}

module.exports = { scheduleDailyReport, trackMessage, trackJoin };