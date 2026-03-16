// 1. تحميل الإعدادات من ملف .env (لازم يكون أول سطر)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const keepAlive = require('./server');

// ─── تشغيل سيرفر الويب ────────────────────────────────────────────────────────
keepAlive();

// ─── تشغيل نظام الـ XP (MongoDB) ─────────────────────────────────────────────
const { init: initXP } = require('./utils/xpSystem');
initXP()
  .then(() => console.log('[XP] Database Connected Successfully'))
  .catch((err) => console.error('[XP] Init error:', err.message));

// ─── إعداد بوت ديسكورد (Client) ──────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
  ],
});

client.commands  = new Collection();
client.cooldowns = new Collection();

// ─── تحميل الأوامر ────────────────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');

function loadCommands(dir) {
  if (!fs.existsSync(dir)) return; // عشان ما يضرب الكود إذا المجلد مش موجود
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    if (fs.lstatSync(itemPath).isDirectory()) {
      loadCommands(itemPath);
    } else if (item.endsWith('.js')) {
      const command = require(itemPath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[COMMANDS] Loaded: /${command.data.name}`);
      } else {
        console.warn(`[WARNING] ${itemPath} missing "data" or "execute"`);
      }
    }
  }
}

loadCommands(commandsPath);

// ─── تحميل الأحداث ────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

    for (const file of eventFiles) {
      const event = require(path.join(eventsPath, file));
      if (!event.name) continue;

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`[EVENTS] Loaded: ${event.name} (${file})`);
    }
}

// ─── Anti-Crash (منع توقف البوت عند الأخطاء) ───────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[ANTI-CRASH] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[ANTI-CRASH] Uncaught Exception:', err);
});

// ─── Login (تشغيل البوت باستخدام التوكن المخفي) ────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[FATAL] Failed to log in:', err.message);
  process.exit(1);
});