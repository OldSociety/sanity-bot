const fs = require('node:fs'), path = require('node:path')
const { REST, Routes } = require('discord.js')
async function main() {
  const report = []
  for (const environment of ['development', 'production']) {
    const selected = {}, runtime = require('../../config/runtime').loadDiscordEnvironment(environment, { target: selected })
    const rest = new REST().setToken(selected.TOKEN)
    const [commands, roles] = await Promise.all([rest.get(Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)), rest.get(Routes.guildRoles(runtime.guildId))])
    const profileRegistered = commands.some(command => command.name === 'profile')
    if (profileRegistered !== (environment === 'development')) throw Error('Unexpected profile registration scope')
    report.push({ environment, guildId: runtime.guildId, commandCount: commands.length, profileRegistered,
      botRole: roles.find(role => role.id === selected.BOTROLEID)?.name || null,
      adminRole: roles.find(role => role.id === selected.ADMINROLEID)?.name || null })
  }
  fs.writeFileSync(path.join(__dirname, 'revision-scope.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
