require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ─── كل الأوامر مخفية عن الأعضاء العاديين افتراضياً ──────────────────────────
// الـ FOUNDER يستخدم /setperm لمنح الصلاحيات لمن يريد

const commands     = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (!('data' in command)) continue;

  const json = command.data.toJSON();

  // مخفي عن الجميع — فقط من عنده Administrator يشوفه
  // الـ FOUNDER يمنح الصلاحيات لاحقاً عبر /setperm
  json.default_member_permissions = PermissionFlagsBits.Administrator.toString();

  commands.push(json);
  console.log(`[DEPLOY] Staged: /${command.data.name} 🔒`);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`[DEPLOY] Pushing ${commands.length} slash command(s) to guild ${process.env.GUILD_ID}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`[DEPLOY] ✅ Successfully registered ${data.length} command(s).`);
    console.log(`[DEPLOY] 🔒 كل الأوامر مخفية — استخدم /setperm لمنح الصلاحيات`);
  } catch (error) {
    console.error('[DEPLOY] ❌ Deployment failed:', error);
  }
})();