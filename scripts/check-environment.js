const { loadDiscordEnvironment } = require('../config/runtime')

try {
  const runtime = loadDiscordEnvironment()
  console.log(JSON.stringify({
    environment: runtime.env,
    environmentFile: runtime.envFile,
    databasePath: runtime.database.storage,
    applicationId: runtime.clientId,
    guildId: runtime.guildId,
    token: 'present (value withheld)',
    otherEnvironmentGuildComparison: runtime.productionGuildComparison,
    discordContacted: false,
    databaseOpened: false,
  }, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
