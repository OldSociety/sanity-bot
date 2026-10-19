const test = require('node:test')
const { execFileSync } = require('node:child_process')
test('offline Brink-aware decisions conserve Finishers without future dice knowledge', () => {
  execFileSync(
    process.execPath,
    [
      '-e',
      String.raw`
    const assert=require('node:assert/strict')
    const {newBattle}=require('./services/arena/combat')
    const {resolveCharacter}=require('./services/arena/characters')
    const {chooseBrinkAware}=require('./scripts/hellfed-brink-policy')
    const b=newBattle(5,{character:resolveCharacter('Hellfed Marq'),opponent:'marq'})
    b.player.rage=3;b.enemy.hp=100
    assert.equal(chooseBrinkAware(b,'narrow').action,'special3')
    assert.equal(chooseBrinkAware(b,'aware').action,'special2')
    b.enemy.brinkUsed=true
    assert.equal(chooseBrinkAware(b,'aware').action,'special3')
    b.enemy.brinkUsed=false;b.enemy.hp=40
    assert.equal(chooseBrinkAware(b,'narrow').action,'special2')
    b.enemy.hp=6
    assert.equal(chooseBrinkAware(b,'aware').action,'basic')
    b.player.rage=2
    assert.equal(chooseBrinkAware(b,'aware').action,'special1')
    b.enemy.hp=260;b.player.rage=3
    assert.equal(chooseBrinkAware(b,'aware').action,'special3')
  `,
    ],
    {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    }
  )
})
