const { PermissionsBitField, PermissionFlagsBits } = require('discord.js')
const caches = new WeakMap()
function createPermissionSnapshot(client, { maxAgeMs = 60000, clock = Date.now } = {}) {
  const states = new Map()
  function state(guild) {
    if (!states.has(guild.id)) states.set(guild.id, { guild, generation: 0, value: null, pending: null })
    return states.get(guild.id)
  }
  function invalidate(guild) {
    for (const [id, s] of states) if (!guild || id === guild.id) { s.generation++; s.value = null }
  }
  for (const event of ['roleCreate', 'roleUpdate', 'roleDelete']) client.on(event, role => invalidate(role.guild))
  client.on('guildMemberUpdate', (_old, member) => { if (member.id === client.user?.id) invalidate(member.guild) })
  for (const event of ['guildUpdate', 'guildUnavailable', 'guildDelete']) client.on(event, guild => invalidate(guild))
  for (const event of ['shardDisconnect', 'invalidated']) client.on(event, () => invalidate())
  async function get(guild, { force = false } = {}) {
    const s = state(guild)
    if (!force && s.value && clock() - s.value.fetchedAt < maxAgeMs) return { ...s.value, cacheHit: true }
    if (!s.pending) s.pending = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const generation = s.generation
        const [bot, roles] = await Promise.all([guild.members.fetchMe({ force: true }), guild.roles.fetch()])
        if (generation !== s.generation) continue
        const permissions = new PermissionsBitField(bot.permissions.bitfield)
        const rolePermissions = new Map([...roles.values()].map(role => [role.id, role.editable === true]))
        s.value = { fetchedAt: clock(), canManageNicknames: permissions.has(PermissionFlagsBits.ManageNicknames),
          canManageRole: id => permissions.has(PermissionFlagsBits.ManageRoles) && rolePermissions.get(id) === true }
        return { ...s.value, cacheHit: false }
      }
      throw new Error('Discord permissions changed during snapshot refresh; try again shortly')
    })().finally(() => { s.pending = null })
    return s.pending
  }
  // Refresh only previously used guilds, away from the ordinary request path.
  const timer = setInterval(() => {
    for (const s of states.values()) void get(s.guild, { force: true }).catch(() => invalidate(s.guild))
  }, maxAgeMs)
  timer.unref?.()
  return { get, invalidate, close: () => clearInterval(timer) }
}
function permissionSnapshot(guild) {
  if (!caches.has(guild.client)) caches.set(guild.client, createPermissionSnapshot(guild.client,
    { maxAgeMs: require('../../config/spooky-performance.json').permissionMaxAgeMs }))
  return caches.get(guild.client)
}
async function hydratePermissions(guild, snapshot, roleIds, interaction) {
  const timing = require('./command-timing')
  const work = () => permissionSnapshot(guild).get(guild)
  const permissions = interaction ? await timing.phase(interaction, 'permission_snapshot_ms', work) : await work()
  if (interaction) timing.detail(interaction, 'permission_cache_hit', permissions.cacheHit)
  const members = await require('../guild-members').memberDirectory(guild).get(guild)
  for (const row of snapshot) {
    const member = members.get(row.userId)
    row.canManageCurse = permissions.canManageRole(roleIds.curse)
    row.canManageSweetTooth = permissions.canManageRole(roleIds.sweetTooth)
    row.canManageNickname = member?.manageable === true && permissions.canManageNicknames
  }
}
module.exports = { createPermissionSnapshot, permissionSnapshot, hydratePermissions }
