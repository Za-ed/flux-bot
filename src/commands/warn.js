// ─── commands/warn.js ─────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin }                           = require('../utils/permissions');
const { logAction }                         = require('../utils/modLog');
const { addWarning }                        = require('../utils/warningsDB'); // ✅ MongoDB

// ── عتبات العقوبات التلقائية ──────────────────────────────────────────────────
const AUTO_ACTIONS = [
    { at: 3, type: 'timeout', durationMs: 10 * 60 * 1000,  label: '10 دقائق' },
    { at: 5, type: 'timeout', durationMs: 60 * 60 * 1000,  label: 'ساعة'     },
    { at: 7, type: 'kick',    durationMs: null,             label: null        },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('تحذير عضو في السيرفر.')
        .addUserOption(o =>
            o.setName('member').setDescription('العضو المراد تحذيره').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('سبب التحذير').setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        if (!isAdmin(interaction.member))
            return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });

        const target = interaction.options.getMember('member');
        const reason = interaction.options.getString('reason');

        if (!target)                           return interaction.editReply({ content: '❌ العضو غير موجود.' });
        if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ ما تقدر تحذر نفسك.' });
        if (target.user.bot)                   return interaction.editReply({ content: '❌ ما تقدر تحذر بوت.' });

        // ── تسجيل التحذير في MongoDB ──────────────────────────────────────────
        const total = await addWarning(interaction.guild.id, target.id, {
            reason,
            moderator:   interaction.user.tag,
            moderatorId: interaction.user.id,
        });

        // ── DM للعضو ──────────────────────────────────────────────────────────
        await target.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⚠️  لقيت تحذير')
                    .setDescription(`لقيت تحذير في **${interaction.guild.name}**`)
                    .addFields(
                        { name: '📝 السبب',          value: reason,               inline: false },
                        { name: '🛡️ المشرف',          value: interaction.user.tag, inline: true  },
                        { name: '🔢 مجموع تحذيراتك',  value: `${total} تحذير`,     inline: true  },
                    )
                    .setColor(0xffa500)
                    .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
                    .setTimestamp(),
            ],
        }).catch(() => {});

        // ── Mod Log ───────────────────────────────────────────────────────────
        await logAction(interaction.guild, {
            type:      'warn',
            moderator: interaction.user,
            target,
            reason:    `${reason} (تحذير #${total})`,
        }).catch(() => {});

        // ── الرد في القناة ────────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('⚠️  تحذير صدر')
            .addFields(
                { name: '👤 العضو',           value: `${target}`,           inline: true  },
                { name: '🛡️ المشرف',           value: `${interaction.user}`, inline: true  },
                { name: '📝 السبب',            value: reason,                inline: false },
                { name: '🔢 مجموع التحذيرات',  value: `**${total}** تحذير`,  inline: true  },
            )
            .setColor(total >= 5 ? 0xff0000 : total >= 3 ? 0xff4444 : 0xffa500)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'FLUX • IO  |  نظام التحذيرات' })
            .setTimestamp();

        if (total >= 3)
            embed.setDescription(`🚨 **تنبيه:** ${target} وصل لـ **${total} تحذيرات!**`);

        await interaction.editReply({ embeds: [embed] });

        // ── العقوبات التلقائية ────────────────────────────────────────────────
        const action = AUTO_ACTIONS.find(a => a.at === total);
        if (!action) return;

        try {
            if (action.type === 'timeout' && target.moderatable) {
                await target.timeout(action.durationMs, `تراكم التحذيرات (${total})`);

                await logAction(interaction.guild, {
                    type:      'timeout',
                    moderator: interaction.client.user,
                    target,
                    reason:    `⚙️ تلقائي — وصل لـ ${total} تحذيرات`,
                    duration:  action.label,
                }).catch(() => {});

                await interaction.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⚙️  عقوبة تلقائية')
                            .setDescription(
                                `${target} وصل لـ **${total} تحذيرات**.\n` +
                                `🔇 تم كتمه تلقائياً لمدة **${action.label}**.`
                            )
                            .setColor(0xff4444)
                            .setFooter({ text: 'FLUX • IO  |  نظام العقوبات التلقائية' })
                            .setTimestamp(),
                    ],
                }).catch(() => {});

            } else if (action.type === 'kick' && target.kickable) {
                await target.kick(`⚙️ طرد تلقائي — وصل لـ ${total} تحذيرات`);

                await logAction(interaction.guild, {
                    type:      'kick',
                    moderator: interaction.client.user,
                    target,
                    reason:    `⚙️ تلقائي — وصل لـ ${total} تحذيرات`,
                }).catch(() => {});

                await interaction.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⚙️  طرد تلقائي')
                            .setDescription(
                                `${target.user.tag} وصل لـ **${total} تحذيرات**.\n` +
                                `👢 تم طرده تلقائياً من السيرفر.`
                            )
                            .setColor(0x8b0000)
                            .setFooter({ text: 'FLUX • IO  |  نظام العقوبات التلقائية' })
                            .setTimestamp(),
                    ],
                }).catch(() => {});
            }
        } catch (err) {
            console.error('[WARN AUTO-ACTION]', err.message);
        }
    },
};