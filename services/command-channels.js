const defaults = require('../config/commands/channel-policy.json')

// Bot-tests is a standing command location in its exact environment/server.
// This helper expands channel scope; callers still enforce their permissions.
function withBotTests(channelIds, { guildId, environment = process.env.NODE_ENV, policy = defaults } = {}) {
  const scope = policy[environment]
  return [...new Set([...channelIds, ...(scope?.guildId === guildId && scope.botTestChannelId ? [scope.botTestChannelId] : [])].filter(Boolean))]
}
module.exports = { withBotTests }
