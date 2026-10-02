const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { developmentCheck } = require('../scripts/spooky-development-check')

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-settings-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const settings = { TOKEN: 'synthetic-secret-never-output', CLIENTID: '111111111111111111', GUILDID: '222222222222222222',
    CURSEDROLEID: '333333333333333333', SWEETTOOTHROLEID: '444444444444444444', UNWANTEDROLEID: '555555555555555555',
    BOTTESTCHANNELID: '666666666666666666', ...overrides }
  fs.writeFileSync(path.join(root, '.env.development'), Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n'))
  fs.writeFileSync(path.join(root, '.env.production'), 'GUILDID=777777777777777777\n')
  return { root, environment: 'development' }
}

test('valid isolated settings pass without credentials or database/network imports', t => {
  const result = developmentCheck([], fixture(t))
  assert.equal(result.checksPassed, true)
  assert.equal(result.databaseOpened, false)
  assert.equal(result.discordContacted, false)
  assert.equal(result.liveAcceptanceComplete, false)
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false)
  assert.equal(Object.keys(require.cache).some(file => /config[\\/]sequelize\.js$/.test(file)), false)
})
test('requires development and rejects target overrides before file access', () => {
  for (const environment of ['production', 'test', '']) assert.throws(() => developmentCheck([], { environment }), /development is required/)
  assert.throws(() => developmentCheck(['--root=anything']), /no arguments/)
})
test('missing or malformed gameplay IDs fail; one valid channel is sufficient', t => {
  const result = developmentCheck([], fixture(t, { CURSEDROLEID: '', SWEETTOOTHROLEID: 'placeholder', SPOOKYCHANNELID: 'bad' }))
  assert.equal(result.checksPassed, false)
  assert.equal(result.failures.length, 3)
})
test('missing channels and colliding/everyone roles fail', t => {
  const result = developmentCheck([], fixture(t, { BOTTESTCHANNELID: '', CURSEDROLEID: '222222222222222222', SWEETTOOTHROLEID: '222222222222222222' }))
  assert.equal(result.checksPassed, false)
  assert.equal(result.failures.length, 3)
})
test('selected file gaps cannot be filled by inherited settings', t => {
  const previous = process.env.CURSEDROLEID
  process.env.CURSEDROLEID = '999999999999999999'
  t.after(() => { if (previous === undefined) delete process.env.CURSEDROLEID; else process.env.CURSEDROLEID = previous })
  const result = developmentCheck([], fixture(t, { CURSEDROLEID: '' }))
  assert.equal(result.checksPassed, false)
  assert.match(result.failures[0], /CURSEDROLEID/)
})
test('shared production target is rejected', t => {
  assert.throws(() => developmentCheck([], fixture(t, { GUILDID: '777777777777777777' })), /must differ/)
})
