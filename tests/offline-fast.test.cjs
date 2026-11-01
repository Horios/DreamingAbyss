const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,fixture,reset,replay,json}=require('./offline-fast-validation.cjs');
const r=runtime(),base=json(r,'packParty()');
function receipt(){return json(r,'party.offlineExploration.receipt||party.offlineExploration.pendingReceipt');}
function summary(){return json(r,'({kills:state.totalKills,gold:state.gold,xp:state.xp,bag:state.bag.length,lastAt:party.offlineExploration.lastAt,timeline:EmberwildSecondsCombat.pack()})');}
test('eight-hour event-driven replay uses the full combat rules, original drops and one durable receipt',async()=>{
 const save=fixture(r,base,'high'),a=await replay(r,save,8,123456,true),b=await replay(r,save,8,123456,false);
 for(const k of ['kills','xp','gold','items','consumed','gear','lv','bag','running'])assert.deepEqual(b[k],a[k],k);
 assert.equal(b.metrics.fastBattles,0);assert.equal(b.metrics.fallbacks['seconds-event-model'],1);
 const rec=receipt();assert.equal(rec.kills,b.kills);assert.equal(rec.gear.length,r.run('state.bag.length')-save.members[0].bag.length);assert.equal(rec.effectiveMs,8*3600000);
 const committed=json(r,'packParty()'),before=summary();reset(r,committed);await r.run('EmberwildOffline.settle()');assert.deepEqual(summary(),before);assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.equal(r.run('acknowledgeOfflineExploration()'),false);assert.deepEqual(summary(),before);
});
test('potion depletion and real-time boost deadlines remain in the shared event model',async()=>{
 for(const name of ['potions','boosts']){const save=fixture(r,base,name),a=await replay(r,save,.1,98765,true),b=await replay(r,save,.1,98765,false);for(const k of ['kills','xp','gold','items','consumed','gear','lv','bag','running'])assert.deepEqual(b[k],a[k],name+' '+k);assert.equal(b.metrics.fastBattles,0);}
});
