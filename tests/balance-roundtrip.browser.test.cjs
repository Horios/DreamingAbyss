const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime,openEditorSection}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editor=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
test('every balance navigation page renders through the real grouped menu',async()=>{
 const e=await openRuntime(editor,'balance-editor.html');
 try{
  const pages=await e.page.locator('[data-sec]').evaluateAll(nodes=>nodes.map(x=>x.dataset.sec));
  assert(pages.includes('companionBalance'));assert(pages.includes('companionTokens'));assert(pages.includes('teamSettings'));
  for(const id of pages){await openEditorSection(e.page,id);assert(await e.page.locator('#app').innerText(),id);assert.deepEqual(e.errors,[],id);}
  assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);
 }finally{await e.browser.close();}
});
test('three real form/download/file-import/reload cycles retain material prices and actual sale proceeds',async()=>{
 const e=await openRuntime(editor,'balance-editor.html'),g=await openRuntime(root,'index.html',{}, {pathname:'/Emberwild/preview/'});
 try{
  await g.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);});await g.page.waitForTimeout(80);await g.page.evaluate(()=>closeModal());
  for(let cycle=1;cycle<=3;cycle++){
   const price=6+cycle;
   await openEditorSection(e.page,'materialPrices');
   const row=e.page.locator('[data-economy-material]').filter({has:e.page.locator('input.economy-material-key[value="紅色草"]')});
   await row.locator('.economy-material-price').fill(String(price));await row.locator('.economy-material-price').dispatchEvent('change');
   const promise=e.page.waitForEvent('download');await e.page.locator('#exportBtn').click();const download=await promise,buffer=fs.readFileSync(await download.path()),d=JSON.parse(buffer);
   assert.equal(d.balanceSettings.economy.materialPrices.find(x=>x.key==='紅色草').sellPrice,price);
   await g.page.evaluate(()=>{closeModal();setTab('options');});
   await require('./runtime.cjs').importBalanceFile(g.page,'audit-balance-'+cycle+'.json',buffer);
   await g.page.waitForFunction(price=>materialSellPrice('紅色草')===price,price);
   // Materials are sold from the bag's item details (全部賣出).
   const before=await g.page.evaluate(()=>{closeModal();state.materials['紅色草']=2;setTab('equipment');setInventoryCategory('materials');render();return state.gold;});
   await g.page.locator('[data-item-kind="material"][data-item-key="紅色草"]').first().click();
   await g.page.locator('#item-detail-dialog').getByRole('button',{name:'全部賣出',exact:true}).click();
   assert.equal(await g.page.evaluate(()=>state.gold),before+2*price);assert.equal(await g.page.evaluate(()=>materialCount('紅色草')),0);
   await g.page.reload();await g.page.evaluate(()=>{continueFromTitle();closeModal();clearInterval(timer);});
   assert.equal(await g.page.evaluate(()=>materialSellPrice('紅色草')),price);
   const roundtrip=await g.page.evaluate(()=>exportableBalance());
   await e.page.locator('#fileInput').setInputFiles({name:'game-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(roundtrip))});
   await e.page.waitForFunction(price=>data.balanceSettings.economy.materialPrices.find(x=>x.key==='紅色草').sellPrice===price,price);
   await e.page.locator('#cacheBtn').click();await e.page.reload();
   assert.equal(await e.page.evaluate(()=>data.balanceSettings.economy.materialPrices.find(x=>x.key==='紅色草').sellPrice),price);
   assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
  }
 }finally{await e.browser.close();await g.browser.close();}
});
