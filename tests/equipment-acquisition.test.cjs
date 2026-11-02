const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),seed=require('../data/balance.json'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){const r=loadRuntime(root);r.ctx.seed=structuredClone(seed);r.run('applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();');return r;}
test('standard shop stages, buying early, level gates, quantities, folding and rollback use the existing shop',()=>{
 const r=game();
 assert.deepEqual(json(r,'__EMBERWILD_EQUIPMENT_SHOP.currentOffers().map(s=>s.level)'),[1]);
 assert.equal(r.run("buyEquipmentShopOffer('equipment_lv20/job0-slot0-form0')"),false);
 r.run("playerHero().lv=18;syncParty();recordMapClear(3);state.gold=100000;save();setShopCategory('equipment');");
 assert.deepEqual(json(r,'__EMBERWILD_EQUIPMENT_SHOP.currentOffers().map(s=>s.level)'),[20,1]);
 assert.equal(r.run('recordMapClear(3)'),false);
 const html=r.run('shopView()');assert.match(html,/equipment_lv20[^]*?aria-expanded="true"/);assert.match(html,/equipment_lv1[^]*?aria-expanded="false"/);
 r.run("setEquipmentShopFold('equipment_lv20',false)");assert.match(r.run('shopView()'),/equipment_lv20[^]*?aria-expanded="false"/);
 r.run("setEquipmentShopFold('equipment_lv1',true)");assert.match(r.run('shopView()'),/equipment_lv1[^]*?aria-expanded="true"/);
 const before=json(r,'({gold:state.gold,bag:state.bag.length})');assert.equal(r.run("buyEquipmentShopOffer('equipment_lv20/job0-slot0-form0',2)"),true);
 const g=json(r,'state.bag.at(-1)');assert.equal(g.equipmentLevel,20);assert.equal(g.powerTier,5);assert.equal(g.baseSnapshot.mult,1);assert.deepEqual(g.affix,[]);assert.equal(g.prefixId,'');assert.equal(g.suffixId,'');
 assert.equal(r.run('state.gold'),before.gold-18000);assert.equal(r.run('state.bag.length'),before.bag+2);
 assert.equal(r.run('eligibleWearers(state.bag.at(-1)).length'),0);
 r.run('globalThis.early=state.bag.at(-1).id;equipSharedGear(early,memberKey(playerHero()),0);');assert.equal(r.run('state.equipped.includes(early)'),false);
 r.run('playerHero().lv=20;syncParty();equipSharedGear(early,memberKey(playerHero()),0);');assert.equal(r.run('state.equipped.includes(early)'),true);
 const current=json(r,'({gold:state.gold,bag:state.bag.length})');r.run('globalThis.realSave=save;save=()=>false;');assert.equal(r.run("buyEquipmentShopOffer('equipment_lv1/job0-slot0-form0',2)"),false);assert.deepEqual(json(r,'({gold:state.gold,bag:state.bag.length})'),current);r.run('save=realSave;');
 assert.equal(r.run("buyEquipmentShopOffer('equipment_lv1/job0-slot0-form0',NaN)"),false);
 assert.deepEqual(r.errors,[]);
});
test('shop bases for every class/slot are deterministic and a blank item can be enhanced and rerolled without changing base/T/level',()=>{
 const r=game();const result=json(r,`(()=>{const out=[];for(const entry of seed.shopSettings.equipmentStages[0].entries){const a=createEquipmentShopGear('equipment_lv1',entry.id),b=createEquipmentShopGear('equipment_lv1',entry.id);out.push({slot:a.slot,job:a.job,affix:a.affix.length,same:JSON.stringify(a.baseSnapshot)===JSON.stringify(b.baseSnapshot),t:a.powerTier});}state.gold=100000;state.dust=1000;state.ore=1000;buyEquipmentShopOffer('equipment_lv1/job0-slot0-form0');const g=state.bag.at(-1);globalThis.gearUnderTest=g;const before={base:JSON.stringify(g.baseSnapshot),t:g.powerTier,level:gearRequiredLevel(g)};reroll(g.id);const draft=inlineAffixDrafts.get(affixDraftKey(g));resolveInlineAffix(g.id,true);const cost=rerollCostFor(g);enhance(g.id);return {out,before,after:{base:JSON.stringify(g.baseSnapshot),t:g.powerTier,level:gearRequiredLevel(g)},plus:g.plus,affixes:g.affix.length,draft:draft.length,cost,roundTrip:validateParty(packParty()).members[0].bag.at(-1).baseSnapshot};})()`);
 assert.equal(result.out.length,28);for(let job=0;job<4;job++)for(let slot=0;slot<4;slot++)assert(result.out.some(r=>r.job===job&&r.slot===slot));assert(result.out.every(r=>r.same&&r.affix===0&&r.t===5));assert.deepEqual(result.before,result.after);assert.equal(result.plus,1);assert.equal(result.affixes,2);assert.equal(result.draft,2);assert.equal(result.cost.dust,10);assert.equal(JSON.stringify(result.roundTrip),result.before.base);
 r.run("state.consumables.power_tier_reroll=1;rerollEquipmentPowerTier(gearUnderTest.id)");assert.equal(r.run('state.consumables.power_tier_reroll'),1);assert.equal(r.run('gearUnderTest.powerTier'),5);
 assert.deepEqual(r.errors,[]);
});
test('ten T levels use one multiplier, BOSS uses its own band and exclusive effects are separate from its base',()=>{
 const r=game();const rows=json(r,`(()=>{const out=[];for(let job=0;job<4;job++)for(let slot=0;slot<4;slot++)for(let t=1;t<=10;t++){const g=gear(10,slot,0,job);g.formJob=job;g.form=0;g.prefixId='';g.suffixId='';g.affix=[];g.powerTier=t;delete g.baseSnapshot;const b=gearStatBreakdown(g);out.push({kind:'normal',t,mult:b.mult,body:b.body,base:g.baseSnapshot.base});}for(let job=0;job<4;job++)for(let mi=0;mi<MAPS.length;mi++){if(worldIsFinalMap(mi))continue;for(let t=1;t<=10;t++){const g=bossGear(mi,job,0);g.powerTier=t;delete g.baseSnapshot;const b=gearStatBreakdown(g);out.push({kind:'boss',t,mult:b.mult,body:b.body,base:g.baseSnapshot.base,affixes:g.affix.length});}}return out;})()`);
 assert.equal(rows.length,1120);for(const row of rows){const multiplier=seed.equipmentPowerSystem.strength[row.kind==='boss'?'bossMultipliers':'multipliers'][row.t-1];assert.equal(row.mult,multiplier);for(const key of ['atk','hp','def'])assert.equal(row.base[key],Math.round(row.body[key]*multiplier));if(row.kind==='boss')assert.equal(row.affixes,2);}
 r.run('state.gold=100000;state.dust=1000;globalThis.bossItem=bossGear(1,0,0);state.bag.push(bossItem);globalThis.bossBefore=JSON.stringify(bossItem.baseSnapshot);reroll(bossItem.id);resolveInlineAffix(bossItem.id,true);');assert.equal(r.run('JSON.stringify(bossItem.baseSnapshot)===bossBefore'),true);assert.equal(r.run('bossItem.affix.length'),2);
 assert.deepEqual(r.errors,[]);
});
test('owned generated bases and legacy equipment stay unchanged through balance publish and save reload',()=>{
 const r=game();const out=json(r,`(()=>{const g={id:'legacy-item',name:'舊板甲',tier:10,slot:1,rar:2,plus:4,affix:[{type:1,rank:2,value:9}],job:0,difficulty:2,powerTier:10,prefixId:'',suffixId:'',formJob:0,form:0};state.bag.push(g);const before=gearBaseStats(g),raw=packParty(),base=JSON.stringify(g.baseSnapshot);const next=exportableBalance();next.equipmentPowerSystem.strength.multipliers=Array(10).fill(3);next.equipmentPowerSystem.strength.bossMultipliers=Array(10).fill(4);next.balanceSettings.equipment.baseStats.armorHpPerTier=80;applyBalanceConfig(next,{persist:false});const after=gearBaseStats(findGear('legacy-item'));loadParty(raw);return {before,after,reloaded:gearBaseStats(findGear('legacy-item')),base,snapshot:JSON.stringify(findGear('legacy-item').baseSnapshot)};})()`);
 // Legacy armor (equipment LV46, +4): refinement adds at least one integer point per level since 377bcf0,
 // hp ceil(1+45*.08)=5 and def ceil(.2+45*.015)=1 per level over the 158/43 base snapshot.
 assert.deepEqual(out.before,{hp:178,atk:0,def:47});assert.deepEqual(out.after,out.before);assert.deepEqual(out.reloaded,out.before);assert.equal(out.snapshot,out.base);assert.deepEqual(r.errors,[]);
});
test('legacy kill/first-boss records unlock shops once; new per-enemy kills do not clear an unfinished boss stage',()=>{
 const r=game();r.run("globalThis.old=packParty();delete old.mapClears;delete old.equipmentShopUnlocked;old.etherBossClaims=['1:0'];old.achievements.bossKills[3]=1;loadParty(old)");assert.deepEqual(json(r,'__EMBERWILD_EQUIPMENT_SHOP.currentOffers().map(s=>s.level)'),[20,10,1]);
 r.run("recordMapClear(0);globalThis.saved=packParty();loadParty(saved)");assert.equal(r.run('party.mapClears.map0'),true);assert.equal(r.run('party.equipmentShopUnlocked.length'),3);
 r.run("party.achievements.bossKills[5]=1;party.etherBossClaims.push('5:0');save()");assert.equal(r.run('party.mapClears.map5'),undefined);assert.equal(r.run("__EMBERWILD_EQUIPMENT_SHOP.currentOffers().some(s=>s.level===30)"),false);
 r.run('recordMapClear(5)');assert.equal(r.run("__EMBERWILD_EQUIPMENT_SHOP.currentOffers().some(s=>s.level===30)"),true);assert.deepEqual(r.errors,[]);
});
test('completing a real boss stage records its map once, including stages with multiple bosses',()=>{
 const r=game();r.run("globalThis.multi=exportableBalance();const extra=structuredClone(multi.balanceSettings.monsters.catalog.find(m=>m.mapIndex===3&&m.kind==='boss'));extra.id='map3_boss_extra';extra.name='測試第二首領';extra.bossStageCount=1;multi.balanceSettings.monsters.catalog.push(extra);multi.balanceSettings.maps.catalog[3].bossStageMode='fixed';applyBalanceConfig(multi,{persist:false});playerHero().lv=20;syncParty();party.map=3;syncParty();bossProgressEntry(3).charges=1;startBossChallenge();globalThis.bosses=foes.filter(e=>e.kind==='boss');");
 r.run("bosses[0].hp=0;rewardGroupKill(bosses[0]);");assert.equal(r.run('party.mapClears?.map3'),undefined);assert.equal(r.run("party.equipmentShopUnlocked?.includes('equipment_lv20')||false"),false);
 r.run("for(const e of foes){e.hp=1;e.atk=0;}for(const h of heroes())h.hp=stats(h).hp;closeModal();running=true;for(let i=0;i<500&&party.bossChallenge?.active;i++)EmberwildSecondsCombat.step();");assert.equal(r.run('party.mapClears.map3'),true);assert.equal(r.run("party.equipmentShopUnlocked.includes('equipment_lv20')"),true);assert.equal(r.run('recordMapClear(3)'),false);assert.deepEqual(r.errors,[]);
});
test('roaming gear is rare, boosters still multiply it, low maps attenuate gear only and material/forge income remains',()=>{
 const r=game();const out=json(r,`(()=>{const d=GAMEPLAY_SETTINGS.drops.entries,gear=d.find(x=>x.id==='gear_normal'),mat=d.find(x=>x.id==='map0_mob0_material_normal'),boss=d.find(x=>x.id==='boss_gear'),e={monsterId:'map0_mob0',mat:'黏稠凝膠',kind:'normal',region:0,difficulty:0};const a=effectiveDropChance(gear,e,0),boosted=effectiveDropChance(gear,e,1);playerHero().lv=60;syncParty();const suppressed=effectiveDropChance(gear,e,0),material=effectiveDropChance(mat,e,0);let dust=0;const before=state.dust;for(let i=0;i<30;i++)rollConfiguredDrops(e,()=>0);dust=state.dust-before;return {a,boosted,suppressed,material,boss:boss.chanceByDifficulty,dust,ore:state.ore,materials:state.materials['黏稠凝膠'],daily:GAMEPLAY_SETTINGS.quests.design.daily.entries.find(x=>x.id==='daily_salvage').objectives[0]};})()`);
 const published=id=>seed.balanceSettings.drops.entries.find(x=>x.id===id).chanceByDifficulty;
 assert.equal(out.a,published('gear_normal')[0]);assert.equal(out.boosted,out.a*2);assert(out.suppressed<out.a/10);assert.equal(out.material,published('map0_mob0_material_normal')[0]);assert.deepEqual(out.boss,published('boss_gear'));assert(out.dust>=30);assert(out.materials>=30);assert.equal(out.daily.quantityMax,1);assert.deepEqual(r.errors,[]);
});
test('published JSON roundtrips all new fields and rejects invalid equipment references, T weights and unsafe snapshots',()=>{
 const r=game();assert.equal(r.run('EmberwildBalanceDocument.inspect(exportableBalance()).length'),0);
 assert.deepEqual(json(r,'validateBalanceConfig(exportableBalance()).shopSettings.equipmentStages'),seed.shopSettings.equipmentStages);
 r.run('globalThis.bad=exportableBalance();bad.shopSettings.equipmentStages[0].entries[0].formId="missing"');assert.throws(()=>r.run('validateBalanceConfig(bad)'),/商品引用/);
 r.run('bad=exportableBalance();bad.equipmentPowerSystem.strength.weightsByDifficulty[0]=Array(10).fill(0)');assert.throws(()=>r.run('validateBalanceConfig(bad)'),/權重/);
 r.run('bad=packParty();bad.members[0].bag[0].baseSnapshot={version:1,mult:1,raw:{atk:-1,hp:0,def:0},body:{atk:0,hp:0,def:0},base:{atk:0,hp:0,def:0}}');assert.throws(()=>r.run('validateParty(bad)'),/基底快照/);
 assert.deepEqual(r.errors,[]);
});

test('gear and BOSS gear follow the exact EXP level-gap tiers without changing material rates',()=>{
 const r=game();
 const rows=json(r,`(()=>{const normal=GAMEPLAY_SETTINGS.drops.entries.find(x=>x.id==='gear_normal'),boss=GAMEPLAY_SETTINGS.drops.entries.find(x=>x.id==='boss_gear'),material=GAMEPLAY_SETTINGS.drops.entries.find(x=>x.id==='map0_mob0_material_normal'),enemy={monsterId:'map0_mob0',mat:'黏稠凝膠',kind:'normal',lv:1,region:0,difficulty:0},out=[];
   for(const gap of [0,2,3,4,5,9,10]){playerHero().lv=1+gap;syncParty();out.push({gap,gear:effectiveDropChance(normal,enemy,0),boss:effectiveDropChance(boss,{...enemy,monsterId:'map0_boss',kind:'boss'},0),material:effectiveDropChance(material,enemy,0)});}return out;})()`);
 const wanted=new Map([[0,1],[2,1],[3,.5],[4,.5],[5,.2],[9,.2],[10,0]]),published=id=>seed.balanceSettings.drops.entries.find(x=>x.id===id).chanceByDifficulty[0];
 const gearChance=published('gear_normal'),bossChance=published('boss_gear'),materialChance=published('map0_mob0_material_normal');
 for(const row of rows){
   const f=wanted.get(row.gap);
   assert(Math.abs(row.gear-gearChance*f)<1e-10,'normal gear gap '+row.gap);
   assert(Math.abs(row.boss-bossChance*f)<1e-10,'BOSS gear gap '+row.gap);
   const materialFactor=row.gap<=5?1:row.gap<=10?1-(row.gap-5)*.1:0;
   assert(Math.abs(row.material-materialChance*materialFactor)<1e-10,'material unchanged gap '+row.gap);
 }
 assert.deepEqual(r.errors,[]);
});
