const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('Chromium: combat previews show signed stat and unlearned-affix differences on desktop and mobile',async()=>{
  const r=await openRuntime(root,'index.html',{}, {pathname:'/preview/',clockTime:Date.parse('2026-10-15T15:20:00Z')}),p=r.page;
  try{
    const setup=await p.evaluate(()=>{
      clearInterval(timer);start(1);closeModal();continueFromTitle();
      const h=playerHero(),current=h.bag.find(g=>g.id===h.equipped[1]),next=gear(1,1,0,1);
      current.affix=[{type:2,rank:1,value:8},{type:9,rank:1,value:5}];
      next.affix=[{type:4,rank:1,value:18,skill:3}];next.plus=5;h.bag.push(next);
      const rows=equipmentComparison(h,next,1),equipped=[...h.equipped];
      spawnGroup();const combat=JSON.stringify(stats(h));previewEquip(next.id,memberKey(h),1);
      return {id:next.id,key:memberKey(h),rows,equipped,combat};
    });
    const modal=p.locator('#modal');
    assert.ok(await modal.isVisible());
    const rows=await modal.locator('.equip-delta-table:not(.equip-affix-delta-table) tbody tr').allTextContents();
    assert.equal(rows.length,setup.rows.length);
    assert.ok(!rows.some(row=>row.includes('數值無變化')));
    const affixes=await modal.locator('.equip-affix-delta-table tbody tr').allTextContents();
    assert.ok(affixes.some(row=>/防禦.*-8/.test(row)));
    assert.ok(affixes.some(row=>/閃避率.*-5 百分點/.test(row)));
    assert.ok(affixes.some(row=>/效果.*\+18 百分點/.test(row)));
    assert.equal(await modal.locator('.equip-affix-delta-table .delta-down').count(),2);
    assert.equal(await modal.locator('.equip-affix-delta-table .delta-up').count(),1);
    for(const width of [1280,390]){
      await p.setViewportSize({width,height:844});
      assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      assert.ok(await modal.locator('.equip-affix-delta-table').isVisible());
    }
    await modal.getByRole('button',{name:'取消',exact:true}).click();
    const unchanged=await p.evaluate(()=>({equipped:playerHero().equipped,combat:JSON.stringify(stats(playerHero()))}));
    assert.deepEqual(unchanged.equipped,setup.equipped);assert.equal(unchanged.combat,setup.combat);
    await p.evaluate(({id,key})=>{stopTeamExploration();previewEquip(id,key,1);},setup);
    await modal.getByRole('button',{name:'確認穿戴',exact:true}).click();
    assert.equal(await p.evaluate(()=>playerHero().equipped[1]),setup.id);
    assert.deepEqual(r.errors,[]);
  }finally{await r.browser.close();}
});
