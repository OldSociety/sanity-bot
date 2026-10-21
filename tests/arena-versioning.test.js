const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { digest, register, label } = require('../services/arena/versioning')
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
