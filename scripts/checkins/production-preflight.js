// Read-only production readiness: no gateway login, messages, storage or registry writes.
const fs = require('node:fs')
const path = require('node:path')
const { Client, PermissionFlagsBits } = require('discord.js')
async function main() {
  if (process.env.NODE_ENV !== 'production') throw Error('Use NODE_ENV=production for the read-only preflight.')
  const runtime = require('../../config/runtime/runtime').loadDiscordEnvironment('production')
  const config = structuredClone(require('../../config/checkins/checkins.json'))
  const active = config.production.liveEnabled
  config.production.liveEnabled = true // In-memory validation only; never persisted.
  const c = config.production
  const client = new Client({ intents: [] })
  client.rest.setToken(process.env.TOKEN)
  client.user = await client.users.fetch('@me')
  const guild = await client.guilds.fetch(runtime.guildId)
  const roles = await guild.roles.fetch()
  for (const [campaign, id] of Object.entries(c.playerRoleIds)) {
    if (roles.get(id)?.name.toLowerCase() !== config.campaigns[campaign].name.toLowerCase()) throw Error('Configured player role identity mismatch.')
  }
  const controller = require('../../services/checkins/application/controller').createController({ store: null, config: () => config,
    environment: () => 'production', botAdminId: () => process.env.BOTADMINID })
  const review = await controller.reviewChannel(client)
  const command = await client.channels.fetch(c.commandChannelId, { force: true })
  const bot = await guild.members.fetchMe({ force: true })
  if (command?.guildId !== c.guildId || command.type !== 0 || !command.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw Error('The production command channel is unavailable to the bot.')
  const members = await require('../../services/checkins/scheduling/scheduler').roster(guild)
  const counts = Object.fromEntries(Object.entries(c.playerRoleIds).map(([key,id]) => [key, members.filter(m => !m.user.bot && m.roles.cache.has(id)).length]))
  const calendar = require('../../services/checkins/scheduling/calendar')
  const openings = Object.fromEntries(Object.entries(config.campaigns).map(([key,campaign]) => [key,
    calendar.occurrence(config, key, calendar.localTimestamp(campaign.anchor, config.schedule.openingHour, config.schedule.timezone))]))
  const result = { guildId: runtime.guildId, roleIds: c.playerRoleIds, commandChannel: { id: command.id, name: command.name },
    reviewChannel: { id: review.id, name: review.name }, reviewVisibleToEveryone: review.permissionsFor(guild.roles.everyone).has(PermissionFlagsBits.ViewChannel),
    eligiblePlayerCounts: counts, openings, productionEnabled: active, scheduledEnabled: c.scheduledEnabled, messagesSent: 0 }
  const directory = path.resolve(__dirname, '../../artifacts/checkins-reminders-2026-10-25')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'production-preflight.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  client.destroy()
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
