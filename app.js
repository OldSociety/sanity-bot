// app.js

require('dotenv').config({
  path:
    process.env.NODE_ENV === 'development'
      ? '.env.development'
      : '.env.production',
})
console.log(`Environment: ${process.env.NODE_ENV}`)

const fs = require('node:fs')
const path = require('node:path')
const sequelize = require('./config/sequelize')
const { awardDailyTreats } = require('./handlers/dailyTreats')
const cron = require('node-cron') // Import cron

const { Client, Collection, GatewayIntentBits } = require('discord.js')
const { User } = require('./Models/model')

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

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`)

  // Schedule daily treats at midnight server time
  cron.schedule('0 0 * * *', async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILDID)
      if (guild) {
        console.log('🎃 Running daily treat award...')
        await awardDailyTreats(guild)
        console.log('✅ Daily treats awarded successfully.')
      }
    } catch (error) {
      console.error('❌ Error during daily treat award:', error)
    }
  })

  console.log('🕰️ Daily treat schedule set for midnight.')
})

// Cron job to reset 'hasBeenTricked' every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  try {
    console.log('🔄 Resetting hasBeenTricked flag for all users...')

    // Update all users to reset 'hasBeenTricked' to false
    await SpookyStat.update(
      { hasBeenTricked: false },
      { where: { hasBeenTricked: true } }
    )

    console.log('✅ Successfully reset the hasBeenTricked flag.')
  } catch (error) {
    console.error('❌ Error resetting the hasBeenTricked flag:', error)
  }
})

global.client = client // Set global client after client initialization

client.cooldowns = new Collection()
client.commands = new Collection()
const foldersPath = path.join(__dirname, 'commands')
const commandFolders = fs.readdirSync(foldersPath)

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder)
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'))

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath)
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command)
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      )
    }
  }
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

// Call the function to set up message handling
messageHandler(client, User)

// Call the function to set up booster handling
boosterHandler(client, User)

// Call the function to set up reminder handling
reminderHandler(client)

// Log in to Discord with your client's token
client.login(process.env.TOKEN)

module.exports = { sequelize }
