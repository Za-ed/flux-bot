// ─── codeRunner.js ────────────────────────────────────────────────────────────
// نظام تشغيل الكود — مرتبط بقناة code-run
// يدعم: JS, Python, C++, Java, Rust, Go, PHP, Ruby, C#, Swift, Kotlin, TypeScript, Bash

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

// ─── Config ───────────────────────────────────────────────────────────────────
const CODE_CHANNEL   = 'code-run';
const GROQ_KEY       = Buffer.from('Z3NrXzEyT0U4V2ZaQ2tkbnF1V0Nlc3l3V0dkeWIzRlljdUJ4d28zeFFqdGNDdlJqTkR6U3RpRW8=', 'base64').toString('utf8');
const MAX_OUTPUT_LEN = 1800;

const groq = new Groq({ apiKey: GROQ_KEY });

// ─── اللغات المدعومة ──────────────────────────────────────────────────────────
const LANGUAGES = {
  // اسم اللغة -> { aliases, emoji, version }
  javascript:  { aliases: ['js', 'javascript', 'node'],        emoji: '🟨', version: 'Node.js 20' },
  typescript:  { aliases: ['ts', 'typescript'],                 emoji: '🔷', version: 'TS 5.x'    },
  python:      { aliases: ['py', 'python', 'python3'],          emoji: '🐍', version: 'Python 3.12'},
  cpp:         { aliases: ['c++', 'cpp', 'cc'],                 emoji: '⚡', version: 'C++17'     },
  c:           { aliases: ['c'],                                 emoji: '🔵', version: 'C11'       },
  java:        { aliases: ['java'],                              emoji: '☕', version: 'Java 21'   },
  csharp:      { aliases: ['c#', 'csharp', 'cs'],               emoji: '💜', version: 'C# 12'     },
  rust:        { aliases: ['rs', 'rust'],                       emoji: '🦀', version: 'Rust 1.75' },
  go:          { aliases: ['go', 'golang'],                     emoji: '🐹', version: 'Go 1.22'   },
  php:         { aliases: ['php'],                               emoji: '🐘', version: 'PHP 8.3'   },
  ruby:        { aliases: ['rb', 'ruby'],                       emoji: '💎', version: 'Ruby 3.3'  },
  swift:       { aliases: ['swift'],                             emoji: '🍎', version: 'Swift 5.9' },
  kotlin:      { aliases: ['kt', 'kotlin'],                     emoji: '🟣', version: 'Kotlin 1.9'},
  bash:        { aliases: ['bash', 'sh', 'shell'],              emoji: '🖥️', version: 'Bash 5'    },
  sql:         { aliases: ['sql'],                               emoji: '🗄️', version: 'SQL'       },
  html:        { aliases: ['html'],                              emoji: '🌐', version: 'HTML5'     },
  css:         { aliases: ['css'],                               emoji: '🎨', version: 'CSS3'      },
  r:           { aliases: ['r'],                                 emoji: '📊', version: 'R 4.3'     },
  lua:         { aliases: ['lua'],                               emoji: '🌙', version: 'Lua 5.4'   },
  dart:        { aliases: ['dart'],                              emoji: '🎯', version: 'Dart 3.2'  },
};

// ─── تحديد اللغة من الـ code block ───────────────────────────────────────────
function detectLanguage(lang) {
  if (!lang) return null;
  const lower = lang.toLowerCase().trim();
  for (const [name, info] of Object.entries(LANGUAGES)) {
    if (info.aliases.includes(lower)) return { name, ...info };
  }
  return null;
}

// ─── استخراج الكود من الرسالة ────────────────────────────────────────────────
// يدعم: ```lang\ncode``` أو `code`
function extractCode(content) {
  // ```lang\ncode```
  const multiMatch = content.match(/^```(\w*)\n?([\s\S]*?)```$/m);
  if (multiMatch) {
    return {
      lang: multiMatch[1]?.trim() || null,
      code: multiMatch[2]?.trim() || '',
    };
  }
  // `code` (inline)
  const inlineMatch = content.match(/^`([^`]+)`$/);
  if (inlineMatch) {
    return { lang: null, code: inlineMatch[1].trim() };
  }
  return null;
}

// ─── Groq: تشغيل الكود ───────────────────────────────────────────────────────
async function runCodeWithGroq(code, langInfo) {
  const systemPrompt = `أنت محاكي بيئة تشغيل كود متخصص. مهمتك الوحيدة هي تشغيل الكود وإرجاع النتيجة.

قواعد صارمة:
1. شغّل الكود بدقة كاملة كأنك بيئة ${langInfo.name} (${langInfo.version})
2. أرجع فقط: output الكود (stdout) أو error message واضح
3. لو فيه خطأ: أرجع رسالة الخطأ بالضبط مع رقم السطر
4. لا تشرح، لا تعلّق، لا تضيف نص زيادة
5. لو الكود يطبع شيء — اطبعه بالضبط
6. لو ما في output — اكتب: (no output)
7. لو الكود يحسب شيء — أرجع النتيجة فقط
8. Runtime errors تُظهر كـ: ERROR: [رسالة الخطأ]
9. Compile errors تُظهر كـ: COMPILE ERROR: [رسالة الخطأ]
10. لا تكتب أي شيء قبل أو بعد الـ output`;

  const completion = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  800,
    temperature: 0.1, // دقة عالية
    messages: [
      { role: 'system',  content: systemPrompt },
      { role: 'user',    content: `شغّل هذا الكود (${langInfo.name}):\n\`\`\`${langInfo.name}\n${code}\n\`\`\`` },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? '(no output)';
}

// ─── بناء الـ Embed ───────────────────────────────────────────────────────────
function buildResultEmbed(author, langInfo, code, output, execTime) {
  const isError   = output.startsWith('ERROR:') || output.startsWith('COMPILE ERROR:');
  const color     = isError ? 0xff4444 : 0x2ecc71;
  const statusIcon = isError ? '❌' : '✅';

  // اقتطع الـ output لو طويل
  let displayOutput = output;
  let truncated     = false;
  if (output.length > MAX_OUTPUT_LEN) {
    displayOutput = output.slice(0, MAX_OUTPUT_LEN);
    truncated     = true;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${langInfo.emoji}  ${statusIcon}  ${langInfo.name.charAt(0).toUpperCase() + langInfo.name.slice(1)} — ${langInfo.version}`)
    .setColor(color)
    .addFields(
      {
        name:  '📥  الكود',
        value: `\`\`\`${langInfo.name}\n${code.length > 500 ? code.slice(0, 500) + '\n...' : code}\n\`\`\``,
      },
      {
        name:  `📤  ${isError ? 'الخطأ' : 'النتيجة'}`,
        value: `\`\`\`\n${displayOutput || '(no output)'}\n\`\`\`${truncated ? '\n_(تم اقتطاع الـ output — أرسل كملف)_' : ''}`,
      },
    )
    .setFooter({
      text:    `FLUX • IO  |  ${author.tag}  •  ⏱️ ${execTime}ms`,
      iconURL: author.displayAvatarURL({ dynamic: true }),
    })
    .setTimestamp();

  return { embed, isError, fullOutput: output };
}

// ─── Handler الرئيسي ─────────────────────────────────────────────────────────
async function handleCodeRun(message) {
  const { author, channel, content } = message;
  if (author.bot) return;
  if (!channel.name.toLowerCase().includes('code-run')) return;

  // ── تحقق من وجود كود ──────────────────────────────────────────────────
  const extracted = extractCode(content.trim());
  if (!extracted) {
    // لو ما في code block — أرسل تعليمات
    if (content.trim().startsWith('!run') || content.trim().startsWith('/run')) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('⌨️  كيف تستخدم code-run؟')
            .setDescription(
              'أرسل كودك بهذا الشكل:\n\n' +
              '\\`\\`\\`python\n' +
              'print("Hello World")\n' +
              '\\`\\`\\`\n\n' +
              '**اللغات المدعومة:**\n' +
              Object.entries(LANGUAGES)
                .map(([n, i]) => `${i.emoji} \`${n}\``)
                .join('  ')
            )
            .setColor(0x1e90ff)
            .setFooter({ text: 'FLUX • IO  |  Online Compiler' })
        ],
      });
    }
    return;
  }

  const { lang, code } = extracted;
  if (!code || code.length < 2) return;

  // ── تحديد اللغة ───────────────────────────────────────────────────────
  const langInfo = detectLanguage(lang);
  if (!langInfo) {
    if (lang) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('❓  لغة غير معروفة')
            .setDescription(
              `\`${lang}\` غير مدعومة حالياً.\n\n**اللغات المدعومة:**\n` +
              Object.entries(LANGUAGES).map(([n, i]) => `${i.emoji} \`${n}\``).join('  ')
            )
            .setColor(0xffa500),
        ],
      });
    }
    return;
  }

  // ── رسالة "جاري التشغيل" ──────────────────────────────────────────────
  const thinkingMsg = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`${langInfo.emoji}  جاري تشغيل الكود بـ **${langInfo.name}**... ⚙️`)
        .setColor(0xffa500),
    ],
  });

  const startTime = Date.now();

  try {
    const output  = await runCodeWithGroq(code, langInfo);
    const execTime = Date.now() - startTime;

    const { embed, isError, fullOutput } = buildResultEmbed(author, langInfo, code, output, execTime);

    // لو الـ output طويل — أرسله كملف
    const files = [];
    if (fullOutput.length > MAX_OUTPUT_LEN) {
      const buf  = Buffer.from(fullOutput, 'utf8');
      files.push(new AttachmentBuilder(buf, { name: 'output.txt' }));
    }

    await thinkingMsg.edit({ embeds: [embed], files });

    // تفاعل تلقائي
    await message.react(isError ? '❌' : '✅').catch(() => {});

    console.log(`[CODE-RUN] ${author.tag} | ${langInfo.name} | ${execTime}ms | ${isError ? 'ERROR' : 'OK'}`);

  } catch (err) {
    console.error('[CODE-RUN] Groq error:', err.message);
    await thinkingMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️  خطأ في التشغيل')
          .setDescription(`حدث خطأ أثناء معالجة الكود:\n\`\`\`\n${err.message}\n\`\`\``)
          .setColor(0xff4444),
      ],
    });
  }
}

module.exports = { handleCodeRun };