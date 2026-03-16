// ─── events/voiceXP.js ────────────────────────────────────────────────────────
const { addVoiceXP, addManualXP }             = require('../utils/xpSystem');
const { updateTierRole, announceLevelUp }      = require('./leveling');
const { updateProgress }                       = require('./dailyTasks');

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

            // كل دقيقة → XP صوت
            const timer = setInterval(async () => {
                const current = member.guild.members.cache.get(userId);
                if (!current?.voice?.channelId) {
                    clearInterval(timer);
                    voiceTimers.delete(key);
                    return;
                }

                try {
                    const result = await addVoiceXP(guildId, userId);
                    if (!result) return;

                    if (result.leveled) {
                        await updateTierRole(current, result.user.level);
                        await announceLevelUp(member.guild, current, result.user.level - 1, result.user.level);
                    }
                } catch (err) {
                    console.error('[VOICE-XP] interval error:', err.message);
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

            const joinTime = inVoice.get(key);
            inVoice.delete(key);

            if (!joinTime) return;

            const minutes = Math.floor((Date.now() - joinTime) / 60000);
            console.log(`[VOICE-XP] ${member.user.tag} خرج — ${minutes} دقيقة`);

            if (minutes <= 0) return;

            // ── تحديث المهام اليومية + إضافة الـ XP فعلياً ───────────────────
            try {
                const dailyXP = updateProgress(guildId, userId, 'voice', minutes);

                if (dailyXP > 0) {
                    // ✅ الإصلاح: إضافة XP المهام اليومية لـ MongoDB
                    const result = await addManualXP(guildId, userId, dailyXP);

                    // إعلام في القناة العامة
                    const announceChannel = member.guild.channels.cache.find(
                        c => c.isTextBased() &&
                             (c.name.includes('general') || c.name.includes('عام') || c.name.includes('announce'))
                    );

                    if (announceChannel) {
                        await announceChannel.send(
                            `📅 ${member} أكمل مهمة يومية في الصوت! +**${dailyXP} XP** 🎊`
                        ).catch(() => {});
                    }

                    // ترقية إذا حصلت
                    if (result?.leveled) {
                        await updateTierRole(member, result.user.level);
                        await announceLevelUp(member.guild, member, result.user.level - 1, result.user.level);
                    }

                    console.log(`[VOICE-DAILY] ${member.user.tag} +${dailyXP} XP (${minutes} دقيقة)`);
                }
            } catch (err) {
                console.error('[VOICE-XP] daily task error:', err.message);
            }
        }
    },

    // للاستخدام في rank card
    getVoiceMinutes(guildId, userId) {
        const key      = `${guildId}-${userId}`;
        const joinTime = inVoice.get(key);
        return joinTime ? Math.floor((Date.now() - joinTime) / 60000) : 0;
    },
};