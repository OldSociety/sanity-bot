const { createHash } = require('node:crypto')
const { Op } = require('sequelize')
const { config: defaultEvent, getEventState } = require('./config')
const { calculateRefill } = require('./participants')
const WEEK = 7 * 24 * 60 * 60 * 1000
class NotDue extends Error {}

// Separate from Resident announcements: no role mentions, DMs or unregistered
// recipients. An attempted/ambiguous reminder reserves its weekly cooldown too.
function createBucketReminders({ models, economy, participants, notifications, guildId, channelId,
  getChannel, event = defaultEvent, clock = () => new Date(), onError = () => {} }) {
  if (!guildId || !channelId || typeof getChannel !== 'function') throw new Error('Bucket reminder guild/channel required')
  const scope = { eventId: event.eventId, guildId }
  const ownerWhere = { ...scope, operationType: 'candy_bucket_reminder' }
  let running = null, checkedSlot = null
  async function active(now, transaction) {
    if (!event.enabled || getEventState(now, event) !== 'ACTIVE') return false
    const state = await models.EventState.findOne({ where: scope, transaction })
    return !state?.actionsPaused && !state?.archivedAt
  }
  async function current(receipt, now, transaction) {
    if (getEventState(now, event) !== 'ACTIVE' || receipt.channelId !== channelId) return false
    const player = await models.Participant.findOne({ where: { ...scope, userId: receipt.userId }, transaction })
    return Boolean(player?.registeredAt && player.id === receipt.participantId &&
      new Date(now).getTime() < Date.parse(receipt.expiresAt) &&
      calculateRefill({ candy: player.candy, refillAnchor: player.refillAnchor, now, event }).candy === event.candy.capacity)
  }
  async function drain() {
    const pending = await economy.read(async transaction => {
      const owners = await models.Operation.findAll({ where: ownerWhere, transaction })
      const rows = owners.length ? await models.Notification.findAll({
        where: { operationId: { [Op.in]: owners.map(row => row.operationId) }, status: 'pending' }, transaction }) : []
      return owners.filter(owner => rows.some(row => row.operationId === owner.operationId))
    })
    for (const owner of pending) {
      try {
        const isCurrent = () => economy.read(transaction => current(owner.receipt, clock(), transaction))
        if (!await isCurrent()) {
          await economy.execute({ ...scope, actorId: 'system', operationType: 'bucket_reminder_expiry',
            workerKey: `bucket-expire:${owner.operationId}` }, async ctx => {
            if (await current(owner.receipt, ctx.now, ctx.transaction)) throw new NotDue()
            const [cancelled] = await models.Notification.update({ status: 'cancelled' }, {
              where: { operationId: owner.operationId, status: 'pending' }, transaction: ctx.transaction })
            await ctx.record({ userId: owner.receipt.userId, resource: 'notification_cancel', delta: 0,
              metadata: { ownerOperationId: owner.operationId, reason: 'bucket_no_longer_full_or_expired', cancelled } })
            return { cancelled }
          })
          continue
        }
        const canDeliver = () => economy.read(async transaction =>
          await active(clock(), transaction) && await current(owner.receipt, clock(), transaction))
        if (!await canDeliver()) continue
        const channel = await getChannel(channelId)
        if (!channel || channel.id !== channelId || channel.guildId !== guildId || typeof channel.send !== 'function') throw new Error('Bucket reminder channel scope mismatch')
        await notifications.deliver(owner.operationId, channel, { canDeliver })
      } catch (error) { if (!(error instanceof NotDue)) onError(error) }
    }
  }
  async function run() {
    if (!event.enabled) return { skipped: 'disabled' }
    // Expire pending notifications even after closure; never resend sending or
    // uncertain rows. Admin evidence/recovery remains their resolution path.
    await drain()
    const now = clock()
    if (!await economy.read(transaction => active(now, transaction))) return { skipped: 'inactive' }
    const slot = Math.floor(new Date(now).getTime() / event.candy.refillIntervalMs)
    if (checkedSlot === slot) return { skipped: 'already_checked' }
    const players = await economy.read(transaction => models.Participant.findAll({
      where: { ...scope, registeredAt: { [Op.ne]: null } }, transaction }))
    for (const player of players) {
      if (calculateRefill({ candy: player.candy, refillAnchor: player.refillAnchor, now, event }).candy < event.candy.capacity) continue
      try {
        const last = await economy.read(transaction => models.Operation.findOne({
          where: { ...ownerWhere, actorId: player.userId }, order: [['createdAt', 'DESC'], ['operationId', 'DESC']], transaction }))
        if (last && new Date(now) - new Date(last.createdAt) < WEEK) continue
        const revision = createHash('sha256').update(last?.operationId || 'first').digest('hex').slice(0, 24)
        await economy.execute({ ...scope, actorId: player.userId, operationType: 'candy_bucket_reminder',
          workerKey: `bucket:${player.id}:${revision}` }, async ctx => {
          if (!await active(ctx.now, ctx.transaction)) throw new NotDue()
          const latest = await models.Operation.findOne({ where: { ...ownerWhere, actorId: player.userId,
            operationId: { [Op.ne]: ctx.operationId } }, order: [['createdAt', 'DESC'], ['operationId', 'DESC']], transaction: ctx.transaction })
          if ((latest?.operationId || null) !== (last?.operationId || null) ||
            (latest && ctx.now - new Date(latest.createdAt) < WEEK)) throw new NotDue()
          const receipt = { userId: player.userId, participantId: player.id, channelId,
            expiresAt: new Date(ctx.now.getTime() + WEEK).toISOString() }
          if (!await current(receipt, ctx.now, ctx.transaction)) throw new NotDue()
          // Materialize the accrued cap and discard overflow in the same root
          // transaction as its outbox. No interaction/action candy is consumed.
          await participants.prepare(ctx, player.userId)
          await notifications.enqueue(ctx, channelId, [{ public: true, payload: {
            content: `<@${player.userId}>`,
            allowedMentions: { parse: [], users: [player.userId], roles: [], repliedUser: false },
            embeds: [{ title: '🍬 Your Candy Bucket Is Overflowing!', color: 0xF39C12,
              description: 'Your bucket is brimming with candy! Spend some on **/spooky trick** or **/spooky treat** before more sweets tumble into the shadows.' }],
          } }])
          await ctx.record({ userId: player.userId, resource: 'bucket_reminder', delta: 0, metadata: receipt })
          return receipt
        })
      } catch (error) { if (!(error instanceof NotDue)) onError(error) }
    }
    checkedSlot = slot
    await drain()
    return { checked: players.length }
  }
  function tick() {
    if (running) return running
    running = run().finally(() => { running = null })
    return running
  }
  return { tick }
}
module.exports = { createBucketReminders, WEEK }
