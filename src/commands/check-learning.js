// ─── commands/check-learning.js ───────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin }                           = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-learning')
        .setDescription('فحص حالة نظام تعلم الذكاء الاصطناعي — للإدارة فقط'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!isAdmin(interaction.member)) {
            return interaction.editReply({ content: '❌ هذا الأمر للإدارة فقط.' });
        }

        let learningEngine, memorySystem;

        try {
            learningEngine = require('../memory/learningEngine');
            memorySystem   = require('../memory/memorySystem');
        } catch (err) {
            return interaction.editReply({
                content: `❌ فشل تحميل نظام التعلم:\n\`\`\`${err.message}\`\`\``,
            });
        }

        // ── جلب البيانات ──────────────────────────────────────────────────────
        const state   = learningEngine.getFullState();
        const bias    = learningEngine.getPersonalityBias();
        const best    = learningEngine.getBestStyle();
        const community = memorySystem.longTerm.getCommunityState();
        const profiles = Object.keys(memorySystem.longTerm.getAllProfiles()).length;

        // ── نسب نجاح الأساليب ────────────────────────────────────────────────
        const styles = state.styleSuccessRates || {};
        const styleLines = Object.entries(styles).map(([style, { success, total }]) => {
            const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
            const bar  = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
            return `\`${style.padEnd(8)}\` ${bar} ${rate}%`;
        }).join('\n');

        // ── احتماليات الرد حسب المشاعر ───────────────────────────────────────
        const probs = state.replyProbabilities || {};
        const probLines = Object.entries(probs)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([key, val]) => `\`${key}\`: ${(val * 100).toFixed(0)}%`)
            .join('  •  ');

        // ── تحيز الشخصية ─────────────────────────────────────────────────────
        const biasLines = Object.entries(bias)
            .map(([k, v]) => {
                const sign = v > 0 ? '▲' : v < 0 ? '▼' : '—';
                return `${sign} \`${k}\`: ${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
            }).join('  ');

        // ── مرحلة التطور ─────────────────────────────────────────────────────
        const evStage = community.evolutionStage || 1;
        const evBar   = '⭐'.repeat(evStage) + '☆'.repeat(5 - evStage);

        const embed = new EmbedBuilder()
            .setTitle('🧠  حالة نظام التعلم — FLUX AI')
            .setColor(state.totalTracked > 100 ? 0x2ecc71 : 0xffa500)
            .addFields(
                {
                    name:  '📊 إحصاءات عامة',
                    value:
                        `• ردود مُتتبَّعة: **${state.totalTracked || 0}**\n` +
                        `• معدل التفاعل الكلي: **${((state.overallEngagementRate || 0) * 100).toFixed(1)}%**\n` +
                        `• أفضل أسلوب حالياً: **${best}**\n` +
                        `• ملفات مستخدمين محفوظة: **${profiles}**`,
                },
                {
                    name:  '🎭 نسب نجاح الأساليب',
                    value: styleLines || '_(لا بيانات بعد)_',
                },
                {
                    name:  '🎯 احتماليات الرد (أعلى 6)',
                    value: probLines || '_(لا بيانات بعد)_',
                },
                {
                    name:  '⚖️ تحيز الشخصية',
                    value: biasLines || '_(محايد)_',
                },
                {
                    name:  '🌱 مرحلة التطور',
                    value: `${evBar}  المرحلة **${evStage}/5**\n> تفاعلات كلية: **${community.totalInteractions || 0}**`,
                },
                {
                    name:  '🌍 حالة المجتمع',
                    value:
                        `• المزاج السائد: **${community.communityMood || 'neutral'}**\n` +
                        `• مستوى الفكاهة: **${((community.humorLevel || 0) * 100).toFixed(0)}%**\n` +
                        `• اللهجة السائدة: **${community.dominantDialect || 'unknown'}**`,
                },
            )
            .setFooter({ text: 'FLUX • IO  |  Learning Engine v2' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};