require('dotenv').config();

const express = require('express');
const app  = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('FLUX Bot is Alive and Running! 🚀'));
app.listen(port, () => console.log(`[SERVER] Web server running on port ${port}`));

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[COMMANDS] Loaded: /${command.data.name}`);
    } else {
      console.warn(`[COMMANDS] WARNING: ${file} missing "data" or "execute".`);
    }
  } catch (err) {
    console.error(`[COMMANDS] ERROR loading ${file}:`, err.message);
  }
}

// ✅ كل المنطق في events/ — لا يوجد أي inline handler هنا
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (!event.name || !event.execute) {
        console.warn(`[EVENTS] SKIP: ${file} — missing name or execute.`);
        continue;
      }
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`[EVENTS] Loaded: ${event.name} (${file})`);
    } catch (err) {
      console.error(`[EVENTS] ERROR loading ${file}:`, err.message);
    }
  }
}

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[FATAL] Failed to log in:', err.message);
  process.exit(1);
});