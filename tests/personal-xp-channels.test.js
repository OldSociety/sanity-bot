const test = require('node:test'), assert = require('node:assert/strict')
const { qualifiesPersonalXp } = require('../services/personal-xp-channels')
const config = require('../config/personal-leveling.json')
const production = { environment: 'production' }
const message = (id, type = 0, parentId = null, guildId = config.environments.production.guildId) => ({ guild: { id: guildId }, channelId: id, channel: { type, parentId } })
test('production personal XP is limited to the three verified channels and their public threads', () => {
  assert.deepEqual(config.environments.production.channelIds, ['1259991510410334221', '1282776842385752181', '1262878387551342602'])
  for (const id of config.environments.production.channelIds) {
    assert.equal(qualifiesPersonalXp(message(id), production), true)
    assert.equal(qualifiesPersonalXp(message('thread', 11, id), production), true)
    assert.equal(qualifiesPersonalXp(message('thread', 12, id), production), false)
    assert.equal(qualifiesPersonalXp(message('voice', 2, id), production), false)
    assert.equal(qualifiesPersonalXp(message(id, 0, null, 'other-guild'), production), false)
  }
  assert.equal(qualifiesPersonalXp(message('party'), production), false)
  assert.equal(qualifiesPersonalXp(message('party-thread', 11, 'party'), production), false)
  assert.equal(qualifiesPersonalXp(message('1259991510410334220'), production), false) // Category is not an earning channel.
})
test('development uses its own verified counterparts; unknown environments fail closed', () => {
  const dev = config.environments.development
  for (const id of dev.channelIds) assert.equal(qualifiesPersonalXp(message(id, 0, null, dev.guildId), { environment: 'development' }), true)
  assert.equal(qualifiesPersonalXp(message(dev.channelIds[0]), production), false)
  assert.equal(qualifiesPersonalXp(message(config.environments.production.channelIds[0]), { environment: 'test' }), false)
})
