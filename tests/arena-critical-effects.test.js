const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')

test('development critical Stress effects are symmetric, capped and respect Rage immunity', () => {
  execFileSync(
    process.execPath,
    [require.resolve('./fixtures/critical-effects-check.cjs')],
    {
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    }
  )
})
test('ordinary test profile retains legacy critical behavior', () => {
  assert.equal(
    require('../services/arena/balance-config').loadBalance('test')
      .criticalEffects,
    undefined
  )
})
