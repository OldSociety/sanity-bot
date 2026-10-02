// app.js

const { loadDiscordEnvironment } = require('./config/runtime')
const runtime = loadDiscordEnvironment()
console.log(`Environment: ${runtime.env}`)

const fs = require('node:fs')
const path = require('node:path')
const sequelize = require('./config/sequelize')
const awardSnowballs = require('./handlers/awardSnowballs')
const cron = require('node-cron') // Import cron

const { Client, Collection, GatewayIntentBits } = require('discord.js')
const { User, HolidayStat } = require('./Models/model')


// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
})

// HOLIDAY EVENT
client.once('ready', async () => {
  // Check daily snowballs every hour
  cron.schedule('*/300 * * * * *', async () => {
    console.log('Cron scheduled:', cron.getTasks().size);
    console.log(`[${new Date().toLocaleTimeString()}] tick`);
    try {
      const guild = await client.guilds.fetch(process.env.GUILDID)
      if (guild) {
        console.log('❄️ Running daily treat award...')
        await awardSnowballs(guild)
        console.log('✅ Hourly snow awarded successfully.')
      }
    } catch (error) {
      console.error('❌ Error during daily treat award:', error)
    }
  })
})

global.client = client // Set global client after client initialization

// Disabled Spooky creates no timer and opens no seasonal storage. When enabled,
// startup catches up expired effects and the minute worker continues without play.
client.once('ready', () => require('./services/spooky/runtime').startMaintenance(client))

client.cooldowns = new Collection()
client.commands = new Collection()
for (const entry of require('./services/command-registry').loadRegistry(__dirname).active) {
  client.commands.set(entry.name, entry.command)
}

// Dynamically read event files
const eventsPath = path.join(__dirname, 'events')
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith('.js'))

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file)
  const event = require(filePath)
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args))
  } else {
    client.on(event.name, (...args) => event.execute(...args))
  }
}

// Import the message handler and booster handler
const messageHandler = require('./handlers/messageHandler')
const boosterHandler = require('./handlers/boosterHandler')
const reminderHandler = require('./handlers/reminderHandler')
const reportHandler = require('./handlers/reportHandler')
const birthdayHandler = require('./handlers/birthdayHandler');


messageHandler(client, User)
boosterHandler(client, User)
reminderHandler(client)
reportHandler(client)
birthdayHandler(client)

// Log in to Discord with your client's token
client.login(process.env.TOKEN)

module.exports = { sequelize }
