// ─── commands/timeout.js ──────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isModerator, isAdmin }              = require('../utils/permissions');
const { logAction }                         = require('../utils/modLog');

// ─── خيارات المدة ─────────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
    { name: '60 ثانية',   value: 60          },
    { name: '5 دقائق',    value: 300         },
    { name: '10 دقائق',   value: 600         },
    { name: '30 دقيقة',   value: 1800        },
    { name: 'ساعة',        value: 3600        },
    { name: '6 ساعات',    value: 21600       },
    { name: '12 ساعة',    value: 43200       },
    { name: '24 ساعة',    value: 86400       },
    { name: '3 أيام',     value: 259200      },
    { name: 'أسبوع',       value: 604800      },
];

function formatDuration(seconds) {
    if (seconds < 60)   return `${seconds} ثانية`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعة`;
    return `${Math.floor(seconds / 86400)} يوم`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('كتم عضو لمدة محددة.')
        .addUserOption(opt =>
            opt.setName('member')
               .setDescription('العضو المراد كتمه.')
               .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('duration')
               .setDescription('مدة الكتم.')
               .setRequired(true)
               .addChoices(...DURATION_OPTIONS.map(d => ({ name: d.name, value: String(d.value) })))
        )
        .addStringOption(opt =>
            opt.setName('reason')
               .setDescription('سبب الكتم.')
               .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        // ── فحص الصلاحية ──────────────────────────────────────────────────────
        if (!isModerator(interaction.member)) {
            return interaction.editReply({ content: '❌ هذا الأمر للـ Moderator والأعلى فقط.' });
        }

        const target   = interaction.options.getMember('member');
        const seconds  = parseInt(interaction.options.getString('duration'));
        const reason   = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';
        const durationMs = seconds * 1000;
        const label    = formatDuration(seconds);

        // ── فحوصات أساسية ─────────────────────────────────────────────────────
        if (!target)
            return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
        if (target.id === interaction.user.id)
            return interaction.editReply({ content: '❌ لا تقدر تكتم نفسك.' });
        if (!target.moderatable)
            return interaction.editReply({ content: '❌ لا أملك صلاحية كتم هذا العضو (رتبته أعلى مني).' });
        if (target.roles.highest.position >= interaction.member.roles.highest.position && !isAdmin(interaction.member))
            return interaction.editReply({ content: '❌ لا تقدر تكتم عضو رتبته أعلى منك أو مساوية.' });

        // ── DM للعضو ──────────────────────────────────────────────────────────
        const dmEmbed = new EmbedBuilder()
            .setTitle('🔇  تم كتمك')
            .setDescription(`تم كتمك في **${interaction.guild.name}**`)
            .addFields(
                { name: '⏱️ المدة',  value: label,                  inline: true },
                { name: '📝 السبب',  value: reason,                 inline: true },
                { name: '🛡️ المشرف', value: interaction.user.tag,  inline: true },
            )
            .setColor(0xff8c00)
            .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
            .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => {});

        // ── تنفيذ الكتم ───────────────────────────────────────────────────────
        await target.timeout(durationMs, reason);

        // ── mod-log ───────────────────────────────────────────────────────────
        await logAction(interaction.guild, {
            type:      'timeout',
            moderator: interaction.user,
            target,
            reason,
            duration:  label,
        }).catch(() => {});

        // ── رد في القناة ──────────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🔇  تم الكتم')
            .addFields(
                { name: '👤 العضو',   value: `${target} (${target.user.tag})`, inline: true  },
                { name: '🛡️ المشرف',  value: `${interaction.user}`,             inline: true  },
                { name: '⏱️ المدة',   value: `**${label}**`,                    inline: true  },
                { name: '📝 السبب',   value: reason,                            inline: false },
                { name: '🔓 ينتهي',   value: `<t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`, inline: false },
            )
            .setColor(0xff8c00)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`[TIMEOUT] ${target.user.tag} | ${label} | by ${interaction.user.tag}`);
    },
};