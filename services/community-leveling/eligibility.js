const { excludedMember } = require('../member-policy')
function qualifies(message, config) {
  return config.enabled && message.guild?.id === config.guildId && message.member && !message.author?.bot &&
    !excludedMember(message.member) && !message.webhookId && !message.interaction && !message.interactionMetadata &&
    ![20, 23].includes(message.type) && !message.content?.trimStart().startsWith('/') && Boolean(message.content?.trim()) &&
    [0, 5, 10, 11].includes(message.channel?.type) && (config.channelIds.includes(message.channelId) ||
      ([10, 11].includes(message.channel?.type) && config.channelIds.includes(message.channel.parentId)))
}
module.exports = { qualifies }
