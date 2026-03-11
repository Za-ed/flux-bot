// ─── guildMemberAdd.js ────────────────────────────────────────────────────────
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { trackJoin } = require('../utils/dailyReport');

module.exports = {
  name: 'guildMemberAdd',
  once: false,

  async execute(member) {
    const { guild, user } = member;
    console.log(`[WELCOME] عضو جديد: ${user.tag}`);

    trackJoin(guild.id);

    // ── حساب عمر السيرفر ──────────────────────────────────────────────────
    const createdAt   = guild.createdAt;
    const now         = new Date();
    const diffMs      = now - createdAt;
    const diffDays    = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths  = Math.floor(diffDays / 30);
    const diffYears   = Math.floor(diffDays / 365);

    let serverAge = '';
    if (diffYears >= 1)       serverAge = `${diffYears} سنة`;
    else if (diffMonths >= 1) serverAge = `${diffMonths} شهر`;
    else                      serverAge = `${diffDays} يوم`;

    // ── إحصاءات السيرفر ───────────────────────────────────────────────────
    const totalMembers = guild.memberCount;
    const onlineCount  = guild.members.cache.filter(
      (m) => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle'
    ).size;
    const botCount     = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount   = totalMembers - botCount;
    const channelCount = guild.channels.cache.filter((c) => c.type === 0).size;
    const roleCount    = guild.roles.cache.size - 1; // إزالة @everyone

    // ── 1. رسالة ترحيب في قناة الترحيب ───────────────────────────────────
    const welcomeChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('welcome') ||
             c.name.includes('ترحيب') ||
             c.name.includes('الترحيب')
    );

    if (welcomeChannel) {
      // Embed رئيسي — ترحيب
      const mainEmbed = new EmbedBuilder()
        .setTitle(`✨  مرحباً بك يا ${user.username}!`)
        .setDescription(
          `> يسعدنا انضمامك لعائلة **FLUX IO** 🎉\n` +
          `> أنت العضو رقم 🏅 **${totalMembers}** في السيرفر\n\n` +
          `اقرأ القواعد، عرّف نفسك، وكن جزءاً من المجتمع! 💙`
        )
        .setColor(0x1e90ff)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://i.imgur.com/lchg2Su.jpeg') // غيّر الصورة لبانر السيرفر
        .setFooter({ text: `FLUX • IO  |  منذ ${serverAge} ونحن نبني مجتمعاً تقنياً 🚀` })
        .setTimestamp();

      // Embed إحصاءات السيرفر
      const statsEmbed = new EmbedBuilder()
        .setTitle('📊  إحصاءات FLUX IO')
        .setDescription('هذا اللي وصلت إليه! 👇')
        .addFields(
          { name: '👥  الأعضاء',    value: `\`${humanCount.toLocaleString()}\``,  inline: true },
          { name: '🤖  البوتات',    value: `\`${botCount}\``,                     inline: true },
          { name: '🟢  متصلون',     value: `\`${onlineCount}\``,                  inline: true },
          { name: '💬  القنوات',    value: `\`${channelCount}\``,                 inline: true },
          { name: '🎭  الرتب',      value: `\`${roleCount}\``,                    inline: true },
          { name: '🎂  عمر السيرفر',value: `\`${serverAge}\``,                   inline: true },
        )
        .setColor(0x5865f2)
        .setFooter({ text: 'FLUX • IO  |  إحصاءات حية' });

      await welcomeChannel.send({
        content: `${member} 👋`,
        embeds:  [mainEmbed, statsEmbed],
      }).catch(() => {});
    }

    // ── 2. DM مميز ────────────────────────────────────────────────────────
    const dmEmbed1 = new EmbedBuilder()
      .setTitle(`🚀  أهلاً ${user.username}، نورت FLUX IO!`)
      .setDescription(
        `واو! ما توقعنا إنك تنضم اليوم 😄\n` +
        `بس والله يسعدنا وجودك معنا! ❤️\n\n` +
        `**FLUX IO** مش بس سيرفر — هو مجتمع مطورين حقيقي\n` +
        `بنى نفسه خلال **${serverAge}** من الشغل والتعاون 💪`
      )
      .setColor(0x1e90ff)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setTimestamp();

    const dmEmbed2 = new EmbedBuilder()
      .setTitle('🎯  شو يقدم FLUX IO؟')
      .setDescription('كل اللي تحتاجه في مجتمع تقني واحد:')
      .addFields(
        {
          name:   '🤖  ذكاء اصطناعي',
          value:  '> بوت يجاوب أسئلتك التقنية فوراً\n> ويشرح الكود ويساعدك في مشاريعك',
          inline: false,
        },
        {
          name:   '🎮  ألعاب وتسلية',
          value:  '> تريفيا، رياضيات، خمّن الكلمة\n> قنبلة أرقام وألعاب تفاعلية',
          inline: false,
        },
        {
          name:   '📊  نظام مستويات',
          value:  '> كسب XP بالرسائل والصوت\n> بطاقة رتبة مصممة خاصة بك `/rank`',
          inline: false,
        },
        {
          name:   '🎫  دعم احترافي',
          value:  '> نظام تذاكر مع تقييم الخدمة\n> فريق متاح لمساعدتك',
          inline: false,
        },
        {
          name:   '📅  مهام يومية',
          value:  '> أكمل مهام كل يوم واكسب XP إضافي\n> واجمع شارات مميزة',
          inline: false,
        },
      )
      .setColor(0x2ecc71)
      .setFooter({ text: 'FLUX • IO  |  يسعدنا وجودك في المجتمع 🙌' })
      .setTimestamp();

    await user.send({ embeds: [dmEmbed1, dmEmbed2] }).catch(() => {
      console.log(`[WELCOME] DM مغلق لـ ${user.tag}`);
    });

    // ── 3. سجل في mod-logs ───────────────────────────────────────────────
    const logChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('mod-log') || c.name.includes('📋')
    );

    if (logChannel) {
      const accountAge  = Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24));
      const isNew       = accountAge < 7;

      const logEmbed = new EmbedBuilder()
        .setTitle(`📥  عضو جديد${isNew ? '  ⚠️ حساب جديد' : ''}`)
        .addFields(
          { name: '👤  العضو',      value: `${user.tag}\n\`${user.id}\``,                          inline: true },
          { name: '📅  عمر الحساب', value: `${accountAge} يوم`,                                    inline: true },
          { name: '👥  العضو رقم',  value: `#${totalMembers}`,                                     inline: true },
          { name: '🕐  انضم',       value: `<t:${Math.floor(now / 1000)}:R>`,                       inline: true },
          { name: '🎂  الحساب',     value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,    inline: true },
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(isNew ? 0xffa500 : 0x2ecc71)
        .setFooter({ text: 'FLUX • IO  |  سجل الأعضاء' })
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  },
};