const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
// Toasts raised over a modal dialog (e.g. the wishing lake's full-bag warning) sit above it, in its lower middle.
test('Chromium: a toast over the wishing lake dialog is in the top layer inside the dialog, and returns to the page afterwards',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  for(const [width,height] of [[1280,800],[390,844]]){
   await p.setViewportSize({width,height});
   await p.evaluate(()=>{if(!party){selectSaveSlot(1);start(0);closeModal();clearInterval(timer);}recordMapClear(0);openWishingLake();toast('背包已滿，這個回贈池可能給予裝備，請先整理背包');});
   const r=await p.evaluate(()=>{const t=$('toast').getBoundingClientRect(),d=document.querySelector('dialog[open]').getBoundingClientRect();return {popover:$('toast').matches(':popover-open'),visible:getComputedStyle($('toast')).display!=='none',t:{l:t.left,r:t.right,top:t.top,b:t.bottom,cx:t.left+t.width/2},d:{l:d.left,r:d.right,top:d.top,b:d.bottom,cx:d.left+d.width/2,h:d.height}};});
   assert.equal(r.popover,true,width+' toast is in the top layer above the dialog');assert.equal(r.visible,true);
   assert(r.t.l>=r.d.l-1&&r.t.r<=r.d.r+1&&r.t.top>=r.d.top&&r.t.b<=r.d.b+1,width+' toast stays inside the dialog');
   assert(Math.abs(r.t.cx-r.d.cx)<2,width+' horizontally centred on the dialog');assert((r.t.top+r.t.b)/2>r.d.top+r.d.h/2,width+' in the lower half of the dialog');
   await p.evaluate(()=>{closeModal();toast('一般提醒');});
   assert.equal(await p.evaluate(()=>$('toast').matches(':popover-open')),false,'without a dialog the toast uses its page position');
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('Chromium: the team plan block and each plan fold, with the plan block kept open until a class is chosen',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('roster');});await p.waitForTimeout(60);await p.evaluate(()=>closeModal());
  const fold=p.locator('.team-plan-panel .team-plan-fold');
  assert.equal(await fold.evaluate(e=>e.open),true);await fold.locator('summary').first().click();assert.equal(await fold.evaluate(e=>e.open),false);
  await p.evaluate(()=>render());assert.equal(await fold.evaluate(e=>e.open),false,'the folded state survives redraws');
  await fold.locator('summary').first().click();assert.equal(await p.locator('.team-plan-card.current').evaluate(e=>e.open),true,'the plan in use starts expanded');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
