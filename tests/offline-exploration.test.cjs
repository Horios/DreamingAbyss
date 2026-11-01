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
