const path = require('node:path')
const fs = require('node:fs/promises')

function badgeSkin(badge) {
  const collection = badge.imageCollection || badge.collectionId || badge.id?.split(':')[0] || ''
  if (/^spooky(?:-|$)/i.test(collection) || /^SPOOKY_/i.test(badge.imageAsset || '')) return 'Spooky'
  if (/^(classic|base)$/i.test(collection) || /^AZULIS_BADGE\.png$/i.test(badge.imageAsset || '')) return 'Classic'
  return null
}
function badgeAssetPath(badge) {
  const skin = badgeSkin(badge)
  if (!skin || !badge.imageAsset || path.basename(badge.imageAsset) !== badge.imageAsset) return null
  return path.join(__dirname, '..', 'assets', 'badges', skin, badge.imageAsset)
}
async function readBadgeImage(badge) {
  const file = badgeAssetPath(badge)
  return file ? fs.readFile(file).catch(() => null) : null
}
module.exports = { badgeSkin, badgeAssetPath, readBadgeImage }
