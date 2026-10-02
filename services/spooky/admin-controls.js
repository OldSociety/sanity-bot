const { createHash } = require('node:crypto')
const path = require('node:path')
const { Op } = require('sequelize')
const { resolveRuntime } = require('../../config/runtime')
const { createEffects } = require('./effects')
const { originalCurseRole } = require('./curse-role')

function createAdminControls({ sequelize, models, economy, event, scope, checkAccess, environment,
  developmentStorage = resolveRuntime('development').database.storage, delivery, roleIds, badges = null }) {
  const effects = createEffects({ models, event })
  function request(input) {
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) throw new Error('A reason of 1–500 characters is required')
    if (typeof input.interactionId !== 'string' || !input.interactionId.trim()) throw new Error('Control interaction ID is required')
    const wanted = { action: input.action, reason: input.reason.trim(), channelId: input.channelId ?? null }
    if (input.action === 'pause') {
      if (typeof input.paused !== 'boolean') throw new Error('Explicit pause state is required')
      return { ...wanted, paused: input.paused }
    }
    if (typeof input.userId !== 'string' || !input.userId.trim()) throw new Error('Player ID is required')
    if (input.action === 'clear-effect') {
      if (!['curse', 'reversed_nickname', 'theft_protection'].includes(input.effectType)) throw new Error('Unknown spooky effect')
      return { ...wanted, userId: input.userId, effectType: input.effectType }
    }
    if (!['reset-development', 'reset-testing'].includes(input.action)) throw new Error('Unknown administrator control')
    if (input.confirm !== true) throw new Error('Development reset requires explicit confirmation')
    return { ...wanted, userId: input.userId, confirm: true }
  }
  function requireDevelopment() {
    // Both independently selected runtime environment and actual SQLite storage
    // must match the trusted development target. Interaction options cannot
    // override this policy. Tests inject a disposable development storage target.
    if (environment !== 'development' || sequelize.getDialect() !== 'sqlite' ||
      path.resolve(sequelize.options.storage) !== path.resolve(developmentStorage)) {
      throw new Error('Participant reset requires the configured development database and environment')
    }
  }
  async function cancelIntent(ctx, userId, kind) {
    const row = await models.Delivery.findOne({ where: { ...ctx.scope, userId, kind }, transaction: ctx.transaction })
    if (!row || row.status === 'cancelled') return
    const previousRevision = row.revision
    await row.update({ revision: ctx.operationId, status: 'cancelled', lastError: null }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: `discord_intent:${kind}`, delta: 0,
      metadata: { action: 'cancel', previousRevision, payload: row.payload } })
  }
  async function clear(ctx, player, effectType) {
    const row = await models.Effect.findOne({ where: { participantId: player.id, effectType }, transaction: ctx.transaction })
    if (!row) {
      if (effectType === 'curse') {
        const prior = await models.Delivery.findOne({ where: { ...ctx.scope, userId: player.userId, kind: 'curse_role' }, transaction: ctx.transaction })
        if (prior?.payload.present === true) await cancelIntent(ctx, player.userId, 'curse_role')
      }
      if (effectType === 'reversed_nickname' && await models.Delivery.findOne({ where: {
        ...ctx.scope, userId: player.userId, kind: 'nickname', status: 'pending',
      }, transaction: ctx.transaction })) throw new Error('Pending nickname intent without an effect requires inspection before clearing')
      await ctx.record({ userId: player.userId, resource: `effect:${effectType}`, delta: 0, metadata: { noEffect: 'already_absent' } })
      return { effectType, cleared: false }
    }
    const metadata = row.metadata || {}
    if (effectType === 'curse') {
      if (metadata.botOwnedRole === true) {
        if (!delivery) throw new Error('Discord restoration delivery is required')
        const roleId = await originalCurseRole(models, ctx, player.userId, metadata)
        await delivery.enqueue(ctx, player.userId, 'curse_role', { roleId, present: false })
      } else await cancelIntent(ctx, player.userId, 'curse_role')
    } else if (effectType === 'reversed_nickname') {
      if (!delivery) throw new Error('Discord restoration delivery is required')
      if (!(metadata.originalNickname === null || typeof metadata.originalNickname === 'string') ||
        typeof metadata.appliedNickname !== 'string' || metadata.appliedNickname.length > 32 ||
        (metadata.originalNickname?.length ?? 0) > 32) throw new Error('Nickname restoration metadata is invalid')
      await delivery.enqueue(ctx, player.userId, 'nickname', {
        nickname: metadata.originalNickname, expectedNickname: metadata.appliedNickname,
      })
    }
    // Commit restoration intent and the original metadata with removal. Discord
    // projection runs later; permission failures leave durable pending work.
    await effects.remove(ctx, player.userId, effectType)
    await ctx.record({ userId: player.userId, resource: 'effect_restoration', delta: 0,
      metadata: { effectType, originalMetadata: metadata } })
    return { effectType, cleared: true }
  }
  async function cancelNotifications(ctx, userId) {
    const operations = await models.Operation.findAll({ where: { ...ctx.scope,
      [Op.or]: [{ actorId: userId }, { operationType: { [Op.like]: 'admin_repair:%' } },
        { operationType: { [Op.like]: 'admin_resolution:%' } },
        { operationType: { [Op.like]: 'admin_badges:%' } }] }, transaction: ctx.transaction })
    const operationIds = operations.filter(row => row.actorId === userId || row.receipt?.request?.userId === userId || row.receipt?.notificationOwnerUserId === userId).map(row => row.operationId)
    if (!operationIds.length) return { cancelledNotifications: [], ambiguousNotifications: [] }
    const rows = await models.Notification.findAll({ where: { operationId: { [Op.in]: operationIds }, status: { [Op.in]: ['pending', 'sending', 'uncertain'] } }, transaction: ctx.transaction })
    const cancelledNotifications = [], ambiguousNotifications = []
    for (const row of rows) {
      if (row.status !== 'pending') { ambiguousNotifications.push(row.id); continue }
      await row.update({ status: 'cancelled', lastError: null }, { transaction: ctx.transaction })
      await ctx.record({ userId, resource: 'notification_cancel', delta: 0, metadata: { notificationId: row.id, ownerOperationId: row.operationId } })
      cancelledNotifications.push(row.id)
    }
    return { cancelledNotifications, ambiguousNotifications }
  }
  async function control(input) {
    await checkAccess(input)
    const wanted = request(input)
    if (['reset-development', 'reset-testing'].includes(wanted.action)) requireDevelopment()
    const digest = createHash('sha256').update(JSON.stringify(wanted)).digest('hex')
    return economy.execute({ ...scope, actorId: input.actorId, interactionId: input.interactionId,
      operationType: `admin_control:${digest}` }, async original => {
      const ctx = { ...original, record: entry => original.record({ ...entry,
        metadata: { ...entry.metadata, adminReason: wanted.reason, controlAction: wanted.action } }) }
      if (wanted.action === 'pause') {
        let state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
        if (state?.archivedAt) throw new Error('Archived event controls cannot be resumed or changed')
        const before = state?.actionsPaused ? 1 : 0
        const values = { actionsPaused: wanted.paused, pauseReason: wanted.paused ? wanted.reason : null, configVersion: event.version }
        if (state) await state.update(values, { transaction: ctx.transaction })
        else state = await models.EventState.create({ ...ctx.scope, ...values }, { transaction: ctx.transaction })
        await ctx.record({ userId: input.actorId, resource: 'actions_paused', delta: Number(wanted.paused) - before,
          before, after: Number(wanted.paused) })
        return { request: wanted, state: state.get({ plain: true }) }
      }
      const player = await models.Participant.findOne({ where: { ...ctx.scope, userId: wanted.userId }, transaction: ctx.transaction })
      if (!player) throw new Error('Control requires an existing seasonal player')
      if (wanted.action === 'clear-effect') return { request: wanted, effects: [await clear(ctx, player, wanted.effectType)], restorationQueued: true }
      const removedParticipant = player.get({ plain: true })
      const testReset = wanted.action === 'reset-testing'
      if (testReset && (!badges || !delivery || !roleIds?.sweetTooth)) throw new Error('Full test reset requires badges and configured Crown delivery')
      const badgeOwnershipBefore = badges ? await badges.owned(ctx.scope.guildId, player.userId, ctx.transaction) : null
      const rows = await models.Effect.findAll({ where: { participantId: player.id }, transaction: ctx.transaction })
      const nicknameIntent = await models.Delivery.findOne({ where: { ...ctx.scope, userId: player.userId,
        kind: 'nickname', status: 'pending' }, transaction: ctx.transaction })
      if (nicknameIntent && !rows.some(row => row.effectType === 'reversed_nickname')) {
        // With lost effect metadata we cannot safely infer whether this payload
        // applies or restores a nickname. Do not reset into an orphaned write.
        throw new Error('Pending nickname intent without an effect requires inspection before reset')
      }
      const cleared = []
      for (const row of rows) cleared.push(await clear(ctx, player, row.effectType))
      const curseIntent = await models.Delivery.findOne({ where: { ...ctx.scope, userId: player.userId, kind: 'curse_role' }, transaction: ctx.transaction })
      if (curseIntent?.payload.present === true) await cancelIntent(ctx, player.userId, 'curse_role')
      if (testReset) await delivery.enqueue(ctx, player.userId, 'sweet_tooth_role', { roleId: roleIds.sweetTooth, present: false })
      else await cancelIntent(ctx, player.userId, 'sweet_tooth_role')
      // Reset cancels unapplied awards only. In-flight/ambiguous messages cannot
      // safely be recalled or resent, so preserve and expose them for inspection.
      const notifications = await cancelNotifications(ctx, player.userId)
      const inventory = await models.Inventory.findAll({ where: { participantId: player.id }, transaction: ctx.transaction })
      for (const row of inventory) await ctx.record({ userId: player.userId, resource: `quarter:${row.pieceId}`,
        delta: -row.quantity, before: row.quantity, after: 0, metadata: { reason: 'development_reset' } })
      for (const resource of ['candy', 'eyes', 'treatPrestige', 'trickPrestige']) await ctx.record({ userId: player.userId,
        resource, delta: -player[resource], before: player[resource], after: 0 })
      await ctx.record({ userId: player.userId, resource: 'participant_reset', delta: -1, before: 1, after: 0,
        metadata: { snapshot: removedParticipant } })
      await models.Inventory.destroy({ where: { participantId: player.id }, transaction: ctx.transaction })
      await player.destroy({ transaction: ctx.transaction })
      const removedBadges = []
      if (testReset) {
        // Explicit development-only exception to permanent ownership retention.
        // Do not touch other seasons, the shared Fate wallet, or audit history.
        const Ownership = require('../badges').defineBadgeModel(sequelize)
        const awards = await Ownership.findAll({ where: { guildId: ctx.scope.guildId,
          userId: player.userId, sourceEventId: ctx.scope.eventId }, transaction: ctx.transaction })
        for (const award of awards) {
          await ctx.record({ userId: player.userId, resource: `badge:${award.badgeId}`, delta: -1, before: 1, after: 0,
            metadata: { reason: 'development_test_reset', ownership: award.get({ plain: true }) } })
          removedBadges.push(award.badgeId)
          await award.destroy({ transaction: ctx.transaction })
        }
        // An audit marker resets Crown eligibility without deleting old awards.
        await ctx.record({ userId: player.userId, resource: 'crown_reset', delta: 0,
          metadata: { reason: 'development_test_reset', participantId: player.id } })
      }
      const badgeOwnershipAfter = badges ? await badges.owned(ctx.scope.guildId, player.userId, ctx.transaction) : null
      const expectedBadges = badgeOwnershipBefore?.filter(id => !removedBadges.includes(id))
      if (JSON.stringify(expectedBadges?.slice().sort()) !== JSON.stringify(badgeOwnershipAfter?.slice().sort())) throw new Error('Development reset changed unexpected permanent ownership')
      if (badges) await ctx.record({ userId: player.userId, resource: 'badge_preservation', delta: 0,
        metadata: { badgeOwnershipBefore, badgeOwnershipAfter } })
      return { request: wanted, removedParticipant, removedInventory: inventory.map(row => row.get({ plain: true })),
        effects: cleared, ...notifications, badgeOwnershipRetained: badgeOwnershipAfter, removedBadges, testReset,
        auditHistoryRetained: true, walletUntouched: true, walletAndPermanentOwnershipUntouched: !testReset }
    })
  }
  return { control }
}

module.exports = { createAdminControls }
