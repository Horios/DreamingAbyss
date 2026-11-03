const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const plain=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
function force(r,type){r.ctx.rewardType=type;r.run("{const d=exportableBalance();d.wishingLake.typeWeights={gold:0,item:0,equipment:0};d.wishingLake.typeWeights[rewardType]=1;applyBalanceConfig(d,{persist:false});}");}
test('unlock uses the complete first boss clear; legacy clears migrate and notification persists',()=>{
 const r=game();assert.equal(r.run('__EMBERWILD_WISHING_LAKE.ensure().unlocked'),false);
 r.run("state.materials['黏稠凝膠']=100;selectLakeOffering('gel');state.totalKills=999;state.lv=20;");assert.equal(r.run('confirmLakeOffering()'),false);
 r.run('recordMapClear(0);');assert.equal(r.run('party.wishingLake.unlocked&&party.wishingLake.notified'),true);
 r.run('globalThis.savedLake=packParty();loadParty(savedLake);');assert.equal(r.run('party.wishingLake.notified'),true);
 r.run('delete savedLake.wishingLake;loadParty(savedLake);');assert.equal(r.run('party.wishingLake.unlocked'),true);
 r.run('delete savedLake.mapClears;savedLake.achievements.bossKills[0]=1;loadParty(savedLake);');assert.equal(r.run('party.wishingLake.unlocked'),true);
 assert.deepEqual(r.errors,[]);
});
test('consumption, daily use, rapid clicks, same-browser old imports and Taiwan midnight',()=>{
 const r=game();force(r,'gold');r.run("recordMapClear(0);state.materials['黏稠凝膠']=49;globalThis.beforeLake=packParty();selectLakeOffering('gel');");
 assert.equal(r.run('confirmLakeOffering()'),false);assert.equal(r.run("materialCount('黏稠凝膠')"),49);
 r.run("state.materials['黏稠凝膠']=150;globalThis.beforeLake=JSON.parse(JSON.stringify(packParty()));selectLakeOffering('gel');globalThis.beforeGold=state.gold;");
 assert.equal(r.run('confirmLakeOffering()'),true);assert.equal(r.run("materialCount('黏稠凝膠')"),100);assert.equal(r.run('party.wishingLake.used'),1);
 assert(r.run('state.gold-beforeGold')>=500);assert(r.run('state.gold-beforeGold')<=20000);
 r.run("selectLakeOffering('gel')");for(let i=0;i<10;i++)assert.equal(r.run('confirmLakeOffering()'),false);
 r.run('loadParty(beforeLake);');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.remaining()'),0);
 const at=r.now;r.advance(Date.parse('2026-10-02T15:59:59Z')-at);assert.equal(r.run('__EMBERWILD_WISHING_LAKE.remaining()'),0);r.advance(1000);r.run('EmberwildOffline.advance(Date.now(),1000)');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.remaining()'),1);
 r.run("selectLakeOffering('gel')");assert.equal(r.run('confirmLakeOffering()'),true);
 r.run('globalThis.saved=JSON.parse(localStorage.getItem(KEY));loadParty(saved)');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.remaining()'),0);assert.deepEqual(r.errors,[]);
});
test('invalid rules and saving failures cannot consume or award; prepared journals recover once',()=>{
 const r=game();force(r,'gold');r.run("recordMapClear(0);state.materials['黏稠凝膠']=150;selectLakeOffering('gel');globalThis.pre=JSON.stringify(packParty());globalThis.realSave=save;save=()=>false;");
 assert.equal(r.run('confirmLakeOffering()'),false);assert.equal(r.run("materialCount('黏稠凝膠')"),150);assert.equal(r.run('party.wishingLake.used'),0);
 r.run('save=realSave;globalThis.realSet=localStorage.setItem;localStorage.setItem=()=>{throw Error("quota")};');assert.equal(r.run('confirmLakeOffering()'),false);assert.equal(r.run('party.wishingLake.used'),0);r.run('localStorage.setItem=realSet');
 assert.equal(r.run('confirmLakeOffering()'),true);const claimed=plain(r,'party.wishingLake.lastReward');
 r.run('globalThis.snapshot=JSON.stringify(packParty());localStorage.setItem(__EMBERWILD_WISHING_LAKE.ledgerKey(party),JSON.stringify({day:party.wishingLake.day,used:1,txId:party.wishingLake.lastReward.txId,pending:snapshot}));loadParty(JSON.parse(pre));');
 assert.deepEqual(plain(r,'party.wishingLake.lastReward'),claimed);assert.equal(r.run('__EMBERWILD_WISHING_LAKE.remaining()'),0);
 assert.throws(()=>r.run("{const d=exportableBalance();d.wishingLake.gold.max=20001;applyBalanceConfig(d,{persist:false})}"),/金幣/);
 assert.throws(()=>r.run("{const d=exportableBalance();d.wishingLake.inputs[0].key='不存在';applyBalanceConfig(d,{persist:false})}"),/引用不存在/);
 assert.throws(()=>r.run("{const d=exportableBalance();d.wishingLake.equipment.aheadLevels=6;applyBalanceConfig(d,{persist:false})}"),/最多 5/);
});
test('items use existing storage; equipment is legal, wearable, enhanceable and a full bag refuses gear offerings without consuming anything',()=>{
 const r=game();r.run("recordMapClear(0);state.materials['黏稠凝膠']=1000;");force(r,'item');
 r.run("{const d=exportableBalance();d.wishingLake.pools[0].rewards=d.wishingLake.pools[0].rewards.filter(x=>x.id==='heal');applyBalanceConfig(d,{persist:false});selectLakeOffering('gel');}");
 const before=r.run("__EMBERWILD_INVENTORY_STOCK.count('heal_small')");assert.equal(r.run('confirmLakeOffering()'),true);const n=r.run("__EMBERWILD_INVENTORY_STOCK.count('heal_small')")-before;assert(n>=2&&n<=5);
 r.advance(86400000);r.run('EmberwildOffline.advance(Date.now(),1000)');r.run("{const d=exportableBalance();d.wishingLake=EmberwildWishingLake.defaults();d.wishingLake.equipment.aheadChance=0;d.wishingLake.typeWeights={gold:0,item:0,equipment:1};applyBalanceConfig(d,{persist:false});playerHero().lv=20;syncParty();Math.random=()=>.1;selectLakeOffering('gel');}");assert.equal(r.run('confirmLakeOffering()'),true);
 r.run('globalThis.lakeGear=state.bag.at(-1);');assert.equal(r.run('gearRequiredLevel(lakeGear)'),1);assert.equal(r.run('lakeGear.plus'),0);assert(r.run('lakeGear.powerTier')>=1);assert.equal(r.run('lakeGear.skillSockets.gems.every(x=>x===null)'),true);
 assert(r.run('eligibleWearers(lakeGear).length')>0);r.run('equipSharedGear(lakeGear.id,memberKey(playerHero()),lakeGear.slot);state.gold=100000;state.ore=1000;state.dust=1000;enhance(lakeGear.id);');assert.equal(r.run('lakeGear.plus'),1);assert.doesNotThrow(()=>r.run('validateParty(packParty())'));
 r.advance(86400000);r.run('EmberwildOffline.advance(Date.now(),1000)');r.run("{const template=JSON.parse(JSON.stringify(lakeGear));while(state.bag.length<RULES.bagCapacity){state.bag.push({...template,id:'lake-fill-'+state.bag.length});}selectLakeOffering('gel');}");
 // Gear never overflows the bag (overflow drops are salvaged), so a full bag refuses an equipment-capable
 // offering before drawing: nothing is consumed and the outcome cannot be re-rolled by filling the bag.
 const full=JSON.parse(r.run("JSON.stringify({bag:state.bag.length,gel:state.materials['黏稠凝膠']})"));
 assert.equal(full.bag,r.run('RULES.bagCapacity'));assert.equal(r.run('confirmLakeOffering()'),false);
 assert.deepEqual(JSON.parse(r.run("JSON.stringify({bag:state.bag.length,gel:state.materials['黏稠凝膠']})")),full);assert.equal(r.run('party.wishingLake.used'),0,'the new day keeps its offering');
 r.run("state.bag.pop();selectLakeOffering('gel');");assert.equal(r.run('confirmLakeOffering()'),true);
 assert.equal(r.run('state.bag.length'),r.run('RULES.bagCapacity'));assert.equal(r.run('state.bag.at(-1).equipmentLevel>=1'),true);assert.doesNotThrow(()=>r.run('validateParty(packParty())'));
 assert.deepEqual(r.errors,[]);
});
test('10000 shared draws respect progress, gold bands, equipment caps and do not touch player inventory',()=>{
 const r=game();const before=r.run('JSON.stringify(packParty())');
 const result=plain(r,"EmberwildWishingLake.simulate(exportableBalance().wishingLake,exportableBalance(),{mapId:'map0',inputId:'gel',quantity:50,count:10000})");
 assert.equal(result.invalid,0);assert(result.goldMin>=500&&result.goldMax<=20000);assert(Math.abs(result.types.gold/10000-.5)<.03);assert(Math.abs(result.types.item/10000-.3)<.03);assert(Math.abs(result.aheadRatio-.1)<.035);assert(Object.keys(result.levels).every(lv=>+lv>=1&&+lv<=6));assert.equal(r.run('JSON.stringify(packParty())'),before);
 r.run("globalThis.poolConfig=exportableBalance();poolConfig.wishingLake.pools.push({id:'goldOnly',name:'金幣池',enabled:true,rewards:[{...poolConfig.wishingLake.pools[0].rewards[0]}]});poolConfig.wishingLake.inputs[0].poolId='goldOnly';");
 const goldOnly=plain(r,"EmberwildWishingLake.simulate(poolConfig.wishingLake,poolConfig,{mapId:'map0',inputId:'gel',quantity:50,count:100})");assert.equal(goldOnly.types.gold,100);assert.equal(goldOnly.invalid,0);
 r.run("poolConfig.wishingLake.pools[1].rewards.push({...poolConfig.wishingLake.pools[0].rewards[1]});poolConfig.wishingLake.pools[1].typeWeights={gold:0,item:1,equipment:0};");
 const own=plain(r,"EmberwildWishingLake.simulate(poolConfig.wishingLake,poolConfig,{mapId:'map0',inputId:'gel',quantity:50,count:100})");assert.equal(own.types.item,100);
 r.run("poolConfig.wishingLake.pools[1].enabled=false;applyBalanceConfig(poolConfig,{persist:false});recordMapClear(0);state.materials['黏稠凝膠']=100;selectLakeOffering('gel');");assert.equal(r.run('__EMBERWILD_WISHING_LAKE.choices().some(x=>x.id==="gel")'),false);assert.equal(r.run('confirmLakeOffering()'),false);assert.equal(r.run("materialCount('黏稠凝膠')"),100);
 assert.throws(()=>r.run("EmberwildWishingLake.simulate(poolConfig.wishingLake,poolConfig,{mapId:'map0',inputId:'gel',quantity:50,count:100})"),/停用/);
 r.run('globalThis.c=exportableBalance();c.wishingLake=EmberwildWishingLake.defaults();c.wishingLake.equipment.aheadChance=1;');const cap=plain(r,"EmberwildWishingLake.simulate(c.wishingLake,c,{mapId:'map12',inputId:'gel',quantity:50,count:10000})");assert(Object.keys(cap.levels).every(lv=>+lv>=57&&+lv<=60));
 r.run('c.wishingLake.future.fairyEvents.push({id:"future",enabled:true})');assert.throws(()=>r.run('EmberwildWishingLake.normalize(c.wishingLake,c)'),/停用/);
});
test('explicit gear inputs exclude locked, worn, socketed and protected gear; future triggers never consume',()=>{
 const r=game();r.run("recordMapClear(0);globalThis.loose=gear(1,1,0,0);state.bag.push(loose);globalThis.gearRef=__EMBERWILD_GEAR_CATALOGUE_KEY(loose);{const d=exportableBalance();d.wishingLake.allowEquipment=true;d.wishingLake.inputs.push({id:'loose',kind:gearRef.kind,key:gearRef.key,enabled:true,quantityMode:'fixed',min:1,max:1,poolId:'daily',specialTrigger:''});applyBalanceConfig(d,{persist:false});}");
 r.run('loose=findGear(loose.id)');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.choices().some(x=>x.id==="loose")'),true);
 r.run('loose.locked=true');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.choices().some(x=>x.id==="loose")'),false);
 r.run('loose.locked=false;state.equipped[1]=loose.id;');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.choices().some(x=>x.id==="loose")'),false);
 r.run('state.equipped[1]=null;loose=findGear(loose.id);loose.skillSockets.gems=[0];');assert.equal(r.run('__EMBERWILD_WISHING_LAKE.choices().some(x=>x.id==="loose")'),false);
 assert.throws(()=>r.run("{const d=exportableBalance();d.wishingLake.inputs[0].specialTrigger='future';applyBalanceConfig(d,{persist:false})}"),/不可啟用/);
});
