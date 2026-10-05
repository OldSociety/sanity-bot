const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { inspectSupporters, start } = require('../services/supporter-monitor')
function fixture() {
  let fetches = 0, lists = 0
  const member = (id, active, hasRole) => ({ id, user: { bot: false }, premiumSinceTimestamp: active ? 1234 : null,
    roles: { cache: new Map(hasRole ? [['booster', {}]] : []) } })
  const guild = { id: 'guild', roles: { fetch: async () => { fetches++; return new Map([['booster', { managed: true, tags: { premiumSubscriberRole: true } }]]) } },
    members: { list: async options => { lists++; assert.equal(options.cache, false); return new Map([['alice', member('alice', true, true)], ['former', member('former', false, false)]]) } } }
  return { guild, member, fetches: () => fetches, lists: () => lists }
}
test('native managed boost role is inspected against fresh authoritative premium timestamps without currency or role edits', async () => {
  const f = fixture()
  assert.deepEqual(await inspectSupporters(f.guild, 'booster'), { checked: 2, active: 1, holders: 1, mismatches: [] })
  await inspectSupporters(f.guild, 'booster'); assert.equal(f.fetches(), 2); assert.equal(f.lists(), 2)
})
test('stale/missing roles are reported; unknown or external source is never treated as proof of payment', async () => {
  const f = fixture()
  f.guild.members.list = async () => new Map([['former', f.member('former', false, true)], ['new', f.member('new', true, false)]])
  assert.deepEqual((await inspectSupporters(f.guild, 'booster')).mismatches, [
    { userId: 'former', boosting: false, hasRole: true }, { userId: 'new', boosting: true, hasRole: false }])
  f.guild.roles.fetch = async () => new Map([['booster', { managed: false }]])
  assert.deepEqual(await inspectSupporters(f.guild, 'booster'), { skipped: 'not_native_discord_boost_role' })
  await assert.rejects(inspectSupporters(f.guild, 'missing'), /unavailable/)
})
test('failed fresh lookup does not fall back to stale member cache or modify roles', async () => {
  const f = fixture()
  f.guild.members.list = async () => { throw Error('REST unavailable') }
  await assert.rejects(inspectSupporters(f.guild, 'booster'), /REST unavailable/)
})
test('duplicate pagination is rejected instead of presenting an incomplete clean audit', async () => {
  const f = fixture(), page = new Map(Array.from({ length: 1000 }, (_, i) => [String(i), f.member(String(i), false, false)]))
  f.guild.members.list = async () => page
  await assert.rejects(inspectSupporters(f.guild, 'booster'), /repeated/)
})
test('legacy handler registers no daily currency job or member-update grant and monitor is singleton', async () => {
  const client = new EventEmitter(), f = fixture()
  client.guilds = { fetch: async () => f.guild }
  const saved = { GUILDID: process.env.GUILDID, BOOSTERROLEID: process.env.BOOSTERROLEID }
  process.env.GUILDID = 'guild'; process.env.BOOSTERROLEID = 'booster'
  let monitor
  try {
    monitor = require('../handlers/boosterHandler')(client, new Proxy({}, { get: () => { throw Error('No wallet access allowed') } }))
    assert.equal(client.listenerCount('guildMemberUpdate'), 0)
    assert.equal(client.listenerCount('ready'), 1)
    assert.equal(require('../handlers/boosterHandler')(client), monitor)
    await monitor.tick(); assert.equal(f.lists(), 1)
  } finally { monitor?.stop(); for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value }
})
test('concurrent checks share one lookup and scheduled failures are contained', async () => {
  const client = new EventEmitter(), f = fixture(), errors = []
  client.guilds = { fetch: async () => f.guild }
  const monitor = start(client, { guildId: 'guild', roleId: 'booster', logger: { error: (...args) => errors.push(args) } })
  try {
    await Promise.all([monitor.tick(), monitor.tick()]); assert.equal(f.lists(), 1)
    f.guild.members.list = async () => { throw Error('offline') }
    assert.deepEqual(await monitor.tick(), { failed: true }); assert.equal(errors.length, 1)
  } finally { monitor.stop() }
})
