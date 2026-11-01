const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};party.huntingMode="group";startSelectedExploration();save();`);return r;}
async function settle(r,ms=0){r.advance(ms);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);}
function hidden(r,value){r.ctx.document.hidden=value;r.ctx.document.visibilityState=value?'hidden':'visible';r.dispatch('visibilitychange','document');}
function rewardState(r){return json(r,'({gold:state.gold,xp:state.xp,lv:state.lv,kills:state.totalKills,bag:state.bag,materials:state.materials,at:party.offlineExploration.lastAt})');}

test('one second or an unfinished ten-second encounter preserves cursor without opening any window',async()=>{
 const r=game();await settle(r,1000);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.notEqual(r.elements.get('offline-settlement')?.hidden,false);
 await settle(r,9000);assert.equal(r.run('party.offlineExploration.receipt'),null);assert(r.run('foes.some(e=>e.hp>0)'));assert(r.run('!!party.offlineExploration.combat'));assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),0);
 const raw=json(r,'packParty()'),cursor=json(r,'combatRoundProgress');r.ctx.saved=raw;r.run('loadParty(saved)');assert.deepEqual(json(r,'combatRoundProgress'),cursor);
 await settle(r,50000);assert(r.run('party.offlineExploration.receipt.battles')>=1);assert.equal(r.elements.get('offline-settlement').hidden,false);
});

test('one real completed encounter within ten seconds shows its applied rewards once',async()=>{
 const r=game();r.run('foes.splice(1);foes[0].hp=1;const finishOne=finalizeBattleStatistics;finalizeBattleStatistics=function(...a){const out=finishOne(...a);if(a[0]==="victory")running=false;return out;};save()');await settle(r,10000);
 const receipt=json(r,'party.offlineExploration.receipt');assert.equal(receipt.battles,1);assert.equal(receipt.kills,1);assert(receipt.xp>0);assert.equal(receipt.lastBattleAt<=receipt.end,true);
 const before=rewardState(r);for(let i=0;i<3;i++){hidden(r,true);hidden(r,false);await settle(r);}assert.deepEqual(rewardState(r),before);
 assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.deepEqual(rewardState(r),before);assert.equal(r.run('acknowledgeOfflineExploration()'),false);
});

test('a completed encounter without any real reward never shows an empty receipt',async()=>{
 const r=game();r.run('foes.splice(1);foes[0].hp=1;rewardGroupKill=e=>{e.rewarded=true;};save()');await settle(r,10000);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),1);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.notEqual(r.elements.get('offline-settlement')?.hidden,false);
});

test('open receipts stay unchanged during live background play; only a cold reload queues a new offline receipt',async()=>{
 const r=game();r.run('state.lv=20;syncParty();refillParty();save()');await settle(r,600000);const first=json(r,'party.offlineExploration.receipt'),html=r.elements.get('offline-settlement').innerHTML,kills=r.run('state.totalKills');
 for(let i=0;i<60;i++){r.advance(1000);r.run('tick()');}assert(r.run('state.totalKills')>kills);assert.deepEqual(json(r,'party.offlineExploration.receipt'),first);assert.equal(r.elements.get('offline-settlement').innerHTML,html);
 hidden(r,true);r.advance(1200000);hidden(r,false);await r.run('EmberwildOffline.settle(undefined,false)');
 assert.deepEqual(json(r,'party.offlineExploration.receipt'),first);assert.equal(r.elements.get('offline-settlement').innerHTML,html);assert.equal(r.run('party.offlineExploration.pendingReceipt'),null);
 const key=r.run('KEY'),cold=loadRuntime(root,'index.html',{[key]:r.values.get(key)},r.now+1200000);cold.ctx.setTimeout=fn=>setImmediate(fn);
 cold.run('continueFromTitle()');await cold.run('EmberwildOffline.settle(undefined,false)');
 const pending=json(cold,'party.offlineExploration.pendingReceipt'),before=rewardState(cold);assert(pending.battles>0);assert.equal(pending.intervals.reduce((n,x)=>n+x.end-x.start,0),1200000);
 assert.deepEqual(json(cold,'party.offlineExploration.receipt'),first);assert.equal(cold.run('acknowledgeOfflineExploration()'),true);assert.equal(cold.run('party.offlineExploration.receipt.id'),pending.id);assert.deepEqual(rewardState(cold),before);
 assert.equal(cold.run('acknowledgeOfflineExploration()'),true);assert.equal(cold.run('party.offlineExploration.receipt'),null);assert.equal(cold.elements.get('offline-settlement').hidden,true);
});

test('queued incomplete battle and merged absence intervals keep all partial rewards until a later completion',async()=>{
 const r=game();await settle(r,60000);const first=json(r,'party.offlineExploration.receipt');await settle(r,1000);assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),0);
 assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.elements.get('offline-settlement').hidden,true);
 // A foreground gap is not part of the next actual absence duration.
 r.advance(1000);r.run('EmberwildOffline.sync()');await settle(r,60000);let next=json(r,'party.offlineExploration.receipt');if(!next){assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),0);r.run('foes.forEach(e=>{if(e.hp>0)e.hp=1;})');await settle(r,30000);next=json(r,'party.offlineExploration.receipt');}assert(next&&next.battles>0);assert(next.intervals.reduce((n,x)=>n+x.end-x.start,0)>=61000);assert.equal(next.intervals.length,2);assert(next.start>=first.end);
});

test('old complete and interrupted receipts migrate without losing rewards or pausing running combat',async()=>{
 const r=game();await settle(r,60000);r.run('globalThis.old=structuredClone(packParty());old.offlineExploration.version=1;old.offlineExploration.combat=null;old.offlineExploration.status="paused";old.offlineExploration.resumeRunning=true;delete old.offlineExploration.pendingReceipt;delete old.offlineExploration.receipt.battles;delete old.offlineExploration.receipt.intervals;');
 const before=rewardState(r);r.run('loadParty(old)');assert.equal(r.run('running'),true);assert.equal(r.run('party.offlineExploration.version'),3);assert.equal(r.run('party.offlineExploration.receipt.legacy'),true);await settle(r);assert.deepEqual(rewardState(r),before);r.run('acknowledgeOfflineExploration()');
 r.run('old.offlineExploration.receipt.complete=false;old.offlineExploration.status="running";loadParty(old)');assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.offlineExploration.pendingReceipt.complete'),false);await settle(r,60000);if(!r.run('party.offlineExploration.receipt')){assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),0);r.run('foes.forEach(e=>{if(e.hp>0)e.hp=1;})');await settle(r,30000);}assert(r.run('party.offlineExploration.receipt?.battles')>0);
});

test('reentrant settlement absorbs newer targets and lost ownership cannot advance or acknowledge',async()=>{
 const r=game(),callbacks=[];r.ctx.setTimeout=fn=>callbacks.push(fn);r.advance(300000);const job=r.run('EmberwildOffline.settle()');await new Promise(setImmediate);r.ctx.checkpoint=JSON.parse(r.values.get(r.run('KEY')));assert.throws(()=>r.run('loadParty(checkpoint)'),/結算進行中/);r.advance(120000);assert.equal(r.run('EmberwildOffline.settle()'),job);r.run('tick();save()');
 while(callbacks.length){callbacks.shift()();await new Promise(setImmediate);}await job;assert.equal(r.run('party.offlineExploration.lastAt'),r.now);
 const before=rewardState(r);r.ctx.__EMBERWILD_SAVE_OWNER=false;r.advance(60000);r.run('tick();EmberwildOffline.sync()');await r.run('EmberwildOffline.settle()');assert.equal(r.run('acknowledgeOfflineExploration()'),false);assert.equal(r.run('save()'),false);assert.deepEqual(rewardState(r),before);
});

test('acknowledgement write failure retains unread records and grants nothing again',async()=>{
 const r=game();await settle(r,60000);const old=json(r,'party.offlineExploration.receipt'),before=rewardState(r),put=r.ctx.localStorage.setItem;r.ctx.localStorage.setItem=()=>{throw Error('quota');};assert.equal(r.run('acknowledgeOfflineExploration()'),false);assert.deepEqual(json(r,'party.offlineExploration.receipt'),old);assert.deepEqual(rewardState(r),before);
 r.ctx.localStorage.setItem=put;assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.deepEqual(rewardState(r),before);
});

test('title page never settles or displays errors and a late valid consumable save has no provisional failure toast',async()=>{
 const r=game();r.run('state.consumables.speed2_30m=1;returnToTitle()');const key=r.run('KEY'),raw=r.values.get(key),cold=loadRuntime(root,'index.html',{[key]:raw},r.now);cold.ctx.setTimeout=fn=>setImmediate(fn);
 assert(cold.run('!!party&&!!state'));assert.equal(cold.run('__EMBERWILD_BOOT_SAVE_ERROR'),null);if(/存檔未能載入/.test(cold.elements.get('toast')?.textContent||'')){
  const previous=JSON.parse(raw);
  console.log('TITLE_SAVE_DIAGNOSTIC',JSON.stringify({member:previous.members?.map(h=>({job:h.job,skillCount:h.skills?.length,active:h.active,activeLearned:h.active?.map(i=>i===null?null:h.skills[i]),skillLoadout:h.skillLoadout})),build:previous.buildSystem?.plans?.map(p=>({id:p.id,job:p.job,active:p.active,activeLearned:p.active.map(i=>i===null?null:p.skills[i]),skillLoadout:p.skillLoadout})),error:cold.run('__EMBERWILD_BOOT_SAVE_ERROR')}));
 }
 assert.doesNotMatch(cold.elements.get('toast')?.textContent||'',/存檔未能載入/);
 const at=cold.run('party.offlineExploration.lastAt');cold.advance(-1000);hidden(cold,true);hidden(cold,false);cold.run('save();tick()');await cold.run('EmberwildOffline.settle()');assert.equal(cold.run('EmberwildOffline.failed'),false);assert.equal(cold.run('party.offlineExploration.lastAt'),at);assert.notEqual(cold.elements.get('offline-settlement')?.hidden,false);
 cold.advance(61000);cold.dispatch('pagehide');assert.equal(cold.values.get(key),raw);cold.run('continueFromTitle()');await settle(cold);assert.equal(cold.run('running'),false);assert.equal(cold.run('EmberwildOffline.failed'),false);
});


test('normal defeat stops by existing rules, while a failed quest encounter stops with no fabricated rewards',async()=>{
 const r=game();r.run('state.hp=1;state.autoPotion=false;state.potions=0;foes.forEach(e=>{e.hp=e.maxhp=1000000;e.atk=1000000;});save()');await settle(r,4000);
 assert.equal(r.run('running'),false);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),1);assert.equal(r.run('party.offlineExploration.pendingReceipt.kills'),0);
 r.run('stopTeamExploration()');const before=rewardState(r);await settle(r,60000);assert.equal(r.run('state.totalKills'),before.kills);assert.equal(r.run('state.gold'),before.gold);
 const q=game();q.run(`stopTeamExploration();state.lv=20;syncParty();refillParty();__EMBERWILD_STORY.record('shop_rescue').started=true;startQuestEncounter('shop_rescue/rescue');state.hp=1;state.autoPotion=false;state.potions=0;foes.forEach(e=>{e.hp=e.maxhp=1000000;e.atk=1000000;});save();`);await settle(q,60000);
 assert.equal(q.run('running'),false);assert.equal(q.run('party.offlineExploration.receipt'),null);assert.equal(q.run('party.offlineExploration.pendingReceipt.battles'),1);assert.equal(q.run('party.offlineExploration.pendingReceipt.kills'),0);assert.equal(q.run('expeditionChallengeResult.success'),false);
});


test('foreground delays never flash offline progress or replace an open receipt',async()=>{
 const r=game(),box=r.elements.get('offline-settlement'),writes=[],focus=[];let html=box.innerHTML,section=null;
 Object.defineProperty(box,'innerHTML',{get:()=>html,set:value=>{html=value;writes.push(value);section={scrollTop:0,focus:options=>focus.push(options)};}});
 box.querySelector=selector=>selector==='[role="dialog"]'?section:null;
 for(let i=0;i<3;i++){r.advance(1500);r.run('tick()');await r.run('EmberwildOffline.settle(undefined,false)');}
 assert.equal(writes.length,0);assert.equal(box.hidden,true);
 await settle(r,60000);assert.equal(section.scrollTop,0);assert.equal(focus.at(-1).preventScroll,true);
 const receipt=json(r,'party.offlineExploration.receipt'),kills=r.run('state.totalKills'),originalSection=section;section.scrollTop=180;writes.length=0;focus.length=0;
 for(let i=0;i<3;i++){r.advance(1500);r.run('tick()');await r.run('EmberwildOffline.settle(undefined,false)');}
 await settle(r,60000);
 assert.equal(writes.length,0);assert.equal(focus.length,0);assert.equal(section,originalSection);assert.equal(section.scrollTop,180);
 assert.deepEqual(json(r,'party.offlineExploration.receipt'),receipt);assert(r.run('state.totalKills')>kills);
});


test('a live page never adds online battles to an unfinished offline receipt, even after tab visibility changes',async()=>{
 const r=game();await settle(r,1000);const pending=json(r,'party.offlineExploration.pendingReceipt'),kills=r.run('state.totalKills');
 r.advance(60000);r.run('tick()');await r.run('EmberwildOffline.settle(undefined,false)');
 hidden(r,true);r.advance(60000);r.run('tick()');await r.run('EmberwildOffline.settle(undefined,false)');hidden(r,false);await r.run('EmberwildOffline.settle(undefined,false)');
 assert(r.run('state.totalKills')>kills);assert.deepEqual(json(r,'party.offlineExploration.pendingReceipt'),pending);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.elements.get('offline-settlement').hidden,true);
});

test('returning to the title and continuing in the same page cannot open offline progress',async()=>{
 const r=game(),box=r.elements.get('offline-settlement'),writes=[];let html=box.innerHTML;
 Object.defineProperty(box,'innerHTML',{get:()=>html,set:value=>{html=value;writes.push(value);}});
 r.run('returnToTitle()');r.advance(60000);r.run('continueFromTitle()');await r.run('EmberwildOffline.settle(undefined,false)');
 assert.equal(writes.length,0);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(box.hidden,true);
});

test('offline receipt shows the real names of consumed items and omits the clock warning',async()=>{
 const r=game();await settle(r,60000);
 assert(r.run('party.offlineExploration.receipt?.complete'));
 r.run('party.offlineExploration.receipt.consumed={"item:heal_small":2,"material:紅色草":4,"item:legacy-potion":1};changeOfflineGearPage(0)');
 const html=r.elements.get('offline-settlement').innerHTML;
 assert.match(html,/道具消耗/);
 assert.match(html,/簡易治療藥水/);
 assert.match(html,/紅色草/);
 assert.match(html,/舊版治療藥水/);
 assert.doesNotMatch(html,/item:heal_small|item:legacy-potion|改時鐘作弊/);
});
