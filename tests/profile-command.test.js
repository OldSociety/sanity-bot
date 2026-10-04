const test = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const { createProfileCommand } = require('../services/profile-command')
async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = require('../models/User/User')(sequelize, DataTypes); await User.sync()
  const edits = [], rendered = []
  const player = { id: 'alice', username: 'alice', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }
  const interaction = { user: player, options: { getUser: () => null }, guild: { id: 'guild',
    members: { fetch: async () => ({ displayName: 'Alice', displayAvatarURL: player.displayAvatarURL }) },
    emojis: { fetch: async () => new Map() } }, deferReply: async () => {}, editReply: async reply => edits.push(reply) }
  const execute = overrides => createProfileCommand({ User, badgeService: { details: async () => [] },
    download: async () => null, render: async data => { rendered.push(data); return Buffer.from('png') },
    logger: { error() {} }, ...overrides })(interaction)
  return { User, edits, rendered, interaction, execute }
}
test('profile reads existing and absent players without writes and sends PNG attachment', async t => {
  const f = await fixture(t); await f.execute()
  assert.equal(await f.User.count(), 0); assert.equal(f.edits[0].files[0].name, 'profile.png')
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_level: 2, chat_exp: 77, fate_points: 40, bank: 21 })
  const before = (await f.User.findByPk('alice')).get({ plain: true }); await f.execute()
  assert.equal(f.rendered[1].user.chat_exp, 77); assert.equal(f.rendered[1].user.fate_points, 40)
  assert.deepEqual((await f.User.findByPk('alice')).get({ plain: true }), before)
  assert.deepEqual(f.edits[1].allowedMentions, { parse: [] })
})
test('missing badges/avatar permit card and render failure closes deferred response', async t => {
  const f = await fixture(t)
  await f.execute({ badgeService: { details: async () => { throw Error('missing table') } }, download: async () => { throw Error('network') } })
  assert.equal(f.rendered[0].badgesUnavailable, true)
  await f.execute({ render: async () => { throw Error('renderer') } })
  assert.match(f.edits[1].content, /could not be generated/)
})
test('member option uses their wallet and guild-scoped newest badges', async t => {
  const f = await fixture(t); await f.User.create({ user_id: 'bob', user_name: 'Bob', fate_points: 12 })
  f.interaction.options.getUser = () => ({ ...f.interaction.user, id: 'bob', username: 'bob' })
  await f.execute({ badgeService: { details: async (guildId, userId) => {
    assert.equal(guildId, 'guild'); assert.equal(userId, 'bob')
    return [{ badgeId: 'spooky-2026:sel', awardedAt: '2026-01-01' }, { badgeId: 'spooky-2026:mrq', awardedAt: '2026-02-01' }]
  } } })
  assert.equal(f.rendered[0].user.fate_points, 12)
  assert.deepEqual(f.rendered[0].badges.map(b => b.characterId), ['mrq', 'sel'])
})
test('profile definition supports optional member and disables DMs', () => {
  const data = require('../commands/Server/Profile').data.toJSON()
  assert.equal(data.name, 'profile'); assert.equal(data.dm_permission, false)
  assert.equal(data.options[0].name, 'player'); assert.equal(data.options[0].required, false)
})
test('Admin card label comes from the selected member role', async t => {
  const f = await fixture(t)
  f.interaction.guild.members.fetch = async () => ({ displayName: 'Alice', displayAvatarURL: f.interaction.user.displayAvatarURL,
    roles: { cache: new Map([['admin', { id: 'admin', name: 'Admin' }]]) } })
  await f.execute(); assert.equal(f.rendered[0].isAdmin, true)
})
test('profile wrapper rejects production and wrong guild before loading storage', async t => {
  const oldEnv = process.env.NODE_ENV, oldGuild = process.env.GUILDID
  t.after(() => {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
    if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild
  })
  for (const [environment, guildId] of [['production', 'dev-guild'], ['development', 'other-guild'], ['test', 'dev-guild']]) {
    process.env.NODE_ENV = environment; process.env.GUILDID = 'dev-guild'
    let rejected = false
    await require('../commands/Server/Profile').execute({ guildId, reply: async payload => {
      rejected = true; assert.equal(payload.ephemeral, true); assert.match(payload.content, /development server only/)
    } })
    assert.equal(rejected, true)
  }
})
