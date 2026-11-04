const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');const root=path.resolve(__dirname,'..'),balance=path.resolve(root,'../Emberwild-Balance');
test('Chromium: token UI, normal player equipment, enhancement, reserves and real reload',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);});await p.waitForTimeout(40);
  const ids=await p.evaluate(()=>{closeModal();clearInterval(timer);recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();const a=__EMBERWILD_TOKEN_TEST.makeToken('arcane',2),b=__EMBERWILD_TOKEN_TEST.makeToken('berserk',1);state.bag.push(a,b);setTab('worn');return [a.id,b.id];});await p.waitForTimeout(40);await p.evaluate(()=>closeModal());
  assert.equal(await p.locator('.worn-character-item').count(),0);assert.equal(await p.locator('.worn-player-equipment').count(),1);assert.equal(await p.locator('.worn-slot').count(),5);assert.equal(await p.locator('.token-slot').count(),2);
  await p.locator('[data-token-owner="10"]').getByRole('button',{name:'更換信物',exact:true}).click();await p.locator('[data-token-id="'+ids[0]+'"]').click();assert.equal(await p.evaluate(()=>partyMember(10).tokenId),ids[0]);
  await p.locator('[data-token-owner="10"]').getByRole('button',{name:'更換信物',exact:true}).click();assert.match(await p.locator('#modal').innerText(),/換裝比較/);await p.locator('[data-token-id="'+ids[1]+'"]').click();assert.equal(await p.evaluate(()=>partyMember(10).tokenId),ids[1]);
  await p.locator('[data-token-owner="10"]').getByRole('button',{name:'卸下',exact:true}).click();assert.equal(await p.evaluate(()=>partyMember(10).tokenId),null);
  await p.evaluate(()=>setTab('equipment'));await p.getByRole('button',{name:'信物',exact:true}).click();await p.getByRole('heading',{name:'夥伴信物',exact:true}).waitFor();
  // The bag lists tokens as item slots; equipping happens in 裝備與信物.
  assert.deepEqual(await p.locator('main [data-item-kind="token"]').evaluateAll(n=>n.map(e=>e.dataset.itemKey).sort()),['arcane','berserk']);
  await p.evaluate(()=>setTab('worn'));await p.locator('[data-token-owner="12"]').getByRole('button',{name:'更換信物',exact:true}).click();await p.locator('[data-token-id="'+ids[0]+'"]').click();assert.equal(await p.evaluate(()=>partyMember(12).tokenId),ids[0]);
  await p.evaluate(()=>{party.active=[0,10];setPartnerEnlisted(12,false);state.ore=10000;state.dust=10000;state.materials['以太鍛鐵']=1000;openForge(partyMember(12).tokenId);});await p.locator('#modal').getByRole('button',{name:'強化',exact:true}).click();assert.equal(await p.evaluate(()=>__EMBERWILD_TOKEN_TEST.item(partyMember(12)).plus),1);await p.evaluate(()=>closeModal());
  const before=await p.evaluate(()=>{save();return {stats:stats(partyMember(12)),id:partyMember(12).tokenId,plus:__EMBERWILD_TOKEN_TEST.item(partyMember(12)).plus,bag:state.bag.map(g=>g.id).sort(),hero:playerHero().equipped.slice()};});await p.reload();await p.evaluate(()=>{continueFromTitle();closeModal();clearInterval(timer);});await p.waitForTimeout(40);await p.evaluate(()=>closeModal());const after=await p.evaluate(()=>({stats:stats(partyMember(12)),id:partyMember(12).tokenId,plus:__EMBERWILD_TOKEN_TEST.item(partyMember(12)).plus,bag:state.bag.map(g=>g.id).sort(),hero:playerHero().equipped.slice()}));assert.deepEqual(after,before);
  for(const tab of ['roster','partnerRoster','character','skills','battle']){await p.evaluate(t=>setTab(t),tab);assert.equal(await p.locator('.companion-token-panel').count(),0);assert.equal(await p.locator('[data-token-owner]').count(),0);}
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>setTab('worn'));await p.locator('[data-token-owner="12"]').getByRole('button',{name:'更換信物',exact:true}).click();await p.locator('#modal').getByRole('button',{name:'關閉',exact:true}).click();assert.equal(await p.locator('.worn-character-item').count(),0);assert.equal(await p.locator('.worn-slot').count(),5);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('Chromium: actual designer CRUD, fields, download/import and runtime effect parity',async()=>{
 // A token without job applies to every class; the shared model and the editor import fill job:'all'.
 const withJob=t=>({...t,catalog:t.catalog.map(x=>({...x,job:x.job??'all'}))});
 const e=await openRuntime(balance,'balance-editor.html'),g=await openRuntime(root);
 try{
  await e.page.evaluate(()=>{currentSection='companionTokens';render();});assert.equal(await e.page.locator('[data-token-select]').count(),10);
  await e.page.getByRole('button',{name:'新增信物',exact:true}).click();await e.page.locator('[data-token-field="catalog.10.name"]').fill('設計器測試信物');await e.page.locator('[data-token-field="catalog.10.name"]').dispatchEvent('change');
  await e.page.locator('[data-token-field="catalog.10.effects.0.value"]').fill('7');await e.page.locator('[data-token-field="catalog.10.effects.0.value"]').dispatchEvent('change');
  await e.page.locator('[data-token-field="catalog.10.ability.event"]').selectOption('battleStart');await e.page.locator('[data-token-field="catalog.10.ability.value"]').fill('0.2');await e.page.locator('[data-token-field="catalog.10.ability.value"]').dispatchEvent('change');
  await e.page.locator('[data-token-field="drop.chanceByDifficulty.0"]').fill('0.5');await e.page.locator('[data-token-field="drop.chanceByDifficulty.0"]').dispatchEvent('change');
  await e.page.getByRole('button',{name:'複製信物',exact:true}).click();assert.equal(await e.page.locator('[data-token-select]').count(),12);e.page.once('dialog',d=>d.accept());await e.page.getByRole('button',{name:'刪除信物',exact:true}).click();assert.equal(await e.page.locator('[data-token-select]').count(),11);
  await e.page.evaluate(()=>{currentSection='companions';render();});const growth=e.page.locator('[data-partner-stat="growthPerLevel"][data-stat-key="pierce"]');await growth.fill('0.25');await growth.dispatchEvent('change');
  assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);
  const downloadPromise=e.page.waitForEvent('download');await e.page.getByRole('button',{name:'匯出測試 JSON',exact:true}).click();const doc=JSON.parse(fs.readFileSync(await (await downloadPromise).path(),'utf8'));assert.equal(doc.companionTokens.catalog.length,11);assert.equal(doc.companionTokens.drop.chanceByDifficulty[0],.5);assert.equal(doc.companions[0].growthPerLevel.pierce,.25);
  await g.page.evaluate(()=>{selectSaveSlot(1);start(0);});await g.page.waitForTimeout(40);await g.page.evaluate(()=>closeModal());
  const out=await g.page.evaluate(d=>{applyBalanceConfig(d);recruitCompanion(10);closeModal();playerHero().lv=5;syncParty();const def=d.companionTokens.catalog.find(x=>x.name==='設計器測試信物'),t=__EMBERWILD_TOKEN_TEST.makeToken(def.id,0);state.bag.push(t);const before=stats(partyMember(10));equipCompanionToken(t.id,10);foes=[{id:'parity',hp:1000,name:'測試',element:'physical',race:'beast',def:0}];__EMBERWILD_TOKEN_TEST.ensureBattle(partyMember(10));const after=stats(partyMember(10)),ability=effectTotal(heroKey(partyMember(10)),'attack'),cfg=exportableBalance();save();return {before,after,ability,cfg};},doc);assert.equal(out.after.atk-out.before.atk,7);assert.equal(out.after.pierce,1);assert.equal(out.ability,.2);assert.deepEqual(withJob(out.cfg.companionTokens),withJob(doc.companionTokens));
  // Editor imports its actual downloaded JSON through the existing workspace input.
  const importer=e.page.locator('input[type="file"]').first();await importer.setInputFiles({name:'token-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await e.page.waitForTimeout(50);
  // Import fills editor defaults (such as job:'all'); downloading again must reproduce the downloaded tokens exactly.
  const againPromise=e.page.waitForEvent('download');await e.page.getByRole('button',{name:'匯出測試 JSON',exact:true}).click();const again=JSON.parse(fs.readFileSync(await (await againPromise).path(),'utf8'));
  assert.deepEqual(withJob(again.companionTokens),withJob(doc.companionTokens));
  assert(await e.page.evaluate(()=>data.companionTokens.catalog.every(t=>(t.job??'all')==='all'||Number.isInteger(t.job))),'imported tokens keep a valid class');
  assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
 }finally{await e.browser.close();await g.browser.close();}
});
