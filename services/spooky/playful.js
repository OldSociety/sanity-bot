const { config: defaultConfig, getEventState } = require('./config')
const { Op } = require('sequelize')
const { randomTargets } = require('./theft')
const { transformMessage } = require('./cursed-messages')
const { originalCurseRole } = require('./curse-role')

function createPlayful({ models, participants, effects, collection, delivery, listMembers,
  roleIds, event = defaultConfig, random = Math.random }) {
  if (!roleIds?.curse || !roleIds?.sweetTooth) throw new Error('Effect role IDs are required')
  async function members(ctx) {
    const snapshot = await listMembers(ctx)
    if (!Array.isArray(snapshot)) throw new Error('Invalid membership snapshot')
    const unique = new Map()
    for (const member of snapshot) {
      if (typeof member.userId !== 'string' || typeof member.bot !== 'boolean') throw new Error('Invalid member identity')
      if (!member.bot && !unique.has(member.userId)) unique.set(member.userId, member)
    }
    return [...unique.values()]
  }
  async function recipients(ctx, actorId, count, predicate = () => true) {
    return randomTargets((await members(ctx)).filter(member => member.userId !== actorId && predicate(member)), count, random)
  }
  async function gift(ctx, actorId, count, amount = 1) {
    const targets = await recipients(ctx, actorId, count), gifts = []
    for (const target of targets) {
      const { participant } = await participants.prepare(ctx, target.userId)
      const credit = Math.min(amount, event.candy.capacity - participant.candy)
      if (credit) await ctx.changeBalance(target.userId, 'candy', credit, { metadata: { reason: 'treat_gift', relatedActor: actorId } })
      gifts.push({ userId: target.userId, candy: credit })
    }
    return { gifts, deliveredCandy: gifts.reduce((sum, entry) => sum + entry.candy, 0), ...(targets.length ? {} : { noEffect: 'no_recipient' }) }
  }
  async function curse(ctx, member) {
    if (member.canManageCurse !== true) return { noEffect: 'role_permission' }
    const old = await effects.active(ctx, member.userId, 'curse')
    // A cleared effect can still own a pending Discord restoration. Never
    // overwrite that intent or reinterpret our still-attached role as theirs.
    const restoration = !old && await models.Delivery.findOne({ where: {
      ...ctx.scope, userId: member.userId, kind: 'curse_role', status: { [Op.in]: ['pending', 'conflict'] },
    }, transaction: ctx.transaction })
    if (restoration?.payload?.present === false) return { noEffect: 'restoration_pending' }
    const metadata = old ? { ...old.metadata, roleId: await originalCurseRole(models, ctx, member.userId, old.metadata) }
      : { botOwnedRole: !(member.roleIds || []).includes(roleIds.curse), roleId: roleIds.curse }
    await effects.put(ctx, member.userId, 'curse', { expiresAt: event.endsAt, metadata })
    await delivery.enqueue(ctx, member.userId, 'curse_role', { roleId: metadata.roleId, present: true })
    return { cursedUserId: member.userId }
  }
  async function randomCurse(ctx, plan) {
    const [target] = await recipients(ctx, plan.actorId, 1, member => member.canManageCurse === true)
    return target ? curse(ctx, target) : { noEffect: 'no_manageable_target' }
  }
  async function clearCurse(ctx, userId) {
    const removed = await effects.remove(ctx, userId, 'curse')
    if (removed?.metadata.botOwnedRole === true) await delivery.enqueue(ctx, userId, 'curse_role', {
      roleId: await originalCurseRole(models, ctx, userId, removed.metadata), present: false,
    })
    else if (removed) {
      // A pre-existing role belongs to the member. Stop a stale pending add from
      // reapplying it later, but never enqueue removal of a role we did not own.
      const prior = await models.Delivery.findOne({ where: { ...ctx.scope, userId, kind: 'curse_role' }, transaction: ctx.transaction })
      if (prior?.payload.present === true && prior.status !== 'cancelled') {
        await prior.update({ status: 'cancelled', revision: ctx.operationId, lastError: null }, { transaction: ctx.transaction })
        await ctx.record({ userId, resource: 'discord_intent:curse_role', delta: 0, metadata: { action: 'cancel', reason: 'preexisting_role' } })
      }
    }
    return removed
  }
  async function goodwill(ctx, plan, result) {
    if (plan.action !== 'treat' || !(result.deliveredCandy > 0)) return result
    const active = await effects.active(ctx, plan.actorId, 'curse')
    if (!active) return result
    const metadata = { ...active.metadata }
    if (metadata.goodwillGoal === undefined) {
      const roll = random()
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid curse goodwill roll')
      metadata.goodwillGoal = 10 + Math.floor(roll * 21)
      metadata.goodwillGiven = 0
    }
    if (!Number.isSafeInteger(metadata.goodwillGoal) || metadata.goodwillGoal < 10 || metadata.goodwillGoal > 30 ||
      !Number.isSafeInteger(metadata.goodwillGiven) || metadata.goodwillGiven < 0) throw new Error('Invalid curse goodwill metadata')
    metadata.goodwillGiven += result.deliveredCandy
    await ctx.record({ userId: plan.actorId, resource: 'curse_goodwill', delta: 0,
      metadata: { delivered: result.deliveredCandy, given: metadata.goodwillGiven, goal: metadata.goodwillGoal } })
    if (metadata.goodwillGiven >= metadata.goodwillGoal) {
      await clearCurse(ctx, plan.actorId)
      return { ...result, goodwillFreedUserId: plan.actorId }
    }
    await active.update({ metadata }, { transaction: ctx.transaction })
    return result
  }
  async function cleanup(ctx) {
    if (ctx.scope.eventId !== event.eventId) throw new Error('Effect event mismatch')
    const scoped = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
    const cleared = [], closed = getEventState(ctx.now, event) === 'CLOSED'
    const byId = new Map(scoped.map(player => [player.id, player]))
    const rows = scoped.length ? await models.Effect.findAll({ where: {
      participantId: { [Op.in]: [...byId.keys()] }, ...(!closed && { expiresAt: { [Op.lte]: ctx.now } }),
    }, transaction: ctx.transaction }) : []
    for (const row of rows) {
      const participant = byId.get(row.participantId)
      // Corrupt restoration data must keep the effect/intent for inspection,
      // rather than losing the original nickname or deleting an unowned role.
      if (row.effectType === 'curse' && typeof row.metadata?.botOwnedRole !== 'boolean') throw new Error('Curse restoration metadata is invalid')
      if (!['curse', 'reversed_nickname', 'theft_protection'].includes(row.effectType)) throw new Error('Unknown effect during cleanup')
      if (row.effectType === 'curse') await clearCurse(ctx, participant.userId)
      else {
        if (row.effectType === 'reversed_nickname') {
          if (!(row.metadata?.originalNickname === null || typeof row.metadata?.originalNickname === 'string') ||
            typeof row.metadata?.appliedNickname !== 'string' || row.metadata.appliedNickname.length > 32 ||
            (row.metadata.originalNickname?.length ?? 0) > 32) throw new Error('Nickname restoration metadata is invalid')
          await delivery.enqueue(ctx, participant.userId, 'nickname', {
            nickname: row.metadata.originalNickname, expectedNickname: row.metadata.appliedNickname,
          })
        }
        await effects.remove(ctx, participant.userId, row.effectType)
      }
      cleared.push({ userId: participant.userId, effectType: row.effectType })
    }
    return { cleared }
  }
  const handlers = {
    // Normal losing outcomes consume the one action candy already charged.
    // They are gameplay results, not unavailable effects or a second penalty.
    lost_candy: async () => ({ failure: 'lost_candy' }),
    caught_stealing: async () => ({ failure: 'caught_stealing' }),
    standard_gift: (ctx, plan) => gift(ctx, plan.actorId, 1),
    double_gift: (ctx, plan) => gift(ctx, plan.actorId, 1, 2),
    curse_distribute_three: (ctx, plan) => gift(ctx, plan.actorId, 3),
    curse_distribute_two: (ctx, plan) => gift(ctx, plan.actorId, 2),
    find_eye: (ctx, plan) => collection.creditEyes(ctx, plan.actorId, 1, { metadata: { reason: 'treat_eye' } }),
    curse_target: randomCurse, curse_spread: randomCurse,
    curse_backfire: async (ctx, plan) => {
      const caller = (await members(ctx)).find(member => member.userId === plan.actorId)
      if (!caller) throw new Error('Caller missing from membership snapshot')
      return curse(ctx, caller)
    },
    break_curse: async (ctx, plan) => {
      const eligible = []
      for (const member of await members(ctx)) {
        if (member.canManageCurse && await effects.active(ctx, member.userId, 'curse')) eligible.push(member)
      }
      const [target] = randomTargets(eligible, 1, random)
      if (!target) return gift(ctx, plan.actorId, 1)
      await clearCurse(ctx, target.userId)
      return { freedUserId: target.userId }
    },
    temporary_immunity: async (ctx, plan) => {
      const [recipient] = await recipients(ctx, plan.actorId, 1)
      const shielded = [plan.actorId, ...(recipient ? [recipient.userId] : [])]
      const expiresAt = new Date(ctx.now.getTime() + event.protection.theftDurationMs)
      for (const userId of shielded) await effects.put(ctx, userId, 'theft_protection', { expiresAt })
      let deliveredCandy = 0
      if (recipient) {
        const { participant } = await participants.prepare(ctx, recipient.userId)
        deliveredCandy = Math.min(1, event.candy.capacity - participant.candy)
        if (deliveredCandy) await ctx.changeBalance(recipient.userId, 'candy', deliveredCandy, { metadata: { reason: 'immunity_gift' } })
      }
      return { shielded, deliveredCandy, expiresAt: new Date(Math.min(expiresAt.getTime(), Date.parse(event.endsAt))).toISOString() }
    },
    reverse_nickname: async (ctx, plan) => {
      const [target] = await recipients(ctx, plan.actorId, 1, member => member.canManageNickname === true)
      if (!target) return { noEffect: 'no_manageable_target' }
      const previous = await effects.active(ctx, target.userId, 'reversed_nickname')
      // Repeated hits preserve the first original and do not reverse back to normal.
      if (previous) return { reversedUserId: target.userId, alreadyReversed: true }
      // Clearing the seasonal row does not mean the original nickname has
      // reached Discord. Keep outstanding/conflicting restoration intact.
      if (await models.Delivery.findOne({ where: { ...ctx.scope, userId: target.userId,
        kind: 'nickname', status: { [Op.in]: ['pending', 'conflict'] } }, transaction: ctx.transaction })) {
        return { noEffect: 'restoration_pending' }
      }
      if (target.nickname !== null && typeof target.nickname !== 'string') throw new Error('Missing nickname snapshot')
      const originalNickname = target.nickname
      const appliedNickname = transformMessage(originalNickname || target.displayName || target.userId, 'reverse')
      if (appliedNickname.length > 32) return { noEffect: 'nickname_length' }
      await effects.put(ctx, target.userId, 'reversed_nickname', { expiresAt: event.endsAt, metadata: { originalNickname, appliedNickname } })
      await delivery.enqueue(ctx, target.userId, 'nickname', { nickname: appliedNickname, expectedNickname: originalNickname })
      return { reversedUserId: target.userId }
    },
    sweet_tooth: async (ctx, plan) => {
      const all = await members(ctx), caller = all.find(member => member.userId === plan.actorId)
      if (!caller || !Array.isArray(caller.roleIds)) throw new Error('Missing caller role snapshot')
      const hasRole = caller.roleIds.includes(roleIds.sweetTooth)
      const reset = await models.Ledger.findOne({ where: { ...ctx.scope, userId: plan.actorId, resource: 'crown_reset' },
        order: [['id', 'DESC']], transaction: ctx.transaction })
      const wonBefore = await models.Ledger.findOne({ where: { ...ctx.scope, userId: plan.actorId, resource: 'crown_award',
        ...(reset ? { id: { [Op.gt]: reset.id } } : {}) }, transaction: ctx.transaction })
      const target = !hasRole && !wonBefore ? caller : null
      let awardedUserId = null
      if (target?.canManageSweetTooth === true) {
        await delivery.enqueue(ctx, target.userId, 'sweet_tooth_role', { roleId: roleIds.sweetTooth, present: true })
        awardedUserId = target.userId
        await ctx.record({ userId: plan.actorId, resource: 'crown_award', delta: 1, before: 0, after: 1 })
      }
      let candyReward = 0
      if (awardedUserId) {
        const { participant } = await participants.prepare(ctx, plan.actorId)
        candyReward = Math.min(event.crown.candyBonus, event.candy.capacity - participant.candy)
        if (candyReward) await ctx.changeBalance(plan.actorId, 'candy', candyReward, { metadata: { reason: 'sweet_tooth_generosity' } })
      }
      return { awardedUserId, crownWon: Boolean(awardedUserId), candyReward, ...(awardedUserId ? {} : { noEffect: 'no_role_recipient' }) }
    },
  }
  return { cleanup, handlers: Object.fromEntries(Object.entries(handlers).map(([name, handler]) =>
    [name, async (ctx, plan) => goodwill(ctx, plan, await handler(ctx, plan))])) }
}

module.exports = { createPlayful }
