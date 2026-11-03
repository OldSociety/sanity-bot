const test=require('node:test'),assert=require('node:assert/strict');
const {ButtonBuilder,ButtonStyle}=require('discord.js');
const {Sequelize}=require('sequelize');
const L=require('../services/winter/game/snowman-selection');
const M=require('../services/winter/game/game');
const {screen,viewFor}=require('../services/winter/game/screens');
const {createStore}=require('../services/winter/game/saved-progress');
const b=(action,label)=>new ButtonBuilder().setCustomId(`snow:u:pt:normal:${action}:1`).setLabel(label).setStyle(ButtonStyle.Secondary);
const controls=out=>out.components.flatMap(r=>r.components);
function picker(n,page=0){return L.selector({targets:Array.from({length:n},(_,i)=>i+1),page,
  fight:t=>b(`select-s${t}`,`Fight S${t}`).setStyle(t===10?ButtonStyle.Primary:ButtonStyle.Secondary),
  back:b('throw','Back to Fight'),optional:[b('shop','Shop'),b('train','Gym'),b('emporium','Emporium')],
  previous:p=>b(`snowmen-page:${p}`,'Previous'),next:p=>b(`snowmen-page:${p}`,'Next')});}

test('selector gradually removes optional links and reaches all ten snowmen through bounded pages',()=>{
  for(const [n,links] of [[6,['Shop','Gym','Emporium']],[7,['Shop','Gym']],[8,['Shop']],[9,[]]]){
    const p=picker(n),labels=controls(p).map(x=>x.data.label);assert.equal(labels.length,10);for(const x of ['Shop','Gym','Emporium'])assert.equal(labels.includes(x),links.includes(x));
  }
  const first=picker(10),last=picker(10,1);assert.equal(first.pages,2);assert.equal(last.pages,2);
  const choices=[...controls(first),...controls(last)].filter(x=>x.data.label.startsWith('Fight S'));
  assert.deepEqual(choices.map(x=>x.data.label),Array.from({length:10},(_,i)=>`Fight S${i+1}`));
  assert.equal(choices.at(-1).data.style,ButtonStyle.Primary);
  for(const p of [first,last]){assert(controls(p).length<=10);assert(p.components.every(r=>r.components.length<=5));assert.equal(controls(p).at(-1).data.label,'Back to Fight');}
  assert.equal(picker(10,99).page,1);
});

test('eight future ammunition controls and all fight navigation fit without dropping controls',()=>{
  const ammo=['regular','red','fire','brown','ice','yellow','necro','future'].map(x=>b(`equip-${x}`,x));
  const nav=[b('snowmen','Change Snowman'),b('shop','Shop'),b('train','Gym'),b('emporium','Emporium'),b('throw','Refresh')];
  const out=L.fight([...ammo,...nav]);assert.deepEqual(out.map(r=>r.components.length),[5,3,5]);assert.equal(out.at(-1).components.at(-1).data.label,'Refresh');
});

test('opening a selector never resets combat, and selecting an available target returns to the fight',async t=>{
  const db=new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>db.close());
  const store=createStore({sequelize:db,clock:()=>0,seed:()=>1});let n=0;
  const run=(action,extra={})=>store.execute({id:`selector-${++n}`,guildId:'g',userId:'u',action,...extra});
  await run('diagnostic',{diagnostic:{mode:'start',speed:1,bookmark:'s3',stopAt:'none',reportMinutes:0,channelId:'c'}});
  const start=await run('throw'),opened=await run('snowmen');assert.deepEqual(opened.state,start.state);assert.equal(viewFor(opened.action),'snowmen');
  const page=await run('snowmen-page',{quantity:'1'});assert.deepEqual(page.state,start.state);assert.equal(page.selectorPage,1);
  const chosen=await run('select-s2');assert.equal(chosen.state.target,2);assert.equal(viewFor(chosen.action),'throw');assert.equal(screen(chosen,'u').embeds[0].data.title,'Snowman 2');
  const s=M.fresh('s3');s.owned[10]=true;s.tiers[10]={...s.tiers[3]};assert.throws(()=>M.action(s,'select-s10'),/not available/);assert.equal(s.target,3);
  const locked=await run('select-s4');assert.equal(locked.outcome,'rejected');assert.equal(locked.state.target,2);
});
