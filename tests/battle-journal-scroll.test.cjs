const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('Battle journal preserves scrolling through redraws and sparse filters',async t=>{
  const game=await openRuntime(root);
  const page=game.page;
  // Native scroll events need real browser frames, unlike the fake combat clock.
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function fill(filter){
    await page.evaluate(filter=>{
      battleReportPaused=false;logs=[];battleLogGeneration++;
      setBattleLogFilter(filter);
      const type=filter==='all'?'system':filter;
      for(let i=0;i<60;i++)note('journal entry '+i+' '+'.'.repeat(150),type);
      render();
    },filter);
    await settle();
  }
  const position=()=>page.evaluate(()=>{
    const s=document.querySelector('#liveLog .battle-log-stream');
    return {top:s.scrollTop,left:s.scrollLeft,max:s.scrollHeight-s.clientHeight,auto:s.dataset.autoScroll,rows:s.querySelectorAll('[data-event-type]').length};
  });
  function atBottom(p){assert(p.max>0,'Fixture must have enough rows to scroll');assert(Math.abs(p.max-p.top)<=2,JSON.stringify(p));assert.equal(p.auto,'1');}
  try{
    await page.evaluate(()=>{selectSaveSlot(1);start(1);});
    await page.waitForTimeout(100);
    await page.evaluate(()=>{
      closeModal();state.lv=20;state.hp=stats().hp;
      recruitCompanion(11);recruitCompanion(13);closeModal();
      for(const h of heroes()){h.lv=20;h.hp=stats(h).hp;}syncParty();setTab('battle');
    });
    await settle();
    for(const filter of ['exp','item'])for(const refresh of ['render','refreshGlobalJournal']){
      await t.test(filter+' keeps following the latest row during '+refresh+' without matching messages',async()=>{
        await fill(filter);atBottom(await position());
        await page.evaluate(()=>{globalThis.retainedJournal=$('liveLog');});
        for(let i=0;i<6;i++){
          await page.evaluate(refresh=>{note('hidden combat event','playerDamage');globalThis[refresh]();},refresh);
          atBottom(await position());
          await settle();atBottom(await position());
        }
        assert.equal(await page.evaluate(()=>$('liveLog')===globalThis.retainedJournal),true);
        await page.evaluate(filter=>note('new matching reward',filter),filter);
        await settle();atBottom(await position());
        // Rows start with the seconds-combat timestamp, e.g. [00:00.0].
        assert.match(await page.locator('#liveLog [data-event-type]').last().innerText(),/^\[\d{2}:\d{2}\.\d\] new matching reward$/);
      });
    }
    for(const filter of ['all','exp','item'])for(const refresh of ['render','refreshGlobalJournal']){
      await t.test(filter+' preserves manual vertical/horizontal reading position during '+refresh,async()=>{
        await fill(filter);
        await page.locator('#liveLog .battle-log-stream').evaluate(s=>{s.scrollTop=210;s.scrollLeft=80;});
        await settle();const before=await position();assert.equal(before.auto,'0');assert(before.left>0);
        for(let i=0;i<4;i++){
          await page.evaluate(({filter,refresh})=>{note('new matching row',filter==='all'?'system':filter);note('hidden attack','playerDamage');globalThis[refresh]();},{filter,refresh});
          const sync=await position();assert.equal(sync.top,before.top);assert.equal(sync.left,before.left);
          await settle();const after=await position();assert.equal(after.top,before.top);assert.equal(after.left,before.left);assert.equal(after.auto,'0');
        }
      });
    }
    await t.test('Paused reports retain their exact view during both redraw paths and resume following',async()=>{
      await fill('exp');const following=await position();await page.evaluate(()=>toggleBattleReport());await settle();
      const before=await position(),html=await page.locator('#liveLog').innerHTML();
      assert.equal(before.top,following.top);assert.equal(before.auto,'0');
      for(const refresh of ['render','refreshGlobalJournal']){
        await page.evaluate(refresh=>{note('paused reward','exp');globalThis[refresh]();},refresh);
        await settle();assert.deepEqual(await position(),before);assert.equal(await page.locator('#liveLog').innerHTML(),html);
      }
      await page.evaluate(()=>{toggleBattleReport();note('reward after resume','exp');});await settle();atBottom(await position());
    });
    await t.test('Returning manually to the bottom resumes following through filtered redraws',async()=>{
      await fill('item');await page.locator('#liveLog .battle-log-stream').evaluate(s=>{s.scrollTop=210;});await settle();assert.equal((await position()).auto,'0');
      await page.locator('#liveLog .battle-log-stream').evaluate(s=>{s.scrollTop=s.scrollHeight;});await settle();atBottom(await position());
      await page.evaluate(()=>{note('reward after scrolling back','item');render();});await settle();atBottom(await position());
    });
    await t.test('Reading older rows while paused stays in place when the report resumes',async()=>{
      await fill('item');await page.evaluate(()=>toggleBattleReport());await settle();
      await page.locator('#liveLog .battle-log-stream').evaluate(s=>{s.scrollTop=210;});await settle();
      const before=await position();assert.equal(before.top,210);assert.equal(before.auto,'0');
      await page.evaluate(()=>{render();refreshGlobalJournal();toggleBattleReport();note('reward while reading history','item');});
      await settle();const after=await position();assert.equal(after.top,before.top);assert.equal(after.auto,'0');
    });
    for(const filter of ['exp','item'])await t.test(filter+' stays at the latest row during actual combat between rewards',async()=>{
      await fill(filter);
      await page.evaluate(async()=>{
        await EmberwildOffline.settle(undefined,false);
        toggleBattle();
        foes=[{...makeEnemy(0,state,()=>.9),id:'scroll_target',hp:1e8,maxhp:1e8,atk:1,def:0}];enemy=foes[0];
        round=0;roundIterator=null;roundStartedAt=0;nextActionAt=0;lastActionOrder=[];
        for(const h of heroes())h.shield=1e6;
      });
      try{
        for(let i=0;i<12;i++){await page.waitForTimeout(100);atBottom(await position());}
        // The resumable timeline can still be inside its encounter transition. Seconds combat records actions without the old round counter.
        await page.waitForFunction(()=>lastActionOrder.length>0,{},{timeout:8000});
        atBottom(await position());
        assert.equal(await page.evaluate(()=>lastActionOrder.length>0),true,'The actual timer must advance combat actions');
      }finally{await page.evaluate(()=>{if(running)toggleBattle();});}
    });
    assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});
