// Channel IDs come only from the environment selected by config/runtime.
// Names/categories and channels in another server never confer permission.
function allowedChannels(settings = process.env) {
  return [...new Set([settings.SPOOKYCHANNELID, settings.BOTTESTCHANNELID].filter(Boolean))]
}
function channelRestriction(interaction, settings = process.env) {
  const { privateScreen } = require('./presentation')
  if (!settings.GUILDID || interaction.guildId !== settings.GUILDID) {
    return privateScreen('🎃 Spooky — Server Only', 'Use Spooky in the configured server.')
  }
  const ids = allowedChannels(settings)
  if (!ids.length || ids.some(id => !/^\d{17,20}$/.test(id))) {
    return privateScreen('🎃 Spooky — Channel Unavailable', 'The Spooky and bot-testing channels need configuration.')
  }
  return ids.includes(interaction.channelId) ? null : privateScreen('🎃 Spooky — Channel Only',
    `Use Spooky in ${ids.map(id => `<#${id}>`).join(' or ')}. Game embeds appear in the channel where you play.`)
}
module.exports = { allowedChannels, channelRestriction }
