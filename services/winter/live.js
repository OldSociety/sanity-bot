const { config } = require('./battle')
const keyFor = (guildId, userId) => `${guildId}:${userId}`
function createLive({ getEconomy, render, canRun = () => true, guildId = () => process.env.GUILDID,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, logger = console, onPulse = async () => {} } = {}) {
  const busy = new Set(), views = new Map(), transports = new Map(), waiters = new Map()
  let timer, stopped = true
  function claim(key) {
    if (busy.has(key)) return null
    busy.add(key)
    return () => {
      const queue = waiters.get(key)
      if (queue?.length) {
        const next = queue.shift()
        if (!queue.length) waiters.delete(key)
        busy.delete(key)
        next(claim(key))
      } else busy.delete(key)
    }
  }
  function acquire(key) {
    const release = claim(key)
    if (release) return Promise.resolve(release)
    return new Promise(resolve => {
      if (!waiters.has(key)) waiters.set(key, [])
      waiters.get(key).push(resolve)
    })
  }
  const gameTime = sub => sub.receipt.diagnostic ? sub.receipt.now + Math.max(0, now() - sub.receipt.realNow) * sub.receipt.diagnostic.speed : now()
  const payload = (sub, locked = false) => {
    const result = render(sub.receipt, sub.view, { development: sub.development, now: gameTime(sub) })
    if (locked) result.components = result.components.map(row => ({ type: 1,
      components: row.toJSON().components.map(button => ({ ...button, disabled: true })) }))
    return result
  }
  function queueEdit(sub, next) {
    sub.pending = next
    transports.set(sub.key, sub)
    if (!sub.sending) sub.sending = (async () => {
      try {
        while (sub.pending) {
          const current = sub.pending
          sub.pending = null
          await Promise.resolve().then(() => sub.interaction.editReply(current))
        }
      } catch {
        sub.pending = null
        if (views.get(sub.key) === sub) views.delete(sub.key)
      } finally {
        sub.sending = null
        if (transports.get(sub.key) === sub) transports.delete(sub.key)
      }
    })()
    return sub.sending
  }
  async function lockCurrent(key) {
    const sub = views.get(key)
    if (sub) await queueEdit(sub, payload(sub, true))
  }
  async function show(interaction, receipt, view, development) {
    const key = keyFor(interaction.guildId, interaction.user.id)
    views.delete(key)
    const previous = transports.get(key)
    if (previous?.sending) await previous.sending
    const sub = { key, interaction, receipt, view, development }
    sub.cooldown = receipt.battle?.specialReadyAt > gameTime(sub)
    await interaction.editReply(payload(sub))
    if (view === 'fight' && receipt.battle?.active) {
      if (views.size >= 500) views.delete(views.keys().next().value)
      views.set(key, sub)
    }
  }
  async function pulse() {
    if (!canRun()) { views.clear(); return }
    const rows = await getEconomy().dueBattles()
    const results = await Promise.allSettled(rows.filter(row => row.guildId === guildId()).map(async row => {
      const key = keyFor(row.guildId, row.userId), release = claim(key)
      if (!release) return
      try {
        const receipt = await getEconomy().execute({ guildId: row.guildId, userId: row.userId,
          interactionId: `winter-auto:${row.battle.fightId}:${row.nextAt}`, action: 'battle-tick' })
        const sub = views.get(key)
        if (sub) {
          sub.receipt = receipt
          sub.view = receipt.view || 'fight'
          sub.cooldown = receipt.battle.specialReadyAt > gameTime(sub)
          // Delivery never replays a committed attack or a purchase.
          void queueEdit(sub, payload(sub))
          if (!receipt.battle.active) views.delete(key)
        }
      } finally { release() }
    }))
    for (const result of results) if (result.status === 'rejected') logger.error('Winter scheduled battle unavailable:', result.reason.message)
    // Re-enable a specialty control when cooldown ends, even between attacks.
    for (const [key, sub] of views) {
      const cooldown = sub.receipt.battle.specialReadyAt > gameTime(sub)
      if (cooldown !== sub.cooldown) {
        const release = claim(key)
        if (!release) continue
        try { sub.cooldown = cooldown; void queueEdit(sub, payload(sub)) }
        finally { release() }
      }
    }
    await onPulse()
  }
  function schedule() {
    if (stopped) return
    timer = setTimer(async () => {
      try { await pulse() } catch (error) { logger.error('Winter battle worker unavailable:', error.message) }
      schedule()
    }, config.workerIntervalMs)
    timer?.unref?.()
  }
  function start() { if (!stopped) return; stopped = false; schedule() }
  function stop() { stopped = true; if (timer) clearTimer(timer); views.clear() }
  async function flush() { await Promise.allSettled([...transports.values()].map(sub => sub.sending)) }
  return { claim, acquire, lockCurrent, show, pulse, start, stop, flush, busy, views }
}
module.exports = { createLive, keyFor }
