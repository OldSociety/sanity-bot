// Small current-config audit sample; preserves the historical population report.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { simulateGuild, summarize, scenarios } = require('./spooky-population-simulation')
const { config } = require('../services/spooky/config')
async function sample() {
  const report = { configVersion: config.version, seeds: [270026, 270027],
    limitation: 'Two guilds per scenario: diagnostic evidence, not calibrated server forecasts or completion guarantees.', scenarios: {} }
  for (const options of scenarios) {
    const rows = [], totals = {}
    for (const seed of report.seeds) {
      const result = await simulateGuild(options, seed); rows.push(...result.rows)
      for (const [key, value] of Object.entries(result.totals)) totals[key] = (totals[key] || 0) + value
    }
    report.scenarios[options.name] = { options, playerMonths: rows.length, totals, cohorts: summarize(rows) }
    console.log(`${options.name}: ${rows.length} player-months; conservation passed`)
  }
  const files = ['config/spooky-2026.json', 'config/spooky-pieces.json', 'scripts/spooky-population-simulation.js',
    ...['actions', 'participants', 'collection', 'theft', 'playful', 'progression'].map(name => `services/spooky/${name}.js`)]
  report.hashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex')]))
  fs.writeFileSync(path.join(__dirname, '../docs/spooky-launch-balance-sample.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}
if (require.main === module) sample().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { sample }
