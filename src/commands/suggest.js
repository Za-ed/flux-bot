// ─── suggest.js ───────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const SUGGEST_CHANNEL = 'اقتراحات'; // اسم قناة الاقتراحات عندك

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('أرسل اقتراحاً للإدارة.')
    .addStringOption((opt) =>
      opt.setName('idea')
        .setDescription('اكتب اقتراحك هنا.')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const idea = interaction.options.getString('idea');

    // ابحث عن قناة الاقتراحات
    const suggestChannel = interaction.guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('اقتراح') || c.name.toLowerCase().includes('suggest')
    );

    if (!suggestChannel) {
      return interaction.editReply({
        content: '❌ ما لقيت قناة الاقتراحات. تأكد إن في قناة اسمها "اقتراحات".',
      });
    }

    // ── بناء الـ Embed ────────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle('💡  اقتراح جديد')
      .setDescription(`> ${idea}`)
      .addFields(
        { name: '👤  من',       value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: '📅  التاريخ',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,        inline: true },
        { name: '📊  التصويت', value: '✅ 0  |  ❌ 0',                                   inline: false },
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setColor(0xf1c40f)
      .setFooter({ text: 'FLUX • IO  |  نظام الاقتراحات' })
      .setTimestamp();

    // ── أزرار التصويت ─────────────────────────────────────────────────────────
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('suggest_yes')
        .setLabel('أوافق')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('suggest_no')
        .setLabel('لا أوافق')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('suggest_maybe')
        .setLabel('ربما')
        .setEmoji('🤔')
        .setStyle(ButtonStyle.Secondary),
    );

    const msg = await suggestChannel.send({ embeds: [embed], components: [row] });

    // أضف ريأكشنز أيضاً
    await msg.react('✅').catch(() => {});
    await msg.react('❌').catch(() => {});

    await interaction.editReply({
      content: `✅ تم إرسال اقتراحك إلى ${suggestChannel} بنجاح! 🎉`,
    });

    console.log(`[SUGGEST] ${interaction.user.tag}: ${idea.slice(0, 50)}`);
  },
};