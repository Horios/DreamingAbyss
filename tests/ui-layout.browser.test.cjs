const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
const sizes=[[1920,1080],[1366,768],[1024,768],[768,1024],[390,844],[320,568],[844,390]];
const pages=['character','roster','partnerRoster','skills','equipment','inventory:materials','inventory:items','inventory:tokens','worn','forge','bossCraft','shop','story','story:side','story:npc','quests','gather','alchemy','statistics','battle'];
async function setup(p){
 await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();});
 await p.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);if(EmberwildOffline.failed)throw Error('offline setup failed');if(party.offlineExploration?.receipt?.complete)acknowledgeOfflineExploration();closeModal();clearInterval(timer);});
}
function showPage(id){if(id.startsWith('inventory:')){setTab('equipment');setInventoryCategory(id.split(':')[1]);}else if(id.startsWith('story:'))setStoryCategory(id.split(':')[1]);else{if(id==='equipment')setInventoryCategory('equipment');setTab(id);}}
function bounds(){
 const m=document.querySelector('main'),nav=document.querySelector('.layout>aside'),s=getComputedStyle(m);
 return {overflow:m.scrollWidth-m.clientWidth,padding:parseFloat(s.paddingLeft),expected:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-padding')),bottom:m.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,headings:[...m.querySelectorAll('.heading')].filter(e=>e.getBoundingClientRect().height).map(e=>({height:e.clientHeight,scroll:e.scrollHeight})),scroll:s.overflowY};
}
test('Shared layout: every page fits seven viewports in all three themes, with reachable page bottoms',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await setup(p);
 for(const theme of ['ember','forest','paper']){
  await p.evaluate(t=>setUITheme(t),theme);
  for(const [width,height]of sizes){await p.setViewportSize({width,height});
   for(const id of pages){await p.evaluate(()=>closeModal());await p.evaluate(showPage,id);const b=await p.evaluate(bounds),label=`${theme} ${width}x${height} ${id}`;
    assert(b.overflow<=1,label+' horizontal overflow '+b.overflow);assert.equal(b.padding,b.expected,label+' page inset');
    assert(b.bottom<=b.navTop+1,label+' bottom navigation covers the page');
    const flow=await p.locator('main').evaluate(e=>({display:getComputedStyle(e).display,gap:parseFloat(getComputedStyle(e).rowGap)}));assert.equal(flow.display,'flex',label+' main applies section spacing');assert(flow.gap>=12,label+' section spacing');
    assert(b.headings.every(h=>h.scroll<=h.height+2),label+' clipped heading');
    const end=await p.locator('main').evaluate(e=>{e.scrollTop=e.scrollHeight;return {at:e.scrollTop,max:e.scrollHeight-e.clientHeight};});
    assert(Math.abs(end.at-end.max)<=1,label+' unreachable page bottom');
   }
  }
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('Long reading content and expanded rosters use the page scroll; inventory selection retains its list scroll',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await setup(p);
 await p.evaluate(()=>{for(let i=0;i<80;i++)state.bag.push(gear(1,i%4,i%4,0));save();});
 for(const [width,height]of [[1366,768],[768,1024],[320,568]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>{setTab('partnerRoster');document.querySelectorAll('main details').forEach(e=>e.open=true);});
  const roster=await p.locator('.partner-owned-list').evaluate(e=>({overflow:getComputedStyle(e).overflowY,width:e.closest('.roster-page').getBoundingClientRect().width,available:document.querySelector('.companion-management-page').clientWidth}));
  assert.equal(roster.overflow,'visible');assert(Math.abs(roster.width-roster.available)<=1);
  const spacing=await p.locator('.companion-management-page').evaluate(e=>{const h=e.querySelector('.heading'),panel=e.querySelector('.roster-page');return panel.getBoundingClientRect().top-h.getBoundingClientRect().bottom;});assert(spacing<=17,'roster rows do not stretch into blank space');
  await p.evaluate(()=>setTab('story'));
  await p.evaluate(()=>{const list=document.querySelector('.story-list');for(let i=0;i<12;i++){const e=list.firstElementChild.cloneNode(true);e.querySelector('h2').textContent='很長的任務名稱與說明'.repeat(8);list.append(e);}});
  const story=await p.evaluate(()=>{const m=document.querySelector('main');m.scrollTop=m.scrollHeight;const last=m.querySelector('.story-list').lastElementChild;return {bottom:last.getBoundingClientRect().bottom,end:m.getBoundingClientRect().bottom,overflow:m.scrollWidth-m.clientWidth};});
  assert(story.bottom<=story.end+1);assert(story.overflow<=1);
  await p.evaluate(()=>setTab('equipment'));
  assert.equal(await p.locator('.page-owner-content').evaluate(e=>getComputedStyle(e).overflowY),'visible','inventory has no owner-panel scroll around the list');
  const list=p.locator('.inventory-list-scroll'),item=list.locator('.gear-management-row').nth(3).locator('.item-slot');
  await item.scrollIntoViewIfNeeded();const before=await list.evaluate(e=>e.scrollTop);await item.click();
  await p.waitForFunction(()=>!isEmberwildUIInteracting());
  assert(Math.abs(await list.evaluate(e=>e.scrollTop)-before)<=1,'selecting gear keeps the list position at '+width+' (before '+before+', after '+await list.evaluate(e=>e.scrollTop)+')');
  const panes=await p.locator('.inventory-master-detail').evaluate(e=>({stack:getComputedStyle(e).display,list:e.querySelector('.inventory-master-pane').getBoundingClientRect().right,detail:e.querySelector('.inventory-detail-wrap').getBoundingClientRect().left}));
  if(width<=900)assert.equal(panes.stack,'flex');else assert(panes.detail>=panes.list);
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('Utility dialogs keep readable scroll regions and skill catalog names wrap without hiding text',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await setup(p);
 for(const [width,height]of [[1366,768],[768,1024],[390,844],[320,568],[844,390]]){
  await p.setViewportSize({width,height});
  for(const id of ['mailbox','achievements','options','guide','wishingLake']){
   await p.evaluate(t=>{closeModal();setTab(t);},id);
   const d=await p.locator('#modal').evaluate(e=>({open:e.open,width:e.scrollWidth-e.clientWidth,height:e.getBoundingClientRect().height,viewport:innerHeight,overflow:getComputedStyle(e).overflowY}));
   assert(d.open,id+' opens');assert(d.width<=1,id+' fits width');assert(d.height<=d.viewport,id+' fits height');assert.equal(d.overflow,'auto');
   if(id==='achievements')assert.equal(await p.locator('.achievement-list').evaluate(e=>getComputedStyle(e).overflowY),'visible');
   await p.evaluate(()=>closeModal());
  }
  await p.evaluate(()=>setTab('skills'));await p.getByRole('button',{name:'技能圖鑑',exact:true}).click();
  const name=p.locator('.skill-catalog-text b').first();await name.evaluate(e=>e.textContent='長技能名稱'.repeat(12));
  const b=await name.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,white:getComputedStyle(e).whiteSpace}));assert(b.scroll<=b.width+1);assert.equal(b.white,'normal');
  await p.evaluate(()=>closeModal());
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Deployed preview badge leaves utility buttons reachable at every viewport',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await setup(p);
 await p.evaluate(version=>document.body.insertAdjacentHTML('afterbegin','<div id="preview-build-banner" style="position:fixed;top:8px;right:8px;z-index:2147483647;padding:6px 10px;border-radius:4px;background:#8b3a2b;color:#fff;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 1px 4px #0008;">測試版本 '+version+'</div>'),require('../data/preview-version.json').version);
 for(const [width,height]of sizes){await p.setViewportSize({width,height});
  const covered=await p.locator('#utilityNavigation>button').evaluateAll(es=>{const a=document.getElementById('preview-build-banner').getBoundingClientRect();return es.filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&b.left<a.right&&b.right>a.left&&b.top<a.bottom&&b.bottom>a.top;}).map(e=>e.textContent);});
  assert.deepEqual(covered,[],width+' badge covers utility buttons');
  const b=await p.evaluate(bounds);assert(b.overflow<=1);assert(b.bottom<=b.navTop+1);
  await p.locator('#utilityButton-guide').click();assert.equal(await p.evaluate(()=>isUtilityDialogOpen('guide')),true);await p.evaluate(()=>closeModal());
  await p.locator('#utilityButton-save').click();
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Long mailbox lists preserve visible desktop detail and reachable mobile mail actions',async()=>{
 const r=await openRuntime(root),p=r.page;
 try{await setup(p);
 const saved=await p.evaluate(()=>{for(let i=0;i<30;i++)party.mailbox.messages.push({id:++party.mailbox.serial,rewardKey:'starter-0-'+(i+10),subject:'信件 '+i,body:'完整信件內容',at:Date.now()+i,read:true,claimed:true,attachments:[{type:'catalogue',kind:'item',key:'heal_small',quantity:1,name:'簡易治療藥水'}]});return save();});assert.equal(saved,true,'mail fixtures use the real validated save contract');
 for(const [width,height]of [[1366,768],[1024,768],[390,844],[320,568]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>{closeModal();setTab('mailbox');});
  assert.equal(await p.locator('.mailbox-list-item').count(),31,'all saved mail remains available');
  const item=p.locator('.mailbox-list-item').last(),id=await item.getAttribute('data-mail-id');await item.click();
  const detail=p.locator('.mailbox-detail');await p.waitForFunction(id=>document.querySelector('.mailbox-detail')?.dataset.mailDetail===id,id);
  const visible=await detail.evaluate(e=>{const b=e.getBoundingClientRect(),m=e.closest('dialog').getBoundingClientRect();return b.top>=m.top&&b.top<m.bottom;});
  if(width>700)assert(visible,'selecting the last mail keeps desktop detail in view');
  await detail.locator('.mail-lock').scrollIntoViewIfNeeded();const before=await detail.locator('.mail-lock').getAttribute('aria-pressed');await detail.locator('.mail-lock').click();
  await p.waitForFunction(({id,on})=>document.querySelector('[data-mail-detail="'+id+'"] .mail-lock')?.getAttribute('aria-pressed')===on,{id,on:before==='true'?'false':'true'});
  await p.evaluate(()=>closeModal());
 }
 assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
