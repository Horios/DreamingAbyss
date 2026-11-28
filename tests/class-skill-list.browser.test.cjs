// v0.173: the class skills on the skills page are a list in mastery order (the v0.161 tree jumped when a node was
// clicked and kept showing the previous description). A row opens its own details in a dialog; the page is not redrawn.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');

for(const [label,width] of [['desktop',1280],['phone',390]])test('class skill list opens the clicked skill in a dialog without moving the page ('+label+')',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await page.setViewportSize({width,height:860});
  await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
  await page.evaluate(()=>{start(0);party.tutorials.auto=false;setClassMasteryLevel(10);syncParty();closeModal();setTab('skills');/* v0.225: the class list is the 職業成長 page */setSkillPage('growth');});
  assert.equal(await page.locator('.skill-tree, .skill-tree-node, svg.skill-tree-lines').count(),0,'no tree');
  const rows=page.locator('.class-skill-list [data-tree-node]');assert(await rows.count()>=5);
  const levels=await page.locator('.class-skill-list .skill-list-level').allInnerTexts();
  const numbers=levels.map(t=>Number(t.match(/\d+/)[0]));assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b),'mastery order');
  await page.locator('.class-mastery-tree').scrollIntoViewIfNeeded();
  const where=()=>page.evaluate(()=>[document.querySelector('#app .layout>main').scrollTop,scrollY,Math.round(document.querySelector('.class-mastery-tree').getBoundingClientRect().top)]);
  const before=await where();
  for(const i of [1,4,0]){
   const id=await rows.nth(i).getAttribute('data-tree-node');
   await rows.nth(i).click();
   assert.equal(await page.evaluate(()=>$('modal').open),true);
   assert.equal(await page.locator('#modal [data-tree-detail]').getAttribute('data-tree-detail'),id,'the dialog shows the clicked skill');
   assert.equal(await page.locator('#modal h2').innerText(),await page.evaluate(id=>__EMBERWILD_SKILLS.byId(id).name,id));
   const box=await page.locator('#modal').boundingBox();assert(box.height<700,'the dialog fits its content');
   await page.click('#modal button:has-text("關閉")');
   assert.deepEqual(await where(),before,'the page does not move');
  }
  // An unlocked skill not in a slot can be put into one from its dialog.
  const free=await page.evaluate(()=>[...document.querySelectorAll('.class-skill-list .skill-list-node.tree-state-unlocked')].map(b=>b.dataset.treeNode).find(id=>['active','proc','support'].includes(__EMBERWILD_SKILLS.byId(id).type)));
  if(free){await page.click(`[data-tree-node="${free}"]`);await page.click('#modal button:has-text("放入技能槽")');assert.equal(await page.evaluate(()=>$('modal').open),true,'the slot dialog opens');}
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
