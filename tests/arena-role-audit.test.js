const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
for (const scenario of ['baseline', 'enemy-first', 'matched-rolls', 'both']) {
  test(`offline role attribution: ${scenario}`, () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ['tests/fixtures/arena-role-check.cjs', scenario],
        { encoding: 'utf8' }
      )
    )
    assert(result.checks >= 4)
    const row = JSON.parse(
      execFileSync(
        process.execPath,
        [
          'scripts/arena-role-audit.js',
          'cell',
          scenario,
          'Azulis',
          'Azulis',
          '25',
        ],
        { encoding: 'utf8' }
      )
    )
    assert.equal(row.roleLedgerChecks, 50)
    assert.equal(row.perFight.player.criticalsSpecial, 0)
    assert.equal(row.perFight.enemy.criticalsSpecial, 0)
  })
}
