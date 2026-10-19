// Offline seeded extension of the existing parity harness. No DB or Discord.
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']
function run(
  policyName,
  opponent,
  reversed = false,
  trials = 10000,
  options = {}
) {
  if (
    !['A', 'B', 'C'].includes(policyName) ||
    !names.includes(opponent) ||
    !Number.isInteger(trials) ||
    trials < 1
  )
    throw Error(
      'Expected policy A/B/C, a configured opponent, and a positive integer trial count'
    )
  const { combat } = require('./arena-parity-engine').setup({
    attackOutcomes: options.attackOutcomes,
    sourceTransform: options.sourceTransform,
    policyDecorator:
      (base) =>
      (fighter, target, options = {}) => {
        const decision = base(fighter, target, options)
        if (
          fighter.kit !== 'classic-azulis' ||
          policyName === 'C' ||
          decision.reason.startsWith('cheapest-reliable')
        )
          return decision
        const { canUse, kitFor } = require('../services/arena/rules')
        const actor = {
          ...fighter,
          hope:
            options.resource ?? (fighter.isAI ? fighter.fear : fighter.hope),
        }
        const fullHeal = Math.ceil(
          (actor.maxHp * kitFor(actor).special1.healPercent) / 100
        )
        const heal =
          canUse(actor, 'special1') &&
          actor.maxHp - actor.hp >= fullHeal &&
          (policyName === 'B' || actor.hp <= actor.maxHp * 0.35)
        return {
          slot: heal
            ? 'special1'
            : ['special3', 'special2'].find((slot) => canUse(actor, slot)) ||
              null,
          reason: `healing-policy-${policyName}`,
        }
      },
  })
  const { resolveCharacter } = require('../services/arena/characters')
  const { healthCost } = require('../services/arena/resources')
  const { kitFor } = require('../services/arena/rules')
  const player = options.player || (reversed ? opponent : 'Azulis'),
    enemy = options.enemy || (reversed ? 'Azulis' : opponent)
  if (!names.includes(player) || !names.includes(enemy))
    throw Error('Unknown simulation fighter')
  const totals = { wins: 0, rounds: 0, pacing: 0, ledgerChecks: 0 }
  const empty = () => ({
    s1: 0,
    s1Damage: 0,
    blocksBasic: 0,
    blocksSpecial: 0,
    criticalsBasic: 0,
    criticalsSpecial: 0,
    healed: 0,
    wasted: 0,
    stressAtKnockout: 0,
    knockouts: 0,
    zeroStressResponses: 0,
    responses: 0,
    s2: 0,
    s2Damage: 0,
    s3: 0,
    s3Damage: 0,
    basicDamage: 0,
    basicAttempts: 0,
    basicHits: 0,
    effectiveHp: 0,
    hopeGenerated: 0,
    hopeSpent: 0,
    hpDamageTaken: 0,
  })
  const sides = { player: empty(), enemy: empty() }
  for (let trial = 0; trial < trials; trial++) {
    let seed = (271828 + Math.imul(trial + 1, 2654435761)) >>> 0
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const die = (size) => () => 1 + Math.floor(random() * size),
      pct = () => random() * 100
    let b = combat.newBattle(0, {
      character: resolveCharacter(player),
      opponent: enemy,
    })
    const paid = { player: 0, enemy: 0 },
      healed = { player: 0, enemy: 0 }
    while (b.status === 'playing') {
      if (b.tick > 1000) throw Error('Nonterminating fight')
      // Enemy uses the same decorated policy through combat.decide.
      const { decide } = require('../services/arena/tactics')
      const sum = (side) =>
        ['special1', 'special2', 'special3'].reduce(
          (n, k) => n + b.statistics[side].damage[k],
          0
        )
      const decision = decide(b.player, b.enemy, {
        context: {
          rounds: b.tick,
          ownSpecialDamage: sum('player'),
          opponentSpecialDamage: sum('enemy'),
        },
      })
      const action =
        decision.slot === 'special3'
          ? { special3: true, choice: 3 }
          : decision.slot || 'basic'
      const next = combat.takeTurn(
        b,
        action,
        die(4),
        die(12),
        pct,
        () => Math.floor(pct()),
        () => Math.floor(pct()),
        pct,
        {
          rollRecovery: pct,
          rollFinisher: () => 35 + Math.floor(random() * 11),
        }
      )
      if (next === b) throw Error('Unavailable action')
      // Events identify real responses and resolved post-cost Stress exposure.
      const events = next.history.slice(b.history.length)
      for (const side of ['player', 'enemy']) {
        const actorName =
          side === 'player' && b.player.name === b.enemy.name
            ? `Your ${b.player.name}`
            : b[side].name
        const specials = events.filter(
          (e) => e.kind === 'special' && e.actor === actorName
        )
        for (const event of specials) {
          const def = kitFor(b[side])[event.slot]
          paid[side] += healthCost(b[side], def)
          if (def.type === 'heal') {
            healed[side] += event.healing
            sides[side].healed += event.healing
            sides[side].wasted +=
              Math.ceil((b[side].maxHp * def.healPercent) / 100) - event.healing
          }
        }
      }
      const response = events.some(
        (e) => e.kind === 'hit' && e.actor === b.enemy.name
      )
      if (response) {
        sides.player.responses++
        sides.player.zeroStressResponses += Number(
          next.player.maxStress > 0 && next.player.stress === 0
        )
      }
      const playerAttack =
        events.some(
          (e) =>
            e.kind === 'hit' &&
            e.actor ===
              (b.player.name === b.enemy.name
                ? `Your ${b.player.name}`
                : b.player.name)
        ) ||
        events.some(
          (e) =>
            e.kind === 'special' &&
            e.resource !== 'Fear' &&
            e.actor ===
              (b.player.name === b.enemy.name
                ? `Your ${b.player.name}`
                : b.player.name)
        )
      if (playerAttack) {
        sides.enemy.responses++
        sides.enemy.zeroStressResponses += Number(
          next.enemy.maxStress > 0 &&
            Math.max(0, b.enemy.stress - next.stressRemoved) === 0
        )
      }
      b = next
    }
    totals.wins += Number(b.status === 'victory')
    totals.rounds += b.tick
    totals.pacing += Number(b.tick >= 10 && b.tick <= 20)
    for (const [side, other] of [
      ['player', 'enemy'],
      ['enemy', 'player'],
    ]) {
      const s = b.statistics[side],
        r = sides[side]
      if (
        b[side].maxHp -
          b.statistics[other].hpDamage -
          paid[side] +
          s.hpRestored !==
        b[side].hp
      )
        throw Error(`HP ledger ${side}`)
      if (s.initial + s.generated - s.spent !== s.remaining)
        throw Error('Resource ledger')
      totals.ledgerChecks++
      r.s1 += s.uses.special1
      r.s1Damage += s.damage.special1
      r.blocksBasic += s.blocks?.basic || 0
      r.blocksSpecial += ['special1', 'special2', 'special3'].reduce(
        (n, k) => n + (s.blocks?.[k] || 0),
        0
      )
      r.criticalsBasic += s.criticals?.basic || 0
      r.criticalsSpecial += ['special1', 'special2', 'special3'].reduce(
        (n, k) => n + (s.criticals?.[k] || 0),
        0
      )
      r.s2 += s.uses.special2
      r.s3 += s.uses.special3
      r.s2Damage += s.damage.special2
      r.s3Damage += s.damage.special3
      r.basicDamage += s.damage.basic
      r.basicAttempts += s.attempts.basic
      r.basicHits += s.hits.basic
      r.effectiveHp += b[side].maxHp + s.hpRestored - paid[side]
      r.hopeGenerated += s.generated
      r.hopeSpent += s.spent
      r.hpDamageTaken += b.statistics[other].hpDamage
      if (b[side].hp === 0) {
        r.knockouts++
        r.stressAtKnockout += b[side].stress
      }
    }
  }
  const average = Object.fromEntries(
    Object.entries(sides).map(([side, r]) => [
      side,
      {
        ...Object.fromEntries(
          Object.entries(r).map(([k, v]) => [k, v / trials])
        ),
        stressAtKnockout: r.knockouts ? r.stressAtKnockout / r.knockouts : null,
        zeroStressResponsePercent: r.responses
          ? (100 * r.zeroStressResponses) / r.responses
          : 0,
        basicDamagePerAttempt: r.basicAttempts
          ? r.basicDamage / r.basicAttempts
          : 0,
        basicDamagePerHit: r.basicHits ? r.basicDamage / r.basicHits : 0,
      },
    ])
  )
  for (const side of ['player', 'enemy'])
    if ((side === 'player' ? player : enemy) === 'Hellfed Marq') {
      average[side].stressAtKnockout = null
    }
  return {
    policy: policyName,
    player,
    enemy,
    trials,
    seed: 271828,
    winPercent: (100 * totals.wins) / trials,
    averageRounds: totals.rounds / trials,
    pacingPercent: (100 * totals.pacing) / trials,
    totals,
    perFight: average,
  }
}
if (require.main === module) {
  if (process.argv[2])
    process.stdout.write(
      JSON.stringify(
        run(
          process.argv[2],
          process.argv[3],
          process.argv[4] === 'reverse',
          Number(process.argv[5] || 10000)
        )
      )
    )
  else {
    fs.mkdirSync('artifacts/azulis', { recursive: true })
    const results = fs.existsSync('artifacts/azulis/results.json')
      ? JSON.parse(fs.readFileSync('artifacts/azulis/results.json', 'utf8'))
      : []
    const jobs = []
    for (const policy of ['A', 'B', 'C'])
      for (const opponent of names)
        for (const reversed of [false, true]) {
          if (opponent === 'Azulis' && reversed) continue
          const player = reversed ? opponent : 'Azulis',
            enemy = reversed ? 'Azulis' : opponent
          if (
            !results.some(
              (r) =>
                r.policy === policy &&
                r.player === player &&
                r.enemy === enemy &&
                r.trials === 10000
            )
          )
            jobs.push({ policy, opponent, reversed })
        }
    const worker = async () => {
      while (jobs.length) {
        const { policy, opponent, reversed } = jobs.shift()
        const output = await new Promise((resolve, reject) =>
          execFile(
            process.execPath,
            [__filename, policy, opponent, reversed ? 'reverse' : 'forward'],
            {
              env: { ...process.env, NODE_ENV: 'development' },
              encoding: 'utf8',
              maxBuffer: 1024 * 1024,
            },
            (error, stdout) => (error ? reject(error) : resolve(stdout))
          )
        )
        const r = JSON.parse(output)
        results.push(r)
        fs.writeFileSync(
          'artifacts/azulis/results.json',
          JSON.stringify(results, null, 2)
        )
        console.log(
          policy,
          r.player,
          'vs',
          r.enemy,
          r.winPercent.toFixed(2),
          r.averageRounds.toFixed(2)
        )
      }
    }
    Promise.all(Array.from({ length: 4 }, worker)).catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  }
}
module.exports = { run }
