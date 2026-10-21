const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { digest, rulesSnapshot, register, label } = require('../services/arena/versioning')
function candidate({ damage = 10, presentation = 'first', release = '0.0.0' } = {}) {
  const rules = { balance: { damage }, builds: {}, sources: { combat: 'unchanged' } }
  const sources = { presentation }
  return { release, sources, rules, rulesHash: digest(rules),
    buildHash: digest({ release, sources, balance: rules.balance, builds: rules.builds }) }
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-versions-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { directory, environment: 'development', now: () => '2026-10-20T00:00:00.000Z' }
}
test('builds increment on changed activation; restarts and exact promotions reuse identifiers', t => {
  const opts = fixture(t), first = register(candidate(), opts)
  assert.equal(first.version, '0.0.0.1')
  assert.equal(first.rulesetId, 1)
  assert.deepEqual(register(candidate(), opts), first)
  const production = register(candidate(), { ...opts, environment: 'production' })
  assert.equal(production.version, first.version)
  assert.equal(production.rulesetId, first.rulesetId)
  assert.equal(production.environment, 'production')
  assert.equal(fs.readFileSync(path.join(opts.directory, 'activations.jsonl'), 'utf8').trim().split('\n').length, 3)
})
test('presentation builds share rulesets; 10 to 8 damage gets distinct ruleset; rollback reuses originals', t => {
  const opts = fixture(t)
  const first = register(candidate(), opts)
  const visual = register(candidate({ presentation: 'new footer' }), opts)
  assert.equal(visual.build, 2)
  assert.equal(visual.rulesetId, first.rulesetId)
  const balance = register(candidate({ damage: 8 }), opts)
  assert.equal(balance.build, 3)
  assert.equal(balance.rulesetId, 2)
  assert.deepEqual(register(candidate(), opts), first)
  const release = register(candidate({ release: '0.1.0' }), opts)
  assert.equal(release.version, '0.1.0.4')
  assert.equal(release.rulesetId, 1)
})
test('archives retain snapshots and refuse tampering; registration lock prevents collisions', t => {
  const opts = fixture(t)
  register(candidate(), opts)
  const file = path.join(opts.directory, 'ruleset-1.json')
  const saved = JSON.parse(fs.readFileSync(file))
  assert.equal(saved.snapshot.balance.damage, 10)
  saved.snapshot.balance.damage = 8
  fs.writeFileSync(file, JSON.stringify(saved))
  assert.throws(() => register(candidate(), opts), /archive was modified/)
  assert.equal(fs.existsSync(path.join(opts.directory, 'registration.lock')), false)
  fs.writeFileSync(path.join(opts.directory, 'registration.lock'), 'other process')
  assert.throws(() => register(candidate(), opts), /EEXIST/)
})
test('canonical hashes ignore key order and footer identifies environment', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }))
  assert.match(label({ version: '0.0.0.1', rulesetId: 2, environment: 'production' }), /0\.0\.0\.1.*Ruleset 2.*production/)
})

function scopedCandidate(sources, balance = { damage: 10 }, builds = {}) {
  const rules = rulesSnapshot({ sources, balance, builds })
  const release = '0.0.0'
  return { release, sources, rules, rulesHash: digest(rules),
    buildHash: digest({ release, sources, balance, builds }) }
}

function arenaSources() {
  const directory = path.resolve(__dirname, '../services/arena')
  return Object.fromEntries(fs.readdirSync(directory)
    .filter(name => name.endsWith('.js'))
    .map(name => [`services/arena/${name}`, fs.readFileSync(path.join(directory, name), 'utf8')]))
}

test('controller, menus, access and selection change builds without changing combat rulesets', t => {
  const opts = fixture(t), sources = arenaSources()
  const first = register(scopedCandidate(sources), opts)
  for (const name of ['controller', 'menu-lifecycle', 'player-access', 'player-progression',
    'fight-options', 'selection', 'campaign', 'shop', 'interface']) {
    sources[`services/arena/${name}.js`] += '\n// UI change'
    const next = register(scopedCandidate(sources), opts)
    assert.ok(next.build > first.build, name)
    assert.equal(next.rulesetId, first.rulesetId, name)
  }
})

test('combat, AI, balance and character sheets still allocate distinct rulesets', t => {
  const opts = fixture(t), sources = arenaSources()
  const first = register(scopedCandidate(sources), opts)
  for (const name of ['combat', 'tactics', 'damage', 'resources', 'rules', 'resistance']) {
    sources[`services/arena/${name}.js`] += '\n// mechanics change'
    assert.notEqual(register(scopedCandidate(sources), opts).rulesetId, first.rulesetId, name)
  }
  const before = register(scopedCandidate(sources), opts)
  const balance = register(scopedCandidate(sources, { damage: 8 }), opts)
  const sheets = register(scopedCandidate(sources, { damage: 8 }, { fighter: { health: 200 } }), opts)
  assert.notEqual(balance.rulesetId, before.rulesetId)
  assert.notEqual(sheets.rulesetId, balance.rulesetId)
  const missing = { ...sources }
  delete missing['services/arena/combat.js']
  assert.throws(() => scopedCandidate(missing), /combat source missing/)
})

test('narrowing reuses latest equivalent legacy ruleset and preserves exact rollback links and archive bytes', t => {
  const opts = fixture(t), sources = arenaSources()
  function legacy(suffix) {
    const entry = scopedCandidate({ ...sources, 'services/arena/controller.js': suffix })
    entry.rules = { ...entry.rules, schema: 1, sources: {
      ...entry.rules.sources, 'services/arena/controller.js': suffix,
    } }
    entry.rulesHash = digest(entry.rules)
    return entry
  }
  // Seed actual historical records as the previous registrar would have done.
  const one = legacy('old menu'), two = legacy('new menu')
  for (const [index, entry] of [one, two].entries()) {
    const id = index + 1
    fs.writeFileSync(path.join(opts.directory, `ruleset-${id}.json`), JSON.stringify({
      id, hash: entry.rulesHash, snapshot: entry.rules,
    }))
    fs.writeFileSync(path.join(opts.directory, `build-${id}.json`), JSON.stringify({
      id, version: `0.0.0.${id}`, hash: entry.buildHash, rulesetId: id,
      rulesetHash: entry.rulesHash, sources: entry.sources,
      balance: entry.rules.balance, builds: entry.rules.builds,
    }))
  }
  const files = fs.readdirSync(opts.directory)
  const before = files.map(name => fs.readFileSync(path.join(opts.directory, name), 'utf8'))
  const next = register(scopedCandidate(sources), opts)
  assert.equal(next.build, 3)
  assert.equal(next.rulesetId, 2)
  assert.equal(next.rulesetHash, two.rulesHash)
  assert.deepEqual(register(scopedCandidate(sources), opts), next)
  assert.equal(register(one, opts).rulesetId, 1)
  assert.equal(register(two, { ...opts, environment: 'production' }).rulesetId, 2)
  assert.equal(fs.existsSync(path.join(opts.directory, 'ruleset-3.json')), false)
  assert.deepEqual(files.map(name => fs.readFileSync(path.join(opts.directory, name), 'utf8')), before)
})
