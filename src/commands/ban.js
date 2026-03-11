const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { isAdmin, isModerator } = require('../utils/permissions');
const { logAction } = require('../utils/modLog');

// ✅ TTL: الطلبات تُحذف تلقائياً بعد 10 دقائق لتجنب memory leak
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingBans    = new Map();

function setPendingBan(requestId, data) {
  pendingBans.set(requestId, data);
  setTimeout(() => {
    if (pendingBans.has(requestId)) {
      pendingBans.delete(requestId);
      console.log(`[BAN] Request ${requestId} expired and removed.`);
    }
  }, PENDING_TTL_MS);
}

module.exports = {
  pendingBans,

  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر عضو من السيرفر.')
    .addUserOption((opt) =>
      opt.setName('member').setDescription('العضو المراد حظره.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('سبب الحظر.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('days')
        .setDescription('حذف رسائل (0-7 أيام).')
        .setMinValue(0).setMaxValue(7).setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    if (!isModerator(interaction.member))
      return interaction.editReply({ content: '❌ هذا الأمر للـ Moderator والأعلى فقط.' });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب.';
    const days   = interaction.options.getInteger('days') ?? 0;

    if (!target)
      return interaction.editReply({ content: '❌ العضو غير موجود في السيرفر.' });
    if (target.id === interaction.user.id)
      return interaction.editReply({ content: '❌ لا تقدر تحظر نفسك.' });
    if (!target.bannable)
      return interaction.editReply({ content: '❌ لا أملك صلاحية حظر هذا العضو (رتبته أعلى من رتبتي).' });
    if (target.roles.highest.position >= interaction.member.roles.highest.position)
      return interaction.editReply({ content: '❌ لا تقدر تحظر عضو رتبته أعلى من أو تساوي رتبتك.' });

    // ── Admin/Founder — تنفيذ مباشر ──────────────────────────────────────────
    if (isAdmin(interaction.member)) {
      // ✅ DM قبل الحظر (بعده لن نقدر نرسل)
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔨  تم حظرك')
        .setDescription(`تم حظرك من **${interaction.guild.name}**`)
        .addFields(
          { name: 'السبب',  value: reason },
          { name: 'المشرف', value: interaction.user.tag }
        )
        .setColor(0x8b0000).setTimestamp();
      await target.send({ embeds: [dmEmbed] }).catch(() => {});

      await target.ban({ deleteMessageDays: days, reason });

      await logAction(interaction.guild, {
        type:      'ban',
        moderator: interaction.user,
        target,
        reason,
      }).catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle('🔨  تم الحظر')
        .addFields(
          { name: 'العضو',        value: `${target.user.tag}`,  inline: true },
          { name: 'المشرف',       value: `${interaction.user}`, inline: true },
          { name: 'السبب',        value: reason },
          { name: 'حذف الرسائل', value: `${days} يوم` }
        )
        .setColor(0x8b0000)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Moderator — يحتاج موافقة إدارة ──────────────────────────────────────
    const requestId = `ban_${Date.now()}_${interaction.user.id}`;
    setPendingBan(requestId, {
      targetId:     target.id,
      targetTag:    target.user.tag,
      reason,
      days,
      requesterId:  interaction.user.id,
      requesterTag: interaction.user.tag,
      guildId:      interaction.guild.id,
    });

    const requestEmbed = new EmbedBuilder()
      .setTitle('🔔  طلب حظر — يحتاج موافقة')
      .setDescription(`الـ Moderator **${interaction.user.tag}** يطلب حظر **${target.user.tag}**`)
      .addFields(
        { name: 'العضو',      value: `${target} (${target.user.tag})`, inline: true },
        { name: 'طلب بواسطة', value: `${interaction.user}`,            inline: true },
        { name: 'السبب',      value: reason },
        { name: 'حذف الرسائل', value: `${days} يوم` },
        { name: '⏰ ينتهي',   value: 'بعد 10 دقائق' }
      )
      .setColor(0xffa500)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام الموافقات' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_ban_${requestId}`)
        .setLabel('✅ موافقة')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_ban_${requestId}`)
        .setLabel('❌ رفض')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      content: '⏳ تم إرسال الطلب للإدارة — ينتهي خلال 10 دقائق.',
      embeds:  [requestEmbed],
      components: [row],
    });

    console.log(`[BAN REQUEST] ${target.user.tag} — by ${interaction.user.tag} — ID: ${requestId}`);
  },
};