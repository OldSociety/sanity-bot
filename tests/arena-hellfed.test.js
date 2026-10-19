const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
// Isolated child: ordinary Arena regressions keep the production configuration.
test('Hellfed Rage rules, UI, and real turn integration in development', () => {
  execFileSync(
    process.execPath,
    [require.resolve('./fixtures/hellfed-check.cjs')],
    {
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    }
  )
})
test('Hellfed is unavailable in ordinary tests including direct battle creation', () => {
  const { newBattle } = require('../services/arena/combat')
  const {
    resolveCharacter,
    isSelectable,
  } = require('../services/arena/characters')
  const { loadBalance } = require('../services/arena/balance-config')
  const hellfed = resolveCharacter('Hellfed Marq')
  assert.equal(isSelectable(hellfed), false)
  assert.throws(() => newBattle(0, { character: hellfed }), /development/)
  assert.throws(() => newBattle(0, { opponent: hellfed.id }), /AI/)
  assert.equal(loadBalance('test').characters['hellfed-marq'], undefined)
})
