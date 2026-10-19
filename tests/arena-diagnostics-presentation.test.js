// Fixed event/statistics fixtures only; never runs a combat exchange.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  summaryFields,
  reportLines,
  recapText,
  timingFooter,
} = require('../services/arena/battle-report')
const {
  screen,
  actionLines,
  historyFields,
} = require('../services/arena/interface')
const { buildPresentation } = require('../services/arena/presentation')
const { cardName } = require('../services/arena/health-card')
const { resolveCharacter } = require('../services/arena/characters')
const { createTiming } = require('../services/arena/timing')
const {
  createDiagnosticSettings,
  manageDiagnostic,
} = require('../services/arena/diagnostics')
const { isBotAdmin } = require('../utils/botAdmin')
const history = [
  { kind: 'sacrifice', tick: 10, actor: 'Marq', hp: 3, name: 'Stoke' },
  {
    kind: 'roll',
    tick: 10,
    hope: 10,
    fear: 2,
    total: 12,
    success: true,
    withHope: true,
  },
  {
    kind: 'hit',
    tick: 10,
    actor: 'Maxim',
    target: 'Marq',
    damage: 6,
    outcome: 'hit',
  },
  {
    kind: 'hit',
    tick: 10,
    actor: 'Marq',
    target: 'Maxim',
    damage: 5,
    outcome: 'critical',
  },
  {
    kind: 'special',
    tick: 10,
    actor: 'Marq',
    slot: 'special1',
    type: 'heal',
    name: 'Life',
    healing: 14,
    damage: 0,
    cost: 1,
    resource: 'Stress',
  },
  {
    kind: 'special',
    tick: 10,
    actor: 'Maxim',
    slot: 'special2',
    type: 'buff',
    name: 'Slayer',
    hits: 3,
    percent: 7,
    damage: 0,
    cost: 2,
    resource: 'Fear',
  },
]
function fixture(status = 'victory', diagnostic = true) {
  const character = resolveCharacter('marq'),
    opponent = resolveCharacter('maxim')
  const actor = (art) => ({
    kit: art.kit,
    name: art.name,
    label: art.label,
    hp: 40,
    maxHp: 200,
    attack: 200,
    level: 1,
    stress: 6,
    maxStress: 6,
    hope: 6,
    fear: 0,
    abilityRanks: { special1: 1, special2: 1, special3: 1 },
  })
  const stat = {
    damage: {
      basic: 12,
      special1: 10,
      special2: 15,
      special3: 50,
      bleeding: 4,
    },
    hpDamage: 80,
    overkill: 11,
    hpRestored: 20,
    brinkActivations: 1,
    criticals: { basic: 2 },
    blocks: { basic: 3, special2: 1 },
    uses: { special1: 3, special2: 2, special3: 1 },
    resource: 'Hope',
    generated: 9,
    spent: 7,
    superMoveResistance: { attempts: 2, resisted: 1, prevented: 25 },
    stressSpent: 3,
    stressRecovered: 1,
  }
  return {
    id: 'fixed',
    revision: 1,
    character,
    opponent: opponent.id,
    guildId: 'g',
    level: 1,
    presentationV2: true,
    diagnostic,
    roundTimings: { 10: { totalMs: 2000 } },
    battle: {
      status,
      tick: 10,
      player: actor(character),
      enemy: { ...actor(opponent), isAI: true },
      history: structuredClone(history),
      recentRolls: [],
      actions: [],
      statistics: {
        player: structuredClone(stat),
        enemy: { ...structuredClone(stat), blocks: { basic: 6, special1: 2 } },
      },
    },
  }
}

test('recap separates basic, non-final specials, final, bleed, effective HP and self payment', () => {
  const state = fixture(),
    [player, enemy] = summaryFields(state.battle)
  assert.match(
    player.value,
    /Basic \*\*12\*\* · Specials S1\/S2 \*\*25\*\* · Final \*\*50\*\* · Bleeding \*\*4\*\*/
  )
  assert.match(
    player.value,
    /Total damage \*\*91\*\* · HP removed \*\*80\*\* · Overkill \*\*11\*\*/
  )
  assert.match(player.value, /HP restored \*\*20\*\* · Self-damage \*\*3\*\*/)
  assert.match(
    player.value,
    /Criticals \*\*2\*\* · Specials used \*\*5\*\* · Finals used \*\*1\*\*/
  )
  assert.match(
    player.value,
    /Packets blocked \*\*8\*\* · Own packets blocked \*\*4\*\*/
  )
  assert.match(player.value, /Finals resisted \*\*1 \/ 2\*\*/)
  assert.match(enemy.value, /Self-damage \*\*0\*\*/)
})

test('mirror fighters retain independent self damage totals', () => {
  const state = fixture()
  state.battle.enemy.name = 'Marq'
  state.battle.history = [
    { kind: 'sacrifice', tick: 1, actor: 'Your Marq', hp: 3 },
    { kind: 'sacrifice', tick: 1, actor: 'Marq', hp: 6 },
  ]
  const fields = summaryFields(state.battle)
  assert.match(fields[0].value, /Self-damage \*\*3\*\*/)
  assert.match(fields[1].value, /Self-damage \*\*6\*\*/)
})

test('full log numbers the roll once and appends completed round latency', () => {
  const lines = reportLines(history, actionLines, {
    timings: { 10: { totalMs: 2000 } },
  })
  assert.match(lines[0], /^\*\*10\.\*\* 🟡10 \+ 🟣2 = 12/)
  assert.equal(lines.filter((line) => line.startsWith('**10.**')).length, 1)
  assert.ok(lines.includes('Maxim hit Marq for 6.'))
  assert.equal(lines.at(-1), '(2000ms)')
  assert.ok(lines.some((line) => line.includes('Spent 1 Stress')))
})

test('compact logs omit rolls, costs and support narrative but preserve damage and healing', () => {
  const text = reportLines(history, actionLines, { diagnostic: false }).join(
    '\n'
  )
  assert.match(text, /\*\*6\*\* damage/)
  assert.match(text, /\*\*−3 HP\*\* self-damage/)
  assert.match(text, /\*\*\+14 HP\*\* healed/)
  assert.doesNotMatch(text, /🟡|Success|Critical|Spent|Stress/)
})

test('missing-roll rounds still have a single round header; failed deliveries are labelled', () => {
  const lines = reportLines(
    history.filter((event) => event.kind !== 'roll'),
    actionLines,
    { timings: { 10: { totalMs: 300, failed: true } } }
  )
  assert.equal(lines[0], '**10.**')
  assert.equal(lines.filter((line) => line.startsWith('**10.**')).length, 1)
  assert.equal(lines.at(-1), '(300ms) · delivery failed')
})

test('finished screen shows recap before log, hides prototype rewards, and stays under embed limits', () => {
  const state = fixture()
  state.battle.history = Array.from({ length: 200 }, (_, i) =>
    history.map((event) => ({ ...event, tick: i + 1 }))
  ).flat()
  const view = screen(state),
    data = view.embeds[0].data
  assert.doesNotMatch(data.description, /Rewards/)
  assert.match(data.fields[0].name, /You/)
  assert.match(data.fields[1].name, /Opponent/)
  assert.equal(data.fields[2].name, 'Combat log')
  assert.ok(
    data.fields
      .filter((field) => field.name.startsWith('Combat log'))
      .every((field) => /^\*\*\d+\.\*\*/.test(field.value))
  )
  assert.ok(data.fields.every((field) => field.value.length <= 1024))
  const length =
    (data.title || '').length +
    data.description.length +
    (data.footer?.text || '').length +
    data.fields.reduce(
      (n, field) => n + field.name.length + field.value.length,
      0
    )
  assert.ok(length <= 6000)
  assert.match(data.description, /omitted/)
})

test('legacy finished presentation retains its original history budget and fields', () => {
  const state = fixture()
  state.presentationV2 = false
  state.battle.history = Array.from({ length: 100 }, (_, i) =>
    history.map((event) => ({ ...event, tick: i + 1 }))
  ).flat()
  const expected = historyFields(state.battle.history)
  const data = screen(state).embeds[0].data
  assert.deepEqual(data.fields, expected.fields)
  assert.match(data.description, /Rewards/)
})

test('full download begins with recap and preserves all rounds beyond embed truncation', async () => {
  const state = fixture()
  state.battle.history.push({
    kind: 'hit',
    tick: 11,
    actor: 'Marq',
    target: 'Maxim',
    damage: 9,
    outcome: 'hit',
  })
  const original = structuredClone(state.battle)
  const result = await buildPresentation(state)
  const text = result.files[0].attachment.toString()
  assert.match(text, /^BATTLE RECAP/)
  assert.ok(text.indexOf('Basic **12**') < text.indexOf('ROUND LOG'))
  assert.match(text, /\*\*11\.\*\*/)
  assert.match(text, /\(2000ms\)/)
  assert.deepEqual(state.battle, original)
  const firstName = result.files[0].name
  state.roundTimings[11] = { totalMs: 340 }
  const updated = await buildPresentation(state)
  assert.notEqual(updated.files[0].name, firstName)
  assert.match(updated.files[0].attachment.toString(), /\(340ms\)/)
})

test('diagnostic log toggle preserves live dice, emojis, thumbnail, card and status key', async () => {
  const compact = fixture('playing', false),
    full = fixture('playing', true)
  for (const state of [compact, full]) {
    state.guildId = require('../config/arena/arena-emojis.json').guildId
    state.battle.duality = {
      hope: 10, fear: 2, total: 12, success: true, withHope: true,
    }
    state.battle.recentRolls = [{ tick: state.battle.tick }]
  }
  assert.equal(cardName(compact), cardName(full))
  const original = structuredClone(compact.battle)
  let legends = 0
  const result = await buildPresentation(compact, {
    renderCard: async (state) => ({
      name: cardName(state),
      attachment: Buffer.from('card'),
    }),
    renderLegend: async () => {
      legends++
      return { name: 'legend.png', attachment: Buffer.from('legend') }
    },
  })
  assert.equal(result.view.embeds.length, 2)
  assert.equal(legends, 1)
  assert.equal(result.files.length, 2)
  // buildPresentation resolves the art version before generating the card key.
  full.assetVersion = compact.assetVersion
  const compactView = result.view.embeds[0].data,
    fullView = screen(full).embeds[0].data
  assert.equal(compactView.description, fullView.description)
  assert.match(compactView.description, /<a:HOPE:.*\*\*10\*\*.*<a:FEAR:.*\*\*2\*\*/)
  assert.deepEqual(compactView.thumbnail, fullView.thumbnail)
  assert.ok(compactView.thumbnail.url.includes('cdn.discordapp.com/emojis/'))
  assert.equal(compactView.image.url, fullView.image.url)
  assert.doesNotMatch(
    JSON.stringify(compactView.fields),
    /🟡|Success with Hope|Spent|\(2000ms\)/
  )
  assert.deepEqual(compact.battle, original)
  assert.equal(screen(full).embeds.length, 2)
})

test('compact logs hide timing records and recap diagnostics while preserving gameplay', async () => {
  const state = fixture('victory', false)
  state.interactionTimings = [{ action: 'basic', round: 10, totalMs: 2000, combatMs: 18 }]
  const result = await buildPresentation(state)
  const text = result.files[0].attachment.toString()
  assert.match(text, /BATTLE RECAP|ROUND LOG/)
  assert.match(text, /\*\*\+14 HP\*\* healed/)
  assert.doesNotMatch(text, /2000ms|INTERACTION TIMINGS|combatMs|Round timings|🟡10|Spent 1 Stress/)
  assert.doesNotMatch(JSON.stringify(result.view.embeds), /2000ms|🟡10|Spent 1 Stress/)
})

test('visible processing timing and completed delivery timing remain distinct', async () => {
  const record = []
  const timing = createTiming({
    sample: false,
    onFinish: (result) => record.push(result),
    logger: {},
  })
  await timing.phase('ackMs', async () => {})
  const beforeSend = timing.snapshot()
  assert.equal(beforeSend.deliveryMs, undefined)
  const view = screen(fixture('playing'))
  timingFooter(view, { elapsedMs: 125 }, { totalMs: 2000 })
  assert.match(
    view.embeds[0].data.footer.text,
    /Processing \(125ms\).*Previous update total \(2000ms\)/
  )
  await timing.phase('deliveryMs', async () => {})
  const result = timing.finish({ action: 'basic' })
  assert.equal(record.length, 1)
  assert.ok(Number.isFinite(result.deliveryMs))
  assert.ok(result.totalMs >= beforeSend.elapsedMs)
})

test('only configured bot admin can toggle; explicit false is not treated as missing', async () => {
  const writes = [],
    replies = []
  const interaction = {
    deferReply: async () => {},
    reply: async (value) => replies.push(value),
    editReply: async (value) => replies.push(value),
  }
  await manageDiagnostic(interaction, false, {
    environment: 'development',
    authorize: async () => false,
    settings: { set: (value) => writes.push(value) },
  })
  assert.equal(writes.length, 0)
  await manageDiagnostic(interaction, false, {
    environment: 'development',
    authorize: async () => true,
    settings: { set: (value) => writes.push(value) },
  })
  assert.deepEqual(writes, [false])
  assert.match(replies.at(-1).content, /diagnostic: false/)
  assert.equal(
    isBotAdmin(
      { guildId: 'g', user: { id: '1'.repeat(18) } },
      { GUILDID: 'g', BOTADMINID: '1'.repeat(18) }
    ),
    true
  )
  assert.equal(
    isBotAdmin(
      { guildId: 'g', user: { id: '2'.repeat(18) } },
      { GUILDID: 'g', BOTADMINID: '1'.repeat(18) }
    ),
    false
  )
})

test('production rejects diagnostic changes and its command schema stays unchanged', async () => {
  let writes = 0
  await manageDiagnostic({ reply: async () => {} }, true, {
    environment: 'production',
    authorize: async () => true,
    settings: {
      set: () => {
        writes++
      },
    },
  })
  assert.equal(writes, 0)
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      "process.stdout.write(JSON.stringify(require('./commands/Arena/Arena').data.toJSON()))",
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    }
  )
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(
    JSON.parse(child.stdout).options.map((option) => option.name),
    ['access']
  )
  const dev = require('../commands/Arena/Arena').data.toJSON()
  assert.equal(
    dev.options.find((option) => option.name === 'diagnostic').type,
    5
  )
})

test('diagnostic setting persists atomically with compact default; malformed data is not overwritten', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arena-diagnostic-')
  )
  const file = path.join(directory, 'settings.json')
  try {
    const settings = createDiagnosticSettings(file)
    assert.equal(await settings.get(), false)
    await settings.set(true)
    assert.equal(await createDiagnosticSettings(file).get(), true)
    await settings.set(false)
    assert.equal(await createDiagnosticSettings(file).get(), false)
    await fs.writeFile(file, 'malformed')
    const broken = createDiagnosticSettings(file)
    await assert.rejects(broken.get())
    await assert.rejects(broken.set(true))
    assert.equal(await fs.readFile(file, 'utf8'), 'malformed')
  } finally {
    for (const entry of await fs.readdir(directory))
      await fs.unlink(path.join(directory, entry))
    await fs.rmdir(directory)
  }
})
