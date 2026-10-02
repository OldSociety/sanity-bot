const { createHash } = require('node:crypto')
const { getEventState } = require('./config')

// Discord may add fields such as embed type. Every persisted payload field must
// still match; a manually named bot message alone is insufficient evidence.
function contains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => contains(actual[i], item))
  return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => contains(actual[key], value))
}
function createAdminResolution({ models, economy, event, scope, checkAccess, readMessage, readMember }) {
  function request(input) {
    if (!['notification', 'delivery'].includes(input.target)) throw new Error('Unknown resolution target')
    if (!Number.isSafeInteger(input.id) || input.id < 1) throw new Error('Queue ID must be positive')
    if (input.confirm !== true) throw new Error('Queue resolution requires explicit confirmation')
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) throw new Error('A reason of 1–500 characters is required')
    if (typeof input.interactionId !== 'string' || !input.interactionId.trim()) throw new Error('Resolution interaction ID is required')
    if (!['acknowledge', 'cancel', 'retry', 'resend'].includes(input.action) || (input.target === 'delivery' && input.action === 'resend')) throw new Error('Unknown resolution action')
    if (typeof input.expectedStatus !== 'string' || !['pending', 'sending', 'uncertain', 'conflict'].includes(input.expectedStatus)) throw new Error('Supply the inspected nonterminal status')
    const wanted = { target: input.target, id: input.id, action: input.action, expectedStatus: input.expectedStatus,
      reason: input.reason.trim(), confirm: true, channelId: input.channelId ?? null }
    if (input.target === 'delivery') {
      if (typeof input.expectedRevision !== 'string' || !input.expectedRevision.trim()) throw new Error('Inspected delivery revision is required')
      wanted.expectedRevision = input.expectedRevision
    }
    if (input.target === 'notification' && !['pending', 'sending', 'uncertain'].includes(input.expectedStatus)) throw new Error('Invalid notification status')
    if (input.target === 'notification' && input.action === 'acknowledge') {
      if (typeof input.messageId !== 'string' || !/^\d{17,20}$/.test(input.messageId)) throw new Error('Observed Discord message ID is required')
      wanted.messageId = input.messageId
    }
    if (input.action === 'resend' && input.expectedStatus !== 'uncertain') throw new Error('Intentional resend is only allowed for uncertain notifications')
    if (input.target === 'notification' && input.action === 'retry' && input.expectedStatus !== 'pending') throw new Error('Only a never-claimed pending notification can retry')
    return wanted
  }
  async function owned(wanted, transaction) {
    const Model = wanted.target === 'notification' ? models.Notification : models.Delivery
    const row = await Model.findByPk(wanted.id, { transaction })
    if (!row) throw new Error('Queue row not found')
    if (wanted.target === 'delivery') {
      if (row.eventId !== scope.eventId || row.guildId !== scope.guildId) throw new Error('Queue owner scope mismatch')
      return { row, userId: row.userId }
    }
    const owner = await models.Operation.findByPk(row.operationId, { transaction })
    if (!owner || owner.eventId !== scope.eventId || owner.guildId !== scope.guildId) throw new Error('Queue owner scope mismatch')
    return { row, userId: owner.receipt?.notificationOwnerUserId || owner.receipt?.request?.userId || owner.actorId }
  }
  function checkSnapshot(row, wanted) {
    if (row.status !== wanted.expectedStatus || (wanted.target === 'delivery' && row.revision !== wanted.expectedRevision)) throw new Error('Queue changed; inspect again before resolving')
    if (wanted.target === 'delivery' && !['pending', 'conflict'].includes(row.status)) throw new Error('Delivery is terminal')
  }
  async function resolve(input) {
    await checkAccess(input)
    const wanted = request(input)
    const operationType = `admin_resolution:${createHash('sha256').update(JSON.stringify(wanted)).digest('hex')}`
    const operation = { ...scope, actorId: input.actorId, interactionId: input.interactionId, operationType }
    const snapshot = await economy.read(async transaction => {
      const prior = await models.Operation.findByPk(`discord:${input.interactionId}`, { transaction })
      if (prior) return { prior: true }
      const { row, userId } = await owned(wanted, transaction)
      checkSnapshot(row, wanted)
      return { row: row.get({ plain: true }), userId }
    })
    if (snapshot.prior) return economy.execute(operation, async () => { throw new Error('Resolution replay lost its saved operation') })
    const row = snapshot.row
    let evidence = null
    // Fetch evidence before opening a mutation transaction, then revalidate the
    // queue snapshot inside it. No Discord write is allowed during resolution.
    if (wanted.target === 'notification' && wanted.action === 'acknowledge') {
      if (!readMessage) throw new Error('Trusted message evidence adapter is required')
      evidence = await readMessage({ ...scope, channelId: row.channelId, messageId: wanted.messageId })
      if (!evidence || evidence.guildId !== scope.guildId || evidence.channelId !== row.channelId || evidence.id !== wanted.messageId || evidence.isBotMessage !== true ||
        (evidence.content || '') !== (row.payload.content || '') || !contains(require('./token-art').evidenceEmbeds(row.payload, evidence), row.payload.embeds || [])) throw new Error('Message evidence does not match the saved bot notification')
    }
    if (wanted.target === 'delivery' && wanted.action !== 'cancel') {
      if (!['nickname', 'curse_role', 'sweet_tooth_role', 'final_treat_role', 'final_trick_role'].includes(row.kind) ||
        (row.kind !== 'nickname' && (typeof row.payload.roleId !== 'string' || !row.payload.roleId || typeof row.payload.present !== 'boolean')) ||
        (row.kind === 'nickname' && !(row.payload.nickname === null || (typeof row.payload.nickname === 'string' && row.payload.nickname.length <= 32)))) throw new Error('Invalid projection payload; inspect or cancel')
      if (!readMember) throw new Error('Trusted member evidence adapter is required')
      evidence = await readMember({ ...scope, userId: row.userId })
      if (!evidence || !Array.isArray(evidence.roleIds)) throw new Error('Member evidence is unavailable')
      const desired = row.kind === 'nickname' ? evidence.nickname === row.payload.nickname : evidence.roleIds.includes(row.payload.roleId) === row.payload.present
      if (wanted.action === 'acknowledge' && !desired) throw new Error('Discord state does not match the desired projection')
      if (wanted.action === 'retry' && row.kind === 'nickname' && !desired && evidence.nickname !== row.payload.expectedNickname) throw new Error('Independent nickname change remains a conflict; cancel instead of overwriting')
    }
    return economy.execute(operation, async ctx => {
      const current = await owned(wanted, ctx.transaction)
      checkSnapshot(current.row, wanted)
      if (JSON.stringify(current.row.payload) !== JSON.stringify(row.payload)) throw new Error('Queue payload changed; inspect again')
      const before = current.row.status
      let dispatch = null
      if (wanted.target === 'notification') {
        if (wanted.action === 'resend') {
          // A separate outbox row/nonce makes this a deliberate new send, never
          // a hidden reset of an ambiguous claim. Economy resources do not move.
          await current.row.update({ status: 'cancelled', lastError: null }, { transaction: ctx.transaction })
          const copy = await models.Notification.create({ operationId: ctx.operationId, ordinal: 0,
            channelId: row.channelId, payload: row.payload }, { transaction: ctx.transaction })
          dispatch = { operationId: ctx.operationId, notificationId: copy.id, channelId: copy.channelId }
        } else if (wanted.action === 'retry') dispatch = { operationId: row.operationId, notificationId: row.id, channelId: row.channelId }
        else await current.row.update({ status: wanted.action === 'acknowledge' ? 'sent' : 'cancelled',
          messageId: wanted.action === 'acknowledge' ? wanted.messageId : row.messageId, lastError: null }, { transaction: ctx.transaction })
      } else {
        if (wanted.action === 'retry') {
          if (row.kind === 'nickname' || (row.kind === 'curse_role' && row.payload.present)) {
            const player = await models.Participant.findOne({ where: { ...scope, userId: row.userId }, transaction: ctx.transaction })
            const effectType = row.kind === 'nickname' ? 'reversed_nickname' : 'curse'
            const effect = player && await models.Effect.findOne({ where: { participantId: player.id, effectType }, transaction: ctx.transaction })
            const restoring = row.kind === 'nickname' && await models.Ledger.findOne({ where: { ...scope, userId: row.userId,
              operationId: row.revision, resource: 'effect:reversed_nickname', delta: -1 }, transaction: ctx.transaction })
            const state = await models.EventState.findOne({ where: scope, transaction: ctx.transaction })
            if (!restoring && (!effect || new Date(effect.expiresAt) <= ctx.now || getEventState(ctx.now, event) !== 'ACTIVE' || state?.archivedAt)) throw new Error('Expired or orphaned application cannot retry; cancel or clear the effect')
          }
          // Retain the source revision so restoration evidence remains available
          // across repeated permission failures. Reconciliation checks fresh state.
          await current.row.update({ status: 'pending', lastError: null }, { transaction: ctx.transaction })
          dispatch = { userId: row.userId, deliveryId: row.id }
        } else await current.row.update({ status: wanted.action === 'acknowledge' ? 'done' : 'cancelled', revision: ctx.operationId, lastError: null }, { transaction: ctx.transaction })
      }
      await ctx.record({ userId: current.userId, resource: `resolution:${wanted.target}`, delta: 0,
        metadata: { adminReason: wanted.reason, request: wanted, before, after: current.row.status,
          previousRevision: row.revision ?? null, payload: row.payload,
          evidence: evidence ? { messageId: evidence.id ?? null, nickname: evidence.nickname ?? null, roleIds: evidence.roleIds ?? null } : null,
          deliberateDuplicateRisk: wanted.action === 'resend' } })
      return { request: wanted, dispatch, status: current.row.status, resourcesUnchanged: true,
        ...(wanted.target === 'notification' && { notificationOwnerUserId: current.userId }) }
    })
  }
  return { resolve }
}
module.exports = { createAdminResolution }
