// ─── events/dailyTasks.js ─────────────────────────────────────────────────────
// نظام المهام اليومية — MongoDB بدل JSON
// ══════════════════════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');
const { MongoClient }  = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'fluxbot';
const COL_NAME  = 'daily_tasks';

let tasksCol = null;

async function connect() {
    if (tasksCol) return tasksCol;
    try {
        const dbClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000, tls: true });
        await dbClient.connect();
        tasksCol = dbClient.db(DB_NAME).collection(COL_NAME);
        await tasksCol.createIndex({ guild_id: 1, user_id: 1 }, { unique: true });
        console.log('[DAILY-TASKS] ✅ Connected to MongoDB');
        return tasksCol;
    } catch (err) {
        console.error('[DAILY-TASKS] ❌ MongoDB Error:', err.message);
        return null;
    }
}

// ─── قائمة المهام الممكنة ─────────────────────────────────────────────────────
const TASK_POOL = [
    { id: 'send_10',   type: 'messages',  target: 10, xp: 50,  label: '💬 أرسل 10 رسائل'          },
    { id: 'send_25',   type: 'messages',  target: 25, xp: 100, label: '💬 أرسل 25 رسالة'           },
    { id: 'send_50',   type: 'messages',  target: 50, xp: 200, label: '💬 أرسل 50 رسالة'           },
    { id: 'voice_10',  type: 'voice',     target: 10, xp: 80,  label: '🎙️ ابق في الصوت 10 دقائق'  },
    { id: 'voice_30',  type: 'voice',     target: 30, xp: 150, label: '🎙️ ابق في الصوت 30 دقيقة'  },
    { id: 'react_5',   type: 'reactions', target: 5,  xp: 40,  label: '😄 تفاعل مع 5 رسائل'        },
    { id: 'trivia_1',  type: 'trivia',    target: 1,  xp: 75,  label: '🧠 اجب على سؤال تريفيا'     },
    { id: 'trivia_3',  type: 'trivia',    target: 3,  xp: 150, label: '🧠 اجب على 3 أسئلة تريفيا' },
    { id: 'games_1',   type: 'games',     target: 1,  xp: 60,  label: '🎮 العب لعبة في gaming-corner'  },
    { id: 'games_3',   type: 'games',     target: 3,  xp: 120, label: '🎮 العب 3 ألعاب في gaming-corner' },
];

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

// ─── جلب أو إنشاء مهام اليوم لمستخدم ────────────────────────────────────────
async function getUserTasks(guildId, userId) {
    const col   = await connect();
    const today = todayKey();

    if (col) {
        const doc = await col.findOne({ guild_id: guildId, user_id: userId });

        // لو ما في سجل أو اليوم تغيّر → مهام جديدة
        if (!doc || doc.date !== today) {
            const shuffled = [...TASK_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
            const tasks    = shuffled.map(t => ({ ...t, progress: 0, done: false }));

            await col.updateOne(
                { guild_id: guildId, user_id: userId },
                { $set: { date: today, tasks } },
                { upsert: true }
            );
            return tasks;
        }
        return doc.tasks;
    }

    // Fallback: ذاكرة مؤقتة لو MongoDB مو شغّال
    return [...TASK_POOL].sort(() => Math.random() - 0.5).slice(0, 3)
        .map(t => ({ ...t, progress: 0, done: false }));
}

// ─── تحديث تقدم مهمة ─────────────────────────────────────────────────────────
// يرجع XP المكتسب (0 لو ما اكتملت)
async function updateProgress(guildId, userId, type, amount = 1) {
    const col   = await connect();
    const today = todayKey();
    if (!col) return 0;

    const doc = await col.findOne({ guild_id: guildId, user_id: userId });
    if (!doc || doc.date !== today) return 0;

    let earned  = 0;
    let changed = false;

    for (const task of doc.tasks) {
        if (task.type === type && !task.done) {
            task.progress = Math.min(task.progress + amount, task.target);
            if (task.progress >= task.target) {
                task.done  = true;
                earned    += task.xp;
                changed    = true;
                console.log(`[DAILY] ${userId} أكمل: ${task.label} (+${task.xp} XP)`);
            } else {
                changed = true;
            }
        }
    }

    if (changed) {
        await col.updateOne(
            { guild_id: guildId, user_id: userId },
            { $set: { tasks: doc.tasks } }
        );
    }

    return earned;
}

// ─── بناء الـ Embed ───────────────────────────────────────────────────────────
function buildDailyEmbed(member, tasks) {
    const lines   = tasks.map(t => {
        const bar    = buildBar(t.progress, t.target);
        const status = t.done ? '✅' : '🔄';
        return `${status} **${t.label}**\n${bar} ${t.progress}/${t.target}  (+${t.xp} XP)`;
    });

    const allDone = tasks.every(t => t.done);
    const totalXp = tasks.reduce((s, t) => s + (t.done ? t.xp : 0), 0);
    const maxXp   = tasks.reduce((s, t) => s + t.xp, 0);

    return new EmbedBuilder()
        .setTitle(`📅  مهامك اليومية — ${todayKey()}`)
        .setDescription(lines.join('\n\n'))
        .addFields({ name: '⭐ XP المكتسب اليوم', value: `${totalXp} / ${maxXp} XP` })
        .setColor(allDone ? 0x2ecc71 : 0x1e90ff)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'FLUX • IO  |  تتجدد المهام كل يوم منتصف الليل' })
        .setTimestamp();
}

function buildBar(progress, target, size = 10) {
    const filled = Math.floor((progress / target) * size);
    return '█'.repeat(filled) + '░'.repeat(size - filled);
}

module.exports = { getUserTasks, updateProgress, buildDailyEmbed };