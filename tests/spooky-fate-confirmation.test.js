const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { showConfirmation, hasSession } = require('../services/spooky/fate-confirmation')
const { config } = require('../services/spooky/config')
function fixture() {
  const collector = new EventEmitter(), edits = [], denials = []
  collector.stop = reason => collector.emit('end', [], reason)
  const interaction = { id: '123', guildId: 'guild', channelId: 'spooky', user: { id: 'alice' },
    editReply: async payload => edits.push(payload),
    fetchReply: async () => ({ createMessageComponentCollector: options => { assert.equal(options.time, 120000); return collector } }) }
  const button = (kind = 'confirm', overrides = {}) => ({ customId: `spooky-spend-fate:123:${kind}`, user: interaction.user,
    guildId: 'guild', channelId: 'spooky', deferUpdate: async () => {}, reply: async payload => denials.push(payload), ...overrides })
  const quote = { candy: 12, eyes: 2, payment: { bankBefore: 7, bank: 0, fateBefore: 12, fatePoints: 9 } }
  return { interaction, collector, edits, denials, button, quote }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
test('confirmation displays exact Bank/Fate projections and spends nothing on cancel or timeout', async () => {
  for (const kind of ['cancel', 'timeout']) {
    const f = fixture(); let purchases = 0
    const work = showConfirmation(f.interaction, { quote: f.quote, event: config, onConfirm: async () => { purchases++ } })
    await tick()
    const fields = f.edits[0].embeds[0].fields
    assert.deepEqual(fields.map(item => [item.name, item.value]), [['Fate','12 → 9'], ['Bank','7 → 0'], ['Total','19 → 9']])
    assert.doesNotMatch(JSON.stringify(f.edits[0]), /50%|35%|15%|rarityPercent/)
    assert.equal(purchases, 0)
    if (kind === 'timeout') f.collector.stop('time'); else f.collector.emit('collect', f.button(kind))
    await work
    assert.equal(purchases, 0)
    assert.deepEqual(f.edits.at(-1).components, [])
    assert.equal(hasSession(f.button().customId), false)
  }
})
test('other users/channels/guilds cannot confirm; simultaneous clicks acknowledge before one purchase', async () => {
  const f = fixture(), order = []; let purchases = 0
  const work = showConfirmation(f.interaction, { quote: f.quote, event: config, onConfirm: async () => { order.push('buy'); purchases++ } })
  await tick()
  for (const overrides of [{ user: { id: 'bob' } }, { guildId: 'other' }, { channelId: 'other' }]) f.collector.emit('collect', f.button('confirm', overrides))
  await tick(); assert.equal(purchases, 0); assert.equal(f.denials.length, 3)
  f.collector.emit('collect', f.button('confirm', { deferUpdate: async () => { order.push('ack') } }))
  f.collector.emit('collect', f.button())
  await work
  assert.equal(purchases, 1); assert.deepEqual(order, ['ack','buy']); assert.equal(f.denials.length, 4)
})
test('failed acknowledgement cannot spend; failed purchase clears collector and buttons', async () => {
  for (const ackFailure of [true, false]) {
    const f = fixture(); let purchases = 0
    const work = showConfirmation(f.interaction, { quote: f.quote, event: config, onConfirm: async () => { purchases++; throw Error('wallet changed') } })
    const rejected = assert.rejects(work, ackFailure ? /ack failed/ : /wallet changed/)
    await tick()
    f.collector.emit('collect', f.button('confirm', ackFailure ? { deferUpdate: async () => { throw Error('ack failed') } } : {}))
    await rejected; assert.equal(purchases, ackFailure ? 0 : 1); assert.equal(hasSession(f.button().customId), false)
  }
})
