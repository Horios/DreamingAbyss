'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
test('backpack sort, modal filters and guided wear work on desktop and mobile; battle portraits inspect allies and individual enemies',async()=>{
 const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-27T02:00:00Z')}),p=r.page;
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(0);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);running=false;__EMBERWILD_STORY.sync();if(!completeStoryStage('skill_equipment_intro'))throw Error(JSON.stringify({quest:party.story.quests.skill_equipment_intro,toast:$('toast').textContent}));globalThis.charm=state.bag.find(g=>g.storyRewardKey==='initiation_charm');globalThis.filterGear=gear(1,1,0,0);filterGear.affix=[{type:4,rank:2,value:30,skill:0}];addGear(filterGear);setTab('equipment');selectInventoryGear(charm.id);});
  await p.clock.resume();
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:900});
   assert(await p.locator('.inventory-master-heading select[aria-label="裝備排序"]').isVisible());
   assert.equal(await p.locator('.gear-management-panel .gear-control-fold').count(),0);
   await p.getByRole('button',{name:'裝備篩選',exact:true}).click();
   const modal=p.locator('#modal');assert(await modal.isVisible());
   if(!await modal.locator('details').evaluate(el=>el.open))await modal.locator('summary').click();await modal.getByLabel('詞綴效果',{exact:true}).selectOption('4');
   // Changing the effect rebuilds this filter dialog; expand its new details.
   if(!await modal.locator('details').evaluate(el=>el.open))await modal.locator('summary').click();
   await modal.getByLabel('詞綴技能',{exact:true}).selectOption('0:0');
   assert.equal(await modal.getByLabel('屬性',{exact:true}).locator('option').filter({hasText:'核心技能'}).count(),0);
   assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await modal.getByRole('button',{name:'完成',exact:true}).click();
   await p.waitForFunction(()=>document.querySelectorAll('.gear-management-row').length===1);
   await p.getByRole('button',{name:'裝備篩選 · 已套用',exact:true}).click();await modal.getByRole('button',{name:'清除篩選',exact:true}).click();await modal.getByRole('button',{name:'完成',exact:true}).click();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.evaluate(()=>selectInventoryGear(charm.id));
   if(width===1440)await p.screenshot({path:'/tmp/emberwild-inventory-desktop.png'});
  }
  await p.locator('.inventory-detail-actions').getByRole('button',{name:'穿戴',exact:true}).click();
  assert.equal(await p.evaluate(()=>tab),'worn');await p.getByRole('button',{name:'穿戴流程說明'}).click();await p.locator('#modal').getByRole('heading',{name:'穿戴流程說明'}).waitFor({state:'visible'});assert.match(await p.locator('#modal').innerText(),/「鑲嵌」可管理寶石/);await p.locator('#modal').getByRole('button',{name:'關閉說明'}).click();
  assert.equal(await p.evaluate(()=>state.equipped.includes(charm.id)),false);
  await p.getByRole('button',{name:/穿戴至飾品/}).first().click();
  if(await p.locator('#modal').isVisible())await p.locator('#modal').getByRole('button',{name:'確認穿戴',exact:true}).click();
  assert.equal(await p.evaluate(()=>state.equipped.includes(charm.id)),true);
  await p.getByRole('button',{name:'啟用與配置「追擊」',exact:true}).click();
  await p.locator('[data-skill-equipment]').filter({hasText:'啟程護符'}).click();await p.locator('[data-skill-slot="proc:0"]').click();await p.locator('[data-skill-id="tutorial_echo"]').getByRole('button',{name:'裝入技能'}).click();
  assert.equal(await p.evaluate(()=>state.skillLoadout.proc.includes('tutorial_echo')),true);
  await p.evaluate(()=>{setTab('battle');spawnGroup();const base=foes[0];foes=[{...base,id:'inspect-one',name:'同名測試',hp:13,maxhp:80},{...base,id:'inspect-two',name:'同名測試',hp:0,maxhp:120}];enemy=foes[0];effects.push({target:'inspect-one',kind:'weaken',value:.2,until:partyClock+2,name:'測試衰弱'});render();});
  for(const width of [1440,390,320]){
   await p.setViewportSize({width,height:900});
   await p.locator('#battleAllyIcons .unit [data-hero-id]').first().click();assert(await p.locator('#modal.battle-unit-dialog').isVisible());assert.match(await p.locator('#modal').innerText(),/追擊/);await p.locator('#modal').getByRole('button',{name:'關閉',exact:true}).click();
   await p.locator('#battleEnemyIcons .unit [data-enemy-id="inspect-one"]').click();assert.match(await p.locator('#modal').innerText(),/生命 13 \/ 80/);assert.match(await p.locator('#modal').innerText(),/測試衰弱/);
   assert(await p.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   if(width===1440)await p.screenshot({path:'/tmp/emberwild-inspector-desktop.png'});
   await p.locator('#modal').getByRole('button',{name:'關閉',exact:true}).click();
   await p.locator('#battleEnemyIcons .unit [data-enemy-id="inspect-two"]').click();assert.match(await p.locator('#modal').innerText(),/生命 0 \/ 120/);assert(!/測試衰弱/.test(await p.locator('#modal').innerText()));await p.locator('#modal').getByRole('button',{name:'關閉',exact:true}).click();
  }
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
