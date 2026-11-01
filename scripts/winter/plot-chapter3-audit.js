const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const colors={four:'#b65421',hourly:'#27689e',twice:'#39815c'};
function text(x,y,s,size=22,extra=''){return`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(s)}</text>`;}
function svg(w,h,body){return`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial,sans-serif" fill="#202428">${body}</g></svg>`;}
async function write(out,name,markup){fs.writeFileSync(path.join(out,name+'.svg'),markup);await sharp(Buffer.from(markup)).png().toFile(path.join(out,name+'.png'));}
async function main(){
 const root=path.resolve(process.argv[2]||'artifacts/winter-chapter3-audit-2026-10-29'),out=path.join(root,'figures');fs.mkdirSync(out,{recursive:true});
 const screen=JSON.parse(fs.readFileSync(path.join(root,'screen-summary.json'))),design=JSON.parse(fs.readFileSync('config/winter/chapter3-audit-2026-10-29.json'));
 const left=330,right=1250,top=165,row=78,width=1400,height=900,x=d=>left+d/22*(right-left);
 let b=text(35,48,'Chapter 3: all eight original designs',32)+text(35,82,'Four short visits/day · balanced shared-stat allocation · 32 seeds per option',20)
  +text(35,111,'Bars: median days from Golden to Necro. Whiskers: 10th–90th percentile.',20)
  +text(35,137,'Shaded band: proposed 5–8-day window',17);
 b+=`<rect x="${x(5)}" y="140" width="${x(8)-x(5)}" height="650" fill="#eef0f2"/>`;
 for(let d=0;d<=22;d+=2){b+=`<line x1="${x(d)}" y1="140" x2="${x(d)}" y2="790" stroke="#d6dadd"/>`+text(x(d),825,d,20,'text-anchor="middle"');}
 const shortNames={'fragile-decay':'Loss-sensitive decay','hit-poison':'Hit-triggered poison'};
 design.packages.forEach((p,i)=>{const s=screen.find(r=>r.package===p.id&&r.profile==='four'&&r.policy==='balanced'),y=top+i*row;
  b+=text(30,y+20,shortNames[p.id]||p.name,21);if(s.medianChapterHours!==null){const d=s.medianChapterHours/24;
   b+=`<rect x="${x(0)}" y="${y}" width="${x(d)-x(0)}" height="30" fill="#27689e"/>`;
   if(s.p10ChapterHours!==null&&s.p90ChapterHours!==null)b+=`<line x1="${x(s.p10ChapterHours/24)}" y1="${y+15}" x2="${x(s.p90ChapterHours/24)}" y2="${y+15}" stroke="#141c23" stroke-width="3"/>`;
   b+=text(x(Math.max(d,(s.p90ChapterHours||s.medianChapterHours)/24))+14,y+23,d.toFixed(2)+' d',21);
  }else b+=text(left,y+22,'Median not reached',21);
  if(p.id==='yellow-only-trial')b+=text(left,y+57,'STR-focused: 0/32 finish by event end',18);
 });b+=text((left+right)/2,870,'Days after Golden (earlier chapters excluded)',23,'text-anchor="middle"');
 await write(out,'all-options',svg(width,height,b));
 const confirmation=JSON.parse(fs.readFileSync(path.join(root,'confirmation','summary.json'))),names={'focused-ritual':'Persistent ritual','focused-blood':'Actual HP sacrifice','focused-scarce':'Scarce corrosion'};
 let c=text(35,48,'Fresh-seed confirmation: the three finalists',32)+text(35,82,'Balanced shared-stat allocation · 64 new seeds per design and visit schedule',20),cy=150;
 const x2=d=>left+d/10*(right-left);
 for(let d=0;d<=10;d++){c+=`<line x1="${x2(d)}" y1="120" x2="${x2(d)}" y2="820" stroke="#e2e5e7"/>`+text(x2(d),850,d,20,'text-anchor="middle"');}
 for(const id of Object.keys(names))for(const profile of ['hourly','four','twice']){
  const s=confirmation.find(r=>r.package===id&&r.profile===profile&&r.policy==='balanced'),days=s.medianChapterHours/24;
  const label={hourly:'Hourly awake',four:'Four visits/day',twice:'Twice/day'}[profile];
  c+=text(30,cy+20,names[id],21)+text(30,cy+45,label,17);
  c+=`<rect x="${left}" y="${cy}" width="${x2(days)-left}" height="30" fill="${colors[profile]}"/>`;
  c+=`<line x1="${x2(s.p10ChapterHours/24)}" x2="${x2(s.p90ChapterHours/24)}" y1="${cy+15}" y2="${cy+15}" stroke="#17212a" stroke-width="3"/>`;
  c+=text(x2(Math.max(days,(s.p90ChapterHours||s.medianChapterHours)/24))+15,cy+23,days.toFixed(2)+' d',21);cy+=76;
 }c+=text((left+right)/2,895,'Days after Golden to Necro',23,'text-anchor="middle"');await write(out,'finalists',svg(width,935,c));
 const rows=JSON.parse(fs.readFileSync(path.join(root,'confirmation','focused-ritual-results.json'))).filter(r=>r.profile==='four'&&r.policy==='balanced');
 const q=v=>v.sort((a,b)=>a-b)[Math.floor((v.length-1)/2)];
 const items=[['firstCorpse','First corpse','Harvest'],['shop-potency','Yellow potency +25%','Shop'],['shop-yield','3 balls / 2 yellow','Shop'],['purchaseS5','Purchase S5','Combat'],['firstWinS5','First S5 victory','Combat'],['clearS5','100 S5 victories','Combat'],['spc1','First SPC level','Gym'],['ritual1','Kitchen: first part','Kitchen'],['ritual2','Kitchen: second part','Kitchen'],['necro','Craft Necro / Chapter 4','Kitchen']];
 let t=text(35,48,'Recommended route: progression checkpoints through Chapter 3',30)+text(35,83,'Median milestones · four visits/day · balanced allocation · 64 confirmation seeds',20);
 const tx=d=>330+d/7*(1250-330),lanes={Harvest:165,Shop:285,Combat:415,Gym:545,Kitchen:665};
 for(let d=0;d<=7;d++)t+=`<line x1="${tx(d)}" x2="${tx(d)}" y1="125" y2="780" stroke="#e0e4e7"/>`+text(tx(d),815,d,20,'text-anchor="middle"');
 for(const [label,y]of Object.entries(lanes))t+=text(30,y+5,label,24)+`<line x1="330" x2="1250" y1="${y}" y2="${y}" stroke="#cbd1d5"/>`;
 const counts={};for(const [key,label,lane]of items){const vals=rows.map(r=>r.milestones[key]===undefined?null:(r.milestones[key]-r.entryHours*3600000)/86400000).filter(v=>v!==null);if(!vals.length)continue;
  const d=q(vals),n=counts[lane]||0;counts[lane]=n+1;const y=lanes[lane],offset=(n%3)*23+22;
  t+=`<circle cx="${tx(d)}" cy="${y}" r="7" fill="#27689e"/>`+text(tx(d),y+offset,label,18,d>5?'text-anchor="end"':'text-anchor="start"');
 }t+=text(790,860,'Days after Golden; these are separate milestone medians',22,'text-anchor="middle"');await write(out,'recommended-milestones',svg(width,890,t));
 console.log(out);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
