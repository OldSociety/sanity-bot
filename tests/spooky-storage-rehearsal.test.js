const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { runRehearsal } = require('../scripts/spooky-storage-rehearsal')

test('disk/WAL backups restore economy receipts and ambiguous delivery state; reverse rollback preserves existing accounts', async () => {
  const directories = []
  const report = await runRehearsal({ onCheckpoint: async ({ directory }) => directories.push(directory) })
  assert.equal(report.status, 'passed')
  assert.equal(report.beforeRestoreMatches, true); assert.equal(report.populatedRestoreMatches, true)
  assert.equal(report.schemaRollbackPreservesExistingData, true); assert.equal(report.reapplyCreatesEmptySeasonalTables, true)
  assert.equal(report.autoincrementHighWatermarkPreserved, true)
  assert.equal(report.migrations.length, 4); assert.equal(report.permanentBadgeTables, 1)
  assert.deepEqual(report.restoredBadges, ['spooky-2026:sel'])
  assert.equal(report.permanentOwnershipRestoreMatches, true)
  assert.equal(report.seasonalSchemaRollbackPreservesBadges, true)
  assert.equal(report.restoredOperationReplayPreservesBadge, true)
  assert.equal(report.restoredParticipantResetPreservesBadges, true)
  assert.equal(report.syntheticStorageOnly, true); assert.equal(report.discordAccessed, false)
  assert.equal(report.spookyTables, 8); assert.equal(report.integrity, 'ok'); assert.equal(report.foreignKeyViolations, 0)
  assert.deepEqual(report.existingWallet, { bank: 73, fate_points: 12 })
  assert.deepEqual(report.restoredQueueStates, { delivery: 'pending', notification: 'uncertain' })
  assert.equal(report.temporaryFilesRemoved, true)
  for (const directory of directories) await assert.rejects(() => fs.stat(directory), { code: 'ENOENT' })
})

test('backup/migration rehearsal failure closes SQLite handles and removes only generated artifacts', async () => {
  for (const wanted of ['baseline_backup', 'populated_backup', 'badge_restore_reset']) {
    let directory
    await assert.rejects(() => runRehearsal({ onCheckpoint: async checkpoint => {
      directory = checkpoint.directory
      if (checkpoint.stage === wanted) throw new Error('Injected rehearsal interruption')
    } }), /Injected rehearsal interruption/)
    await assert.rejects(() => fs.stat(directory), { code: 'ENOENT' })
  }
})

test('parallel storage rehearsals use separate generated databases and both clean up', async () => {
  const directories = new Set()
  const reports = await Promise.all([0, 1].map(() => runRehearsal({ onCheckpoint: async ({ directory }) => directories.add(directory) })))
  assert.equal(directories.size, 2)
  assert.ok(reports.every(report => report.status === 'passed' && report.temporaryFilesRemoved))
  for (const directory of directories) await assert.rejects(() => fs.stat(directory), { code: 'ENOENT' })
})
