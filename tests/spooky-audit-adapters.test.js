const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createMemberDirectory } = require('../services/guild-members')
const { snapshotMembers } = require('../services/spooky/runtime')
function guildFixture() {
  const client = new EventEmitter(), guild = { id: 'guild', client, memberCount: 2, ownerId: 'owner' }
  const member = id => ({ id, guild, user: { bot: false }, nickname: null, displayName: id,
    roles: { cache: new Map(), highest: {} }, manageable: true })
  let roster = new Map(['alice', 'bob'].map(id => [id, member(id)])), calls = 0, now = 0
  guild.members = { fetch: async options => { if (options?.user) return roster.get(options.user); calls++; return roster },
    fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } }) }
  guild.roles = { fetch: async () => new Map() }
  const directory = createMemberDirectory(client, { clock: () => now, timeoutMs: 30 })
  return { guild, client, directory, member, calls: () => calls, setRoster: value => { roster = value }, setNow: value => { now = value } }
}
test('burst consumers share one complete bootstrap; member events keep it current', async () => {
  const f = guildFixture()
  const snapshots = await Promise.all(Array.from({ length: 10 }, () => f.directory.get(f.guild)))
  assert.equal(f.calls(), 1); assert.equal(snapshots.every(map => map.size === 2), true)
  const bob = f.member('bob'); bob.nickname = 'Changed'
  f.client.emit('guildMemberUpdate', f.member('bob'), bob)
  f.guild.memberCount++; f.client.emit('guildMemberAdd', f.member('carol'))
  f.guild.memberCount--; f.client.emit('guildMemberRemove', bob)
  const current = await f.directory.get(f.guild)
  assert.equal(current.has('bob'), false); assert.equal(current.has('carol'), true); assert.equal(f.calls(), 1)
  assert.equal(snapshots[0].has('bob'), true)
})
test('incomplete bootstrap fails closed and retries obey allowance; disconnect invalidates', async () => {
  const f = guildFixture(); f.setRoster(new Map([['alice', f.member('alice')]]))
  await assert.rejects(f.directory.get(f.guild), /Complete guild/)
  await assert.rejects(f.directory.get(f.guild), /cooling down/)
  assert.equal(f.calls(), 1)
  f.setNow(31001); f.guild.memberCount = 1
  await f.directory.get(f.guild)
  f.client.emit('shardDisconnect')
  await assert.rejects(f.directory.get(f.guild), /cooling down/)
})
test('rate-limit dispatch ends wait promptly and respects server retry_after seconds', async () => {
  const f = guildFixture()
  f.guild.members.fetch = options => {
    queueMicrotask(() => f.client.emit('raw', { t: 'RATE_LIMITED', d: { opcode: 8, retry_after: 60, meta: { guild_id: 'guild', nonce: options.nonce } } }))
    return new Promise(() => {})
  }
  await assert.rejects(f.directory.get(f.guild), /rate limited/)
  f.setNow(40000); await assert.rejects(f.directory.get(f.guild), /cooling down/)
  assert.equal(f.client.listenerCount('raw'), 0)
})
test('unresponsive member fetch has a bounded deadline and removes listeners', async () => {
  const f = guildFixture(); f.guild.members.fetch = () => new Promise(() => {})
  await assert.rejects(f.directory.get(f.guild), /timed out/)
  assert.equal(f.client.listenerCount('raw'), 0)
})
test('personal fate snapshot uses only a fresh actor; repeated gameplay shares directory', async () => {
  const f = guildFixture()
  const actor = await snapshotMembers(f.guild, {}, { actorId: 'alice', actorOnly: true })
  assert.equal(actor.length, 1); assert.equal(f.calls(), 0)
  await Promise.all(Array.from({ length: 10 }, () => snapshotMembers(f.guild, {}, { actorId: 'alice' })))
  assert.equal(f.calls(), 1)
})
test('/user defers publicly before DB/badge work and edits once', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), module = { exports: {} }, order = []
  new vm.Script(fs.readFileSync(require.resolve('../commands/Server/User'), 'utf8')).runInNewContext({ module, console, require: name => {
    if (name === 'discord.js') return require('discord.js')
    if (name.includes('Models/model')) return { User: { findOne: async () => { order.push('db'); return { chat_level: 2 } } } }
    if (name.includes('services/badges')) return { badgeField: async () => { order.push('badges'); return { name: 'Badges', value: 'test' } } }
    throw new Error(`Unexpected import ${name}`)
  } })
  await module.exports.execute({ user: { id: 'alice', username: 'Alice' }, member: { joinedAt: new Date() }, guild: {},
    deferReply: async payload => { assert.equal(payload, undefined); order.push('defer') }, editReply: async () => order.push('edit') })
  assert.deepEqual(order, ['defer', 'db', 'badges', 'edit'])
})
