// ─── game.js — أمر موحد لكل الألعاب ─────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  startTrivia, startMath, startScramble, startBomb, startGuessChar,
} = require('../events/gamingCorner');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('العب لعبة في gaming-corner!')
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('نوع اللعبة')
        .setRequired(true)
        .addChoices(
          { name: '🧠 تريفيا',             value: 'trivia'    },
          { name: '⚡ رياضيات سريعة',      value: 'math'      },
          { name: '🔀 خمّن الكلمة',        value: 'scramble'  },
          { name: '💣 قنبلة الأرقام',      value: 'bomb'      },
          { name: '🎭 خمّن الشخصية',       value: 'character' },
        )
    )
    .addStringOption((opt) =>
      opt.setName('difficulty')
        .setDescription('الصعوبة (للرياضيات فقط)')
        .setRequired(false)
        .addChoices(
          { name: 'سهل',   value: 'easy'   },
          { name: 'متوسط', value: 'medium' },
          { name: 'صعب',   value: 'hard'   },
        )
    ),

  async execute(interaction) {
    // تأكد إن القناة هي gaming-corner
    if (!interaction.channel.name.toLowerCase().includes('gaming')) {
      return interaction.reply({
        content: '❌ هذا الأمر يشتغل فقط في قناة **🎮〢gaming-corner**!',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const type       = interaction.options.getString('type');
    const difficulty = interaction.options.getString('difficulty') ?? 'medium';

    switch (type) {
      case 'trivia':    await startTrivia(interaction.channel); break;
      case 'math':      await startMath(interaction.channel, difficulty); break;
      case 'scramble':  await startScramble(interaction.channel); break;
      case 'bomb':      await startBomb(interaction.channel); break;
      case 'character': await startGuessChar(interaction.channel); break;
    }

    await interaction.editReply({ content: '✅ تم تشغيل اللعبة!' });
  },
};