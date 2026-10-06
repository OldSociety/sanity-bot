const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveRuntime, loadDiscordEnvironment } = require('../config/runtime')

function fixture(t, dev = '', prod = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-env-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, '.env.development'), dev)
  fs.writeFileSync(path.join(root, '.env.production'), prod)
  return root
}
const dev = 'TOKEN=fake-development-token\nCLIENTID=111111111111111111\nGUILDID=222222222222222222\nSPOOKYCHANNELID=dev-channel\n'
const prod = 'TOKEN=fake-production-token\nCLIENTID=333333333333333333\nGUILDID=444444444444444444\nPROD_ONLY=value\n'

test('default is development; database paths are independent of working directory', () => {
  const runtime = resolveRuntime(undefined)
  assert.equal(runtime.env, 'development')
  assert.ok(path.isAbsolute(runtime.database.storage))
  assert.equal(path.basename(runtime.database.storage), 'dev.sqlite')
  assert.equal(path.basename(resolveRuntime('production').database.storage), 'prod.sqlite')
})
test('unknown environments fail closed', () => {
  for (const env of ['', 'staging', 'Development']) assert.throws(() => resolveRuntime(env), /NODE_ENV/)
})

test('both bots use one checkout and stale worktree overrides cannot redirect storage', t => {
  const prior = process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT
  t.after(() => prior === undefined ? delete process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT : process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT = prior)
  const root = fixture(t, dev, prod)
  process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT = root
  const checkout = path.resolve(__dirname, '..')
  assert.equal(resolveRuntime('development').root, checkout)
  assert.equal(resolveRuntime('development').database.storage, path.join(checkout, 'config', 'dev.sqlite'))
  assert.equal(resolveRuntime('production').root, checkout)
  assert.equal(resolveRuntime('production').database.storage, path.join(checkout, 'config', 'prod.sqlite'))
  assert.equal(resolveRuntime('test').database.storage, ':memory:')
  const target = {}
  assert.equal(loadDiscordEnvironment('development', { root, target }).root, root)
  assert.equal(target.GUILDID, '222222222222222222')
  process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT = 'relative-folder'
  assert.equal(resolveRuntime('development').root, checkout)
})

test('PM2 names both bots explicitly and pins their shared source and separate environments', () => {
  const { apps } = require('../ecosystem.config')
  assert.deepEqual(apps.map(app => app.name), ['SB-development', 'SB-production'])
  for (const app of apps) {
    assert.equal(app.cwd, path.resolve(__dirname, '..'))
    assert.equal(app.script, 'app.js')
    assert.equal(app.env.NODE_ENV, app.name === 'SB-production' ? 'production' : 'development')
  }
})
test('test environment is always memory-only and cannot load Discord credentials', () => {
  assert.equal(resolveRuntime('test').database.storage, ':memory:')
  assert.equal(resolveRuntime('test').envFile, null)
  assert.throws(() => loadDiscordEnvironment('test'), /disabled/)
})
test('selected file overrides inherited credentials and removes other-environment keys', t => {
  const root = fixture(t, dev, prod)
  const target = { TOKEN: 'inherited-production', GUILDID: '444444444444444444', PROD_ONLY: 'inherited' }
  const runtime = loadDiscordEnvironment('development', { root, target })
  assert.equal(target.TOKEN, 'fake-development-token')
  assert.equal(target.GUILDID, '222222222222222222')
  assert.equal(target.PROD_ONLY, undefined)
  assert.equal(target.SPOOKYCHANNELID, 'dev-channel')
  assert.equal(target.NODE_ENV, 'development')
  assert.equal(runtime.productionGuildComparison, 'distinct')
  loadDiscordEnvironment('production', { root, target })
  assert.equal(target.TOKEN, 'fake-production-token')
  assert.equal(target.SPOOKYCHANNELID, undefined)
})
test('missing selected credentials cannot fall back to inherited values', t => {
  const root = fixture(t, dev.replace('TOKEN=fake-development-token\n', ''), prod)
  const target = { TOKEN: 'inherited-token' }
  assert.throws(() => loadDiscordEnvironment('development', { root, target }), /Missing TOKEN/)
  assert.equal(target.TOKEN, 'inherited-token')
})
test('development and production cannot use the same guild', t => {
  const root = fixture(t, dev, prod.replace('444444444444444444', '222222222222222222'))
  assert.throws(() => loadDiscordEnvironment('development', { root, target: {} }), /must differ/)
})
test('missing files and conflicting file environments fail before mutation', t => {
  const root = fixture(t, dev + 'NODE_ENV=production\n', prod)
  assert.throws(() => loadDiscordEnvironment('development', { root, target: {} }), /conflicting/)
  fs.unlinkSync(path.join(root, '.env.development'))
  assert.throws(() => loadDiscordEnvironment('development', { root, target: {} }), /Missing environment file/)
})
test('actual Sequelize adapter uses disposable memory databases with isolated state', async () => {
  assert.equal(process.env.NODE_ENV, 'test')
  const sequelize = require('../config/sequelize')
  const Sequelize = require('sequelize')
  const second = new Sequelize(resolveRuntime('test').database)
  try {
    assert.equal(sequelize.options.storage, ':memory:')
    await sequelize.query('CREATE TABLE baseline_probe (value INTEGER NOT NULL)')
    await sequelize.query('INSERT INTO baseline_probe VALUES (42)')
    const [rows] = await sequelize.query('SELECT value FROM baseline_probe')
    assert.equal(rows[0].value, 42)
    const [tables] = await second.query("SELECT name FROM sqlite_master WHERE name = 'baseline_probe'")
    assert.equal(tables.length, 0)
  } finally {
    await Promise.all([sequelize.close(), second.close()])
  }
})
