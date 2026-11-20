'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
async function setup(){const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-11-20T02:00:00Z')});await g.page.evaluate(()=>{
 selectSaveSlot(1);start(1);closeModal();clearInterval(timer);setClassMasteryLevel(7);syncParty();startSelectedExploration();clearInterval(timer);spawnGroup();running=true;render();
 globalThis.lootWin=()=>{beginBattleStatistics();for(const e of foes){e.hp=0;rewardGroupKill(e);}finalizeBattleStatistics('victory');};
 // Exercise the actual reward path with guaranteed physical inventory and gear drops.
 effectiveDropChance=()=>1;configuredDropRules=()=>[
 {independent:true,id:'fx-ore',type:'ore',quantityMin:3,quantityMax:3,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-ether',type:'material',key:'以太鍛鐵',quantityMin:1,quantityMax:1,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-gem',type:'gem',key:'0',quantityMin:2,quantityMax:2,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-gear',type:'gearLegendary',quantityMin:1,quantityMax:1,chanceByDifficulty:[1,1,1]}
 ];foes.forEach(e=>{e.maxDrops=99;e.kind='elite';});render();
 });return g;}
test('victory receives inventory immediately; stream beam, flight, receiving light and names use actual names/quantities',async()=>{
 const g=await setup(),p=g.page;try{
 const result=await p.evaluate(()=>{const before=state.ore;lootWin();return {ore:state.ore-before,bag:state.bag.map(equipmentDisplayName),pending:EmberwildLootEffects.pendingCount};});
 assert(result.ore>=3);assert.equal(result.pending,0);assert(await p.locator('.loot-fx-drop').count()>0);assert.equal(await p.locator('.loot-fx-name').count(),0);
 const colors=await p.locator('.loot-fx-drop').evaluateAll(ns=>ns.map(n=>({name:n.dataset.lootName,color:n.style.getPropertyValue('--loot-color')})));
 assert.equal(colors.find(x=>x.name==='鍛鐵').color,'rgb(220, 227, 222)');assert.equal(colors.find(x=>x.name==='以太鍛鐵').color,'rgb(255, 229, 154)');
 await p.waitForTimeout(650);assert(await p.locator('.loot-fx-flight').count()>0);assert.equal(await p.locator('.loot-fx-local').count(),0);
 await p.waitForTimeout(550);const names=await p.locator('.loot-fx-name').allTextContents();assert(names.includes('以太鍛鐵 × 1'));assert(names.some(n=>n.startsWith('鍛鐵 × ')));assert(names.some(n=>result.bag.some(name=>n===name+' × 1')));
 assert.equal(await p.locator('.loot-fx-layer').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
 await p.waitForTimeout(1300);assert.equal(await p.locator('.loot-fx-layer').count(),0);assert.equal(await p.evaluate(()=>EmberwildLootEffects.activeCount),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('local names fit desktop/mobile battlefield; no flight, tail or receiving light; next encounter is independent',async()=>{
 const g=await setup(),p=g.page;try{
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
 await p.setViewportSize(size);await p.evaluate(()=>{setLootEffects('local');spawnGroup();render();lootWin();});
 assert(await p.locator('.loot-fx-local').count()>0);assert(await p.locator('.loot-fx-name').count()>0);assert.equal(await p.locator('.loot-fx-flight,.loot-fx-receive').count(),0);
 const r=await p.locator('#battleEnemyIcons').boundingBox(),names=await p.locator('.loot-fx-name').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
 for(const n of names){assert(n.left>=r.x-1);assert(n.right<=r.x+r.width+1);assert(n.top>=r.y-1);assert(n.right<=size.width);}
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i],b=names[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'name rectangles must not overlap');}
 await p.screenshot({path:'/tmp/loot-local-'+size.width+'.png'});
 await p.evaluate(()=>spawnGroup());assert(await p.locator('.loot-fx-local').count()>0,'new encounter does not wait or cancel a prior win');
 await p.waitForTimeout(1250);assert.equal(await p.locator('.loot-fx-layer').count(),0);
 }
 assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('off mode builds no effects, settings persist, changing mode/navigation cancels all nodes',async()=>{
 const g=await setup(),p=g.page;try{
 await p.evaluate(()=>{setLootEffects('off');lootWin();});assert.equal(await p.locator('.loot-fx-layer').count(),0);assert.equal(await p.evaluate(()=>EmberwildLootEffects.pendingCount),0);
 await p.evaluate(()=>{setLootEffects('local');spawnGroup();render();lootWin();});assert(await p.locator('.loot-fx-name').count()>0);
 await p.evaluate(()=>setLootEffects('stream'));assert.equal(await p.locator('.loot-fx-layer').count(),0);
 await p.evaluate(()=>{spawnGroup();render();lootWin();setTab('options');});assert.equal(await p.locator('.loot-fx-layer').count(),0);
 await p.locator('[data-loot-effects]').selectOption('local');assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-battle-effects.loot')),'local');
 await p.reload();assert.equal(await p.evaluate(()=>EmberwildLootEffects.preference),'local');assert.equal(await p.locator('.loot-fx-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('backpack coordinates are resolved from visible desktop/mobile navigation; unavailable entry stays in viewport',async()=>{
 const g=await setup(),p=g.page;try{
 for(const width of [1440,390]){
 await p.setViewportSize({width,height:900});await p.evaluate(()=>{setLootEffects('stream');spawnGroup();render();lootWin();});await p.waitForTimeout(600);
 const routes=await p.locator('.loot-fx-flight').evaluateAll(ns=>ns.map(n=>({x:parseFloat(n.style.left)+parseFloat(n.style.getPropertyValue('--loot-dx')),y:parseFloat(n.style.top)+parseFloat(n.style.getPropertyValue('--loot-dy'))})));
 const bag=await p.locator('.game-nav [data-nav-group="bag"]').boundingBox();assert(bag,'visible backpack entry');
 assert(routes.length>0);for(const r of routes){assert(Math.abs(r.x-(bag.x+bag.width/2))<1);assert(Math.abs(r.y-(bag.y+bag.height/2))<1);}for(const r of routes){assert(r.x>0&&r.x<width);assert(r.y>0&&r.y<900);}
 await p.waitForTimeout(1900);
 }
 await p.evaluate(()=>{document.querySelectorAll('nav').forEach(n=>n.style.visibility='hidden');spawnGroup();render();lootWin();});await p.waitForTimeout(1200);assert(await p.locator('.loot-fx-name').count()>0);
 assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('continuous wins are bounded and do not replace existing names; identical drops settle across all three modes',async()=>{
 const g=await setup(),p=g.page;try{
 const snapshots=[];
 for(const mode of ['off','stream','local'])snapshots.push(await p.evaluate(mode=>{
 setLootEffects(mode);let seed=123;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 spawnGroup();for(const e of foes)e.kind='elite';render();const before=state.ore,bag=state.bag.length;lootWin();return {ore:state.ore-before,gear:state.bag.length-bag};
 },mode));assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[0],snapshots[2]);
 await p.evaluate(()=>{setLootEffects('local');for(let i=0;i<60;i++){spawnGroup();render();lootWin();}});assert(await p.evaluate(()=>EmberwildLootEffects.activeCount)<=12);
 await p.waitForTimeout(1400);assert.equal(await p.locator('.loot-fx-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
