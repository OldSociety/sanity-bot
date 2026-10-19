const extraPercent = (multiplier) => Math.round((multiplier - 1) * 100)
function stressLine(event) {
  if (event.kind === 'stressRelief')
    return `${event.actor} is **no longer Stressed** (${event.stress} Stress). Extra damage taken ended.`
  const sources = event.sources.map((source) =>
    source.type === 'cost'
      ? `${source.actor} spent ${source.amount} Stress on **${source.name.toUpperCase()}**`
      : source.type === 'critical'
      ? `${source.actor}'s critical basic removed ${source.amount} Stress`
      : `${source.actor}'s **${source.name.toUpperCase()}** removed ${source.amount} Stress`
  )
  return `${event.actor} became **Stressed** (0 Stress): ${sources.join('; ')}. **+${extraPercent(event.multiplier)}% damage taken**, including this round, until Stress is restored.`
}
const damageNote = (event) =>
  ` Includes **+${extraPercent(event.stressedTargetMultiplier)}% damage** against a Stressed target.`
module.exports = { stressLine, damageNote }
