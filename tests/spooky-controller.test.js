const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const defineUser = require('../Models/User/User')
const migration = require('../migrations/20261001000000-create-spooky-core')
const deliveryMigration = require('../migrations/20261001000001-create-spooky-delivery')
const { defineSpookyModels } = require('../services/spooky/models')
const { createDelivery } = require('../services/spooky/delivery')
const { createController } = require('../services/spooky/controller')
const { actionMessages } = require('../services/spooky/presentation')
const { config } = require('../services/spooky/config')
const { spookyCommand } = require('../services/spooky/command-definition')

async function fixture(t, options = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = defineUser(sequelize, Sequelize.DataTypes); await User.sync()
  await migration.up(sequelize.getQueryInterface()); await deliveryMigration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), members = ['alice','bob'].map(userId => ({ userId, bot: false,
    displayName: userId, nickname: null, roleIds: [], canManageCurse: true, canManageNickname: true, canManageSweetTooth: true }))
  const delivery = createDelivery({ models, adapter: {} })
  const settings = { sequelize, User, models, delivery, fetchMembers: options.fetchMembers || (async () => members),
    roleIds: { curse: 'curse', sweetTooth: 'sweet', unwanted: 'unwanted' },
    event: { ...config, enabled: options.enabled ?? true }, clock: () => new Date(config.startsAt), random: () => options.roll ?? 0 }
  const controller = createController(settings)
  const interaction = (id, subcommand, userId = 'alice') => {
    const replies = [], sent = [], order = []
    return { id, guildId: 'guild', channelId: 'spooky', user: { id: userId, username: userId }, options: { getSubcommand: () => subcommand },
      deferred: false, replies, sent, order,
      deferReply: async function (payload) { this.deferred = true; order.push('defer'); replies.push(payload) },
      editReply: async payload => { order.push('edit'); replies.push(payload) }, reply: async payload => replies.push(payload),
      channel: { send: async payload => { order.push('send'); if (options.failSend) throw new Error('send failed'); sent.push(payload); return { id: 'message' } } } }
  }
  return { User, models, members, controller, interaction, settings }
}
test('private help/onboarding creates actual fate account atomically and never mentions others', async t => {
  const f = await fixture(t)
  const help = f.interaction('help', 'help'); await f.controller.execute(help)
  assert.equal(help.replies[0].ephemeral, true)
  assert.equal(help.sent.length, 0)
  const register = f.interaction('register', 'register'); await f.controller.execute(register)
  assert.equal(await f.User.count(), 1)
  assert.equal((await f.models.Participant.findOne()).candy, 10)
  assert.equal(register.sent.length, 0)
  const introduction = register.replies.at(-1).embeds[0]
  assert.match(introduction.title, /Welcome to Spooky/)
  assert.match(introduction.description, /\/spooky treat/)
  assert.match(introduction.description, /\/spooky help/)
  assert.equal(introduction.footer.text, 'Available: 🍬 10 • 🧿 0')
  const status = f.interaction('collection', 'collection'); await f.controller.execute(status)
  assert.ok(status.replies.at(-1).embeds[0].footer.text.includes('🍬'))
})

test('registration avatar and committed balances survive replay; re-registering grants no extra candy', async t => {
  const f = await fixture(t)
  const first = f.interaction('first-registration', 'register')
  first.user.displayAvatarURL = () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
  await f.controller.execute(first)
  assert.equal(first.replies.at(-1).embeds[0].thumbnail.url, first.user.displayAvatarURL())
  const player = await f.models.Participant.findOne()
  await player.update({ candy: 3, eyes: 2 })
  const returning = f.interaction('return-registration', 'register')
  await f.controller.execute(returning)
  assert.match(returning.replies.at(-1).embeds[0].title, /Welcome Back/)
  assert.equal(returning.replies.at(-1).embeds[0].footer.text, 'Available: 🍬 3 • 🧿 2')
  assert.equal((await player.reload()).candy, 3)
  await player.update({ candy: 1, eyes: 4 })
  const replay = f.interaction('return-registration', 'register')
  await createController(f.settings).execute(replay)
  assert.deepEqual(replay.replies.at(-1), returning.replies.at(-1))
  assert.equal((await player.reload()).candy, 1)
  assert.equal(player.eyes, 4)
  assert.equal(await f.models.Ledger.count({ where: { userId: 'alice', resource: 'candy', delta: 10 } }), 1)
})
test('registered targets are publicly tagged with strict user allowlist', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  await f.controller.execute(f.interaction('bob-register', 'register', 'bob'))
  const action = f.interaction('trick', 'trick'); await f.controller.execute(action)
  assert.equal(action.order[0], 'defer')
  assert.equal(action.sent.length, 1)
  assert.deepEqual(action.sent[0].allowedMentions.users, ['bob'])
  assert.equal(action.sent[0].content, '<@bob>')
  assert.equal(JSON.stringify(action.sent).includes('prestige'), false)
})

test('losing outcomes charge exactly one candy and remain flavorful private results', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('join', 'register'))
  const lost = f.interaction('lost-one', 'treat'); await f.controller.execute(lost)
  const embed = lost.replies.at(-1).embeds[0]
  assert.equal(embed.title, '🎃 Oops! 🍬 Candy Down!')
  assert.match(embed.footer.text, /🍬 9/)
  assert.doesNotMatch(embed.footer.text, /\/80/)
  assert.equal(JSON.stringify(embed).includes('unavailable'), false)
  const caught = f.interaction('caught-one', 'trick')
  await createController({ ...f.settings, random: () => 0.6 }).execute(caught)
  assert.equal(caught.replies.at(-1).embeds[0].title, '🚨 Caught Red-Handed!')
  assert.equal((await f.models.Participant.findOne()).candy, 8)
  assert.equal(await f.models.Ledger.count({ where: { userId: 'alice', resource: 'candy', delta: -1 } }), 2)
  const replay = f.interaction('lost-one', 'treat'); await createController(f.settings).execute(replay)
  assert.deepEqual(replay.replies.at(-1), lost.replies.at(-1))
  assert.equal((await f.models.Participant.findOne()).candy, 8)
})

test('successful public results remove the private acknowledgement; failed delivery keeps a friendly warning', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('join', 'register'))
  const action = f.interaction('trick-cleanup', 'trick')
  action.deleteReply = async () => action.order.push('delete')
  await f.controller.execute(action)
  assert.deepEqual(action.order, ['defer', 'send', 'delete'])
  assert.equal(action.replies.length, 1)
  assert.match(action.sent[0].embeds[0].description, /sneaked away/)
  const broken = await fixture(t, { failSend: true })
  await broken.controller.execute(broken.interaction('join', 'register'))
  const failed = broken.interaction('failed-cleanup', 'trick')
  failed.deleteReply = async () => failed.order.push('delete')
  await broken.controller.execute(failed)
  assert.equal(failed.order.includes('delete'), false)
  assert.equal(failed.replies.at(-1).embeds[0].title, '🎃 Action Saved')
  assert.equal(JSON.stringify(failed.replies).includes('Operation:'), false)
})
test('nonregistered targets remain public but untagged; actor-only effects stay private', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  const trick = f.interaction('trick', 'trick'); await f.controller.execute(trick)
  assert.equal(trick.sent.length, 1)
  assert.deepEqual(trick.sent[0].allowedMentions.users, [])
  assert.equal(trick.sent[0].content, undefined)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).registeredAt, null)
  const treat = f.interaction('lost', 'treat'); await f.controller.execute(treat)
  assert.equal(treat.sent.length, 0)
  assert.equal(treat.replies[0].ephemeral, true)
})
test('fate purchase publicly reveals quarter; replay retains render plan and debits only once', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  await f.User.update({ bank: 10 }, { where: { user_id: 'alice' } })
  const fate = f.interaction('fate', 'fate'); await f.controller.execute(fate)
  assert.equal(fate.sent.length, 1)
  assert.ok(fate.sent[0].embeds[0].title.includes('QUARTER COLLECTED'))
  assert.equal(fate.sent[0].embeds[0].footer.text, 'Available: 🍬 10 • 🧿 0')
  assert.equal(fate.sent[0].embeds[0].timestamp, undefined)
  const fresh = createController(f.settings), replay = f.interaction('fate', 'fate')
  await fresh.execute(replay)
  assert.deepEqual(replay.sent, fate.sent)
  assert.equal(replay.sent[0].enforceNonce, true)
  assert.equal((await f.User.findByPk('alice')).bank, 0)
})
test('failed public notification does not refund or reroll committed theft', async t => {
  const f = await fixture(t, { failSend: true })
  await f.controller.execute(f.interaction('register', 'register'))
  const action = f.interaction('theft', 'trick'); await f.controller.execute(action)
  assert.equal(action.replies.at(-1).embeds[0].title, '🎃 Action Saved')
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).candy, 9)
})
test('membership failures and disabled events do not mutate or silently find rewards', async t => {
  const f = await fixture(t, { fetchMembers: async () => { throw new Error('fetch failed') } })
  await f.controller.execute(f.interaction('register', 'register'))
  await f.controller.execute(f.interaction('failed', 'trick'))
  assert.equal(await f.models.Participant.count(), 1)
  const disabled = await fixture(t, { enabled: false })
  await disabled.controller.execute(disabled.interaction('register', 'register'))
  assert.equal(await disabled.User.count(), 0)
})
test('all effect recipient fields route publicly, with safe names and no false permanent badge claim', () => {
  const base = { actorId: 'alice', members: [{ userId: 'bob', displayName: '@everyone <@123>' }], registeredIds: new Set() }
  for (const result of [{ gifts: [{ userId: 'bob' }] }, { shielded: ['alice','bob'] }, { cursedUserId: 'bob' }, { freedUserId: 'bob' }, { reversedUserId: 'bob' }, { awardedUserId: 'bob' }]) {
    const messages = actionMessages({ outcome: 'test', result }, base)
    assert.equal(messages[0].public, true)
    assert.equal(JSON.stringify(messages).includes('@everyone'), false)
  }
  const complete = actionMessages({ result: { newlyCompletedCharacters: ['had'] } }, base)
  assert.equal(complete.at(-1).public, true)
  assert.ok(complete.at(-1).payload.embeds[0].title.includes('Complete!'))
  assert.ok(complete.at(-1).payload.embeds[0].description.includes('ownership is unavailable in this saved result'))
})

test('slash definitions match help and route the authenticated interaction to the controller', async () => {
  let seen
  const command = spookyCommand({ execute: async interaction => { seen = interaction } })
  assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['help','register','collection','leaderboard','trick','treat','fate'])
  const interaction = { id: 'test' }; await command.execute(interaction)
  assert.equal(seen, interaction)
})

test('a newly completed character gets one prominent notification; later draws do not repeat completion', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  const player = await f.models.Participant.findOne()
  for (const pieceId of ['had_tr','had_bl','had_br']) await f.models.Inventory.create({ participantId: player.id, pieceId, quantity: 1 })
  await f.User.update({ bank: 20 }, { where: { user_id: 'alice' } })
  const first = f.interaction('first', 'fate'); await f.controller.execute(first)
  assert.equal(first.sent.filter(message => message.embeds[0].title.includes('Complete!')).length, 1)
  const next = f.interaction('next', 'fate'); await f.controller.execute(next)
  assert.equal(next.sent.filter(message => message.embeds[0].title.includes('Complete!')).length, 0)
})


test('collection shows total duplicate progress across characters', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register-duplicates', 'register'))
  const player = await f.models.Participant.findOne()
  for (const [pieceId, quantity] of [['sel_tl',2], ['mrq_tr',3]]) await f.models.Inventory.create({ participantId: player.id, pieceId, quantity })
  const view = f.interaction('view-duplicates', 'collection'); await f.controller.execute(view)
  assert.match(JSON.stringify(view), /Current Duplicates: 3\/5/)
})
