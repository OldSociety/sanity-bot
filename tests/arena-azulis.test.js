const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
test('development Azulis integration', () => {
  const environment = { ...process.env, NODE_ENV: 'development' }
  delete environment.NODE_TEST_CONTEXT
  const output = execFileSync(
    process.execPath,
    ['--test', require.resolve('./fixtures/azulis-check.cjs')],
    {
      env: environment,
      stdio: 'pipe',
      encoding: 'utf8',
    }
  )
  assert.match(output, /# tests 8\b/)
  assert.match(output, /# fail 0\b/)
})
test('Azulis is unavailable in ordinary tests', () => {
  const {
    resolveCharacter,
    isSelectable,
  } = require('../services/arena/characters')
  const { newBattle } = require('../services/arena/combat')
  const { loadBalance } = require('../services/arena/balance-config')
  const azulis = resolveCharacter('Azulis')
  assert.equal(isSelectable(azulis), false)
  assert.throws(() => newBattle(0, { character: azulis }), /development/)
  assert.throws(() => newBattle(0, { opponent: 'Azulis' }), /development/)
  assert.deepEqual(loadBalance('test'), require('../config/arena/arena-balance.json'))
})
