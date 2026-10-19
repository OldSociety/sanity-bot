const test = require('node:test'),
  assert = require('node:assert/strict')
const {
  newBattle: rawNewBattle,
  advance: engineAdvance,
  beginFinisher,
} = require('../services/arena/combat')
const advance = (...args) =>
  engineAdvance(...Array.from({ length: 8 }, (_, i) => args[i]), {
    rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45,
  })
// Formula fixtures use a controlled, equal-stat baseline; character defaults have dedicated regression coverage.
function newBattle(hope = 0, options = {}) {
  const battle = rawNewBattle(hope, options),
    stat = 300 + 30 * ((options.level || 1) - 1)
  for (const fighter of [battle.player, battle.enemy]) {
    Object.assign(fighter, { hp: stat, maxHp: stat, attack: stat })
    if (fighter.passive === 'on-the-brink') fighter.passive = null
  }
  return battle
}
const { resolveCharacter } = require('../services/arena/characters')
const { canUse } = require('../services/arena/rules')
const { createArena } = require('../services/arena/controller')
const { actionLog, screen } = require('../services/arena/interface')
const seq = (values) => {
  let i = 0
  return () => {
    assert.ok(i < values.length, 'Unexpected random draw')
    return values[i++]
  }
}
const maxim = resolveCharacter('Maxim [Spooky]')
const step = (
  battle,
  action = 'continue',
  dice = [6, 7],
  ability = 99.999,
  hit = 0,
  crit = 99,
) =>
  advance(
    battle,
    action,
    () => {
      throw Error('Unexpected Combo dice')
    },
    seq(dice),
    () => ability,
    () => hit,
    () => crit,
    () => 99.999,
  )
const buttons = (view) => view.components.flatMap((row) => row.components)
const button = (view, action) =>
  buttons(view).find((item) => item.data.custom_id.endsWith(':' + action))
const text = (view) => JSON.stringify(view.embeds.map(embed => embed.data))
function fixture(options = {}) {
  let clock = 0,
    serial = 0,
    acknowledgments = 0, battle
  const timers = new Map(),
    edits = [],
    replies = [],
    notices = [],
    errors = []
  const timer = (callback, ms) => {
    const id = ++serial
    timers.set(id, { callback, due: clock + ms })
    return id
  }
  const clear = (id) => timers.delete(id)
  const arena = createArena({ chooseOpponent: () => 'maxim', rollRecovery: () => 99.999,
    tickMs: 4000,
    rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45,
    renderCard: async session => { battle = structuredClone(session.battle); return require('../services/arena/health-card').renderHealthCard(session) },
    rollEffect: () => 99.999,
    now: () => clock,
    setTimer: timer,
    clearTimer: clear,
    setExpiryTimer: timer,
    clearExpiryTimer: clear,
    logger: {
      error: (...args) => errors.push(args),
      warn: (...args) => errors.push(args),
    },
    rollDuality: (() => {
      let i = 0
      return () => (++i % 2 ? 6 : 7)
    })(),
    rollFearSpend: () => 99.999,
    rollAccuracy: () => 0,
    rollCritical: () => 99,
    shuffleButtons: () => [3, 5, 1, 4, 2],
    ...options,
  })
  const interaction = {
    id: 'session',
    guildId: 'guild',
    channelId: 'channel',
    user: { id: 'alice' },
    reply: async (payload) => {
      replies.push(payload)
      return { id: 'message' }
    },
    editReply: async (payload) => edits.push(payload),
    followUp: async (payload) => notices.push(payload),
  }
  const view = () => edits.at(-1) || replies[0]
  const click = (action, revision, overrides = {}) =>
    arena.handleButton({
      ...interaction,
      customId: `arena:session:${revision}:${action}`,
      message: { id: 'message' },
      deferUpdate: async () => {
        acknowledgments++
      },
      ...overrides,
    })
  const revision = () => Number(buttons(view())[0].data.custom_id.split(':')[2])
  async function elapse(ms) {
    const target = clock + ms
    while (true) {
      const next = [...timers.entries()]
        .filter(([, value]) => value.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next) break
      timers.delete(next[0])
      clock = next[1].due
      await next[1].callback()
    }
    clock = target
  }
  const open = async (character, level = 1, mode = 'start') => {
    await arena.execute(interaction, character, { level })
    await click(mode, revision())
  }
  return {
    arena,
    interaction,
    edits,
    replies,
    notices,
    errors,
    timers,
    view,
    click,
    revision,
    elapse,
    open,
    battle: () => battle,
    turn: () => click('basic', revision()),
    acknowledgments: () => acknowledgments,
    setClock: (value) => {
      clock = value
    },
  }
}
test('Slayer grants three future empowered basics for three Hope without a hit prerequisite', () => {
  const buff = step(newBattle(3, { character: maxim }), 'special2')
  assert.equal(buff.player.slayerCharges, 3)
  assert.equal(buff.special2Damage, 0)
  assert.equal(buff.hopeSpent, 3)
  assert.equal(buff.player.stress, 6)
  assert.match(actionLog(buff.history), /next 3 landed basics \+8%/)
})

test('Deadly Focus starts ready, costs two Stress and recharges only on landed basics', () => {
  const seed = newBattle(0, { character: maxim })
  assert.equal(seed.player.focusHits, 3)
  const miss = step(seed, 'special1', [2, 1])
  assert.equal(miss.special1Damage, 30)
  assert.equal(miss.player.stress, 4)
  assert.equal(miss.player.focusHits, 0)
  assert.equal(step(miss, 'special1'), miss)
  let battle = miss
  for (let i = 0; i < 3; i++) battle = step(battle, 'continue', [6, 7])
  assert.equal(battle.player.focusHits, 3)
  assert.equal(canUse(battle.player, 'special1'), true)
})

test('Deadly Focus needs no hit prerequisite and adds direct damage on a missed basic', () => {
  const result = step(newBattle(0, { character: maxim }), 'special1', [2, 1])
  assert.equal(result.playerBasicDamage, 0)
  assert.equal(result.special1Damage, 30)
  assert.equal(result.player.stress, 4)
  assert.equal(result.player.basicHits, 0)
  assert.equal(result.player.hope, 1)
})

test('Idle uses neither Slayer nor Overwhelm, while character kits and passive remain distinct', () => {
  const battle = newBattle(6, { character: maxim, level: 20, mode: 'idle' })
  battle.player.basicHits = 3
  for (const action of ['special1', 'special2', 'special3'])
    assert.equal(step(battle, action), battle)
  const next = step(battle, 'continue', [6, 7], 99)
  assert.equal(next.enemySpecial, null)
  assert.equal(next.enemy.stress, 6)
  const view = screen({
    id: 's',
    revision: 0,
    battle: newBattle(1, { character: maxim, level: 5 }),
    character: maxim,
  })
  assert.match(button(view, 'special1').data.label, /Deadly Focus/)
  assert.equal(button(view, 'special1').data.disabled, false)
  assert.match(button(view, 'special2').data.label, /Slayer/)
  assert.ok(!text(view).includes('Combo Strike'))
  assert.equal(newBattle().player.kit, 'spooky-marq')
})
test('finisher math uses the shared level-scaled range, charges six Hope once and preserves player critical rules', () => {
  for (let choice = 0; choice <= 5; choice++) {
    const seed = newBattle(6, { level: 20, character: maxim })
    seed.player.attack = 300
    const paid = beginFinisher(seed)
    assert.equal(seed.player.hope, 6)
    assert.equal(paid.player.hope, 0)
    assert.equal(beginFinisher(paid), paid)
    const result = step(paid, { special3: true, choice }, [1, 1])
    assert.equal(result.special3Damage, 90 + 15 * choice)
    assert.equal(result.hopeSpent, 0)
    assert.equal(result.player.hope, 1)
    assert.equal(result.playerBasicDamage, 9)
    assert.equal(result.finisherPaid, false)
    assert.match(actionLog(result.history), /Spent 6 Hope/)
  }
  for (const seed of [
    newBattle(4, { level: 20 }),
    newBattle(6, { level: 20, mode: 'idle' }),
  ])
    assert.equal(beginFinisher(seed), seed)
  const paid = beginFinisher(newBattle(6, { level: 20 }))
  for (const choice of [-1, 6, 1.5])
    assert.equal(step(paid, { special3: true, choice }), paid)
})
test('lobby expires at fifteen seconds, removes controls, and sends one private notification', async () => {
  const f = fixture()
  await f.arena.execute(f.interaction)
  await f.elapse(14999)
  assert.ok(buttons(f.view()).length)
  await f.elapse(1)
  assert.deepEqual(f.view().components, [])
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].ephemeral, true)
  assert.match(f.notices[0].content, /Session expired/)
  await f.elapse(60000)
  assert.equal(f.notices.length, 1)
  assert.equal(f.timers.size, 0)
  await f.click('start', 0)
  assert.equal(f.replies.at(-1).ephemeral, true)
})
test('combat waits for the player past fifteen seconds with no automatic attacks', async () => {
  const f = fixture()
  await f.open()
  await f.elapse(30000)
  assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.turn()
  assert.match(f.view().embeds[0].data.title, /· 1$/)
  assert.ok(button(f.view(), 'quit'))
  assert.equal(f.notices.length, 0)
  await f.arena.dispose()
})

test('manual battle inactivity cleanup waits five minutes, refreshes on a move and never attacks', async () => {
  const f = fixture()
  await f.open()
  await f.elapse(299999)
  assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.turn()
  await f.elapse(299999)
  assert.ok(button(f.view(), 'basic'))
  assert.match(f.view().embeds[0].data.title, /· 1$/)
  await f.elapse(1)
  assert.deepEqual(f.view().components, [])
  assert.match(f.view().embeds[0].data.title, /· 1$/)
  assert.equal(f.notices.length, 1)
  await f.arena.dispose()
})

test('foreign and outdated lobby interactions cannot extend expiry; overdue clicks cannot beat the timer', async () => {
  const f = fixture()
  await f.arena.execute(f.interaction)
  await f.elapse(12000)
  await f.click('start', 9)
  await f.click('start', 0, { user: { id: 'other' } })
  await f.elapse(3000)
  assert.deepEqual(f.view().components, [])
  const g = fixture()
  await g.arena.execute(g.interaction)
  g.setClock(15001)
  await g.click('start', 0)
  assert.deepEqual(g.view().components, [])
  assert.equal(g.notices.length, 1)
})

test('a completed manual fight offers replay controls for fifteen seconds', async () => {
  const f = fixture()
  await f.open()
  while (button(f.view(), 'quit')) await f.turn()
  assert.equal(f.view().embeds[0].data.title, 'VICTORY')
  assert.ok(button(f.view(), 'start'))
  await f.elapse(14999)
  assert.ok(buttons(f.view()).length)
  await f.elapse(1)
  assert.deepEqual(f.view().components, [])
  assert.equal(f.notices.length, 0)
})
async function readyFinisher(f) {
  await f.open(maxim, 20)
  for (let i = 0; i < 3; i++) await f.turn()
  await f.click('special1', f.revision())
  for (let i = 0; i < 3; i++) await f.turn()
  assert.equal(button(f.view(), 'special3').data.disabled, false)
}
test('finisher replaces all controls, pauses combat, keeps one randomized layout and resolves one selected number', async () => {
  let n = 0
  const f = fixture({
    rollDuality: () => 6,
    shuffleButtons: () => (++n % 2 ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1]),
  })
  await readyFinisher(f)
  await f.click('special3', f.revision())
  assert.deepEqual(
    buttons(f.view())
      .filter((item) => item.data.custom_id.includes(':pick:'))
      .map((item) => item.data.label),
    ['1', '2', '3', '4', '5'],
  )
  assert.match(text(f.view()), /combat paused/)
  assert.match(text(f.view()), /Hope 0\/6/)
  const old = f.revision()
  await f.elapse(1000)
  assert.deepEqual(
    buttons(f.view())
      .filter((item) => item.data.custom_id.includes(':pick:'))
      .map((item) => item.data.label),
    ['1', '2', '3', '4', '5'],
  )
  await f.click('pick:5', old - 1)
  assert.match(text(f.view()), /combat paused/)
  const revision = f.revision()
  await Promise.all([f.click('pick:5', revision), f.click('pick:1', revision)])
  assert.doesNotMatch(text(f.view()), /combat paused/)
  const log = f
    .view()
    .embeds[0].data.fields.map((field) => field.value)
    .join('\n')
  assert.match(log, /picked 5 · 55% · 152 damage/)
  assert.equal((log.match(/Spent 6 Hope/g) || []).length, 1)
  assert.match(text(f.view()), /Hope 0\/6/)
  await f.arena.dispose()
})
test('finisher gives five seconds after render and resolves its timeout only once', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f); await f.click('special3', f.revision())
  const rev = f.revision()
  await f.elapse(4999); assert.match(text(f.view()), /combat paused/)
  await f.elapse(1); assert.match(text(f.view()), /no choice · 30%/)
  const after = text(f.view())
  await f.click('pick:5', rev); assert.equal(text(f.view()), after)
  await f.arena.dispose()
})

test('a Finisher pick from the initial displayed layout remains valid until selected', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f)
  await f.click('special3', f.revision())
  const original = f.revision()
  const ids = buttons(f.view())
    .filter((item) => item.data.custom_id.includes(':pick:'))
    .map((item) => item.data.custom_id)
    .sort()
  await f.elapse(1000)
  assert.deepEqual(
    buttons(f.view())
      .filter((item) => item.data.custom_id.includes(':pick:'))
      .map((item) => item.data.custom_id)
      .sort(),
    ids,
  )
  await f.click('pick:5', original)
  assert.match(text(f.view()), /picked 5 · 55% · 152 damage/)
  const resolved = text(f.view())
  await f.click('pick:1', original)
  await f.elapse(500)
  assert.equal(text(f.view()), resolved)
  await f.arena.dispose()
})

test('acknowledgement failures cannot spend Hope or strand an already paid Finisher', async () => {
  for (const failure of ['activation', 'pick']) {
    const f = fixture({ rollDuality: () => 6 })
    await readyFinisher(f)
    const rejected = {
      deferUpdate: async () => {
        throw Error('Unknown interaction')
      },
    }
    await f.click(
      'special3',
      f.revision(),
      failure === 'activation' ? rejected : {},
    )
    if (failure === 'activation') {
      assert.doesNotMatch(text(f.view()), /combat paused/)
      assert.match(text(f.view()), /Hope 6\/6/)
      await f.click('special3', f.revision())
    }
    assert.match(text(f.view()), /combat paused/)
    const gameRevision = f.revision()
    await f.click('pick:5', gameRevision, failure === 'pick' ? rejected : {})
    if (failure === 'pick') await f.click('pick:5', gameRevision)
    assert.match(text(f.view()), /picked 5 · 55% · 152 damage/)
    assert.match(text(f.view()), /Hope 0\/6/)
    assert.equal(f.errors.length, 1)
    const resolved = text(f.view())
    await f.click('pick:5', gameRevision)
    await f.elapse(1500)
    assert.equal(text(f.view()), resolved)
    await f.arena.dispose()
  }
})

test('an old Finisher game cannot select a number in a later game', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f)
  await f.click('special3', f.revision())
  const old = f.revision()
  await f.click('quit', old)
  await f.click('start', f.revision())
  for (let i = 0; i < 6; i++) await f.turn()
  await f.click('special3', f.revision())
  assert.match(text(f.view()), /combat paused/)
  await f.click('pick:5', old)
  assert.match(text(f.view()), /combat paused/)
  await f.click('pick:5', f.revision())
  assert.match(text(f.view()), /picked 5 · 55% · 152 damage/)
  await f.arena.dispose()
})

test('player Finishers deal nonzero damage for every choice even when their basic misses', () => {
  for (const character of [undefined, maxim])
    for (let choice = 0; choice <= 5; choice++) {
      const seed = rawNewBattle(6, { character })
      const result = step(
        beginFinisher(seed),
        { special3: true, choice },
        [2, 3],
      )
      assert.equal(result.playerBasicDamage, 0)
      assert.equal(
        result.special3Damage,
        Math.ceil((seed.player.attack * (30 + 5 * choice)) / 100),
      )
      assert.ok(result.special3Damage > 0)
      assert.equal(
        result.enemy.hp,
        seed.enemy.hp -
          result.special3Damage -
          result.statistics.player.damage.special2,
      )
      assert.equal(result.statistics.player.spent, 6)
    }
})

test('AI Finisher lands even when its accompanying basic attack misses', () => {
  const seed = rawNewBattle()
  seed.enemy.fear = 6
  const result = step(seed, 'continue', [6, 7], 0, 99)
  assert.equal(result.enemySpecial, 'special3')
  assert.equal(result.statistics.enemy.damage.special3, 99)
  const log = actionLog(result.history)
  assert.match(log, /rolled · 45% · 99 damage/)
  assert.doesNotMatch(log, /rolled · 45% · 0 damage/)
})

test('no attack cadence remains: time passing does not advance the fight', async () => {
  const f = fixture({ tickMs: undefined })
  await f.open()
  await f.elapse(3499)
  assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.elapse(1)
  assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.elapse(3500)
  assert.match(f.view().embeds[0].data.title, /· 0$/)
  await f.turn()
  assert.match(f.view().embeds[0].data.title, /· 1$/)
  await f.arena.dispose()
})

test('both AI Finishers hit across every accuracy roll and correctly account for exhaustion', () => {
  for (const opponent of ['marq', 'maxim'])
    for (const stress of [0, 6])
      for (let accuracy = 0; accuracy < 100; accuracy++) {
        const seed = rawNewBattle(0, { opponent })
        seed.enemy.fear = 5
        seed.player.stress = stress
        let i = 0
        const result = advance(
          seed,
          'continue',
          undefined,
          () => [6, 7][i++],
          () => 0,
          () => accuracy,
          () => 99,
          () => 99.999,
        )
        const normal = Math.ceil((seed.enemy.attack * 45) / 100)
        const damage = Math.ceil(
          ((seed.enemy.attack * 45) / 100) * (stress === 0 ? 1.25 : 1),
        )
        assert.equal(result.enemySpecial, 'special3')
        assert.equal(result.statistics.enemy.hits.special3, 1)
        assert.equal(result.statistics.enemy.damage.special3, damage)
        assert.equal(result.enemyOutcome === 'miss', accuracy >= 85)
        assert.equal(result.enemy.fear, 0)
        assert.equal(
          result.statistics.player.vulnerabilityDamageTaken,
          result.enemyDamage -
            normal -
            (accuracy < 85 ? Math.ceil((seed.enemy.attack * 3) / 100) : 0),
        )
      }
})
test('foreign minigame picks cannot spend or resolve the player finisher', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f)
  await f.click('special3', f.revision())
  await f.click('pick:5', f.revision(), { user: { id: 'other' } })
  assert.match(f.replies.at(-1).content, /Only the player/)
  assert.match(text(f.view()), /combat paused/)
  await f.arena.dispose()
})
test('slow minigame edits never queue overlapping shuffle updates', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f)
  let release
  f.interaction.editReply = (payload) => {
    f.edits.push(payload)
    return new Promise((resolve) => {
      release = resolve
    })
  }
  const pending = f.click('special3', f.revision())
  await new Promise(resolve => setImmediate(resolve))
  const count = f.edits.length
  await f.elapse(2000)
  assert.equal(f.edits.length, count)
  f.interaction.editReply = async (payload) => f.edits.push(payload)
  release()
  await pending
  await f.elapse(1000)
  assert.equal(f.edits.length, count)
  await f.arena.dispose()
})

test('a delayed pick acknowledgement still resolves the chosen number exactly once', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f); await f.click('special3', f.revision())
  let release
  const pending = f.click('pick:5', f.revision(), { deferUpdate: () => new Promise(resolve => { release = resolve }) })
  await new Promise(resolve => setImmediate(resolve))
  await f.elapse(10000)
  assert.match(text(f.view()), /combat paused/)
  release(); await pending
  assert.match(text(f.view()), /picked 5/); assert.doesNotMatch(text(f.view()), /no choice/)
  await f.arena.dispose()
})

test('completed fight reporting happens once per fight, survives a failed final edit and resets on replay', async () => {
  const reports = []
  const f = fixture({ onComplete: (report) => reports.push(report) })
  await f.open()
  // Fail only the final result edit, after the combat transaction committed.
  f.interaction.editReply = async payload => {
    if (['VICTORY', 'DEFEAT'].includes(payload.embeds[0].data.title)) throw Error('final display failed')
    f.edits.push(payload)
  }
  while (!reports.length) await f.turn()
  await f.elapse(1000)
  assert.equal(reports.length, 1)
  assert.ok(reports[0].rounds > 0)
  assert.equal(reports[0].winner, 'player')
  f.interaction.editReply = async (payload) => f.edits.push(payload)
  await f.click('special1', 0)
  assert.equal(reports.length, 1)
  await f.click('start', f.revision())
  while (reports.length < 2) await f.turn()
  assert.equal(reports.length, 2)
  assert.equal(reports[1].rounds, reports[0].rounds)
  await f.arena.dispose()
  assert.equal(reports.length, 2)
})

test('Quit stops manual fights, rejects stale/foreign controls and allows replay', async () => {
  for (const mode of ['start']) {
    const reports = [],
      f = fixture({ onComplete: (report) => reports.push(report) })
    await f.open(undefined, 1, mode)
    const revision = f.revision()
    await f.click('quit', revision, { user: { id: 'other' } })
    assert.match(f.replies.at(-1).content, /Only the player/)
    await f.click('quit', revision + 1)
    assert.notEqual(f.view().embeds[0].data.title, 'FIGHT ENDED')
    if (mode === 'start') await f.click('special1', revision)
    await f.click('quit', f.revision())
    assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
    assert.equal(button(f.view(), 'special1'), undefined)
    assert.equal(button(f.view(), 'quit'), undefined)
    assert.equal(reports.length, 0)
    await f.click('start', revision)
    assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
    await f.click('start', f.revision())
    assert.equal(f.battle().player.hp, 260)
    assert.equal(f.battle().player.stress, 6)
    await f.arena.dispose()
    assert.equal(f.timers.size, 0)
  }
})

test('Quit during the Finisher cancels both timers and never resolves its paid damage', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f)
  await f.click('special3', f.revision())
  const old = f.revision()
  await f.click('quit', old)
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  await f.click('pick:5', old)
  await f.elapse(14999)
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  assert.doesNotMatch(text(f.view()), /picked 5|no choice/)
  await f.elapse(1)
  assert.deepEqual(f.view().components, [])
  assert.equal(f.timers.size, 0)
})

test('new arena replaces only the same player’s old session and invalidates its old controls', async () => {
  const f = fixture()
  await f.open()
  await f.arena.execute({ ...f.interaction, id: 'new-session' })
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.click('special1', 1)
  assert.match(f.replies.at(-1).content, /session has ended/)
  await f.arena.dispose()
})

test('a replaced lobby cannot leave buttons behind when its initial Discord reply finishes late', async () => {
  const f = fixture()
  let release
  const first = f.arena.execute({
    ...f.interaction,
    reply: async (payload) => {
      f.replies.push(payload)
      return new Promise((resolve) => {
        release = () => resolve({ id: 'late-message' })
      })
    },
  })
  await f.arena.execute({ ...f.interaction, id: 'replacement' })
  release()
  await first
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.click('start', 0, { message: { id: 'late-message' } })
  assert.match(f.replies.at(-1).content, /session has ended/)
  await f.arena.dispose()
})

test('opponents are randomly selected from available fighters with no manual toggle', async () => {
  const f = fixture({ chooseOpponent: choices => { assert.deepEqual(choices, ['marq', 'maxim']); return 'marq' } })
  await f.open()
  assert.equal(button(f.view(), 'opponent'), undefined)
  assert.match(f.view().embeds[0].data.title, /vs Marq/)
  await f.click('opponent', f.revision())
  assert.match(f.view().embeds[0].data.title, /vs Marq/)
  await f.arena.dispose()
})

test('cleanup also removes evicted and disposed sessions and notification failures do not revive controls', async () => {
  const f = fixture({ maxSessions: 1 })
  await f.open()
  await f.arena.execute({ ...f.interaction, id: 'second' })
  assert.deepEqual(f.edits.at(-1).components, [])
  await f.arena.dispose()
  assert.equal(f.timers.size, 0)
  const g = fixture()
  g.interaction.followUp = async () => {
    throw Error('expired webhook')
  }
  await g.arena.execute(g.interaction)
  await g.elapse(15000)
  assert.deepEqual(g.view().components, [])
  assert.equal(g.errors.length, 1)
  assert.equal(g.timers.size, 0)
})
test('expiry still notifies privately when the Discord cleanup edit fails, keeping the lease for recovery', async () => {
  const removed = []
  const f = fixture({ leases: { add() {}, remove: (id) => removed.push(id) } })
  await f.arena.execute(f.interaction)
  f.interaction.editReply = async () => {
    throw Error('network unavailable')
  }
  await f.elapse(15000)
  assert.equal(f.notices.length, 1)
  assert.deepEqual(removed, [])
  assert.equal(f.timers.size, 0)
  await f.click('start', 0)
  assert.equal(f.replies.at(-1).ephemeral, true)
})
test('Quit is ignored while a delayed tick edit locks controls and works once processing completes', async () => {
  const f = fixture()
  await f.open()
  let release
  f.interaction.editReply = (payload) => {
    f.edits.push(payload)
    return new Promise((resolve) => {
      release = resolve
    })
  }
  const tick = f.turn()
  await new Promise(resolve => setImmediate(resolve))
  const quit = f.click('quit', f.revision())
  f.interaction.editReply = async (payload) => f.edits.push(payload)
  release()
  await tick
  await quit
  assert.match(f.view().embeds[0].data.title, /Marq vs Maxim/)
  await f.click('quit', f.revision())
  assert.equal(f.view().embeds[0].data.title, 'FIGHT ENDED')
  assert.equal(button(f.view(), 'special1'), undefined)
  assert.ok(button(f.view(), 'start'))
  await f.elapse(15000)
  assert.deepEqual(f.view().components, [])
  assert.equal(f.timers.size, 0)
})

test('message leases store only references and restart recovery edits only our messages in the development guild', async (t) => {
  const {
    createLeaseStore,
    recoverArenaMessages,
  } = require('../services/arena/message-leases')
  const fs = require('node:fs'),
    path = require('node:path')
  const dir = fs.mkdtempSync(path.resolve('artifacts/arena-lease-test-')),
    file = path.join(dir, 'leases.json')
  t.after(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    fs.rmdirSync(dir)
  })
  const store = createLeaseStore(file)
  const row = {
    guildId: '12345678901234567',
    channelId: '23456789012345678',
    messageId: '34567890123456789',
  }
  store.add(row)
  store.add(row)
  assert.deepEqual(store.list(), [row])
  const old = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => {
    for (const [key, value] of [
      ['NODE_ENV', old.env],
      ['GUILDID', old.guild],
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const edits = []
  const client = {
    user: { id: 'bot' },
    channels: {
      fetch: async () => ({
        guildId: row.guildId,
        messages: {
          fetch: async () => ({
            author: { id: 'bot' },
            edit: async (value) => edits.push(value),
          }),
        },
      }),
    },
  }
  process.env.NODE_ENV = 'production'
  process.env.GUILDID = row.guildId
  await recoverArenaMessages(client, { store })
  assert.equal(edits.length, 0)
  process.env.NODE_ENV = 'development'
  process.env.GUILDID = 'other'
  await recoverArenaMessages(client, { store })
  assert.equal(edits.length, 0)
  process.env.GUILDID = row.guildId
  await recoverArenaMessages(client, { store })
  assert.deepEqual(edits[0].components, [])
  assert.deepEqual(store.list(), [])
})

test('a pick arriving at or after the response deadline is rejected', async () => {
  const f = fixture({ rollDuality: () => 6 })
  await readyFinisher(f); await f.click('special3', f.revision())
  const revision = f.revision()
  f.setClock(5000); await f.click('pick:5', revision)
  await f.elapse(0)
  assert.match(text(f.view()), /no choice · 30%/)
  assert.doesNotMatch(text(f.view()), /picked 5/)
  await f.arena.dispose()
})
