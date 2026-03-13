const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addManualXP } = require('../utils/xpSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-xp')
        .setDescription('إضافة XP لعضو محدد (للإدارة فقط)')
        .addUserOption(opt =>
            opt.setName('member')
               .setDescription('العضو المراد تزويده')
               .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('amount')
               .setDescription('كمية الـ XP (رقم إيجابي فقط)')
               .setMinValue(1)   // ✅ Discord يرفض الصفر والسالب تلقائياً — لا حاجة للتحقق اليدوي
               .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // ephemeral عشان ما يشوفها إلا الأدمن

        const target = interaction.options.getMember('member');
        const amount = interaction.options.getInteger('amount');

        if (!target) {
            return interaction.editReply({ content: '❌ لم يتم العثور على العضو في السيرفر.' });
        }

        try {
            const result = await addManualXP(interaction.guild.id, target.id, amount);

            // result.user مضمون الآن بعد إصلاح xpSystem.js
            const embed = new EmbedBuilder()
                .setAuthor({ name: target.user.username, iconURL: target.user.displayAvatarURL() })
                .setTitle('✨ تم منح نقاط XP')
                .setDescription(`تمت إضافة **${amount.toLocaleString()}** XP بنجاح إلى ${target}.`)
                .addFields(
                    { name: '📊 المستوى الحالي', value: `\`${result.user.level || 0}\``,                   inline: true },
                    { name: '⚡ XP الحالية',      value: `\`${(result.user.xp || 0).toLocaleString()}\``,  inline: true },
                    { name: '📈 المجموع الكلي',   value: `\`${(result.user.total_xp || 0).toLocaleString()}\``, inline: true }
                )
                .setColor(0x2ecc71)
                .setFooter({ text: `بواسطة: ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // ── تهنئة ترقية في القناة العامة ──────────────────────────────────
            if (result.leveled) {
                await interaction.followUp({
                    content:  `🎊 مبارك ${target}! وصلت إلى **المستوى ${result.user.level}** 🚀`,
                    ephemeral: false, // الكل يشوف التهنئة
                }).catch(() => {});
            }

        } catch (error) {
            console.error('[ADD-XP ERROR]:', error);
            await interaction.editReply({
                content: '❌ حدث خطأ أثناء الاتصال بقاعدة البيانات. تأكد أن نظام الـ XP يعمل بشكل صحيح.',
            }).catch(() => {});
        }
    },
};