const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), Sequelize = require('sequelize')
const { selectProductionTarget, inspectDatabase, createMigrationPlan, applyMigrations } = require('../services/spooky/storage-tools')
const { parseArguments } = require('../scripts/spooky-production-storage')
test('production CLI requires explicit environment, target, stopped writers and reviewed hash', () => {
  assert.deepEqual(parseArguments(['status','--production'], 'production'), { command: 'status', confirmStopped: false })
  for (const env of [undefined,'development','test','']) assert.throws(() => parseArguments(['status','--production'], env), /NODE_ENV/)
  for (const args of [['status'],['status','--development'],['status','--production','--database','x'],['backup','--production'],['apply','--production','--confirm-stopped']]) assert.throws(() => parseArguments(args,'production'))
})
test('production selection, backup and four-migration apply preserve legacy rows and never mutate development', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'spooky-prod-launch-'))
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); await fs.rm(root,{recursive:true,force:true}) })
  await fs.mkdir(path.join(root,'config'))
  for (const [env,id] of [['development','111111111111111111'],['production','222222222222222222']]) await fs.writeFile(path.join(root,'.env.'+env),`TOKEN=synthetic\nCLIENTID=${id}\nGUILDID=${id}\n`)
  const create = async name => {
    const db = new Sequelize({dialect:'sqlite',storage:path.join(root,'config',name),logging:false})
    try { await db.query('CREATE TABLE LegacyBalance (id TEXT PRIMARY KEY, bank INTEGER)'); await db.query("INSERT INTO LegacyBalance VALUES ('synthetic',73)") } finally { await db.close() }
  }
  await create('dev.sqlite'); await create('prod.sqlite')
  const before = await fs.readFile(path.join(root,'config/dev.sqlite'))
  await assert.rejects(() => selectProductionTarget({environment:'development',root}), /explicit production/)
  const target = await selectProductionTarget({environment:'production',root}), plan = createMigrationPlan(await inspectDatabase(target))
  assert.equal(target.environment,'production'); assert.equal(plan.applying.length,4)
  const result = await applyMigrations(target,{confirmStopped:true,planHash:plan.planHash})
  assert.equal(result.status.classification,'complete'); assert.ok(result.backupPath)
  assert.deepEqual(await fs.readFile(path.join(root,'config/dev.sqlite')),before)
  const db = new Sequelize({dialect:'sqlite',storage:target.databasePath,logging:false})
  try { const [[row]]=await db.query('SELECT bank FROM LegacyBalance'); assert.equal(row.bank,73) } finally { await db.close() }
  await fs.unlink(target.databasePath); await fs.link(path.join(root,'config/dev.sqlite'),target.databasePath)
  await assert.rejects(() => selectProductionTarget({environment:'production',root}), /same file/)
})
