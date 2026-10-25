// REST-only checks. Never logs in a gateway client or sends a message.
const fs = require('node:fs')
const path = require('node:path')
const { Client, REST, Routes } = require('discord.js')
const root = path.resolve(__dirname, '../..')
async function main() {
  if (process.env.NODE_ENV !== 'development') throw Error('Development preflight only.')
  const settings = require('../../config/checkins/checkins.json')
  const runtime = require('../../config/runtime/runtime').loadDiscordEnvironment('development')
  const client = new Client({ intents: [] })
  client.rest.setToken(process.env.TOKEN)
  client.user = await client.users.fetch('@me')
  const service = require('../../services/checkins/application/controller').createController({ store: null, config: () => settings,
    environment: () => 'development', botAdminId: () => process.env.BOTADMINID })
  const guild = await service.authorize(client, null, process.env.BOTADMINID)
  const channel = await service.reviewChannel(client)
  const productionCredentials = {}
  require('../../config/runtime/runtime').loadDiscordEnvironment('production', { target: productionCredentials })
  const production = new REST().setToken(productionCredentials.TOKEN)
  let productionCanViewTestChannel = false
  try { const same = await production.get(Routes.channel(channel.id)); productionCanViewTestChannel = same.id === channel.id } catch { /* Record lack of access without changing permissions. */ }
  const productionCommands = await production.get(Routes.applicationGuildCommands(productionCredentials.CLIENTID, productionCredentials.GUILDID))
  if (productionCommands.some(command => command.name === 'checkin-test')) throw Error('Test command unexpectedly exists in production.')
  const directory = path.join(root, 'artifacts/checkins-development-2026-10-24')
  const result = { guildId: runtime.guildId, ownerId: guild.ownerId, channelId: channel.id, channelName: channel.name,
    developmentRequiredChannelPermissions: true, productionCanViewTestChannel,
    productionTestCommandAbsent: true, messagesSent: 0 }
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'discord-preflight.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  client.destroy()
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
