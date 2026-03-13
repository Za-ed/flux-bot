const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getUserData, getUserRank, xpForLevel } = require('../utils/xpSystem'); // تأكد من المسار
const { generateRankCard } = require('../utils/rankCard'); // تأكد من المسار

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('عرض بطاقة المستوى الخاصة بك أو بعضو آخر')
        .addUserOption(opt => 
            opt.setName('user')
               .setDescription('العضو المراد عرض رتبته')
               .setRequired(false)
        ),

    async execute(interaction) {
        // تأخير الرد لأن إنشاء الـ GIF يأخذ ثانية أو ثانيتين
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        // 1. جلب البيانات من الداتابيز (MongoDB)
        const userData = await getUserData(interaction.guild.id, targetUser.id) || { level: 0, xp: 0, total_xp: 0, voice_xp: 0 };
        const rank = await getUserRank(interaction.guild.id, targetUser.id) || 0;
        
        // 2. حساب الـ XP المطلوب للمستوى القادم (هذا يحل مشكلة شريط التقدم)
        const currentLevel = userData.level || 0;
        const xpNext = xpForLevel(currentLevel + 1);

        // 3. توليد البطاقة
        const buffer = await generateRankCard({
            username: targetUser.username,
            // حل مشكلة undefined بجلب الاسم المستعار، وإن لم يوجد نأخذ الاسم العادي
            displayName: member?.displayName || targetUser.displayName || targetUser.username,
            avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
            level: currentLevel,
            currentXP: userData.xp || 0,       // نمرر الـ xp الخاص بالمستوى فقط
            xpForNext: xpNext,
            rank: rank,
            voiceMinutes: userData.voice_xp || 0 // حل مشكلة الفويس (نجلب الدقائق الكلية من الداتابيز)
        });

        // 4. إرفاق الصورة (يجب أن يكون الامتداد .gif لكي تتحرك!)
        const attachment = new AttachmentBuilder(buffer, { name: 'rank.gif' });

        // 5. بناء رسالة احترافية ونظيفة (تحل مشكلة النص العشوائي)
        const embed = new EmbedBuilder()
            .setColor(0x1e90ff)
            .setAuthor({ 
                name: `إحصائيات ${member?.displayName || targetUser.username}`, 
                iconURL: targetUser.displayAvatarURL() 
            })
            .setImage('attachment://rank.gif') // عرض الصورة داخل الإمبد لتبدو فخمة
            .setFooter({ text: `الخبرة الكلية: ${userData.total_xp?.toLocaleString() || 0} XP` });

        // إرسال النتيجة
        await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
};