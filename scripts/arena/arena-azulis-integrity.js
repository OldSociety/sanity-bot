// Compare existing fighters with the exact pre-task combat source snapshot.
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto')
process.env.NODE_ENV = 'development'
const filename = require.resolve('../services/arena/combat')
const instance = new Module(filename, module)
instance.filename = filename
instance.paths = Module._nodeModulePaths(path.dirname(filename))
instance._compile(
  fs.readFileSync(
    path.resolve('config/backups/azulis-before/combat.js'),
    'utf8',
  ),
  filename,
)
const previous = instance.exports,
  current = require(filename)
const { resolveCharacter } = require('../../services/arena/characters')
const { loadBalance } = require('../../services/arena/balance-config')
const candidate = loadBalance('development')
delete candidate.characters['classic-azulis']
delete candidate.ai.characters['classic-azulis']
delete candidate.baseStats['classic-azulis']
const loaderName = require.resolve('../services/arena/balance-config')
const loader = new Module(loaderName, module)
loader.filename = loaderName
loader.paths = Module._nodeModulePaths(path.dirname(loaderName))
loader._compile(
  fs.readFileSync('config/backups/azulis-before/balance-config.js', 'utf8'),
  loaderName,
)
assert.deepEqual(candidate, loader.exports.loadBalance('development'))
let checks = 0
for (const name of ['Marq', 'Hellfed Marq', 'Maxim'])
  for (const enemy of ['Marq', 'Maxim'])
    for (const action of ['basic', 'special1', 'special2', 'special3'])
      for (const outcome of ['hit', 'miss', 'critical', 'recovery'])
        for (const duality of [
          [8, 4],
          [1, 2],
          [6, 6],
        ]) {
          const battle = current.newBattle(5, {
            character: resolveCharacter(name),
            opponent: enemy,
          })
          battle.player.hp = 100
          battle.enemy.hp = 150
          battle.enemy.fear = 5
          battle.player.criticalReady = true
          const resolve = (engine) => {
            let d = 0,
              c = 0
            return engine.takeTurn(
              structuredClone(battle),
              action === 'special3' ? { special3: true, choice: 3 } : action,
              () => [2, 1][c++ % 2],
              () => duality[d++],
              () => 0,
              () => (outcome === 'miss' ? 99 : 0),
              () => (outcome === 'critical' ? 0 : 99),
              () => 0,
              {
                rollRecovery: () => (outcome === 'recovery' ? 0 : 99),
                rollFinisher: () => 40,
              },
            )
          }
          assert.deepEqual(resolve(current), resolve(previous))
          checks++
        }
const files = [
  'config/arena/arena-balance.json',
  'config/arena/arena-balance-development.json',
  ...require('../../services/arena/character-config').characterConfigFiles,
  'services/arena/character-config.js',
  'assets/badges/Classic/AZULIS_BADGE.png',
]
const hashes = Object.fromEntries(
  files.map((file) => [
    file,
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  ]),
)
const result = {
  existingFighterExactStateComparisons: checks,
  priorDevelopmentConfigUnchangedAfterRemovingOnlyAzulis: true,
  productionBalanceMatchesBase:
    JSON.stringify(loadBalance('production')) ===
    JSON.stringify(require('../../config/arena/arena-balance.json')),
  hashes,
}
fs.writeFileSync(
  'artifacts/azulis/integrity.json',
  JSON.stringify(result, null, 2),
)
console.log(JSON.stringify(result))
