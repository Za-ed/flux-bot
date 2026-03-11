// ─── dailyTasks.js ────────────────────────────────────────────────────────────
// نظام المهام اليومية — يتجدد كل يوم الساعة 00:00

const fs   = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// ─── Config ───────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, '..', 'data', 'dailyTasks.json');

// ─── قائمة المهام الممكنة ─────────────────────────────────────────────────────
const TASK_POOL = [
  { id: 'send_10',    type: 'messages',  target: 10,  xp: 50,  label: '💬 أرسل 10 رسائل' },
  { id: 'send_25',    type: 'messages',  target: 25,  xp: 100, label: '💬 أرسل 25 رسالة' },
  { id: 'send_50',    type: 'messages',  target: 50,  xp: 200, label: '💬 أرسل 50 رسالة' },
  { id: 'voice_10',   type: 'voice',     target: 10,  xp: 80,  label: '🎙️ ابق في الصوت 10 دقائق' },
  { id: 'voice_30',   type: 'voice',     target: 30,  xp: 150, label: '🎙️ ابق في الصوت 30 دقيقة' },
  { id: 'react_5',    type: 'reactions', target: 5,   xp: 40,  label: '😄 تفاعل مع 5 رسائل' },
  { id: 'trivia_1',   type: 'trivia',    target: 1,   xp: 75,  label: '🧠 اجب على سؤال تريفيا' },
  { id: 'trivia_3',   type: 'trivia',    target: 3,   xp: 150, label: '🧠 اجب على 3 أسئلة تريفيا' },
  { id: 'games_1',    type: 'games',     target: 1,   xp: 60,  label: '🎮 العب لعبة في gaming-corner' },
  { id: 'games_3',    type: 'games',     target: 3,   xp: 120, label: '🎮 العب 3 ألعاب في gaming-corner' },
];

// ─── Storage Helpers ──────────────────────────────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) { console.error('[DAILY] فشل الحفظ:', err.message); }
}

let db = load();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-11"
}

function getUserTasks(guildId, userId) {
  const today = todayKey();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = {};
  if (db[guildId][userId].date !== today) {
    // يوم جديد — اختار 3 مهام عشوائية
    const shuffled = [...TASK_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    db[guildId][userId] = {
      date:  today,
      tasks: shuffled.map((t) => ({ ...t, progress: 0, done: false })),
    };
    save(db);
  }
  return db[guildId][userId].tasks;
}

// ─── تحديث تقدم المهمة ────────────────────────────────────────────────────────
// يرجع XP المكتسب (0 لو ما اكتملت أو اكتملت قبل)
function updateProgress(guildId, userId, type, amount = 1) {
  const today = todayKey();
  if (!db[guildId]?.[userId] || db[guildId][userId].date !== today) return 0;

  let earned = 0;
  for (const task of db[guildId][userId].tasks) {
    if (task.type === type && !task.done) {
      task.progress = Math.min(task.progress + amount, task.target);
      if (task.progress >= task.target) {
        task.done = true;
        earned += task.xp;
        console.log(`[DAILY] ${userId} أكمل مهمة: ${task.label} (+${task.xp} XP)`);
      }
    }
  }
  if (earned > 0) save(db);
  return earned;
}

// ─── /daily command embed ─────────────────────────────────────────────────────
function buildDailyEmbed(member, tasks) {
  const lines = tasks.map((t) => {
    const bar     = buildBar(t.progress, t.target);
    const status  = t.done ? '✅' : '🔄';
    return `${status} **${t.label}**\n${bar} ${t.progress}/${t.target}  (+${t.xp} XP)`;
  });

  const allDone  = tasks.every((t) => t.done);
  const totalXp  = tasks.reduce((s, t) => s + (t.done ? t.xp : 0), 0);
  const maxXp    = tasks.reduce((s, t) => s + t.xp, 0);

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