const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('تفعيل نظام التذاكر في القناة الحالية.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('🎫  FLUX • IO  —  مركز الدعم')
      .setDescription(
        'تحتاج مساعدة؟ عندك بلاغ؟ تبي تتشارك معنا؟\n' +
        'اختر التصنيف المناسب أدناه لفتح **تذكرة خاصة**.\n\n' +
        '> 💻 **دعم فني** — مساعدة تقنية، أسئلة، أو استفسارات عامة.\n' +
        '> 🚨 **بلاغ** — الإبلاغ عن عضو مخالف أو حادثة معينة.\n' +
        '> 🤝 **شراكة** — اقتراح تعاون أو شراكة مع السيرفر.\n\n' +
        '*سيرد عليك فريق الإدارة في أقرب وقت ممكن.*'
      )
      .setColor(0x1e90ff)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({
        text: 'FLUX • IO  |  تذكرة واحدة لكل مشكلة من فضلك.',
        iconURL: interaction.guild.iconURL({ dynamic: true }),
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_support')
        .setLabel('دعم فني')
        .setEmoji('💻')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_report')
        .setLabel('بلاغ')
        .setEmoji('🚨')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_partnership')
        .setLabel('شراكة')
        .setEmoji('🤝')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ تم تفعيل نظام التذاكر بنجاح.' });
  },
};