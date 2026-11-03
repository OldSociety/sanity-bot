const rewards = Object.freeze([
  Object.freeze({ level: 5, id: 'classic:requia', name: 'Requia',
    imageCollection: 'Classic', imageAsset: 'REQUIA_BADGE.png' }),
])

// Like shared community unlocks, entitlement follows saved progression. Reads
// include existing eligible players without writing ownership or changing XP.
function unlockedBadges(user = {}) {
  return rewards.filter(reward => Number.isSafeInteger(user.chat_level) && user.chat_level >= reward.level)
}
function nextUnlock(user = {}) {
  const level = Number.isSafeInteger(user.chat_level) && user.chat_level >= 1 ? user.chat_level : 1
  return rewards.find(reward => reward.level > level) || null
}
module.exports = { rewards, unlockedBadges, nextUnlock }
