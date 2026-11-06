const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{openRuntime}=require('./runtime.cjs'),D=require('../js/balance/balance-diff.js');
const root=process.cwd(),published=JSON.parse(fs.readFileSync('data/balance.json'));
test('production ignores old browser balance and player-save design snapshots; preview overrides expire on a new published base',async()=>{
 const old=structuredClone(published);old.items[0].cost=99999;
 const main=await openRuntime(root,'index.html',{'emberwild-balance-test-v1':JSON.stringify(old)});
 try{assert.equal(await main.page.evaluate(()=>exportableBalance().items[0].cost),published.items[0].cost);await main.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();const d=structuredClone(packParty());d.balanceSettings={combat:{baseCritDamage:999}};d.members[0].balance={evil:true};loadParty(d);save();});const out=await main.page.evaluate(()=>({price:exportableBalance().items[0].cost,save:packParty()}));assert.equal(out.price,published.items[0].cost);assert.equal(out.save.balanceSettings,undefined);assert.equal(out.save.members[0].balance,undefined);assert.deepEqual(main.errors,[]);}finally{await main.browser.close();}
 const preview=await openRuntime(root,'index.html',{}, {pathname:'/preview/'});
 // Preview keeps a design across reloads only through the JSON import, which records the published base it was made on.
 try{await preview.page.evaluate(async()=>{const d=exportableBalance();d.items[0].cost+=7;if(!await importBalanceJSON({target:{files:[new File([JSON.stringify(d)],'balance.json',{type:'application/json'})],value:''}}))throw Error('balance import failed');});await preview.page.reload();assert.equal(await preview.page.evaluate(()=>exportableBalance().items[0].cost),published.items[0].cost+7);
  const updated=structuredClone(published);updated.items[0].cost+=9;await preview.page.route('http://localhost/preview/data/balance.json?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(updated)}));await preview.page.reload();assert.equal(await preview.page.evaluate(()=>exportableBalance().items[0].cost),updated.items[0].cost);assert.deepEqual(preview.errors,[]);
 }finally{await preview.browser.close();}
});
test('older production fails closed on expanded life data; upgraded runtime retains every effective field',async()=>{
 const r=await openRuntime('../Emberwild-main');try{await r.page.route('http://localhost/data/balance.json?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(published)}));await r.page.reload();
  // The loader is asynchronous: wait until the older runtime either refuses the document or finishes booting.
  await r.page.waitForFunction(()=>/資料載入失敗/.test(document.getElementById('app')?.innerText||'')||window.emberwildBootComplete===true,{},{timeout:30000});
  const version=await r.page.evaluate(()=>/資料載入失敗/.test(document.getElementById('app').innerText)?0:EmberwildBalanceDocument.lifeProductsVersion||0);
  if(version<1){assert.match(await r.page.locator('#app').innerText(),/資料載入失敗.*lifeSkills/);assert.equal(await r.page.evaluate(()=>typeof exportableBalance),'undefined');}
  else{const actual=await r.page.evaluate(()=>exportableBalance());assert.equal(D.diff(published,actual).total,0);}
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
 const updated=await openRuntime(root);try{
  // The current runtime keeps every published value. It adds derived fields (seconds timing, defaults) and applies two
  // deliberate normalizations: legacy five-item starter packs keep only the weapon, and the cooldown-floor migration
  // marker is consumed. Nothing else may be removed and no published value may change; the export round-trips.
  const exported=await updated.page.evaluate(()=>exportableBalance()),d=D.diff(published,exported);
  assert.equal(d.modified,0,JSON.stringify(d.rows.filter(r=>r.type==='修改').slice(0,3)));
  const allowed=r=>/^starterPacks\.\d+\.[1-4]$/.test(r.path)||r.path==='balanceSettings.meta.activeCooldownFloorVersion';
  assert.deepEqual(d.rows.filter(r=>r.type==='刪除'&&!allowed(r)).map(r=>r.path),[]);
  const again=await updated.page.evaluate(doc=>{applyBalanceConfig(doc,{persist:false});return exportableBalance();},exported);assert.equal(D.diff(exported,again).total,0,'the export round-trips unchanged');assert.equal(await updated.page.evaluate(()=>!!GAMEPLAY_SETTINGS.quests.design),true);assert.deepEqual(updated.errors,[]);}finally{await updated.browser.close();}
});
test('unsupported published schema stops before game scripts and keeps saved bytes intact',async()=>{
 const r=await openRuntime(root);try{const before=await r.page.evaluate(()=>{localStorage.setItem('emberwild-save-probe','unchanged');return localStorage.getItem('emberwild-save-probe');});await r.page.route('http://localhost/data/balance.json?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...published,schemaVersion:999})}));await r.page.reload();assert.match(await r.page.locator('#app').innerText(),/資料載入失敗/);assert.equal(await r.page.evaluate(()=>typeof selectSaveSlot),'undefined');assert.equal(await r.page.evaluate(()=>localStorage.getItem('emberwild-save-probe')),before);}finally{await r.browser.close();}
});
