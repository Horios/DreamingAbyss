'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('loot settings preserve the same resolved inventory, RNG and immediate settlement; offline and off never collect',async()=>{
 const results=[];
 for(const mode of ['off','stream','local']){
  const r=loadRuntime(root);r.ctx.mode=mode;
  r.run(`selectSaveSlot(1);start(1);closeModal();clearInterval(timer);startSelectedExploration();clearInterval(timer);setLootEffects(mode);
   globalThis.lootSeed=567;Math.random=()=>{lootSeed=(Math.imul(lootSeed,1664525)+1013904223)>>>0;return lootSeed/4294967296;};spawnGroup();running=true;
   effectiveDropChance=()=>1;configuredDropRules=()=>[{id:'ore',independent:true,type:'ore',quantityMin:3,quantityMax:3},{id:'gem',independent:true,type:'gem',key:'0',quantityMin:2,quantityMax:2},{id:'gear',independent:true,type:'gearLegendary',quantityMin:1,quantityMax:1}];
   beginBattleStatistics();for(const e of foes){e.hp=0;rewardGroupKill(e);}
   globalThis.collected=EmberwildLootEffects.pendingCount;
   globalThis.resolved=JSON.stringify({ore:state.ore,dust:state.dust,gems:state.gems,materials:state.materials,gear:state.bag.map(g=>({name:equipmentDisplayName(g),affix:g.affix})),rng:lootSeed});
   finalizeBattleStatistics('victory');`);
  assert.equal(r.run('collected>0'),mode!=='off');assert.equal(r.run('EmberwildLootEffects.pendingCount'),0);
  results.push(r.run('resolved'));
  r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`setLootEffects('stream');spawnGroup();save();`);r.advance(60000);await r.run('EmberwildOffline.settle()');
  assert.equal(r.run('EmberwildLootEffects.pendingCount'),0);assert.equal(r.run('EmberwildLootEffects.activeCount'),0);assert.deepEqual(r.errors,[]);
 }
 assert.equal(results[0],results[1]);assert.equal(results[0],results[2]);
});

test('real foreground ticks collect victory drops inside the shared live/offline driver',()=>{
 const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(1);closeModal();clearInterval(timer);startSelectedExploration();setLootEffects('stream');
  configuredDropRules=()=>[{id:'ore',independent:true,type:'ore',quantityMin:3,quantityMax:3}];effectiveDropChance=()=>1;
  globalThis.visualWins=0;const oldFinalize=finalizeBattleStatistics;finalizeBattleStatistics=function(result){if(result==='victory'&&EmberwildLootEffects.pendingCount>0)visualWins++;return oldFinalize(result);};
  const oldSpawn=spawnGroup;spawnGroup=function(){const out=oldSpawn();for(const e of foes)e.hp=1;return out;};spawnGroup();running=true;save();`);
 for(let i=0;i<160&&!r.run('visualWins');i++){r.advance(250);r.run('tick()');}
 assert(r.run('visualWins>0'));assert.deepEqual(r.errors,[]);
});
