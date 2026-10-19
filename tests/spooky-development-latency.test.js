const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PermissionsBitField, PermissionFlagsBits } = require('discord.js')
const { createPermissionSnapshot } = require('../services/spooky/permission-snapshot')
function guildFixture() {
  const client = new EventEmitter(); client.user = { id: 'bot' }
  const counts = { bot: 0, roles: 0 }
  let editable = true
  const guild = { id: 'guild', client, members: { fetchMe: async () => { counts.bot++; return { permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageNicknames]) } } },
    roles: { fetch: async () => { counts.roles++; return new Map([['curse', { id: 'curse', editable }]]) } } }
  return { guild, client, counts, uneditable: () => { editable = false } }
}
test('permission snapshots reuse requests, invalidate on hierarchy changes, and expire', async t => {
  const f = guildFixture(); let now = 0
  const cache = createPermissionSnapshot(f.client, { clock: () => now, maxAgeMs: 60000 }); t.after(cache.close)
  const [first, duplicate] = await Promise.all([cache.get(f.guild), cache.get(f.guild)])
  assert.equal(first.canManageRole('curse'), true); assert.equal(duplicate.cacheHit, false)
  assert.deepEqual(f.counts, { bot: 1, roles: 1 })
  assert.equal((await cache.get(f.guild)).cacheHit, true)
  f.uneditable(); f.client.emit('roleUpdate', { guild: f.guild }, { guild: f.guild })
  assert.equal((await cache.get(f.guild)).canManageRole('curse'), false)
  now = 60001; assert.equal((await cache.get(f.guild)).cacheHit, false)
  assert.deepEqual(f.counts, { bot: 3, roles: 3 })
  f.client.emit('shardDisconnect'); assert.equal((await cache.get(f.guild)).cacheHit, false)
})
test('an update during refresh cannot publish the obsolete permission result', async t => {
  const f = guildFixture(), original = f.guild.roles.fetch; let once = true
  f.guild.roles.fetch = async () => {
    const result = await original()
    if (once) { once = false; f.uneditable(); f.client.emit('roleDelete', { guild: f.guild }) }
    return result
  }
  const cache = createPermissionSnapshot(f.client); t.after(cache.close)
  assert.equal((await cache.get(f.guild)).canManageRole('curse'), false)
  assert.deepEqual(f.counts, { bot: 2, roles: 2 })
})
test('effect snapshots reuse reads and invalidate on direct model changes within a transaction', async t => {
  const Sequelize = require('sequelize')
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => sequelize.close())
  await require('../migrations/20261001000000-create-spooky-core').up(sequelize.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  const event = { ...require('../services/spooky/config').config, enabled: true }, scope = { eventId: event.eventId, guildId: 'guild' }, now = new Date(event.startsAt)
  const player = await models.Participant.create({ ...scope, userId: 'alice', registeredAt: now, refillAnchor: now })
  const effects = require('../services/spooky/effects').createEffects({ models, participants: {}, event, cacheEnabled: true })
  await sequelize.transaction(async transaction => {
    const ctx = { scope, now, transaction }
    const first = await effects.snapshot(ctx)
    assert.equal(await effects.active(ctx, 'alice', 'curse'), null)
    assert.equal(await effects.snapshot(ctx), first)
    await models.Effect.create({ participantId: player.id, effectType: 'curse', expiresAt: new Date(+now + 1000), metadata: {} }, { transaction })
    assert.ok(await effects.active(ctx, 'alice', 'curse'))
    await models.Effect.update({ expiresAt: now }, { where: { participantId: player.id }, transaction })
    assert.equal(await effects.active(ctx, 'alice', 'curse'), null)
    await models.Effect.destroy({ where: { participantId: player.id }, transaction })
    assert.equal((await effects.snapshot(ctx)).stored('alice', 'curse'), null)
  })
})
test('performance rollout respects separate production and development flags', () => {
  const before = process.env.NODE_ENV
  const config = require('../config/spooky/spooky-performance.json'), saved = config.productionEnabled
  try {
    process.env.NODE_ENV = 'production'
    assert.equal(require('../services/spooky/development-performance').enabled(), true)
    config.productionEnabled = false
    assert.equal(require('../services/spooky/development-performance').enabled(), false)
    process.env.NODE_ENV = 'development'
    assert.equal(require('../services/spooky/development-performance').enabled(), true)
    process.env.NODE_ENV = 'test'
    assert.equal(require('../services/spooky/development-performance').enabled(), false)
  } finally { config.productionEnabled = saved; if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before }
})
