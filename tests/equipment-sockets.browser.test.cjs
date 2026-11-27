const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('equipment sockets: horizontal icons, icon gem choices, stat gems and inventory indicators on desktop/mobile',async()=>{
 const r=await openRuntime(root),p=r.page;
 // Socket edits redraw the panel asynchronously; read the UI only after it reflects the edit.
 const eventually=async(read,expected,message)=>{for(let i=0;i<100&&await read()!==expected;i++)await p.waitForTimeout(50);assert.equal(await read(),expected,message);};
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
   Object.assign(g,{id:'socket-ui',skillId:'tutorial_echo',skillSockets:{version:1,count:3,gems:[null,null,null]}});
   state.bag.push(g);h.gems=Array(15).fill(0);h.gems[0]=h.gems[1]=h.gems[12]=3;equipSharedGear(g.id,memberKey(h),3);
   moveToWorkshop(g.id);setWorkshopAction('socket');
  });
  const editor=p.locator('[data-socket-equipment="socket-ui"]');
  assert.equal(await editor.locator('.equipment-socket-choices').count(),0);
  for(const width of [1280,390]){
   await p.setViewportSize({width,height:900});
   const boxes=await editor.locator('[data-equipment-socket]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,right:b.right};}));
   assert.equal(boxes.length,3,'workshop shows the three sockets of the placed gear');assert(boxes.every(b=>b.y===boxes[0].y));assert(boxes[2].x>boxes[1].x&&boxes[1].x>boxes[0].x);
   assert(boxes[2].right<=width,'socket row fits viewport');
   await editor.locator('[data-equipment-socket="0"]').click();
   await editor.locator('[data-equipment-gem]').first().waitFor({state:'visible'});
   assert.equal(await editor.locator('[data-equipment-gem] svg').count(),3);
   assert.equal(await editor.locator('[data-equipment-gem="14"]').count(),0);
   const withinViewport=await editor.evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1;});
   assert(withinViewport,'workshop socket editor fits viewport');
   assert.equal(await editor.locator('.equipment-socket-list select').count(),0);
   assert.equal(await editor.locator('select').count(),0);
   await editor.locator('[data-equipment-gem="0"]').click();
   await eventually(()=>editor.locator('[data-equipment-socket="0"] svg').count(),1);
   assert.equal(await p.evaluate(()=>playerHero().gems[0]),2);
   await editor.locator('[data-equipment-gem="1"]').click();
   assert.equal(await p.evaluate(()=>playerHero().gems[0]),3,'replacing refunds prior gem');
   assert.equal(await p.evaluate(()=>playerHero().gems[1]),2);
   await editor.locator('[data-equipment-socket="2"]').click();
   await editor.locator('[data-equipment-gem="12"]').click();
   await eventually(()=>editor.locator('[data-equipment-socket="2"] svg').count(),1);
   await editor.locator('.equipment-gem-remove').click();
   await editor.locator('[data-equipment-socket="0"]').click();
   await editor.locator('.equipment-gem-remove').click();
   assert.equal(await p.evaluate(()=>playerHero().gems[1]),3);
  }
  await p.evaluate(()=>{
   const g=findGear('socket-ui');socketEquipmentGem(g.id,1,0);
   // v0.211 grid bag: worn gear stays off the bag grid, so take it off to read its bag slot.
   const h=playerHero();h.equipped[h.equipped.indexOf(g.id)]=null;
   for(let n=0;n<3;n++){
    const item=gear(1,3,0,playerHero().job);
    Object.assign(item,{id:'socket-count-'+n,skillSockets:{version:1,count:n,gems:Array(n).fill(null)}});
    addGear(item);
   }
   setTab('equipment');setInventoryCategory('equipment');setGearInventoryFilter('worn','all');/* v0.184: worn gear is hidden by default */
  });
  for(const width of [1280,390]){
   await p.setViewportSize({width,height:900});
   // v0.211 grid bag: the bag slot carries the same socket badge.
   for(let n=0;n<3;n++)assert.equal(await p.locator('.bag-cell[data-bag-ref="g:socket-count-'+n+'"] .equipment-socket-badge svg').count(),n);
   const badge=p.locator('.bag-cell[data-bag-ref="g:socket-ui"] .equipment-socket-badge');
   assert.equal(await badge.locator('svg').count(),3);
   assert.match(await badge.getAttribute('aria-label'),/第 2 孔：赤焰石/);
   assert.equal(await badge.locator('circle').nth(0).getAttribute('fill'),'none');
   assert.equal(await badge.locator('circle').nth(1).getAttribute('fill'),await p.evaluate(()=>GEMS[0].color));
   assert(await badge.evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1));
  }
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
