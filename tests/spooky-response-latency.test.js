const test = require('node:test')
const assert = require('node:assert/strict')
const dispatcher = require('../events/InteractionCreate')

function fixture(t, { subcommand = 'treat', bot = false, fetchMember } = {}) {
  const previous = process.env.NODE_ENV
  const keys = ['GUILDID', 'SPOOKYCHANNELID', 'BOTTESTCHANNELID']
  const selected = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  process.env.NODE_ENV = 'production'
  Object.assign(process.env, { GUILDID: '100000000000000001', SPOOKYCHANNELID: '100000000000000002', BOTTESTCHANNELID: '' })
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
    for (const key of keys) { if (selected[key] === undefined) delete process.env[key]; else process.env[key] = selected[key] }
  })
  const calls = []
  const member = { user: { bot }, roles: { cache: new Map() } }
  const command = { name: 'spooky', execute: async () => { calls.push('execute') } }
  const interaction = {
    id: 'fixture', commandName: 'spooky', user: { id: 'actor' }, deferred: false, replied: false,
    guildId: process.env.GUILDID, channelId: process.env.SPOOKYCHANNELID,
    isChatInputCommand: () => true,
    options: { getSubcommand: () => subcommand, getUser: () => null },
    client: { commands: new Map([['spooky', command]]) },
    guild: { members: { fetch: async () => { calls.push('member'); return fetchMember ? fetchMember() : member } } },
    deferReply: async payload => { calls.push(['defer', payload]); interaction.deferred = true; interaction.ephemeral = payload.ephemeral },
    deleteReply: async () => { calls.push('delete-public-acknowledgement') },
    followUp: async payload => { calls.push(['private-followup', payload]) },
    editReply: async payload => { calls.push(['edit', payload]); interaction.replied = true },
    reply: async () => { throw new Error('Already acknowledged') },
  }
  return { interaction, calls }
}

test('Spooky acknowledges before a stalled fresh eligibility request and still waits before execution', async t => {
  let release, started
  const fetching = new Promise(resolve => { started = resolve })
  const pending = new Promise(resolve => { release = resolve })
  const f = fixture(t, { fetchMember: () => { started(); return pending } })
  const work = dispatcher.execute(f.interaction)
  await fetching
  assert.deepEqual(f.calls, [['defer', { ephemeral: true }], 'member'])
  release({ user: { bot: false }, roles: { cache: new Map() } })
  await work
  assert.equal(f.calls.at(-1), 'execute')
})

test('leaderboard acknowledgement stays public and excluded actors never reach gameplay', async t => {
  const f = fixture(t, { subcommand: 'leaderboard', bot: true })
  await dispatcher.execute(f.interaction)
  assert.deepEqual(f.calls[0], ['defer', { ephemeral: false }])
  assert.equal(f.calls.some(call => call === 'execute'), false)
  assert.equal(f.calls.at(-1)[0], 'private-followup')
  assert.equal(f.calls.at(-1)[1].ephemeral, true)
  assert.match(f.calls.at(-1)[1].content, /Bots are excluded/)
})

test('member snapshots reuse only a matching request member and force-fetch mismatches', async () => {
  const { snapshotMembers } = require('../services/spooky/runtime')
  let fetches = 0
  const guild = { id: 'guild', members: { fetch: async () => { fetches++; return actor } } }
  const actor = { id: 'actor', guild, user: { bot: false }, roles: { cache: new Map() }, displayName: 'Actor', nickname: null }
  assert.equal((await snapshotMembers(guild, {}, { actorId: 'actor', actorOnly: true, actorMember: actor }))[0].userId, 'actor')
  assert.equal(fetches, 0)
  await snapshotMembers(guild, {}, { actorId: 'actor', actorOnly: true, actorMember: { ...actor, guild: { id: 'other' } } })
  assert.equal(fetches, 1)
})

test('failed fresh membership lookup edits the acknowledged error without executing gameplay', async t => {
  const f = fixture(t, { fetchMember: () => { throw new Error('Synthetic membership failure') } })
  await dispatcher.execute(f.interaction)
  assert.equal(f.calls.some(call => call === 'execute'), false)
  assert.match(f.calls.at(-1)[1].content, /could not complete/)
})
