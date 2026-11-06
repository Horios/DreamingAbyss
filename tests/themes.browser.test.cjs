const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
const key='emberwild-ui-theme';

test('Appearance switches in Options without restarting combat or mutating saves, and survives reloads',async()=>{
  const g=await openRuntime(root),p=g.page;
  try{
    assert.equal(await p.locator('html').getAttribute('data-ui-theme'),'ember');
    await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();});
    await p.waitForTimeout(60);await p.evaluate(()=>{closeModal();toggleBattle();clearInterval(timer);});
    assert.equal(await p.evaluate(()=>running),true);
    await p.locator('#utilityButton-options').click();
    assert.equal(await p.locator('.theme-choice').count(),3);
    const colors=new Set();
    for(const id of ['forest','paper','ember']){
      const choice=p.locator(`[data-theme-choice="${id}"]`);
      // Synchronous snapshots exclude unrelated play-time timers between clicks.
      const unchanged=await p.evaluate(id=>{
        const before={balance:JSON.stringify(exportableBalance()),party:JSON.stringify(party),save:localStorage.getItem(KEY)};
        setUITheme(id);
        return {party:before.party===JSON.stringify(party),balance:before.balance===JSON.stringify(exportableBalance()),save:before.save===localStorage.getItem(KEY)};
      },id);
      assert.deepEqual(unchanged,{party:true,balance:true,save:true});
      await choice.click();
      assert.equal(await p.locator('html').getAttribute('data-ui-theme'),id);
      assert.equal(await p.locator('.theme-choice[aria-pressed="true"]').count(),1);
      assert.equal(await choice.getAttribute('aria-pressed'),'true');
      assert.equal(await choice.locator('.theme-choice-state').textContent(),'使用中');
      assert.equal(await choice.evaluate(e=>e===document.activeElement),true,'switch keeps keyboard focus');
      assert.equal(await p.evaluate(()=>running),true);
      colors.add(await p.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor));
      assert.equal(await p.evaluate(()=>setUITheme('unknown')),false);
      assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),id);
    }
    assert.equal(colors.size,3);
    // Keyboard access, mobile width and the periodic Options redraw share one selection.
    await p.setViewportSize({width:320,height:640});
    await p.locator('[data-theme-choice="forest"]').focus();await p.keyboard.press('Enter');
    await p.evaluate(()=>render());
    assert.equal(await p.locator('[data-theme-choice="forest"]').getAttribute('aria-pressed'),'true');
    assert(await p.locator('#modal').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await p.getByRole('button',{name:'關閉彈窗',exact:true}).click();
    for(const id of ['ember','forest','paper']){
      await p.evaluate(id=>setUITheme(id),id);
      for(const tab of ['battle','roster','partnerRoster','character','skills','equipment','worn','forge','bossCraft','quests','shop','lifeSkills','guide','statistics']){
        await p.evaluate(tab=>setTab(tab),tab);
        assert(await p.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' '+tab+' mobile overflow');
        if(id==='paper'){
          const unreadable=await p.locator('main').evaluate(main=>{
            const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
            const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            return [...main.querySelectorAll('.inventory-list-meta,.inventory-detail-section h3,.equipment-total-summary,.statistics-empty,.inventory-visibility-group label,.equipment-attribute-details>summary,.starter-equipment-name')].filter(el=>{
              if(!el.getBoundingClientRect().width||!el.getBoundingClientRect().height)return false;
              let ancestor=el,bg=[255,255,255];
              while(ancestor){const color=rgb(getComputedStyle(ancestor).backgroundColor);if((color[3]??1)>.95){bg=color;break;}ancestor=ancestor.parentElement;}
              const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(bg);
              return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5;
            }).map(el=>el.className||el.textContent.slice(0,20));
          });
          assert.deepEqual(unreadable,[],tab+' light-mode text contrast');
        }
      }
    }
    await p.evaluate(()=>returnToTitle());
    assert.equal(await p.locator('html').getAttribute('data-ui-theme'),'paper');
    await p.reload();
    assert.equal(await p.locator('html').getAttribute('data-ui-theme'),'paper');
    assert.equal(await p.locator('.title-screen').isVisible(),true);
    await p.evaluate(()=>selectSaveSlot(1));
    await p.locator('#utilityButton-options').click();
    assert.equal(await p.locator('[data-theme-choice="paper"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
});

test('Unknown saved appearance falls back safely; storage changes update an open Options dialog',async()=>{
  const g=await openRuntime(root,'index.html',{[key]:'retired-theme'},{pathname:'/preview/'}),p=g.page;
  try{
    assert.equal(await p.locator('html').getAttribute('data-ui-theme'),'ember');
    await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();});
    await p.waitForTimeout(60);await p.evaluate(()=>closeModal());
    await p.locator('#utilityButton-options').click();
    assert.equal(await (await p.evaluate(()=>setOptionsTab('other')),p).locator('#options-test-json-import').count(),0,'balance JSON import lives in the developer mode');await p.evaluate(()=>setOptionsTab('general'));
    const [second]=await Promise.all([p.waitForEvent('popup'),p.evaluate(()=>{window.open('about:blank');})]);
    // A second same-origin document exercises the native cross-tab storage event.
    await second.evaluate(k=>localStorage.setItem(k,'forest'),key);
    await p.waitForFunction(()=>document.documentElement.dataset.uiTheme==='forest');
    assert.equal(await p.locator('[data-theme-choice="forest"]').getAttribute('aria-pressed'),'true');
    await second.evaluate(k=>localStorage.removeItem(k),key);
    await p.waitForFunction(()=>document.documentElement.dataset.uiTheme==='ember');
    assert.equal(await p.locator('[data-theme-choice="ember"]').getAttribute('aria-pressed'),'true');
    await second.close();assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
});
