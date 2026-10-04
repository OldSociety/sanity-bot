const test = require('node:test'), assert = require('node:assert/strict')
const { allowedChannels, channelRestriction } = require('../services/spooky/channels')
const settings = { GUILDID: '100000000000000001', SPOOKYCHANNELID: '100000000000000002', BOTTESTCHANNELID: '100000000000000003' }

test('production channel policy permits only configured same-server Spooky/testing IDs', () => {
  for (const channelId of allowedChannels(settings)) assert.equal(channelRestriction({ guildId: settings.GUILDID, channelId }, settings), null)
  const rejected = channelRestriction({ guildId: settings.GUILDID, channelId: '100000000000000004' }, settings)
  assert.match(rejected.embeds[0].description, /<#100000000000000002> or <#100000000000000003>/)
  assert.deepEqual(rejected.allowedMentions.parse, [])
  assert.ok(channelRestriction({ guildId: 'other', channelId: settings.BOTTESTCHANNELID }, settings))
  assert.ok(channelRestriction({ guildId: settings.GUILDID }, { GUILDID: settings.GUILDID }))
  assert.ok(channelRestriction({ guildId: settings.GUILDID, channelId: 'bad' }, { ...settings, SPOOKYCHANNELID: 'bad' }))
})

test('off-channel runtime commands reject privately before accessing global storage or Discord', async t => {
  const keys = ['GUILDID', 'SPOOKYCHANNELID', 'BOTTESTCHANNELID'], saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, settings)
  t.after(() => { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] })
  const Module = require('node:module'), load = Module._load
  Module._load = function (request, ...args) {
    if (request === '../../config/sequelize' || request === '../../Models/model') throw new Error('Unexpected global storage import')
    return load.call(this, request, ...args)
  }
  t.after(() => { Module._load = load })
  for (const command of ['help', 'register', 'collection', 'leaderboard', 'fate', 'trick', 'treat']) {
    let reply
    await require('../services/spooky/runtime').execute({ guildId: settings.GUILDID, channelId: '100000000000000004',
      options: { getSubcommand: () => command }, reply: async payload => { reply = payload } })
    assert.equal(reply.ephemeral, true)
    assert.equal(reply.embeds[0].title, '🎃 Spooky — Channel Only')
  }
})
