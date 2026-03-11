// ─── gamingCorner.js ─────────────────────────────────────────────────────────
// كل ألعاب gaming-corner في ملف واحد
// الألعاب: تريفيا، سلسلة كلمات، رياضيات سريعة، قنبلة أرقام، خمّن الشخصية

const { EmbedBuilder } = require('discord.js');
const { updateProgress } = require('./dailyTasks');
const { checkStatBadges } = require('../utils/badges');

// ─── Config ───────────────────────────────────────────────────────────────────
const GAMING_CHANNEL = 'gaming-corner';
const ANSWER_TIMEOUT = 20000; // 20 ثانية للإجابة

// XP per win
const XP_REWARDS = {
  trivia:     60,
  math:       40,
  wordchain:  30,
  bomb:       50,
  hangman:    70,
  scramble:   55,
};

// ─── Active Games Store ───────────────────────────────────────────────────────
const activeGames = new Map(); // channelId -> { type, answer, timeout, ... }

// ─── Trivia Questions ─────────────────────────────────────────────────────────
const TRIVIA_QUESTIONS = [
  { q: 'ما هي لغة البرمجة المستخدمة في هذا البوت؟',         a: ['javascript', 'js'],      xp: 60 },
  { q: 'ما هو اختصار HTML؟',                                  a: ['hyper text markup language'], xp: 50 },
  { q: 'من مؤسس شركة Microsoft؟',                             a: ['bill gates'],            xp: 60 },
  { q: 'ما هو أسرع نوع من أنواع الذاكرة في الحاسوب؟',       a: ['cache', 'كاش'],          xp: 80 },
  { q: 'ما هو البروتوكول المستخدم لنقل صفحات الويب؟',        a: ['http', 'https'],         xp: 50 },
  { q: 'كم بت في بايت واحد؟',                                 a: ['8'],                     xp: 40 },
  { q: 'ما هي لغة الاستعلام الخاصة بقواعد البيانات؟',        a: ['sql'],                   xp: 60 },
  { q: 'من أسس شركة Apple؟',                                  a: ['steve jobs', 'ستيف جوبز'], xp: 50 },
  { q: 'ما هو الرمز المستخدم للتعليق في Python؟',            a: ['#'],                     xp: 40 },
  { q: 'ما اسم نظام التحكم في الإصدارات الأكثر استخداماً؟',  a: ['git'],                   xp: 50 },
  { q: 'ما هو عدد كواكب المجموعة الشمسية؟',                   a: ['8', 'ثمانية'],           xp: 40 },
  { q: 'ما هي عاصمة اليابان؟',                                a: ['tokyo', 'طوكيو'],        xp: 40 },
  { q: 'ما هو أكبر كوكب في المجموعة الشمسية؟',               a: ['jupiter', 'المشتري'],    xp: 50 },
  { q: 'من كتب رواية هاري بوتر؟',                             a: ['j.k. rowling', 'rowling', 'رولينج'], xp: 50 },
  { q: 'ما هي أسرع حيوان بري في العالم؟',                    a: ['cheetah', 'فهد'],        xp: 50 },
  { q: 'كم سنة في القرن؟',                                    a: ['100', 'مئة'],            xp: 30 },
  { q: 'ما هو الرمز الكيميائي للذهب؟',                       a: ['au'],                    xp: 60 },
  { q: 'ما هو الرمز الكيميائي للماء؟',                       a: ['h2o'],                   xp: 30 },
  { q: 'من رسم لوحة الموناليزا؟',                             a: ['leonardo da vinci', 'ليوناردو'], xp: 50 },
  { q: 'ما هو أطول نهر في العالم؟',                           a: ['nile', 'النيل'],         xp: 50 },
];

// ─── Math Generator ───────────────────────────────────────────────────────────
function generateMath(difficulty = 'medium') {
  let a, b, op, answer;
  if (difficulty === 'easy') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    op = ['+', '-'][Math.floor(Math.random() * 2)];
  } else if (difficulty === 'medium') {
    a = Math.floor(Math.random() * 50) + 10;
    b = Math.floor(Math.random() * 20) + 1;
    op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
  } else {
    a = Math.floor(Math.random() * 100) + 20;
    b = Math.floor(Math.random() * 30) + 5;
    op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
  }
  switch (op) {
    case '+': answer = a + b; break;
    case '-': answer = a - b; break;
    case '*': answer = a * b; break;
  }
  return { question: `${a} ${op} ${b} = ?`, answer: answer.toString() };
}

// ─── Scramble Words ───────────────────────────────────────────────────────────
const SCRAMBLE_WORDS = [
  { word: 'javascript', hint: 'لغة برمجة' },
  { word: 'discord',    hint: 'منصة تواصل' },
  { word: 'python',     hint: 'لغة برمجة' },
  { word: 'database',   hint: 'تخزين البيانات' },
  { word: 'server',     hint: 'جهاز أو سيرفر' },
  { word: 'keyboard',   hint: 'أداة إدخال' },
  { word: 'internet',   hint: 'شبكة عالمية' },
  { word: 'algorithm',  hint: 'خطوات حل مشكلة' },
  { word: 'variable',   hint: 'مفهوم برمجي' },
  { word: 'function',   hint: 'مفهوم برمجي' },
];

function scrambleWord(word) {
  return word.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── Number Bomb ──────────────────────────────────────────────────────────────
function generateBomb() {
  const target  = Math.floor(Math.random() * 50) + 20;
  const bomb    = Math.floor(Math.random() * (target - 5)) + 5;
  return { target, bomb, current: 0, players: [] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isGamingChannel(channel) {
  return channel.name.toLowerCase().includes('gaming');
}

function clearGame(channelId) {
  const game = activeGames.get(channelId);
  if (game?.timeout) clearTimeout(game.timeout);
  activeGames.delete(channelId);
}

// ─── XP Helper (يستدعي leveling) ─────────────────────────────────────────────
async function giveXP(message, amount, gameType) {
  try {
    const leveling = require('./leveling');
    const guildId  = message.guild.id;
    const userId   = message.author.id;
    const userData = leveling.getUserData(guildId, userId);
    const oldLevel = leveling.getLevelFromXp(userData.xp);

    userData.xp += amount;
    leveling.loadXP(); // reload reference
    const xpStore = leveling.loadXP();
    if (!xpStore[guildId]) xpStore[guildId] = {};
    xpStore[guildId][userId] = userData;
    const fs   = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'xp.json'), JSON.stringify(xpStore, null, 2));

    const newLevel = leveling.getLevelFromXp(userData.xp);

    // تحقق شارات
    const newBadges = checkStatBadges(guildId, userId, 'games', 1);

    // daily tasks
    const dailyXp = updateProgress(guildId, userId, 'games');
    if (gameType === 'trivia') updateProgress(guildId, userId, 'trivia');

    if (newLevel > oldLevel) {
      await message.channel.send(`🎉 ${message.author} وصل للمستوى **${newLevel}**!`).catch(() => {});
    }

    if (newBadges.length > 0) {
      const badgeText = newBadges.map((b) => `${b.emoji} **${b.name}**`).join(', ');
      await message.channel.send(`🏅 ${message.author} كسب شارة جديدة: ${badgeText}`).catch(() => {});
    }

    if (dailyXp > 0) {
      await message.channel.send(`📅 ${message.author} أكمل مهمة يومية! +${dailyXp} XP إضافي 🎊`).catch(() => {});
    }
  } catch (err) {
    console.error('[GAMING] giveXP error:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME STARTERS
// ═════════════════════════════════════════════════════════════════════════════

// ─── 1. تريفيا ────────────────────────────────────────────────────────────────
async function startTrivia(channel) {
  if (activeGames.has(channel.id)) {
    return channel.send('❗ في لعبة شغّالة الحين، انتهوا منها أول!');
  }

  const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];

  const embed = new EmbedBuilder()
    .setTitle('🧠  تريفيا!')
    .setDescription(`**${q.q}**\n\n⏱️ عندك **20 ثانية** للإجابة`)
    .setColor(0x9b59b6)
    .setFooter({ text: 'FLUX • IO  |  gaming-corner' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  const timeout = setTimeout(async () => {
    if (!activeGames.has(channel.id)) return;
    clearGame(channel.id);
    await channel.send(`⏰ انتهى الوقت! الإجابة الصحيحة كانت: **${q.a[0]}**`);
  }, ANSWER_TIMEOUT);

  activeGames.set(channel.id, { type: 'trivia', answers: q.a, xp: q.xp, timeout });
}

// ─── 2. رياضيات سريعة ────────────────────────────────────────────────────────
async function startMath(channel, difficulty = 'medium') {
  if (activeGames.has(channel.id)) {
    return channel.send('❗ في لعبة شغّالة الحين!');
  }

  const { question, answer } = generateMath(difficulty);
  const xp = difficulty === 'easy' ? 30 : difficulty === 'medium' ? 40 : 60;

  const embed = new EmbedBuilder()
    .setTitle('⚡  رياضيات سريعة!')
    .setDescription(`**${question}**\n\n⏱️ **15 ثانية** — أول واحد يجاوب يكسب`)
    .setColor(0xe74c3c)
    .setFooter({ text: `الصعوبة: ${difficulty}  |  FLUX • IO` });

  await channel.send({ embeds: [embed] });

  const timeout = setTimeout(async () => {
    if (!activeGames.has(channel.id)) return;
    clearGame(channel.id);
    await channel.send(`⏰ انتهى الوقت! الإجابة: **${answer}**`);
  }, 15000);

  activeGames.set(channel.id, { type: 'math', answer, xp, timeout });
}

// ─── 3. خمّن الكلمة المشوّشة ──────────────────────────────────────────────────
async function startScramble(channel) {
  if (activeGames.has(channel.id)) {
    return channel.send('❗ في لعبة شغّالة الحين!');
  }

  const item      = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
  const scrambled = scrambleWord(item.word);

  const embed = new EmbedBuilder()
    .setTitle('🔀  خمّن الكلمة!')
    .setDescription(`رتّب هذه الحروف لتكوين كلمة:\n\n# \`${scrambled.toUpperCase()}\`\n\n💡 تلميح: ${item.hint}`)
    .setColor(0xf39c12)
    .setFooter({ text: '⏱️ 25 ثانية  |  FLUX • IO' });

  await channel.send({ embeds: [embed] });

  const timeout = setTimeout(async () => {
    if (!activeGames.has(channel.id)) return;
    clearGame(channel.id);
    await channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${item.word}**`);
  }, 25000);

  activeGames.set(channel.id, { type: 'scramble', answer: item.word, xp: XP_REWARDS.scramble, timeout });
}

// ─── 4. لعبة الأرقام (قنبلة) ─────────────────────────────────────────────────
async function startBomb(channel) {
  if (activeGames.has(channel.id)) {
    return channel.send('❗ في لعبة شغّالة الحين!');
  }

  const bomb = generateBomb();

  const embed = new EmbedBuilder()
    .setTitle('💣  لعبة القنبلة!')
    .setDescription(
      `عد من **1** للأعلى بالتناوب مع الأعضاء!\n` +
      `🎯 الهدف: **${bomb.target}**\n` +
      `💥 الرقم الملغوم: **مخفي!**\n\n` +
      `ابدأ بكتابة **1** الحين!`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: 'من يكتب الرقم الملغوم يخسر!  |  FLUX • IO' });

  await channel.send({ embeds: [embed] });

  activeGames.set(channel.id, {
    type:    'bomb',
    target:  bomb.target,
    bomb:    bomb.bomb,
    current: 0,
    last:    null, // آخر يوزر كتب
    xp:      XP_REWARDS.bomb,
    timeout: null,
  });
}

// ─── 5. خمّن الشخصية ─────────────────────────────────────────────────────────
const CHARACTERS = [
  { clues: ['شخصية كرتونية', 'تعيش تحت الماء', 'تصنع البرغر'], answer: 'spongebob', arAnswer: 'سبونج بوب' },
  { clues: ['بطل خارق', 'يرتدي بزة حمراء وزرقاء', 'يقفز بين المباني'], answer: 'spiderman', arAnswer: 'سبايدرمان' },
  { clues: ['ساحر', 'مدرسة للسحر', 'ندبة على جبهته'], answer: 'harry potter', arAnswer: 'هاري بوتر' },
  { clues: ['لعبة فيديو', 'يلبس أحمر', 'يجمع الفطر'], answer: 'mario', arAnswer: 'ماريو' },
  { clues: ['محقق', 'لندن', 'يلعب الكمان'], answer: 'sherlock holmes', arAnswer: 'شيرلوك هولمز' },
];

async function startGuessChar(channel) {
  if (activeGames.has(channel.id)) {
    return channel.send('❗ في لعبة شغّالة الحين!');
  }

  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  let clueIndex = 0;

  const embed = new EmbedBuilder()
    .setTitle('🎭  خمّن الشخصية!')
    .setDescription(`**التلميح ${clueIndex + 1}:** ${char.clues[clueIndex]}\n\n⏱️ 30 ثانية لكل تلميح`)
    .setColor(0x1abc9c)
    .setFooter({ text: 'FLUX • IO  |  gaming-corner' });

  const msg = await channel.send({ embeds: [embed] });

  const giveNextClue = async () => {
    clueIndex++;
    if (clueIndex >= char.clues.length) {
      clearGame(channel.id);
      await channel.send(`❌ ما أحد عرف! الشخصية كانت **${char.arAnswer}** (${char.answer})`);
      return;
    }
    const newEmbed = EmbedBuilder.from(msg.embeds[0])
      .setDescription(
        char.clues.slice(0, clueIndex + 1).map((c, i) => `**التلميح ${i + 1}:** ${c}`).join('\n') +
        '\n\n⏱️ 30 ثانية'
      );
    await msg.edit({ embeds: [newEmbed] }).catch(() => {});
    const timeout = setTimeout(giveNextClue, 30000);
    const game = activeGames.get(channel.id);
    if (game) { clearTimeout(game.timeout); game.timeout = timeout; }
  };

  const timeout = setTimeout(giveNextClue, 30000);
  activeGames.set(channel.id, {
    type:    'character',
    answers: [char.answer, char.arAnswer],
    xp:      80,
    timeout,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER — يتحقق من إجابات الألعاب
// ═════════════════════════════════════════════════════════════════════════════
async function handleGamingMessage(message) {
  const { author, channel, content } = message;
  if (author.bot) return;
  if (!isGamingChannel(channel)) return;

  const game = activeGames.get(channel.id);
  if (!game) return;

  const input = content.trim().toLowerCase();

  // ── تريفيا ────────────────────────────────────────────────────────────────
  if (game.type === 'trivia') {
    if (game.answers.map((a) => a.toLowerCase()).includes(input)) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'trivia');
      const embed = new EmbedBuilder()
        .setTitle('✅  إجابة صحيحة!')
        .setDescription(`${author} أجاب صح! الإجابة: **${game.answers[0]}**\n\n+**${game.xp} XP** 🎉`)
        .setColor(0x2ecc71).setTimestamp();
      await channel.send({ embeds: [embed] });
    }
    return;
  }

  // ── رياضيات ───────────────────────────────────────────────────────────────
  if (game.type === 'math') {
    if (input === game.answer) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'math');
      await channel.send(`✅ **${author}** أجاب صح! الإجابة: **${game.answer}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  // ── scramble ──────────────────────────────────────────────────────────────
  if (game.type === 'scramble') {
    if (input === game.answer.toLowerCase()) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'scramble');
      await channel.send(`✅ **${author}** عرّف الكلمة! هي **${game.answer}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  // ── خمّن الشخصية ──────────────────────────────────────────────────────────
  if (game.type === 'character') {
    if (game.answers.map((a) => a.toLowerCase()).includes(input)) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'character');
      await channel.send(`✅ **${author}** عرّف الشخصية! هي **${game.answers[1]}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  // ── قنبلة الأرقام ─────────────────────────────────────────────────────────
  if (game.type === 'bomb') {
    const num = parseInt(input);
    if (isNaN(num)) return;

    // نفس الشخص ما يكتب مرتين
    if (game.last === author.id) {
      await message.react('❌').catch(() => {});
      return;
    }

    if (num === game.current + 1) {
      game.current++;
      game.last = author.id;

      if (num === game.bomb) {
        // 💥 BOOM
        clearGame(channel.id);
        await channel.send(`💥 **${author}** كتب الرقم الملغوم **${game.bomb}**! خسرت 😂`);
        return;
      }

      if (num === game.target) {
        clearGame(channel.id);
        await giveXP(message, game.xp, 'bomb');
        await channel.send(`🎉 وصلنا للهدف **${game.target}**! مبروك الفريق! +${game.xp} XP لآخر عضو 🏆`);
        return;
      }

      await message.react('✅').catch(() => {});
    }
    return;
  }
}

module.exports = {
  handleGamingMessage,
  startTrivia,
  startMath,
  startScramble,
  startBomb,
  startGuessChar,
  isGamingChannel,
  activeGames,
};
