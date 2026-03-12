require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const keepAlive = require('./server'); // استدعاء ملف الويب

// ─── تشغيل سيرفر الويب ────────────────────────────────────────────────────────
keepAlive();

// ─── إعداد العميل (Client) ───────────────────────────────────────────────────
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

client.commands = new Collection();
client.cooldowns = new Collection(); // إضافة نظام وقت الانتظار مستقبلاً

// ─── تشغيل نظام الـ XP (MongoDB) ─────────────────────────────────────────────
const { init: initXP } = require('./utils/xpSystem');
initXP()
    .then(() => console.log('[XP] Database Connected Successfully'))
    .catch((err) => console.error('[XP] Init error:', err.message));

// ─── تحميل الأوامر (يدعم المجلدات الفرعية) ──────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    // التأكد أن المسار مجلد وليس ملف
    if (!fs.lstatSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[COMMANDS] Loaded: /${command.data.name} (Category: ${folder})`);
        } else {
            console.warn(`[WARNING] Command at ${filePath} is missing "data" or "execute".`);
        }
    }
}

// ─── تحميل الأحداث (Events) ──────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[EVENTS] Loaded: ${event.name}`);
}

// ─── معالجة الأخطاء العالمية (تمنع توقف البوت) ───────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('[ANTI-CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
    console.error('[ANTI-CRASH] Uncaught Exception:', err, 'at:', origin);
});

// ─── تسجيل الدخول ─────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('[FATAL] Failed to log in:', err.message);
    process.exit(1);
});