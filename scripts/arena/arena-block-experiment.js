// Offline-only current vs 75% basic / 50% special Block comparison.
const fs = require('node:fs'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFile } = require('node:child_process')
const directory = 'artifacts/arena-block-75-50',
  names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis', 'Hendrix']
const sha = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
if (process.argv[2] === 'cell') {
  process.env.NODE_ENV = 'development'
  const [scenario, player, enemy, count] = process.argv.slice(3),
    trials = Number(count || 10000)
  const extra = Object.fromEntries(
    ['player', 'enemy'].map((side) => [
      side,
      {
        blockedBasicDamage: 0,
        blockedSpecialDamage: 0,
        blockedBasics: 0,
        blockedSpecials: 0,
      },
    ]),
  )
  let stressLedgers = 0
  const row = require('./arena-azulis-report').run('C', enemy, false, trials, {
    player,
    enemy,
    fighters: names,
    sourceTransform: require('./arena-block-transform').transformFor(scenario),
    onTurn: (before, next) => {
      const playerName =
        before.player.name === before.enemy.name
          ? `Your ${before.player.name}`
          : before.player.name
      for (const event of next.history.slice(before.history.length)) {
        if (event.outcome !== 'block') continue
        const side = event.actor === playerName ? 'player' : 'enemy'
        assert.equal(
          event.actor,
          side === 'player' ? playerName : before.enemy.name,
        )
        if (event.kind === 'hit') {
          extra[side].blockedBasicDamage += event.damage
          extra[side].blockedBasics++
          assert.equal(
            next.statistics[side].criticals.basic,
            before.statistics[side].criticals.basic,
          )
        } else if (event.kind === 'special') {
          assert.notEqual(event.slot, 'special3')
          extra[side].blockedSpecialDamage += event.damage
          extra[side].blockedSpecials++
        }
      }
    },
    onFight: (b) => {
      for (const side of ['player', 'enemy']) {
        const s = b.statistics[side],
          f = b[side]
        assert.equal(
          f.maxStress -
            s.stressSpent +
            s.stressRecovered -
            s.stressRemovedTaken,
          f.stress,
        )
        assert(f.stress >= 0 && f.stress <= f.maxStress)
        assert(f.hp >= 0 && f.hp <= f.maxHp)
        if (f.maxRage) assert(f.rage >= 0 && f.rage <= 3)
        for (const slot of ['special1', 'special2', 'special3'])
          assert.equal(s.criticals[slot], 0)
        assert.equal(s.blocks.special3, 0)
        stressLedgers++
      }
    },
  })
  for (const side of ['player', 'enemy']) {
    const e = extra[side],
      r = row.perFight[side]
    assert(Math.abs(e.blockedBasics / trials - r.blocksBasic) < 1e-9)
    assert(Math.abs(e.blockedSpecials / trials - r.blocksSpecial) < 1e-9)
    r.blockedBasicDamage = e.blockedBasicDamage / trials
    r.blockedSpecialDamage = e.blockedSpecialDamage / trials
    r.damagePerBlockedBasic = e.blockedBasics
      ? e.blockedBasicDamage / e.blockedBasics
      : 0
    r.damagePerBlockedSpecial = e.blockedSpecials
      ? e.blockedSpecialDamage / e.blockedSpecials
      : 0
    r.basicCriticalPercent = r.basicAttempts
      ? (100 * r.criticalsBasic) / r.basicAttempts
      : 0
  }
  process.stdout.write(JSON.stringify({ ...row, scenario, stressLedgers }))
} else {
  fs.mkdirSync(directory, { recursive: true })
  const live = JSON.parse(
    fs.readFileSync(
      'config/backups/arena-skin-explanations-live/manifest.json',
    ),
  ).sourceHashes
  const files = [
    ...Object.keys(live).filter((file) => fs.existsSync(file)),
    ...fs
      .readdirSync('config/arena')
      .filter((file) => file.endsWith('.json'))
      .map((file) => 'config/arena/' + file),
    'config/badges/badges.json',
    ...require('../../services/arena/character-config').characterConfigFiles,
    'services/arena/character-config.js',
    'scripts/arena-parity-engine.js',
    'scripts/arena-parity-policy.js',
    'scripts/arena-azulis-report.js',
    'scripts/arena-block-transform.js',
    'scripts/arena-block-experiment.js',
  ]
  const hashes = Object.fromEntries(files.map((f) => [f, sha(f)])),
    modelFile = directory + '/model-source-hashes.json',
    resultFile = directory + '/results.json'
  if (fs.existsSync(modelFile))
    assert.deepEqual(
      JSON.parse(fs.readFileSync(modelFile)),
      hashes,
      'Do not mix source revisions; preserve existing reports',
    )
  for (const [file, hash] of Object.entries(live))
    assert.equal(sha(file), hash, file)
  fs.writeFileSync(modelFile, JSON.stringify(hashes, null, 2))
  fs.writeFileSync(
    directory + '/live-source-before.json',
    JSON.stringify(live, null, 2),
  )
  const loader = require('../../services/arena/balance-config'),
    dev = loader.loadBalance('development'),
    prod = loader.loadBalance('production')
  assert.deepEqual({ ...prod, profile: dev.profile }, dev)
  fs.writeFileSync(
    directory + '/model-balance.json',
    JSON.stringify(dev, null, 2),
  )
  const results = fs.existsSync(resultFile)
      ? JSON.parse(fs.readFileSync(resultFile))
      : [],
    jobs = []
  for (const scenario of ['current', 'proposed'])
    for (const player of names)
      for (const enemy of names)
        if (
          !results.some(
            (r) =>
              r.scenario === scenario &&
              r.player === player &&
              r.enemy === enemy &&
              r.trials === 10000,
          )
        )
          jobs.push({ scenario, player, enemy })
  const worker = async () => {
    while (jobs.length) {
      const { scenario, player, enemy } = jobs.shift(),
        started = Date.now()
      const row = JSON.parse(
        await new Promise((resolve, reject) =>
          execFile(
            process.execPath,
            [__filename, 'cell', scenario, player, enemy, '10000'],
            {
              env: { ...process.env, NODE_ENV: 'development' },
              encoding: 'utf8',
              maxBuffer: 1024 * 1024,
            },
            (e, out) => (e ? reject(e) : resolve(out)),
          ),
        ),
      )
      for (const [file, hash] of Object.entries(hashes))
        assert.equal(sha(file), hash, file)
      results.push(row)
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2))
      console.log(
        scenario,
        player,
        'vs',
        enemy,
        row.winPercent.toFixed(2),
        row.averageRounds.toFixed(2),
        `${((Date.now() - started) / 1000).toFixed(1)}s`,
        `${results.length}/50`,
      )
    }
  }
  Promise.all(Array.from({ length: 4 }, worker))
    .then(() => {
      assert.equal(results.length, 50)
      assert.equal(
        results.reduce((n, r) => n + r.totals.ledgerChecks, 0),
        1000000,
      )
      assert.equal(
        results.reduce((n, r) => n + r.stressLedgers, 0),
        1000000,
      )
      for (const [file, hash] of Object.entries(live))
        assert.equal(sha(file), hash, file)
      fs.writeFileSync(
        directory + '/verification.json',
        JSON.stringify(
          {
            fights: 500000,
            cohorts: 50,
            trialsPerOrderedMatchup: 10000,
            seed: 271828,
            fighterHpResourceLedgers: 1000000,
            fighterStressLedgers: 1000000,
            specialCriticals: 0,
            blockedCriticals: 0,
            blockedFinishers: 0,
            allFrozenModelHashesMatch: true,
            all53LiveCandidateHashesUnchanged: true,
            liveChanges: false,
          },
          null,
          2,
        ),
      )
      console.log(
        'COMPLETE: 500000 fights; all HP/resource/Stress ledgers and source hashes verified',
      )
    })
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
}
