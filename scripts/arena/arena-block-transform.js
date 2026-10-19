// Offline-only payload adapter. Never imported by the bot.
function replaceOnce(source, before, after) {
  const pattern = new RegExp(
    before
      .replace(/\s+/g, '')
      .split('')
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*'),
    'g'
  )
  if ([...source.matchAll(pattern)].length !== 1)
    throw Error(`Block experiment anchor missing or ambiguous: ${before}`)
  return source.replace(pattern, () => after)
}
function transformFor(scenario) {
  if (!['current', 'proposed'].includes(scenario))
    throw Error('Expected current/proposed Block model')
  return (file, source) => {
    if (scenario === 'current') return source
    const changes =
      file === 'services/arena/combat.js'
        ? [
            [
              'return modern && !landed ? outcomes.blockDamage(damage, basic_damage) : damage',
              'return modern && !landed ? Math.ceil(damage * 0.75) : damage',
            ],
            [
              'return landed ? damage : outcomes.blockDamage(damage)',
              'return landed ? damage : Math.ceil(damage * 0.5)',
            ],
            [
              'outcomes.blockDamage(playerSpecial.damage)',
              'Math.ceil(playerSpecial.damage * 0.5)',
            ],
            [
              'outcomes.blockDamage(enemyResult.damage)',
              'Math.ceil(enemyResult.damage * 0.5)',
            ],
          ]
        : file === 'services/arena/tactics.js'
        ? [
            [
              "outcomes.blockDamage(rawBasic, 'basic_damage')",
              'Math.ceil(rawBasic * 0.75)',
            ],
            ['outcomes.blockDamage(raw)', 'Math.ceil(raw * 0.5)'],
          ]
        : []
    for (const [before, after] of changes)
      source = replaceOnce(source, before, after)
    return source
  }
}
module.exports = { transformFor }
