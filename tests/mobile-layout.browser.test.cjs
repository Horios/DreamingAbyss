const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
const pages=['battle','statistics','shop','guide','roster','partnerRoster','character','skills','equipment','worn','forge','bossCraft','quests','gather','alchemy','story'];
const navPages=[['battle','battle'],['statistics','statistics'],['shop','shop'],['roster','roster'],['partnerRoster','partnerRoster'],['character','character'],['skills','skills'],['equipment','equipment'],['worn','worn'],['forge','forge'],['bossCraft','bossCraft'],['story-main','story'],['story-side','story'],['story-npc','story'],['quests','quests'],['gather','gather'],['alchemy','alchemy']];
async function start(page){
 await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();});
 await page.waitForTimeout(60);await page.evaluate(()=>closeModal());
 // A real, saved offline receipt is modal and intentionally intercepts input.
 // UI-layout tests must acknowledge it, not bypass pointer-event checks.
 await page.waitForFunction(()=>!EmberwildOffline.busy,{},{timeout:30000});
 const offline=await page.evaluate(()=>{const el=document.getElementById('offline-settlement'),c=party?.offlineExploration;return {visible:!!el&&!el.hidden,complete:!!c?.receipt?.complete,failed:EmberwildOffline.failed};});
 if(offline.visible){
  assert(offline.complete&&!offline.failed,'unexpected unfinished offline settlement during UI setup: '+JSON.stringify(offline));
  assert.equal(await page.evaluate(()=>acknowledgeOfflineExploration()),true,'acknowledge saved offline receipt before UI interactions');
 }
}
async function fits(page,label){
 const b=await page.evaluate(()=>{
  const m=document.querySelector('.layout>main'),layout=document.querySelector('#app>.layout'),nav=document.querySelector('.layout>aside'),journal=document.querySelector('#globalBattleJournal');
  return {inline:journal.classList.contains('mobile-inline-battle-journal'),viewport:innerWidth,layoutWidth:layout.getBoundingClientRect().width,mainWidth:m.clientWidth,mainScroll:m.scrollWidth,mainHeight:m.clientHeight,mainBottom:m.getBoundingClientRect().bottom,journalTop:journal.getBoundingClientRect().top,journalBottom:journal.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,navBottom:nav.getBoundingClientRect().bottom,height:innerHeight};
 });
 assert(b.layoutWidth<=b.viewport+1,label+' layout width '+JSON.stringify(b));
 assert(b.mainScroll<=b.mainWidth+1,label+' horizontal overflow '+JSON.stringify(b));
 assert(b.mainHeight>=90,label+' readable main height '+JSON.stringify(b));
 if(b.inline)assert(b.mainBottom<=b.navTop+1,label+' inline journal stays in the scrollable main area');
 else{assert(b.mainBottom<=b.journalTop+1,label+' journal overlaps content');assert(b.journalBottom<=b.navTop+1,label+' nav overlaps journal');}
 assert(Math.abs(b.navBottom-b.height)<=1,label+' nav at viewport bottom');
}

test('Mobile: all game pages fit small phones, larger phones, tablets and landscape',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await start(p);
  for(const viewport of [{width:320,height:640},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:844,height:390}]){
   await p.setViewportSize(viewport);
   for(const id of pages){
    await p.evaluate(t=>{setTab(t);document.querySelectorAll('main details').forEach(d=>d.open=true);},id);
    await fits(p,viewport.width+' '+id);
    const scroll=await p.locator('main').evaluate(e=>{e.scrollTop=e.scrollHeight;return {at:e.scrollTop,max:e.scrollHeight-e.clientHeight};});
    assert(Math.abs(scroll.at-scroll.max)<=1,id+' can reach page bottom');
   }
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: all existing navigation works through shortcuts and the More menu during redraws',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:390,height:844});await start(p);
  assert.equal(await p.locator('aside nav>button:visible').count(),5);
  for(const [id,target] of navPages){
   // A category remembers its last sub-page. Opening More redraws navigation,
   // so data-page can change between locating and clicking the category.
   const group=await p.evaluate(id=>EmberwildNavigation.design.groups.find(g=>g.pages.some(x=>x.id===id))?.id,id);
   const category=p.locator(`aside nav [data-nav-group="${group}"]`);
   if(!await category.isVisible())await p.locator('.mobile-more-toggle').click();
   await category.click();
   // The interaction guard defers rebuilding content until the click finishes.
   await p.waitForFunction(()=>!isEmberwildUIInteracting());
   const subpage=p.locator(`main .game-subtabs [data-subpage="${id}"]`);
   if(await subpage.count())await subpage.click();
   await p.waitForFunction(t=>tab===t,target);
   assert.equal(await p.locator('.mobile-more-pages').isVisible(),false);
   assert.equal(await p.locator('aside nav>button:visible').count(),5);
  }
  // The adventure guide lives in the header beside Save on phones too.
  await p.locator('#utilityButton-guide').click();assert.equal(await p.evaluate(()=>isUtilityDialogOpen('guide')),true);await p.evaluate(()=>closeModal());
  await p.locator('.mobile-more-toggle').click();
  await p.evaluate(()=>render());
  assert.equal(await p.locator('.mobile-more-pages').isVisible(),true);
  await p.keyboard.press('Escape');assert.equal(await p.locator('.mobile-more-pages').isVisible(),false);
  await p.locator('.mobile-more-toggle').click();await p.locator('main h1').click();
  assert.equal(await p.locator('.mobile-more-pages').isVisible(),false);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: folding the live journal preserves combat, filters, loot and page scrolling',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:390,height:844});await start(p);
  await p.evaluate(()=>{setTab('character');document.querySelector('main').scrollTop=220;});
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),false);
  await p.locator('.mobile-journal-toggle').click();
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),true);
  await p.locator('.journal-filter select').selectOption('item');
  await p.evaluate(()=>render());
  assert.equal(await p.locator('.mobile-journal-toggle').getAttribute('aria-expanded'),'true');
  assert.equal(await p.locator('.journal-filter select').inputValue(),'item');
  assert.equal(await p.locator('main').evaluate(e=>e.scrollTop),220);
  await p.locator('.mobile-loot-toggle').click();
  await p.waitForFunction(()=>!isEmberwildUIInteracting());
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),false);
  assert.equal(await p.locator('#mobileLootBody').isVisible(),true);
  await p.evaluate(()=>{expeditionLoot.items.set('手機測試素材',{count:3,rar:1});refreshGlobalJournal();});
  assert.equal(await p.locator('#mobileLootBody details').count(),0);
  await p.waitForFunction(()=>document.querySelector('#journalLootList').textContent.includes('手機測試素材'));
  await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop=e.scrollHeight);
  await p.waitForTimeout(30);
  const lootScroll=await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop);
  await p.evaluate(()=>refreshGlobalJournal());
  assert.equal(await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop),lootScroll);
  await p.locator('.mobile-loot-toggle').click();
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),false);
  // Layout interactions can leave a throttled wall-clock catch-up pending.
  await p.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);toggleBattle();clearInterval(timer);render();});
  assert.equal(await p.evaluate(()=>running),true);
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),false);
  await p.locator('.mobile-journal-toggle').click();
  await p.locator('.journal-actions button[onclick="stopTeamExploration()"]').click();
  await p.waitForFunction(()=>!running);
  await p.setViewportSize({width:844,height:390});await fits(p,'landscape open journal');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Responsive: title, creation, utility dialogs and desktop layout stay usable',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:320,height:640});
  assert.equal(await p.locator('.title-screen').isVisible(),true);
  assert.equal(await p.locator('.mobile-journal-toggle').count(),0);
  await p.evaluate(()=>selectSaveSlot(1));
  assert.equal(await p.locator('.start').isVisible(),true);
  assert(await p.locator('.start').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await p.evaluate(()=>{start(0);clearInterval(timer);closeModal();});await p.waitForTimeout(60);await p.evaluate(()=>closeModal());
  for(const id of ['mailbox','achievements','options']){
   const overlay=await p.evaluate(()=>{const el=document.getElementById('offline-settlement'),c=party?.offlineExploration;return {visible:!!el&&!el.hidden,receipt:!!c?.receipt?.complete,stage:c?.status};});
   if(overlay.visible){
    assert(overlay.receipt,'offline dialog must have a completed reward receipt: '+JSON.stringify(overlay));
    assert.equal(await p.evaluate(()=>acknowledgeOfflineExploration()),true);
   }
   await p.locator('#utilityButton-'+id).click();
   const b=await p.locator('#modal').boundingBox();assert(b.x>=0&&b.x+b.width<=320&&b.height<=640,id+' fits');
   await p.getByRole('button',{name:'關閉彈窗',exact:true}).click();
  }
  await p.locator('#utilityButton-wishingLake').click();
  const lakeBox=await p.locator('#modal').boundingBox();assert(lakeBox.x>=0&&lakeBox.x+lakeBox.width<=320&&lakeBox.height<=640,'locked wishing lake fits on mobile');
  assert.match(await p.locator('#modal').innerText(),/通過第一片冒險區域/);
  assert.equal(await p.locator('#modal .lake-confirm').count(),0,'new characters cannot offer before the first clear');
  await p.locator('#modal').getByRole('button',{name:'關閉',exact:true}).click();
  await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>setTab('battle'));
  assert.equal(await p.locator('.mobile-journal-toggle').isVisible(),false);
  assert.equal(await p.locator('.mobile-more-toggle').isVisible(),false);
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),true);
  const order=await p.locator('aside nav .game-menu-item:visible').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.navGroup,x:e.getBoundingClientRect().x,y:Math.round(e.getBoundingClientRect().y)})).sort((a,b)=>a.y-b.y||a.x-b.x).map(e=>e.id));
  const designed=await p.evaluate(()=>[...EmberwildNavigation.design.groups.map(g=>g.id),'settings']);
  assert.deepEqual(order,designed,'desktop top menu follows the configured categories');
  assert.equal(await p.locator('#utilityButton-wishingLake').isVisible(),true,'the wishing lake keeps its header entrance');
  const rects=await p.evaluate(()=>['aside','main','#globalBattleJournal'].map(s=>{const r=document.querySelector('.layout').querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));
  assert(rects[0].bottom<=rects[1].y+1&&rects[0].bottom<=rects[2].y+1,'desktop menu sits above the content');assert(rects[1].right<=rects[2].x,'content and journal stay side by side');
  await p.evaluate(()=>returnToTitle());assert.equal(await p.locator('.mobile-more-toggle').count(),0);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: expedition settings, readable touch controls and skill details are within reach',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:390,height:844});await start(p);
  await p.evaluate(()=>{const b=document.createElement('div');b.id='preview-build-banner';b.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483647;padding:6px 10px;font:700 12px/1.2 system-ui';b.textContent='測試版本 · chatgpt-dev';document.body.prepend(b);});
  const banner=await p.locator('#preview-build-banner').boundingBox(),utilities=await p.locator('#utilityNavigation').boundingBox();
  assert(banner.y+banner.height<=utilities.y,'preview label does not cover utility buttons');
  await p.evaluate(()=>setTab('battle'));
  assert.equal(await p.locator('.exploration-secondary-settings>details:last-child').evaluate(d=>d.open),false);
  const layout=await p.evaluate(()=>{const card=document.querySelector('.expedition-control-card'),action=card.querySelector('.exploration-primary-actions button');return {settings:card.getBoundingClientRect().top,battle:document.querySelector('.party-combat').getBoundingClientRect().top,start:action.getBoundingClientRect().toJSON(),controls:card.getBoundingClientRect().toJSON()};});
  assert(layout.battle<layout.settings,'the central battlefield precedes detailed adventure settings');assert(layout.start.height>=40,'exploration start control remains touchable');assert(layout.start.left>=layout.controls.left-1&&layout.start.right<=layout.controls.right+1,'start control stays inside panel');
  for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390}]){
   await p.setViewportSize(viewport);
   await p.locator('.exploration-secondary-settings>details:last-child>summary').click();
   assert.equal(await p.locator('.exploration-secondary-settings>details:last-child').evaluate(d=>d.open),true);
   await fits(p,'expanded settings '+viewport.width);
   await p.locator('.control-row select[aria-label="探索難度"]').selectOption('1');
   await p.waitForFunction(()=>party.difficulty===1&&!isEmberwildUIInteracting());
   await p.evaluate(()=>render());
   assert.equal(await p.locator('.exploration-secondary-settings>details:last-child').evaluate(d=>d.open),true);
   for(const button of ['.heal-auto-settings-button','.battle-effects-bar button']){
    assert(await p.locator(button).evaluate(e=>e.getBoundingClientRect().height>=40),button+' touch height');
   }
   await p.locator('.exploration-secondary-settings>details:last-child>summary').click();
  }
  await p.setViewportSize({width:390,height:844});
  await p.locator('.exploration-secondary-settings>details:last-child>summary').click();
  await p.locator('.heal-auto-settings-button').click();
  assert.equal(await p.locator('#modal').isVisible(),true);
  const healing=await p.locator('#modal').boundingBox();assert(healing.x>=0&&healing.x+healing.width<=390);
  await p.evaluate(()=>closeModal());
  await p.evaluate(()=>setTab('roster'));
  const heading=await p.evaluate(()=>({title:document.querySelector('.mobile-roster-heading').getBoundingClientRect().top,plan:document.querySelector('.team-plan-panel').getBoundingClientRect().top}));assert(heading.title<heading.plan);
  await p.setViewportSize({width:1440,height:900});
  // The layout swaps headings on the resize redraw; wait for it instead of counting immediately.
  await p.locator('.companion-management-page>.heading').first().waitFor({state:'attached',timeout:10000});
  assert.equal(await p.locator('.companion-management-page>.heading').count(),1,'desktop restores its original heading');
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>setTab('skills'));
  const skillsBefore=await p.evaluate(()=>playerHero().skills.slice());
  await p.locator('[data-skill-slot="active:0"]').click();
  assert.equal(await p.locator('#modal .skill-candidate-list').isVisible(),true);
  assert(await p.locator('#modal [data-skill-id]').count()>0,'learned skills can be inspected without equipping');
  await p.evaluate(()=>closeModal());
  assert.deepEqual(await p.evaluate(()=>playerHero().skills),skillsBefore,'viewing a skill does not learn it');
  await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>setTab('battle'));
  assert.equal(await p.locator('.expedition-control-card').isVisible(),true,'desktop exploration controls remain visible');
  assert.equal(await p.locator('.exploration-secondary-settings>details:last-child>summary').isVisible(),true,'difficulty controls remain discoverable');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: long combat names, stats, skills and effects grow without overlapping adjacent units',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await start(p);
  await p.evaluate(()=>{toggleBattle();clearInterval(timer);for(const h of heroes())h.name='手機長名稱測試角色與職業';const f=structuredClone(foes[0]);foes=Array.from({length:6},(_,i)=>({...structuredClone(f),id:f.id+'-mobile-'+i,name:'菁英長名稱怪物與屬性測試'+i}));});
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:600,height:800},{width:768,height:1024},{width:844,height:390}]){
   await p.setViewportSize(viewport);
   await p.evaluate(()=>{setTab('battle');document.querySelectorAll('.unit-skills').forEach(e=>e.insertAdjacentHTML('beforeend','<div>主動與觸發技能的長名稱狀態文字測試</div>'.repeat(3)));document.querySelectorAll('.unit-effects').forEach(e=>e.insertAdjacentHTML('beforeend','<span class="tag">持續增益與減益狀態的長名稱</span>'.repeat(6)));});
   const issues=await p.evaluate(()=>{
    const errors=[],box=e=>e.getBoundingClientRect(),allies=box(document.querySelector('.squad-allies')),enemies=box(document.querySelector('.squad-enemies'));
    if(enemies.bottom>allies.top+1)errors.push('enemies overlap allies');
    for(const unit of document.querySelectorAll('.squad-field .unit')){
     const u=box(unit);let bottom=u.top;
     // Stacked cards overlay their faces in one cell: check the visible face as one block and its own
     // children for clipping; hidden faces are not part of the layout flow.
     const visibleFaces=[...unit.children].filter(c=>c.matches('.seconds-face')&&getComputedStyle(c).visibility!=='hidden');
     for(const face of visibleFaces)for(const part of face.children)if(part.matches('.unit-title,.unit-numbers,.seconds-face-title')&&(part.scrollHeight>part.clientHeight+1||part.scrollWidth>part.clientWidth+1))errors.push(part.className+' clips text');
     for(const child of unit.children){
      if(child.matches('.seconds-face')&&!visibleFaces.includes(child))continue;
      if(child.matches('.battle-enemy-icon,.battle-fx,.battle-fx-status'))continue;
      const r=box(child);if(!r.width||!r.height)continue;
      if(r.top<bottom-1||r.bottom>u.bottom+1||r.right>u.right+1)errors.push(child.className+' overlaps or escapes unit');
      if(child.matches('.unit-title,.unit-numbers,.unit-skills,.unit-effects,.enemy-action-status')&&(child.scrollHeight>child.clientHeight+1||child.scrollWidth>child.clientWidth+1))errors.push(child.className+' clips text');
      bottom=r.bottom;
     }
    }
    return errors;
   });
   assert.deepEqual(issues,[],viewport.width+' combat flow');
   await fits(p,'combat content '+viewport.width);
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: equipment icons, full names and ratings do not become independently scrollable',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await start(p);
  for(const width of [320,390,768]){
   await p.setViewportSize({width,height:844});
   for(const id of ['equipment','forge','worn']){
    await p.evaluate(t=>{setTab(t);document.querySelectorAll('main details').forEach(d=>d.open=true);document.querySelectorAll('main .enhanced-name').forEach(e=>e.textContent='+99 超長前綴與後綴裝備名稱完整顯示測試');},id);
    const issues=await p.evaluate(()=>{
     const errors=[];
     for(const e of document.querySelectorAll('main .inventory-list-name,main .forge-gear-name,main .inventory-list-meta,main .forge-gear-meta,main .equipment-attribute-list,main .gear-detail-header h2,main .inventory-detail-heading h2,main .worn-slot-choice')){
      if(!e.getBoundingClientRect().height)continue;
      e.scrollTop=100;
      if(e.scrollTop!==0||e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1)errors.push(e.className||e.tagName);
     }
     for(const row of document.querySelectorAll('.inventory-list-item,.forge-gear-item')){
      const r=row.getBoundingClientRect();for(const c of row.children){const b=c.getBoundingClientRect();if(b.bottom>r.bottom+1||b.right>r.right+1)errors.push(c.className+' escapes row');}
     }
     return errors;
    });
    assert.deepEqual(issues,[],width+' '+id+' full equipment text');
    await fits(p,'equipment content '+width+' '+id);
   }
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Mobile: messages and loot are sibling panels without shared or nested scrolling',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:390,height:844});await start(p);
  await p.evaluate(()=>{for(let i=0;i<45;i++)note('手機長戰報 '+i+' · 玩家造成傷害與狀態文字完整顯示','playerDamage');for(let i=0;i<30;i++)expeditionLoot.items.set('素材 '+i,{count:i+1,rar:0});journalLootOpen=true;render();});
  await p.locator('.mobile-journal-toggle').click();
  const scrollAreas=()=>[...document.querySelectorAll('#mobileJournalBody *')].filter(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className);
  assert.deepEqual(await p.evaluate(scrollAreas),[],'no nested vertical scroll areas');
  assert(await p.locator('#mobileJournalBody').evaluate(e=>e.scrollHeight>e.clientHeight));
  const latestVisible=()=>{const body=document.getElementById('mobileJournalBody'),last=body.querySelector('.battle-log-stream').lastElementChild,b=body.getBoundingClientRect(),r=last.getBoundingClientRect();return r.bottom<=b.bottom+2&&r.bottom>=b.top;};
  assert(await p.evaluate(latestVisible),'opening shows the latest log');
  await p.evaluate(()=>note('新增最新訊息','playerDamage'));
  assert(await p.evaluate(latestVisible),'new messages keep following');
  await p.locator('#mobileJournalBody').scrollIntoViewIfNeeded();
  const journalBox=await p.locator('#mobileJournalBody').boundingBox();
  await p.mouse.move(journalBox.x+journalBox.width/2,journalBox.y+journalBox.height/2);
  await p.mouse.wheel(0,-3000);await p.waitForTimeout(80);
  const logState=()=>{const body=document.getElementById('mobileJournalBody'),stream=body.querySelector('.battle-log-stream');return {top:body.scrollTop,height:body.scrollHeight,client:body.clientHeight,display:getComputedStyle(body).display,innerTop:stream.scrollTop,auto:stream.dataset.autoScroll,generation:stream.dataset.logGeneration,expectedGeneration:battleLogGeneration};};
  const before=await p.evaluate(logState);
  assert.equal(before.top,0,'a real wheel gesture can scroll the outer journal to the beginning');
  await p.evaluate(()=>{note('回看時不得拉走畫面','playerDamage');refreshGlobalJournal();});
  const after=await p.evaluate(logState);
  if(after.top!==0)console.log('MOBILE_JOURNAL_SCROLL_DIAGNOSTIC',JSON.stringify({before,after}));
  assert.equal(after.top,0);
  await p.locator('.journal-filter select').selectOption('playerDamage');
  await p.waitForFunction(()=>!isEmberwildUIInteracting());
  assert(await p.evaluate(latestVisible),'filter changes show the latest matching log');
  assert.equal(await p.locator('#mobileJournalBody #journalLootList,#mobileJournalBody .journal-quick-dispose').count(),0);
  assert.equal(await p.locator('#mobileLootBody #liveLog').count(),0);
  const siblings=await p.evaluate(()=>document.getElementById('mobileJournalBody').parentElement.parentElement===document.getElementById('mobileLootBody').parentElement.parentElement);
  assert(siblings,'panels are siblings');
  await p.locator('.mobile-loot-toggle').click();
  assert.equal(await p.locator('#mobileJournalBody').isVisible(),false);
  assert.equal(await p.locator('#mobileLootBody').isVisible(),true);
  assert.equal(await p.locator('#mobileLootBody details').count(),0,'loot has no second disclosure');
  assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#mobileLootBody *')].filter(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className)),[]);
  await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop=e.scrollHeight);await p.waitForTimeout(30);
  const top=await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop);
  await p.evaluate(()=>{note('閱讀戰利品時不強制跳走','playerDamage');refreshGlobalJournal();});
  assert.equal(await p.locator('#mobileLootBody').evaluate(e=>e.scrollTop),top);
  assert.equal(await p.locator('.journal-quick-dispose').count(),0,'equipment dismantling is managed in inventory, not the journal');
  for(const viewport of [{width:320,height:640},{width:844,height:390}]){
   await p.setViewportSize(viewport);await fits(p,'separate loot '+viewport.width);
   assert(await p.locator('#globalBattleJournal').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'no shared outer scroll');
  }
  await p.locator('.mobile-journal-toggle').click();
  assert.equal(await p.locator('#mobileLootBody').isVisible(),false);
  await fits(p,'separate journal landscape');
  await p.setViewportSize({width:1440,height:900});
  assert.equal(await p.locator('.mobile-loot-toggle').isVisible(),false);
  assert.equal(await p.locator('.journal-loot-compact').count(),1,'desktop keeps its loot disclosure');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Journal: loot collapse survives immediate redraws, queued toggle events and repeated clicks',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:1440,height:900});await start(p);
  await p.evaluate(()=>{for(let i=0;i<20;i++)expeditionLoot.items.set('摺疊測試素材 '+i,{count:i+1,rar:0});});
  for(const open of [false,true,false,true]){
   const immediate=await p.evaluate(open=>{
    journalLootOpen=open;render();
    document.querySelector('.journal-loot-compact summary').click();
    const committed=journalLootOpen;refreshGlobalJournal();render();
    return {committed,dom:document.querySelector('.journal-loot-compact').open};
   },open);
   assert.deepEqual(immediate,{committed:!open,dom:!open},'commit the click before redraw');
   await p.waitForTimeout(40);
   assert.deepEqual(await p.evaluate(()=>({saved:journalLootOpen,dom:document.querySelector('.journal-loot-compact').open})),{saved:!open,dom:!open},'detached toggle events cannot overwrite intent');
  }
  await p.locator('.journal-loot-compact summary').focus();await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(()=>journalLootOpen),true,'keyboard can expand');
  await p.evaluate(()=>document.getElementById('journalLootList').click());assert.equal(await p.evaluate(()=>journalLootOpen),true,'loot content clicks do not toggle');
  await p.locator('.journal-loot-compact summary').focus();await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(()=>journalLootOpen),false,'keyboard can collapse');
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:900});
   const selector=width===390?'.mobile-loot-toggle':'.journal-loot-compact summary';
   for(let i=0;i<4;i++){
    // A real pointer hits the current node even when every animation-frame
    // stability check would see a replacement from the 30 ms refresh loop.
    await p.evaluate(()=>clearInterval(globalThis.foldRefresh));
    await p.waitForFunction(()=>!isEmberwildUIInteracting());
    await p.locator(selector).waitFor({state:'visible'});await p.locator(selector).scrollIntoViewIfNeeded();
    const box=await p.evaluate(sel=>{const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect(),css=getComputedStyle(el);return css.display!=='none'&&r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;},selector);
    if(!box)console.log('JOURNAL_FOLD_HEADER_DIAG',JSON.stringify(await p.evaluate(sel=>({viewport:innerWidth,matched:matchMedia('(max-width:900px)').matches,node:!!document.querySelector(sel),display:document.querySelector(sel)?getComputedStyle(document.querySelector(sel)).display:null,html:document.getElementById('globalBattleJournal')?.className}),selector)));
    assert(box,width+' click '+i+' has a visible header');
    await p.evaluate(()=>globalThis.foldRefresh=setInterval(()=>refreshGlobalJournal(),30));
    await p.mouse.click(box.x+box.width/2,box.y+box.height/2,{delay:80});await p.waitForTimeout(60);
    const expected=i%2===0;
    if(width===390){assert.equal(await p.locator('#mobileLootBody').isVisible(),expected);assert.equal(await p.locator(selector).getAttribute('aria-expanded'),String(expected));}
    else assert.deepEqual(await p.evaluate(()=>({saved:journalLootOpen,dom:document.querySelector('.journal-loot-compact').open})),{saved:expected,dom:expected});
   }
   await p.evaluate(()=>clearInterval(foldRefresh));
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
