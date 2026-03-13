const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addManualXP } = require('../utils/xpSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-xp')
        .setDescription('إضافة XP لعضو محدد (للإدارة فقط)')
        .addUserOption(opt => opt.setName('member').setDescription('العضو المراد تزويده').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('كمية الـ XP').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 1. نبدأ بطلب مهلة فوراً عشان ما يعلق البوت
        await interaction.deferReply();

        const target = interaction.options.getMember('member');
        const amount = interaction.options.getInteger('amount');

        // 2. التحقق من صحة البيانات قبل البدء
        if (!target) {
            return interaction.editReply('❌ لم يتم العثور على العضو في السيرفر.');
        }

        if (amount <= 0) {
            return interaction.editReply('❌ الكمية لازم تكون رقم إيجابي أكبر من صفر.');
        }

        try {
            // 3. استدعاء الدالة (تأكد أنك حدثت ملف xpSystem.js بالدالة الجديدة)
            const result = await addManualXP(interaction.guild.id, target.id, amount);

            if (!result || !result.user) {
                throw new Error('فشل جلب بيانات المستخدم بعد التعديل');
            }

            // 4. بناء الرد الجمالي
            const embed = new EmbedBuilder()
                .setAuthor({ name: target.user.username, iconURL: target.user.displayAvatarURL() })
                .setTitle('✨ تم منح نقاط XP')
                .setDescription(`تمت إضافة **${amount.toLocaleString()}** XP بنجاح إلى ${target}.`)
                .addFields(
                    { name: '📊 المستوى الحالي', value: `\`${result.user.level || 0}\``, inline: true },
                    { name: '📈 المجموع الكلي', value: `\`${(result.user.total_xp || 0).toLocaleString()}\``, inline: true }
                )
                .setColor(0x2ecc71)
                .setThumbnail('https://i.imgur.com/vH79Eun.png') // إيموجي هدية أو XP
                .setFooter({ text: `بواسطة: ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // 5. في حال الترقية نرسل مباركة
            if (result.leveled) {
                await interaction.followUp({
                    content: `🎊 مبارك ${target}! ارتفع مستواك إلى **المستوى ${result.user.level}** بفضل هذه الهدية! 🚀`
                }).catch(() => {}); // نتجنب الأخطاء إذا كانت القناة مغلقة
            }

        } catch (error) {
            console.error('[ADD-XP ERROR]:', error);
            
            // في حال حدوث خطأ، نعدل الرد بدلاً من تركه معلقاً
            await interaction.editReply({
                content: '❌ حدث خطأ داخلي أثناء محاولة الاتصال بقاعدة البيانات. تأكد أن نظام الـ XP يعمل بشكل صحيح.'
            }).catch(() => {});
        }
    }
};