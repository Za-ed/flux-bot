const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

// ─── Ticket Category Name ────────────────────────────────────────────────────
const TICKET_CATEGORY_NAME = 'Tickets';
const STAFF_ROLE_NAME = 'Staff';

// ─── Ticket Label Map ────────────────────────────────────────────────────────
const TICKET_TYPES = {
  ticket_support: {
    label: 'Support',
    emoji: '💻',
    color: 0x1e90ff,
    description: 'Describe your issue in detail and a staff member will assist you shortly.',
  },
  ticket_report: {
    label: 'Report',
    emoji: '🚨',
    color: 0xff4444,
    description: 'Please provide the username, evidence (screenshots), and a description of the incident.',
  },
  ticket_partnership: {
    label: 'Partnership',
    emoji: '🤝',
    color: 0x2ecc71,
    description: 'Tell us about your server/project and what kind of partnership you are proposing.',
  },
};

// ─── Helper: Find or Create Ticket Category ──────────────────────────────────
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

// ─── Helper: Find Staff Role ─────────────────────────────────────────────────
function getStaffRole(guild) {
  return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

// ─── Main Export ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {
    // ── Slash Command Routing ──────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.warn(`[COMMANDS] Unknown command received: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[COMMANDS] Error in /${interaction.commandName}:`, error);
        const errorMsg = { content: '❌ An error occurred while executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg).catch(() => {});
        } else {
          await interaction.reply(errorMsg).catch(() => {});
        }
      }

      return;
    }

    // ── Button Interaction Routing ─────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, user, member } = interaction;

      // ── Open Ticket Buttons ──────────────────────────────────────────────
      if (TICKET_TYPES[customId]) {
        await interaction.deferReply({ ephemeral: true });

        const ticketInfo = TICKET_TYPES[customId];
        const staffRole = getStaffRole(guild);

        // Prevent duplicate tickets from the same user of the same type
        const existingChannel = guild.channels.cache.find(
          (c) =>
            c.name === `${ticketInfo.label.toLowerCase()}-${user.id}` &&
            c.type === ChannelType.GuildText
        );

        if (existingChannel) {
          await interaction.editReply({
            content: `❗ You already have an open ticket: ${existingChannel}. Please resolve it before opening a new one.`,
          });
          return;
        }

        const category = await getOrCreateCategory(guild);

        // ── Build Permission Overwrites ──────────────────────────────────
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

        // ── Create Ticket Channel ────────────────────────────────────────
        const ticketChannel = await guild.channels.create({
          name: `${ticketInfo.label.toLowerCase()}-${user.id}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites,
          topic: `Ticket opened by ${user.tag} | Type: ${ticketInfo.label}`,
        });

        // ── Welcome Embed Inside Ticket ──────────────────────────────────
        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`${ticketInfo.emoji}  ${ticketInfo.label} Ticket`)
          .setDescription(
            `Welcome, ${user}!\n\n` +
            `${ticketInfo.description}\n\n` +
            `${staffRole ? staffRole : '**Staff**'} will be with you shortly.\n\n` +
            '*When your issue is resolved, click the button below to close this ticket.*'
          )
          .setColor(ticketInfo.color)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .setFooter({ text: 'FLUX • IO  |  Ticket System' })
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`close_ticket_${ticketChannel.id}`)
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        const staffPing = staffRole ? `${staffRole}` : '*(No Staff role found)*';
        await ticketChannel.send({
          content: `${user} ${staffPing}`,
          embeds: [welcomeEmbed],
          components: [closeRow],
        });

        await interaction.editReply({
          content: `✅ Your ticket has been created: ${ticketChannel}`,
        });

        console.log(`[TICKETS] Opened: ${ticketChannel.name} for ${user.tag}`);
        return;
      }

      // ── Close Ticket Button ──────────────────────────────────────────────
      if (customId.startsWith('close_ticket_')) {
        await interaction.deferReply();

        const targetChannelId = customId.replace('close_ticket_', '');
        const channelToClose = guild.channels.cache.get(targetChannelId);

        if (!channelToClose) {
          await interaction.editReply({ content: '❌ Ticket channel not found.' });
          return;
        }

        // Only Staff or the ticket owner (extracted from channel name) can close
        const staffRole = getStaffRole(guild);
        const isStaff = staffRole && member.roles.cache.has(staffRole.id);
        const channelNameParts = channelToClose.name.split('-');
        const ticketOwnerId = channelNameParts[channelNameParts.length - 1];
        const isOwner = user.id === ticketOwnerId;

        if (!isStaff && !isOwner) {
          await interaction.editReply({
            content: '❌ Only Staff or the ticket creator can close this ticket.',
          });
          return;
        }

        const closingEmbed = new EmbedBuilder()
          .setTitle('🔒  Ticket Closing')
          .setDescription(`This ticket was closed by ${user}.\nThe channel will be **deleted in 5 seconds**.`)
          .setColor(0xff4444)
          .setTimestamp();

        await interaction.editReply({ embeds: [closingEmbed] });

        console.log(`[TICKETS] Closing: ${channelToClose.name} — requested by ${user.tag}`);

        setTimeout(async () => {
          await channelToClose.delete(`Ticket closed by ${user.tag}`).catch((err) => {
            console.error('[TICKETS] Failed to delete ticket channel:', err.message);
          });
        }, 5000);

        return;
      }
    }
  },
};