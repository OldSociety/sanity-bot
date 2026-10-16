// Read-only development guild inspection. Never uploads or edits emojis.
const { REST, Routes } = require('discord.js')
async function main() {
  if (process.argv.length !== 2 || process.env.NODE_ENV !== 'development') throw Error('Run without arguments with NODE_ENV=development')
  const runtime = require('../config/runtime').loadDiscordEnvironment('development')
  const rest = new REST().setToken(process.env.TOKEN)
  const emojis = await rest.get(Routes.guildEmojis(runtime.guildId))
  console.log(JSON.stringify({ guildId: runtime.guildId, emojis: emojis.filter(emoji => ['HOPE', 'FEAR'].includes(emoji.name))
    .map(({ id, name, animated, available, roles }) => ({ id, name, animated, available, roles })) }, null, 2))
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
