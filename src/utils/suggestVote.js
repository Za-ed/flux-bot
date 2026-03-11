// ─── suggestVote.js ───────────────────────────────────────────────────────────
// مُعالج تصويت الاقتراحات — يُستدعى من interactionCreate.js
// أضف هذا السطر في interactionCreate.js داخل isButton():
//   const { handleSuggestVote } = require('../utils/suggestVote');
//   if (await handleSuggestVote(interaction)) return;

const { EmbedBuilder } = require('discord.js');

// تخزين التصويتات: msgId -> { yes: Set, no: Set, maybe: Set }
const votes = new Map();

async function handleSuggestVote(interaction) {
  const { customId, message, user } = interaction;
  if (!['suggest_yes', 'suggest_no', 'suggest_maybe'].includes(customId)) return false;

  await interaction.deferUpdate();

  const msgId = message.id;
  if (!votes.has(msgId)) votes.set(msgId, { yes: new Set(), no: new Set(), maybe: new Set() });

  const v = votes.get(msgId);

  // إزالة التصويت السابق للمستخدم
  v.yes.delete(user.id);
  v.no.delete(user.id);
  v.maybe.delete(user.id);

  // إضافة التصويت الجديد
  if (customId === 'suggest_yes')   v.yes.add(user.id);
  if (customId === 'suggest_no')    v.no.add(user.id);
  if (customId === 'suggest_maybe') v.maybe.add(user.id);

  const total = v.yes.size + v.no.size + v.maybe.size;
  const pct   = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

  // تحديث الـ embed
  const oldEmbed = message.embeds[0];
  if (!oldEmbed) return true;

  const newEmbed = EmbedBuilder.from(oldEmbed)
    .setFields(
      ...oldEmbed.fields.filter((f) => f.name !== '📊  التصويت'),
      {
        name: '📊  التصويت',
        value:
          `✅ أوافق: **${v.yes.size}** (${pct(v.yes.size)}%)\n` +
          `❌ لا أوافق: **${v.no.size}** (${pct(v.no.size)}%)\n` +
          `🤔 ربما: **${v.maybe.size}** (${pct(v.maybe.size)}%)\n` +
          `👥 المجموع: **${total}**`,
      }
    );

  await message.edit({ embeds: [newEmbed] }).catch(() => {});
  return true;
}

module.exports = { handleSuggestVote };