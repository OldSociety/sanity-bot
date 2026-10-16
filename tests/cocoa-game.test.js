const test = require('node:test')
const assert = require('node:assert/strict')
const { newCup, advance, screen, rewardTier, createCocoaCommand } = require('../services/cocoa-game')
const command = createCocoaCommand

function fixture() {
  const handlers = {}, replies = [], edits = [], options = [], followUps = []
  const collector = { on: (name, handler) => { handlers[name] = handler }, stop: reason => { handlers.end([], reason) } }
  const interaction = { id: 'session', user: { id: 'alice' },
    reply: async payload => { replies.push(payload); return { createMessageComponentCollector: settings => { options.push(settings); return collector } } },
    editReply: async payload => { edits.push(payload) },
    followUp: async payload => { followUps.push(payload) } }
  const click = (action, revision = 0, userId = 'alice') => ({ customId: `cocoa:session:${revision}:${action}`, user: { id: userId },
    deferUpdate: async () => {}, reply: async payload => replies.push(payload) })
  return { interaction, collector, handlers, replies, edits, options, followUps, click }
}

test('cup supports serving, exact fullness, spilling and a fresh replay without reward fields', () => {
  let cup = newCup()
  assert.equal(advance(cup, 'serve'), cup)
  for (const scoop of [6, 6, 6, 3]) cup = advance(cup, 'add', scoop)
  assert.equal(cup.status, 'perfect'); assert.equal(cup.fullness, 21)
  assert.equal(advance(cup, 'add', 1), cup)
  assert.deepEqual(advance(cup, 'again'), newCup())
  cup = advance({ ...newCup(), fullness: 20 }, 'add', 6)
  assert.equal(cup.status, 'spilled'); assert.equal(cup.fullness, 26)
  assert.equal(advance(advance(newCup(), 'add', 2), 'serve').status, 'served')
  assert.throws(() => advance(newCup(), 'add', 0), /1 to 8/)
  assert.throws(() => advance(newCup(), 'add', 9), /1 to 8/)
  assert.equal(advance(newCup(), 'add', 8).fullness, 8)
  assert.deepEqual(Object.keys(cup).sort(), ['fullness', 'lastScoop', 'scoops', 'status'])
})

test('private reply collector isolates players and stale buttons cannot pour again', async () => {
  const f = fixture(); let rolls = 0
  await command({ roll: () => { rolls++; return 6 } })(f.interaction)
  assert.equal(f.replies[0].ephemeral, true)
  assert.equal(f.options[0].idle, 60000)
  await f.handlers.collect(f.click('add', 0, 'bob')); assert.equal(rolls, 0)
  await f.handlers.collect(f.click('add')); assert.equal(rolls, 1)
  await f.handlers.collect(f.click('add')); assert.equal(rolls, 1)
  assert.match(f.edits[0].embeds[0].data.description, /6 \/ 21/)
  await f.handlers.collect(f.click('serve', 1))
  assert.equal(f.edits.at(-1).components[0].components[0].data.label, 'Play Again')
  await f.handlers.collect(f.click('again', 2))
  assert.match(f.edits.at(-1).embeds[0].data.description, /0 \/ 21/)
})

test('rapid concurrent clicks commit only one scoop', async () => {
  const f = fixture(); let release, rolls = 0
  await command({ roll: () => { rolls++; return 2 } })(f.interaction)
  const first = f.click('add')
  first.deferUpdate = () => new Promise(resolve => { release = resolve })
  const pending = f.handlers.collect(first)
  await f.handlers.collect(f.click('add'))
  release(); await pending
  assert.equal(rolls, 1); assert.equal(f.edits.length, 1)
})

test('timeout and quit remove controls; timeout during a pour leaves the final screen closed', async () => {
  const f = fixture()
  await command({ roll: () => 2 })(f.interaction)
  const first = f.click('add'); let release
  first.deferUpdate = () => new Promise(resolve => { release = resolve })
  const pending = f.handlers.collect(first)
  await f.handlers.end([], 'idle')
  release(); await pending
  assert.equal(f.edits.at(-1).components.length, 0)
  assert.match(f.edits.at(-1).embeds[0].data.title, /Gone Cold/)
  const q = fixture(); await command()(q.interaction)
  await q.handlers.collect(q.click('quit'))
  assert.equal(q.edits.at(-1).components.length, 0)
})

test('failed game update closes the session instead of accepting additional pours', async () => {
  const f = fixture(); let rolls = 0, calls = 0
  f.interaction.editReply = async payload => { if (++calls === 1) throw Error('network'); f.edits.push(payload) }
  await command({ roll: () => { rolls++; return 2 }, logger: { error() {} } })(f.interaction)
  await f.handlers.collect(f.click('add'))
  await f.handlers.collect(f.click('add', 1))
  assert.equal(rolls, 1)
  assert.equal(f.edits.at(-1).components.length, 0)
})

test('cocoa is absent from production registration and rejects direct production or wrong-guild calls', async t => {
  const command = require('../commands/Holiday/Cocoa')
  const { commandEnabled } = require('../services/command-environment')
  assert.equal(commandEnabled(command, 'production'), false)
  assert.equal(commandEnabled(command, 'development'), true)
  const previous = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => { for (const [key, value] of [['NODE_ENV', previous.env], ['GUILDID', previous.guild]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  const replies = []
  process.env.GUILDID = 'dev'
  process.env.NODE_ENV = 'production'
  await command.execute({ guildId: 'dev', reply: async payload => replies.push(payload) })
  process.env.NODE_ENV = 'development'
  await command.execute({ guildId: 'other', reply: async payload => replies.push(payload) })
  assert.equal(replies.length, 2)
  assert.ok(replies.every(payload => payload.ephemeral && /development server/.test(payload.content)))
})

test('empty cup disables Serve and Collect; finished cup offers replay and Collect', () => {
  assert.equal(screen(newCup(), 'test', 0).components[0].components[1].data.disabled, true)
  assert.equal(screen(newCup(), 'test', 0).components[0].components[2].data.disabled, true)
  assert.deepEqual(screen({ ...newCup(), status: 'spilled' }, 'test', 1).components[0].components.map(button => button.data.label), ['Play Again', 'Collect'])
})

test('a completed pour immediately permits the next current-revision action without a delay', async () => {
  const f = fixture(); let rolls = 0
  await command({ roll: () => { rolls++; return 8 } })(f.interaction)
  await f.handlers.collect(f.click('add'))
  assert.equal(f.edits.length, 1)
  assert.ok(f.edits.at(-1).components[0].components.filter(button => button.data.label !== 'Collect').every(button => !button.data.disabled))
  await f.handlers.collect(f.click('add', 1))
  assert.equal(rolls, 2)
  assert.match(f.edits.at(-1).embeds[0].data.description, /16 \/ 21/)
})

test('expiry during a result update removes controls after processing completes', async () => {
  const f = fixture(); let release, reachedUpdate, calls = 0
  const updating = new Promise(resolve => { reachedUpdate = resolve })
  f.interaction.editReply = async payload => {
    if (++calls === 1) { reachedUpdate(); await new Promise(resolve => { release = resolve }) }
    f.edits.push(payload)
  }
  await command({ roll: () => 2 })(f.interaction)
  const pending = f.handlers.collect(f.click('add'))
  await updating
  await f.handlers.end([], 'idle')
  release(); await pending
  assert.equal(f.edits.at(-1).components.length, 0)
  assert.match(f.edits.at(-1).embeds[0].data.title, /Gone Cold/)
})

test('inactive finished cups retain their result but lose replay; late clicks cannot restart them', async () => {
  for (const outcome of ['served', 'perfect', 'spilled']) {
    const f = fixture(); let rolls = 0
    const scoops = outcome === 'perfect' ? [8, 8, 5] : outcome === 'spilled' ? [8, 8, 8] : [8]
    await command({ roll: () => { rolls++; return scoops[rolls - 1] } })(f.interaction)
    for (let revision = 0; revision < scoops.length; revision++) await f.handlers.collect(f.click('add', revision))
    if (outcome === 'served') await f.handlers.collect(f.click('serve', 1))
    const before = f.edits.at(-1).embeds[0].data
    assert.equal(f.edits.at(-1).components[0].components[0].data.label, 'Play Again')
    await f.handlers.end([], 'idle')
    assert.equal(f.edits.at(-1).components.length, 0)
    assert.equal(f.edits.at(-1).embeds[0].data.title, before.title)
    assert.equal(f.edits.at(-1).embeds[0].data.description, before.description)
    assert.match(f.edits.at(-1).embeds[0].data.footer.text, /Session ended/)
    const edits = f.edits.length
    await f.handlers.collect(f.click('again', outcome === 'served' ? 2 : 3))
    assert.equal(f.edits.length, edits)
    assert.equal(rolls, scoops.length)
  }
})

test('preview tiers change exactly at 16 and 19 and spilling earns no tier', () => {
  for (const [fullness, tier] of [[0, 'None'], [1, 'Standard'], [15, 'Standard'], [16, 'Generous'], [18, 'Generous'], [19, 'Exceptional'], [20, 'Exceptional'], [21, 'Exceptional']]) {
    assert.equal(rewardTier({ ...newCup(), fullness }), tier)
  }
  assert.equal(rewardTier({ ...newCup(), fullness: 22, status: 'spilled' }), 'None')
})

async function step(f, action) {
  const current = f.edits.at(-1) || f.replies[0]
  const button = current.components[0].components.find(button => button.data.custom_id.endsWith(`:${action}`))
  assert.ok(button, `Missing ${action} button`)
  await f.handlers.collect({ ...f.click(action), customId: button.data.custom_id })
}

test('five consecutive cups produce one public recap with correct counts and percentages on Collect', async () => {
  const f = fixture(), scoops = [8, 8, 8, 5, 8, 8, 8, 7, 8, 8, 8]
  await command({ roll: () => scoops.shift() })(f.interaction)
  for (const action of ['add', 'serve', 'again', 'add', 'add', 'add', 'again', 'add', 'add', 'add', 'again', 'add', 'serve', 'again', 'add', 'add', 'add']) await step(f, action)
  assert.equal(f.followUps.length, 0)
  const collectId = f.edits.at(-1).components[0].components[1].data.custom_id
  await step(f, 'collect')
  assert.equal(f.followUps.length, 1)
  const summary = f.followUps[0]
  assert.equal(summary.ephemeral, false)
  assert.deepEqual(summary.allowedMentions, { parse: [] })
  assert.match(summary.embeds[0].data.description, /5\*\* cups/)
  assert.deepEqual(summary.embeds[0].data.fields.map(field => field.value), ['3', '0', '1 (20%)', '2 (40%)'])
  assert.equal(f.edits.at(-1).components.length, 0)
  await f.handlers.collect({ ...f.click('collect'), customId: collectId })
  await f.handlers.end([], 'idle')
  assert.equal(f.followUps.length, 1)
})

test('rules appear only before the first pour and the session pot survives replay', async () => {
  const f = fixture()
  await command({ roll: () => 8 })(f.interaction)
  const hasRules = payload => payload.embeds[0].data.fields.some(field => field.name === 'How to play')
  assert.equal(hasRules(f.replies[0]), true)
  await step(f, 'add'); assert.equal(hasRules(f.edits.at(-1)), false)
  await step(f, 'serve'); await step(f, 'again')
  assert.equal(hasRules(f.edits.at(-1)), false)
  assert.match(f.edits.at(-1).embeds[0].data.fields.find(field => field.name === 'Session pot').value, /0 Candy Canes.*1 cups completed/)
})

test('inactivity posts completed cups once, excluding an unfinished next cup', async () => {
  const f = fixture()
  await command({ roll: () => 8 })(f.interaction)
  await step(f, 'add'); await step(f, 'serve'); await step(f, 'again'); await step(f, 'add')
  await f.handlers.end([], 'idle')
  assert.equal(f.followUps.length, 1)
  assert.deepEqual(f.followUps[0].embeds[0].data.fields.map(field => field.value), ['1', '0', '0 (0%)', '0 (0%)'])
  assert.match(f.followUps[0].embeds[0].data.description, /1\*\* cup\./)
  assert.equal(f.edits.at(-1).components.length, 0)
  await f.handlers.end([], 'time'); assert.equal(f.followUps.length, 1)
})

test('Quit publishes prior completed cups while empty or abandoned sessions produce no public message', async () => {
  const f = fixture()
  await command({ roll: () => 8 })(f.interaction)
  await step(f, 'add'); await step(f, 'serve'); await step(f, 'again'); await step(f, 'quit')
  assert.equal(f.followUps.length, 1)
  for (const finish of ['quit', 'idle']) {
    const empty = fixture(); await command({ roll: () => 8 })(empty.interaction)
    await step(empty, 'add')
    if (finish === 'quit') await step(empty, 'quit'); else await empty.handlers.end([], finish)
    assert.equal(empty.followUps.length, 0)
  }
})

test('a public send failure is not automatically retried by late clicks or timeout', async () => {
  const f = fixture(); let sends = 0
  f.interaction.followUp = async () => { sends++; throw Error('uncertain delivery') }
  await command({ roll: () => 8, logger: { error() {} } })(f.interaction)
  await step(f, 'add'); await step(f, 'serve'); await step(f, 'collect')
  await f.handlers.end([], 'idle')
  assert.equal(sends, 1)
  assert.equal(f.edits.at(-1).components.length, 0)
})
