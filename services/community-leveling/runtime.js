const { selectConfig } = require('./config')
const { excludedMember } = require('../member-policy')
const instances = new WeakMap()
function qualifies(message, config) {
  return config.enabled && message.guild?.id === config.guildId && message.member && !message.author?.bot &&
    !excludedMember(message.member) && !message.webhookId && !message.interaction && !message.interactionMetadata &&
    ![20, 23].includes(message.type) && !message.content?.trimStart().startsWith('/') && Boolean(message.content?.trim()) &&
    [0, 5, 10, 11].includes(message.channel?.type) && (config.channelIds.includes(message.channelId) ||
      ([10, 11].includes(message.channel?.type) && config.channelIds.includes(message.channel.parentId)))
}
async function campaignRecipients(guild, config) {
  const roles = await guild.roles.fetch()
  if (config.campaignRoleIds.some(id => !roles.has(id)) || config.excludedRoleIds.some(id => !roles.has(id))) throw new Error('Configured campaign role unavailable')
  const recipients = [], seen = new Set()
  let after
  for (;;) {
    const page = await guild.members.list({ limit: 1000, after, cache: false })
    for (const member of page.values()) {
      if (seen.has(member.id)) throw new Error('Campaign roster pagination repeated a member')
      seen.add(member.id)
      if (!excludedMember(member) && !member.user.bot && config.campaignRoleIds.some(id => member.roles.cache.has(id)) &&
        !config.excludedRoleIds.some(id => member.roles.cache.has(id))) recipients.push({ userId: member.id, userName: member.user.username })
    }
    if (page.size < 1000) return recipients
    const next = [...page.keys()].at(-1)
    if (!next || next === after) throw new Error('Campaign roster pagination failed')
    after = next
  }
}
async function handleMessage(message, User) {
  const config = selectConfig()
  if (config.enabled && config.guildId !== process.env.GUILDID) throw new Error('Community configuration must match the selected environment guild')
  if (!qualifies(message, config)) return { credited: false }
  if (!instances.has(User.sequelize)) instances.set(User.sequelize, require('./economy').createCommunity({ User,
    models: require('./models').defineModels(User.sequelize), config,
    resolveRecipients: async id => campaignRecipients(await message.client.guilds.fetch(id), config) }))
  return instances.get(User.sequelize).earn({ guildId: message.guild.id, userId: message.author.id,
    userName: message.author.username, messageId: message.id, now: new Date(message.createdTimestamp) })
}
module.exports = { qualifies, campaignRecipients, handleMessage }
