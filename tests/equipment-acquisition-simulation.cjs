/* Real battle generators in the existing DOM-free harness; no layout claims. */
const fs=require('node:fs'),path=require('node:path'),{loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),r=loadRuntime(root);r.ctx.seed=require('../data/balance.json');r.run('applyBalanceConfig(seed,{persist:false});render=()=>{};note=()=>{};');
const result=JSON.parse(r.run(`JSON.stringify((()=>{
 let randomSeed=20261020;Math.random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
 const rows=[],baseSave=save;let killStats=null;
 rewardGroupKill=e=>{if(e.rewarded)return;e.rewarded=true;if(killStats){killStats.kills++;killStats.elites+=Number(e.kind==='elite');killStats.gold+=(12+e.lv*4)*(e.kind==='elite'?1.7:1);for(const rule of configuredDropRules(e)){const p=effectiveDropChance(rule,e,0),n=(rule.quantityMin+rule.quantityMax)/2;if(['gear','gearLegendary'].includes(rule.type))killStats.gear+=p*n;if(rule.type==='dust')killStats.dust+=p*n;}}};
 for(const level of [5,10,15,20,25,30,35,40,45,50,55,60])for(const job of [0,1,2,3])for(const kind of ['normal','boss']){
  save=baseSave;party=null;state=null;start(job);closeModal();const h=playerHero();h.lv=level;h.won=level>=30;h.advanced=level>=15;party.cleared=level>=30;syncParty();save();
  const map=MAPS.findIndex((m,i)=>!worldIsFinalMap(i)&&m.min<=level&&m.max>=level);party.map=map;syncParty();allocate(0,(level-1)*2);allocate(1,level-1);
  for(const id of [11,13])recruitCompanion(id);
  const masteryLevel=Math.floor(level/3),xp=Array.from({length:masteryLevel},(_,i)=>__EMBERWILD_MASTERY.masteryStepCost(i)).reduce((n,x)=>n+x,0);
  for(const key of Object.keys(h.mastery||{}))h.mastery[key]=xp;
  for(let i=0;i<h.skills.length;i++){try{unlockTeamSkill('core',i);learn(i);}catch{}}
  for(let i=0;i<h.supportLevels.length;i++){try{unlockTeamSkill('support',i);learnSupport(i);}catch{}}
  h.active=h.skills.map((v,i)=>v&&CLASSES[job].skills[i]?.[1]==='active'?i:null).filter(i=>i!==null).slice(0,2);while(h.active.length<2)h.active.push(null);
  h.procSlots=h.skills.map((v,i)=>v&&CLASSES[job].skills[i]?.[1]==='proc'?i:null).filter(i=>i!==null).slice(0,2);while(h.procSlots.length<2)h.procSlots.push(null);
  h.supportSlots=h.supportLevels.map((v,i)=>v?i:null).filter(i=>i!==null).slice(0,2);while(h.supportSlots.length<2)h.supportSlots.push(null);
  const unlocked=seed.shopSettings.equipmentStages.filter(s=>s.level<=level&&(s.initiallyUnlocked||s.unlockMapIds.some(id=>GAMEPLAY_SETTINGS.maps.catalog.find(m=>m.id===id)?.max<MAPS[map].max))).sort((a,b)=>b.level-a.level),stage=unlocked[0];
  party.equipmentShopUnlocked=seed.shopSettings.equipmentStages.map(s=>s.id);h.bag=[];h.equipped=[];
  for(const slot of [0,1,2,3,3]){const entry=stage.entries.find(e=>e.job===job&&ITEM_FORMS[job][slot].some(f=>f.id===e.formId));const g=createEquipmentShopGear(stage.id,entry.id);g.plus=3;h.bag.push(g);h.equipped.push(g.id);}
  save();save=()=>true;for(const hero of heroes()){hero.autoPotion=false;hero.hp=stats(hero).hp;}
  let wins=0,seconds=0;killStats={kills:0,elites:0,gold:0,gear:0,dust:0};
  for(let sample=0;sample<4;sample++){
   closeModal();resetEncounter();running=true;
   if(kind==='boss'){party.bossChallenge={active:true,mapIndex:map,mapId:worldMapConfig(map).id,stagePaid:true};spawnGroup();party.bossChallenge=null;}else spawnGroup();
   for(let n=0;n<100&&running&&foes.some(e=>e.hp>0);n++){let actions=0,it=pacedRound();while(!it.next().done)actions++;seconds+=Math.max(6000,actions*900)/1000;}
   if(foes.length&&foes.every(e=>e.hp<=0))wins++;for(const hero of heroes())hero.hp=stats(hero).hp;
  }
  const rate=seconds?3600/seconds:0;rows.push({level,job,kind,shopLevel:stage.level,enhance:3,wins,samples:4,kph:Math.round(killStats.kills*rate),gearPerTwoHours:+(killStats.gear*rate*2).toFixed(2),goldPerHour:Math.round(killStats.gold*rate),dustPerHour:+(killStats.dust*rate).toFixed(1)});
 }
 return {rows};
})())`));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));
const normal=result.rows.filter(x=>x.kind==='normal'),boss=result.rows.filter(x=>x.kind==='boss');
console.log(JSON.stringify({cases:result.rows.length,trials:result.rows.length*4,normalWins:normal.reduce((n,x)=>n+x.wins,0),bossWins:boss.reduce((n,x)=>n+x.wins,0),failures:result.rows.filter(x=>x.wins<x.samples),gearPerTwoHours:[Math.min(...normal.map(x=>x.gearPerTwoHours)),Math.max(...normal.map(x=>x.gearPerTwoHours))],goldPerHour:[Math.min(...normal.map(x=>x.goldPerHour)),Math.max(...normal.map(x=>x.goldPerHour))],dustPerHour:[Math.min(...normal.map(x=>x.dustPerHour)),Math.max(...normal.map(x=>x.dustPerHour))],errors:r.errors}));
if(r.errors.length)process.exitCode=1;
