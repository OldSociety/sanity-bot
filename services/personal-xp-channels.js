const defaults = require('../config/personal-leveling.json')

function qualifiesPersonalXp(message, { environment = process.env.NODE_ENV, source = defaults } = {}) {
  const config = source.environments?.[environment]
  if (!config || message.guild?.id !== config.guildId || !Array.isArray(config.channelIds)) return false
  const channel = message.channel
  if (!channel) return false
  // Forum posts are public threads; private threads and voice chat never qualify.
  if ([10, 11].includes(channel.type)) return config.channelIds.includes(channel.parentId)
  return channel.type === 0 && config.channelIds.includes(message.channelId || channel.id)
}
module.exports = { qualifiesPersonalXp }
