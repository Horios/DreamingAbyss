const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,fixture,reset,replay,json}=require('./offline-fast-validation.cjs');
const r=runtime(),base=json(r,'packParty()');
function receipt(){return json(r,'party.offlineExploration.receipt||party.offlineExploration.pendingReceipt');}
function summary(){return json(r,'({kills:state.totalKills,gold:state.gold,xp:state.xp,bag:state.bag.length,lastAt:party.offlineExploration.lastAt})');}
test('three real hours precede fast replay; original drops, progress and durable receipt agree',async()=>{
 const save=fixture(r,base,'high'),phases=new Set(),schedule=r.ctx.setTimeout;
 r.ctx.setTimeout=fn=>{const html=r.elements.get('offline-settlement').innerHTML;if(html.includes('<progress')){const match=html.match(/max="(\d+)" value="(\d+)"/);assert(Number(match[2])<Number(match[1]));if(html.includes('正在分析'))phases.add('analysis');if(html.includes('正在快速'))phases.add('fast');if(html.includes('正在生成'))phases.add('drops');}return setImmediate(fn);};
 const out=await replay(r,save,8,123456,false);r.ctx.setTimeout=schedule;
 assert(out.metrics.fastBattles>0);assert.equal(out.metrics.hours.length,3);assert(out.metrics.fastMs<=5*3600000);assert.deepEqual([...phases].sort(),['analysis','drops','fast']);
 const rec=receipt();assert.equal(rec.kills,r.run('state.totalKills'));assert.equal(rec.gear.length,r.run('state.bag.length')-save.members[0].bag.length);assert.equal(rec.xp,out.xp);assert.equal(rec.effectiveMs,8*3600000);
 const committed=json(r,'packParty()'),before=summary();reset(r,committed);await r.run('EmberwildOffline.settle()');assert.deepEqual(summary(),before);assert.equal(r.run('acknowledgeOfflineExploration()'),true);assert.equal(r.run('acknowledgeOfflineExploration()'),false);assert.deepEqual(summary(),before);
});
test('a fast drop exception restores the atomic checkpoint and finishes in full mode',async()=>{
 const save=fixture(r,base,'high');r.run(`globalThis.fastFault=false;globalThis.originalKillForTest=rewardGroupKill;rewardGroupKill=function(e){const out=originalKillForTest(e);if(!fastFault&&EmberwildOffline.metrics?.phase==='正在生成掉落物品'){fastFault=true;throw Error('injected fast drop failure');}return out;};`);
 let out;try{out=await replay(r,save,8,123456,false);}finally{r.run('rewardGroupKill=originalKillForTest');}
 assert.equal(r.run('fastFault'),true);assert.equal(out.metrics.fallbacks['fast-error'],1);assert.match(out.metrics.lastFastError,/injected/);assert.equal(receipt().kills,r.run('state.totalKills'));assert.equal(receipt().gear.length,r.run('state.bag.length')-save.members[0].bag.length);
 const persisted=json(r,'packParty()'),before=summary();reset(r,persisted);await r.run('EmberwildOffline.settle()');assert.deepEqual(summary(),before);
});
test('the published level-gap rule gives an overlevelled starter-region fixture zero EXP',async()=>{
 const save=fixture(r,base,'high'),out=await replay(r,save,1,123456,true);
 assert(out.kills>0);assert.equal(out.xp,0);assert.equal(out.lv,59);
});
test('starter map 11-hour offline replay respects the published level-gap EXP cap',async()=>{
 const save=fixture(r,base,'low');
 assert.equal(save.map,0);
 assert.equal(save.members[0].lv,1);
 assert.equal(r.run('MAPS[0].max'),5);
 assert.equal(r.run("EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,5,'normal',0,15)"),0,'a level-15 character must receive zero EXP from a level-5 enemy');
 const out=await replay(r,save,11,123456,false);
 assert(out.kills>0,'replay should defeat monsters in the starter zone');
 assert(out.lv<=15,'11 hours on map 0 must not reach level 16 or higher, observed level '+out.lv);
 assert.equal(r.run('party.map'),0);
});
test('a level boundary exits fast replay and rebuilds natural stats and overflow XP',async()=>{
 // Isolate the boundary from EXP source/level-gap rules (covered above). A
 // fixed one-EXP reward places the transition after the three sampling hours.
 const enemyXp=r.ctx.EmberwildProgression.enemyXp;r.ctx.EmberwildProgression.enemyXp=()=>1;
 try{
 let save=fixture(r,base,'high');
 const one=await replay(r,save,1,123456,true);assert(one.xp>0);reset(r,save);r.ctx.hourXP=one.xp;r.run('state.xp=Math.max(0,need(state.lv)-hourXP*4);save()');save=json(r,'packParty()');
 const full=await replay(r,save,8,123456,true),fast=await replay(r,save,8,123456,false);
 assert(fast.metrics.fastBattles>0);assert(fast.metrics.fallbacks['level-boundary']>0);assert(fast.metrics.fallbacks['combat-state-change']>0);assert.equal(fast.lv,60);assert.equal(fast.lv,full.lv);assert.equal(r.run('state.xp'),0);assert.equal(r.run("Object.hasOwn(state,'ap')"),false);assert.equal(r.run("Object.hasOwn(state,'stats')"),false);
 }finally{r.ctx.EmberwildProgression.enemyXp=enemyXp;}
});
test('speed, XP and drop boosts expire at four hours and force fresh full samples',async()=>{
 const save=fixture(r,base,'boosts'),out=await replay(r,save,8,123456,false);assert(out.metrics.fastBattles>0);assert(out.metrics.fallbacks['time-boundary']>0);assert(out.metrics.fallbacks['combat-state-change']>0);assert.equal(r.run('battleRate'),1);assert(r.run('party.timedBoosts.every(b=>b.remainingMs===0)'));
 assert.deepEqual(Object.values(receipt().boosts).map(b=>b.ms),[4*3600000,4*3600000,4*3600000]);
});
test('inventory capacity auto-salvages overflow, preserves existing gear and does not stop offline exploration',async()=>{
 const save=fixture(r,base,'high'),initialIds=save.members[0].bag.map(g=>g.id);
 const warm=await replay(r,save,3,123456,true),capacity=warm.bag+1;
 r.run('GAMEPLAY_SETTINGS.equipment.bagCapacity='+String(capacity)+';globalThis.__EMBERWILD_GAMEPLAY_SETTINGS.equipment.bagCapacity='+String(capacity));
 assert.equal(r.run('RULES.bagCapacity'),capacity,'the configured inventory cap must be applied by the live rule accessor');
 const out=await replay(r,save,24,123456,false);
 assert(out.metrics.fastBattles>0);
 assert.equal(out.running,true,'a full bag must not stop an otherwise ongoing expedition');
 assert(out.bag>=save.members[0].bag.length&&out.bag<=capacity,'generated gear must preserve old gear and stay within capacity');
 assert.equal(receipt().effectiveMs,24*3600000,'the full eligible offline interval must be settled');
 assert.doesNotMatch(String(receipt().reason||''),/背包已滿/);
 assert.equal(receipt().gear.length,out.bag-save.members[0].bag.length);
 assert.equal(receipt().kills,r.run('state.totalKills'));
 // Reapply the intended limit after replay: reset/load helpers may refresh the
 // current published settings object while restoring saved state.
 r.run('globalThis.__EMBERWILD_GAMEPLAY_SETTINGS.equipment.bagCapacity='+String(capacity));
 assert.equal(r.run('RULES.bagCapacity'),capacity,'the overflow path must use the actual live capacity');
 // Drop-rate reductions may leave space after 24h; fill remaining slots before
 // testing the full-bag salvage path, rather than assuming a guaranteed drop.
 for(let i=out.bag;i<capacity;i++)r.run('addGear(gear(1,0,0,state.job))');
 const before=json(r,'({ids:state.bag.map(g=>g.id),ore:state.ore,dust:state.dust})');
 assert.equal(before.ids.length,capacity,'overflow test must begin with a full bag');
 for(const id of initialIds)assert(before.ids.includes(id),'preexisting gear must be preserved: '+id);
 r.run('addGear(gear(1,0,0,state.job))');
 const after=json(r,'({ids:state.bag.map(g=>g.id),ore:state.ore,dust:state.dust})');
 assert.deepEqual(after.ids,before.ids,'overflow must not replace or discard stored gear');
 assert.equal(after.ore,before.ore+3,'overflow tier-one gear converts to forge material');
 assert.equal(after.dust,before.dust+1,'overflow tier-one gear converts to gem dust');
 r.run('GAMEPLAY_SETTINGS.equipment.bagCapacity=10000;globalThis.__EMBERWILD_GAMEPLAY_SETTINGS.equipment.bagCapacity=10000');
});
