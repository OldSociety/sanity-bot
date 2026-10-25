// Scoped production /check-in registration with a reviewed desired config.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { REST, Routes } = require('discord.js')
const { matches } = require('../../deploy-commands')
async function main() {
  const [mode, approved] = process.argv.slice(2)
  if (process.env.NODE_ENV !== 'production' || !['--plan','--apply'].includes(mode) || (mode === '--apply' && !approved)) throw Error('Use production --plan or --apply PLAN_SHA256.')
  const runtime = require('../../config/runtime/runtime').loadDiscordEnvironment('production')
  const currentConfig = JSON.parse(fs.readFileSync(path.join(runtime.root, 'config/checkins/checkins.json')))
  const desiredConfig = structuredClone(currentConfig)
  desiredConfig.production.liveEnabled = true
  desiredConfig.production.scheduledEnabled = true
  const c = desiredConfig.production
  if (runtime.guildId !== c.guildId || c.reviewGuildId !== c.guildId || c.testCommandEnabled) throw Error('Production scope mismatch.')
  const rest = new REST().setToken(process.env.TOKEN)
  const route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
  const before = await rest.get(route)
  if (before.some(c => c.name === 'checkin-test')) throw Error('Unexpected owner test command in production.')
  const desired = require('../../commands/CheckIn/CheckIn').data.toJSON()
  const plan = { guildId: runtime.guildId, clientId: runtime.clientId, desiredConfig, desired, before }
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const directory = path.join(runtime.root, 'artifacts/checkins-reminders-2026-10-25/production')
  fs.mkdirSync(directory, { recursive: true })
  if (mode === '--plan') {
    fs.writeFileSync(path.join(directory, 'registry-plan.json'), JSON.stringify({ ...plan, hash }, null, 2))
    console.log(JSON.stringify({ guildId: runtime.guildId, desired, commandChannelId: c.commandChannelId,
      reviewChannelId: c.reviewChannelId, playerRoleIds: c.playerRoleIds, schedule: desiredConfig.schedule,
      campaigns: desiredConfig.campaigns, preservedCommands: before.filter(c => c.name !== desired.name).map(c => c.name), hash }))
    return
  }
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'registry-plan.json')))
  if (hash !== approved || saved.hash !== hash || !currentConfig.production.liveEnabled || !currentConfig.production.scheduledEnabled) throw Error('Registry/configuration changed or production has not been prepared from the reviewed plan.')
  const processList = JSON.parse(require('node:child_process').execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' }))
  const productionProcess = processList.find(p => p.name === 'SB-production')
  if (productionProcess?.pm2_env.status !== 'stopped' || productionProcess.pid) throw Error('Production must be stopped for the cutover registration.')
  fs.writeFileSync(path.join(directory, `registry-before-${Date.now()}.json`), JSON.stringify(before, null, 2), { flag: 'wx' })
  const existing = before.find(c => c.name === desired.name && c.type === 1)
  if (existing && !matches(existing, desired)) await rest.patch(Routes.applicationGuildCommand(runtime.clientId, runtime.guildId, existing.id), { body: desired })
  else if (!existing) await rest.post(route, { body: desired })
  const after = await rest.get(route)
  if (!matches(after.find(c => c.name === desired.name && c.type === 1), desired)) throw Error('Production /check-in did not match.')
  const others = list => list.filter(c => c.name !== desired.name).sort((a,b) => a.id.localeCompare(b.id))
  if (JSON.stringify(others(before)) !== JSON.stringify(others(after))) throw Error('An unrelated production command changed.')
  fs.writeFileSync(path.join(directory, 'registry-after.json'), JSON.stringify(after, null, 2))
  console.log(`Verified production /check-in; ${others(after).length} other commands unchanged. No messages sent.`)
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
