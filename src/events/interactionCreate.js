// ─── interactionCreate.js ─────────────────────────────────────────────────────
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const { handleSuggestVote } = require('../utils/suggestVote');

// ─── Config ───────────────────────────────────────────────────────────────────
const TICKET_CATEGORY_NAME = 'التذاكر';
const STAFF_ROLE_NAME      = 'Staff';
const LOG_CHANNEL_NAME     = 'mod-logs';

// ─── Ticket Types ─────────────────────────────────────────────────────────────
const TICKET_TYPES = {
  ticket_support: {
    label:       'دعم فني',
    emoji:       '🛠️',
    color:       0x1e90ff,
    description: 'اشرح مشكلتك بالتفصيل وسيساعدك أحد أعضاء الفريق.',
  },
  ticket_report: {
    label:       'بلاغ',
    emoji:       '🚨',
    color:       0xff4444,
    description: 'أرسل اسم العضو، الأدلة، وشرح للمشكلة.',
  },
  ticket_partnership: {
    label:       'شراكة',
    emoji:       '🤝',
    color:       0x2ecc71,
    description: 'أخبرنا عن مشروعك ونوع الشراكة المقترحة.',
  },
};

// ─── تخزين مؤقت لبيانات التذاكر ──────────────────────────────────────────────
// channelId -> { ownerId, ownerTag, type, openedAt }
const ticketData = new Map();

// ─── Helper: قناة الـ logs ────────────────────────────────────────────────────
function getLogChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.name.toLowerCase().includes('mod-log') || c.name.toLowerCase().includes('📋')
  );
}

// ─── Helper: Category ────────────────────────────────────────────────────────
async function getOrCreateCategory(guild) {
  let cat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  );
  if (!cat) {
    cat = await guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    });
  }
  return cat;
}

// ─── Helper: Staff Role ───────────────────────────────────────────────────────
function getStaffRole(guild) {
  return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

// ─── بناء رسالة التقييم ───────────────────────────────────────────────────────
function buildRatingComponents(channelId) {
  // سؤال الحل
  const solvedRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rating_solved_yes_${channelId}`)
      .setLabel('نعم، تم الحل ✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rating_solved_no_${channelId}`)
      .setLabel('لا، لم يُحل ❌')
      .setStyle(ButtonStyle.Danger),
  );

  // تقييم النجوم
  const starsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rating_stars_1_${channelId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rating_stars_2_${channelId}`).setLabel('⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rating_stars_3_${channelId}`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rating_stars_4_${channelId}`).setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rating_stars_5_${channelId}`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Primary),
  );

  return [solvedRow, starsRow];
}

// ─── إرسال تقرير التذكرة لـ mod-logs ─────────────────────────────────────────
async function sendTicketLog(guild, data) {
  const logChannel = getLogChannel(guild);
  if (!logChannel) return;

  const {
    ownerTag, ownerId, type, openedAt,
    closedBy, closedByTag,
    solved, stars,
  } = data;

  const duration = openedAt
    ? Math.floor((Date.now() - openedAt) / 60000) + ' دقيقة'
    : '—';

  const starsText = stars ? '⭐'.repeat(stars) + ` (${stars}/5)` : '_(لم يُقيَّم)_';
  const solvedText = solved === true ? '✅ نعم' : solved === false ? '❌ لا' : '_(لم يُجاب)_';

  const embed = new EmbedBuilder()
    .setTitle(`🎫  تذكرة مغلقة — ${TICKET_TYPES[type]?.label ?? type}`)
    .addFields(
      { name: '👤  صاحب التذكرة', value: `${ownerTag}\n\`${ownerId}\``,         inline: true },
      { name: '🔒  أغلقها',        value: `${closedByTag}\n\`${closedBy}\``,     inline: true },
      { name: '⏱️  المدة',          value: duration,                              inline: true },
      { name: '✅  تم الحل؟',       value: solvedText,                            inline: true },
      { name: '⭐  التقييم',        value: starsText,                             inline: true },
    )
    .setColor(solved ? 0x2ecc71 : 0xff4444)
    .setFooter({ text: 'FLUX • IO  |  سجل التذاكر' })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {

    // ── Slash Commands ─────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      // ── فحص الصلاحيات ────────────────────────────────────────────────
      const { canUseCommand } = require('../utils/permManager');
      if (!canUseCommand(interaction.member, interaction.commandName)) {
        return interaction.reply({
          content: '❌ ما عندك صلاحية استخدام هذا الأمر.',
          ephemeral: true,
        });
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[COMMANDS] Error in /${interaction.commandName}:`, error);
        const msg = { content: '❌ حدث خطأ أثناء تنفيذ الأمر.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ── Dropdown — فتح تذكرة ──────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      await interaction.deferReply({ ephemeral: true });

      const value      = interaction.values[0];
      const ticketInfo = TICKET_TYPES[value];
      if (!ticketInfo) return;

      const { guild, user, member } = interaction;
      const staffRole = getStaffRole(guild);

      // منع تكرار التذكرة
      const existing = guild.channels.cache.find(
        (c) =>
          c.name === `${ticketInfo.label}-${user.id}` &&
          c.type === ChannelType.GuildText
      );
      if (existing) {
        await interaction.editReply({
          content: `❗ عندك تذكرة مفتوحة بالفعل: ${existing}. أغلقها أولاً.`,
        });
        return;
      }

      const category = await getOrCreateCategory(guild);

      const permOverwrites = [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id:    user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
          ],
        },
      ];
      if (staffRole) {
        permOverwrites.push({
          id:    staffRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.AttachFiles,
          ],
        });
      }

      const ticketChannel = await guild.channels.create({
        name:               `${ticketInfo.label}-${user.id}`,
        type:               ChannelType.GuildText,
        parent:             category.id,
        permissionOverwrites: permOverwrites,
        topic:              `تذكرة بواسطة ${user.tag} | النوع: ${ticketInfo.label}`,
      });

      // حفظ بيانات التذكرة
      ticketData.set(ticketChannel.id, {
        ownerId:   user.id,
        ownerTag:  user.tag,
        type:      value,
        openedAt:  Date.now(),
        solved:    null,
        stars:     null,
      });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`${ticketInfo.emoji}  تذكرة ${ticketInfo.label}`)
        .setDescription(
          `أهلاً ${user}! 👋\n\n` +
          `${ticketInfo.description}\n\n` +
          `${staffRole ?? '**الفريق**'} سيرد عليك قريباً.\n\n` +
          '*عند انتهاء المشكلة اضغط على زر الإغلاق.*'
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

      await ticketChannel.send({
        content:    `${user} ${staffRole ?? ''}`,
        embeds:     [welcomeEmbed],
        components: [closeRow],
      });

      await interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}` });
      console.log(`[TICKETS] فُتحت: ${ticketChannel.name} بواسطة ${user.tag}`);
      return;
    }

    // ── Buttons ────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, user, member } = interaction;

      // تصويت الاقتراحات
      if (await handleSuggestVote(interaction)) return;

      // ── إغلاق التذكرة ────────────────────────────────────────────────────
      if (customId.startsWith('close_ticket_')) {
        await interaction.deferReply();

        const channelId     = customId.replace('close_ticket_', '');
        const channelToClose = guild.channels.cache.get(channelId);
        if (!channelToClose) {
          await interaction.editReply({ content: '❌ القناة غير موجودة.' });
          return;
        }

        const staffRole   = getStaffRole(guild);
        const isStaff     = staffRole && member.roles.cache.has(staffRole.id);
        const data        = ticketData.get(channelId);
        const isOwner     = user.id === data?.ownerId;

        if (!isStaff && !isOwner) {
          await interaction.editReply({ content: '❌ فقط الفريق أو صاحب التذكرة يقدر يغلقها.' });
          return;
        }

        // حفظ من أغلق
        if (data) {
          data.closedBy    = user.id;
          data.closedByTag = user.tag;
        }

        // ── إرسال التقييم لصاحب التذكرة ────────────────────────────────
        const ownerId = data?.ownerId;
        if (ownerId) {
          const ratingEmbed = new EmbedBuilder()
            .setTitle('⭐  كيف كانت تجربتك؟')
            .setDescription(
              'شكراً لتواصلك مع فريق FLUX IO!\n\n' +
              '**هل تم حل مشكلتك؟** اضغط أحد الزرين:\n' +
              'ثم اختر تقييمك من النجوم 👇'
            )
            .setColor(0xf1c40f)
            .setFooter({ text: 'FLUX • IO  |  تقييم الدعم' })
            .setTimestamp();

          const ratingComponents = buildRatingComponents(channelId);

          await channelToClose.send({
            content:    `<@${ownerId}>`,
            embeds:     [ratingEmbed],
            components: ratingComponents,
          }).catch(() => {});
        }

        const closingEmbed = new EmbedBuilder()
          .setTitle('🔒  جاري الإغلاق')
          .setDescription(`أُغلقت التذكرة بواسطة ${user}.\nسيتم حذف القناة خلال **10 ثوانٍ**.`)
          .setColor(0xff4444)
          .setTimestamp();

        await interaction.editReply({ embeds: [closingEmbed] });

        setTimeout(async () => {
          // إرسال تقرير لـ mod-logs
          if (data) await sendTicketLog(guild, data);
          ticketData.delete(channelId);
          await channelToClose.delete(`تم الإغلاق بواسطة ${user.tag}`).catch(() => {});
        }, 10000);

        return;
      }

      // ── تقييم: هل تم الحل؟ ───────────────────────────────────────────────
      if (customId.startsWith('rating_solved_')) {
        await interaction.deferUpdate();
        const parts    = customId.split('_'); // ['rating','solved','yes/no','channelId']
        const answer   = parts[2];
        const chanId   = parts.slice(3).join('_');
        const data     = ticketData.get(chanId);
        if (data) data.solved = answer === 'yes';

        await interaction.followUp({
          content: answer === 'yes'
            ? '✅ يسعدنا إن مشكلتك اتحلت! الحين اختر تقييمك 👇'
            : '❌ نأسف إن مشكلتك ما اتحلت. الحين اختر تقييمك 👇',
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      // ── تقييم: النجوم ─────────────────────────────────────────────────────
      if (customId.startsWith('rating_stars_')) {
        await interaction.deferUpdate();
        const parts  = customId.split('_'); // ['rating','stars','1-5','channelId']
        const stars  = parseInt(parts[2]);
        const chanId = parts.slice(3).join('_');
        const data   = ticketData.get(chanId);
        if (data) data.stars = stars;

        const starsText = '⭐'.repeat(stars);
        await interaction.followUp({
          content: `${starsText} شكراً على تقييمك! يساعدنا نتحسن 🙏`,
          ephemeral: true,
        }).catch(() => {});

        // إرسال التقرير لـ mod-logs فوراً بعد التقييم
        if (data && data.closedBy) {
          await sendTicketLog(guild, data);
          ticketData.delete(chanId);
        }
        return;
      }
    }
  },
};