const path = require('node:path')
const { createJsonStore } = require('./async-state')
const settings = require('../../config/arena/progression/settings.json')

function createPlayerProgression({
  file = path.resolve(__dirname, `../../config/arena/state/arena-player-progression-${process.env.NODE_ENV === 'production' ? 'production' : 'development'}.json`),
  config = settings,
} = {}) {
  if (config.startingLevel !== 1 || config.maxLevel !== 60 || config.xpRewardsEnabled !== false)
    throw Error('Arena progression currently requires level1–60 and disabled XP rewards')
  const validLevel = level => Number.isInteger(level) && level >= config.startingLevel && level <= config.maxLevel
  const validRecord = row => row && validLevel(row.level) && row.xp === 0 && Number.isSafeInteger(row.revision) && row.revision >= 0 &&
    row.operations && typeof row.operations === 'object' && !Array.isArray(row.operations) &&
    Object.values(row.operations).every(operation => operation && validLevel(operation.level) && typeof operation.reason === 'string' && operation.receipt && validLevel(operation.receipt.level))
  const store = createJsonStore(file, {
    empty: () => ({ schema: 1, players: {} }),
    validate: data => Boolean(data && data.schema === 1 && data.players && typeof data.players === 'object' && !Array.isArray(data.players) && Object.values(data.players).every(validRecord)),
  })
  const keyFor = (guildId, userId) => {
    if (!/^\d{17,20}$/.test(guildId || '') || !/^\d{17,20}$/.test(userId || '')) throw Error('Arena progression requires player and guild IDs')
    return `${guildId}:${userId}`
  }
  const fresh = () => ({ level: config.startingLevel, xp: 0, revision: 0, operations: {} })
  const publicRecord = row => ({ level: row.level, xp: row.xp, revision: row.revision, xpRewardsEnabled: false })
  async function get(guildId, userId) {
    const key = keyFor(guildId, userId)
    const data = await store.read()
    return publicRecord(data.players[key] || fresh())
  }
  // Trusted service hook for future progression events. No Discord setter or XP source is enabled.
  async function advanceLevel(guildId, userId, level, { operationId, reason } = {}) {
    const key = keyFor(guildId, userId)
    if (!validLevel(level) || typeof operationId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(operationId) ||
        typeof reason !== 'string' || !reason.trim() || reason.length > 256) throw Error('Invalid Arena level advancement')
    let receipt
    await store.update(data => {
      const row = data.players[key] || fresh()
      const previous = Object.hasOwn(row.operations, operationId) ? row.operations[operationId] : null
      if (previous) {
        if (previous.level !== level || previous.reason !== reason) throw Error('Arena level operation was already used for another request')
        receipt = structuredClone(previous.receipt)
        return
      }
      if (level < row.level) throw Error('Arena level advancement cannot lower the player level')
      const next = { ...row, level, revision: row.revision + (level > row.level ? 1 : 0) }
      receipt = { ...publicRecord(next), previousLevel: row.level, operationId }
      next.operations = { ...row.operations, [operationId]: { level, reason, receipt } }
      return { ...data, players: { ...data.players, [key]: next } }
    })
    return receipt
  }
  return { get, advanceLevel }
}
let runtime
module.exports = { createPlayerProgression, playerProgression: {
  get: (...args) => (runtime ||= createPlayerProgression()).get(...args),
  advanceLevel: (...args) => (runtime ||= createPlayerProgression()).advanceLevel(...args),
} }
