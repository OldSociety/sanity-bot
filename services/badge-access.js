const defaults = require('../config/badge-access.json')
const { badges, createBadges } = require('./badges')
const { PermissionFlagsBits } = require('discord.js')
function validateSettings(settings) {
  if (typeof settings?.enabled !== 'boolean' || !settings.roles || Object.keys(settings.roles).some(key => !badges.some(badge => badge.characterId === key))) throw new Error('Invalid badge access configuration')
  const ids = badges.map(badge => settings.roles[badge.characterId]).filter(id => id !== null)
  if (settings.botDisplayRoleId !== undefined && settings.botDisplayRoleId !== null) ids.push(settings.botDisplayRoleId)
  if (ids.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error('Badge access requires distinct configured role IDs or null')
  return settings
}
function accessRole(role, guild, bot, channels) {
  // These roles must be dedicated cosmetics, never reuse admin, gameplay,
  // subscriber or channel-access roles. Their exact IDs are explicit config.
  return Boolean(role && role.id !== guild.id && !role.managed && !role.hoist && !role.mentionable &&
    role.permissions.bitfield === 0n && bot.roles.highest.comparePositionTo(role) > 0 &&
    ![...channels.values()].some(channel => channel?.permissionOverwrites?.cache.has(role.id)))
}
function settingsForGuild(guildId, { environment = require('../config/runtime').resolveRuntime(process.env.NODE_ENV).env,
  configuredGuildId = process.env.GUILDID } = {}) {
  const selected = defaults[environment]
  if (['development', 'production'].includes(environment) && guildId === configuredGuildId && guildId === selected?.guildId) return selected
  // A configured environment override must never grant access in another guild.
  return defaults
}
function createBadgeAccess({ service, getGuild, guildId, settings = settingsForGuild(guildId) }) {
  validateSettings(settings)
  const queues = new Map()
  async function reconcile(id, userId) {
    if (id !== guildId) throw new Error('Badge access guild mismatch')
    if (!settings.enabled) return { disabled: true }
    const guild = await getGuild(id)
    if (guild.id !== id) throw new Error('Badge access adapter guild mismatch')
    const [owned, member, bot, roles, channels] = await Promise.all([service.owned(id, userId), guild.members.fetch({ user: userId, force: true }), guild.members.fetchMe({ force: true }), guild.roles.fetch(), guild.channels.fetch()])
    if (member.user.bot) return { skipped: 'bot' }
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Badge access requires ManageRoles')
    const changes = []
    for (const badge of badges) {
      const roleId = settings.roles[badge.characterId]
      if (!roleId) continue
      const role = roles.get(roleId)
      if (!accessRole(role, guild, bot, channels)) throw new Error('Badge access role must be an editable cosmetic role with zero permissions and no channel overwrites')
      const wanted = owned.includes(badge.id), has = member.roles.cache.has(roleId)
      if (wanted !== has) changes.push({ roleId, present: wanted })
    }
    // Validate every role before applying any. Ownership is durable desired
    // state: crash after a role add is safe to retry using freshly fetched roles.
    for (const change of changes) {
      if (change.present) await member.roles.add(change.roleId, 'Permanent badge ownership')
      else await member.roles.remove(change.roleId, 'No permanent badge ownership')
    }
    return { changes }
  }
  function reconcileUser(id, userId) {
    const key = `${id}:${userId}`
    const previous = queues.get(key) || Promise.resolve()
    const work = previous.catch(() => {}).then(() => reconcile(id, userId))
    queues.set(key, work)
    work.finally(() => { if (queues.get(key) === work) queues.delete(key) }).catch(() => {})
    return work
  }
  return { reconcileUser }
}
async function configureEmojiAccess(guild, settings = settingsForGuild(guild.id)) {
  validateSettings(settings)
  if (!settings.enabled) throw new Error('Badge access configuration must be explicitly enabled')
  const [bot, roles, emojis, channels] = await Promise.all([guild.members.fetchMe({ force: true }), guild.roles.fetch(), guild.emojis.fetch(), guild.channels.fetch()])
  if (!bot.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) throw new Error('Emoji restriction setup requires ManageGuildExpressions')
  const botRole = settings.botDisplayRoleId ? roles.get(settings.botDisplayRoleId) : bot.roles.botRole
  if (!botRole || (settings.botDisplayRoleId ? !accessRole(botRole, guild, bot, channels) || !bot.roles.cache.has(botRole.id) : !botRole.managed)) {
    throw new Error('Dedicated bot display role required for badge display')
  }
  const changes = []
  for (const badge of badges) {
    const roleId = settings.roles[badge.characterId]
    if (!roleId || !badge.emojiName) continue
    if (!accessRole(roles.get(roleId), guild, bot, channels)) throw new Error('Invalid cosmetic badge role')
    const matches = [...emojis.values()].filter(emoji => emoji.name === badge.emojiName)
    if (matches.length !== 1 || matches[0].managed || matches[0].available === false) throw new Error('Badge emoji must exist uniquely, be available and unmanaged')
    const allowed = [roleId, botRole.id]
    changes.push({ emoji: matches[0], roles: allowed })
  }
  // Explicit setup operation only. Runtime display/awards never edits emoji
  // restrictions or creates roles; restricting a formerly public emoji changes
  // server behavior and is performed in the reviewed development setup session.
  for (const change of changes) await change.emoji.edit({ roles: change.roles, reason: 'Restrict badge emoji to collectors and bot' })
  return changes.map(change => ({ emojiId: change.emoji.id, roles: change.roles }))
}
async function reconcileGuildUser(guild, userId, sequelize) {
  if (!settingsForGuild(guild.id).enabled) return { disabled: true }
  return createBadgeAccess({ service: createBadges({ sequelize }), getGuild: async () => guild, guildId: guild.id }).reconcileUser(guild.id, userId)
}
module.exports = { validateSettings, createBadgeAccess, configureEmojiAccess, reconcileGuildUser, settingsForGuild }
