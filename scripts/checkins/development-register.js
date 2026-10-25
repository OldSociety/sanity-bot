// Register only the two check-in development commands. No bulk replacement.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { REST, Routes } = require('discord.js')
const { matches } = require('../../deploy-commands')
async function main() {
  const [mode, approved] = process.argv.slice(2)
  if (!['--plan', '--apply'].includes(mode) || (mode === '--apply' && !approved)) throw Error('Use --plan or --apply PLAN_SHA256.')
  if (process.env.NODE_ENV !== 'development') throw Error('Development only.')
  const runtime = require('../../config/runtime/runtime').loadDiscordEnvironment('development')
  const config = require('../../config/checkins/checkins.json').development
  if (runtime.guildId !== config.guildId || !config.testCommandEnabled) throw Error('Development test scope mismatch.')
  const rest = new REST().setToken(process.env.TOKEN)
  const guild = await rest.get(Routes.guild(runtime.guildId))
  const channel = await rest.get(Routes.channel(config.reviewChannelId))
  if (guild.owner_id !== process.env.BOTADMINID || channel.guild_id !== config.reviewGuildId || channel.type !== 0) throw Error('Owner or test review channel mismatch.')
  const route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
  const before = await rest.get(route)
  const desired = [require('../../commands/CheckIn/CheckInTest').data.toJSON(), require('../../commands/CheckIn/CheckIn').data.toJSON()]
  const owned = new Set(desired.map(c => c.name))
  const plan = { guildId: runtime.guildId, clientId: runtime.clientId, owner: guild.owner_id,
    reviewChannelId: channel.id, reviewChannelName: channel.name, config, desired, before }
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const directory = path.join(runtime.root, 'artifacts/checkins-reminders-2026-10-25')
  fs.mkdirSync(directory, { recursive: true })
  if (mode === '--plan') {
    fs.writeFileSync(path.join(directory, 'registry-plan.json'), JSON.stringify({ ...plan, hash }, null, 2))
    console.log(JSON.stringify({ guildId: runtime.guildId, owner: guild.owner_id, reviewChannel: channel.name,
      desired, preservedCommands: before.filter(c => !owned.has(c.name)).map(c => c.name), hash }))
    return
  }
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'registry-plan.json'), 'utf8'))
  if (approved !== hash || saved.hash !== hash) throw Error('Registry or configuration changed. Review a fresh plan.')
  fs.writeFileSync(path.join(directory, `registry-before-${Date.now()}.json`), JSON.stringify(before, null, 2), { flag: 'wx' })
  for (const definition of desired) {
    const old = before.find(c => c.name === definition.name && c.type === 1)
    if (old && matches(old, definition)) continue
    if (old) await rest.patch(Routes.applicationGuildCommand(runtime.clientId, runtime.guildId, old.id), { body: definition })
    else await rest.post(route, { body: definition })
  }
  const after = await rest.get(route)
  for (const definition of desired) if (!matches(after.find(c => c.name === definition.name && c.type === 1), definition)) throw Error('Command verification failed.')
  const others = list => list.filter(c => !owned.has(c.name)).sort((a,b) => a.id.localeCompare(b.id))
  if (JSON.stringify(others(before)) !== JSON.stringify(others(after))) throw Error('An unrelated registry entry changed; inspect snapshots.')
  fs.writeFileSync(path.join(directory, 'registry-after.json'), JSON.stringify(after, null, 2))
  console.log(`Verified /check-in and /checkin-test; ${others(after).length} other commands unchanged. No messages sent.`)
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main }
