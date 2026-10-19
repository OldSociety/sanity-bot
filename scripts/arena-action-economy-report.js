// Offline A/B/C action-economy experiment. Never imported by the bot.
const fs = require('node:fs'),
  crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const directory = 'artifacts/arena-action-economy'
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']
const sha = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const fields = [
  's1',
  's1Damage',
  's2',
  's2Damage',
  's3',
  's3Damage',
  'basicDamage',
  'basicAttempts',
  'basicHits',
  'blocksBasic',
  'blocksSpecial',
  'criticalsBasic',
  'criticalsSpecial',
  'hopeGenerated',
  'hopeSpent',
  'healed',
  'wasted',
  'effectiveHp',
]
function project(row, experiment) {
  return {
    experiment,
    policy: row.policy,
    player: row.player,
    enemy: row.enemy,
    trials: row.trials,
    seed: row.seed,
    winPercent: row.winPercent,
    averageRounds: row.averageRounds,
    pacingPercent: row.pacingPercent,
    totals: row.totals,
    perFight: Object.fromEntries(
      ['player', 'enemy'].map((side) => [
        side,
        Object.fromEntries(fields.map((key) => [key, row.perFight[side][key]])),
      ])
    ),
  }
}
if (process.argv[2] === 'cell') {
  const [experiment, player, enemy, trials] = process.argv.slice(3)
  const { transformFor } = require('./arena-economy-transform')
  const row = require('./arena-azulis-report').run(
    'C',
    enemy,
    false,
    Number(trials || 10000),
    { player, enemy, sourceTransform: transformFor(experiment) }
  )
  process.stdout.write(JSON.stringify(project(row, experiment)))
} else {
  fs.mkdirSync(directory, { recursive: true })
  const priorHashes = JSON.parse(
    fs.readFileSync(
      'artifacts/arena-basic-critical/model-source-hashes.json',
      'utf8'
    )
  )
  for (const [file, hash] of Object.entries(priorHashes)) {
    const reference =
      file === 'scripts/arena-parity-engine.js'
        ? `${directory}/arena-parity-engine-before.js`
        : file === 'scripts/arena-azulis-report.js'
        ? `${directory}/arena-azulis-report-before.js`
        : file
    if (sha(reference) !== hash)
      throw Error(`Prior baseline source mismatch: ${file}`)
  }
  const files = [
    ...Object.keys(priorHashes),
    'scripts/arena-economy-transform.js',
    'scripts/arena-action-economy-report.js',
  ]
  const hashes = Object.fromEntries(files.map((file) => [file, sha(file)])),
    hashFile = `${directory}/model-source-hashes.json`,
    resultFile = `${directory}/results.json`
  if (
    fs.existsSync(hashFile) &&
    fs.existsSync(resultFile) &&
    JSON.stringify(JSON.parse(fs.readFileSync(hashFile, 'utf8'))) !==
      JSON.stringify(hashes)
  )
    throw Error('Model changed: archive incomplete data before a fresh run')
  fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2))
  const results = fs.existsSync(resultFile)
    ? JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    : JSON.parse(
        fs.readFileSync('artifacts/arena-basic-critical/results.json', 'utf8')
      )
        .filter((r) => r.policy === 'C')
        .map((r) => project(r, 'A'))
  if (results.filter((r) => r.experiment === 'A').length !== 16)
    throw Error('Missing 16 current control cohorts')
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2))
  const jobs = []
  for (const experiment of ['B', 'C'])
    for (const player of names)
      for (const enemy of names)
        if (
          !results.some(
            (r) =>
              r.experiment === experiment &&
              r.player === player &&
              r.enemy === enemy &&
              r.trials === 10000
          )
        )
          jobs.push({ experiment, player, enemy })
  const worker = async () => {
    while (jobs.length) {
      const { experiment, player, enemy } = jobs.shift()
      const row = JSON.parse(
        await new Promise((resolve, reject) =>
          execFile(
            process.execPath,
            [__filename, 'cell', experiment, player, enemy, '10000'],
            {
              env: { ...process.env, NODE_ENV: 'development' },
              encoding: 'utf8',
              maxBuffer: 1024 * 1024,
            },
            (error, out) => (error ? reject(error) : resolve(out))
          )
        )
      )
      results.push(row)
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2))
      console.log(
        experiment,
        player,
        'vs',
        enemy,
        row.winPercent.toFixed(2),
        row.averageRounds.toFixed(2)
      )
    }
  }
  Promise.all(Array.from({ length: 4 }, worker)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
module.exports = { project }
