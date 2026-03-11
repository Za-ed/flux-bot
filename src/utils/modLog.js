// ─── modLog.js ────────────────────────────────────────────────────────────────
// يُستدعى من أوامر ban/kick/warn/timeout لتسجيل المخالفات في قناة logs

const { EmbedBuilder } = require('discord.js');

const LOG_CHANNEL_NAME = '📋・logs'; // غيّر لاسم قناة الـ logs عندك

// ألوان حسب نوع المخالفة
const COLORS = {
  ban:     0x8b0000,
  kick:    0xff4444,
  warn:    0xffa500,
  timeout: 0xff8c00,
  unban:   0x2ecc71,
};

const EMOJIS = {
  ban:     '🔨',
  kick:    '👢',
  warn:    '⚠️',
  timeout: '🔇',
  unban:   '✅',
};

/**
 * يسجل المخالفة في قناة الـ logs
 * @param {Guild} guild
 * @param {Object} options - { type, moderator, target, reason, duration? }
 */
async function logAction(guild, { type, moderator, target, reason, duration }) {
  const logChannel = guild.channels.cache.find(
    (c) => c.name.toLowerCase().includes('log')
  );

  if (!logChannel) {
    console.warn('[MOD-LOG] ما لقيت قناة logs في السيرفر');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS[type] ?? '📋'}  ${typeLabel(type)}`)
    .setColor(COLORS[type] ?? 0x1e90ff)
    .addFields(
      { name: '👤  العضو',    value: `${target.user?.tag ?? target.tag ?? target} \n\`${target.id ?? target.user?.id ?? '—'}\``, inline: true },
      { name: '🛡️  المشرف',   value: `${moderator.tag ?? moderator}\n\`${moderator.id ?? '—'}\``,                                inline: true },
      { name: '\u200b',       value: '\u200b',                                                                                   inline: true },
      { name: '📝  السبب',    value: reason ?? 'لم يُذكر سبب.' },
    )
    .setThumbnail(target.user?.displayAvatarURL({ dynamic: true }) ?? target.displayAvatarURL?.({ dynamic: true }) ?? null)
    .setFooter({ text: `FLUX • IO  |  سجل المخالفات  •  ID: ${target.id ?? target.user?.id ?? '—'}` })
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: '⏱️  المدة', value: duration });
  }

  await logChannel.send({ embeds: [embed] }).catch((err) => {
    console.error('[MOD-LOG] فشل الإرسال:', err.message);
  });

  console.log(`[MOD-LOG] ${typeLabel(type)} — ${target.user?.tag ?? target.tag} بواسطة ${moderator.tag ?? moderator}`);
}

function typeLabel(type) {
  const labels = {
    ban:     'حظر عضو',
    kick:    'طرد عضو',
    warn:    'تحذير عضو',
    timeout: 'كتم عضو',
    unban:   'رفع الحظر',
  };
  return labels[type] ?? type;
}

module.exports = { logAction };