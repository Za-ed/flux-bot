const { EmbedBuilder } = require('discord.js');
const { trackJoin } = require('../utils/dailyReport');
const { addInviteXP } = require('../utils/xpSystem');

// ─── تتبع الدعوات (Global Cache) ─────────────────────────────────────────────
const inviteCache = new Map(); // guildId → Map(code → uses)

module.exports = {
    name: 'guildMemberAdd',
    once: false,

    async execute(member) {
        const { guild, user } = member;
        console.log(`[WELCOME] عضو جديد: ${user.tag}`);

        // 1. تتبع إحصاءات اليوم
        trackJoin(guild.id);

        // 2. منطق تتبع الدعوات (مع إصلاح الـ Cache)
        let inviterData = "غير معروف";
        try {
            const oldInvites = inviteCache.get(guild.id);
            const newInvites = await guild.invites.fetch();
            
            // تحديث الكاش فوراً للسيرفر
            inviteCache.set(guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));

            if (oldInvites) {
                const used = newInvites.find((i) => (oldInvites.get(i.code) ?? 0) < i.uses);
                if (used?.inviter) {
                    inviterData = `${used.inviter.tag}`;
                    await addInviteXP(guild.id, used.inviter.id);
                    console.log(`[INVITE XP] +50 XP for ${used.inviter.tag}`);
                }
            }
        } catch (err) {
            console.error('[INVITE TRACK] خطأ في جلب الدعوات:', err.message);
        }

        // 3. حساب عمر السيرفر (تنسيق أفضل)
        const diffDays = Math.floor((Date.now() - guild.createdAt) / 86400000);
        const serverAge = diffDays >= 365 
            ? `${Math.floor(diffDays / 365)} سنة` 
            : diffDays >= 30 
                ? `${Math.floor(diffDays / 30)} شهر` 
                : `${diffDays} يوم`;

        // 4. إرسال رسالة الترحيب في القناة
        const welcomeChannel = guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('welcome') || c.name.includes('ترحيب')
        );

        if (welcomeChannel) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `أهلاً بك في ${guild.name}`, iconURL: guild.iconURL() })
                .setDescription(
                    `**مرحباً بك في مجتمع FLUX IO ؛**\n\n` +
                    `${member} 🎉\n\n` +
                    `> **القوانين:** <#CHANNEL_ID_HERE>\n` + // يفضل وضع ID القناة مباشرة
                    `> **الدردشة:** <#CHANNEL_ID_HERE>\n\n` +
                    `نتمنى لك وقتاً ممتعاً!`
                )
                .setThumbnail(user.displayAvatarURL({ forceStatic: false, size: 256 }))
                .setImage(guild.bannerURL({ size: 1024 }) || 'https://i.imgur.com/lchg2Su.jpeg')
                .setColor(0x1e90ff)
                .setFooter({ text: `العضو رقم #${guild.memberCount} • تأسسنا منذ ${serverAge}` });

            await welcomeChannel.send({ content: `نورتنا يا ${member}! ✨`, embeds: [embed] }).catch(() => {});
        }

        // 5. رسالة الخاص (DM)
        const dmEmbed = new EmbedBuilder()
            .setTitle(`👋 نورت FLUX IO يا ${user.username}!`)
            .setDescription(
                `يسعدنا انضمامك لمجتمعنا التقني 🚀\n\n` +
                `**أقسام تهمك:**\n` +
                `• <#ID> للأسئلة التقنية\n` +
                `• <#ID> لتجربة الكود\n` +
                `• **/rank** لمتابعة مستواك\n\n` +
                `استمتع برحلتك معنا! ❤️`
            )
            .setColor(0x1e90ff)
            .setTimestamp();

        await user.send({ embeds: [dmEmbed] }).catch(() => console.log(`[DM] خاص العضو ${user.tag} مغلق`));

        // 6. سجل الإدارة (Logs)
        const logChannel = guild.channels.cache.find(
            (c) => c.name.toLowerCase().includes('mod-log') || c.name.includes('📋')
        );

        if (logChannel) {
            const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
            const isNewAccount = accountAgeDays < 7;

            const logEmbed = new EmbedBuilder()
                .setTitle(isNewAccount ? `⚠️ تنبيه: حساب جديد جداً` : `📥 عضو جديد انضم`)
                .addFields(
                    { name: '👤 العضو', value: `${user.tag} (${user.id})`, inline: false },
                    { name: '🔗 بواسطة', value: `${inviterData}`, inline: true },
                    { name: '📅 عمر الحساب', value: `${accountAgeDays} يوم`, inline: true },
                    { name: '👥 ترتيبه', value: `#${guild.memberCount}`, inline: true }
                )
                .setColor(isNewAccount ? 0xff4500 : 0x2ecc71)
                .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    },
};