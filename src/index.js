require('dotenv').config();

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('FLUX Bot is Alive and Running! 🚀');
});

app.listen(port, () => {
  console.log(`Web server is running on port ${port}`);
});

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js'); // ✅ مرة وحدة بس

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
<<<<<<< HEAD
    
=======
    GatewayIntentBits.GuildMessageThreads,
>>>>>>> ad64174 (التحديث الاكبر)
  ],
});

// ─── Collections ─────────────────────────────────────────────────────────────
client.commands = new Collection();

// ─── Command Loader ──────────────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[COMMANDS] Loaded: /${command.data.name}`);
  } else {
    console.warn(`[COMMANDS] WARNING: ${filePath} is missing "data" or "execute".`);
  }
}

// ─── Event Loader ────────────────────────────────────────────────────────────
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

  console.log(`[EVENTS]   Loaded: ${event.name}`);
}

// ─── Login ───────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[FATAL] Failed to log in:', err.message);
  process.exit(1);
});
