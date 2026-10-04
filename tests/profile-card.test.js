const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { progression, recentBadges, renderProfileCard, discordImage } = require('../services/profile-card')
test('progress uses live per-level XP threshold and bounds the bar', () => {
  assert.deepEqual(progression(), { level: 1, xp: 0, required: 155, fraction: 0 })
  assert.deepEqual(progression({ chat_level: 2, chat_exp: 110 }), { level: 2, xp: 110, required: 220, fraction: .5 })
  assert.equal(progression({ chat_level: 12, chat_exp: 99999 }).fraction, 1)
})
test('badge strip is newest first with deterministic ties and no unknown ownership', () => {
  const rows = [{ badgeId: 'old', awardedAt: '2026-01-01' }, { badgeId: 'z', awardedAt: '2026-02-01' },
    { badgeId: 'a', awardedAt: '2026-02-01' }, { badgeId: 'unknown', awardedAt: '2026-03-01' }]
  assert.deepEqual(recentBadges(rows, ['old', 'z', 'a'].map(id => ({ id, name: id }))).map(b => b.id), ['a', 'z', 'old'])
  assert.equal(rows[0].badgeId, 'old')
})
test('large badge catalog displays only ten newest owned badges', () => {
  const catalog = Array.from({ length: 125 }, (_, i) => ({ id: String(i), name: `Badge ${i}` }))
  const rows = catalog.map((badge, i) => ({ badgeId: badge.id, awardedAt: new Date(i * 1000) }))
  const recent = recentBadges(rows, catalog)
  assert.equal(recent.length, 10); assert.equal(recent[0].id, '124'); assert.equal(recent[9].id, '115')
})
test('renderer produces PNG for Unicode/XML names, empty badges and overflow XP', async () => {
  for (const input of [{ displayName: '< & " 🧙🏽‍♀️ '.repeat(12), username: 'long'.repeat(30) },
    { displayName: 'New player', badgesUnavailable: true },
    { displayName: 'Collector', user: { chat_level: 2, chat_exp: 500 }, badges: [{ name: 'Selene', imageAsset: 'SPOOKY_SELENE_BADGE.png' }] }]) {
    const output = await renderProfileCard(input), meta = await sharp(output).metadata()
    assert.equal(meta.format, 'png'); assert.equal(meta.width, 1200); assert.equal(meta.height, 480)
    assert.ok(output.length < 8 * 1024 * 1024)
  }
})
test('image fetch restricts hosts, size and redirects', async () => {
  assert.equal(await discordImage('https://example.com/avatar.png', () => { throw Error('must not fetch') }), null)
  assert.equal(await discordImage('https://cdn.discordapp.com/emojis/123.png', async (url, options) => {
    assert.equal(options.redirect, 'error')
    return { ok: true, headers: new Headers({ 'content-length': String(5 * 1024 * 1024) }) }
  }), null)
  assert.deepEqual(await discordImage('https://cdn.discordapp.com/avatars/123/a.png', async () => ({ ok: true,
    headers: new Headers(), body: (async function* () { yield Buffer.from('image') })() })), Buffer.from('image'))
})
