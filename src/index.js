require('dotenv').config();

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

// ─── Client ───────────────────────────────────────────────────────────────────
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

// ─── تحميل الأوامر (يدعم مجلدات فرعية + ملفات مباشرة) ───────────────────────
const commandsPath = path.join(__dirname, 'commands');

function loadCommands(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    if (fs.lstatSync(itemPath).isDirectory()) {
      loadCommands(itemPath); // مجلد فرعي
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
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (!event.name) continue;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[EVENTS] Loaded: ${event.name}`);
}

// ─── Anti-Crash ───────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ANTI-CRASH] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[ANTI-CRASH] Uncaught Exception:', err);
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[FATAL] Failed to log in:', err.message);
  process.exit(1);
});