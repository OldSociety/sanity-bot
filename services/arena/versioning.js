const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const store = path.join(root, 'artifacts/arena-versions')
const mechanics = [
  'combat', 'controller', 'rules', 'tactics', 'damage', 'damage-types',
  'outcomes', 'resources', 'duality', 'passives', 'hendrix', 'selene',
  'kylax', 'resistance', 'stress-effects', 'characters', 'prototype-catalog',
  'opponents', 'balance-config', 'build-profile', 'character-config',
]
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])])
  )
  return value
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

// Explicit allowlist: never archive credentials, databases, player state, or reports.
function capture() {
  const sources = {}
  const files = fs.readdirSync(__dirname).filter(name => name.endsWith('.js'))
    .map(name => `services/arena/${name}`)
  for (const file of ['commands/Arena/Arena.js', 'Events/ArenaReady.js', 'package-lock.json'])
    if (fs.existsSync(path.join(root, file))) files.push(file)
  for (const name of ['arena-testing.json', 'arena-templates-production.json',
    ...(process.env.NODE_ENV === 'production' ? ['arena-private-diagnostics-production.json'] : [])])
    files.push(`config/arena/${name}`)
  for (const file of files.sort()) sources[file] = fs.readFileSync(path.join(root, file), 'utf8')
  const balance = structuredClone(require('./rules').balance)
  const { productionPlaytest } = require('./build-profile')
  const builds = process.env.NODE_ENV === 'production'
    ? productionPlaytest ? require('../../config/arena/arena-builds-production.json') : {}
    : require('./character-config').sheets
  const mechanicsSources = Object.fromEntries(mechanics.map(name => {
    const key = `services/arena/${name}.js`
    return [key, sources[key]]
  }))
  const release = require('../../config/arena/arena-version.json').release
  if (!/^\d+\.\d+\.\d+$/.test(release)) throw Error('Arena release must be Major.Minor.Revision')
  const rules = { schema: 1, balance, builds, sources: mechanicsSources }
  return { release, sources, rules, rulesHash: digest(rules),
    buildHash: digest({ release, sources, balance, builds }) }
}

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function exclusive(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
}
function register(candidate, { directory = store, environment = process.env.NODE_ENV, now = () => new Date().toISOString() } = {}) {
  if (!['production', 'development'].includes(environment)) throw Error('Arena build requires a live environment')
  fs.mkdirSync(directory, { recursive: true })
  const lock = path.join(directory, 'registration.lock')
  // Concurrent starts must not allocate duplicate IDs. Fail clearly, never guess.
  const handle = fs.openSync(lock, 'wx')
  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, environment, at: now() }))
    const records = fs.readdirSync(directory).filter(name => /^build-\d+\.json$/.test(name)).map(name => read(path.join(directory, name)))
    const ruleRecords = fs.readdirSync(directory).filter(name => /^ruleset-\d+\.json$/.test(name)).map(name => read(path.join(directory, name)))
    for (const row of ruleRecords)
      if (digest(row.snapshot) !== row.hash) throw Error(`Arena ruleset ${row.id} archive was modified`)
    for (const row of records) {
      const release = row.version.split('.').slice(0, 3).join('.')
      if (digest({ release, sources: row.sources, balance: row.balance, builds: row.builds }) !== row.hash)
        throw Error(`Arena build ${row.id} archive was modified`)
    }
    let ruleset = ruleRecords.find(row => row.hash === candidate.rulesHash)
    if (!ruleset) {
      ruleset = { id: Math.max(0, ...ruleRecords.map(row => row.id)) + 1, hash: candidate.rulesHash,
        createdAt: now(), snapshot: candidate.rules }
      exclusive(path.join(directory, `ruleset-${ruleset.id}.json`), ruleset)
    }
    let build = records.find(row => row.hash === candidate.buildHash)
    if (!build) {
      const id = Math.max(0, ...records.map(row => row.id)) + 1
      build = { id, version: `${candidate.release}.${id}`, hash: candidate.buildHash,
        rulesetId: ruleset.id, rulesetHash: candidate.rulesHash, createdAt: now(),
        sources: candidate.sources, balance: candidate.rules.balance, builds: candidate.rules.builds }
      exclusive(path.join(directory, `build-${id}.json`), build)
    }
    if (build.rulesetHash !== candidate.rulesHash) throw Error('Arena build/ruleset mismatch')
    const stamp = { version: build.version, build: build.id, buildHash: build.hash,
      rulesetId: ruleset.id, rulesetHash: ruleset.hash, environment }
    fs.appendFileSync(path.join(directory, 'activations.jsonl'), JSON.stringify({ at: now(), pid: process.pid, ...stamp }) + '\n')
    return Object.freeze(stamp)
  } finally {
    fs.closeSync(handle)
    fs.unlinkSync(lock)
  }
}
let runtime
function runtimeVersion() {
  if (runtime) return runtime
  if (process.env.NODE_TEST_CONTEXT || !['production', 'development'].includes(process.env.NODE_ENV))
    return Object.freeze({ version: 'untracked', rulesetId: null, environment: process.env.NODE_ENV || 'test' })
  runtime = register(capture())
  console.info('Arena activated:', JSON.stringify(runtime))
  return runtime
}
function label(stamp) {
  return stamp ? `Arena ${stamp.version} | Ruleset ${stamp.rulesetId ?? 'untracked'} | ${stamp.environment}` : 'Arena version untracked'
}
module.exports = { canonical, digest, capture, register, runtimeVersion, label }
