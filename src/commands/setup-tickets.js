// ─── setup-tickets.js ─────────────────────────────────────────────────────────
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('إعداد نظام التذاكر في القناة الحالية.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('🎫  نظام الدعم — FLUX IO')
      .setDescription(
        'مرحباً بك في نظام الدعم! 👋\n\n' +
        'اختر نوع التذكرة من القائمة أدناه وسيتم فتح قناة خاصة لك مع الفريق.\n\n' +
        '> 🛠️ **دعم فني** — مشاكل تقنية أو أسئلة\n' +
        '> 🚨 **بلاغ** — الإبلاغ عن عضو أو مشكلة\n' +
        '> 🤝 **شراكة** — طلبات التعاون والشراكة\n\n' +
        '*سيتم الرد عليك في أقرب وقت ممكن.*'
      )
      .setColor(0x1e90ff)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'FLUX • IO  |  نظام التذاكر' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('📋  اختر نوع التذكرة...')
      .addOptions([
        {
          label:       'دعم فني',
          description: 'مشكلة تقنية أو سؤال تحتاج مساعدة فيه',
          value:       'ticket_support',
          emoji:       '🛠️',
        },
        {
          label:       'بلاغ',
          description: 'الإبلاغ عن عضو أو موقف معين',
          value:       'ticket_report',
          emoji:       '🚨',
        },
        {
          label:       'شراكة',
          description: 'طلب شراكة أو تعاون مع FLUX IO',
          value:       'ticket_partnership',
          emoji:       '🤝',
        },
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ تم إعداد نظام التذاكر!' });
  },
};