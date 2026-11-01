// Compare post-tutorial trajectories to the preserved STR3 baseline study.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const current=require('./strength-investment');
const old=require('../../artifacts/winter-strength-investment-2026-10-29/model/scripts/winter/strength-investment');
const setup=current.gymBaseline();
assert.deepEqual(setup.purchases.map(p=>p.cost),[2,3]);
assert.equal(setup.strength,3);assert.equal(setup.sweat,0);
const matches=[];
for(const policy of['fixed','daily','instant'])for(const passive of[false,true]){
  assert.deepEqual(current.run(1,'regular',policy,passive,271828),old.run(1,'regular',policy,passive,271828));
  matches.push({tier:1,weapon:'regular',policy,passive,days:31,exact:true});
}
const dir=path.resolve(__dirname,'../../artifacts/winter-gym-tutorial-2026-10-29');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'baseline-equivalence.json'),JSON.stringify({setup,postTutorialMatches:matches.length,matches},null,2)+'\n');
console.log(JSON.stringify({setup,postTutorialMatches:matches.length}));
