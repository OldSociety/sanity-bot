// Offline diagnostics only. The bot never imports this module.
const { transformFor } = require('./arena-block-transform')
function replace(source, before, after) {
  const pattern = new RegExp(
    before
      .replace(/\s+/g, '')
      .split('')
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*'),
    'g'
  )
  if ([...source.matchAll(pattern)].length !== 1)
    throw Error(`Role audit anchor missing/ambiguous: ${before}`)
  return source.replace(pattern, () => after)
}
function transformForRole(scenario) {
  if (!['baseline', 'enemy-first', 'matched-rolls', 'both'].includes(scenario))
    throw Error('Unknown role audit scenario')
  return (file, source) => {
    source = transformFor('proposed')(file, source)
    if (file === 'services/arena/combat.js') {
      // Template-only historical diagnostics omit the new strike event fields.
      source = source.replace(
        /\.\.\.\(sequences\.(?:player|enemy)\s*\?\s*\{[\s\S]*?\}\s*:\s*\{\}\),?\s*/g,
        ''
      )
      source = replace(
        source,
        '  const deliverBasic =',
        '  const auditBasics = {}\n  const deliverBasic ='
      )
      source = replace(
        source,
        '    return modern && !landed ? Math.ceil(damage * 0.75) : damage',
        `    if (options.buff !== false) auditBasics[fighter.isAI ? 'enemy' : 'player'] = {
      normalDamage: damage,
      criticalExtra: damage - basicDamage(fighter, target, { ...options, critical: false, landed }),
    }
    return modern && !landed ? Math.ceil(damage * 0.75) : damage`
      )
      source = replace(
        source,
        'damage: playerBasicDamage,\n                guaranteed:',
        'damage: playerBasicDamage,\n                ...auditBasics.player,\n                guaranteed:'
      )
      source = replace(
        source,
        'damage: enemyBasicDamage,\n      outcome:',
        'damage: enemyBasicDamage,\n      ...auditBasics.enemy,\n      outcome:'
      )
      source = replace(
        source,
        '  if (modern && outcomes.isAttack(definition, slot)) {',
        '  playerSpecial.normalDamage = playerSpecial.damage\n  if (modern && outcomes.isAttack(definition, slot)) {'
      )
      source = replace(
        source,
        '  if (!enemySpecialHit)\n',
        '  enemyResult.normalDamage = enemyResult.damage\n  if (!enemySpecialHit)\n'
      )
      if (['matched-rolls', 'both'].includes(scenario)) {
        const start = source.indexOf('    const outcome = enemyAttackOutcome('),
          end = source.indexOf("    return modern && outcome === 'miss'", start)
        if (start < 0 || end < 0) throw Error('Enemy outcome anchor missing')
        source =
          source.slice(0, start) +
          `    // Two independent uniform d12s: outcome only. Resource income remains native.
    const h = 1 + Math.floor(rollEffect() * 12 / 100)
    const f = 1 + Math.floor(rollEffect() * 12 / 100)
    const outcome = h === f ? 'critical'
      : h + f >= battle.player.difficulty || enemyDefinition?.guaranteedBasic ? 'hit' : 'miss'
` +
          source.slice(end)
        // Player fighters do not have difficulty; the existing opponent DC is 12.
        source = source.replace(
          'h + f >= battle.player.difficulty',
          'h + f >= battle.enemy.difficulty'
        )
      }
      if (['enemy-first', 'both'].includes(scenario)) {
        source = replace(
          source,
          "  const basic = action === 'basic'",
          `  // Reverse initiative only. Both actors choose from their current public state.
  const initial = battle
  const enemyStep = advance(battle, {}, roll, rollDuality, rollFearSpend,
    rollAccuracy, rollCritical, rollEffect, { ...options, actor: 'enemy' })
  if (enemyStep.status !== 'playing') return enemyStep
  battle = { ...enemyStep, tick: initial.tick }
  const decision = decide(battle.player, battle.enemy, { context: {
    rounds: battle.tick,
    ownSpecialDamage: ['special1','special2','special3'].reduce((n,k) => n + battle.statistics.player.damage[k], 0),
    opponentSpecialDamage: ['special1','special2','special3'].reduce((n,k) => n + battle.statistics.enemy.damage[k], 0),
  } })
  action = decision.slot === 'special3' ? { special3: true, choice: 3 } : decision.slot || 'basic'
  const basic = action === 'basic'`
        )
        source = replace(
          source,
          '  const playerMove = move(player.history.slice(battle.history.length))',
          "  const playerMove = move(player.history.slice(battle.history.length))\n  return { ...player, nextActor: 'player', actions: [move(enemyStep.history.slice(initial.history.length)), playerMove] }"
        )
      }
    }
    if (
      file === 'services/arena/tactics.js' &&
      ['matched-rolls', 'both'].includes(scenario)
    ) {
      source = replace(
        source,
        'function branches(fighter) {',
        `function branches(fighter) {
  if (fighter.isAI) return [
    [0, false, fighter.accuracy === 100 ? 0 : 1 - rates.success],
    [1, false, (fighter.accuracy === 100 ? 1 : rates.success) - 1/12],
    [1, true, 1/12],
  ]`
      )
      // Native tactical heuristics must use the experimental outcome probabilities.
      source = source.replaceAll('actor.accuracy / 100', 'rates.success')
      source = source.replace(
        '((rates.success) * actor.criticalChance) / 100',
        '1 / 12'
      )
    }
    return source
  }
}
module.exports = { transformForRole }
