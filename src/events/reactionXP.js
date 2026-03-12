const { addReactionXP } = require('../utils/xpSystem');
const { updateTierRole, announceLevelUp } = require('./leveling');

// كاش بسيط لمنع تكرار الـ XP لنفس الشخص على نفس الرسالة في نفس الجلسة
const reactionCooldown = new Set();

module.exports = {
    name: 'messageReactionAdd',
    once: false,

    async execute(reaction, user) {
        // 1. تجاهل البوتات
        if (user.bot) return;

        // 2. معالجة الـ Partials (ضروري جداً للرسائل القديمة)
        if (reaction.partial) {
            try { await reaction.fetch(); } catch (err) { return; }
        }
        
        const { message } = reaction;
        if (message.partial) {
            try { await message.fetch(); } catch (err) { return; }
        }

        const target = message.author;
        const guild = message.guild;

        // 3. التحقق من الشروط
        if (!guild || !target || target.bot) return;
        if (target.id === user.id) return; // منع الـ Self-farming

        // 4. منع الـ Spam (الـ XP يُعطى مرة واحدة لكل "تفاعل فريد")
        const cooldownKey = `${message.id}-${user.id}-${target.id}`;
        if (reactionCooldown.has(cooldownKey)) return;

        // 5. إضافة الـ XP (مع الـ await الصحيح)
        try {
            const result = await addReactionXP(guild.id, target.id);
            if (!result) return;

            // إضافة المفتاح للكاش لمنع التكرار (يمسح بعد ساعة مثلاً لتوفير الذاكرة)
            reactionCooldown.add(cooldownKey);
            setTimeout(() => reactionCooldown.delete(cooldownKey), 3600000);

            // 6. التعامل مع الترقية (Level Up)
            if (result.leveled) {
                // محاولة جلب العضو من السيرفر بشكل أضمن
                let member = guild.members.cache.get(target.id);
                if (!member) {
                    member = await guild.members.fetch(target.id).catch(() => null);
                }

                if (member) {
                    // تحديث الرتبة وإرسال التهنئة
                    await updateTierRole(member, result.user.level);
                    await announceLevelUp(guild, member, result.user.level - 1, result.user.level);
                }
            }
        } catch (error) {
            console.error('[REACTION XP] Error:', error);
        }
    },
};