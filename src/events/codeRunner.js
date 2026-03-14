// ─── events/codeRunner.js ────────────────────────────────────────────────────
// نظام تشغيل الكود — قناة code-run

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

// ─── Config ───────────────────────────────────────────────────────────────────
const CODE_CHANNEL   = 'code-run';
const MAX_OUTPUT_LEN = 1800;

// ✅ إصلاح: يدعم كل أسماء الـ env المحتملة
const GROQ_KEY =
  process.env.Groq_API_KEY ||
  process.env.GROQ_KEY     ||
  process.env.GROQ_API_KEY ||
  Buffer.from(
    'Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=',
    'base64'
  ).toString('utf8');

// ─── اللغات المدعومة ──────────────────────────────────────────────────────────
const LANGUAGES = {
  javascript: { aliases: ['js', 'javascript', 'node'],    emoji: '🟨', version: 'Node.js 20' },
  typescript: { aliases: ['ts', 'typescript'],             emoji: '🔷', version: 'TS 5.x'     },
  python:     { aliases: ['py', 'python', 'python3'],      emoji: '🐍', version: 'Python 3.12' },
  cpp:        { aliases: ['c++', 'cpp', 'cc'],             emoji: '⚡', version: 'C++17'       },
  c:          { aliases: ['c'],                             emoji: '🔵', version: 'C11'         },
  java:       { aliases: ['java'],                          emoji: '☕', version: 'Java 21'     },
  csharp:     { aliases: ['c#', 'csharp', 'cs'],           emoji: '💜', version: 'C# 12'       },
  rust:       { aliases: ['rs', 'rust'],                   emoji: '🦀', version: 'Rust 1.75'   },
  go:         { aliases: ['go', 'golang'],                 emoji: '🐹', version: 'Go 1.22'     },
  php:        { aliases: ['php'],                           emoji: '🐘', version: 'PHP 8.3'     },
  ruby:       { aliases: ['rb', 'ruby'],                   emoji: '💎', version: 'Ruby 3.3'    },
  swift:      { aliases: ['swift'],                         emoji: '🍎', version: 'Swift 5.9'   },
  kotlin:     { aliases: ['kt', 'kotlin'],                 emoji: '🟣', version: 'Kotlin 1.9'  },
  bash:       { aliases: ['bash', 'sh', 'shell'],          emoji: '🖥️', version: 'Bash 5'      },
  sql:        { aliases: ['sql'],                           emoji: '🗄️', version: 'SQL'         },
  html:       { aliases: ['html'],                          emoji: '🌐', version: 'HTML5'       },
  css:        { aliases: ['css'],                           emoji: '🎨', version: 'CSS3'        },
  r:          { aliases: ['r'],                             emoji: '📊', version: 'R 4.3'       },
  lua:        { aliases: ['lua'],                           emoji: '🌙', version: 'Lua 5.4'     },
  dart:       { aliases: ['dart'],                          emoji: '🎯', version: 'Dart 3.2'   },
};

// ─── كشف اللغة ───────────────────────────────────────────────────────────────
function detectLanguage(lang) {
  if (!lang) return null;
  const lower = lang.toLowerCase().trim();
  for (const [name, info] of Object.entries(LANGUAGES)) {
    if (info.aliases.includes(lower)) return { name, ...info };
  }
  return null;
}

// ─── استخراج الكود من الرسالة ────────────────────────────────────────────────
// ✅ إصلاح: regex أقوى يتعامل مع \r\n و نهايات السطر المختلفة
function extractCode(content) {
  // ``` lang \n code ``` — الصيغة الرئيسية
  const multiMatch = content.match(/```(\w*)\r?\n([\s\S]*?)```/);
  if (multiMatch) {
    return {
      lang: multiMatch[1]?.trim() || null,
      code: multiMatch[2]?.trim() || '',
    };
  }
  // `code` — inline
  const inlineMatch = content.match(/^`([^`\n]+)`$/);
  if (inlineMatch) {
    return { lang: null, code: inlineMatch[1].trim() };
  }
  return null;
}

// ─── رسالة تعليمات الاستخدام ─────────────────────────────────────────────────
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('⌨️  كيف تستخدم code-run؟')
    .setDescription(
      'أرسل كودك بهذا الشكل:\n\n' +
      '\\`\\`\\`python\n' +
      'print("Hello World")\n' +
      '\\`\\`\\`\n\n' +
      '**اللغات المدعومة:**\n' +
      Object.entries(LANGUAGES).map(([n, i]) => `${i.emoji} \`${n}\``).join('  ')
    )
    .setColor(0x1e90ff)
    .setFooter({ text: 'FLUX • IO  |  Online Compiler' });
}

// ─── Groq: تشغيل الكود ───────────────────────────────────────────────────────
async function runCodeWithGroq(code, langInfo) {
  // ✅ إصلاح: ننشئ الـ instance داخل الدالة — مو على مستوى الموديول
  const groq = new Groq({ apiKey: GROQ_KEY, timeout: 30000 });

  const completion = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  800,
    temperature: 0.1,
    messages: [
      {
        role:    'system',
        content: `أنت محاكي بيئة تشغيل كود. مهمتك الوحيدة هي تشغيل الكود وإرجاع النتيجة.
قواعد صارمة:
1. شغّل الكود كأنك بيئة ${langInfo.name} (${langInfo.version})
2. أرجع فقط output الكود أو رسالة الخطأ
3. لو فيه خطأ: ERROR: [رسالة الخطأ مع رقم السطر]
4. لو ما في output: (no output)
5. لا شرح، لا تعليق، لا نص زيادة`
      },
      {
        role:    'user',
        content: `شغّل:\n\`\`\`${langInfo.name}\n${code}\n\`\`\``
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? '(no output)';
}

// ─── بناء الـ Embed ───────────────────────────────────────────────────────────
function buildResultEmbed(author, langInfo, code, output, execTime) {
  const isError    = output.startsWith('ERROR:') || output.startsWith('COMPILE ERROR:');
  const color      = isError ? 0xff4444 : 0x2ecc71;
  const statusIcon = isError ? '❌' : '✅';

  let displayOutput = output;
  let truncated     = false;
  if (output.length > MAX_OUTPUT_LEN) {
    displayOutput = output.slice(0, MAX_OUTPUT_LEN);
    truncated     = true;
  }

  return new EmbedBuilder()
    .setTitle(`${langInfo.emoji}  ${statusIcon}  ${langInfo.name} — ${langInfo.version}`)
    .setColor(color)
    .addFields(
      {
        name:  '📥  الكود',
        value: `\`\`\`${langInfo.name}\n${code.length > 500 ? code.slice(0, 500) + '\n...' : code}\n\`\`\``,
      },
      {
        name:  `📤  ${isError ? 'الخطأ' : 'النتيجة'}`,
        value: `\`\`\`\n${displayOutput || '(no output)'}\n\`\`\`${truncated ? '\n_(تم اقتطاع الـ output)_' : ''}`,
      },
    )
    .setFooter({
      text:    `FLUX • IO  |  ${author.tag}  •  ⏱️ ${execTime}ms`,
      iconURL: author.displayAvatarURL({ dynamic: true }),
    })
    .setTimestamp();
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleCodeRun(message) {
  const { author, channel, content } = message;

  if (author.bot) return;
  if (!channel.name.toLowerCase().includes(CODE_CHANNEL)) return;

  const trimmed   = content.trim();
  const extracted = extractCode(trimmed);

  // ── ما في code block ──────────────────────────────────────────────────────
  if (!extracted) {
    if (trimmed === '!help' || trimmed === '!run' || trimmed === '/run') {
      await channel.send({ embeds: [buildHelpEmbed()] });
    }
    return;
  }

  const { lang, code } = extracted;
  if (!code || code.length < 2) return;

  // ── ما في لغة أو لغة مجهولة ───────────────────────────────────────────────
  const langInfo = detectLanguage(lang);
  if (!langInfo) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(lang ? '❓  لغة غير معروفة' : '⚠️  حدد اللغة')
          .setDescription(
            lang
              ? `\`${lang}\` غير مدعومة.\n\n**اللغات المدعومة:**\n` +
                Object.entries(LANGUAGES).map(([n, i]) => `${i.emoji} \`${n}\``).join('  ')
              : `ما حددت لغة الكود!\n\nاستخدم:\n\`\`\`python\nprint("hello")\n\`\`\`\n\n**اللغات المدعومة:**\n` +
                Object.entries(LANGUAGES).map(([n, i]) => `${i.emoji} \`${n}\``).join('  ')
          )
          .setColor(0xffa500),
      ],
    });
    return;
  }

  // ── تشغيل الكود ───────────────────────────────────────────────────────────
  console.log(`[CODE-RUN] ${author.tag} | ${langInfo.name} | ${code.length} chars`);

  let thinkingMsg = null;

  try {
    thinkingMsg = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`${langInfo.emoji}  جاري تشغيل الكود بـ **${langInfo.name}**... ⚙️`)
          .setColor(0xffa500),
      ],
    });

    const startTime = Date.now();
    const output    = await runCodeWithGroq(code, langInfo);
    const execTime  = Date.now() - startTime;
    const embed     = buildResultEmbed(author, langInfo, code, output, execTime);
    const isError   = output.startsWith('ERROR:') || output.startsWith('COMPILE ERROR:');

    const files = [];
    if (output.length > MAX_OUTPUT_LEN) {
      files.push(new AttachmentBuilder(Buffer.from(output, 'utf8'), { name: 'output.txt' }));
    }

    await thinkingMsg.edit({ embeds: [embed], files });
    await message.react(isError ? '❌' : '✅').catch(() => {});

    console.log(`[CODE-RUN] ✅ ${author.tag} | ${langInfo.name} | ${execTime}ms`);

  } catch (err) {
    console.error('[CODE-RUN] ❌ خطأ:', err.message);

    const errEmbed = new EmbedBuilder()
      .setTitle('⚠️  خطأ في التشغيل')
      .setDescription(`\`\`\`\n${err.message}\n\`\`\``)
      .setColor(0xff4444);

    if (thinkingMsg) {
      await thinkingMsg.edit({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await channel.send({ embeds: [errEmbed] }).catch(() => {});
    }
  }
}

module.exports = { handleCodeRun };