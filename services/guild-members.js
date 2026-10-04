const { randomBytes } = require('node:crypto')
const directories = new WeakMap()

// One complete directory per client, shared by gameplay and legacy consumers.
// Never promote Discord's potentially partial member cache to a complete roster.
function createMemberDirectory(client, { clock = Date.now, intervalMs = 31000, timeoutMs = 15000 } = {}) {
  const states = new Map()
  const key = guild => guild.id || guild
  function state(guild) {
    if (!states.has(key(guild))) states.set(key(guild), { members: null, pending: null, nextAt: 0, patches: new Map(), generation: 0 })
    return states.get(key(guild))
  }
  function update(member, removed = false) {
    const s = states.get(key(member.guild)); if (!s) return
    const value = removed ? null : member
    if (s.pending || s.fetching) s.patches.set(member.id, value)
    if (s.members) { if (removed) s.members.delete(member.id); else s.members.set(member.id, member) }
  }
  function invalidate(guild) {
    for (const [id, s] of states) if (!guild || id === key(guild)) { s.members = null; s.generation++; s.patches.clear() }
  }
  client?.on?.('guildMemberAdd', member => update(member))
  client?.on?.('guildMemberUpdate', (_old, member) => update(member))
  client?.on?.('guildMemberRemove', member => update(member, true))
  client?.on?.('guildUnavailable', invalidate)
  client?.on?.('guildDelete', invalidate)
  client?.on?.('shardDisconnect', () => invalidate())
  client?.on?.('invalidated', () => invalidate())

  function complete(guild, members) {
    return members && Number.isSafeInteger(guild.memberCount) && members.size === guild.memberCount &&
      [...members.values()].every(member => member && !member.partial && member.id && member.user)
  }
  async function get(guild, { fresh = false } = {}) {
    const s = state(guild)
    if (s.pending) return new Map(await s.pending)
    if (!fresh && complete(guild, s.members)) return new Map(s.members)
    if (clock() < s.nextAt) throw new Error('Complete membership refresh cooling down; try again shortly')
    s.nextAt = clock() + intervalMs
    const generation = s.generation, nonce = randomBytes(12).toString('hex')
    let rejectLimit, timer
    const limited = new Promise((_resolve, reject) => { rejectLimit = reject })
    const raw = packet => {
      if (packet.t !== 'RATE_LIMITED' || packet.d?.opcode !== 8 || packet.d.meta?.guild_id !== guild.id ||
        (packet.d.meta.nonce && packet.d.meta.nonce !== nonce)) return
      const seconds = Number(packet.d.retry_after)
      s.nextAt = Math.max(s.nextAt, clock() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 1000 : intervalMs))
      rejectLimit(new Error('Discord membership request rate limited; try again shortly'))
    }
    client?.on?.('raw', raw)
    s.fetching = true
    s.pending = (async () => {
      try {
        const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Complete membership fetch timed out')), timeoutMs) })
        const fetched = await Promise.race([guild.members.fetch({ query: '', limit: 0, time: timeoutMs, nonce }), limited, deadline])
        if (generation !== s.generation) throw new Error('Guild connection changed during membership fetch')
        const members = new Map(fetched)
        for (const [id, member] of s.patches) { if (member) members.set(id, member); else members.delete(id) }
        if (!complete(guild, members)) throw new Error('Complete guild membership fetch failed')
        s.members = members
        return members
      } finally { clearTimeout(timer); client?.off?.('raw', raw); s.patches.clear(); s.fetching = false }
    })()
    try { return new Map(await s.pending) } finally { s.pending = null }
  }
  return { get, invalidate }
}
function memberDirectory(guild) {
  const owner = guild.client || guild
  if (!directories.has(owner)) directories.set(owner, createMemberDirectory(guild.client))
  return directories.get(owner)
}
module.exports = { createMemberDirectory, memberDirectory }
