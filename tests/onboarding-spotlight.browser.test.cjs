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
  assert.match(await underSpot(page),/bagCellClick\(/);/* v0.211 grid bag slot */
  const starter=await page.evaluate(()=>{const h=playerHero();return h.bag.find(g=>g.starterPack&&!h.equipped.includes(g.id)).id;});
  await page.click(`main .bag-cell[data-bag-ref="g:${starter}"]`);
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
  // 招募牧師 (v0.178): the bag opens; the priest's ticket is used from 道具 and she joins.
  await wait(page,'onboarding_helper','items');
  assert.equal(await page.evaluate(()=>party.tutorials.records.onboarding_practice.completed),true);
  assert.equal(await page.evaluate(()=>[tab,companionTicketCount(13)].join()),'equipment,1');
  // v0.211 grid bag: tickets are in 特殊 and their detail is the bag's detail pane.
  await page.click('main [data-bag-tab="special"]');await wait(page,'onboarding_helper','ticket');
  await page.click('main .bag-cell[data-bag-ref^="t:13:"]');await wait(page,'onboarding_helper','use');
  const detail=await page.locator('.bag-detail').innerText();assert.match(detail,/夥伴招募券 - 艾琳/);assert.match(detail,/治療/,'the ticket describes the companion');
  assert.equal(await page.locator('#tutorial-card').isVisible(),true,'the guide card stays visible');
  await page.click('.bag-detail button:has-text("使用招募券")');
  await page.waitForFunction(()=>!__EMBERWILD_PROLOGUE.running()&&!__EMBERWILD_TUTORIAL.status().active);
  const rec=await page.evaluate(()=>party.tutorials.records);
  for(const id of ['onboarding_gift','onboarding_practice','onboarding_helper','explore_basics','partner_basics'])assert.equal(rec[id]?.completed,true,id);
  assert.equal(await page.evaluate(()=>[!!partyMember(13),companionTicketCount(13)].join()),'true,0');
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});

// v0.176: exploring, gear and the party keep the spotlight; every other system page shows a popup that lists the steps,
// leaves focus where it was and closes with 「關閉」.
test('every system page plays its guide once on the first visit after the onboarding: popup or spotlight',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width:1280,height:860});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>{start(0);party.tutorials.auto=true;party.tutorials.records.explore_basics={triggered:true,completed:true,skipped:false,step:-1};party.wishingLake.unlocked=true;party.wishingLake.notified=true;closeModal();render();});
  const tours=[['statistics','statistics_basics'],['roster','roster_basics'],['partnerRoster','partner_basics'],['character','character_basics'],['worn','worn_basics'],['forge','forge_basics'],['forge','extraction_basics'],['crafting','boss_basics'],['story','story_basics'],['gather','gather_basics'],['alchemy','alchemy_basics'],['shop','shop_basics'],['quests','quest_basics'],['wishingLake','wishing_basics']];
  const open=tab=>page.evaluate(tab=>{closeModal();tab==='story'?openStory('','main'):setTab(tab);},tab);
  for(const [n,[tab,id]] of tours.entries()){
   await open(tab);
   const m=await page.evaluate(id=>{const m=__EMBERWILD_TUTORIAL.design.modules.find(m=>m.id===id);return {type:m.type,steps:m.steps.map(s=>({id:s.id,title:s.title}))};},id);
   if(m.type==='notice'){
    await page.waitForFunction(id=>__EMBERWILD_TUTORIAL.status().tip?.id===id&&!document.getElementById('tutorial-tip').hidden,id,{timeout:20000}).catch(async e=>{throw Error(id+' popup: '+JSON.stringify(await page.evaluate(()=>__EMBERWILD_TUTORIAL.status())))});
    const tip=page.locator('#tutorial-tip');
    assert.equal(await tip.getAttribute('role'),'status','not a dialog');assert.equal(await active(page),null,'no spotlight');
    assert.equal(await page.evaluate(()=>document.getElementById('tutorial-tip').contains(document.activeElement)),false,'focus stays on the page');
    for(const x of m.steps)assert((await tip.innerText()).includes(x.title),id+' lists '+x.title);
    assert.deepEqual(await tip.locator('button').allInnerTexts(),['關閉']);
    await tip.locator('button').click();await page.waitForFunction(()=>document.getElementById('tutorial-tip').hidden);
   }else for(const [i,x] of m.steps.entries()){
    await wait(page,id,x.id);
    await page.click(`#tutorial-card button:has-text("${i===m.steps.length-1?'完成':'下一步'}")`);
   }
   assert.equal(await page.evaluate(id=>party.tutorials.records[id]?.completed,id),true,id);
   // A second visit plays nothing (the forge's skill-extraction popup follows its forge popup).
   if(tours[n+1]?.[0]===tab)continue;
   await page.evaluate(()=>{closeModal();setTab('battle');});await open(tab);
   await page.waitForTimeout(400);assert.equal(await active(page),null,id+' plays once');assert.equal(await page.evaluate(()=>__EMBERWILD_TUTORIAL.status().tip),null,id+' popup once');
  }
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
