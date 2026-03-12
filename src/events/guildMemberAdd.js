// ─── guildMemberAdd.js ────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { trackJoin }    = require('../utils/dailyReport');

module.exports = {
  name: 'guildMemberAdd',
  once: false,

  async execute(member) {
    const { guild, user } = member;
    console.log(`[WELCOME] عضو جديد: ${user.tag}`);

    // ── تتبع إحصاءات اليوم ────────────────────────────────────────────────
    trackJoin(guild.id);

    // ── حساب عمر السيرفر ──────────────────────────────────────────────────
    const diffDays   = Math.floor((Date.now() - guild.createdAt) / 86400000);
    const diffYears  = Math.floor(diffDays / 365);
    const diffMonths = Math.floor(diffDays / 30);
    const serverAge  = diffYears >= 1 ? `${diffYears} سنة` : diffMonths >= 1 ? `${diffMonths} شهر` : `${diffDays} يوم`;

    // ── 1. رسالة في قناة الترحيب — رسالة واحدة فقط ───────────────────────
    const welcomeChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('welcome') || c.name.includes('ترحيب')
    );

    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setDescription(
          `**مرحباً بك أنت في مجتمع FLUX IO ؛**\n\n` +
          `${member} 🎉\n\n` +
          `لا تنسى قراءة القوانين في ؛\n` +
          `**# 📋〢rules**\n\n` +
          `وشاركنا تفاعلك المستمر في ؛\n` +
          `**# 💬〢chat**`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage(guild.bannerURL({ size: 1024 }) || 'https://i.imgur.com/lchg2Su.jpeg')
        .setColor(0x1e90ff)
        .setFooter({ text: `FLUX • IO  |  منذ ${serverAge} ✦ العضو #${guild.memberCount}` });

      await welcomeChannel.send({
        content: `${member}`,
        embeds:  [embed],
      }).catch((err) => console.error('[WELCOME] فشل إرسال الترحيب:', err.message));
    }

    // ── 2. DM ترحيب ───────────────────────────────────────────────────────
    // بعض الأعضاء DM مغلق — نتجاهل الخطأ بصمت
    const dmEmbed = new EmbedBuilder()
      .setTitle(`👋  أهلاً ${user.username}، نورت FLUX IO!`)
      .setDescription(
        `يسعدنا انضمامك لمجتمع **FLUX IO** 🚀\n\n` +
        `**شو تلاقي عندنا؟**\n` +
        `> 🤖 **ask-flux** — AI يجاوب أسئلتك التقنية\n` +
        `> ⌨️ **code-run** — شغّل كودك أونلاين\n` +
        `> 🎮 **gaming-corner** — ألعاب وتريفيا وXP\n` +
        `> 📊 **/rank** — بطاقة رتبتك المصممة\n` +
        `> 📅 **/daily** — مهام يومية وشارات\n` +
        `> 🎫 **تذاكر** — دعم مباشر من الفريق\n\n` +
        `استمتع بوجودك معنا! ❤️`
      )
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor(0x1e90ff)
      .setFooter({ text: 'FLUX • IO  |  مجتمع المطورين' })
      .setTimestamp();

    await user.send({ embeds: [dmEmbed] }).catch(() => {
      // DM مغلق — طبيعي، نتجاهل
    });

    // ── 3. mod-logs ───────────────────────────────────────────────────────
    const logChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('mod-log') || c.name.includes('📋')
    );

    if (logChannel) {
      const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      const isNewAccount   = accountAgeDays < 7;

      const logEmbed = new EmbedBuilder()
        .setTitle(`📥  عضو جديد${isNewAccount ? '  ⚠️ حساب جديد' : ''}`)
        .addFields(
          { name: '👤  العضو',       value: `${user.tag}\n\`${user.id}\``,                          inline: true },
          { name: '📅  عمر الحساب',  value: `${accountAgeDays} يوم`,                                inline: true },
          { name: '👥  العضو رقم',   value: `#${guild.memberCount}`,                                 inline: true },
          { name: '🕐  الحساب أُنشئ', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,   inline: true },
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(isNewAccount ? 0xffa500 : 0x2ecc71)
        .setFooter({ text: 'FLUX • IO  |  سجل الأعضاء' })
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  },
};