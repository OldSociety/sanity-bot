const fs = require('node:fs'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
const directory = 'artifacts/arena-role-asymmetry'
const replays = []
for (const [scenario, player, enemy] of [
  ['baseline', 'Marq', 'Marq'],
  ['enemy-first', 'Hellfed Marq', 'Hellfed Marq'],
  ['both', 'Azulis', 'Azulis'],
]) {
  const run = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['scripts/arena-role-audit.js', 'cell', scenario, player, enemy, '100'],
        { encoding: 'utf8' }
      )
    )
  const first = run(),
    second = run()
  assert.deepEqual(first, second)
  replays.push({
    scenario,
    player,
    enemy,
    trials: 100,
    freshProcesses: 2,
    identical: true,
  })
}
fs.writeFileSync(directory + '/replay.json', JSON.stringify(replays, null, 2))
if (!fs.existsSync(directory + '/verification.json')) {
  console.log('Fresh-process replays passed; full study still running')
  process.exit(0)
}
const rows = JSON.parse(fs.readFileSync(directory + '/results.json')),
  prior = JSON.parse(
    fs.readFileSync('artifacts/arena-block-75-50/results.json')
  )
assert.equal(rows.length, 40)
let baselineMetrics = 0
for (const row of rows.filter((r) => r.scenario === 'baseline')) {
  const old = prior.find(
    (r) =>
      r.scenario === 'proposed' &&
      r.player === row.player &&
      r.enemy === row.enemy
  )
  for (const side of ['player', 'enemy'])
    for (const [key, value] of Object.entries(row.perFight[side])) {
      if (key === 'audit') continue
      assert.equal(
        value,
        old.perFight[side][key],
        `${row.player}/${row.enemy}/${side}/${key}`
      )
      baselineMetrics++
    }
}
for (const file of ['model-source-hashes.json', 'live-source-before.json']) {
  for (const [path, hash] of Object.entries(
    JSON.parse(fs.readFileSync(directory + '/' + file))
  ))
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),
      hash,
      path
    )
}
const csv = fs
  .readFileSync(directory + '/results.csv', 'utf8')
  .trim()
  .split('\n')
assert.equal(csv.length, 81)
const result = {
  cohorts: 40,
  fights: 400000,
  allBaselinePerFightMetricsExactlyReproduced: baselineMetrics,
  freshProcessReplays: replays,
  modelHashesUnchanged: true,
  liveHashesUnchanged: true,
  csvRoleRows: 80,
  liveChanges: false,
}
fs.writeFileSync(
  directory + '/final-integrity.json',
  JSON.stringify(result, null, 2)
)
console.log(JSON.stringify(result, null, 2))
