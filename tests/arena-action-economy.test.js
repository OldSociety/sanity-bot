const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
let balanceHash
for (const experiment of ['A', 'B', 'C'])
  test(`offline economy ${experiment}: damage, resources, crits, support, charges and previews`, () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ['tests/fixtures/arena-economy-check.cjs', experiment],
        { encoding: 'utf8' }
      )
    )
    assert.equal(result.experiment, experiment)
    assert.equal(result.checks, 35)
    balanceHash ||= result.balanceHash
    assert.equal(result.balanceHash, balanceHash)
  })
