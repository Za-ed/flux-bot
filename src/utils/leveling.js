const { EmbedBuilder } = require('discord.js');

// تحديد الرتب بناءً على الليفل
const TIERS = [
    { level: 0,  name: 'مبتدئ ✦', color: '#95a5a6' },
    { level: 5,  name: 'متفاعل ✦', color: '#3498db' },
    { level: 10, name: 'نشط ✦', color: '#2ecc71' },
    { level: 20, name: 'خبير ✦', color: '#f1c40f' },
    { level: 50, name: 'أسطورة ✦', color: '#e74c3c' },
];

async function updateTierRole(member, level) {
    const tier = [...TIERS].reverse().find(t => level >= t.level);
    if (!tier) return;

    // هنا يمكنك إضافة كود إعطاء رتبة (Role) حقيقية في السيرفر إذا أردت
    // const role = member.guild.roles.cache.find(r => r.name === tier.name);
    // if (role) await member.roles.add(role).catch(() => {});
}

async function announceLevelUp(guild, member, oldLevel, newLevel) {
    const channel = guild.channels.cache.find(c => c.name.includes('bot') || c.name.includes('level'));
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('⬆️ مستوى جديد!')
        .setDescription(`كفو يا ${member}، ارتفع مستواك من **${oldLevel}** إلى **${newLevel}**! 🚀`)
        .setColor('#1e90ff')
        .setThumbnail(member.user.displayAvatarURL());

    await channel.send({ content: `${member}`, embeds: [embed] });
}

module.exports = { updateTierRole, announceLevelUp, TIERS };