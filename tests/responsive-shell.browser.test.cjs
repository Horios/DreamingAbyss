const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
async function setup(p){
 await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();});
 await p.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);if(EmberwildOffline.failed)throw Error('offline setup failed');if(party.offlineExploration?.receipt?.complete)acknowledgeOfflineExploration();closeModal();clearInterval(timer);for(let i=0;i<12;i++)state.bag.push(gear(1,i%4,i%4,0));save();});
}
function showPage(id){if(id.startsWith('inventory:')){setTab('equipment');setInventoryCategory(id.split(':')[1]);}else if(id.startsWith('story:'))setStoryCategory(id.split(':')[1]);else{if(id==='equipment')setInventoryCategory('equipment');setTab(id);}}
const pages=['battle','character','roster','partnerRoster','skills','equipment','inventory:materials','inventory:items','inventory:tokens','worn','forge','bossCraft','shop','story','story:side','quests','gather','alchemy','statistics'];

test('Phone pages keep text at 12px or more and tappable controls at 44px or more',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:390,height:844});await setup(p);
 for(const id of pages){
  await p.evaluate(showPage,id);
  const found=await p.evaluate(()=>{
   const shown=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden';};
   // Count badges, the N mark and equipment tier chips are deliberately compact labels.
   const compact='.number-badge,.quest-new,.gear-tier-chip';
   const small=[],walker=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);let node;
   while((node=walker.nextNode())){const e=node.parentElement;if(!node.textContent.trim()||!shown(e)||e.closest(compact))continue;const size=parseFloat(getComputedStyle(e).fontSize);if(size<12)small.push(e.className+' '+size+' '+node.textContent.trim().slice(0,12));}
   const low=[...document.querySelectorAll('#app button,#app select,#app summary,body>header button')].filter(e=>shown(e)&&!e.closest('[hidden]')&&e.getBoundingClientRect().height<43.5).map(e=>(e.className||e.tagName)+' '+Math.round(e.getBoundingClientRect().height)+' '+e.textContent.trim().slice(0,10));
   return {small:[...new Set(small)].slice(0,6),low:[...new Set(low)].slice(0,6)};
  });
  assert.deepEqual(found.small,[],id+' text below 12px');
  assert.deepEqual(found.low,[],id+' controls below 44px');
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Exploration: a phone shows both sides without scrolling and keeps the controls above the navigation; a 1366×768 desktop shows both sides too',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:390,height:844});await setup(p);
 await p.evaluate(()=>{dismissStoryHint();setTab('battle');toggleBattle();clearInterval(timer);render();});
 const phone=await p.evaluate(()=>{
  const box=s=>document.querySelector(s).getBoundingClientRect(),main=document.querySelector('.layout>main'),nav=box('.layout>aside'),bar=box('.seconds-toolbar-actions');
  const allies=[...document.querySelectorAll('#battleAllyIcons>.seconds-unit')].map(e=>e.getBoundingClientRect());
  return {scroll:main.scrollTop,rows:new Set(allies.map(a=>Math.round(a.top))).size,count:allies.length,healthBottom:Math.max(...[...document.querySelectorAll('#battleAllyIcons .battle-health-bar')].map(e=>e.getBoundingClientRect().bottom)),barTop:bar.top,barBottom:bar.bottom,navTop:nav.top,buttons:[...document.querySelectorAll('.seconds-toolbar-actions>button')].map(e=>Math.round(e.getBoundingClientRect().height)),heal:getComputedStyle(document.querySelector('.heal-auto-panel')).display,destination:box('.seconds-destination-bar').height,suffix:getComputedStyle(document.querySelector('.destination-suffix')).display};
 });
 assert.equal(phone.scroll,0);assert.equal(phone.count,3);assert.equal(phone.rows,1,'three allies share one row');
 assert(phone.healthBottom<=phone.barTop,'ally health is above the control bar without scrolling '+JSON.stringify(phone));
 assert(Math.abs(phone.barBottom-phone.navTop)<=1,'controls sit directly above the navigation');
 assert(phone.buttons.every(h=>h>=44),'control height '+phone.buttons);
 assert.equal(phone.heal,'none');assert(phone.destination<=46,'destination is one row');assert.equal(phone.suffix,'none');
 assert.deepEqual(await p.locator('.seconds-destination-bar [data-destination-category]').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),['一般地圖','任務地圖','BOSS地圖']);
 assert.equal(await p.locator('.seconds-field-help').evaluate(e=>e.open),false,'the rules text starts folded');
 await p.locator('[data-adventure-config]').click();assert.equal(await p.evaluate(()=>isAdventureConfigOpen()),true);await p.evaluate(()=>closeModal());
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>render());
 const desktop=await p.evaluate(()=>({mainBottom:document.querySelector('.layout>main').getBoundingClientRect().bottom,scroll:document.querySelector('.layout>main').scrollTop,allyBottom:Math.max(...[...document.querySelectorAll('#battleAllyIcons>.seconds-unit')].map(e=>e.getBoundingClientRect().bottom)),position:getComputedStyle(document.querySelector('.seconds-toolbar-actions')).position,heal:getComputedStyle(document.querySelector('.heal-auto-panel')).display}));
 assert.equal(desktop.scroll,0);assert(desktop.allyBottom<=desktop.mainBottom,'ally cards are fully visible at 1366×768 '+JSON.stringify(desktop));
 assert.notEqual(desktop.position,'fixed');assert.notEqual(desktop.heal,'none');
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Phone detail sheets: inventory, forge, worn slots and mail open on a tap and close again; desktop keeps both panes',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:390,height:844});await setup(p);
 const idle=()=>p.waitForFunction(()=>!isEmberwildUIInteracting());
 // Inventory
 await p.evaluate(()=>{setInventoryCategory('equipment');setTab('equipment');});
 assert.equal(await p.locator('.inventory-detail-wrap').isVisible(),false,'detail waits for a tap');
 assert.equal(await p.locator('.inventory-list-scroll').evaluate(e=>getComputedStyle(e).overflowY),'visible','the list uses the page scroll');
 assert.equal(await p.locator('.gear-management-row .gear-lock').first().isVisible(),false);
 await p.locator('.gear-management-row').nth(2).locator('.inventory-list-item').click();await idle();
 assert.equal(await p.evaluate(()=>currentDetailSheet()),'gear');
 const sheet=await p.evaluate(()=>{const b=document.querySelector('.inventory-detail-wrap').getBoundingClientRect(),nav=document.querySelector('.layout>aside').getBoundingClientRect();return {top:b.top,bottom:b.bottom,nav:nav.top,width:b.width};});
 assert(Math.abs(sheet.bottom-sheet.nav)<=1&&sheet.width===390&&sheet.top>100,'the sheet rises from the navigation '+JSON.stringify(sheet));
 await p.evaluate(()=>render());assert.equal(await p.locator('.inventory-detail-wrap .sheet-head').isVisible(),true,'the sheet survives a redraw');
 const id=await p.evaluate(()=>inventorySelectedGearId);
 await p.locator('.inventory-detail-wrap button',{hasText:/^(鎖定|已鎖定|解除鎖定)/}).first().click();await idle();
 assert.equal(await p.evaluate(id=>!!findGear(id).locked,id),true,'locking works from the sheet');
 assert.equal(await p.evaluate(()=>currentDetailSheet()),'gear');
 await p.locator('.sheet-close').click();assert.equal(await p.locator('.inventory-detail-wrap').isVisible(),false);
 await p.locator('.gear-management-row').nth(1).locator('.inventory-list-item').click();await idle();
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>currentDetailSheet()),'');
 // Tokens: filters fold
 await p.evaluate(()=>setInventoryCategory('tokens'));
 assert.equal(await p.locator('.token-management-panel .gear-basic-filters').isVisible(),false);
 await p.locator('.token-filter-toggle').click();assert.equal(await p.locator('.token-management-panel .gear-basic-filters').isVisible(),true);
 await p.evaluate(()=>render());assert.equal(await p.locator('.token-management-panel .gear-basic-filters').isVisible(),true,'filters stay open through redraws');
 await p.locator('.token-filter-toggle').click();
 // Worn slots
 await p.evaluate(()=>setTab('worn'));
 const slots=await p.locator('.worn-loadout-grid .worn-slot').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)));
 assert(new Set(slots).size<slots.length,'slots share rows');
 assert.equal(await p.locator('.worn-candidate-pane').isVisible(),false);
 await p.locator('.worn-slot-choice').first().click();await idle();
 assert.equal(await p.evaluate(()=>currentDetailSheet()),'worn');
 assert.equal(await p.locator('.worn-candidate-pane>.sheet-actions>button').count(),4,'the slot actions are in the sheet');
 await p.locator('.worn-candidate-pane>.sheet-actions>button',{hasText:'強化'}).click();await idle();
 assert.equal(await p.evaluate(()=>tab),'forge');assert.equal(await p.evaluate(()=>currentDetailSheet()),'forge','強化 opens the forge detail');
 assert.equal(await p.locator('.forge-detail-pane').isVisible(),true);
 await p.locator('.sheet-close').click();assert.equal(await p.locator('.forge-detail-pane').isVisible(),false);
 await p.locator('.forge-gear-list .forge-gear-item').nth(1).click();await idle();assert.equal(await p.locator('.forge-detail-pane').isVisible(),true);
 await p.evaluate(()=>setTab('character'));assert.equal(await p.evaluate(()=>currentDetailSheet()),'','changing page closes the sheet');
 // Mailbox
 await p.locator('#utilityButton-mailbox').click();
 const dialog=await p.locator('#modal').boundingBox();assert(dialog.width===390&&dialog.height===844,'utility dialogs fill the phone screen');
 assert.equal(await p.locator('#modal .mailbox-detail').isVisible(),false);
 const close=await p.locator('#modal .utility-dialog-controls button').boundingBox(),title=await p.locator('#modal>.heading h1').boundingBox();
 assert(close.y<title.y+title.height&&close.y+close.height>title.y,'關閉 shares the title row');
 await p.locator('.mailbox-list-item').first().click();
 assert.equal(await p.locator('#modal .mailbox-detail').isVisible(),true);assert.equal(await p.locator('#modal .mailbox-list').isVisible(),false);
 await p.locator('#modal .mailbox-detail .sheet-close').click();
 assert.equal(await p.locator('#modal .mailbox-list').isVisible(),true);assert.equal(await p.locator('#modal .mailbox-detail').isVisible(),false);
 await p.evaluate(()=>closeModal());
 // Desktop: both panes, no sheet
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>{setInventoryCategory('equipment');setTab('equipment');});
 assert.equal(await p.locator('.inventory-detail-wrap').isVisible(),true);assert.equal(await p.locator('.gear-management-row .gear-lock').first().isVisible(),true);
 assert.equal(await p.locator('.sheet-head:visible').count(),0);assert.equal(await p.locator('.token-filter-toggle:visible').count(),0);
 await p.locator('.gear-management-row').nth(1).locator('.inventory-list-item').click();await idle();assert.equal(await p.evaluate(()=>currentDetailSheet()),'');
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Phone BOSS crafting shows one region at a time; character creation shows one class with tabs; shop rows are one line each',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:390,height:844});
 const slot=await p.locator('.save-slot').first().evaluate(e=>{const a=e.querySelector('.save-slot-select').getBoundingClientRect(),b=e.querySelector('.save-slot-delete').getBoundingClientRect();return Math.abs(a.top-b.top)<=1&&b.left>=a.right;});
 assert(slot,'刪除 shares the slot row');
 await p.evaluate(()=>selectSaveSlot(1));
 assert.equal(await p.locator('.creation-class-tabs>button').count(),4);
 assert.equal(await p.locator('.start .cards>.card:visible').count(),1);
 await p.locator('.creation-class-tabs>button').nth(2).click();
 assert.equal(await p.locator('.start .cards>.card:visible h2').innerText(),await p.evaluate(()=>CLASSES[2].name));
 await setup(p);
 await p.evaluate(()=>setTab('bossCraft'));
 const regions=await p.locator('.boss-region-filter select option').count();assert(regions>2);
 const shown=await p.locator('.boss-recipe:visible .tag').allInnerTexts();assert(shown.length>0&&new Set(shown).size===1,'one region shown');
 assert.equal(shown[0],await p.evaluate(()=>MAPS[party.map].name));
 await p.locator('.boss-region-filter select').selectOption('');
 assert.equal(await p.locator('.boss-recipe:visible').count(),await p.locator('.boss-recipe').count());
 await p.locator('.boss-region-filter select').selectOption({index:2});await p.evaluate(()=>render());
 assert.equal(new Set(await p.locator('.boss-recipe:visible .tag').allInnerTexts()).size,1,'the chosen region survives a redraw');
 await p.evaluate(()=>setTab('shop'));
 const row=await p.locator('.shop-product-row').first().evaluate(e=>{const button=e.querySelector('.shop-inline-actions button').getBoundingClientRect(),slot=e.querySelector('.item-slot').getBoundingClientRect();return {height:e.getBoundingClientRect().height,beside:button.left>=slot.right-1};});
 assert(row.height<=110&&row.beside,'shop row '+JSON.stringify(row));
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>setTab('bossCraft'));
 assert.equal(await p.locator('.boss-region-filter').count(),0);assert.equal(await p.locator('.boss-recipe:visible').count(),await p.locator('.boss-recipe').count());
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Navigation rail on desktop, tablet and sideways phones; the report column folds; wide screens draw larger without overflow',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 const shell=()=>p.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect(),a=box('.layout>aside'),m=box('.layout>main'),h=box('body>header');
  return {aside:{x:a.x,y:a.y,w:a.width,h:a.height,bottom:a.bottom,right:a.right},main:{x:m.x,right:m.right,bottom:m.bottom,h:m.height},header:h.bottom,items:[...document.querySelectorAll('.layout>aside nav .game-menu-item')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({id:e.dataset.navGroup,y:Math.round(e.getBoundingClientRect().y),h:e.getBoundingClientRect().height})),more:!!document.querySelector('.mobile-more-toggle')&&document.querySelector('.mobile-more-toggle').getBoundingClientRect().height>0,innerWidth,innerHeight,doc:document.documentElement.scrollWidth};});
 const order=await p.evaluate(()=>EmberwildNavigation.design.groups.map(g=>g.id));
 for(const [width,height,rail] of [[1366,768,72],[768,1024,64],[844,390,64],[667,375,64]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>{setTab('character');render();});
  const s=await shell(),label=width+'x'+height;
  assert.equal(Math.round(s.aside.w),rail,label+' rail width');assert(s.aside.h>s.aside.w&&s.aside.x===0,label+' rail on the left');
  assert(s.main.x>=s.aside.right-1,label+' content starts right of the rail');assert(Math.abs(s.main.bottom-s.innerHeight)<=1,label+' content uses the full height '+JSON.stringify(s.main));
  assert.deepEqual(s.items.sort((a,b)=>a.y-b.y).map(i=>i.id),order,label+' every category is listed in the configured order');
  assert.equal(s.more,false,label+' no More menu');assert(s.doc<=s.innerWidth,label+' no horizontal overflow');
  if(width<=900)assert(s.items.every(i=>i.h>=44),label+' rail targets');
  await p.locator('.layout>aside nav [data-nav-group="shop"]').click();await p.waitForFunction(()=>tab==='shop');
 }
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>render());
 const phone=await shell();assert(phone.aside.w>phone.aside.h&&Math.abs(phone.aside.bottom-844)<=1,'upright phones keep the bottom bar');assert.equal(phone.more,true);
 // Report column
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>{setTab('equipment');render();});
 const before=await p.evaluate(()=>({main:document.querySelector('.layout>main').getBoundingClientRect().width,journal:document.querySelector('#globalBattleJournal').getBoundingClientRect().width}));
 assert(before.journal<=321,'report column is at most 320px '+before.journal);
 await p.locator('.journal-collapse-toggle').click();
 const folded=await p.evaluate(()=>({main:document.querySelector('.layout>main').getBoundingClientRect().width,journal:document.querySelector('#globalBattleJournal').getBoundingClientRect().width,log:!!document.querySelector('#liveLog')?.getBoundingClientRect().width}));
 assert(folded.journal<=45&&folded.main>before.main+200&&!folded.log,'folded report '+JSON.stringify(folded));
 await p.evaluate(()=>{refreshGlobalJournal();render();});assert.equal(await p.locator('.journal-collapse-toggle').innerText(),'展開戰報','the strip survives redraws');
 await p.reload();await p.evaluate(()=>{selectSaveSlot(1);});await p.waitForFunction(()=>!!state&&!!document.querySelector('.journal-collapse-toggle'));
 assert.equal(await p.evaluate(()=>document.body.classList.contains('journal-collapsed')),true,'the choice is kept for this browser');
 await p.locator('.journal-collapse-toggle').click();assert.equal(await p.locator('#liveLog').isVisible(),true);
 // Wide screens
 await p.setViewportSize({width:1920,height:1080});await p.evaluate(()=>{closeModal();setTab('equipment');render();});
 const wide=await p.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();return {zoom:getComputedStyle(document.documentElement).zoom,font:b('.layout>main h1').height,layoutBottom:b('.layout').bottom,journalRight:b('#globalBattleJournal').right,doc:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};});
 assert.equal(wide.zoom,'1.15');assert(wide.layoutBottom<=1081&&wide.journalRight<=1921,'the zoomed layout fits the screen '+JSON.stringify(wide));
 await p.evaluate(()=>setTab('options'));
 const dialog=await p.locator('#modal').boundingBox();assert(Math.abs(dialog.x+dialog.width/2-960)<=2&&dialog.y>=0&&dialog.y+dialog.height<=1080,'dialogs stay centred and on screen '+JSON.stringify(dialog));
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
