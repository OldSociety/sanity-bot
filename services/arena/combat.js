const { randomInt } = require('node:crypto')
const {
  specialSlots,
  kitFor,
  selectEnemySpecial,
  canUse,
  statsForLevel,
  damageFor,
  exhaustedStressMultiplier,
  opportunityBonusPercent,
  playerCriticalMultiplier,
  enemyAttackStats,
  enemyAttackOutcome,
  balance,
} = require('./rules')
const { createStatistics, recordRound } = require('./statistics')
const { basicDamage, specialDamage, specialAlwaysHits } = require('./damage')
const { decide } = require('./tactics')
const { survive } = require('./passives')
const percentile = () => randomInt(0, 100)
const abilityPercentile = () => randomInt(0, 1000000) / 10000

function newBattle(
  hope = 0,
  { mode = 'active', character, level = 1, opponent = 'maxim' } = {},
) {
  const battle = {
    tick: 0,
    mode,
    marq: {
      ...statsForLevel(
        level,
        character ? character.kit || 'marq' : 'spooky-marq',
      ),
      kit: character ? character.kit || 'marq' : 'spooky-marq',
      basicHits: 0,
      focusHits: character?.kit === 'maxim' ? 3 : 0,
      slayerCharges: 0,
      passive: character ? character.passive || null : 'on-the-brink',
      brinkUsed: false,
      opportunityReady: false,
      criticalReady: false,
      abilityRanks: { special1: 1, special2: 1, special3: 1 },
      stress: 6,
      maxStress: 6,
      hope,
      maxHope: 6,
      name: character?.name || 'Marq',
      label: character?.label || 'Marq [Spooky]',
    },
    warrior: {
      ...statsForLevel(level, opponent === 'marq' ? 'spooky-marq' : 'maxim'),
      isAI: true,
      ...enemyAttackStats,
      kit: opponent === 'marq' ? 'spooky-marq' : 'maxim',
      basicHits: 0,
      focusHits: opponent === 'maxim' ? 3 : 0,
      slayerCharges: 0,
      passive: opponent === 'marq' ? 'on-the-brink' : 'not-good-enough',
      brinkUsed: false,
      opportunityReady: false,
      stress: 6,
      maxStress: 6,
      name: opponent === 'marq' ? 'Marq' : 'Maxim',
      difficulty: 12,
      fear: 0,
    },
    status: 'playing',
    rolls: [],
    special1Damage: 0,
    special2Damage: 0,
    special3Damage: 0,
    duality: null,
    marqDamage: 0,
    maximDamage: 0,
    hopeSpent: 0,
    hopeGained: 0,
    fearGained: 0,
    fearSpent: 0,
    enemySpecial: null,
    enemyOutcome: null,
    stressRestored: 0,
    tiedVictory: false,
    finisherPaid: false,
    latestCombo: null,
    recentRolls: [],
    actions: [],
    history: [],
  }
  battle.statistics = createStatistics(battle.marq, battle.warrior)
  return battle
}
function dualityDice(difficulty = 12, roll = () => randomInt(1, 13)) {
  const hope = roll(),
    fear = roll()
  if (
    ![hope, fear].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 12,
    )
  )
    throw Error('Expected d12 results from 1 to 12')
  const total = hope + fear,
    critical = hope === fear,
    success = critical || total >= difficulty
  return {
    hope,
    fear,
    total,
    difficulty,
    critical,
    success,
    withHope: hope >= fear,
    withFear: fear > hope,
  }
}
function comboDice(roll = () => randomInt(1, 5)) {
  const rolls = []
  let total = 0
  while (true) {
    const value = roll()
    if (!Number.isInteger(value) || value < 1 || value > 4)
      throw Error('Expected a d4 result from 1 to 4')
    const predecessor = rolls.at(-1)
    rolls.push(value)
    total += value // Include the stopping die; equal values continue.
    if (predecessor !== undefined && value < predecessor)
      return { rolls, total }
  }
}
function specialResult(
  fighter,
  slot,
  choice,
  roll,
  rank = 1,
  multiplier = 1,
  criticalMultiplier = 1,
) {
  if (!slot) return { slot: null, rolls: [], total: 0, percent: 0, damage: 0 }
  const definition = kitFor(fighter)[slot]
  const dice =
    definition.type === 'combo' ? comboDice(roll) : { rolls: [], total: 0 }
  return {
    slot,
    choice,
    name: definition.name,
    type: definition.type,
    hits: definition.hits,
    flatPercent: definition.flatPercent || 0,
    ...dice,
    ...specialDamage(fighter, slot, {
      total: dice.total,
      choice,
      multiplier,
      criticalMultiplier,
      rank,
    }),
  }
}
function specialEvent(result, actor, tick, resource, cost) {
  return { kind: 'special', ...result, actor, tick, resource, cost }
}
// Costs/eligibility use the player's pre-roll snapshot. AI can spend Fear earned
// in this exchange, preserving the existing automatic-opponent behavior.
function advance(
  battle,
  action,
  roll,
  rollDuality,
  rollFearSpend = abilityPercentile,
  rollAccuracy = percentile,
  rollCritical = percentile,
  rollEffect = abilityPercentile,
  { aiPolicy = 'tactical' } = {},
) {
  if (battle.status !== 'playing') return battle
  const selected =
    typeof action === 'object' && action !== null
      ? action
      : action === 'continue'
      ? {}
      : specialSlots.includes(action)
      ? { [action]: true }
      : null
  if (
    !selected ||
    Object.keys(selected).some(
      (key) => ![...specialSlots, 'choice'].includes(key),
    )
  )
    return battle
  const slots = specialSlots.filter((slot) => selected[slot]),
    slot = slots[0] || null
  if (
    slots.length > 1 ||
    (selected.choice !== undefined &&
      (slot !== 'special3' ||
        !Number.isInteger(selected.choice) ||
        selected.choice < 0 ||
        selected.choice > 5)) ||
    (slot &&
      !(slot === 'special3' && battle.finisherPaid) &&
      !canUse(battle.marq, slot)) ||
    (battle.finisherPaid && slot !== 'special3') ||
    (battle.mode === 'idle' && slot)
  )
    return battle
  const playerKit = kitFor(battle.marq),
    enemyKit = kitFor(battle.warrior)
  const definition = slot ? playerKit[slot] : null
  const hopeSpent =
    slot === 'special3' && battle.finisherPaid ? 0 : definition?.hopeCost || 0
  const stressSpent = definition?.stressCost || 0
  const duality = dualityDice(battle.warrior.difficulty, rollDuality)
  const hopeAfterSpend = battle.marq.hope - hopeSpent
  const hopeGained = duality.withHope
    ? Math.min(1, battle.marq.maxHope - hopeAfterSpend)
    : 0
  const fearGained = Number(duality.withFear),
    availableFear = battle.warrior.fear + fearGained
  const enemyAttacks = !duality.success || duality.withFear
  const enemyDecision =
    battle.mode !== 'idle' && enemyAttacks
      ? aiPolicy === 'legacy'
        ? {
            slot: selectEnemySpecial(
              battle.warrior,
              availableFear,
              rollFearSpend,
            ),
            reason: 'legacy',
          }
        : decide(battle.warrior, battle.marq, {
            resource: availableFear,
            roll: rollFearSpend,
            context: {
              rounds: battle.tick,
              ownSpecialDamage: ['special1', 'special2', 'special3'].reduce(
                (n, key) => n + battle.statistics.enemy.damage[key],
                0,
              ),
              opponentSpecialDamage: [
                'special1',
                'special2',
                'special3',
              ].reduce((n, key) => n + battle.statistics.player.damage[key], 0),
            },
          })
      : null
  const enemySpecial = enemyDecision?.slot || null
  const enemyDefinition = enemySpecial ? enemyKit[enemySpecial] : null
  const fearSpent = enemyDefinition?.hopeCost || 0,
    enemyStressSpent = enemyDefinition?.stressCost || 0
  const stressRestored = duality.critical
    ? Math.min(1, battle.marq.maxStress - (battle.marq.stress - stressSpent))
    : 0
  // Both independent removal effects see reserves after costs/recovery, before
  // damage. A miss does not cancel an activated buff or independent effect.
  const removal = (ability, available) => {
    if (!ability?.stressRemovalChance) return 0
    const value = rollEffect()
    if (!Number.isFinite(value) || value < 0 || value >= 100)
      throw Error('Expected effect percentile from 0 to below 100')
    return Number(value < ability.stressRemovalChance && available > 0)
  }
  const playerReserve = battle.marq.stress - stressSpent + stressRestored
  const enemyReserve = battle.warrior.stress - enemyStressSpent
  const stressRemoved = removal(definition, enemyReserve),
    enemyStressRemoved = removal(enemyDefinition, playerReserve)
  const playerStress = Math.max(0, playerReserve - enemyStressRemoved),
    enemyStress = Math.max(0, enemyReserve - stressRemoved)
  const playerVulnerability = playerStress === 0 ? exhaustedStressMultiplier : 1
  const enemyVulnerability = enemyStress === 0 ? exhaustedStressMultiplier : 1
  const enemyOutcome = enemyAttacks
    ? enemyAttackOutcome(battle.warrior, rollAccuracy, rollCritical)
    : null
  const enemyHit = ['hit', 'critical'].includes(enemyOutcome)
  const playerOpportunity =
    battle.marq.passive === 'not-good-enough' &&
    battle.marq.opportunityReady &&
    duality.success
  const enemyOpportunity =
    battle.warrior.passive === 'not-good-enough' &&
    battle.warrior.opportunityReady &&
    enemyHit
  const playerCritical = Boolean(battle.marq.criticalReady && duality.success)
  const enemyCritical =
    enemyOutcome === 'critical' ? battle.warrior.criticalMultiplier : 1
  const slayerActive = battle.marq.slayerCharges > 0
  const slayerPercent = slayerActive ? playerKit.special2.percent : 0
  const playerBase = duality.success
    ? basicDamage(battle.marq, battle.warrior, {
        critical: playerCritical,
        buff: false,
        targetStress: enemyStress,
      })
    : 0
  const playerCombinedPercent =
    2 + (playerOpportunity ? opportunityBonusPercent : 0) + slayerPercent
  const marqDamage = duality.success
    ? basicDamage(battle.marq, battle.warrior, {
        critical: playerCritical,
        targetStress: enemyStress,
      })
    : 0
  const slayerBonusDamage = marqDamage - playerBase
  const enemySlayerActive = battle.warrior.slayerCharges > 0
  const enemySlayerPercent = enemySlayerActive ? enemyKit.special2.percent : 0
  const enemyBase = enemyHit
    ? basicDamage(battle.warrior, battle.marq, {
        critical: enemyOutcome === 'critical',
        buff: false,
        targetStress: playerStress,
      })
    : 0
  const enemyCombinedPercent =
    balance.aiBasicPercent +
    (enemyOpportunity ? opportunityBonusPercent : 0) +
    enemySlayerPercent
  const enemyBasicDamage = enemyHit
    ? basicDamage(battle.warrior, battle.marq, {
        critical: enemyOutcome === 'critical',
        targetStress: playerStress,
      })
    : 0
  const enemySlayerBonus = enemyBasicDamage - enemyBase
  const playerSpecial = specialResult(
    battle.marq,
    slot,
    selected.choice || 0,
    roll,
    slot ? battle.marq.abilityRanks[slot] : 1,
    enemyVulnerability,
  )
  playerSpecial.stressRemoved = stressRemoved
  const enemyResult = specialResult(
    battle.warrior,
    enemySpecial,
    3,
    roll,
    1,
    playerVulnerability,
    enemyCritical,
  )
  enemyResult.stressRemoved = enemyStressRemoved
  // Finishers always land; other AI direct specials share basic accuracy.
  const enemySpecialHit =
    enemyHit || specialAlwaysHits(battle.warrior, enemySpecial)
  if (!enemySpecialHit) enemyResult.damage = 0
  const maximDamage = enemyBasicDamage + enemyResult.damage
  const marq = {
    ...battle.marq,
    hp: Math.max(0, battle.marq.hp - maximDamage),
    stress: playerStress,
    hope: hopeAfterSpend + hopeGained,
    focusHits:
      battle.marq.kit === 'maxim'
        ? Math.min(
            3,
            (definition?.requiredRecharge ? 0 : battle.marq.focusHits) +
              Number(duality.success),
          )
        : 0,
    slayerCharges:
      definition?.type === 'buff'
        ? definition.hits
        : Math.max(
            0,
            battle.marq.slayerCharges - Number(duality.success && slayerActive),
          ),
    basicHits:
      battle.marq.kit === 'maxim'
        ? Math.min(
            3,
            (definition?.requiredHits ? 0 : battle.marq.basicHits) +
              Number(duality.success),
          )
        : 0,
    criticalReady:
      duality.critical || Boolean(battle.marq.criticalReady && !playerCritical),
    opportunityReady:
      battle.marq.passive === 'not-good-enough' &&
      (enemyOutcome === 'miss' ||
        (battle.marq.opportunityReady && !playerOpportunity)),
  }
  const warrior = {
    ...battle.warrior,
    focusHits:
      battle.warrior.kit === 'maxim'
        ? Math.min(
            3,
            (enemyDefinition?.requiredRecharge ? 0 : battle.warrior.focusHits) +
              Number(enemyHit),
          )
        : 0,
    slayerCharges:
      enemyDefinition?.type === 'buff'
        ? enemyDefinition.hits
        : Math.max(
            0,
            battle.warrior.slayerCharges -
              Number(enemyHit && enemySlayerActive),
          ),
    hp: Math.max(0, battle.warrior.hp - marqDamage - playerSpecial.damage),
    stress: enemyStress,
    fear: availableFear - fearSpent,
    basicHits:
      battle.warrior.kit === 'maxim'
        ? Math.min(
            3,
            (enemyDefinition?.requiredHits ? 0 : battle.warrior.basicHits) +
              Number(enemyHit),
          )
        : 0,
    opportunityReady:
      battle.warrior.passive === 'not-good-enough' &&
      (!duality.success ||
        (battle.warrior.opportunityReady && !enemyOpportunity)),
  }
  // Both exchanges finish before evaluating defeat. Each Marq can prevent
  // one lethal exchange, independently, including simultaneous knockouts.
  const playerBrink = survive(marq),
    enemyBrink = survive(warrior)
  const tiedVictory = marq.hp === 0 && warrior.hp === 0
  const status =
      warrior.hp === 0 ? 'victory' : marq.hp === 0 ? 'defeat' : 'playing',
    tick = battle.tick + 1
  const playerName =
    battle.marq.name === battle.warrior.name
      ? `Your ${battle.marq.name}`
      : battle.marq.name
  const events = [
    { kind: 'roll', tick, ...duality, hopeGained, stressRestored },
    {
      kind: 'hit',
      tick,
      actor: playerName,
      target: battle.warrior.name,
      damage: marqDamage,
      outcome: playerCritical ? 'critical' : duality.success ? 'hit' : 'miss',
    },
  ]
  if (enemyAttacks)
    events.push({
      kind: 'hit',
      tick,
      actor: battle.warrior.name,
      target: playerName,
      damage: enemyBasicDamage,
      outcome: enemyOutcome,
    })
  if (slot)
    events.push(
      specialEvent(
        playerSpecial,
        playerName,
        tick,
        definition.stressCost ? 'Stress' : 'Hope',
        definition.stressCost || definition.hopeCost,
      ),
    )
  if (enemySpecial)
    events.push(
      specialEvent(
        enemyResult,
        battle.warrior.name,
        tick,
        enemyStressSpent ? 'Stress' : 'Fear',
        enemyStressSpent || fearSpent,
      ),
    )
  if (playerBrink)
    events.push({ kind: 'survival', actor: playerName, hp: playerBrink, tick })
  if (enemyBrink)
    events.push({
      kind: 'survival',
      actor: battle.warrior.name,
      hp: enemyBrink,
      tick,
    })
  const latestCombo =
    playerSpecial.type === 'combo'
      ? events.find(
          (event) => event.kind === 'special' && event.actor === playerName,
        )
      : battle.latestCombo
  const next = {
    tick,
    mode: battle.mode,
    marq,
    warrior,
    status,
    rolls: playerSpecial.rolls,
    special1Damage: slot === 'special1' ? playerSpecial.damage : 0,
    special2Damage:
      (slot === 'special2' ? playerSpecial.damage : 0) + slayerBonusDamage,
    special3Damage: slot === 'special3' ? playerSpecial.damage : 0,
    duality,
    marqDamage,
    maximDamage,
    hopeSpent,
    hopeGained,
    fearGained,
    fearSpent,
    enemySpecial,
    enemyOutcome,
    stressRestored,
    stressRemoved,
    enemyStressRemoved,
    tiedVictory,
    finisherPaid: false,
    latestCombo,
    recentRolls: [...battle.recentRolls, { ...duality, tick }].slice(-3),
    actions: [...battle.actions, ...events].slice(-5),
    history: [...battle.history, ...events],
    enemyDecision,
  }
  const playerNoVulnerability =
    (duality.success
      ? damageFor(
          battle.marq.attack,
          playerCombinedPercent,
          1,
          playerCritical ? playerCriticalMultiplier : 1,
        )
      : 0) +
    (slot && playerSpecial.type !== 'buff'
      ? damageFor(
          battle.marq.attack,
          playerSpecial.percent,
          battle.marq.abilityRanks[slot],
        )
      : 0)
  const enemyNoVulnerability =
    (enemyHit
      ? damageFor(battle.warrior.attack, enemyCombinedPercent, 1, enemyCritical)
      : 0) +
    (enemySpecialHit && enemySpecial && enemyResult.type !== 'buff'
      ? specialDamage(battle.warrior, enemySpecial, {
          total: enemyResult.total,
          choice: 3,
          criticalMultiplier: enemyCritical,
        }).damage
      : 0)
  const details = (basic, hit, result, extra) => ({
    damage: { basic, ...(result.slot ? { [result.slot]: result.damage } : {}) },
    attempts: {
      basic: extra.basicAttempt,
      ...(result.slot ? { [result.slot]: 1 } : {}),
    },
    hits: {
      basic: Number(hit),
      ...(result.slot ? { [result.slot]: Number(extra.specialHit) } : {}),
    },
    uses: result.slot ? { [result.slot]: 1 } : {},
    ...extra,
  })
  const playerDetails = details(playerBase, duality.success, playerSpecial, {
    basicAttempt: 1,
    specialHit: true,
    generated: hopeGained,
    spent: hopeSpent,
    stressSpent,
    stressRecovered: stressRestored,
    stressRemoved,
    focusActivation: Number(Boolean(definition?.requiredRecharge)),
    slayerActivation: Number(definition?.type === 'buff'),
    slayerConsumed: Number(duality.success && slayerActive),
    affordable: battle.marq.hope >= 5 || marq.hope >= 5 || battle.finisherPaid,
    vulnerabilityExtra:
      marqDamage + playerSpecial.damage - playerNoVulnerability,
  })
  const enemyDetails = details(enemyBase, enemyHit, enemyResult, {
    basicAttempt: Number(enemyAttacks),
    specialHit: enemySpecialHit,
    generated: fearGained,
    spent: fearSpent,
    stressSpent: enemyStressSpent,
    stressRecovered: 0,
    stressRemoved: enemyStressRemoved,
    focusActivation: Number(Boolean(enemyDefinition?.requiredRecharge)),
    slayerActivation: Number(enemyDefinition?.type === 'buff'),
    slayerConsumed: Number(enemyHit && enemySlayerActive),
    affordable: availableFear >= 5,
    vulnerabilityExtra: maximDamage - enemyNoVulnerability,
  })
  const addBuffDelivery = (data, actor, result, active, hit, bonus) => {
    // Activation is a use, not a direct attack. Count damage only as hits land.
    if (result.type === 'buff') {
      delete data.attempts.special2
      delete data.hits.special2
    }
    if (active && data.basicAttempt) {
      data.damage.special2 = (data.damage.special2 || 0) + bonus
      data.attempts.special2 = (data.attempts.special2 || 0) + 1
      data.hits.special2 = (data.hits.special2 || 0) + Number(hit)
    }
    data.slayerDiscarded =
      result.type === 'buff'
        ? Math.max(0, actor.slayerCharges - Number(hit && active))
        : 0
    // Basic and its buff land together, before the selected direct special.
    data.damageOrder = [
      ...new Set([
        'basic',
        ...(active ? ['special2'] : []),
        ...(result.slot ? [result.slot] : []),
      ]),
    ]
  }
  addBuffDelivery(
    playerDetails,
    battle.marq,
    playerSpecial,
    slayerActive,
    duality.success,
    slayerBonusDamage,
  )
  addBuffDelivery(
    enemyDetails,
    battle.warrior,
    enemyResult,
    enemySlayerActive,
    enemyHit,
    enemySlayerBonus,
  )
  next.statistics = recordRound(battle, next, {
    player: playerDetails,
    enemy: enemyDetails,
  })
  if (status !== 'playing') {
    marq.slayerCharges = 0
    warrior.slayerCharges = 0
    marq.opportunityReady = false
    warrior.opportunityReady = false
    marq.criticalReady = false
  }
  return next
}
function beginFinisher(battle) {
  if (
    battle.status !== 'playing' ||
    battle.mode === 'idle' ||
    battle.finisherPaid ||
    !canUse(battle.marq, 'special3')
  )
    return battle
  const cost = kitFor(battle.marq).special3.hopeCost,
    statistics = structuredClone(battle.statistics)
  statistics.player.spent += cost
  statistics.player.remaining = battle.marq.hope - cost
  return {
    ...battle,
    statistics,
    finisherPaid: true,
    marq: { ...battle.marq, hope: battle.marq.hope - cost },
  }
}
module.exports = { newBattle, comboDice, dualityDice, advance, beginFinisher }
