const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('نشر قواعد السيرفر الرسمية مع نسخة إنجليزية داخل ثريد.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // ═══════════════════════════════════════════════
    // النسخة العربية — الرسالة الرئيسية
    // ═══════════════════════════════════════════════
    const arabicEmbed = new EmbedBuilder()
      .setTitle('📋  FLUX • IO — قواعد السيرفر')
      .setColor(0x1e90ff)
      .setDescription(
        'مرحباً بك في **FLUX • IO** — مجتمع صُنع بواسطة المطورين، للمطورين.\n' +
        'للحفاظ على هذه البيئة منتجة واحترافية وآمنة، يجب على جميع الأعضاء الالتزام بالقواعد التالية.\n' +
        'المخالفات ستؤدي إلى تحذيرات أو كتم أو حظر دائم وفق تقدير الإدارة.\n\u200b'
      )
      .addFields(
        {
          name: '§١ — 🚫 ممنوع السبام',
          value:
            'لا تقم بإغراق أي قناة برسائل متكررة أو منشنات مفرطة أو نصوص مكررة. ' +
            'يشمل ذلك سبام الريأكشنز أو التنقل المتكرر في قنوات الصوت. ' +
            'السبام اليدوي أو الآلي سيؤدي إلى كتم فوري.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٢ — 🔞 ممنوع المحتوى الإباحي',
          value:
            'هذا مجتمع مطورين احترافي. **ممنوع** منعاً باتاً نشر أي محتوى إباحي أو صريح أو مسيء ' +
            'في أي مكان بالسيرفر — بما في ذلك أسماء المستخدمين والصور الشخصية.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٣ — 🤝 الاحترام المتبادل',
          value:
            'تعامل مع كل عضو باحترافية واحترام بغض النظر عن مستواه أو خلفيته أو رأيه. ' +
            'التحرش والخطاب المسيء والتمييز والإهانات الشخصية **محظورة تماماً**. ' +
            'النقاش الصحي مرحب به، أما السلوك السام فلا.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٤ — 📬 ممنوع مراسلة الإدارة مباشرة',
          value:
            'لا تراسل أعضاء الإدارة على الخاص للدعم أو الاستفسار. ' +
            'استخدم نظام التذاكر أو القنوات المخصصة. ' +
            'الرسائل غير المرغوب فيها لن تُجاب.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٥ — 🔗 ممنوع الروابط غير المصرّح بها',
          value:
            'مشاركة الروابط مقتصرة على **الإدارة فقط** ما لم يُسمح بذلك صراحةً في قناة معينة. ' +
            'الروابط غير المصرّح بها ستُحذف تلقائياً.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٦ — 📌 التزم بموضوع القناة',
          value:
            'استخدم كل قناة لغرضها المحدد. ' +
            'المحادثات خارج الموضوع تنتمي للقنوات العامة.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§٧ — ⚖️ قرار الإدارة نهائي',
          value:
            'قرارات الإدارة نهائية. إن اعتقدت أن قراراً جاء بالخطأ، افتح تذكرة بهدوء واحترافية. ' +
            'الجدال العلني أو محاولة التحايل على الإشراف سيؤدي إلى تصعيد العقوبة.',
        }
      )
      .setImage('https://i.imgur.com/YourBannerImageHere.png')
      .setFooter({
        text: 'FLUX • IO  |  آخر تحديث بواسطة الإدارة • للنسخة الإنجليزية افتح الثريد بالأسفل 👇',
      })
      .setTimestamp();

    // ═══════════════════════════════════════════════
    // إرسال الرسالة العربية
    // ═══════════════════════════════════════════════
    const rulesMessage = await interaction.channel.send({ embeds: [arabicEmbed] });

    // ═══════════════════════════════════════════════
    // إنشاء الثريد داخل الرسالة
    // ═══════════════════════════════════════════════
    const thread = await rulesMessage.startThread({
      name: '🇬🇧 English Version — Server Rules',
      autoArchiveDuration: 10080, // أسبوع
      reason: 'English version of server rules',
    });

    // ═══════════════════════════════════════════════
    // النسخة الإنجليزية — داخل الثريد
    // ═══════════════════════════════════════════════
    const englishEmbed = new EmbedBuilder()
      .setTitle('📋  FLUX • IO — Server Rules')
      .setColor(0x1e90ff)
      .setDescription(
        'Welcome to **FLUX • IO** — a community built by developers, for developers.\n' +
        'To keep this space productive, professional, and safe, all members must abide by the following rules.\n' +
        'Violations will result in warnings, mutes, or permanent bans at staff discretion.\n\u200b'
      )
      .addFields(
        {
          name: '§1 — 🚫 Anti-Spam',
          value:
            'Do **not** flood any channel with repeated messages, excessive pings, or copy-pasted walls of text. ' +
            'This includes spamming reactions or voice channel switching. ' +
            'Automated or manual spam will result in an immediate timeout.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§2 — 🔞 No NSFW Content',
          value:
            'This is a professional developer community. **No** NSFW, explicit, or suggestive content ' +
            'is permitted anywhere — including usernames and profile pictures.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§3 — 🤝 Mutual Respect',
          value:
            'Treat every member with professionalism and respect regardless of skill level or background. ' +
            'Harassment, hate speech, discrimination, and personal attacks are **strictly prohibited**. ' +
            'Healthy debate is welcome; toxic behavior is not.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§4 — 📬 No Unsolicited DMs to Staff',
          value:
            'Do **not** DM staff members directly. Use the ticket system instead. ' +
            'Unsolicited DMs will not receive a response.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§5 — 🔗 No Unauthorized Links',
          value:
            'Sharing links is **restricted to Staff** unless explicitly permitted in a specific channel. ' +
            'Unauthorized links will be auto-deleted.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§6 — 📌 Stay On Topic',
          value:
            'Use channels for their intended purpose. ' +
            'Off-topic conversations belong in designated casual channels.',
        },
        { name: '\u200b', value: '\u200b' },
        {
          name: '§7 — ⚖️ Staff Authority is Final',
          value:
            'Staff decisions are final. If you believe a decision was made in error, open a ticket calmly. ' +
            'Arguing publicly or attempting to circumvent moderation will result in escalated action.',
        }
      )
      .setImage('https://i.imgur.com/YourBannerImageHere.png')
      .setFooter({
        text: 'FLUX • IO  |  Last updated by Server Administration',
      })
      .setTimestamp();

    await thread.send({ embeds: [englishEmbed] });

    await interaction.editReply({ content: '✅ تم نشر القواعد مع الثريد الإنجليزي بنجاح.' });
    console.log(`[RULES] Posted in #${interaction.channel.name} with English thread.`);
  },
};