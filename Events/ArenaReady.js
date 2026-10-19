const { Events } = require('discord.js')
module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    if (!['development', 'production'].includes(process.env.NODE_ENV)) return
    if (process.env.NODE_ENV === 'development') require('../services/arena/timing').startMetrics(client)
    if (process.env.NODE_ENV === 'development') require('../services/arena/shutdown').installShutdown(client)
    try { await require('../services/arena/message-leases').recoverArenaMessages(client) }
    catch (error) { console.warn(`Arena restart cleanup failed: ${error.message}`) }
  },
}
