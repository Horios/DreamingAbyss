// v0.173: the worn page rows show each item's sockets beside its name in place of the worn checkmark, and the first
// visit with socketed gear on plays a spotlight guide that opens the sockets, picks one and shows the gems.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const active=page=>page.evaluate(()=>{const a=__EMBERWILD_TUTORIAL.status().active;return a&&{id:a.id,step:a.stepId,target:a.target.state};});
const wait=async(page,step)=>{try{await page.waitForFunction(step=>{const a=__EMBERWILD_TUTORIAL.status().active;return a?.id==='socket_basics'&&a.stepId===step&&a.target.state==='found';},step,{timeout:20000});}catch(e){throw Error(`waiting for socket_basics:${step}, active ${JSON.stringify(await active(page))}`);}};

test('worn rows show sockets instead of a checkmark; the socket guide plays once with socketed gear on',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width:1280,height:860});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>{start(2);party.tutorials.auto=true;
   for(const m of __EMBERWILD_TUTORIAL.design.modules)if(m.id!=='socket_basics')party.tutorials.records[m.id]={triggered:true,completed:true,skipped:false,step:-1};
   closeModal();completeStoryStage('skill_equipment_intro');closeModal();setTab('battle');});
  // Without socketed gear on, the worn page plays nothing.
  await page.evaluate(()=>setTab('worn'));await page.waitForTimeout(400);assert.equal(await active(page),null);
  // Putting the quest charm on while on the worn page starts the guide at once.
  await page.evaluate(()=>{const h=playerHero(),g=h.bag.find(x=>x.storyRewardKey==='initiation_charm');h.gems[0]=2;previewEquip(g.id,memberKey(h),4);});
  await page.click('#modal [onclick^="confirmEquipComparison("]');
  // Rows: no checkmark, sockets beside the name for socketed gear.
  assert.equal(await page.locator('main .worn-slot-choice .item-slot-worn').count(),0,'no worn checkmark on the worn page');
  const charmRow=page.locator('main .worn-slot-choice',{hasText:'啟程護符'});
  assert.equal(await charmRow.locator('.worn-socket-badge svg').count(),2,'two sockets beside the charm');
  await wait(page,'badge');await page.click('#tutorial-card button:has-text("下一步")');
  await wait(page,'open');assert.equal(await page.locator('main [onclick^="toggleWornEquipmentSockets("]:not([disabled])').count(),1,'only gear with sockets offers 鑲嵌');await page.click('main [onclick^="toggleWornEquipmentSockets("]:not([disabled])');
  await wait(page,'slot');await page.click('main .equipment-socket-editor .equipment-socket-slot >> nth=0');
  await wait(page,'gem');
  await page.click('main .equipment-gem-choice >> nth=0');
  assert.equal(await page.evaluate(()=>playerHero().bag.find(x=>x.storyRewardKey==='initiation_charm').skillSockets.gems[0]),0,'the gem went into the first socket');
  await page.click('#tutorial-card button:has-text("完成")');
  assert.equal(await page.evaluate(()=>party.tutorials.records.socket_basics?.completed),true);
  // The filled socket shows its gem colour; the bag list keeps its checkmark.
  assert.notEqual(await charmRow.locator('.worn-socket-badge circle >> nth=0').getAttribute('fill'),'none');
  await page.evaluate(()=>{closeModal();setTab('battle');});await page.evaluate(()=>setTab('worn'));await page.waitForTimeout(400);
  assert.equal(await active(page),null,'plays once');
  await page.evaluate(()=>setTab('equipment'));assert(await page.locator('main .item-slot-worn').count()>0,'the bag still marks worn gear');
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});

test('a refused save says why',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  const text=await page.evaluate(()=>{start(0);closeModal();const owner=globalThis.__EMBERWILD_SAVE_OWNER;globalThis.__EMBERWILD_SAVE_OWNER=false;try{save();return saveFailureText();}finally{globalThis.__EMBERWILD_SAVE_OWNER=owner;}});
  assert.equal(text,'無法儲存（存檔已交給其他分頁，請重新整理此頁）');
  assert.equal(await page.evaluate(()=>{save();return saveFailureText();}),'無法儲存');
 }finally{await game.browser.close();}
});
