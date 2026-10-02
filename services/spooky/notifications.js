const { createHash } = require('node:crypto')
const { preparePayload } = require('./token-art')
const { serialize } = require('./economy')
function createNotifications({ models }) {
  // Projection SQL shares the root queue, but network calls never hold it.
  // Otherwise another message/action could roll back our send acknowledgement.
  const store = work => serialize(models.Notification.sequelize, work)
  async function enqueue(ctx, channelId, messages) {
    for (let ordinal = 0; ordinal < messages.length; ordinal++) if (messages[ordinal].public) {
      await models.Notification.create({ operationId: ctx.operationId, ordinal, channelId, payload: messages[ordinal].payload }, { transaction: ctx.transaction })
    }
  }
  async function deliver(operationId, channel, { notificationId, canDeliver = async () => true } = {}) {
    const rows = await store(() => models.Notification.findAll({ where: { operationId, ...(notificationId !== undefined && { id: notificationId }) }, order: [['ordinal', 'ASC']] }))
    let allSent = rows.length > 0
    for (const row of rows) {
      if (channel.id && channel.id !== row.channelId) throw new Error('Notification channel mismatch')
      if (row.status === 'cancelled') { allSent = false; continue }
      if (row.status === 'sent') continue
      // Scheduled reminders may expire or pause while resolving their channel.
      // A definite pre-claim skip leaves the row pending for audited expiry.
      if (await canDeliver(row) !== true) { allSent = false; continue }
      // Claim before sending. A crash/network ambiguity never silently resends
      // after Discord's short nonce window: admin repair must resolve uncertainty.
      const [claimed] = await store(() => models.Notification.update({ status: 'sending', lastError: null }, { where: { id: row.id, status: 'pending' } }))
      if (!claimed) throw new Error('Notification requires delivery inspection')
      try {
        // A delayed database claim can cross a scheduled boundary too. No send
        // was attempted: release only our unchanged claim for expiry/retry.
        if (await canDeliver(row) !== true) {
          await store(() => models.Notification.update({ status: 'pending' }, { where: { id: row.id, status: 'sending' } }))
          allSent = false
          continue
        }
        const nonce = createHash('sha256').update(`${operationId}:${row.ordinal}`).digest('hex').slice(0, 24)
        const message = await channel.send({ ...preparePayload(row.payload), nonce, enforceNonce: true })
        const [saved] = await store(() => models.Notification.update({ status: 'sent', messageId: message.id }, { where: { id: row.id, status: 'sending' } }))
        if (!saved) {
          const current = await store(() => models.Notification.findByPk(row.id))
          if (current?.status !== 'sent' || current.messageId !== message.id) allSent = false
        }
      } catch (error) {
        await store(() => models.Notification.update({ status: 'uncertain', lastError: String(error.message).slice(0, 500) }, { where: { id: row.id, status: 'sending' } }))
        throw error
      }
    }
    return { allSent }
  }
  return { enqueue, deliver }
}

module.exports = { createNotifications }
