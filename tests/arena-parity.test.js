const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
process.env.NODE_ENV = 'development'
const { combat, policy, tactics } =
  require('../scripts/arena-parity-engine').setup({ attackOutcomes: false })
const { resolveCharacter } = require('../services/arena/characters')
const { specialDamage, basicDamage } = require('../services/arena/damage')
const { createPolicy } = require('../scripts/arena-parity-policy')
const make = (player = 'Hellfed Marq', enemy = 'Marq') =>
  combat.newBattle(0, { character: resolveCharacter(player), opponent: enemy })

test('common rule chooses cheap guaranteed S2 over overkill S3, including Brink', () => {
  const battle = make()
  battle.player.hope = 5
  battle.player.rage = 3
  battle.enemy.hp = 60
  const before = structuredClone(battle.enemy)
  assert.equal(policy(battle.player, battle.enemy).slot, 'special2')
  assert.equal(policy(battle.player, battle.enemy).goal, 'consume-survival')
  assert.deepEqual(battle.enemy, before)
  battle.enemy.brinkUsed = true
  assert.equal(policy(battle.player, battle.enemy).goal, 'defeat')
})
test('guaranteed Stoke is preferred for cheap basic lethal; misses cannot defeat guaranteed alternatives', () => {
  const battle = make()
  battle.player.hope = 5
  battle.enemy.hp = 5
  assert.equal(policy(battle.player, battle.enemy).slot, 'special1')
  battle.player.rage = 3
  assert.equal(policy(battle.player, battle.enemy).slot, 'special2')
})
test('survival outcome adapter supports future effects without kit-specific policy changes', () => {
  let called = false
  const decide = createPolicy(tactics, (target) => {
    called = true
    return {
      goal: 'break-shield',
      previewTarget: { ...target, hp: 5, brinkUsed: true },
    }
  })
  const battle = make()
  assert.equal(decide(battle.player, battle.enemy).goal, 'break-shield')
  assert.equal(called, true)
})
test('player specials preview their actual replacement action without fabricated basic damage', () => {
  const battle = make('Marq', 'Maxim')
  const actual = specialDamage(battle.player, 'special3', { choice: 3 }).damage
  assert.equal(
    tactics.preview(battle.player, battle.enemy, 'special3', 3).expected,
    actual
  )
})
test('offline Hellfed enemy builds Rage, pays tier HP and guarantees Stoke basic', () => {
  const battle = make('Hellfed Marq', 'Hellfed Marq')
  assert.equal(policy(battle.enemy, battle.player).slot, 'special1')
  const next = combat.takeTurn(
    battle,
    'basic',
    () => 1,
    () => 6,
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { rollRecovery: () => 99 }
  )
  assert.equal(next.enemySpecial, 'special1')
  assert.equal(next.enemy.rage, 1)
  assert.equal(next.enemy.hp, 260 - next.playerBasicDamage - 3)
  assert.equal(
    next.statistics.enemy.damage.basic,
    basicDamage(battle.enemy, battle.player)
  )
})
test('Hellfed enemy damage scales with Rage and S3 stays guaranteed', () => {
  const battle = make('Maxim', 'Hellfed Marq')
  battle.enemy.rage = 3
  assert.equal(specialDamage(battle.enemy, 'special2').damage, 68)
  assert.equal(
    specialDamage(battle.enemy, 'special3', { percent: 40 }).damage,
    128
  )
  assert.ok(
    tactics.preview(battle.enemy, { ...battle.player, hp: 100 }, 'special3')
      .knockout > 0.999
  )
})
test('offline enemy adapter respects all tier costs, full Rage, low HP and ordinary miss decay', () => {
  const respond = (battle) =>
    combat.advance(
      battle,
      {},
      () => 1,
      () => 6,
      () => 99,
      () => 99,
      () => 99,
      () => 99,
      { actor: 'enemy', rollRecovery: () => 99 }
    )
  for (const [rage, cost] of [
    [0, 3],
    [1, 6],
    [2, 8],
  ]) {
    const battle = make('Hellfed Marq', 'Hellfed Marq')
    battle.enemy.rage = rage
    const next = respond(battle)
    assert.equal(next.enemySpecial, 'special1')
    assert.equal(next.enemy.hp, 260 - cost)
    assert.equal(next.enemy.rage, rage + 1)
  }
  for (const [rage, hp] of [
    [3, 260],
    [2, 8],
  ]) {
    const battle = make('Hellfed Marq', 'Hellfed Marq')
    Object.assign(battle.enemy, { rage, hp })
    const next = respond(battle)
    assert.equal(next.enemySpecial, null)
    assert.equal(next.enemy.rage, rage - 1)
    assert.equal(next.enemy.hp, hp)
  }
})
test('all non-Hellfed mechanics reproduce stock combat with forced legacy choices', () => {
  const source = `
    process.env.NODE_ENV='development';
    const adapted=process.argv[1]==='adapter';
    const combat=adapted?require('./scripts/arena-parity-engine').setup().combat:require('./services/arena/combat');
    const {resolveCharacter}=require('./services/arena/characters');
    const {canUse}=require('./services/arena/rules');
    let seed=123456; const r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    const pct=()=>r()*100, integer=()=>Math.floor(pct()),die=n=>()=>1+Math.floor(r()*n);
    const out=[];
    for(const p of ['Marq','Maxim'])for(const e of ['Marq','Maxim'])for(let t=0;t<10;t++){
      let b=combat.newBattle(0,{character:resolveCharacter(p),opponent:e});
      while(b.status==='playing'){
        const s=['special3','special2','special1'].find(k=>canUse(b.player,k));
        b=combat.takeTurn(b,s==='special3'?{special3:true,choice:3}:s||'basic',die(4),die(12),pct,integer,integer,pct,{aiPolicy:'legacy',rollRecovery:pct,rollFinisher:()=>35+Math.floor(r()*11)});
      }out.push(b);
    }
    process.stdout.write(require('node:crypto').createHash('sha256').update(JSON.stringify(out)).digest('hex'));
  `
  const result = (mode) =>
    execFileSync(process.execPath, ['-e', source, mode], { encoding: 'utf8' })
  assert.equal(result('adapter'), result('stock'))
})
