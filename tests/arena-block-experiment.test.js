const test = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
let balanceHash
for (const scenario of ['current', 'proposed'])
  test(`offline ${scenario} Block: exhaustive damage, crits, previews, support, on-hit and unblockable Finishers`, () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ['tests/fixtures/arena-block-check.cjs', scenario],
        { encoding: 'utf8' }
      )
    )
    assert(result.checks > 1000)
    balanceHash ||= result.balanceHash
    assert.equal(result.balanceHash, balanceHash)
  })
