const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle: rawNewBattle, advance: engineAdvance, beginFinisher } = require('../services/arena/combat')
const advance = (...args) => engineAdvance(...Array.from({length: 8}, (_, i) => args[i]), { aiPolicy: 'legacy' })
// Formula fixtures use a controlled, equal-stat baseline; character defaults have dedicated regression coverage.
function newBattle(hope = 0, options = {}) {
  const battle = rawNewBattle(hope, options), stat = 300 + 30 * ((options.level || 1) - 1)
  for (const fighter of [battle.player, battle.enemy]) { Object.assign(fighter, { hp: stat, maxHp: stat, attack: stat }); if (fighter.passive === 'on-the-brink') fighter.passive = null }
  return battle
}
const { resolveCharacter } = require('../services/arena/characters')
const { canUse } = require('../services/arena/rules')
const { createArena } = require('../services/arena/controller')
const { actionLog, screen } = require('../services/arena/interface')
const seq = values => { let i = 0; return () => { assert.ok(i < values.length, 'Unexpected random draw'); return values[i++] } }
const maxim = resolveCharacter('Maxim [Spooky]')
const step = (battle, action = 'continue', dice = [6, 7], ability = 99.999, hit = 0, crit = 99) =>
  advance(battle, action, () => { throw Error('Unexpected Combo dice') }, seq(dice), () => ability, () => hit, () => crit, () => 99.999)
const buttons = view => view.components.flatMap(row => row.components)
const button = (view, action) => buttons(view).find(item => item.data.custom_id.endsWith(':' + action))
const text = view => JSON.stringify(view.embeds[0].data)
function fixture(options = {}) {
  let clock = 0, serial = 0, acknowledgments = 0
  const timers = new Map(), edits = [], replies = [], notices = [], errors = []
  const timer = (callback, ms) => { const id = ++serial; timers.set(id, { callback, due: clock + ms }); return id }
  const clear = id => timers.delete(id)
  const arena = createArena({ tickMs: 4000, aiPolicy: 'legacy', rollEffect: () => 99.999, now: () => clock, setTimer: timer, clearTimer: clear, setExpiryTimer: timer, clearExpiryTimer: clear,
    logger: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) },
    rollDuality: (() => { let i = 0; return () => ++i % 2 ? 6 : 7 })(), rollFearSpend: () => 99.999,
    rollAccuracy: () => 0, rollCritical: () => 99, shuffleButtons: () => [3, 5, 1, 4, 2], ...options })
  const interaction = { id: 'session', guildId: 'guild', channelId: 'channel', user: { id: 'alice' },
    reply: async payload => { replies.push(payload); return { id: 'message' } }, editReply: async payload => edits.push(payload),
    followUp: async payload => notices.push(payload) }
  const view = () => edits.at(-1) || replies[0]
  const click = (action, revision, overrides = {}) => arena.handleButton({ ...interaction, customId: `arena:session:${revision}:${action}`,
    message: { id: 'message' }, deferUpdate: async () => { acknowledgments++ }, ...overrides })
  const revision = () => Number(buttons(view())[0].data.custom_id.split(':')[2])
  async function elapse(ms) {
    const target = clock + ms
    while (true) {
      const next = [...timers.entries()].filter(([, value]) => value.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next) break
      timers.delete(next[0]); clock = next[1].due; await next[1].callback()
    }
    clock = target
  }
  const open = async (character, level = 1, mode = 'start') => {
    await arena.execute(interaction, character, { level }); await click(mode, revision())
  }
  return { arena, interaction, edits, replies, notices, errors, timers, view, click, revision, elapse, open,
    acknowledgments: () => acknowledgments, setClock: value => { clock = value } }
}
test('Slayer grants three future empowered basics for three Hope without a hit prerequisite',()=>{
 const buff=step(newBattle(3,{character:maxim}),'special2')
 assert.equal(buff.marq.slayerCharges,3);assert.equal(buff.special2Damage,0);assert.equal(buff.hopeSpent,3)
 assert.equal(buff.marq.stress,6);assert.match(actionLog(buff.history),/next 3 landed basics \+8%/)
})

test('Deadly Focus starts ready, costs two Stress and recharges only on landed basics',()=>{
 const seed=newBattle(0,{character:maxim});assert.equal(seed.marq.focusHits,3)
 const miss=step(seed,'special1',[2,1]);assert.equal(miss.special1Damage,30);assert.equal(miss.marq.stress,4);assert.equal(miss.marq.focusHits,0)
 assert.equal(step(miss,'special1'),miss)
 let battle=miss;for(let i=0;i<3;i++)battle=step(battle,'continue',[6,7])
 assert.equal(battle.player.focusHits,3);assert.equal(canUse(battle.player,'special1'),true)
})

test('Deadly Focus needs no hit prerequisite and adds direct damage on a missed basic', () => {
 const result=step(newBattle(0,{character:maxim}), 'special1',[2,1])
 assert.equal(result.marqDamage,0);assert.equal(result.special1Damage,30);assert.equal(result.marq.stress,4)
 assert.equal(result.marq.basicHits,0);assert.equal(result.marq.hope,1)
})

test('Idle uses neither Slayer nor Overwhelm, while character kits and passive remain distinct', () => {
  const battle = newBattle(6, { character: maxim, level: 20, mode: 'idle' }); battle.player.basicHits = 3
  for (const action of ['special1', 'special2', 'special3']) assert.equal(step(battle, action), battle)
  const next = step(battle, 'continue', [6, 7], 99)
  assert.equal(next.enemySpecial, null); assert.equal(next.warrior.stress, 6)
  const view = screen({ id: 's', revision: 0, battle: newBattle(1, { character: maxim, level: 5 }), character: maxim })
  assert.match(button(view, 'special1').data.label, /Deadly Focus/); assert.equal(button(view, 'special1').data.disabled, false)
  assert.match(button(view, 'special2').data.label, /Slayer/)
  assert.ok(!text(view).includes('Combo Strike')); assert.equal(newBattle().marq.kit, 'spooky-marq')
})
test('finisher math uses the shared level-scaled range, charges five Hope once and preserves player critical rules', () => {
  for (let choice = 0; choice <= 5; choice++) {
    const seed = newBattle(5, { level: 20, character: maxim }); seed.marq.attack = 300
    const paid = beginFinisher(seed)
    assert.equal(seed.marq.hope, 5); assert.equal(paid.marq.hope, 0); assert.equal(beginFinisher(paid), paid)
    const result = step(paid, { special3: true, choice }, [1, 1])
    assert.equal(result.special3Damage, 90 + 15 * choice); assert.equal(result.hopeSpent, 0)
    assert.equal(result.marq.hope, 1); assert.equal(result.marqDamage, 6); assert.equal(result.finisherPaid, false)
    assert.match(actionLog(result.history), /Spent 5 Hope/)
  }
  for (const seed of [newBattle(4, { level: 20 }), newBattle(6, { level: 20, mode: 'idle' })]) assert.equal(beginFinisher(seed), seed)
  const paid = beginFinisher(newBattle(5, { level: 20 }))
  for (const choice of [-1, 6, 1.5]) assert.equal(step(paid, { special3: true, choice }), paid)
})
test('lobby expires at fifteen seconds, removes controls, and sends one private notification', async () => {
  const f = fixture(); await f.arena.execute(f.interaction)
  await f.elapse(14999); assert.ok(buttons(f.view()).length)
  await f.elapse(1); assert.deepEqual(f.view().components, []); assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].ephemeral, true); assert.match(f.notices[0].content, /Session expired/)
  await f.elapse(60000); assert.equal(f.notices.length, 1); assert.equal(f.timers.size, 0)
  await f.click('start', 0); assert.equal(f.replies.at(-1).ephemeral, true)
})
test('automatic combat runs past fifteen seconds without requiring optional ability clicks', async () => {
  const f = fixture(); await f.open(); await f.elapse(30000)
  assert.match(f.view().embeds[0].data.title, /· 7$/)
  assert.ok(button(f.view(), 'quit')); assert.equal(f.notices.length, 0)
  await f.arena.dispose()
})

test('foreign and outdated lobby interactions cannot extend expiry; overdue clicks cannot beat the timer', async () => {
  const f = fixture(); await f.arena.execute(f.interaction); await f.elapse(12000)
  await f.click('start', 9); await f.click('start', 0, { user: { id: 'other' } })
  await f.elapse(3000); assert.deepEqual(f.view().components, [])
  const g = fixture(); await g.arena.execute(g.interaction); g.setClock(15001)
  await g.click('start', 0); assert.deepEqual(g.view().components, []); assert.equal(g.notices.length, 1)
})

test('Idle finishes unattended, then replay controls expire after fifteen seconds', async () => {
  const f = fixture(); await f.open(undefined, 1, 'idle'); await f.elapse(42000)
  assert.equal(f.view().embeds[0].data.title, 'DEFEAT'); assert.ok(button(f.view(), 'start'))
  await f.elapse(14999); assert.ok(buttons(f.view()).length)
  await f.elapse(1); assert.deepEqual(f.view().components, []); assert.equal(f.notices.length, 0)
})
async function readyFinisher(f) {
  await f.open(maxim, 20); await f.elapse(12000)
  await f.click('special1', f.revision()); await f.elapse(8000)
  assert.equal(button(f.view(), 'special3').data.disabled, false)
}
test('finisher replaces all controls, pauses combat, shuffles and resolves one selected number', async () => {
  let n = 0
  const f = fixture({ rollDuality: () => 6, shuffleButtons: () => ++n % 2 ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1] })
  await readyFinisher(f); await f.click('special3', f.revision())
  assert.deepEqual(buttons(f.view()).filter(item => item.data.custom_id.includes(':pick:')).map(item => item.data.label), ['1', '2', '3', '4', '5'])
  assert.match(text(f.view()), /combat paused/); assert.match(text(f.view()), /Hope 0\/6/)
  const old = f.revision(); await f.elapse(1000)
  assert.deepEqual(buttons(f.view()).filter(item => item.data.custom_id.includes(':pick:')).map(item => item.data.label), ['5', '4', '3', '2', '1'])
  await f.click('pick:5', old - 1)
  assert.match(text(f.view()), /combat paused/)
  const revision = f.revision()
  await Promise.all([f.click('pick:5', revision), f.click('pick:1', revision)])
  assert.doesNotMatch(text(f.view()), /combat paused/)
  const log = f.view().embeds[0].data.fields.map(field => field.value).join('\n')
  assert.match(log, /picked 5 · 55% · 121 damage/)
  assert.equal((log.match(/Spent 5 Hope/g) || []).length, 1)
  assert.match(text(f.view()), /Hope 1\/6/)
  await f.arena.dispose()
})
test('no finisher choice resolves after 1.5 seconds, then normal controls resume', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision()); const before = f.view().embeds[0].data.title
  await f.elapse(1499); assert.equal(f.view().embeds[0].data.title, before); assert.equal(buttons(f.view()).length, 6)
  await f.elapse(1)
  assert.match(text(f.view()), /no choice · 30% · 66 damage/)
  assert.ok(button(f.view(), 'special1')); assert.equal(buttons(f.view()).some(item => item.data.custom_id.includes(':pick:')), false)
  await f.arena.dispose()
})

test('a Finisher pick from the displayed pre-shuffle frame remains valid within its window', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision()); const original = f.revision()
  const ids = buttons(f.view()).filter(item => item.data.custom_id.includes(':pick:')).map(item => item.data.custom_id).sort()
  await f.elapse(1000)
  assert.deepEqual(buttons(f.view()).filter(item => item.data.custom_id.includes(':pick:')).map(item => item.data.custom_id).sort(), ids)
  await f.click('pick:5', original)
  assert.match(text(f.view()), /picked 5 · 55% · 121 damage/)
  const resolved = text(f.view())
  await f.click('pick:1', original); await f.elapse(500)
  assert.equal(text(f.view()), resolved)
  await f.arena.dispose()
})

test('acknowledgement failures cannot strand a paid Finisher or duplicate its damage', async () => {
  for (const failure of ['activation', 'pick']) {
    const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
    const rejected = { deferUpdate: async () => { throw Error('Unknown interaction') } }
    await f.click('special3', f.revision(), failure === 'activation' ? rejected : {})
    assert.match(text(f.view()), /combat paused/)
    const gameRevision = f.revision()
    await f.click('pick:5', gameRevision, failure === 'pick' ? rejected : {})
    assert.match(text(f.view()), /picked 5 · 55% · 121 damage/)
    assert.match(text(f.view()), /Hope 1\/6/)
    assert.equal(f.errors.length, 1)
    const resolved = text(f.view())
    await f.click('pick:5', gameRevision); await f.elapse(1500)
    assert.equal(text(f.view()), resolved)
    await f.arena.dispose()
  }
})

test('an old Finisher game cannot select a number in a later game', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision()); const old = f.revision()
  await f.click('quit', old); await f.click('start', f.revision())
  await f.elapse(20000)
  await f.click('special3', f.revision())
  assert.match(text(f.view()), /combat paused/)
  await f.click('pick:5', old)
  assert.match(text(f.view()), /combat paused/)
  await f.click('pick:5', f.revision())
  assert.match(text(f.view()), /picked 5 · 55% · 121 damage/)
  await f.arena.dispose()
})

test('player Finishers deal nonzero damage for every choice even when their basic misses', () => {
  for (const character of [undefined, maxim]) for (let choice = 0; choice <= 5; choice++) {
    const seed = rawNewBattle(5, { character })
    const result = step(beginFinisher(seed), { special3: true, choice }, [2, 3])
    assert.equal(result.marqDamage, 0)
    assert.equal(result.special3Damage, Math.ceil(seed.marq.attack * (30 + 5 * choice) / 100))
    assert.ok(result.special3Damage > 0)
    assert.equal(result.warrior.hp, seed.warrior.hp - result.special3Damage - result.statistics.player.damage.special2)
    assert.equal(result.statistics.player.spent, 5)
  }
})

test('AI Finisher lands even when its accompanying basic attack misses', () => {
  const seed = rawNewBattle(); seed.warrior.fear = 5
  const result = step(seed, 'continue', [6, 7], 0, 99)
  assert.equal(result.enemySpecial, 'special3'); assert.equal(result.statistics.enemy.damage.special3, 99)
  const log = actionLog(result.history)
  assert.match(log, /midpoint · 45% · 99 damage/)
  assert.doesNotMatch(log, /midpoint · 45% · 0 damage/)
})

test('default active cadence is 3.5 seconds, with no change to Idle or Finisher timers', async () => {
  const f = fixture({ tickMs: undefined })
  await f.open()
  await f.elapse(3499); assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.elapse(1); assert.match(f.view().embeds[0].data.title, /· 1$/)
  await f.elapse(3500); assert.match(f.view().embeds[0].data.title, /· 2$/)
  assert.equal(require('../services/arena/rules').idleTickMs, 1000)
  assert.equal(require('../services/arena/rules').finisherWindowMs, 1500)
  await f.arena.dispose()
})

test('both AI Finishers hit across every accuracy roll and correctly account for exhaustion', () => {
  for (const opponent of ['marq', 'maxim']) for (const stress of [0, 6]) for (let accuracy = 0; accuracy < 100; accuracy++) {
    const seed = rawNewBattle(0, { opponent }); seed.warrior.fear = 5; seed.marq.stress = stress
    let i = 0
    const result = advance(seed, 'continue', undefined, () => [6, 7][i++], () => 0, () => accuracy, () => 99, () => 99.999)
    const normal = Math.ceil(seed.warrior.attack * 45 / 100)
    const damage = Math.ceil(seed.warrior.attack * 45 / 100 * (stress === 0 ? 1.25 : 1))
    assert.equal(result.enemySpecial, 'special3')
    assert.equal(result.statistics.enemy.hits.special3, 1)
    assert.equal(result.statistics.enemy.damage.special3, damage)
    assert.equal(result.enemyOutcome === 'miss', accuracy >= 85)
    assert.equal(result.warrior.fear, 1)
    assert.equal(result.statistics.player.vulnerabilityDamageTaken,
      result.maximDamage - normal - (accuracy < 85 ? Math.ceil(seed.warrior.attack * 2.75 / 100) : 0))
  }
})
test('foreign minigame picks cannot spend or resolve the player finisher', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f); await f.click('special3', f.revision())
  await f.click('pick:5', f.revision(), { user: { id: 'other' } })
  assert.match(f.replies.at(-1).content, /Only the player/)
  assert.match(text(f.view()), /combat paused/); await f.arena.dispose()
})
test('slow minigame edits never queue overlapping shuffle updates', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  let release
  f.interaction.editReply = payload => { f.edits.push(payload); return new Promise(resolve => { release = resolve }) }
  const pending = f.click('special3', f.revision()); await Promise.resolve(); await Promise.resolve()
  const count = f.edits.length
  await f.elapse(2000); assert.equal(f.edits.length, count)
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await pending; await f.elapse(1000)
  assert.equal(f.edits.length, count + 1); await f.arena.dispose()
})

test('a pick at the 1.5-second deadline cannot beat an overdue timeout callback', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision())
  f.setClock(21500)
  await f.click('pick:5', f.revision())
  assert.match(text(f.view()), /no choice · 30% · 66 damage/)
  assert.doesNotMatch(text(f.view()), /picked 5/)
  assert.ok(button(f.view(), 'special1')); await f.arena.dispose()
})

test('the 1.5-second deadline still claims timeout while a shuffle edit is delayed', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision())
  let release
  f.interaction.editReply = payload => { f.edits.push(payload); return new Promise(resolve => { release = resolve }) }
  const shuffle = f.elapse(1000); await Promise.resolve(); await Promise.resolve()
  const timeout = [...f.timers.values()].find(timer => timer.due === 21500)
  assert.ok(timeout)
  f.setClock(21500)
  const expired = timeout.callback()
  const pick = f.click('pick:5', f.revision())
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await shuffle; await expired; await pick
  assert.match(text(f.view()), /no choice · 30% · 66 damage/)
  assert.doesNotMatch(text(f.view()), /picked 5/)
  await f.arena.dispose()
})

test('completed fight reporting happens once per fight, survives a failed final edit and resets on replay', async () => {
  const reports = []
  const f = fixture({ onComplete: report => reports.push(report) })
  await f.open(undefined, 1, 'idle'); await f.elapse(41000)
  f.interaction.editReply = async () => { throw Error('final display failed') }
  await f.elapse(1000)
  assert.equal(reports.length, 1); assert.equal(reports[0].rounds, 42); assert.equal(reports[0].winner, 'enemy')
  f.interaction.editReply = async payload => f.edits.push(payload)
  await f.click('special1', 0); assert.equal(reports.length, 1)
  await f.click('idle', f.revision()); await f.elapse(42000)
  assert.equal(reports.length, 2); assert.equal(reports[1].rounds, 42)
  assert.equal(reports[1].enemy.spent, 0)
  await f.arena.dispose(); assert.equal(reports.length, 2)
})

test('Quit stops active and Idle fights, cancels queued attacks, rejects stale/foreign controls and allows replay', async () => {
  for (const mode of ['start', 'idle']) {
    const reports = [], f = fixture({ onComplete: report => reports.push(report) })
    await f.open(undefined, 1, mode)
    const revision = f.revision()
    await f.click('quit', revision, { user: { id: 'other' } })
    assert.match(f.replies.at(-1).content, /Only the player/)
    await f.click('quit', revision + 1); assert.notEqual(f.view().embeds[0].data.title, 'FIGHT ENDED')
    if (mode === 'start') await f.click('special1', revision)
    await f.click('quit', f.revision())
    assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
    assert.equal(button(f.view(), 'special1'), undefined)
    assert.equal(button(f.view(), 'quit'), undefined); assert.equal(reports.length, 0)
    await f.click('start', revision); assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
    await f.click('start', f.revision()); assert.match(text(f.view()), /260\/260/)
    assert.match(text(f.view()), /Stress 6\/6/)
    await f.arena.dispose(); assert.equal(f.timers.size, 0)
  }
})

test('Quit during the Finisher cancels both timers and never resolves its paid damage', async () => {
  const f = fixture({ rollDuality: () => 6 }); await readyFinisher(f)
  await f.click('special3', f.revision()); const old = f.revision()
  await f.click('quit', old)
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  await f.click('pick:5', old); await f.elapse(14999)
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  assert.doesNotMatch(text(f.view()), /picked 5|no choice/)
  await f.elapse(1); assert.deepEqual(f.view().components, []); assert.equal(f.timers.size, 0)
})

test('new arena replaces only the same player’s old session and invalidates its old controls', async () => {
  const f = fixture(); await f.open()
  await f.arena.execute({ ...f.interaction, id: 'new-session' })
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.click('special1', 1)
  assert.match(f.replies.at(-1).content, /session has ended/)
  await f.arena.dispose()
})

test('a replaced lobby cannot leave buttons behind when its initial Discord reply finishes late', async () => {
  const f = fixture(); let release
  const first = f.arena.execute({ ...f.interaction, reply: async payload => {
    f.replies.push(payload)
    return new Promise(resolve => { release = () => resolve({ id: 'late-message' }) })
  } })
  await f.arena.execute({ ...f.interaction, id: 'replacement' })
  release(); await first
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.click('start', 0, { message: { id: 'late-message' } })
  assert.match(f.replies.at(-1).content, /session has ended/)
  await f.arena.dispose()
})

test('lobby opponent toggle selects real AI Marq mechanics and matching banner, while stale toggles do nothing', async () => {
  const f = fixture(); await f.arena.execute(f.interaction)
  assert.equal(button(f.view(), 'opponent').data.label, 'Opponent: Maxim')
  await f.click('opponent', 0)
  assert.match(text(f.view()), /vs Marq/); assert.match(text(f.view()), /marq-vs-marq.png/)
  await f.click('opponent', 0)
  assert.equal(button(f.view(), 'opponent').data.label, 'Opponent: Marq')
  await f.click('start', f.revision()); assert.match(f.view().embeds[0].data.title, /vs Marq/)
  await f.elapse(20000)
  assert.ok(button(f.view(), 'quit')); assert.equal(f.notices.length, 0)
  await f.arena.dispose()
})
test('cleanup also removes evicted and disposed sessions and notification failures do not revive controls', async () => {
  const f = fixture({ maxSessions: 1 }); await f.open()
  await f.arena.execute({ ...f.interaction, id: 'second' })
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.arena.dispose(); assert.equal(f.timers.size, 0)
  const g = fixture(); g.interaction.followUp = async () => { throw Error('expired webhook') }
  await g.arena.execute(g.interaction); await g.elapse(15000)
  assert.deepEqual(g.view().components, []); assert.equal(g.errors.length, 1); assert.equal(g.timers.size, 0)
})
test('expiry still notifies privately when the Discord cleanup edit fails, keeping the lease for recovery', async () => {
  const removed = []
  const f = fixture({ leases: { add() {}, remove: id => removed.push(id) } })
  await f.arena.execute(f.interaction)
  f.interaction.editReply = async () => { throw Error('network unavailable') }
  await f.elapse(15000)
  assert.equal(f.notices.length, 1); assert.deepEqual(removed, []); assert.equal(f.timers.size, 0)
  await f.click('start', 0); assert.equal(f.replies.at(-1).ephemeral, true)
})
test('quit cannot regain combat buttons after a delayed tick edit completes', async () => {
  const f = fixture(); await f.open()
  let release
  f.interaction.editReply = payload => { f.edits.push(payload); return new Promise(resolve => { release = resolve }) }
  const tick = f.elapse(4000); await Promise.resolve(); await Promise.resolve()
  const quit = f.click('quit', f.revision())
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await tick; await quit
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  assert.equal(button(f.view(), 'special1'), undefined)
  assert.ok(button(f.view(), 'start'))
  await f.elapse(15000); assert.deepEqual(f.view().components, []); assert.equal(f.timers.size, 0)
})

test('message leases store only references and restart recovery edits only our messages in the development guild', async t => {
  const { createLeaseStore, recoverArenaMessages } = require('../services/arena/message-leases')
  const fs = require('node:fs'), path = require('node:path')
  const dir = fs.mkdtempSync(path.resolve('artifacts/arena-lease-test-')), file = path.join(dir, 'leases.json')
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir) })
  const store = createLeaseStore(file)
  const row = { guildId: '12345678901234567', channelId: '23456789012345678', messageId: '34567890123456789' }
  store.add(row); store.add(row); assert.deepEqual(store.list(), [row])
  const old = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => { for (const [key, value] of [['NODE_ENV', old.env], ['GUILDID', old.guild]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  const edits = []
  const client = { user: { id: 'bot' }, channels: { fetch: async () => ({ guildId: row.guildId, messages: {
    fetch: async () => ({ author: { id: 'bot' }, edit: async value => edits.push(value) }),
  } }) } }
  process.env.NODE_ENV = 'production'; process.env.GUILDID = row.guildId
  await recoverArenaMessages(client, { store }); assert.equal(edits.length, 0)
  process.env.NODE_ENV = 'development'; process.env.GUILDID = 'other'
  await recoverArenaMessages(client, { store }); assert.equal(edits.length, 0)
  process.env.GUILDID = row.guildId
  await recoverArenaMessages(client, { store }); assert.deepEqual(edits[0].components, []); assert.deepEqual(store.list(), [])
})
