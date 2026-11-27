'use strict';
/* v0.211 grid bag: six tabs, slot usage from the inventory model, gear cell badges, unidentified gear stays hidden,
   identification, batch selection and protection, selection kept across drops and redraws, phone sheet, large bags. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
test('grid bag shows six tabs, badges, hides unidentified gear and keeps selection by identity',async()=>{
 const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-27T02:00:00Z')}),p=r.page;
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(0);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);running=false;
   const a=gear(2,0,2,0);a.plus=5;a.skillSockets={version:1,count:3,gems:[0,null,null]};a.locked=true;addGear(a);globalThis.lockedGear=a;
   const b=gear(2,1,1,0);addGear(b);globalThis.freeGear=b;
   const c=gear(3,0,3,0);c.plus=7;c.skillSockets={version:1,count:2,gems:[1,2]};c.unidentified={slot:0,level:9};addGear(c);globalThis.hiddenGear=c;
   state.gems[0]=5;state.gems[6]=12;state.materials['遠古碎片']=30;party.achievements.tickets={10:2};
   setTab('equipment');setInventoryCategory('equipment');});
  await p.clock.resume();
  await p.setViewportSize({width:1440,height:900});
  assert.deepEqual(await p.locator('.bag-tab').allInnerTexts().then(t=>t.map(x=>x.replace(/\d+/g,'').trim())),['裝備','素材','寶石','消耗品','信物','特殊']);
  // Slot usage comes from the inventory model of each tab.
  for(const [id,tab] of [['equipment','equipment'],['materials','material'],['gems','gem'],['items','consumable'],['tokens','token'],['special','special']]){
   await p.evaluate(id=>setInventoryCategory(id),id);
   const [shown,expected,cells]=await p.evaluate(tab=>{const u=EmberwildItems.slots().tabs[tab];return [document.querySelector('.bag-usage').textContent,u.used+'／'+u.capacity,document.querySelectorAll('.bag-cell').length];},tab);
   assert.equal(shown,expected,id);
   assert(cells>=100,id+' shows empty cells up to the capacity');
  }
  await p.evaluate(()=>setInventoryCategory('gems'));
  assert.equal(await p.locator('.bag-cell[data-bag-ref^="s:"]').count(),2);
  assert.equal(await p.locator('.bag-cell[data-bag-ref^="s:"] .bag-tier').first().textContent(),'1階');
  await p.evaluate(()=>setInventoryCategory('special'));
  assert.equal(await p.locator('.bag-cell[data-bag-ref^="t:10:"]').count(),1);
  await p.locator('.bag-cell[data-bag-ref^="t:10:"]').click();
  await p.waitForFunction(()=>document.querySelector('.bag-cell.is-selected')?.dataset.bagRef.startsWith('t:10:'));
  await p.locator('.bag-detail').getByRole('button',{name:'使用招募券'}).waitFor();

  await p.evaluate(()=>setInventoryCategory('equipment'));
  const locked=p.locator(`.bag-cell[data-bag-ref="g:${await p.evaluate(()=>lockedGear.id)}"]`);
  assert.equal(await locked.locator('.bag-cell-tl').textContent(),'+5');
  assert.equal(await locked.locator('.bag-sockets svg').count(),3);
  assert.match(await locked.locator('.bag-sockets').getAttribute('aria-label'),/第 1 孔：赤焰石・1階、第 2 孔：空孔/);
  assert.equal(await locked.locator('.bag-lock').count(),1);
  // Unidentified: question mark, no enhancement, sockets, quality colour or real name.
  const hidden=p.locator(`.bag-cell[data-bag-ref="g:${await p.evaluate(()=>hiddenGear.id)}"]`);
  assert.equal(await hidden.locator('.bag-cell-q').textContent(),'?');
  assert.equal(await hidden.locator('.bag-cell-tl,.bag-sockets').count(),0);
  assert.doesNotMatch(await hidden.getAttribute('class'),/item-quality-/);
  assert.doesNotMatch(await hidden.getAttribute('aria-label'),new RegExp(await p.evaluate(()=>equipmentDisplayName({...hiddenGear,unidentified:undefined}).replace(/[+]/g,'\\+'))));
  await hidden.click();
  await p.waitForFunction(()=>document.querySelector('.bag-cell.is-selected')?.dataset.bagRef==='g:'+hiddenGear.id);
  assert.match(await p.locator('.bag-detail').innerText(),/未鑑定/);
  assert.equal(await p.locator('.bag-detail').getByRole('button',{name:'穿戴'}).count(),0);
  // Identify all: the button count and the cell change, the slot count stays.
  const before=await p.evaluate(()=>EmberwildItems.slots().tabs.equipment.used);
  await p.getByRole('button',{name:/^全部鑑定/}).click();
  await p.waitForFunction(()=>!hiddenGear.unidentified&&document.querySelector(`.bag-cell[data-bag-ref="g:${hiddenGear.id}"] .bag-cell-tl`));
  assert.equal(await hidden.locator('.bag-cell-tl').textContent(),'+7');
  assert.equal(await p.evaluate(()=>EmberwildItems.slots().tabs.equipment.used),before);
  // Selection is kept by gear id across a drop and a redraw.
  await p.locator(`.bag-cell[data-bag-ref="g:${await p.evaluate(()=>freeGear.id)}"]`).click();
  await p.waitForFunction(()=>document.querySelector('.bag-cell.is-selected')?.dataset.bagRef==='g:'+freeGear.id);
  await p.evaluate(()=>{for(let i=0;i<5;i++)addGear(gear(1,i%4,3,0));render();});
  assert.equal(await p.evaluate(()=>document.querySelector('.bag-cell.is-selected')?.dataset.bagRef),'g:'+await p.evaluate(()=>freeGear.id));
  // Batch selection: protected items cannot be picked; leaving the mode clears it.
  await p.getByRole('button',{name:'批次選取'}).click();
  await p.locator('.bag-grid.is-batch').waitFor();
  assert.equal(await locked.getAttribute('aria-disabled'),'true');
  await locked.click({force:true});
  assert.deepEqual(await p.evaluate(()=>__EMBERWILD_GEAR_INVENTORY.selection()),[]);
  await p.locator(`.bag-cell[data-bag-ref="g:${await p.evaluate(()=>freeGear.id)}"]`).click();
  await p.waitForFunction(()=>/已選 1 件/.test(document.querySelector('.bag-batch b')?.textContent));
  await p.locator('.bag-batch').getByRole('button',{name:'批次出售'}).click();
  await p.locator('#modal').getByRole('button',{name:'確認出售'}).click();
  await p.waitForFunction(()=>!findGear(freeGear.id)&&!document.querySelector('.bag-grid.is-batch'));
  assert.equal(await p.evaluate(()=>!!findGear(freeGear.id)),false);
  assert.equal(await p.evaluate(()=>__EMBERWILD_GEAR_INVENTORY.multi()),false);
  assert.equal(await p.evaluate(()=>!!findGear(lockedGear.id)),true);
  // Filters change the view only.
  const total=await p.evaluate(()=>EmberwildItems.slots().tabs.equipment.used);
  await p.getByRole('button',{name:/^篩選/}).click();
  await p.getByLabel('部位',{exact:true}).selectOption('1');
  await p.waitForFunction(()=>!document.querySelector('.bag-cell.is-empty'));
  assert(await p.evaluate(()=>[...document.querySelectorAll('.bag-cell[data-bag-ref]')].every(c=>findGear(c.dataset.bagRef.slice(2)).slot===1)));
  assert.equal(await p.locator('.bag-cell.is-empty').count(),0);
  assert.equal(await p.evaluate(()=>EmberwildItems.slots().tabs.equipment.used),total);
  await p.getByRole('button',{name:'清除篩選'}).click();
  // Phone: no horizontal scroll, a tap opens the detail sheet with the actions.
  for(const width of [390,320]){
   await p.setViewportSize({width,height:860});
   for(const id of ['equipment','materials','gems','items','tokens','special']){await p.evaluate(id=>setInventoryCategory(id),id);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' '+width);}
  }
  await p.evaluate(()=>setInventoryCategory('equipment'));
  await locked.click();
  await p.waitForFunction(()=>document.body.dataset.sheet==='gear'&&document.querySelector('.bag-cell.is-selected')?.dataset.bagRef==='g:'+lockedGear.id);
  await p.locator('.inventory-detail-wrap').getByRole('button',{name:'解除鎖定'}).click();
  await p.waitForFunction(()=>!lockedGear.locked);
  assert.equal(await p.evaluate(()=>lockedGear.locked),false);
  await p.evaluate(()=>closeDetailSheet());
  // Large bag: 600 items render quickly.
  await p.setViewportSize({width:1440,height:900});
  const ms=await p.evaluate(()=>{for(let i=0;i<600;i++)state.bag.push(gear(1+(i%5),i%4,i%4,0));const t=performance.now();for(let i=0;i<5;i++)render();return (performance.now()-t)/5;});
  assert(ms<400,'render took '+ms+' ms');
  assert.equal(await p.locator('.bag-cell[data-bag-ref]').count(),await p.evaluate(()=>__EMBERWILD_GEAR_INVENTORY.rows().length));
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('grid bag survives save and reload with stacks and selection fallback',async()=>{
 const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-27T02:00:00Z')}),p=r.page;
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(0);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);running=false;state.materials['遠古碎片']=1500;addGear(gear(2,0,2,0));save();setTab('equipment');setInventoryCategory('materials');});
  await p.clock.resume();
  const cells=await p.evaluate(()=>[...document.querySelectorAll('.bag-cell[data-bag-ref^="s:"]')].map(c=>c.getAttribute('aria-label')));
  assert(cells.some(t=>/遠古碎片 ×999/.test(t))&&cells.some(t=>/遠古碎片 ×501/.test(t)),JSON.stringify(cells));
  // Selecting a stack that then empties falls back to another stack of the same item.
  await p.locator('.bag-cell[aria-label="遠古碎片 ×501"]').click();
  await p.waitForFunction(()=>document.querySelector('.bag-cell.is-selected')?.getAttribute('aria-label')==='遠古碎片 ×501');
  await p.evaluate(()=>{state.materials['遠古碎片']=999;render();});
  await p.waitForFunction(()=>document.querySelector('.bag-cell.is-selected')?.getAttribute('aria-label')==='遠古碎片 ×999');
  const before=await p.evaluate(()=>JSON.stringify([EmberwildItems.slots().tabs,state.bag.map(g=>g.id)]));
  await p.reload();
  await p.evaluate(()=>{selectSaveSlot(1);continueFromTitle();clearInterval(timer);running=false;setTab('equipment');setInventoryCategory('materials');});
  assert.equal(await p.evaluate(()=>JSON.stringify([EmberwildItems.slots().tabs,state.bag.map(g=>g.id)])),before);
  assert.equal(await p.locator('.bag-usage').textContent(),await p.evaluate(()=>{const u=EmberwildItems.slots().tabs.material;return u.used+'／'+u.capacity;}));
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('v0.213: 種類 sorts gear by part; batch pick selects listed, actionable items by part and rarity',async()=>{
 const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-27T02:00:00Z')}),p=r.page;
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(0);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);running=false;
   for(let i=0;i<16;i++){const g=gear(1+(i%3),(i*3)%4,i%4,0);g.id='pick-'+i;if(i===5)g.locked=true;if(i===6)g.unidentified={slot:g.slot,level:3};addGear(g);}
   setTab('equipment');setInventoryCategory('equipment');});
  await p.clock.resume();
  await p.getByLabel('排序',{exact:true}).selectOption('kind');
  await p.waitForFunction(()=>{const s=[...document.querySelectorAll('.bag-cell[data-bag-ref]')].map(c=>{const g=findGear(c.dataset.bagRef.slice(2));return g.unidentified?.slot??g.slot;});return s.length===16&&s.every((v,i)=>!i||s[i-1]<=v);});
  await p.getByRole('button',{name:'批次選取'}).click();await p.locator('.bag-grid.is-batch').waitFor();
  await p.getByLabel('依部位',{exact:true}).selectOption('0');await p.getByLabel('依稀有度',{exact:true}).selectOption('1');
  await p.getByRole('button',{name:'選取符合條件'}).click();
  const want=await p.evaluate(()=>state.bag.filter(g=>g.id.startsWith('pick-')&&!g.unidentified&&!g.locked&&!gearWearer(g.id)&&g.slot===0&&gearQualityRank(g)===1).map(g=>g.id).sort());
  await p.waitForFunction(n=>__EMBERWILD_GEAR_INVENTORY.selection().length===n,want.length);
  assert.deepEqual(await p.evaluate(()=>__EMBERWILD_GEAR_INVENTORY.selection().sort()),want);
  // Only rarity: every listed actionable gear of that rarity; locked and unidentified gear never join.
  await p.getByLabel('依部位',{exact:true}).selectOption('all');await p.getByRole('button',{name:'選取符合條件'}).click();
  await p.waitForFunction(()=>__EMBERWILD_GEAR_INVENTORY.selection().every(id=>gearQualityRank(findGear(id))===1));
  const sel=await p.evaluate(()=>__EMBERWILD_GEAR_INVENTORY.selection());
  assert(!sel.includes('pick-5')&&!sel.includes('pick-6'));
  assert.equal(sel.length,await p.evaluate(()=>state.bag.filter(g=>!g.unidentified&&!g.locked&&!gearWearer(g.id)&&!EmberwildTokens.isToken(g)&&gearQualityRank(g)===1).length));
  // The existing review flow sells exactly the picked set.
  await p.locator('.bag-batch').getByRole('button',{name:'批次出售'}).click();
  await p.locator('#modal').getByRole('button',{name:'確認出售'}).click();
  await p.waitForFunction(ids=>ids.every(id=>!findGear(id)),sel);
  assert.equal(await p.evaluate(()=>!!findGear('pick-5')&&!!findGear('pick-6')),true);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('v0.213: gems salvage into dust by tier from the detail pane and in batch, with confirmation and rollback',async()=>{
 const r=await openRuntime(root,'index.html',{}, {clockTime:Date.parse('2026-10-27T02:00:00Z')}),p=r.page;
 try{
  await p.evaluate(async()=>{selectSaveSlot(1);start(0);closeModal();continueFromTitle();clearInterval(timer);await EmberwildOffline.settle(undefined,false);running=false;
   state.gems[0]=3;state.gems[5]=2;state.gems[10]=1;state.materials.寶石粉塵=0;setTab('equipment');setInventoryCategory('gems');});
  await p.clock.resume();
  const each=await p.evaluate(()=>GAMEPLAY_SETTINGS.skills.gems.dustSalvage.dustByTier);
  assert.deepEqual(each,[10,50,300]);
  // Single: select the tier-1 stack, salvage one with confirmation.
  await p.locator('.bag-cell[aria-label^="'+await p.evaluate(()=>GEMS[0].name)+'"]').click();
  await p.locator('.bag-detail').getByRole('button',{name:/^分解 1 顆/}).click();
  assert.match(await p.locator('#modal').innerText(),/共分解 1 顆寶石，獲得 10 寶石粉塵/);
  await p.locator('#modal').getByRole('button',{name:'確認分解'}).click();
  await p.waitForFunction(()=>state.gems[0]===2&&state.materials.寶石粉塵===10);
  // A failed save rolls everything back.
  await p.evaluate(()=>{globalThis.realSave=save;save=()=>false;salvageGems({0:2});save=realSave;});
  assert.deepEqual(await p.evaluate(()=>[state.gems[0],state.materials.寶石粉塵]),[2,10]);
  // Batch by tier: tier 2 only, then everything.
  await p.getByRole('button',{name:'批次分解'}).click();await p.locator('.bag-grid.is-batch').waitFor();
  await p.getByLabel('依等級',{exact:true}).selectOption('2');await p.getByRole('button',{name:'選取符合條件'}).click();
  await p.waitForFunction(()=>/已選 2 顆 · 100 寶石粉塵/.test(document.querySelector('.bag-batch b')?.textContent));
  await p.getByRole('button',{name:'全選'}).click();
  await p.waitForFunction(()=>/已選 5 顆 · 420 寶石粉塵/.test(document.querySelector('.bag-batch b')?.textContent));
  await p.locator('.bag-batch').getByRole('button',{name:'批次分解'}).click();
  assert.match(await p.locator('#modal').innerText(),/共分解 5 顆寶石，獲得 420 寶石粉塵/);
  await p.locator('#modal').getByRole('button',{name:'確認分解'}).click();
  await p.waitForFunction(()=>state.gems.every(n=>!n)&&state.materials.寶石粉塵===430&&!document.querySelector('.bag-grid.is-batch'));
  assert.equal(await p.evaluate(()=>EmberwildItems.audit().length),0);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
