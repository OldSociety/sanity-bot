const colors = {
  alignment: '#f7d26a',
  windWall: '#67d6e7',
  stress: '#ad9cff',
  exposed: '#ffba58',
  rage: '#ed4747',
  slayer: '#67d6e7',
  brink: '#f7d26a',
  critical: '#f595b0',
  opportunity: '#79b9ff',
  poison: '#54d08c',
  bleeding: '#ed4747',
}
const paths = {
  alignment: '<path d="m12 1 3 7 8 4-8 3-3 8-4-8-7-3 7-4z"/>',
  windWall:
    '<path d="M2 7h14c7 0 7-6 2-5M2 12h18c4 0 4 6 0 6M2 17h10c5 0 5 6 1 5"/>',
  bleeding: '<path d="M12 2C10 8 5 11 5 16a7 7 0 0 0 14 0c0-5-5-8-7-14z"/>',
  stress: '<path d="M14 2 5 14h7l-2 8 10-13h-7z"/>',
  exposed:
    '<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6z"/><path d="M12 7v6m0 3v1"/>',
  rage: '<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6z"/><path d="M12 7v6m0 3v1"/>',
  slayer:
    '<path d="m4 3 5 2 12 14-2 2L5 9zM3 15l6 6m-5-1 3-3"/><path d="m20 3-5 2-4 5m-1 5-5 6m10-18 6 6"/>',
  brink:
    '<path d="M12 21 3 12C-2 5 7-1 12 6 17-1 26 5 21 12z"/><path d="M12 7v8m-4-4h8"/>',
  critical: '<path d="m12 1 3 7 8 4-8 3-3 8-4-8-7-3 7-4z"/>',
  opportunity:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 0v5m0 14v5M0 12h5m14 0h5"/>',
  poison:
    '<path d="M12 1C10 8 3 10 4 16c1 9 16 9 16 0 0-5-5-9-8-15z"/><path d="M8 15c-1 3 1 5 3 5"/>',
}
const { exhausted, usesRage } = require('./resources')
const seleneBuild = require('./build-profile').buildFor('selene')
function statusIcons(fighter) {
  const icons = []
  if (fighter.passive === 'celestial-alignment')
    icons.push({
      type: 'alignment',
      label: 'Celestial Alignment',
      value:
        String(
          Math.min(
            seleneBuild.passive.maxStacks,
            fighter.alignmentStacks || 0
          ) * seleneBuild.passive.stackPercent
        ) + '%',
    })
  if (fighter.windWall)
    icons.push({
      type: 'windWall',
      label: 'Wind Wall · Slow',
      value: String(
        Math.min(
          seleneBuild.abilities.special2.duration +
            Number(seleneBuild.abilities.special2.protectActivationRound),
          fighter.windWall.endRound - (fighter.combatRound || 1) + 1
        )
      ),
    })
  if (fighter.bleeding) icons.push({ type: 'bleeding', label: 'Bleeding' })
  // Available single-use abilities always precede temporary status effects.
  if (fighter.passive === 'on-the-brink' && !fighter.brinkUsed)
    icons.push({
      type: 'brink',
      label: 'On the Brink available',
      singleUse: true,
    })
  if (exhausted(fighter))
    icons.push({ type: 'exposed', label: 'Exposed', value: '1' })
  // A permanent visual marker, independent of exhaustion and damage rules.
  if (usesRage(fighter)) icons.push({ type: 'rage', label: 'Rage' })
  if (fighter.slayerCharges > 0)
    icons.push({
      type: 'slayer',
      label: 'Slayer',
      value: String(fighter.slayerCharges),
    })
  if (
    !require('./outcomes').enabled() &&
    !fighter.isAI &&
    fighter.criticalReady
  )
    icons.push({
      type: 'critical',
      label: 'Stored critical: next landed basic ×2',
      value: '×2',
    })
  if (fighter.opportunityReady)
    icons.push({ type: 'opportunity', label: 'Opportunity', value: '+2' })
  // Display adapter only: no current Arena ability applies Poison.
  if (Number.isInteger(fighter.poisonTurns) && fighter.poisonTurns > 0)
    icons.push({
      type: 'poison',
      label: 'Poison',
      value: String(fighter.poisonTurns),
    })
  return icons
}
const iconSvg = (type, x, y, size = 26) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`
module.exports = { statusIcons, iconSvg, colors }
