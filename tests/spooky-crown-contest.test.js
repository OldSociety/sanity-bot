const test = require('node:test'), assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
const { createEconomy } = require('../services/spooky/economy')
const { createCrown } = require('../services/spooky/crown')
const { createDelivery } = require('../services/spooky/delivery')
const { selectAction } = require('../services/spooky/actions')

test('live Crown scan uses fresh REST pages without gateway member requests', async () => {
  const requests = [], member = (id, crowned = false) => ({ id, roles: { cache: new Map(crowned ? [['sweet', {}]] : []) } })
  const first = new Map(Array.from({ length: 1000 }, (_, index) => {
    const id = String(index + 1); return [id, member(id, index === 3)]
  }))
  const guild = { members: {
    fetch: () => { throw new Error('Gateway request must not happen') },
    list: async options => {
      requests.push(options)
      return options.after ? new Map([['1001', member('1001', true)]]) : first
    },
  } }
  const adapter = require('../services/spooky/discord-adapter').createDiscordAdapter(async () => guild)
  assert.deepEqual(await adapter.getRoleHolders('guild', 'sweet'), ['4', '1001'])
  assert.deepEqual(requests, [{ limit: 1000, after: undefined, cache: false }, { limit: 1000, after: '1000', cache: false }])
  guild.members.list = async () => { throw new Error('REST unavailable') }
  await assert.rejects(adapter.getRoleHolders('guild', 'sweet'), /REST unavailable/)
})

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await require('../migrations/20261001000000-create-spooky-core').up(sequelize.getQueryInterface())
  await require('../migrations/20261001000001-create-spooky-delivery').up(sequelize.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  const economy = createEconomy({ sequelize, models, configVersion: config.version, clock: () => new Date(config.startsAt) })
  const roles = new Map([['alice', []], ['bob', []], ['carol', []]])
  let failRemoval = false
  const adapter = {
    getMember: async (_guild, id) => ({ roleIds: roles.get(id), nickname: null }),
    getRoleHolders: async (_guild, role) => [...roles].filter(([, values]) => values.includes(role)).map(([id]) => id),
    setRole: async (_guild, id, role, present, guard) => {
      if (guard && !await guard.isCurrent()) return false
      if (!present && failRemoval) throw new Error('removal permission unavailable')
      roles.set(id, roles.get(id).filter(value => value !== role)); if (present) roles.get(id).push(role)
    },
  }
  const delivery = createDelivery({ models, adapter, read: economy.read })
  const crown = createCrown({ models, delivery, roleId: 'sweet' })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const run = (key, callback) => economy.execute({ ...scope, actorId: 'system', interactionId: key, operationType: 'crown_test' }, callback)
  return { models, economy, roles, adapter, delivery, crown, scope, run, fail: value => { failRemoval = value } }
}

test('Crown finding/theft are mutually exclusive and each has the same 1% base interval', () => {
  const crownIndex = config.trickOutcomes.findIndex(item => item.id === 'steal_crown')
  const crownRoll = (config.trickOutcomes.slice(0, crownIndex).reduce((sum, item) => sum + item.percent, 0) + .5) / 100
  assert.equal(selectAction({ action: 'treat', actorId: 'alice', random: () => .205 }).outcome, 'sweet_tooth')
  assert.equal(selectAction({ action: 'treat', actorId: 'alice', crownHolderId: 'bob', random: () => .205 }).outcome, 'standard_gift')
  assert.equal(selectAction({ action: 'trick', actorId: 'alice', crownHolderId: 'bob', random: () => crownRoll }).outcome, 'steal_crown')
  assert.equal(selectAction({ action: 'trick', actorId: 'bob', crownHolderId: 'bob', random: () => crownRoll }).outcome, 'steal_candy')
  assert.equal(selectAction({ action: 'trick', actorId: 'alice', random: () => crownRoll }).outcome, 'steal_candy')
})

test('failed old-holder removal never adds a second Crown; reconstruction retries safely', async t => {
  const f = await fixture(t)
  await f.run('initial', async ctx => { await f.crown.capture(ctx, 'alice', null); return {} }); await f.delivery.reconcile(f.scope)
  f.fail(true)
  await f.run('transfer', async ctx => { await f.crown.capture(ctx, 'bob', await f.crown.state(ctx)); return {} })
  await f.delivery.reconcile(f.scope)
  assert.deepEqual(await f.adapter.getRoleHolders('guild', 'sweet'), ['alice'])
  assert.equal((await f.models.Delivery.findOne({ where: { userId: 'bob' } })).status, 'pending')
  f.fail(false)
  await createDelivery({ models: f.models, adapter: f.adapter, read: f.economy.read }).reconcile(f.scope)
  assert.deepEqual(await f.adapter.getRoleHolders('guild', 'sweet'), ['bob'])
  assert.equal(await f.models.Delivery.count({ where: { status: 'pending' } }), 0)
  const replay = await f.run('transfer', () => { throw new Error('cannot transfer twice') })
  assert.equal(replay.replayed, true)
})

test('legacy multiple holders keep the most recently awarded wearer without new rewards', async t => {
  const f = await fixture(t)
  f.roles.get('alice').push('sweet'); f.roles.get('bob').push('sweet')
  await f.run('old-awards', async ctx => {
    for (const userId of ['alice', 'bob']) await ctx.record({ userId, resource: 'crown_award', delta: 1 })
    return {}
  })
  const result = await f.run('bootstrap', ctx => f.crown.bootstrap(ctx, ['alice', 'bob']))
  assert.equal(result.receipt.holderId, 'bob')
  await f.delivery.reconcile(f.scope)
  assert.deepEqual(await f.adapter.getRoleHolders('guild', 'sweet'), ['bob'])
  assert.equal(await f.models.Ledger.count({ where: { resource: 'crown_award' } }), 2)
  assert.equal((await f.run('again', ctx => f.crown.bootstrap(ctx, ['alice']))).receipt.initialized, false)
})

test('superseded grants cannot reclaim the Crown; release is holder-scoped', async t => {
  const f = await fixture(t)
  await f.run('a', async ctx => { await f.crown.capture(ctx, 'alice', null); return {} })
  await f.run('b', async ctx => { await f.crown.capture(ctx, 'bob', 'alice'); return {} })
  await f.run('c', async ctx => { await f.crown.capture(ctx, 'carol', 'bob'); return {} })
  await f.delivery.reconcile(f.scope)
  assert.deepEqual(await f.adapter.getRoleHolders('guild', 'sweet'), ['carol'])
  await assert.rejects(f.run('stale-capture', ctx => f.crown.capture(ctx, 'alice', 'bob')), /changed hands/)
  await f.run('release-other', async ctx => { await f.crown.release(ctx, 'bob'); return {} })
  assert.equal((await f.run('state', async ctx => ({ holder: await f.crown.state(ctx) }))).receipt.holder, 'carol')
  await f.run('release-holder', async ctx => { await f.crown.release(ctx, 'carol'); return {} })
  assert.equal((await f.run('after-release', async ctx => ({ holder: await f.crown.state(ctx) }))).receipt.holder, null)
})
