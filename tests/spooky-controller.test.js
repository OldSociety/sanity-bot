const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const defineUser = require('../Models/User/User')
const migration = require('../migrations/20261001000000-create-spooky-core')
const deliveryMigration = require('../migrations/20261001000001-create-spooky-delivery')
const notificationMigration = require('../migrations/20261001000002-create-spooky-notifications')
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
  if (options.notifications) await notificationMigration.up(sequelize.getQueryInterface())
  const settings = { sequelize, User, models, delivery, fetchMembers: options.fetchMembers || (async () => members),
    roleIds: { curse: 'curse', sweetTooth: 'sweet', unwanted: 'unwanted' },
    event: { ...config, duplicates: options.duplicates || config.duplicates, enabled: options.enabled ?? true, gifs: { routinePercent: options.gifPercent ?? config.gifs.routinePercent } },
    ...(options.notifications ? { notifications: require('../services/spooky/notifications').createNotifications({ models }) } : {}),
    clock: () => new Date(config.startsAt), mentionRoll: () => 0, random: () => options.roll ?? 0 }
  const controller = createController(settings)
  const interaction = (id, subcommand, userId = 'alice') => {
    const replies = [], sent = [], order = []
    return { id, guildId: 'guild', channelId: 'spooky', user: { id: userId, username: userId }, options: { getSubcommand: () => subcommand },
      deferred: false, replies, sent, order,
      deferReply: async function (payload) { this.deferred = true; order.push('defer'); replies.push(payload) },
      editReply: async payload => { order.push('edit'); replies.push(payload) }, reply: async payload => replies.push(payload),
      fetchReply: async () => ({ createMessageComponentCollector: () => {
        const collector = new (require('node:events').EventEmitter)()
        collector.stop = reason => collector.emit('end', [], reason)
        queueMicrotask(() => collector.emit('collect', { user: { id: userId }, guildId: 'guild', channelId: 'spooky',
          customId: (subcommand === 'spend-fate' ? 'spooky-spend-fate:' + id + ':confirm' : 'spooky-target:' + id + ':0'), deferUpdate: async () => {}, reply: async () => {} }))
        return collector
      } }),
      channel: { send: async payload => { order.push('send'); if (options.failSend) throw new Error('send failed'); sent.push(payload); return { id: 'message' } } } }
  }
  return { User, models, members, controller, interaction, settings }
}

test('Plot action commits shared progress and saved spotlight emoji with no candy gain or replay credit', async t => {
  const f = await fixture(t)
  await require('../migrations/plot-points').up(f.User.sequelize.getQueryInterface())
  const event = { ...f.settings.event, plotPointsEnabled: true }
  const controller = createController({ ...f.settings, event, clock: () => new Date('2026-10-06T20:00:00Z') })
  await controller.execute(f.interaction('plot-register','register'))
  const turn = f.interaction('plot-action','treat')
  turn.guild = { emojis: { fetch: async () => new Map([['had', {name:'spooky_hadley_badge',id:'100000000000000001'}]]) } }
  await controller.execute(turn)
  const receipt = (await f.models.Operation.findByPk('discord:plot-action')).receipt
  assert.equal(receipt.outcome,'plot_point')
  assert.equal(receipt.result.plotPoints,1)
  assert.equal(receipt.candy,9)
  assert.match(turn.sent[0].embeds[0].description,/<:spooky_hadley_badge:100000000000000001> plot/)
  assert.equal((await require('../services/plot-points').createPlotPoints({sequelize:f.User.sequelize}).view('guild')).total,1)
  await controller.execute(turn)
  assert.equal((await require('../services/plot-points').createPlotPoints({sequelize:f.User.sequelize}).view('guild')).total,1)
})
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

test('Eye Candy gifts a fourth Eye publicly without awarding a piece or granting badge access', async t => {
  const f = await fixture(t, { notifications: true, gifPercent: 0 })
  for (const userId of ['alice', 'bob']) await f.controller.execute(f.interaction(`join-${userId}`, 'register', userId))
  const recipient = await f.models.Participant.findOne({ where: { userId: 'bob' } })
  await recipient.update({ eyes: 3 })
  const pieces = require('../services/spooky/config').pieces
  await f.models.Inventory.bulkCreate(pieces.filter(piece => piece.characterId === 'had' && piece.id !== 'had_br').map(piece => ({ participantId: recipient.id, pieceId: piece.id, quantity: 1 })))
  const awards = [], projections = []
  const rolls = [.85, 0, .8, 0]
  const controller = createController({ ...f.settings, random: () => rolls.shift() ?? 0,
    badges: { award: async (_ctx, userId, characterId) => { awards.push([userId, characterId]); return `spooky-2026:${characterId}` } },
    badgeAccess: { reconcileUser: async (guild, userId) => projections.push([guild, userId]) } })
  const turn = f.interaction('gift-completion', 'treat')
  await controller.execute(turn)
  assert.deepEqual(awards, []); assert.deepEqual(projections, [])
  assert.equal(turn.sent.length, 1)
  assert.equal(turn.sent[0].embeds[0].title, '🍬 Eye Candy!')
  assert.match(turn.sent[0].embeds[0].description, /<@bob> received \*\*1 🧿 Evil Eye/)
  assert.equal(turn.sent[0].embeds[0].footer.text, 'Available: 🍬 14 • 🧿 0')
  const receipt = (await f.models.Operation.findByPk('discord:gift-completion')).receipt
  assert.deepEqual(receipt.result.newlyCompletedCharacters, [])
  assert.equal((await recipient.reload()).eyes, 4)
  await controller.execute(f.interaction('gift-completion', 'treat'))
  assert.deepEqual(awards, [])
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 14)
})

test('ordinary candy actions skip inventory/access scans and publish before operation-only projections', async t => {
  const f = await fixture(t, { roll: 0.6, notifications: true })
  await f.controller.execute(f.interaction('speed-register', 'register'))
  let inventories = 0, accesses = 0
  const original = f.models.Inventory.findAll.bind(f.models.Inventory)
  f.models.Inventory.findAll = async (...args) => { inventories++; return original(...args) }
  const turn = f.interaction('speed-turn', 'treat')
  const controller = createController({ ...f.settings, badgeAccess: { reconcileUser: async () => { accesses++ } },
    delivery: { enqueue: f.settings.delivery.enqueue, reconcile: async (scope, options) => {
      assert.deepEqual(scope, { eventId: config.eventId, guildId: 'guild' })
      assert.deepEqual(options, { revision: 'discord:speed-turn' })
      assert.equal(turn.sent.length, 1)
      turn.order.push('project')
    } } })
  await controller.execute(turn)
  assert.equal(inventories, 0); assert.equal(accesses, 0)
  assert.ok(turn.order.indexOf('send') < turn.order.indexOf('project'))
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 9)
})

test('leaderboard is public while collection and help remain private', async t => {
  const f = await fixture(t)
  for (const command of ['leaderboard', 'collection', 'help']) {
    const interaction = f.interaction(`visibility-${command}`, command)
    await f.controller.execute(interaction)
    assert.equal(interaction.replies[0].ephemeral, command !== 'leaderboard')
  }
})

test('public leaderboard uses latest earned badge emoji and defaults to supplied Selene art', async t => {
  const f = await fixture(t)
  const initial = f.interaction('initial-board', 'leaderboard')
  await f.controller.execute(initial)
  assert.equal(initial.replies.at(-1).embeds[0].thumbnail.url, 'attachment://SPOOKY_SELENE_BADGE.png')
  assert.ok(initial.replies.at(-1).files[0].attachment.endsWith('SPOOKY_SELENE_BADGE.png'))
  const controller = createController({ ...f.settings, badges: { latest: async () => ({ characterId: 'mrq', name: 'Marq', emojiName: 'spooky_marq_badge' }) } })
  const next = f.interaction('marq-board', 'leaderboard')
  next.guild = { emojis: { fetch: async () => new Map([['123456789012345678', { id: '123456789012345678', name: 'spooky_marq_badge', available: true }]]) } }
  await controller.execute(next)
  assert.equal(next.replies.at(-1).embeds[0].thumbnail.url, 'https://cdn.discordapp.com/emojis/123456789012345678.png?size=128')
  assert.equal(next.replies.at(-1).files, undefined)
})

test('GIF rotation reads durable root history, charges once and preserves saved replay', async t => {
  const f = await fixture(t, { roll: 0.6, notifications: true, gifPercent: 100 })
  await f.controller.execute(f.interaction('rotation-join', 'register'))
  const first = f.interaction('rotation-first', 'treat')
  await f.controller.execute(first)
  const one = await f.models.Notification.findOne({ where: { operationId: 'discord:rotation-first' } })
  const savedPayload = structuredClone(one.payload)
  assert.ok(one.payload.embeds[0].image.url.includes('media.giphy.com'))
  const second = f.interaction('rotation-second', 'treat')
  await f.controller.execute(second)
  const two = await f.models.Notification.findOne({ where: { operationId: 'discord:rotation-second' } })
  assert.notEqual(two.payload.embeds[0].image.url, one.payload.embeds[0].image.url)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 8)
  const replay = f.interaction('rotation-first', 'treat')
  await createController({ ...f.settings, random: () => { throw Error('replay rerolled') } }).execute(replay)
  assert.equal(await f.models.Notification.count({ where: { operationId: 'discord:rotation-first' } }), 1)
  assert.deepEqual((await one.reload()).payload, savedPayload)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 8)
})

test('chosen shield recipient commits one action cost; replay skips the choice and random rolls', async t => {
  const f = await fixture(t, { roll: 0.4 })
  await f.controller.execute(f.interaction('join-choice', 'register'))
  const first = f.interaction('shield-choice', 'treat')
  await f.controller.execute(first)
  assert.ok(first.replies.some(payload => payload.components?.[0]?.components[0]?.custom_id === 'spooky-target:shield-choice:0'))
  assert.equal(first.replies.find(payload => payload.components?.length).embeds[0].footer.text, 'Available: 🍬 10 • 🧿 0')
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 9)
  assert.deepEqual((await f.models.Operation.findByPk('discord:shield-choice')).receipt.result.shielded, ['bob'])
  const replay = f.interaction('shield-choice', 'treat')
  await createController({ ...f.settings, random: () => { throw Error('replay rerolled') } }).execute(replay)
  assert.equal(replay.replies.some(payload => payload.components?.length), false)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 9)
})

test('break-curse skips a lone target, offers two/three choices and saves one paid result', async t => {
  for (const count of [0, 1, 2, 3]) {
    const f = await fixture(t, { roll: 0.48 })
    f.members.push(...['carol','dan'].map(userId => ({ ...f.members[1], userId, displayName: userId })))
    await f.controller.execute(f.interaction(`join-break-${count}`, 'register'))
    for (const userId of ['bob','carol','dan'].slice(0, count)) {
      await f.controller.execute(f.interaction(`join-${userId}`, 'register', userId))
      const player = await f.models.Participant.findOne({ where: { userId } })
      await f.models.Effect.create({ participantId: player.id, effectType: 'curse', expiresAt: config.endsAt,
        metadata: { botOwnedRole: true, roleId: 'curse' } })
    }
    const action = f.interaction(`break-${count}`, 'treat')
    await f.controller.execute(action)
    const choice = action.replies.find(payload => payload.components?.length)
    assert.equal(Boolean(choice), count >= 2)
    if (choice) {
      assert.equal(choice.components[0].components.length, count)
      assert.match(choice.embeds[0].title, /Whose Spell/)
    }
    const saved = await f.models.Operation.findByPk(`discord:break-${count}`)
    assert.equal(saved.receipt.candySpent, 1)
    assert.equal(await f.models.Effect.count({ where: { effectType: 'curse' } }), Math.max(0, count - 1))
    if (count) assert.ok(saved.receipt.result.freedUserId)
    else assert.ok(saved.receipt.result.gifts.length)
    const replay = f.interaction(`break-${count}`, 'treat')
    await createController({ ...f.settings, random: () => { throw Error('replay rolled again') } }).execute(replay)
    assert.equal(replay.replies.some(payload => payload.components?.length), false)
    assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 9)
  }
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
  assert.deepEqual(action.sent[0].allowedMentions.users, [])
  assert.equal(action.sent[0].content, undefined)
  assert.match(action.sent[0].embeds[0].description, /<@bob>/)
  assert.equal(JSON.stringify(action.sent).includes('prestige'), false)
})

test('losing outcomes charge exactly one candy and remain flavorful private results', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('join', 'register'))
  const lost = f.interaction('lost-one', 'treat'); await f.controller.execute(lost)
  const embed = lost.replies.at(-1).embeds[0]
  assert.match(embed.title, /Candy Down|Ghost Ate It|Tangled Treat/)
  assert.match(embed.footer.text, /🍬 9/)
  assert.doesNotMatch(embed.footer.text, /\/80/)
  assert.equal(JSON.stringify(embed).includes('unavailable'), false)
  const caught = f.interaction('caught-one', 'trick')
  await createController({ ...f.settings, random: () => 0.6 }).execute(caught)
  assert.match(caught.replies.at(-1).embeds[0].title, /Caught Red-Handed|Pumpkin Saw Everything|Bat Patrol/)
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
test('nonregistered targets get one embed mention per 72h; later effects stay public without pinging', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  const trick = f.interaction('trick', 'trick'); await f.controller.execute(trick)
  assert.equal(trick.sent.length, 1)
  assert.deepEqual(trick.sent[0].allowedMentions.users, [])
  assert.equal(trick.sent[0].content, undefined)
  assert.match(trick.sent[0].embeds[0].description, /<@bob>/)
  const second = f.interaction('second-trick', 'trick'); await f.controller.execute(second)
  assert.deepEqual(second.sent[0].allowedMentions.users, [])
  assert.equal(second.sent[0].content, undefined)
  assert.doesNotMatch(second.sent[0].embeds[0].description, /<@bob>/)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).registeredAt, null)
  const treat = f.interaction('lost', 'treat'); await f.controller.execute(treat)
  assert.equal(treat.sent.length, 0)
  assert.equal(treat.replies[0].ephemeral, true)
})
test('fate purchase publicly reveals quarter; replay retains render plan and debits only once', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  await f.User.update({ bank: 10 }, { where: { user_id: 'alice' } })
  const fate = f.interaction('fate', 'spend-fate'); await f.controller.execute(fate)
  assert.equal(fate.sent.length, 1)
  assert.ok(fate.sent[0].embeds[0].title.includes('NEW PIECE COLLECTED'))
  assert.equal(fate.sent[0].embeds[0].footer.text, 'Available: 🍬 10 • 🧿 0')
  assert.equal(fate.sent[0].embeds[0].timestamp, undefined)
  const fresh = createController(f.settings), replay = f.interaction('fate', 'spend-fate')
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
  assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['help','register','collection','leaderboard','trick','treat','spend-fate'])
  const interaction = { id: 'test' }; await command.execute(interaction)
  assert.equal(seen, interaction)
})

test('a newly completed character gets one prominent notification; later draws do not repeat completion', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register', 'register'))
  const player = await f.models.Participant.findOne()
  for (const pieceId of ['had_tr','had_bl','had_br']) await f.models.Inventory.create({ participantId: player.id, pieceId, quantity: 1 })
  await f.User.update({ bank: 20 }, { where: { user_id: 'alice' } })
  const first = f.interaction('first', 'spend-fate'); await f.controller.execute(first)
  assert.equal(first.sent.filter(message => message.embeds[0].title.includes('Complete!')).length, 1)
  const next = f.interaction('next', 'spend-fate'); await f.controller.execute(next)
  assert.equal(next.sent.filter(message => message.embeds[0].title.includes('Complete!')).length, 0)
})


test('collection explains completed-character duplicates and shows the exchange count', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('register-duplicates', 'register'))
  const player = await f.models.Participant.findOne()
  for (const [pieceId, quantity] of [['sel_tl',2], ['mrq_tr',3]]) await f.models.Inventory.create({ participantId: player.id, pieceId, quantity })
  const view = f.interaction('view-duplicates', 'collection'); await f.controller.execute(view)
  assert.match(JSON.stringify(view), /Duplicates can only come from completed characters/)
  assert.match(JSON.stringify(view), /Current Duplicates: 3\/5/)
})

test('registered recipient references are spaced out; repeated immediate actions use names', async t => {
  const f = await fixture(t)
  await f.controller.execute(f.interaction('join-alice', 'register'))
  await f.controller.execute(f.interaction('join-bob', 'register', 'bob'))
  for (let i=0;i<5;i++) {
    const interaction = f.interaction('daily-trick-'+i, 'trick'); await f.controller.execute(interaction)
    assert.equal(interaction.sent.length, 1)
    assert.deepEqual(interaction.sent[0].allowedMentions.users, [])
    assert.equal(interaction.sent[0].content, undefined)
    assert.equal(interaction.sent[0].embeds[0].description.includes('<@bob>'), i === 0)
    assert.equal('_spookyMentions' in interaction.sent[0], false)
  }
  assert.equal(await f.models.Ledger.count({ where: { resource: 'recipient_mention', userId: 'bob' } }), 1)
})
