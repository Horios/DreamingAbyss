'use strict';
/* v0.118: dialog 'close' is dispatched asynchronously. Closing a dialog and reopening a utility
   view in the same task must not let the late close event strip the new view's marker, otherwise
   the mailbox stops refreshing (selected mail never shows) and loses its master-detail layout. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('closing then reopening a utility view in one task keeps its marker after the queued close event',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();for(let i=0;i<30;i++)party.mailbox.messages.push({id:++party.mailbox.serial,rewardKey:'race-'+i,subject:'信件 '+i,body:'內容',at:Date.now()+i,read:true,claimed:true,attachments:[]});save();});
  await p.setViewportSize({width:1024,height:768});
  for(let round=0;round<5;round++){
   await p.evaluate(()=>{openUtilityPanel('mailbox');});
   await p.evaluate(()=>{closeModal();openUtilityPanel('mailbox');});
   // Let the queued close event run.
   await p.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
   const state=await p.evaluate(()=>({open:$('modal').open,view:$('modal').dataset.view,utility:$('modal').classList.contains('utility-dialog')}));
   assert.deepEqual(state,{open:true,view:'utility-mailbox',utility:true},'round '+round);
   // The mailbox still refreshes: selecting the last mail shows it and keeps the detail in view.
   const item=p.locator('.mailbox-list-item').last(),id=await item.getAttribute('data-mail-id');await item.click();
   await p.waitForFunction(id=>document.querySelector('.mailbox-detail')?.dataset.mailDetail===id,id,{timeout:5000});
   assert(await p.locator('.mailbox-detail').evaluate(e=>{const b=e.getBoundingClientRect(),m=e.closest('dialog').getBoundingClientRect();return b.top>=m.top&&b.top<m.bottom;}),'detail in view '+round);
  }
  await p.evaluate(()=>closeModal());await p.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.deepEqual(await p.evaluate(()=>({view:$('modal').dataset.view??null,utility:$('modal').classList.contains('utility-dialog')})),{view:null,utility:false},'a real close still clears the marker');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
