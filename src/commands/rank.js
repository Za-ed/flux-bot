const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateRankCard, getTier }  = require('../utils/rankCard');
// أضفنا getUserRank هنا لجلب الترتيب الحقيقي من الداتابيز
const { getUserData, getUserRank, xpForLevel } = require('../utils/xpSystem'); 
const { getUserBadges } = require('../utils/badges');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('اعرض بطاقة رانكك أو رانك أي عضو.')
    .addUserOption((o) =>
      o.setName('member').setDescription('العضو — اتركه فاضي لرانكك أنت').setRequired(false)
    ),

  async execute(interaction) {
    // 1. طلب وقت إضافي من ديسكورد لتجنب الـ Timeout
    await interaction.deferReply();

    const target = interaction.options.getMember('member') ?? interaction.member;
    const { guild } = interaction;

    try {
        // ── جلب بيانات الـ XP والترتيب ───────────────────────────────────────────
        // نقوم بجلب البيانات والترتيب في وقت واحد لزيادة السرعة
        const [userData, rankPos] = await Promise.all([
            getUserData(guild.id, target.id).then(data => data || {}),
            getUserRank(guild.id, target.id)
        ]);

        const level = userData.level || 0;
        const xp = userData.xp || 0;
        const xpNeeded = xpForLevel(level + 1);

        // ── حل مشكلة الـ undefined في الرتبة (Tier) ───────────────────────────────
        const tierResult = getTier(level);
        // تأمين الكائن: إذا كان النص "Beginner" نحوله لكائن عشان نقرأ منه emoji و name
        const tier = (typeof tierResult === 'string') 
            ? { name: tierResult, emoji: '✦' } 
            : (tierResult || { name: 'مبتدئ', emoji: '✦' });

        // ── الشارات ودقائق الصوت ──────────────────────────────────────────────────
        let badges = [];
        try { 
            if (getUserBadges) badges = getUserBadges(guild.id, target.id) || []; 
        } catch {}

        let voiceMinutes = 0;
        try {
            // محاولة جلب دقائق الصوت من ملف أو من بيانات الـ XP
            const voiceData = require('../data/voiceTime.json');
            voiceMinutes = Math.floor((voiceData?.[guild.id]?.[target.id] || 0) / 60);
        } catch {
            voiceMinutes = userData.voice_xp ? Math.floor(userData.voice_xp / 10) : 0;
        }

        // ── توليد بطاقة الرانك (الصورة) ──────────────────────────────────────────
        const avatarURL = target.user.displayAvatarURL({ extension: 'png', size: 256 });

        const rankBuffer = await generateRankCard({
            username:    target.user.username,
            displayName: target.displayName,
            avatarURL,
            level,
            currentXP:   xp,
            xpForNext:   xpNeeded,
            rank:        rankPos, // سيظهر الآن #1 أو #2 إلخ
            voiceMinutes,
            badges,
        });

        const attachment = new AttachmentBuilder(rankBuffer, { name: 'rank.png' });

        // 2. إرسال الرد النهائي
        await interaction.editReply({
            content: `${tier.emoji} **${target.displayName}** — ${tier.name} • مستوى ${level}`,
            files:   [attachment],
        });

    } catch (error) {
        console.error('[RANK ERROR]:', error);
        
        // في حال فشل توليد الصورة، نرسل رد نصي مرتب عشان ما يضيع حق المستخدم
        const userDataBackup = (await getUserData(guild.id, target.id)) || {};
        await interaction.editReply({
            content: `📊 **إحصائيات ${target.displayName}**\n` +
                     `• المستوى: \`${userDataBackup.level || 0}\`\n` +
                     `• الخبرة: \`${userDataBackup.xp || 0}\`\n` +
                     `• الترتيب: \`#${await getUserRank(guild.id, target.id)}\``
        }).catch(() => {});
    }
  },
};