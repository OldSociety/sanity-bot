// Offline simulations use the same combat engine as Discord.
const { newBattle, advance } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const { canUse } = require('../services/arena/rules')
const { combatReport } = require('../services/arena/statistics')
const { decide } = require('../services/arena/tactics')
const decisionAudit = require('./arena-decision-audit')
const categories = ['basic', 'special1', 'special2', 'special3']
const numeric = ['brinkActivations', 'hpRestored', 'hpDamage', 'overkill', 'generated', 'spent', 'remaining', 'stressSpent', 'stressRecovered', 'stressRemaining', 'zeroStressRounds', 'vulnerabilityDamageTaken', 'slayerProgress', 'focusActivations', 'focusRechargeProgress', 'slayerActivations', 'slayerChargesConsumed', 'slayerChargesRemaining', 'stressRemoved', 'stressRemovedTaken', 'slayerChargesDiscardedOnRefresh']
function aggregate(reports, side) {
  const count = reports.length, result = {}
  for (const key of numeric) result[key] = reports.reduce((sum, row) => sum + row[side][key], 0) / count
  for (const group of ['damage', 'hpDamageBySource', 'attempts', 'hits', 'uses']) result[group] = Object.fromEntries(categories.map(key => [key, reports.reduce((sum, row) => sum + row[side][group][key], 0) / count]))
  const affordable = reports.map(row => row[side].firstFinisherAffordableRound).filter(value => value !== null)
  const casts = reports.flatMap(row => row[side].finisherRounds)
  result.finisherAffordableFightPercent = affordable.length * 100 / count
  result.firstFinisherAffordableRound = affordable.length ? affordable.reduce((sum, n) => sum + n, 0) / affordable.length : null
  result.finisherFightPercent = reports.filter(row => row[side].finisherRounds.length).length * 100 / count
  result.finisherUseRounds = casts.length ? casts.reduce((sum, n) => sum + n, 0) / casts.length : null
  result.zeroStressFightPercent = reports.filter(row => row[side].stressRemaining === 0).length * 100 / count
  result.totalDamage = Object.values(result.damage).reduce((sum, damage) => sum + damage, 0)
  result.totalSpecialDamage = categories.slice(1).reduce((sum, slot) => sum + result.damage[slot], 0)
  result.totalSpecialHpDamage = categories.slice(1).reduce((sum, slot) => sum + result.hpDamageBySource[slot], 0)
  const defeats = reports.filter(row => row[side].remainingHp === 0)
  result.knockoutCount = defeats.length
  result.slayerUnusedAtKnockout = defeats.length ? defeats.reduce((sum, row) => sum + row[side].slayerChargesRemaining, 0) / defeats.length : null
  result.resourceAtKnockout = defeats.length ? defeats.reduce((sum, row) => sum + row[side].remaining, 0) / defeats.length : null
  result.remainingHp = reports.reduce((sum, row) => sum + row[side].remainingHp, 0) / count
  const survivors = reports.filter(row => row.winner === (side === 'player' ? 'player' : 'enemy'))
  result.winnerRemainingHp = survivors.length ? survivors.reduce((sum, row) => sum + row[side].remainingHp, 0) / survivors.length : null
  result.knockoutsHoldingSpecial = defeats.filter(row => row[side].availableSpecialAtKnockout).length
  return result
}
function simulate({ trials = 10000, seed = 1792, finisherChoice = 3, strategy = 'spend-special2', aiPolicy = 'tactical' } = {}) {
  if (!['spend-special2', 'save-finisher', 'tactical'].includes(strategy)) throw Error('Invalid player strategy')
  if (!['legacy', 'tactical'].includes(aiPolicy)) throw Error('Invalid AI policy')
  if (!Number.isInteger(trials) || trials <= 0 || !Number.isInteger(finisherChoice) || finisherChoice < 0 || finisherChoice > 5) throw Error('Invalid simulation parameters')
  const initialSeed = seed
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const die = sides => () => 1 + Math.floor(random() * sides)
  const d4 = die(4), d12 = die(12), percentile = () => Math.floor(random() * 100), abilityPercentile = () => random() * 100
  const rows = []
  for (const level of [1]) for (const playerCharacter of ['Marq [Spooky]', 'Maxim [Spooky]']) for (const opponent of ['marq', 'maxim']) {
    const reports = []; let attempts = 0, misses = 0, criticals = 0
    const decisions = { player: decisionAudit.empty(), enemy: decisionAudit.empty() }, finisherSelections = {}
    for (let trial = 0; trial < trials; trial++) {
      let battle = newBattle(0, { level, character: resolveCharacter(playerCharacter), opponent })
      for (let safety = 0; battle.status === 'playing' && safety < 10000; safety++) {
        const special1 = canUse(battle.player, 'special1'), special2 = canUse(battle.player, 'special2'), special3 = canUse(battle.player, 'special3')
        const useSpecial2 = strategy === 'spend-special2' && special2 && (battle.player.kit !== 'maxim' || battle.player.slayerCharges === 0)
        const playerDecision = strategy === 'tactical' ? decide(battle.player, battle.enemy, { choice: finisherChoice, context: {
          rounds: battle.tick, ownSpecialDamage: ['special1', 'special2', 'special3'].reduce((n, key) => n + battle.statistics.player.damage[key], 0),
          opponentSpecialDamage: ['special1', 'special2', 'special3'].reduce((n, key) => n + battle.statistics.enemy.damage[key], 0) } })
          : { slot: special3 ? 'special3' : useSpecial2 ? 'special2' : special1 ? 'special1' : null, reason: strategy }
        const action = playerDecision.slot === 'special3' ? { special3: true, choice: finisherChoice } : playerDecision.slot || 'continue'
        const next = advance(battle, action, d4, d12, abilityPercentile, percentile, percentile, abilityPercentile, { aiPolicy })
        if (next === battle) throw Error('Simulation selected an unavailable action')
        decisionAudit.record(decisions.player, battle.player, battle.enemy, battle.player.hope, playerDecision, finisherChoice)
        if (next.enemyDecision) decisionAudit.record(decisions.enemy, battle.enemy, battle.player, battle.enemy.fear + next.fearGained, next.enemyDecision)
        for (const side of ['player', 'enemy']) decisionAudit.knockout(decisions[side], battle, next, side)
        if (playerDecision.slot === 'special3') {
          const key = `${finisherChoice}:${next.history.find(event => event.tick === next.tick && event.kind === 'special' && event.resource === 'Hope')?.percent}%`
          finisherSelections[key] = (finisherSelections[key] || 0) + 1
        }
        battle = next
        attempts += Number(battle.enemyOutcome !== null); misses += Number(battle.enemyOutcome === 'miss'); criticals += Number(battle.enemyOutcome === 'critical')
      }
      if (battle.status === 'playing') throw Error('Simulation did not terminate')
      const report = combatReport(battle)
      for (const [side, fighter] of [['player', battle.player], ['enemy', battle.enemy]]) report[side].availableSpecialAtKnockout =
        fighter.hp === 0 && ['special2', 'special3'].some(slot => canUse({ ...fighter, hope: fighter.isAI ? fighter.fear : fighter.hope }, slot))
      reports.push(report)
    }
    const turns = reports.map(row => row.rounds).sort((a, b) => a - b)
    const victoryTurns = reports.filter(row => row.winner === 'player').map(row => row.rounds).sort((a, b) => a - b)
    rows.push({ ruleset: 'health-aware-v1', aiPolicy, decisions, finisherSelections, playerStats: { attack: reports[0].playerAttack, hp: reports[0].playerMaxHp }, enemyStats: { attack: reports[0].opponentAttack, hp: reports[0].opponentMaxHp }, seed: initialSeed, level, playerCharacter, opponent, strategy, policy: strategy === 'tactical' ? 'Shared health-aware tactical policy' : strategy === 'save-finisher' ? 'Save Hope for Special 3; Special 1 when ready; basic otherwise' : 'Special 3 → Special 2 (Slayer only when empty) → Special 1 → basic', trials, playerFinisherChoice: finisherChoice,
      meanVictoryRounds: victoryTurns.length ? victoryTurns.reduce((sum, n) => sum + n, 0) / victoryTurns.length : null,
      medianVictoryRounds: victoryTurns.length ? victoryTurns[Math.floor(victoryTurns.length / 2)] : null,
      meanTurns: Number((turns.reduce((sum, n) => sum + n, 0) / trials).toFixed(2)), median: turns[Math.floor(trials / 2)],
      p10: turns[Math.floor(trials * 0.1)], p90: turns[Math.floor(trials * 0.9)],
      within10to20Percent: turns.filter(n => n >= 10 && n <= 20).length * 100 / trials,
      winPercent: reports.filter(row => row.winner === 'player').length * 100 / trials,
      attempts, misses, criticals, player: aggregate(reports, 'player'), enemy: aggregate(reports, 'enemy') })
  }
  return rows
}
function markdown(rows) {
  const first = rows[0], trials = rows.reduce((sum, row) => sum + row.trials, 0)
  const selection = first.playerFinisherChoice === 0 ? '100% timeout' : '100% valid button ' + first.playerFinisherChoice + ', no timeouts'
  return '# Marq and Maxim balance evaluation\n\nSeed ' + first.seed + '; actual combat engine; character stats: Marq 200 Attack / 260 HP, Maxim 220 Attack / 220 HP at level 1; level-1 testing only. Updated AI abilities and fixed 45% AI Finisher. ' + first.trials.toLocaleString('en-US') + ' fights per matchup/level (' + trials.toLocaleString('en-US') + ' total). Player policy: ' + first.policy + '. AI policy: ' + (first.aiPolicy || 'legacy') + '. Finisher selection: ' + selection + '. No reaction latency or waiting screens simulated; no automatic tuning.\n\n' +
    '| Level | Player | AI | Mean rounds | Median | 10th–90th | Player wins | AI basic / S1 / S2 / S3 damage |\n|---|---|---|---:|---:|---|---:|---|\n' + rows.map(row =>
      '| ' + [row.level, row.playerCharacter, row.opponent, row.meanTurns, row.median, row.p10 + '–' + row.p90, row.winPercent.toFixed(1) + '%', Object.values(row.enemy.damage).map(n => n.toFixed(1)).join(' / ')].join(' | ') + ' |').join('\n') +
    '\n\nFull metrics include activation frequencies, opportunities/hits, actual HP damage by source, Stress removal, Focus recharge, unused/discarded Slayer charges, resources, exhaustion, and Finisher timing. Landed damage includes overkill; HP damage excludes it. Tactical AI evaluates knockout and survival overrides before the original S3 → S2 → S1 probability fallback. Legacy AI uses only that fallback.\n'
}
if (require.main === module) {
  const strategy = process.argv.includes('--save-finisher') ? 'save-finisher' : process.argv.includes('--legacy-player') ? 'spend-special2' : 'tactical'
  const aiPolicy = process.argv.includes('--legacy-ai') ? 'legacy' : 'tactical'
  const rows = simulate({ strategy, aiPolicy })
  const fs = require('node:fs'), path = require('node:path'), root = path.resolve(__dirname, '../artifacts')
  fs.mkdirSync(root, { recursive: true })
  const stem = strategy === 'save-finisher' ? 'arena-balance-save-finisher' : 'arena-balance-report'
  fs.writeFileSync(path.join(root, stem + '.json'), JSON.stringify(rows, null, 2))
  fs.writeFileSync(path.join(root, stem + '.md'), markdown(rows))
  console.table(rows.map(({ level, playerCharacter, opponent, meanTurns, p10, p90, winPercent }) => ({ level, playerCharacter, opponent, meanTurns, p10, p90, winPercent })))
}
module.exports = { simulate, aggregate, markdown }
