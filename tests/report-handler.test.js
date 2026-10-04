const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs'), vm = require('node:vm')
function fixture() {
  const module = { exports: {} }, errors = [], client = new EventEmitter()
  client.channels = { cache: new Map() }
  new vm.Script(fs.readFileSync(require.resolve('../handlers/reportHandler'), 'utf8')).runInNewContext({
    module, require, process: { env: { ADMINROLEID: 'admin' } }, console: { error: (...args) => errors.push(args) },
  })
  module.exports(client)
  return { button: client.listeners('interactionCreate')[1], errors }
}
test('ticket listener leaves game selectors/confirmations and unrelated buttons entirely to their owner', async () => {
  const f = fixture()
  for (const customId of ['spooky-target:turn:0', 'spooky-spend-fate:turn:confirm', 'spooky-admin:next', 'roll', 'other']) {
    await f.button({ isButton: () => true, customId,
      get member() { throw new Error('Must not check ticket roles for game buttons') },
      reply: async () => { throw new Error('Must not acknowledge another handler’s button') } })
  }
  assert.equal(f.errors.length, 0)
})
test('ticket buttons still enforce staff permissions and contain expired-interaction failures', async () => {
  const f = fixture(), replies = []
  await f.button({ isButton: () => true, customId: 'claim_ticket', member: { roles: { cache: new Map() } },
    reply: async payload => replies.push(payload) })
  assert.equal(replies.length, 1); assert.equal(replies[0].ephemeral, true)
  await f.button({ isButton: () => true, customId: 'claim_ticket', member: { roles: { cache: new Map([['admin', {}]]) } },
    user: { tag: 'Staff' },
    reply: async () => { throw Object.assign(new Error('Unknown interaction'), { code: 10062 }) } })
  assert.equal(f.errors.length, 1); assert.equal(f.errors[0][1], 10062)
})
