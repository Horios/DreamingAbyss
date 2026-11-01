const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=path.resolve(root,'../Emberwild-Balance');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);r.run('selectSaveSlot(1);start(0);closeModal();Math.random=()=>.99;');assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);return r;}
const ids=['heal_small','heal_standard','heal_greater','heal_supreme'];
test('fixed healing, overflow, thresholds, seconds cooldowns, shared inventory and original settings',()=>{
 const r=game();r.run('globalThis.originalBattleStats=battleStats;globalThis.mockMax=10000;battleStats=h=>({...originalBattleStats(h),hp:mockMax});state.autoPotion=true;state.autoPotionThresholdPct=99;');
 for(const [i,id]of ids.entries())for(const max of [100,10000]){
  r.ctx.id=id;r.ctx.max=max;r.run('mockMax=max;state.hp=1;state.shield=0;state.autoPotionId=id;state.healPotionCooldownRemaining=0;setHealPotionCount(id,3);useAutoHealingPotion(state)');
  assert.equal(r.run('state.hp'),Math.min(max,1+[20,50,200,500][i]));assert.equal(r.run('state.shield'),0);assert.equal(r.run('healPotionCount(id)'),2);
  assert.equal(r.run('state.healPotionCooldownRemaining'),(i+2)*3);
  r.run(`state.hp=1;for(let n=0;n<${i+2};n++)useAutoHealingPotion(state);`);assert.equal(r.run('healPotionCount(id)'),2);assert.equal(r.run('state.healPotionCooldownRemaining'),(i+2)*3);
  r.run('state.healPotionCooldownRemaining=0;useAutoHealingPotion(state)');assert.equal(r.run('healPotionCount(id)'),1);
 }
 r.run("mockMax=100;state.hp=36;state.autoPotionId='heal_small';state.autoPotionThresholdPct=35;state.healPotionCooldownRemaining=0;setHealPotionCount('heal_small',5)");assert.equal(r.run('useAutoHealingPotion(state)'),false);
 r.run('state.hp=35');assert.equal(r.run('useAutoHealingPotion(state)'),true);assert.equal(r.run('state.hp'),55);
 r.run('state.hp=1;state.autoPotion=false;state.healPotionCooldownRemaining=0');assert.equal(r.run('useAutoHealingPotion(state)'),false);
 r.run("recruitCompanion(10);closeModal();globalThis.ally=partyMember(10);ally.autoPotion=true;ally.autoPotionId='heal_small';ally.autoPotionThresholdPct=50;ally.healPotionCooldownRemaining=0;ally.hp=1;state.healPotionCooldownRemaining=2;");const stock=r.run("healPotionCount('heal_small')");assert.equal(r.run('useAutoHealingPotion(ally)'),true);assert.equal(r.run("healPotionCount('heal_small')"),stock-1);assert.equal(r.run('state.healPotionCooldownRemaining'),2);
 r.run('battleStats=originalBattleStats;spawnGroup()');assert.equal(r.run('state.healPotionCooldownRemaining'),2);assert.equal(r.run('ally.healPotionCooldownRemaining'),6);
 assert.match(r.run("supplyDetail(SHOP.find(x=>x.id==='heal_small'))"),/恢復 20 HP/);r.run('openHealingSettings()');assert.doesNotMatch(r.elements.get('modal').innerHTML,/恢復最大生命/);
});
test('every fixed, random, legacy and direct purchase entrance enforces VIP/status and current price',()=>{
 const r=game();r.run(`globalThis.d=exportableBalance();for(const id of ['heal_small','heal_standard','heal_greater','heal_supreme'])d.shopSettings.randomOffers.entries.push({id:'test_'+id,type:'item',key:id,enabled:true,quantityMin:1,quantityMax:1,weight:1,selection:'extra',chance:1,unitPrice:1,quantityScalesWithTier:false,priceScalesWithTier:false});applyBalanceConfig(d,{persist:false});`);
 for(const vip of [0,1,2,9])for(const [i,id]of ids.entries()){
  r.ctx.vip=vip;r.ctx.id=id;r.run('party.story.vip=vip;state.gold=100000;setHealPotionCount(id,0);party.market=generateMarket()');const allowed=i===0||i===1&&vip>=1;
  for(const action of [`buyHealingPotion(id)`,`buySupply(id)`,`buyFixedShopOffer(id)`,`buyMarketOffer(party.market.offers.find(x=>x.key===id).id)`,`purchaseShopOffer({kind:'item',key:id,qty:2,price:1},'test')`]){
   r.run('state.gold=100000;setHealPotionCount(id,0);party.market.offers.forEach(o=>o.sold=false)');r.run(action);
   const qty=action.startsWith('purchaseShopOffer')?2:1,cost=[15,200,500,2000][i]*qty,paid=vip?Math.max(1,Math.floor(cost*.95)):cost;
   assert.equal(r.run('healPotionCount(id)'),allowed?qty:0,`${vip} ${id} ${action}`);assert.equal(r.run('state.gold'),100000-(allowed?paid:0));
  }
 }
 r.run("party.story.vip=0;state.gold=100000;setHealPotionCount('heal_standard',0);buyPotion()");assert.equal(r.run("healPotionCount('heal_standard')"),0);
 r.run("setShopCategory('fixed');party.story.vip=0");assert.match(r.run('shopView()'),/銅級 VIP 解鎖/);assert.match(r.run('shopView()'),/尚未開放購買/);
 r.run('party.story.vip=1');assert.doesNotMatch(r.run('shopView()'),/銅級 VIP 解鎖/);
 assert.deepEqual(json(r,'healPotionItems().map(x=>x.sellPrice)'),[2,4,7,12]);
});
test('actual killed level and explicit kind select only one potion at all boundaries; boss is not elite',()=>{
 const r=game();
 for(const lv of [1,19,20,39,40,59,60,61])for(const kind of ['normal','elite','boss','final']){
  r.ctx.lv=lv;r.ctx.kind=kind;r.run("globalThis.e={lv,kind,monsterId:kind==='final'?'map6_boss':kind==='boss'?'map0_boss':'map0_mob0',region:0,difficulty:0};");
  const expected=['boss','final'].includes(kind)?[]:lv<20?['heal_small']:lv<40?['heal_standard']:lv<60?['heal_greater']:kind==='elite'?['heal_supreme']:[];
  assert.deepEqual(json(r,'configuredDropRules(e).filter(r=>r.independent).map(r=>r.key)'),expected,`${lv} ${kind}`);
  r.run('for(const x of healPotionItems())setHealPotionCount(x.id,0);rollConfiguredDrops(e,()=>0)');assert.deepEqual(json(r,'healPotionItems().filter(x=>healPotionCount(x.id)).map(x=>x.id)'),expected);
 }
});
test('independent potion roll never displaces other loot; chance boundary and 100000 seeded rolls',()=>{
 const r=game();r.run("GAMEPLAY_SETTINGS.monsters.catalog[0].maxDrops=1;globalThis.e={lv:19,mat:'黏稠凝膠',kind:'normal',monsterId:'map0_mob0',region:0,difficulty:0};globalThis.rule=configuredDropRules(e).find(r=>r.independent);for(const x of GAMEPLAY_SETTINGS.drops.entries)if(!x.independent)x.enabled=x.id==='map0_mob0_material_normal';");
 const before=r.run("materialCount('黏稠凝膠')");r.run('rollConfiguredDrops(e,()=>0)');assert.equal(r.run("materialCount('黏稠凝膠')"),before+1);assert.equal(r.run("healPotionCount('heal_small')"),6);
 assert.equal(r.run('effectiveDropChance(rule,e,0)'),.02);r.run('setHealPotionCount("heal_small",0);rollConfiguredDrops(e,()=>.02)');assert.equal(r.run('healPotionCount("heal_small")'),0);r.run('rollConfiguredDrops(e,()=>.019999)');assert.equal(r.run('healPotionCount("heal_small")'),1);
 const n=r.run(`(()=>{let seed=123456,n=0;const chance=effectiveDropChance(rule,e,0);for(let i=0;i<100000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed/4294967296<chance)n++;}return n;})()`);assert(n>1800&&n<2200,`drops=${n}`);
 // Per-kill reward guard, common to multi-monster encounters, logs and journal.
 r.run("state.autoPotion=false;globalThis.k1={...e,id:'drop1',name:'fixture',mat:'黏稠凝膠',hp:0};globalThis.k2={...k1,id:'drop2'};Math.random=()=>0;setHealPotionCount('heal_small',0);rewardGroupKill(k1);rewardGroupKill(k1);rewardGroupKill(k2)");assert.equal(r.run("healPotionCount('heal_small')"),2);
 assert.equal(r.run("expeditionLoot.items.get('簡易治療藥水').count"),2);assert(r.run("JSON.stringify(logs).includes('簡易治療藥水')"));
});
test('old design migrates once, old player potion stock/VIP/settings survive; fresh grant is simple',()=>{
 const r=game();assert.equal(r.run("healPotionCount('heal_small')"),5);assert.equal(r.run("healPotionCount('heal_standard')"),0);assert.equal(r.run('state.autoPotionId'),'heal_small');
 const legacy=structuredClone(require('../data/balance.json'));for(const [i,id] of ids.entries()){const item=legacy.items.find(x=>x.id===id);delete item.healAmount;delete item.shopAvailable;delete item.requiredVip;item.healFraction=[.25,.45,.7,1][i];item.cost=[8,15,28,50][i];}legacy.balanceSettings.drops.entries=legacy.balanceSettings.drops.entries.filter(x=>!x.id.startsWith('healing_heal_'));legacy.balanceSettings.drops.entries.push({id:'potion_all',type:'potion',name:'治療藥水',enabled:true,key:'',kinds:['normal','elite','boss','final'],sources:legacy.balanceSettings.monsters.catalog.map(m=>m.id),chanceByDifficulty:[.08,.08,.08],quantityMin:1,quantityMax:1});r.ctx.legacy=legacy;r.run('applyBalanceConfig(legacy,{persist:false})');assert.deepEqual(json(r,'healPotionItems().map(x=>[x.healAmount,x.cost])'),[[20,15],[50,200],[200,500],[500,2000]]);assert.deepEqual(json(r,'GAMEPLAY_SETTINGS.drops.entries.filter(x=>x.independent).map(x=>x.chanceByDifficulty)'),[[.02,.02,.02],[.01,.01,.01],[.01,.01,.01],[.005,.005,.005]]);
 r.run("SHOP.find(x=>x.id==='heal_small').healAmount=21;globalThis.doc=exportableBalance();applyBalanceConfig(doc,{persist:false})");assert.equal(r.run("healPotionItems()[0].healAmount"),21);
 r.run("state.healingPotions={heal_small:7,heal_standard:8,heal_greater:9,heal_supreme:10};state.autoPotion=false;state.autoPotionId='heal_supreme';state.autoPotionThresholdPct=27;party.story.vip=2;party.story.unlocks.shop_vip_bronze=true;save()");const storage=Object.fromEntries(r.values),reload=loadRuntime(root,'index.html',storage);assert.equal(reload.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);assert.deepEqual(json(reload,'healingInventory()'),{heal_small:7,heal_standard:8,heal_greater:9,heal_supreme:10});assert.deepEqual(json(reload,'[state.autoPotion,state.autoPotionId,state.autoPotionThresholdPct,party.story.vip]'),[false,'heal_supreme',27,2]);
});
test('game/editor JSON cycle retains fixed healing, sale locks, VIP and drop bounds, quantities and chances',async()=>{
 const g=game(),e=loadRuntime(editorRoot,'balance-editor.html');e.ctx.importText=JSON.stringify(json(g,'exportableBalance()'));
 await e.elements.get('fileInput').onchange({target:{files:[{name:'potion-test.json',text:async()=>e.ctx.importText}],value:'test'}});
 assert.deepEqual(json(e,'validateData()'),[]);
 e.run("globalThis.E=__EMBERWILD_INVENTORY_ICON_EDITOR;E.open('inventoryIcons','all','item:heal_standard');E.selectTab('effects');E.stage('item:heal_standard','object.healAmount',57);E.stage('item:heal_standard','object.cost',215);E.stage('item:heal_standard','sellPrice',6);E.stage('item:heal_standard','object.requiredVip',2);E.stage('item:heal_standard','object.shopAvailable',true);if(!E.save('item:heal_standard'))throw Error('manager save failed');Object.assign(data.balanceSettings.drops.entries.find(x=>x.id==='healing_heal_standard'),{minLevel:21,maxLevel:38,quantityMin:2,quantityMax:2,chanceByDifficulty:[.006,.006,.006]});selected.potion=1;currentSection='potions';render();");
 g.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');g.run('applyBalanceConfig(doc);save()');const re=loadRuntime(root,'index.html',Object.fromEntries(g.values)),d=json(re,'exportableBalance()');assert.equal(d.items.find(x=>x.id==='heal_standard').healAmount,57);assert.equal(d.items.find(x=>x.id==='heal_standard').requiredVip,2);const drop=d.balanceSettings.drops.entries.find(x=>x.id==='healing_heal_standard');assert.deepEqual([drop.minLevel,drop.maxLevel,drop.quantityMin,drop.chanceByDifficulty[0],drop.independent],[21,38,2,.006,true]);
 for(const mutate of ["d.items.find(x=>x.id==='heal_small').healAmount=0","d.items.find(x=>x.id==='heal_small').requiredVip=-1","d.balanceSettings.drops.entries.find(x=>x.independent).maxLevel=-1"]){assert.equal(g.run(`(()=>{const d=exportableBalance();${mutate};try{applyBalanceConfig(d);return false;}catch{return true;}})()`),true);}
 assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
});
test('normal and offline timeline produce identical potion drops, receipts, saves and no double grants',async()=>{
 function setup(){const r=game();r.run(`for(const d of GAMEPLAY_SETTINGS.drops.entries)if(d.independent)d.chanceByDifficulty=[1,1,1];state.autoPotion=false;state.hp=stats(state).hp;globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save()`);return r;}
 const a=setup(),b=setup(),before=b.run("healPotionCount('heal_small')");for(let i=0;i<1200;i++){a.advance(50);a.run('tick()');}b.advance(60000);await b.run('EmberwildOffline.settle()');assert.equal(b.run('EmberwildOffline.failed'),false);assert.deepEqual(json(a,'healingInventory()'),json(b,'healingInventory()'));const receipt=json(b,'party.offlineExploration.receipt');assert(receipt.kills>0);assert.equal(b.run("healPotionCount('heal_small')")-before,receipt.items['item:heal_small']);assert.equal(receipt.items['item:heal_small'],receipt.kills);const inv=json(b,'healingInventory()');b.ctx.saved=json(b,'packParty()');b.run('loadParty(saved)');assert.deepEqual(json(b,'healingInventory()'),inv);assert.deepEqual(b.errors,[]);
});
