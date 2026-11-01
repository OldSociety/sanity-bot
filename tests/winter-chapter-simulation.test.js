const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../services/winter/chapter-simulation');
const candidate=M.defaults.experimentalFireCandidates[1];
function setup(){const c=M.rules(candidate),s=M.fresh(123,c);return{c,s};}
function endow(s,amount){s.snow+=amount;s.ledger.snowProduced+=amount;}
test('locked design prices and shovel output are centralized; unknown combat stays null',()=>{
 const {c}=setup();assert.equal(c.ironSnowCost,2000000);assert.equal(c.goldenRate,1296);
 assert.deepEqual(c.snowmen.slice(2).map(r=>r.snowPrice),[5000000,5000000,50000000]);
 assert.equal(c.yellowRecipeSnowCost,20000000);assert.deepEqual(c.emporium.map(x=>x.buttons),[10,200,2000,5000]);
 assert.equal(M.defaults.fire.damage,null);assert.equal(c.yellow.damage,null);assert.equal(c.snowmen[4].hp,null);
});
test('accuracy bonuses disappear after defeat and Throw restores them prospectively',()=>{
 const {c,s}=setup();s.accuracy=100;assert(Math.abs(M.accuracy(s,c)-.9)<1e-12);s.penalized=true;assert.equal(M.accuracy(s,c),.35);
 M.visit(s,M.HOUR,c);assert(Math.abs(M.accuracy(s,c)-.9)<1e-12);assert.equal(s.accuracy,100);
});
test('continuous losses reset full HP, retain defeat accuracy and preserve global player cadence',()=>{
 const {c,s}=setup();s.playerHp=1;c.enemyAccuracy=1;c.playerAccuracy=0;
 M.settle(s,10000,c);assert.equal(s.tiers[1].losses,1);assert.equal(s.playerHp,50);assert(s.penalized);assert.equal(s.nextPlayerAt,12000);
 M.settle(s,3600000,c);M.validate(s,c);assert.equal(s.tiers[1].attacks,1200);
});
test('S4 immune attacks consume Ice and still earn Buttons without damaging the opponent',()=>{
 const {c,s}=setup();s.owned[4]=true;s.target=4;s.enemyHp=550;s.iceRecipe=true;s.equipped='ice';c.buttonChance=1;c.playerAccuracy=1;
 endow(s,10000);M.craft(s,'ice',10000,c);M.settle(s,3000,c);
 assert.equal(s.enemyHp,550);assert.equal(s.tiers[4].ice,1);assert.equal(s.tiers[4].immune,1);assert.equal(s.buttons,1);M.validate(s,c);
});
test('Fire damages S4; exhaustion falls back to immune regulars',()=>{
 const {c,s}=setup();s.owned[4]=true;s.target=4;s.enemyHp=550;s.fireUnlock=true;s.equipped='fire';c.playerAccuracy=1;
 endow(s,4000);M.craft(s,'fire',4000,c);M.settle(s,3000,c);assert.equal(s.enemyHp,510);
 M.settle(s,6000,c);assert.equal(s.enemyHp,510);assert.equal(s.tiers[4].regular,1);M.validate(s,c);
});
test('HP purchases spend once and do not heal the ongoing fight',()=>{
 const {c,s}=setup();s.playerHp=7;s.buttons=210;s.ledger.buttonsEarned=210;
 M.emporium(s,c);assert.equal(M.hp(s,c),150);assert.equal(s.playerHp,7);assert.equal(s.buttons,0);
 M.emporium(s,c);assert.equal(s.ledger.buttonsSpent,210);
});
test('Golden output applies only to future elapsed time',()=>{
 const {c,s}=setup();s.iron=true;M.settle(s,M.HOUR,c);const previous=s.ledger.snowProduced;
 assert.equal(previous,777600);s.buttons=7210;s.ledger.buttonsEarned=7210;M.emporium(s,c);assert(s.golden);
 M.settle(s,2*M.HOUR,c);assert.equal(s.ledger.snowProduced-previous,4665600);M.validate(s,c);
});
test('S3 requires preceding victories and payment, but does not explicitly require Iron',()=>{
 const {c,s}=setup();endow(s,5000000);assert(!M.buyOpponent(s,3,c));s.tiers[2].wins=100;s.ledger.combatSweat=200;s.sweat=200;
 assert(M.buyOpponent(s,3,c));assert.equal(s.snow,0);assert(!s.iron);assert(!M.buyOpponent(s,3,c));M.validate(s,c);
});
test('S5 purchase is measurable but combat cannot use invented enemy stats',()=>{
 const {c,s}=setup();s.tiers[4].wins=100;s.sweat=400;s.ledger.combatSweat=400;endow(s,50000000);
 assert(M.buyOpponent(s,5,c));assert.equal(s.snow,0);assert.throws(()=>M.select(s,5,c),/undefined/);M.validate(s,c);
});
test('same-timestamp settlement awards no duplicate income or attacks',()=>{
 const {c,s}=setup();M.settle(s,4*M.HOUR,c);const copy=structuredClone(s);M.settle(s,4*M.HOUR,c);assert.deepEqual(s,copy);
});
test('persisted JSON state reproduces RNG, timers, combat and prospective purchases',()=>{
 const {c,s}=setup();M.settle(s,4*M.HOUR,c);M.visit(s,4*M.HOUR,c);const restored=JSON.parse(JSON.stringify(s));
 M.settle(s,12*M.HOUR,c);M.settle(restored,12*M.HOUR,c);M.visit(s,4*M.HOUR,c);M.visit(restored,4*M.HOUR,c);
 assert.deepEqual(s,restored);M.validate(s,c);
});
test('chronological capture chunk boundaries do not alter outcomes',()=>{
 const {c,s}=setup(),split=structuredClone(s);M.settle(s,24*M.HOUR,c);
 for(let at=M.HOUR;at<=24*M.HOUR;at+=M.HOUR)M.settle(split,at,c);
 assert.deepEqual(s,split);M.validate(s,c);
});
test('experimental price-only S3 gate is explicit and leaves locked baseline unchanged',()=>{
 const {c,s}=setup();s.owned[2]=true;endow(s,5000000);assert(!M.buyOpponent(s,3,c));
 c.experimentalS3Wins=0;assert(M.buyOpponent(s,3,c));assert.equal(s.snow,0);assert.equal(s.tiers[2].wins,0);
});
test('experimental Fire stockpiling carries unspent budget without duplicating income',()=>{
 const {c,s}=setup();s.owned[2]=s.owned[3]=s.owned[4]=true;s.target=4;s.enemyHp=550;s.fireUnlock=true;s.iceRecipe=true;
 endow(s,100000);M.visit(s,300000,c,'strength',{fireMinBatch:50});assert.equal(s.ammo.fire,0);assert.equal(s.experimentalFireBudget,50000);
 endow(s,400000);M.visit(s,300000,c,'strength',{fireMinBatch:50});assert.equal(s.ammo.fire,62);assert.equal(s.experimentalFireBudget,2000);
 assert.equal(s.ledger.ammoSnow,248000);M.validate(s,c);
});
test('Iron players may purchase Ice while still on S2; S3 ownership is not required',()=>{
 const {c,s}=setup();s.iron=true;s.owned[2]=true;endow(s,10000000);
 M.visit(s,4*M.HOUR,c);assert(s.iceRecipe);assert(!s.owned[3]);assert.equal(s.target,2);
 assert.equal(s.ledger.recipeSnow,10000000);M.validate(s,c);
});
