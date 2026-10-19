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
  passives,
} = require('./rules')
const { createStatistics, recordRound } = require('./statistics')
const { basicDamage, specialDamage, specialAlwaysHits } = require('./damage')
const { decide } = require('./tactics')
const { survive } = require('./passives')
const { defaultCharacter, resolveCharacter } = require('./characters')
const outcomes = require('./outcomes')
const hendrix = require('./hendrix')
const Duality = require('./duality')
const selene = require('./selene')
const resistance = require('./resistance')
const { basic_damage } = require('./damage-types')
const {
  usesRage,
  hasStress,
  exhausted,
  rageValue,
  healthCost,
} = require('./resources')
const percentile = () => randomInt(0, 100)
const abilityPercentile = () => randomInt(0, 1000000) / 10000

function newBattle(
  hope = 0,
  {
    mode = 'active',
    character = defaultCharacter,
    level = 1,
    opponent = 'maxim',
  } = {}
) {
  character ||= defaultCharacter
  if (
    character.developmentOnly &&
    (!balance.characters[character.kit] || mode === 'idle')
  )
    throw Error('Character is development active Arena only')
  if (
    usesRage(character) &&
    (!balance.characters['hellfed-marq'] || mode === 'idle')
  )
    throw Error('Hellfed is development active Arena only')
  const opponentCharacter = resolveCharacter(opponent)
  if (
    usesRage(opponentCharacter || {}) &&
    !balance.ai.characters[opponentCharacter.kit]
  )
    throw Error('Hellfed AI is not part of this player prototype')
  if (!opponentCharacter) throw new Error('Unknown Arena opponent')
  if (
    opponentCharacter.developmentOnly &&
    (!balance.characters[opponentCharacter.kit] || mode === 'idle')
  )
    throw Error('Character is development active Arena only')
  const battle = {
    tick: 0,
    nextActor: 'player',
    mode,
    player: {
      ...statsForLevel(level, character.kit),
      kit: character.kit,
      ...(selene.isSelene(character)
        ? {
            alignmentStacks: 0,
            dualityEarned: 0,
            lifeUses: 0,
            combatRound: 1,
          }
        : {}),
      basicHits: 0,
      focusHits: kitFor(character).special1.requiredRecharge || 0,
      slayerCharges: 0,
      passive: character.passive || null,
      brinkUsed: false,
      opportunityReady: false,
      criticalReady: false,
      abilityRanks: { special1: 1, special2: 1, special3: 1 },
      stress: usesRage(character) ? 0 : 6,
      maxStress: usesRage(character) ? 0 : 6,
      ...(usesRage(character) ? { rage: 0, maxRage: 3 } : {}),
      hope,
      maxHope: 6,
      name: character.name,
      label: character.label,
    },
    enemy: {
      ...statsForLevel(level, opponentCharacter.kit),
      isAI: true,
      ...enemyAttackStats,
      kit: opponentCharacter.kit,
      ...(selene.isSelene(opponentCharacter)
        ? {
            alignmentStacks: 0,
            dualityEarned: 0,
            lifeUses: 0,
            combatRound: 1,
          }
        : {}),
      basicHits: 0,
      focusHits:
        kitFor({ ...opponentCharacter, isAI: true }).special1
          .requiredRecharge || 0,
      slayerCharges: 0,
      passive: opponentCharacter.passive,
      brinkUsed: false,
      opportunityReady: false,
      stress: usesRage(opponentCharacter) ? 0 : 6,
      maxStress: usesRage(opponentCharacter) ? 0 : 6,
      ...(usesRage(opponentCharacter) ? { rage: 0, maxRage: 3 } : {}),
      name: opponentCharacter.name,
      difficulty: 12,
      fear: 0,
    },
    status: 'playing',
    rolls: [],
    special1Damage: 0,
    special2Damage: 0,
    special3Damage: 0,
    duality: null,
    playerBasicDamage: 0,
    enemyDamage: 0,
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
  battle.statistics = createStatistics(battle.player, battle.enemy)
  return battle
}
function dualityDice(difficulty = 12, roll = () => randomInt(1, 13)) {
  const hope = roll(),
    fear = roll()
  if (
    ![hope, fear].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 12
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
  percent
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
      percent,
    }),
  }
}
function specialEvent(result, actor, tick, resource, cost) {
  return { kind: 'special', ...result, actor, tick, resource, cost }
}
// Primitive actor steps support player-first turns and isolated formula tests.
// Abilities replace the basic unless their kit explicitly includes a normal roll.
function advance(
  battle,
  action,
  roll,
  rollDuality,
  rollFearSpend = abilityPercentile,
  rollAccuracy = percentile,
  rollCritical = percentile,
  rollEffect = abilityPercentile,
  {
    aiPolicy = 'tactical',
    actor = 'exchange',
    enemySpendableFear,
    rollBlock = abilityPercentile,
    rollResistance = abilityPercentile,
    rollRecovery = abilityPercentile,
    rollFinisher = () =>
      randomInt(balance.ai.finisherRange[0], balance.ai.finisherRange[1] + 1),
  } = {}
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
      (key) => ![...specialSlots, 'choice'].includes(key)
    )
  )
    return battle
  const slots = specialSlots.filter((slot) => selected[slot]),
    slot = slots[0] || null
  if (
    !['exchange', 'player', 'enemy', 'ability'].includes(actor) ||
    (actor === 'enemy' && slot) ||
    (actor === 'ability' && !slot)
  )
    return battle
  if (
    slots.length > 1 ||
    (selected.choice !== undefined &&
      (slot !== 'special3' ||
        !Number.isInteger(selected.choice) ||
        selected.choice < 0 ||
        selected.choice > 5)) ||
    (slot &&
      !(slot === 'special3' && battle.finisherPaid) &&
      !canUse(battle.player, slot)) ||
    (battle.finisherPaid && slot !== 'special3') ||
    (battle.mode === 'idle' && slot)
  )
    return battle
  const playerKit = kitFor(battle.player),
    enemyKit = kitFor(battle.enemy)
  const definition = slot ? playerKit[slot] : null
  const modern = outcomes.enabled() && battle.mode !== 'idle'
  const hpSpent = healthCost(battle.player, definition)
  const hopeSpent =
    slot === 'special3' && battle.finisherPaid ? 0 : Duality.cost(definition)
  const stressSpent = definition?.stressCost || 0
  const playerActs =
    actor === 'player' ||
    actor === 'exchange' ||
    (actor === 'ability' && definition?.rollBasic === true) ||
    (modern &&
      balance.offensiveSpecialBasics &&
      actor === 'ability' &&
      outcomes.isAttack(definition, slot))
  const playerRolls =
    playerActs ||
    (modern &&
      actor === 'ability' &&
      outcomes.isAttack(definition, slot) &&
      slot !== 'special3')
  const duality = playerRolls
    ? dualityDice(battle.enemy.difficulty, rollDuality)
    : { success: false, critical: false, withHope: false, withFear: false }
  // Matching dice still succeed and generate Hope for specials, but only an
  // accompanying basic can receive critical damage or critical resource effects.
  if (modern && !playerActs) duality.critical = false
  const round = battle.tick + 1
  if (definition?.type === 'windWall') {
    battle = { ...battle, player: { ...battle.player } }
    selene.activateWall(battle.player, battle.enemy, round)
  }
  const hopeAfterSpend = Duality.value(Duality.spend(battle.player, hopeSpent))
  const hopeGained = duality.withHope
    ? Math.min(1, Duality.capacity(battle.player) - hopeAfterSpend)
    : 0
  const rollAward = Duality.grant(battle.enemy, Number(duality.withFear))
  const rollFearGained = rollAward.granted,
    availableFear = Duality.value(rollAward.fighter)
  // Award scaling before this action's damage, without changing the historical
  // pre-action balances used by payment, logging and ledger calculations.
  battle = {
    ...battle,
    player: Duality.withValue(
      Duality.grant(
        Duality.withValue(battle.player, hopeAfterSpend),
        hopeGained
      ).fighter,
      Duality.value(battle.player)
    ),
    enemy: Duality.withValue(rollAward.fighter, Duality.value(battle.enemy)),
  }
  // New Fear still enters the balance immediately, but the enemy may only
  // spend the balance visible before this player command and its response.
  const spendableFear =
    balance.ai.deferFearSpending && battle.mode !== 'idle'
      ? Math.max(
          0,
          Math.min(
            Duality.value(battle.enemy),
            enemySpendableFear ?? Duality.value(battle.enemy)
          )
        )
      : availableFear
  // A recovery replaces the opponent's response and never consumes attack RNG.
  let enemyStressRestored = 0
  if (
    actor === 'enemy' &&
    battle.mode !== 'idle' &&
    battle.enemy.stress < battle.enemy.maxStress
  ) {
    const recovery = rollRecovery()
    if (!Number.isFinite(recovery) || recovery < 0 || recovery >= 100)
      throw Error('Expected recovery percentile from 0 to below 100')
    enemyStressRestored = Number(recovery < balance.ai.stressRecoveryChance)
  }
  const enemyAttacks =
    (actor === 'enemy' || actor === 'exchange') && !enemyStressRestored
  const enemyDecision =
    battle.mode !== 'idle' && enemyAttacks
      ? aiPolicy === 'legacy'
        ? {
            slot: selectEnemySpecial(
              battle.enemy,
              spendableFear,
              rollFearSpend
            ),
            reason: 'legacy',
          }
        : decide(battle.enemy, battle.player, {
            resource: spendableFear,
            roll: rollFearSpend,
            context: {
              rounds: battle.tick,
              ownSpecialDamage: ['special1', 'special2', 'special3'].reduce(
                (n, key) => n + battle.statistics.enemy.damage[key],
                0
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
  if (enemyDefinition?.type === 'windWall') {
    battle = { ...battle, enemy: { ...battle.enemy } }
    selene.activateWall(battle.enemy, battle.player, round)
  }
  // Resolve activation-round defense before either incoming attack. This also
  // covers the primitive simultaneous exchange used by the diagnostic engine.
  if (
    modern &&
    playerActs &&
    !definition?.guaranteedBasic &&
    selene.wallActive(battle.enemy, round, battle.player)
  ) {
    const result = selene.wallOutcome(
      duality.critical ? 'critical' : duality.success ? 'hit' : 'block',
      battle.enemy,
      battle.player,
      round,
      rollBlock
    )
    duality.success = result !== 'block'
    duality.critical = result === 'critical'
  }
  const playerHit = Boolean(
    playerActs && (duality.success || definition?.guaranteedBasic)
  )
  const playerSpecialHit = Boolean(
    slot &&
      (slot === 'special3' ||
        !modern ||
        duality.success ||
        definition?.guaranteedHit)
  )
  const enemyHpSpent = healthCost(battle.enemy, enemyDefinition)
  const fearSpent = Duality.cost(enemyDefinition),
    enemyStressSpent = enemyDefinition?.stressCost || 0
  // Development symmetric critical effects resolve before damage. Keep the
  // established production RNG order when the prototype switch is absent.
  const drawEnemyOutcome = () => {
    const outcome = enemyAttackOutcome(
      enemyDefinition?.guaranteedBasic
        ? { ...battle.enemy, accuracy: 100 }
        : battle.enemy,
      rollAccuracy,
      rollCritical
    )
    const result = modern && outcome === 'miss' ? 'block' : outcome
    return modern && !enemyDefinition?.guaranteedBasic
      ? selene.wallOutcome(
          result,
          battle.player,
          battle.enemy,
          round,
          rollBlock
        )
      : result
  }
  const earlyEnemyOutcome =
    (balance.criticalEffects || modern) && enemyAttacks
      ? drawEnemyOutcome()
      : undefined
  const enemyCriticalSuccess = earlyEnemyOutcome === 'critical'
  // The opponent's Hope-equivalent is Fear. Grant after selecting/paying for
  // this action, so its critical reward becomes available on the next action.
  const enemyCriticalAward = Duality.grant(
    Duality.withValue(battle.enemy, availableFear - fearSpent),
    Number(enemyCriticalSuccess)
  )
  const enemyCriticalFearGained = enemyCriticalAward.granted
  const fearGained = rollFearGained + enemyCriticalFearGained
  if (enemyCriticalFearGained)
    battle = {
      ...battle,
      enemy: Duality.withValue(
        enemyCriticalAward.fighter,
        Duality.value(battle.enemy)
      ),
    }
  const enemyCriticalStressRestored =
    enemyCriticalSuccess && hasStress(battle.enemy)
      ? Math.min(
          1,
          battle.enemy.maxStress - (battle.enemy.stress - enemyStressSpent)
        )
      : 0
  const stressRestored =
    duality.critical && hasStress(battle.player)
      ? Math.min(
          1,
          battle.player.maxStress - (battle.player.stress - stressSpent)
        )
      : 0
  // Both independent removal effects see reserves after costs/recovery, before
  // damage. A miss does not cancel an activated buff or independent effect.
  const removal = (ability, available, landed, abilitySlot) => {
    if (!ability?.stressRemovalChance) return 0
    if (
      modern &&
      !outcomes.onHitAllowed(
        landed,
        ability.stressRemovalRequiresHit ??
          outcomes.isAttack(ability, abilitySlot)
      )
    )
      return 0
    const value = rollEffect()
    if (!Number.isFinite(value) || value < 0 || value >= 100)
      throw Error('Expected effect percentile from 0 to below 100')
    return Number(value < ability.stressRemovalChance && available > 0)
  }
  const playerReserve = hasStress(battle.player)
    ? battle.player.stress - stressSpent + stressRestored
    : 0
  const enemyReserve = hasStress(battle.enemy)
    ? battle.enemy.stress -
      enemyStressSpent +
      enemyStressRestored +
      enemyCriticalStressRestored
    : 0

  const criticalStressRemoved = Number(duality.critical && enemyReserve > 0)

  const stressRemoved = Math.min(
    enemyReserve,
    removal(definition, enemyReserve, playerSpecialHit, slot) +
      criticalStressRemoved
  )
  const enemyStressRemoved = Math.min(
    playerReserve,
    (hasStress(battle.player)
      ? removal(
          enemyDefinition,
          playerReserve,
          ['hit', 'critical'].includes(earlyEnemyOutcome) ||
            enemySpecial === 'special3',
          enemySpecial
        )
      : 0) + Number(enemyCriticalSuccess && playerReserve > 0)
  )

  const playerStress = Math.max(0, playerReserve - enemyStressRemoved)
  const enemyStress = Math.max(0, enemyReserve - stressRemoved)
  const playerVulnerability = exhausted(battle.player, playerStress)
    ? exhaustedStressMultiplier
    : 1
  const enemyVulnerability = exhausted(battle.enemy, enemyStress)
    ? exhaustedStressMultiplier
    : 1
  const enemyOutcome =
    earlyEnemyOutcome ??
    (enemyAttacks ? drawEnemyOutcome() : enemyStressRestored ? 'recover' : null)
  const enemyHit = ['hit', 'critical'].includes(enemyOutcome)
  const playerOpportunity =
    battle.player.passive === 'not-good-enough' &&
    battle.player.opportunityReady &&
    playerHit
  const enemyOpportunity =
    battle.enemy.passive === 'not-good-enough' &&
    battle.enemy.opportunityReady &&
    enemyHit
  const playerCritical = modern
    ? Boolean(playerRolls && duality.critical)
    : Boolean(battle.player.criticalReady && playerHit)
  const enemyCritical =
    enemyOutcome === 'critical' ? battle.enemy.criticalMultiplier : 1
  const slayerActive = battle.player.slayerCharges > 0
  const slayerPercent = slayerActive ? playerKit.special2.percent : 0
  const sequences = {}
  const bleedingDurations = {
    player:
      hendrix.isHendrix(battle.player) && playerActs && slot === 'special1'
        ? hendrix.duration(rollEffect)
        : null,
    enemy:
      hendrix.isHendrix(battle.enemy) &&
      enemyAttacks &&
      enemySpecial === 'special1'
        ? hendrix.duration(rollEffect)
        : null,
  }
  const deliverBasic = (fighter, target, attempt, landed, options) => {
    if (!attempt || (!modern && !landed)) return 0
    if (modern && hendrix.isHendrix(fighter)) {
      const side = fighter.isAI ? 'enemy' : 'player'
      const ownSlot = fighter.isAI ? enemySpecial : slot
      const value = (sequences[side] ||= hendrix.sequence(
        fighter,
        target,
        ownSlot,
        fighter.isAI ? enemyCriticalSuccess : playerCritical,
        options.targetStress,
        {
          duality: rollDuality || (() => randomInt(1, 13)),
          accuracy: rollAccuracy,
          critical: rollCritical,
          block: rollBlock,
          round,
          mainOutcome: fighter.isAI
            ? enemyOutcome
            : playerCritical
            ? 'critical'
            : playerHit
            ? 'hit'
            : 'block',
        }
      ))
      const multiplier = exhausted(target, options.targetStress)
        ? exhaustedStressMultiplier
        : 1
      return value.strikes.reduce(
        (sum, strike) =>
          sum +
          hendrix.strike(fighter, strike.outcome, value.bleeding, multiplier)
            .damage,
        0
      )
    }
    const damage = basicDamage(fighter, target, { ...options, landed })
    return modern && !landed
      ? outcomes.blockDamage(damage, basic_damage)
      : damage
  }
  const playerBase = deliverBasic(
    battle.player,
    battle.enemy,
    playerActs,
    playerHit,
    {
      critical: playerCritical,
      buff: false,
      targetStress: enemyStress,
    }
  )
  const playerCombinedPercent =
    balance.playerBasicPercent +
    (playerOpportunity ? opportunityBonusPercent : 0) +
    slayerPercent
  const playerBasicDamage = deliverBasic(
    battle.player,
    battle.enemy,
    playerActs,
    playerHit,
    {
      critical: playerCritical,
      targetStress: enemyStress,
    }
  )
  const slayerBonusDamage = playerBasicDamage - playerBase
  const enemySlayerActive = battle.enemy.slayerCharges > 0
  const enemySlayerPercent = enemySlayerActive ? enemyKit.special2.percent : 0
  const enemyBase = deliverBasic(
    battle.enemy,
    battle.player,
    enemyAttacks,
    enemyHit,
    {
      critical: enemyOutcome === 'critical',
      buff: false,
      targetStress: playerStress,
    }
  )
  const enemyCombinedPercent =
    balance.aiBasicPercent +
    (enemyOpportunity ? opportunityBonusPercent : 0) +
    enemySlayerPercent
  const enemyBasicDamage = deliverBasic(
    battle.enemy,
    battle.player,
    enemyAttacks,
    enemyHit,
    {
      critical: enemyOutcome === 'critical',
      targetStress: playerStress,
    }
  )
  const enemySlayerBonus = enemyBasicDamage - enemyBase
  const playerSpecial = specialResult(
    battle.player,
    slot,
    selected.choice || 0,
    roll,
    slot ? battle.player.abilityRanks[slot] : 1,
    enemyVulnerability,
    modern && playerCritical ? playerCriticalMultiplier : 1
  )
  if (balance.damageRules)
    playerSpecial.damageType =
      slot === 'special3'
        ? 'final_special_damage'
        : hendrix.isHendrix(battle.player)
        ? slot === 'special1'
          ? 'bleed_damage'
          : 'basic_damage'
        : 'special_damage'
  if (hendrix.isHendrix(battle.player) && slot === 'special1')
    playerSpecial.damage = 0
  if (modern && outcomes.isAttack(definition, slot)) {
    playerSpecial.outcome =
      slot === 'special3' ? 'hit' : playerSpecialHit ? 'hit' : 'block'
    if (!playerSpecialHit)
      playerSpecial.damage = outcomes.blockDamage(playerSpecial.damage)
  }
  if (modern)
    resistance.resolve(
      playerSpecial,
      battle.player,
      battle.enemy,
      round,
      rollResistance
    )
  playerSpecial.stressRemoved = modern
    ? Math.max(0, stressRemoved - criticalStressRemoved)
    : stressRemoved
  const enemyFinisherPercent =
    enemySpecial === 'special3'
      ? enemyDefinition.aiPercent ?? rollFinisher()
      : undefined
  if (
    enemyFinisherPercent !== undefined &&
    (!Number.isInteger(enemyFinisherPercent) ||
      enemyFinisherPercent < balance.ai.finisherRange[0] ||
      enemyFinisherPercent >
        Math.max(balance.ai.finisherRange[1], enemyDefinition.aiPercent || 0))
  )
    throw Error('Expected enemy Finisher percentage within configured range')
  const enemyResult = specialResult(
    battle.enemy,
    enemySpecial,
    3,
    roll,
    1,
    playerVulnerability,
    enemyCritical,
    enemyFinisherPercent
  )
  if (balance.damageRules)
    enemyResult.damageType =
      enemySpecial === 'special3'
        ? 'final_special_damage'
        : hendrix.isHendrix(battle.enemy)
        ? enemySpecial === 'special1'
          ? 'bleed_damage'
          : 'basic_damage'
        : 'special_damage'
  if (hendrix.isHendrix(battle.enemy) && enemySpecial === 'special1')
    enemyResult.damage = 0
  enemyResult.stressRemoved = modern
    ? Math.max(
        0,
        enemyStressRemoved - Number(enemyCriticalSuccess && playerReserve > 0)
      )
    : enemyStressRemoved
  // Finishers always land; other AI direct specials share basic accuracy.
  const enemySpecialHit =
    enemyHit ||
    enemyDefinition?.guaranteedHit ||
    specialAlwaysHits(battle.enemy, enemySpecial)
  if (!enemySpecialHit)
    enemyResult.damage = modern ? outcomes.blockDamage(enemyResult.damage) : 0
  if (modern && outcomes.isAttack(enemyDefinition, enemySpecial))
    enemyResult.outcome =
      enemySpecial === 'special3' ? 'hit' : enemySpecialHit ? 'hit' : 'block'
  if (modern)
    resistance.resolve(
      enemyResult,
      battle.enemy,
      battle.player,
      round,
      rollResistance
    )
  const enemyDamage = enemyBasicDamage + enemyResult.damage
  const healing = selene.healing
  const playerHealing = healing(battle.player, definition)
  const enemyHealing = healing(battle.enemy, enemyDefinition)
  if (definition?.type === 'heal') playerSpecial.healing = playerHealing
  if (enemyDefinition?.type === 'heal') enemyResult.healing = enemyHealing
  const rageAfterMiss = Math.max(
    0,
    rageValue(battle.player) - Number(playerActs && !playerHit)
  )
  const player = {
    ...battle.player,
    ...(selene.isSelene(battle.player)
      ? {
          lifeUses:
            (battle.player.lifeUses || 0) + Number(definition?.type === 'heal'),
          combatRound: round,
        }
      : {}),
    hp: Math.max(0, battle.player.hp + playerHealing - hpSpent - enemyDamage),
    ...(usesRage(battle.player)
      ? {
          rage: Math.max(
            0,
            Math.min(3, rageAfterMiss + Number(definition?.type === 'rage'))
          ),
        }
      : {}),
    stress: playerStress,
    ...Duality.fields(battle.player, hopeAfterSpend + hopeGained),
    focusHits: playerKit.special1.requiredRecharge
      ? Math.min(
          playerKit.special1.requiredRecharge,
          (definition?.requiredRecharge ? 0 : battle.player.focusHits) +
            Number(playerHit)
        )
      : 0,
    slayerCharges:
      definition?.type === 'buff'
        ? definition.hits
        : Math.max(
            0,
            battle.player.slayerCharges - Number(playerHit && slayerActive)
          ),
    basicHits: playerKit.special1.requiredHits
      ? Math.min(
          playerKit.special1.requiredHits,
          (definition?.requiredHits ? 0 : battle.player.basicHits) +
            Number(playerHit)
        )
      : 0,
    criticalReady:
      !modern &&
      (duality.critical ||
        Boolean(battle.player.criticalReady && !playerCritical)),
    opportunityReady:
      battle.player.passive === 'not-good-enough' &&
      ((sequences.enemy
        ? sequences.enemy.strikes.some((s) => s.outcome === 'block')
        : ['miss', 'block'].includes(enemyOutcome)) ||
        (battle.player.opportunityReady && !playerOpportunity)),
  }
  const enemy = {
    ...battle.enemy,
    ...(selene.isSelene(battle.enemy)
      ? {
          lifeUses:
            (battle.enemy.lifeUses || 0) +
            Number(enemyDefinition?.type === 'heal'),
          combatRound: round,
        }
      : {}),
    ...(usesRage(battle.enemy)
      ? {
          rage: Math.min(
            3,
            Math.max(
              0,
              rageValue(battle.enemy) - Number(enemyAttacks && !enemyHit)
            ) + Number(enemyDefinition?.type === 'rage')
          ),
        }
      : {}),
    focusHits: enemyKit.special1.requiredRecharge
      ? Math.min(
          enemyKit.special1.requiredRecharge,
          (enemyDefinition?.requiredRecharge ? 0 : battle.enemy.focusHits) +
            Number(enemyHit)
        )
      : 0,
    slayerCharges:
      enemyDefinition?.type === 'buff'
        ? enemyDefinition.hits
        : Math.max(
            0,
            battle.enemy.slayerCharges - Number(enemyHit && enemySlayerActive)
          ),
    hp: Math.max(
      0,
      battle.enemy.hp +
        enemyHealing -
        enemyHpSpent -
        playerBasicDamage -
        playerSpecial.damage
    ),
    stress: enemyStress,
    ...Duality.fields(
      battle.enemy,
      availableFear - fearSpent + enemyCriticalFearGained
    ),
    basicHits: enemyKit.special1.requiredHits
      ? Math.min(
          enemyKit.special1.requiredHits,
          (enemyDefinition?.requiredHits ? 0 : battle.enemy.basicHits) +
            Number(enemyHit)
        )
      : 0,
    opportunityReady:
      battle.enemy.passive === 'not-good-enough' &&
      ((sequences.player
        ? sequences.player.strikes.some((s) => s.outcome === 'block')
        : playerActs && !playerHit) ||
        (battle.enemy.opportunityReady && !enemyOpportunity)),
  }
  if (actor === 'enemy' || actor === 'exchange') {
    for (const fighter of [player, enemy]) {
      if (fighter.windWall?.endRound <= round) delete fighter.windWall
      if (selene.isSelene(fighter)) fighter.combatRound = round + 1
    }
  }
  const updateBleeding = (source, target, active, selectedSlot, side) => {
    if (!hendrix.isHendrix(source) || !active) return
    const remaining =
      (selectedSlot === 'special1'
        ? bleedingDurations[side]
        : target.bleeding?.remaining || 0) - 1
    if (remaining > 0) target.bleeding = { remaining }
    else delete target.bleeding
  }
  updateBleeding(battle.player, enemy, playerActs, slot, 'player')
  updateBleeding(
    battle.enemy,
    player,
    enemyAttacks || enemyStressRestored > 0,
    enemySpecial,
    'enemy'
  )
  // Both exchanges finish before evaluating defeat. Each Marq can prevent
  // one lethal exchange, independently, including simultaneous knockouts.
  const playerBrink = survive(player),
    enemyBrink = survive(enemy)
  const tiedVictory = player.hp === 0 && enemy.hp === 0
  const status =
      enemy.hp === 0 ? 'victory' : player.hp === 0 ? 'defeat' : 'playing',
    tick = battle.tick + 1
  const playerName =
    battle.player.name === battle.enemy.name
      ? `Your ${battle.player.name}`
      : battle.player.name
  playerSpecial.rage = usesRage(player) ? player.rage : undefined
  const events = playerRolls
    ? [
        {
          kind: 'roll',
          tick,
          ...duality,
          ...(modern ? { immediateCritical: true } : {}),
          hopeGained,
          stressRestored,
          stressRemoved: criticalStressRemoved,
        },
        ...(playerActs
          ? [
              {
                kind: 'hit',
                tick,
                actor: playerName,
                target: battle.enemy.name,
                damage: playerBasicDamage,
                ...(sequences.player
                  ? {
                      strikes: sequences.player.strikes,
                      bleeding: sequences.player.bleeding,
                    }
                  : {}),
                guaranteed: Boolean(
                  definition?.guaranteedBasic && !duality.success
                ),
                outcome: playerCritical
                  ? 'critical'
                  : playerHit
                  ? 'hit'
                  : modern
                  ? 'block'
                  : 'miss',
              },
            ]
          : []),
      ]
    : []
  if (hpSpent)
    events.unshift({
      kind: 'sacrifice',
      tick,
      actor: playerName,
      hp: hpSpent,
      name: definition.name,
    })
  if (enemyHpSpent)
    events.push({
      kind: 'sacrifice',
      actor: battle.enemy.name,
      tick,
      hp: enemyHpSpent,
      name: enemyDefinition.name,
    })
  if (usesRage(player) && rageAfterMiss < rageValue(battle.player))
    events.push({
      kind: modern ? 'rageBlock' : 'rageMiss',
      tick,
      rage: rageAfterMiss,
    })
  if (
    usesRage(battle.enemy) &&
    enemyAttacks &&
    !enemyHit &&
    rageValue(battle.enemy) > 0
  )
    events.push({
      kind: modern ? 'rageBlock' : 'rageMiss',
      actor: battle.enemy.name,
      tick,
      rage: enemy.rage,
    })
  if (enemyStressRestored)
    events.push({
      kind: 'recovery',
      actor: battle.enemy.name,
      tick,
      stressRestored: enemyStressRestored,
    })
  if (enemyAttacks)
    events.push({
      kind: 'hit',
      tick,
      actor: battle.enemy.name,
      target: playerName,
      damage: enemyBasicDamage,
      ...(sequences.enemy
        ? {
            strikes: sequences.enemy.strikes,
            bleeding: sequences.enemy.bleeding,
          }
        : {}),
      outcome: enemyOutcome,
      fearGained: enemyCriticalFearGained,
      stressRestored: enemyCriticalStressRestored,
      stressRemoved: Number(enemyCriticalSuccess && playerReserve > 0),
    })
  if (slot)
    events.push(
      specialEvent(
        playerSpecial,
        playerName,
        tick,
        hpSpent ? 'HP' : definition.stressCost ? 'Stress' : 'Hope',
        hpSpent || definition.stressCost || Duality.cost(definition)
      )
    )
  if (enemySpecial)
    events.push(
      specialEvent(
        enemyResult,
        battle.enemy.name,
        tick,
        enemyHpSpent ? 'HP' : enemyStressSpent ? 'Stress' : 'Fear',
        enemyHpSpent || enemyStressSpent || fearSpent
      )
    )
  if (playerBrink)
    events.push({
      kind: 'survival',
      actor: playerName,
      name: passives[player.passive]?.name,
      hp: playerBrink,
      tick,
    })
  if (enemyBrink)
    events.push({
      kind: 'survival',
      actor: battle.enemy.name,
      name: passives[enemy.passive]?.name,
      hp: enemyBrink,
      tick,
    })
  const latestCombo =
    playerSpecial.type === 'combo'
      ? events.find(
          (event) => event.kind === 'special' && event.actor === playerName
        )
      : battle.latestCombo
  const next = {
    tick,
    mode: battle.mode,
    player,
    enemy,
    status,
    rolls: playerSpecial.rolls,
    special1Damage: slot === 'special1' ? playerSpecial.damage : 0,
    special2Damage:
      (slot === 'special2' ? playerSpecial.damage : 0) + slayerBonusDamage,
    special3Damage: slot === 'special3' ? playerSpecial.damage : 0,
    duality: playerRolls ? duality : battle.duality,
    nextActor:
      actor === 'ability'
        ? battle.nextActor || 'player'
        : actor === 'player'
        ? 'enemy'
        : 'player',
    playerBasicDamage,
    enemyDamage,
    hopeSpent,
    hopeGained,
    fearGained,
    enemyCriticalFearGained,
    fearSpent,
    enemySpecial,
    enemyOutcome,
    enemyStressRestored,
    stressRestored,
    stressRemoved,
    enemyStressRemoved,
    tiedVictory,
    finisherPaid: false,
    latestCombo,
    recentRolls: playerRolls
      ? [...battle.recentRolls, { ...duality, tick }].slice(-3)
      : battle.recentRolls,
    actions: [...battle.actions, ...events]
      .filter((event) => event.kind !== 'roll')
      .slice(-2),
    history: [...battle.history, ...events],
    enemyDecision,
  }
  const playerNoVulnerability =
    (playerHit
      ? damageFor(
          battle.player.attack,
          playerCombinedPercent,
          1,
          playerCritical ? playerCriticalMultiplier : 1
        )
      : 0) +
    (slot && playerSpecial.type !== 'buff'
      ? damageFor(
          battle.player.attack,
          playerSpecial.percent,
          battle.player.abilityRanks[slot]
        )
      : 0)
  const enemyNoVulnerability =
    (enemyHit
      ? damageFor(battle.enemy.attack, enemyCombinedPercent, 1, enemyCritical)
      : 0) +
    (enemySpecialHit && enemySpecial && enemyResult.type !== 'buff'
      ? specialDamage(battle.enemy, enemySpecial, {
          total: enemyResult.total,
          choice: 3,
          criticalMultiplier: enemyCritical,
          percent: enemyFinisherPercent,
        }).damage
      : 0)
  const unmodifiedSpecial = (
    fighter,
    result,
    landed,
    criticalMultiplier,
    percent
  ) => {
    if (!result.slot) return 0
    const damage = specialDamage(fighter, result.slot, {
      total: result.total,
      choice: result.choice,
      criticalMultiplier,
      percent,
    }).damage
    const delivered = landed ? damage : outcomes.blockDamage(damage)
    return resistance.damage(delivered, result.resisted)
  }
  const playerVulnerabilityExtra = modern
    ? playerBasicDamage +
      playerSpecial.damage -
      deliverBasic(battle.player, battle.enemy, playerActs, playerHit, {
        critical: playerCritical,
        targetStress: 1,
      }) -
      unmodifiedSpecial(
        battle.player,
        playerSpecial,
        playerSpecialHit,
        playerCritical ? 2 : 1
      )
    : playerBasicDamage + playerSpecial.damage - playerNoVulnerability
  const enemyVulnerabilityExtra = modern
    ? enemyDamage -
      deliverBasic(battle.enemy, battle.player, enemyAttacks, enemyHit, {
        critical: enemyOutcome === 'critical',
        targetStress: 1,
      }) -
      unmodifiedSpecial(
        battle.enemy,
        enemyResult,
        enemySpecialHit,
        enemyCritical,
        enemyFinisherPercent
      )
    : enemyDamage - enemyNoVulnerability
  const details = (basic, hit, result, extra) => ({
    damage: {
      basic,
      ...(result.slot ? { [result.slot]: result.damage } : {}),
    },
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
  const playerDetails = details(playerBase, playerHit, playerSpecial, {
    ...(modern && playerSpecial.slot === 'special3' && resistance.enabled()
      ? {
          resistanceMetrics: {
            attempts: 1,
            resisted: Number(playerSpecial.resisted),
            prevented: playerSpecial.resistancePrevented,
            wallAttempts: Number(
              playerSpecial.resistanceSource === 'wind-wall'
            ),
            wallResisted: Number(
              playerSpecial.resistanceSource === 'wind-wall' &&
                playerSpecial.resisted
            ),
            wallPrevented:
              playerSpecial.resistanceSource === 'wind-wall'
                ? playerSpecial.resistancePrevented
                : 0,
          },
        }
      : {}),
    basicAttempt: Number(playerActs),
    specialHit:
      !modern || (outcomes.isAttack(definition, slot) && playerSpecialHit),
    ...(modern
      ? {
          blocks: {
            basic: Number(playerActs && !playerHit),
            ...(outcomes.isAttack(definition, slot)
              ? { [slot]: Number(!playerSpecialHit) }
              : {}),
          },
          criticals: {
            basic: Number(playerActs && playerCritical),
          },
        }
      : {}),
    generated: hopeGained,
    spent: hopeSpent,
    stressSpent,
    healing: playerHealing,
    stressRecovered: stressRestored,
    stressRemoved,
    focusActivation: Number(Boolean(definition?.requiredRecharge)),
    slayerActivation: Number(definition?.type === 'buff'),
    slayerConsumed: Number(playerHit && slayerActive),
    affordable:
      Duality.value(battle.player) >= Duality.cost(playerKit.special3) ||
      Duality.value(player) >= Duality.cost(playerKit.special3) ||
      battle.finisherPaid,
    vulnerabilityExtra: playerVulnerabilityExtra,
  })
  const enemyDetails = details(enemyBase, enemyHit, enemyResult, {
    ...(modern && enemyResult.slot === 'special3' && resistance.enabled()
      ? {
          resistanceMetrics: {
            attempts: 1,
            resisted: Number(enemyResult.resisted),
            prevented: enemyResult.resistancePrevented,
            wallAttempts: Number(enemyResult.resistanceSource === 'wind-wall'),
            wallResisted: Number(
              enemyResult.resistanceSource === 'wind-wall' &&
                enemyResult.resisted
            ),
            wallPrevented:
              enemyResult.resistanceSource === 'wind-wall'
                ? enemyResult.resistancePrevented
                : 0,
          },
        }
      : {}),
    basicAttempt: Number(enemyAttacks),
    specialHit: enemySpecialHit,
    ...(modern
      ? {
          blocks: {
            basic: Number(enemyAttacks && !enemyHit),
            ...(outcomes.isAttack(enemyDefinition, enemySpecial)
              ? { [enemySpecial]: Number(!enemySpecialHit) }
              : {}),
          },
          criticals: {
            basic: Number(enemyOutcome === 'critical'),
          },
        }
      : {}),
    generated: fearGained,
    spent: fearSpent,
    stressSpent: enemyStressSpent,
    healing: enemyHealing,
    stressRecovered: enemyStressRestored + enemyCriticalStressRestored,
    stressRemoved: enemyStressRemoved,
    focusActivation: Number(Boolean(enemyDefinition?.requiredRecharge)),
    slayerActivation: Number(enemyDefinition?.type === 'buff'),
    slayerConsumed: Number(enemyHit && enemySlayerActive),
    affordable:
      availableFear >= Duality.cost(enemyKit.special3) ||
      Duality.value(enemy) >= Duality.cost(enemyKit.special3),
    vulnerabilityExtra: enemyVulnerabilityExtra,
  })
  const strikeDetails = (data, value, ownSlot, side) => {
    if (!value) return
    const bonusDamage = data.damage[ownSlot] || 0
    const basicStrikes = value.strikes.slice(0, 3),
      extra = value.strikes.slice(3)
    data.damage.basic = basicStrikes.reduce((n, s) => n + s.direct, 0)
    if (extra.length)
      data.damage.special2 =
        (data.damage.special2 || 0) + extra.reduce((n, s) => n + s.direct, 0)
    data.damage.bleeding = value.bleed
    data.damagePackets = value.strikes.flatMap((strike, i) => [
      { source: i < 3 ? 'basic' : 'special2', damage: strike.direct },
      { source: 'bleeding', damage: strike.bleed },
    ])
    if (bonusDamage)
      data.damagePackets.push({ source: ownSlot, damage: bonusDamage })
    data.attempts.basic = value.strikes.length
    data.hits.basic = value.strikes.filter((s) => s.outcome !== 'block').length
    data.blocks.basic = value.strikes.filter(
      (s) => s.outcome === 'block'
    ).length
    data.criticals.basic = value.strikes.filter(
      (s) => s.outcome === 'critical'
    ).length
    data.strikeMetrics = {
      sequences: 1,
      bleedingSequences: Number(value.bleeding),
      strikes: value.strikes.length,
      criticals: data.criticals.basic,
      blocks: data.blocks.basic,
      prevented: value.prevented,
      bleedingDamage: value.bleed,
      bleedingApplications: Number(bleedingDurations[side] !== null),
      duration2: Number(bleedingDurations[side] === 2),
      duration3: Number(bleedingDurations[side] === 3),
      duration4: Number(bleedingDurations[side] === 4),
      maximumFlurries: Number(
        ownSlot === 'special2' &&
          value.strikes.every((s) => s.outcome === 'critical')
      ),
      bleedingMaximumFlurries: Number(
        ownSlot === 'special2' &&
          value.bleeding &&
          value.strikes.every((s) => s.outcome === 'critical')
      ),
    }
  }
  strikeDetails(playerDetails, sequences.player, slot, 'player')
  strikeDetails(enemyDetails, sequences.enemy, enemySpecial, 'enemy')
  const wallMetrics = (
    data,
    fighter,
    target,
    attempt,
    hit,
    result,
    sequence
  ) => {
    if (
      !attempt ||
      !selene.wallActive(target, round, fighter) ||
      kitFor(fighter)[result.slot]?.guaranteedBasic
    )
      return
    const rawBasic = basicDamage(fighter, target, {
      critical: false,
      landed: false,
      targetStress: target.stress,
    })
    const blockedBasic = outcomes.blockDamage(rawBasic, basic_damage)
    const specialBlocked = result.outcome === 'block'
    const rawSpecial = specialBlocked
      ? specialDamage(fighter, result.slot, {
          total: result.total,
          choice: result.choice,
          multiplier: exhausted(target) ? exhaustedStressMultiplier : 1,
        }).damage
      : 0
    data.wallMetrics = {
      checks: sequence?.strikes.length || 1,
      blocks: sequence
        ? sequence.strikes.filter((s) => s.outcome === 'block').length
        : Number(!hit),
      prevented:
        (sequence?.prevented ?? (!hit ? rawBasic - blockedBasic : 0)) +
        (specialBlocked ? rawSpecial - result.damage : 0),
    }
  }
  wallMetrics(
    playerDetails,
    battle.player,
    battle.enemy,
    playerActs,
    playerHit,
    playerSpecial,
    sequences.player
  )
  wallMetrics(
    enemyDetails,
    battle.enemy,
    battle.player,
    enemyAttacks,
    enemyHit,
    enemyResult,
    sequences.enemy
  )
  const addBuffDelivery = (data, actor, result, active, hit, bonus) => {
    // Activation is a use, not a direct attack. Count damage only as hits land.
    if (
      result.type === 'buff' ||
      (modern &&
        result.slot &&
        !outcomes.isAttack(kitFor(actor)[result.slot], result.slot))
    ) {
      delete data.attempts[result.slot]
      delete data.hits[result.slot]
    }
    if (active && data.basicAttempt && (!modern || hit)) {
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
        ...(data.damage.bleeding ? ['bleeding'] : []),
        ...(active ? ['special2'] : []),
        ...(result.slot ? [result.slot] : []),
      ]),
    ]
  }
  addBuffDelivery(
    playerDetails,
    battle.player,
    playerSpecial,
    slayerActive,
    playerHit,
    slayerBonusDamage
  )
  addBuffDelivery(
    enemyDetails,
    battle.enemy,
    enemyResult,
    enemySlayerActive,
    enemyHit,
    enemySlayerBonus
  )
  next.statistics = recordRound(battle, next, {
    player: playerDetails,
    enemy: enemyDetails,
  })
  if (status !== 'playing') {
    player.slayerCharges = 0
    enemy.slayerCharges = 0
    player.opportunityReady = false
    enemy.opportunityReady = false
    player.criticalReady = false
  }
  return next
}
function beginFinisher(battle) {
  if (
    battle.status !== 'playing' ||
    battle.mode === 'idle' ||
    battle.finisherPaid ||
    !canUse(battle.player, 'special3')
  )
    return battle
  const cost = Duality.cost(kitFor(battle.player).special3),
    statistics = structuredClone(battle.statistics)
  statistics.player.spent += cost
  statistics.player.remaining = Duality.value(battle.player) - cost
  return {
    ...battle,
    statistics,
    finisherPaid: true,
    player: Duality.spend(battle.player, cost),
  }
}
// A player command and its surviving opponent's response form one JRPG turn.
// Resolve sequentially so a knockout prevents the opponent from acting.
function takeTurn(
  battle,
  action,
  roll,
  rollDuality,
  rollFearSpend,
  rollAccuracy,
  rollCritical,
  rollEffect,
  options = {}
) {
  const basic = action === 'basic'
  const player = advance(
    battle,
    basic ? {} : action,
    roll,
    rollDuality,
    rollFearSpend,
    rollAccuracy,
    rollCritical,
    rollEffect,
    { ...options, actor: basic ? 'player' : 'ability' }
  )
  if (player === battle) return player
  const move = (events) => ({
    kind: 'move',
    tick: player.tick,
    events: events.filter((event) => event.kind !== 'roll'),
  })
  const playerMove = move(player.history.slice(battle.history.length))
  if (player.status !== 'playing')
    return {
      ...player,
      nextActor: 'player',
      actions: [...battle.actions, playerMove].slice(-2),
    }
  const response = advance(
    { ...player, tick: battle.tick },
    {},
    roll,
    rollDuality,
    rollFearSpend,
    rollAccuracy,
    rollCritical,
    rollEffect,
    {
      ...options,
      actor: 'enemy',
      enemySpendableFear: Duality.value(battle.enemy),
    }
  )
  return {
    ...response,
    actions: [playerMove, move(response.history.slice(player.history.length))],
    nextActor: 'player',
    playerBasicDamage: player.playerBasicDamage,
    special1Damage: player.special1Damage,
    special2Damage: player.special2Damage,
    special3Damage: player.special3Damage,
    hopeSpent: player.hopeSpent,
    hopeGained: player.hopeGained,
    fearGained: player.fearGained + response.fearGained,
    stressRestored: player.stressRestored,
    stressRemoved: player.stressRemoved,
    rolls: player.rolls,
  }
}
module.exports = {
  newBattle,
  comboDice,
  dualityDice,
  advance,
  beginFinisher,
  takeTurn,
}
