const { QueryTypes } = require('sequelize')
const eligible = type => ['spooky_trick', 'spooky_treat', 'fate_quarter_purchase'].includes(type) || /^admin_(repair|badges):/.test(type)
function createPendingNotifications({ models, economy, notifications, scope, getChannel, limit = 20 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pending notification batch')
  let running = null, afterId = 0
  async function drain() {
    const rows = await economy.read(async transaction => {
      const fetch = cursor => models.Notification.sequelize.query(`
      SELECT n.id, n.operationId, n.channelId FROM SpookyNotifications n
      JOIN SpookyOperations o ON o.operationId = n.operationId
      WHERE n.status = 'pending' AND n.id > :cursor AND o.completedAt IS NOT NULL AND o.eventId = :eventId AND o.guildId = :guildId
        AND (o.operationType IN ('spooky_trick','spooky_treat','fate_quarter_purchase')
          OR o.operationType LIKE 'admin_repair:%' OR o.operationType LIKE 'admin_badges:%')
      ORDER BY n.id ASC LIMIT :limit`, { replacements: { ...scope, limit, cursor }, type: QueryTypes.SELECT, transaction })
      let batch = await fetch(afterId)
      if (!batch.length && afterId) { afterId = 0; batch = await fetch(0) }
      return batch
    })
    const results = []
    for (const row of rows) {
      try {
        const channel = await getChannel(row.channelId)
        if (!channel || channel.id !== row.channelId || channel.guildId !== scope.guildId || typeof channel.send !== 'function') throw new Error('Pending notification channel ownership mismatch')
        const outcome = await notifications.deliver(row.operationId, channel, { notificationId: row.id,
          canDeliver: () => economy.read(async transaction => {
            const current = await models.Notification.findByPk(row.id, { transaction })
            const owner = await models.Operation.findByPk(row.operationId, { transaction })
            return Boolean(current && ['pending', 'sending'].includes(current.status) && current.operationId === row.operationId && current.channelId === row.channelId &&
              owner?.completedAt && owner.eventId === scope.eventId && owner.guildId === scope.guildId && eligible(owner.operationType))
          }) })
        results.push({ id: row.id, sent: outcome.allSent })
      } catch (error) { console.error(`Spooky pending notification ${row.id}:`, error.message); results.push({ id: row.id, error: error.message }) }
      finally { afterId = row.id }
    }
    return results
  }
  function tick() {
    if (running) return running
    running = drain().finally(() => { running = null })
    return running
  }
  // Cursed replacements, reminders, winner announcements and explicit resolution
  // copies have separate context/expiry/manual policies and are excluded here.
  // Rotate batches so permanently unresolved old channels cannot starve newer
  // rewards. The cursor is advisory/in-memory; durable claims still govern sends.
  return { tick }
}
module.exports = { createPendingNotifications }
