// Offline diagnostics only. Each counterfactual gets a fresh process and a
// private config clone; no bot, database, registry, or gameplay config writes.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const scenarios = {
  'sm-baseline': { opponent: 'marq' },
  'maxim-baseline': { opponent: 'maxim' },
  'sm-no-brink': { opponent: 'marq', noBrink: true },
  'sm-brink-resolution-only': {
    opponent: 'marq',
    disableBrinkResolution: true,
  },
  'sm-220hp': { opponent: 'marq', hp: 220 },
  'sm-220hp-no-brink': { opponent: 'marq', hp: 220, noBrink: true },
  'sm-player-combo-coefficient': { opponent: 'marq', flat: 8 },
  'sm-no-recovery': { opponent: 'marq', recovery: 0 },
  'sm-spend-s2': { opponent: 'marq', spendS2: true },
  'maxim-spend-s2': { opponent: 'maxim', spendS2: true },
  'sm-cheap-lethal': { opponent: 'marq', brinkPolicy: 'narrow' },
  'sm-brink-aware': { opponent: 'marq', brinkPolicy: 'aware' },
  'maxim-cheap-lethal': { opponent: 'maxim', brinkPolicy: 'narrow' },
  'maxim-brink-aware': { opponent: 'maxim', brinkPolicy: 'aware' },
}

function run(name, trials = 10000) {
  const scenario = scenarios[name]
  if (!scenario) throw Error('Unknown audit scenario')
  const loader = require('../services/arena/balance-config')
  const clone = loader.loadBalance('development')
  if (scenario.flat !== undefined)
    clone.ai.characters['spooky-marq'].special2.flatPercent = scenario.flat
  if (scenario.recovery !== undefined)
    clone.ai.stressRecoveryChance = scenario.recovery
  loader.loadBalance = () => structuredClone(clone)
  if (scenario.disableBrinkResolution) {
    const passives = require('../services/arena/passives')
    const original = passives.survive
    // Preserve both policies' belief in Brink; bypass only its lethal rescue.
    passives.survive = (fighter) => (fighter.isAI ? 0 : original(fighter))
  }
  const { newBattle, takeTurn } = require('../services/arena/combat')
  const { resolveCharacter } = require('../services/arena/characters')
  const { canUse } = require('../services/arena/rules')
  const { choose } = require('./hellfed-rage-report')
  const { chooseBrinkAware } = require('./hellfed-brink-policy')
  const categories = ['basic', 'special1', 'special2', 'special3']
  const sides = Object.fromEntries(
    ['player', 'enemy'].map((side) => [
      side,
      {
        damage: Object.fromEntries(categories.map((k) => [k, 0])),
        hpDamage: Object.fromEntries(categories.map((k) => [k, 0])),
        uses: Object.fromEntries(categories.map((k) => [k, 0])),
        generated: 0,
        spent: 0,
        remaining: 0,
        stressRecovered: 0,
        vulnerabilityExtra: 0,
        finalHp: 0,
        basicAttempts: 0,
      },
    ])
  )
  const sums = {
    wins: 0,
    turns: 0,
    brink: 0,
    lossesAfterBrink: 0,
    hpAtBrink: 0,
    brinkOverkill: 0,
    brinkHpRestored: 0,
    brinkFromS3: 0,
    hpPaid: 0,
    enemyCriticals: 0,
    enemyRecovery: 0,
    fearWhenS2: 0,
    turnsUntilFirstS2: 0,
    firstS2Fights: 0,
    enemyDecisions: {},
    basicOnSpecialDamage: 0,
    enemySpecialResponses: 0,
    playerOverrides: {},
    finishersAvoided: 0,
  }
  for (let trial = 0; trial < trials; trial++) {
    let seed =
      (271828 +
        Math.imul(trial + 1, 2654435761) +
        (scenario.opponent === 'maxim' ? 1000003 : 0)) >>>
      0
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const die = (sides) => () => 1 + Math.floor(random() * sides)
    const pct = () => random() * 100,
      integer = () => Math.floor(pct())
    let b = newBattle(0, {
        character: resolveCharacter('Hellfed Marq'),
        opponent: scenario.opponent,
      }),
      firstS2 = false
    if (scenario.noBrink) b.enemy.passive = null
    if (scenario.hp) {
      b.enemy.hp = scenario.hp
      b.enemy.maxHp = scenario.hp
    }
    while (b.status === 'playing') {
      if (b.tick > 1000) throw Error('Nonterminating audit fight')
      const policyDecision = scenario.brinkPolicy
        ? chooseBrinkAware(b, scenario.brinkPolicy)
        : null
      const action = policyDecision
        ? policyDecision.action
        : scenario.spendS2
        ? canUse(b.player, 'special3')
          ? 'special3'
          : canUse(b.player, 'special2')
          ? 'special2'
          : canUse(b.player, 'special1')
          ? 'special1'
          : 'basic'
        : choose(b, 'B')
      if (policyDecision && action !== policyDecision.baseline) {
        sums.playerOverrides[policyDecision.reason] =
          (sums.playerOverrides[policyDecision.reason] || 0) + 1
        sums.finishersAvoided += Number(policyDecision.baseline === 'special3')
      }
      const next = takeTurn(
        b,
        action === 'special3' ? { special3: true, choice: 3 } : action,
        die(4),
        die(12),
        pct,
        integer,
        integer,
        pct,
        {
          aiPolicy: 'tactical',
          rollRecovery: pct,
          rollFinisher: () => 35 + Math.floor(random() * 11),
        }
      )
      if (next === b) throw Error('Unavailable audit action')
      const events = next.history.slice(b.history.length)
      sums.hpPaid += events
        .filter((e) => e.kind === 'sacrifice')
        .reduce((n, e) => n + e.hp, 0)
      if (!b.enemy.brinkUsed && next.enemy.brinkUsed) {
        sums.brink++
        sums.hpAtBrink += b.enemy.hp
        const damage =
          next.playerBasicDamage +
          next.special1Damage +
          next.special2Damage +
          next.special3Damage
        sums.brinkOverkill += Math.max(0, damage - b.enemy.hp)
        sums.brinkHpRestored += Math.ceil(next.enemy.maxHp * 0.1)
        sums.brinkFromS3 += Number(action === 'special3')
      }
      const responseDamage =
        next.statistics.enemy.damage.basic - b.statistics.enemy.damage.basic
      if (next.enemySpecial) {
        sums.enemySpecialResponses++
        sums.basicOnSpecialDamage += responseDamage
      }
      sums.enemyCriticals += Number(next.enemyOutcome === 'critical')
      sums.enemyRecovery += Number(next.enemyOutcome === 'recover')
      if (next.enemySpecial === 'special2') {
        sums.fearWhenS2 +=
          b.enemy.fear + next.fearGained - next.enemyCriticalFearGained
        if (!firstS2) {
          firstS2 = true
          sums.firstS2Fights++
          sums.turnsUntilFirstS2 += next.tick
        }
      }
      if (next.enemyDecision) {
        const reason = next.enemyDecision.reason
        sums.enemyDecisions[reason] = (sums.enemyDecisions[reason] || 0) + 1
      }
      if (next.status === 'defeat') {
        sums.lossesAfterBrink += Number(next.enemy.brinkUsed)
      }
      b = next
    }
    sums.wins += Number(b.status === 'victory')
    sums.turns += b.tick
    for (const side of ['player', 'enemy']) {
      const data = b.statistics[side],
        out = sides[side]
      for (const key of categories) {
        out.damage[key] += data.damage[key]
        out.hpDamage[key] += data.hpDamageBySource[key]
        out.uses[key] += data.uses[key]
      }
      out.generated += data.generated
      out.spent += data.spent
      out.remaining += data.remaining
      out.stressRecovered += data.stressRecovered
      out.vulnerabilityExtra += data.vulnerabilityDamageTaken
      out.finalHp += b[side].hp
      out.basicAttempts += data.attempts.basic
    }
  }
  const average = (value) =>
    typeof value === 'number'
      ? value / trials
      : Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, average(v)])
        )
  return {
    name,
    scenario,
    trials,
    seed: 271828,
    winPercent: (sums.wins * 100) / trials,
    averages: average(sums),
    sides: average(sides),
    totals: sums,
  }
}
if (require.main === module) {
  const name = process.argv[2]
  if (name)
    process.stdout.write(
      JSON.stringify(run(name, Number(process.argv[3] || 10000)))
    )
  else {
    const results = []
    fs.mkdirSync('artifacts/hellfed-sm-audit', { recursive: true })
    for (const name of Object.keys(scenarios)) {
      const result = JSON.parse(
        execFileSync(process.execPath, [__filename, name], {
          cwd: path.resolve(__dirname, '..'),
          env: { ...process.env, NODE_ENV: 'development' },
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        })
      )
      results.push(result)
      fs.writeFileSync(
        `artifacts/hellfed-sm-audit/${name}.json`,
        JSON.stringify(result, null, 2)
      )
      console.log(name, result.winPercent, result.averages.turns)
    }
    fs.writeFileSync(
      'artifacts/hellfed-sm-audit/results.json',
      JSON.stringify(results, null, 2)
    )
  }
}
module.exports = { run, scenarios }
