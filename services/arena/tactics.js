const { specialSlots, kitFor, canUse, selectEnemySpecial, exhaustedStressMultiplier } = require('./rules')
const { basicDamage, specialDamage, specialAlwaysHits } = require('./damage')
const { brinkAvailable, brinkHealth } = require('./passives')

// Enumerate only public dice mechanics, never the upcoming random draws.
const rates = { success: 0, opportunity: 0, fear: 0, hope: 0 }
for (let h = 1; h <= 12; h++) for (let f = 1; f <= 12; f++) {
  const success = h === f || h + f >= 12
  rates.success += Number(success) / 144
  rates.opportunity += Number(!success || f > h) / 144
  rates.fear += Number(f > h) / 144
  rates.hope += Number(h >= f) / 144
}

// Finite-threshold exact tail probability for the unbounded continuing-d4 sum.
// The threshold decreases at every recursive step, including equal rolls.
const tails = new Map()
function comboTail(needed, previous = 0) {
  if (needed <= 0) return 1
  const key = `${needed}:${previous}`
  if (tails.has(key)) return tails.get(key)
  let chance = 0
  for (let value = 1; value <= 4; value++) {
    chance += (value >= needed ? 1 : !previous || value >= previous ? comboTail(needed - value, value) : 0) / 4
  }
  tails.set(key, chance)
  return chance
}
// Mean previews use a tiny tail tolerance; knockout tails above are exact.
const comboMass = []
for (let total = 3; total <= 128; total++) {
  const mass = comboTail(total) - comboTail(total + 1)
  if (mass > 0) comboMass.push([total, mass])
  if (comboTail(total + 1) < 1e-13) break
}

function branches(fighter) {
  return fighter.isAI
    ? [[0, false, 1 - fighter.accuracy / 100], [1, false, fighter.accuracy / 100 * (1 - fighter.criticalChance / 100)], [1, true, fighter.accuracy / 100 * fighter.criticalChance / 100]]
    : [[0, false, 1 - rates.success], [1, Boolean(fighter.criticalReady), rates.success]]
}

const previews = new Map()
function preview(fighter, target, slot = null, choice = 3) {
  const cacheKey = [fighter.kit, fighter.isAI, fighter.attack, fighter.level, fighter.accuracy, fighter.criticalChance, fighter.criticalMultiplier,
    fighter.passive, fighter.opportunityReady, fighter.criticalReady, fighter.slayerCharges > 0, fighter.abilityRanks?.[slot], target.hp, target.stress, target.passive, target.brinkUsed, slot, choice].join('|')
  if (previews.has(cacheKey)) return previews.get(cacheKey)
  const definition = slot ? kitFor(fighter)[slot] : null
  const effects = definition?.stressRemovalChance && target.stress === 1
    ? [[target.stress, 1 - definition.stressRemovalChance / 100], [0, definition.stressRemovalChance / 100]] : [[target.stress, 1]]
  let knockout = 0, expected = 0, minimum = Infinity
  for (const [stress, effectChance] of effects) for (const [hit, critical, branchChance] of branches(fighter)) {
    if (!branchChance || !effectChance) continue
    const basic = hit ? basicDamage(fighter, target, { critical, targetStress: stress }) : 0
    const multiplier = stress === 0 ? exhaustedStressMultiplier : 1
    const criticalMultiplier = fighter.isAI && critical ? fighter.criticalMultiplier : 1
    const direct = total => !slot || (!hit && !specialAlwaysHits(fighter, slot)) ? 0 : specialDamage(fighter, slot, { total, choice, multiplier, criticalMultiplier }).damage
    const weight = branchChance * effectChance
    minimum = Math.min(minimum, basic + direct(definition?.type === 'combo' ? 3 : 0))
    if (definition?.type === 'combo' && (!fighter.isAI || hit)) {
      // Binary search the monotonic rounded damage function, bounded by the
      // target HP. There is no cap on actual Combo rolls or combat damage.
      let low = 3, high = Math.max(3, Math.ceil(target.hp * 100 / fighter.attack) + 1)
      while (low < high) { const mid = Math.floor((low + high) / 2); if (basic + direct(mid) >= target.hp) high = mid; else low = mid + 1 }
      knockout += weight * (basic + direct(low) >= target.hp ? comboTail(low) : 0)
      expected += weight * comboMass.reduce((sum, [total, chance]) => sum + chance * (basic + direct(total)), 0)
    } else {
      const damage = basic + direct(0)
      knockout += weight * Number(damage >= target.hp)
      expected += weight * damage
    }
  }
  const result = Object.freeze({ slot, knockout: brinkAvailable(target) ? 0 : knockout, expected, guaranteed: !brinkAvailable(target) && minimum >= target.hp, minimum })
  if (previews.size >= 50000) previews.clear()
  previews.set(cacheKey, result)
  return result
}

function survival(fighter, target, context = {}) {
  const frequency = actor => actor.isAI ? rates.opportunity : 1
  const hit = actor => actor.isAI ? actor.accuracy / 100 : rates.success
  const basic = (actor, defender) => branches(actor).reduce((n, [landed, crit, p]) => n + (landed ? basicDamage(actor, defender, { critical: crit }) * p : 0), 0) * frequency(actor)
  const estimate = (actor, defender, observed) => {
    const floor = basic(actor, defender)
    const resource = actor.isAI ? actor.fear : actor.hope
    const ready = specialSlots.filter(slot => canUse({ ...actor, hope: resource }, slot))
    const burst = Math.max(0, ...ready.filter(slot => kitFor(actor)[slot].type !== 'buff').map(slot =>
      (preview(actor, defender, slot).expected - preview(actor, defender).expected) * frequency(actor) *
      (slot === 'special3' ? 0.9 : 0.2)))
    // Blend already-observed special output with current basic/buff potential.
    // No pending action, future roll, or opponent policy enters the estimate.
    return Math.max(0.1, floor + Math.max(burst, context.rounds >= 3 ? observed / context.rounds : 0))
  }
  const incoming = estimate(target, fighter, context.opponentSpecialDamage || 0)
  const outgoing = estimate(fighter, target, context.ownSpecialDamage || 0)
  const own = (fighter.hp + (brinkAvailable(fighter) ? brinkHealth(fighter) : 0)) / incoming
  const enemy = (target.hp + (brinkAvailable(target) ? brinkHealth(target) : 0)) / outgoing
  const window = Math.min(own, enemy)
  // A newly activated buff cannot deliver until a later exchange.
  const futureHits = Math.max(0, window - 1) * frequency(fighter) * hit(fighter)
  return { own, enemy, window, incoming, outgoing, futureHits }
}

function decide(fighter, target, { resource = fighter.isAI ? fighter.fear : fighter.hope, choice = 3, context = {}, roll = () => 99.999 } = {}) {
  const actor = { ...fighter, hope: resource, ...(fighter.isAI ? { fear: resource } : {}) }
  const available = specialSlots.filter(slot => canUse(actor, slot))
  const base = preview(actor, target, null, choice)
  const candidates = available.map(slot => ({ ...preview(actor, target, slot, choice), cost: (kitFor(actor)[slot].stressCost || 0) + kitFor(actor)[slot].hopeCost }))
  const ordered = [...candidates].sort((a, b) => Number(b.guaranteed) - Number(a.guaranteed) ||
    (Math.abs(b.knockout - a.knockout) > 1e-9 ? b.knockout - a.knockout : a.cost - b.cost))
  const lethal = ordered.find(item => item.knockout > base.knockout + 0.1 || (item.guaranteed && !base.guaranteed))
  const horizon = survival(actor, target, context)
  const s1 = candidates.find(item => item.slot === 'special1'), s2 = candidates.find(item => item.slot === 'special2'), s3 = candidates.find(item => item.slot === 'special3')
  const exhausts = Boolean(s1 && actor.stress === kitFor(actor).special1.stressCost)
  const result = (slot, reason, flags = {}) => ({ slot, reason, ...flags, guaranteedAvailable: candidates.some(item => item.guaranteed) && !base.guaranteed,
    guaranteedTaken: Boolean(slot && candidates.find(item => item.slot === slot)?.guaranteed),
    lethalOnHitAvailable: actor.isAI && candidates.some(item => item.knockout > base.knockout + 0.1 && item.knockout >= actor.accuracy / 100 - 1e-9),
    exhaustedForKnockout: slot === 'special1' && exhausts && Boolean(lethal?.slot === slot), horizon })
  // Never spend solely to match the basic's existing knockout probability.
  if (base.guaranteed) return result(null, 'basic-lethal')
  if (lethal) return result(lethal.slot, 'knockout')
  if (base.knockout >= (actor.isAI ? actor.accuracy / 100 : rates.success) - 1e-9) return result(null, 'basic-lethal')
  const meaningfulBuff = () => {
    if (!s2 || kitFor(actor).special2.type !== 'buff') return true
    const fresh = Math.min(kitFor(actor).special2.hits, horizon.futureHits)
    const existing = Math.min(actor.slayerCharges || 0, horizon.futureHits)
    return fresh - existing >= 0.75
  }
  const canBuff = meaningfulBuff()
  const waitForFinisher = Math.max(0, 5 - resource) / (actor.isAI ? rates.fear : rates.hope)
  const delayedValue = s2 && kitFor(actor).special2.type === 'buff'
    ? Math.max(0, Math.min(3, horizon.futureHits) - Math.min(actor.slayerCharges || 0, horizon.futureHits)) *
      (basicDamage({ ...actor, slayerCharges: 1 }, target) - basicDamage({ ...actor, slayerCharges: 0 }, target)) : 0
  const s2Value = s2 ? s2.expected - base.expected + delayedValue : 0
  const saving = resource < 5 && resource >= 3 && horizon.window > waitForFinisher + 2 &&
    specialDamage(actor, 'special3', { choice }).damage > s2Value * 1.25
  const exhaustedHorizon = exhausts ? survival({ ...actor, stress: 0 }, target, context) : horizon
  const avoidExhaustion = exhausts && exhaustedHorizon.own > 3 && !(s1 && s1.knockout > base.knockout + 0.02)
  if (s3) return result('special3', 'spend-finisher')
  if (s2 && canBuff && horizon.own < waitForFinisher + 1.5) return result('special2', 'limited-survival')
  if (s1 && horizon.own <= 2.5) return result('special1', 'imminent-defeat')
  if (s1 && kitFor(actor).special1.stressRemovalChance && target.stress === 1 && !avoidExhaustion) return result('special1', 'strip-final-stress')
  const allowed = new Set(available.filter(slot => !(slot === 'special1' && avoidExhaustion) && !(slot === 'special2' && (saving || !canBuff))))
  let slot
  if (actor.isAI) {
    // Preserve the original conditional probability partition for allowed
    // actions; remove ineligible tactical choices rather than rerolling.
    slot = selectEnemySpecial(actor, resource, roll, allowed)
  } else slot = ['special3', 'special2', 'special1'].find(key => allowed.has(key)) || null
  return result(slot, saving ? 'save-finisher' : avoidExhaustion ? 'avoid-exhaustion' : !canBuff && s2 ? 'avoid-refresh' : 'probability',
    { avoidedExhaustion: avoidExhaustion && slot !== 'special1', savedForFinisher: saving && slot !== 'special2', avoidedRefresh: Boolean(s2 && !canBuff && slot !== 'special2') })
}

module.exports = { rates, comboTail, preview, survival, decide }
