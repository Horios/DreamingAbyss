
/* Update 22/24: data-driven maps, reusable final-map type, and dedicated elite/BOSS controls. */
(function installDynamicWorldMapMonsterSystem(){
  const LEGACY_GATE_INDEX=6;
  const cloneWorld=v=>JSON.parse(JSON.stringify(v));
  function rawMapType(row,i){return row?.mapType==='final'?'final':row?.mapType==='normal'?'normal':i===LEGACY_GATE_INDEX?'final':'normal';}
  function catalogForHelpers(){return GAMEPLAY_SETTINGS?.maps?.catalog||GAMEPLAY_SETTINGS_DEFAULTS.maps?.catalog||[];}
  function worldMapTypeAt(i,catalog=catalogForHelpers()){return rawMapType(catalog?.[i],i);}
  function worldIsFinalMapAt(i,catalog=catalogForHelpers()){return worldMapTypeAt(i,catalog)==='final';}
  function worldGateIndex(catalog=catalogForHelpers()){
    if(Array.isArray(catalog)){const found=catalog.findIndex(m=>m?.progressionGate===true);if(found>=0)return found;}
    return Array.isArray(catalog)&&catalog[LEGACY_GATE_INDEX]?LEGACY_GATE_INDEX:Math.max(0,(catalog?.length||1)-1);
  }
  globalThis.worldMapType=i=>worldMapTypeAt(i);
  globalThis.worldIsFinalMap=i=>worldIsFinalMapAt(i);
  globalThis.worldProgressionGateIndex=()=>worldGateIndex();
  globalThis.worldIsProgressionGateMap=i=>i===worldGateIndex()&&worldIsFinalMapAt(i);

  function defaultMapCatalogFromRuntime(){
    const ec=GAMEPLAY_SETTINGS_DEFAULTS.monsters?.encounter||{bossChance:.05,eliteChance:.12};
    return MAPS.map((m,i)=>{const mapType=i===LEGACY_GATE_INDEX?'final':'normal',final=mapType==='final';return {
      id:'map'+i,name:m.name,min:m.min,max:m.max,family:Number.isInteger(m.family)?m.family:(i<6?i:(i===LEGACY_GATE_INDEX?5:(i-7)%6)),
      icon:typeof m.icon==='string'?m.icon:'',color:typeof m.color==='string'?m.color:'#34324a',parallel:!!m.parallel,
      mapType,progressionGate:i===LEGACY_GATE_INDEX,
      eliteEnabled:!final,eliteChance:final?0:Number(ec.eliteChance)||0,
      bossEnabled:true,bossChance:final?1:Number(ec.bossChance)||0
    };});
  }
  const MONSTER_COMBAT_STAT_DEFAULTS={
    crit:0,critDamage:1.5,pierce:0,defenseIgnore:0,lifesteal:0,evasion:0,elementBonus:0,bossDamage:0,speedBonus:0,
    elementDamage:{physical:0,fire:0,ice:0,wind:0,light:0,shadow:0},
    raceDamage:{beast:0,plant:0,undead:0,construct:0,demon:0,spirit:0},
    resist:{physical:0,fire:0,ice:0,wind:0,light:0,shadow:0}
  };
  function normalizeMonsterCombatStats(raw){
    const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},out={};
    for(const key of ['crit','critDamage','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage','speedBonus']){
      const fallback=MONSTER_COMBAT_STAT_DEFAULTS[key],v=Number(src[key]);out[key]=Number.isFinite(v)?v:fallback;
    }
    out.crit=Math.max(0,out.crit);out.critDamage=Math.max(1,out.critDamage);out.pierce=Math.max(0,out.pierce);
    out.defenseIgnore=Math.max(0,Math.min(1,out.defenseIgnore));out.lifesteal=Math.max(0,out.lifesteal);out.evasion=Math.max(0,Math.min(1,out.evasion));
    for(const group of ['elementDamage','raceDamage','resist']){
      out[group]={};for(const [key,fallback] of Object.entries(MONSTER_COMBAT_STAT_DEFAULTS[group])){const v=Number(src[group]?.[key]);out[group][key]=Number.isFinite(v)?v:fallback;}
    }
    return out;
  }
  globalThis.normalizeMonsterCombatStats=normalizeMonsterCombatStats;
  function extendMonsterRow(m){
    if(!m||typeof m!=='object')return m;
    m.baseStats={hp:0,attack:0,defense:-1,...(m.baseStats||{})};
    m.combatStats=normalizeMonsterCombatStats(m.combatStats);
    const rawSkills=Array.isArray(m.skillAssignments)?m.skillAssignments:[];
    const seenSkills=new Set();m.skillAssignments=[];
    for(const a of rawSkills){
      const skillId=typeof a==='string'?a:(typeof a?.skillId==='string'?a.skillId:'');
      if(!skillId||seenSkills.has(skillId))continue;seenSkills.add(skillId);m.skillAssignments.push({skillId});
    }
    m.enabled = m.enabled!==false;
    m.eliteEnabled = m.kind==='normal' ? m.eliteEnabled!==false : false;
    if(!Number.isFinite(m.spawnWeight)||m.spawnWeight<=0)m.spawnWeight=1;
    if(!Number.isFinite(m.hpMultiplier)||m.hpMultiplier<=0)m.hpMultiplier=1;
    if(!Number.isFinite(m.attackMultiplier)||m.attackMultiplier<=0)m.attackMultiplier=1;
    if(!Number.isFinite(m.defenseMultiplier)||m.defenseMultiplier<=0)m.defenseMultiplier=1;
    if(!Number.isInteger(m.stageCount)||m.stageCount<1)m.stageCount=1;
    if(!Number.isInteger(m.stageOrder)||m.stageOrder<0)m.stageOrder=m.kind==='normal'?10:100;
    m.stageElite=m.kind==='normal'&&m.stageElite===true;
    return m;
  }
  GAMEPLAY_SETTINGS_DEFAULTS.maps ??={};
  GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog ??= defaultMapCatalogFromRuntime();
  GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog=GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog.map((m,i)=>{
    const copy={...m};copy.mapType=rawMapType(copy,i);copy.bossStageMode??='fixed';copy.bossStageRandomCount??=1;copy.overlevelVoucherGold??=defaultOverlevelVoucherGold(copy.min);copy.progressionGate=copy.mapType==='final'&&(typeof copy.progressionGate==='boolean'?copy.progressionGate:i===LEGACY_GATE_INDEX);return copy;
  });
  GAMEPLAY_SETTINGS_DEFAULTS.maps.levelRanges = GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog.map(m=>({min:m.min,max:m.max}));
  GAMEPLAY_SETTINGS_DEFAULTS.monsters.kindMultipliers.eliteDefense ??=1;
  GAMEPLAY_SETTINGS_DEFAULTS.monsters.kindMultipliers.bossDefense ??=1;
  GAMEPLAY_SETTINGS_DEFAULTS.monsters.catalog=(GAMEPLAY_SETTINGS_DEFAULTS.monsters.catalog||[]).map(m=>extendMonsterRow(m));

  function defaultOverlevelVoucherGold(min){return 100+300*Math.max(0,Math.floor((Math.max(1,min)-1)/5));}
  globalThis.defaultOverlevelVoucherGold=defaultOverlevelVoucherGold;
  function normalizeMapRow(row,i){
    const def=GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog[i]||GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog[0];
    const src=row&&typeof row==='object'?row:{},mapType=rawMapType(src,i),final=mapType==='final';
    const gate=final&&(typeof src.progressionGate==='boolean'?src.progressionGate:(typeof def?.progressionGate==='boolean'?def.progressionGate:i===LEGACY_GATE_INDEX));
    return {
      id:typeof src.id==='string'&&src.id.trim()?src.id.trim():'map'+i,
      name:typeof src.name==='string'&&src.name.trim()?src.name.trim():(def?.name||('地圖 '+(i+1))),
      min:Number.isFinite(src.min)?Math.round(src.min):(def?.min||1),max:Number.isFinite(src.max)?Math.round(src.max):(def?.max||1),
      family:Number.isInteger(src.family)?src.family:(def?.family??0),icon:typeof src.icon==='string'?src.icon:(def?.icon||''),
      color:typeof src.color==='string'?src.color:(def?.color||'#34324a'),parallel:typeof src.parallel==='boolean'?src.parallel:!!def?.parallel,
      mapType,progressionGate:gate,bossStageMode:src.bossStageMode??'fixed',bossStageRandomCount:src.bossStageRandomCount??1,
      eliteEnabled:final?false:(typeof src.eliteEnabled==='boolean'?src.eliteEnabled:true),eliteChance:final?0:(Number.isFinite(src.eliteChance)?src.eliteChance:(def?.eliteChance??.12)),
      bossEnabled:final?true:(typeof src.bossEnabled==='boolean'?src.bossEnabled:true),bossChance:final?1:(Number.isFinite(src.bossChance)?src.bossChance:(def?.bossChance??.05)),
      // Gold per region voucher once the hero exceeds this map's max level. Default: 100 for the level-1 band,
      // +300 per 5-level band above it; the balance editor can override it per map.
      overlevelVoucherGold:Number.isFinite(src.overlevelVoucherGold)&&src.overlevelVoucherGold>=0?Math.round(src.overlevelVoucherGold):defaultOverlevelVoucherGold(Number.isFinite(src.min)?Math.round(src.min):(def?.min||1))
    };
  }
  function prepareWorldInput(input){
    const out=cloneWorld(input||{});out.maps??={};
    if(!Array.isArray(out.maps.catalog)||!out.maps.catalog.length){
      const ranges=Array.isArray(out.maps.levelRanges)?out.maps.levelRanges:[];
      out.maps.catalog=GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog.map((m,i)=>({...cloneWorld(m),...(ranges[i]||{})}));
    }
    out.maps.catalog=out.maps.catalog.map(normalizeMapRow);
    if(!out.maps.catalog.some(m=>m.progressionGate===true)&&out.maps.catalog[LEGACY_GATE_INDEX]?.mapType==='final')out.maps.catalog[LEGACY_GATE_INDEX].progressionGate=true;
    out.maps.levelRanges=out.maps.catalog.map(m=>({min:m.min,max:m.max}));
    out.monsters??={};
    if(Array.isArray(out.monsters.catalog))out.monsters.catalog=out.monsters.catalog.map(m=>extendMonsterRow({...m}));
    out.monsters.kindMultipliers??={};
    out.monsters.kindMultipliers.eliteDefense ??=1;out.monsters.kindMultipliers.bossDefense ??=1;
    return out;
  }
  function syncRuntimeMapCatalog(catalog){
    const rows=(catalog||[]).map(normalizeMapRow);
    MAPS.splice(0,MAPS.length,...rows.map(m=>({
      name:m.name,min:m.min,max:m.max,icon:m.icon,color:m.color,family:m.family,parallel:m.parallel,
      mobs:[],boss:['未設定首領','','']
    })));
    return rows;
  }
  function worldMapConfig(i){return GAMEPLAY_SETTINGS?.maps?.catalog?.[i]||GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog[i]||null;}
  globalThis.worldMapConfig=worldMapConfig;

  const worldMergeDynamic=new Set(['maps.catalog','monsters.catalog','drops.entries','economy.materialPrices','equipment.salvage.extraRewards']);
  mergeGameplayShape=function mergeGameplayShapeWorld(def,src,path=''){
    if(/^drops\.entries\.\d+$/.test(path)&&src&&typeof src==='object')return cloneGameplaySettings(src);
    if(Array.isArray(def)){
      const sk=/^(drops\.entries\.\d+\.(sources|kinds))$/.test(path),monsterSkills=/^monsters\.catalog\.\d+\.skillAssignments$/.test(path),dynamic=worldMergeDynamic.has(path)||sk||monsterSkills;
      if(dynamic){if(!Array.isArray(src))return cloneGameplaySettings(def);if(sk||monsterSkills||!def.length)return cloneGameplaySettings(src);const template=def[0];return src.map((v,i)=>mergeGameplayShapeWorld(def[i]===undefined?template:def[i],v,path+'.'+i));}
      return def.map((v,i)=>mergeGameplayShapeWorld(v,Array.isArray(src)?src[i]:undefined,path?path+'.'+i:String(i)));
    }
    if(def&&typeof def==='object'){
      const out={};for(const k of Object.keys(def)){const next=path?path+'.'+k:k;out[k]=mergeGameplayShapeWorld(def[k],src&&typeof src==='object'?src[k]:undefined,next);}return out;
    }
    if(typeof def==='number')return typeof src==='number'&&Number.isFinite(src)?src:def;
    return typeof src===typeof def?src:def;
  };

  validateMonsterDropDynamicInput=function(input){
    const bs=input?.balanceSettings;if(!bs||typeof bs!=='object')return;
    const maps=Array.isArray(bs.maps?.catalog)?bs.maps.catalog.map(normalizeMapRow):GAMEPLAY_SETTINGS_DEFAULTS.maps.catalog;
    if(!maps.length)throw Error('地圖清單不可為空');
    const gates=maps.map((m,i)=>m.progressionGate?i:-1).filter(i=>i>=0);if(gates.length!==1||maps[gates[0]]?.mapType!=='final')throw Error('必須恰好有 1 張終局地圖設定為等級突破關卡');
    const mapIds=new Set();for(const [i,m] of maps.entries()){
      if(!m||typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)||mapIds.has(m.id))throw Error('地圖 ID 無效或重複：'+i);mapIds.add(m.id);
      if(typeof m.name!=='string'||!m.name.trim()||!Number.isFinite(m.min)||!Number.isFinite(m.max)||m.min<1||m.max<m.min||!Number.isInteger(m.family)||m.family<0||m.family>5||!['normal','final'].includes(m.mapType))throw Error('地圖資料無效：'+m.id);
      if(typeof m.progressionGate!=='boolean'||typeof m.eliteEnabled!=='boolean'||typeof m.bossEnabled!=='boolean'||!Number.isFinite(m.eliteChance)||m.eliteChance<0||m.eliteChance>1||!Number.isFinite(m.bossChance)||m.bossChance<0||m.bossChance>1)throw Error('地圖終局／精英／BOSS 設定無效：'+m.id);
      if(m.mapType==='normal'&&m.eliteChance+m.bossChance>1)throw Error('地圖精英率＋BOSS率不可超過 100%：'+m.id);
    }
    const cat=bs.monsters?.catalog;
    if(cat!==undefined){
      if(!Array.isArray(cat)||!cat.length)throw Error('怪物設計清單不可為空');
      const ids=new Set(),elements=new Set(Object.keys(ELEMENTS)),races=new Set(Object.keys(RACES)),kinds=new Set(['normal','elite','boss','final']);
      for(const [i,raw] of cat.entries()){
        const m=extendMonsterRow({...raw});
        if(!m||typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)||ids.has(m.id))throw Error('怪物 ID 無效或重複：'+i);ids.add(m.id);
        if(typeof m.name!=='string'||!m.name.trim()||!Number.isInteger(m.mapIndex)||m.mapIndex<0||m.mapIndex>=maps.length||!kinds.has(m.kind)||typeof m.material!=='string'||!m.material.trim()||!elements.has(m.element)||!races.has(m.race)||!Number.isInteger(m.maxDrops)||m.maxDrops<0||m.maxDrops>100)throw Error('怪物設計資料無效：'+m.id);
        const expected=maps[m.mapIndex].mapType==='final'?'final':'boss';if(!['normal','elite'].includes(m.kind)&&m.kind!==expected)throw Error('怪物類型與地圖不相容：'+m.id);
        if(!m.baseStats||!Number.isFinite(m.baseStats.hp)||m.baseStats.hp<0||!Number.isFinite(m.baseStats.attack)||m.baseStats.attack<0||!Number.isFinite(m.baseStats.defense)||m.baseStats.defense< -1)throw Error('怪物個別基礎能力無效：'+m.id);
        if(typeof m.enabled!=='boolean'||typeof m.eliteEnabled!=='boolean'||!Number.isFinite(m.spawnWeight)||m.spawnWeight<=0||!Number.isFinite(m.hpMultiplier)||m.hpMultiplier<=0||!Number.isFinite(m.attackMultiplier)||m.attackMultiplier<=0||!Number.isFinite(m.defenseMultiplier)||m.defenseMultiplier<=0)throw Error('怪物生成／能力倍率無效：'+m.id);
      }
      for(let mi=0;mi<maps.length;mi++){
        const final=maps[mi].mapType==='final',bossKind=final?'final':'boss',bossRows=cat.filter(m=>m.mapIndex===mi&&m.kind===bossKind),normals=cat.filter(m=>m.mapIndex===mi&&EmberwildMonsterDesign.roaming(m));
        if(final?bossRows.length!==1:maps[mi].bossEnabled!==false&&!bossRows.length)throw Error(`地圖 ${maps[mi].name} 必須恰好有 1 個${final?'最終首領':'BOSS 資料'}`);
        if(!final&&!normals.length)throw Error('地圖 '+maps[mi].name+' 至少需要 1 個啟用中的普通怪物');
      }
    }
    const drops=bs.drops?.entries;
    if(drops!==undefined){
      if(!Array.isArray(drops))throw Error('掉落表必須是陣列');if(!Array.isArray(cat)||!cat.length)throw Error('掉落表需要有效怪物設計清單');
      const monsterById=new Map(cat.map(m=>[m.id,m])),dropIds=new Set(),types=new Set(['sourceMaterial','material','ore','dust','gem','potion','item','gear','gearLegendary','bossGear','equipment','token']),encKinds=new Set(['normal','elite','boss','final']);
      for(const [i,d] of drops.entries()){
        const potionIssues=EmberwildHealingPotions.dropIssues(d);if(potionIssues.length)throw Error(potionIssues.join('；'));
        if(!d||typeof d.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(d.id)||dropIds.has(d.id))throw Error('掉落規則 ID 無效或重複：'+i);dropIds.add(d.id);
        if(typeof d.name!=='string'||!d.name.trim()||typeof d.enabled!=='boolean'||!types.has(d.type)||!Array.isArray(d.kinds)||!d.kinds.length||d.kinds.some(k=>!encKinds.has(k))||!Array.isArray(d.chanceByDifficulty)||d.chanceByDifficulty.length!==3||d.chanceByDifficulty.some(v=>!Number.isFinite(v)||v<0||v>1)||!Number.isInteger(d.quantityMin)||!Number.isInteger(d.quantityMax)||d.quantityMin<1||d.quantityMax<d.quantityMin||d.quantityMax>999||!Array.isArray(d.sources)||!d.sources.length||d.sources.some(id=>!monsterById.has(id)))throw Error('掉落規則資料無效：'+d.id);
        if(d.type==='material'&&(typeof d.key!=='string'||!d.key.trim()))throw Error('材料掉落需要材料名稱：'+d.id);
        if(d.type==='gem'&&d.key!=='random'&&![0,1,2,3,4,'0','1','2','3','4'].includes(d.key))throw Error('寶石掉落 key 需為 random/0/1/2：'+d.id);if(d.type==='item'&&!(globalThis.__EMBERWILD_VALIDATE_ITEM_IDS||new Set(SHOP.map(x=>x.id))).has(d.key))throw Error('商店道具掉落 key 無效：'+d.id);
        const ruleKinds=new Set(d.kinds);for(const id of d.sources){const m=monsterById.get(id),compatible=m.kind==='normal'?['normal','elite']:[m.kind];if(!compatible.some(k=>ruleKinds.has(k)))throw Error('掉落規則來源與遭遇種類不相容：'+d.id+' → '+id);}
      }
    }
  };

  const worldValidateGameplayBase=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    cfg=worldValidateGameplayBase(cfg);const maps=cfg.maps.catalog;
    if(!Array.isArray(maps)||!maps.length)throw Error('地圖清單無效');
    const gates=maps.filter(m=>m.progressionGate===true);if(gates.length!==1||gates[0].mapType!=='final')throw Error('必須恰好有 1 張終局地圖設定為等級突破關卡');
    if(!Number.isFinite(cfg.monsters.kindMultipliers.eliteDefense)||cfg.monsters.kindMultipliers.eliteDefense<=0||!Number.isFinite(cfg.monsters.kindMultipliers.bossDefense)||cfg.monsters.kindMultipliers.bossDefense<=0)throw Error('精英／BOSS 防禦倍率必須大於 0');
    for(const m of cfg.monsters.catalog)extendMonsterRow(m);
    return cfg;
  };
  normalizeGameplaySettings=function(input){
    const prepared=prepareWorldInput(input||{}),previousMaps=MAPS.slice();
    try{
      syncRuntimeMapCatalog(prepared.maps.catalog);validateMonsterDropDynamicInput({balanceSettings:prepared});
      return validateGameplaySettings(mergeGameplayShape(GAMEPLAY_SETTINGS_DEFAULTS,prepared));
    }finally{MAPS.splice(0,MAPS.length,...previousMaps);}
  };

  syncMonsterCatalogToMaps=function(){
    const cat=monsterCatalog();
    for(let mi=0;mi<MAPS.length;mi++){
      const final=worldIsFinalMapAt(mi),normals=final?[]:cat.filter(m=>m.mapIndex===mi&&EmberwildMonsterDesign.roaming(m)),boss=cat.find(m=>m.mapIndex===mi&&m.kind===(final?'final':'boss'));
      MAPS[mi].mobs=normals.map(m=>[m.name,'',m.material]);MAPS[mi].boss=boss?[boss.name,'',boss.material]:['未設定首領','',''];
    }
    for(const m of cat){species.set(m.material,{element:m.element,race:m.race});if(!monsterArtByMaterial.has(m.material))monsterArtByMaterial.set(m.material,24);}
  };
  const worldApplySideEffectsBase=applyGameplaySettingsSideEffects;
  applyGameplaySettingsSideEffects=function(){
    syncRuntimeMapCatalog(GAMEPLAY_SETTINGS.maps.catalog);worldApplySideEffectsBase();syncMonsterCatalogToMaps();
    if(party&&(!Number.isInteger(party.map)||!MAPS[party.map])){party.map=0;for(const h of party.members)h.map=0;resetEncounter();}
    else if(state&&(!Number.isInteger(state.map)||!MAPS[state.map]))state.map=0;
  };

  function weightedPick(list,rng=Math.random){const total=list.reduce((n,m)=>n+Math.max(.0001,Number(m.spawnWeight)||1),0);let r=rng()*total;for(const m of list){r-=Math.max(.0001,Number(m.spawnWeight)||1);if(r<=0)return m;}return list[list.length-1];}
  makeBaseEnemy=function(map=state.map,h=state,rng=Math.random){
    const runtime=MAPS[map],mc=worldMapConfig(map),cat=monsterCatalog();if(!runtime||!mc)throw Error('地圖不存在：'+map);
    if(mc.mapType==='final'){
      const row=cat.find(m=>m.mapIndex===map&&m.kind==='final'&&m.enabled!==false)||cat.find(m=>m.mapIndex===map&&m.kind==='final');if(!row)throw Error('終局首領未設定');const f=GAMEPLAY_SETTINGS.monsters.finalBoss,gate=mc.progressionGate===true;
      const lv=Math.round(gate?f.level:runtime.max),{hp,atk,def}=EmberwildProgression.baseMonsterStats(GAMEPLAY_SETTINGS,lv,'final',row);
      return {name:row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind:'final',turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race};
    }
    const normals=cat.filter(m=>m.mapIndex===map&&m.kind==='normal'&&m.enabled!==false),elites=normals.filter(m=>m.eliteEnabled!==false),boss=cat.find(m=>m.mapIndex===map&&m.kind==='boss'&&m.enabled!==false),ahead=EmberwildProgression.encounterLevelLead(GAMEPLAY_SETTINGS,h.lv),bossAllowed=!!boss&&mc.bossEnabled&&runtime.max<=h.lv+ahead;
    if(!normals.length)throw Error('地圖沒有啟用中的普通怪物：'+runtime.name);
    const bossChance=bossAllowed?Math.max(0,Math.min(1,Number(mc.bossChance)||0)):0,eliteChance=mc.eliteEnabled&&elites.length?Math.max(0,Math.min(1-bossChance,Number(mc.eliteChance)||0)):0,r=rng();
    let kind='normal',row;if(r<bossChance){kind='boss';row=boss;}else if(r<bossChance+eliteChance){kind='elite';row=weightedPick(elites,rng);}else row=weightedPick(normals,rng);
    const maxLv=Math.min(runtime.max,h.lv+ahead),lv=kind==='boss'?runtime.max:runtime.min+Math.floor(rng()*Math.max(1,maxLv-runtime.min+1));
    const {hp,atk,def}=EmberwildProgression.baseMonsterStats(GAMEPLAY_SETTINGS,lv,kind,row);
    return {name:(kind==='elite'?'菁英・':'')+row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind,turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race};
  };

  const worldCraftBossBase=craftBoss;
  craftBoss=function(mi,job){const mc=worldMapConfig(mi);if(mc?.mapType==='final')return toast('終局地圖不提供 BOSS 裝備製作');const row=monsterCatalog().find(m=>m.mapIndex===mi&&m.kind==='boss');if(mc?.bossEnabled===false||row?.enabled===false)return toast('此地圖的 BOSS 挑戰已停用');return worldCraftBossBase(mi,job);};
  update12BossMemberView=function(){
    const mode=state.difficulty||0,b=GAMEPLAY_SETTINGS.equipment.boss,rank=b.affixRankByDifficulty[mode]??2,power=b.powerByDifficulty[mode]??1,skillValue=b.skillEffectByDifficulty[mode]??30,needMat=Math.max(0,Math.round(b.craftMaterialCount));
    const rows=MAPS.map((m,i)=>{const mc=worldMapConfig(i),bossRow=monsterCatalog().find(x=>x.mapIndex===i&&x.kind==='boss');if(mc?.mapType==='final'||mc?.bossEnabled===false||bossRow?.enabled===false)return '';const family=regionFamily(i),tier=regionTier(i),g={job:state.job,slot:bossEquipmentSlot(family),tier,boss:family,region:i,difficulty:mode,rar:0,plus:0,affix:[{type:4,rank,skill:family,value:skillValue}]},mat=bossMaterial(i,mode),n=state.materials[mat]||0,cost=Math.round(tier*b.craftGoldPerTier*(mode+1)),ready=canVisit(i)&&state.lv>=m.min&&state.gold>=cost&&n>=needMat;return `<article class="card boss-recipe">${equipmentArt(g)}<span class="tag">${m.name}</span><h3>${equipmentNameHTML(g)}</h3><p class="small">${esc(characterName(state))} · LV${m.min} · ${AFFIX_RANK[rank]||'自訂'}</p><p class="effect-quality-${rank}">${CLASSES[state.job].skills[family]?.[0]||'技能'} 效果 +${skillValue}%</p><div class="recipe-cost"><span>${mat} ${n}/${needMat}</span><span>◈ ${cost}</span></div><button class="primary" onclick="craftBoss(${i})" ${ready?'':'disabled'}>${!canVisit(i)?'尚未解鎖':ready?'製作裝備':'等級／材料不足'}</button></article>`;}).join('');
    return heading('BOSS WORKSHOP / 首領製作',MODES[mode].name+'模式專屬裝備')+modePicker()+`<section class="panel">${resourceLine()}${uiHelp('製作說明',`只有一般地圖中啟用 BOSS 挑戰的地圖會列出。終局地圖不列入製作。每件需要 ${needMat} 份對應難度素材。`)}</section><div class="cards boss-recipes">${rows||'<p class="small">目前沒有啟用中的可製作 BOSS。</p>'}</div>`;
  };

  const worldExportBase=exportableBalance;
  exportableBalance=function(){const out=worldExportBase();out.balanceSettings=cloneGameplaySettings(GAMEPLAY_SETTINGS);out.notes=[...(out.notes||[]),'maps.catalog.mapType 可為 normal / final；final 地圖為固定關卡編成，必須有 1 名 final 首領，並可配置 normal 小怪。','maps.catalog.progressionGate 決定哪一張 final 地圖負責解除通關前等級上限；必須恰好一張。','普通怪以 monsters.catalog.mapIndex 分配；final 地圖使用 stageCount / stageElite / stageOrder 決定小怪數量、型態與集火隊列。'];return out;};

  try{
    const saved=balanceSourceText();if(saved){const parsed=JSON.parse(saved);if(parsed?.balanceSettings)GAMEPLAY_SETTINGS=normalizeGameplaySettings(parsed.balanceSettings);}else GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);
    globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();
  }catch(e){console.warn('地圖／怪物動態設定初始化失敗，使用目前可用設定',e);GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS_DEFAULTS);globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();}
  if(state)render();
})();
