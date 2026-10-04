const test = require('node:test'), assert = require('node:assert/strict')
const { qualifies, campaignRecipients } = require('../services/community-leveling/runtime')
const config = { enabled: true, guildId: 'guild', channelIds: ['shared'], campaignRoleIds: ['campaign'], excludedRoleIds: ['inactive'] }
function member(id, roles, bot = false) { return { id, user: { id, username: id, bot }, roles: { cache: new Map(roles.map(role => [role, { name: role }])) } } }
test('only configured public shared text channels/threads count; parties, private threads, commands and bots never do', () => {
  const message = { guild: { id: 'guild' }, author: { bot: false }, member: member('alice', []), channelId: 'shared', channel: { type: 0 }, content: 'Conversation' }
  assert.equal(qualifies(message, config), true)
  assert.equal(qualifies({ ...message, channelId: 'thread', channel: { type: 11, parentId: 'shared' } }, config), true)
  for (const override of [{ channelId: 'party' }, { guild: { id: 'other' } }, { author: { bot: true } },
    { content: '  /fate reroll' }, { content: '  ' }, { webhookId: 'webhook' }, { interactionMetadata: {} }, { type: 20 }, { channel: { type: 2 } },
    { channelId: 'thread', channel: { type: 12, parentId: 'shared' } }, { member: member('other', ['bots']) }]) assert.equal(Boolean(qualifies({ ...message, ...override }, config)), false)
})
test('fresh campaign roster includes noncontributors and excludes spectators, inactive players and bots', async () => {
  const roster = [member('alice', ['campaign']), member('quiet-player', ['campaign']), member('spectator', []),
    member('former', ['campaign', 'inactive']), member('bot', ['campaign'], true), member('bot-role', ['campaign', 'bots'])]
  const calls = [], guild = { roles: { fetch: async () => new Map(['campaign', 'inactive'].map(id => [id, {}])) },
    members: { list: async options => { calls.push(options); return new Map(roster.map(row => [row.id, row])) } } }
  assert.deepEqual((await campaignRecipients(guild, config)).map(row => row.userId), ['alice', 'quiet-player'])
  assert.equal(calls[0].cache, false)
  await assert.rejects(() => campaignRecipients(guild, { ...config, campaignRoleIds: ['missing'] }), /unavailable/)
})
test('campaign roster uses all REST pages and aborts incomplete/repeating pagination', async () => {
  const calls = [], page1 = new Map(Array.from({ length: 1000 }, (_, i) => { const row = member(`u${i}`, ['campaign']); return [row.id, row] }))
  const last = member('last', ['campaign'])
  const guild = { roles: { fetch: async () => new Map([['campaign', {}], ['inactive', {}]]) }, members: { list: async options => {
    calls.push(options); return options.after ? new Map([[last.id, last]]) : page1
  } } }
  assert.equal((await campaignRecipients(guild, config)).length, 1001); assert.equal(calls[1].after, 'u999')
  guild.members.list = async () => page1
  await assert.rejects(() => campaignRecipients(guild, config), /repeated/)
})
