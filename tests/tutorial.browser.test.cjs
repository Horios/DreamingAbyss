// v0.144: the tutorial guide in a real browser. The highlight lets clicks through to the game's own controls, the card
// stays inside the viewport without covering its target, and the review page replays a guide. Desktop and phone widths.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const active=page=>page.evaluate(()=>{const a=__EMBERWILD_TUTORIAL.status().active;return a&&{id:a.id,step:a.stepId,target:a.target.state,mode:a.mode,paused:a.paused};});
// The card is inside the viewport and does not overlap the highlighted control.
async function layout(page,label){
 const r=await page.evaluate(()=>{const c=document.getElementById('tutorial-card').getBoundingClientRect(),s=document.getElementById('tutorial-spotlight'),t=s.hidden?null:s.getBoundingClientRect();
  const overlap=t?Math.max(0,Math.min(c.right,t.right-6)-Math.max(c.left,t.left+6))*Math.max(0,Math.min(c.bottom,t.bottom-6)-Math.max(c.top,t.top+6)):0;
  return {inside:c.left>=0&&c.top>=0&&c.right<=innerWidth+1&&c.bottom<=innerHeight+1,overlap,scroll:document.documentElement.scrollWidth>innerWidth+1};});
 assert.equal(r.inside,true,label+': card inside the viewport');assert.equal(r.scroll,false,label+': no horizontal scrolling');
 return r;
}
for(const [label,width,height] of [['desktop',1280,800],['phone',390,780]])test('the exploration guide is played by pressing the game controls it points at ('+label+')',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width,height});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>start(0));await page.waitForSelector('#tutorial-card:not([hidden])');
  assert.deepEqual(await active(page),{id:'explore_basics',step:'intro',target:'found',mode:'normal',paused:false});
  const first=await layout(page,'intro');if(label==='desktop')assert.equal(first.overlap,0,'the card sits beside its target');
  await page.click('#tutorial-card button:has-text("下一步")');await page.click('#tutorial-card button:has-text("下一步")');
  assert.equal((await active(page)).step,'start');
  await page.waitForTimeout(700);// the page scrolls the target into view and the highlight follows it
  // The spotlight never takes the click: the point at its centre is the game's own button.
  const hit=await page.evaluate(()=>{const s=document.getElementById('tutorial-spotlight').getBoundingClientRect(),el=document.elementFromPoint(s.left+s.width/2,s.top+s.height/2);return el?.closest('[onclick]')?.getAttribute('onclick')||'';});
  assert.equal(hit,'startSelectedExploration()');
  await page.click('main [onclick="startSelectedExploration()"]');
  await page.waitForFunction(()=>__EMBERWILD_TUTORIAL.status().active?.stepId==='auto');await layout(page,'auto');
  await page.click('#tutorial-card button:has-text("完成")');assert.equal(await active(page),null);
  assert.equal(await page.evaluate(()=>party.tutorials.records.explore_basics.completed),true);
  // Review: Settings → 教學回顧 lists unlocked guides and replays one without touching the record.
  await page.evaluate(()=>stopTeamExploration());
  await page.click('#utilityButton-options');await page.click('[data-options-tab="tutorials"]');
  const rows=await page.locator('[data-tutorial-review]').evaluateAll(n=>n.map(x=>x.dataset.tutorialReview));
  assert.deepEqual(rows,['explore_basics','skill_basics'],'the gear guide is not listed before any gear was found');
  await page.click('[data-tutorial-review="explore_basics"] button:has-text("查看說明")');
  assert.match(await page.locator('[data-tutorial-review="explore_basics"]').innerText(),/選擇探索地圖/);
  await page.click('[data-tutorial-review="explore_basics"] button:has-text("重新執行引導")');
  assert.equal(await page.evaluate(()=>document.getElementById('modal').open),false,'the settings dialog closes for the replay');
  assert.deepEqual(await active(page),{id:'explore_basics',step:'intro',target:'found',mode:'replay',paused:false});
  await page.click('#tutorial-card button:has-text("結束")');assert.equal(await active(page),null);
  assert.equal(await page.evaluate(()=>party.tutorials.records.explore_basics.completed),true,'replaying kept the record');
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
test('a step inside a dialog marks its control with a ring and the card joins the dialog',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width:1280,height:800});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>start(0));await page.waitForSelector('#tutorial-card:not([hidden])');await page.click('#tutorial-card button:has-text("跳過教學")');
  await page.evaluate(()=>{const h=playerHero();const g=gear(1,0,1,h.job);addGear(g);render();});
  await page.waitForSelector('[data-tutorial-notice="equipment_basics"]');
  await page.click('[data-tutorial-notice="equipment_basics"] button:has-text("前往")');
  await page.click('#tutorial-card button:has-text("下一步")');
  const id=await page.evaluate(()=>playerHero().bag.find(g=>g.acquiredAt).id);
  await page.click(`.inline-equipment-list [onclick*="selectInventoryGear('${id}')"]`);
  await page.click(`main [onclick*="openInventoryWear('${id}')"]`);await page.click(`main [onclick^="previewEquip('${id}'"]`);
  assert.equal(await page.evaluate(()=>document.getElementById('modal').open),true,'the comparison dialog opened');
  await page.waitForFunction(()=>document.querySelector('#modal .tutorial-ring'));
  assert.equal(await page.evaluate(()=>document.getElementById('tutorial-card').parentElement.id),'modal','the card is shown above the dialog');
  await page.click('#modal [onclick^="confirmEquipComparison("]');
  await page.waitForFunction(()=>__EMBERWILD_TUTORIAL.status().active?.stepId==='slots');
  assert.equal(await page.evaluate(()=>party.tutorials.events.gearEquipped),1);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
