const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { isAdmin, isModerator } = require('../utils/permissions');

const pendingTimeouts = new Map();

module.exports = {
  pendingTimeouts,

  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('كتم عضو مؤقتاً.')
    .addUserOption((opt) => opt.setName('member').setDescription('العضو المراد كتمه.').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('minutes').setDescription('مدة الكتم بالدقائق (1-1440).').setMinValue(1).setMaxValue(1440).setRequired(true)
    )
    .addStringOption((opt) => opt.setName('reason').setDescription('سبب الكتم.').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isModerator(interaction.member)) {
      return interaction.editReply({ content: '❌ هذا الأمر للـ Moderator والأعلى فقط.' });
    }

    const target = interaction.options.getMember('member');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';
    const durationMs = minutes * 60 * 1000;

    if (!target) return interaction.editReply({ content: '❌ العضو غير موجود.' });

    // ── Admin أو Founder — ينفذ مباشرة ──────────────────────────────────────
    if (isAdmin(interaction.member)) {
      await target.timeout(durationMs, reason);

      const embed = new EmbedBuilder()
        .setTitle('🔇  تم الكتم')
        .addFields(
          { name: 'العضو', value: `${target}`, inline: true },
          { name: 'المشرف', value: `${interaction.user}`, inline: true },
          { name: 'المدة', value: `${minutes} دقيقة` },
          { name: 'السبب', value: reason }
        )
        .setColor(0xffa500)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Moderator — يرسل طلب موافقة ─────────────────────────────────────────
    const requestId = `timeout_${Date.now()}_${interaction.user.id}`;
    pendingTimeouts.set(requestId, {
      targetId: target.id,
      targetTag: target.user.tag,
      durationMs,
      minutes,
      reason,
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      guildId: interaction.guild.id,
    });

    const requestEmbed = new EmbedBuilder()
      .setTitle('🔔  طلب كتم — يحتاج موافقة')
      .setDescription(`الـ Moderator **${interaction.user.tag}** يطلب كتم العضو **${target.user.tag}**`)
      .addFields(
        { name: 'العضو', value: `${target} (${target.user.tag})`, inline: true },
        { name: 'طلب بواسطة', value: `${interaction.user}`, inline: true },
        { name: 'المدة', value: `${minutes} دقيقة` },
        { name: 'السبب', value: reason }
      )
      .setColor(0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام الموافقات — للإدارة فقط' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_timeout_${requestId}`)
        .setLabel('✅ موافقة وتنفيذ')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_timeout_${requestId}`)
        .setLabel('❌ رفض')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      content: `⏳ تم إرسال طلب الكتم للإدارة — بانتظار الموافقة.`,
      embeds: [requestEmbed],
      components: [row],
    });

    console.log(`[TIMEOUT REQUEST] ${target.user.tag} — requested by ${interaction.user.tag}`);
  },
};