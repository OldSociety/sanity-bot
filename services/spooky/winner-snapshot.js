const { Op } = require('sequelize')
const { config: defaultEvent, getEventState } = require('./config')
function overallTrack(tracks) {
  const combined = new Map()
  const scaled = ['treat', 'trick'].some(track => tracks[track].entrants.some(row => row.crownBonusTenths !== undefined))
  for (const track of ['treat', 'trick']) for (const row of tracks[track].entrants) {
    const entry = combined.get(row.userId) || { userId: row.userId, participantId: row.participantId, score: 0, actions: 0, treats: 0, tricks: 0 }
    entry.score += row.score; entry.actions += row.actions; entry[track === 'treat' ? 'treats' : 'tricks'] += row.actions
    if (![entry.score, entry.actions, entry.treats, entry.tricks].every(Number.isSafeInteger)) throw new Error('Overall prestige overflow')
    combined.set(row.userId, entry)
    if (scaled) entry.crownBonusTenths = (entry.crownBonusTenths || 0) + (row.crownBonusTenths || 0)
  }
  if (scaled) for (const entry of combined.values()) {
    entry.scoreTenths = entry.score * 10 + entry.crownBonusTenths
    if (!Number.isSafeInteger(entry.scoreTenths) || !Number.isSafeInteger(entry.crownBonusTenths) || entry.crownBonusTenths < 0) throw new Error('Overall Crown prestige overflow')
    entry.score = entry.scoreTenths / 10
  }
  const entrants = [...combined.values()].sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
  const score = entrants.length ? entrants[0].score : null
  return { entrants, score, userIds: entrants.filter(entry => entry.score === score).map(entry => entry.userId).sort() }
}

function snapshotOperationId(eventId, guildId) {
  return `worker:${eventId}:${guildId}:winner-snapshot`
}

// Internal DB API: the caller owns the root economy transaction. The companion
// worker receipt freezes results atomically with closure, without a nested BEGIN
// or another schema. Inventory and permanent badge ownership are never touched.
function createWinnerSnapshot({ models, event = defaultEvent }) {
  async function freeze(ctx) {
    if (!event.enabled || ctx.scope.eventId !== event.eventId || getEventState(ctx.now, event) !== 'CLOSED') throw new Error('Winner snapshot requires the closed enabled event')
    if (event.prestige?.status !== 'approved') throw new Error('Winner snapshot requires approved prestige scoring')
    const operationId = snapshotOperationId(ctx.scope.eventId, ctx.scope.guildId)
    const prior = await models.Operation.findByPk(operationId, { transaction: ctx.transaction })
    if (prior) {
      const saved = prior.receipt
      if (prior.eventId !== ctx.scope.eventId || prior.guildId !== ctx.scope.guildId || prior.actorId !== 'system' ||
        prior.operationType !== 'winner_snapshot' || !prior.completedAt || !saved ||
        saved.eventId !== ctx.scope.eventId || saved.guildId !== ctx.scope.guildId ||
        !Number.isFinite(Date.parse(saved.frozenAt)) || !Number.isFinite(Date.parse(saved.endsAt)) ||
        Date.parse(saved.frozenAt) < Date.parse(saved.endsAt) ||
        !Number.isSafeInteger(saved.scoringVersion) || saved.scoringVersion < 1 ||
        saved.policy?.adminEligible !== true || saved.policy?.ties !== 'shared' || saved.policy?.allowBothTitles !== true) throw new Error('Winner snapshot receipt is invalid')
      for (const track of ['treat', 'trick']) {
        const data = saved.tracks?.[track]
        if (!data || !Array.isArray(data.entrants) || !Array.isArray(data.userIds) ||
          data.entrants.some(entry => typeof entry.userId !== 'string' || !entry.userId || !Number.isSafeInteger(entry.score) || !Number.isSafeInteger(entry.actions) || entry.actions < 1 ||
            entry.crownBonusTenths !== undefined && (!Number.isSafeInteger(entry.crownBonusTenths) || entry.crownBonusTenths < 0)) ||
          new Set(data.entrants.map(entry => entry.userId)).size !== data.entrants.length) throw new Error('Winner snapshot receipt is invalid')
        const top = data.entrants.length ? Math.max(...data.entrants.map(entry => entry.score)) : null
        const leaders = data.entrants.filter(entry => entry.score === top).map(entry => entry.userId).sort()
        if (top !== data.score || JSON.stringify(leaders) !== JSON.stringify(data.userIds)) throw new Error('Winner snapshot receipt is invalid')
      }
      if (saved.tracks.overall && JSON.stringify(saved.tracks.overall) !== JSON.stringify(overallTrack(saved.tracks))) throw new Error('Winner overall proof is invalid')
      return { operationId, frozenAt: saved.frozenAt, newlyFrozen: false }
    }
    const players = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
    const entries = await models.Ledger.findAll({ attributes: ['id', 'operationId', 'userId', 'resource', 'timestamp', 'delta', 'metadata'], where: { ...ctx.scope,
      resource: { [Op.in]: ['treatPrestige', 'trickPrestige', 'crownPrestigeTenths', 'crown_holder'] },
      timestamp: { [Op.gte]: new Date(event.startsAt), [Op.lt]: new Date(event.endsAt) },
    }, order: [['id', 'ASC']], transaction: ctx.transaction })
    const grouped = new Map()
    for (const entry of entries) {
      const key = JSON.stringify([entry.userId, entry.resource])
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(entry)
    }
    const validDeltas = new Set(['success', 'failure', 'curseReplacement', 'noEffect'].map(key => event.prestige[key]))
    const tracks = {}
    for (const [track, resource] of [['treat', 'treatPrestige'], ['trick', 'trickPrestige']]) {
      const entrants = []
      for (const player of players) {
        if (!player.registeredAt) continue
        const registeredAt = new Date(player.registeredAt).getTime()
        if (!Number.isFinite(registeredAt) || registeredAt >= Date.parse(event.endsAt)) throw new Error('Invalid winner registration timestamp')
        const actions = (grouped.get(JSON.stringify([player.userId, resource])) || []).filter(entry =>
          (entry.metadata?.participantId !== undefined ? entry.metadata.participantId === player.id : new Date(entry.timestamp).getTime() >= registeredAt))
        if (!Number.isSafeInteger(player[resource])) throw new Error('Invalid prestige balance')
        let score = 0
        for (const entry of actions) {
          const bonus = entry.metadata?.bonus || 0
          const allowedBonus = ['sweet_tooth', 'steal_crown'].includes(entry.metadata?.outcome) ? event.crown?.prestigeBonus : event.prestigeBonuses?.[entry.metadata?.outcome]
          if (!Number.isSafeInteger(entry.delta) || entry.metadata?.scoringVersion !== event.prestige.version ||
            (bonus ? bonus !== allowedBonus || entry.metadata.base !== event.prestige.success || entry.delta !== entry.metadata.base + bonus : !validDeltas.has(entry.delta))) throw new Error('Invalid prestige ledger version/delta')
          score += entry.delta
          if (!Number.isSafeInteger(score)) throw new Error('Prestige total overflow')
        }
        // Detect unaudited score edits or wrong generation history; never freeze
        // an apparently plausible leaderboard over inconsistent evidence.
        if (score !== player[resource]) throw new Error('Prestige balance does not match current participant ledger')
        const playerBonuses = (grouped.get(JSON.stringify([player.userId, 'crownPrestigeTenths'])) || []).filter(entry =>
          entry.metadata?.participantId === player.id || entry.metadata?.participantId === undefined && new Date(entry.timestamp).getTime() >= registeredAt)
        if (playerBonuses.some(entry => entry.metadata?.participantId !== player.id || !['treat', 'trick'].includes(entry.metadata.track))) throw new Error('Invalid Crown prestige generation/track')
        const bonuses = playerBonuses.filter(entry => entry.metadata.track === track)
        let crownBonusTenths = 0
        if (new Set(bonuses.map(entry => entry.operationId)).size !== bonuses.length) throw new Error('Duplicate Crown prestige evidence')
        for (const entry of bonuses) {
          const baseAction = actions.find(action => action.operationId === entry.operationId)
          const owner = entries.filter(row => row.resource === 'crown_holder' && row.id < entry.id).at(-1)
          // Rows loaded below include operationId; bonus must belong to exactly
          // one positive action, with the approved 10% fixed-point value.
          if (!baseAction || !owner || owner.operationId !== entry.metadata.holderOperationId || owner.metadata.holderId !== player.userId || entry.delta <= 0 || !Number.isSafeInteger(entry.delta) || entry.metadata.scoringVersion !== event.prestige.version ||
            entry.metadata.holderId !== player.userId || entry.metadata.baseDelta !== entry.delta || entry.delta !== baseAction.delta - (baseAction.metadata.outcome === 'sweet_tooth' || baseAction.metadata.outcome === 'steal_crown' ? baseAction.metadata.bonus || 0 : 0)) throw new Error('Invalid Crown prestige evidence')
          crownBonusTenths += entry.delta
        }
        if (!Number.isSafeInteger(crownBonusTenths)) throw new Error('Crown prestige overflow')
        if (actions.length) entrants.push({ userId: player.userId, participantId: player.id, score, actions: actions.length, ...(bonuses.length ? { crownBonusTenths } : {}) })
      }
      entrants.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
      const score = entrants.length ? entrants[0].score : null
      tracks[track] = { score, userIds: entrants.filter(entry => entry.score === score).map(entry => entry.userId).sort(), entrants }
    }
    tracks.overall = overallTrack(tracks)
    const receipt = { ...ctx.scope, configVersion: event.version, scoringVersion: event.prestige.version,
      endsAt: event.endsAt, frozenAt: ctx.now.toISOString(), sourceOperationId: ctx.operationId,
      policy: { adminEligible: true, ties: 'shared', allowBothTitles: true }, tracks }
    await models.Operation.create({ operationId, interactionId: null, ...ctx.scope, actorId: 'system',
      operationType: 'winner_snapshot', receipt, createdAt: ctx.now, completedAt: ctx.now }, { transaction: ctx.transaction })
    await ctx.record({ userId: 'system', resource: 'prestige_snapshot', delta: 0, metadata: {
      snapshotOperationId: operationId, scoringVersion: event.prestige.version,
      treatEntrants: tracks.treat.entrants.length, trickEntrants: tracks.trick.entrants.length,
    } })
    return { operationId, frozenAt: receipt.frozenAt, newlyFrozen: true }
  }
  return { freeze }
}

module.exports = { createWinnerSnapshot, snapshotOperationId, overallTrack }
