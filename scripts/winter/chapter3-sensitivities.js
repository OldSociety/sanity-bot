const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/chapter3-audit-model'),R=require('./chapter3-audit');
function factor(id){
 const p=structuredClone(M.AUDIT.packages[0]),f={id,p,config:{},options:{},profile:'four',policy:'balanced'};
 switch(id){
 case'supply8':p.yellowPerHour=8;break;case'supply36':p.yellowPerHour=36;break;case'supply60':p.yellowPerHour=60;break;
 case'damage140':p.yellowDamage=140;break;case'damage320':p.yellowDamage=320;break;
 case'selfFraction':p.selfMode='fraction';p.selfFraction=.1;break;case'selfFlat':p.selfMode='flat';p.selfDamage=20;break;
 case'selfOnHit':p.selfMode='onHit';break;case'selfFragile':p.selfMode='fragile';break;
 case'shopSupply':p.shop='supply';break;case'shopEndurance':p.shop='endurance';break;case'shopRitual':p.shop='ritual';break;
 case'noHpEffect':f.config.disableHpShop=true;break;case'noYieldEffect':f.config.disableYieldShop=true;break;case'noBeltEffect':f.config.disableBeltShop=true;break;
 case'corpses180':p.corpseTarget=180;break;case'corpses540':p.corpseTarget=540;break;
 case'wins0':p.winRequirement=0;break;case'wins100':p.winRequirement=100;break;
 case'craft75m':p.craftSnow=75000000;break;case'threePhases':p.ritualSteps=3;break;case'keepGolden':p.tradeGolden=false;break;
 case'defUnlockACC25':f.config.defenseUnlock='ACC25';break;case'defArmor':f.config.defenseMode='armor';break;case'defHp':f.config.defenseMode='hp';break;
 case'spc1percent':f.config.spcRate=.01;f.policy='spc';break;case'spc3percent':f.config.spcRate=.03;f.policy='spc';break;
 case'separatePricing':f.config.shared=false;break;
 case'passiveHalf':f.config.passive={divisor:6,breakpoint:25,exponent:.5};break;
 case'passiveDouble':f.config.passive={divisor:1.5,breakpoint:25,exponent:.5};break;
 case'dailyVisits':f.profile='daily';break;case'frequentVisits':f.profile='frequent';f.options.fireMinBatch=50;break;
 case'farmS3':f.options.farmTier=3;break;case'farmS1':f.options.farmTier=1;break;
 default:throw Error('Unimplemented preregistered factor '+id);
 }p.id='factor-'+id;return f;
}
function main(){
 const root=path.resolve(process.argv[2]||'artifacts/winter-chapter3-audit-2026-10-29'),out=path.join(root,'sensitivities');
 if(fs.existsSync(out))throw Error('Preserve earlier factors.');fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(M.AUDIT.sensitivityFactors.map(factor),null,2));
 const entries=JSON.parse(fs.readFileSync(path.join(root,'entries.json'))),summaries=[];
 for(const id of M.AUDIT.sensitivityFactors){
  const f=factor(id),cached=Object.keys(f.config).length===0?entries.filter(e=>e.profile===f.profile&&e.policy===f.policy):[];
  const starts=cached.length===32?cached:Array.from({length:32},(_,i)=>R.prepare(1030001+i,f.profile,f.policy,f.config));
  const rows=starts.map(e=>R.continueChapter(e,f.p,f.options));assert.deepEqual(R.continueChapter(starts[0],f.p,f.options),rows[0]);
  const sum={factor:id,...R.summarize(rows)};summaries.push(sum);fs.writeFileSync(path.join(out,id+'-results.json'),JSON.stringify(rows));
  console.log(JSON.stringify({stage:'factor',id,complete:sum.completed,days:sum.medianChapterHours===null?null:sum.medianChapterHours/24,s5:sum.s5Wins.median,corpses:sum.corpses.median}));
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
 }
 const files=['config/winter/chapter3-audit-2026-10-29.json','services/winter/chapter3-audit-model.js','scripts/winter/chapter3-audit.js','scripts/winter/chapter3-sensitivities.js'],manifest={};
 for(const file of files){const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(path.join(out,'complete.json'),JSON.stringify({manifest,declared:M.AUDIT.sensitivityFactors.length,executed:summaries.length,histories:summaries.length*32,allFactorsCompleted:summaries.length===M.AUDIT.sensitivityFactors.length},null,2));
}
if(require.main===module)main();module.exports={factor};
