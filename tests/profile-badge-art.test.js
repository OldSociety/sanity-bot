const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), sharp = require('sharp')
const { badgeSkin, badgeAssetPath, readBadgeImage } = require('../services/profile-badge-art')
const { renderProfileCard } = require('../services/profile-card')
const marq = { ...require('../services/badges').badges.find(badge => badge.characterId === 'mrq') }

test('skin captions distinguish earned Spooky and Classic characters without labeling chapter placeholders', () => {
  assert.equal(badgeSkin(marq), 'Spooky')
  assert.equal(badgeSkin({ id: 'classic:azulis', name: 'Azulis', imageAsset: 'AZULIS_BADGE.png' }), 'Classic')
  assert.equal(badgeSkin({ name: 'Azulis', imageAsset: 'AZULIS_BADGE.png' }), 'Classic')
  assert.equal(badgeSkin(require('../config/leveling/plot-points.json').levelTwoBadge), null)
  assert.equal(badgeAssetPath({ imageCollection: 'Classic', imageAsset: '../config.json' }), null)
  assert.equal(badgeAssetPath({ imageCollection: '../config', imageAsset: 'database/config.json' }), null)
})

test('local Marq and Classic assets resolve to current files, including the moved Selene fallback', async () => {
  assert.deepEqual(await readBadgeImage(marq), await fs.readFile(path.resolve(__dirname, '../assets/badges/Spooky/SPOOKY_MARQ_BADGE.png')))
  const azulis = { id: 'classic:azulis', imageAsset: 'AZULIS_BADGE.png' }
  assert.deepEqual(await readBadgeImage(azulis), await fs.readFile(path.resolve(__dirname, '../assets/badges/Classic/AZULIS_BADGE.png')))
  const fallback = require('../config/leveling/plot-points.json').fallback
  assert.equal(badgeSkin(fallback), 'Classic')
  assert.ok((await readBadgeImage(fallback))?.length > 0)
})

test('personal, level-up and community cards prefer the replacement PNG over a stale Discord emoji', async () => {
  const stale = await sharp({ create: { width: 48, height: 48, channels: 4, background: '#ff00ff' } }).png().toBuffer()
  for (const context of [{}, { occasion: 'level-up' }, { community: { progress: require('../services/plot-points').progression(0) } }]) {
    const input = { displayName: 'Collector', username: 'collector', unlockPreview: false, ...context }
    const current = await renderProfileCard({ ...input, badges: [marq] })
    const withStaleEmoji = await renderProfileCard({ ...input, badges: [{ ...marq, image: stale }] })
    assert.deepEqual(withStaleEmoji, current)
  }
})

test('an earned Classic Azulis renders from its own collection while unowned characters stay absent', async () => {
  const shared = { displayName: 'Collector', unlockPreview: false }
  const blank = await renderProfileCard({ ...shared, badges: [] })
  const earned = await renderProfileCard({ ...shared, badges: [{ id: 'classic:azulis', name: 'Azulis', imageAsset: 'AZULIS_BADGE.png' }] })
  assert.notDeepEqual(earned, blank)
  assert.equal((await sharp(earned).metadata()).height, 480)
})
