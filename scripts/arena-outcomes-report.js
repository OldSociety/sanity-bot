// Current Level 1 matrix plus the same Azulis A/B/C comparison, in fresh workers.
const fs = require('node:fs'),
  { execFile } = require('node:child_process'),
  crypto = require('node:crypto')
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']
if (process.argv[2] === 'cell') {
  const [policy, player, enemy, trials] = process.argv.slice(3)
  const row = require('./arena-azulis-report').run(
    policy,
    enemy,
    false,
    Number(trials || 10000),
    { player, enemy }
  )
  process.stdout.write(JSON.stringify(row))
} else {
  const directory =
    process.argv[2] === 'basic-critical'
      ? 'artifacts/arena-basic-critical'
      : 'artifacts/arena-outcomes'
  fs.mkdirSync(directory, { recursive: true })
  const files = [
    'services/arena/combat.js',
    'services/arena/rules.js',
    'services/arena/outcomes.js',
    'services/arena/tactics.js',
    'services/arena/damage.js',
    'services/arena/statistics.js',
    'services/arena/balance-config.js',
    'config/arena-balance.json',
    'config/arena-balance-development.json',
    'config/arena-hellfed-development.json',
    'config/arena-azulis-development.json',
    'scripts/arena-parity-engine.js',
    'scripts/arena-parity-policy.js',
    'scripts/arena-azulis-report.js',
  ]
  const hashes = Object.fromEntries(
    files.map((file) => [
      file,
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ])
  )
  const hashFile = `${directory}/model-source-hashes.json`
  const resultsFile = `${directory}/results.json`
  if (
    fs.existsSync(hashFile) &&
    fs.existsSync(resultsFile) &&
    JSON.stringify(JSON.parse(fs.readFileSync(hashFile, 'utf8'))) !==
      JSON.stringify(hashes)
  )
    throw Error(
      'Sources changed: archive incomplete results before starting a fresh model run'
    )
  fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2))
  const results = fs.existsSync(resultsFile)
    ? JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
    : []
  const jobs = []
  for (const policy of ['C', 'A', 'B'])
    for (const player of names)
      for (const enemy of names) {
        if (policy !== 'C' && player !== 'Azulis' && enemy !== 'Azulis')
          continue
        if (
          !results.some(
            (r) =>
              r.policy === policy &&
              r.player === player &&
              r.enemy === enemy &&
              r.trials === 10000
          )
        )
          jobs.push({ policy, player, enemy })
      }
  const worker = async () => {
    while (jobs.length) {
      const { policy, player, enemy } = jobs.shift()
      const stdout = await new Promise((resolve, reject) =>
        execFile(
          process.execPath,
          [__filename, 'cell', policy, player, enemy, '10000'],
          {
            env: { ...process.env, NODE_ENV: 'development' },
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
          },
          (e, out) => (e ? reject(e) : resolve(out))
        )
      )
      const row = JSON.parse(stdout)
      results.push(row)
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2))
      console.log(
        policy,
        player,
        'vs',
        enemy,
        row.winPercent.toFixed(2),
        row.averageRounds.toFixed(2)
      )
    }
  }
  Promise.all(Array.from({ length: 4 }, worker)).catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
}
