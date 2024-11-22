const { REST, Routes } = require('discord.js')
const fs = require('node:fs')
const path = require('node:path')

// Set default NODE_ENV if undefined
const env = process.env.NODE_ENV || 'production'
console.log(`Environment: ${env}`)

// Load environment variables
require('dotenv').config({
  path: env === 'development' ? '.env.development' : '.env.production',
})

const commands = []

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
    console.log(`Reading folder: ${folder}`)
    console.log(`Reading file: ${file}`)
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON())
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      )
    }
  }
}

const rest = new REST().setToken(process.env.TOKEN)

;(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    )

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENTID,
        process.env.GUILDID
      ),
      { body: commands }
    )

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
    )
    console.log(`Client ID: ${process.env.CLIENTID}`)
  } catch (error) {
    console.error(error)
  }
})()
