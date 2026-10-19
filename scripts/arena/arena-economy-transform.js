// Offline source adapters only. No bot module imports this file.
function replace(source, before, after) {
  const pattern = new RegExp(
    before
      .replace(/\s+/g, '')
      .split('')
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*')
  )
  if (!pattern.test(source))
    throw Error(`Economy adapter anchor missing: ${before}`)
  return source.replace(pattern, () => after)
}
function transformFor(experiment) {
  if (!['A', 'B', 'C'].includes(experiment))
    throw Error('Expected economy A/B/C')
  return (relative, source) => {
    source = source.replace(
      /\bbalance\.offensiveSpecialBasics\b/g,
      experiment === 'B' ? 'true' : 'false'
    )
    if (experiment === 'A') return source
    if (relative === 'services/arena/tactics.js') {
      if (experiment === 'B' && !/const rolls =\s*hasBasic/.test(source))
        source = replace(
          source,
          'const rolls = fighter.isAI ||',
          'const rolls = hasBasic || fighter.isAI ||'
        )
      return replace(
        source,
        'const hasBasic = fighter.isAI || !slot || definition?.rollBasic',
        experiment === 'B'
          ? 'const hasBasic = fighter.isAI || !slot || definition?.rollBasic || outcomes.isAttack(definition, slot)'
          : 'const hasBasic = (fighter.isAI && !outcomes.isAttack(definition, slot)) || !slot || definition?.rollBasic'
      )
    }
    if (relative !== 'services/arena/combat.js') return source
    if (experiment === 'B') {
      return replace(
        source,
        "(actor === 'ability' && definition?.rollBasic === true)",
        "(actor === 'ability' && (definition?.rollBasic === true || outcomes.isAttack(definition, slot)))"
      )
    }
    // Separate response outcome from the presence of a basic. The original
    // action selection and recovery still happen before deciding its payload.
    source = source
      .replace(/\benemyAttacks\b/g, 'enemyHasBasic')
      .replace(/\benemyHit\b/g, 'enemyBasicHit')
    source = replace(source, 'const enemyHasBasic =', 'const enemyAttacks =')
    source = replace(
      source,
      "battle.mode !== 'idle' && enemyHasBasic",
      "battle.mode !== 'idle' && enemyAttacks"
    )
    source = replace(
      source,
      'const enemyDefinition = enemySpecial ? enemyKit[enemySpecial] : null',
      'const enemyDefinition = enemySpecial ? enemyKit[enemySpecial] : null\nconst enemyHasBasic = enemyAttacks && !outcomes.isAttack(enemyDefinition, enemySpecial)'
    )
    source = replace(
      source,
      '(balance.criticalEffects || modern) && enemyHasBasic',
      '(balance.criticalEffects || modern) && enemyAttacks'
    )
    source = replace(
      source,
      "(enemyHasBasic ? drawEnemyOutcome() : enemyStressRestored ? 'recover' : null)",
      "(enemyAttacks ? drawEnemyOutcome() : enemyStressRestored ? 'recover' : null)"
    )
    source = replace(
      source,
      'const drawEnemyOutcome = () => {',
      "const drawEnemyOutcome = () => {\nif (!enemyHasBasic && enemySpecial === 'special3') return 'hit'"
    )
    source = replace(
      source,
      "return modern && outcome === 'miss' ? 'block' : outcome",
      "return !enemyHasBasic && outcome === 'critical' ? 'hit' : modern && outcome === 'miss' ? 'block' : outcome"
    )
    source = replace(
      source,
      "const enemyBasicHit = ['hit', 'critical'].includes(enemyOutcome)",
      "const enemyHit = ['hit', 'critical'].includes(enemyOutcome)\nconst enemyBasicHit = enemyHasBasic && enemyHit"
    )
    source = replace(
      source,
      'enemyBasicHit || enemyDefinition?.guaranteedHit || specialAlwaysHits(battle.enemy, enemySpecial)',
      'enemyHit || enemyDefinition?.guaranteedHit || specialAlwaysHits(battle.enemy, enemySpecial)'
    )
    return source
  }
}
module.exports = { transformFor }
