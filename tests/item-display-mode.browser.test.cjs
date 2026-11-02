const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),key='emberwild-item-display';

async function start(page){
  await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();});
  await page.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);if(party.offlineExploration?.receipt?.complete)acknowledgeOfflineExploration();closeModal();clearInterval(timer);});
}

test('Item interfaces share one persisted icon-name or name-only list mode',async()=>{
  const g=await openRuntime(root),p=g.page;
  try{
    await start(p);
    assert.equal(await p.locator('html').getAttribute('data-item-display'),'icon-name');
    for(const setup of [
      ()=>{setTab('equipment');setInventoryCategory('equipment');},
      ()=>setTab('forge'),
      ()=>setTab('shop'),
      ()=>setTab('lifeSkills')
    ]){
      await p.evaluate(setup);
      const slot=p.locator('main .item-slot:visible').first();
      await slot.waitFor();
      assert.equal(await slot.locator('.item-slot-name').count(),1);
      assert.equal(await slot.locator('.item-slot-art').isVisible(),true);
      const positions=await slot.evaluate(el=>({slot:el.getBoundingClientRect().width,art:el.querySelector('.item-slot-art').getBoundingClientRect().left,name:el.querySelector('.item-slot-name').getBoundingClientRect().left}));
      assert(positions.slot>100);assert(positions.art<positions.name);
    }
    // Snapshot immediately before the display-only action. Visiting other
    // tabs can legitimately record quest or interface state.
    await p.evaluate(()=>setTab('shop'));
    const before=await p.evaluate(()=>({party:JSON.stringify(party),balance:JSON.stringify(exportableBalance()),save:localStorage.getItem(KEY)}));
    await p.locator('#utilityButton-options').click();
    assert.equal(await p.locator('[data-item-display-choice]').count(),2);
    await p.locator('[data-item-display-choice="name"]').click();
    assert.equal(await p.locator('html').getAttribute('data-item-display'),'name');
    assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),'name');
    assert.equal(await p.locator('[data-item-display-choice="name"]').getAttribute('aria-pressed'),'true');
    await p.getByRole('button',{name:'關閉彈窗',exact:true}).click();
    const textSlot=p.locator('main .item-slot:visible').first();await textSlot.waitFor();
    assert.equal(await textSlot.locator('.item-slot-art').isVisible(),false);
    assert.equal(await textSlot.locator('.item-slot-name').isVisible(),true);
    assert.deepEqual(await p.evaluate(before=>({party:before.party===JSON.stringify(party),balance:before.balance===JSON.stringify(exportableBalance()),save:before.save===localStorage.getItem(KEY)}),before),{party:true,balance:true,save:true});
    assert.equal(await p.evaluate(()=>setItemDisplayMode('unknown')),false);
    await p.reload();
    assert.equal(await p.locator('html').getAttribute('data-item-display'),'name');
    assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
});

test('Unknown saved item display preference falls back to icon-name',async()=>{
  const g=await openRuntime(root,'index.html',{[key]:'retired-mode'}),p=g.page;
  try{assert.equal(await p.locator('html').getAttribute('data-item-display'),'icon-name');assert.deepEqual(g.errors,[]);}finally{await g.browser.close();}
});
