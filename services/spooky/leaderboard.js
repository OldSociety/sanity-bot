function createLeaderboard({ models, economy, User, badges, eligibleUserIds = null }) {
  return async (scope, page = 1) => {
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Invalid leaderboard page')
    return economy.read(async transaction => {
      const players = await models.Participant.findAll({ where: scope, transaction })
      const entries = await models.Ledger.findAll({ where: { ...scope, resource: ['treatPrestige', 'trickPrestige', 'crownPrestigeTenths'] }, transaction })
      const byUser = new Map()
      for (const entry of entries) {
        if (!byUser.has(entry.userId)) byUser.set(entry.userId, [])
        byUser.get(entry.userId).push(entry)
      }
      const ranked = players.filter(player => player.registeredAt && (!eligibleUserIds || eligibleUserIds.has(player.userId))).map(player => {
        const actions = (byUser.get(player.userId) || []).filter(entry =>
          (entry.metadata?.participantId !== undefined ? entry.metadata.participantId === player.id : new Date(entry.timestamp) >= new Date(player.registeredAt)))
        const baseRows = actions.filter(row => row.resource !== 'crownPrestigeTenths')
        const bonusRows = actions.filter(row => row.resource === 'crownPrestigeTenths')
        const baseByOperation = new Map()
        for (const row of baseRows) if (!baseByOperation.has(row.operationId)) baseByOperation.set(row.operationId, row)
        if (new Set(bonusRows.map(row => row.operationId)).size !== bonusRows.length || bonusRows.some(row => {
          const base = baseByOperation.get(row.operationId)
          return !base || row.metadata.participantId !== player.id || row.metadata.scoringVersion !== base.metadata.scoringVersion || row.metadata.track !== (base.resource === 'treatPrestige' ? 'treat' : 'trick') || row.delta <= 0 || !Number.isSafeInteger(row.delta) || row.metadata.holderId !== player.userId || row.metadata.baseDelta !== row.delta ||
            row.delta !== base.delta - (['sweet_tooth', 'steal_crown'].includes(base.metadata.outcome) ? base.metadata.bonus || 0 : 0)
        })) throw new Error('Leaderboard Crown evidence mismatch')
        const score = baseRows.reduce((n, row) => n + row.delta, 0)
        const crownBonus = bonusRows.reduce((n, row) => n + row.delta, 0)
        if (!Number.isSafeInteger(score) || score !== player.treatPrestige + player.trickPrestige || !Number.isSafeInteger(crownBonus) || crownBonus < 0) throw new Error('Leaderboard prestige evidence mismatch')
        const scoreTenths = score * 10 + crownBonus
        if (!Number.isSafeInteger(scoreTenths)) throw new Error('Leaderboard prestige overflow')
        return { userId: player.userId, score: scoreTenths, actions: baseRows.length }
      }).filter(player => player.actions).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
      return Promise.all(ranked.slice((page - 1) * 10, page * 10).map(async (player, index) => {
        const user = await User.findByPk(player.userId, { transaction })
        return { rank: ranked.findIndex(row => row.score === player.score) + 1, userId: player.userId,
          name: user?.user_name || player.userId, badges: badges ? await badges.owned(scope.guildId, player.userId, transaction) : [] }
      }))
    })
  }
}
module.exports = { createLeaderboard }
