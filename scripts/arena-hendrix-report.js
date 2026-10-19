// Controlled Level 1 cohorts using the established native combat/parity harness.
// No Discord, database, process manager, or deployment imports.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const directory =
  process.argv[2] === 'cell'
    ? 'artifacts/arena-hendrix'
    : process.argv[3] || 'artifacts/arena-hendrix'
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep))
  throw Error('Report directory must be inside artifacts')
const fighters = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis', 'Hendrix']
const sha = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function sources() {
  return [
    ...fs
      .readdirSync('services/arena')
      .filter((f) => f.endsWith('.js'))
      .map((f) => `services/arena/${f}`),
    ...fs
      .readdirSync('scripts')
      .filter(
        (f) => /arena-(hendrix|parity|azulis)/.test(f) && f.endsWith('.js')
      )
      .map((f) => `scripts/${f}`),
    ...fs
      .readdirSync('config')
      .filter(
        (f) =>
          /^arena-/.test(f) &&
          f.endsWith('.json') &&
          !/(preferences|leases|access)/.test(f)
      )
      .map((f) => `config/${f}`),
    ...Object.keys(
      require('../config/backups/arena-skin-explanations-live/manifest.json')
        .sourceHashes
    ).filter((f) => f.startsWith('assets/')),
  ].sort()
}
const freeze = () => Object.fromEntries(sources().map((f) => [f, sha(f)]))
function checkFrozen(frozen) {
  for (const [file, hash] of Object.entries(frozen))
    assert.equal(sha(file), hash, `Model changed: ${file}`)
}
if (process.argv[2] === 'cell') {
  process.env.NODE_ENV = 'development'
  const [player, enemy, rawCount] = process.argv.slice(3),
    trials = Number(rawCount)
  const extra = { player: {}, enemy: {} },
    histogram = {}
  let stressLedgers = 0
  const row = require('./arena-azulis-report').run('C', enemy, false, trials, {
    player,
    enemy,
    fighters,
    onFight: (b) => {
      histogram[b.tick] = (histogram[b.tick] || 0) + 1
      for (const side of ['player', 'enemy']) {
        const s = b.statistics[side],
          f = b[side]
        assert.equal(
          f.maxStress -
            s.stressSpent +
            s.stressRecovered -
            s.stressRemovedTaken,
          f.stress
        )
        assert(
          f.hp >= 0 &&
            f.hp <= f.maxHp &&
            f.stress >= 0 &&
            f.stress <= f.maxStress
        )
        for (const slot of ['special1', 'special2', 'special3'])
          assert.equal(s.criticals[slot], 0)
        assert.equal(s.blocks.special3, 0)
        stressLedgers++
        for (const [key, value] of Object.entries(s.strikeMetrics || {}))
          extra[side][key] = (extra[side][key] || 0) + value
        extra[side].bleeding =
          (extra[side].bleeding || 0) + (s.damage.bleeding || 0)
      }
    },
  })
  process.stdout.write(
    JSON.stringify({ ...row, extra, histogram, stressLedgers })
  )
} else if (require.main === module) {
  if (fs.existsSync(`${directory}/results.json`))
    throw Error('Completed report exists; choose a new artifact directory')
  const trials = Number(process.argv[2] || 1000)
  if (!Number.isInteger(trials) || trials < 1)
    throw Error('Expected positive trial count')
  fs.mkdirSync(directory, { recursive: true })
  const frozen = freeze()
  fs.writeFileSync(
    `${directory}/model-hashes.json`,
    JSON.stringify(frozen, null, 2) + '\n'
  )
  const jobs = fighters
    .map((enemy) => ['Hendrix', enemy])
    .concat(
      fighters
        .filter((f) => f !== 'Hendrix')
        .map((player) => [player, 'Hendrix'])
    )
  const results = []
  const cell = (player, enemy, count) =>
    new Promise((resolve, reject) =>
      execFile(
        process.execPath,
        [__filename, 'cell', player, enemy, String(count)],
        {
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'development' },
        },
        (error, stdout, stderr) => {
          if (error)
            return reject(
              Error(`${player} vs ${enemy}: ${stderr || error.message}`)
            )
          try {
            resolve(JSON.parse(stdout))
          } catch (error) {
            reject(error)
          }
        }
      )
    )
  ;(async () => {
    // Three independent fresh processes; model sources remain frozen throughout.
    for (let i = 0; i < jobs.length; i += 3) {
      const rows = await Promise.all(
        jobs.slice(i, i + 3).map(async ([player, enemy]) => {
          const row = await cell(player, enemy, trials)
          checkFrozen(frozen)
          console.log(
            `${player} vs ${enemy}: ${row.winPercent.toFixed(
              2
            )}% player wins, ${row.averageRounds.toFixed(2)} rounds`
          )
          return row
        })
      )
      results.push(...rows)
      fs.writeFileSync(
        `${directory}/progress.json`,
        JSON.stringify(
          { completed: results.length, expected: jobs.length, trials, results },
          null,
          2
        ) + '\n'
      )
    }
    const replays = []
    for (const [player, enemy] of [
      ['Hendrix', 'Hendrix'],
      ['Hendrix', 'Azulis'],
      ['Marq', 'Hendrix'],
    ]) {
      const first = await cell(player, enemy, 100),
        second = await cell(player, enemy, 100)
      assert.deepEqual(first, second)
      replays.push({
        player,
        enemy,
        trials: 100,
        freshProcesses: 2,
        identical: true,
      })
    }
    checkFrozen(frozen)
    fs.writeFileSync(
      `${directory}/results.json`,
      JSON.stringify(results, null, 2) + '\n'
    )
    const damageRounding =
      require('../services/arena/balance-config').loadBalance('development')
        .damageRounding || 'ceil'
    const minimumDirectDamage =
      require('../config/arena-hendrix-development.json').basic
        .minimumDirectDamage || 0
    const summary = {
      damageRounding,
      minimumDirectDamage,
      fights: results.reduce((n, r) => n + r.trials, 0),
      cohorts: results.length,
      trialsPerCohort: trials,
      seed: 271828,
      hpResourceLedgers: results.reduce((n, r) => n + r.totals.ledgerChecks, 0),
      stressLedgers: results.reduce((n, r) => n + r.stressLedgers, 0),
      allModelHashesUnchanged: true,
      replays,
      highTail: Object.fromEntries(
        [
          ['player', 1 / 12, 50 / 144],
          ['enemy', 0.85 * 0.05, 0.15],
        ].map(([side, q, b]) => [
          side,
          {
            independentCriticalChance: q,
            independentBlockChance: b,
            sixCriticalProbability: (q + (1 - q) * q) * q ** 5,
            expectedFlurryHpWithBleedingAt200AttackFullStress:
              36 +
              28 * q -
              4 * q * q -
              (damageRounding === 'floor' && minimumDirectDamage < 2
                ? b * (6 - q)
                : 0),
            expectedFlurryHpWithoutBleeding:
              24 +
              14 * q -
              2 * q * q -
              (damageRounding === 'floor' && minimumDirectDamage < 2
                ? b * (6 - q)
                : 0),
          },
        ])
      ),
      matchups: results.map((r) => ({
        player: r.player,
        enemy: r.enemy,
        playerWinPercent: r.winPercent,
        rounds: r.averageRounds,
        pacingPercent: r.pacingPercent,
        metrics: Object.fromEntries(
          ['player', 'enemy'].map((side) => {
            const x = r.extra[side]
            return [
              side,
              {
                ...r.perFight[side],
                bleedingDamage: x.bleeding / r.trials,
                bleedingUptimePercent: x.sequences
                  ? (100 * x.bleedingSequences) / x.sequences
                  : null,
                criticalStrikePercent: x.strikes
                  ? (100 * x.criticals) / x.strikes
                  : null,
                blockPreventedPerFight: (x.prevented || 0) / r.trials,
                maximumFlurries: x.maximumFlurries || 0,
                bleedingMaximumFlurries: x.bleedingMaximumFlurries || 0,
                durationCounts: [
                  x.duration2 || 0,
                  x.duration3 || 0,
                  x.duration4 || 0,
                ],
              },
            ]
          })
        ),
      })),
    }
    fs.writeFileSync(
      `${directory}/summary.json`,
      JSON.stringify(summary, null, 2) + '\n'
    )
    fs.writeFileSync(
      `${directory}/results.csv`,
      'player,enemy,trials,playerWinPercent,averageRounds,pacingPercent\n' +
        results
          .map((r) =>
            [
              r.player,
              r.enemy,
              r.trials,
              r.winPercent,
              r.averageRounds,
              r.pacingPercent,
            ].join(',')
          )
          .join('\n') +
        '\n'
    )
    console.log(
      `Complete: ${summary.fights} fights; ${summary.hpResourceLedgers} HP/resource and ${summary.stressLedgers} Stress ledgers; replay pairs identical.`
    )
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
module.exports = { freeze, checkFrozen }
