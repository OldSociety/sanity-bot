const test = require('node:test')
const assert = require('node:assert/strict')
const { config, pieces, validateEvent, createPieces, getEventState, requireApprovedRarity } = require('../services/spooky/config')
const manifest = require('../config/spooky-pieces.json')
const copy = value => JSON.parse(JSON.stringify(value))
test('development activation leaves production/test disabled and approved economy unchanged', () => {
  const { selectEvent } = require('../services/spooky/config')
  const data = require('../config/spooky-2026.json')
  for (const environment of ['production', 'test', undefined]) assert.equal(selectEvent(data, environment).enabled, false)
  assert.equal(selectEvent(data, 'development').enabled, true)
  assert.equal(data.enabled, false)
  assert.equal(selectEvent(data, 'development').version, data.version)
  assert.throws(() => selectEvent({ ...data, developmentEnabled: 'true' }, 'development'), /activation/)
})

test('invalid probability edits and duplicated outcomes fail validation', () => {
  const wrongTotal = copy(config); wrongTotal.treatOutcomes[0].percent++
  assert.throws(() => validateEvent(wrongTotal), /total 100/)
  const duplicate = copy(config); duplicate.trickOutcomes[1].id = duplicate.trickOutcomes[0].id
  assert.throws(() => validateEvent(duplicate), /duplicate ID/)
  const invalid = copy(config); invalid.trickOutcomes[0].percent = NaN
  assert.throws(() => validateEvent(invalid), /positive integer/)
})
test('manifest provides unique durable quarter IDs and each character has required rarity positions', () => {
  assert.equal(pieces.length, 28)
  assert.equal(new Set(pieces.map(p => p.id)).size, 28)
  for (const character of manifest.characters) {
    const group = pieces.filter(p => p.characterId === character.id)
    const expected = { had: ['common','common','common','rare'], hfm: ['common','rare','rare','legendary'],
      mrq: ['common','common','common','common'], max: ['common','rare','legendary','legendary'],
      nik: ['common','rare','rare','legendary'], qam: ['common','common','common','rare'], sel: ['common','common','common','common'] }
    assert.deepEqual(group.map(p => p.position), ['tl','tr','bl','br'])
    assert.deepEqual(group.map(p => p.rarity), expected[character.id])
    assert.ok(group.every(piece => piece.color === manifest.rarityColors[piece.rarity]))
  }
  const bad = copy(manifest); bad.characters[0].rarities[0] = 'legendary'
  assert.throws(() => createPieces(bad), /character rarity/)
  const repeated = copy(manifest); repeated.characters[1].id = repeated.characters[0].id
  assert.throws(() => createPieces(repeated), /Duplicate/)
})
test('Pacific event opening/closing includes all October 31 and no redemption window', () => {
  const open = Date.parse(config.startsAt), close = Date.parse(config.endsAt)
  assert.equal(getEventState(open - 1), 'UPCOMING')
  assert.equal(getEventState(open), 'ACTIVE')
  assert.equal(getEventState(close - 1), 'ACTIVE')
  assert.equal(getEventState(close), 'CLOSED')
  const local = date => new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
  assert.equal(local(open), '10/01, 00:00')
  assert.equal(local(close), '11/01, 00:00')
  assert.throws(() => getEventState(NaN), /timestamp/)
})

test('character rarity metadata rejects missing, unknown or unordered assignments and invalid colors', () => {
  const mutations = [m => { m.characters[0].rarities.pop() }, m => { m.characters[0].rarities[1] = 'mythic' },
    m => { m.characters[0].rarities = ['common','legendary','rare','common'] },
    m => { m.positions.reverse() }, m => { m.rarityColors.rare = 'purple' }]
  for (const mutate of mutations) { const altered = copy(manifest); mutate(altered); assert.throws(() => createPieces(altered)) }
  assert.deepEqual(Object.fromEntries(['common','rare','legendary'].map(rarity => [rarity, pieces.filter(piece => piece.rarity === rarity).length])), { common: 17, rare: 7, legendary: 4 })
})

test('character rarity metadata rejects missing, unknown or unordered assignments and invalid colors', () => {
  const mutations = [m => { m.characters[0].rarities.pop() }, m => { m.characters[0].rarities[1] = 'mythic' },
    m => { m.characters[0].rarities = ['common','legendary','rare','common'] },
    m => { m.positions.reverse() }, m => { m.rarityColors.rare = 'purple' }]
  for (const mutate of mutations) { const altered = copy(manifest); mutate(altered); assert.throws(() => createPieces(altered)) }
  assert.deepEqual(Object.fromEntries(['common','rare','legendary'].map(rarity => [rarity, pieces.filter(piece => piece.rarity === rarity).length])), { common: 17, rare: 7, legendary: 4 })
})
test('configuration cannot silently enable redemption, draw ceilings, or unbanked fate', () => {
  for (const mutate of [c => { c.redemptionEndsAt = '2026-11-02T07:00:00.000Z' }, c => { c.eyes.dailyDrawLimit = 4 }, c => { c.fate.paymentResource = 'fate_points' }]) {
    const altered = copy(config); mutate(altered); assert.throws(() => validateEvent(altered))
  }
})
test('simulation weights cannot be used for live acquisition and configuration is immutable', () => {
  const provisional = copy(config); provisional.ordinaryRarity.status = 'provisional-for-simulation'
  assert.throws(() => requireApprovedRarity(provisional), /provisional/)
  assert.doesNotThrow(() => requireApprovedRarity())
  assert.deepEqual(config.ordinaryRarity.percent, { common: 70, rare: 22, legendary: 8 })
  assert.equal(config.enabled, false)
  assert.equal(config.artworkIntegration, false)
  assert.ok(Object.isFrozen(config.treatOutcomes[0]))
  assert.ok(Object.isFrozen(pieces[0]))
})
