const { config: defaultEvent } = require('./config')
function combatReceipt(ctx, result) {
  return { ...result,
    ...(ctx.shieldHits?.size ? { blockedShields: [...ctx.shieldHits.values()] } : {}),
    ...(ctx.candyMovements?.length ? { candyMovements: ctx.candyMovements } : {}),
  }
}
// Shared interception/transfer policy. All methods are DB-only and receive the
// root context; per-operation maps prevent multi-hop/replay shield overcharging.
function createCombat({ models, participants, effects, delivery, event = defaultEvent }) {
  effects ||= require('./effects').createEffects({ models, participants, event })
  const nicknames = delivery ? require('./effect-nicknames').createEffectNicknames({ models, delivery }) : null
  async function intercept(ctx, userId) {
    ctx.shieldHits ||= new Map()
    if (ctx.shieldHits.has(userId)) return true
    const shield = await effects.active(ctx, userId, 'theft_protection')
    if (!shield) return false
    const before = shield.metadata.chargesRemaining ?? 2 // Legacy expiry stays unchanged.
    if (!Number.isSafeInteger(before) || before < 1 || before > 3) throw new Error('Invalid shield charges')
    const after = before - 1
    await ctx.record({ userId, resource: 'shield_charges', delta: -1, before, after })
    if (after) await shield.update({ metadata: { ...shield.metadata, chargesRemaining: after } }, { transaction: ctx.transaction })
    else {
      if (Object.hasOwn(shield.metadata, 'originalNickname') && !nicknames) throw new Error('Shield restoration service unavailable')
      if (nicknames) await nicknames.remove(ctx, userId, 'theft_protection')
      await effects.remove(ctx, userId, 'theft_protection')
    }
    ctx.shieldHits.set(userId, { userId, popped: after === 0 })
    return true
  }
  async function transfer(ctx, from, to, requested, { hole = true, outcome } = {}) {
    if (from === to || !Number.isSafeInteger(requested) || requested <= 0) throw new Error('Invalid combat transfer')
    const { participant: source } = await participants.prepare(ctx, from)
    const { participant: receiver } = await participants.prepare(ctx, to)
    // One shared allowance covers every hop, recipient and hole bonus in this
    // operation. Availability and recipient capacity can reduce it further.
    const allowance = event.candy.eventMaximum - (ctx.candyTransferred || 0)
    const base = Math.max(0, Math.min(requested, source.candy, event.candy.capacity - receiver.candy, allowance))
    if (!base || await intercept(ctx, from)) return 0
    let extra = 0
    if (hole && await effects.active(ctx, from, 'bag_hole')) {
      ctx.holeTransfers ||= new Map()
      const previous = ctx.holeTransfers.get(from) || { base: 0, extra: 0 }
      const totalBase = previous.base + base
      const wanted = Math.min(event.combat.holeBonusCap, Math.ceil(totalBase * event.combat.holeBonusPercent / 100)) - previous.extra
      extra = Math.max(0, Math.min(wanted, source.candy - base, event.candy.capacity - receiver.candy - base, allowance - base))
      ctx.holeTransfers.set(from, { base: totalBase, extra: previous.extra + extra })
    }
    await ctx.transfer(from, to, 'candy', base + extra, { outcome, ...(extra ? { holeBonus: extra } : {}) })
    ctx.candyTransferred = (ctx.candyTransferred || 0) + base + extra
    ctx.candyMovements ||= []
    ctx.candyMovements.push({ fromUserId: from, toUserId: to, candy: base + extra, holeBonus: extra })
    return base + extra
  }
  return { intercept, transfer, receipt: combatReceipt }
}
module.exports = { createCombat, combatReceipt }
