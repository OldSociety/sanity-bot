function createLeaderboard({ models, economy, User, badges }) {
  return async (scope, page = 1) => {
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Invalid leaderboard page')
    return economy.read(async transaction => {
      const players = await models.Participant.findAll({ where: scope, transaction })
      const entries = await models.Ledger.findAll({ where: { ...scope, resource: ['treatPrestige', 'trickPrestige'] }, transaction })
      const ranked = players.filter(player => player.registeredAt).map(player => {
        const actions = entries.filter(entry => entry.userId === player.userId &&
          (entry.metadata?.participantId !== undefined ? entry.metadata.participantId === player.id : new Date(entry.timestamp) >= new Date(player.registeredAt)))
        const score = actions.reduce((n, row) => n + row.delta, 0)
        if (!Number.isSafeInteger(score) || score !== player.treatPrestige + player.trickPrestige) throw new Error('Leaderboard prestige evidence mismatch')
        return { userId: player.userId, score, actions: actions.length }
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
