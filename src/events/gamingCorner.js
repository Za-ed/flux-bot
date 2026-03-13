// ─── gamingCorner.js ──────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
// ✅ تم تصحيح المسارات لتتناسب مع وجود هذا الملف داخل مجلد events
const { updateProgress } = require('./dailyTasks'); 
const { checkStatBadges } = require('../utils/badges'); 
const { addManualXP } = require('../utils/xpSystem'); 
const { updateTierRole, announceLevelUp } = require('./leveling'); 

// ─── Config ───────────────────────────────────────────────────────────────────
const ANSWER_TIMEOUT = 20000;

const XP_REWARDS = {
  trivia:    60,
  math:      40,
  wordchain: 30,
  bomb:      50,
  hangman:   70,
  scramble:  55,
};

// ─── Active Games Store ───────────────────────────────────────────────────────
const activeGames = new Map();

// ─── Trivia Questions ─────────────────────────────────────────────────────────
const TRIVIA_QUESTIONS = [
  { q: 'ما هي لغة البرمجة المستخدمة في هذا البوت؟',         a: ['javascript', 'js'],               xp: 60 },
  { q: 'ما هو اختصار HTML؟',                                  a: ['hyper text markup language'],     xp: 50 },
  { q: 'من مؤسس شركة Microsoft؟',                             a: ['bill gates'],                     xp: 60 },
  { q: 'ما هو أسرع نوع من أنواع الذاكرة في الحاسوب؟',       a: ['cache', 'كاش'],                   xp: 80 },
  { q: 'ما هو البروتوكول المستخدم لنقل صفحات الويب؟',        a: ['http', 'https'],                  xp: 50 },
  { q: 'كم بت في بايت واحد؟',                                 a: ['8'],                              xp: 40 },
  { q: 'ما هي لغة الاستعلام الخاصة بقواعد البيانات؟',        a: ['sql'],                            xp: 60 },
  { q: 'من أسس شركة Apple؟',                                  a: ['steve jobs', 'ستيف جوبز'],       xp: 50 },
  { q: 'ما هو الرمز المستخدم للتعليق في Python؟',            a: ['#'],                              xp: 40 },
  { q: 'ما اسم نظام التحكم في الإصدارات الأكثر استخداماً؟',  a: ['git'],                            xp: 50 },
  { q: 'ما هو عدد كواكب المجموعة الشمسية؟',                   a: ['8', 'ثمانية'],                   xp: 40 },
  { q: 'ما هي عاصمة اليابان؟',                                a: ['tokyo', 'طوكيو'],                 xp: 40 },
  { q: 'ما هو أكبر كوكب في المجموعة الشمسية؟',               a: ['jupiter', 'المشتري'],             xp: 50 },
  { q: 'من كتب رواية هاري بوتر؟',                             a: ['j.k. rowling', 'rowling', 'رولينج'], xp: 50 },
  { q: 'ما هي أسرع حيوان بري في العالم؟',                    a: ['cheetah', 'فهد'],                 xp: 50 },
  { q: 'كم سنة في القرن؟',                                    a: ['100', 'مئة'],                     xp: 30 },
  { q: 'ما هو الرمز الكيميائي للذهب؟',                       a: ['au'],                             xp: 60 },
  { q: 'ما هو الرمز الكيميائي للماء؟',                       a: ['h2o'],                            xp: 30 },
  { q: 'من رسم لوحة الموناليزا؟',                             a: ['leonardo da vinci', 'ليوناردو'], xp: 50 },
  { q: 'ما هو أطول نهر في العالم؟',                           a: ['nile', 'النيل'],                  xp: 50 },
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
  const target = Math.floor(Math.random() * 50) + 20;
  const bomb   = Math.floor(Math.random() * (target - 5)) + 5;
  return { target, bomb };
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

// ─── XP Helper (تم ربطه بـ MongoDB) ───────────────────────────────────────────
async function giveXP(message, amount, gameType) {
  try {
    const guildId  = message.guild.id;
    const userId   = message.author.id;

    // إضافة الـ XP الأساسي للعبة
    const result = await addManualXP(guildId, userId, amount);

    // شارات الألعاب
    const newBadges = checkStatBadges(guildId, userId, 'games', 1);
    if (newBadges.length > 0) {
      const badgeText = newBadges.map((b) => `${b.emoji} **${b.name}**`).join(', ');
      await message.channel.send(`🏅 ${message.author} كسب شارة: ${badgeText}`).catch(() => {});
    }

    // مهام يومية (ألعاب)
    const dailyXp = updateProgress(guildId, userId, 'games');
    if (gameType === 'trivia') {
        const triviaXp = updateProgress(guildId, userId, 'trivia');
        if(triviaXp > 0) await addManualXP(guildId, userId, triviaXp); // إضافة الـ XP الفعلي لمهمة التريفيا
    }

    // ترقية المستوى عبر الـ MongoDB Result
    if (result && result.leveled) {
        let member = message.guild.members.cache.get(userId);
        if (!member) member = await message.guild.members.fetch(userId).catch(()=>null);
        if(member) {
            await updateTierRole(member, result.user.level);
            await announceLevelUp(message.guild, member, result.user.level - 1, result.user.level);
        }
    }

    // إضافة الـ XP الفعلي للمهام اليومية
    if (dailyXp > 0) {
      await addManualXP(guildId, userId, dailyXp); 
      await message.channel.send(`📅 ${message.author} أكمل مهمة يومية! +${dailyXp} XP 🎊`).catch(() => {});
    }
  } catch (err) {
    console.error('[GAMING] giveXP error:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME STARTERS
// ═════════════════════════════════════════════════════════════════════════════

async function startTrivia(channel) {
  if (activeGames.has(channel.id)) return channel.send('❗ في لعبة شغّالة الحين، انتهوا منها أول!');
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
    await channel.send(`⏰ انتهى الوقت! الإجابة: **${q.a[0]}**`);
  }, ANSWER_TIMEOUT);
  activeGames.set(channel.id, { type: 'trivia', answers: q.a, xp: q.xp, timeout });
}

async function startMath(channel, difficulty = 'medium') {
  if (activeGames.has(channel.id)) return channel.send('❗ في لعبة شغّالة الحين!');
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

async function startScramble(channel) {
  if (activeGames.has(channel.id)) return channel.send('❗ في لعبة شغّالة الحين!');
  const item      = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
  const scrambled = scrambleWord(item.word);
  const embed = new EmbedBuilder()
    .setTitle('🔀  خمّن الكلمة!')
    .setDescription(`رتّب هذه الحروف:\n\n# \`${scrambled.toUpperCase()}\`\n\n💡 تلميح: ${item.hint}`)
    .setColor(0xf39c12)
    .setFooter({ text: '⏱️ 25 ثانية  |  FLUX • IO' });
  await channel.send({ embeds: [embed] });
  const timeout = setTimeout(async () => {
    if (!activeGames.has(channel.id)) return;
    clearGame(channel.id);
    await channel.send(`⏰ انتهى الوقت! الكلمة: **${item.word}**`);
  }, 25000);
  activeGames.set(channel.id, { type: 'scramble', answer: item.word, xp: XP_REWARDS.scramble, timeout });
}

async function startBomb(channel) {
  if (activeGames.has(channel.id)) return channel.send('❗ في لعبة شغّالة الحين!');
  const { target, bomb } = generateBomb();
  const embed = new EmbedBuilder()
    .setTitle('💣  لعبة القنبلة!')
    .setDescription(
      `عد من **1** للأعلى بالتناوب!\n🎯 الهدف: **${target}**\n💥 الرقم الملغوم: **مخفي!**\n\nابدأ بكتابة **1** الحين!`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: 'من يكتب الرقم الملغوم يخسر!  |  FLUX • IO' });
  await channel.send({ embeds: [embed] });
  activeGames.set(channel.id, { type: 'bomb', target, bomb, current: 0, last: null, xp: XP_REWARDS.bomb, timeout: null });
}

const CHARACTERS = [
  { clues: ['شخصية كرتونية', 'تعيش تحت الماء', 'تصنع البرغر'],       answer: 'spongebob',      arAnswer: 'سبونج بوب'   },
  { clues: ['بطل خارق', 'يرتدي بزة حمراء وزرقاء', 'يقفز بين المباني'], answer: 'spiderman',      arAnswer: 'سبايدرمان'   },
  { clues: ['ساحر', 'مدرسة للسحر', 'ندبة على جبهته'],                  answer: 'harry potter',   arAnswer: 'هاري بوتر'   },
  { clues: ['لعبة فيديو', 'يلبس أحمر', 'يجمع الفطر'],                  answer: 'mario',          arAnswer: 'ماريو'        },
  { clues: ['محقق', 'لندن', 'يلعب الكمان'],                            answer: 'sherlock holmes', arAnswer: 'شيرلوك هولمز' },
];

async function startGuessChar(channel) {
  if (activeGames.has(channel.id)) return channel.send('❗ في لعبة شغّالة الحين!');
  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  let clueIndex = 0;
  const embed = new EmbedBuilder()
    .setTitle('🎭  خمّن الشخصية!')
    .setDescription(`**التلميح 1:** ${char.clues[0]}\n\n⏱️ 30 ثانية لكل تلميح`)
    .setColor(0x1abc9c)
    .setFooter({ text: 'FLUX • IO  |  gaming-corner' });
  const msg = await channel.send({ embeds: [embed] });
  const giveNextClue = async () => {
    clueIndex++;
    if (clueIndex >= char.clues.length) {
      clearGame(channel.id);
      await channel.send(`❌ ما أحد عرف! الشخصية: **${char.arAnswer}** (${char.answer})`);
      return;
    }
    const newEmbed = EmbedBuilder.from(msg.embeds[0]).setDescription(
      char.clues.slice(0, clueIndex + 1).map((c, i) => `**التلميح ${i + 1}:** ${c}`).join('\n') + '\n\n⏱️ 30 ثانية'
    );
    await msg.edit({ embeds: [newEmbed] }).catch(() => {});
    const timeout = setTimeout(giveNextClue, 30000);
    const game = activeGames.get(channel.id);
    if (game) { clearTimeout(game.timeout); game.timeout = timeout; }
  };
  const timeout = setTimeout(giveNextClue, 30000);
  activeGames.set(channel.id, { type: 'character', answers: [char.answer, char.arAnswer], xp: 80, timeout });
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═════════════════════════════════════════════════════════════════════════════
async function handleGamingMessage(message) {
  const { author, channel, content } = message;
  if (author.bot) return;
  if (!isGamingChannel(channel)) return;
  const game = activeGames.get(channel.id);
  if (!game) return;
  const input = content.trim().toLowerCase();

  if (game.type === 'trivia') {
    if (game.answers.map((a) => a.toLowerCase()).includes(input)) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'trivia');
      const embed = new EmbedBuilder()
        .setTitle('✅  إجابة صحيحة!')
        .setDescription(`${author} أجاب صح! الإجابة: **${game.answers[0]}**\n+**${game.xp} XP** 🎉`)
        .setColor(0x2ecc71).setTimestamp();
      await channel.send({ embeds: [embed] });
    }
    return;
  }

  if (game.type === 'math') {
    if (input === game.answer) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'math');
      await channel.send(`✅ **${author}** أجاب صح! الإجابة: **${game.answer}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  if (game.type === 'scramble') {
    if (input === game.answer.toLowerCase()) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'scramble');
      await channel.send(`✅ **${author}** عرّف الكلمة! هي **${game.answer}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  if (game.type === 'character') {
    if (game.answers.map((a) => a.toLowerCase()).includes(input)) {
      clearGame(channel.id);
      await giveXP(message, game.xp, 'character');
      await channel.send(`✅ **${author}** عرّف الشخصية! هي **${game.answers[1]}** | +${game.xp} XP 🎉`);
    }
    return;
  }

  if (game.type === 'bomb') {
    const num = parseInt(input);
    if (isNaN(num)) return;
    if (game.last === author.id) { await message.react('❌').catch(() => {}); return; }
    if (num === game.current + 1) {
      game.current++;
      game.last = author.id;
      if (num === game.bomb) {
        clearGame(channel.id);
        await channel.send(`💥 **${author}** كتب الرقم الملغوم **${game.bomb}**! خسرت 😂`);
        return;
      }
      if (num === game.target) {
        clearGame(channel.id);
        await giveXP(message, game.xp, 'bomb');
        await channel.send(`🎉 وصلنا للهدف **${game.target}**! +${game.xp} XP لآخر عضو 🏆`);
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