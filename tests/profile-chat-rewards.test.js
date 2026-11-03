const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const fs = require('node:fs/promises')
const { rewards, unlockedBadges, nextUnlock } = require('../services/chat-level-rewards')
const { renderProfileCard } = require('../services/profile-card')

test('Requia unlocks at saved chat level five, including existing higher-level players', () => {
  for (const chat_level of [undefined, -1, 1, 4, 4.9, '5']) {
    assert.deepEqual(unlockedBadges({ chat_level }), [])
    assert.equal(nextUnlock({ chat_level }).level, 5)
  }
  for (const chat_level of [5, 6, 100]) {
    assert.deepEqual(unlockedBadges({ chat_level }), [rewards[0]])
    assert.equal(nextUnlock({ chat_level }), null)
  }
})

test('profile next-unlock art is Requia in production and is separate from earned badges', async () => {
  const old = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const card = await renderProfileCard({ displayName: 'Level Four', user: { chat_level: 4 } })
    const expected = await sharp(await fs.readFile(require('node:path').resolve(__dirname,
      '../assets/badges/Classic/REQUIA_BADGE.png'))).resize(64, 64, { fit: 'contain', background: '#00000000' }).png().toBuffer()
    // The next-unlock slot must contain the current Requia art, not the old Azulis preview.
    const without = await renderProfileCard({ displayName: 'Level Four', user: { chat_level: 4 }, unlockPreview: false })
    const expectedCard = await sharp(without).composite([{ input: expected, left: 1054, top: 218 }]).png().toBuffer()
    const crop = input => sharp(input).extract({ left: 1054, top: 218, width: 64, height: 40 }).raw().toBuffer()
    const actual = await crop(card), reference = await crop(expectedCard)
    // Separate compositing passes can round translucent edge pixels differently.
    const meanDifference = actual.reduce((sum, value, i) => sum + Math.abs(value - reference[i]), 0) / actual.length
    assert.ok(meanDifference < 1, `Requia preview pixel difference: ${meanDifference}`)
  } finally {
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  }
})

test('earned Requia appears once on profiles and level-up cards without changing saved progression', async () => {
  const user = { chat_level: 5, chat_exp: 0, fate_points: 10, bank: 3 }
  for (const occasion of ['profile', 'level-up', 'birthday']) {
    const input = { displayName: 'Level Five', user, occasion }
    const automatic = await renderProfileCard(input)
    const alreadyIncluded = await renderProfileCard({ ...input, badges: [rewards[0]] })
    assert.deepEqual(automatic, alreadyIncluded)
    const crop = buffer => sharp(buffer).extract({ left: 260, top: 350, width: 70, height: 100 }).raw().toBuffer()
    const below = await renderProfileCard({ ...input, user: { ...user, chat_level: 4 } })
    assert.notDeepEqual(await crop(automatic), await crop(below))
  }
  assert.deepEqual(user, { chat_level: 5, chat_exp: 0, fate_points: 10, bank: 3 })
})
