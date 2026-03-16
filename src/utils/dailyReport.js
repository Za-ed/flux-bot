// ─── utils/dailyReport.js ─────────────────────────────────────────────────────
// تقرير يومي — MongoDB بدل JSON
// ══════════════════════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');
const { MongoClient }  = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'daily_stats';

let statsCol = null;

async function connect() {
    if (statsCol) return statsCol;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        statsCol = dbClient.db(DB_NAME).collection(COL_NAME);
        await statsCol.createIndex({ guild_id: 1, date: 1 }, { unique: true });
        console.log('[DAILY-REPORT] ✅ Connected to MongoDB');
        return statsCol;
    } catch (err) {
        console.error('[DAILY-REPORT] ❌ MongoDB Error:', err.message);
        return null;
    }
}

const REPORT_CHANNEL_KEYWORDS = ['stats', 'إحصاء', 'إحصائيات'];

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

// ─── تتبع الرسائل ────────────────────────────────────────────────────────────
async function trackMessage(guildId, userId) {
    if (!guildId || !userId) return;
    const col = await connect();
    if (!col) return;

    const today = todayKey();
    await col.updateOne(
        { guild_id: guildId, date: today },
        {
            $inc:         { [`msg_count.${userId}`]: 1 },
            $setOnInsert: { join_count: 0 },
        },
        { upsert: true }
    );
}

// ─── تتبع الأعضاء الجدد ──────────────────────────────────────────────────────
async function trackJoin(guildId) {
    if (!guildId) return;
    const col = await connect();
    if (!col) return;

    const today = todayKey();
    await col.updateOne(
        { guild_id: guildId, date: today },
        {
            $inc:         { join_count: 1 },
            $setOnInsert: { msg_count: {} },
        },
        { upsert: true }
    );
}

// ─── إيجاد قناة التقرير ──────────────────────────────────────────────────────
function findReportChannel(guild) {
    for (const kw of REPORT_CHANNEL_KEYWORDS) {
        const ch = guild.channels.cache.find(
            c => c.isTextBased() &&
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
    const col   = await connect();
    const today = todayKey();

    let msgCounts = {};
    let joinCount = 0;

    if (col) {
        const doc  = await col.findOne({ guild_id: guild.id, date: today });
        msgCounts  = doc?.msg_count  ?? {};
        joinCount  = doc?.join_count ?? 0;
    }

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
        .setFooter({ text: 'FLUX • IO  |  تقرير يومي تلقائي' })
        .setTimestamp();

    const reportChannel = findReportChannel(guild);
    if (reportChannel) {
        await reportChannel.send({ embeds: [embed] }).catch(err =>
            console.error('[REPORT] فشل الإرسال:', err.message)
        );
        console.log(`[REPORT] ✅ تقرير ${today} → #${reportChannel.name}`);
    } else {
        console.warn('[REPORT] ⚠️ ما لقيت قناة stats!');
    }

    // صفّر إحصاءات اليوم في MongoDB
    if (col) {
        await col.updateOne(
            { guild_id: guild.id, date: today },
            { $set: { msg_count: {}, join_count: 0 } }
        ).catch(() => {});
    }
}

// ─── جدولة التقرير اليومي ────────────────────────────────────────────────────
// يُرسل كل يوم الساعة 12:00 AM (منتصف الليل) بتوقيت UTC+3 (الأردن/السعودية)
const REPORT_HOUR_UTC = 21; // 12:00 AM UTC+3 = 21:00 UTC

function scheduleDailyReport(client) {
    function msToNextReport() {
        const now    = new Date();
        const target = new Date(now);

        // ضبط على الساعة 21:00 UTC (= 12:00 AM بتوقيت UTC+3)
        target.setUTCHours(REPORT_HOUR_UTC, 0, 0, 0);

        // لو الوقت فات اليوم → نجدول لليوم القادم
        if (target <= now) {
            target.setUTCDate(target.getUTCDate() + 1);
        }

        return target - now;
    }

    async function runReport() {
        console.log('[REPORT] 🕛 إرسال التقرير اليومي — 12:00 AM (UTC+3)...');
        for (const guild of client.guilds.cache.values()) {
            await sendDailyReport(guild).catch(err =>
                console.error(`[REPORT] خطأ في ${guild.name}:`, err.message)
            );
        }
        // جدول للمرة القادمة (بعد 24 ساعة بدقة)
        setTimeout(runReport, msToNextReport());
    }

    const delay = msToNextReport();
    const mins  = Math.round(delay / 60000);
    const hrs   = Math.floor(mins / 60);
    const rem   = mins % 60;
    console.log(`[REPORT] ⏰ التقرير التالي بعد ${hrs}h ${rem}m (12:00 AM توقيت UTC+3)`);
    setTimeout(runReport, delay);
}

module.exports = { scheduleDailyReport, trackMessage, trackJoin };