// ─── events/leveling.js ───────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
// ✅ تصحيح مسارات استدعاء دوال utils
const { getTier } = require('../utils/rankCard');
const { addMessageXP } = require('../utils/xpSystem');
const { checkLevelBadges } = require('../utils/badges');

const TIER_ROLE_NAMES = ['مبتدئ', 'مطور', 'محترف', 'خبير', 'أسطورة', 'PRESTIGE'];

// ─── تحديث رتبة Discord ───────────────────────────────────────────────────────
async function updateTierRole(member, newLevel) {
  try {
    const guild = member.guild;
    const newTierName = getTier(newLevel).name;

    for (const roleName of TIER_ROLE_NAMES) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
      }
    }

    const newRole = guild.roles.cache.find((r) => r.name === newTierName);
    if (newRole) await member.roles.add(newRole).catch(() => {});

  } catch (err) {
    console.error('[LEVELING] فشل تحديث الرتبة:', err.message);
  }
}

// ─── إعلان الترقية ────────────────────────────────────────────────────────────
async function announceLevelUp(guild, member, oldLevel, newLevel) {
  const channel = guild.channels.cache.find(
    (c) => c.isTextBased() &&
           (c.name.includes('general') || c.name.includes('عام') || c.name.includes('announce'))
  );
  if (!channel) return;

  const oldTier = getTier(oldLevel);
  const newTier = getTier(newLevel);
  const tierUp  = oldTier.name !== newTier.name;

  const embed = new EmbedBuilder()
    .setColor(newTier.glow ?? 0x1e90ff)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: 'FLUX • IO  |  نظام المستويات' });

  if (tierUp) {
    embed
      .setTitle(`${newTier.emoji || '✨'}  ترقية رتبة!`)
      .setDescription(
        `${member} وصل لرتبة **${newTier.name}**! 🎉\n\n` +
        `الرتبة السابقة: ${oldTier.name}  →  الجديدة: **${newTier.name}**\n` +
        `المستوى: **${newLevel}**`
      );
  } else {
    embed
      .setTitle(`⬆️  ترقية مستوى!`)
      .setDescription(
        `${member} وصل للمستوى **${newLevel}**! 🎊\n` +
        `الرتبة الحالية: **${newTier.name}**`
      );
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (message.author.bot || !message.guild || message.channel.isThread()) return;

    try {
      // الاعتماد كلياً على MongoDB لإضافة الـ XP
      const result = await addMessageXP(message.guild.id, message.author.id);
      
      if (result && result.leveled) {
        let member = message.guild.members.cache.get(message.author.id);
        if (!member) member = await message.guild.members.fetch(message.author.id).catch(() => null);

        if (member) {
          await updateTierRole(member, result.user.level);
          await announceLevelUp(message.guild, member, result.user.level - 1, result.user.level);

          // التحقق من الشارات المكتسبة
          const newBadges = checkLevelBadges(message.guild.id, message.author.id, result.user.level);
          if (newBadges.length > 0) {
            const badgeText = newBadges.map((b) => `${b.emoji || '🏅'} **${b.name}**`).join('  |  ');
            await message.channel.send(`🏅 ${member} كسب شارات جديدة:\n${badgeText}`).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[LEVELING ERROR]', err.message);
    }
  },
  updateTierRole,
  announceLevelUp,
};