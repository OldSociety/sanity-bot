const test = require('node:test')
const assert = require('node:assert/strict')
const { config } = require('../services/spooky/config')
const { transformMessage, planCursedMessage, deliverCursedMessage } = require('../services/spooky/cursed-messages')
const base = { content: 'hello world', username: 'Alice', cursed: true,
  event: { ...config, enabled: true }, now: new Date(config.startsAt) }

test('reversal preserves emoji/combining graphemes and shuffle preserves words', () => {
  assert.equal(transformMessage('A👨‍👩‍👧‍👦e\u0301B', 'reverse'), 'Be\u0301👨‍👩‍👧‍👦A')
  assert.deepEqual(transformMessage('one two three', 'shuffle', () => 0).split(' ').sort(), ['one','three','two'])
})
test('curse message probability and transformation boundaries are deterministic', () => {
  const plan = values => planCursedMessage({ ...base, random: () => values.shift() })
  assert.equal(plan([.19999, .49999]).mode, 'reverse')
  assert.equal(plan([0, .5, 0]).mode, 'shuffle')
  assert.equal(plan([.2]), null)
  assert.throws(() => plan([-1]), /Random value/)
})
test('unsafe/context-rich, empty, disabled and closed messages stay intact', () => {
  for (const overrides of [{ hasAttachments: true }, { isReply: true }, { bot: true }, { cursed: false },
    { content: ' ' }, { content: 'x'.repeat(4097) }, { event: config }, { now: new Date(config.endsAt) }]) {
    assert.equal(planCursedMessage({ ...base, ...overrides, random: () => 0 }), null)
  }
  const plan = planCursedMessage({ ...base, content: '@everyone <@123>', random: () => 0 })
  assert.deepEqual(plan.payload.allowedMentions.parse, [])
  assert.equal(plan.payload.embeds[0].description.length > 0, true)
})
test('replacement is sent before original deletion; send failure never deletes or raw-falls-back', async () => {
  const plan = planCursedMessage({ ...base, random: () => 0 }), order = []
  const result = await deliverCursedMessage({ plan, sendReplacement: async () => { order.push('send'); return { id: 'replacement' } }, deleteOriginal: async () => order.push('delete') })
  assert.deepEqual(order, ['send','delete'])
  assert.equal(result.originalDeleted, true)
  let deletes = 0
  await assert.rejects(() => deliverCursedMessage({ plan, sendReplacement: async () => { throw new Error('send failed') }, deleteOriginal: async () => { deletes++ } }), /send failed/)
  assert.equal(deletes, 0)
})
test('delete failure preserves original and reports delivered replacement without resending', async () => {
  let sends = 0
  const result = await deliverCursedMessage({ plan: { payload: {} }, sendReplacement: async () => { sends++; return { id: 'replacement' } }, deleteOriginal: async () => { throw new Error('no permission') } })
  assert.equal(result.delivered, true)
  assert.equal(result.originalDeleted, false)
  assert.equal(sends, 1)
})
