// v0.125: the prologue in a real browser, driven through the buttons a player presses. Desktop and phone widths.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const at=page=>page.evaluate(()=>__EMBERWILD_PROLOGUE.stage()+'/'+__EMBERWILD_PROLOGUE.phase());
async function read(page,until){for(let i=0;i<80;i++){if(await at(page)===until)return;await page.click('#prologue-layer .prologue-box .actions button.primary, #prologue-layer .prologue-chapter button.primary');}assert.fail('did not reach '+until+': '+await at(page));}
// Every scene must fit the viewport width and keep its controls reachable.
async function fits(page,label){
 const r=await page.evaluate(()=>{const layer=document.getElementById('prologue-layer'),box=layer.querySelector('.prologue-box,.prologue-chapter'),b=box?.getBoundingClientRect(),buttons=[...layer.querySelectorAll('button')].map(x=>x.getBoundingClientRect());return {hidden:layer.hidden,overflow:layer.scrollWidth>layer.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,left:b?.left,right:b?.right,width:innerWidth,buttons:buttons.every(x=>x.width>0&&x.left>=0&&x.right<=innerWidth+1)};});
 assert.equal(r.hidden,false,label);assert.equal(r.overflow,false,label+': no horizontal scrolling');assert(r.left>=0&&r.right<=r.width+1,label+': text box inside the viewport');assert(r.buttons,label+': buttons inside the viewport');
}
const banner=page=>page.waitForSelector('.layout>main>.prologue-task');
const back=page=>page.click('.prologue-task button:has-text("回到女神身邊")');
async function win(page){await page.click('.prologue-task button:has-text("開始訓練戰鬥")');await page.waitForFunction(()=>__EMBERWILD_PROLOGUE.satisfied(),{},{timeout:120000});await back(page);}

for(const [label,width,height,job] of [['desktop',1280,800,0],['phone',390,780,3]])test('a new player goes from the creation rite to chapter one ('+label+')',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width,height});
  await page.click('.save-slot-select');await page.waitForSelector('.prologue-scene');
  assert.equal(await at(page),'creation/before');assert.equal(await page.locator('.start').isVisible(),false,'the old class selection screen is not shown');
  assert.match(await page.locator('#prologue-layer').innerText(),/無源之光亮起/);await fits(page,'opening');
  assert.equal(await page.locator('#prologue-layer img, #prologue-layer picture, #prologue-layer svg image').count(),0,'no image assets');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('prologue-layer')).backgroundImage.includes('url(')),false,'the room is drawn with gradients only');

  await read(page,'creation/action');await fits(page,'naming');
  await page.click('#prologue-layer button:has-text("就用這個名字")');assert.equal(await at(page),'creation/action','an empty name is not accepted');
  await page.fill('#prologue-name','艾拉');await page.evaluate(()=>render());assert.equal(await page.inputValue('#prologue-name'),'艾拉','a game re-render keeps what was typed');
  await page.click('#prologue-layer button:has-text("就用這個名字")');
  await page.reload();await page.waitForSelector('.title-screen');assert.equal(await page.locator('#prologue-layer').isVisible(),false,'the title screen comes first after a reload');
  await page.click('.save-slot-select');await page.waitForSelector('.prologue-scene');assert.equal(await at(page),'creation/after','the name is not asked again');

  await read(page,'calling/action');await fits(page,'class choice');assert.equal(await page.locator('.prologue-option').count(),4);
  assert.match(await page.locator('#prologue-layer .prologue-hint').innerText(),/自由轉職/,'the class choice says the class can be changed later');
  assert.deepEqual(await page.evaluate(()=>{const h=document.querySelector('.prologue-head');return [h,...h.children].map(x=>{const c=getComputedStyle(x);return [c.backgroundColor,c.backgroundImage,c.borderTopWidth,c.boxShadow];});}),Array(3).fill(['rgba(0, 0, 0, 0)','none','0px','none']),'the place and scene name sit directly on the backdrop');
  assert.equal(await page.locator('#prologue-layer button:has-text("選擇這種力量")').isDisabled(),true);
  await page.click('.prologue-option[data-job="'+job+'"]');await page.click('#prologue-layer button:has-text("選擇這種力量")');
  assert.deepEqual(await page.evaluate(()=>[characterName(playerHero()),playerHero().job,party.mailbox.messages.length]),['艾拉',job,0]);
  assert.match(await page.locator('.prologue-speaker').first().innerText(),/女神/);

  await read(page,'skills/action');await banner(page);assert.equal(await page.locator('#prologue-layer').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'the lesson banner does not widen the page');
  await page.click('main [onclick="openSkillSlot(\'active\',0)"]');await page.click('#modal button:has-text("裝入技能")');await back(page);
  await read(page,'practice/action');await banner(page);await win(page);
  await read(page,'helper/action');await fits(page,'helper');await page.click('#prologue-layer button:has-text("接納助手")');await banner(page);
  assert.equal(await page.evaluate(()=>tab),'roster');await page.click('main button:has-text("加入上陣")');await back(page);
  await read(page,'trial/action');await banner(page);await win(page);
  await read(page,'gift/action');await banner(page);
  // Wear the starter weapon and the charm with the inventory's own wear action.
  for(const id of await page.evaluate(()=>playerHero().bag.filter(g=>g.starterPack||!playerHero().equipped.includes(g.id)).map(g=>g.id))){await page.evaluate(id=>heroMenuAction(playerHero().job,()=>{selectInventoryGear(id)}),id);await page.evaluate(id=>withHero(playerHero(),()=>equipGear(id)),id);}
  await page.evaluate(()=>render());await back(page);
  await read(page,'departure/chapter');await fits(page,'departure');
  for(let i=0;i<4&&!(await page.locator('.prologue-chapter-title').count());i++)await page.click('#prologue-layer .prologue-chapter button.primary');
  assert.equal(await page.locator('.prologue-chapter-title').innerText(),'第一章：斷絕的商路');await fits(page,'chapter title');
  await page.click('#prologue-layer button:has-text("開始旅程")');
  assert.deepEqual(await page.evaluate(()=>({active:__EMBERWILD_PROLOGUE.active(),layer:document.getElementById('prologue-layer').hidden,members:party.members.length,map:party.map,tab,done:party.story.quests.prologue.done,bag:playerHero().bag.length,banner:!!document.querySelector('.prologue-task')})),{active:false,layer:true,members:1,map:0,tab:'battle',done:true,bag:6,banner:false});
  await page.reload();await page.waitForSelector('.title-screen');await page.click('.save-slot-select');await page.waitForSelector('.layout');
  assert.deepEqual(await page.evaluate(()=>[__EMBERWILD_PROLOGUE.active(),characterName(playerHero()),playerHero().bag.length,party.members.length]),[false,'艾拉',6,1],'a finished prologue never replays and nothing is granted twice');
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
