// v0.173: the goddess introduces the world on the name screen; every onboarding task and the first visit of every
// system page play one spotlight guide. Played in Chromium by pressing the highlighted game controls.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const active=page=>page.evaluate(()=>{const a=__EMBERWILD_TUTORIAL.status().active;return a&&{id:a.id,step:a.stepId,target:a.target.state,paused:a.paused};});
const wait=async(page,id,step)=>{try{await page.waitForFunction(([id,step])=>{const a=__EMBERWILD_TUTORIAL.status().active;return a?.id===id&&a.stepId===step&&a.target.state==='found';},[id,step],{timeout:20000});}catch(e){throw Error(`waiting for ${id}:${step}, active ${JSON.stringify(await active(page))}, page ${await page.evaluate(()=>tab)}`);}};
const next=page=>page.click('#tutorial-card button:has-text("下一步")');
// The spotlight never takes the click: the control under its centre is the game's own.
const underSpot=page=>page.evaluate(()=>{const s=document.getElementById('tutorial-spotlight');if(s.hidden)return null;const r=s.getBoundingClientRect(),el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el?.closest('[onclick]')?.getAttribute('onclick')||'';});

test('the goddess introduces the world; the three onboarding tasks each play a spotlight guide that ends with its task',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width:1280,height:860});
  await page.click('.save-slot-select');await page.waitForSelector('#prologue-name');
  const intro=await page.locator('#prologue-layer .prologue-goddess').innerText();
  assert.match(intro,/艾斯蘭/);assert.equal((await page.locator('#prologue-layer .prologue-goddess p').count())>=3,true);
  assert.equal(await active(page),null,'no guide on the name screen');
  await page.fill('#prologue-name','測試者');await page.click('#prologue-layer button:has-text("選擇職業")');
  await page.click('#prologue-layer .prologue-option >> nth=0');await page.click('#prologue-layer button:has-text("開始冒險")');
  // 女神的贈禮
  await wait(page,'onboarding_gift','bag');await next(page);await wait(page,'onboarding_gift','pick');await page.waitForTimeout(800);// the target scrolls into view; the highlight follows
  assert.match(await underSpot(page),/selectInventoryGear\(/);
  const starter=await page.evaluate(()=>{const h=playerHero();return h.bag.find(g=>g.starterPack&&!h.equipped.includes(g.id)).id;});
  await page.click(`main [onclick*="selectInventoryGear('${starter}')"]`);
  await wait(page,'onboarding_gift','wear');await page.click('main [onclick*="openInventoryWear("]');
  await wait(page,'onboarding_gift','equip');await page.click('main [onclick^="previewEquip("]');
  if(await page.locator('#modal [onclick^="confirmEquipComparison("]').count())await page.click('#modal [onclick^="confirmEquipComparison("]');
  // 首次探索戰鬥: the onboarding moves to the battle page and the gift guide ends with its task.
  await wait(page,'onboarding_practice','intro');
  assert.equal(await page.evaluate(()=>party.tutorials.records.onboarding_gift.completed),true);
  await next(page);await wait(page,'onboarding_practice','start');await page.waitForTimeout(800);assert.equal(await underSpot(page),'startSelectedExploration()');
  await page.click('main [onclick="startSelectedExploration()"]');await wait(page,'onboarding_practice','enemies');
  // A real seconds-combat victory completes the task (it never passes through pacedRound).
  await page.waitForFunction(()=>{for(const e of foes)e.hp=Math.min(e.hp,1);return __EMBERWILD_PROLOGUE.stage()==='helper';},null,{timeout:60000,polling:300});
  // 招募牧師
  await wait(page,'onboarding_helper','list');
  assert.equal(await page.evaluate(()=>party.tutorials.records.onboarding_practice.completed),true);
  await next(page);await wait(page,'onboarding_helper','recruit');
  await page.click('main [onclick="showCompanionRecruitment()"]');await wait(page,'onboarding_helper','choose');
  await page.click('#modal [onclick*="recruitCompanion("]');
  await page.waitForFunction(()=>!__EMBERWILD_PROLOGUE.running()&&!__EMBERWILD_TUTORIAL.status().active);
  const rec=await page.evaluate(()=>party.tutorials.records);
  for(const id of ['onboarding_gift','onboarding_practice','onboarding_helper','explore_basics','partner_basics'])assert.equal(rec[id]?.completed,true,id);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});

test('every system page plays its spotlight guide once on the first visit after the onboarding',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width:1280,height:860});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>{start(0);party.tutorials.auto=true;party.tutorials.records.explore_basics={triggered:true,completed:true,skipped:false,step:-1};party.wishingLake.unlocked=true;party.wishingLake.notified=true;closeModal();render();});
  const tours=[['statistics','statistics_basics'],['roster','roster_basics'],['partnerRoster','partner_basics'],['character','character_basics'],['worn','worn_basics'],['forge','forge_basics'],['bossCraft','boss_basics'],['story','story_basics'],['gather','gather_basics'],['alchemy','alchemy_basics'],['shop','shop_basics'],['quests','quest_basics'],['wishingLake','wishing_basics']];
  for(const [tab,id] of tours){
   await page.evaluate(tab=>{closeModal();tab==='story'?openStory('','main'):setTab(tab);},tab);
   const steps=await page.evaluate(id=>__EMBERWILD_TUTORIAL.design.modules.find(m=>m.id===id).steps.map(s=>s.id),id);
   for(const [i,step] of steps.entries()){
    await wait(page,id,step);
    await page.click(`#tutorial-card button:has-text("${i===steps.length-1?'完成':'下一步'}")`);
   }
   assert.equal(await page.evaluate(id=>party.tutorials.records[id]?.completed,id),true,id);
   // A second visit plays nothing.
   await page.evaluate(()=>{closeModal();setTab('battle');});await page.evaluate(tab=>{closeModal();tab==='story'?openStory('','main'):setTab(tab);},tab);
   await page.waitForTimeout(400);assert.equal(await active(page),null,id+' plays once');
  }
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
