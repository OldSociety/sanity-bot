const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const runtime = require('../../config/runtime').loadDiscordEnvironment('development')
const { REST, Routes } = require('discord.js')
const { matches, canonical } = { ...require('../../deploy-commands'), canonical: value => JSON.stringify(value) }
const definition = require('../../commands/Server/Profile').data.toJSON()
require('../../services/command-registry').validateDefinition(definition)
const rest = new REST().setToken(process.env.TOKEN)
const route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
const mode = process.argv[2], expected = process.argv[3]
if (!['plan', 'apply'].includes(mode)) throw Error('Expected plan or apply hash')
async function main() {
  const before = await rest.get(route)
  const plan = { environment: runtime.env, guildId: runtime.guildId, clientId: runtime.clientId, definition, before }
  const hash = createHash('sha256').update(canonical(plan)).digest('hex')
  fs.writeFileSync(path.join(__dirname, mode === 'plan' ? 'registry-plan.json' : 'registry-before-apply.json'), JSON.stringify({ hash, ...plan }, null, 2))
  if (mode === 'plan') { console.log(JSON.stringify({ hash, environment: runtime.env, guildId: runtime.guildId,
    existingCommands: before.map(row => row.name), addedOrUpdated: 'profile', otherCommandsChanged: false }, null, 2)); return }
  if (expected !== hash) throw Error('Registry plan changed; review a fresh plan')
  await rest.post(route, { body: definition })
  const after = await rest.get(route)
  const unchanged = before.filter(row => row.name !== 'profile').every(row => canonical(after.find(next => next.id === row.id)) === canonical(row))
  const verified = matches(after.find(row => row.name === 'profile'), definition)
  fs.writeFileSync(path.join(__dirname, 'registry-after.json'), JSON.stringify({ environment: runtime.env,
    guildId: runtime.guildId, unchanged, verified, commands: after }, null, 2))
  if (!unchanged || !verified || after.length !== before.length + Number(!before.some(row => row.name === 'profile'))) throw Error('Unexpected registry result; inspect saved snapshots without retrying')
  console.log(JSON.stringify({ registered: 'profile', environment: runtime.env, totalCommands: after.length, otherCommandsUnchanged: unchanged, verified }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
