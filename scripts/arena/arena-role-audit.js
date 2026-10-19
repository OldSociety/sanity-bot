// Offline-only role attribution. Fresh-process cells; no Discord/DB/process work.
const fs = require('node:fs'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { execFile } = require('node:child_process')
const directory = 'artifacts/arena-role-asymmetry',
  names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis', 'Hendrix'],
  scenarios = ['baseline', 'enemy-first', 'matched-rolls', 'both']
const sha = (f) =>
  crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
if (process.argv[2] === 'cell') {
  process.env.NODE_ENV = 'development'
  const [scenario, player, enemy, count] = process.argv.slice(3),
    trials = Number(count || 10000)
  const empty = () => ({
    basicPackets: 0,
    directSpecialPackets: 0,
    basicPacketDamage: 0,
    directSpecialDamage: 0,
    blockedBasics: 0,
    blockedSpecials: 0,
    blockedBasicDamage: 0,
    blockedSpecialDamage: 0,
    basicPrevented: 0,
    specialPrevented: 0,
    criticals: 0,
    criticalExtra: 0,
    criticalStressRecovery: 0,
    criticalStressRemoval: 0,
    recoveryActions: 0,
    hpBasic: 0,
    hpS1: 0,
    hpS2: 0,
    hpS3: 0,
    terminalSkippedActions: 0,
    loserBasicPackets: 0,
    loserSpecialPackets: 0,
    losses: 0,
  })
  const metrics = { player: empty(), enemy: empty() }
  let ledgerChecks = 0
  const row = require('./arena-azulis-report').run('C', enemy, false, trials, {
    fighters: names,
    player,
    enemy,
    sourceTransform: require('./arena-role-transform').transformForRole(
      scenario,
    ),
    onTurn(before, next) {
      const playerName =
        before.player.name === before.enemy.name
          ? `Your ${before.player.name}`
          : before.player.name
      for (const event of next.history.slice(before.history.length)) {
        const side = event.actor === playerName ? 'player' : 'enemy',
          m = metrics[side]
        if (event.kind === 'recovery') m.recoveryActions++
        if (
          event.kind !== 'hit' &&
          !(event.kind === 'special' && event.outcome)
        )
          continue
        assert.equal(
          event.actor,
          side === 'player' ? playerName : before.enemy.name,
        )
        const basic = event.kind === 'hit'
        m[basic ? 'basicPackets' : 'directSpecialPackets']++
        m[basic ? 'basicPacketDamage' : 'directSpecialDamage'] += event.damage
        assert(Number.isFinite(event.normalDamage))
        if (event.outcome === 'block') {
          m[basic ? 'blockedBasics' : 'blockedSpecials']++
          m[basic ? 'blockedBasicDamage' : 'blockedSpecialDamage'] +=
            event.damage
          m[basic ? 'basicPrevented' : 'specialPrevented'] +=
            event.normalDamage - event.damage
          assert.equal(
            event.damage,
            Math.ceil(event.normalDamage * (basic ? 0.75 : 0.5)),
          )
          if (basic) assert.equal(event.criticalExtra, 0)
          else assert.notEqual(event.slot, 'special3')
        }
        if (event.outcome === 'critical') {
          assert(basic)
          m.criticals++
          m.criticalExtra += event.criticalExtra
          m.criticalStressRecovery += event.stressRestored || 0
          m.criticalStressRemoval += event.stressRemoved || 0
        }
      }
      // Player critical resource information lives on the roll event.
      for (const e of next.history.slice(before.history.length))
        if (e.kind === 'roll' && e.critical) {
          metrics.player.criticalStressRecovery += e.stressRestored || 0
          metrics.player.criticalStressRemoval += e.stressRemoved || 0
        }
      if (next.status !== 'playing') {
        const first = ['enemy-first', 'both'].includes(scenario)
          ? 'enemy'
          : 'player'
        const winner = next.status === 'victory' ? 'player' : 'enemy'
        if (winner === first)
          metrics[first === 'player' ? 'enemy' : 'player']
            .terminalSkippedActions++
      }
    },
    onFight(b) {
      for (const side of ['player', 'enemy']) {
        const s = b.statistics[side],
          f = b[side],
          m = metrics[side]
        assert.equal(
          f.maxStress -
            s.stressSpent +
            s.stressRecovered -
            s.stressRemovedTaken,
          f.stress,
        )
        const hp = s.hpDamageBySource
        m.hpBasic += hp.basic
        m.hpS1 += hp.special1
        m.hpS2 += hp.special2
        m.hpS3 += hp.special3
        assert.equal(
          hp.basic + hp.special1 + hp.special2 + hp.special3,
          s.hpDamage,
        )
        if (!f.hp) {
          m.losses++
          m.loserBasicPackets += s.attempts.basic
          // Offensive special packets only; exclude support and delivered Slayer charges.
          const playerName =
            b.player.name === b.enemy.name
              ? `Your ${b.player.name}`
              : b.player.name
          m.loserSpecialPackets += b.history.filter(
            (e) =>
              e.kind === 'special' &&
              e.outcome &&
              e.actor === (side === 'player' ? playerName : b.enemy.name),
          ).length
        }
        ledgerChecks++
      }
    },
  })
  for (const side of ['player', 'enemy']) {
    const m = metrics[side]
    m.loserBasicsAverage = m.losses ? m.loserBasicPackets / m.losses : null
    m.loserSpecialsAverage = m.losses ? m.loserSpecialPackets / m.losses : null
    const averages = Object.fromEntries(
      Object.entries(m)
        .filter(([k]) => !k.endsWith('Average'))
        .map(([k, v]) => [k, v / trials]),
    )
    row.perFight[side].audit = {
      ...averages,
      loserBasicsAverage: m.loserBasicsAverage,
      loserSpecialsAverage: m.loserSpecialsAverage,
    }
    assert.equal(m.basicPackets / trials, row.perFight[side].basicAttempts)
    assert.equal(m.criticals / trials, row.perFight[side].criticalsBasic)
  }
  process.stdout.write(
    JSON.stringify({ ...row, scenario, roleLedgerChecks: ledgerChecks }),
  )
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
    'scripts/arena-role-transform.js',
    'scripts/arena-role-audit.js',
  ]
  for (const [f, h] of Object.entries(live)) assert.equal(sha(f), h, f)
  const hashes = Object.fromEntries(files.map((f) => [f, sha(f)])),
    modelFile = directory + '/model-source-hashes.json',
    resultFile = directory + '/results.json'
  if (fs.existsSync(modelFile))
    assert.deepEqual(
      JSON.parse(fs.readFileSync(modelFile)),
      hashes,
      'Frozen model changed',
    )
  fs.writeFileSync(modelFile, JSON.stringify(hashes, null, 2))
  fs.writeFileSync(
    directory + '/live-source-before.json',
    JSON.stringify(live, null, 2),
  )
  const results = fs.existsSync(resultFile)
      ? JSON.parse(fs.readFileSync(resultFile))
      : [],
    jobs = []
  for (const scenario of scenarios)
    for (const player of names)
      for (const enemy of names)
        if (
          (scenario === 'baseline' || player === enemy) &&
          !results.some(
            (r) =>
              r.scenario === scenario &&
              r.player === player &&
              r.enemy === enemy,
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
            { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
            (e, out) => (e ? reject(e) : resolve(out)),
          ),
        ),
      )
      for (const [f, h] of Object.entries(hashes)) assert.equal(sha(f), h, f)
      if (scenario === 'baseline') {
        const prior = JSON.parse(
          fs.readFileSync('artifacts/arena-block-75-50/results.json'),
        ).find(
          (r) =>
            r.scenario === 'proposed' &&
            r.player === player &&
            r.enemy === enemy,
        )
        for (const key of [
          'winPercent',
          'averageRounds',
          'pacingPercent',
          'totals',
        ])
          assert.deepEqual(row[key], prior[key], `baseline ${key}`)
        for (const side of ['player', 'enemy'])
          for (const key of [
            'basicDamage',
            's1Damage',
            's2Damage',
            's3Damage',
            'hopeGenerated',
            'hopeSpent',
          ])
            assert.equal(
              row.perFight[side][key],
              prior.perFight[side][key],
              key,
            )
      }
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
        `${results.length}/40`,
      )
    }
  }
  Promise.all(Array.from({ length: 4 }, worker))
    .then(() => {
      assert.equal(results.length, 40)
      for (const [f, h] of Object.entries(live)) assert.equal(sha(f), h, f)
      fs.writeFileSync(
        directory + '/verification.json',
        JSON.stringify(
          {
            fights: 400000,
            cohorts: 40,
            trialsPerCohort: 10000,
            seed: 271828,
            roleLedgerChecks: results.reduce(
              (n, r) => n + r.roleLedgerChecks,
              0,
            ),
            baseline25CohortsExactlyReproduced: true,
            allFrozenModelHashesMatch: true,
            all53LiveHashesUnchanged: true,
            liveChanges: false,
          },
          null,
          2,
        ),
      )
      console.log('COMPLETE')
    })
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
}
