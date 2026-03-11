const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('عرض معلومات تفصيلية عن السيرفر.'),

  async execute(interaction) {
    await interaction.deferReply();

    const { guild } = interaction;
    await guild.fetch();

    const owner = await guild.fetchOwner();

    const totalChannels = guild.channels.cache.size;
    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount = totalMembers - botCount;

    const verificationLevels = {
      0: '🟢 بدون',
      1: '🟡 منخفض',
      2: '🟠 متوسط',
      3: '🔴 عالي',
      4: '🔒 أعلى مستوى',
    };

    const embed = new EmbedBuilder()
      .setTitle(`🏠  معلومات ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setImage(guild.bannerURL({ size: 1024 }) ?? null)
      .addFields(
        { name: '🆔  الـ ID', value: guild.id, inline: true },
        { name: '👑  المالك', value: `${owner.user.tag}`, inline: true },
        {
          name: '📅  تاريخ الإنشاء',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
        {
          name: '👥  الأعضاء',
          value: `الكل: **${totalMembers}** | بشر: **${humanCount}** | بوتات: **${botCount}**`,
          inline: false,
        },
        {
          name: '📁  القنوات',
          value: `الكل: **${totalChannels}** | نص: **${textChannels}** | صوت: **${voiceChannels}** | فئات: **${categories}**`,
          inline: false,
        },
        { name: '🎭  عدد الرولات', value: `${guild.roles.cache.size}`, inline: true },
        { name: '😀  عدد الإيموجيز', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🚀  بوست', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        {
          name: '🔒  مستوى التحقق',
          value: verificationLevels[guild.verificationLevel] ?? 'غير معروف',
          inline: true,
        }
      )
      .setColor(0x1e90ff)
      .setFooter({ text: 'FLUX • IO  |  معلومات السيرفر' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};