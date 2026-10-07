// Offline illustration: no live database, credentials, registry or bot startup.
const fs = require('node:fs/promises')
const path = require('node:path')
const { renderProfileCard } = require('../services/profile-card')
const { progression } = require('../services/plot-points')
async function main() {
  const root = path.resolve(__dirname, '../docs/previews')
  await fs.mkdir(root, { recursive: true })
  const spotlight = { name: 'Hadley', emojiName: 'spooky_hadley_badge', imageAsset: 'SPOOKY_HADLEY_BADGE.png' }
  const avatar = await fs.readFile(path.resolve(__dirname,'../assets/badges/Spooky',spotlight.imageAsset))
  for (const [name,total] of [['community-level-one',2500],['community-level-two',15000]]) {
    const badges = total >= 10000 ? [require('../config/plot-points.json').levelTwoBadge] : []
    const output = await renderProfileCard({displayName:'Community preview',avatar,badges,
      community:{spotlight,progress:progression(total),currencyImage:avatar}})
    await fs.writeFile(path.join(root,`${name}.png`),output)
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
