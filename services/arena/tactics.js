const {
  specialSlots,
  kitFor,
  canUse,
  selectEnemySpecial,
  exhaustedStressMultiplier,
  balance,
} = require('./rules')
const { exhausted, hasStress } = require('./resources')
const { basicDamage, specialDamage, specialAlwaysHits } = require('./damage')
const { brinkAvailable, brinkHealth } = require('./passives')
const outcomes = require('./outcomes')
const Duality = require('./duality')
const selene = require('./selene')
const resistance = require('./resistance')
const { stressRemovalAmount } = require('./stress-effects')

// Enumerate only public dice mechanics, never the upcoming random draws.
const rates = { success: 0, opportunity: 0, fear: 0, hope: 0 }
const playerIncomeBranches = new Map()
for (let h = 1; h <= 12; h++)
  for (let f = 1; f <= 12; f++) {
    const success = h === f || h + f >= 12
    rates.success += Number(success) / 144
    rates.opportunity += Number(!success || f > h) / 144
    rates.fear += Number(f > h) / 144
    rates.hope += Number(h >= f) / 144
    const key = JSON.stringify([Number(success), h === f, Number(h >= f)])
    playerIncomeBranches.set(key, (playerIncomeBranches.get(key) || 0) + 1)
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
    chance +=
      (value >= needed
        ? 1
        : !previous || value >= previous
        ? comboTail(needed - value, value)
        : 0) / 4
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
    ? [
        [0, false, 1 - fighter.accuracy / 100],
        [
          1,
          false,
          (fighter.accuracy / 100) * (1 - fighter.criticalChance / 100),
        ],
        [1, true, ((fighter.accuracy / 100) * fighter.criticalChance) / 100],
      ]
    : outcomes.enabled()
    ? [
        [0, false, 1 - rates.success],
        [1, false, rates.success - 1 / 12],
        [1, true, 1 / 12],
      ]
    : [
        [0, false, 1 - rates.success],
        [1, Boolean(fighter.criticalReady), rates.success],
      ]
}

const previews = new Map()
function preview(fighter, target, slot = null, choice = 3) {
  if (slot && outcomes.healingOnly(kitFor(fighter)[slot]))
    return Object.freeze({
      slot,
      knockout: 0,
      expected: 0,
      guaranteed: false,
      minimum: 0,
    })
  const cacheKey = [
    fighter.kit,
    fighter.isAI,
    fighter.attack,
    fighter.level,
    fighter.accuracy,
    fighter.criticalChance,
    fighter.criticalMultiplier,
    fighter.rage,
    fighter.alignmentStacks,
    fighter.lifeUses,
    selene.isSelene(fighter) ? Duality.value(fighter) : null,
    selene.wallActive(target, undefined, fighter),
    slot === 'special3' ? resistance.probability(fighter, target) : 0,
    target.kit,
    fighter.passive,
    fighter.opportunityReady,
    fighter.criticalReady,
    fighter.slayerCharges > 0,
    fighter.abilityRanks?.[slot],
    target.hp,
    target.maxHp,
    target.gravewardRound,
    target.combatRound,
    target.stress,
    target.passive,
    target.brinkUsed,
    slot,
    choice,
  ].join('|')
  if (outcomes.enabled())
    return modernPreview(fighter, target, slot, choice, cacheKey)
  if (previews.has(cacheKey)) return previews.get(cacheKey)
  const definition = slot ? kitFor(fighter)[slot] : null
  const effects =
    definition?.stressRemovalChance && hasStress(target) && target.stress > 0
      ? [
          [target.stress, 1 - definition.stressRemovalChance / 100],
          [
            Math.max(0, target.stress - stressRemovalAmount(definition)),
            definition.stressRemovalChance / 100,
          ],
        ]
      : [[target.stress, 1]]
  let knockout = 0,
    expected = 0,
    minimum = Infinity
  for (const [stress, effectChance] of effects)
    for (const [hit, critical, branchChance] of branches(fighter)) {
      if (!branchChance || !effectChance) continue
      const resolvedStress =
        balance.criticalEffects && fighter.isAI && critical && hasStress(target)
          ? Math.max(0, stress - 1)
          : stress
      const basic =
        (hit || definition?.guaranteedBasic) &&
        !(
          !fighter.isAI &&
          kitFor(fighter).special1.type === 'heal' &&
          slot &&
          !definition?.rollBasic
        ) &&
        !(fighter.kit === 'hellfed-marq' && slot && !definition?.rollBasic)
          ? basicDamage(fighter, target, {
              critical:
                !fighter.isAI && definition?.guaranteedBasic
                  ? Boolean(fighter.criticalReady)
                  : critical,
              targetStress: resolvedStress,
            })
          : 0
      const multiplier = exhausted(target, resolvedStress)
        ? exhaustedStressMultiplier
        : 1
      const criticalMultiplier =
        fighter.isAI && critical ? fighter.criticalMultiplier : 1
      const direct = (total, percent) =>
        !slot || (!hit && !specialAlwaysHits(fighter, slot))
          ? 0
          : specialDamage(fighter, slot, {
              total,
              choice,
              multiplier,
              criticalMultiplier,
              percent,
            }).damage
      const weight = branchChance * effectChance
      minimum = Math.min(
        minimum,
        basic + direct(definition?.type === 'combo' ? 3 : 0)
      )
      if (definition?.type === 'combo' && (!fighter.isAI || hit)) {
        // Binary search the monotonic rounded damage function, bounded by the
        // target HP. There is no cap on actual Combo rolls or combat damage.
        let low = 3,
          high = Math.max(3, Math.ceil((target.hp * 100) / fighter.attack) + 1)
        while (low < high) {
          const mid = Math.floor((low + high) / 2)
          if (basic + direct(mid) >= target.hp) high = mid
          else low = mid + 1
        }
        knockout +=
          weight * (basic + direct(low) >= target.hp ? comboTail(low) : 0)
        expected +=
          weight *
          comboMass.reduce(
            (sum, [total, chance]) => sum + chance * (basic + direct(total)),
            0
          )
      } else if (definition?.type === 'aiFinisher') {
        const [min, max] = balance.ai.finisherRange
        for (let percent = min; percent <= max; percent++) {
          const damage = basic + direct(0, percent)
          minimum = Math.min(minimum, damage)
          knockout += (weight * Number(damage >= target.hp)) / (max - min + 1)
          expected += (weight * damage) / (max - min + 1)
        }
      } else {
        const damage = basic + direct(0)
        knockout += weight * Number(damage >= target.hp)
        expected += weight * damage
      }
    }
  const result = Object.freeze({
    slot,
    knockout: brinkAvailable(target) ? 0 : Math.min(1, knockout),
    expected,
    guaranteed: !brinkAvailable(target) && minimum >= target.hp,
    minimum,
  })
  if (previews.size >= 50000) previews.clear()
  previews.set(cacheKey, result)
  return result
}

const modernPreviews = new Map()
function modernPreview(fighter, target, slot, choice, key) {
  if (require('./hendrix').isHendrix(fighter))
    return require('./hendrix').preview(
      fighter,
      target,
      slot,
      choice,
      branches(fighter)
    )
  if (modernPreviews.has(key)) return modernPreviews.get(key)
  const definition = slot ? kitFor(fighter)[slot] : null
  const hasBasic =
    fighter.isAI ||
    !slot ||
    definition?.rollBasic ||
    (balance.offensiveSpecialBasics && outcomes.isAttack(definition, slot))
  const rolls =
    hasBasic ||
    fighter.isAI ||
    !slot ||
    definition?.rollBasic ||
    (outcomes.isAttack(definition, slot) && slot !== 'special3')
  const nativePossibilities = rolls
    ? branches(
        fighter.isAI && definition?.guaranteedBasic
          ? { ...fighter, accuracy: 100 }
          : fighter
      )
    : [[1, false, 1]]
  let possibilities = selene.wallBranches(
    nativePossibilities,
    target,
    fighter,
    definition?.guaranteedBasic
  )
  if (selene.isSelene(fighter) && !fighter.isAI && rolls) {
    possibilities = []
    for (const [key, count] of playerIncomeBranches) {
      const [nativeHit, nativeCritical, income] = JSON.parse(key)
      const branch = [[nativeHit, nativeCritical, 1]]
      for (const [hit, critical, chance] of selene.wallBranches(
        branch,
        target,
        fighter,
        definition?.guaranteedBasic
      ))
        possibilities.push([hit, critical, (chance * count) / 144, income])
    }
  }
  let knockout = 0,
    expected = 0,
    minimum = Infinity
  for (const [hit, critical, chance, ownGain] of possibilities) {
    const attacker = selene.isSelene(fighter)
      ? Duality.grant(
          Duality.withValue(
            fighter,
            Math.max(0, Duality.value(fighter) - Duality.cost(definition))
          ),
          fighter.isAI ? Number(critical) : ownGain || 0
        ).fighter
      : fighter
    if (!chance) continue
    const basicCritical = Boolean(hasBasic && critical)
    const specialHit =
      slot === 'special3' || Boolean(hit) || definition?.guaranteedHit
    const basicHit = Boolean(hit) || definition?.guaranteedBasic
    const effectAllowed = outcomes.onHitAllowed(
      specialHit,
      definition?.stressRemovalRequiresHit ??
        outcomes.isAttack(definition, slot)
    )
    const effects =
      definition?.stressRemovalChance &&
      hasStress(target) &&
      target.stress > 0 &&
      effectAllowed
        ? [
            [target.stress, 1 - definition.stressRemovalChance / 100],
            [
              Math.max(0, target.stress - stressRemovalAmount(definition)),
              definition.stressRemovalChance / 100,
            ],
          ]
        : [[target.stress, 1]]
    for (const [stress, effectChance] of effects) {
      const resolvedStress =
        basicCritical && hasStress(target) ? Math.max(0, stress - 1) : stress
      const multiplier = exhausted(target, resolvedStress)
        ? exhaustedStressMultiplier
        : 1
      const rawBasic = hasBasic
        ? basicDamage(attacker, target, {
            critical: basicCritical,
            landed: basicHit,
            targetStress: resolvedStress,
          })
        : 0
      const basicBeforeDefense = basicHit
        ? rawBasic
        : outcomes.blockDamage(rawBasic, 'basic_damage')
      const basic = require('./kylax').mitigate(basicBeforeDefense, target, { critical: basicCritical })
      const direct = (total = 0, percent, resisted = false) => {
        if (!slot) return 0
        const raw = specialDamage(attacker, slot, {
          total,
          choice,
          multiplier,
          percent,
          target: { ...target, hp: Math.max(0, target.hp - basic) },
        }).damage
        return require('./kylax').mitigate(resistance.damage(
          specialHit ? raw : outcomes.blockDamage(raw),
          resisted
        ), target)
      }
      const weight = chance * effectChance
      minimum = Math.min(
        minimum,
        basic + direct(definition?.type === 'combo' ? 3 : 0)
      )
      if (definition?.type === 'combo') {
        let low = 3,
          high = Math.max(
            3,
            Math.ceil((target.hp * 100) / fighter.attack) * 4 + 4
          )
        while (low < high) {
          const mid = Math.floor((low + high) / 2)
          if (basic + direct(mid) >= target.hp) high = mid
          else low = mid + 1
        }
        knockout +=
          weight * (basic + direct(low) >= target.hp ? comboTail(low) : 0)
        expected +=
          weight *
          comboMass.reduce(
            (sum, [total, p]) => sum + p * (basic + direct(total)),
            0
          )
      } else if (
        definition?.type === 'aiFinisher' &&
        definition.aiPercent === undefined
      ) {
        const [min, max] = balance.ai.finisherRange
        for (let percent = min; percent <= max; percent++) {
          for (const [resisted, resistanceChance] of resistance.branches(
            fighter,
            target
          )) {
            const damage = basic + direct(0, percent, resisted)
            minimum = Math.min(minimum, damage)
            knockout +=
              (weight * resistanceChance * Number(damage >= target.hp)) /
              (max - min + 1)
            expected += (weight * resistanceChance * damage) / (max - min + 1)
          }
        }
      } else {
        for (const [resisted, resistanceChance] of slot === 'special3'
          ? resistance.branches(fighter, target)
          : [[false, 1]]) {
          const damage = basic + direct(0, undefined, resisted)
          minimum = Math.min(minimum, damage)
          knockout += weight * resistanceChance * Number(damage >= target.hp)
          expected += weight * resistanceChance * damage
        }
      }
    }
  }
  const result = Object.freeze({
    slot,
    expected,
    minimum,
    knockout: brinkAvailable(target) ? 0 : Math.min(1, knockout),
    guaranteed: !brinkAvailable(target) && minimum >= target.hp,
  })
  if (modernPreviews.size >= 50000) modernPreviews.clear()
  modernPreviews.set(key, result)
  return result
}

function survival(fighter, target, context = {}) {
  const frequency = (actor) =>
    actor.isAI && actor.stress < actor.maxStress
      ? 1 - balance.ai.stressRecoveryChance / 100
      : 1
  const hit = (actor) => (actor.isAI ? actor.accuracy / 100 : rates.success)
  const basic = (actor, defender) =>
    outcomes.enabled()
      ? preview(actor, defender).expected * frequency(actor)
      : branches(actor).reduce(
          (n, [landed, crit, p]) =>
            n +
            (landed ? basicDamage(actor, defender, { critical: crit }) * p : 0),
          0
        ) * frequency(actor)
  const estimate = (actor, defender, observed) => {
    const floor = basic(actor, defender)
    const resource = Duality.value(actor)
    const ready = specialSlots.filter((slot) =>
      canUse(Duality.withValue(actor, resource), slot)
    )
    const burst = Math.max(
      0,
      ...ready
        .filter((slot) => kitFor(actor)[slot].type !== 'buff')
        .map(
          (slot) =>
            (preview(actor, defender, slot).expected -
              preview(actor, defender).expected) *
            frequency(actor) *
            (slot === 'special3' ? 0.9 : 0.2)
        )
    )
    // Blend already-observed special output with current basic/buff potential.
    // No pending action, future roll, or opponent policy enters the estimate.
    return Math.max(
      0.1,
      floor +
        Math.max(burst, context.rounds >= 3 ? observed / context.rounds : 0)
    )
  }
  const incoming = estimate(target, fighter, context.opponentSpecialDamage || 0)
  const outgoing = estimate(fighter, target, context.ownSpecialDamage || 0)
  const own =
    (fighter.hp + (brinkAvailable(fighter) ? brinkHealth(fighter) : 0)) /
    incoming
  const enemy =
    (target.hp + (brinkAvailable(target) ? brinkHealth(target) : 0)) / outgoing
  const window = Math.min(own, enemy)
  // A newly activated buff cannot deliver until a later exchange.
  const futureHits = Math.max(0, window - 1) * frequency(fighter) * hit(fighter)
  return { own, enemy, window, incoming, outgoing, futureHits }
}

function decide(
  fighter,
  target,
  {
    resource = Duality.value(fighter),
    choice = 3,
    context = {},
    roll = () => 99.999,
  } = {}
) {
  const actor = Duality.withValue(fighter, resource)
  const supportPolicy = actor.isAI && balance.ai.supportPolicy?.enabled
  const available = specialSlots.filter((slot) => canUse(actor, slot))
  const base = preview(actor, target, null, choice)
  const candidates = available.map((slot) => ({
    ...preview(actor, target, slot, choice),
    cost:
      (kitFor(actor)[slot].stressCost || 0) + Duality.cost(kitFor(actor)[slot]),
  }))
  const ordered = [...candidates].sort(
    (a, b) =>
      Number(b.guaranteed) - Number(a.guaranteed) ||
      (Math.abs(b.knockout - a.knockout) > 1e-9
        ? b.knockout - a.knockout
        : a.cost - b.cost)
  )
  const lethal = ordered.find(
    (item) =>
      !(
        supportPolicy &&
        ['heal', 'graveward', 'windWall'].includes(kitFor(actor)[item.slot].type)
      ) &&
      (item.knockout > base.knockout + 0.1 ||
        (item.guaranteed && !base.guaranteed))
  )
  const horizon = survival(actor, target, context)
  const s1 = candidates.find((item) => item.slot === 'special1'),
    s2 = candidates.find((item) => item.slot === 'special2'),
    s3 = candidates.find((item) => item.slot === 'special3')
  const exhausts = Boolean(
    s1 &&
      hasStress(actor) &&
      kitFor(actor).special1.stressCost > 0 &&
      actor.stress === kitFor(actor).special1.stressCost
  )
  const result = (slot, reason, flags = {}) => ({
    slot,
    reason,
    ...flags,
    guaranteedAvailable:
      candidates.some((item) => item.guaranteed) && !base.guaranteed,
    guaranteedTaken: Boolean(
      slot && candidates.find((item) => item.slot === slot)?.guaranteed
    ),
    lethalOnHitAvailable:
      actor.isAI &&
      candidates.some(
        (item) =>
          item.knockout > base.knockout + 0.1 &&
          item.knockout >= actor.accuracy / 100 - 1e-9
      ),
    exhaustedForKnockout:
      slot === 'special1' && exhausts && Boolean(lethal?.slot === slot),
    horizon,
  })
  // Never spend solely to match the basic's existing knockout probability.
  if (base.guaranteed) return result(null, 'basic-lethal')
  if (lethal) return result(lethal.slot, 'knockout')
  if (
    supportPolicy &&
    (kitFor(actor).special1.type === 'heal' || require('./kylax').isKylax(actor))
  ) {
    const policy = balance.ai.supportPolicy
    const kit = kitFor(actor)
    const hpPercent = (actor.hp * 100) / actor.maxHp
    const urgent = hpPercent <= policy.urgentBelowPercent || horizon.own <= 1.5
    // An affordable Finisher takes priority unless immediate survival needs help.
    if (s3 && !urgent) return result('special3', 'spend-finisher')
    let supportSlot = null,
      chance = 0
    if (s1 && kit.special1.type === 'heal' && !context.defenseOnly) {
      const heal = Math.ceil(
        (actor.maxHp * selene.healPercent(actor, kit.special1)) / 100
      )
      const enoughStress =
        actor.stress - (kit.special1.stressCost || 0) >= policy.stressReserve
      // Require both an HP threshold and room for a complete heal. Diminishing
      // Selene heals use their current value, never the original coefficient.
      if (
        hpPercent <= policy.healBelowPercent &&
        actor.maxHp - actor.hp >= heal &&
        (enoughStress || urgent)
      ) {
        const after = survival(
          {
            ...actor,
            hp: Math.min(actor.maxHp, actor.hp + heal),
            stress: actor.stress - (kit.special1.stressCost || 0),
          },
          target,
          context
        )
        if (after.own > horizon.own + 0.25) {
          supportSlot = 'special1'
          chance = urgent
            ? policy.urgentHealChance
            : hpPercent <= 50
              ? policy.woundedHealChance
              : policy.healChance
        }
      }
    }
    const defenseSlot = kit.special1.type === 'graveward'
      ? 'special1'
      : kit.special2.type === 'windWall' ? 'special2' : null
    if (
      !supportSlot && defenseSlot && canUse(actor, defenseSlot) &&
      !context.supportEvaluated &&
      !(defenseSlot === 'special2' && selene.wallActive(actor, undefined, target)) &&
      (!kit[defenseSlot].stressCost ||
        actor.stress - kit[defenseSlot].stressCost >= policy.stressReserve || urgent)
    ) {
      supportSlot = defenseSlot
      // Only public, currently affordable player abilities are threats.
      chance = context.targetFinisherPaid || canUse(target, 'special3')
        ? policy.finisherThreatChance
        : canUse(target, 'special2')
          ? policy.specialThreatChance
          : policy.defenseChance
      if (urgent) chance = Math.max(chance, policy.urgentDefenseChance)
      if (kit[defenseSlot].type === 'graveward' && actor.bleeding)
        chance = Math.max(chance, policy.bleedingDefenseChance)
      // Spending Fear on a wall delays a Finisher; conserve it when close.
      if (
        Duality.cost(kit[defenseSlot]) > 0 &&
        resource >= Duality.cost(kit.special3) - 1 && !urgent
      )
        chance *= policy.saveFinisherMultiplier
    }
    if (supportSlot) {
      const draw = roll()
      if (!Number.isFinite(draw) || draw < 0 || draw >= 100)
        throw Error('Expected support percentile from 0 to below 100')
      if (draw < chance)
        return result(supportSlot, kit[supportSlot].type === 'heal'
          ? 'health-gated-healing' : 'public-threat-defense')
    }
    if (s3) return result('special3', 'spend-finisher')
    if (
      s2 && kit.special2.type !== 'windWall' &&
      (kit.special1.type === 'heal' || target.hp <= target.maxHp / 2 || horizon.own <= 3)
    ) {
      const allowed = new Set(['special2'])
      return result(selectEnemySpecial(actor, resource, roll, allowed), 'offensive-pressure')
    }
    return result(null, 'preserve-support-resources')
  }
  if (require('./kylax').isKylax(actor)) {
    // Public state only. Save the last Stress unless survival is immediate.
    if (s1 && (actor.bleeding || horizon.own <= 2) && (!exhausts || horizon.own <= 1.5))
      return result('special1', 'graveward-survival')
    if (s3) return result('special3', 'spend-finisher')
    if (s2 && (target.hp <= target.maxHp / 2 || horizon.own <= 3))
      return result('special2', 'execution-pressure')
    return result(null, 'preserve-execution-resources')
  }
  if (require('./hendrix').isHendrix(actor)) {
    if (s3) return result('special3', 'spend-finisher')
    // Presence is public; never inspect hidden remaining duration.
    if (s1 && !target.bleeding && actor.stress > 1)
      return result('special1', 'apply-bleeding')
    if (s2) return result('special2', 'flurry-pressure')
    if (s1 && !target.bleeding && horizon.own <= 2.5)
      return result('special1', 'bleeding-last-stand')
    return result(null, 'maintain-bleeding')
  }
  if (
    base.knockout >=
    (actor.isAI ? actor.accuracy / 100 : rates.success) - 1e-9
  )
    return result(null, 'basic-lethal')
  // Healing kits retain the lethal checks above and use observed incoming
  // pressure to reserve the last Stress unless the heal buys survival time.
  if (kitFor(actor).special1.type === 'heal') {
    const heal = Math.ceil(
      (actor.maxHp * selene.healPercent(actor, kitFor(actor).special1)) / 100
    )
    const missing = actor.maxHp - actor.hp
    const after = survival(
      {
        ...actor,
        stress: Math.max(0, actor.stress - 1),
        hp: Math.min(actor.maxHp, actor.hp + heal),
      },
      target,
      context
    )
    const improves = after.own > horizon.own + 0.25
    if (
      s1 &&
      missing >= heal &&
      improves &&
      (actor.stress > 1 || horizon.own <= 2)
    )
      return result('special1', 'healing-survival')
    if (s3) return result('special3', 'spend-finisher')
    if (s2 && (kitFor(actor).special2.type !== 'windWall' || !actor.windWall))
      return result(
        'special2',
        kitFor(actor).special2.type === 'windWall'
          ? 'wind-wall-defense'
          : 'starlight-pressure'
      )
    return result(null, 'preserve-healing-stress')
  }
  const meaningfulBuff = () => {
    if (!s2 || kitFor(actor).special2.type !== 'buff') return true
    const fresh = Math.min(kitFor(actor).special2.hits, horizon.futureHits)
    const existing = Math.min(actor.slayerCharges || 0, horizon.futureHits)
    return fresh - existing >= 0.75
  }
  const canBuff = meaningfulBuff()
  const finisherCost = Duality.cost(kitFor(actor).special3)
  const criticalResourceRate =
    balance.criticalEffects && actor.isAI
      ? (((actor.accuracy / 100) * actor.criticalChance) / 100) *
        (actor.stress < actor.maxStress
          ? 1 - balance.ai.stressRecoveryChance / 100
          : 1)
      : 0
  const waitForFinisher =
    Math.max(0, finisherCost - resource) /
    (actor.isAI ? rates.fear + criticalResourceRate : rates.hope)
  const delayedValue =
    s2 && kitFor(actor).special2.type === 'buff'
      ? Math.max(
          0,
          Math.min(3, horizon.futureHits) -
            Math.min(actor.slayerCharges || 0, horizon.futureHits)
        ) *
        (basicDamage({ ...actor, slayerCharges: 1 }, target) -
          basicDamage({ ...actor, slayerCharges: 0 }, target))
      : 0
  const s2Value = s2 ? s2.expected - base.expected + delayedValue : 0
  const finisherDirect = specialDamage(actor, 'special3', { choice }).damage
  const finisherValue = resistance
    .branches(actor, target)
    .reduce(
      (sum, [resisted, chance]) =>
        sum + chance * resistance.damage(finisherDirect, resisted),
      0
    )
  const saving =
    resource < finisherCost &&
    resource >= Duality.cost(kitFor(actor).special2) &&
    horizon.window > waitForFinisher + 2 &&
    finisherValue > s2Value * 1.25
  const exhaustedHorizon = exhausts
    ? survival({ ...actor, stress: 0 }, target, context)
    : horizon
  const avoidExhaustion =
    exhausts &&
    exhaustedHorizon.own > 3 &&
    !(s1 && s1.knockout > base.knockout + 0.02)
  if (s3) return result('special3', 'spend-finisher')
  if (s2 && canBuff && horizon.own < waitForFinisher + 1.5)
    return result('special2', 'limited-survival')
  if (s1 && horizon.own <= 2.5) return result('special1', 'imminent-defeat')
  if (
    s1 &&
    kitFor(actor).special1.stressRemovalChance &&
    hasStress(target) &&
    target.stress > 0 &&
    target.stress <= stressRemovalAmount(kitFor(actor).special1) &&
    !avoidExhaustion
  )
    return result('special1', 'strip-final-stress')
  const allowed = new Set(
    available.filter(
      (slot) =>
        !(slot === 'special1' && avoidExhaustion) &&
        !(slot === 'special2' && (saving || !canBuff))
    )
  )
  let slot
  if (actor.isAI) {
    // Preserve the original conditional probability partition for allowed
    // actions; remove ineligible tactical choices rather than rerolling.
    slot = selectEnemySpecial(actor, resource, roll, allowed)
  } else
    slot =
      ['special3', 'special2', 'special1'].find((key) => allowed.has(key)) ||
      null
  return result(
    slot,
    saving
      ? 'save-finisher'
      : avoidExhaustion
      ? 'avoid-exhaustion'
      : !canBuff && s2
      ? 'avoid-refresh'
      : 'probability',
    {
      avoidedExhaustion: avoidExhaustion && slot !== 'special1',
      savedForFinisher: saving && slot !== 'special2',
      avoidedRefresh: Boolean(s2 && !canBuff && slot !== 'special2'),
    }
  )
}

module.exports = { rates, comboTail, preview, survival, decide }
