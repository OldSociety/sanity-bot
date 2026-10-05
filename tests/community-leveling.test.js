const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { rules, selectConfig, dayKey } = require('../services/community-leveling/config')
const { createCommunity } = require('../services/community-leveling/economy')
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  await require('../migrations/community-leveling').up(db.getQueryInterface())
  const models = require('../services/community-leveling/models').defineModels(db)
  const config = { ...rules, enabled: true, guildId: 'guild', timezone: 'America/Los_Angeles' }
  let roster = [{ userId: 'alice', userName: 'Alice' }, { userId: 'bob', userName: 'Bob' }], fetches = 0
  const create = () => createCommunity({ User, models, config, resolveRecipients: async () => { fetches++; if (roster instanceof Error) throw roster; return roster } })
  const service = create(), base = Date.parse('2026-10-04T16:00:00Z')
  const input = (id, userId = 'chatter', minutes = 0) => ({ guildId: 'guild', messageId: id, userId, now: new Date(base + minutes * 60000) })
  return { db, User, models, config, service, create, input, roster: value => { roster = value }, fetches: () => fetches }
}
test('launch configuration is explicit, disabled in unselected environments and refuses missing roles/channels', () => {
  assert.equal(selectConfig('development').enabled, false)
  assert.equal(selectConfig('production').enabled, false)
  assert.equal(selectConfig(undefined).enabled, false)
  assert.equal(selectConfig('test').enabled, false)
  const source = structuredClone(require('../config/community-leveling.json')); source.environments.development.enabled = true
  source.environments.development.campaignRoleIds = []
  assert.throws(() => selectConfig('development', source), /configured/)
})
test('cooldown spans midnight, user/day cap resets at Pacific midnight and rejected message replays remain rejected', async t => {
  const f = await fixture(t)
  assert.equal((await f.service.earn(f.input('one'))).credited, true)
  const early = f.input('early', 'chatter', 29)
  assert.equal((await f.service.earn(early)).credited, false)
  assert.equal((await f.service.earn(f.input('two', 'chatter', 30))).credited, true)
  assert.equal((await f.service.earn(f.input('three', 'chatter', 60))).credited, true)
  assert.equal((await f.service.earn(f.input('four', 'chatter', 90))).credited, true)
  assert.equal((await f.service.earn(f.input('capped', 'chatter', 120))).credited, false)
  assert.equal((await f.create().earn(early)).replayed, true)
  const before = { ...f.input('late', 'other'), now: new Date('2026-10-05T06:50:00Z') }
  assert.equal((await f.service.earn(before)).credited, true)
  assert.equal((await f.service.earn({ ...before, messageId: 'after', now: new Date('2026-10-05T07:05:00Z') })).credited, false)
  assert.equal((await f.service.earn({ ...before, messageId: 'after-cooldown', now: new Date('2026-10-05T07:20:00Z') })).credited, true)
  assert.equal((await f.service.earn(f.input('new-day', 'chatter', 1440))).credited, true)
  assert.equal(dayKey(new Date('2026-11-01T08:30:00Z'), f.config.timezone), '2026-11-01')
  assert.equal(dayKey(new Date('2026-11-01T09:30:00Z'), f.config.timezone), '2026-11-01')
})
test('simultaneous messages respect 24 server points and durable replay never earns twice', async t => {
  const f = await fixture(t)
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => f.service.earn(f.input(`m${i}`, `u${i}`))))
  assert.equal(results.filter(result => result.credited).length, 24)
  assert.equal((await f.models.Guild.findByPk('guild')).xp, 24)
  const replay = await f.create().earn(f.input('m0', 'u0'))
  assert.equal(replay.replayed, true)
  assert.equal((await f.models.Guild.findByPk('guild')).xp, 24)
  assert.equal(f.fetches(), 0)
})
test('a communal level credits every current campaign player once, caps Fate without touching Bank, and keeps flat XP progression', async t => {
  const f = await fixture(t)
  await f.models.Guild.create({ guildId: 'guild', level: 27, xp: 299 })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', fate_points: 98, bank: 63 })
  await f.User.create({ user_id: 'spectator', user_name: 'Spectator', fate_points: 50, bank: 10 })
  const [first, replay] = await Promise.all([f.service.earn(f.input('level')), f.service.earn(f.input('level'))])
  assert.equal(first.levelUp, true); assert.equal(first.level, 28); assert.equal(first.xp, 0)
  assert.equal(replay.replayed, true); assert.deepEqual(replay.rewards, first.rewards)
  assert.deepEqual(first.rewards.map(row => row.credited), [2, 5])
  assert.equal((await f.User.findByPk('alice')).fate_points, 100); assert.equal((await f.User.findByPk('alice')).bank, 63)
  assert.equal((await f.User.findByPk('bob')).fate_points, 5)
  assert.equal((await f.User.findByPk('spectator')).fate_points, 50)
  assert.equal(await f.User.findByPk('chatter'), null)
  await f.service.earn(f.input('carry', 'different'))
  assert.equal((await f.models.Guild.findByPk('guild')).xp, 1)
  await f.models.Guild.update({ level: 500, xp: 299 }, { where: { guildId: 'guild' } })
  assert.equal((await f.service.earn(f.input('forever', 'third'))).level, 501)
})
test('roster/network or invalid wallet failure rolls back XP and all rewards; retry survives service recreation', async t => {
  const f = await fixture(t); await f.models.Guild.create({ guildId: 'guild', xp: 299 })
  f.roster(new Error('Discord unavailable'))
  await assert.rejects(() => f.service.earn(f.input('retry')), /Discord unavailable/)
  assert.equal((await f.models.Guild.findByPk('guild')).xp, 299); assert.equal(await f.models.Receipt.count(), 0)
  await f.User.create({ user_id: 'bob', user_name: 'Bob', fate_points: -1 })
  f.roster([{ userId: 'alice', userName: 'Alice' }, { userId: 'bob', userName: 'Bob' }])
  await assert.rejects(() => f.service.earn(f.input('retry')), /Invalid Fate/)
  assert.equal(await f.User.findByPk('alice'), null); assert.equal(await f.models.Day.count(), 0)
  await f.User.update({ fate_points: 0 }, { where: { user_id: 'bob' } })
  assert.equal((await f.create().earn(f.input('retry'))).levelUp, true)
  assert.equal((await f.User.findByPk('bob')).fate_points, 5)
})
test('disabled and wrong guild paths create no community state', async t => {
  const f = await fixture(t)
  assert.equal((await f.service.earn({ ...f.input('other'), guildId: 'elsewhere' })).disabled, true)
  f.config.enabled = false
  assert.equal((await f.service.earn(f.input('disabled'))).disabled, true)
  assert.equal(await f.models.Guild.count(), 0)
})

test('actual disk reopen preserves daily counts, saved rewards and replay without recreating tables', async () => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'community-reopen-')), storage = path.join(directory, 'isolated.sqlite')
  let db
  const open = () => {
    db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
    const User = require('../Models/User/User')(db, Sequelize.DataTypes), models = require('../services/community-leveling/models').defineModels(db)
    const config = { enabled: true, guildId: 'guild', timezone: 'America/Los_Angeles' }
    return { User, models, service: createCommunity({ User, models, config, resolveRecipients: async () => [{ userId: 'alice', userName: 'Alice' }] }) }
  }
  try {
    let f = open(); await f.User.sync(); await require('../migrations/community-leveling').up(db.getQueryInterface())
    await f.models.Guild.create({ guildId: 'guild', xp: 299 })
    const input = { guildId: 'guild', userId: 'chatter', messageId: 'saved', now: new Date('2026-10-04T16:00:00Z') }
    await f.service.earn(input); await db.close(); db = null
    f = open()
    const replay = await f.service.earn(input)
    assert.equal(replay.replayed, true); assert.equal((await f.User.findByPk('alice')).fate_points, 5)
    assert.equal((await f.models.Day.findOne()).earned, 1)
    assert.equal((await f.service.earn({ ...input, messageId: 'too-soon', now: new Date('2026-10-04T16:29:00Z') })).credited, false)
  } finally { if (db) await db.close(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('new launch purchase policy is selected only for the explicitly activated environment', () => {
  const data = require('../config/community-leveling.json'), saved = structuredClone(data.environments.development)
  const event = require('../config/spooky-2026.json'), { selectEvent } = require('../services/spooky/config')
  try {
    Object.assign(data.environments.development, { enabled: true, guildId: 'guild', campaignRoleIds: ['campaign'], channelIds: ['shared'] })
    assert.equal(selectEvent(event, 'development').fate.paymentResource, 'sanity')
    assert.equal(selectEvent(event, 'production').fate.paymentResource, 'bank-then-fate')
  } finally { data.environments.development = saved }
})
