const { Events } = require('discord.js')
module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    if (process.env.NODE_ENV !== 'development') return
    try { await require('../services/arena/message-leases').recoverArenaMessages(client) }
    catch (error) { console.warn(`Arena restart cleanup failed: ${error.message}`) }
  },
}
