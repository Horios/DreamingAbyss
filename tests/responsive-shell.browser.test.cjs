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
 assert.equal(await p.locator('.sheet-head:visible').count(),0);
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

test('Phone second pass: two-column stats, compact empty skill slots, one-row quest filter, folded explanations and alchemy recipes',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:390,height:844});await setup(p);
 await p.evaluate(()=>setTab('character'));
 const stats=await p.locator('.stat-grid>span').evaluateAll(es=>es.slice(0,2).map(e=>Math.round(e.getBoundingClientRect().top)));assert.equal(stats[0],stats[1],'two stats share a row');
 await p.evaluate(()=>setTab('skills'));
 const slots=await p.locator('.skill-system-slot').evaluateAll(es=>es.map(e=>({h:e.getBoundingClientRect().height,filled:!!e.querySelector('.skill-slot-name')})));
 assert(slots.some(s=>!s.filled)&&slots.filter(s=>!s.filled).every(s=>s.h>=44&&s.h<=60),'empty slots are one row '+JSON.stringify(slots));
 await p.evaluate(()=>setStoryCategory('side'));
 assert.equal(new Set(await p.locator('.quest-filter>button').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)))).size,1,'quest filter is one row');
 await p.evaluate(()=>setTab('roster'));
 const row=await p.locator('.roster-row').nth(1).evaluate(e=>{const a=e.querySelector('.roster-member-actions').getBoundingClientRect(),n=e.querySelector('.member-identity').getBoundingClientRect();return a.left>=n.left+60&&a.top<n.bottom+30;});assert(row,'member actions sit beside the name');
 await p.evaluate(()=>setTab('alchemy'));
 const intro=p.locator('.life-rules.intro-clamp');assert.equal(await intro.count(),1);
 const before=await intro.evaluate(e=>e.getBoundingClientRect().height);
 await p.locator('.intro-clamp-toggle').first().click();const opened=await intro.evaluate(e=>e.getBoundingClientRect().height);assert(opened>before,'explanation opens');
 await p.evaluate(()=>render());assert.equal(await p.locator('.life-rules').evaluate(e=>e.classList.contains('intro-open')),true,'it stays open through a redraw');
 const recipe=p.locator('.life-recipe').first();
 assert.equal(await recipe.locator('.recipe-item-line').isVisible(),false);assert(await recipe.evaluate(e=>e.getBoundingClientRect().height)<=96,'folded recipe is one row');
 assert.equal(await recipe.locator('button:not(.life-recipe-toggle)').isVisible(),true,'開始 stays reachable while folded');
 await recipe.locator('.life-recipe-toggle').click();assert.equal(await recipe.locator('.recipe-item-line').isVisible(),true);
 await p.evaluate(()=>render());assert.equal(await p.locator('.life-recipe').first().locator('.recipe-item-line').isVisible(),true,'an opened recipe survives a redraw');
 const stock=await p.locator('.life-materials>.life-stock-row').evaluateAll(es=>es.slice(0,2).map(e=>Math.round(e.getBoundingClientRect().top)));assert.equal(stock[0],stock[1],'stock is two per row');
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>render());
 assert.equal(await p.locator('.life-recipe-toggle').count(),0);assert.equal(await p.locator('.life-recipe').first().locator('.recipe-item-line').isVisible(),true);assert.equal(await p.locator('.intro-clamp-toggle:visible').count(),0);
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Desktop second pass: worn slots are one row each with the page buttons on the sub-page row; trigger and support skills sit side by side',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 await p.evaluate(()=>setTab('worn'));
 const worn=await p.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),tabs=b('.layout>main>.game-subtabs'),link=b('.inventory-wear-skill-link'),help=b('.inventory-wear-toolbar'),slots=[...document.querySelectorAll('.worn-loadout-grid .worn-slot')].map(e=>{const c=e.querySelector('.worn-slot-choice').getBoundingClientRect(),a=e.querySelector('.actions')?.getBoundingClientRect();return {h:e.getBoundingClientRect().height,beside:!a||a.left>=c.right-1&&a.top<c.bottom,choice:c.width};});return {row:Math.abs(tabs.top-link.top)<20&&Math.abs(tabs.top-help.top)<20,slots,last:Math.max(...[...document.querySelectorAll('.worn-loadout-grid .worn-slot')].map(e=>e.getBoundingClientRect().top)),main:b('.layout>main').bottom};});
 assert(worn.row,'help and skill link share the sub-page row');assert(worn.slots.every(s=>s.beside&&s.h<=130&&s.choice>=200),'slot rows '+JSON.stringify(worn.slots));
 assert(worn.last<worn.main,'the fifth slot starts on the first screen');
 await p.locator('.worn-slot-choice').first().click();await p.waitForFunction(()=>!isEmberwildUIInteracting());assert.equal(await p.locator('.worn-candidate-pane').isVisible(),true);
 await p.evaluate(()=>setTab('skills'));
 const panels=await p.locator('.skill-system-page>section.panel').evaluateAll(es=>es.slice(1,3).map(e=>Math.round(e.getBoundingClientRect().top)));assert.equal(panels[0],panels[1],'trigger and support panels share a row');
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Desktop third pass: material lists fill the width, BOSS costs stay on one line, token filters fold',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 await p.evaluate(()=>{setTab('equipment');setInventoryCategory('materials');});
 const mat=await p.locator('.account-sell-list').last().evaluate(e=>{const items=[...e.children].filter(c=>!c.classList.contains('empty')).map(c=>c.getBoundingClientRect());return {cols:new Set(items.map(b=>Math.round(b.top))).size<items.length,width:items[0]?.width||0,list:e.getBoundingClientRect().width};});
 assert(mat.cols&&mat.width>=220,'materials share rows and fill their column '+JSON.stringify(mat));
 await p.evaluate(()=>setTab('gather'));
 const stock=await p.locator('.life-materials>*').evaluateAll(es=>es.slice(0,3).map(e=>({top:Math.round(e.getBoundingClientRect().top),w:e.getBoundingClientRect().width})));
 assert(stock[0].top===stock[1].top&&stock[0].w>=220,'stock '+JSON.stringify(stock));
 await p.evaluate(()=>setTab('bossCraft'));
 const cost=await p.locator('.boss-recipe .recipe-cost').first().evaluate(e=>{const [a,b]=e.children;return {held:a.getBoundingClientRect().height,gold:b.getBoundingClientRect().height};});
 assert(cost.held<=60&&cost.gold<=30,'cost lines '+JSON.stringify(cost));
 await p.evaluate(()=>{setTab('equipment');setInventoryCategory('tokens');});
 assert.equal(await p.locator('.token-management-panel .gear-basic-filters').isVisible(),false);assert.equal(await p.locator('.token-management-panel .gear-sort-controls').isVisible(),true);
 await p.locator('.token-filter-toggle').click();assert.equal(await p.locator('.token-management-panel .gear-basic-filters').isVisible(),true);
 await p.locator('.token-filter-toggle').click();
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Desktop utility dialogs put 關閉 on the title row',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 for(const open of ["setTab('mailbox')","setTab('achievements')","setTab('options')","setTab('guide')","openAdventureConfig()"]){
  await p.evaluate(()=>closeModal());await p.evaluate(open);
  const b=await p.evaluate(()=>{const m=document.getElementById('modal'),close=m.querySelector('.utility-dialog-controls>button').getBoundingClientRect(),h=m.querySelector('h1'),range=document.createRange(),title=(range.selectNodeContents(h),range.getBoundingClientRect()),first=[...m.children].find(c=>!c.classList.contains('utility-dialog-controls')).getBoundingClientRect();return {overlap:close.top<title.bottom&&close.bottom>title.top-24,firstTop:first.top-m.getBoundingClientRect().top,clear:close.left>=title.right};});
  assert(b.overlap&&b.firstTop<=24&&b.clear,open+' '+JSON.stringify(b));
 }
 await p.locator('#modal .utility-dialog-controls>button').click();assert.equal(await p.evaluate(()=>document.getElementById('modal').open),false);
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Desktop remaining items: the report log starts at the top, quests are one row each, wide screens compare with the worn item',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 await p.evaluate(()=>{setTab('battle');render();});
 const log=await p.evaluate(()=>{const s=document.querySelector('#liveLog .battle-log-stream'),first=s.querySelector('[data-event-type]');return {gap:first?first.getBoundingClientRect().top-s.getBoundingClientRect().top:-1,blanks:[...s.querySelectorAll('.battle-log-empty')].filter(e=>e.getBoundingClientRect().height).length};});
 assert(log.gap>=0&&log.gap<=4&&log.blanks===0,'a short log starts at the top '+JSON.stringify(log));
 await p.evaluate(()=>setTab('quests'));
 const quests=await p.locator('.quest-design-card').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.left),w:Math.round(b.width),h:Math.round(b.height)};}));
 assert(quests.length>=3&&new Set(quests.map(q=>q.x)).size===1&&quests.every(q=>q.h<=100),'one row per quest '+JSON.stringify(quests));
 const placed=await p.locator('.quest-design-card').first().evaluate(e=>{const t=e.querySelector('h2').getBoundingClientRect(),o=e.querySelector('.quest-objectives').getBoundingClientRect(),b=e.querySelector('button').getBoundingClientRect();return o.left>t.left&&b.left>o.right;});
 assert(placed,'title, objectives and button run left to right');
 await p.evaluate(()=>setStoryCategory('side'));
 assert(await p.locator('.quest-design-card').first().evaluate(e=>e.getBoundingClientRect().height<=110),'side quests use the same row');
 await p.evaluate(()=>{setInventoryCategory('equipment');setTab('equipment');});
 assert.equal(await p.locator('.inventory-compare-pane').count(),0,'no comparison column below 1600px');
 await p.setViewportSize({width:1920,height:1080});await p.evaluate(()=>render());
 const pane=p.locator('.inventory-compare-pane');assert.equal(await pane.isVisible(),true);
 const cols=await p.evaluate(()=>['.inventory-master-pane','.inventory-detail-wrap','.inventory-compare-pane'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return {l:b.left,r:b.right,t:Math.round(b.top)};}));
 assert(cols[0].r<=cols[1].l+1&&cols[1].r<=cols[2].l+1&&new Set(cols.map(c=>c.t)).size===1,'three columns side by side '+JSON.stringify(cols));
 assert.match(await pane.innerText(),/與目前穿戴比較[\s\S]*能力/);
 const before=await pane.getAttribute('data-key');
 await p.locator('.gear-management-row').nth(2).locator('.inventory-list-item').click();await p.waitForFunction(()=>!isEmberwildUIInteracting());
 assert.notEqual(await p.locator('.inventory-compare-pane').getAttribute('data-key'),before,'the comparison follows the selection');
 const snapshot=await p.evaluate(()=>JSON.stringify(party.members[0].equipped));await p.evaluate(()=>render());
 assert.equal(await p.evaluate(()=>JSON.stringify(party.members[0].equipped)),snapshot,'comparing changes nothing');
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Desktop fourth pass: five enemies share one row at 1366px; shop products are one compact row with 購買 on the right',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1366,height:768});await setup(p);
 await p.evaluate(()=>{dismissStoryHint();setTab('battle');foes=Array.from({length:5},()=>makeEnemy(0,playerHero(),()=>.5));render();});
 const field=await p.evaluate(()=>{const cards=[...document.querySelectorAll('#battleEnemyIcons>.seconds-unit')];return {n:cards.length,rows:new Set(cards.map(e=>Math.round(e.getBoundingClientRect().top))).size,w:Math.min(...cards.map(e=>e.getBoundingClientRect().width)),ally:Math.max(...[...document.querySelectorAll('#battleAllyIcons>.seconds-unit')].map(e=>e.getBoundingClientRect().bottom)),main:document.querySelector('.layout>main').getBoundingClientRect().bottom};});
 assert.equal(field.n,5);assert.equal(field.rows,1,'one enemy row '+JSON.stringify(field));assert(field.w>=140,'enemy cards stay readable');assert(field.ally<=field.main,'the party stays on screen');
 await p.evaluate(()=>setTab('shop'));
 for(const index of [0,2]){
  await p.locator('.shop-category-tabs>button').nth(index).click();
  const row=await p.locator('.shop-product-row').first().evaluate(e=>{const slot=e.querySelector('.item-slot').getBoundingClientRect(),buy=[...e.querySelectorAll('button')].pop().getBoundingClientRect();return {h:e.getBoundingClientRect().height,beside:buy.left>=slot.right-1&&buy.top<slot.bottom+30};});
  assert(row.h<=90&&row.beside,'shop row '+index+' '+JSON.stringify(row));
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Narrow desktop (1024px): three allies share one row and five narrow enemy cards keep HP and shield readable',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await p.setViewportSize({width:1024,height:768});await setup(p);
 await p.evaluate(()=>{dismissStoryHint();setTab('battle');foes=Array.from({length:5},()=>makeEnemy(0,playerHero(),()=>.5));render();});
 const b=await p.evaluate(()=>{const rows=s=>new Set([...document.querySelectorAll(s)].map(e=>Math.round(e.getBoundingClientRect().top))).size;
  const nums=[...document.querySelectorAll('#battleEnemyIcons .unit-numbers')].map(e=>({over:e.scrollHeight-e.clientHeight,lines:[...e.children].map(c=>Math.round(c.getBoundingClientRect().top))}));
  return {allyRows:rows('#battleAllyIcons>.seconds-unit'),enemyRows:rows('#battleEnemyIcons>.seconds-unit'),nums,ally:Math.max(...[...document.querySelectorAll('#battleAllyIcons>.seconds-unit')].map(e=>e.getBoundingClientRect().bottom)),main:document.querySelector('.layout>main').getBoundingClientRect().bottom};});
 assert.equal(b.allyRows,1);assert.equal(b.enemyRows,1);
 assert(b.nums.every(n=>n.over<=1&&n.lines.length===2&&n.lines[0]!==n.lines[1]),'HP and shield wrap without overlap '+JSON.stringify(b.nums[0]));
 assert(b.ally<=b.main+1,'the party stays on screen');
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
