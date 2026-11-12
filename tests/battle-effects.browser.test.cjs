'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
async function setup(){const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-27T02:00:00Z')});await g.page.evaluate(()=>{
 selectSaveSlot(1);start(1);closeModal();clearInterval(timer);state.lv=8;syncParty();recruitCompanion(10);recruitCompanion(11);closeModal();party.active=party.members.map(h=>memberKey(h));party.huntingMode='group';startSelectedExploration();clearInterval(timer);spawnGroup();running=true;
 const base=foes[0];foes=Array.from({length:3},(_,i)=>({...base,name:'測試史萊姆',id:'fx-'+i,kind:i===2?'elite':'normal',hp:10000,maxhp:10000,shield:0}));enemy=foes[0];beginBattleStatistics();for(const h of heroes()){h.hp=stats(h).hp;h.shield=0;}render();
 globalThis.fxCapture=function(fn){EmberwildBattleEffects.begin();fn();EmberwildBattleEffects.end();globalThis.fxEvents=EmberwildBattleEffects.pendingEvents;EmberwildBattleSummary.sync();};
 });return g;}
const effects=p=>p.locator('#battleEnemyIcons .battle-enemy-icon .battle-fx').evaluateAll(nodes=>nodes.map(n=>({target:n.parentNode.dataset.enemyId,type:n.dataset.fx})));
const semanticColors={damage:'rgb(255, 121, 111)',buff:'rgb(244, 213, 139)',shield:'rgb(242, 245, 255)',recovery:'rgb(135, 239, 173)',debuff:'rgb(196, 149, 240)'};
async function assertSemanticColors(p){
 const rows=await p.locator('.battle-fx,.battle-fx-status>[data-fx-persistent]').evaluateAll(ns=>ns.map(n=>({type:n.dataset.fx||n.dataset.fxPersistent,category:n.dataset.fxCategory,color:getComputedStyle(n).color})));
 for(const row of rows){assert.equal(row.color,semanticColors[row.category],JSON.stringify(row));if(['slash','ranged','impact','magic','fire','ice','lightning','wind','light','shadow','critical','dot','hit','attack'].includes(row.type))assert.equal(row.category,'damage',row.type);if(['heal','regen','potion','drain'].includes(row.type))assert.equal(row.category,'recovery',row.type);if(['shield','absorb','break','dissolve','shield-impact','resist','evade'].includes(row.type))assert.equal(row.category,'shield',row.type);if(['debuff','skip','polymorph','freeze','frost','fear','tauntRage'].includes(row.type))assert.equal(row.category,'debuff',row.type);if(['buff','rage'].includes(row.type))assert.equal(row.category,'buff',row.type);}
 return rows;
}
test('plain elemental weapon hits stay red without a purple cast/debuff burst or replaying existing statuses',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>{Math.random=()=>.99;castPartySkill=()=>false;weaponElement=()=> 'fire';__EMBERWILD_STATUS_TEST_API.apply({id:'audit-held-buff',name:'既有增益',tags:['modifier'],duration:9,polarity:'buff',modifiers:[{kind:'guard',value:.1}]},state,state);__EMBERWILD_STATUS_TEST_API.apply({id:'audit-held-debuff',name:'既有減益',tags:['modifier'],duration:9,polarity:'debuff',modifiers:[{kind:'weaken',value:.1}]},state,foes[0]);recordAction(heroKey(state),characterName(state),'普攻');fxCapture(()=>performHeroBasic(state));});
  assert.equal(await p.locator('.battle-fx[data-fx="debuff"],.battle-fx[data-fx="buff"],.battle-fx[data-fx="cast"]').count(),0);
  assert.equal(await p.locator('#battleAllyIcons [data-fx="attack"][data-fx-category="damage"]').count(),2);
  assert.equal(await p.locator('#battleEnemyIcons [data-fx="fire"][data-fx-category="damage"]').count(),2);
  assert.equal(await p.locator('#battleEnemyIcons [data-fx-persistent="debuff"]').count(),2);
  await assertSemanticColors(p);
  await p.clock.runFor(1600);await p.evaluate(()=>{foes[0].shield=10000;fxCapture(()=>performHeroBasic(state));});
  assert.equal(await p.locator('#battleAllyIcons [data-fx="attack"][data-fx-category="damage"]').count(),2);assert.equal(await p.locator('#battleEnemyIcons [data-fx="absorb"][data-fx-category="shield"]').count(),2);await assertSemanticColors(p);
  await p.clock.runFor(1600);await p.evaluate(()=>{const previous=enemyBattleStats;enemyBattleStats=e=>({...previous(e),evasion:1});fxCapture(()=>performHeroBasic(state));});
  assert.equal(await p.locator('#battleAllyIcons [data-fx="attack"][data-fx-category="damage"]').count(),2);assert.equal(await p.locator('#battleEnemyIcons [data-fx="evade"][data-fx-category="shield"]').count(),2);await assertSemanticColors(p);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('1x impacts remain readable; polymorph skips report immediately on both surfaces without deferring damage',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>fxCapture(()=>__EMBERWILD_CONTROL_TEST_API.applyPolymorph(foes[1],300,{duration:3})));await p.clock.runFor(1600);
  const hp=await p.evaluate(()=>state.hp);
  await p.evaluate(()=>{recordAction(foes[1].id,foes[1].name,'攻擊');fxCapture(()=>performEnemyAction(foes[1]));});
  const card=p.locator('.unit[data-combat-id="fx-1"]');
  assert.equal(await card.locator('[data-fx="skip"]').count(),2);assert((await card.locator('[data-fx="skip"] b').allTextContents()).every(x=>x==='變形・無法行動'));
  assert.equal(await card.locator('[data-fx="attack"],[data-fx="cast"],[data-fx="hit"]').count(),0);assert.equal(await p.evaluate(()=>state.hp),hp);
  assert.equal(await p.evaluate(()=>__EMBERWILD_CONTROL_TEST_API.states[foes[1].id].polymorph.turns),3);
  await p.clock.runFor(500);assert.equal(await card.locator('[data-fx="skip"]').count(),2);await p.clock.runFor(1100);
  assert.equal(await card.locator('[data-fx="skip"]').count(),0);assert.equal(await card.locator('[data-fx-persistent="polymorph"]').count(),2);
  const before=await p.evaluate(()=>foes[0].hp);await p.evaluate(()=>fxCapture(()=>resolveHit(foes[0],50,state,'fire',false)));
  const damaged=p.locator('.unit[data-combat-id="fx-0"]');assert(await p.evaluate(x=>foes[0].hp<x,before));
  assert.equal(await damaged.locator('.battle-fx-health[data-fx="hit"]').evaluate(n=>n.style.getPropertyValue('--fx-time')),'750ms');
  const live=await p.evaluate(()=>Math.ceil(foes[0].hp));assert((await damaged.locator('.unit-numbers>span:first-child b').textContent()).startsWith(live+' /'));
  await p.clock.runFor(600);assert.equal(await damaged.locator('[data-fx="hit"]').count(),2);await p.clock.runFor(1000);assert.equal(await damaged.locator('[data-fx="hit"]').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('actual hits, misses, AoE and shield outcomes reach only their own SVG icon and retain actor/elite identity',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>{recordAction(heroKey(state),characterName(state),'技能');fxCapture(()=>resolveHit(foes[1],50,state,'fire',false));});
  let rows=await effects(p);assert(rows.some(e=>e.target==='fx-1'&&e.type==='fire'));assert(!rows.some(e=>e.target!=='fx-1'));assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon .battle-fx-projectile').count(),1);assert.equal(await p.locator('#battleAllyIcons .is-acting').count(),1);assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="fx-2"].is-elite .enemy-icon-elite').count(),1);
  await p.clock.runFor(1600);assert.equal(await p.locator('.battle-fx').count(),0);
  await p.evaluate(()=>fxCapture(()=>castPartySkill(state,state.active[0],battleStats(state))));await p.clock.runFor(200);assert((await effects(p)).some(e=>e.type==='fire'));assert.equal(await p.locator('#battleAllyIcons .battle-enemy-icon [data-fx="cast"]').count(),1);await p.clock.runFor(1600);
  await p.evaluate(()=>fxCapture(()=>foes.forEach(e=>resolveHit(e,50,state,'ice',false))));rows=await effects(p);assert.deepEqual(rows.filter(e=>e.type==='ice').map(e=>e.target),['fx-0','fx-1','fx-2']);
  await p.clock.runFor(1600);await p.evaluate(()=>{foes[1].shield=10000;fxCapture(()=>resolveHit(foes[1],50,state,'fire',false));});rows=await effects(p);assert(rows.some(e=>e.type==='absorb'));assert(!rows.some(e=>e.type==='hit'||e.type==='fire'));
  await p.clock.runFor(1600);await p.evaluate(()=>{foes[1].shield=1;fxCapture(()=>resolveHit(foes[1],50,state,'fire',false));});rows=await effects(p);for(const type of ['absorb','break','hit','fire'])assert(rows.some(e=>e.type===type),type);
  await p.clock.runFor(1600);await p.evaluate(()=>{const base=enemyBattleStats;enemyBattleStats=e=>({...base(e),evasion:1});fxCapture(()=>resolveHit(foes[1],50,state,'fire',false));});rows=await effects(p);assert(rows.some(e=>e.type==='evade'));assert(!rows.some(e=>e.type==='fire'||e.type==='hit'));assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('healing and coexisting buff/debuff/shield markers use party IDs and expire cleanly',async()=>{
 const g=await setup(),p=g.page;try{
  assert.equal(await p.locator('#battleAllyIcons .unit [data-hero-id]').count(),3);
  await p.evaluate(()=>{for(const h of heroes())h.hp=1;fxCapture(()=>EmberwildBattleEffects.scope({mode:'skill'},()=>heroes()[1].hp+=10));});
  const target=await p.evaluate(()=>heroKey(heroes()[1]));assert.equal(await p.locator('#battleAllyIcons [data-hero-id="'+target+'"] [data-fx="heal"]').count(),1);assert.equal(await p.locator('#battleAllyIcons .battle-enemy-icon [data-fx="heal"]').count(),1);
  await p.clock.runFor(1600);await p.evaluate(()=>fxCapture(()=>{applyPureShield(heroes()[1],300);__EMBERWILD_STATUS_TEST_API.apply({id:'fx-b',name:'強化',polarity:'buff',duration:2,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'guard',value:.1}]},state,heroes()[1]);__EMBERWILD_STATUS_TEST_API.apply({id:'fx-d',name:'弱化',polarity:'debuff',duration:2,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'weaken',value:.1}]},foes[0],heroes()[1]);}));
  const icon=p.locator('#battleAllyIcons [data-hero-id="'+target+'"]');for(const type of ['shield','buff','debuff'])assert.equal(await icon.locator('[data-fx="'+type+'"]').count(),1,type);assert.equal(await icon.locator('.battle-fx-status>i').count(),3);
  await p.clock.runFor(1600);assert.equal(await icon.locator('.battle-fx').count(),0);assert.equal(await icon.locator('.battle-fx-status>i').count(),3);
  await p.evaluate(()=>{partyClock+=3;heroes()[1].shield=0;EmberwildBattleSummary.sync();});assert.equal(await icon.locator('.battle-fx-status').count(),0);
  await p.evaluate(()=>fxCapture(()=>EmberwildBattleEffects.scope({mode:'regen'},()=>heroes()[1].hp+=1)));assert.equal(await icon.locator('[data-fx="regen"]').count(),1);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('fixed pacing, reduced motion, settings persistence, bounded bursts, stale/dead targets and lifecycle cleanup',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>fxCapture(()=>resolveHit(foes[1],50,state,'fire',false)));assert.equal(await p.evaluate(()=>battleRate),1);assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon [data-fx="fire"]').evaluate(n=>n.style.getPropertyValue('--fx-time')),Math.round(600*1.5)+'ms');await p.clock.runFor(1600);
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>fxCapture(()=>resolveHit(foes[1],50,state,'fire',false)));assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon [data-fx="fire"]').getAttribute('data-detail'),'simple');assert.equal(await p.locator('.battle-fx-projectile').count(),0);assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="fx-1"]>.enemy-icon-art').evaluate(n=>getComputedStyle(n).animationName),'none');
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.evaluate(()=>{for(let i=0;i<100;i++)fxCapture(()=>resolveHit(foes[1],1,state,'physical',false));});assert(await p.evaluate(()=>EmberwildBattleEffects.activeCount)<=24);await p.clock.runFor(1600);assert.equal(await p.locator('.battle-fx').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.activeCount),0);
  await p.evaluate(()=>{EmberwildBattleEffects.begin();resolveHit(foes[1],50,state,'fire',false);EmberwildBattleEffects.end();});await p.clock.runFor(1600);await p.evaluate(()=>EmberwildBattleSummary.sync());assert(await p.locator('.battle-fx').count()>0);await p.clock.runFor(1600);
  await p.evaluate(()=>{fxCapture(()=>{resolveHit(foes[1],50000,state,'fire',false);});});assert(await p.locator('#battleEnemyIcons [data-enemy-id="fx-1"] .battle-fx').count()>0);
  await p.evaluate(()=>fxCapture(()=>resolveHit(foes[0],50,state,'fire',false)));await p.evaluate(()=>setTab('options'));assert.equal(await p.locator('.battle-fx').count(),0);assert.equal(await p.locator('[data-battle-effects]').count(),1);
  await p.locator('[data-battle-effects]').selectOption('off');assert.equal(await p.evaluate(()=>EmberwildBattleEffects.preference),'off');assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-battle-effects')),'off');await p.evaluate(()=>{setTab('battle');fxCapture(()=>resolveHit(foes[0],50,state,'fire',false));});assert.equal(await p.locator('.battle-fx').count(),0);
  await p.reload();assert.equal(await p.evaluate(()=>EmberwildBattleEffects.preference),'off');assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('desktop/mobile animation frames preserve icon boxes and readable HP; capture visual QA frames',async()=>{
 const g=await setup(),p=g.page;try{
  for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
   await p.setViewportSize(size);await p.evaluate(()=>render());const before=await p.locator('#battleEnemyIcons .unit [data-enemy-id]').evaluateAll(ns=>ns.map(n=>({w:n.offsetWidth,h:n.offsetHeight})));
   await p.evaluate(()=>{recordAction(heroKey(state),characterName(state),'技能');fxCapture(()=>foes.forEach(e=>resolveHit(e,50,state,'fire',false)));});await p.clock.runFor(100);
   assert.deepEqual(await p.locator('#battleEnemyIcons .unit [data-enemy-id]').evaluateAll(ns=>ns.map(n=>({w:n.offsetWidth,h:n.offsetHeight}))),before);
   assert.equal(await p.locator('#battleEnemyIcons .is-elite').count(),1);assert.equal(await p.locator('#battleAllyIcons .is-acting').count(),1);
   assert(await p.locator('#battleEnemyIcons').isVisible());
   // v0.087: on phones the battle summary (with its HP bar) is read in the 戰況 dialog.
   if(size.width<=900)await p.evaluate(()=>toggleMobileReport(true));assert(await p.locator('[data-summary-hp]').isVisible());if(size.width<=900)await p.evaluate(()=>toggleMobileReport(false));
   await p.locator('#battleEnemyIcons').screenshot({path:'/tmp/emberwild-fx-icons-'+size.width+'.png'});await p.screenshot({path:'/tmp/emberwild-fx-'+size.width+'.png'});await p.clock.runFor(1600);
  }
  await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>{for(const h of heroes())h.hp=1;fxCapture(()=>{EmberwildBattleEffects.scope({mode:'skill'},()=>heroes()[1].hp+=10);applyPureShield(heroes()[0],300);});});await p.clock.runFor(100);await p.screenshot({path:'/tmp/emberwild-fx-recovery.png'});assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('each resolved effect is mirrored once on the matching HP block, including same-name AoE and special outcomes',async()=>{
 const g=await setup(),p=g.page;try{
  async function check(code,expected,target='fx-1'){
   await p.clock.runFor(1600);
   await p.evaluate(code=>{fxCapture(()=>{(0,eval)(code);});},code);
   await p.clock.runFor(200);
   const both=await p.evaluate(()=>{
    const collect=(selector,key)=>Object.fromEntries([...document.querySelectorAll(selector)].map(n=>[n.dataset[key],[...n.querySelectorAll(':scope > .battle-fx')].map(e=>e.dataset.fx).sort()]));
    return {icons:{...collect('#battleAllyIcons .unit [data-hero-id]','heroId'),...collect('#battleEnemyIcons .unit [data-enemy-id]','enemyId')},health:collect('.squad-field .unit[data-combat-id]','combatId')};
   });
   await assertSemanticColors(p);
   assert.deepEqual(both.health,both.icons,code);
   for(const type of expected)assert(both.health[target].includes(type),type+' on '+target);
   for(const [key,types] of Object.entries(both.health))assert.equal(new Set(types).size,types.length,'no duplicate effect on '+key);
   return both;
  }
  const hero=await p.evaluate(()=>heroKey(state));
  for(const element of ['physical','fire','ice','wind','light','shadow'])await check(`resolveHit(foes[1],50,state,'${element}',false)`,[element==='physical'?'slash':element,'hit']);
  await check(`EmberwildBattleEffects.scope({ranged:true},()=>resolveHit(foes[1],50,state,'physical',false))`,['ranged','hit']);
  await check(`EmberwildBattleEffects.scope({mode:'damage',element:null},()=>foes[1].hp-=1)`,['impact','hit']);
  const aoe=await check(`foes.forEach(e=>resolveHit(e,50,state,'fire',false))`,['fire','hit']);for(const key of ['fx-0','fx-1','fx-2'])assert(aoe.health[key].includes('fire'));
  await check(`applyPureShield(state,10000)`,['shield'],hero);
  await p.evaluate(()=>heroes().forEach(h=>h.shield=10000));const blocked=await check(`castEnemySharedSkill(foes[0],{name:'測試魔法',effect:'damage',element:'fire',activation:'active',power:1,maxTargets:1,meta:{}})`,[],hero);
  assert(Object.values(blocked.health).some(types=>types.includes('absorb')));assert(!Object.values(blocked.health).some(types=>types.includes('hit')));
  await p.evaluate(()=>{foes[1].shield=1;});await check(`resolveHit(foes[1],50,state,'fire',false)`,['absorb','break','fire','hit']);
  await p.evaluate(()=>{state.shield=500;});await check(`EmberwildBattleEffects.scope({mode:'skill'},()=>state.shield=0)`,['dissolve'],hero);
  await p.evaluate(()=>state.hp=1);
  await check(`EmberwildBattleEffects.scope({mode:'skill'},()=>state.hp+=2)`,['heal'],hero);
  await check(`EmberwildBattleEffects.scope({mode:'regen'},()=>state.hp+=2)`,['regen'],hero);
  await check(`EmberwildBattleEffects.scope({mode:'damage'},()=>state.hp+=2)`,['drain'],hero);
  await p.evaluate(()=>{state.hp=1;state.healingPotions.heal_small=3;state.healPotionCooldownRemaining=0;});await check(`useAutoHealingPotion(state)`,['potion'],hero);
  await check(`__EMBERWILD_STATUS_TEST_API.apply({id:'hpfx-buff',name:'強化',tags:['modifier'],polarity:'buff',duration:3,modifiers:[{kind:'guard',value:.1}]},state,state)`,['buff'],hero);
  await check(`__EMBERWILD_STATUS_TEST_API.apply({id:'hpfx-debuff',name:'弱化',tags:['modifier'],polarity:'debuff',duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'weaken',value:.1}]},state,foes[1])`,['debuff']);
  await p.evaluate(()=>foes[1].kind='boss');const resisted=await check(`__EMBERWILD_CONTROL_TEST_API.applyPolymorph(foes[1],500,{duration:3})`,['resist']);assert(!resisted.health['fx-1'].includes('debuff'));
  await p.evaluate(()=>{const base=enemyBattleStats;enemyBattleStats=e=>({...base(e),evasion:1});});const dodged=await check(`resolveHit(foes[1],50,state,'fire',false)`,['evade']);assert(!dodged.health['fx-1'].includes('hit'));
  await p.evaluate(()=>stopTeamExploration());assert.equal(await p.locator('.battle-fx').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.activeCount),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('HP block effects preserve layout and readable bars at desktop/mobile widths, and expire across redraw/encounter changes',async()=>{
 const g=await setup(),p=g.page;try{
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:900});await p.evaluate(()=>render());
   const rects=()=>p.locator('.squad-field .unit[data-combat-id]').evaluateAll(ns=>ns.map(n=>({w:n.offsetWidth,h:n.offsetHeight})));
   const before=await rects();await p.evaluate(()=>fxCapture(()=>resolveHit(foes[1],50,state,'fire',false)));assert.deepEqual(await rects(),before);
   const card=p.locator('.squad-field .unit[data-combat-id="fx-1"]');await card.scrollIntoViewIfNeeded();await p.clock.runFor(100);
   const box=await card.locator('.battle-fx-health[data-fx="fire"]').boundingBox(),cardBox=await card.boundingBox();assert(box.width>=cardBox.width-6&&box.height>=Math.min(70,cardBox.height-2),'effect spans HP information area: '+JSON.stringify({width,box,cardBox}));
   const glyph=await card.locator('.battle-fx-health[data-fx="fire"]>svg').boundingBox();assert(glyph.y+glyph.height<=box.y+box.height+1,'effect glyph fits short HP blocks');
   const bar=card.locator('.battle-health-bar');assert(await bar.isVisible());assert.equal(await bar.evaluate(n=>getComputedStyle(n).zIndex),'2');
   await card.screenshot({path:'/tmp/emberwild-hpfx-'+width+'.png'});await p.clock.runFor(1600);assert.equal(await card.locator('.battle-fx').count(),0);
  }
  await p.evaluate(()=>{fxCapture(()=>resolveHit(foes[1],5,state,'fire',false));globalThis.firstRepeat=document.querySelector('#battleEnemyIcons .battle-enemy-icon>[data-fx="fire"]');fxCapture(()=>resolveHit(foes[1],5,state,'fire',false));});
  assert(await p.evaluate(()=>firstRepeat.isConnected),'a repeated impact keeps the preceding occurrence alive');assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon>[data-fx="fire"]').count(),2);await p.clock.runFor(1600);
  await p.evaluate(()=>{fxCapture(()=>resolveHit(foes[0],50,state,'ice',false));render();EmberwildBattleSummary.sync();});await p.clock.runFor(1600);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.activeCount),0);
  await p.evaluate(()=>{fxCapture(()=>resolveHit(foes[0],50,state,'fire',false));spawnGroup();render();});assert.equal(await p.locator('.battle-fx').count(),0);
  await p.evaluate(()=>{setBattleEffects('off');fxCapture(()=>resolveHit(foes[0],50,state,'fire',false));});assert.equal(await p.locator('.battle-fx').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('mage blasts retain cast and lethal HP stages across twenty encounters with per-encounter cooldowns',async t=>{
 const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-27T02:00:00Z')}),p=g.page;
 try{
  await p.evaluate(()=>{
   globalThis.blastSeed=8723;Math.random=()=>{blastSeed=(Math.imul(blastSeed,1664525)+1013904223)>>>0;return blastSeed/4294967296;};selectSaveSlot(1);start(1);closeModal();
   globalThis.blastAudit={casts:[],impacts:[],battles:0};
   const cast=castPartySkill;castPartySkill=function(h,i,...args){const before=foes.filter(e=>e.hp>0).map(e=>({id:e.id,hp:e.hp})),out=cast(h,i,...args);if(h.job===1&&CLASSES[h.job]?.skills?.[i]?.[0]==='魔爆'&&out!==false)blastAudit.casts.push({at:performance.now(),targets:before.filter(b=>foes.find(e=>e.id===b.id)?.hp<b.hp).map(b=>b.id),attempted:before.length,dead:foes.filter(e=>e.hp<=0).map(e=>e.id)});return out;};
   const finish=EmberwildBattleSummary.finish;EmberwildBattleSummary.finish=function(result){if(result==='victory')blastAudit.battles++;return finish(result);};
   new MutationObserver(rows=>{for(const row of rows)for(const n of row.addedNodes)if(n.nodeType===1&&n.matches('.battle-fx'))blastAudit.impacts.push({at:performance.now(),type:n.dataset.fx,event:n.dataset.event,unit:n.parentNode.dataset.combatId||n.parentNode.dataset.heroId||n.parentNode.dataset.enemyId,surface:n.classList.contains('battle-fx-health')?'hp':'icon'});}).observe($('app'),{subtree:true,childList:true});
   state.lv=8;state.shield=1e9;state.mana={regenPerSecond:100};syncParty();party.huntingMode='group';startSelectedExploration();
  });
  // v0.074: each encounter waits for the blast's initial cooldown, so group fights last longer; allow more battle time.
  for(let n=0;n<20000;n++){
   await p.clock.runFor(100);
   const count=await p.evaluate(()=>blastAudit.casts.length);
   if(count>=20&&await p.evaluate(()=>blastAudit.battles>=20)){await p.clock.runFor(300);break;}
  }
  const audit=await p.evaluate(()=>blastAudit);assert(audit.casts.length>=20);assert(audit.battles>=20);assert(audit.casts.some(c=>c.dead.length));assert(audit.casts.some(c=>c.targets.length>1));
  for(const cast of audit.casts.slice(0,20))for(const id of cast.targets){
   for(const surface of ['hp','icon'])assert(audit.impacts.some(x=>x.unit===id&&x.type==='hit'&&x.surface===surface&&x.at>=cast.at&&x.at<=cast.at+400),JSON.stringify({cast,id,surface}));
  }
  const eventMap=new Map();for(const x of audit.impacts){const key=[x.event,x.unit,x.type,x.surface].join('|');assert(!eventMap.has(key),'duplicate effect '+key);eventMap.set(key,x);}
  t.diagnostic(JSON.stringify({casts:audit.casts.length,battles:audit.battles,lethal:audit.casts.filter(c=>c.dead.length).length,impacts:audit.impacts.length}));
  assert.deepEqual(g.errors,[]);await p.evaluate(()=>stopTeamExploration());assert.equal(await p.locator('.battle-fx').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.activeCount),0);
 }finally{await g.browser.close();}
});

test('mage cast precedes lethal multi-target impacts; redraw keeps effects and pre-impact HP never changes simulation results',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>{foes.forEach(e=>e.hp=1);recordAction(heroKey(state),characterName(state),'技能');globalThis.beforeBlast=foes.map(e=>e.hp);fxCapture(()=>castPartySkill(state,state.active[0],battleStats(state)));globalThis.afterBlast=foes.map(e=>e.hp);});
  assert.equal(await p.locator('#battleAllyIcons .battle-enemy-icon [data-skill="魔爆"]').count(),1);
  assert.deepEqual(await p.evaluate(()=>afterBlast),[0,0,0]);assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon [data-fx="hit"]').count(),0);
  assert((await p.locator('#battleEnemyIcons .unit-numbers>span:first-child b').allTextContents()).every(s=>s.startsWith('1 /')));
  await p.clock.runFor(210);
  for(const type of ['hit','fire'])for(const id of ['fx-0','fx-1','fx-2']){
   const card=p.locator('.unit[data-combat-id="'+id+'"]');assert.equal(await card.locator(':scope>.battle-fx[data-fx="'+type+'"]').count(),1);assert.equal(await card.locator('.battle-enemy-icon>[data-fx="'+type+'"]').count(),1);
  }
  assert((await p.locator('#battleEnemyIcons .unit-numbers>span:first-child b').allTextContents()).every(s=>s.startsWith('0 /')));
  await p.evaluate(()=>{globalThis.savedBlastNode=document.querySelector('#battleEnemyIcons .battle-enemy-icon>[data-fx="fire"]');render();});assert(await p.evaluate(()=>savedBlastNode.isConnected));
  await p.clock.runFor(1600);assert.equal(await p.locator('.battle-fx').count(),0);assert.deepEqual(await p.evaluate(()=>foes.map(e=>e.hp)),[0,0,0]);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('integrated portrait, readable HP and click targets fit phones; physical/magic and status motions are distinct',async()=>{
 const g=await setup(),p=g.page;try{
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:844});await p.evaluate(()=>render());
   const layout=await p.locator('.squad-field .unit[data-combat-id]').evaluateAll(ns=>ns.map(n=>{const icon=n.querySelector('.battle-enemy-icon').getBoundingClientRect(),bar=n.querySelector('.battle-health-bar').getBoundingClientRect(),r=n.getBoundingClientRect();return {ally:!!n.closest('.squad-allies'),icon:{x:icon.x,right:icon.right,bottom:icon.bottom,w:icon.width,h:icon.height},bar:{x:bar.x,y:bar.y,right:bar.right,w:bar.width},right:r.right,viewport:innerWidth,scroll:n.scrollWidth,width:n.clientWidth};}));
   for(const l of layout){assert(l.icon.w>=38&&l.icon.h>=44);assert(l.bar.w>=Math.min(48,width/6));assert(l.icon.bottom<=l.bar.y);assert(l.right<=l.viewport+1);assert(l.scroll<=l.width+2,JSON.stringify(l));}
   await p.locator('#battleAllyIcons .battle-enemy-icon').first().click();assert(await p.locator('#modal.battle-unit-dialog').isVisible());await p.locator('#modal button').last().click();
  }
  await p.evaluate(()=>fxCapture(()=>{resolveHit(foes[0],5,state,'physical',true);resolveHit(foes[1],5,state,'ice',false);__EMBERWILD_STATUS_TEST_API.apply({id:'shape-debuff',name:'弱化',polarity:'debuff',duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'weaken',value:.1}]},state,foes[1]);}));
  const animations=await p.locator('#battleEnemyIcons .battle-enemy-icon .battle-fx>svg').evaluateAll(ns=>Object.fromEntries(ns.map(n=>[n.parentNode.dataset.fx,getComputedStyle(n).animationName])));
  assert.notEqual(animations.slash,animations.ice);assert.notEqual(animations.debuff,animations.ice);
  assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon [data-critical="true"]').count(),2);
  await p.clock.runFor(1600);await p.evaluate(()=>{const api=__EMBERWILD_STATUS_TEST_API;api.apply({id:'shape-dot',name:'灼燒',tags:['periodic'],duration:1,timing:{durationSeconds:3,periodicIntervalSeconds:1,triggerIntervalSeconds:1},periodic:[{kind:'damage',basis:'fixed',coefficient:5,resolution:'true',element:'physical'}]},state,foes[1]);const inst=api.active.find(s=>s.statusId==='shape-dot');fxCapture(()=>EmberwildStatusCombatState.seconds.periodic(inst,inst.definition.periodic[0]));});assert(await p.locator('#battleEnemyIcons .battle-enemy-icon [data-fx="dot"]').count()>0);
  await p.clock.runFor(1600);await p.evaluate(()=>{fxCapture(()=>resolveHit(foes[1],5,state,'fire',false));Object.defineProperty(document,'hidden',{configurable:true,value:true});dispatchEvent(new Event('visibilitychange'));});assert.equal(await p.locator('.battle-fx').count(),0);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});dispatchEvent(new Event('visibilitychange'));});await p.clock.runFor(1600);assert.equal(await p.locator('.battle-fx').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('ongoing shield, buff, debuff and polymorph layers persist together until their actual state is removed',async()=>{
 const g=await setup(),p=g.page;try{
  // The seconds timeline follows the shared real-time ledger. Pause combat so
  // states expire only when this test advances partyClock explicitly.
  await p.evaluate(()=>{running=false;render();});
  await p.evaluate(()=>fxCapture(()=>{
   applyPureShield(foes[1],300);
   __EMBERWILD_CONTROL_TEST_API.applyPolymorph(foes[1],500,{duration:3});
   __EMBERWILD_STATUS_TEST_API.apply({id:'lasting-buff',name:'持續強化',polarity:'buff',duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'attack',value:.1}]},state,foes[1]);
   __EMBERWILD_STATUS_TEST_API.apply({id:'lasting-debuff',name:'持續弱化',polarity:'debuff',duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'weaken',value:.1}]},state,foes[1]);
   resolveHit(foes[0],5,state,'fire',false);
  }));
  const card=p.locator('.unit[data-combat-id="fx-1"]'),icon=card.locator('.battle-enemy-icon');
  const check=async expected=>{for(const node of [card,icon])assert.deepEqual(await node.locator(':scope>.battle-fx-status>[data-fx-persistent]').evaluateAll(ns=>ns.map(n=>n.dataset.fxPersistent).sort()),expected.slice().sort());};
  await check(['shield','buff','debuff','polymorph']);
  await assertSemanticColors(p);
  const layers=await card.locator(':scope>.battle-fx-status>[data-fx-persistent]').evaluateAll(ns=>Object.fromEntries(ns.map(n=>[n.dataset.fxPersistent,{layer:n.dataset.fxLayer,z:Number(getComputedStyle(n).zIndex),w:n.getBoundingClientRect().width}])));
  assert.equal(layers.shield.layer,'protection');assert.equal(layers.polymorph.layer,'control');assert(layers.shield.z<layers.polymorph.z);assert(layers.shield.w>layers.polymorph.w);
  await p.evaluate(()=>globalThis.lastingNode=document.querySelector('.unit[data-combat-id="fx-1"]>.battle-fx-status'));
  await p.clock.runFor(5000);assert.equal(await p.locator('.battle-fx').count(),0,'instant damage and application bursts finish');await check(['shield','buff','debuff','polymorph']);
  // Redraw retention is checked while exploring; nobody acts and the test clock does not advance here.
  await p.evaluate(()=>{EmberwildSecondsCombat.timeline.handlers.canAct=()=>false;running=true;});
  for(const width of [1440,390,320]){await p.setViewportSize({width,height:844});await p.evaluate(()=>render());await check(['shield','buff','debuff','polymorph']);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===1440)await card.screenshot({path:'/tmp/ember-persistent-layers.png'});}
  await p.evaluate(()=>{globalThis.shieldLayer=document.querySelector('.unit[data-combat-id="fx-1"]>.battle-fx-status>[data-fx-persistent="shield"]');__EMBERWILD_STATUS_TEST_API.remove(foes[1],'buff');EmberwildBattleSummary.sync();});await check(['shield','debuff','polymorph']);assert(await p.evaluate(()=>shieldLayer.isConnected),'dispelling one layer preserves the others');
  await p.evaluate(()=>{__EMBERWILD_STATUS_TEST_API.apply({id:'lasting-buff',name:'持續強化',polarity:'buff',duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:6,triggerIntervalSeconds:3},modifiers:[{kind:'attack',value:.1}]},state,foes[1]);EmberwildBattleSummary.sync();});await check(['shield','buff','debuff','polymorph']);
  await p.evaluate(()=>render());assert(await p.evaluate(()=>lastingNode.isConnected));await check(['shield','buff','debuff','polymorph']);
  await p.evaluate(()=>{running=false;});
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>EmberwildBattleSummary.sync());
  assert.equal(await icon.locator('[data-fx-persistent="polymorph"]').evaluate(n=>getComputedStyle(n).animationName),'none');await p.clock.runFor(3000);await check(['shield','buff','debuff','polymorph']);
  await p.evaluate(()=>{__EMBERWILD_CONTROL_TEST_API.clear(foes[1],'polymorph');EmberwildBattleSummary.sync();});await check(['shield','buff','debuff']);
  await p.evaluate(()=>{foes[1].shield=0;EmberwildBattleSummary.sync();});await check(['buff','debuff']);
  await p.evaluate(()=>{partyClock+=4;__EMBERWILD_STATUS_TEST_API.tick();EmberwildBattleSummary.sync();});await check([]);
  await p.evaluate(()=>{applyPureShield(foes[1],100);EmberwildBattleSummary.sync();});await check(['shield']);
  await p.evaluate(()=>{foes[1].hp=0;EmberwildBattleSummary.sync();});await check([]);
  await p.evaluate(()=>{running=false;foes[1].hp=100;EmberwildBattleSummary.sync();setTab('options');});assert.equal(await p.locator('.battle-fx-status').count(),0);
  await p.evaluate(()=>{closeModal();setTab('battle');});await check(['shield']);await p.evaluate(()=>setBattleEffects('off'));assert.equal(await p.locator('.battle-fx-status').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('an overlapping instant action cannot discard the prior resolved cast impact',async()=>{const g=await setup(),p=g.page;try{await p.evaluate(()=>{globalThis.overlap=[];new MutationObserver(rows=>{for(const r of rows)for(const n of r.addedNodes)if(n.nodeType===1&&n.matches('.battle-fx-health[data-fx="hit"]'))overlap.push(n.parentNode.dataset.combatId);}).observe($('app'),{childList:true,subtree:true});fxCapture(()=>castPartySkill(state,state.active[0],battleStats(state)));});await p.clock.runFor(50);await p.evaluate(()=>{heroes()[1].hp=1;fxCapture(()=>EmberwildBattleEffects.scope({mode:'regen'},()=>heroes()[1].hp+=5));});await p.clock.runFor(250);const hits=await p.evaluate(()=>overlap);for(const id of ['fx-0','fx-1','fx-2'])assert(hits.includes(id),'resolved impact '+id+' survives the next action');assert.deepEqual(g.errors,[]);}finally{await g.browser.close();}});

test('resolved numbers keep each hit and its target, preserve last damage and redraw, then clear on a new encounter',async()=>{
 const g=await setup(),p=g.page;try{
  const expected=await p.evaluate(()=>{
   EmberwildBattleEffects.begin();const out=[];for(const e of foes)for(let i=0;i<3;i++)out.push({target:e.id,amount:resolveHit(e,30,state,'fire',i===1)});EmberwildBattleEffects.end();EmberwildBattleSummary.sync();return out;
  });
  const rows=await p.locator('.battle-number[data-kind=damage]').evaluateAll(ns=>ns.map(n=>({target:n.dataset.target,amount:Number(n.dataset.amount)})));
  assert.deepEqual(rows,expected);
  assert.equal(await p.locator('.battle-number[data-critical=true]').count(),3);
  const normal=p.locator('.battle-number[data-critical=false]').first(),critical=p.locator('.battle-number[data-critical=true]').first();
  assert(await critical.evaluate(n=>parseFloat(n.style.fontSize))>await normal.evaluate(n=>parseFloat(n.style.fontSize)));
  await p.evaluate(()=>{globalThis.retainedNumber=document.querySelector('.battle-number');render();});assert(await p.evaluate(()=>retainedNumber.isConnected));
  await p.clock.runFor(1100);assert.equal(await p.locator('.battle-number').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.numberCount),0);
  await p.evaluate(()=>fxCapture(()=>{for(let i=0;i<8;i++)resolveHit(foes[1],1,state,'physical',false);}));
  const slots=await p.locator('.battle-number[data-target="fx-1"]').evaluateAll(ns=>ns.map(n=>n.style.left+'|'+n.style.getPropertyValue('--number-lane')));assert.equal(slots.length,3);assert.equal(new Set(slots).size,3);await p.clock.runFor(1100);
  await p.evaluate(()=>{foes[1].hp=1;fxCapture(()=>resolveHit(foes[1],50,state,'physical',false));});assert.equal(await p.locator('.battle-number[data-target="fx-1"][data-amount="1"]').count(),1);
  await p.evaluate(()=>{spawnGroup();render();});assert.equal(await p.locator('.battle-number').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.numberCount),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('number colors, shield/HP split, DOT, capped healing, dodge and immunity follow actual resolution',async()=>{
 const g=await setup(),p=g.page;try{
  await p.evaluate(()=>{foes[1].shield=3;fxCapture(()=>resolveHit(foes[1],50,state,'ice',true));});
  assert.equal(await p.locator('.battle-number[data-kind=absorb][data-amount="3"]').count(),1);assert.equal(await p.locator('.battle-number[data-kind=damage]').count(),1);
  const color=async kind=>p.locator('.battle-number[data-kind="'+kind+'"]').first().evaluate(n=>getComputedStyle(n).color);
  assert.equal(await color('absorb'),'rgb(242, 245, 255)');assert.equal(await color('damage'),'rgb(255, 170, 160)');
  await p.clock.runFor(1100);await p.evaluate(()=>{state.hp=stats(state).hp-2;fxCapture(()=>EmberwildBattleEffects.scope({mode:'skill'},()=>state.hp=stats(state).hp));});
  assert.equal(await p.locator('.battle-number[data-kind=heal]').textContent(),'+2');assert.equal(await color('heal'),'rgb(135, 239, 173)');
  await p.clock.runFor(1100);await p.evaluate(()=>fxCapture(()=>{const api=__EMBERWILD_STATUS_TEST_API;api.apply({id:'number-dot',name:'灼燒',tags:['periodic'],duration:3,timing:{durationSeconds:3,periodicIntervalSeconds:1,triggerIntervalSeconds:1},periodic:[{kind:'damage',basis:'fixed',coefficient:5,resolution:'true',element:'physical'}]},state,foes[1]);const inst=api.active.find(s=>s.statusId==='number-dot');for(let i=0;i<3;i++)EmberwildStatusCombatState.seconds.periodic(inst,inst.definition.periodic[0]);}));
  assert.equal(await p.locator('.battle-number[data-kind=dot][data-amount="5"]').count(),3);assert.equal(await color('dot'),'rgb(255, 121, 111)');
  await p.clock.runFor(1100);await p.evaluate(()=>{const base=enemyBattleStats;enemyBattleStats=e=>({...base(e),evasion:1});fxCapture(()=>resolveHit(foes[1],50,state,'fire',true));});
  assert.equal(await p.locator('.battle-number').textContent(),'閃避');assert.equal(await p.locator('.battle-number[data-kind=damage]').count(),0);
  await p.clock.runFor(1100);await p.evaluate(()=>{foes[1].kind='boss';fxCapture(()=>__EMBERWILD_CONTROL_TEST_API.applyPolymorph(foes[1],500,{duration:3}));});
  assert.equal(await p.locator('.battle-number').textContent(),'免疫');assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('numbers stay bounded at high speed, readable within phone cards, obey modes and leave details clickable',async()=>{
 const g=await setup(),p=g.page;try{
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:844});await p.evaluate(()=>{render();setBattleEffects('full');battleRate=1;fxCapture(()=>{for(const e of foes)for(let i=0;i<3;i++)resolveHit(e,20,state,'fire',i===1);sharedEnemySkillDamage(foes[0],state,5,'physical',{name:'測試',meta:{baseCritRate:0}});EmberwildBattleEffects.scope({mode:'skill'},()=>state.hp=Math.min(stats(state).hp,state.hp+2));});});
   await p.clock.runFor(320);require('node:fs').mkdirSync(path.join(root,'battle-feedback-review'),{recursive:true});await p.locator('.seconds-battlefield').screenshot({path:path.join(root,'battle-feedback-review',width+'.png')});
   const layout=await p.locator('.battle-number').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect(),card=n.closest('.unit').getBoundingClientRect(),s=getComputedStyle(n);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},font:parseFloat(s.fontSize),pointer:s.pointerEvents};}));
   for(const n of layout){assert(n.left>=n.card.left-1&&n.right<=n.card.right+1,JSON.stringify(n));assert(n.top>=n.card.top-1&&n.bottom<=n.card.bottom+1);assert(n.font>=11);assert.equal(n.pointer,'none');}
   await p.locator('#battleEnemyIcons .battle-enemy-icon').first().click();assert(await p.locator('#modal.battle-unit-dialog').isVisible());assert.equal(await p.locator('.battle-number').count(),0);await p.locator('#modal button').last().click();
   await p.evaluate(()=>{battleRate=8;fxCapture(()=>{for(let i=0;i<300;i++)resolveHit(foes[i%3],1,state,'fire',i%30===0);});});
   assert(await p.locator('.battle-number').count()<=32);assert(await p.locator('.battle-number[data-critical=true]').count()>0);
   assert((await p.locator('.battle-number').evaluateAll(ns=>ns.map(n=>n.dataset.detail))).every(x=>x==='simple'));
   await p.clock.runFor(800);assert.equal(await p.locator('.battle-number').count(),0);assert.equal(await p.evaluate(()=>EmberwildBattleEffects.numberCount),0);
  }
  await p.evaluate(()=>{battleRate=1;setBattleEffects('simple');fxCapture(()=>resolveHit(foes[1],20,state,'physical',false));});assert.equal(await p.locator('.battle-number').getAttribute('data-detail'),'simple');
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{setBattleEffects('full');fxCapture(()=>resolveHit(foes[1],20,state,'physical',false));});assert.equal(await p.locator('.battle-number').getAttribute('data-detail'),'simple');
  await p.evaluate(()=>{setBattleEffects('off');fxCapture(()=>resolveHit(foes[1],20,state,'physical',false));});assert.equal(await p.locator('.battle-number').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
