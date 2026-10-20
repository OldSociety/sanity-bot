// Describe recorded outcomes only; never roll or recalculate damage for UI.
function damageLabels(event) {
  const tags = []
  const sequence = event.strikes?.length > 0
  if (sequence)
    tags.push(event.strikes.map(s => s.outcome === 'critical' ? 'crit' : s.outcome).join(', '))
  else if (event.outcome === 'block')
    tags.push('blocked')
  if (event.bleeding || event.strikes?.some(s => s.bleed > 0) ||
      (event.damageType === 'bleed_damage' && event.damage > 0))
    tags.push('bleed')
  if (event.stressedTargetMultiplier > 1) tags.push('exposed')
  if (!sequence && event.outcome === 'critical')
    tags.push('critical')
  if (event.resisted) tags.push('resisted')
  return tags.map(tag => ` (${tag})`).join('')
}
function comboRolls(event) {
  if (event.type !== 'combo' || !event.rolls?.length) return ''
  const dice = event.rolls.slice(0, 40).map(value => `🔺${value}`).join(' + ')
  const extra = event.rolls.length > 40 ? ` + … (${event.rolls.length - 40} more)` : ''
  return ` (${dice}${extra})`
}
module.exports = { damageLabels, comboRolls }
