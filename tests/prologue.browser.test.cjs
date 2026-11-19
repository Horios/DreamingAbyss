const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
for(const [width,height] of [[1280,800],[390,780]])test('direct creation and inline tutorial at '+width+'px',async()=>{
 const g=await openRuntime(root),p=g.page;try{
  await p.setViewportSize({width,height});await p.click('.save-slot-select');await p.waitForSelector('#prologue-name');
  assert.doesNotMatch(await p.locator('.story-window').innerText(),/光點|造物室|調查使命/);
  await p.fill('#prologue-name','艾拉');await p.click('button:has-text("選擇職業")');assert.equal(await p.locator('.prologue-option').count(),4);
  await p.locator('.prologue-option').nth(0).click();await p.click('button:has-text("開始冒險")');await p.waitForSelector('.prologue-task[data-stage="gift"]');
  assert.equal(await p.locator('#prologue-layer').isVisible(),false);
  // The wear UI itself remains covered by inventory-wear tests; use its actual equipment operation here.
  await p.evaluate(()=>withHero(playerHero(),()=>equipGear(playerHero().bag.find(g=>g.starterPack).id)));
  await p.waitForSelector('.prologue-task[data-stage="practice"]');
  await p.evaluate(()=>{clearInterval(timer);running=true;spawnGroup();for(let i=0;i<500&&__EMBERWILD_PROLOGUE.stage()==='practice';i++){const it=pacedRound();for(let n=0;n<5000&&!it.next().done;n++){}}stopTeamExploration();render();});
  await p.waitForSelector('.prologue-task[data-stage="helper"]');await p.click('main button:has-text("招募夥伴")');
  assert.equal(await p.locator('#modal .roster-row').count(),1);assert.match(await p.locator('#modal').innerText(),/艾琳/);
  await p.click('#modal button:has-text("招募")');await p.waitForFunction(()=>party.story.quests.prologue.done);
  assert.equal(await p.evaluate(()=>!!partyMember(13)),true);assert.equal(await p.locator('#prologue-layer').isVisible(),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
