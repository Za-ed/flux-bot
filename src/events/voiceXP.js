// ─── voiceXP.js ───────────────────────────────────────────────────────────────
// يعطي XP لكل دقيقة في الصوت ويتتبع وقت اليوزر

const fs   = require('fs');
const path = require('path');

const DATA_FILE    = path.join(__dirname, '..', 'data', 'voiceTime.json');
const XP_PER_MIN   = 10;   // XP لكل دقيقة
const UPDATE_MS    = 60000; // كل دقيقة

// ─── Storage ──────────────────────────────────────────────────────────────────
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
  } catch (err) { console.error('[VOICE-XP] فشل الحفظ:', err.message); }
}

let voiceData = load(); // { guildId: { userId: { totalMinutes, joinedAt } } }

// من في الصوت حالياً
const inVoice = new Map(); // `${guildId}-${userId}` -> joinTimestamp

// ─── تتبع الدخول والخروج ──────────────────────────────────────────────────────
module.exports = {
  name: 'voiceStateUpdate',
  once: false,

  async execute(oldState, newState) {
    const userId  = newState.id;
    const guildId = newState.guild.id;
    const key     = `${guildId}-${userId}`;

    const member = newState.member || oldState.member;
    if (member?.user?.bot) return;

    // دخل الصوت
    if (!oldState.channelId && newState.channelId) {
      inVoice.set(key, Date.now());
      console.log(`[VOICE-XP] ${member?.user?.tag} دخل الصوت`);
    }

    // خرج من الصوت
    if (oldState.channelId && !newState.channelId) {
      const joinTime = inVoice.get(key);
      if (!joinTime) return;

      inVoice.delete(key);

      const minutesSpent = Math.floor((Date.now() - joinTime) / 60000);
      if (minutesSpent < 1) return;

      // احفظ الوقت الكلي
      if (!voiceData[guildId]) voiceData[guildId] = {};
      if (!voiceData[guildId][userId]) voiceData[guildId][userId] = { totalMinutes: 0 };
      voiceData[guildId][userId].totalMinutes += minutesSpent;
      save(voiceData);

      // أعطِ XP
      const xpGained = minutesSpent * XP_PER_MIN;
      try {
        const leveling = require('./leveling');
        const xpStore  = leveling.loadXP();
        if (!xpStore[guildId]) xpStore[guildId] = {};
        if (!xpStore[guildId][userId]) xpStore[guildId][userId] = { xp: 0 };
        xpStore[guildId][userId].xp += xpGained;
        const fsLib  = require('fs');
        const pathLib = require('path');
        fsLib.writeFileSync(
          pathLib.join(__dirname, '..', 'data', 'xp.json'),
          JSON.stringify(xpStore, null, 2)
        );
        console.log(`[VOICE-XP] ${member?.user?.tag} كسب ${xpGained} XP (${minutesSpent} دقيقة)`);
      } catch (err) {
        console.error('[VOICE-XP] خطأ XP:', err.message);
      }

      // تحديث مهام يومية
      try {
        const { updateProgress } = require('./dailyTasks');
        updateProgress(guildId, userId, 'voice', minutesSpent);
      } catch {}
    }
  },

  // دالة مساعدة لجلب إجمالي دقائق الصوت
  getTotalMinutes(guildId, userId) {
    return voiceData[guildId]?.[userId]?.totalMinutes ?? 0;
  },
};