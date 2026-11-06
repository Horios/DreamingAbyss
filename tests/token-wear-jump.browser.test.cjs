'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openRuntime}=require('./runtime.cjs');
const root=require('node:path').resolve(__dirname,'..');

for(const worn of [false,true])test(`backpack token 穿戴 stays enabled and opens the equipment page at the chosen companion (${worn?'worn':'unworn'} token)`,async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  for(const width of [1280,390]){
   await p.setViewportSize({width,height:900});
   const id=await p.evaluate(worn=>{if(!state){selectSaveSlot(1);start(0);closeModal();recruitCompanion(10);closeModal();}clearInterval(timer);running=false;
    const t=__EMBERWILD_TOKEN_TEST.makeToken('berserk');state.bag.push(t);if(worn)equipCompanionToken(t.id,10);closeModal();
    setTab('equipment');setInventoryCategory('tokens');selectInventoryToken(t.id);return t.id;},worn);
   const button=p.locator('.token-detail-actions button',{hasText:'穿戴'});
   assert.equal(await button.count(),1);
   assert.equal(await button.isDisabled(),false,'穿戴 must not be disabled');
   await button.click();
   // A click can defer the redraw (interaction guard); wait for the destination page.
   await p.waitForSelector('.companion-token-panel [data-token-owner="10"].token-wear-target',{timeout:5000});
   const after=await p.evaluate(id=>({tab,card:!!document.querySelector('.companion-token-panel [data-token-owner="10"]'),highlighted:!!document.querySelector('.token-wear-target'),inBag:!!findGear(id)}),id);
   assert.equal(after.tab,'worn');assert(after.card);assert(after.highlighted);assert(after.inBag,'jumping never consumes or moves the token');
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
