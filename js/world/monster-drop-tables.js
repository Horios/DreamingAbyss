
/* Update 15: data-driven monster catalog, per-monster drop tables and drop-rate affixes. */
if(!SHOP.some(x=>x.type==='healPotion'))SHOP.push(...EmberwildHealingPotions.defaults.map(x=>structuredClone(x)));
const DEFAULT_MONSTER_CATALOG=[{"id":"map0_mob0","name":"苔原史萊姆","mapIndex":0,"kind":"normal","material":"黏稠凝膠","element":"wind","race":"spirit","maxDrops":99},{"id":"map0_mob1","name":"林間野狼","mapIndex":0,"kind":"normal","material":"完整狼牙","element":"wind","race":"beast","maxDrops":99},{"id":"map0_mob2","name":"迷路樹精","mapIndex":0,"kind":"normal","material":"活性樹芯","element":"wind","race":"plant","maxDrops":99},{"id":"map0_boss","name":"古木守望者","mapIndex":0,"kind":"boss","material":"古木年輪","element":"wind","race":"plant","maxDrops":99}];
const DEFAULT_DROP_ENTRIES=[{"id":"map0_mob0_material_normal","name":"黏稠凝膠","enabled":true,"type":"sourceMaterial","key":"","kinds":["normal"],"chanceByDifficulty":[0.025,0.035,0.048],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0"]},{"id":"map0_mob0_material_elite","name":"黏稠凝膠（菁英）","enabled":true,"type":"sourceMaterial","key":"","kinds":["elite"],"chanceByDifficulty":[0.1,0.1,0.1],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0"]},{"id":"map0_mob1_material_normal","name":"完整狼牙","enabled":true,"type":"sourceMaterial","key":"","kinds":["normal"],"chanceByDifficulty":[0.025,0.035,0.048],"quantityMin":1,"quantityMax":1,"sources":["map0_mob1"]},{"id":"map0_mob1_material_elite","name":"完整狼牙（菁英）","enabled":true,"type":"sourceMaterial","key":"","kinds":["elite"],"chanceByDifficulty":[0.1,0.1,0.1],"quantityMin":1,"quantityMax":1,"sources":["map0_mob1"]},{"id":"map0_mob2_material_normal","name":"活性樹芯","enabled":true,"type":"sourceMaterial","key":"","kinds":["normal"],"chanceByDifficulty":[0.025,0.035,0.048],"quantityMin":1,"quantityMax":1,"sources":["map0_mob2"]},{"id":"map0_mob2_material_elite","name":"活性樹芯（菁英）","enabled":true,"type":"sourceMaterial","key":"","kinds":["elite"],"chanceByDifficulty":[0.1,0.1,0.1],"quantityMin":1,"quantityMax":1,"sources":["map0_mob2"]},{"id":"map0_boss_material","name":"古木年輪","enabled":true,"type":"sourceMaterial","key":"","kinds":["boss"],"chanceByDifficulty":[0.2,0.2,0.2],"quantityMin":1,"quantityMax":1,"sources":["map0_boss"]},{"id":"boss_gear","name":"BOSS 專屬裝備","enabled":true,"type":"bossGear","key":"","kinds":["boss"],"chanceByDifficulty":[0.06,0.1,0.15],"quantityMin":1,"quantityMax":1,"sources":["map0_boss"]},{"id":"radiant_normal","name":"光輝碎塊（普通／菁英）","enabled":true,"type":"material","key":"光輝碎塊","kinds":["normal","elite"],"chanceByDifficulty":[0.0004,0.0004,0.0004],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0","map0_mob1","map0_mob2"]},{"id":"radiant_boss","name":"光輝碎塊（首領）","enabled":true,"type":"material","key":"光輝碎塊","kinds":["boss","final"],"chanceByDifficulty":[0.008,0.008,0.008],"quantityMin":1,"quantityMax":1,"sources":["map0_boss"]},{"id":"cultivation_dust_normal","name":"鍛鐵","enabled":true,"type":"ore","key":"","kinds":["normal"],"chanceByDifficulty":[0.0063,0.0091,0.0112],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0","map0_mob1","map0_mob2"]},{"id":"cultivation_dust_elite","name":"鍛鐵","enabled":true,"type":"ore","key":"","kinds":["elite"],"chanceByDifficulty":[0.049,0.063,0.077],"quantityMin":1,"quantityMax":2,"sources":["map0_mob0","map0_mob1","map0_mob2"]},{"id":"gel-armor-normal","name":"凝膠護符","enabled":true,"type":"equipment","key":"form:4:3:2","kinds":["normal"],"chanceByDifficulty":[0.0004,0.0005,0.0006],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0"]},{"id":"gel-armor-elite","name":"凝膠護符","enabled":true,"type":"equipment","key":"form:4:3:2","kinds":["elite"],"chanceByDifficulty":[0.0012,0.0015,0.0018],"quantityMin":1,"quantityMax":1,"sources":["map0_mob0"]},{"id":"wolf-fang-pendant-normal","name":"狼牙綴飾","enabled":true,"type":"equipment","key":"form:4:3:1","kinds":["normal"],"chanceByDifficulty":[0.0004,0.0005,0.0006],"quantityMin":1,"quantityMax":1,"sources":["map0_mob1"]},{"id":"wolf-fang-pendant-elite","name":"狼牙綴飾","enabled":true,"type":"equipment","key":"form:4:3:1","kinds":["elite"],"chanceByDifficulty":[0.0012,0.0015,0.0018],"quantityMin":1,"quantityMax":1,"sources":["map0_mob1"]},{"id":"living-core-talisman-normal","name":"纏藤法杖","enabled":true,"type":"equipment","key":"form:4:0:0","kinds":["normal"],"chanceByDifficulty":[0.0004,0.0005,0.0006],"quantityMin":1,"quantityMax":1,"sources":["map0_mob2"]},{"id":"living-core-talisman-elite","name":"纏藤法杖","enabled":true,"type":"equipment","key":"form:4:0:0","kinds":["elite"],"chanceByDifficulty":[0.0012,0.0015,0.0018],"quantityMin":1,"quantityMax":1,"sources":["map0_mob2"]},{"id":"ancient-heart-bracer-boss","name":"古木之心護腕","enabled":true,"type":"equipment","key":"form:4:2:1","kinds":["boss"],"chanceByDifficulty":[0.05,0.08,0.12],"quantityMin":1,"quantityMax":1,"sources":["map0_boss"]},{"id":"gear_pool_map0_mob0_normal","name":"一般裝備（苔原史萊姆）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["normal"],"chanceByDifficulty":[0.002,0.0027,0.0034],"sources":["map0_mob0"],"pool":[{"key":"form:3:0:0","weight":1},{"key":"form:3:3:0","weight":1}]},{"id":"gear_pool_map0_mob0_elite","name":"一般裝備（菁英苔原史萊姆）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["elite"],"chanceByDifficulty":[0.006,0.008,0.01],"sources":["map0_mob0"],"pool":[{"key":"form:3:0:0","weight":1},{"key":"form:3:3:0","weight":1}]},{"id":"gear_pool_map0_mob1_normal","name":"一般裝備（林間野狼）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["normal"],"chanceByDifficulty":[0.002,0.0027,0.0034],"sources":["map0_mob1"],"pool":[{"key":"form:2:0:0","weight":1},{"key":"form:2:1:0","weight":1}]},{"id":"gear_pool_map0_mob1_elite","name":"一般裝備（菁英林間野狼）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["elite"],"chanceByDifficulty":[0.006,0.008,0.01],"sources":["map0_mob1"],"pool":[{"key":"form:2:0:0","weight":1},{"key":"form:2:1:0","weight":1}]},{"id":"gear_pool_map0_mob2_normal","name":"一般裝備（迷路樹精）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["normal"],"chanceByDifficulty":[0.002,0.0027,0.0034],"sources":["map0_mob2"],"pool":[{"key":"form:1:0:1","weight":1},{"key":"form:1:1:0","weight":1}]},{"id":"gear_pool_map0_mob2_elite","name":"一般裝備（菁英迷路樹精）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["elite"],"chanceByDifficulty":[0.006,0.008,0.01],"sources":["map0_mob2"],"pool":[{"key":"form:1:0:1","weight":1},{"key":"form:1:1:0","weight":1}]},{"id":"gear_pool_map0_boss","name":"一般裝備（古木守望者）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"monsterGear","key":"","kinds":["boss","final"],"chanceByDifficulty":[0.2,0.25,0.3],"sources":["map0_boss"],"pool":[{"key":"form:0:0:0","weight":1},{"key":"form:0:1:0","weight":1}]},{"id":"gem_map0_normal","name":"地圖寶石（無名密林）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"gemPool","key":"","kinds":["normal"],"chanceByDifficulty":[0.033,0.066,0.11],"sources":["map0_mob0","map0_mob1","map0_mob2"],"pool":[{"key":"1","weight":1}]},{"id":"gem_map0_elite","name":"地圖寶石（菁英，無名密林）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"gemPool","key":"","kinds":["elite"],"chanceByDifficulty":[0.099,0.187,0.297],"sources":["map0_mob0","map0_mob1","map0_mob2"],"pool":[{"key":"1","weight":1}]},{"id":"gem_map0_boss","name":"首領寶石（無名密林）","enabled":true,"quantityMin":1,"quantityMax":1,"type":"gemPool","key":"","kinds":["boss","final"],"chanceByDifficulty":[0.297,0.44,0.605],"sources":["map0_boss"],"pool":[{"key":"1","weight":2},{"key":"2","weight":1},{"key":"3","weight":1}]}];
EmberwildHealingPotions.migrateDrops({monsters:{catalog:DEFAULT_MONSTER_CATALOG},drops:{entries:DEFAULT_DROP_ENTRIES}});
GAME_BALANCE_DEFAULTS.affixes.extendedValues.dropRateBonus ??= {normal:0,fine:5,rare:10,legendary:20};
GAME_BALANCE=normalizeRuntimeBalance(GAME_BALANCE);
GAMEPLAY_SETTINGS_DEFAULTS.monsters.catalog ??= cloneGameplaySettings(DEFAULT_MONSTER_CATALOG);
GAMEPLAY_SETTINGS_DEFAULTS.drops ??= {};
GAMEPLAY_SETTINGS_DEFAULTS.drops.entries ??= cloneGameplaySettings(DEFAULT_DROP_ENTRIES);

mergeGameplayShape=function mergeGameplayShapeDrops(def,src,path=''){
    if(/^drops\.entries\.\d+$/.test(path)&&src&&typeof src==='object')return cloneGameplaySettings(src);
  if(Array.isArray(def)){
    const dynamic=path==='monsters.skills'||path==='monsters.catalog'||path==='drops.entries'||/^(drops\.entries\.\d+\.(sources|kinds))$/.test(path);
    if(dynamic){if(!Array.isArray(src))return cloneGameplaySettings(def);if(!def.length)return cloneGameplaySettings(src);if(/\.(sources|kinds)$/.test(path))return cloneGameplaySettings(src);const template=def[0];return src.map((v,i)=>mergeGameplayShapeDrops(def[i]===undefined?template:def[i],v,path+'.'+i));}
    return def.map((v,i)=>mergeGameplayShapeDrops(v,Array.isArray(src)?src[i]:undefined,path?path+'.'+i:String(i)));
  }
  if(def&&typeof def==='object'){const out={};for(const k of Object.keys(def)){const next=path?path+'.'+k:k;out[k]=mergeGameplayShapeDrops(def[k],src&&typeof src==='object'?src[k]:undefined,next);}return out;}
  if(typeof def==='number')return typeof src==='number'&&Number.isFinite(src)?src:def;
  return typeof src===typeof def?src:def;
};

const dropTableValidateGameplayBase=validateGameplaySettings;
validateGameplaySettings=function(cfg){
  cfg=dropTableValidateGameplayBase(cfg);
  const elements=new Set(Object.keys(ELEMENTS)),races=new Set(Object.keys(RACES)),monsterKinds=new Set(['normal','elite','boss','final']);
  if(!Array.isArray(cfg.monsters.catalog)||!cfg.monsters.catalog.length)throw Error('怪物設計清單不可為空');
  const monsterIds=new Set();
  for(const [i,m] of cfg.monsters.catalog.entries()){
    if(!m||typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)||monsterIds.has(m.id))throw Error('怪物 ID 無效或重複：'+i);monsterIds.add(m.id);
    if(typeof m.name!=='string'||!m.name.trim()||!Number.isInteger(m.mapIndex)||m.mapIndex<0||m.mapIndex>=MAPS.length||!monsterKinds.has(m.kind)||typeof m.material!=='string'||!m.material.trim()||!elements.has(m.element)||!races.has(m.race)||!Number.isInteger(m.maxDrops)||m.maxDrops<0||m.maxDrops>100)throw Error('怪物設計資料無效：'+m.id);
  }
  for(let mi=0;mi<MAPS.length;mi++){const finalMap=cfg.maps?.catalog?.[mi]?.mapType==='final'||(!cfg.maps?.catalog&&mi===6),bosses=cfg.monsters.catalog.filter(m=>m.mapIndex===mi&&(finalMap?m.kind==='final':m.kind==='boss'));if(finalMap?bosses.length!==1:cfg.maps?.catalog?.[mi]?.bossEnabled!==false&&!bosses.length)throw Error(`地圖 ${mi} 必須恰好有 1 個${finalMap?'最終首領':'地圖首領'}`);}
  if(!cfg.drops||!Array.isArray(cfg.drops.entries))throw Error('掉落表必須是陣列');
  const types=new Set(['sourceMaterial','material','ore','gem','item','bossGear','equipment','token','monsterGear','gemPool']),encKinds=new Set(['normal','elite','boss','final']),dropIds=new Set();
  for(const [i,d] of cfg.drops.entries.entries()){
    if(!d||typeof d.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(d.id)||dropIds.has(d.id))throw Error('掉落規則 ID 無效或重複：'+i);dropIds.add(d.id);
    if(typeof d.name!=='string'||!d.name.trim()||typeof d.enabled!=='boolean'||!types.has(d.type)||!Array.isArray(d.kinds)||!d.kinds.length||d.kinds.some(k=>!encKinds.has(k))||!Array.isArray(d.chanceByDifficulty)||d.chanceByDifficulty.length!==3||d.chanceByDifficulty.some(v=>!Number.isFinite(v)||v<0||v>1)||!Number.isInteger(d.quantityMin)||!Number.isInteger(d.quantityMax)||d.quantityMin<1||d.quantityMax<d.quantityMin||d.quantityMax>999||!Array.isArray(d.sources)||!d.sources.length||d.sources.some(id=>!monsterIds.has(id)))throw Error('掉落規則資料無效：'+d.id);{const poolIssues=EmberwildDropRework.ruleIssues(d,{formExists:ref=>!!(typeof ITEM_FORMS!=='undefined'?ITEM_FORMS:[])[ref.job]?.[ref.slot]?.[ref.index]});if(poolIssues.length)throw Error(poolIssues.join('；'));}
    if(d.type==='material'&&(typeof d.key!=='string'||!d.key.trim()))throw Error('材料掉落需要材料名稱：'+d.id);
    if(d.type==='gem'&&![0,1,2,3,4,'0','1','2','3','4'].includes(d.key))throw Error('寶石掉落 key 需為指定寶石 0～4（隨機寶石掉落已移除，請改用地圖寶石池）：'+d.id);if(d.type==='item'&&!(globalThis.__EMBERWILD_VALIDATE_ITEM_IDS||new Set(SHOP.map(x=>x.id))).has(d.key))throw Error('商店道具掉落 key 無效：'+d.id);
  }
  return cfg;
};
normalizeGameplaySettings=function(input){return validateGameplaySettings(mergeGameplayShape(GAMEPLAY_SETTINGS_DEFAULTS,input||{}));};

function monsterCatalog(){return Array.isArray(GAMEPLAY_SETTINGS.monsters.catalog)?GAMEPLAY_SETTINGS.monsters.catalog:[];}
function monsterCatalogEntry(id){return monsterCatalog().find(m=>m.id===id)||null;}
function syncMonsterCatalogToMaps(){
  const cat=monsterCatalog();
  for(let mi=0;mi<MAPS.length;mi++){
    const normals=cat.filter(m=>m.mapIndex===mi&&m.kind==='normal');
    const finalMap=GAMEPLAY_SETTINGS.maps?.catalog?.[mi]?.mapType==='final'||(!GAMEPLAY_SETTINGS.maps?.catalog&&mi===6),boss=cat.find(m=>m.mapIndex===mi&&(finalMap?m.kind==='final':m.kind==='boss'));
    MAPS[mi].mobs=normals.map(m=>[m.name,'',m.material]);
    if(boss)MAPS[mi].boss=[boss.name,'',boss.material];
  }
  for(const m of cat){species.set(m.material,{element:m.element,race:m.race});if(!monsterArtByMaterial.has(m.material))monsterArtByMaterial.set(m.material,24);}
}
function resolveMonsterCatalogId(e,mapIndex=e?.region??party?.map??state?.map??0){
  const baseKind=e?.kind==='elite'?'normal':e?.kind;
  const found=monsterCatalog().find(m=>m.mapIndex===mapIndex&&m.kind===baseKind&&m.material===e?.mat) || monsterCatalog().find(m=>m.mapIndex===mapIndex&&m.kind===baseKind&&m.name===String(e?.name||'').replace(/^菁英・/,''));
  return found?.id||null;
}
const dropTableMakeBaseEnemyBase=makeBaseEnemy;
makeBaseEnemy=function(map=state.map,h=state,rng=Math.random){const e=dropTableMakeBaseEnemyBase(map,h,rng);e.monsterId=resolveMonsterCatalogId(e,map);const cfg=monsterCatalogEntry(e.monsterId);e.maxDrops=cfg?.maxDrops??99;return e;};

function heroDropRateBonus(h){return equipment(h).flatMap(g=>g.affix||[]).filter(a=>a.type===17).reduce((n,a)=>n+(Number(a.value)||0),0)/100;}
function partyDropRateBonus(){const hs=party?heroes():(state?[state]:[]);return hs.reduce((n,h)=>n+heroDropRateBonus(h),0);}
function effectiveDropChance(rule,e,bonus=partyDropRateBonus()){const mode=Math.max(0,Math.min(2,Number(e?.difficulty)||0)),base=Math.max(0,Math.min(1,Number(rule?.chanceByDifficulty?.[mode])||0));return Math.min(1,base*(1+Math.max(0,Number(bonus)||0)));}
function configuredDropRules(e){const id=e.monsterId||resolveMonsterCatalogId(e);return (GAMEPLAY_SETTINGS.drops?.entries||[]).filter(r=>r.enabled!==false&&r.sources.includes(id)&&r.kinds.includes(e.kind)&&(r.minLevel===undefined||e.lv>=r.minLevel)&&(!r.maxLevel||e.lv<=r.maxLevel));}
function configuredDropDescription(row,kind,mapIndex){
  const e={monsterId:row.id,kind,lv:row.lv??row.minLevel??MAPS[mapIndex]?.min??1,region:mapIndex,difficulty:party?.difficulty??state?.difficulty??0},bonus=partyDropRateBonus();
  const rules=configuredDropRules(e).filter(rule=>effectiveDropChance(rule,e,bonus)>0);
  if(!rules.length)return '掉落表：此難度無啟用中的物品掉落';
  const items=rules.map(rule=>{
    const name=rule.type==='sourceMaterial'?(kind==='boss'?(e.difficulty?'【'+['普通','困難','地獄'][e.difficulty]+'】':'')+row.material:row.material):rule.type==='material'?rule.key:typeof dropRulePoolLabel==='function'&&['monsterGear','gemPool'].includes(rule.type)?dropRulePoolLabel(rule):rule.name;
    const chance=Number((effectiveDropChance(rule,e,bonus)*100).toFixed(2)),qty=rule.quantityMin===rule.quantityMax?rule.quantityMin:rule.quantityMin+'～'+rule.quantityMax;
    return esc(name)+' ×'+qty+'（'+chance+'%）';
  });
  return '掉落表：'+items.join('、')+'；最多 '+Math.max(0,Math.floor(row.maxDrops??99))+' 項';
}
function randomQuantity(rule,rng=Math.random){const lo=Math.max(1,Math.floor(rule.quantityMin||1)),hi=Math.max(lo,Math.floor(rule.quantityMax||lo));return lo+Math.floor(rng()*(hi-lo+1));}
function grantConfiguredDrop(rule,e,rng=Math.random){
  const qty=randomQuantity(rule,rng),mode=e.difficulty||0,mi=e.region??state.map,tier=regionTier(mi),r=GAMEPLAY_SETTINGS.rewards;
  if(rule.type==='sourceMaterial'||rule.type==='material'){const key=rule.type==='sourceMaterial'?(e.kind==='boss'?(mode?'【'+['普通','困難','地獄'][mode]+'】':'')+e.mat:e.mat):rule.key;if(key==='粉塵')state.dust+=qty;else if(key==='鍛鐵')state.ore+=qty;else state.materials[key]=(state.materials[key]||0)+qty;note('獲得 '+key+' ×'+qty,'item');return {name:key,count:qty};}
  if(rule.type==='ore'){state.ore+=qty;note('獲得 鍛鐵 ×'+qty,'item');return {name:'鍛鐵',count:qty};}
  if(rule.type==='item'){const item=SHOP.find(x=>x.id===rule.key);if(!item)return null;if(typeof isHealPotion==='function'&&isHealPotion(item)&&typeof healPotionCount==='function'&&typeof setHealPotionCount==='function')setHealPotionCount(item.id,healPotionCount(item.id)+qty);else{state.consumables??={};state.consumables[item.id]=(state.consumables[item.id]||0)+qty;}note('獲得 '+item.name+' ×'+qty,'item');return {name:item.name,count:qty};}
  if(rule.type==='gem'){const i=Math.max(0,Math.min(GEMS.length-1,Number(rule.key)||0));state.gems[i]+=qty;note('獲得 '+GEMS[i].name+(qty>1?' ×'+qty:''),'item');return {name:GEMS[i].name,count:qty};}
  // v0.206 map-bound gems: one success picks one gem of the rule's pool (map gem for normal/elite, three-gem pool for bosses).
  if(rule.type==='gemPool'){const i=Math.max(0,Math.min(GEMS.length-1,Number(EmberwildDropRework.pick(rule.pool,rng).key)||0));state.gems[i]+=qty;note('獲得 '+GEMS[i].name+(qty>1?' ×'+qty:''),'item');return {name:GEMS[i].name,count:qty};}
  // v0.206 per-monster general equipment: one success picks one form of this monster's pool (1–2 forms) by weight.
  if(rule.type==='monsterGear'){for(let q=0;q<qty;q++){const ref=EmberwildDropRework.parseForm(EmberwildDropRework.pick(monsterGearPool(rule),rng).key),rar=rng()<r.equipmentQuality.rareChance?2:rng()<r.equipmentQuality.fineConditionalChance?1:0,g=gear(tier,ref.slot,rar,ref.job);g.formJob=ref.job;g.form=ref.index;{const f=typeof itemForm==='function'?itemForm(g):null;if(f?.weaponType)g.weaponType=f.weaponType;}g.name=gearName(g);modeAffixes(g,mode);gearStatBreakdown(g);addGear(g);}return {name:rule.name,count:qty};}
  if(rule.type==='bossGear'){for(let q=0;q<qty;q++)addGear(bossGear(mi,state.job,mode));return {name:rule.name,count:qty};}
  return null;
}
// v0.215: the pool as weighted for the player's current class (EmberwildDropRework.classWeightedPool).
function monsterGearPool(rule){const job=(typeof playerHero==='function'?playerHero():null)?.job??state?.job;return EmberwildDropRework.classWeightedPool(rule.pool,{job:Number(job),formOf:ref=>ITEM_FORMS[ref.job]?.[ref.slot]?.[ref.index]});}
function rollConfiguredDrops(e,rng=Math.random){
  e.monsterId??=resolveMonsterCatalogId(e);const cfg=monsterCatalogEntry(e.monsterId),maxDrops=Math.max(0,Math.floor(cfg?.maxDrops??e.maxDrops??99));
  const rules=configuredDropRules(e),independent=rules.filter(rule=>rule.independent===true);
  let successes=rules.filter(rule=>!rule.independent).filter(rule=>rng()<effectiveDropChance(rule,e));
  for(let i=successes.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[successes[i],successes[j]]=[successes[j],successes[i]];}
  successes=successes.slice(0,maxDrops);successes.push(...independent.filter(rule=>rng()<effectiveDropChance(rule,e)));const granted=[];for(const rule of successes){const result=grantConfiguredDrop(rule,e,rng);if(result)granted.push({ruleId:rule.id,...result});}return granted;
}

// Item loot of one defeated enemy: base ore, configured drop rules and ether, in the original order.
// Region vouchers reuse it so redeemed kills follow exactly the same rules; they skip only the one-time
// first-BOSS ether claim, which is not a repeatable idle reward.
function rollEnemyItemLoot(e,{voucher=false}={}){
  const mode=e.difficulty||0,d=MODES[mode],mi=e.region??state.map,tier=regionTier(mi),kindIndex=e.kind==='normal'?0:e.kind==='elite'?1:2,r=GAMEPLAY_SETTINGS.rewards;
  // All repeatable material loot uses configured rules; no fixed per-kill material grant.
  rollConfiguredDrops(e);
  const firstBossClaim=(e.kind==='boss'||e.kind==='final')&&!(party?.etherBossClaims||[]).includes((e.region??party?.map)+':'+(e.difficulty||0));
  if(!voucher||!firstBossClaim)awardEther(e);
}
globalThis.rollEnemyItemLoot=rollEnemyItemLoot;
// Replace only the item-drop block; gold/XP/base ore/ether/progression stay as existing reward systems.
victory=function(){
  let e=enemy;if(!e)return;lastDefeatedEnemy={...e};let mode=e.difficulty||0,d=MODES[mode],mi=e.region??state.map,tier=regionTier(mi),kindIndex=e.kind==='normal'?0:e.kind==='elite'?1:2,r=GAMEPLAY_SETTINGS.rewards,mult=[r.kindMultiplier.normal,r.kindMultiplier.elite,r.kindMultiplier.boss][kindIndex],firstClear=e.kind==='final'&&!state.won;
  state.totalKills++;state.kills[e.mat]=(state.kills[e.mat]||0)+1;if(!state.discovered.includes(e.mat))state.discovered.push(e.mat);
  const gold=EmberwildProgression.enemyGold(GAMEPLAY_SETTINGS,e.lv,e.kind,mode);state.gold+=gold;
  rollEnemyItemLoot(e);
  if(e.kind==='final'){state.won=true;state.modeClears[mode]++;state.materials['日蝕王冠']=Math.max(1,state.materials['日蝕王冠']||0);running=false;}
  state.hp=Math.min(stats().hp,state.hp+stats().hp*r.postVictoryHeal);state.shield=0;note(`擊敗 ${e.name}（${d.name}）· ${gold} 金幣`);enemy=null;
  if(e.kind==='final'){$('modal').innerHTML=`<h1>${firstClear?'噬日者已擊敗':'再次戰勝噬日者'}</h1><p>${d.name}模式通關。${firstClear?'通關後區域已開放。':'可繼續探索或挑戰更高難度。'}</p><button class="primary" onclick="closeModal()">繼續旅程</button>`;$('modal').showModal();}save();
};solo.victory=victory;

// New affix: increased item-drop chance.
EXTRA_AFFIX_NAMES[17]='掉寶率';
rollAffixes=function(g){return oldAffixRoll(g).map(a=>{const cfg=GAME_BALANCE.affixes,key=balanceQualityKey(a.rank);if(Math.random()>cfg.extendedPoolChance)return a;const attackPct=Number(cfg.extendedValues.attackPercent[key])||0,allCd=Number(cfg.extendedValues.allCooldownReduction?.[key])||0,dropRate=Number(cfg.extendedValues.dropRateBonus?.[key])||0;const specialTypes=[6,7,8,9,12,13,14,...(a.rank>=2&&attackPct>0?[15]:[]),...(allCd>0?[16]:[]),...(dropRate>0?[17]:[])],type=specialTypes[rand(specialTypes.length)];const value=type===17?dropRate:type===16?allCd:type===15?attackPct:type===6?cfg.extendedValues.critDamage[key]:type===7?cfg.extendedValues.pierce[key]:type===8?cfg.extendedValues.lifesteal[key]:type===9?cfg.extendedValues.evasion[key]:type===12?cfg.extendedValues.elementDamage[key]:type===13?cfg.extendedValues.raceDamage[key]:cfg.extendedValues.resist[key];const result={type,rank:a.rank,value};if(type===12||type===14)result.element=['fire','ice','wind','light','shadow'][rand(5)];if(type===13)result.race=Object.keys(RACES)[rand(6)];return result;});};
const dropRateAffixLabelBase=affixLabel;
affixLabel=function(a,g){if(a?.type===17)return `掉寶率 +${a.value}%`;return dropRateAffixLabelBase(a,g);};
/* Keep the unified equipment filter model; affix type 17 needs no separate filter override. */

// Save import compatibility for the newer affix types 16/17 while retaining the older validator for all other fields.
const dropRateValidateSaveBase=validateSave;
validateSave=function(input,options){
  const copy=JSON.parse(JSON.stringify(input)),newTypes=new Map();
  for(const g of copy?.bag||[])for(let i=0;i<(g.affix||[]).length;i++){const a=g.affix[i];if(a&&[16,17,18].includes(a.type)){if(!Number.isFinite(a.value)||a.value<0||a.value>RULES.affixMax||!Number.isInteger(a.rank)||a.rank<0||a.rank>3)throw Error('新詞條資料無效');newTypes.set(g.id+':'+i,a.type);a.type=15;}}
  const out=dropRateValidateSaveBase(copy,options);for(const g of out.bag||[])for(let i=0;i<(g.affix||[]).length;i++){const t=newTypes.get(g.id+':'+i);if(t!==undefined)g.affix[i].type=t;}return out;
};solo.validateSave=validateSave;

const dropTableBalanceReferenceBase=balanceReference;
balanceReference=function(){const r=dropTableBalanceReferenceBase();r.affixTypes['17']='掉寶率增加：實際機率 = 基礎掉落率 × (1 + 全隊掉寶率加成)，最高 100%';r.balancePaths['balanceSettings.equipment.dropLevelGap']='一般與 BOSS 裝備使用 progression.xpLevelGap 相同的等級差倍率；enabled 控制啟用與否，舊 freeLevels／penaltyPerLevel／minimumMultiplier 僅保留相容，不再參與計算。';r.balancePaths['balance.affixes.extendedValues.dropRateBonus']='各品質「掉寶率」詞條數值，單位為百分比';r.dropAlgorithm='每條符合怪物來源與遭遇種類的掉落規則獨立判定；一般裝備與 BOSS 裝備各乘一次 progression.xpLevelGap 倍率（高 3／5／10 級為 50%／20%／0%），再乘(1+全隊掉寶率加成)，最後封頂100%。一般／菁英怪的素材、鍛鐵（含菁英原本保證的鍛鐵）、粉塵、寶石、藥水、消耗品與信物依 drops.levelGap 衰減；裝備僅套用裝備等級差倍率，BOSS 專屬來源豁免一般掉落懲罰。成功項目超過怪物 maxDrops 時，隨機保留至上限。';return r;};

const dropTableApplySideEffectsBase=applyGameplaySettingsSideEffects;
applyGameplaySettingsSideEffects=function(){dropTableApplySideEffectsBase();syncMonsterCatalogToMaps();};
const dropTableExportableBase=exportableBalance;
exportableBalance=function(){const out=dropTableExportableBase();out.balance=cloneBalance(GAME_BALANCE);out.balanceSettings=cloneGameplaySettings(GAMEPLAY_SETTINGS);out._reference=balanceReference();out.notes=[...(out.notes||[]),'怪物由 balanceSettings.monsters.catalog 管理；掉落規則由 balanceSettings.drops.entries 以 monsterId 指定來源。','掉落規則各自獨立判定，再受怪物 maxDrops 限制。掉寶率詞條為乘算加成：基礎率 × (1 + 全隊掉寶率%)，封頂 100%。'];return out;};

GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();
window.__EMBERWILD_DROP_TEST={monsterCatalog,configuredDropRules,effectiveDropChance,rollConfiguredDrops,partyDropRateBonus,syncMonsterCatalogToMaps};
if(state&&party){resetEncounter();save();render();}
