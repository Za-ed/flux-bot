const { EmbedBuilder } = require('discord.js');
const { trackJoin }    = require('../utils/dailyReport');
const { addInviteXP }  = require('../utils/xpSystem');

// ─── تتبع الدعوات (Global Cache) ─────────────────────────────────────────────
const inviteCache = new Map(); // guildId → Map(code → uses)

// ✅ دالة كاش الدعوات — كانت ناقصة وتسبب crash في ready.js
async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map((i) => [i.code, i.uses])));
    console.log(`[INVITE] Cached ${invites.size} invite(s) for ${guild.name}`);
  } catch (err) {
    console.error(`[INVITE] فشل كاش الدعوات لـ ${guild.name}:`, err.message);
  }
}

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  cacheInvites, // ✅ هذه كانت ناقصة — ready.js يستوردها

  async execute(member) {
    const { guild, user } = member;
    console.log(`[WELCOME] عضو جديد: ${user.tag}`);

    // 1. إحصاءات اليوم
    try { trackJoin(guild.id); } catch {}

    // 2. تتبع الدعوات
    let inviterData = 'غير معروف';
    try {
      const oldInvites = inviteCache.get(guild.id);
      const newInvites = await guild.invites.fetch();
      inviteCache.set(guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));

      if (oldInvites) {
        const used = newInvites.find((i) => (oldInvites.get(i.code) ?? 0) < i.uses);
        if (used?.inviter) {
          inviterData = used.inviter.tag;
          await addInviteXP(guild.id, used.inviter.id);
          console.log(`[INVITE XP] +50 XP for ${used.inviter.tag}`);
        }
      }
    } catch (err) {
      console.error('[INVITE TRACK] خطأ:', err.message);
    }

    // 3. عمر السيرفر
    const diffDays  = Math.floor((Date.now() - guild.createdAt) / 86400000);
    const serverAge = diffDays >= 365
      ? `${Math.floor(diffDays / 365)} سنة`
      : diffDays >= 30
        ? `${Math.floor(diffDays / 30)} شهر`
        : `${diffDays} يوم`;

    // 4. رسالة الترحيب
    const welcomeChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('welcome') || c.name.includes('ترحيب')
    );

    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setAuthor({ name: `أهلاً بك في ${guild.name}`, iconURL: guild.iconURL() })
        .setDescription(
          `**مرحباً بك في مجتمع FLUX IO ؛**\n\n` +
          `${member} 🎉\n\n` +
          `نتمنى لك وقتاً ممتعاً!`
        )
        .setThumbnail(user.displayAvatarURL({ forceStatic: false, size: 256 }))
        .setImage(guild.bannerURL({ size: 1024 }) || 'https://i.imgur.com/lchg2Su.jpeg')
        .setColor(0x1e90ff)
        .setFooter({ text: `العضو رقم #${guild.memberCount} • تأسسنا منذ ${serverAge}` });

      await welcomeChannel.send({ content: `نورتنا يا ${member}! ✨`, embeds: [embed] }).catch(() => {});
    }

    // 5. رسالة الخاص
    const dmEmbed = new EmbedBuilder()
      .setTitle(`👋 نورت FLUX IO يا ${user.username}!`)
      .setDescription(
        `يسعدنا انضمامك لمجتمعنا التقني 🚀\n\n` +
        `**• /rank** لمتابعة مستواك\n\n` +
        `استمتع برحلتك معنا! ❤️`
      )
      .setColor(0x1e90ff)
      .setTimestamp();

    await user.send({ embeds: [dmEmbed] }).catch(() => console.log(`[DM] خاص ${user.tag} مغلق`));

    // 6. سجل الإدارة
    const logChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('mod-log') || c.name.includes('📋')
    );

    if (logChannel) {
      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      const isNewAccount   = accountAgeDays < 7;

      const logEmbed = new EmbedBuilder()
        .setTitle(isNewAccount ? '⚠️ تنبيه: حساب جديد جداً' : '📥 عضو جديد انضم')
        .addFields(
          { name: '👤 العضو',       value: `${user.tag} (${user.id})`, inline: false },
          { name: '🔗 بواسطة',      value: inviterData,                 inline: true  },
          { name: '📅 عمر الحساب',  value: `${accountAgeDays} يوم`,    inline: true  },
          { name: '👥 ترتيبه',      value: `#${guild.memberCount}`,    inline: true  }
        )
        .setColor(isNewAccount ? 0xff4500 : 0x2ecc71)
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  },
};