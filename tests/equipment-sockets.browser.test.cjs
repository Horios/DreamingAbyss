const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('equipment sockets: horizontal icons, icon gem choices, modes and disabled skillless gear on desktop/mobile',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{
  // Starting a save can asynchronously settle offline rewards. Its receipt
  // is a real blocking dialog, so complete/acknowledge it before testing sockets.
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();});
  await p.waitForFunction(()=>globalThis.EmberwildOffline&&!EmberwildOffline.busy,{},{timeout:60000});
  assert.equal(await p.evaluate(()=>EmberwildOffline.failed),false,'offline settlement must complete successfully');
  const settlement=p.locator('#offline-settlement');
  const retry=settlement.locator('[onclick="retryOfflineExploration()"]');
  assert.equal(await retry.count(),0,'offline settlement must not fail before socket interactions');
  const receipt=settlement.locator('[onclick="acknowledgeOfflineExploration()"]');
  if(await receipt.count())await receipt.click();
  await settlement.waitFor({state:'hidden',timeout:30000});
  await p.evaluate(()=>{
   const h=playerHero(),g=gear(1,3,0,h.job);
   Object.assign(g,{id:'socket-ui',skillId:'tutorial_echo',skillSockets:{version:1,count:3,gems:[null,null,null],firstMode:'skill'}});
   state.bag.push(g);h.gems=Array(15).fill(0);h.gems[0]=h.gems[1]=h.gems[12]=3;equipSharedGear(g.id,memberKey(h),3);selectSkillEquipment(g.id);
   setTab('worn');toggleWornEquipmentSockets(g.id);
  });
  const editor=p.locator('[data-socket-equipment="socket-ui"]'),mode=editor.getByLabel('第一孔效果模式');
  assert.equal(await editor.locator('.equipment-socket-choices').count(),0);
  for(const width of [1280,390]){
   await p.setViewportSize({width,height:900});
   const boxes=await editor.locator('[data-equipment-socket]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,right:b.right};}));
   assert.equal(boxes.length,3,'worn gear should show its three sockets in the equipment panel');assert(boxes.every(b=>b.y===boxes[0].y));assert(boxes[2].x>boxes[1].x&&boxes[1].x>boxes[0].x);
   assert(boxes[2].right<=width,'socket row fits viewport');
   await editor.locator('[data-equipment-socket="0"]').click();
   await editor.locator('[data-equipment-gem]').first().waitFor({state:'visible'});
   assert.equal(await editor.locator('[data-equipment-gem] svg').count(),3);
   assert.equal(await editor.locator('[data-equipment-gem="14"]').count(),0);
   const withinViewport=await editor.evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1;});
   assert(withinViewport,'worn socket editor fits viewport');
   assert.equal(await editor.locator('.equipment-socket-list select').count(),0);
   assert(await mode.evaluate(el=>el.closest('.equipment-socket-mode').previousElementSibling.classList.contains('equipment-socket-list')));
   assert.equal(await mode.isDisabled(),false);
   await editor.locator('[data-equipment-socket="0"]').click();
   await mode.selectOption('skill');
   assert.equal(await editor.locator('[data-equipment-gem="1"]').isDisabled(),true,'proc skill rejects cooldown gem');
   await editor.locator('[data-equipment-gem="0"]').click();
   await editor.locator('[data-equipment-socket="0"] svg').first().waitFor({state:'attached',timeout:10000});
   assert.equal(await editor.locator('[data-equipment-socket="0"] svg').count(),1);
   assert.equal(await p.evaluate(()=>playerHero().gems[0]),2);
   await mode.selectOption('base');
   assert.equal(await editor.locator('[data-equipment-gem="1"]').isDisabled(),false);
   await editor.locator('[data-equipment-gem="1"]').click();
   assert.equal(await p.evaluate(()=>playerHero().gems[0]),3,'replacing refunds prior gem');
   assert.equal(await p.evaluate(()=>playerHero().gems[1]),2);
   await editor.locator('[data-equipment-socket="2"]').click();
   await editor.locator('[data-equipment-gem="12"]').click();
   await editor.locator('[data-equipment-socket="2"] svg').first().waitFor({state:'attached',timeout:10000});
   assert.equal(await editor.locator('[data-equipment-socket="2"] svg').count(),1);
   assert.equal(await p.evaluate(()=>__EMBERWILD_EQUIPMENT_SKILLS.mode(playerHero(),findGear('socket-ui'),2)),'base');
   await editor.locator('.equipment-gem-remove').click();
   await editor.locator('[data-equipment-socket="0"]').click();
   await editor.locator('.equipment-gem-remove').click();
   assert.equal(await p.evaluate(()=>playerHero().gems[1]),3);
  }
  await p.evaluate(()=>{selectSkillEquipment(null);});
  assert.equal(await mode.isDisabled(),true);
  assert.equal(await mode.inputValue(),'base');
  await p.evaluate(()=>{delete findGear('socket-ui').skillId;render();});
  assert.equal(await mode.isDisabled(),true);
  assert.equal(await mode.locator('option[value="skill"]').isDisabled(),true);
  assert.equal(await p.evaluate(()=>{playerHero().activeSkillEquipmentId='socket-ui';return setEquipmentGemMode('socket-ui','skill');}),false,'API rejects skillless equipment even with stale active ID');
  await p.evaluate(()=>{playerHero().activeSkillEquipmentId=null;const g=findGear('socket-ui');g.skillSockets={version:1,count:0,gems:[],firstMode:'skill'};render();});
  assert.equal(await editor.locator('[data-equipment-socket]').count(),0);
  assert.equal(await mode.count(),0);
  assert.match(await editor.textContent(),/沒有鑲嵌孔/);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
