const sharp = require('sharp')
const { createHash } = require('node:crypto')
const { iconSvg, statusIcons } = require('./status-icons')
const { hasStress, usesRage } = require('./resources')
const items = [
  ['brink', 'Brink available', 'Survive one lethal hit'],
  ['exposed', 'Exposed', 'No Stress: +25% damage taken'],
  ['rage', 'Rage', 'No Stress exhaustion penalty'],
  ['slayer', 'Slayer active', 'Number: empowered hits remaining'],
  ['critical', 'Stored critical', 'Player’s next landed basic ×2'],
  ['opportunity', 'Opportunity ready', 'One landed basic gains +2%'],
  ['poison', 'Poison', 'Damage over time, when applied'],
]
const defaultBattle = {
  player: { passive: 'on-the-brink', kit: 'spooky-marq' },
  enemy: { passive: 'not-good-enough', kit: 'maxim', isAI: true },
}
function legendData(battle = defaultBattle) {
  const fighters = [battle.player, battle.enemy]
  const types = new Set(
    fighters.flatMap((fighter) => statusIcons(fighter).map((icon) => icon.type))
  )
  if (fighters.some((fighter) => fighter.passive === 'on-the-brink'))
    types.add('brink')
  if (fighters.some(hasStress)) types.add('exposed')
  if (fighters.some(usesRage)) types.add('rage')
  if (fighters.some((fighter) => fighter.kit === 'maxim')) types.add('slayer')
  if (fighters.some((fighter) => fighter.passive === 'not-good-enough'))
    types.add('opportunity')
  if (fighters.some((fighter) => !fighter.isAI)) types.add('critical')
  const notes = [
    ...(fighters.some(hasStress) ? ['Purple bars: Stress'] : []),
    ...(fighters.some(usesRage) ? ['Red bars: Rage'] : []),
    ...(fighters.some((fighter) => fighter.passive === 'on-the-brink')
      ? ['Grey HP: Brink already used']
      : []),
  ]
  if (require('./outcomes').enabled()) {
    notes.push('Block: 25% damage; no on-hit effects')
    notes.push('Basic critical: +1 Hope/Fear; recover 1 Stress')
    notes.push('Remove 1 opponent Stress; never stored')
  }
  return {
    items: items
      .filter(([type]) => types.has(type))
      .map((item) =>
        item[0] === 'critical' && require('./outcomes').enabled()
          ? ['critical', 'Basic critical', 'Current basic ×2; never stored']
          : item
      ),
    notes,
  }
}
function legendNameFor(battle) {
  return `arena-symbol-key-${createHash('sha256')
    .update(JSON.stringify(legendData(battle)))
    .digest('hex')
    .slice(0, 16)}.png`
}
function legendSvg(battle) {
  const data = legendData(battle)
  const rows = data.items
    .map(([type, name, detail], i) => {
      const y = i * 32 + 8
      return (
        iconSvg(type, 10, y, 23) +
        `<text x="42" y="${
          y + 17
        }" fill="#ffffff" font-size="13" font-weight="700">${name}<tspan font-weight="400" fill="#d5d5df"> · ${detail}</tspan></text>`
      )
    })
    .join('')
  const height = data.items.length * 32 + 34
  const notes = data.notes
    .map(
      (note, index) =>
        `<text x="10" y="${
          height - 11 + index * 17
        }" fill="#d5d5df" font-size="12">${note}</text>`
    )
    .join('')
  const totalHeight = height + Math.max(0, data.notes.length - 1) * 17
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${totalHeight}" font-family="Segoe UI,sans-serif"><rect width="400" height="${totalHeight}" rx="12" fill="#21212d"/>${rows}${notes}</svg>`
}
// Cache by visible key content, never by session or mutable resources.
const cached = new Map()
async function legendFile(battle) {
  const name = legendNameFor(battle)
  if (!cached.has(name))
    cached.set(
      name,
      sharp(Buffer.from(legendSvg(battle)), { density: 144 })
        .png()
        .toBuffer()
        .catch((error) => {
          cached.delete(name)
          throw error
        })
    )
  return { name, attachment: await cached.get(name) }
}
module.exports = {
  legendName: legendNameFor(),
  legendNameFor,
  legendData,
  legendSvg,
  legendFile,
}
