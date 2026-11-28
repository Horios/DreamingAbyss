'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
async function setup(){const g=await openRuntime(root);await g.page.evaluate(()=>{
 selectSaveSlot(1);start(1);closeModal();clearInterval(timer);setClassMasteryLevel(7);syncParty();startSelectedExploration();clearInterval(timer);spawnGroup();running=true;render();
 globalThis.lootWin=()=>{beginBattleStatistics();for(const e of foes){e.hp=0;rewardGroupKill(e);}finalizeBattleStatistics('victory');};
 // Exercise the actual reward path with guaranteed physical inventory and gear drops.
 effectiveDropChance=()=>1;configuredDropRules=()=>[
 {independent:true,id:'fx-ore',type:'ore',quantityMin:3,quantityMax:3,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-ether',type:'material',key:'以太鍛鐵',quantityMin:1,quantityMax:1,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-gem',type:'gem',key:'0',quantityMin:2,quantityMax:2,chanceByDifficulty:[1,1,1]},
 {independent:true,id:'fx-gear',type:'monsterGear',pool:[{key:'form:1:0:1',weight:1}],quantityMin:1,quantityMax:1,chanceByDifficulty:[1,1,1]}/* v0.228: gearLegendary rules no longer exist */
 ];foes.forEach(e=>{e.maxDrops=99;e.kind='elite';});render();nextActionAt=Date.now()+1e9;
 });return g;}
test('victory receives inventory immediately; stream beam, flight, receiving light and names use actual names/quantities',async()=>{
 const g=await setup(),p=g.page;try{
 const result=await p.evaluate(()=>{const before=state.ore,ether=state.materials['以太鍛鐵']||0;lootWin();return {ore:state.ore-before,ether:(state.materials['以太鍛鐵']||0)-ether,bag:state.bag.map(equipmentDisplayName),pending:EmberwildLootEffects.pendingCount};});
 assert(result.ore>=3);assert.equal(result.pending,0);assert(await p.locator('.loot-fx-drop').count()>0);assert.equal(await p.locator('.loot-fx-name').count(),0);
 const colors=await p.locator('.loot-fx-drop').evaluateAll(ns=>ns.map(n=>({name:n.dataset.lootName,color:n.style.getPropertyValue('--loot-color')})));
 assert.equal(colors.find(x=>x.name==='鍛鐵').color,'rgb(220, 227, 222)');assert.equal(colors.find(x=>x.name==='以太鍛鐵').color,'rgb(255, 229, 154)');
 await p.waitForTimeout(650);assert(await p.locator('.loot-fx-flight').count()>0);assert.equal(await p.locator('.loot-fx-local').count(),0);
 await p.waitForTimeout(550);const names=await p.locator('.loot-fx-name').allTextContents();assert(names.includes('以太鍛鐵 × '+result.ether));assert(names.some(n=>n.startsWith('鍛鐵 × ')));assert(names.some(n=>result.bag.some(name=>n===name+' × 1')));
 assert.equal(await p.locator('.loot-fx-layer').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
 await p.waitForTimeout(1300);assert.equal(await p.locator('.loot-fx-layer').count(),0);assert.equal(await p.evaluate(()=>EmberwildLootEffects.activeCount),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('local names fit desktop/mobile battlefield; no flight, tail or receiving light; next encounter is independent',async()=>{
 const g=await setup(),p=g.page;try{
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
 await p.setViewportSize(size);/* v0.228: let the resized layout settle before placing names over the enemy icons */await p.waitForFunction(w=>innerWidth===w,size.width);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.evaluate(()=>{setLootEffects('local');spawnGroup();render();lootWin();});
 /* v0.228: the effect nodes are built asynchronously; wait for them instead of counting at once */await p.waitForFunction(()=>document.querySelectorAll('.loot-fx-local').length>0,null,{timeout:2000});assert(await p.locator('.loot-fx-name').count()>0);assert.equal(await p.locator('.loot-fx-flight,.loot-fx-receive').count(),0);
 const r=await p.locator('#battleEnemyIcons').boundingBox(),names=await p.locator('.loot-fx-name').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
 const health=await p.locator('#battleEnemyIcons .unit-numbers,#battleEnemyIcons .battle-health-bar').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
 for(const n of names)for(const h of health)assert(n.right<=h.left||h.right<=n.left||n.bottom<=h.top||h.bottom<=n.top,'local names must not cover health information');
 for(const n of names){assert(n.left>=r.x-1);assert(n.right<=r.x+r.width+1);assert(n.top>=r.y-1);assert(n.right<=size.width);}
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i],b=names[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'name rectangles must not overlap');}
 await p.screenshot({path:'/tmp/loot-local-'+size.width+'.png'});
 await p.evaluate(()=>spawnGroup());assert(await p.locator('.loot-fx-local').count()>0,'new encounter does not wait or cancel a prior win');
 await p.waitForTimeout(1250);/* v0.228: allow extra time under load; the next round needs every effect finished (visible effects are capped) */await p.waitForFunction(()=>!document.querySelector('.loot-fx-layer')&&EmberwildLootEffects.activeCount===0,null,{timeout:5000});assert.equal(await p.locator('.loot-fx-layer').count(),0);
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
 const bag=await p.locator('nav [data-nav-group="bag"]').boundingBox();assert(bag,'visible backpack entry');
 assert(routes.length>0);for(const r of routes){assert(Math.abs(r.x-(bag.x+bag.width/2))<1);assert(Math.abs(r.y-(bag.y+bag.height/2))<1);}for(const r of routes){assert(r.x>0&&r.x<width);assert(r.y>0&&r.y<900);}
 await p.waitForTimeout(1900);
 }
 await p.evaluate(()=>{spawnGroup();render();document.querySelectorAll('nav').forEach(n=>n.style.visibility='hidden');lootWin();});await p.waitForTimeout(1200);assert(await p.locator('.loot-fx-name').count()>0);
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
test('v0.182: the beam size setting has 小 (original), 中 and 大, scales the beam and point, and is remembered',async()=>{
 const g=await setup(),p=g.page;try{
 await p.setViewportSize({width:1440,height:900});
 const measure=async value=>{await p.evaluate(v=>{/* v0.228: start from no running effects; the visible-effect cap can otherwise leave no room */EmberwildLootEffects.clear();setLootEffects('stream');setLootEffectSize(v);spawnGroup();foes.forEach(e=>{e.maxDrops=99;e.kind='elite';});render();lootWin();},value);
  const box=await p.locator('.loot-fx-drop').first().evaluate(n=>{const b=n.querySelector('.loot-fx-beam');return {beamW:b.offsetWidth,beamH:b.offsetHeight,point:n.offsetWidth,size:n.closest('.loot-fx-layer').dataset.lootSize};});
  await p.evaluate(()=>EmberwildLootEffects.clear());return box;};
 // Layout sizes (offsetWidth/Height) are not affected by the animated transform.
 const sizes={};for(const v of ['small','medium','large']){sizes[v]=await measure(v);assert.equal(sizes[v].size,v);}
 assert.equal(sizes.small.point,10,'小 keeps the original 10px point');
 for(const [v,k] of [['medium',1.6],['large',2.2]]){assert(Math.abs(sizes[v].point/sizes.small.point-k)<.05,v+' point ×'+k);assert(Math.abs(sizes[v].beamW/sizes.small.beamW-k)<.1,v+' beam width ×'+k);assert(Math.abs(sizes[v].beamH/sizes.small.beamH-k)<.1,v+' beam height ×'+k);}
 // The options page lists both settings and the size choice is stored.
 await p.evaluate(()=>{setLootEffectSize('medium');});assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-battle-effects.loot-size')),'medium');
 assert.match(await p.evaluate(()=>battleEffectsOptionsView()),/掉落光柱大小[\s\S]*value="medium" selected/);
 assert.equal(await p.evaluate(()=>setLootEffectSize('huge')),false);assert.equal(await p.evaluate(()=>EmberwildLootEffects.size),'medium');
 assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
