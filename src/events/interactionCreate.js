const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField, ChannelType,
} = require('discord.js');
const { isAdmin, isModerator, ROLES } = require('../utils/permissions');

const TICKET_CATEGORY_NAME = 'Tickets';
const STAFF_ROLE_NAME = 'Staff';

const TICKET_TYPES = {
  ticket_support: { label: 'Support', emoji: '💻', color: 0x1e90ff, description: 'Describe your issue and a staff member will assist you shortly.' },
  ticket_report: { label: 'Report', emoji: '🚨', color: 0xff4444, description: 'Provide the username, evidence, and description of the incident.' },
  ticket_partnership: { label: 'Partnership', emoji: '🤝', color: 0x2ecc71, description: 'Tell us about your project and what kind of partnership you are proposing.' },
};

async function getOrCreateCategory(guild) {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  ) ?? await guild.channels.create({ name: TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
}

function getStaffRole(guild) {
  return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {

    // ── Slash Commands ─────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[COMMANDS] Error in /${interaction.commandName}:`, error);
        const msg = { content: '❌ حدث خطأ أثناء تنفيذ الأمر.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
        else await interaction.reply(msg).catch(() => {});
      }
      return;
    }

    // ── Buttons ────────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, user, member } = interaction;

      // ════════════════════════════════════════════════════════════════════════
      // TICKET BUTTONS
      // ════════════════════════════════════════════════════════════════════════
      if (TICKET_TYPES[customId]) {
        await interaction.deferReply({ ephemeral: true });
        const ticketInfo = TICKET_TYPES[customId];
        const staffRole = getStaffRole(guild);

        const existingChannel = guild.channels.cache.find(
          (c) => c.name === `${ticketInfo.label.toLowerCase()}-${user.id}` && c.type === ChannelType.GuildText
        );
        if (existingChannel) {
          return interaction.editReply({ content: `❗ لديك تذكرة مفتوحة بالفعل: ${existingChannel}` });
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

        const ticketChannel = await guild.channels.create({
          name: `${ticketInfo.label.toLowerCase()}-${user.id}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites,
          topic: `Ticket by ${user.tag} | ${ticketInfo.label}`,
        });

        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`${ticketInfo.emoji}  ${ticketInfo.label} Ticket`)
          .setDescription(
            `مرحباً ${user}!\n\n${ticketInfo.description}\n\n` +
            `${staffRole ? staffRole : '**Staff**'} سيتواصل معك قريباً.\n\n` +
            '*عند الانتهاء اضغط الزر أدناه لإغلاق التذكرة.*'
          )
          .setColor(ticketInfo.color)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .setFooter({ text: 'FLUX • IO  |  Ticket System' })
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`close_ticket_${ticketChannel.id}`)
            .setLabel('Close Ticket').setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content: `${user} ${staffRole ?? ''}`,
          embeds: [welcomeEmbed],
          components: [closeRow],
        });

        await interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}` });
        console.log(`[TICKETS] Opened: ${ticketChannel.name} for ${user.tag}`);
        return;
      }

      // ── Close Ticket ─────────────────────────────────────────────────────────
      if (customId.startsWith('close_ticket_')) {
        await interaction.deferReply();
        const targetChannelId = customId.replace('close_ticket_', '');
        const channelToClose = guild.channels.cache.get(targetChannelId);
        if (!channelToClose) return interaction.editReply({ content: '❌ القناة غير موجودة.' });

        const staffRole = getStaffRole(guild);
        const isStaff = staffRole && member.roles.cache.has(staffRole.id);
        const ticketOwnerId = channelToClose.name.split('-').pop();

        if (!isStaff && user.id !== ticketOwnerId && !isAdmin(member)) {
          return interaction.editReply({ content: '❌ فقط الإدارة أو صاحب التذكرة يقدر يغلقها.' });
        }

        const closingEmbed = new EmbedBuilder()
          .setTitle('🔒  جاري إغلاق التذكرة')
          .setDescription(`أُغلقت بواسطة ${user}.\nستُحذف القناة خلال **5 ثواني**.`)
          .setColor(0xff4444).setTimestamp();

        await interaction.editReply({ embeds: [closingEmbed] });
        setTimeout(() => channelToClose.delete(`Closed by ${user.tag}`).catch(() => {}), 5000);
        return;
      }

      // ════════════════════════════════════════════════════════════════════════
      // APPROVAL BUTTONS — BAN
      // ════════════════════════════════════════════════════════════════════════
      if (customId.startsWith('approve_ban_') || customId.startsWith('reject_ban_')) {

        if (!isAdmin(member)) {
          return interaction.reply({ content: '❌ فقط **CORE Admin🛡** و **CORE Founder👑** يقدرون يوافقون على هذا الطلب.', ephemeral: true });
        }

        const requestId = customId.replace('approve_ban_', '').replace('reject_ban_', '');
        const banModule = require('../commands/ban');
        const pending = banModule.pendingBans.get(requestId);

        if (!pending) {
          return interaction.reply({ content: '❌ هذا الطلب منتهي الصلاحية أو نُفّذ مسبقاً.', ephemeral: true });
        }

        banModule.pendingBans.delete(requestId);

        // رفض
        if (customId.startsWith('reject_ban_')) {
          const rejectEmbed = new EmbedBuilder()
            .setTitle('❌  تم رفض طلب الحظر')
            .setDescription(`رفض **${user.tag}** طلب حظر **${pending.targetTag}**`)
            .addFields({ name: 'طلب بواسطة', value: pending.requesterTag })
            .setColor(0xff4444).setTimestamp();

          await interaction.update({ embeds: [rejectEmbed], components: [] });
          console.log(`[BAN] Request rejected by ${user.tag}`);
          return;
        }

        // موافقة
        try {
          const targetMember = await guild.members.fetch(pending.targetId).catch(() => null);

          if (targetMember) {
            const dmEmbed = new EmbedBuilder()
              .setTitle('🔨  تم حظرك')
              .setDescription(`تم حظرك من **${guild.name}**`)
              .addFields({ name: 'السبب', value: pending.reason }, { name: 'المشرف', value: user.tag })
              .setColor(0x8b0000).setTimestamp();
            await targetMember.send({ embeds: [dmEmbed] }).catch(() => {});
          }

          await guild.members.ban(pending.targetId, { deleteMessageDays: pending.days, reason: pending.reason });

          const approveEmbed = new EmbedBuilder()
            .setTitle('✅  تم تنفيذ الحظر')
            .addFields(
              { name: 'العضو', value: pending.targetTag, inline: true },
              { name: 'وافق عليه', value: user.tag, inline: true },
              { name: 'طلب بواسطة', value: pending.requesterTag, inline: true },
              { name: 'السبب', value: pending.reason }
            )
            .setColor(0x8b0000).setTimestamp();

          await interaction.update({ embeds: [approveEmbed], components: [] });
          console.log(`[BAN] ${pending.targetTag} banned — approved by ${user.tag}`);
        } catch (err) {
          console.error('[BAN APPROVE]', err.message);
          await interaction.reply({ content: `❌ فشل تنفيذ الحظر: ${err.message}`, ephemeral: true });
        }
        return;
      }

      // ════════════════════════════════════════════════════════════════════════
      // APPROVAL BUTTONS — TIMEOUT
      // ════════════════════════════════════════════════════════════════════════
      if (customId.startsWith('approve_timeout_') || customId.startsWith('reject_timeout_')) {

        if (!isAdmin(member)) {
          return interaction.reply({ content: '❌ فقط **CORE Admin🛡** و **CORE Founder👑** يقدرون يوافقون على هذا الطلب.', ephemeral: true });
        }

        const requestId = customId.replace('approve_timeout_', '').replace('reject_timeout_', '');
        const timeoutModule = require('../commands/timeout');
        const pending = timeoutModule.pendingTimeouts.get(requestId);

        if (!pending) {
          return interaction.reply({ content: '❌ هذا الطلب منتهي الصلاحية أو نُفّذ مسبقاً.', ephemeral: true });
        }

        timeoutModule.pendingTimeouts.delete(requestId);

        // رفض
        if (customId.startsWith('reject_timeout_')) {
          const rejectEmbed = new EmbedBuilder()
            .setTitle('❌  تم رفض طلب الكتم')
            .setDescription(`رفض **${user.tag}** طلب كتم **${pending.targetTag}**`)
            .addFields({ name: 'طلب بواسطة', value: pending.requesterTag })
            .setColor(0xff4444).setTimestamp();

          await interaction.update({ embeds: [rejectEmbed], components: [] });
          console.log(`[TIMEOUT] Request rejected by ${user.tag}`);
          return;
        }

        // موافقة
        try {
          const targetMember = await guild.members.fetch(pending.targetId).catch(() => null);
          if (!targetMember) return interaction.reply({ content: '❌ العضو غير موجود في السيرفر.', ephemeral: true });

          await targetMember.timeout(pending.durationMs, pending.reason);

          const approveEmbed = new EmbedBuilder()
            .setTitle('✅  تم تنفيذ الكتم')
            .addFields(
              { name: 'العضو', value: pending.targetTag, inline: true },
              { name: 'وافق عليه', value: user.tag, inline: true },
              { name: 'طلب بواسطة', value: pending.requesterTag, inline: true },
              { name: 'المدة', value: `${pending.minutes} دقيقة` },
              { name: 'السبب', value: pending.reason }
            )
            .setColor(0xffa500).setTimestamp();

          await interaction.update({ embeds: [approveEmbed], components: [] });
          console.log(`[TIMEOUT] ${pending.targetTag} timed out — approved by ${user.tag}`);
        } catch (err) {
          console.error('[TIMEOUT APPROVE]', err.message);
          await interaction.reply({ content: `❌ فشل تنفيذ الكتم: ${err.message}`, ephemeral: true });
        }
        return;
      }
    }
  },
};