const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);return r;}
async function settle(r,ms){r.advance(ms);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);assert.equal(r.run('EmberwildOffline.busy'),false);}
function result(r){return json(r,`({members:party.members.map(h=>({lv:h.lv,xp:h.xp,hp:h.hp,shield:h.shield,kills:h.totalKills,skills:h.skills,mastery:h.mastery})),gold:state.gold,ore:state.ore,materials:state.materials,gems:state.gems,consumables:state.consumables,bag:state.bag.map(g=>{const o={...g};delete o.id;return o;}),foes:foes.map(e=>({name:e.name,hp:e.hp,shield:e.shield,turn:e.turn})),partyClock,round,cooldowns:actorCooldowns,supportCooldowns,boosts:party.timedBoosts,progress:combatRoundProgress?{index:combatRoundProgress.index,unit:combatRoundProgress.unit}:null})`);}
test('fixed random sequence: visible timeline and offline events give identical combat, levels and original drops',async()=>{
 // Align the first due event with the first 50ms foreground check. At a 1500ms
 // interval, a 60s endpoint otherwise straddles one extra offline action at 0ms.
 const online=game(),offline=game();for(const r of [online,offline])r.run('nextActionAt=Date.now()+50;save()');for(let i=0;i<1200;i++){online.advance(50);online.run('tick()');}await settle(offline,60000);
 assert.deepEqual(result(offline),result(online));const r=json(offline,'party.offlineExploration.receipt');assert.equal(r.end-r.start,60000);assert.equal(r.effectiveMs,60000);assert.equal(r.kills,offline.run('state.totalKills'));assert(r.xp>0);assert.equal(offline.run('party.offlineExploration.lastAt'),offline.now);assert.deepEqual(offline.errors,[]);
});
test('25-minute real-time and offline replay earn identical rewards at 1x and 2x',async()=>{
 const span=25*60*1000;
 for(const rate of [1,2]){
  const visible=game(),offline=game(),interval=1500/rate;
  for(const r of [visible,offline])r.run(`if(${rate}===2){state.consumables.speed2_30m=1;useSupply('speed2_30m');setBattleSpeed(2);}nextActionAt=Date.now()+${interval};save();`);
  const before=json(offline,'({kills:state.totalKills,gold:state.gold,gear:state.bag.length})');
  for(let t=0;t<span;t+=interval){visible.advance(interval);visible.run('tick()');}
  await settle(offline,span);
  assert.deepEqual(result(offline),result(visible),'online/offline state must agree at '+rate+'x');
  const receipt=json(offline,'party.offlineExploration.receipt');
  assert(receipt?.complete,'a completed encounter must yield one durable receipt');
  assert.equal(receipt.effectiveMs,span);
  assert.equal(receipt.intervals.reduce((n,i)=>n+i.end-i.start,0),span);
  assert.equal(receipt.kills,offline.run('state.totalKills')-before.kills);
  assert.equal(receipt.goldGained-receipt.goldSpent,offline.run('state.gold')-before.gold);
  assert.equal(receipt.gear.length,offline.run('state.bag.length')-before.gear);
  const settled=result(offline);
  await offline.run('EmberwildOffline.settle()');
  assert.deepEqual(result(offline),settled,'repeated settlement must not duplicate payout at '+rate+'x');
  assert.deepEqual(offline.errors,[]);
 }
});
test('25-minute one-action victory stress test cannot skip minimum rounds or duplicate XP, money and kills',async()=>{
 const span=25*60*1000;
 for(const rate of [1,2]){
  const visible=game(),offline=game(),interval=1500/rate,minimumRound=6000/rate;
  for(const r of [visible,offline])r.run(`
   if(${rate}===2){state.consumables.speed2_30m=1;useSupply('speed2_30m');setBattleSpeed(2);}
   state.active=[];state.supportSlots=[];
   castPartySkill=()=>false;castSupport=()=>false;
   initiativeOrder=()=>[{side:'hero',id:heroKey(state),actor:state}];
   performHeroBasic=()=>{for(const e of foes)e.hp=0;};
   globalThis.earningWins=0;const baseFinish=finalizeBattleStatistics;
   finalizeBattleStatistics=function(outcome){if(activeBattleStat&&outcome==='victory')earningWins++;return baseFinish(outcome);};
   nextActionAt=Date.now()+${interval};save();
  `);
  const first=json(offline,'({kills:state.totalKills,gold:state.gold})');
  for(let t=0;t<span;t+=interval){visible.advance(interval);visible.run('tick()');}
  await settle(offline,span);
  const receipt=json(offline,'party.offlineExploration.receipt');
  const maxVictories=Math.ceil(span/(minimumRound+interval))+1;
  assert(offline.run('earningWins')<=maxVictories,'offline victories exceeded pacing limit at '+rate+'x');
  assert.equal(offline.run('earningWins'),visible.run('earningWins'),'offline victories must match foreground at '+rate+'x');
  assert.equal(receipt.battles,offline.run('earningWins'));
  assert.equal(receipt.kills,offline.run('state.totalKills')-first.kills);
  assert.equal(receipt.goldGained-receipt.goldSpent,offline.run('state.gold')-first.gold);
  assert.deepEqual(result(offline),result(visible));
  assert.deepEqual(offline.errors,[]);
 }
});
test('offline drop chances apply the published level-gap rules to ordinary loot without double-penalizing equipment',()=>{
 const r=game(),kinds=['sourceMaterial','material','ore','dust','gem','potion','item','token'];
 const chance=(type,kind='normal')=>r.run(`__EMBERWILD_DROP_TEST.effectiveDropChance({type:"${type}",chanceByDifficulty:[1,1,1]},{kind:"${kind}",lv:5,region:0,difficulty:0},0)`);
 for(const [lv,expected] of [[5,1],[10,1],[15,.5],[20,.2],[21,.1]]){
  r.run('party.members[0].lv='+lv);
  for(const kind of ['normal','elite'])for(const type of kinds)assert(Math.abs(chance(type,kind)-expected)<1e-10,`LV${lv} ${kind} ${type}: expected ${expected}`);
 }
 r.run('party.members[0].lv=15');
 for(const type of ['gear','gearLegendary','equipment','bossGear'])assert.equal(chance(type),0,'equipment only uses its existing XP-level-gap rule: '+type);
 for(const type of kinds)assert.equal(chance(type,'boss'),1,'boss loot remains exempt from common-item penalty: '+type);
 assert.deepEqual(r.errors,[]);
});
test('offline low-level farm reduces gem, potion and token drops along with XP and money',async()=>{
 const r=game();
 r.run(`state.lv=20;syncParty();refillParty();
  const sources=GAMEPLAY_SETTINGS.monsters.catalog.filter(m=>m.mapIndex===0&&m.kind==='normal').map(m=>m.id);
  GAMEPLAY_SETTINGS.drops.entries=['gem','potion','token'].map(type=>({
   id:'offline-gap-'+type,name:type,key:type==='token'?'berserk':'random',
   type,enabled:true,kinds:['normal','elite'],sources,chanceByDifficulty:[1,1,1],quantityMin:1,quantityMax:1
  }));
  globalThis.monsterGoldAwards=[];
  const baseEnemyGold=EmberwildProgression.enemyGold;
  EmberwildProgression.enemyGold=function(...args){
   const amount=baseEnemyGold(...args);
   monsterGoldAwards.push({playerLevel:args[4],enemyLevel:args[1],amount});
   return amount;
  };
  Math.random=()=>.5;foes.forEach(e=>e.kind='elite');save();`);
 const before=json(r,'({gems:state.gems,bag:state.bag.length,potions:state.potions,ore:state.ore,ether:state.materials["以太鍛鐵"]||0})');
 await settle(r,60000);
 const rec=json(r,'party.offlineExploration.receipt');
 assert(rec?.kills>0,'high-level party must actually defeat low-level enemies');
 assert.equal(rec.xp,0,'10+ levels above monsters earns zero XP');
 const monsterGold=json(r,'monsterGoldAwards');
 assert(monsterGold.length>0,'test must verify actual monster reward calculations');
 assert(monsterGold.every(row=>row.amount===0),'10+ levels above monsters earn zero monster gold: '+JSON.stringify(monsterGold));
 // The offline receipt can also count rewards from other systems, so its
 // aggregate gold is not a reliable measure of monster gold alone.
 assert.deepEqual(json(r,'state.gems'),before.gems,'discounted gem odds must be used by offline loot rolls');
 assert.equal(r.run('state.bag.length'),before.bag,'discounted token odds must be used by offline loot rolls');
 assert.equal(r.run('state.potions'),before.potions,'discounted potion odds must be used by offline loot rolls');
 assert.equal(r.run('state.ore'),before.ore,'overlevelled elite enemies must not guarantee base iron');
 assert.equal(r.run('state.materials["以太鍛鐵"]||0'),before.ether,'overlevelled elite ether must use common drop penalty');
 assert.deepEqual(r.errors,[]);
});
test('elite ether level penalty is applied at the kill and a first-clear BOSS reward remains guaranteed',()=>{
 const r=game();
 r.run(`state.lv=20;syncParty();Math.random=()=>.03;awardEther({kind:'elite',lv:5,region:0,difficulty:0});`);
 assert.equal(r.run('state.materials["以太鍛鐵"]||0'),0,'a high-level party must not get the undiscounted elite chance');
 assert.equal(r.run('etherDropChance({kind:"elite",region:0})'),.05,'the base elite ether chance remains 5%');
 r.run(`state.lv=5;syncParty();Math.random=()=>0;awardEther({kind:'elite',lv:5,region:0,difficulty:0});`);
 assert.equal(r.run('generalDropLevelGapFactor({type:"material"},{kind:"elite",lv:5,region:0})'),1,'same-level elite material odds are unpenalized');
 assert.equal(r.run('state.materials["以太鍛鐵"]||0'),1,'same-level elite retains original 5% chance');
 r.run(`state.lv=20;syncParty();awardEther({kind:'boss',lv:5,region:0,difficulty:0});`);
 assert(r.run('state.materials["以太鍛鐵"]||0')>=2,'BOSS first-clear materials remain guaranteed');
 assert.deepEqual(r.errors,[]);
});
test('offline kills level up immediately and recalculate later monster XP, gold and drop penalties in the same encounter',async()=>{
 const r=game();
 r.run(`
   state.lv=15;state.xp=need(15)-1;state.xpFraction=0;syncParty();refillParty();
   foes=foes.slice(0,3);
   foes.forEach((e,i)=>{e.lv=[15,13,10][i];e.kind='normal';e.hp=1;e.maxhp=1;e.rewarded=false;});
   enemy=foes[0];state.active=[];state.supportSlots=[];
   castPartySkill=()=>false;castSupport=()=>false;
   initiativeOrder=()=>[{side:'hero',id:heroKey(state),actor:state}];
   performHeroBasic=()=>{for(const e of foes)e.hp=0;};
   globalThis.levelPenaltyTrace=[];globalThis.levelGoldCalls=[];
   const baseEnemyGold=EmberwildProgression.enemyGold;
   EmberwildProgression.enemyGold=function(...args){
    const amount=baseEnemyGold(...args);
    levelGoldCalls.push({playerLevel:args[4],enemyLevel:args[1],amount});
    return amount;
   };
   const originalReward=rewardGroupKill;
   rewardGroupKill=function(e){
    const h=party.members[0],before=h.lv,beforeXp=h.xp+(h.xpFraction||0),beforeGold=h.gold,
     expectXp=EmberwildProgression.xpShare(EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,e.lv,e.kind,e.difficulty||0,before),heroes().length),
     expectGold=baseEnemyGold(GAMEPLAY_SETTINGS,e.lv,e.kind,e.difficulty||0,before),
     gearChance=__EMBERWILD_DROP_TEST.effectiveDropChance({type:'gear',chanceByDifficulty:[1,1,1]},e,0),
     materialChance=__EMBERWILD_DROP_TEST.effectiveDropChance({type:'sourceMaterial',chanceByDifficulty:[1,1,1]},e,0);
    const goldCallStart=levelGoldCalls.length;
    const out=originalReward(e);
    levelPenaltyTrace.push({before,after:h.lv,enemyLv:e.lv,expectXp,actualXp:h.xp+(h.xpFraction||0)-beforeXp+(h.lv>before?need(before):0),
     expectGold,actualGold:h.gold-beforeGold,goldCalls:levelGoldCalls.slice(goldCallStart),gearChance,materialChance});
    return out;
   };
   nextActionAt=Date.now()+1500;save();
 `);
 await settle(r,7000);
 const rows=json(r,'levelPenaltyTrace');
 assert.equal(rows.length,3,'all three defeated monsters must settle individually');
 assert.deepEqual(rows.map(x=>[x.before,x.after,x.enemyLv]),[[15,16,15],[16,16,13],[16,16,10]]);
 for(const row of rows){
  assert(Math.abs(row.actualXp-row.expectXp)<1e-7,'XP penalty must be computed from the current level: '+JSON.stringify(row));
  assert.deepEqual(row.goldCalls,[{playerLevel:row.before,enemyLevel:row.enemyLv,amount:row.expectGold}],
   'the monster-gold calculation must use the current level exactly once');
 }
 assert.deepEqual(rows.map(x=>x.gearChance),[1,.5,.2]);
 assert.deepEqual(rows.map(x=>Math.round(x.materialChance*100)/100),[1,1,.9]);
 assert.equal(r.run('party.offlineExploration.receipt.kills'),3);
 assert.deepEqual(r.errors,[]);
});
test('fast replay prevents fractional XP from crossing a level boundary before switching to full simulation',()=>{
 const source=file=>file==='js/combat/offline-exploration.js';
 const r=loadRuntime(root,'index.html',{},undefined,{transformSource:(name,code)=>source(name)
  ?code.replace('globalThis.EmberwildOffline={',`globalThis.__levelBoundaryProbe=function(){
    const h=playerHero();h.lv=15;h.xp=need(15)-1;h.xpFraction=.95;
    round=0;roundIterator=null;combatRoundProgress=null;
    foes.forEach(e=>{e.kind='normal';e.lv=15;e.evasion=0;e.lifesteal=0;});
    const hp=foes.reduce((n,e)=>n+e.maxhp,0),key=combatKey();
    analysis={ready:true,key,profiles:new Map([['fraction',{count:8,rows:Array.from({length:8},()=>({duration:10000,rounds:1,mastery:{},hero:{}})),min:hp,max:hp}]])};
    observed={key:'fraction',hp,at:Date.now()};
    metrics={fallbacks:{}};simpleCombat=()=>'';running=true;
    const previous=EmberwildProgression.enemyXp;
    EmberwildProgression.enemyXp=()=>.1/foes.length;
    try{const executed=tryFast(Date.now()+20000);return {executed,fallbacks:metrics.fallbacks,lv:h.lv,xp:h.xp,fraction:h.xpFraction};}
    finally{EmberwildProgression.enemyXp=previous;}
   };globalThis.EmberwildOffline={`)
  :code});
 r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();');
 const result=json(r,'__levelBoundaryProbe()');
 assert.equal(result.executed,false,'fractional EXP should force normal full simulation');
 assert.equal(result.fallbacks['level-boundary'],1);
 assert.equal(result.lv,15);
 assert.deepEqual(r.errors,[]);
});
test('resume a persisted mid-turn cursor including support, enemy cooldowns, control, custom status and token state',async()=>{
 const a=game();for(let i=0;i<10;i++){a.advance(50);a.run('tick()');}a.run('save()');assert(a.run('!!combatRoundProgress'));
 const data=json(a,'packParty()'),rng=a.run('rngState'),serial=a.run('uidSerial'),b=game();b.advance(500);b.ctx.saved=data;b.run('loadParty(saved);');b.ctx.rng=rng;b.ctx.serial=serial;b.run('rngState=rng;uidSerial=serial');
 await settle(a,60000);await settle(b,60000);assert.deepEqual(result(b),result(a));assert.equal(b.run('party.offlineExploration.receipt.kills'),a.run('party.offlineExploration.receipt.kills'));
});
test('independent wall-clock boost boundaries switch speed, XP and drops at their actual expiry',async()=>{
 const a=game(),b=game();for(const r of [a,b])r.run(`for(const id of ['speed2_30m','exp_100_30m','drop_50_30m']){state.consumables[id]=1;useSupply(id);}setBattleSpeed(2);party.timedBoosts[0].remainingMs=10000;party.timedBoosts[1].remainingMs=20000;party.timedBoosts[2].remainingMs=45000;save();`);
 for(let i=0;i<1200;i++){a.advance(50);a.run('tick()');}await settle(b,60000);assert.deepEqual(result(b),result(a));assert.deepEqual(json(b,'Object.values(party.offlineExploration.receipt.boosts).map(b=>b.ms)'),[10000,20000,45000]);assert.equal(b.run('battleRate'),1);
});
test('pause and stop earn no offline rewards; wall-clock effects still expire',async()=>{
 for(const operation of ['toggleBattle()','stopTeamExploration()']){const r=game();r.run('state.consumables.exp_100_30m=1;useSupply("exp_100_30m");'+operation+';save();');const before=result(r);await settle(r,60000);const after=result(r);assert.equal(after.members[0].kills,before.members[0].kills);assert.equal(after.gold,before.gold);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.timedBoosts[0].remainingMs'),1740000);}
});
test('receipt, inventory and cursor persist atomically; reload before acknowledgement never grants twice',async()=>{
 const r=game();await settle(r,300000);const data=json(r,'packParty()'),before=result(r),key=r.run('KEY');assert.equal(JSON.parse(r.values.get(key)).offlineExploration.receipt.complete,true);
 r.ctx.saved=data;r.run('loadParty(saved)');await r.run('EmberwildOffline.settle()');assert.deepEqual(result(r),before);assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.equal(r.run('acknowledgeOfflineExploration()'),false);assert.deepEqual(result(r),before);
 const raw=r.values.get(key),cold=loadRuntime(root,'index.html',{[key]:raw},r.now);assert.deepEqual(cold.errors,[]);assert.equal(cold.run('party.offlineExploration.lastAt'),r.now);assert.equal(cold.run('state.totalKills'),r.run('state.totalKills'));
});
test('interrupted batches continue from their committed cursor, not the original offline start',async()=>{
 const a=game();a.advance(300000);const original=json(a,'packParty()');a.ctx.from=original.offlineExploration.lastAt;a.ctx.to=a.now;
 // Start a real batch, then simulate a page close when its first yield is pending.
 const callbacks=[];a.ctx.setTimeout=fn=>{callbacks.push(fn);};const pending=a.run('EmberwildOffline.settle()');await new Promise(resolve=>setImmediate(resolve));
 const durable=JSON.parse(a.values.get(a.run('KEY')));assert(durable.offlineExploration.pendingReceipt);assert(durable.offlineExploration.lastAt>=original.offlineExploration.lastAt);
 const b=game();b.advance(300000);b.ctx.saved=durable;b.run('loadParty(saved)');await b.run('EmberwildOffline.settle()');assert.equal(b.run('party.offlineExploration.lastAt'),b.now);assert.equal(b.run('party.offlineExploration.receipt.complete'),true);
 while(callbacks.length){callbacks.shift()();await new Promise(resolve=>setImmediate(resolve));}await pending;
});
test('backwards clock and storage failure preserve the last valid save and unsettled time',async()=>{
 const r=game(),key=r.run('KEY'),raw=r.values.get(key);r.advance(-1000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),true);assert.equal(r.values.get(key),raw);
 r.advance(61000);r.ctx.localStorage.setItem=()=>{throw Error('quota');};await r.run('retryOfflineExploration()');assert.equal(r.run('EmberwildOffline.failed'),true);assert.equal(r.values.get(key),raw);assert.equal(r.run('party.offlineExploration.lastAt'),JSON.parse(raw).offlineExploration.lastAt);
});
test('a full bag preserves owned gear while offline combat continues with auto-salvaged overflow',async()=>{
 const r=game();r.run('GAMEPLAY_SETTINGS.equipment.bagCapacity=state.bag.length;save()');const ids=json(r,'state.bag.map(g=>g.id)'),before=json(r,'({ore:state.ore,dust:state.dust})');await settle(r,3600000);assert.equal(r.run('running'),true);assert.deepEqual(json(r,'state.bag.map(g=>g.id)'),ids);assert.equal(r.run('(party.offlineExploration.receipt||party.offlineExploration.pendingReceipt).effectiveMs'),3600000);assert(r.run('state.ore')>=before.ore);assert(r.run('state.dust')>=before.dust);
});
test('30s, 5m, 1h, 8h and 24h debts complete in finite batches up to the daily offline cap',async t=>{
 for(const ms of [30000,300000,3600000,28800000,86400000])await t.test(String(ms),async()=>{const r=game(),start=performance.now();await settle(r,ms);const receipt=json(r,'party.offlineExploration.receipt||party.offlineExploration.pendingReceipt');assert.equal(receipt.end-receipt.start,ms);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert(receipt.effectiveMs<=ms);if(r.run('!!party.offlineExploration.receipt'))assert.equal(receipt.complete,true);else assert.equal(receipt.battles,0);assert(r.run('logs.length')<=65);t.diagnostic(`${ms/1000}s debt: ${Math.round(performance.now()-start)}ms, ${receipt.kills} kills, effective ${receipt.effectiveMs}ms`);});
});
test('an absence longer than 24 hours gives the same rewards as 24 hours and does not carry debt',async()=>{
 const day=24*3600000,normal=game(),long=game();
 await settle(normal,day);await settle(long,day+6*3600000);
 const rewards=r=>json(r,'({lv:state.lv,xp:state.xp,gold:state.gold,kills:state.totalKills,ore:state.ore,dust:state.dust,materials:state.materials,consumables:state.consumables,bag:state.bag.map(g=>{const x={...g};delete x.id;return x;})})');
 assert.deepEqual(rewards(long),rewards(normal));
 const record=json(long,'party.offlineExploration.receipt||party.offlineExploration.pendingReceipt');
 assert.equal(record.end-record.start,day);
 assert.equal(record.intervals.reduce((sum,part)=>sum+part.end-part.start,0),day);
 assert.equal(record.effectiveMs,json(normal,'(party.offlineExploration.receipt||party.offlineExploration.pendingReceipt).effectiveMs'));
 assert.equal(long.run('party.offlineExploration.lastAt'),long.now);
 assert.equal(long.run('party.offlineExploration.offlineWindow'),null);
 const before=rewards(long);await long.run('EmberwildOffline.settle()');assert.deepEqual(rewards(long),before);
 long.advance(60000);await long.run('EmberwildOffline.settle()');assert.equal(long.run('party.offlineExploration.lastAt'),long.now);
});
test('one ownership lock is acquired before module execution; phone/desktop receipt uses the existing SVG/detail components',()=>{
 const loader=fs.readFileSync(path.join(root,'js/balance/published-loader.js'),'utf8'),ui=fs.readFileSync(path.join(root,'js/combat/offline-exploration.js'),'utf8'),css=fs.readFileSync(path.join(root,'css/offline-exploration.css'),'utf8');assert(loader.indexOf('await new Promise((resolve,reject)=>{\n      navigator.locks.request')<loader.indexOf('const urls=Array.from'));assert.match(loader,/preview\?'preview':'production'/);assert.match(ui,/gearSlotHTML/);assert.match(ui,/equipmentAttributeDetailsHTML/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/max-height:94dvh/);
});

test('background timers and visibility restoration advance combat without creating offline rewards',async()=>{
 const r=game();r.ctx.document.hidden=true;r.ctx.document.visibilityState='hidden';r.dispatch('visibilitychange','document');const from=r.run('party.offlineExploration.lastAt');r.advance(60000);r.run('tick();tick()');await r.run('EmberwildOffline.settle(undefined,false)');assert.equal(r.run('party.offlineExploration.lastAt'),from+60000);assert(r.run('state.totalKills')>0);
 r.ctx.document.hidden=false;r.ctx.document.visibilityState='visible';r.dispatch('visibilitychange','document');await r.run('EmberwildOffline.settle(undefined,false)');assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.offlineExploration.pendingReceipt'),null);assert.notEqual(r.elements.get('offline-settlement')?.hidden,false);
 const before=result(r);r.dispatch('visibilitychange','document');await r.run('EmberwildOffline.settle(undefined,false)');assert.deepEqual(result(r),before);
});
test('receipt stays frozen while exploration and saves continue; gear details can close',async()=>{
 const r=game();await settle(r,60000);const first=json(r,'party.offlineExploration.receipt');r.run(`$('modal').showModal();closeModal();`);assert.equal(r.elements.get('modal').open,false);
 await settle(r,10000);const raw=JSON.parse(r.values.get(r.run('KEY')));assert.equal(raw.offlineExploration.status,'running');assert.deepEqual(raw.offlineExploration.receipt,first);
 r.ctx.saved=raw;r.run('loadParty(saved)');assert.equal(r.run('EmberwildOffline.active'),true);const before=result(r);assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.deepEqual(result(r),before);
});
test('production loader queues a second tab until the owner page hides, then only the new owner can save',async()=>{
 const vm=require('node:vm'),code=fs.readFileSync(path.join(root,'js/balance/published-loader.js'),'utf8');
 let tail=Promise.resolve(),activeOwners=0,maxOwners=0;
 const locks={request(_key,callback){const result=tail.then(async()=>{activeOwners++;maxOwners=Math.max(maxOwners,activeOwners);try{return await callback();}finally{activeOwners--;}});tail=result.catch(()=>{});return result;}};
 const tabs=[];
 function tab(){
  const listeners=new Map();const element=()=>({style:{},textContent:'',innerHTML:'',setAttribute(){},remove(){},querySelector:()=>element(),appendChild(){},append(){}});
  const ctx={URL,Date,Event,AbortController,setTimeout,clearTimeout,console,navigator:{locks},location:{pathname:'/preview/',href:'https://game.test/preview/',reload(){}},localStorage:{getItem:()=>null},document:{getElementById:()=>element(),createElement:()=>element(),body:element(),head:element(),querySelectorAll:()=>[]},EmberwildBalanceDocument:{inspect:()=>[]},fetch:async url=>({ok:true,json:async()=>url.startsWith('data/build')?{commit:'test-build'}:{schema:'emberwild-balance-v1',schemaVersion:1}}),applyBalanceConfig(){ctx.applied=(ctx.applied||0)+1;},importBalanceJSON(){},resetBalanceJSON(){},save(){ctx.saves=(ctx.saves||0)+1;},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(){},dispatchEvent(){}};
  ctx.window=ctx;ctx.globalThis=ctx;vm.runInNewContext(code,ctx);tabs.push(ctx);return {ctx,hide:()=>listeners.get('pagehide')({})};
 }
 const first=tab();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(first.ctx.applied,1);
 const second=tab();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(second.ctx.applied,undefined);assert.equal(second.ctx.__EMBERWILD_BALANCE_READY,undefined);
 first.hide();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(first.ctx.__EMBERWILD_SAVE_OWNER,false);assert.equal(second.ctx.__EMBERWILD_SAVE_OWNER,true);assert.equal(second.ctx.applied,1);assert.equal(maxOwners,1);second.hide();
});
test('a failed checkpoint restores the last committed batch and keeps its unfinished receipt recoverable',async()=>{
 const r=game(),key=r.run('KEY'),put=r.ctx.localStorage.setItem;let commits=0,workTime=0;
 r.ctx.performance.now=()=>workTime+=20;
 r.ctx.localStorage.setItem=(k,v)=>{if(k===key&&++commits>=3)throw Error('quota after batch');return put(k,v);};
 await settleFailure();
 async function settleFailure(){r.advance(3600000);await r.run('EmberwildOffline.settle()');}
 assert.equal(r.run('EmberwildOffline.failed'),true);const raw=JSON.parse(r.values.get(key));assert(raw.offlineExploration.pendingReceipt);assert.equal(raw.offlineExploration.pendingReceipt.complete,false);assert(raw.offlineExploration.lastAt<r.now);assert.equal(r.run('state.totalKills'),raw.members[0].totalKills);
 r.ctx.localStorage.setItem=put;await r.run('retryOfflineExploration()');assert.equal(r.run('EmberwildOffline.failed'),false);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert.equal(r.run('party.offlineExploration.receipt.kills'),r.run('state.totalKills'));assert.equal(r.run('party.offlineExploration.receipt.complete'),true);
});
test('quest challenge and terminal victory survive cold combat restoration and use existing quest kill events',async()=>{
 const r=game();r.run(`stopTeamExploration();state.lv=20;syncParty();refillParty();__EMBERWILD_STORY.record('shop_rescue').started=true;startQuestEncounter('shop_rescue/rescue');save();globalThis.copySave=structuredClone(packParty());loadParty(copySave);`);
 assert.equal(r.run('party.questChallenge.key'),'shop_rescue/rescue');await settle(r,60000);assert.equal(r.run('party.offlineExploration.receipt.stage'),'解救商人');assert.equal(r.run('party.offlineExploration.receipt.kills'),3);assert.equal(r.run('__EMBERWILD_STORY.stats().encounters["shop_rescue/rescue"]'),1);assert.equal(r.run('running'),false);
});

test('multi-hour replay paints progress before work and reports simulation cursor against a fixed total',async()=>{
 const r=game(),callbacks=[];r.ctx.setTimeout=fn=>callbacks.push(fn);r.advance(10800000);const start=r.run('party.offlineExploration.lastAt'),pending=r.run('EmberwildOffline.settle()');await new Promise(setImmediate);
 const box=r.elements.get('offline-settlement');assert.equal(box.hidden,false);assert.match(box.innerHTML,/0%/);assert.match(box.innerHTML,/max="10800000" value="0"/);assert.equal(r.run('state.totalKills'),0);
 let ticks=0;r.ctx.performance.now=()=>++ticks*20;
 for(let i=0;i<6;i++){callbacks.shift()();await new Promise(setImmediate);}assert.match(box.innerHTML,/max="10800000"/);const value=Number(box.innerHTML.match(/value="(\d+)"/)[1]);assert(value>0&&value<10800000);assert.equal(value,r.run('party.offlineExploration.lastAt')-start);
 r.ctx.performance.now=()=>0;r.ctx.setTimeout=fn=>setImmediate(fn);while(callbacks.length){callbacks.shift()();await new Promise(setImmediate);}await pending;
 assert.equal(r.run('EmberwildOffline.failed'),false);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert.match(box.innerHTML,/計入離線/);assert.match(box.innerHTML,/有效掛機/);assert.doesNotMatch(box.innerHTML,/<progress/);assert.deepEqual(r.errors,[]);
});
