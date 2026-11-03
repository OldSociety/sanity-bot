const test = require('node:test'), assert = require('node:assert/strict');
const { ButtonStyle } = require('discord.js');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');

test('Throw keeps green equipment and page links while blue fight selection lives on a separate screen', () => {
  for(const target of [1,2,3,4]) for(const equipped of ['regular','red','ice','brown']) {
    const s=M.fresh('s3',1);s.liveRules=true;s.owned[4]=true;s.tiers[4]={...s.tiers[3]};s.iceRecipe=true;s.target=target;s.equipped=equipped;
    s.brown={inventory:1,generated:1,spent:0,remainderMs:0,pieces:0,read:0,rng:1};
    for(const resource of ['snow','red','ice'])M.change(s,resource,100,'fixture');
    const before=structuredClone(s),out=screen({state:s,action:'throw'},'u');
    assert.equal(out.components.length,2);assert.deepEqual(out.components.map(r=>r.components.length),[4,5]);
    const rows=out.components.map(r=>r.components);
    for(const b of rows[0])assert.equal(b.data.style,b.data.custom_id.includes(`:equip-${equipped}:`)?ButtonStyle.Success:ButtonStyle.Secondary);
    assert.deepEqual(rows[1].map(b=>b.data.label),['Change Snowman','Shop','Gym','Emporium','Refresh']);
    assert(!out.components.flatMap(r=>r.components).some(b=>b.data.custom_id.includes(':select-s')));
    const picker=screen({state:s,action:'snowmen'},'u');
    for(const b of picker.components.flatMap(r=>r.components).filter(b=>b.data.custom_id.includes(':select-s')))assert.equal(b.data.style,b.data.custom_id.includes(`:select-s${target}:`)?ButtonStyle.Primary:ButtonStyle.Secondary);
    assert.deepEqual(s,before);
  }
});

test('single-opponent Throw keeps equipment and Refresh while tutorial handoffs remain available', () => {
  const s=M.fresh('gym');s.liveRules=true;
  const out=screen({state:s,action:'throw'},'u');
  assert(!out.components.flatMap(r=>r.components).some(b=>b.data.label.startsWith('Fight S')));
  assert.equal(out.components.at(-1).components.at(-1).data.label,'Refresh');
  s.chapter=0;
  assert(screen({state:s,action:'throw'},'u').components.flatMap(r=>r.components).some(b=>b.data.label==='Shop'));
});
