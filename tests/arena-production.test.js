const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createAccess } = require('../services/arena/access')
const config = require('../config/arena-testing.json')
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-access-')), file = path.join(directory, 'access.json')
  const replies = [], edits = []
  const gate = createAccess({ config, file, environment: () => 'production', guildId: () => config.productionGuildId })
  let owner = 'current-owner', fetches = 0
  const interaction = { guildId: config.productionGuildId, channelId: config.productionChannelId, user: { id: 'current-owner' },
    guild: { id: config.productionGuildId, ownerId: 'stale-owner', fetch: async () => { fetches++; return { id: config.productionGuildId, ownerId: owner } } },
    reply: async value => replies.push(value), deferReply: async () => {}, editReply: async value => edits.push(value) }
  return { gate, interaction, replies, edits, file, setOwner: id => { owner = id }, fetches: () => fetches }
}

test('production Arena defaults locked, unlock persists and current owner alone can unlock or relock', async () => {
  const f = fixture()
  assert.match(f.gate.restriction(f.interaction), /locked/)
  await f.gate.manage({ ...f.interaction, user: { id: 'admin-with-permissions' } }, 'unlock')
  assert.equal(fs.existsSync(f.file), false); assert.match(f.edits.at(-1).content, /Only the current server owner/)
  await f.gate.manage(f.interaction, 'unlock')
  assert.equal(f.gate.restriction(f.interaction), null); assert.equal(f.fetches(), 2)
  const fresh = createAccess({ config, file: f.file, environment: () => 'production', guildId: () => config.productionGuildId })
  assert.equal(fresh.restriction(f.interaction), null)
  f.setOwner('new-owner')
  await f.gate.manage(f.interaction, 'lock'); assert.equal(f.gate.read().unlocked, true)
  await f.gate.manage({ ...f.interaction, user: { id: 'new-owner' } }, 'lock')
  assert.equal(f.gate.read().unlocked, false); assert.match(f.gate.restriction(f.interaction), /locked/)
  assert.equal(JSON.parse(fs.readFileSync(f.file)).changedBy, 'new-owner')
})

test('wrong channel, thread, DM, guild and malformed state fail closed even after unlocking', async () => {
  const f = fixture(); await f.gate.manage(f.interaction, 'unlock')
  for (const change of [{channelId:'elsewhere'}, {channelId:'thread-in-bot-tests'}, {guildId:null}, {guildId:'another-guild'}]) {
    const interaction = {...f.interaction,...change}
    assert.ok(f.gate.restriction(interaction)); await f.gate.manage(interaction, 'unlock')
    assert.equal(f.fetches(), 1)
  }
  fs.writeFileSync(f.file, '{malformed'); assert.match(f.gate.restriction(f.interaction), /locked/)
  await f.gate.manage({...f.interaction,guild:undefined}, 'unlock')
  assert.match(f.edits.at(-1).content, /Only the current server owner/)
  fs.writeFileSync(f.file, JSON.stringify({guildId:'other',unlocked:true})); assert.match(f.gate.restriction(f.interaction), /locked/)
})

test('real production slash, autocomplete, direct controller and dispatcher buttons cannot bypass the default lock', async t => {
  const before = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  process.env.NODE_ENV = 'production'; process.env.GUILDID = config.productionGuildId
  t.after(() => { for (const [key,value] of [['NODE_ENV',before.env],['GUILDID',before.guild]]) if(value===undefined)delete process.env[key];else process.env[key]=value })
  const liveAccess = require('../services/arena/access').access, isolated = fixture().gate
  const original = { restriction: liveAccess.restriction, authorize: liveAccess.authorize }
  Object.assign(liveAccess, { restriction: isolated.restriction, authorize: isolated.authorize })
  t.after(() => Object.assign(liveAccess, original))
  // Importing the controller in test mode avoids opening persistence merely for the fixture.
  process.env.NODE_ENV = 'test'; const { arena } = require('../services/arena/controller'); process.env.NODE_ENV = 'production'
  const command = require('../commands/Arena/Arena'), dispatcher = require('../events/InteractionCreate'), replies = [], suggestions = []
  const interaction = { guildId:config.productionGuildId, channelId:config.productionChannelId, user:{id:'human'}, options:{getString:()=>null,getFocused:()=>''},
    reply:async value=>replies.push(value), respond:async value=>suggestions.push(value) }
  await command.execute(interaction); await command.autocomplete(interaction); await arena.execute(interaction)
  let routed=0; const handle=arena.handleButton; arena.handleButton=async()=>{routed++};t.after(()=>{arena.handleButton=handle})
  await dispatcher.execute({...interaction,isChatInputCommand:()=>false,isButton:()=>true,customId:'arena:forged:0:start'})
  assert.equal(routed,0); assert.equal(replies.length,3); assert.deepEqual(suggestions,[[]])
  assert.ok(replies.every(value=>value.ephemeral && /locked/.test(value.content)))
})

test('production definition exposes owner access options; Cocoa and Idle remain excluded', () => {
  const { offlineDefinitions } = require('../deploy-commands'), root = path.resolve(__dirname,'..')
  const defs = offlineDefinitions(root,'production'), arena = defs.find(row=>row.name==='arena')
  assert.deepEqual(arena.options.find(row=>row.name==='access').choices.map(row=>row.value),['unlock','lock','status'])
  assert.ok(!defs.some(row=>['cocoa','idle'].includes(row.name)))
})

test('second embed is a matching symbol key and resource counts occupy the native footer', async () => {
  const {newBattle}=require('../services/arena/combat'),{screen}=require('../services/arena/interface')
  const view=screen({id:'key',revision:0,guildId:config.productionGuildId,battle:newBattle()})
  assert.match(view.embeds[0].data.footer.text,/Hope 0\/6 \| Maxim: Fear 0\/6/)
  assert.equal(view.embeds[1].data.title,'Status key')
  assert.match(view.embeds[1].data.image.url,/arena-symbol-key/)
  const {legendSvg,legendFile}=require('../services/arena/legend'),{iconSvg}=require('../services/arena/status-icons')
  const svg=legendSvg(); for(const type of ['brink','exposed','slayer','critical','opportunity'])assert.ok(svg.includes(iconSvg(type,10,12,23))||svg.includes(require('../services/arena/status-icons').colors[type]))
  assert.match(svg,/Brink available/);assert.match(svg,/Grey HP: Brink already used/)
  assert.ok((await legendFile()).attachment.length>0)
})
