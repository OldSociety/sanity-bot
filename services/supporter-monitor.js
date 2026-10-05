const instances = new WeakMap()

async function inspectSupporters(guild, roleId) {
  const roles = await guild.roles.fetch(), role = roles.get(roleId)
  if (!role) throw new Error('Configured supporter role is unavailable')
  // Development's Developers role is a test role, not proof of payment.
  // Outside subscriptions require their own authoritative status source.
  if (!role.managed || role.tags?.premiumSubscriberRole !== true) return { skipped: 'not_native_discord_boost_role' }
  let after
  const seen = new Set(), mismatches = []
  let active = 0, holders = 0
  for (;;) {
    const page = await guild.members.list({ limit: 1000, after, cache: false })
    for (const member of page.values()) {
      if (seen.has(member.id)) throw new Error('Supporter roster pagination repeated a member')
      seen.add(member.id)
      if (member.user.bot) continue
      const boosting = Number.isFinite(member.premiumSinceTimestamp) && member.premiumSinceTimestamp > 0
      const hasRole = member.roles.cache.has(roleId)
      active += Number(boosting); holders += Number(hasRole)
      if (boosting !== hasRole) mismatches.push({ userId: member.id, boosting, hasRole })
    }
    if (page.size < 1000) break
    const next = [...page.keys()].at(-1)
    if (!next || next === after) throw new Error('Supporter roster pagination failed')
    after = next
  }
  // Discord owns this managed role; never try to assign/remove it ourselves.
  return { checked: seen.size, active, holders, mismatches }
}

function start(client, { guildId = process.env.GUILDID, roleId = process.env.BOOSTERROLEID,
  intervalMs = 60 * 60 * 1000, logger = console } = {}) {
  if (instances.has(client)) return instances.get(client)
  let pending, timer, stopped = false
  const tick = () => {
    if (stopped) return Promise.resolve({ skipped: 'stopped' })
    if (pending) return pending
    pending = (async () => {
      if (!guildId || !roleId) throw new Error('Supporter guild/role not configured')
      const guild = await client.guilds.fetch(guildId)
      if (guild.id !== guildId) throw new Error('Supporter monitoring is restricted to the configured guild')
      const result = await inspectSupporters(guild, roleId)
      if (result.mismatches?.length) logger.error('Supporter role/status mismatch:', JSON.stringify(result.mismatches))
      return result
    })().catch(error => { logger.error('Supporter status check failed:', error.message); return { failed: true } })
      .finally(() => { pending = null })
    return pending
  }
  const ready = () => { if (stopped || timer) return; void tick(); timer = setInterval(tick, intervalMs); timer.unref?.() }
  const monitor = { tick, stop: () => { stopped = true; clearInterval(timer); client.off?.('ready', ready); instances.delete(client) } }
  instances.set(client, monitor)
  if (client.isReady?.()) ready(); else client.once('ready', ready)
  return monitor
}

module.exports = { start, inspectSupporters }
