const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime,openEditorSection}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editor=path.resolve(root,'../Emberwild-Balance');
async function field(box,key,value){const el=box.locator('[data-life-field="'+key+'"]');await el.fill(String(value));await el.dispatchEvent('change');}

test('actual designer controls export/import gathering and five-input alchemy, persist drafts, and run both timers independently',async()=>{
 const e=await openRuntime(editor,'balance-editor.html'),g=await openRuntime(root,'index.html',{}, {pathname:'/DreamingAbyss/preview/',clockTime:new Date('2026-10-13T01:00:00Z')});
 try{
  await openEditorSection(e.page,'gatheringProducts');await e.page.locator('#lifeAdd').click();const gather=e.page.locator('[data-life-key="1"]');
  await field(gather,'name','採集銀草');await field(gather,'seconds',1.001);await field(gather,'percent',100);await field(gather,'quantity',4);await field(gather,'output','銀草');assert.match(await gather.locator('.life-design-summary').innerText(),/1.001 秒，100%.*銀草 ×4/);
  await openEditorSection(e.page,'alchemyRecipes');await e.page.locator('#lifeAdd').click();const recipe=e.page.locator('[data-life-key="recipe_1"]');await field(recipe,'name','五種材料藥水');await field(recipe,'seconds',2);await field(recipe,'percent',50);await field(recipe,'quantity',3);
  await recipe.locator('[data-life-field="outputType"]').selectOption('item');await recipe.locator('[data-life-field="output"]').selectOption('heal_small');
  for(let i=0;i<4;i++)await recipe.locator('[data-add-input]').click();assert(await recipe.locator('[data-add-input]').isDisabled());assert.equal(await recipe.locator('[data-life-input]').count(),5);
  for(let i=0;i<5;i++){const row=recipe.locator('[data-life-input="'+i+'"]');await row.locator('[data-input-field="key"]').fill(['銀草','紅色草泥','清水','藥水瓶','小蟲'][i]);await row.locator('[data-input-field="key"]').dispatchEvent('change');await row.locator('[data-input-field="quantity"]').fill(String(i+1));await row.locator('[data-input-field="quantity"]').dispatchEvent('change');}
  assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);await e.page.waitForFunction(()=>!dirty);await e.page.reload();await openEditorSection(e.page,'alchemyRecipes');assert.equal(await recipe.locator('[data-life-field="name"]').inputValue(),'五種材料藥水');
  const downloading=e.page.waitForEvent('download');await e.page.locator('#exportBtn').click();const buffer=fs.readFileSync(await(await downloading).path());const d=JSON.parse(buffer);assert.equal(d.lifeSkills.gathering[1].periodMs,1001);assert.equal(d.lifeSkills.recipes.recipe_1.inputs.length,5);
  await g.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('options');});await require('./runtime.cjs').importBalanceFile(g.page,'life-design.json',buffer);await g.page.waitForFunction(()=>__EMBERWILD_LIFE_SKILLS.design.recipes.recipe_1);await g.page.clock.runFor(1);
  await g.page.evaluate(()=>{closeModal();state.materials={銀草:20,紅色草泥:20,清水:20,藥水瓶:20,小蟲:20};Math.random=()=>.49;globalThis.__healBefore=healPotionCount('heal_small');setTab('gather');startLifeGathering('gather_1');startLifeWork('recipe_1');});
  // 採集 and 煉金 are separate pages; each shows its own progress bar.
  assert.equal(await g.page.locator('#life-gather-progress').getAttribute('max'),'1001');await g.page.evaluate(()=>setTab('alchemy'));assert.equal(await g.page.locator('#life-work-progress').getAttribute('max'),'2000');
  await g.page.clock.runFor(2002);await g.page.evaluate(()=>tickLifeSkills());assert.equal(await g.page.evaluate(()=>materialCount('銀草')),27);/* new characters start with potions from the starter gift; count what alchemy added */const healBefore=await g.page.evaluate(()=>__healBefore);assert.equal(await g.page.evaluate(()=>healPotionCount('heal_small')),healBefore+3);assert.equal(await g.page.evaluate(()=>materialCount('小蟲')),15);
  await g.page.evaluate(()=>{save();stopLifeGathering();stopLifeWork();});await g.page.reload();await g.page.evaluate(()=>{continueFromTitle();closeModal();clearInterval(timer);});assert.equal(await g.page.evaluate(()=>healPotionCount('heal_small')),healBefore+3);assert.equal(await g.page.evaluate(()=>__EMBERWILD_LIFE_SKILLS.design.recipes.recipe_1.quantity),3);
  assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
 }finally{await e.browser.close();await g.browser.close();}
});

test('one to five input controls, delete confirmation, invalid numeric validation and mobile layout work',async()=>{
 const e=await openRuntime(editor,'balance-editor.html');try{
  // The single-input 紅色草泥 'process' recipe was retired (6bd46f3); trim a remaining recipe down to one input first.
  await openEditorSection(e.page,'alchemyRecipes');const recipeKey=await e.page.evaluate(()=>Object.keys(data.lifeSkills.recipes).at(-1));const r=e.page.locator('[data-life-key="'+recipeKey+'"]');
  while(await r.locator('[data-life-input]').count()>1)await r.locator('[data-remove-input]').last().click();
  assert(await r.locator('[data-remove-input]').isDisabled(),'the last input cannot be removed');await r.locator('[data-add-input]').click();await r.locator('[data-remove-input="1"]').click();assert.equal(await r.locator('[data-life-input]').count(),1);
  await field(r,'percent',101);assert((await e.page.evaluate(()=>validateData())).some(x=>x.includes('機率')));await field(r,'percent',100);await field(r,'quantity',0);assert((await e.page.evaluate(()=>validateData())).some(x=>x.includes('產物數量')));await field(r,'quantity',1);
  e.page.once('dialog',async d=>d.dismiss());await r.locator('[data-life-delete]').click();assert.equal(await r.count(),1);e.page.once('dialog',async d=>d.accept());await r.locator('[data-life-delete]').click();assert.equal(await r.count(),0);
  for(const section of ['gatheringProducts','alchemyRecipes'])for(const width of [1440,390]){await e.page.setViewportSize({width,height:900});await openEditorSection(e.page,section);assert(await e.page.locator('.life-design-card').first().evaluate(el=>el.scrollWidth<=el.clientWidth+1),section+' @ '+width);assert.doesNotMatch(await e.page.locator('#app').innerText(),/undefined|NaN/);}
  await openEditorSection(e.page,'gatheringProducts');const g=e.page.locator('[data-life-key="0"]');await g.locator('[data-add-bonus]').click();assert.equal(await g.locator('[data-life-bonus]').count(),2);await g.locator('[data-remove-bonus="1"]').click();assert.equal(await g.locator('[data-life-bonus]').count(),1);assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
