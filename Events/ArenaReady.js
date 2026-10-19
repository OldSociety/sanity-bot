const { Events } = require('discord.js')
module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    if (!['development', 'production'].includes(process.env.NODE_ENV)) return
    try { await require('../services/arena/message-leases').recoverArenaMessages(client) }
    catch (error) { console.warn(`Arena restart cleanup failed: ${error.message}`) }
  },
}
