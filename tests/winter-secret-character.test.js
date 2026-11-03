const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const B = require('../services/winter/game/brown-snowballs');
const { createStore } = require('../services/winter/game/saved-progress');
const { screen } = require('../services/winter/game/screens');
const { nnorahc } = require('../services/winter/game/characters');

test('correct recipe discovers N\'norah\'c once and renders the supplied placeholder', () => {
  const s = M.fresh('s3',1); s.liveRules=true;
  for(const x of B.recipe)M.action(s,'ingredient',x);
  const message=M.action(s,'mix');assert.match(message,/You discovered N'norah'c!/);assert(s.secretCharacters.nnorahc);assert.equal(s.milestones.nnorahc,0);
  const out=screen({state:s,action:'mix',message},'u');assert.equal(out.embeds[0].data.title,'Secret character discovered!');assert.equal(out.embeds[0].data.image.url,'attachment://nnorahc-placeholder.jpeg');
  assert(out.files.some(f=>f.attachment===nnorahc.image));assert(fs.existsSync(nnorahc.image));
  for(const x of B.recipe)M.action(s,'ingredient',x);assert.match(M.action(s,'mix'),/already know/);
  const wrong=M.fresh('s3');for(const x of B.recipe.slice().reverse())M.action(wrong,'ingredient',x);M.action(wrong,'mix');assert.equal(wrong.secretCharacters,undefined);
});

test('development Emporium uses the supplied Winter Azulis badge', () => {
  const s=M.fresh('s3');const out=screen({state:s,action:'emporium'},'u');
  assert(out.files.some(f=>typeof f.attachment==='string'&&f.attachment.endsWith('WINTER_AZULIS_BADGE.png')));
  assert(!out.files.some(f=>typeof f.attachment==='string'&&f.attachment.endsWith('Classic/AZULIS_BADGE.png')));
});

test('character ownership survives new runs, is scoped by player/server, and rolls back on failure', async t => {
  const db=new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>db.close());let n=0,fail=false;
  const options={sequelize:db,clock:()=>0,seed:()=>1,beforeCommit:async({input})=>{if(fail&&input.action==='mix')throw Error('injected rollback')}};
  let store=createStore(options);
  const run=(action,extra={})=>store.execute({id:`secret-${++n}`,guildId:'g',userId:'u',action,...extra});
  const start=()=>run('diagnostic',{diagnostic:{mode:'start',speed:1,bookmark:'s3',stopAt:'none',reportMinutes:0,channelId:'c'}});
  const prepare=async id=>{const [[r]]=await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=$id',{bind:{id}});const s=JSON.parse(r.state);s.recipeDraft={ingredients:[...B.recipe],ingredientOrder:require('../services/winter/recipes').IDS.slice()};await db.query('UPDATE WinterPlaytestRuns SET state=$s WHERE id=$id',{bind:{id,s:JSON.stringify(s)}});};
  await start();await prepare(1);fail=true;await assert.rejects(()=>run('mix'),/injected rollback/);
  assert.equal((await db.query('SELECT * FROM WinterPlaytestCharacterUnlocks'))[0].length,0);
  fail=false;const q={id:'solve',guildId:'g',userId:'u',action:'mix'};const result=await store.execute(q);await store.execute(q);
  assert.equal(result.secretCharacters.length,1);assert.equal((await db.query('SELECT * FROM WinterPlaytestCharacterUnlocks'))[0].length,1);
  const frozen=JSON.parse((await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1'))[0][0].state);
  await start();store=createStore(options);const hidden=await run('hidden');assert.equal(hidden.secretCharacters[0].characterId,'nnorahc');
  assert(screen(hidden,'u').embeds[0].data.fields.some(f=>f.name==='Discovered character'&&f.value===nnorahc.name));
  await prepare(2);const repeat=await run('mix');assert.match(repeat.message,/already know/);assert.equal((await db.query('SELECT * FROM WinterPlaytestCharacterUnlocks'))[0].length,1);
  const other=await run('status',{userId:'other'});assert.equal(other.secretCharacters.length,0);
  const server=await run('status',{guildId:'other-guild'});assert.equal(server.secretCharacters.length,0);
  const old=JSON.parse((await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1'))[0][0].state);assert.deepEqual(old,frozen);
});
