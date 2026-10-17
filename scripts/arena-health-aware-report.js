// Offline, level-one experiments isolate AI changes from player-policy changes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
const { simulate, markdown } = require('./arena-balance-report')
const { comparisonMarkdown, matrix } = require('./arena-audit-report')
const root = path.resolve(__dirname, '../artifacts')
const scenarios = {
  baseline: { strategy: 'spend-special2', aiPolicy: 'legacy' },
  'ai-only': { strategy: 'spend-special2', aiPolicy: 'tactical' },
  tactical: { strategy: 'tactical', aiPolicy: 'tactical' },
}
const checksum = () => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../config/arena-balance.json'))).digest('hex')
const stem = name => path.join(root, `arena-health-aware-${name}`)
const fmt = value => value == null ? '—' : Number(value).toFixed(2)

function verify(rows) {
  assert.equal(rows.length, 4)
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
  for (const row of rows) {
    assert.equal(row.level, 1)
    for (const [side, name, stats] of [['player', row.playerCharacter, row.playerStats], ['enemy', row.opponent, row.enemyStats]]) {
      assert.deepEqual(stats, /marq/i.test(name) ? { attack: 200, hp: 260 } : { attack: 220, hp: 220 })
      const s = row[side], d = row.decisions[side]
      close(s.generated - s.spent, s.remaining)
      close(6 - s.stressSpent + s.stressRecovered - s.stressRemovedTaken, s.stressRemaining)
      close(s.totalDamage, s.hpDamage + s.overkill)
      close(stats.hp + (s.hpRestored || 0) - s.remainingHp, row[side === 'player' ? 'enemy' : 'player'].hpDamage)
      close(Object.values(s.hpDamageBySource).reduce((a, b) => a + b), s.hpDamage)
      close(d.guaranteedAvailable, d.guaranteedTaken + d.guaranteedMissed)
      close(d.opportunities, s.attempts.basic * row.trials)
      close(Object.values(d.knockoutSources).reduce((a, b) => a + b), row[side === 'player' ? 'enemy' : 'player'].knockoutCount)
      if (/maxim/i.test(name)) close(s.uses.special2 * 3, s.slayerChargesConsumed + s.slayerChargesRemaining + s.slayerChargesDiscardedOnRefresh)
    }
  }
}

function extended(rows) {
  return rows.map(row => {
    const columns = ['player', 'enemy']
    const lines = [
      ['Winner HP remaining (conditional on winning)', s => s.winnerRemainingHp],
      ['ON THE BRINK activations per fight', s => s.brinkActivations], ['HP restored by ON THE BRINK per fight', s => s.hpRestored],
      ['Unused Hope/Fear at knockout (conditional)', s => s.resourceAtKnockout],
      ['Knockouts holding an affordable Fear/Hope special (%)', s => s.knockoutCount ? s.knockoutsHoldingSpecial * 100 / s.knockoutCount : null],
      ['Hope/Fear generated', s => s.generated], ['Hope/Fear spent', s => s.spent], ['Stress spent', s => s.stressSpent], ['Stress restored', s => s.stressRecovered],
      ['Rounds ending at zero Stress', s => s.zeroStressRounds], ['Extra incoming damage from exhaustion, including overkill', s => s.vulnerabilityDamageTaken],
    ]
    const counters = [
      ['Guaranteed KO opportunities (total)', 'guaranteedAvailable'], ['Guaranteed KOs chosen (total)', 'guaranteedTaken'], ['Guaranteed KOs missed (total)', 'guaranteedMissed'],
      ['Lethal-if-hit opportunities (total)', 'lethalOnHitAvailable'], ['Lethal-if-hit choices taken (total)', 'lethalOnHitTaken'],
      ['Final-Stress actions screened out per fight', 'avoidedExhaustion'], ['Stress exhausted pursuing KO per fight', 'exhaustedForKnockout'],
      ['Saved for S3 per fight', 'savedForFinisher'], ['S2 chosen for limited survival per fight', 'limitedSurvivalS2'], ['Low-value buff refresh screened out per fight', 'avoidedRefresh'],
    ]
    let text = `### ${row.playerCharacter} vs AI ${row.opponent}\n\n| Metric | Player | AI |\n|---|---:|---:|\n` +
      lines.map(([label, read]) => `| ${label} | ${columns.map(side => fmt(read(row[side]))).join(' | ')} |`).join('\n') + '\n' +
      counters.map(([label, key]) => `| ${label} | ${columns.map(side => fmt(row.decisions[side][key] / (label.endsWith('(total)') ? 1 : row.trials))).join(' | ')} |`).join('\n') + '\n' +
      ['basic', 'special1', 'special2', 'special3'].map(slot => `| Final HP removed by ${slot} (%) | ${columns.map(side => fmt(row.decisions[side].knockoutSources[slot] * 100 / row.trials)).join(' | ')} |`).join('\n')
    text += '\n\nFinisher button / percent counts: `' + JSON.stringify(row.finisherSelections) + '`.\n\nDecision reasons (total):\n\n' +
      columns.map(side => `- ${side}: \`${JSON.stringify(row.decisions[side].reasons)}\``).join('\n') + '\n'
    return text
  }).join('\n')
}

function report() {
  const batches = Object.fromEntries(Object.keys(scenarios).map(name => [name, JSON.parse(fs.readFileSync(stem(name) + '.json'))]))
  const configs = Object.values(batches)
  for (const batch of configs) { verify(batch.rows); assert.equal(batch.configSha256, checksum()); assert.equal(batch.seed, configs[0].seed); assert.equal(batch.finisherChoice, configs[0].finisherChoice); assert.equal(batch.trials, configs[0].trials) }
  let text = '# Arena health-aware decision audit\n\nLevel 1 only. Marq: 200 Attack / 260 HP; Maxim: 220 Attack / 220 HP in both roles. No damage percentages, costs, accuracy, critical rates, exhaustion penalties or probability tables changed.\n\n'
  text += `Seed ${configs[0].seed}; ${configs[0].trials.toLocaleString('en-US')} fights per matchup per scenario; ${configs.reduce((n, b) => n + b.rows.reduce((s, r) => s + r.trials, 0), 0).toLocaleString('en-US')} total. Finisher strategy: fixed button ${configs[0].finisherChoice} (${configs[0].finisherChoice ? 30 + 5 * configs[0].finisherChoice : 30}% Attack), no reaction latency. Configuration SHA256: \`${checksum()}\`.\n\n`
  text += 'Baseline keeps both old policies. AI-only changes only AI decisions. Tactical changes the simulated player too. Each scenario starts from the same seed, but different choices change draw consumption; these are reproducible Monte Carlo comparisons, not paired identical dice streams. Targets are evaluated without tuning coefficients. Human players retain their own button choices; the simulated-player policy is offline only.\n\n'
  for (const [name, batch] of Object.entries(batches)) text += matrix(batch.rows, name) + '\n'
  text += '## Decision interpretation\n\nA true guaranteed knockout includes misses: conditional AI specials can miss, while always-hit Finishers can qualify. Lethal-if-hit is reported separately. Knockout counters refer to public pre-action state, not current opponent costs or pending actions. Guaranteed-AI counts depend on whether that ruleset allows Finisher misses. Player direct specials can qualify even if their basic misses. Buff activation contributes no new immediate damage; an already-active charge can. The special credited with a knockout must actually remove the final HP, rather than merely overkill. Simultaneous knockouts can credit both actors while the player wins.\n\n'
  text += 'Avoided-exhaustion and saved-resource counters count opportunities where a tactical action was excluded, not proof that the baseline would have spent. Remaining-round estimates use current damage, hit/opportunity rates, buffs, exhaustion and already-observed special output. They are lightweight heuristics, not future-state searches. Expected Combo damage uses a tail tolerance below 1e-13; threshold knockout probabilities use the exact continuing-d4 recurrence.\n\n'
  const before = batches.baseline.rows, afterAi = batches['ai-only'].rows, after = batches.tactical.rows
  const mean = (rows, read) => rows.reduce((sum, row) => sum + read(row), 0) / rows.length
  const byPlayer = (rows, name) => rows.filter(row => row.playerCharacter.startsWith(name))
  const byEnemy = (rows, name) => rows.filter(row => row.opponent === name)
  text += '## Assessment\n\n'
  for (const name of ['Marq', 'Maxim']) {
    const oldRate = mean(byEnemy(before, name.toLowerCase()), row => 100 - row.winPercent)
    const aiRate = mean(byEnemy(afterAi, name.toLowerCase()), row => 100 - row.winPercent)
    text += `- AI-only isolation: AI ${name} win rate against the unchanged player policy moves from ${fmt(oldRate)}% to ${fmt(aiRate)}% (${fmt(aiRate - oldRate)} percentage points), averaging both players equally.\n`
  }
  const gaps = ['marq', 'maxim'].map(ai => {
    const marq = after.find(row => row.opponent === ai && row.playerCharacter.startsWith('Marq'))
    const maxim = after.find(row => row.opponent === ai && row.playerCharacter.startsWith('Maxim'))
    return `${fmt(marq.winPercent - maxim.winPercent)} points against AI ${ai}`
  })
  text += `- With both tactical policies, playable Marq leads by ${gaps.join(' and ')}. The within-five-point target is not met by these point estimates. Mirror results (${fmt(after[0].winPercent)}% and ${fmt(after[3].winPercent)}% player wins) remain far from 50/50. Mechanical asymmetries remain even with shared tactical principles.\n`
  text += `- Mean fight duration across the four pairings is ${fmt(mean(after, row => row.meanTurns))} rounds; ${fmt(mean(after, row => row.within10to20Percent))}% finish within 10–20. Marq mirrors still average ${fmt(after[0].meanTurns)} rounds, so the approximate-15-round goal is not uniformly reached.\n`
  for (const name of ['Marq', 'Maxim']) text += `- Playable ${name} fights ending at zero Stress: ${fmt(mean(byPlayer(before, name), row => row.player.zeroStressFightPercent))}% before, ${fmt(mean(byPlayer(after, name), row => row.player.zeroStressFightPercent))}% with both tactical policies.\n`
  const held = rows => { const subset = byEnemy(rows, 'maxim'); return subset.reduce((n, row) => n + row.enemy.knockoutsHoldingSpecial, 0) * 100 / subset.reduce((n, row) => n + row.enemy.knockoutCount, 0) }
  text += `- Remaining limitation: AI Maxim dies holding mechanically affordable Fear specials in ${fmt(held(after))}% of its knockouts, versus ${fmt(held(before))}% before. Its Slayer delivery and resource-conservation choices are not globally optimized. Counters expose this tradeoff rather than treating every saved resource as an improvement. No further balance or heuristic tuning was performed after the full runs.\n\n`
  for (const [name, batch] of Object.entries(batches)) text += `## ${name}: matched-opponent activity\n\n` + comparisonMarkdown(batch.rows, name) + '\n' + extended(batch.rows) + '\n'
  text += '## Validation and limits\n\nAll batches passed stat, damage, actual HP/overkill, resource, Stress, Slayer-charge, knockout-source and decision-accounting checks. Only level-one fights were simulated. Button timing, network latency, player mistakes, Idle mode and the 1.5-second Finisher reaction window are not simulated. Approximate 95% sampling margins are at most ±0.98 percentage points per 10,000-fight matchup; this is not uncertainty about real-player strategies.\n'
  fs.writeFileSync(path.resolve(__dirname, '../docs/arena-health-aware-audit.md'), text)
  console.log('Wrote docs/arena-health-aware-audit.md')
}

function main(args = process.argv.slice(2)) {
  if (args[0] === '--report') return report()
  const name = args[0] || 'tactical'
  if (!scenarios[name]) throw Error('Choose baseline, ai-only, tactical or --report')
  const trials = Number(args[1] || 10000), finisherChoice = Number(args[2] ?? 3), seed = 1792
  const configSha256 = checksum(), start = Date.now()
  const rows = simulate({ ...scenarios[name], trials, finisherChoice, seed })
  verify(rows); assert.equal(checksum(), configSha256)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(stem(name) + '.json', JSON.stringify({ name, configSha256, trials, seed, finisherChoice, elapsedMs: Date.now() - start, rows }, null, 2))
  fs.writeFileSync(stem(name) + '.md', markdown(rows))
  console.table(rows.map(({ playerCharacter, opponent, meanTurns, winPercent }) => ({ playerCharacter, opponent, meanTurns, winPercent })))
}

if (require.main === module) main()
module.exports = { verify, report, main }
