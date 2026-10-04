const { config: defaultConfig, getEventState } = require('./config')
const { Op } = require('sequelize')
const { randomTargets } = require('./theft')
const { originalCurseRole } = require('./curse-role')

function createPlayful({
  models,
  participants,
  effects,
  collection,
  delivery,
  listMembers,
  roleIds,
  event = defaultConfig,
  random = Math.random,
}) {
  if (!roleIds?.curse || !roleIds?.sweetTooth)
    throw new Error('Effect role IDs are required')
  const nicknames = require('./effect-nicknames').createEffectNicknames({
    models,
    delivery,
  })
  const crown = require('./crown').createCrown({ models, delivery, roleId: roleIds.sweetTooth })
  const combat = require('./combat').createCombat({ models, participants, effects, delivery, event })
  async function members(ctx) {
    const snapshot = await listMembers(ctx)
    if (!Array.isArray(snapshot)) throw new Error('Invalid membership snapshot')
    const unique = new Map()
    for (const member of snapshot) {
      if (typeof member.userId !== 'string' || typeof member.bot !== 'boolean')
        throw new Error('Invalid member identity')
      if (!member.bot && !unique.has(member.userId))
        unique.set(member.userId, member)
    }
    return [...unique.values()]
  }
  async function recipients(ctx, actorId, count, predicate = () => true) {
    return randomTargets(
      (await members(ctx)).filter(
        (member) => member.userId !== actorId && predicate(member),
      ),
      count,
      random,
    )
  }
  async function gift(ctx, actorId, count, amount = 1) {
    const targets = await recipients(ctx, actorId, count),
      gifts = []
    for (const target of targets) {
      const { participant } = await participants.prepare(ctx, target.userId)
      const credit = Math.min(amount, event.candy.capacity - participant.candy)
      if (credit)
        await ctx.changeBalance(target.userId, 'candy', credit, {
          metadata: { reason: 'treat_gift', relatedActor: actorId },
        })
      gifts.push({ userId: target.userId, candy: credit })
    }
    return {
      gifts,
      deliveredCandy: gifts.reduce((sum, entry) => sum + entry.candy, 0),
      ...(targets.length ? {} : { noEffect: 'no_recipient' }),
    }
  }
  async function curse(ctx, member) {
    if (await combat.intercept(ctx, member.userId)) return combat.receipt(ctx, { noEffect: 'shield_blocks_attack' })
    if (member.canManageCurse !== true) return { noEffect: 'role_permission' }
    const old = await effects.active(ctx, member.userId, 'curse')
    if (old) return { noEffect: 'already_cursed' }
    // A cleared effect can still own a pending Discord restoration. Never
    // overwrite that intent or reinterpret our still-attached role as theirs.
    const restoration =
      !old &&
      (await models.Delivery.findOne({
        where: {
          ...ctx.scope,
          userId: member.userId,
          kind: 'curse_role',
          status: { [Op.in]: ['pending', 'conflict'] },
        },
        transaction: ctx.transaction,
      }))
    if (restoration?.payload?.present === false)
      return { noEffect: 'restoration_pending' }
    const metadata = old
      ? {
          ...old.metadata,
          roleId: await originalCurseRole(
            models,
            ctx,
            member.userId,
            old.metadata,
          ),
        }
      : {
          botOwnedRole: !(member.roleIds || []).includes(roleIds.curse),
          roleId: roleIds.curse,
        }
    await effects.put(ctx, member.userId, 'curse', {
      expiresAt: event.endsAt,
      metadata: {
        ...metadata,
        ...(await nicknames.apply(ctx, member, 'curse')),
      },
    })
    await delivery.enqueue(ctx, member.userId, 'curse_role', {
      roleId: metadata.roleId,
      present: true,
    })
    return { cursedUserId: member.userId }
  }
  async function randomCurse(ctx, plan) {
    const eligible = await choiceCandidates(ctx, {
      ...plan,
      outcome: plan.outcome || 'curse_target',
    })
    const target = plan.targetUserId
      ? eligible.find((member) => member.userId === plan.targetUserId)
      : randomTargets(eligible, 1, random)[0]
    if (plan.targetUserId && !target)
      throw new Error(
        'That player is no longer eligible. Nothing was spent; try again.',
      )
    return target ? curse(ctx, target) : { noEffect: 'no_manageable_target' }
  }
  async function candidateState(ctx) {
    const status = await effects.snapshot(ctx)
    const pending = await models.Delivery.findAll({ where: { ...ctx.scope, kind: { [Op.in]: ['nickname', 'curse_role'] },
      status: { [Op.in]: ['pending', 'conflict'] } }, transaction: ctx.transaction })
    const intents = new Map(pending.map(row => [row.userId + ':' + row.kind, row]))
    return { ...status, intent: (userId, kind) => intents.get(userId + ':' + kind) }
  }
  async function choiceCandidates(ctx, plan) {
    if (!['break_curse', 'curse_target', 'curse_spread', 'temporary_immunity'].includes(plan.outcome)) return []
    const status = await candidateState(ctx), roster = await members(ctx)
    if (plan.outcome === 'break_curse') return roster.filter(member => {
      const cursed = status.active(member.userId, 'curse')
      return (member.canManageCurse && cursed) || (!cursed && status.active(member.userId, 'bag_hole'))
    })
    const type = plan.outcome === 'temporary_immunity' ? 'theft_protection' : 'curse'
    return roster.filter(member => {
      const id = member.userId
      if (id === plan.actorId || (type === 'curse' && !member.canManageCurse) || status.active(id, type)) return false
      if (type === 'theft_protection' && (status.active(id, 'curse') || status.active(id, 'bag_hole'))) {
        return Boolean(member.canManageCurse || !status.active(id, 'curse'))
      }
      if (type === 'curse' && status.active(id, 'theft_protection')) return true
      // Expired rows and pending restorations still own their baseline.
      if (status.stored(id, type) || (member.canManageNickname && status.intent(id, 'nickname'))) return false
      if (type === 'curse' && status.intent(id, 'curse_role')?.payload.present === false) return false
      return true
    })
  }
  async function clearCurse(ctx, userId) {
    await effects.remove(ctx, userId, 'bag_hole')
    await nicknames.remove(ctx, userId, 'curse')
    const removed = await effects.remove(ctx, userId, 'curse')
    if (removed?.metadata.botOwnedRole === true)
      await delivery.enqueue(ctx, userId, 'curse_role', {
        roleId: await originalCurseRole(models, ctx, userId, removed.metadata),
        present: false,
      })
    else if (removed) {
      // A pre-existing role belongs to the member. Stop a stale pending add from
      // reapplying it later, but never enqueue removal of a role we did not own.
      const prior = await models.Delivery.findOne({
        where: { ...ctx.scope, userId, kind: 'curse_role' },
        transaction: ctx.transaction,
      })
      if (prior?.payload.present === true && prior.status !== 'cancelled') {
        await prior.update(
          { status: 'cancelled', revision: ctx.operationId, lastError: null },
          { transaction: ctx.transaction },
        )
        await ctx.record({
          userId,
          resource: 'discord_intent:curse_role',
          delta: 0,
          metadata: { action: 'cancel', reason: 'preexisting_role' },
        })
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
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
        throw new Error('Invalid curse goodwill roll')
      metadata.goodwillGoal = 10 + Math.floor(roll * 21)
      metadata.goodwillGiven = 0
    }
    if (
      !Number.isSafeInteger(metadata.goodwillGoal) ||
      metadata.goodwillGoal < 10 ||
      metadata.goodwillGoal > 30 ||
      !Number.isSafeInteger(metadata.goodwillGiven) ||
      metadata.goodwillGiven < 0
    )
      throw new Error('Invalid curse goodwill metadata')
    metadata.goodwillGiven += result.deliveredCandy
    await ctx.record({
      userId: plan.actorId,
      resource: 'curse_goodwill',
      delta: 0,
      metadata: {
        delivered: result.deliveredCandy,
        given: metadata.goodwillGiven,
        goal: metadata.goodwillGoal,
      },
    })
    if (metadata.goodwillGiven >= metadata.goodwillGoal) {
      await clearCurse(ctx, plan.actorId)
      return { ...result, goodwillFreedUserId: plan.actorId }
    }
    await active.update({ metadata }, { transaction: ctx.transaction })
    return result
  }
  async function cleanup(ctx) {
    if (ctx.scope.eventId !== event.eventId)
      throw new Error('Effect event mismatch')
    const scoped = await models.Participant.findAll({
      attributes: ['id', 'userId'],
      where: ctx.scope,
      transaction: ctx.transaction,
    })
    const cleared = [],
      closed = getEventState(ctx.now, event) === 'CLOSED'
    const byId = new Map(scoped.map((player) => [player.id, player]))
    const allRows = scoped.length ? await models.Effect.findAll({ where: {
      participantId: { [Op.in]: [...byId.keys()] },
    }, transaction: ctx.transaction }) : []
    const activeByPlayer = new Map()
    for (const row of allRows) if (new Date(row.expiresAt) > ctx.now) {
      if (!activeByPlayer.has(row.participantId)) activeByPlayer.set(row.participantId, [])
      activeByPlayer.get(row.participantId).push(row)
    }
    if (!closed) {
      // Legacy overlapping states resolve as a successful shield cure. Do this
      // before expired-effect removal so every projection shares its baseline.
      for (const [participantId, activeRows] of activeByPlayer) {
        const player = byId.get(participantId)
        const curse = activeRows.find(row => row.effectType === 'curse')
        if (curse && activeRows.some(row => row.effectType === 'theft_protection')) {
          if (typeof curse.metadata?.botOwnedRole !== 'boolean') throw new Error('Curse restoration metadata is invalid')
          await clearCurse(ctx, player.userId)
          cleared.push({ userId: player.userId, effectType: 'curse', reason: 'protection_broke_curse' })
        }
      }
    }
    // Shorten legacy month-long reversals using their original application
    // ledger entry, never a fresh nickname baseline or a renewed timer.
    if (!closed) for (const row of allRows.filter(row => row.effectType === 'reversed_nickname')) {
      const participant = byId.get(row.participantId)
      const applied = !row.metadata?.appliedAt ? await models.Ledger.findOne({ where: { ...ctx.scope, userId: participant.userId,
        resource: 'effect:reversed_nickname', delta: 1 }, order: [['id', 'DESC']], transaction: ctx.transaction }) : null
      const start = row.metadata?.appliedAt || applied?.timestamp
      const limit = start ? Math.min(Date.parse(event.endsAt), new Date(start).getTime() + event.nickname.reversalDurationMs)
        : Math.min(Date.parse(event.endsAt), ctx.now.getTime() + event.nickname.reversalDurationMs)
      if (new Date(row.expiresAt).getTime() > limit) {
        await row.update({ expiresAt: new Date(limit), metadata: { ...row.metadata, appliedAt: start ? new Date(start).toISOString() : ctx.now.toISOString() } }, { transaction: ctx.transaction })
        await ctx.record({ userId: participant.userId, resource: 'reversal_timer', delta: 0, metadata: { expiresAt: new Date(limit).toISOString() } })
      }
    }
    const rows = allRows.filter(row => closed || new Date(row.expiresAt) <= ctx.now)
    for (const row of rows) {
      const participant = byId.get(row.participantId)
      // Corrupt restoration data must keep the effect/intent for inspection,
      // rather than losing the original nickname or deleting an unowned role.
      if (
        row.effectType === 'curse' &&
        typeof row.metadata?.botOwnedRole !== 'boolean'
      )
        throw new Error('Curse restoration metadata is invalid')
      if (
        !['curse', 'reversed_nickname', 'theft_protection', 'bag_hole'].includes(
          row.effectType,
        )
      )
        throw new Error('Unknown effect during cleanup')
      if (row.effectType === 'curse') await clearCurse(ctx, participant.userId)
      else {
        await nicknames.remove(ctx, participant.userId, row.effectType)
        await effects.remove(ctx, participant.userId, row.effectType)
      }
      cleared.push({ userId: participant.userId, effectType: row.effectType })
    }
    if (!closed) for (const [participantId, activeRows] of activeByPlayer) {
      if (activeRows.some(row => ['curse', 'theft_protection'].includes(row.effectType))) await nicknames.refresh(ctx, byId.get(participantId).userId)
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
    find_eye: (ctx, plan) =>
      collection.creditEyes(ctx, plan.actorId, 1, {
        metadata: { reason: 'treat_eye' },
      }),
    curse_target: randomCurse,
    curse_spread: randomCurse,
    curse_backfire: async (ctx, plan) => {
      const caller = (await members(ctx)).find(
        (member) => member.userId === plan.actorId,
      )
      if (!caller) throw new Error('Caller missing from membership snapshot')
      return curse(ctx, caller)
    },
    break_curse: async (ctx, plan) => {
      const eligible = await choiceCandidates(ctx, {
        ...plan,
        outcome: 'break_curse',
      })
      const target = plan.targetUserId
        ? eligible.find((member) => member.userId === plan.targetUserId)
        : randomTargets(eligible, 1, random)[0]
      if (plan.targetUserId && !target)
        throw new Error(
          'That curse has already been broken. Nothing was spent; try again.',
        )
      if (!target) return gift(ctx, plan.actorId, 1)
      const repaired = Boolean(await effects.active(ctx, target.userId, 'bag_hole'))
      const cursed = Boolean(await effects.active(ctx, target.userId, 'curse'))
      await clearCurse(ctx, target.userId)
      return { ...(cursed ? { freedUserId: target.userId } : {}), ...(repaired ? { bagRepairedUserId: target.userId } : {}) }
    },
    temporary_immunity: async (ctx, plan) => {
      const eligible = await choiceCandidates(ctx, {
        ...plan,
        outcome: 'temporary_immunity',
      })
      const recipient = plan.targetUserId
        ? eligible.find((member) => member.userId === plan.targetUserId)
        : randomTargets(eligible, 1, random)[0]
      if (plan.targetUserId && !recipient)
        throw new Error(
          'That player is no longer eligible. Nothing was spent; try again.',
        )
      if (!recipient) return { noEffect: 'no_recipient' }
      if (await effects.active(ctx, recipient.userId, 'curse') || await effects.active(ctx, recipient.userId, 'bag_hole')) {
        const repaired = Boolean(await effects.active(ctx, recipient.userId, 'bag_hole'))
        const cursed = Boolean(await effects.active(ctx, recipient.userId, 'curse'))
        await clearCurse(ctx, recipient.userId)
        return { ...(cursed ? { freedUserId: recipient.userId, protectionBrokeCurse: true } : {}), ...(repaired ? { bagRepairedUserId: recipient.userId } : {}) }
      }
      const caller = (await members(ctx)).find(
        (member) => member.userId === plan.actorId,
      )
      const value = random()
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error('Invalid dual protection roll')
      const callerPending = await models.Delivery.findOne({
        where: {
          ...ctx.scope,
          userId: plan.actorId,
          kind: 'nickname',
          status: { [Op.in]: ['pending', 'conflict'] },
        },
        transaction: ctx.transaction,
      })
      const callerPlayer = await models.Participant.findOne({
        where: { ...ctx.scope, userId: plan.actorId },
        transaction: ctx.transaction,
      })
      const callerShield =
        callerPlayer &&
        (await models.Effect.findOne({
          where: {
            participantId: callerPlayer.id,
            effectType: 'theft_protection',
          },
          transaction: ctx.transaction,
        }))
      const both =
        !callerShield &&
        !await effects.active(ctx, plan.actorId, 'curse') &&
        !await effects.active(ctx, plan.actorId, 'bag_hole') &&
        !callerPending &&
        value < event.protection.bothPercent / 100
      const shielded = [...(both ? [plan.actorId] : []), recipient.userId]
      const expiresAt = new Date(
        ctx.now.getTime() + event.protection.theftDurationMs,
      )
      for (const userId of shielded) {
        const member = userId === plan.actorId ? caller : recipient
        const chargeRoll = random()
        if (!Number.isFinite(chargeRoll) || chargeRoll < 0 || chargeRoll >= 1) throw new Error('Invalid shield strength roll')
        await effects.put(ctx, userId, 'theft_protection', {
          expiresAt,
          metadata: { ...await nicknames.apply(ctx, member, 'theft_protection'), chargesRemaining: chargeRoll < .5 ? 2 : 3 },
        })
      }
      let deliveredCandy = 0
      if (recipient) {
        const { participant } = await participants.prepare(
          ctx,
          recipient.userId,
        )
        deliveredCandy = Math.min(1, event.candy.capacity - participant.candy)
        if (deliveredCandy)
          await ctx.changeBalance(recipient.userId, 'candy', deliveredCandy, {
            metadata: { reason: 'immunity_gift' },
          })
      }
      return {
        shielded,
        deliveredCandy,
        expiresAt: new Date(
          Math.min(expiresAt.getTime(), Date.parse(event.endsAt)),
        ).toISOString(),
      }
    },
    reverse_nickname: async (ctx, plan) => {
      const status = await candidateState(ctx)
      const eligible = (await members(ctx)).filter(member => {
        const id = member.userId
        if (id === plan.actorId || !member.canManageNickname || status.stored(id, 'reversed_nickname') || status.stored(id, 'curse')) return false
        if (status.active(id, 'theft_protection')) return true
        return !status.intent(id, 'nickname')
      })
      const target = randomTargets(eligible, 1, random)[0]
      if (!target) {
        const error = new Error('No player can receive the backwards-name spell right now. Nothing was spent; try again.')
        error.code = 'NO_REVERSAL_TARGET'
        throw error
      }
      // The same nickname owner composes reversal with curse and shield, so
      // each removal preserves the remaining costume and the original name.
      if (await combat.intercept(ctx, target.userId)) return combat.receipt(ctx, { noEffect: 'shield_blocks_attack' })
      const metadata = await nicknames.apply(ctx, target, 'reversed_nickname')
      if (!Object.hasOwn(metadata, 'originalNickname'))
        return { noEffect: 'restoration_pending' }
      await effects.put(ctx, target.userId, 'reversed_nickname', {
        expiresAt: new Date(ctx.now.getTime() + event.nickname.reversalDurationMs),
        metadata: { ...metadata, appliedAt: ctx.now.toISOString() },
      })
      return { reversedUserId: target.userId }
    },
    sweet_tooth: async (ctx, plan) => {
      const all = await members(ctx),
        caller = all.find((member) => member.userId === plan.actorId)
      if (!caller || !Array.isArray(caller.roleIds))
        throw new Error('Missing caller role snapshot')
      if (await crown.state(ctx, all)) throw new Error('The Sweet Tooth Crown is already held. Nothing was spent; try again.')
      const reset = await models.Ledger.findOne({
        where: { ...ctx.scope, userId: plan.actorId, resource: 'crown_reset' },
        order: [['id', 'DESC']],
        transaction: ctx.transaction,
      })
      const wonBefore = await models.Ledger.findOne({
        where: {
          ...ctx.scope,
          userId: plan.actorId,
          resource: 'crown_award',
          ...(reset ? { id: { [Op.gt]: reset.id } } : {}),
        },
        transaction: ctx.transaction,
      })
      const target = caller
      let awardedUserId = null
      if (target?.canManageSweetTooth === true) {
        await crown.capture(ctx, target.userId, null)
        awardedUserId = target.userId
        if (!wonBefore) await ctx.record({
          userId: plan.actorId,
          resource: 'crown_award',
          delta: 1,
          before: 0,
          after: 1,
        })
      }
      let candyReward = 0
      if (awardedUserId && !wonBefore) {
        const { participant } = await participants.prepare(ctx, plan.actorId)
        candyReward = Math.min(
          event.crown.candyBonus,
          event.candy.capacity - participant.candy,
        )
        if (candyReward)
          await ctx.changeBalance(plan.actorId, 'candy', candyReward, {
            metadata: { reason: 'sweet_tooth_generosity' },
          })
      }
      return {
        awardedUserId,
        crownWon: Boolean(awardedUserId),
        crownFirstWin: Boolean(awardedUserId && !wonBefore),
        candyReward,
        ...(awardedUserId ? {} : { noEffect: 'no_role_recipient' }),
      }
    },
    steal_crown: async (ctx, plan) => {
      const all = await members(ctx), holderId = await crown.state(ctx, all),
        caller = all.find(member => member.userId === plan.actorId)
      if (!holderId || holderId === plan.actorId) throw new Error('There is no other Crown holder to steal from. Nothing was spent.')
      if (!caller?.canManageSweetTooth) throw new Error('The Crown cannot change hands right now. Nothing was spent.')
      if (await combat.intercept(ctx, holderId)) return combat.receipt(ctx, { crownProtectedUserId: holderId, crownWon: false, noEffect: 'shield_blocks_attack' })
      const reset = await models.Ledger.findOne({ where: { ...ctx.scope, userId: plan.actorId, resource: 'crown_reset' }, order: [['id', 'DESC']], transaction: ctx.transaction })
      const wonBefore = await models.Ledger.findOne({ where: { ...ctx.scope, userId: plan.actorId, resource: 'crown_award',
        ...(reset ? { id: { [Op.gt]: reset.id } } : {}) }, transaction: ctx.transaction })
      await crown.capture(ctx, plan.actorId, holderId)
      let candyReward = 0
      if (!wonBefore) {
        await ctx.record({ userId: plan.actorId, resource: 'crown_award', delta: 1, before: 0, after: 1 })
        const { participant } = await participants.prepare(ctx, plan.actorId)
        candyReward = Math.min(event.crown.candyBonus, event.candy.capacity - participant.candy)
        if (candyReward) await ctx.changeBalance(plan.actorId, 'candy', candyReward, { metadata: { reason: 'sweet_tooth_generosity' } })
      }
      return { awardedUserId: plan.actorId, crownWon: true, crownFirstWin: !wonBefore, crownStolenFrom: holderId, candyReward }
    },
  }
  return {
    cleanup,
    crownHolder: async ctx => crown.state(ctx, await members(ctx)),
    choiceCandidates,
    handlers: Object.fromEntries(
      Object.entries(handlers).map(([name, handler]) => [
        name,
        async (ctx, plan) => goodwill(ctx, plan, await handler(ctx, plan)),
      ]),
    ),
  }
}

module.exports = { createPlayful }
