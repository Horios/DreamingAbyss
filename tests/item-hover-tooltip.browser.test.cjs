const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('Shared item hover descriptions survive journal scrolling and redraws until pointer leaves',async()=>{
  const game=await openRuntime(root),page=game.page;
  const tooltip=page.locator('#item-hover-tooltip');
  try{
    await page.evaluate(()=>{
      selectSaveSlot(1);start(0);closeModal();clearInterval(timer);
      const token=__EMBERWILD_TOKEN_TEST.makeToken('arcane',1);
      state.bag.push(token);
      const equipment=state.bag.find(g=>!EmberwildTokens.isToken(g));
      const fixture=document.createElement('div');
      fixture.id='item-hover-test-fixture';
      fixture.style.cssText='position:fixed;left:16px;top:56px;z-index:2147483640;width:240px;background:var(--panel);';
      document.body.appendChild(fixture);
      globalThis.renderHoverFixture=kind=>{
        const options={context:'reference'};
        fixture.innerHTML=kind==='token'?gearSlotHTML(token,options):
          kind==='equipment'?(equipment?gearSlotHTML(equipment,options):itemSlotHTML('equipment','form:0:0:0',options)):
          itemSlotHTML(kind,kind==='material'?'鍛鐵':kind==='gem'?'0':'level_scroll',options);
      };
    });
    for(const kind of ['token','equipment','material','gem','item']){
      await page.evaluate(kind=>renderHoverFixture(kind),kind);
      await page.locator('#item-hover-test-fixture [data-item-kind]').hover();
      assert.equal(await tooltip.isVisible(),true,kind+' hover opens');
      // These events used to hide every tooltip, including during idle periods.
      await page.evaluate(()=>{
        for(let i=0;i<4;i++){
          refreshGlobalJournal();render();
          (document.querySelector('#liveLog')||document.body).dispatchEvent(new Event('scroll'));
        }
        document.querySelector('#item-hover-test-fixture [data-item-kind]').dispatchEvent(new Event('focusout',{bubbles:true}));
      });
      await page.waitForTimeout(80);
      assert.equal(await tooltip.isVisible(),true,kind+' survives journal refresh/scroll/focusout');
      // A live UI redraw may replace the element while the mouse stays still.
      await page.evaluate(kind=>renderHoverFixture(kind),kind);
      await page.waitForTimeout(80);
      assert.equal(await tooltip.isVisible(),true,kind+' survives element replacement');
      await page.mouse.move(2,2);
      await page.waitForTimeout(50);
      assert.equal(await tooltip.isVisible(),false,kind+' closes only after pointer leaves');
    }

    // Exercise the real token inventory panel, not just detached test fixtures.
    await page.evaluate(()=>{
      document.querySelector('#item-hover-test-fixture')?.remove();
      setTab('equipment');setInventoryCategory('tokens');
    });
    const liveToken=page.locator('main .token-inventory-row[data-item-kind]').first();
    await liveToken.waitFor();
    await liveToken.hover();
    assert.equal(await tooltip.isVisible(),true);
    for(let i=0;i<4;i++){
      await page.evaluate(()=>{render();refreshGlobalJournal();});
      await page.waitForTimeout(60);
      assert.equal(await tooltip.isVisible(),true,'actual token row survives render #'+i);
    }
    await page.mouse.move(2,2);
    await page.waitForTimeout(50);
    assert.equal(await tooltip.isVisible(),false);
    assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});