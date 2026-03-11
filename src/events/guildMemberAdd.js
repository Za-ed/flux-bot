// ─── guildMemberAdd.js ────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { trackJoin }    = require('../utils/dailyReport');

module.exports = {
  name: 'guildMemberAdd',
  once: false,

  async execute(member) {
    const { guild, user } = member;
    console.log(`[WELCOME] عضو جديد: ${user.tag}`);

    trackJoin(guild.id);

    const welcomeChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase().includes('welcome') || c.name.includes('ترحيب')
    );

    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`👋  أهلاً ${user.username}!`)
        .setDescription(
          `يسعدنا انضمامك لـ **${guild.name}** 🎉\nأنت العضو رقم **${guild.memberCount}**\n\n` +
          `> 📋 اقرأ القواعد\n> 🎮 العب في gaming-corner\n> 📊 جرب **/rank** و **/daily**`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(0x1e90ff)
        .setFooter({ text: 'FLUX • IO  |  نورت 🚀' })
        .setTimestamp();
      await welcomeChannel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
    }

    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🎉  أهلاً ${user.username}، نورت FLUX IO!`)
          .setDescription(
            `**شو تلاقي:**\n> 💻 ask-flux — AI\n> 😎 chill — شات\n> 🎮 gaming-corner — ألعاب وXP\n> 📊 /rank — بطاقة رتبتك\n> 📅 /daily — مهام يومية`
          )
          .setColor(0x1e90ff)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .setFooter({ text: 'FLUX • IO' })
          .setTimestamp(),
      ],
    }).catch(() => {});

    const logChannel = guild.channels.cache.find((c) => c.name.toLowerCase().includes('log'));
    if (logChannel) {
      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📥  عضو جديد')
            .addFields(
              { name: '👤', value: `${user.tag}\n\`${user.id}\``,                          inline: true },
              { name: '📅', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,     inline: true },
              { name: '👥', value: `${guild.memberCount} عضو`,                              inline: true },
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setColor(0x2ecc71).setTimestamp(),
        ],
      }).catch(() => {});
    }
  },
};