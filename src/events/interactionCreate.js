// ─── interactionCreate.js ─────────────────────────────────────────────────────
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChannelType,
    AttachmentBuilder,
} = require('discord.js');

const { handleSuggestVote }                    = require('../utils/suggestVote');
const { canUseCommand }                        = require('../utils/permManager');
const { getUserData, getUserRank, xpForLevel } = require('../utils/xpSystem');
const { generateRankCard }                     = require('../utils/rankCard');
const { isAdmin }                              = require('../utils/permissions');
const { logAction }                            = require('../utils/modLog');

// ─── Config ───────────────────────────────────────────────────────────────────
const TICKET_CATEGORY_NAME   = 'التذاكر';
const STAFF_ROLE_NAME        = 'Staff';
const TICKET_CLOSE_TIMEOUT   = 60_000; // 60 ثانية للحذف التلقائي بعد الإغلاق

// ─── Ticket Types ─────────────────────────────────────────────────────────────
const TICKET_TYPES = {
    ticket_support: {
        label:       'دعم فني',
        emoji:       '🛠️',
        color:       0x1e90ff,
        description: 'اشرح مشكلتك بالتفصيل وسيساعدك أحد أعضاء الفريق.',
    },
    ticket_report: {
        label:       'بلاغ',
        emoji:       '🚨',
        color:       0xff4444,
        description: 'أرسل اسم العضو، الأدلة، وشرح للمشكلة.',
    },
    ticket_partnership: {
        label:       'شراكة',
        emoji:       '🤝',
        color:       0x2ecc71,
        description: 'أخبرنا عن مشروعك ونوع الشراكة المقترحة.',
    },
};

// ─── Store: بيانات التذاكر المفتوحة ──────────────────────────────────────────
const ticketData = new Map();

// ── استرجاع التذاكر المفتوحة عند restart ─────────────────────────────────────
// يُستدعى من ready.js أو عند أول interaction
async function restoreTickets(guild) {
    if (!guild) return;
    try {
        const category = guild.channels.cache.find(
            c => c.type === 4 && c.name === TICKET_CATEGORY_NAME
        );
        if (!category) return;

        const ticketChannels = guild.channels.cache.filter(
            c => c.parentId === category.id && c.type === 0
        );

        for (const [, ch] of ticketChannels) {
            if (!ticketData.has(ch.id)) {
                // استرجاع من topic القناة
                const topic = ch.topic ?? '';
                const ownerMatch = topic.match(/(\d{17,20})/);
                const typeMatch  = Object.keys(TICKET_TYPES).find(t =>
                    ch.name.includes(TICKET_TYPES[t].label)
                );
                ticketData.set(ch.id, {
                    ownerId:     ownerMatch?.[1] ?? null,
                    ownerTag:    topic.split(' | ')[0].replace('تذكرة بواسطة ', '') ?? 'غير معروف',
                    type:        typeMatch ?? 'ticket_support',
                    openedAt:    ch.createdTimestamp,
                    solved:      null,
                    stars:       null,
                    closedBy:    null,
                    closedByTag: null,
                    timeoutId:   null,
                });
            }
        }
        if (ticketChannels.size > 0)
            console.log(`[TICKETS] ✅ استُرجعت ${ticketChannels.size} تذكرة مفتوحة`);
    } catch (err) {
        console.error('[TICKETS] فشل استرجاع التذاكر:', err.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLogChannel(guild) {
    return guild.channels.cache.find(
        (c) => c.name.toLowerCase().includes('mod-log') || c.name.toLowerCase().includes('📋')
    );
}

async function getOrCreateCategory(guild) {
    let cat = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
    );
    if (!cat) {
        cat = await guild.channels.create({
            name: TICKET_CATEGORY_NAME,
            type: ChannelType.GuildCategory,
        });
    }
    return cat;
}

function getStaffRole(guild) {
    return guild.roles.cache.find((r) => r.name === STAFF_ROLE_NAME);
}

function extractChannelId(customId, prefixParts) {
    return customId.split('_').slice(prefixParts).join('_');
}

// ─── بناء أزرار التقييم ───────────────────────────────────────────────────────
function buildRatingComponents(channelId) {
    const solvedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rating_solved_yes_${channelId}`)
            .setLabel('نعم، تم الحل ✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`rating_solved_no_${channelId}`)
            .setLabel('لا، لم يُحل ❌')
            .setStyle(ButtonStyle.Danger),
    );

    const starsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rating_stars_1_${channelId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_stars_2_${channelId}`).setLabel('⭐⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_stars_3_${channelId}`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_stars_4_${channelId}`).setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_stars_5_${channelId}`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Primary),
    );

    return [solvedRow, starsRow];
}

// ─── إرسال تقرير التذكرة لـ mod-logs ─────────────────────────────────────────
async function sendTicketLog(guild, data) {
    const logChannel = getLogChannel(guild);
    if (!logChannel) return;

    const { ownerTag, ownerId, type, openedAt, closedBy, closedByTag, solved, stars } = data;
    const duration  = openedAt ? Math.floor((Date.now() - openedAt) / 60000) + ' دقيقة' : '—';
    const starsText = stars    ? '⭐'.repeat(stars) + ` (${stars}/5)`           : '_(لم يُقيَّم)_';
    const solvedText = solved === true ? '✅ نعم' : solved === false ? '❌ لا'  : '_(لم يُجاب)_';

    const embed = new EmbedBuilder()
        .setTitle(`🎫  تذكرة مغلقة — ${TICKET_TYPES[type]?.label ?? type}`)
        .addFields(
            { name: '👤  صاحب التذكرة', value: `${ownerTag}\n\`${ownerId}\``,     inline: true },
            { name: '🔒  أغلقها',        value: `${closedByTag}\n\`${closedBy}\``, inline: true },
            { name: '⏱️  المدة',          value: duration,                          inline: true },
            { name: '✅  تم الحل؟',       value: solvedText,                        inline: true },
            { name: '⭐  التقييم',        value: starsText,                         inline: true },
        )
        .setColor(solved ? 0x2ecc71 : 0xff4444)
        .setFooter({ text: 'FLUX • IO  |  سجل التذاكر' })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ─── إغلاق التذكرة النهائي (مركزي) ──────────────────────────────────────────
async function finalizeTicket(guild, channelId, channel) {
    if (!ticketData.has(channelId)) return;

    const data = ticketData.get(channelId);
    if (data.timeoutId) clearTimeout(data.timeoutId);

    await sendTicketLog(guild, data);
    ticketData.delete(channelId);

    if (channel) {
        await channel.delete('تم الإغلاق').catch(() => {});
    }
}

// ─── فحص صلاحية التقييم ──────────────────────────────────────────────────────
function canRate(user, member, data, guild) {
    if (!data) return false;
    const staffRole = getStaffRole(guild);
    const isStaff   = staffRole && member.roles.cache.has(staffRole.id);
    return user.id === data.ownerId || isStaff || isAdmin(member);
}

// ═════════════════════════════════════════════════════════════════════════════
module.exports = {
    name: 'interactionCreate',
    restoreTickets,
    once: false,

    async execute(interaction, client) {

        // ── Slash Commands ─────────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // ✅ canUseCommand sync — فوري من الـ Cache لا يبطئ الـ interaction
            let hasPermission = true;
            try {
                hasPermission = canUseCommand(interaction.member, interaction.commandName);
            } catch (err) {
                console.error('[PERM ERROR]', err.message);
                hasPermission = true;
            }

            if (!hasPermission) {
                // ✅ تم استخدام flags: 64 بدلاً من ephemeral: true
                return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', flags: 64 });
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[COMMANDS] Error in /${interaction.commandName}:`, error);
                const msg = { content: '❌ حدث خطأ أثناء تنفيذ الأمر.', flags: 64 };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
                else await interaction.reply(msg).catch(() => {});
            }
            return;
        }

        // ── Dropdown — فتح تذكرة ──────────────────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
            await interaction.deferReply({ flags: 64 }); // ✅ تم التعديل

            const value      = interaction.values[0];
            const ticketInfo = TICKET_TYPES[value];
            if (!ticketInfo) return interaction.editReply({ content: '❌ نوع التذكرة غير معروف.' });

            const { guild, user } = interaction;
            const staffRole = getStaffRole(guild);

            const hasOpenTicket = [...ticketData.values()].some((d) => d.ownerId === user.id);
            if (hasOpenTicket) {
                const existingChannel = guild.channels.cache.find(
                    (c) => c.name === `${ticketInfo.label}-${user.id}` && c.type === ChannelType.GuildText
                );
                return interaction.editReply({
                    content: `❗ عندك تذكرة مفتوحة بالفعل${existingChannel ? `: ${existingChannel}` : ''}. أغلقها أولاً.`,
                });
            }

            const category = await getOrCreateCategory(guild);

            const permOverwrites = [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                    ],
                },
            ];
            if (staffRole) {
                permOverwrites.push({
                    id: staffRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.AttachFiles,
                    ],
                });
            }

            const ticketChannel = await guild.channels.create({
                name:                 `${ticketInfo.label}-${user.id}`,
                type:                 ChannelType.GuildText,
                parent:               category.id,
                permissionOverwrites: permOverwrites,
                topic:                `تذكرة بواسطة ${user.tag} | النوع: ${ticketInfo.label}`,
            });

            ticketData.set(ticketChannel.id, {
                ownerId:     user.id,
                ownerTag:    user.tag,
                type:        value,
                openedAt:    Date.now(),
                solved:      null,
                stars:       null,
                closedBy:    null,
                closedByTag: null,
                timeoutId:   null,
            });

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`${ticketInfo.emoji}  تذكرة ${ticketInfo.label}`)
                .setDescription(
                    `أهلاً ${user}! 👋\n\n` +
                    `${ticketInfo.description}\n\n` +
                    `${staffRole ?? '**الفريق**'} سيرد عليك قريباً.\n\n` +
                    `*عند انتهاء المشكلة اضغط على زر الإغلاق.*`
                )
                .setColor(ticketInfo.color)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setFooter({ text: 'FLUX • IO  |  نظام التذاكر' })
                .setTimestamp();

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketChannel.id}`)
                    .setLabel('إغلاق التذكرة')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content:    `${user} ${staffRole ?? ''}`,
                embeds:     [welcomeEmbed],
                components: [closeRow],
            });

            await interaction.editReply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}` });
            return;
        }

        // ── Buttons ────────────────────────────────────────────────────────────
        if (interaction.isButton()) {
            const { customId, guild, user, member } = interaction;

            try {
                if (await handleSuggestVote(interaction)) return;
            } catch (err) {
                console.error('[SUGGEST VOTE ERROR]', err.message);
            }

            // ── زر بطاقة الرانك — ephemeral فقط (لك أنت) ──────────────────
            if (customId === 'show_rank_card') {
                // رد فوري عشان ما ينتهي الـ 3 ثواني
                await interaction.deferReply({ flags: 64 });

                try {
                    const userData = await getUserData(guild.id, user.id)
                        || { level: 0, xp: 0, total_xp: 0, voice_xp: 0 };
                    const rank         = await getUserRank(guild.id, user.id) || 0;
                    const currentLevel = userData.level || 0;
                    const currentXP    = userData.xp    || 0;
                    const xpNext       = xpForLevel(currentLevel + 1);

                    // ── توليد الصورة ──────────────────────────────────────────
                    const buffer = await generateRankCard({
                        username:     user.username,
                        displayName:  member?.displayName || user.username,
                        avatarURL:    user.displayAvatarURL({ extension: 'png', size: 256 }),
                        level:        currentLevel,
                        currentXP,
                        xpForNext:    xpNext,
                        rank,
                        voiceMinutes: userData.voice_xp || 0,
                    });

                    const attachment = new AttachmentBuilder(buffer, { name: 'rank.gif' });

                    const rankEmbed = new EmbedBuilder()
                        .setColor(0x1e90ff)
                        .setAuthor({
                            name:    `🏆 إحصائيات ${member?.displayName || user.username}`,
                            iconURL: user.displayAvatarURL(),
                        })
                        .setImage('attachment://rank.gif')
                        .setFooter({ text: `FLUX • IO  |  فقط أنت من يرى هذه الرسالة` })
                        .setTimestamp();

                    // ── إرسال للمستخدم فقط (ephemeral) ───────────────────────
                    await interaction.editReply({
                        embeds: [rankEmbed],
                        files:  [attachment],
                    });

                } catch (err) {
                    console.error('[RANK CARD BUTTON]', err.message);
                    await interaction.editReply({
                        content: `❌ حصل خطأ: \`${err.message}\``,
                    }).catch(() => {});
                }
                return;
            }

            // ── موافقة / رفض طلبات الحظر (Moderator → Admin) ──────────────────
            if (customId.startsWith('approve_ban_') || customId.startsWith('reject_ban_')) {
                await interaction.deferReply({ flags: 64 });

                // فقط الإدارة تقدر توافق
                if (!isAdmin(member)) {
                    return interaction.editReply({ content: '❌ هذه الأزرار للإدارة فقط.' });
                }

                const isApprove = customId.startsWith('approve_ban_');
                const requestId = customId.replace('approve_ban_', '').replace('reject_ban_', '');

                // استيراد pendingBans من ملف ban.js
                let pendingBans;
                try {
                    pendingBans = require('../commands/ban').pendingBans;
                } catch (e) {
                    return interaction.editReply({ content: '❌ تعذّر الوصول لقائمة طلبات الحظر.' });
                }

                const data = pendingBans.get(requestId);

                if (!data) {
                    return interaction.editReply({ content: '⏰ انتهت صلاحية هذا الطلب (10 دقائق).' });
                }

                pendingBans.delete(requestId);

                if (!isApprove) {
                    // ── رفض الطلب ──────────────────────────────────────────────
                    const rejectEmbed = new EmbedBuilder()
                        .setTitle('❌  تم رفض طلب الحظر')
                        .addFields(
                            { name: '👤  العضو',       value: data.targetTag,    inline: true },
                            { name: '🛡️  طلب بواسطة', value: data.requesterTag, inline: true },
                            { name: '❌  رُفض بواسطة', value: user.tag,          inline: true },
                        )
                        .setColor(0xffa500)
                        .setFooter({ text: 'FLUX • IO  |  نظام الموافقات' })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [rejectEmbed] });
                    console.log(`[BAN] ❌ Rejected: ${data.targetTag} | by ${user.tag}`);
                    return;
                }

                // ── تنفيذ الحظر ────────────────────────────────────────────────
                try {
                    const targetMember = await guild.members.fetch(data.targetId).catch(() => null);

                    if (!targetMember) {
                        return interaction.editReply({ content: '❌ العضو غادر السيرفر قبل تنفيذ الحظر.' });
                    }

                    if (!targetMember.bannable) {
                        return interaction.editReply({ content: '❌ لا أملك صلاحية حظر هذا العضو.' });
                    }

                    // DM للعضو قبل الحظر
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🔨  تم حظرك')
                        .setDescription(`تم حظرك من **${guild.name}**`)
                        .addFields(
                            { name: 'السبب',  value: data.reason },
                            { name: 'المشرف', value: `${data.requesterTag} (وافقت عليه الإدارة: ${user.tag})` }
                        )
                        .setColor(0x8b0000)
                        .setTimestamp();
                    await targetMember.send({ embeds: [dmEmbed] }).catch(() => {});

                    await targetMember.ban({
                        deleteMessageDays: data.days ?? 0,
                        reason: `${data.reason} | طُلب بواسطة: ${data.requesterTag} | وافق: ${user.tag}`,
                    });

                    await logAction(guild, {
                        type:      'ban',
                        moderator: user,
                        target:    targetMember,
                        reason:    `${data.reason} (طُلب بواسطة ${data.requesterTag})`,
                    }).catch(() => {});

                    const approveEmbed = new EmbedBuilder()
                        .setTitle('🔨  تم تنفيذ الحظر')
                        .addFields(
                            { name: '👤  العضو',        value: data.targetTag,    inline: true },
                            { name: '🛡️  طلب بواسطة',  value: data.requesterTag, inline: true },
                            { name: '✅  وافق عليه',    value: user.tag,          inline: true },
                            { name: '📝  السبب',        value: data.reason },
                            { name: '🗑️  حذف الرسائل', value: `${data.days ?? 0} يوم` },
                        )
                        .setColor(0x8b0000)
                        .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                        .setFooter({ text: 'FLUX • IO  |  نظام الإدارة' })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [approveEmbed] });
                    console.log(`[BAN] ✅ Approved: ${data.targetTag} | req: ${data.requesterTag} | approved: ${user.tag}`);

                } catch (err) {
                    console.error('[BAN APPROVE ERROR]', err.message);
                    await interaction.editReply({ content: `❌ فشل تنفيذ الحظر: \`${err.message}\`` });
                }
                return;
            }

            // ── إغلاق التذكرة ──────────────────────────────────────────────────
            if (customId.startsWith('close_ticket_')) {
                await interaction.deferReply();

                const channelId      = extractChannelId(customId, 2); 
                const channelToClose = guild.channels.cache.get(channelId);
                if (!channelToClose) return interaction.editReply({ content: '❌ القناة غير موجودة.' });

                const staffRole  = getStaffRole(guild);
                const isStaff    = staffRole && member.roles.cache.has(staffRole.id);
                const isAdminOrFounder = isAdmin(member); // ✅ Admin & Founder يقدرون يغلقون
                const data       = ticketData.get(channelId);
                const isOwner    = user.id === data?.ownerId;

                if (!isStaff && !isOwner && !isAdminOrFounder) {
                    return interaction.editReply({ content: '❌ فقط الفريق أو صاحب التذكرة أو الإدارة يقدر يغلقها.' });
                }

                if (data) {
                    data.closedBy    = user.id;
                    data.closedByTag = user.tag;
                }

                const ratingEmbed = new EmbedBuilder()
                    .setTitle('⭐  كيف كانت تجربتك؟')
                    .setDescription(
                        'شكراً لتواصلك معنا!\n\n' +
                        '**هل تم حل مشكلتك؟** اضغط أحد الزرين، ثم اختر تقييمك من النجوم 👇\n\n' +
                        `*(سيتم حذف القناة تلقائياً خلال **60 ثانية** أو فور التقييم)*`
                    )
                    .setColor(0xf1c40f);

                await interaction.editReply({
                    content:    data?.ownerId ? `<@${data.ownerId}>` : '',
                    embeds:     [ratingEmbed],
                    components: buildRatingComponents(channelId),
                });

                const timeoutId = setTimeout(async () => {
                    await finalizeTicket(guild, channelId, channelToClose);
                }, TICKET_CLOSE_TIMEOUT);

                if (data) data.timeoutId = timeoutId;
                return;
            }

            // ── تقييم: هل تم الحل؟ ───────────────────────────────────────────
            if (customId.startsWith('rating_solved_')) {
                await interaction.deferUpdate();

                const parts  = customId.split('_');
                const answer = parts[2];                       
                const chanId = parts.slice(3).join('_');       
                const data   = ticketData.get(chanId);

                if (!canRate(user, member, data, guild)) {
                    await interaction.followUp({ content: '❌ فقط صاحب التذكرة يقدر يقيّم.', flags: 64 }).catch(() => {}); // ✅
                    return;
                }

                if (data) data.solved = answer === 'yes';

                await interaction.followUp({
                    content:   answer === 'yes' ? '✅ ممتاز! الحين اختر تقييمك من النجوم 👇' : '❌ نأسف لذلك. الحين اختر تقييمك من النجوم 👇',
                    flags: 64, // ✅
                }).catch(() => {});
                return;
            }

            // ── تقييم: النجوم ─────────────────────────────────────────────────
            if (customId.startsWith('rating_stars_')) {
                await interaction.deferUpdate();

                const parts  = customId.split('_');
                const stars  = parseInt(parts[2], 10);
                const chanId = parts.slice(3).join('_');
                const data   = ticketData.get(chanId);

                if (!canRate(user, member, data, guild)) {
                    await interaction.followUp({ content: '❌ فقط صاحب التذكرة يقدر يقيّم.', flags: 64 }).catch(() => {}); // ✅
                    return;
                }

                if (data) data.stars = stars;

                await interaction.followUp({
                    content:   `${'⭐'.repeat(stars)} شكراً على تقييمك! جاري إغلاق التذكرة الآن...`,
                    flags: 64, // ✅
                }).catch(() => {});

                if (data?.closedBy) {
                    setTimeout(async () => {
                        await finalizeTicket(guild, chanId, interaction.channel);
                    }, 2000);
                }
                return;
            }
        }
    },
};