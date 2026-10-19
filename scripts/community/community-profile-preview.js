// Offline illustration: no live database, credentials, registry or bot startup.
const fs = require('node:fs/promises')
const path = require('node:path')
const { renderProfileCard } = require('../../services/profile-card')
const { progression } = require('../../services/plot-points')
async function main() {
  const root = path.resolve(__dirname, '../docs/previews')
  await fs.mkdir(root, { recursive: true })
  const spotlight = {
    name: 'Marq',
    emojiName: 'spooky_marq_badge',
    imageAsset: 'SPOOKY_MARQ_BADGE.png',
  }
  const avatar = await fs.readFile(
    path.resolve(__dirname, '../assets/badges/Spooky', spotlight.imageAsset),
  )
  const popular = require('../../config/badges/badges.json')
    .badges.filter((badge) => ['mrq', 'sel'].includes(badge.characterId))
    .sort((a, b) => a.characterId.localeCompare(b.characterId))
  for (const [name, total] of [
    ['community-level-one', 0],
    ['community-level-two', 15000],
  ]) {
    const badges = [
      ...(total >= 10000
        ? [require('../../config/leveling/plot-points.json').levelTwoBadge]
        : []),
      ...popular,
    ]
    const output = await renderProfileCard({
      displayName: 'Meridian Campaign Setting',
      avatar,
      badges,
      community: {
        spotlight,
        currentEvent: 'Spooky Season',
        currentEventEmoji: '🎃',
        progress: progression(total),
      },
    })
    await fs.writeFile(path.join(root, `${name}.png`), output)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
