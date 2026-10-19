const test = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
test('production matches the verified activation snapshot: 300 exchanges, 25 views and portraits', () => {
  const read = (env, root = process.cwd()) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['tests/fixtures/arena-current-profile.cjs', env, root],
        { maxBuffer: 30 * 1024 * 1024, encoding: 'utf8' }
      )
    )
  const frozen = require('./fixtures/arena-production-before-hendrix.json'),
    prod = read('production')
  assert.equal(prod.fighters.length, 5)
  assert.equal(prod.states.length, 300)
  assert.equal(prod.views.length, 25)
  const hashes = Object.fromEntries(
    Object.entries(prod).map(([key, value]) => [
      key,
      require('node:crypto')
        .createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex'),
    ])
  )
  assert.deepEqual(hashes, frozen.hashes)
})
test('production rollout fails closed when disabled; test profile and Cocoa/Idle remain isolated', () => {
  const settings = require('../config/arena-testing.json'),
    {
      loadBalance,
      currentRulesEnabled,
    } = require('../services/arena/balance-config')
  const original = settings.productionCurrentRules
  try {
    settings.productionCurrentRules = false
    assert.deepEqual(
      loadBalance('production'),
      require('../config/arena-balance.json')
    )
    assert(!currentRulesEnabled('production'))
    assert(currentRulesEnabled('development'))
  } finally {
    settings.productionCurrentRules = original
  }
  assert(!currentRulesEnabled('test'))
  assert(!currentRulesEnabled('unknown'))
  assert.deepEqual(loadBalance('test'), require('../config/arena-balance.json'))
  const { commandEnabled } = require('../services/command-environment')
  for (const name of ['cocoa', 'idle'])
    assert(!commandEnabled({ name }, 'production'))
})

test('later development coefficient changes cannot alter the frozen production kit', () => {
  const patch = require('../config/arena-balance-development.json')
  const { loadBalance } = require('../services/arena/balance-config')
  const before = loadBalance('production'),
    old = patch.characters.maxim.special2.percent
  try {
    patch.characters.maxim.special2.percent = 99
    assert.equal(
      loadBalance('development').characters.maxim.special2.percent,
      99
    )
    assert.deepEqual(loadBalance('production'), before)
    const copy = loadBalance('production')
    copy.characters.maxim.special2.percent = 123
    assert.deepEqual(loadBalance('production'), before)
  } finally {
    patch.characters.maxim.special2.percent = old
  }
})
