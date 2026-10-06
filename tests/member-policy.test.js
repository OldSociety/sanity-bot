const test = require('node:test'), assert = require('node:assert/strict')
const { excludedMember, adminMember } = require('../services/member-policy')
const member = (bot, roles = []) => ({ user: { bot }, roles: { cache: new Map(roles.map(role => [role.id, role])) } })
test('production excludes Discord bots and Bots-role humans; explicit development permits both', () => {
  for (const value of [member(true), member(false, [{ id: 'bots', name: 'Bots' }]), member(false, [{ id: 'configured', name: 'Renamed' }])]) {
    assert.equal(excludedMember(value, { environment: 'production', botRoleId: 'configured' }), true)
    assert.equal(excludedMember(value, { environment: 'development', botRoleId: 'configured' }), false)
  }
  assert.equal(excludedMember(member(false), { environment: 'production' }), false)
})
test('Admin label follows configured role or exact Admin role name, not unrelated roles', () => {
  assert.equal(adminMember(member(false, [{ id: 'admin-id', name: 'Staff' }]), 'admin-id'), true)
  assert.equal(adminMember(member(false, [{ id: 'x', name: 'Admin' }]), 'admin-id'), true)
  assert.equal(adminMember(member(false, [{ id: 'x', name: 'Moderator' }]), 'admin-id'), false)
})
test('runtime snapshot marks Bots-role targets excluded before gameplay sees the roster', async t => {
  const previousEnv = process.env.NODE_ENV, previousRole = process.env.BOTROLEID
  t.after(() => { process.env.NODE_ENV = previousEnv; if (previousRole === undefined) delete process.env.BOTROLEID; else process.env.BOTROLEID = previousRole })
  process.env.NODE_ENV = 'production'; process.env.BOTROLEID = 'bots'
  const actor = { ...member(false, [{ id: 'bots', name: 'Bots' }]), id: 'alice' }
  const guild = { members: { fetch: async () => actor } }
  const snapshot = require('../services/spooky/runtime').snapshotMembers
  assert.equal((await snapshot(guild, {}, { actorId: 'alice', actorOnly: true }))[0].bot, true)
  process.env.NODE_ENV = 'development'
  assert.equal((await snapshot(guild, {}, { actorId: 'alice', actorOnly: true }))[0].bot, false)
})
test('command dispatch rejects Bots-role actors and targets in production, permits development', async t => {
  const previousEnv = process.env.NODE_ENV
  const keys = ['GUILDID', 'SPOOKYCHANNELID', 'BOTTESTCHANNELID']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { GUILDID: '100000000000000001', SPOOKYCHANNELID: '100000000000000002', BOTTESTCHANNELID: '' })
  t.after(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
  })
  const handler = require('../events/interactionCreate').execute
  for (const [environment, actorBot, targetBot, expected] of [['production', true, false, 0], ['production', false, true, 0], ['development', true, true, 1]]) {
    process.env.NODE_ENV = environment
    let executions = 0, rejected = false
    const value = isBot => member(false, isBot ? [{ id: 'role', name: 'Bots' }] : [])
    const interaction = { isChatInputCommand: () => true, commandName: 'spooky', user: { id: 'actor' },
      guildId: process.env.GUILDID, channelId: process.env.SPOOKYCHANNELID,
      client: { commands: new Map([['spooky', { execute: async () => { executions++ } }]]) },
      options: { getUser: () => ({ id: 'target' }), getSubcommand: () => 'treat' },
      guild: { members: { fetch: async ({ user }) => value(user === 'actor' ? actorBot : targetBot) } },
      deferReply: async payload => { interaction.deferred = true; assert.equal(payload.ephemeral, true) },
      editReply: async payload => { rejected = true; assert.equal(payload.ephemeral, true) },
      reply: async payload => { rejected = true; assert.equal(payload.ephemeral, true) } }
    await handler(interaction)
    assert.equal(executions, expected); assert.equal(rejected, expected === 0)
  }
})
