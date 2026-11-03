const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function start(page){
  await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();});
  // Starting a save settles offline time asynchronously and may show its receipt; finish it before clicking.
  await page.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);if(EmberwildOffline.failed)throw Error('offline settlement failed');if(party.offlineExploration?.receipt?.complete)acknowledgeOfflineExploration();closeModal();clearInterval(timer);});
  await page.locator('#offline-settlement').waitFor({state:'hidden',timeout:30000});
}
async function show(page,tab,selector){
  await page.evaluate(t=>setTab(t),tab);
  await page.locator(selector).waitFor();
}
function overflowingChildren(){
  const root=document.querySelector('.readability-page');
  return [...root.querySelectorAll('*')].filter(el=>{
    const style=getComputedStyle(el);
    return ['auto','scroll'].includes(style.overflowY)&&el.scrollHeight>el.clientHeight+2;
  }).map(el=>el.className);
}

test('Chromium: equipment uses one compact protagonist header and keeps real equip/unequip and tokens',async()=>{
  const r=await openRuntime(root),p=r.page;
  try{
    await p.setViewportSize({width:1440,height:900});await start(p);
    const ids=await p.evaluate(()=>{
      playerHero().name='唯一主角';const gearItem=gear(1,0,0,0),token=__EMBERWILD_TOKEN_TEST.makeToken('arcane');
      state.bag.push(gearItem,token);equipCompanionToken(token.id,10);save();return {gear:gearItem.id,token:token.id};
    });
    await show(p,'worn','.worn-single-player');
    assert.equal(await p.locator('.worn-character-pane,.worn-character-item').count(),0);
    assert.equal(await p.locator('.worn-player-equipment>.row').count(),1);
    assert.match(await p.locator('.worn-player-equipment>.row').innerText(),/唯一主角/);
    assert.equal(await p.locator('.worn-slot').count(),5);
    assert.equal(await p.locator('.companion-token-panel').count(),1);
    const widths=await p.evaluate(()=>({overview:document.querySelector('.worn-overview').clientWidth,detail:document.querySelector('.worn-player-equipment').getBoundingClientRect().width}));
    assert(widths.detail>=widths.overview-2);
    await p.locator('[data-equip-position="0"]').click();
    const candidate=p.locator('.worn-candidate-list [data-item-gear="'+ids.gear+'"]');
    await candidate.waitFor({state:'visible'});
    await candidate.click();
    // Empty slots equip immediately; replacing worn gear opens comparison.
    if(await p.locator('#modal').evaluate(el=>el.open))
      await p.locator('#modal').getByRole('button',{name:'確認穿戴',exact:true}).click();
    assert.equal(await p.evaluate(()=>playerHero().equipped[0]),ids.gear);
    await p.locator('.worn-slot').first().getByRole('button',{name:'卸下',exact:true}).click();
    assert.equal(await p.evaluate(()=>playerHero().equipped[0]),null);
    assert.equal(await p.evaluate(()=>partyMember(10).tokenId),ids.token);
    assert.deepEqual(await p.evaluate(overflowingChildren),[]);
    assert.deepEqual(r.errors,[]);
  }finally{await r.browser.close();}
});

test('Chromium: expanded BOSS help and guide flow naturally through one main scroll at desktop and narrow widths',async()=>{
  const r=await openRuntime(root),p=r.page;
  try{
    await start(p);
    for(const width of [1440,768,390]){
      await p.setViewportSize({width,height:900});
      await show(p,'bossCraft','.boss-reading-page');
      await p.locator('.boss-reading-page .ui-help').filter({has:p.getByText('製作說明',{exact:true})}).locator('summary').click();
      await p.evaluate(()=>{for(const el of document.querySelectorAll('.boss-reading-page details'))el.open=true;});
      const boss=await p.evaluate(()=>{
        const root=document.querySelector('.boss-reading-page'),help=[...root.querySelectorAll('.ui-help')].find(el=>el.querySelector('summary').textContent==='製作說明'),body=help.querySelector('div'),panel=help.closest('.panel');
        return {open:help.open,helpHeight:help.getBoundingClientRect().height,bodyHeight:body.getBoundingClientRect().height,bodyScroll:body.scrollHeight,bodyClient:body.clientHeight,panelHeight:panel.getBoundingClientRect().height,font:Number.parseFloat(getComputedStyle(body).fontSize),pageWidth:root.clientWidth,pageScroll:root.scrollWidth};
      });
      assert(boss.open);assert(boss.bodyHeight>20);assert(boss.helpHeight>boss.bodyHeight);
      assert(boss.panelHeight>boss.helpHeight);assert(boss.bodyScroll<=boss.bodyClient+2);
      assert(boss.font>=15);assert(boss.pageScroll<=boss.pageWidth+2);
      assert.deepEqual(await p.evaluate(overflowingChildren),[],width+' BOSS nested scrolls');
      await p.locator('.boss-recipe').last().scrollIntoViewIfNeeded();
      await show(p,'guide','.guide-reading-page');
      await p.evaluate(()=>{for(const el of document.querySelectorAll('.guide-reading-page details'))el.open=true;});
      const guide=await p.evaluate(()=>{
        const root=document.querySelector('.guide-reading-page'),main=root.closest('main');
        return {mainHeight:main.clientHeight,mainScroll:main.scrollHeight,overflow:getComputedStyle(main).overflowY,pageWidth:root.clientWidth,pageScroll:root.scrollWidth,fonts:[...root.querySelectorAll('p,.ui-help>div')].map(el=>Number.parseFloat(getComputedStyle(el).fontSize)),first:root.firstElementChild.className};
      });
      assert.equal(guide.overflow,'auto');assert(guide.mainScroll>guide.mainHeight);
      assert.equal(guide.first,'heading');assert(guide.fonts.every(size=>size>=15));
      assert(guide.pageScroll<=guide.pageWidth+2,width+' guide width '+guide.pageScroll+'/'+guide.pageWidth);
      assert.deepEqual(await p.evaluate(overflowingChildren),[],width+' guide nested scrolls');
      if(width<=900&&await p.locator('.guide-reading-page .mode-table').count()){
        assert.equal(await p.locator('.guide-reading-page .mode-table thead').evaluate(el=>getComputedStyle(el).display),'none');
        assert(await p.locator('.guide-reading-page td[data-reading-label]').count()>0);
      }
      const journalBefore=await p.locator('.global-battle-journal').boundingBox();
      await p.locator('.guide-reading-page .panel').last().scrollIntoViewIfNeeded();
      const journalAfter=await p.locator('.global-battle-journal').boundingBox();
      assert.deepEqual(journalAfter,journalBefore);
      assert(await p.locator('.layout>main').evaluate(el=>el.scrollTop>0));
      await show(p,'worn','.worn-single-player');
      assert.equal(await p.locator('.worn-character-pane,.worn-character-item').count(),0);
      assert.deepEqual(await p.evaluate(overflowingChildren),[],width+' worn nested scrolls');
    }
    await show(p,'battle','.text-battle-layout');
    assert.equal(await p.locator('.readability-page').count(),0);
    assert(['auto','scroll'].includes(await p.locator('.layout>main').evaluate(el=>getComputedStyle(el).overflowY)),'continuous battle cards remain reachable through main scrolling');
    assert.deepEqual(r.errors,[]);
  }finally{await r.browser.close();}
});

test('Chromium: difficulty tables keep readable labels and values when the guide contains full tabular detail',async()=>{
  const r=await openRuntime(root),p=r.page;
  try{
    await start(p);
    // Current guide editions use prose; retain readable support for the existing
    // mode-table format when a guide renderer supplies its full difficulty table.
    await p.evaluate(()=>{
      guideView=()=>heading('FIELD NOTES / 冒險指南','難度與掉落')+`<section class="guide-scroll panel"><table class="mode-table"><thead><tr><th>模式</th><th>生命／攻擊／防禦</th><th>普通怪裝備／寶石</th><th>BOSS 專屬</th></tr></thead><tbody>${MODES.map(d=>`<tr><td>${d.name}</td><td>×${d.hp}／×${d.atk}／×${d.def}</td><td>${d.equip[0]*100}%／${d.gem[0]*100}%</td><td>${d.boss*100}%</td></tr>`).join('')}</tbody></table></section>`;
    });
    await p.addScriptTag({content:fs.readFileSync(path.join(root,'js/ui/page-readability.js'),'utf8')});
    for(const width of [1440,768,390]){
      await p.setViewportSize({width,height:900});await show(p,'guide','.guide-reading-page');
      assert.equal(await p.locator('td[data-reading-label="模式"]').count(),3);
      assert.equal(await p.locator('td[data-reading-label="生命／攻擊／防禦"]').count(),3);
      const table=await p.locator('.mode-table').evaluate(el=>({display:getComputedStyle(el.querySelector('thead')).display,width:el.clientWidth,scroll:el.scrollWidth,text:el.textContent,font:Number.parseFloat(getComputedStyle(el).fontSize)}));
      assert.equal(table.display,width<=900?'none':'table-header-group');
      assert(table.scroll<=table.width+2);assert(table.font>=14);
      assert.match(table.text,/普通/);assert.match(table.text,/困難/);assert.match(table.text,/地獄/);
      assert.deepEqual(await p.evaluate(overflowingChildren),[]);
    }
    assert.deepEqual(r.errors,[]);
  }finally{await r.browser.close();}
});
