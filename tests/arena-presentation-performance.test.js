// Presentation/Discord contracts only. The real combat engine is never called.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { createArena } = require('../services/arena/controller')
const { resolveCharacter } = require('../services/arena/characters')
const { statsForLevel } = require('../services/arena/rules')
const {
  cardName,
  renderHealthCard,
  renderStats,
} = require('../services/arena/health-card')
const {
  createBufferCache,
  createRenderQueue,
} = require('../services/arena/presentation-cache')
const {
  createMessageTransport,
  lockedControls,
} = require('../services/arena/message-transport')
const {
  buildPresentation,
  snapshot,
} = require('../services/arena/presentation')
const { preparedPortrait } = require('../services/arena/portrait')
const { createAsyncPreferenceStore } = require('../services/arena/selection')
const { createAsyncLeaseStore } = require('../services/arena/message-leases')
const { appendReport, flushState } = require('../services/arena/async-state')
const { runEvent } = require('../services/event-errors')
const { installShutdown } = require('../services/arena/shutdown')
const character = resolveCharacter('marq')
const opponent = resolveCharacter('maxim')
function fixedBattle() {
  const actor = (art) => ({
    ...statsForLevel(1, art.kit),
    kit: art.kit,
    name: art.name,
    label: art.label,
    hp: 100,
    maxHp: 200,
    attack: 200,
    level: 1,
    stress: 6,
    maxStress: 6,
    hope: 6,
    maxHope: 6,
    fear: 0,
    focusHits: 6,
    basicHits: 0,
    slayerCharges: 0,
    abilityRanks: { special1: 1, special2: 1, special3: 1 },
  })
  return {
    status: 'playing',
    tick: 0,
    mode: 'active',
    player: actor(character),
    enemy: { ...actor(opponent), isAI: true },
    recentRolls: [],
    history: [],
    actions: [],
  }
}
function state() {
  return {
    id: 'fixture',
    guildId: 'g',
    character,
    opponent: opponent.id,
    level: 1,
    revision: 1,
    busy: false,
    page: 'prefight',
    battle: fixedBattle(),
  }
}
function fixture(options = {}) {
  let clock = 0,
    calls = 0,
    view,
    failures = 0,
    editCalls = 0,
    release
  const edits = [],
    acknowledgements = [],
    timers = new Map(),
    warnings = []
  const message = {
    id: 'm',
    attachments: new Map(),
    components: [],
    edit: async (payload) => {
      editCalls++
      if (failures) {
        failures--
        throw Object.assign(Error('offline'), { status: 503 })
      }
      if (release) await release
      edits.push(payload)
      apply(payload)
      return message
    },
  }
  let serial = 0
  function apply(payload) {
    view = payload
    if (payload.attachments)
      message.attachments = new Map(
        [...message.attachments].filter(([id]) =>
          payload.attachments.some((file) => file.id === id)
        )
      )
    for (const file of payload.files || [])
      message.attachments.set(String(++serial), {
        id: String(serial),
        name: file.name,
      })
    if (payload.components)
      message.components = payload.components.map((row) =>
        row.toJSON ? row.toJSON() : structuredClone(row)
      )
  }
  const engine = {
    newBattle: () => fixedBattle(),
    takeTurn: (battle) => {
      calls++
      return {
        ...battle,
        tick: battle.tick + 1,
        player: { ...battle.player, hp: battle.player.hp - 1 },
      }
    },
    beginFinisher: (battle) => ({
      ...battle,
      finisherPaid: true,
      player: { ...battle.player, hope: 1 },
    }),
  }
  const arena = createArena({
    responsive: true,
    engine,
    chooseOpponent: () => 'maxim',
    renderCard: async (s) => ({
      name: cardName(s),
      attachment: Buffer.from('card'),
    }),
    renderLegend: async () => ({
      name: 'legend.png',
      attachment: Buffer.from('legend'),
    }),
    retryDelay: async () => {},
    now: () => clock,
    setTimer: (work, ms) => {
      const id = ++serial
      timers.set(id, { work, ms })
      return id
    },
    clearTimer: (id) => timers.delete(id),
    setExpiryTimer: () => null,
    clearExpiryTimer() {},
    logger: {
      warn: (...args) => warnings.push(args),
      error: (...args) => warnings.push(args),
    },
    ...options,
  })
  const interaction = {
    id: 'fixture',
    guildId: 'g',
    channelId: 'c',
    user: { id: 'u' },
    deferReply: async () => {},
    editReply: async (payload) => {
      apply(payload)
      return message
    },
    reply: async (payload) => {
      acknowledgements.push(payload)
    },
  }
  const revision = () =>
    Number(
      message.components
        .flatMap((row) => row.components)[0]
        .custom_id.split(':')[2]
    )
  const click = (action, rev = revision(), extra = {}) =>
    arena.handleButton({
      ...interaction,
      message,
      customId: `arena:fixture:${rev}:${action}`,
      update: async (payload) => {
        acknowledgements.push(payload)
        apply(payload)
      },
      deferUpdate: async () => {
        acknowledgements.push('deferred')
      },
      ...extra,
    })
  return {
    arena,
    interaction,
    message,
    edits,
    acknowledgements,
    timers,
    warnings,
    click,
    revision,
    open: async () => {
      await arena.execute(interaction, character)
      await click('start')
    },
    calls: () => calls,
    view: () => view,
    editCalls: () => editCalls,
    fail: (count) => {
      failures = count
    },
    clock: (value) => {
      clock = value
    },
    block: () => {
      let done
      release = new Promise((resolve) => {
        done = resolve
      })
      return () => {
        release = null
        done()
      }
    },
  }
}

test('component acknowledgement locks immediately; one final edit and one synthetic transition', async () => {
  const f = fixture()
  try {
    await f.open()
    const count = f.edits.length
    await f.click('basic')
    assert.equal(f.calls(), 1)
    assert.equal(f.edits.length, count + 1)
    const ack = f.acknowledgements.at(-1)
    assert.equal(ack.files, undefined)
    assert.equal(ack.attachments, undefined)
    assert.equal(ack.components.length, 1)
    assert.equal(ack.components[0].components.length, 5)
    assert.ok(!JSON.stringify(ack).includes(':refresh'))
    assert.ok(
      ack.components
        .flatMap((row) => row.components)
        .filter((item) => !item.custom_id.endsWith(':refresh'))
        .every((item) => item.disabled)
    )
    assert.ok(
      f.message.components
        .flatMap((row) => row.components)
        .some((item) => item.label === 'Basic Attack' && !item.disabled)
    )
    assert.equal(f.edits.at(-1).files.length, 1)
    assert.equal(f.edits.at(-1).attachments.length, 1)
    assert.equal(f.edits.at(-1).attachments[0].filename, 'legend.png')
  } finally {
    await f.arena.dispose()
  }
})

test('slow delivery drops duplicate input; stale input does not run a transition', async () => {
  const f = fixture()
  try {
    await f.open()
    const revision = f.revision(),
      unblock = f.block()
    const pending = f.click('basic')
    await new Promise((resolve) => setImmediate(resolve))
    await f.click('basic', revision)
    assert.equal(f.calls(), 1)
    unblock()
    await pending
    await f.click('basic', revision)
    assert.equal(f.calls(), 1)
  } finally {
    await f.arena.dispose()
  }
})

test('ambiguous failed delivery retries the result once; Refresh never repeats an action', async () => {
  const f = fixture()
  try {
    await f.open()
    f.fail(2)
    const before = f.editCalls()
    await f.click('basic')
    // Two failed result attempts, then one controls-only recovery edit.
    assert.equal(f.editCalls(), before + 3)
    assert.equal(f.edits.at(-1).files, undefined)
    assert.equal(f.edits.at(-1).attachments, undefined)
    assert.equal(f.calls(), 1)
    assert.ok(
      f.message.components
        .flatMap((row) => row.components)
        .some((item) => item.custom_id.endsWith(':refresh') && !item.disabled)
    )
    await f.click('refresh')
    assert.equal(f.calls(), 1)
    assert.match(f.view().embeds[0].data.title, /· 1/)
    assert.ok(
      f.message.components
        .flatMap((row) => row.components)
        .some((item) => item.label === 'Basic Attack' && !item.disabled)
    )
  } finally {
    await f.arena.dispose()
  }
})

test('session edits keep using bot-authenticated message after original token expiry', async () => {
  const f = fixture()
  try {
    await f.open()
    f.interaction.editReply = async () => {
      throw Error('Expired slash token')
    }
    for (let minute = 4; minute <= 20; minute += 4) {
      f.clock(minute * 60 * 1000)
      await f.click('refresh')
      assert.doesNotMatch(f.view().embeds[0].data.description, /expired/)
    }
    assert.ok(f.edits.length >= 6)
    assert.equal(f.calls(), 0)
  } finally {
    await f.arena.dispose()
  }
})

test('failed acknowledgement does not commit or disable the next valid action', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.click('basic', f.revision(), {
      update: async () => {
        throw Error('Unknown interaction')
      },
    })
    assert.equal(f.calls(), 0)
    await f.click('basic')
    assert.equal(f.calls(), 1)
  } finally {
    await f.arena.dispose()
  }
})

test('Finisher deadline starts after successful display; pick acknowledgement failure restores reservation', async () => {
  const f = fixture()
  try {
    await f.open()
    f.fail(2)
    await f.click('special3')
    assert.equal(f.timers.size, 0)
    await f.click('refresh')
    assert.equal(f.timers.size, 1)
    await f.click('pick:1', f.revision(), {
      update: async () => {
        throw Error('Unknown interaction')
      },
    })
    assert.equal(f.calls(), 0)
    assert.equal(f.timers.size, 1)
    await f.click('pick:1')
    assert.equal(f.calls(), 1)
    assert.equal(f.timers.size, 0)
  } finally {
    await f.arena.dispose()
  }
})

test('legend failure preserves card; card failure keeps legend and current text; fallback backs off', async () => {
  const base = state(),
    warnings = []
  const logger = { warn: (text) => warnings.push(text) }
  const card = async (s) => ({
    name: cardName(s),
    attachment: Buffer.from('card'),
  })
  const legend = async () => ({
    name: 'legend.png',
    attachment: Buffer.from('key'),
  })
  const fail = async () => {
    throw Error('missing')
  }
  const a = await buildPresentation(snapshot(base), {
    renderCard: card,
    renderLegend: fail,
    logger,
    now: () => 0,
  })
  assert.ok(a.view.embeds[0].data.image)
  assert.equal(a.view.embeds.length, 1)
  assert.equal(a.files.length, 1)
  const b = await buildPresentation(snapshot(base), {
    renderCard: fail,
    renderLegend: legend,
    logger,
    now: () => 0,
  })
  assert.equal(b.view.embeds[0].data.image, undefined)
  assert.equal(b.view.embeds.length, 2)
  assert.match(JSON.stringify(b.view.embeds), /HP 100\/200/)
  let attempts = 0
  await buildPresentation(
    { ...snapshot(base), cardRetryAt: b.cardRetryAt },
    {
      renderCard: async () => {
        attempts++
        throw Error()
      },
      renderLegend: legend,
      logger,
      now: () => 1,
    }
  )
  assert.equal(attempts, 0)
})

test('bounded caches deduplicate, evict by bytes, and recover rejected entries', async () => {
  const cache = createBufferCache({ maxEntries: 2, maxBytes: 4 })
  let calls = 0
  const work = async () => {
    calls++
    return Buffer.alloc(3)
  }
  await Promise.all([cache.get('a', work), cache.get('a', work)])
  assert.equal(calls, 1)
  await cache.get('b', work)
  assert.equal(cache.snapshot().entries, 1)
  await assert.rejects(
    cache.get('bad', () => {
      throw Error('bad')
    })
  )
  assert.equal((await cache.get('bad', () => Buffer.alloc(1))).length, 1)
  assert.ok(cache.snapshot().bytes <= 4)
})

test('native render queue bounds concurrency and admission', async () => {
  const queue = createRenderQueue({ concurrency: 1, maxPending: 1 })
  let release
  const first = queue.run(
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  await new Promise((resolve) => setImmediate(resolve))
  const second = queue.run(() => 'second')
  await assert.rejects(
    queue.run(() => 'overflow'),
    /busy/
  )
  release('first')
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
})

test('fixed-state template output matches legacy pixels and reuses both portraits/frames', async () => {
  const fixed = state()
  const reference = await renderHealthCard(fixed, { optimized: false })
  const optimized = await renderHealthCard(fixed, { optimized: true })
  const raw = (file) => sharp(file.attachment).raw().toBuffer()
  assert.equal(
    (await raw(optimized)).equals(await raw(reference)),
    true,
    'rendered pixels must remain identical'
  )
  const hits = renderStats().templates.hits
  fixed.battle.player.hp = 50
  const changed = await renderHealthCard(fixed, { optimized: true })
  assert.equal(renderStats().templates.hits, hits + 1)
  assert.notEqual(changed.name, optimized.name)
})

test('portrait cache invalidates replacement artwork at the same path', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-portrait-'))
  const file = path.join(dir, 'portrait.png')
  try {
    const image = (color) =>
      sharp({
        create: { width: 20, height: 30, channels: 4, background: color },
      })
        .png()
        .toBuffer()
    await fs.writeFile(file, await image('#ff0000'))
    const before = await preparedPortrait({ image: file })
    await fs.writeFile(file, await image('#00ff00'))
    const after = await preparedPortrait({ image: file })
    assert.notEqual(before.key, after.key)
    assert.notDeepEqual(before.attachment, after.attachment)
  } finally {
    await fs.unlink(file).catch(() => {})
    await fs.rmdir(dir)
  }
})

test('async preferences, leases, and analytics serialize without losing concurrent writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-state-'))
  const prefs = path.join(dir, 'prefs.json'),
    leases = path.join(dir, 'leases.json'),
    reports = path.join(dir, 'reports.jsonl')
  try {
    const a = createAsyncPreferenceStore(prefs),
      b = createAsyncPreferenceStore(prefs)
    await Promise.all([
      a.set('g', 'u', { variantId: 'a' }),
      b.set('g', 'v', { variantId: 'b' }),
    ])
    assert.equal((await a.get('g', 'u')).variantId, 'a')
    assert.equal((await b.get('g', 'v')).variantId, 'b')
    const store = createAsyncLeaseStore(leases)
    await Promise.all(
      ['1', '2'].map((id) =>
        store.add({
          guildId: '1'.repeat(18),
          channelId: '2'.repeat(18),
          messageId: id.repeat(18),
        })
      )
    )
    assert.equal((await store.list()).length, 2)
    await store.remove('1'.repeat(18))
    assert.equal((await store.list()).length, 1)
    await Promise.all([
      appendReport(reports, 'one\n'),
      appendReport(reports, 'two\n'),
    ])
    await flushState()
    assert.equal(await fs.readFile(reports, 'utf8'), 'one\ntwo\n')
    await fs.writeFile(prefs, 'broken')
    await assert.rejects(a.set('g', 'u', {}))
    assert.equal(await fs.readFile(prefs, 'utf8'), 'broken')
  } finally {
    for (const file of await fs.readdir(dir))
      await fs.unlink(path.join(dir, file))
    await fs.rmdir(dir)
  }
})

test('permanent message errors do not retry and event rejection is handled safely', async () => {
  let edits = 0,
    replies = 0
  const transport = createMessageTransport({
    edit: async () => {
      edits++
      throw Object.assign(Error('gone'), { code: 10008 })
    },
  })
  await assert.rejects(transport.send({ components: [] }, []))
  assert.equal(edits, 1)
  await runEvent(
    {
      name: 'interactionCreate',
      execute: async () => {
        throw Error('secret token')
      },
    },
    [
      {
        isRepliable: () => true,
        reply: async () => {
          replies++
        },
      },
    ],
    { error: (...args) => assert.ok(!args.join(' ').includes('secret')) }
  )
  assert.equal(replies, 1)
})

test('component locking preserves menus and strips old Refresh controls', () => {
  const payload = lockedControls(
    {
      components: [
        { type: 1, components: [{ type: 3, custom_id: 'menu', options: [] }] },
      ],
    },
    's',
    2
  )
  assert.equal(payload.components[0].components[0].disabled, true)
  assert.equal(payload.components.length, 1)
  const recovery = lockedControls({ components: payload.components }, 's', 2, {
    recovery: true,
  })
  assert.equal(recovery.components.length, 2)
  assert.equal(
    lockedControls({ components: recovery.components }, 's', 3).components
      .length,
    1
  )
})

test('expiry during rendering discards the in-flight snapshot and removes controls', async () => {
  let waiting, release
  const began = new Promise((resolve) => {
    waiting = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let pause = false
  const f = fixture({
    renderCard: async (s) => {
      if (pause) {
        pause = false
        waiting()
        await gate
      }
      return { name: cardName(s), attachment: Buffer.from('card') }
    },
  })
  await f.open()
  pause = true
  const pending = f.click('basic')
  await began
  const disposal = f.arena.dispose()
  release()
  await Promise.all([pending, disposal])
  assert.equal(f.calls(), 1)
  assert.deepEqual(f.message.components, [])
  assert.match(f.view().embeds[0].data.description, /expired/)
})

test('refresh of an unchanged view retains both attachments without upload', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.click('refresh')
    assert.equal(f.edits.at(-1).files, undefined)
    assert.equal(f.edits.at(-1).attachments, undefined)
    assert.equal(f.message.attachments.size, 2)
  } finally {
    await f.arena.dispose()
  }
})

test('legacy presentation remains available with responsive mode disabled', async () => {
  const f = fixture({ responsive: false })
  try {
    await f.open()
    await f.click('basic')
    assert.equal(f.calls(), 1)
    assert.equal(f.acknowledgements.at(-1), 'deferred')
    assert.equal(f.edits.length, 0) // Legacy edits use the original slash callback.
  } finally {
    await f.arena.dispose()
  }
})

test('development shutdown waits for sessions and pending writes before destroying client', async () => {
  const events = [],
    registered = []
  let release
  const wait = new Promise((resolve) => {
    release = resolve
  })
  const stop = installShutdown(
    { destroy: async () => events.push('destroy') },
    {
      signals: { once: (signal, fn) => registered.push([signal, fn]) },
      dispose: async () => {
        events.push('dispose')
        await wait
      },
      flush: async () => events.push('flush'),
      exit: (code) => events.push(`exit:${code}`),
      setTimer: () => ({}),
      clearTimer() {},
    }
  )
  const pending = stop()
  await stop()
  assert.deepEqual(events, ['dispose'])
  release()
  await pending
  assert.deepEqual(events, ['dispose', 'flush', 'destroy', 'exit:0'])
  assert.deepEqual(
    registered.map(([signal]) => signal),
    ['SIGINT', 'SIGTERM']
  )
})
