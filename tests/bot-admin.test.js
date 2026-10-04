const test = require('node:test')
const assert = require('node:assert/strict')
const { isBotAdmin, requireBotAdmin } = require('../utils/botAdmin')
const owner = '123456789012345678', guild = '987654321098765432'
test('owner guard rejects moderators/administrators/bots/foreign guild and missing configuration', async t => {
  const old = { BOTADMINID: process.env.BOTADMINID, GUILDID: process.env.GUILDID }
  Object.assign(process.env, { BOTADMINID: owner, GUILDID: guild })
  t.after(() => { for (const [key,value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  const replies = [], interaction = { guildId: guild, user: { id: owner }, member: { permissions: { has: () => true }, roles: { cache: new Map([['admin',{}]]) } }, reply: async payload => replies.push(payload) }
  assert.equal(isBotAdmin(interaction), true)
  for (const overrides of [{ user: { id: 'moderator' } }, { guildId: 'other' }, { user: { id: owner, bot: true } }]) {
    assert.equal(await requireBotAdmin({ ...interaction, ...overrides }), false)
    assert.equal(replies.at(-1).ephemeral, true)
  }
  delete process.env.BOTADMINID; assert.equal(isBotAdmin(interaction), false)
  assert.equal(isBotAdmin(interaction, { BOTADMINID: 'role', GUILDID: guild }), false)
})
test('stale Fate confirmation clicks are acknowledged without loading database models', async () => {
  const payloads = []
  await require('../events/interactionCreate').execute({ isChatInputCommand: () => false, isButton: () => true,
    customId: 'spooky-spend-fate:old:confirm', reply: async payload => payloads.push(payload) })
  assert.equal(payloads[0].ephemeral, true)
  assert.match(payloads[0].content, /expired/)
  assert.equal(require.cache[require.resolve('../Models/model')], undefined)
})

test('legacy shop, Fate management and achievement writes deny other admins before touching storage', async t => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
  const saved = Object.fromEntries(['BOTADMINID','GUILDID','BOTTESTCHANNELID','UNWANTEDROLEID','ADMINROLEID'].map(key => [key,process.env[key]]))
  Object.assign(process.env, { BOTADMINID: owner, GUILDID: guild, BOTTESTCHANNELID: 'test', UNWANTEDROLEID: 'unwanted', ADMINROLEID: 'admin' })
  t.after(() => { for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  let databaseCalls = 0
  const forbidden = new Proxy({}, { get: () => () => { databaseCalls++; throw Error('Forbidden storage access') } })
  for (const [file, actions] of [['Shop/Shop.js',['add-item','remove-item','restock']], ['Fatepoints/Fate.js',['manage']], ['Achievements/Achievements.js',['create','delete','award','remove','upload']]]) {
    const filename = path.resolve(__dirname,'../commands',file), module = { exports: {} }
    const loader = name => name.includes('Models/model') ? { User: forbidden, Inventory: forbidden, Achievement: forbidden, UserAchievement: forbidden } : name === 'discord.js' || name === 'sequelize' ? require(name) : require(path.resolve(path.dirname(filename),name))
    new vm.Script(fs.readFileSync(filename,'utf8'), { filename }).runInNewContext({ module, require: loader, process, console: { log() {}, error() {} } })
    for (const action of actions) {
      const replies = []
      await module.exports.execute({ guildId: guild, channel: { id: 'test' }, user: { id: 'moderator', username: 'Mod' },
        member: { permissions: { has: () => true }, roles: { cache: new Map([['admin',{}],['unwanted',{}]]) } },
        options: { getSubcommand: () => action }, reply: async payload => replies.push(payload) })
      assert.equal(replies.length, 1); assert.equal(replies[0].ephemeral, true)
    }
  }
  assert.equal(databaseCalls, 0)
})
