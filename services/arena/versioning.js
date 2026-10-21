const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const store = path.join(root, 'artifacts/arena-versions')
const mechanics = [
  'combat',
  'rules',
  'tactics',
  'damage',
  'damage-types',
  'outcomes',
  'resources',
  'duality',
  'passives',
  'hendrix',
  'selene',
  'kylax',
  'resistance',
  'stress-effects',
  'characters',
  'prototype-catalog',
  'opponents',
  'balance-config',
  'build-profile',
  'character-config',
]
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  return value
}
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')

// UI, access, progression and orchestration stay in the full build snapshot.
// Put new combat rules (including controller timing/choice rules) in these
// modules or resolved balance, rather than expanding this to whole UI modules.
function rulesSnapshot({ balance, builds, sources }) {
  return {
    schema: 2,
    balance,
    builds,
    sources: Object.fromEntries(
      mechanics.map((name) => {
        const key = `services/arena/${name}.js`
        if (typeof sources[key] !== 'string')
          throw Error(`Arena combat source missing: ${key}`)
        return [key, sources[key]]
      }),
    ),
  }
}

function comparisonHash(snapshot) {
  // Project historical broad snapshots in memory; never rewrite their hashes,
  // IDs or contents. Unknown schemas retain exact-hash matching only.
  return digest(
    snapshot.schema === 1 || snapshot.schema === 2
      ? rulesSnapshot(snapshot)
      : snapshot,
  )
}

// Explicit allowlist: never archive credentials, databases, player state, or reports.
function capture() {
  const sources = {}
  const files = fs
    .readdirSync(__dirname)
    .filter((name) => name.endsWith('.js'))
    .map((name) => `services/arena/${name}`)
  for (const file of [
    'commands/Arena/Arena.js',
    'Events/ArenaReady.js',
    'package-lock.json',
  ])
    if (fs.existsSync(path.join(root, file))) files.push(file)
  for (const name of [
    'arena-testing.json',
    'arena-templates-production.json',
    ...(process.env.NODE_ENV === 'production'
      ? ['arena-private-diagnostics-production.json']
      : []),
  ])
    files.push(`config/arena/${name}`)
  for (const file of files.sort())
    sources[file] = fs.readFileSync(path.join(root, file), 'utf8')
  if (process.env.NODE_ENV !== 'production') {
    for (const folder of ['campaign', 'shop', 'progression']) {
      for (const name of fs
        .readdirSync(path.join(root, `config/arena/${folder}`))
        .filter((name) => name.endsWith('.json'))
        .sort()) {
        const file = `config/arena/${folder}/${name}`
        sources[file] = fs.readFileSync(path.join(root, file), 'utf8')
      }
    }
  }
  const balance = structuredClone(require('./rules').balance)
  const { productionPlaytest } = require('./build-profile')
  const builds =
    process.env.NODE_ENV === 'production'
      ? productionPlaytest
        ? require('../../config/arena/arena-builds-production.json')
        : {}
      : require('./character-config').sheets
  const release = require('../../config/arena/arena-version.json').release
  if (!/^\d+\.\d+\.\d+$/.test(release))
    throw Error('Arena release must be Major.Minor.Revision')
  const rules = rulesSnapshot({ balance, builds, sources })
  return {
    release,
    sources,
    rules,
    rulesHash: digest(rules),
    buildHash: digest({ release, sources, balance, builds }),
  }
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function exclusive(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
}
function register(
  candidate,
  {
    directory = store,
    environment = process.env.NODE_ENV,
    now = () => new Date().toISOString(),
  } = {},
) {
  if (!['production', 'development'].includes(environment))
    throw Error('Arena build requires a live environment')
  fs.mkdirSync(directory, { recursive: true })
  const lock = path.join(directory, 'registration.lock')
  // Concurrent starts must not allocate duplicate IDs. Fail clearly, never guess.
  const handle = fs.openSync(lock, 'wx')
  try {
    fs.writeFileSync(
      handle,
      JSON.stringify({ pid: process.pid, environment, at: now() }),
    )
    const records = fs
      .readdirSync(directory)
      .filter((name) => /^build-\d+\.json$/.test(name))
      .map((name) => read(path.join(directory, name)))
    const ruleRecords = fs
      .readdirSync(directory)
      .filter((name) => /^ruleset-\d+\.json$/.test(name))
      .map((name) => read(path.join(directory, name)))
    for (const row of ruleRecords)
      if (digest(row.snapshot) !== row.hash)
        throw Error(`Arena ruleset ${row.id} archive was modified`)
    for (const row of records) {
      const release = row.version.split('.').slice(0, 3).join('.')
      if (
        digest({
          release,
          sources: row.sources,
          balance: row.balance,
          builds: row.builds,
        }) !== row.hash
      )
        throw Error(`Arena build ${row.id} archive was modified`)
    }
    if (digest(candidate.rules) !== candidate.rulesHash)
      throw Error('Arena candidate ruleset hash mismatch')
    const build = records.find((row) => row.hash === candidate.buildHash)
    const candidateComparisonHash = comparisonHash(candidate.rules)
    const matchingRules = ruleRecords.filter(
      (row) => comparisonHash(row.snapshot) === candidateComparisonHash,
    )
    // Exact restarts/rollbacks retain their original link. New builds reuse the
    // most recent equivalent ruleset, avoiding a policy-only ruleset increment.
    let ruleset = build
      ? matchingRules.find((row) => row.id === build.rulesetId)
      : matchingRules.sort((a, b) => b.id - a.id)[0]
    if (build && (!ruleset || build.rulesetHash !== ruleset.hash))
      throw Error('Arena build/ruleset mismatch')
    if (!ruleset) {
      ruleset = {
        id: Math.max(0, ...ruleRecords.map((row) => row.id)) + 1,
        hash: candidate.rulesHash,
        createdAt: now(),
        snapshot: candidate.rules,
      }
      exclusive(path.join(directory, `ruleset-${ruleset.id}.json`), ruleset)
    }
    let registeredBuild = build
    if (!registeredBuild) {
      const id = Math.max(0, ...records.map((row) => row.id)) + 1
      registeredBuild = {
        id,
        version: `${candidate.release}.${id}`,
        hash: candidate.buildHash,
        rulesetId: ruleset.id,
        rulesetHash: ruleset.hash,
        createdAt: now(),
        sources: candidate.sources,
        balance: candidate.rules.balance,
        builds: candidate.rules.builds,
      }
      exclusive(path.join(directory, `build-${id}.json`), registeredBuild)
    }
    const stamp = {
      version: registeredBuild.version,
      build: registeredBuild.id,
      buildHash: registeredBuild.hash,
      rulesetId: ruleset.id,
      rulesetHash: ruleset.hash,
      environment,
    }
    fs.appendFileSync(
      path.join(directory, 'activations.jsonl'),
      JSON.stringify({ at: now(), pid: process.pid, ...stamp }) + '\n',
    )
    return Object.freeze(stamp)
  } finally {
    fs.closeSync(handle)
    fs.unlinkSync(lock)
  }
}
let runtime
function runtimeVersion() {
  if (runtime) return runtime
  if (
    process.env.NODE_TEST_CONTEXT ||
    !['production', 'development'].includes(process.env.NODE_ENV)
  )
    return Object.freeze({
      version: 'untracked',
      rulesetId: null,
      environment: process.env.NODE_ENV || 'test',
    })
  runtime = register(capture())
  console.info('Arena activated:', JSON.stringify(runtime))
  return runtime
}
function label(stamp) {
  return stamp
    ? `Arena ${stamp.version} | Ruleset ${stamp.rulesetId ?? 'untracked'} | ${
        stamp.environment
      }`
    : 'Arena version untracked'
}
module.exports = {
  canonical, digest, rulesSnapshot, capture, register, runtimeVersion, label,
}
