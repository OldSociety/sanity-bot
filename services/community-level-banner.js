const fs = require('node:fs/promises')
const path = require('node:path')

const allowed = new Set(require('../config/badges.json').badges.map(badge => badge.imageAsset))
async function renderCommunityLevelBanner({ level, progress, spotlight }) {
  if (!Number.isSafeInteger(level) || level < 2 || !progress || progress.level !== level ||
    !Number.isSafeInteger(progress.xp) || progress.xp < 0 ||
    !(progress.required === null || Number.isSafeInteger(progress.required) && progress.required > 0) ||
    !spotlight || !allowed.has(spotlight.imageAsset)) throw new Error('Invalid community level banner data')
  const root = spotlight.imageCollection === 'base' ? '../assets/badges' : '../assets/badges/Spooky'
  const portrait = await fs.readFile(path.resolve(__dirname, root, spotlight.imageAsset))
  const render = require('./profile-card').renderProfileCard
  return render({ displayName: 'Community', avatar: portrait, badges: [], sanity: null, occasion: 'level-up',
    community: { progress, spotlight, levelUpLabel: level === 2 ? 'CHAPTER TWO UNLOCKED!' : `COMMUNITY LEVEL ${level}` } })
}
module.exports = { renderCommunityLevelBanner }
