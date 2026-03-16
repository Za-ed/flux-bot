// ─── commands/unban.js ────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin }                           = require('../utils/permissions');
const { logAction }                         = require('../utils/modLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('رفع الحظر عن عضو عبر الـ ID.')
        .addStringOption(opt =>
            opt.setName('userid')
               .setDescription('الـ ID الخاص بالعضو المحظور.')
               .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason')
               .setDescription('سبب رفع الحظر.')
               .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        if (!isAdmin(interaction.member))
            return interaction.editReply({ content: '❌ هذا الأمر لـ **Admin** و **Founder** فقط.' });

        const userId = interaction.options.getString('userid').trim();
        const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';

        // ── التحقق من صحة الـ ID ──────────────────────────────────────────────
        if (!/^\d{17,20}$/.test(userId))
            return interaction.editReply({ content: '❌ الـ ID غير صحيح. يجب أن يكون رقماً من 17-20 خانة.' });

        // ── التحقق أن العضو محظور فعلاً ──────────────────────────────────────
        let banEntry;
        try {
            banEntry = await interaction.guild.bans.fetch(userId);
        } catch {
            return interaction.editReply({ content: `❌ العضو \`${userId}\` ليس محظوراً في هذا السيرفر.` });
        }

        const bannedUser = banEntry.user;
        const oldReason  = banEntry.reason ?? 'غير محدد';

        // ── رفع الحظر ─────────────────────────────────────────────────────────
        await interaction.guild.members.unban(userId, reason);

        // ── محاولة DM (لن تنجح دائماً — الحساب قد يكون مغلق) ──────────────
        await interaction.client.users.fetch(userId)
            .then(user => user.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅  تم رفع حظرك')
                        .setDescription(`تم رفع حظرك من **${interaction.guild.name}**، يمكنك الانضمام مجدداً.`)
                        .addFields(
                            { name: '📝 السبب',   value: reason,                inline: false },
                            { name: '🛡️ المشرف',  value: interaction.user.tag, inline: false },
                        )
                        .setColor(0x2ecc71)
                        .setTimestamp(),
                ],
            }))
            .catch(() => {}); // الخاص مغلق — ليس خطأً

        // ── mod-log ───────────────────────────────────────────────────────────
        await logAction(interaction.guild, {
            type:      'unban',
            moderator: interaction.user,
            target:    bannedUser,
            reason,
        }).catch(() => {});

        // ── رد في القناة ──────────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('✅  تم رفع الحظر')
            .addFields(
                { name: '👤 العضو',        value: `${bannedUser.tag}\n\`${bannedUser.id}\``, inline: true  },
                { name: '🛡️ بواسطة',       value: `${interaction.user}`,                     inline: true  },
                { name: '📝 سبب الحظر الأصلي', value: oldReason,                              inline: false },
                { name: '📝 سبب الرفع',    value: reason,                                     inline: false },
            )
            .setColor(0x2ecc71)
            .setThumbnail(bannedUser.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`[UNBAN] ${bannedUser.tag} | by ${interaction.user.tag}`);
    },
};