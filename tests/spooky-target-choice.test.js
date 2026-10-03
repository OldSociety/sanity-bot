const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { chooseTarget, hasSession } = require('../services/spooky/target-choice')
function fixture() {
  const collector = new EventEmitter(), edits = [], denied = []
  collector.stop = () => collector.emit('end')
  const interaction = { id: 'choice', guildId: 'guild', channelId: 'spooky', user: { id: 'alice' },
    editReply: async payload => edits.push(payload), fetchReply: async () => ({ createMessageComponentCollector: options => {
      assert.equal(options.time, 20000); return collector
    } }) }
  const button = (i, overrides = {}) => ({ customId: `spooky-target:choice:${i}`, guildId: 'guild', channelId: 'spooky',
    user: { id: 'alice' }, deferUpdate: async () => {}, reply: async payload => denied.push(payload), ...overrides })
  return { collector, interaction, edits, denied, button }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const candidates = ['bob','carol','dan'].map(userId => ({ userId, displayName: userId }))
test('three choices enforce ownership and acknowledge one selection before finishing', async () => {
  const f = fixture(), work = chooseTarget(f.interaction, candidates, { outcome: 'curse_target', random: () => 0 })
  await tick()
  assert.equal(f.edits[0].components[0].components.length, 3)
  assert.equal(hasSession(f.button(0).customId), true)
  for (const overrides of [{ user: { id: 'bob' } }, { guildId: 'wrong' }, { channelId: 'wrong' }]) f.collector.emit('collect', f.button(0, overrides))
  let acknowledged = false
  f.collector.emit('collect', f.button(1, { deferUpdate: async () => { acknowledged = true } }))
  f.collector.emit('collect', f.button(2))
  assert.equal(await work, 'carol'); assert.equal(acknowledged, true)
  assert.equal(f.denied.length, 4); assert.deepEqual(f.edits.at(-1).components, [])
  assert.equal(hasSession(f.button(0).customId), false)
})
test('timeout uses a frozen displayed fallback; acknowledgement failure cannot select', async () => {
  const f = fixture(); let rolls = 0
  const work = chooseTarget(f.interaction, candidates, { outcome: 'temporary_immunity', random: () => { rolls++; return 0.9 } })
  await tick(); f.collector.stop()
  assert.equal(await work, 'dan'); assert.equal(rolls, 1)
  const failed = fixture(), pending = chooseTarget(failed.interaction, candidates, { outcome: 'curse_target', random: () => 0 })
  const rejected = assert.rejects(pending, /ack failed/)
  await tick(); failed.collector.emit('collect', failed.button(0, { deferUpdate: async () => { throw Error('ack failed') } }))
  await rejected; assert.equal(hasSession(failed.button(0).customId), false)
  assert.equal(await chooseTarget(f.interaction, [], { outcome: 'curse_target' }), null)
})
