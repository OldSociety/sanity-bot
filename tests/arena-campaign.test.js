const test = require('node:test')
const assert = require('node:assert/strict')
const { createCampaign } = require('../services/arena/campaign')
const {
  loadCatalog,
  validateTower,
} = require('../services/arena/campaign-catalog')

function fixture(overrides = {}) {
  let current,
    expiry,
    time = 0,
    deny = false,
    fail = false
  const payloads = []
  const campaign = createCampaign({
    environment: () => 'development',
    authorize: async () => !deny,
    now: () => time,
    timeoutMs: 1000,
    setTimer: (callback) => {
      expiry = callback
      return 1
    },
    clearTimer: () => {},
    ...overrides,
  })
  const serialize = (payload) => ({
    ...payload,
    embeds: payload.embeds.map((embed) => embed.toJSON?.() || embed),
    components: payload.components.map((row) => row.toJSON?.() || row),
  })
  const editReply = async (payload) => {
    if (fail) {
      fail = false
      throw Error('delivery failed')
    }
    current = serialize({ ...current, ...payload })
    payloads.push(current)
    return { id: 'message' }
  }
  const interaction = {
    user: { id: 'owner' },
    guildId: 'guild',
    channelId: 'channel',
    deferReply: async (payload) => assert.equal(payload.ephemeral, true),
    editReply,
    reply: async (payload) => payloads.push(payload),
  }
  const control = (action) =>
    current.components
      .flatMap((row) => row.components)
      .find((component) => component.custom_id.endsWith(`:${action}`))
  async function click(action, extra = {}) {
    const customId = extra.customId || control(action)?.custom_id
    await campaign.handleButton({
      ...interaction,
      message: { id: 'message' },
      customId,
      deferUpdate: async () => {},
      update: editReply,
      ...extra,
    })
  }
  return {
    campaign,
    interaction,
    click,
    control,
    payloads,
    get current() {
      return current
    },
    expire: () => expiry(),
    advance: () => {
      time = 1001
    },
    deny: () => {
      deny = true
    },
    fail: () => {
      fail = true
    },
  }
}

test('catalog reserves 50 towers, has one ordered ten-fight climb, and supports shorter climbs', () => {
  const catalog = loadCatalog()
  assert.equal(catalog.length, 50)
  assert.equal(catalog.filter((tower) => tower.available).length, 1)
  assert.equal(catalog[0].encounters.length, 10)
  assert.equal(catalog[0].encounters[9].boss, true)
  const short = structuredClone(catalog[0])
  short.encounters = [...short.encounters.slice(0, 2), short.encounters[9]]
  assert.equal(validateTower(short).encounters.length, 3)
  short.encounters[0].health = 0
  assert.throws(() => validateTower(short))
  assert.throws(() => loadCatalog([catalog[0], catalog[0]]), /Duplicate/)
})

test('choose tower, see ten fights and final boss, then enter first-fight placeholder and return', async () => {
  const f = fixture()
  try {
    await f.campaign.execute(f.interaction)
    assert.match(f.current.embeds[0].title, /Choose a tower/)
    await f.click('select', { values: ['tower-01'] })
    assert(f.current.embeds[0].description.includes('10. Marq [Spooky] — BOSS'))
    await f.click('begin')
    assert.equal(f.current.embeds[0].title, 'Azulis [Classic] — Fight 1/10')
    assert.match(f.current.embeds[0].description, /180 HP/)
    assert.equal(f.control('combat').disabled, true)
    await f.click('combat')
    assert.match(f.payloads.at(-1).content, /not available/)
    await f.click('tower')
    await f.click('towers')
    assert.match(f.current.embeds[0].title, /Choose a tower/)
  } finally {
    f.campaign.dispose()
  }
})

test('page through all 50 towers without making unfinished towers selectable', async () => {
  const f = fixture()
  try {
    await f.campaign.execute(f.interaction)
    const first = f.control('select').custom_id
    await f.click('select', { values: ['tower-02'] })
    assert.match(f.payloads.at(-1).content, /not available/)
    for (let page = 1; page < 10; page++) await f.click('next')
    assert.match(f.current.embeds[0].footer.text, /Towers 46–50 of 50/)
    assert.equal(f.control('next').disabled, true)
    assert.equal(f.control('select'), undefined)
    await f.click('select', { customId: first, values: ['tower-01'] })
    assert.match(f.payloads.at(-1).content, /changed/)
    for (let page = 9; page > 0; page--) await f.click('previous')
    assert.equal(f.control('previous').disabled, true)
  } finally {
    f.campaign.dispose()
  }
})

test('reject other owners, other messages, changed access, and production entry', async () => {
  const f = fixture()
  try {
    await f.campaign.execute(f.interaction)
    await f.click('select', { user: { id: 'other' }, values: ['tower-01'] })
    assert.match(f.payloads.at(-1).content, /another session/)
    await f.click('select', { message: { id: 'other' }, values: ['tower-01'] })
    assert.match(f.payloads.at(-1).content, /another session/)
    const count = f.payloads.length
    f.deny()
    await f.click('select', { values: ['tower-01'] })
    assert.equal(f.payloads.length, count)
  } finally {
    f.campaign.dispose()
  }
  const prod = fixture({ environment: () => 'production' })
  await prod.campaign.execute(prod.interaction)
  assert.match(prod.payloads.at(-1).content, /development bot only/)
})

test('duplicate clicks cannot advance, failed delivery can retry, and cancel closes controls', async () => {
  const f = fixture()
  try {
    await f.campaign.execute(f.interaction)
    const old = f.control('select').custom_id
    f.fail()
    await assert.rejects(
      f.click('select', { values: ['tower-01'] }),
      /delivery failed/,
    )
    await f.click('select', { customId: old, values: ['tower-01'] })
    await f.click('select', { customId: old, values: ['tower-01'] })
    assert.match(f.payloads.at(-1).content, /changed/)
    const close = f.control('close').custom_id
    await f.click('close')
    assert.deepEqual(f.current.components, [])
    await f.click('close', { customId: close })
    assert.deepEqual(f.current.components, [])
  } finally {
    f.campaign.dispose()
  }
})

test('expired menus lose controls and cannot be used after restart or timeout', async () => {
  const f = fixture()
  await f.campaign.execute(f.interaction)
  const old = f.control('select').custom_id
  await f.expire()
  assert.deepEqual(f.current.components, [])
  await f.click('select', { customId: old, values: ['tower-01'] })
  assert.deepEqual(f.current.components, [])
  await f.campaign.execute(f.interaction)
  f.advance()
  await f.click('select', { values: ['tower-01'] })
  assert.deepEqual(f.current.components, [])
  f.campaign.dispose()
})

test('development command schema uses actual subcommands with required management options', () => {
  const { execFileSync } = require('node:child_process')
  for (const environment of ['development', 'production']) {
    const schema = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          "console.log(JSON.stringify(require('./commands/Arena/Arena').data.toJSON()))",
        ],
        { env: { ...process.env, NODE_ENV: environment }, encoding: 'utf8' },
      ),
    )
    if (environment === 'production')
      assert.deepEqual(
        schema.options.map((option) => option.name),
        ['access'],
      )
    else {
      assert.deepEqual(
        schema.options.map((option) => option.name),
        ['fight', 'campaign', 'shop', 'access', 'diagnostic'],
      )
      assert(schema.options.every((option) => option.type === 1))
      assert.equal(schema.options.find(option => option.name === 'access').options[0].required, true)
      assert.equal(schema.options.find(option => option.name === 'diagnostic').options[0].required, true)
    }
  }
})

function isolatedModule(file, dependencies) {
  const fs = require('node:fs'),
    path = require('node:path'),
    vm = require('node:vm')
  const module = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    {
      module,
      process: { env: { NODE_ENV: 'development' } },
      console,
      require: (name) => {
        if (name === 'discord.js') return require(name)
        if (!(name in dependencies))
          throw Error(`Unexpected dependency: ${name}`)
        return dependencies[name]
      },
    },
    { filename: file },
  )
  return module.exports
}

test('slash routing reaches campaign or existing character selection and retains management controls', async () => {
  const calls = []
  let allowed = true
  const command = isolatedModule('commands/Arena/Arena.js', {
    '../../services/arena/access': {
      access: {
        authorize: async () => allowed,
        manage: async (_, value) => calls.push(['access', value]),
      },
    },
    '../../services/arena/campaign': {
      campaign: { execute: async () => calls.push(['campaign']) },
    },
    '../../services/arena/shop': {
      shop: { execute: async () => calls.push(['shop']) },
    },
    '../../services/arena/controller': {
      arena: {
        execute: async (_, __, options) =>
          calls.push(['fight', options.selection]),
      },
    },
    '../../services/arena/diagnostics': {
      manageDiagnostic: async (_, value) => calls.push(['diagnostic', value]),
    },
  })
  for (const subcommand of ['campaign', 'shop', 'fight', 'access', 'diagnostic']) {
    await command.execute({
      options: {
        getSubcommand: () => subcommand,
        getString: (key) => (key === 'action' ? 'status' : null),
        getBoolean: (key) => (key === 'enabled' ? false : null),
      },
    })
  }
  assert.deepEqual(calls, [
    ['campaign'],
    ['shop'],
    ['fight', true],
    ['access', 'status'],
    ['diagnostic', false],
  ])
  allowed = false
  await command.execute({ options: { getSubcommand: () => 'campaign' } })
  assert.equal(calls.length, 5)
})

test('dispatcher sends campaign dropdowns and buttons to campaign and retains ordinary Arena routing', async () => {
  const calls = []
  const dispatcher = isolatedModule('Events/InteractionCreate.js', {
    '../services/sanity': { handleInteraction: async () => {} },
    '../services/arena/campaign': {
      campaign: { handleButton: async () => calls.push('campaign') },
    },
    '../services/arena/shop': {
      shop: { handleButton: async () => calls.push('shop') },
    },
    '../services/arena/controller': {
      arena: { handleButton: async () => calls.push('fight') },
    },
  })
  for (const type of ['button', 'select'])
    await dispatcher.execute({
      isChatInputCommand: () => false,
      isButton: () => type === 'button',
      isStringSelectMenu: () => type === 'select',
      customId: 'arena:campaign:session:0:select',
    })
  await dispatcher.execute({
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'arena:shop:session:0:pack-bronze',
  })
  await dispatcher.execute({
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'arena:session:0:start',
  })
  assert.deepEqual(calls, ['campaign', 'campaign', 'shop', 'fight'])
})

test('a second click cannot enter while the first navigation delivery is pending', async () => {
  const f = fixture()
  try {
    await f.campaign.execute(f.interaction)
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const first = f.click('select', {
      values: ['tower-01'],
      deferUpdate: () => gate,
    })
    await f.click('select', { values: ['tower-01'] })
    assert.match(f.payloads.at(-1).content, /changed/)
    release()
    await first
    assert.match(f.current.embeds[0].title, /The First Climb/)
  } finally {
    f.campaign.dispose()
  }
})

test('fight options are optional autocomplete inputs and explicit selections route directly without a second acknowledgement', async () => {
  const calls = [], edits = []
  let denied = false
  const variant = { id: 'classic:azu' }
  const command = isolatedModule('commands/Arena/Arena.js', {
    '../../services/arena/access': { access: { authorize: async () => !denied } },
    '../../services/arena/fight-options': { fightOptions: { resolve: async () => ({ character: variant, selection: false, startImmediately: true }) } },
    '../../services/arena/controller': { arena: { execute: async (interaction, character, options) => calls.push({ deferred: interaction.deferred, character, options }) } },
  })
  const fields = command.data.toJSON().options.find(option => option.name === 'fight').options
  assert.deepEqual(Array.from(fields, field => field.name), ['character', 'skin'])
  assert(fields.every(field => field.autocomplete === true && !field.required))
  let acknowledgements = 0
  const interaction = { options: { getSubcommand: () => 'fight', getString: key => ({ character: 'azulis', skin: 'classic:azu' })[key] || null },
    deferReply: async () => { acknowledgements++; interaction.deferred = true }, editReply: async payload => edits.push(payload) }
  await command.execute(interaction)
  assert.equal(acknowledgements, 1)
  assert.equal(calls[0].deferred, true)
  assert.equal(calls[0].character, variant)
  assert.equal(calls[0].options.startImmediately, true)
  denied = true
  await command.execute(interaction)
  assert.equal(calls.length, 1)
})
