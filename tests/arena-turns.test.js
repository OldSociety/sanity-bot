const test = require('node:test')
const assert = require('node:assert/strict')
const { newBattle, advance, beginFinisher, takeTurn } = require('../services/arena/combat')
const { createArena } = require('../services/arena/controller')
const { screen } = require('../services/arena/interface')
const { canUse } = require('../services/arena/rules')
const { resolveCharacter } = require('../services/arena/characters')
const emojis = require('../config/arena/arena-emojis.json')
const forbidden = () => { throw Error('Unexpected roll') }
function step(battle, actor, action = {}, dice = [7, 5], accuracy = 0) {
  let i = 0
  return advance(battle, action, () => 1, actor === 'player' ? () => dice[i++] : forbidden,
    () => 99.999, () => accuracy, () => 99, () => 99.999, { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45, actor })
}
const text = view => JSON.stringify(view.embeds.map(embed => embed.data))
const controls = view => view.components.flatMap(row => row.components).map(item => item.data)
const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture(options = {}) {
  let serial = 0, view, acknowledgements = 0, clock = 0, battle
  const timers = new Map(), edits = [], errors = [], reports = []
  const set = (callback, ms) => { const id = ++serial; timers.set(id, { callback, ms }); return id }
  const arena = createArena({ chooseOpponent: () => 'maxim', rollRecovery: () => 99.999, setTimer: set, clearTimer: id => timers.delete(id),
    setExpiryTimer: () => null, clearExpiryTimer() {}, now: () => clock,
    rollDuality: () => 6, rollAccuracy: () => 0, rollCritical: () => 99,
    rollFearSpend: () => 99.999, rollEffect: () => 99.999, roll: () => 1,
    renderCard: async session => { battle = structuredClone(session.battle); return require('../services/arena/health-card').renderHealthCard(session) },
    logger: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) },
    onComplete: report => reports.push(report), ...options })
  const interaction = { id: 'turns', guildId: emojis.guildId, channelId: 'c', user: { id: 'u' },
    reply: async payload => { view = payload; return { id: 'm' } },
    editReply: async payload => { view = payload; edits.push(payload); return { id: 'm' } } }
  const revision = () => Number(controls(view)[0].custom_id.split(':')[2])
  const click = (action, rev = revision(), extra = {}) => arena.handleButton({ ...interaction,
    customId: `arena:turns:${rev}:${action}`, message: { id: 'm' },
    deferUpdate: async () => { acknowledgements++ }, ...extra })
  const tick = async () => {
    await click('basic')
  }
  const open = async () => { await arena.execute(interaction, resolveCharacter('Maxim')); await click('start') }
  return { arena, interaction, click, tick, open, timers, edits, errors, reports, revision,
    view: () => view, battle: () => battle, acknowledgements: () => acknowledgements }
}

test('all 144 rolls leave the enemy basic on its own following turn, independent of success or Hope/Fear', () => {
  for (let hope = 1; hope <= 12; hope++) for (let fear = 1; fear <= 12; fear++) {
    const seed = newBattle()
    const player = step(seed, 'player', {}, [hope, fear])
    assert.equal(player.player.hp, seed.player.hp)
    assert.equal(player.enemyOutcome, null)
    assert.equal(player.nextActor, 'enemy')
    const enemy = step(player, 'enemy')
    const expectedDamage = player.duality.success ? 7 : 11 // Maxim's miss passive remains active.
    assert.equal(enemy.enemyDamage, expectedDamage)
    assert.equal(enemy.player.hp, seed.player.hp - expectedDamage)
    assert.equal(enemy.player.hope, player.player.hope)
    assert.equal(enemy.enemy.fear, player.enemy.fear)
    assert.deepEqual(enemy.duality, player.duality)
    assert.equal(enemy.statistics.player.attempts.basic, 1)
    assert.equal(enemy.statistics.enemy.attempts.basic, 1)
    assert.equal(enemy.nextActor, 'player')
  }
})

test('immediate abilities spend once without basics, extra dice, recharge, or changing the next actor', () => {
  const seed = newBattle(3, { character: resolveCharacter('Maxim') })
  seed.nextActor = 'enemy'; seed.player.criticalReady = true
  const focus = step(seed, 'ability', { special1: true })
  assert.equal(focus.special1Damage, 22)
  assert.equal(focus.player.stress, 4)
  assert.equal(focus.player.focusHits, 0)
  assert.equal(focus.player.criticalReady, true)
  assert.equal(focus.playerBasicDamage, 0)
  assert.equal(focus.enemyDamage, 0)
  assert.equal(focus.nextActor, 'enemy')
  assert.equal(step(focus, 'ability', { special1: true }), focus)
  const buff = step(focus, 'ability', { special2: true })
  assert.equal(buff.player.hope, 0); assert.equal(buff.player.slayerCharges, 3)
  assert.equal(buff.player.focusHits, 0)
  const enemy = step(buff, 'enemy')
  assert.equal(enemy.player.slayerCharges, 3)
  const player = step(enemy, 'player')
  assert.equal(player.player.slayerCharges, 2)
  assert.equal(player.player.focusHits, 1)
})

test('six Hope required for player Finishers; prepaid resolution has no extra roll or resource recovery', () => {
  const five = newBattle(5)
  assert.equal(canUse(five.player, 'special3'), false)
  assert.equal(beginFinisher(five), five)
  for (let choice = 0; choice <= 5; choice++) {
    const seed = newBattle(6)
    const paid = beginFinisher(seed)
    assert.equal(paid.player.hope, 0)
    assert.equal(beginFinisher(paid), paid)
    const done = step(paid, 'ability', { special3: true, choice })
    assert.equal(done.special3Damage, Math.ceil(200 * (30 + 5 * choice) / 100))
    assert.equal(done.statistics.player.spent, 6)
    assert.equal(done.player.hope, 0)
    assert.equal(done.playerBasicDamage, 0)
    assert.equal(done.enemyDamage, 0)
  }
})

test('active view shows exactly two recent moves and animated thumbnail matching the latest player roll', () => {
  let battle = newBattle()
  for (const dice of [[7, 5], [6, 8], [2, 2]]) {
    battle = step(battle, 'player', {}, dice)
    battle = step(battle, 'enemy')
    const view = screen({ id: 's', revision: 1, guildId: emojis.guildId, battle })
    const expected = dice[0] >= dice[1] ? emojis.hope : emojis.fear
    assert.equal(view.embeds[0].data.thumbnail.url, `https://cdn.discordapp.com/emojis/${expected.id}.gif`)
    const log = view.embeds[0].data.fields.find(field => field.name === 'Latest moves')
    assert.equal(log.value.split('\n').length, 2)
    assert.equal(battle.actions.length, 2)
  }
  assert.equal(battle.history.filter(event => event.kind === 'roll').length, 3)
  assert.equal(battle.history.filter(event => event.kind === 'hit').length, 6)
})

test('selection renders configured passive without ReferenceError and busy disables every control', () => {
  for (const page of ['characters', 'skins']) {
    const view = screen({ id: 's', revision: 0, page, busy: true, character: resolveCharacter('Maxim') })
    assert.ok(controls(view).every(control => control.disabled))
    if (page === 'skins') assert.match(text(view), /Not Good Enough/)
    else assert.doesNotMatch(text(view), /Not Good Enough|HP|Attack/)
  }
  assert.ok(controls(screen({ id: 's', revision: 0, battle: newBattle(6), busy: true })).every(control => control.disabled))
})

test('slow Basic Attack edit locks buttons, acknowledges a burst, and adds no work or overlapping edits', async () => {
  let enemyResponses = 0
  const f = fixture({ rollAccuracy: () => { enemyResponses++; return 0 } }); await f.open()
  let release
  f.interaction.editReply = async payload => { f.edits.push(payload); await new Promise(resolve => { release = resolve }) }
  const pending = f.tick(); await flush()
  const count = f.edits.length
  assert.ok(controls(f.edits.at(-1)).every(control => control.disabled))
  const before = f.acknowledgements()
  await Promise.all(Array.from({ length: 100 }, () => f.click('special1')))
  assert.equal(f.acknowledgements() - before, 100)
  assert.equal(f.edits.length, count)
  assert.equal(f.timers.size, 0)
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await pending
  assert.equal(f.edits.length, count + 1)
  assert.equal(enemyResponses, 1)
  assert.equal(f.timers.size, 0)
  assert.deepEqual(f.errors, [])
  await f.arena.dispose()
})

test('special and enemy response resolve immediately without scheduling attacks; duplicate clicks spend once', async () => {
  const f = fixture(); await f.open()
  const timer = [...f.timers.keys()][0], revision = f.revision()
  await Promise.all([f.click('special1', revision), f.click('special1', revision)])
  assert.equal(f.battle().player.stress, 4)
  assert.match(text(f.view()), /Deadly Focus/)
  assert.ok(controls(f.view()).some(control => /0\/3 hits/.test(control.label)))
  assert.equal([...f.timers.keys()][0], timer)
  assert.equal(f.edits.filter(view => /22/.test(text(view))).length > 0, true)
  assert.doesNotMatch(text(f.view()), /queued/)
  await f.arena.dispose()
})

test('failed acknowledgements mutate nothing, and basic turns continue afterwards', async () => {
  const f = fixture(); await f.open()
  const before = text(f.view())
  await f.click('special1', f.revision(), { deferUpdate: async () => { throw Error('Unknown interaction') } })
  assert.equal(text(f.view()), before)
  await f.tick(); await f.tick()
  assert.doesNotMatch(text(f.view()), /You act first/)
  assert.match(f.view().embeds[0].data.title, /· 2$/)
  assert.equal(f.errors.length, 1)
  await f.arena.dispose()
})

test('Basic Attack during a pending failed acknowledgement is dropped, with no background work', async () => {
  const f = fixture(); await f.open()
  let reject
  const pending = f.click('special1', f.revision(), {
    deferUpdate: () => new Promise((resolve, fail) => { reject = fail }),
  })
  await f.tick() // Busy: discard another move rather than stacking work.
  assert.equal(f.timers.size, 0)
  reject(Error('Unknown interaction')); await pending
  assert.equal(f.timers.size, 0)
  await f.tick()
  assert.equal(f.battle().player.stress, 6)
  await f.arena.dispose()
})

test('finished manual fight attaches the complete ordered recap and reports once', async () => {
  const f = fixture({ rollDuality: () => 1 }); await f.open()
  await f.click('quit')
  const recap = f.edits.at(-1).files.find(file => file.name.endsWith('.txt'))
  assert.ok(recap); assert.equal(recap.attachment.toString(), 'No actions recorded.')
  await f.click('start')
  for (let i = 0; i < 300 && !f.reports.length; i++) await f.tick()
  assert.equal(f.reports.length, 1)
  assert.ok(f.edits.at(-1).files.find(file => file.name.endsWith('.txt')).attachment.toString().includes('Critical success'))
  await f.arena.dispose(); assert.equal(f.reports.length, 1)
})

test('JRPG Basic Attack resolves all 144 rolls player first, followed by exactly one enemy response', () => {
  for (let hope = 1; hope <= 12; hope++) for (let fear = 1; fear <= 12; fear++) {
    const seed = newBattle(); let i = 0
    const next = takeTurn(seed, 'basic', forbidden, () => [hope, fear][i++], () => 99.999,
      () => 0, () => 99, () => 99.999, { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
    assert.equal(next.tick, 1)
    assert.equal(next.statistics.player.attempts.basic, 1)
    assert.equal(next.statistics.enemy.attempts.basic, 1)
    assert.equal(next.history[1].actor, 'Marq')
    assert.equal(next.history[2].actor, 'Maxim')
    assert.ok(next.history.every(event => event.tick === 1))
    assert.equal(next.nextActor, 'player')
    assert.equal(next.playerBasicDamage, next.statistics.player.damage.basic)
    assert.equal(next.enemyDamage, next.statistics.enemy.damage.basic)
  }
})

test('lethal player moves prevent the entire enemy response; survival passive still allows a response', () => {
  for (const action of ['basic', 'special1']) {
    const seed = newBattle(); seed.enemy.hp = 1
    const next = takeTurn(seed, action, forbidden, () => 6, forbidden, forbidden, forbidden, () => 99.999)
    assert.equal(next.status, 'victory')
    assert.equal(next.player.hp, seed.player.hp)
    assert.equal(next.statistics.enemy.attempts.basic, 0)
  }
  const seed = newBattle(0, { opponent: 'marq' }); seed.enemy.hp = 1
  const next = takeTurn(seed, 'basic', forbidden, () => 6, () => 99.999, () => 0, () => 99, () => 99.999, { rollRecovery: () => 99.999 })
  assert.equal(next.enemy.brinkUsed, true)
  assert.equal(next.statistics.enemy.attempts.basic, 1)
})

test('an enemy ability remains part of one response and the screen retains both actors moves', () => {
  const seed = newBattle()
  const next = takeTurn(seed, 'special1', forbidden, forbidden, () => 0, () => 0, () => 99, () => 99.999, { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
  assert.equal(next.tick, 1)
  assert.equal(next.statistics.player.attempts.basic, 0)
  assert.equal(next.statistics.enemy.attempts.basic, 1)
  assert.equal(next.statistics.enemy.uses.special1, 1)
  const view = screen({ id: 's', revision: 1, battle: next })
  const log = view.embeds[0].data.fields.find(field => field.name === 'Latest moves').value
  assert.equal(log.split('\n').length, 2)
  assert.match(log, /Marq used Overwhelm/)
  assert.match(log, /Maxim hit Marq/)
  assert.match(log, /Maxim used Deadly Focus/)
  assert.equal(next.history.filter(event => event.kind === 'special').length, 2)
})

test('starting a fight schedules no attack or automatic message edit', async () => {
  const f = fixture({ setTimer: forbidden }); await f.open()
  const before = text(f.view())
  await flush(); await flush()
  assert.equal(text(f.view()), before)
  assert.equal(f.timers.size, 0)
  assert.ok(controls(f.view()).some(control => control.label === 'Basic Attack'))
  assert.ok(!controls(f.view()).some(control => control.label === 'Idle'))
  await f.arena.dispose()
})

test('slash command defers before rendering and uses editReply to create the lobby', async () => {
  const f = fixture(), calls = []
  await f.arena.execute({ ...f.interaction,
    deferReply: async () => calls.push('defer'),
    reply: forbidden,
    editReply: async payload => { calls.push('edit'); return { id: 'm' } } })
  assert.deepEqual(calls, ['defer', 'edit'])
  await f.arena.dispose()
})
