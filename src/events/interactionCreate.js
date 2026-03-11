// ─── interactionCreate.js ─────────────────────────────────────────────────────
// ✅ المصدر الوحيد لمعالجة كل interactions — slash commands + buttons
// لا يوجد أي handler آخر في index.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const { handleSuggestVote } = require('../utils/suggestVote');
const { isAdmin }            = require('../utils/permissions');

// ─── أنواع التذاكر ────────────────────────────────────────────────────────────
const TICKET_TYPES = {
  ticket_support: {
    label:        'دعم-فني',
    displayLabel: 'دعم فني',
    emoji:        '💻',
    color:        0x1e90ff,
    description:  'اشرح مشكلتك بالتفصيل وسيتواصل معك أحد أعضاء الفريق في أقرب وقت.',
  },
  ticket_report: {
    label:        'بلاغ',
    displayLabel: 'بلاغ',
    emoji:        '🚨',
    color:        0xff4444,
    description:  'يرجى ذكر اسم المستخدم والأدلة (صور أو سكرين شوت) ووصف ما حدث بوضوح.',
  },
  ticket_partnership: {
    label:        'شراكة',
    displayLabel: 'شراكة',
    emoji:        '🤝',
    color:        0x2ecc71,
    description:  'أخبرنا عن سيرفرك أو مشروعك ونوع الشراكة التي تقترحها.',
  },
};

const TICKET_CATEGORY_NAME = 'التذاكر';
const STAFF_ROLE_NAME      = 'Staff';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getOrCreateCategory(guild) {
  let cat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  );
  if (!cat) {
    cat = await guild.channels.create({ name: TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
  }
  return cat;
}

function getStaffRole(guild) {
  return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

// ─── Main Export ──────────────────────────────────────────────────────────────
module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {

    // ══════════════════════════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`[COMMANDS] أمر غير معروف: ${interaction.commandName}`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[COMMANDS] خطأ في /${interaction.commandName}:`, err);
        const msg = { content: '❌ حدث خطأ أثناء تنفيذ هذا الأمر.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUTTONS
    // ══════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      const { customId, guild, user, member } = interaction;

      // ── اقتراحات ──────────────────────────────────────────────────────────
      if (await handleSuggestVote(interaction)) return;

      // ── موافقة/رفض الحظر ──────────────────────────────────────────────────
      if (customId.startsWith('approve_ban_') || customId.startsWith('reject_ban_')) {
        await handleBanButton(interaction, customId);
        return;
      }

      // ── موافقة/رفض الكتم ──────────────────────────────────────────────────
      if (customId.startsWith('approve_timeout_') || customId.startsWith('reject_timeout_')) {
        await handleTimeoutButton(interaction, customId);
        return;
      }

      // ── فتح تذكرة ─────────────────────────────────────────────────────────
      if (TICKET_TYPES[customId]) {
        await handleTicketCreate(interaction, customId, guild, user);
        return;
      }

      // ── إغلاق تذكرة ───────────────────────────────────────────────────────
      if (customId.startsWith('close_ticket_')) {
        await handleTicketClose(interaction, customId, guild, user, member);
        return;
      }
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// BAN APPROVAL HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handleBanButton(interaction, id) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ فقط الإدارة تقدر توافق أو ترفض.', ephemeral: true });
  }

  let banCmd;
  try { banCmd = require('../commands/ban'); } catch {
    return interaction.reply({ content: '❌ تعذّر تحميل أمر الحظر.', ephemeral: true });
  }

  const isApprove = id.startsWith('approve_ban_');
  const requestId = id.replace('approve_ban_', '').replace('reject_ban_', '');
  const data      = banCmd.pendingBans.get(requestId);

  if (!data) {
    return interaction.reply({ content: '⚠️ الطلب منتهي أو تم تنفيذه مسبقاً.', ephemeral: true });
  }

  banCmd.pendingBans.delete(requestId); // ✅ تنظيف فوري

  // تعطيل الأزرار
  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('_done')
      .setLabel(isApprove ? '✅ تمت الموافقة' : '❌ تم الرفض')
      .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );
  await interaction.update({ components: [doneRow] }).catch(() => {});

  if (!isApprove) return;

  try {
    const guild  = interaction.guild;
    const member = await guild.members.fetch(data.targetId).catch(() => null);

    if (!member) {
      return interaction.followUp({ content: `⚠️ العضو **${data.targetTag}** لم يعد في السيرفر.`, ephemeral: true });
    }

    const dmEmbed = new EmbedBuilder()
      .setTitle('🔨  تم حظرك')
      .setDescription(`تم حظرك من **${guild.name}**`)
      .addFields(
        { name: 'السبب',  value: data.reason },
        { name: 'المشرف', value: interaction.user.tag }
      )
      .setColor(0x8b0000).setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    await member.ban({ deleteMessageDays: data.days, reason: data.reason });

    const { logAction } = require('../utils/modLog');
    await logAction(guild, {
      type:      'ban',
      moderator: interaction.user,
      target:    member,
      reason:    data.reason,
    }).catch(() => {});

    const confirmEmbed = new EmbedBuilder()
      .setTitle('🔨  تم الحظر — بعد الموافقة')
      .addFields(
        { name: 'العضو',       value: data.targetTag,           inline: true },
        { name: 'طلب بواسطة', value: data.requesterTag,         inline: true },
        { name: 'وافق عليه',  value: interaction.user.tag,      inline: true },
        { name: 'السبب',       value: data.reason },
        { name: 'حذف الرسائل', value: `${data.days} يوم` }
      )
      .setColor(0x8b0000)
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.followUp({ embeds: [confirmEmbed] });
  } catch (err) {
    console.error('[BAN APPROVE]', err);
    await interaction.followUp({ content: `❌ فشل تنفيذ الحظر: ${err.message}`, ephemeral: true });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMEOUT APPROVAL HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handleTimeoutButton(interaction, id) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ فقط الإدارة تقدر توافق أو ترفض.', ephemeral: true });
  }

  let timeoutCmd;
  try { timeoutCmd = require('../commands/timeout'); } catch {
    return interaction.reply({ content: '❌ تعذّر تحميل أمر الكتم.', ephemeral: true });
  }

  const isApprove = id.startsWith('approve_timeout_');
  const requestId = id.replace('approve_timeout_', '').replace('reject_timeout_', '');
  const data      = timeoutCmd.pendingTimeouts.get(requestId);

  if (!data) {
    return interaction.reply({ content: '⚠️ الطلب منتهي أو تم تنفيذه مسبقاً.', ephemeral: true });
  }

  timeoutCmd.pendingTimeouts.delete(requestId); // ✅ تنظيف فوري

  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('_done')
      .setLabel(isApprove ? '✅ تمت الموافقة' : '❌ تم الرفض')
      .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );
  await interaction.update({ components: [doneRow] }).catch(() => {});

  if (!isApprove) return;

  try {
    const guild  = interaction.guild;
    const member = await guild.members.fetch(data.targetId).catch(() => null);

    if (!member) {
      return interaction.followUp({ content: `⚠️ العضو **${data.targetTag}** لم يعد في السيرفر.`, ephemeral: true });
    }

    await member.timeout(data.durationMs, data.reason);

    const confirmEmbed = new EmbedBuilder()
      .setTitle('🔇  تم الكتم — بعد الموافقة')
      .addFields(
        { name: 'العضو',       value: data.targetTag,      inline: true },
        { name: 'طلب بواسطة', value: data.requesterTag,    inline: true },
        { name: 'وافق عليه',  value: interaction.user.tag, inline: true },
        { name: 'المدة',       value: `${data.minutes} دقيقة` },
        { name: 'السبب',       value: data.reason }
      )
      .setColor(0xffa500)
      .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
      .setTimestamp();

    await interaction.followUp({ embeds: [confirmEmbed] });
  } catch (err) {
    console.error('[TIMEOUT APPROVE]', err);
    await interaction.followUp({ content: `❌ فشل تنفيذ الكتم: ${err.message}`, ephemeral: true });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET CREATE HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handleTicketCreate(interaction, customId, guild, user) {
  await interaction.deferReply({ ephemeral: true });

  const ticketInfo = TICKET_TYPES[customId];
  const staffRole  = getStaffRole(guild);

  // منع تذكرة مكررة
  const existing = guild.channels.cache.find(
    (c) => c.name === `${ticketInfo.label}-${user.id}` && c.type === ChannelType.GuildText
  );
  if (existing) {
    return interaction.editReply({
      content: `❗ لديك تذكرة مفتوحة بالفعل: ${existing}. أغلقها أولاً.`,
    });
  }

  const category = await getOrCreateCategory(guild);

  const permissionOverwrites = [
    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
  ];

  if (staffRole) {
    permissionOverwrites.push({
      id: staffRole.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
      ],
    });
  }

  try {
    const ticketChannel = await guild.channels.create({
      name:     `${ticketInfo.label}-${user.id}`,
      type:     ChannelType.GuildText,
      parent:   category.id,
      topic:    `تذكرة بواسطة ${user.tag} | ${ticketInfo.displayLabel}`,
      permissionOverwrites,
    });

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${ticketInfo.emoji}  تذكرة ${ticketInfo.displayLabel}`)
      .setDescription(
        `أهلاً ${user}!\n\n` +
        `${ticketInfo.description}\n\n` +
        `${staffRole ? staffRole : '**فريق الإدارة**'} سيتواصل معك قريباً.\n\n` +
        '*عند حل مشكلتك، اضغط الزر أدناه لإغلاق التذكرة.*'
      )
      .setColor(ticketInfo.color)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التذاكر' })
      .setTimestamp();

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket_${ticketChannel.id}`)
        .setLabel('إغلاق التذكرة')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

    const staffPing = staffRole ? `${staffRole}` : '';
    await ticketChannel.send({
      content: `${user}${staffPing ? ' ' + staffPing : ''}`,
      embeds:  [welcomeEmbed],
      components: [closeRow],
    });

    await interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}` });
    console.log(`[TICKETS] تم الفتح: ${ticketChannel.name} بواسطة ${user.tag}`);

  } catch (err) {
    console.error('[TICKET CREATE]', err);
    await interaction.editReply({ content: `❌ فشل إنشاء التذكرة: ${err.message}` });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET CLOSE HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handleTicketClose(interaction, customId, guild, user, member) {
  await interaction.deferReply();

  const targetChannelId = customId.replace('close_ticket_', '');
  const channelToClose  = guild.channels.cache.get(targetChannelId);

  if (!channelToClose) {
    return interaction.editReply({ content: '❌ لم يتم العثور على قناة التذكرة.' });
  }

  const staffRole      = getStaffRole(guild);
  const isStaff        = staffRole && member.roles.cache.has(staffRole.id);
  const nameParts      = channelToClose.name.split('-');
  const ticketOwnerId  = nameParts[nameParts.length - 1];
  const isOwner        = user.id === ticketOwnerId;

  if (!isStaff && !isOwner) {
    return interaction.editReply({
      content: '❌ فقط فريق الإدارة أو صاحب التذكرة يستطيع الإغلاق.',
    });
  }

  const closingEmbed = new EmbedBuilder()
    .setTitle('🔒  جارٍ إغلاق التذكرة')
    .setDescription(`تم إغلاق هذه التذكرة بواسطة ${user}.\nسيتم **حذف القناة خلال 5 ثواني**.`)
    .setColor(0xff4444)
    .setTimestamp();

  await interaction.editReply({ embeds: [closingEmbed] });
  console.log(`[TICKETS] إغلاق: ${channelToClose.name} — طلب بواسطة ${user.tag}`);

  setTimeout(async () => {
    await channelToClose.delete(`تم الإغلاق بواسطة ${user.tag}`).catch((err) => {
      console.error('[TICKETS] فشل حذف قناة التذكرة:', err.message);
    });
  }, 5000);
}