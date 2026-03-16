// ─── commands/check-learning.js ───────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin }          = require('../utils/permissions');
// ✅ استيراد مباشر عند تحميل الملف — أسرع من require داخل execute
const learningEngine       = require('../memory/learningEngine');
const { longTerm }         = require('../memory/memorySystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-learning')
        .setDescription('فحص حالة نظام تعلم الذكاء الاصطناعي — للإدارة فقط'),

    async execute(interaction) {
        // ✅ reply فوري لمنع timeout
        await interaction.reply({ content: '⏳ جاري جمع البيانات...', ephemeral: true });

        if (!isAdmin(interaction.member)) {
            return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });
        }

        try {
            const state     = learningEngine.getFullState();
            const bias      = learningEngine.getPersonalityBias();
            const best      = learningEngine.getBestStyle();
            const community = longTerm.getCommunityState();
            const profiles  = Object.keys(longTerm.getAllProfiles()).length;

            // ── نسب الأساليب ─────────────────────────────────────────────────
            const styles = state.styleSuccessRates || {};
            const styleLines = Object.entries(styles).map(([style, { success, total }]) => {
                const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
                const filled = Math.round(Number(rate) / 10);
                const bar  = '█'.repeat(filled) + '░'.repeat(10 - filled);
                return `\`${style.padEnd(8)}\` ${bar} **${rate}%**`;
            }).join('\n') || '_(لا بيانات)_';

            // ── تحيز الشخصية ─────────────────────────────────────────────────
            const biasLines = Object.entries(bias).map(([k, v]) => {
                const sign = v > 0 ? '▲' : v < 0 ? '▼' : '—';
                return `${sign} \`${k}\` ${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
            }).join('  ') || '_(محايد)_';

            // ── أعلى احتماليات ────────────────────────────────────────────────
            const probs = state.replyProbabilities || {};
            const probLines = Object.entries(probs)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([k, v]) => `\`${k}\` → **${(v * 100).toFixed(0)}%**`)
                .join('\n') || '_(لا بيانات)_';

            const evStage = community.evolutionStage || 1;
            const evBar   = '⭐'.repeat(evStage) + '☆'.repeat(5 - evStage);

            const embed = new EmbedBuilder()
                .setTitle('🧠  حالة نظام التعلم — FLUX AI')
                .setColor(state.totalTracked > 50 ? 0x2ecc71 : 0xffa500)
                .addFields(
                    {
                        name:  '📊 إحصاءات عامة',
                        value: `• ردود مُتتبَّعة: **${state.totalTracked || 0}**\n• معدل التفاعل: **${((state.overallEngagementRate || 0) * 100).toFixed(1)}%**\n• أفضل أسلوب: **${best}**\n• ملفات مستخدمين: **${profiles}**`,
                    },
                    {
                        name:  '🎭 نسب الأساليب',
                        value: styleLines,
                    },
                    {
                        name:  '🎯 أعلى احتماليات رد',
                        value: probLines,
                    },
                    {
                        name:  '⚖️ تحيز الشخصية',
                        value: biasLines,
                    },
                    {
                        name:  '🌱 مرحلة التطور',
                        value: `${evBar} — المرحلة **${evStage}/5**\n> تفاعلات كلية: **${community.totalInteractions || 0}**`,
                    },
                    {
                        name:  '🌍 المجتمع',
                        value: `• المزاج: **${community.communityMood || 'neutral'}**\n• الفكاهة: **${((community.humorLevel || 0) * 100).toFixed(0)}%**\n• اللهجة: **${community.dominantDialect || 'unknown'}**`,
                    },
                )
                .setFooter({ text: 'FLUX • IO  |  Learning Engine' })
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [embed] });

        } catch (err) {
            console.error('[CHECK-LEARNING]', err.message);
            await interaction.editReply({
                content: `❌ خطأ: \`${err.message}\``,
            }).catch(() => {});
        }
    },
};
