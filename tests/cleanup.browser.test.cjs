const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
async function game(options={}){
 const r=await openRuntime(root,'index.html',{},options);
 await r.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);});
 await r.page.waitForTimeout(50);await r.page.evaluate(()=>closeModal());return r;
}
test('Idle notification refreshes do not mutate unchanged UI; saves coalesce and supply status updates once per second',async()=>{
 const r=await game({clockTime:new Date('2026-10-13T02:00:00Z')});
 try{
  await r.page.evaluate(()=>{
   const observer=new MutationObserver(records=>globalThis.badgeMutations+=records.length);
   globalThis.badgeMutations=0;observer.observe($('utilityNavigation'),{attributes:true,childList:true,subtree:true,characterData:true});
   for(const job of [0,0]){const node=document.createElement('span');node.className='supply-countdown';node.dataset.job=job;document.body.appendChild(node);}
   const label=document.createElement('span');label.id='supply-status';document.body.appendChild(label);
   globalThis.expectedSupplyCalls=document.querySelectorAll('.supply-countdown').length+1;
   globalThis.supplyCalls=0;const original=supplyStatus;supplyStatus=function(...args){supplyCalls++;return original(...args);};
  });
  await r.page.clock.runFor(1100);
  assert.equal(await r.page.evaluate(()=>badgeMutations),0);
  assert.equal(await r.page.evaluate(()=>supplyCalls),await r.page.evaluate(()=>expectedSupplyCalls));
  await r.page.evaluate(()=>{
   globalThis.journalStyleMutations=0;const journal=document.querySelector('.global-battle-journal');
   new MutationObserver(records=>journalStyleMutations+=records.length).observe(journal,{attributes:true,attributeFilter:['style']});
   $('app').appendChild(document.createTextNode(''));
  });
  assert.equal(await r.page.evaluate(()=>journalStyleMutations),0);
  assert.equal(await r.page.evaluate(()=>{let scheduled=0;const original=queueMicrotask;queueMicrotask=fn=>{scheduled++;return original(fn);};try{save();save();save();return scheduled;}finally{queueMicrotask=original;}}),1);
  await r.page.evaluate(()=>{globalThis.reminderGear=state.bag[0];inlineAffixDrafts.set(affixDraftKey(reminderGear),structuredClone(reminderGear.affix));render();});
  // The menu shows one button per category; 背包 is a single-page category, so its reminder is the category badge.
  const bagBadge=r.page.locator('aside nav [data-nav-group="bag"] .number-badge');
  assert.equal(await bagBadge.textContent(),'1');
  await r.page.evaluate(()=>{resolveInlineAffix(reminderGear.id,false);render();});
  assert.equal(await bagBadge.count(),0);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('All navigation pages and utility dialogs retain unique DOM IDs at desktop and mobile widths',async()=>{
 const r=await game();
 try{
  const pages=['battle','roster','partnerRoster','character','skills','equipment','worn','forge','bossCraft','quests','shop','lifeSkills','guide'];
  for(const width of [1440,390]){
   await r.page.setViewportSize({width,height:900});
   for(const id of pages){
    await r.page.evaluate(id=>{closeModal();setTab(id);},id);
    assert(await r.page.locator('main').innerText(),id);
    assert.deepEqual(await r.page.locator('[id]').evaluateAll(nodes=>{const counts=new Map();for(const node of nodes)counts.set(node.id,(counts.get(node.id)||0)+1);return [...counts].filter(([,n])=>n>1);}),[],id);
   }
   for(const id of ['mailbox','achievements','options']){await r.page.evaluate(id=>openUtilityPanel(id),id);assert(await r.page.locator('#modal').isVisible());await r.page.evaluate(()=>closeModal());}
  }
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
