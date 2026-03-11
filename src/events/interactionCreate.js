const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

// ─── اسم فئة التذاكر ──────────────────────────────────────────────────────────
const TICKET_CATEGORY_NAME = 'التذاكر';
const STAFF_ROLE_NAME = 'Staff';

// ─── أنواع التذاكر ────────────────────────────────────────────────────────────
const TICKET_TYPES = {
  ticket_support: {
    label: 'دعم-فني',
    displayLabel: 'دعم فني',
    emoji: '💻',
    color: 0x1e90ff,
    description: 'اشرح مشكلتك بالتفصيل وسيتواصل معك أحد أعضاء الفريق في أقرب وقت.',
  },
  ticket_report: {
    label: 'بلاغ',
    displayLabel: 'بلاغ',
    emoji: '🚨',
    color: 0xff4444,
    description: 'يرجى ذكر اسم المستخدم والأدلة (صور أو سكرين شوت) ووصف ما حدث بوضوح.',
  },
  ticket_partnership: {
    label: 'شراكة',
    displayLabel: 'شراكة',
    emoji: '🤝',
    color: 0x2ecc71,
    description: 'أخبرنا عن سيرفرك أو مشروعك ونوع الشراكة التي تقترحها.',
  },
};

// ─── مساعد: جلب أو إنشاء فئة التذاكر ────────────────────────────────────────
async function getOrCreateCategory(guild) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  );

  if (!category) {
    category = await guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    });
  }

  return category;
}

// ─── مساعد: جلب رول الستاف ───────────────────────────────────────────────────
function getStaffRole(guild) {
  return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

// ─── التصدير الرئيسي ──────────────────────────────────────────────────────────
module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {
    // ── توجيه الأوامر المكتوبة ─────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.warn(`[COMMANDS] أمر غير معروف: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[COMMANDS] خطأ في /${interaction.commandName}:`, error);
        const errorMsg = { content: '❌ حدث خطأ أثناء تنفيذ هذا الأمر.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg).catch(() => {});
        } else {
          await interaction.reply(errorMsg).catch(() => {});
        }
      }

      return;
    }

    // ── توجيه تفاعلات الأزرار ─────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, user, member } = interaction;

      // ── أزرار فتح التذاكر ────────────────────────────────────────────────
      if (TICKET_TYPES[customId]) {
        await interaction.deferReply({ ephemeral: true });

        const ticketInfo = TICKET_TYPES[customId];
        const staffRole = getStaffRole(guild);

        // منع فتح تذكرة مكررة لنفس اليوزر
        const existingChannel = guild.channels.cache.find(
          (c) =>
            c.name === `${ticketInfo.label}-${user.id}` &&
            c.type === ChannelType.GuildText
        );

        if (existingChannel) {
          await interaction.editReply({
            content: `❗ لديك تذكرة مفتوحة بالفعل: ${existingChannel}. أغلقها أولاً قبل فتح تذكرة جديدة.`,
          });
          return;
        }

        const category = await getOrCreateCategory(guild);

        // ── صلاحيات القناة ───────────────────────────────────────────────
        const permissionOverwrites = [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
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

        // ── إنشاء قناة التذكرة ───────────────────────────────────────────
        const ticketChannel = await guild.channels.create({
          name: `${ticketInfo.label}-${user.id}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites,
          topic: `تذكرة مفتوحة بواسطة ${user.tag} | النوع: ${ticketInfo.displayLabel}`,
        });

        // ── رسالة الترحيب داخل التذكرة ──────────────────────────────────
        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`${ticketInfo.emoji}  تذكرة ${ticketInfo.displayLabel}`)
          .setDescription(
            `أهلاً ${user}!\n\n` +
            `${ticketInfo.description}\n\n` +
            `${staffRole ? staffRole : '**فريق الإدارة**'} سيتواصل معك قريباً.\n\n` +
            '*عند حل مشكلتك، اضغط على الزر أدناه لإغلاق التذكرة.*'
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

        const staffPing = staffRole ? `${staffRole}` : '*(لم يُعثر على رول الإدارة)*';
        await ticketChannel.send({
          content: `${user} ${staffPing}`,
          embeds: [welcomeEmbed],
          components: [closeRow],
        });

        await interaction.editReply({
          content: `✅ تم فتح تذكرتك بنجاح: ${ticketChannel}`,
        });

        console.log(`[TICKETS] تم الفتح: ${ticketChannel.name} بواسطة ${user.tag}`);
        return;
      }

      // ── زر إغلاق التذكرة ────────────────────────────────────────────────
      if (customId.startsWith('close_ticket_')) {
        await interaction.deferReply();

        const targetChannelId = customId.replace('close_ticket_', '');
        const channelToClose = guild.channels.cache.get(targetChannelId);

        if (!channelToClose) {
          await interaction.editReply({ content: '❌ لم يتم العثور على قناة التذكرة.' });
          return;
        }

        // فقط الستاف أو صاحب التذكرة يقدر يغلق
        const staffRole = getStaffRole(guild);
        const isStaff = staffRole && member.roles.cache.has(staffRole.id);
        const channelNameParts = channelToClose.name.split('-');
        const ticketOwnerId = channelNameParts[channelNameParts.length - 1];
        const isOwner = user.id === ticketOwnerId;

        if (!isStaff && !isOwner) {
          await interaction.editReply({
            content: '❌ فقط فريق الإدارة أو صاحب التذكرة يستطيع الإغلاق.',
          });
          return;
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

        return;
      }
    }
  },
};