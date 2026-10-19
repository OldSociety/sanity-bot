// Read structured timing logs only; never load bot credentials or storage.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const production = process.argv.includes('--production')
const environment = production ? 'production' : 'development'
const marker = `Spooky ${environment} timing: `
const log = path.join(os.homedir(), '.pm2', 'logs', `SB-${environment}-out.log`)
const trialTwo = process.argv.includes('--trial-2')
const offset = production ? JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/spooky-production-rollout.json'), 'utf8')).logs.out
  : trialTwo ? JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/spooky-development-trial-2-baseline.json'), 'utf8')).outOffset : 0
const traces = fs.existsSync(log) ? fs.readFileSync(log).subarray(offset).toString('utf8').split(/\r?\n/)
  .filter(line => line.includes(marker)).map(line => { try { return JSON.parse(line.slice(line.indexOf(marker) + marker.length)) } catch { return null } }).filter(Boolean) : []
function stats(rows, key) {
  const values = rows.map(row => row[key]).filter(Number.isFinite).sort((a, b) => a - b)
  if (!values.length) return null
  const middle = Math.floor(values.length / 2)
  return { samples: values.length, median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, p95: values[Math.max(0, Math.ceil(values.length * .95) - 1)], max: values.at(-1) }
}
const groups = { ordinary: traces.filter(row => !row.failed && !row.player_choice_wait_ms),
  choices: traces.filter(row => !row.failed && row.player_choice_wait_ms), rejected: traces.filter(row => row.failed) }
const report = { environment, trial: production ? 'production rollout' : trialTwo ? 2 : 'all', samples: traces.length,
  targetChoices: { prompted: traces.filter(row => row.target_choice_prompted === true).length, automatic: traces.filter(row => row.target_choice_prompted === false).length },
  groups: Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, {
  count: rows.length, resultProcessingMs: stats(rows, 'result_processing_ms'), resultElapsedMs: stats(rows, 'result_delivered_ms'),
  totalProcessingMs: stats(rows, 'processing_ms'), playerWaitMs: stats(rows, 'player_choice_wait_ms'),
  actorFetchMs: stats(rows, 'actor_membership_ms'), memberSnapshotMs: stats(rows, 'member_snapshot_ms'),
  permissionSnapshotMs: stats(rows, 'permission_snapshot_ms'), queueWaitMs: stats(rows, 'database_queue_wait_ms'),
  databaseWorkMs: stats(rows, 'database_work_ms'), publicDeliveryMs: stats(rows, 'public_delivery_ms'),
}])) }
console.log(JSON.stringify(report, null, 2))
