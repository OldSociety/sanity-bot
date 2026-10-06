const test = require('node:test'), assert = require('node:assert/strict')
const baseline = require('./fixtures/community-baseline.json')
const { selectConfig } = require('../services/community-leveling/config')
const { qualifies } = require('../services/community-leveling/runtime')
test('configured community recipients preserve the verified existing Unwanted Fate role in each guild', () => {
  for (const guild of baseline) {
    const config = selectConfig(guild.environment)
    assert.equal(config.guildId, guild.guildId)
    assert.deepEqual(config.campaignRoleIds, [guild.configured.UNWANTEDROLEID])
    assert.equal(guild.roles.find(role => role.id === config.campaignRoleIds[0]).name, 'Unwanted')
    assert.equal(config.enabled, false)
  }
})
test('shared channel baseline uses existing text/forums and excludes prior Spooky, administration, bot-test and party channels', () => {
  for (const guild of baseline) {
    const config = selectConfig(guild.environment)
    assert.ok(config.channelIds.length > 0)
    for (const id of config.channelIds) {
      const channel = guild.channels.find(channel => channel.id === id)
      assert.ok(channel); assert.ok([0, 5, 15, 16].includes(channel.type))
      assert.equal(channel.name.includes('private'), false)
    }
    for (const name of ['BOTTESTCHANNELID', 'MODERATORCHANNELID', 'MONDAYCHANNELID', 'WEDNESDAYCHANNELID', 'SPOOKYCHANNELID']) {
      if (guild.configured[name]) assert.equal(config.channelIds.includes(guild.configured[name]), false)
    }
    for (const channel of guild.channels.filter(channel => ['general-chat', 'general', 'pathos', 'amefyst-private', 'board-private', 'upcominggame-private'].includes(channel.name))) {
      assert.equal(config.channelIds.includes(channel.id), false)
    }
  }
})
test('existing mixed-use community channels count ordinary chat while slash output and unlisted private-party chat do not', () => {
  for (const guild of baseline) {
    const config = { ...selectConfig(guild.environment), enabled: true }
    const message = { guild: { id: guild.guildId }, author: { bot: false }, member: { roles: { cache: new Map() } },
      channelId: guild.configured.HELLBOUNDCHANNELID, channel: { type: 0 }, content: 'Ordinary shared player conversation' }
    assert.equal(Boolean(qualifies(message, config)), true)
    assert.equal(Boolean(qualifies({ ...message, content: '/fate reroll' }, config)), false)
    assert.equal(Boolean(qualifies({ ...message, channelId: guild.configured.BOTTESTCHANNELID }, config)), false)
    assert.equal(Boolean(qualifies({ ...message, channelId: guild.configured.MONDAYCHANNELID }, config)), false)
  }
})
