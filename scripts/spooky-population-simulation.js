// Offline behavioral model: actual gameplay handlers, in-memory adapters, no bot/DB.
// This deliberately does not enable the event or alter its approved configuration.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Op } = require('sequelize')
const { config, pieces } = require('../services/spooky/config')
const { calculateRefill } = require('../services/spooky/participants')
const { selectAction } = require('../services/spooky/actions')
const { createCollection } = require('../services/spooky/collection')
const { createTheft } = require('../services/spooky/theft')
const { createPlayful } = require('../services/spooky/playful')
const { createProgression } = require('../services/spooky/progression')

function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const dayMs = 86400000,
  start = Date.parse(config.startsAt),
  end = Date.parse(config.endsAt)
const profiles = [
  { name: 'casual', join: 1, min: 3, max: 4, miss: 0.2 },
  { name: 'regular', join: 1, min: 6, max: 10, miss: 0 },
  { name: 'engaged75', join: 1, min: 60, max: 60, miss: 0 },
  { name: 'engaged87', join: 1, min: 70, max: 70, miss: 0 },
  { name: 'engaged100', join: 1, min: 80, max: 80, miss: 0 },
  { name: 'late10', join: 10, min: 80, max: 80, miss: 0 },
  { name: 'late15', join: 15, min: 80, max: 80, miss: 0 },
]
const scenarios = [
  {
    name: 'baseline',
    treat: 0.5,
    visits: 4,
    bank: 0,
    unwanted: false,
    outsiders: 10,
  },
  {
    name: 'allTreat',
    treat: 1,
    visits: 4,
    bank: 0,
    unwanted: false,
    outsiders: 10,
  },
  {
    name: 'trickHeavy',
    treat: 0.25,
    visits: 4,
    bank: 0,
    unwanted: false,
    outsiders: 10,
  },
  {
    name: 'dailyVisit',
    treat: 0.5,
    visits: 1,
    bank: 0,
    unwanted: false,
    outsiders: 10,
  },
  {
    name: 'bank20',
    treat: 0.5,
    visits: 4,
    bank: 20,
    unwanted: false,
    outsiders: 10,
  },
  {
    name: 'bank100Unwanted',
    treat: 0.5,
    visits: 4,
    bank: 100,
    unwanted: true,
    outsiders: 10,
  },
  {
    name: 'noOutsiders',
    treat: 0.5,
    visits: 4,
    bank: 0,
    unwanted: false,
    outsiders: 0,
  },
  {
    name: 'drainCandy',
    treat: 0.5,
    visits: 4,
    bank: 0,
    unwanted: false,
    outsiders: 10,
    drain: true,
  },
]

// Small Sequelize-shaped adapters support ONLY the interfaces used by these
// handlers. They are not a substitute for the disposable SQLite contract tests.
function memoryGuild(specs, options, random) {
  const members = specs.map((spec, index) => ({
    userId: String(index),
    bot: false,
    displayName: `Player ${index}`,
    nickname: null,
    roleIds: [],
    canManageCurse: true,
    canManageNickname: true,
    canManageSweetTooth: true,
    ...spec,
  }))
  const players = new Map(),
    inventory = [],
    effectRows = [],
    crownAwards = [],
    wallets = new Map(), previousOutcomes = new Map()
  const totals = {
    candySeeded: 0,
    candyRefilled: 0,
    candyMinted: 0,
    candySpent: 0,
    eyesMinted: 0,
    eyesSpent: 0,
    eyesTransferred: 0,
    candyTransferred: 0,
  }
  const matches = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && Object.hasOwn(v, Op.in)) return v[Op.in].includes(row[k])
      return row[k] === v
    })
  const row = (values) =>
    Object.assign(values, {
      get() { return this },
      async update(values) {
        Object.assign(this, values)
        return this
      },
    })
  const stats = new Map(
    members.map((m) => [
      m.userId,
      {
        actions: 0,
        blockedActions: 0,
        draws: 0,
        fateDraws: 0,
        duplicatesGenerated: 0,
        exchanges: 0,
        eyeLoss: 0,
        candyLoss: 0,
        milestones: {},
        outcomes: {},
        cursedActions: 0,
      },
    ]),
  )
  const Participant = {
    sequelize: null,
    async findAll({ where }) {
      return [...players.values()].filter((r) => matches(r, where))
    },
    // Sequelize returns a fresh instance. Collection keeps its own running Eye
    // snapshot while changeBalance writes storage; aliasing double-debits it.
    async findByPk(id) {
      const p = players.get(id)
      return p ? { ...p } : null
    },
    async findOne({ where }) {
      return [...players.values()].find((r) => matches(r, where))
    },
  }
  const models = {
    // Projections succeed before the next simulated action, so there are no
    // outstanding restoration intents in this adapter (outages use DB tests).
    Delivery: { async findOne() { return null } },
    Participant,
    Ledger: { async findOne({ where }) { return crownAwards.filter(row => matches(row, where)).at(-1) || null } },
    EventState: {
      async findOne() {
        return null
      },
    },
    Effect: {
      async findOne({ where }) {
        return effectRows.find(r => matches(r, where)) || null
      },
      async findAll({ where }) {
        return effectRows.filter((r) => matches(r, where))
      },
    },
    Inventory: {
      async findAll({ where }) {
        return inventory.filter((r) => matches(r, where))
      },
      async create(values) {
        const r = row(values)
        inventory.push(r)
        return r
      },
    },
  }
  const participants = {
    async prepare(ctx, id) {
      let p = players.get(id)
      if (!p) {
        p = row({
          ...ctx.scope,
          id,
          userId: id,
          registeredAt: null,
          candy: config.candy.starting,
          eyes: 0,
          refillAnchor: ctx.now,
          treatPrestige: 0,
          trickPrestige: 0,
        })
        players.set(id, p)
        totals.candySeeded += p.candy
      }
      const next = calculateRefill({
        candy: p.candy,
        refillAnchor: p.refillAnchor,
        now: ctx.now,
      })
      totals.candyRefilled += next.delta
      p.candy = next.candy
      p.refillAnchor = next.refillAnchor
      return { participant: p }
    },
  }
  const effects = {
    async active(ctx, id, type) {
      return (
        effectRows.find(
          (r) =>
            r.participantId === id &&
            r.effectType === type &&
            new Date(r.expiresAt) > ctx.now,
        ) || null
      )
    },
    async put(ctx, id, type, values) {
      await participants.prepare(ctx, id)
      let r = effectRows.find(
        (r) => r.participantId === id && r.effectType === type,
      )
      const next = {
        ...values,
        expiresAt: new Date(
          Math.min(end, new Date(values.expiresAt).getTime()),
        ),
      }
      if (r) Object.assign(r, next)
      else {
        r = row({ participantId: id, effectType: type, ...next })
        effectRows.push(r)
      }
      return r
    },
    async remove(_ctx, id, type) {
      const index = effectRows.findIndex(
        (r) => r.participantId === id && r.effectType === type,
      )
      return index < 0 ? null : effectRows.splice(index, 1)[0]
    },
  }
  // Assume post-commit Discord projections succeed before the next action.
  // Nicknames are short, all human targets manageable; no external role edits.
  const delivery = {
    async enqueue(_ctx, id, type, values) {
      const m = members.find((m) => m.userId === id)
      if (type === 'nickname') m.nickname = values.nickname
      else if (values.present && !m.roleIds.includes(values.roleId))
        m.roleIds.push(values.roleId)
      else if (!values.present)
        m.roleIds = m.roleIds.filter((r) => r !== values.roleId)
    },
  }
  const collection = createCollection({ models, participants, random })
  const listMembers = async () => members
  const playful = createPlayful({
    models,
    participants,
    effects,
    collection,
    delivery,
    listMembers,
    roleIds: { curse: 'curse', sweetTooth: 'sweet' },
    random,
  })
  const theft = createTheft({
    effects, delivery,
    models,
    participants,
    collection,
    listMembers,
    random,
  })
  const User = {
    sequelize: null,
    async findByPk(id) {
      return wallets.get(id)
    },
    async update(values, { where }) {
      const wallet = wallets.get(where.user_id)
      if (!wallet || wallet.bank !== where.bank) return [0]
      Object.assign(wallet, values)
      return [1]
    },
  }
  const progression = createProgression({
    User,
    models,
    isUnwanted: async () => options.unwanted,
  })
  const handlers = progression.wrapHandlers({
    ...playful.handlers,
    ...theft.handlers,
    ...require('../services/spooky/candy-events').createCandyEvents({ models, participants, effects, delivery, listMembers, random }).handlers,
  })
  function context(now) {
    const ctx = {
      now: new Date(now),
      scope: { eventId: config.eventId, guildId: 'simulation' },
      transaction: null,
      async record(entry) {
        // Only crown ownership is queried by gameplay. Retain its durable
        // marker without storing millions of unrelated simulation audit rows.
        if (['crown_award', 'crown_holder'].includes(entry.resource)) crownAwards.push({ id: crownAwards.length + 1, ...ctx.scope, ...entry })
        if (entry.resource === 'candy' && entry.delta > 0)
          totals.candyMinted += entry.delta
      },
      async changeBalance(id, resource, delta, { metadata = {} } = {}) {
        const p = players.get(id),
          next = p[resource] + delta
        if (
          !Number.isSafeInteger(next) ||
          next < 0 ||
          (resource === 'candy' && next > config.candy.capacity)
        )
          throw new Error('Invalid simulated balance')
        p[resource] = next
        if (resource === 'candy') {
          if (delta > 0) totals.candyMinted += delta
          else if (metadata.reason === 'action_cost') totals.candySpent -= delta
        } else if (resource === 'eyes') {
          if (delta > 0) totals.eyesMinted += delta
          else totals.eyesSpent -= delta
        }
      },
      async transfer(from, to, resource, amount) {
        const a = players.get(from),
          b = players.get(to)
        if (
          amount <= 0 ||
          a[resource] < amount ||
          (resource === 'candy' && b.candy + amount > config.candy.capacity)
        )
          throw new Error('Invalid simulated transfer')
        a[resource] -= amount
        b[resource] += amount
        if (resource === 'eyes') {
          totals.eyesTransferred += amount
          stats.get(from).eyeLoss += amount
        } else {
          totals.candyTransferred += amount
          stats.get(from).candyLoss += amount
        }
      },
    }
    return ctx
  }
  function awards(id, receipt, now, source) {
    const s = stats.get(id)
    for (const award of receipt.awards) {
      if (award.source === 'duplicate_exchange') s.exchanges++
      else {
        s.draws++
        if (source === 'fate') s.fateDraws++
      }
      if (award.duplicate) s.duplicatesGenerated++
    }
    const day = (now - start) / dayMs + 1
    for (const [key, reached] of [
      ['quarter', s.draws > 0],
      ['character', receipt.completeCharacters.length >= 1],
      ['three', receipt.completeCharacters.length >= 3],
      ['seven', receipt.completeCharacters.length === 7],
    ]) {
      if (reached && s.milestones[key] === undefined) s.milestones[key] = day
    }
  }
  async function register(id, now) {
    const ctx = context(now),
      { participant } = await participants.prepare(ctx, id)
    if (!participant.registeredAt) {
      participant.registeredAt = ctx.now
      wallets.set(id, { user_id: id, bank: options.bank })
    }
  }
  async function fate(id, now) {
    const ctx = context(now),
      wallet = wallets.get(id)
    // This diagnostic scenario spends only Bank; Fate starts at zero and no external
    // reward sources. The player chooses to spend every affordable banked draw.
    while (wallet.bank >= config.fate.quarterCost) {
      wallet.bank -= config.fate.quarterCost
      awards(id, await collection.drawFateQuarter(ctx, id), now, 'fate')
    }
  }
  async function action(id, action, now) {
    const before = players.get(id), snapshot = before && { candy: before.candy, refillAnchor: before.refillAnchor },
      refillTotal = totals.candyRefilled
    const ctx = context(now),
      { participant: p } = await participants.prepare(ctx, id)
    if (!p.registeredAt) throw new Error('Unregistered simulated action')
    if (!p.candy) {
      stats.get(id).blockedActions++
      return false
    }
    const cursed = Boolean(await effects.active(ctx, id, 'curse'))
    const plan = { ...selectAction({ action, cursed, crownHolderId: await playful.crownHolder(ctx), actorId: id, previousOutcome: previousOutcomes.get(id), random }), actorId: id }
    await ctx.changeBalance(id, 'candy', -1, {
      metadata: { reason: 'action_cost' },
    })
    let result
    try { result = await handlers[plan.outcome](ctx, plan) }
    catch (error) {
      if (!['NO_REVERSAL_TARGET', 'NO_CANDY_TARGET'].includes(error.code)) throw error
      // This specific rejection occurs before any handler write. Model only
      // the action-cost rollback; arbitrary partial failures need real SQLite.
      Object.assign(p, snapshot); totals.candyRefilled = refillTotal; totals.candySpent--; return false
    }
    previousOutcomes.set(id, plan.outcome)
    const s = stats.get(id)
    s.actions++
    s.cursedActions += Number(cursed)
    s.outcomes[plan.outcome] = (s.outcomes[plan.outcome] || 0) + 1
    if (result.awards) awards(id, result, now, 'eye')
    return true
  }
  function finish() {
    const candy = [...players.values()].reduce((sum, p) => sum + p.candy, 0)
    const eyes = [...players.values()].reduce((sum, p) => sum + p.eyes, 0)
    if (
      candy !==
      totals.candySeeded +
        totals.candyRefilled +
        totals.candyMinted -
        totals.candySpent
    )
      throw new Error('Candy conservation failed')
    if (eyes !== totals.eyesMinted - totals.eyesSpent)
      throw new Error('Eye conservation failed')
    return members
      .filter((m) => m.profile)
      .map((m) => {
        const p = players.get(m.userId),
          owned = inventory.filter((r) => r.participantId === m.userId)
        const complete = new Set(pieces.map((p) => p.characterId))
        const characters = [...complete].filter((id) =>
          pieces
            .filter((p) => p.characterId === id)
            .every((p) => owned.some((r) => r.pieceId === p.id)),
        ).length
        const pending = calculateRefill({
          candy: p.candy,
          refillAnchor: p.refillAnchor,
          now: end - 1,
        })
        return {
          profile: m.profile,
          ...stats.get(m.userId),
          characters,
          pieces: owned.length,
          duplicatesRemaining: owned.reduce((n, r) => n + r.quantity - 1, 0),
          candy: p.candy,
          candyAccruedAtClose: pending.candy,
          eyes: p.eyes,
          bank: wallets.get(m.userId).bank,
          treatPrestige: p.treatPrestige,
          trickPrestige: p.trickPrestige,
        }
      })
  }
  return {
    register,
    fate,
    action,
    finish,
    players,
    members,
    stats,
    totals,
    collection,
    context,
  }
}

async function simulateGuild(options, seed) {
  // Separate schedules and outcomes: a different outcome mix does not change
  // visit times or missed days. Guilds are independent; members within one aren't.
  const scheduleRandom = seededRandom(seed),
    random = seededRandom(seed ^ 0x9e3779b9)
  const specs = profiles.flatMap((p) =>
    Array.from({ length: 3 }, () => ({ profile: p.name })),
  )
  specs.push(...Array.from({ length: options.outsiders }, () => ({})))
  const guild = memoryGuild(specs, options, random),
    events = []
  specs.forEach((spec, index) => {
    if (!spec.profile) return
    const profile = profiles.find((p) => p.name === spec.profile)
    // Visit phase staggered by member, same phase across days. Four visits every
    // six hours, or one daily. Each visit is a sequential manual action session.
    const phase = scheduleRandom() * 6
    for (let day = profile.join; day <= 31; day++) {
      if (day !== profile.join && scheduleRandom() < profile.miss) continue
      const budget =
        profile.min +
        Math.floor(scheduleRandom() * (profile.max - profile.min + 1))
      for (let visit = 0; visit < options.visits; visit++) {
        const hour = phase + visit * (24 / options.visits)
        const now = start + ((day - 1) * 24 + hour) * 3600000
        if (now >= end) continue
        const attempts =
          Math.floor(((visit + 1) * budget) / options.visits) -
          Math.floor((visit * budget) / options.visits)
        events.push({
          id: String(index),
          now,
          attempts,
          drain: options.drain && profile.min >= 60,
        })
      }
    }
  })
  // Merge visits and their individual actions in time order. A session must not
  // run ahead of a different player's visit (especially with overlapping shields).
  const queue = [],
    earlier = (a, b) =>
      a.now < b.now || (a.now === b.now && Number(a.id) < Number(b.id))
  function push(entry) {
    queue.push(entry)
    let i = queue.length - 1
    while (i && earlier(queue[i], queue[(i - 1) >> 1])) {
      const parent = (i - 1) >> 1
      ;[queue[i], queue[parent]] = [queue[parent], queue[i]]
      i = parent
    }
  }
  function pop() {
    const first = queue[0],
      last = queue.pop()
    if (queue.length) {
      queue[0] = last
      let i = 0
      while (true) {
        let child = i * 2 + 1
        if (child >= queue.length) break
        if (child + 1 < queue.length && earlier(queue[child + 1], queue[child]))
          child++
        if (!earlier(queue[child], queue[i])) break
        ;[queue[i], queue[child]] = [queue[child], queue[i]]
        i = child
      }
    }
    return first
  }
  for (const entry of events) push({ ...entry, index: -1 })
  while (queue.length) {
    const visit = pop()
    if (visit.now >= end) continue
    if (visit.index === -1) {
      await guild.register(visit.id, visit.now)
      await guild.fate(visit.id, visit.now)
      if (visit.attempts || visit.drain) push({ ...visit, index: 0 })
      continue
    }
    const limit = visit.drain ? 1000 : visit.attempts
    if (
      !(await guild.action(
        visit.id,
        random() < options.treat ? 'treat' : 'trick',
        visit.now,
      ))
    )
      continue
    await guild.fate(visit.id, visit.now)
    if (visit.drain && visit.index === limit - 1)
      throw new Error('Drain session exceeded safety bound')
    if (visit.index + 1 < limit)
      push({ ...visit, now: visit.now + 2000, index: visit.index + 1 })
  }
  return { rows: guild.finish(), totals: guild.totals }
}
function distribution(values) {
  values.sort((a, b) => a - b)
  const q = (f) =>
    values.length ? values[Math.floor((values.length - 1) * f)] : null
  return {
    mean: values.length
      ? values.reduce((s, x) => s + x, 0) / values.length
      : null,
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
  }
}
function summarize(rows) {
  const metrics = [
    'actions',
    'blockedActions',
    'draws',
    'fateDraws',
    'characters',
    'pieces',
    'duplicatesGenerated',
    'exchanges',
    'eyeLoss',
    'candyLoss',
    'duplicatesRemaining',
    'candy',
    'candyAccruedAtClose',
    'eyes',
    'bank',
    'treatPrestige',
    'trickPrestige',
    'cursedActions',
  ]
  return Object.fromEntries(
    profiles.map((p) => {
      const group = rows.filter((r) => r.profile === p.name)
      return [
        p.name,
        {
          players: group.length,
          metrics: Object.fromEntries(
            metrics.map((k) => [k, distribution(group.map((r) => r[k]))]),
          ),
          milestones: Object.fromEntries(
            ['quarter', 'character', 'three', 'seven'].map((k) => {
              const reached = group.filter((r) => r.milestones[k] !== undefined)
              return [
                k,
                {
                  reached: reached.length,
                  probability: reached.length / group.length,
                  never: group.length - reached.length,
                  calendarDayWhenReached: distribution(
                    reached.map((r) => r.milestones[k]),
                  ),
                  daysSinceJoinWhenReached: distribution(
                    reached.map((r) => r.milestones[k] - p.join),
                  ),
                },
              ]
            }),
          ),
        },
      ]
    }),
  )
}
async function main() {
  const trials = Number(process.argv[2] || 100)
  if (!Number.isSafeInteger(trials) || trials < 1 || trials > 1000)
    throw new Error('Guild trials must be 1..1000')
  const sourceFiles = [
    'scripts/spooky-population-simulation.js',
    'config/spooky-2026.json',
    'config/spooky-pieces.json',
    ...[
      'config',
      'participants',
      'actions',
      'collection',
      'theft',
      'combat',
      'candy-events',
      'playful',
      'progression',
    ].map((n) => `services/spooky/${n}.js`),
  ]
  const hashes = Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(__dirname, '..', file)))
        .digest('hex'),
    ]),
  )
  const results = {
    version: 1,
    configVersion: config.version,
    seedBase: 170026,
    trialsPerScenario: trials,
    profiles,
    hashes,
    scenarios: {},
  }
  for (const options of scenarios) {
    const rows = [],
      totals = {}
    for (let trial = 0; trial < trials; trial++) {
      const result = await simulateGuild(options, results.seedBase + trial)
      rows.push(...result.rows)
      for (const [key, value] of Object.entries(result.totals))
        totals[key] = (totals[key] || 0) + value
    }
    results.scenarios[options.name] = {
      options,
      totals,
      cohorts: summarize(rows),
    }
    console.log(
      `${options.name}: ${rows.length} player-months, ${totals.candySpent} actions; conservation passed`,
    )
  }
  const output = path.join(__dirname, '../docs/spooky-population-results.json')
  fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n')
  console.log(`Saved ${output}`)
}
if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
module.exports = {
  memoryGuild,
  simulateGuild,
  summarize,
  seededRandom,
  profiles,
  scenarios,
}
