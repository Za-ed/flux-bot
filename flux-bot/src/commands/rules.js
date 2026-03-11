const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Post the official FLUX • IO server rules.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const rulesEmbed = new EmbedBuilder()
      .setTitle('📋  FLUX • IO — Server Rules')
      .setColor(0x1e90ff)
      .setDescription(
        'Welcome to **FLUX • IO** — a community built by developers, for developers.\n' +
        'To keep this space productive, professional, and safe, all members must abide by the following rules.\n' +
        'Violations will result in warnings, mutes, or permanent bans at staff discretion.\n\u200b'
      )
      .addFields(
        {
          name: '§1 — 🚫 Anti-Spam',
          value:
            'Do **not** flood any channel with repeated messages, excessive pings, or copy-pasted walls of text. ' +
            'This includes spamming reactions, voice channel switching, or any other disruptive repetitive behavior. ' +
            'Automated or manual spam will result in an immediate timeout.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§2 — 🔞 No NSFW Content',
          value:
            'This is a professional developer community. **No** NSFW, explicit, graphic, or sexually suggestive content ' +
            'is permitted anywhere in the server — including usernames, profile pictures, and status messages.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§3 — 🤝 Mutual Respect',
          value:
            'Treat every member with professionalism and respect regardless of skill level, background, or opinion. ' +
            'Harassment, hate speech, discrimination, targeted insults, and personal attacks are **strictly prohibited**. ' +
            'Healthy debate is welcome; toxic behavior is not.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§4 — 📬 No Unsolicited DMs to Staff',
          value:
            'Please do **not** DM staff members directly for support, appeals, or questions. ' +
            'Use the appropriate ticket or channel instead. Unsolicited DMs are disrespectful of staff time ' +
            'and will not receive a response.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§5 — 🔗 No Unauthorized Links',
          value:
            'Sharing links (including Discord invites, external sites, or file hosts) is **restricted to Staff** unless ' +
            'explicitly permitted in a specific channel. Unauthorized link posting will be auto-deleted.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§6 — 📌 Stay On Topic',
          value:
            'Use channels for their intended purpose. Check channel descriptions before posting. ' +
            'Off-topic conversations belong in designated casual channels.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§7 — ⚖️ Staff Authority is Final',
          value:
            'Staff decisions are final. If you believe a decision was made in error, open a ticket calmly and professionally. ' +
            'Arguing, publicly calling out staff, or attempting to circumvent moderation will result in escalated action.',
        }
      )
      .setImage('https://i.imgur.com/YourBannerImageHere.png') // Replace with your actual banner URL
      .setFooter({
        text: 'FLUX • IO  |  Last updated by Server Administration',
      })
      .setTimestamp();

    await interaction.channel.send({ embeds: [rulesEmbed] });
    await interaction.editReply({ content: '✅ Rules posted successfully.' });
  },
};