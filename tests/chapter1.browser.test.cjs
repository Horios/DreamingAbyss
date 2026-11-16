// v0.150: chapter 1 in a real browser. The prologue and the fights are covered by their own tests, so this file moves
// through them with the game's functions and checks what the player sees: the story window, the task banner, the locked
// menu entries and controls, and the spotlight guides for the shop and the commissions. Desktop and phone widths.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const at=page=>page.evaluate(()=>__EMBERWILD_CHAPTER.current());
// Play the prologue with its own functions; training fights are recorded as won.
async function prologue(page,job){
 await page.click('.save-slot-select');await page.waitForSelector('.prologue-scene');
 await page.evaluate(job=>{
  storyWindowSpeed('instant');
  const until=(stage,phase)=>{for(let i=0;i<80;i++){if(__EMBERWILD_PROLOGUE.stage()===stage&&__EMBERWILD_PROLOGUE.phase()===phase)return;prologueNext();}throw Error('prologue stuck before '+stage);};
  until('creation','action');document.getElementById('prologue-name').value='艾拉';prologueConfirmName();
  until('calling','action');prologuePickClass(job);prologueConfirmClass();
  until('gift','action');prologueOpenTask();for(const g of playerHero().bag.filter(g=>g.starterPack||!playerHero().equipped.includes(g.id)))withHero(playerHero(),()=>equipGear(g.id));prologueReturn();
  until('skills','action');prologueOpenTask();const sk=__EMBERWILD_SKILLS.system().definitions.find(s=>s.type==='active'&&s.jobs?.includes(playerHero().job)&&__EMBERWILD_SKILLS.learned(playerHero(),s));chooseSkillSlot('active',0,sk.id);prologueReturn();
  until('practice','action');party.progressStats.encounters['prologue/practice']=1;render();prologueReturn();
  until('helper','action');prologueAcceptHelper();toggleMember(__EMBERWILD_PROLOGUE_HELPER.id);prologueReturn();
  until('trial','action');party.progressStats.encounters['prologue/trial']=1;render();prologueReturn();
  until('departure','chapter');prologueEnter();
 },job);
}
async function read(page){const s=(await at(page)).stage;for(let i=0;i<60;i++){const c=await at(page);if(!c||c.stage!==s||c.read)return;await page.click('#prologue-layer [data-story-continue]');}}
async function choose(page,text){await read(page);await page.click(`#prologue-layer [data-chapter-choice]:has-text("${text}")`);}
async function fits(page,label){
 const r=await page.evaluate(()=>{const layer=document.getElementById('prologue-layer'),box=layer.querySelector('.story-window')?.getBoundingClientRect(),buttons=[...layer.querySelectorAll('button')].map(x=>x.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth+1,inside:!!box&&box.left>=0&&box.right<=innerWidth+1,buttons:buttons.every(x=>x.width>0&&x.left>=0&&x.right<=innerWidth+1)};});
 assert.deepEqual(r,{overflow:false,inside:true,buttons:true},label);
}

for(const [label,width,height,job] of [['desktop',1280,800,0],['phone',390,780,3]])test('chapter 1 from the forest path to the village ('+label+')',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width,height});await prologue(page,job);
  await page.waitForSelector('#prologue-layer [data-chapter="chapter1"]');
  assert.equal(await page.locator('#prologue-layer [data-story-text]').getAttribute('aria-label'),'你走入了發光的門扉。');
  assert.equal(await page.locator('#prologue-layer .story-window-head .eyebrow').innerText(),'無名密林');await fits(page,'opening');
  assert.equal(await page.locator('#prologue-layer [data-story-skip]').count(),0,'the chapter cannot be skipped');
  await read(page);
  // The task banner sits on the exploration page; the locked parts of the game are disabled.
  await page.waitForSelector('.layout>main>.chapter-task');
  assert.match(await page.locator('.chapter-task').innerText(),/探索進度 0 \/ 5/);
  const locked=await page.evaluate(()=>({shop:document.querySelector('[data-nav-group="shop"]')?.disabled,life:document.querySelector('[data-nav-group="life"]')?.disabled,partners:document.querySelector('[data-nav-group="partners"]')?.disabled,map:document.querySelector('[data-nav-group="map"]')?.disabled,mail:document.getElementById('utilityButton-mailbox')?.disabled,hunt:[...document.querySelectorAll('[data-hunting-switch]')].every(b=>b.disabled),maps:[...document.querySelectorAll('select[aria-label="探索地圖"] option')].filter(o=>!o.disabled).map(o=>o.value)}));
  assert.deepEqual(locked,{shop:true,life:true,partners:true,map:false,mail:true,hunt:true,maps:['0']});
  await page.evaluate(()=>{party.progressStats.explore['0']=(party.progressStats.explore['0']||0)+5;render();});
  await page.waitForFunction(()=>__EMBERWILD_CHAPTER.current()?.stage==='ambush');
  await choose(page,'我來幫忙！');await read(page);await read(page);
  assert.equal((await at(page)).stage,'ambush_fight');
  await page.waitForSelector('.chapter-task [data-chapter-battle]');
  assert.deepEqual(await page.evaluate(()=>heroes().map(characterName).slice(1)),['商隊護衛','旅行牧師'],'the guard and the priest fight alongside');
  await page.evaluate(()=>{party.progressStats.encounters['chapter1/ambush_fight']=1;render();});
  await page.waitForFunction(()=>__EMBERWILD_CHAPTER.current()?.stage==='aftermath');
  assert.deepEqual(await page.evaluate(()=>party.active),[job],'the temporary allies leave after the fight');
  await choose(page,'我剛來到這附近。');await read(page);await choose(page,'好，一起走吧。');await read(page);
  await page.click('.chapter-task [data-chapter-action]');
  await choose(page,'這附近經常有魔物襲擊嗎？');await fits(page,'reply');await read(page);await read(page);await read(page);
  assert.equal((await at(page)).stage,'plans');
  await choose(page,'先在村莊看看。');await read(page);await choose(page,'好，請多指教。');await read(page);await read(page);
  assert.equal(await at(page),null);assert.deepEqual(await page.evaluate(()=>party.members.map(memberKey)),[job,13]);
  // The shop and the commissions open with a short spotlight guide on the first visit.
  await page.evaluate(()=>render());
  assert.equal(await page.evaluate(()=>document.querySelector('[data-nav-group="shop"]').disabled),false);
  // The exploration guide started on the forest path; it is not part of this check.
  await page.evaluate(()=>{for(let i=0;i<5&&__EMBERWILD_TUTORIAL.status().active;i++)tutorialControl('skip')||tutorialControl('close');});
  await page.evaluate(()=>setTab('shop'));await page.waitForSelector('#tutorial-card:not([hidden])');
  assert.equal(await page.evaluate(()=>__EMBERWILD_TUTORIAL.status().active?.id),'shop_basics');
  for(let i=0;i<3;i++)await page.click('#tutorial-card button:has-text("下一步"), #tutorial-card button:has-text("完成")');
  assert.equal(await page.evaluate(()=>party.tutorials.records.shop_basics?.completed),true);
  await page.evaluate(()=>setTab('quests'));await page.waitForSelector('#tutorial-card:not([hidden])');
  assert.equal(await page.evaluate(()=>__EMBERWILD_TUTORIAL.status().active?.id),'quest_basics');
  for(let i=0;i<3;i++)await page.click('#tutorial-card button:has-text("下一步"), #tutorial-card button:has-text("完成")');
  assert.equal(await page.evaluate(()=>party.tutorials.records.quest_basics?.completed),true);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-nav-group="life"]').disabled),true,'life skills stay locked');
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
