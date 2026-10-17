const { readBadgeImage } = require('./profile-badge-art')

const allowed = new Set([...require('../config/badges.json').badges.map(badge => badge.imageAsset), require('../config/plot-points.json').fallback.imageAsset])
async function renderCommunityLevelBanner({ level, progress, spotlight, displayName = 'Our Server', currentEvent = null, currentEventEmoji = null }) {
  if (!Number.isSafeInteger(level) || level < 2 || !progress || progress.level !== level ||
    !Number.isSafeInteger(progress.xp) || progress.xp < 0 ||
    !(progress.required === null || Number.isSafeInteger(progress.required) && progress.required > 0) ||
    !spotlight || !allowed.has(spotlight.imageAsset)) throw new Error('Invalid community level banner data')
  const portrait = await readBadgeImage(spotlight)
  if (!portrait) throw new Error('Community spotlight artwork unavailable')
  const render = require('./profile-card').renderProfileCard
  return render({ displayName, avatar: portrait, badges: [require('../config/plot-points.json').levelTwoBadge], sanity: null, occasion: 'level-up',
    community: { progress, spotlight, currentEvent, currentEventEmoji, levelUpLabel: level === 2 ? 'CHAPTER TWO UNLOCKED!' : `COMMUNITY LEVEL ${level}` } })
}
module.exports = { renderCommunityLevelBanner }
