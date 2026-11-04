const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
// The voucher offer and its confirmation are operated with real clicks while an offline replay is running.
test('Chromium: offering vouchers pauses the replay so the confirmation stays still, then real clicks stop it and mail the tickets',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.setViewportSize({width:1280,height:800});
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);startSelectedExploration();
   // A recorded 30-minute snapshot of the first map (statistics normally build it during online play).
   party.idleStatistics=EmberwildIdleStatistics.normalize({version:1,regions:{'0:0':{first:1,last:2,total:{ms:1800000,battles:200},snapshot:{id:'s-test',source:'online',config:'c',at:1,levelMin:1,levelMax:5,boosts:[],ms:1800000,battles:200,xp:4000,gold:180,kills:{normal:200},monsters:{map0_mob0:200},enemies:{'map0_mob0|normal|3|黏稠凝膠':200},items:{'material:鍛鐵':30}}}}});save();});
  await p.evaluate(()=>{globalThis.__job=EmberwildOffline.settle(Date.now()+8*3600000,true);});
  await p.locator('#offline-settlement').getByRole('button',{name:/改領收益券/}).click();
  const confirm=p.locator('#offline-settlement .offline-voucher-confirm');await confirm.waitFor();
  const first=await confirm.innerText(),cursor=await p.evaluate(()=>party.offlineExploration.lastAt);
  await p.waitForTimeout(800);
  assert.equal(await confirm.innerText(),first,'the confirmation text does not change while it is open');
  assert.equal(await p.evaluate(()=>party.offlineExploration.lastAt),cursor,'the replay pauses during the confirmation');
  const shown=Number(first.match(/(\d+) 張「苔光林地」30 分鐘收益券/)?.[1]);assert(shown>=15&&shown<=16,'about 8 hours of tickets: '+shown);
  await confirm.getByRole('button',{name:'確認改領',exact:true}).click();
  // Read the result as soon as the job resolves: the test settled to a future time, so a later timer-driven sync would
  // see the real clock 8 hours behind the settled cursor and report invalid time.
  const r=await p.evaluate(async()=>{await __job;return {failed:EmberwildOffline.failed,vouchers:party.offlineExploration.receipt?.vouchers,mail:party.mailbox.messages.filter(m=>m.rewardKey.startsWith('voucher-')).map(m=>m.attachments[0].quantity)};});
  assert.equal(r.failed,false);assert.equal(r.vouchers,shown,'exactly the confirmed number of tickets');assert.deepEqual(r.mail,[shown]);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
