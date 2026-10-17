// Compare like roles against the same opponent; never mix player and AI stats.
const names = ['Marq', 'Maxim']
const finite = value => typeof value === 'number' && Number.isFinite(value)
function metrics(rows, side) {
  const fights = rows.reduce((sum, row) => sum + row.trials, 0)
  const mean = read => {
    if (!fights || rows.some(row => !finite(read(row)))) return null
    return rows.reduce((sum, row) => sum + read(row) * row.trials, 0) / fights
  }
  const source = key => mean(row => row[side].damage[key])
  const knockouts = rows.reduce((sum, row) => sum + (row[side].knockoutCount || 0), 0)
  const unusedAtKnockout = knockouts ? rows.reduce((sum, row) => sum + (row[side].slayerUnusedAtKnockout || 0) * row[side].knockoutCount, 0) / knockouts : null
  return {
    fights, winPercent: mean(row => side === 'player' ? row.winPercent : 100 - row.winPercent), rounds: mean(row => row.meanTurns),
    basicDamage: source('basic'), special1Uses: mean(row => row[side].uses.special1), special1Damage: source('special1'),
    stressRemoved: mean(row => row[side].stressRemoved), special2Uses: mean(row => row[side].uses.special2), special2Damage: source('special2'),
    special2HpDamage: mean(row => row[side].hpDamageBySource?.special2),
    slayerUnusedAtEnd: mean(row => row[side].slayerChargesRemaining), slayerUnusedAtKnockout: unusedAtKnockout,
    slayerDiscardedOnRefresh: mean(row => row[side].slayerChargesDiscardedOnRefresh),
    special3Uses: mean(row => row[side].uses.special3), special3Damage: source('special3'),
    totalSpecialDamage: mean(row => ['special1', 'special2', 'special3'].reduce((sum, slot) => sum + row[side].damage[slot], 0)),
    totalSpecialHpDamage: mean(row => row[side].totalSpecialHpDamage),
    resourceLeft: mean(row => row[side].remaining), stressLeft: mean(row => row[side].stressRemaining),
    focusActivations: mean(row => row[side].focusActivations), focusRecharge: mean(row => row[side].focusRechargeProgress),
    slayerChargesConsumed: mean(row => row[side].slayerChargesConsumed),
    basicOpportunities: mean(row => row[side].attempts.basic), basicHits: mean(row => row[side].hits.basic),
    zeroStressFightPercent: mean(row => row[side].zeroStressFightPercent),
  }
}
function compare(rows, detailed = true) {
  const result = []
  for (const level of [1]) for (const side of ['player', 'enemy']) for (const against of detailed ? names : ['both']) {
    const candidates = rows.filter(row => row.level === level && (against === 'both' ||
      (side === 'player' ? row.opponent === against.toLowerCase() : row.playerCharacter === `${against} [Spooky]`)))
    result.push({ level, role: side === 'player' ? 'Player' : 'AI', against,
      ...Object.fromEntries(names.map(name => [name, metrics(candidates.filter(row => side === 'player'
        ? row.playerCharacter === `${name} [Spooky]` : row.opponent === name.toLowerCase()), side)])) })
  }
  return result
}
const labels = [
  ['Win rate (%)', 'winPercent'], ['Mean rounds', 'rounds'], ['S1 activations', 'special1Uses'], ['S1 landed damage', 'special1Damage'],
  ['Enemy Stress removed', 'stressRemoved'], ['S2 activations', 'special2Uses'], ['S2 landed damage delivered', 'special2Damage'],
  ['S2 actual HP damage', 'special2HpDamage'], ['S2 unused charges at fight end', 'slayerUnusedAtEnd'],
  ['S2 unused charges when knocked out', 'slayerUnusedAtKnockout'], ['S2 charges discarded on refresh', 'slayerDiscardedOnRefresh'],
  ['S3 activations', 'special3Uses'], ['S3 landed damage', 'special3Damage'], ['Total landed special damage', 'totalSpecialDamage'],
  ['Total actual special HP damage', 'totalSpecialHpDamage'], ['Basic damage', 'basicDamage'], ['Unspent Hope/Fear', 'resourceLeft'],
  ['Unused Stress', 'stressLeft'], ['Focus activations', 'focusActivations'], ['Focus recharge remaining', 'focusRecharge'],
  ['Slayer charges consumed', 'slayerChargesConsumed'], ['Basic attack opportunities', 'basicOpportunities'], ['Successful basics', 'basicHits'],
  ['Fights ending at zero Stress (%)', 'zeroStressFightPercent'],
]
const format = value => finite(value) ? value.toFixed(2) : '—'
const display = (name, key, value) => (name === 'Marq' && (key.startsWith('slayer') || key.startsWith('focus'))) ||
  (name === 'Maxim' && key === 'stressRemoved') ? '—' : format(value)
function comparisonMarkdown(rows, title, detailed = true) {
  return `# ${title}\n\nEach value is a per-fight average, except win/zero-Stress rates. Player and AI roles are kept separate. Damage is landed damage including overkill; actual HP columns exclude overkill. Charges at knockout are conditional on that actor reaching 0 HP, including simultaneous KOs. Missing historical metrics are shown as —. Stats follow each report’s character and level snapshots; historical reports without snapshots used 300 / 420 / 570 Attack and HP.\n\n` +
    compare(rows, detailed).map(group => `## Level ${group.level} · ${group.role} · against ${group.against}\n\n` +
      `Marq: ${group.Marq.fights.toLocaleString('en-US')} fights; Maxim: ${group.Maxim.fights.toLocaleString('en-US')} fights.\n\n` +
      '| Metric | Marq | Maxim |\n|---|---:|---:|\n' + labels.map(([label, key]) =>
        `| ${label} | ${display('Marq', key, group.Marq[key])} | ${display('Maxim', key, group.Maxim[key])} |`).join('\n')).join('\n\n') + '\n'
}
function matrix(rows, title) {
  return `## ${title}\n\nCells: player win rate / mean rounds.\n\n| Level | Player | AI Marq | AI Maxim |\n|---|---|---:|---:|\n` + [1].flatMap(level => names.map(name => {
    const cells = names.map(ai => rows.find(row => row.level === level && row.playerCharacter === `${name} [Spooky]` && row.opponent === ai.toLowerCase()))
    return `| ${level} | ${name} | ${cells.map(row => row ? `${row.winPercent.toFixed(2)}% / ${row.meanTurns.toFixed(2)}` : '—').join(' | ')} |`
  })).join('\n') + '\n'
}
function writeReports(root = require('node:path').resolve(__dirname, '../artifacts')) {
  const fs = require('node:fs'), path = require('node:path')
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name)))
  const baseline = read('arena-before-ai-update.json'), updated = read('arena-balance-report.json')
  const alternateFile = path.join(root, 'arena-balance-save-finisher.json')
  const alternate = fs.existsSync(alternateFile) ? read('arena-balance-save-finisher.json') : null
  const data = { baseline: compare(baseline), updated: compare(updated), ...(alternate ? { alternate: compare(alternate) } : {}) }
  fs.writeFileSync(path.join(root, 'arena-role-audit.json'), JSON.stringify(data, null, 2))
  for (const [key, rows] of Object.entries({ baseline, updated, ...(alternate ? { alternate } : {}) })) {
    fs.writeFileSync(path.join(root, `arena-audit-${key}.md`), comparisonMarkdown(rows, `${key} · per-role, matched-opponent audit`))
  }
  const text = '# Arena AI ability audit\n\nBaseline was archived before the proposed AI change. Updated values were implemented before new simulations. No automatic coefficient tuning. Primary policy spends S2 when eligible (Slayer only when empty); alternate policy saves five Hope for S3. Player Finisher selection is button 3 with 100% valid selection, no timeout. All simulated rounds use the actual combat engine and stop after the terminal exchange.\n\n' +
    matrix(baseline, 'Previous AI · primary policy') + '\n' + matrix(updated, 'Proposed AI · primary policy') +
    (alternate ? '\n' + matrix(alternate, 'Proposed AI · save-Finisher policy') : '') +
    '\nDetailed paired metrics: [baseline](arena-audit-baseline.md), [updated](arena-audit-updated.md)' + (alternate ? ', [alternate](arena-audit-alternate.md)' : '') + '. Machine-readable comparisons: arena-role-audit.json.\n\n' +
    comparisonMarkdown(updated, 'Updated AI · equal opponent mix', false)
  fs.writeFileSync(path.join(root, 'arena-ai-audit.md'), text)
  return data
}
function writeStatReports(root = require('node:path').resolve(__dirname, '../artifacts')) {
  const fs = require('node:fs'), path = require('node:path')
  const read = stem => JSON.parse(fs.readFileSync(path.join(root, stem + '.json')))
  const before = read('arena-balance-report-before-stat-update'), after = read('arena-balance-report')
  const alternateBefore = read('arena-balance-save-finisher-before-stat-update'), alternate = read('arena-balance-save-finisher')
  const stats = '| Level | Marq Attack / HP | Maxim Attack / HP |\n|---|---:|---:|\n' + [1].map(level => {
    const marq = after.find(row => row.level === level && row.playerCharacter.startsWith('Marq')).playerStats
    const maxim = after.find(row => row.level === level && row.playerCharacter.startsWith('Maxim')).playerStats
    return `| ${level} | ${marq.attack} / ${marq.hp} | ${maxim.attack} / ${maxim.hp} |`
  }).join('\n')
  const intro = '# Arena character stat comparison\n\nOnly base Attack and HP changed; abilities, costs, AI selection and per-level +30 gains are unchanged. Both player and AI use the character defaults. Each matchup uses 10,000 fights, seed 1792; this report shows level 1 only. Primary policy prioritizes S3, then S2 (Slayer only when empty), then S1; alternate saves Hope for S3 and otherwise uses S1. Finishers choose 3 with no timeouts. Actual combat engine; no reaction/network latency simulated. Reusing a seed does not pair identical rolls after fights diverge.\n\n' + stats + '\n\n'
  const report = intro + matrix(before, 'Before · primary') + '\n' + matrix(after, 'After · primary') + '\n' +
    matrix(alternateBefore, 'Before · save Finisher') + '\n' + matrix(alternate, 'After · save Finisher') + '\n' +
    comparisonMarkdown(after, 'Updated stats · equal opponent mix', false)
  fs.writeFileSync(path.join(root, 'arena-stat-audit.md'), report)
  fs.writeFileSync(path.join(root, 'arena-stat-role-audit.json'), JSON.stringify({ before: compare(before), after: compare(after), alternateBefore: compare(alternateBefore), alternate: compare(alternate) }, null, 2))
  fs.writeFileSync(path.join(root, 'arena-stat-audit-detailed.md'), comparisonMarkdown(after, 'Updated stats · matched-opponent audit'))
}
if (require.main === module) process.argv.includes('--stat-update') ? writeStatReports() : writeReports()
module.exports = { metrics, compare, comparisonMarkdown, matrix, writeReports, writeStatReports }
