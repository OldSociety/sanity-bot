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
  assert.deepEqual(data.options.map(option => option.name), ['player'])
  assert.equal(data.options[0].type, 6); assert.equal(data.options[0].required, false)
})
test('Admin card label comes from the selected member role', async t => {
  const f = await fixture(t)
  f.interaction.guild.members.fetch = async () => ({ displayName: 'Alice', displayAvatarURL: f.interaction.user.displayAvatarURL,
    roles: { cache: new Map([['admin', { id: 'admin', name: 'Admin' }]]) } })
  await f.execute(); assert.equal(f.rendered[0].isAdmin, true)
})

test('birthday and level previews are private and never change saved levels, currency or Sanity', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_level: 27, chat_exp: 3000, fate_points: 100, bank: 63 })
  const before = (await f.User.findByPk('alice')).get({ plain: true })
  let balanceReads = 0
  const sanityService = { view: async () => { throw Error('Preview must not settle Sanity') }, models: { Account: {
    findOne: async () => { balanceReads++; return { balance: 72 } },
  } } }
  const deferred = []
  f.interaction.deferReply = async options => deferred.push(options)
  for (const mode of ['birthday', 'level']) {
    f.interaction.options.getSubcommand = () => mode
    await f.execute({ sanityService })
    assert.deepEqual((await f.User.findByPk('alice')).get({ plain: true }), before)
  }
  assert.deepEqual(deferred, [{ ephemeral: true }, { ephemeral: true }])
  assert.equal(f.rendered[0].occasion, 'birthday'); assert.equal(f.rendered[0].user.bank, 73)
  assert.equal(f.rendered[0].before.bank, 63); assert.equal(f.rendered[1].occasion, 'level-up')
  assert.equal(f.rendered[1].user.chat_level, 28); assert.equal(f.rendered[1].before.chat_level, 27)
  assert.equal(balanceReads, 2); assert.match(f.edits[0].content, /Visual preview only/)
})
test('profile shows only selected member ownership, regardless of available server badges/emojis', async t => {
  const f = await fixture(t)
  const { defineBadgeModel, createBadges } = require('../services/badges')
  const Ownership = defineBadgeModel(f.User.sequelize); await Ownership.sync()
  await Ownership.bulkCreate([
    { guildId: 'guild', userId: 'alice', badgeId: 'spooky-2026:sel', sourceEventId: 'spooky-2026', awardedAt: new Date() },
    { guildId: 'guild', userId: 'bob', badgeId: 'spooky-2026:mrq', sourceEventId: 'spooky-2026', awardedAt: new Date() },
    { guildId: 'other', userId: 'alice', badgeId: 'spooky-2026:had', sourceEventId: 'spooky-2026', awardedAt: new Date() },
  ])
  f.interaction.guild.emojis.fetch = async () => new Map([['mrq', { id: '123456789012345678', name: 'spooky_marq_badge' }]])
  await f.execute({ badgeService: createBadges({ sequelize: f.User.sequelize }) })
  assert.deepEqual(f.rendered[0].badges.map(badge => badge.id), ['spooky-2026:sel'])
  await Ownership.destroy({ where: { guildId: 'guild', userId: 'alice' } })
  await f.execute({ badgeService: createBadges({ sequelize: f.User.sequelize }) })
  assert.deepEqual(f.rendered[1].badges, [])
})
test('profile wrapper rejects wrong guild and unsupported environments before loading storage', async t => {
  const oldEnv = process.env.NODE_ENV, oldGuild = process.env.GUILDID
  t.after(() => {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
    if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild
  })
  for (const [environment, guildId] of [['production', 'other-guild'], ['development', 'other-guild'], ['test', 'dev-guild']]) {
    process.env.NODE_ENV = environment; process.env.GUILDID = 'dev-guild'
    let rejected = false
    await require('../commands/Server/Profile').execute({ guildId, reply: async payload => {
      rejected = true; assert.equal(payload.ephemeral, true); assert.match(payload.content, /configured server/)
    } })
    assert.equal(rejected, true)
  }
})

test('production definition has only optional player; normal profiles skip Sanity and previews are rejected', async t => {
  const f = await fixture(t), previous = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = previous })
  process.env.NODE_ENV = 'production'
  let freshness
  f.interaction.guild.members.fetch = async input => { freshness = input; return { user: { bot: false }, roles: { cache: new Map() }, displayName: 'Alice', displayAvatarURL: f.interaction.user.displayAvatarURL } }
  await f.execute()
  assert.deepEqual(freshness, { user: 'alice', force: true }); assert.equal(f.rendered[0].sanity, null)
  assert.equal(require('../services/command-environment').commandEnabled(require('../commands/Server/Profile'), 'production'), true)
  f.interaction.options.getSubcommand = () => 'birthday'
  let reply
  f.interaction.reply = async payload => { reply = payload }
  await f.execute(); assert.match(reply.content, /only in development/); assert.equal(f.rendered.length, 1)
})

test('unavailable members and production Bots-role targets cannot render cards', async t => {
  const f = await fixture(t), previous = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = previous }); process.env.NODE_ENV = 'production'
  f.interaction.guild.members.fetch = async () => { throw Error('Member unavailable') }
  await f.execute(); assert.match(f.edits[0], /not available/)
  f.interaction.guild.members.fetch = async () => ({ user: { bot: false }, roles: { cache: new Map([['bots', { name: 'Bots' }]]) } })
  await f.execute(); assert.match(f.edits[1], /Bots are excluded/); assert.equal(f.rendered.length, 0)
})
