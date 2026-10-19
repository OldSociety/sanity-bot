// Only message references persist, so controls can be removed after a restart.
const fs = require('node:fs'), path = require('node:path')
const defaultFile = path.resolve(__dirname, process.env.NODE_ENV === 'production' ? '../../config/arena/state/arena-message-leases-production.json' : '../../config/arena/state/arena-message-leases.json')
function createLeaseStore(file = defaultFile) {
  function read() {
    if (!fs.existsSync(file)) return []
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(rows)) throw Error('Invalid arena message lease file')
    return rows
  }
  function write(rows) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = file + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(rows), 'utf8')
    fs.renameSync(temp, file)
  }
  return { list: read,
    add(row) {
      if (![row.guildId, row.channelId, row.messageId].every(id => /^\d{17,20}$/.test(id))) return
      write([...read().filter(item => item.messageId !== row.messageId), row])
    },
    remove(id) { const rows = read(); if (rows.some(row => row.messageId === id)) write(rows.filter(row => row.messageId !== id)) },
  }
}
async function recoverArenaMessages(client, { store = createLeaseStore(), logger = console } = {}) {
  if (!['development', 'production'].includes(process.env.NODE_ENV) || !process.env.GUILDID) return
  const testing = require('../../config/arena/arena-testing.json')
  if (process.env.NODE_ENV === 'production' && (!testing.productionEnabled || process.env.GUILDID !== testing.productionGuildId)) return
  for (const row of store.list()) {
    if (process.env.NODE_ENV === 'production' && row.channelId !== testing.productionChannelId) continue
    if (row.guildId !== process.env.GUILDID) continue
    try {
      const channel = await client.channels.fetch(row.channelId)
      if (channel?.guildId !== row.guildId || !channel.messages) continue
      const message = await channel.messages.fetch(row.messageId)
      if (message.author.id !== client.user.id) continue
      await message.edit({ components: [], allowedMentions: { parse: [] } })
      store.remove(row.messageId)
    } catch (error) {
      if ([10003, 10008].includes(error.code)) store.remove(row.messageId)
      else logger.warn(`Arena restart cleanup failed: ${error.message}`)
    }
  }
}
module.exports = { createLeaseStore, recoverArenaMessages }
