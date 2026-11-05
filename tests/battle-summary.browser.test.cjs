'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');const root=path.resolve(__dirname,'..');
async function setup(){
 const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-27T02:00:00Z')});
 await g.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);spawnGroup();running=true;const base=foes[0];foes=[{...base,id:'summary-a',name:'測試怪物',hp:25,maxhp:100},{...base,id:'summary-b',name:'測試怪物',hp:450,maxhp:900}];enemy=foes[0];beginBattleStatistics();render();});return g;
}
const state=p=>p.locator('[data-summary-state]').textContent();
const hp=p=>p.locator('[data-summary-hp]').textContent();
test('combat icons and aggregate HP update in place for damage, healing, revive, summon and phase replacement',async()=>{
 const g=await setup(),p=g.page;
 try{
  assert.equal(await hp(p),'475 / 1,000');assert.equal(await p.locator('[data-summary-percent]').textContent(),'47.5%');assert.equal(await p.locator('#battleEnemyIcons .battle-enemy-icon>.enemy-icon-art>svg').count(),2);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});foes[1].hp=449;EmberwildBattleSummary.sync();});assert.equal(await hp(p),'475 / 1,000');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});EmberwildBattleSummary.sync();});assert.equal(await hp(p),'474 / 1,000');
  await p.evaluate(()=>{foes[1].hp=450;EmberwildBattleSummary.sync();});
  await p.evaluate(()=>{globalThis.savedIcon=$('battleEnemyIcons').querySelector('.battle-enemy-icon');globalThis.savedArt=savedIcon.firstElementChild;globalThis.savedSummary=$('battleSummary');foes[0].hp=0;EmberwildBattleSummary.sync();});
  assert.equal(await hp(p),'450 / 1,000');assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="summary-a"].is-dead').count(),1);
  await p.evaluate(()=>{foes[1].hp=600;EmberwildBattleSummary.sync();});assert.equal(await hp(p),'600 / 1,000');assert.equal(await state(p),'敵方治療');assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="summary-b"]').getAttribute('data-effect'),'healed');
  await p.evaluate(()=>{foes[0].hp=40;EmberwildBattleSummary.sync();});assert.equal(await state(p),'敵方復活');assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="summary-a"].is-dead').count(),0);
  assert(await p.evaluate(()=>$('battleEnemyIcons').querySelector('.battle-enemy-icon')===savedIcon&&savedIcon.firstElementChild===savedArt));
  await p.evaluate(()=>{foes.push({...foes[0],id:'summary-c',hp:200,maxhp:200});EmberwildBattleSummary.sync();});assert.equal(await hp(p),'840 / 1,200');assert.equal(await state(p),'援軍加入');assert.equal(await p.locator('#battleEnemyIcons .unit [data-enemy-id]').count(),3);
  await p.evaluate(()=>{foes.splice(2,1);EmberwildBattleSummary.sync();render();});assert.equal(await hp(p),'640 / 1,000');assert.equal(await p.locator('#battleEnemyIcons .unit [data-enemy-id]').count(),2);assert(await p.evaluate(()=>$('battleEnemyIcons').querySelector('.battle-enemy-icon')===savedIcon&&$('battleSummary')===savedSummary));
  await p.evaluate(()=>{foes=[{...foes[0],id:'phase-2',hp:800,maxhp:1200,kind:'boss'}];enemy=foes[0];EmberwildBattleSummary.sync();});assert.equal(await hp(p),'800 / 1,200');assert.equal(await p.locator('#battleEnemyIcons .unit [data-enemy-id]').count(),1);assert.equal(await p.locator('#battleEnemyIcons [data-enemy-id="phase-2"].is-boss').count(),1);
  await p.evaluate(()=>{foes[0].shield=99999;foes[0].maxhp=1400;EmberwildBattleSummary.sync();});assert.equal(await hp(p),'800 / 1,400');
  await p.evaluate(()=>{EmberwildBattleSummary.finish('wipe');foes=[];enemy=null;running=false;render();});assert.equal(await state(p),'戰鬥失敗');assert.equal(await hp(p),'800 / 1,400');
  await p.evaluate(()=>{spawnGroup();foes.forEach(e=>e.hp=0);EmberwildBattleSummary.finish('victory');foes=[];render();});assert.equal(await state(p),'戰鬥勝利');assert.match(await hp(p),/^0 \/ /);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('shared summary stays visible while operating pages and collapsing desktop/mobile reports, without log scrolling or overflow',async()=>{
 const g=await setup(),p=g.page;
 try{
  await p.setViewportSize({width:1440,height:900});
  await p.evaluate(()=>{for(let i=0;i<65;i++)note('紀錄 '+i+' '+'.'.repeat(80),'playerDamage');globalThis.originalRows=$('liveLog').querySelectorAll('[data-event-type]').length;});
  for(const size of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
   await p.setViewportSize(size);await p.evaluate(()=>render());
   assert(await p.locator('#journalEnemyIcons .battle-enemy-icon').evaluateAll(nodes=>nodes.every(n=>{const box=n.getBoundingClientRect(),svg=n.querySelector('svg').getBoundingClientRect();return svg.left>=box.left&&svg.right<=box.right&&svg.top>=box.top&&svg.bottom<=box.bottom;})),'journal SVGs fit their compact icons');
   for(const tab of ['equipment','forge','skills','lifeSkills','gather','alchemy','story','battle']){
    await p.evaluate(id=>setTab(id),tab);if(size.width<=900&&tab==='battle')await p.locator('#battleSummary').scrollIntoViewIfNeeded();assert(await p.locator('#battleSummary').isVisible(),tab+' summary');
    await p.evaluate(()=>{foes[1].hp=Math.max(1,foes[1].hp-1);EmberwildBattleSummary.sync();});
    assert.equal(await p.locator('#battleSummary').count(),1);
    const layout=await p.evaluate(()=>{const s=$('battleSummary').getBoundingClientRect(),main=document.querySelector('.layout>main').getBoundingClientRect(),nav=document.querySelector('.layout>aside').getBoundingClientRect();return {right:s.right,bottom:s.bottom,top:s.top,mainHeight:main.height,navTop:nav.top,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert(layout.right<=size.width+1&&!layout.overflow,JSON.stringify({size,layout}));assert(layout.top>=0&&layout.bottom<=size.height,JSON.stringify({size,layout}));assert(layout.mainHeight>40,JSON.stringify({size,layout}));
    if(size.width<=900)assert(layout.bottom<=layout.navTop+1,'summary must not overlap mobile navigation');
   }
   if(size.width>900){await p.evaluate(()=>EmberwildBattleSummary.toggleDetails());assert(!await p.locator('#liveLog').isVisible());assert(await p.locator('#battleSummary').isVisible());await p.evaluate(()=>EmberwildBattleSummary.toggleDetails());}
   else{await p.evaluate(()=>toggleMobileJournal());assert(await p.locator('#liveLog').isVisible());assert(await p.locator('#battleSummary').isVisible());await p.evaluate(()=>toggleMobileJournal());assert(!await p.locator('#liveLog').isVisible());}
   assert.equal(await p.locator('#liveLog [data-event-type]').count(),await p.evaluate(()=>originalRows));
  }
  await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>{render();const stream=$('liveLog').querySelector('.battle-log-stream');stream.scrollTop=150;stream.dataset.autoScroll='0';globalThis.beforeTop=stream.scrollTop;for(let i=0;i<10;i++){foes[1].hp--;EmberwildBattleSummary.sync();}});
  assert(await p.evaluate(()=>$('liveLog').querySelector('.battle-log-stream').scrollTop===beforeTop));
  await p.evaluate(()=>{const input=document.createElement('input');input.id='summary-editing';document.querySelector('main').appendChild(input);input.focus();foes[1].hp=123;render();});assert.equal(await hp(p),'148 / 1,000');assert(await p.locator('#summary-editing').evaluate(e=>e===document.activeElement));await p.evaluate(()=>{$('summary-editing').blur();$('summary-editing').remove();});
  await p.evaluate(()=>{globalThis.iconBefore=$('battleEnemyIcons').querySelector('.battle-enemy-icon');for(let i=0;i<100;i++){foes[1].hp=10+i%20;EmberwildBattleSummary.sync();}save();loadParty(JSON.parse(localStorage.getItem(KEY)));render();});
  assert.equal(await p.locator('#battleEnemyIcons .unit [data-enemy-id]').count(),await p.evaluate(()=>EmberwildBattleSummary.snapshot().total));assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('offline replay skips icon rendering and settles to the effective encounter, then live 2x updates continue across pages',async()=>{
 const g=await setup(),p=g.page;
 try{
  await p.evaluate(()=>{resetEncounter();refillParty();running=false;party.huntingMode='group';startSelectedExploration();globalThis.iconMutations=0;new MutationObserver(rows=>{iconMutations+=rows.filter(r=>r.target.closest?.('#battleEnemyIcons .battle-enemy-icon')).length}).observe($('app'),{childList:true,subtree:true});});
  await p.clock.fastForward(60000);
  await p.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);EmberwildBattleSummary.sync();});
  assert(await p.evaluate(()=>iconMutations<100),'offline simulation must not build icons for every encounter');
  assert(await p.evaluate(()=>{const s=EmberwildBattleSummary.snapshot();return $('battleSummary').querySelector('[role="progressbar"]').getAttribute('aria-valuenow')===String(s.percent)}));
  await p.evaluate(()=>{acknowledgeOfflineExploration();resetEncounter();running=false;party.huntingMode='group';startSelectedExploration();for(const h of heroes())h.shield=1e9;foes.forEach(e=>{e.hp=1e6;e.maxhp=1e6;e.atk=1});setTab('equipment');});
  assert.equal(await p.evaluate(()=>battleRate),1);
  // The warrior opens with a non-damaging taunt. A random six-enemy group
  // can still be resolving enemy actions at 12s; observe a real hit instead.
  for(let i=0;i<30;i++){
   await p.clock.runFor(1000);await p.evaluate(()=>tick());
   if(i>=11&&await p.evaluate(()=>foes.some(e=>e.hp<e.maxhp)))break;
  }
  await p.evaluate(async()=>{if(EmberwildOffline.busy)await EmberwildOffline.settle(undefined,false);EmberwildBattleSummary.sync();});
  // The latest event batch may hold only timers (status ticks, cooldown expiry) with no action; advance until an action batch.
  for(let i=0;i<30&&!await p.evaluate(()=>lastActionOrder.length>0);i++){await p.clock.runFor(100);await p.evaluate(()=>tick());}
  assert(await p.evaluate(()=>partyClock>0&&lastActionOrder.length>0));assert(await p.evaluate(()=>{const s=EmberwildBattleSummary.snapshot();return s.hp<s.max&&Number($('battleSummary').querySelector('[role="progressbar"]').getAttribute('aria-valuenow'))===s.percent}));
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('allied portraits sit above their own HP bars and the active actor marker follows both teams and journal icons',async()=>{
 const g=await setup(),p=g.page;
 try{
  assert.equal(await p.locator('#battleAllyIcons .unit [data-hero-id]').count(),await p.evaluate(()=>heroes().length));
  assert.equal(await p.locator('.squad-allies .unit-title .character-avatar-control').count(),0);
  assert(await p.evaluate(()=>{const icon=$('battleAllyIcons').querySelector('.battle-enemy-icon').getBoundingClientRect(),bar=document.querySelector('.squad-allies>.unit .battle-health-bar').getBoundingClientRect();return icon.bottom<=bar.top&&icon.left>=bar.left-1&&icon.right<=bar.right+1;}));
  assert.equal(await p.locator('#journalEnemyIcons .battle-enemy-icon>.enemy-icon-art>svg').count(),2);
  assert.equal(await p.locator('.battle-enemy-icon.is-acting').count(),0,'the first enemy is not highlighted before an action');
  await p.evaluate(()=>{recordAction(heroKey(heroes()[0]),characterName(heroes()[0]),'普攻');EmberwildBattleSummary.sync();});
  assert.equal(await p.locator('#battleAllyIcons .is-acting').count(),1);assert.equal(await p.locator('#battleEnemyIcons .is-acting,#journalEnemyIcons .is-acting').count(),0);
  await p.evaluate(()=>{recordAction(foes[1].id,foes[1].name,'攻擊');EmberwildBattleSummary.sync();globalThis.journalUnit=$('journalEnemyIcons').lastElementChild;globalThis.allyUnit=$('battleAllyIcons').querySelector('.battle-enemy-icon');});
  assert.equal(await p.locator('#battleAllyIcons .is-acting').count(),0);assert.equal(await p.locator('#battleEnemyIcons .is-acting').getAttribute('data-enemy-id'),'summary-b');assert.equal(await p.locator('#journalEnemyIcons .is-acting').getAttribute('data-enemy-id'),'summary-b');
  assert(await p.evaluate(()=>$('battleEnemyIcons').lastElementChild.querySelector('.enemy-icon-art').innerHTML===journalUnit.querySelector('.enemy-icon-art').innerHTML));
  await p.evaluate(()=>{foes[1].hp=0;EmberwildBattleSummary.sync();});assert.equal(await p.locator('#battleEnemyIcons .is-dead,#journalEnemyIcons .is-dead').count(),2);assert.equal(await p.locator('.battle-enemy-icon.is-acting').count(),0);
  assert(await p.locator('#journalEnemyIcons .is-dead .enemy-icon-art').evaluate(e=>getComputedStyle(e).filter.includes('grayscale(1)')));
  await p.evaluate(()=>{foes[1].hp=200;EmberwildBattleSummary.sync();setTab('equipment');foes[0].hp=0;EmberwildBattleSummary.sync();setTab('battle');});
  assert.equal(await p.locator('#journalEnemyIcons .is-dead').getAttribute('data-enemy-id'),'summary-a');assert(await p.evaluate(()=>$('journalEnemyIcons').lastElementChild===journalUnit&&$('battleAllyIcons').querySelector('.battle-enemy-icon')===allyUnit));
  await p.evaluate(()=>{heroes()[0].avatarId='phoenix';EmberwildBattleSummary.sync();});assert.equal(await p.locator('#battleAllyIcons [data-avatar-id="phoenix"]').count(),1);
  await p.locator('#battleAllyIcons .unit [data-hero-id]').first().click();assert(await p.locator('#modal.battle-unit-dialog').isVisible());assert.equal(await p.locator('#battleAllyIcons .character-avatar-control').count(),0);await p.evaluate(()=>closeModal());
  await p.evaluate(()=>{running=false;EmberwildBattleSummary.sync();});assert.equal(await p.locator('.battle-enemy-icon.is-acting').count(),0);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('different monster names have distinct artwork, elites have ornaments and duplicate suffixes match displayed names',async()=>{
 const g=await setup(),p=g.page;
 try{
  await p.evaluate(()=>{const base=foes[0];foes=[['wolf-a','霧狼','normal'],['slime','幽影','normal'],['wolf-b','霧狼','normal'],['elite-a','菁英・霧狼','elite'],['spirit','荒野幽靈','normal'],['elite-b','菁英・霧狼','elite']].map(([id,name,kind])=>({...base,id,name,kind,race:'spirit',hp:100,maxhp:100}));enemy=foes[0];beginBattleStatistics();render();});
  for(const id of ['battleEnemyIcons','journalEnemyIcons']){
   assert.deepEqual(await p.locator('#'+id+' .battle-enemy-icon small').allTextContents(),['1','','2','1','','2']);
   assert.deepEqual(await p.locator('#'+id+' [data-enemy-id]').evaluateAll(nodes=>nodes.map(n=>n.title.split(' · ')[0])),await p.evaluate(()=>foes.map(combatEnemyName)));
   const art=await p.locator('#'+id+' .enemy-icon-art').evaluateAll(nodes=>nodes.map(n=>n.innerHTML));assert.equal(art[0],art[2]);assert.equal(art[0],art[3]);assert.equal(art[3],art[5]);assert.equal(new Set([art[0],art[1],art[4]]).size,3);
   // Elites are distinguished by colour alone; the corner badge stays hidden so it never outgrows the icon.
   assert.equal(await p.locator('#'+id+' .is-elite').count(),2);assert.equal(await p.locator('#'+id+' .enemy-icon-elite:visible').count(),0);
   const tint=await p.locator('#'+id+' .battle-enemy-icon').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n.querySelector('.enemy-icon-art')).color,getComputedStyle(n).borderColor]));
   assert.notDeepEqual(tint[3],tint[0]);assert.deepEqual(tint[3],tint[5]);assert.deepEqual(tint[0],tint[2]);
  }
  await p.evaluate(()=>{globalThis.wolfNode=$('battleEnemyIcons').querySelector('.battle-enemy-icon');foes[0].hp=0;foes.push({...foes[0],id:'wolf-c',hp:100});EmberwildBattleSummary.sync();});
  assert.deepEqual(await p.locator('#battleEnemyIcons .battle-enemy-icon small').allTextContents(),['1','','2','1','','2','3']);assert(await p.evaluate(()=>$('battleEnemyIcons').querySelector('.battle-enemy-icon')===wolfNode));
  await p.evaluate(()=>{foes.splice(0,1);EmberwildBattleSummary.sync();});
  assert.deepEqual(await p.locator('#journalEnemyIcons>[data-enemy-id]').evaluateAll(nodes=>nodes.map(n=>n.title.split(' · ')[0])),await p.evaluate(()=>foes.map(combatEnemyName)));
  await p.evaluate(()=>{const base=foes[0];foes=Array.from({length:24},(_,i)=>({...base,id:'unique-'+i,name:'不同名怪物'+i,kind:'normal',race:'spirit'}));beginBattleStatistics();render();});
  const unique=await p.locator('#battleEnemyIcons .enemy-icon-art').evaluateAll(nodes=>nodes.map(n=>n.innerHTML));assert.equal(new Set(unique).size,24,'same-race enemies still receive different artwork');
  assert((await p.locator('#battleEnemyIcons .battle-enemy-icon small').allTextContents()).every(n=>n===''),'unique names have no numeric marker');
  assert.deepEqual(await p.locator('#journalEnemyIcons .enemy-icon-art').evaluateAll(nodes=>nodes.map(n=>n.innerHTML)),unique);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('an enemy without an id renders once with the summary key, and a lasting mismatch never recurses',async()=>{
 const g=await setup(),p=g.page;
 try{
  const out=await p.evaluate(()=>{
   setTab('battle');const e=makeEnemy(0,state,()=>.9);delete e.id;foes=[e];enemy=e;
   let renders=0;const base=render;render=function(...a){renders++;return base.apply(this,a);};
   try{render();}finally{render=base;}
   const drawn=[...document.querySelectorAll('.squad-field .squad-enemies > .unit[data-combat-id]')].map(n=>n.dataset.combatId);
   // Simulate a view that can never match the snapshot: at most one extra redraw, no stack overflow.
   const key=EmberwildBattleSummary.key;let mismatchRenders=0,error='';EmberwildBattleSummary.key=()=>'never-drawn';
   const counting=render;render=function(...a){mismatchRenders++;return counting.apply(this,a);};
   try{render();}catch(x){error=x.message;}finally{render=counting;EmberwildBattleSummary.key=key;}
   return {drawn,renders,mismatchRenders,error};
  });
  assert.equal(out.drawn.length,1);assert.match(out.drawn[0],/^visual-\d+$/);
  assert.equal(out.error,'');assert(out.renders<=2,'renders '+out.renders);assert(out.mismatchRenders<=2,'mismatch renders '+out.mismatchRenders);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('ally cards are tinted by class and the battle note explains card and portrait clicks',async()=>{
 const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-27T02:00:00Z')}),p=g.page;
 try{
  const out=await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);recruitCompanion(10);closeModal();recruitCompanion(14);closeModal();spawnGroup();running=true;setTab('battle');render();
   const cards=[...document.querySelectorAll('#battleAllyIcons>.unit.seconds-unit')];
   return {jobs:cards.map(n=>(n.className.match(/seconds-job-(\d)/)||[])[1]),bgs:cards.map(n=>getComputedStyle(n).backgroundImage),note:document.querySelector('.seconds-battlefield')?.textContent||''};});
  assert(out.jobs.length===3&&out.jobs.every(Boolean),JSON.stringify(out.jobs));
  assert.equal(new Set(out.bgs).size,new Set(out.jobs).size,'each class has its own tint');
  assert.match(out.note,/點擊敵我資訊卡可切換查看冷卻與生效狀態/);assert.match(out.note,/點擊頭像可查看詳細數據/);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('the battlefield buttons turn every card to the main, cooldown or status page at once',async()=>{
 const g=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-27T02:00:00Z')}),p=g.page;
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);recruitCompanion(10);closeModal();spawnGroup();running=true;setTab('battle');render();});
  const faces=()=>p.evaluate(()=>[...document.querySelectorAll('.seconds-stack[data-combat-id]')].map(n=>n.dataset.face));
  const pressed=()=>p.evaluate(()=>[...document.querySelectorAll('[data-seconds-face-all]')].map(b=>b.getAttribute('aria-pressed')));
  assert.deepEqual(await p.locator('.seconds-face-switch button').allInnerTexts(),['主要','冷卻','狀態']);
  assert((await faces()).length>=3);assert.deepEqual(await pressed(),['true','false','false']);
  await p.locator('[data-seconds-face-all="1"]').click();
  assert((await faces()).every(f=>f==='1'),'every card shows cooldowns');assert.deepEqual(await pressed(),['false','true','false']);
  await p.locator('[data-seconds-face-all="2"]').click();assert((await faces()).every(f=>f==='2'));
  // The choice survives a redraw and applies to enemies that appear later.
  await p.evaluate(()=>{foes.length=0;spawnGroup();render();});assert((await faces()).every(f=>f==='2'),'new enemies follow the chosen page');
  // Clicking one card still flips only that card; the bar then shows no single page.
  await p.locator('#battleEnemyIcons .seconds-stack').first().click();
  const mixed=await faces();assert.equal(mixed.filter(f=>f!=='2').length,1);await p.evaluate(()=>EmberwildSecondsUI.sync());assert.deepEqual(await pressed(),['false','false','false']);
  await p.locator('[data-seconds-face-all="0"]').click();assert((await faces()).every(f=>f==='0'));
  // v0.063 removed the hide-cooldown button, so the cooldown page is always available.
  assert.equal(await p.locator('[data-seconds-face-all="1"]').isDisabled(),false);assert.equal(typeof await p.evaluate(()=>EmberwildSecondsUI.toggleCooldowns),'undefined');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
