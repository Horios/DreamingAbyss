'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
test('new and legacy priests can acquire, equip, reload and cast holy prison through the skill picker',async()=>{
 const root=path.resolve(__dirname,'..'),legacy=require('./fixtures/legacy-skills-job3.json');
 for(const old of [false,true]){
  const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-30T02:00:00Z')}),p=r.page;
  try{
   // Seed once: openRuntime's storage init script runs again on every reload.
   if(old){await p.evaluate(raw=>localStorage.setItem('emberwild-save-v1',JSON.stringify(raw)),legacy);await p.reload();}
   await p.evaluate(async old=>{if(!old){selectSaveSlot(1);start(3);closeModal();}continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);stopTeamExploration();setTab('skills');},old);
   await p.locator('[data-skill-slot="active:0"]').click();
   const prison=p.locator('[data-skill-id="priest-holy-prison"]');
   assert(await prison.isVisible());
   if(!old){
    assert(await prison.getByRole('button').isDisabled());
    await p.getByRole('button',{name:'關閉',exact:true}).click();
    await p.evaluate(()=>{awardXP(need(1));awardXP(need(2));save();render();});
    await p.locator('[data-skill-slot="active:0"]').click();
   }
   assert.equal(await prison.getByRole('button').isDisabled(),false);
   await prison.getByRole('button',{name:'裝入技能',exact:true}).click();
   await p.clock.runFor(50);
   assert.equal(await p.evaluate(()=>playerHero().skillLoadout.active[0]),'priest-holy-prison',old?'legacy priest':'new priest');
   await p.reload();await p.evaluate(()=>clearInterval(timer));
   assert.equal(await p.evaluate(()=>playerHero().skillLoadout.active[0]),'priest-holy-prison');
   const result=await p.evaluate(()=>{resetEncounter();foes=Array.from({length:4},(_,i)=>({id:'priest-test-'+i,name:'同名敵人',kind:'normal',hp:1000,maxhp:1000,atk:1,def:0,lv:1,shield:0,element:'physical',race:'beast',turn:0}));enemy=foes[0];const cast=castPartySkill(playerHero(),__EMBERWILD_SKILLS.byId('priest-holy-prison').adapter.index,battleStats(playerHero()));return {cast,marks:__EMBERWILD_STATUS_TEST_API.active.length};});
   assert.deepEqual(result,{cast:true,marks:3});assert.deepEqual(r.errors,[]);
  }finally{await r.browser.close();}
 }
});
test('skill previews, catalog and passive switches work on desktop/mobile and persist encounter separation after reload',async()=>{
 const r=await openRuntime(path.resolve(__dirname,'..'),'index.html',{}, {clockTime:Date.parse('2026-10-30T02:00:00Z')}),p=r.page;
 p.on('dialog',async d=>d.accept());
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(2);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);setTab('skills');});
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:900});await p.locator('[data-skill-slot="active:0"]').click();
   const rain=p.locator('[data-skill-id="archer-arrow-rain"]');assert(await rain.isVisible());assert(await rain.getByRole('button').isDisabled());assert.match(await rain.innerText(),/LV3/);
   assert.equal(await p.locator('[data-skill-id="job2-core4"]').count(),0);assert(await p.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await p.getByRole('button',{name:'關閉',exact:true}).click();await p.getByRole('button',{name:'技能圖鑑',exact:true}).click();
   assert(await p.locator('[data-skill-id="job2-core4"]').isVisible());assert.equal(await p.locator('[data-skill-id^="partner"]').count(),0);assert.match(await p.locator('[data-skill-id="tutorial_echo"]').innerText(),/解鎖條件\s*裝備附帶/);
   assert(await p.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await p.getByRole('button',{name:'關閉',exact:true}).click();
  }
  await p.evaluate(()=>{awardXP(need(1)+need(2));save();render();});await p.locator('[data-skill-slot="active:0"]').click();
  await p.locator('[data-skill-id="archer-arrow-rain"]').getByRole('button',{name:'裝入技能',exact:true}).click();assert.equal(await p.evaluate(()=>state.skillLoadout.active[0]),'archer-arrow-rain');
  // Pointer release queues rendering on a timer; the test clock is paused.
  await p.clock.runFor(50);
  const status=await p.evaluate(()=>{const switched=changePlayerClass(0);const started=switched&&startSelectedExploration();running=false;setTab('skills');globalThis.battleBefore=EmberwildBattleConfiguration.pack();return {switched,started,job:state.job,level:state.lv,learned:__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('warrior-cleave-chain')),tab};});
  assert.equal(status.switched,true,JSON.stringify(status));assert.equal(status.job,0,JSON.stringify(status));assert.equal(status.learned,true,JSON.stringify(status));
  const passive=p.locator('[data-passive-id="warrior-cleave-chain"]');await passive.getByRole('switch').click();await p.clock.runFor(50);assert.equal(await passive.getByRole('switch').getAttribute('aria-checked'),'false');
  assert.equal(await p.evaluate(()=>state.passiveEnabled['warrior-cleave-chain']),false);assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>state.passiveEnabled['warrior-cleave-chain'])),true);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await p.reload();await p.evaluate(()=>clearInterval(timer));assert.equal(await p.evaluate(()=>state.passiveEnabled['warrior-cleave-chain']),false);assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>state.passiveEnabled['warrior-cleave-chain'])),true);
  await p.evaluate(()=>{spawnGroup();running=false;});assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>state.passiveEnabled['warrior-cleave-chain'])),false);assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('equipment skill source and skill slot remain clickable during an active encounter with another hero selected',async()=>{
 const r=await openRuntime(path.resolve(__dirname,'..'),'index.html',{}, {clockTime:Date.parse('2026-10-30T02:00:00Z')}),p=r.page;
 p.on('dialog',async d=>d.accept());
 try{
  await p.evaluate(async()=>{
   selectSaveSlot(1);start(1);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);
   playerHero().lv=25;playerHero().mastery.fire=100000;recruitCompanion(10);closeModal();
   const g=gear(3,0,0,1);g.id='encounter-skill-test';g.skillId='job1-core2';g.skillSockets={version:1,count:1,gems:[null],firstMode:'base'};
   addGear(g);equipSharedGear(g.id,memberKey(playerHero()),0);startSelectedExploration();selectHero(10);setTab('skills');
  });
  assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.pending()),true);
  const source=p.locator('[data-skill-equipment="encounter-skill-test"]');
  assert(await source.isVisible());assert.equal(await source.isDisabled(),false);
  await source.click();
  assert.equal(await p.evaluate(()=>playerHero().activeSkillEquipmentId),'encounter-skill-test');
  assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>playerHero().activeSkillEquipmentId)),null);
  const slot=p.locator('[data-skill-slot="proc:0"]');assert.equal(await slot.isDisabled(),false);await slot.click();
  await p.locator('[data-skill-id="job1-core2"]').getByRole('button',{name:'裝入技能',exact:true}).click();
  assert.equal(await p.evaluate(()=>playerHero().skillLoadout.proc[0]),'job1-core2');
  assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>playerHero().skillLoadout.proc[0])),null);
  await p.evaluate(()=>{spawnGroup();running=false;});
  assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>playerHero().activeSkillEquipmentId)),'encounter-skill-test');
  assert.equal(await p.evaluate(()=>EmberwildBattleConfiguration.combat(()=>playerHero().skillLoadout.proc[0])),'job1-core2');
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
