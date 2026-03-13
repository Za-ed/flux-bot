// ─── events/voiceXP.js ────────────────────────────────────────────────────────
const { addVoiceXP }                      = require('../utils/xpSystem');
const { updateTierRole, announceLevelUp } = require('./leveling');
const { updateProgress }                  = require('./dailyTasks'); // ✅ نقلناها للأعلى بدل داخل الـ callback

const inVoice     = new Map(); // key → joinTimestamp
const voiceTimers = new Map(); // key → intervalId

module.exports = {
  name: 'voiceStateUpdate',
  once: false,

  async execute(oldState, newState) {
    const member  = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId  = member.id;
    const guildId = member.guild.id;
    const key     = `${guildId}-${userId}`;

    // ── دخل الصوت ─────────────────────────────────────────────────────────
    if (!oldState.channelId && newState.channelId) {
      inVoice.set(key, Date.now());

      // كل دقيقة يعطي XP
      const timer = setInterval(async () => {
        const current = member.guild.members.cache.get(userId);
        if (!current?.voice?.channelId) {
          clearInterval(timer);
          voiceTimers.delete(key);
          return;
        }

        const result = await addVoiceXP(guildId, userId);
        if (!result) return;

        if (result.leveled) {
          await updateTierRole(current, result.user.level);
          await announceLevelUp(member.guild, current, result.user.level - 1, result.user.level);
        }
      }, 60 * 1000);

      voiceTimers.set(key, timer);
      console.log(`[VOICE-XP] ${member.user.tag} دخل الصوت`);
    }

    // ── خرج من الصوت ──────────────────────────────────────────────────────
    if (oldState.channelId && !newState.channelId) {
      // أوقف الـ interval
      const timer = voiceTimers.get(key);
      if (timer) { clearInterval(timer); voiceTimers.delete(key); }

      // احسب الوقت الكلي
      const joinTime = inVoice.get(key);
      if (joinTime) {
        const minutes = Math.floor((Date.now() - joinTime) / 60000);
        inVoice.delete(key);
        console.log(`[VOICE-XP] ${member.user.tag} خرج — ${minutes} دقيقة`);
      }

      // تحديث مهام يومية
      try {
        const minutes = joinTime ? Math.floor((Date.now() - joinTime) / 60000) : 0;
        if (minutes > 0) updateProgress(guildId, userId, 'voice', minutes);
      } catch {}
    }
  },

  // للاستخدام في rank card
  getVoiceMinutes(guildId, userId) {
    const key      = `${guildId}-${userId}`;
    const joinTime = inVoice.get(key);
    return joinTime ? Math.floor((Date.now() - joinTime) / 60000) : 0;
  },
};