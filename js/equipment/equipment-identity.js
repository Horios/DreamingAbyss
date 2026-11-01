
/* Equipment identity v2.
   Normal gear: prefix + suffix + base + internal power tier.
   - Player base ratings describe only powerTier; enhancement and effect quality are separate.
   - Prefix/suffix each carry one explicit gameplay effect.
   Boss gear: one exclusive profile supplies three fixed effects alongside rerollable affixes.
*/
(()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const POWER_ITEM_TYPE='gearTierReroll';
  const POWER_ITEM_ID='power_tier_reroll';
  const VALID_ELEMENTS=new Set(['physical','fire','ice','wind','light','shadow']);
  const REGULAR_EFFECT_KEYS=new Set(['basicElement','basicAdvanceNextRound','flatHp','gearHpPct','hpPct','flatDefense','gearDefPct','defensePct','attackPct','crit','critDamage','pierce','defenseIgnore','lifesteal','evasion','elementBonus','allCooldownReduction','dropRateBonus']);
  const BOSS_EFFECT_KEYS=new Set([...REGULAR_EFFECT_KEYS,'gearAtkPct','gearHpPct','gearDefPct','bossDamagePct']);
  const EFFECT_LABELS={
    flatAttack:'此裝備攻擊力',flatHp:'此裝備最大生命',flatDefense:'此裝備防禦',basicElement:'此武器攻擊屬性',basicAdvanceNextRound:'普攻後下回合前移',gearAtkPct:'此裝備基底攻擊力',gearHpPct:'此裝備基底生命',gearDefPct:'此裝備基底防禦',hpPct:'角色最大生命',defensePct:'角色總防禦',
    attackPct:'角色總攻擊力',crit:'暴擊率',critDamage:'暴擊傷害',pierce:'防禦穿透',defenseIgnore:'防禦無視',lifesteal:'生命竊取',evasion:'閃避率',elementBonus:'全屬性增傷',bossDamagePct:'對 BOSS 傷害',speed:'速度',
    allCooldownReduction:'全主動／輔助技能冷卻',dropRateBonus:'掉寶率',elementDamagePct:'屬性傷害',elementResistPct:'屬性抗性',raceDamagePct:'種族增傷',skillEffectPct:'核心技能效果',skillCooldownReduction:'核心技能冷卻／觸發'
  };
  const LEGACY_BOSS_SERIES=['古木誓約','礦脈共鳴','暮沼咒印','永凍之誓','熔核意志','隕星遺產'];
  const PARALLEL_BOSS_SERIES=['赤楓炎靈','潮汐巨像','白骨巫后','雷鳴獸王','聖所守護者','幽冥觀測者'];

  function fx(key,value){return {key,value};}
  const DEFAULT_PREFIXES=[
    {id:'redmaple',name:'赤楓',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicElement','fire')},
    {id:'frostcarved',name:'霜刻',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicElement','ice')},
    {id:'verdant',name:'翠影',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicElement','wind')},
    {id:'radiant',name:'聖輝',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicElement','light')},
    {id:'nether',name:'幽冥',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicElement','shadow')},
    {id:'piercing',name:'穿甲',tierMin:1,tierMax:10,weight:1,slots:[0,1,2],effect:fx('pierce',6)},
    {id:'bloodbound',name:'血契',tierMin:3,tierMax:10,weight:.8,slots:[0],effect:fx('lifesteal',3)},
    {id:'starfall',name:'星隕',tierMin:3,tierMax:10,weight:.9,slots:[0,2],effect:fx('critDamage',12)},
    {id:'echoing',name:'回響',tierMin:4,tierMax:10,weight:.65,slots:[0,1,2],effect:fx('allCooldownReduction',1)},
    {id:'seeker',name:'尋珍',tierMin:4,tierMax:10,weight:.7,slots:[0,1,2],effect:fx('dropRateBonus',8)},
    {id:'arcane',name:'秘能',tierMin:5,tierMax:10,weight:.7,slots:[0,1,2],effect:fx('elementBonus',8)},
    {id:'keen',name:'銳眼',tierMin:5,tierMax:10,weight:.7,slots:[0,2],effect:fx('crit',5)}
  ];
  const DEFAULT_SUFFIXES=[
    {id:'traveler',name:'旅人',tierMin:1,tierMax:10,weight:1,slots:[0],effect:fx('basicAdvanceNextRound',1)},
    {id:'vanguard',name:'先鋒',tierMin:1,tierMax:10,weight:1,slots:[0,1,2],effect:fx('attackPct',4)},
    {id:'swift',name:'迅捷',tierMin:1,tierMax:10,weight:1,slots:[0,1,2],effect:fx('evasion',5)},
    {id:'eagleeye',name:'鷹眼',tierMin:2,tierMax:10,weight:1,slots:[0,2],effect:fx('crit',4)},
    {id:'breaker',name:'破城',tierMin:2,tierMax:10,weight:.9,slots:[0,2],effect:fx('pierce',6)},
    {id:'leeching',name:'汲血',tierMin:3,tierMax:10,weight:.75,slots:[0],effect:fx('lifesteal',3)},
    {id:'resonant',name:'共鳴',tierMin:3,tierMax:10,weight:.75,slots:[0,1,2],effect:fx('elementBonus',7)},
    {id:'quickcast',name:'疾詠',tierMin:4,tierMax:10,weight:.6,slots:[0,1,2],effect:fx('allCooldownReduction',1)},
    {id:'hunter',name:'獵手',tierMin:4,tierMax:10,weight:.7,slots:[0,1,2],effect:fx('dropRateBonus',7)},
    {id:'fury',name:'狂擊',tierMin:5,tierMax:10,weight:.7,slots:[0,2],effect:fx('critDamage',12)},
    {id:'assault',name:'強襲',tierMin:5,tierMax:10,weight:.65,slots:[0,1,2],effect:fx('attackPct',5)},
    {id:'phantom',name:'幻步',tierMin:5,tierMax:10,weight:.65,slots:[0,1,2],effect:fx('evasion',6)}
  ];

  const FAMILY_BOSS_EFFECTS=[
    [fx('gearAtkPct',10),fx('lifesteal',4),fx('bossDamagePct',8)],
    [fx('gearDefPct',12),fx('pierce',8),fx('allCooldownReduction',1)],
    [fx('gearHpPct',12),fx('basicElement','shadow'),fx('evasion',6)],
    [fx('gearAtkPct',10),fx('basicElement','ice'),fx('critDamage',18)],
    [fx('gearHpPct',12),fx('basicElement','fire'),fx('elementBonus',10)],
    [fx('gearAtkPct',15),fx('crit',7),fx('bossDamagePct',12)]
  ];
  function boostedEffect(effect,high,parallel){
    const out=clone(effect);
    if(typeof out.value==='number'){
      if(out.key==='allCooldownReduction')out.value=Math.min(2,out.value+(high?1:0));
      else out.value=Number((out.value*(high?1.35:1)*(parallel?1.08:1)).toFixed(2));
    }
    return out;
  }
  function makeBossProfiles(group,names,high=false){
    return names.map((baseName,family)=>({
      id:group+'_'+(high?'high':'low')+'_'+family,group,family,high,
      name:(high?(group==='legacy'?'覺醒・':'上古・'):'')+baseName,
      effects:FAMILY_BOSS_EFFECTS[family].map(e=>boostedEffect(e,high,group==='parallel'))
    }));
  }
  const DEFAULT_BOSS_AFFIXES=[
    ...makeBossProfiles('legacy',LEGACY_BOSS_SERIES,false),
    ...makeBossProfiles('legacy',LEGACY_BOSS_SERIES,true),
    ...makeBossProfiles('parallel',PARALLEL_BOSS_SERIES,false),
    ...makeBossProfiles('parallel',PARALLEL_BOSS_SERIES,true)
  ];
  const DEFAULT_POWER={
    schemaVersion:4,
    prefixes:DEFAULT_PREFIXES,
    suffixes:DEFAULT_SUFFIXES,
    bossAffixes:DEFAULT_BOSS_AFFIXES,
    strength:{
      multipliers:[.8,.85,.9,.95,1,1.04,1.08,1.12,1.16,1.2],
      bossMultipliers:[1.15,1.167,1.183,1.2,1.217,1.233,1.25,1.267,1.283,1.3],
      acquisitionVersion:1,legacyMultipliers:[1,1.08,1.16,1.24,1.32,1.4,1.48,1.56,1.64,1.72],legacyBossLevelBonus:7,
      weightsByDifficulty:[
        [8,12,16,20,20,12,6,3,2,1],
        [2,4,8,12,22,20,14,9,6,3],
        [1,2,3,6,12,18,20,18,12,8]
      ]
    },
    rerollItem:{id:POWER_ITEM_ID,name:'強度重鑄石',description:'',cost:0,sellPrice:80,shopEnabled:false,shopChance:.06,shopPrice:650,dropRuleInitialized:false}
  };

  function finite(v,d,min=-Infinity,max=Infinity){v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):d;}
  function normalizeSlots(v,def=[0,1,2,3],legacy=false){
    const out=Array.isArray(v)?[...new Set(v.map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=3))]:clone(def);
    if(legacy&&out.includes(2)&&!out.includes(3))out.push(3);
    return out.length?out:clone(def);
  }
  function normalizeEffect(src,allowed,def){
    const fallback=clone(def);
    if(!src||typeof src!=='object'||Array.isArray(src)||!allowed.has(src.key))return fallback;
    const key=src.key;
    if(key==='basicElement'){
      const value=VALID_ELEMENTS.has(src.value)&&src.value!=='physical'?src.value:fallback.value;
      return {key,value};
    }
    let min=-100,max=500;
    if(key==='basicAdvanceNextRound'){min=1;max=5;}
    if(key==='allCooldownReduction'){min=0;max=5;}
    if(key==='dropRateBonus'||key==='bossDamagePct'){min=0;max=500;}
    return {key,value:finite(src.value,fallback.value,min,max)};
  }
  function normalizeAffixChances(src,legacyWeight,tierMin,tierMax){
    const fallback=finite(legacyWeight,0,0,100),has=Array.isArray(src);
    return Array.from({length:10},(_,i)=>{
      const tier=i+1,def=tier>=tierMin&&tier<=tierMax?fallback:0;
      return finite(has?src[i]:def,def,0,100);
    });
  }
  function affixChanceAtTier(x,tier){
    if(!x||tier<1||tier>10)return 0;
    const v=Array.isArray(x.chanceByTier)?x.chanceByTier[tier-1]:x.weight;
    return finite(v,0,0,100);
  }
  function normalizeAffixRows(rows,defaults,legacySlots=false){
    if(!Array.isArray(rows)||!rows.some(x=>x&&x.effect))rows=clone(defaults);
    const seen=new Set();
    const out=[];
    for(let i=0;i<rows.length;i++){
      const x=rows[i]&&typeof rows[i]==='object'?rows[i]:{};
      const d=defaults[i%defaults.length];
      let id=typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x.id)?x.id:d.id+'_'+(i+1);
      if(seen.has(id))id=id+'_'+(i+1);seen.add(id);
      const tierMin=Math.max(1,Math.min(10,Math.round(finite(x.tierMin,d.tierMin,1,10))));
      const tierMax=Math.max(tierMin,Math.min(10,Math.round(finite(x.tierMax,d.tierMax,tierMin,10))));
      const weight=finite(x.weight,d.weight,0,100);
      const chanceByTier=normalizeAffixChances(x.chanceByTier,weight,tierMin,tierMax);
      out.push({id,name:typeof x.name==='string'&&x.name.trim()?x.name.trim():d.name,tierMin,tierMax,weight,chanceByTier,slots:normalizeSlots(x.slots,d.slots,legacySlots),effect:normalizeEffect(x.effect,REGULAR_EFFECT_KEYS,d.effect)});
    }
    return out.length?out:clone(defaults);
  }
  function normalizeBossAffixes(rows,legacySeries){
    const byId=new Map((Array.isArray(rows)?rows:[]).filter(Boolean).map(x=>[x.id,x]));
    const legacyById=new Map((Array.isArray(legacySeries)?legacySeries:[]).filter(Boolean).map(x=>[x.id,x]));
    return DEFAULT_BOSS_AFFIXES.map(def=>{
      const x=byId.get(def.id)||{};
      const legacy=legacyById.get(def.id)||{};
      const name=typeof x.name==='string'&&x.name.trim()?x.name.trim():typeof legacy.name==='string'&&legacy.name.trim()?legacy.name.trim():def.name;
      const src=Array.isArray(x.effects)?x.effects:[];
      const effects=Array.from({length:3},(_,i)=>normalizeEffect(src[i],BOSS_EFFECT_KEYS,def.effects[i]));
      const used=new Set();
      for(let i=0;i<effects.length;i++){
        if(used.has(effects[i].key)){
          const replacement=def.effects.find(d=>!used.has(d.key))||DEFAULT_BOSS_AFFIXES[0].effects.find(d=>!used.has(d.key));
          if(replacement)effects[i]=clone(replacement);
        }
        used.add(effects[i].key);
      }
      return {...def,name,effects,textStyleId:typeof x.textStyleId==='string'?x.textStyleId:''};
    });
  }
  function normalizePower(src){
    src=src&&typeof src==='object'&&!Array.isArray(src)?src:{};
    const legacySlots=Number(src.schemaVersion||0)<4,out=clone(DEFAULT_POWER);
    out.schemaVersion=4;
    out.prefixes=normalizeAffixRows(src.prefixes,DEFAULT_PREFIXES,legacySlots);
    out.suffixes=normalizeAffixRows(src.suffixes,DEFAULT_SUFFIXES,legacySlots);
    out.bossAffixes=normalizeBossAffixes(src.bossAffixes,src.seriesPrefixes);
    const st=src.strength&&typeof src.strength==='object'?src.strength:{};
    out.strength.multipliers=Array.from({length:10},(_,i)=>finite(st.multipliers?.[i],DEFAULT_POWER.strength.multipliers[i],.01,100));
    out.strength.acquisitionVersion=st.acquisitionVersion===1?1:0;
    out.strength.bossMultipliers=Array.from({length:10},(_,i)=>finite(st.bossMultipliers?.[i],DEFAULT_POWER.strength.bossMultipliers[i],.01,100));
    out.strength.legacyMultipliers=Array.from({length:10},(_,i)=>finite(st.legacyMultipliers?.[i],st.multipliers?.[i]??DEFAULT_POWER.strength.legacyMultipliers[i],.01,100));
    out.strength.legacyBossLevelBonus=finite(st.legacyBossLevelBonus,7,0,100);
    out.strength.weightsByDifficulty=Array.from({length:3},(_,d)=>Array.from({length:10},(_,i)=>finite(st.weightsByDifficulty?.[d]?.[i],DEFAULT_POWER.strength.weightsByDifficulty[d][i],0,1e9)));
    const r=src.rerollItem&&typeof src.rerollItem==='object'?src.rerollItem:{};
    out.rerollItem={id:POWER_ITEM_ID,name:typeof r.name==='string'&&r.name.trim()?r.name.trim():DEFAULT_POWER.rerollItem.name,description:typeof r.description==='string'?r.description:DEFAULT_POWER.rerollItem.description,cost:0,sellPrice:finite(r.sellPrice,80,0,1e9),shopEnabled:false,shopChance:finite(r.shopChance,.06,0,1),shopPrice:Math.round(finite(r.shopPrice,650,1,1e9)),dropRuleInitialized:!!r.dropRuleInitialized,textStyleId:typeof r.textStyleId==='string'?r.textStyleId:''};
    return out;
  }

  let EQUIPMENT_POWER=normalizePower((()=>{try{return JSON.parse(balanceSourceText()||'null')?.equipmentPowerSystem;}catch{return null;}})());
  globalThis.__EMBERWILD_EQUIPMENT_POWER=EQUIPMENT_POWER;

  function normalizeBaseFormsV2(){
    for(let job=0;job<ITEM_FORMS.length;job++)for(let slot=0;slot<ITEM_FORMS[job].length;slot++)for(let i=0;i<ITEM_FORMS[job][slot].length;i++)normalizeEquipmentFormObject(ITEM_FORMS[job][slot][i]);
    const broad=ITEM_FORMS?.[0]?.[0]?.[0];
    if(broad){const hit=broad.fixedEffects?.find(e=>e.key==='gearAtkPct');if(hit&&Math.abs(Number(hit.value)-20)<.001)hit.value=5;}
  }
  normalizeBaseFormsV2();

  function rerollItemData(power=EQUIPMENT_POWER){const r=power.rerollItem;return {id:POWER_ITEM_ID,type:POWER_ITEM_TYPE,cost:0,sellPrice:r.sellPrice,duration:0,name:r.name,description:r.description,desc:r.description,shopEnabled:false,textStyleId:r.textStyleId||''};}
  function syncRerollItem(){
    const src=rerollItemData(),i=SHOP.findIndex(x=>x.id===POWER_ITEM_ID);
    if(i<0)SHOP.push(src);else Object.assign(SHOP[i],src);
    if(state?.consumables&&state.consumables[POWER_ITEM_ID]===undefined)state.consumables[POWER_ITEM_ID]=0;
    for(const h of party?.members||[])if(h?.consumables&&h.consumables[POWER_ITEM_ID]===undefined)h.consumables[POWER_ITEM_ID]=0;
  }
  syncRerollItem();

  if(typeof validateDescriptionItems==='function'){
    const identityValidateItemsBase=validateDescriptionItems;
    validateDescriptionItems=function(items){
      if(!Array.isArray(items))throw Error('道具資料無效');
      const special=items.filter(x=>x?.type===POWER_ITEM_TYPE||x?.id===POWER_ITEM_ID),base=items.filter(x=>x?.type!==POWER_ITEM_TYPE&&x?.id!==POWER_ITEM_ID);
      identityValidateItemsBase(base);
      if(special.length>1)throw Error('強度重鑄石只能有 1 筆');
      for(const x of special)if(x.id!==POWER_ITEM_ID||typeof x.name!=='string'||!x.name.trim()||typeof x.description!=='string'||!Number.isFinite(x.sellPrice)||x.sellPrice<0||Number(x.duration)!==0)throw Error('強度重鑄石資料無效');
      return items;
    };
  }

  function ensurePowerDropRule(settings=GAMEPLAY_SETTINGS){
    const r=EQUIPMENT_POWER.rerollItem;
    if(r.dropRuleInitialized)return;
    const entries=settings?.drops?.entries;if(!Array.isArray(entries))return;
    if(!entries.some(x=>x?.type==='item'&&x?.key===POWER_ITEM_ID)){
      const cat=settings?.monsters?.catalog||[],sources=cat.filter(x=>x?.enabled!==false).map(x=>x.id).filter(Boolean);
      entries.push({id:'power_tier_reroll_drop',name:r.name,enabled:true,type:'item',key:POWER_ITEM_ID,kinds:['elite','boss','final'],chanceByDifficulty:[.002,.01,.03],quantityMin:1,quantityMax:1,sources});
    }
    r.dropRuleInitialized=true;
  }
  ensurePowerDropRule();

  function validatePowerInput(raw){
    const st=raw?.strength;
    for(const key of ['multipliers','bossMultipliers','legacyMultipliers'])if(st?.[key]!==undefined&&(!Array.isArray(st[key])||st[key].length!==10||st[key].some(v=>!Number.isFinite(v)||v<=0||v>100)))throw Error('T 級倍率無效：'+key);
    if(st?.weightsByDifficulty!==undefined&&(!Array.isArray(st.weightsByDifficulty)||st.weightsByDifficulty.length!==3||st.weightsByDifficulty.some(row=>!Array.isArray(row)||row.length!==10||row.some(v=>!Number.isFinite(v)||v<0)||!row.some(v=>v>0))))throw Error('T 級權重無效');
    const p=normalizePower(raw);
    const checkRows=(rows,label)=>{
      const ids=new Set();
      for(const x of rows){
        if(ids.has(x.id))throw Error(label+' ID 重複：'+x.id);ids.add(x.id);
        if(!x.name||!x.slots.length||x.tierMin<1||x.tierMax>10||x.tierMax<x.tierMin||!Array.isArray(x.chanceByTier)||x.chanceByTier.length!==10||x.chanceByTier.some(v=>!Number.isFinite(v)||v<0||v>100))throw Error(label+'資料無效：'+x.id);
        if(!REGULAR_EFFECT_KEYS.has(x.effect.key))throw Error(label+'效果無效：'+x.id);
      }
      for(let tier=1;tier<=10;tier++)for(let slot=0;slot<4;slot++){
        const total=rows.filter(x=>tier>=x.tierMin&&tier<=x.tierMax&&x.slots.includes(slot)).reduce((n,x)=>n+affixChanceAtTier(x,tier),0);
        if(total>100+1e-9)throw Error(label+' T'+tier+' '+['武器','護甲','副手','飾品'][slot]+'機率合計超過 100%');
      }
    };
    checkRows(p.prefixes,'前綴');checkRows(p.suffixes,'後綴');
    if(p.bossAffixes.length!==DEFAULT_BOSS_AFFIXES.length)throw Error('BOSS 專屬詞綴資料不完整');
    for(const x of p.bossAffixes){
      if(!Array.isArray(x.effects)||x.effects.length!==3)throw Error('BOSS 專屬詞綴必須正好 3 條：'+x.id);
      const keys=x.effects.map(e=>e.key);
      if(new Set(keys).size!==3||keys.some(k=>!BOSS_EFFECT_KEYS.has(k)))throw Error('BOSS 專屬詞綴三條屬性必須有效且互不重複：'+x.id);
    }
    return p;
  }

  if(typeof exportableBalance==='function'){
    const identityExportBase=exportableBalance;
    exportableBalance=function(){
      normalizeBaseFormsV2();syncRerollItem();
      const out=identityExportBase();
      out.equipmentPowerSystem=clone(EQUIPMENT_POWER);
      if(Array.isArray(out.items)&&!out.items.some(x=>x.id===POWER_ITEM_ID))out.items.push(rerollItemData());
      out._reference??={};out._reference.equipmentIdentity={
        naming:'一般裝備名稱 = 前綴 + 後綴 + 基底；前綴或後綴可為空；BOSS 裝備只使用 BOSS 專屬名稱。',
        stats:'一般裝備 ATK/HP/DEF 只由基底、T1~T10 與既有 +N 強化計算；前後綴不提供 raw ATK/HP/DEF。',
        affixChance:'prefixes / suffixes 的 chanceByTier[0..9] 分別代表 T1～T10 的實際百分比機率（0~100）；同一 T 級與部位合計不足 100% 時，剩餘機率為無該類詞綴。舊版 weight 只作匯入相容。',
        boss:'BOSS 裝備不抽前後綴，保留三條專屬效果及兩個可洗鍊隨機詞綴。',
        effects:[...BOSS_EFFECT_KEYS]
      };
      out.notes=[...(out.notes||[]),'equipmentPowerSystem schemaVersion=4：prefixes / suffixes 各一條效果；chanceByTier[0..9] 分別控制 T1～T10 實際百分比機率，舊版 weight 會自動轉入有效 T 級。','同一 T 級與部位的前綴／後綴機率池各自以 100% 為上限；不足 100% 的剩餘機率會生成無前綴／無後綴裝備。','一般裝備 raw ATK/HP/DEF 不受前後綴影響；由 equipmentForms 基底、T 階級與既有強化計算。','BOSS 專屬裝備不抽前後綴；三條專屬效果保留，隨機詞綴可洗鍊。'];
      return out;
    };
  }
  if(typeof applyBalanceConfig==='function'){
    const identityApplyBase=applyBalanceConfig;
    applyBalanceConfig=function(input,{persist=true}={}){
      const copy=clone(input);
      const nextPower=validatePowerInput(copy.equipmentPowerSystem);
      if(!Array.isArray(copy.items))copy.items=[];
      const item=rerollItemData(nextPower),idx=copy.items.findIndex(x=>x?.id===POWER_ITEM_ID||x?.type===POWER_ITEM_TYPE);
      if(idx<0)copy.items.push(item);else copy.items[idx]={...copy.items[idx],...item};
      copy.equipmentPowerSystem=clone(nextPower);
      // Validate the complete candidate before changing the live equipment rules.
      validateDescriptionItems(normalizeDescriptionBalance(copy).items);validateBalanceConfig(copy);
      for(const g of allKnownGear())if(!EmberwildTokens.isToken(g)&&!g.starterPack)gearStatBreakdown(g);
      EQUIPMENT_POWER=nextPower;globalThis.__EMBERWILD_EQUIPMENT_POWER=EQUIPMENT_POWER;
      syncRerollItem();ensurePowerDropRule(copy.balanceSettings);copy.equipmentPowerSystem=clone(EQUIPMENT_POWER);
      const out=identityApplyBase(copy,{persist:false});
      normalizeBaseFormsV2();syncRerollItem();normalizeAllGearIdentity();
      if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
      if(state){for(const h of party?.members||[state])withHero(h,clampVitals);render();}
      return out;
    };
  }
  if(typeof validateBalanceConfig==='function'){
    const identityValidateBalanceBase=validateBalanceConfig;
    validateBalanceConfig=function(input){const copy=clone(input);copy.equipmentPowerSystem=validatePowerInput(copy.equipmentPowerSystem);return identityValidateBalanceBase(copy);};
  }

  function prefixById(id){return EQUIPMENT_POWER.prefixes.find(x=>x.id===id)||null;}
  function suffixById(id){return EQUIPMENT_POWER.suffixes.find(x=>x.id===id)||null;}
  function eligibleRows(rows,tier,slot){return rows.filter(x=>tier>=x.tierMin&&tier<=x.tierMax&&affixChanceAtTier(x,tier)>0&&x.slots.includes(slot));}
  function deterministicRow(rows,tier,slot,offset=0){const eligible=eligibleRows(rows,tier,slot);return eligible.length?eligible[(Math.max(1,Number(tier)||1)+slot+offset)%eligible.length]:null;}
  function rollWeighted(rows){const total=rows.reduce((n,x)=>n+Math.max(0,Number(x.weight)||0),0);if(total<=0)return rows[0]||null;let r=Math.random()*total;for(const x of rows){r-=Math.max(0,Number(x.weight)||0);if(r<=0)return x;}return rows.at(-1)||null;}
  function rollNamedAffix(rows,tier,slot){const eligible=eligibleRows(rows,tier,slot);let r=Math.random()*100;for(const x of eligible){r-=affixChanceAtTier(x,tier);if(r<0)return x;}return null;}
  function bossProfileId(g){const group=MAPS[g?.region]?.parallel?'parallel':'legacy',family=Math.max(0,Math.min(5,Number(g?.boss)||0)),high=(Number(g?.tier)||1)>6;return group+'_'+(high?'high':'low')+'_'+family;}
  function bossProfileForGear(g){if(!g||g.boss===undefined)return null;const id=bossProfileId(g);return EQUIPMENT_POWER.bossAffixes.find(x=>x.id===id)||DEFAULT_BOSS_AFFIXES.find(x=>x.id===id)||null;}
  function strengthAnchor(mode){return mode===2?10:mode===1?5:1;}
  function rollStrengthTier(mode){mode=Math.max(0,Math.min(2,Number(mode)||0));const w=EQUIPMENT_POWER.strength.weightsByDifficulty[mode]||[],rows=Array.from({length:10},(_,i)=>({tier:i+1,weight:Number(w[i])||0})),hit=rollWeighted(rows);return hit?.tier||strengthAnchor(mode);}
  function strengthMultiplier(g){const t=Math.max(1,Math.min(10,Number(g?.powerTier)||strengthAnchor(g?.difficulty)));if(g?.baseSnapshot)return g.baseSnapshot.mult;const rules=EQUIPMENT_POWER.strength;return Number((g?.baseRuleVersion===1?(g.boss===undefined?rules.multipliers:rules.bossMultipliers):rules.legacyMultipliers)[t-1])||1;}
  const BASE_RATINGS=['D','D','C','C','B','B','A','S','SS','SSS'];
  globalThis.equipmentBaseRating=function(g){
    if(!g||g.slot===undefined||g.starterPack)return '—';
    ensureGearIdentityMeta(g);
    return BASE_RATINGS[g.powerTier-1];
  };
  globalThis.equipmentBaseRatingHTML=function(g){
    if(!g||g.slot===undefined)return '';
    const hint=g.starterPack?'此裝備不適用基底評級。':'僅代表裝備基底的能力層級；強化與詞綴效果另行計算。';
    return '<span class="equipment-base-rating" title="'+esc(hint)+'">基底評級：'+globalThis.equipmentBaseRating(g)+'</span>';
  };
  globalThis.equipmentPlayerItemDescription=item=>globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('item',item?.id)??'';

  function ensureGearIdentityMeta(g,{freshNames=false,freshPower=false,mode=null}={}){
    if(EmberwildTokens.isToken(g))return g;
    if(!g||typeof g!=='object'||g.slot===undefined)return g;
    const sourceMode=mode===null?Math.max(0,Math.min(2,Number(g.difficulty)||0)):Math.max(0,Math.min(2,Number(mode)||0));
    if(freshPower||!Number.isInteger(g.powerTier)||g.powerTier<1||g.powerTier>10)g.powerTier=freshPower?rollStrengthTier(sourceMode):strengthAnchor(sourceMode);
    const tier=Math.max(1,Math.min(10,Number(g.powerTier)||strengthAnchor(sourceMode))),slot=Math.max(0,Math.min(2,Number(g.slot)||0));
    if(g.boss===undefined){
      const hasPrefix=Object.prototype.hasOwnProperty.call(g,'prefixId'),hasSuffix=Object.prototype.hasOwnProperty.call(g,'suffixId');
      if(freshNames||!hasPrefix||(g.prefixId!==''&&(!prefixById(g.prefixId)||!prefixById(g.prefixId).slots.includes(slot))))g.prefixId=(freshNames?rollNamedAffix(EQUIPMENT_POWER.prefixes,tier,slot):deterministicRow(EQUIPMENT_POWER.prefixes,tier,slot,0))?.id||'';
      if(freshNames||!hasSuffix||(g.suffixId!==''&&(!suffixById(g.suffixId)||!suffixById(g.suffixId).slots.includes(slot))))g.suffixId=(freshNames?rollNamedAffix(EQUIPMENT_POWER.suffixes,tier,slot):deterministicRow(EQUIPMENT_POWER.suffixes,tier,slot,3))?.id||'';
    }else{
      g.prefixId='';g.suffixId='';if(!Array.isArray(g.affix))g.affix=[];
      g.bossQualityRank=Math.max(2,Math.min(3,Number(GS('equipment.boss.affixRankByDifficulty',[2,2,3])[g.difficulty||0])||2));
    }
    return g;
  }
  function allKnownGear(){const out=[];for(const h of party?.members||[])for(const g of h?.bag||[])out.push(g);if(state&&!party?.members?.includes(state))for(const g of state.bag||[])out.push(g);return [...new Map(out.filter(Boolean).map(g=>[g.id,g])).values()];}
  function normalizeAllGearIdentity(){for(const g of allKnownGear()){ensureGearIdentityMeta(g);g.name=gearName(g);}}

  function baseFormForGear(g){return g&&g.boss===undefined&&Number.isInteger(g.form)?itemForm(g):null;}
  function baseEffectEntries(g){
    const form=baseFormForGear(g);if(!form)return [];
    normalizeEquipmentFormObject(form);
    return (form.fixedEffects||[]).map(e=>({...e,source:'base'}));
  }
  function identityEffectEntriesForGear(g){
    if(EmberwildTokens.isToken(g))return EmberwildTokens.effectsFor(g,GS('equipment.enhance.statPerLevel',.05));
    ensureGearIdentityMeta(g);
    if(g.boss!==undefined)return (bossProfileForGear(g)?.effects||[]).map(e=>{
      const key={gearAtkPct:'atk',gearHpPct:'hp',gearDefPct:'def'}[e.key];
      // New BOSS bases reference the matching standard shop form. Their exclusive
      // percent effects apply once to that base, never to fixed refinement gains.
      if(g.baseRuleVersion===1&&key)return {key:{atk:'flatAttack',hp:'flatHp',def:'flatDefense'}[key],value:Math.round((g.baseSnapshot?.base[key]||0)*e.value/100),ruleEffect:e,source:'boss'};
      return {...e,source:'boss'};
    });
    const out=baseEffectEntries(g),p=prefixById(g.prefixId),s=suffixById(g.suffixId);
    if(p?.effect)out.push({...p.effect,source:'prefix'});
    if(s?.effect)out.push({...s.effect,source:'suffix'});
    return out;
  }
  function identityEffectsForHero(h){return equipment(h).flatMap(identityEffectEntriesForGear);}
  function effectNumberForHero(h,key){return identityEffectsForHero(h).filter(e=>e.key===key).reduce((n,e)=>n+(Number(e.value)||0),0);}

  function effectText(effect){
    if(!effect)return '無效果';if(effect.ruleEffect)return effectText(effect.ruleEffect);
    const key=effect.key,value=effect.value,label=EFFECT_LABELS[key]||key;
    if(key==='basicElement')return '此武器攻擊屬性：'+(ELEMENTS[value]||value);
    if(key==='basicAdvanceNextRound')return '普攻後，下回合行動往前 '+Math.round(Number(value)||0)+' 格';
    if(key==='allCooldownReduction'||key==='skillCooldownReduction')return (key==='skillCooldownReduction'?'核心技能 '+((effect.skill??0)+1)+' ':'')+label+' −'+Number(value)+' 回合';
    if(['flatAttack','flatHp','flatDefense','pierce','speed'].includes(key))return label+' '+(Number(value)>=0?'+':'')+Number(value);
    if(key==='elementDamagePct')return (ELEMENTS[effect.element]||effect.element)+' '+label+' '+(Number(value)>=0?'+':'')+Number(value)+'%';
    if(key==='elementResistPct')return (ELEMENTS[effect.element]||effect.element)+' '+label+' '+(Number(value)>=0?'+':'')+Number(value)+'%';
    if(key==='raceDamagePct')return '對'+(RACES[effect.race]||effect.race)+' '+label+' '+(Number(value)>=0?'+':'')+Number(value)+'%';
    if(key==='skillEffectPct')return '核心技能 '+((effect.skill??0)+1)+' '+label+' '+(Number(value)>=0?'+':'')+Number(value)+'%';
    return label+' '+(Number(value)>=0?'+':'')+Number(value)+'%';
  }
  globalThis.equipmentIdentityEffectText=effectText;
  const identityAffixLabelBase=affixLabel;
  affixLabel=function(a,g){return a.type===15?'角色總攻擊力 +'+a.value+'%':identityAffixLabelBase(a,g);};

  const identityGearNameBase=gearName;
  const identityEquipmentDisplayBase=equipmentDisplayName;
  gearName=function(g){
    if(EmberwildTokens.isToken(g))return g.snapshot.name;
    if(!g||g.slot===undefined)return identityGearNameBase(g);
    ensureGearIdentityMeta(g);
    const body=g.boss===undefined?(baseFormForGear(g)?.name||CLASS_GEAR[g.job??state?.job??0]?.[g.slot]||'裝備'):(CLASS_GEAR[g.job??state?.job??0]?.[g.slot]||'裝備');
    if(g.boss!==undefined)return (bossProfileForGear(g)?.name||'BOSS專屬')+body;
    return (prefixById(g.prefixId)?.name||'')+(suffixById(g.suffixId)?.name||'')+body;
  };
  equipmentDisplayName=function(g){if(!g||g.slot===undefined)return identityEquipmentDisplayBase(g);ensureGearIdentityMeta(g);return '+'+(g.plus||0)+' '+gearName(g);};
  const identityNameHTMLBase=equipmentNameHTML;
  equipmentNameHTML=function(g){return identityNameHTMLBase(g)+globalThis.equipmentBaseRatingHTML(g);};

  const identityGearFactoryBase=gear;
  gear=function(tier=1,slot=rand(4),rar=0,job=null){const g=identityGearFactoryBase(tier,slot,rar,job);ensureGearIdentityMeta(g,{freshNames:true,freshPower:true,mode:0});g.baseRuleVersion=EQUIPMENT_POWER.strength.acquisitionVersion;delete g.baseSnapshot;g.name=gearName(g);return g;};
  const identityModeAffixesBase=modeAffixes;
  modeAffixes=function(g,mode){const out=identityModeAffixesBase(g,mode);if(g){delete g.baseSnapshot;g.difficulty=Math.max(0,Math.min(2,Number(mode)||0));ensureGearIdentityMeta(g,{freshNames:true,freshPower:true,mode:g.difficulty});g.name=gearName(g);}return out;};
  const identityBossGearBase=bossGear;
  bossGear=function(mi,job=state.job,mode=state.difficulty||0){const g=identityBossGearBase(mi,job,mode);delete g.baseSnapshot;ensureGearIdentityMeta(g,{freshPower:true,mode});g.affix=rollAffixes(g);delete g.affixLock;g.name=gearName(g);gearStatBreakdown(g);return g;};

  const identityQualityBase=gearQualityRank;
  gearQualityRank=function(g){if(g?.boss!==undefined)return Math.max(2,Math.min(3,Number(g.bossQualityRank??GS('equipment.boss.affixRankByDifficulty',[2,2,3])[g.difficulty||0])||2));return identityQualityBase(g);};
  const tokenQualityBase=gearQualityRank;
  gearQualityRank=function(g){return EmberwildTokens.isToken(g)?g.rar:tokenQualityBase(g);};

  bossPower=function(){return 1;};
  function rawTierStats(g){if(g?.baseSnapshot&&!g.starterPack)return {...g.baseSnapshot.raw};const tier=(Number.isInteger(g?.equipmentLevel)?1+(g.equipmentLevel-GS('equipment.requiredLevel.base',1))/GS('equipment.requiredLevel.perTier',5):Math.max(1,Number(g?.tier)||1))+(g?.boss!==undefined&&g.baseRuleVersion!==1?EQUIPMENT_POWER.strength.legacyBossLevelBonus/GS('equipment.requiredLevel.perTier',5):0),atkPer=g.slot===2?GS('equipment.baseStats.offhandAttackPerTier',GS('equipment.baseStats.accessoryAttackPerTier',4)):GS('equipment.baseStats.accessoryAttackPerTier',4),hpPer=g.slot===2?GS('equipment.baseStats.offhandHpPerTier',GS('equipment.baseStats.accessoryHpPerTier',20)):GS('equipment.baseStats.accessoryHpPerTier',20);const raw={atk:g.slot===0?(Number.isFinite(g.starterPack?.baseAttack)?g.starterPack.baseAttack:tier*GS('equipment.baseStats.weaponAttackPerTier',11)):[2,3].includes(g.slot)?tier*atkPer:0,hp:g.slot===1?tier*GS('equipment.baseStats.armorHpPerTier',45):[2,3].includes(g.slot)?tier*hpPer:0,def:g.slot===1?tier*GS('equipment.baseStats.armorDefensePerTier',4):0};if(g.boss!==undefined&&g.baseRuleVersion===1){const form=ITEM_FORMS[g.job]?.[g.slot]?.[0];for(const [key,fx] of [['atk','gearAtkPct'],['hp','gearHpPct'],['def','gearDefPct']])raw[key]=Math.round(raw[key]*(1+(form?.fixedEffects||[]).filter(e=>e.key===fx).reduce((n,e)=>n+Number(e.value||0),0)/100));}return raw;}
  function baseStatPct(g,key){
    const effects=identityEffectEntriesForGear(g);
    return effects.filter(e=>e.key===key).reduce((n,e)=>n+(Number(e.value)||0),0);
  }
  function enhancedBaseStats(g,base){
    const defaults=EmberwildProgression.defaults.settings.equipment.enhance;
    return EmberwildProgression.enhancedGearStats(base,g.plus||0,gearRequiredLevel(g),GS('equipment.enhance.flatStatsPerLevel',defaults.flatStatsPerLevel),GS('equipment.enhance.flatStatsPerEquipmentLevel',defaults.flatStatsPerEquipmentLevel));
  }
  function gearStatBreakdown(g){
    const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE,rows=cache?(cache.gearStats??=new WeakMap()):null,hit=rows?.get(g);
    if(hit&&hit.plus===g.plus&&hit.base===g.baseSnapshot&&hit.power===g.powerTier&&hit.prefix===g.prefixId&&hit.suffix===g.suffixId)return hit.value;
    if(EmberwildTokens.isToken(g)){const zero={atk:0,hp:0,def:0};return {raw:{...zero},body:{...zero},grade:{...zero},enhance:{...zero},total:{...zero},mult:g.qualityMultipliers[g.rar],powerTier:1,prefix:null,suffix:null,bossProfile:null};}
    ensureGearIdentityMeta(g);
    const mult=g.starterPack?Number(EQUIPMENT_POWER.strength.legacyMultipliers[(g.powerTier||1)-1])||1:strengthMultiplier(g);
    const raw=rawTierStats(g);
    // Persist the generated base, before enhancement and random affixes. Changing
    // published T rules or rerolling affixes must never rewrite an owned base.
    let integers;
    if(g.starterPack){integers=EmberwildProgression.gearStats(raw,{atk:baseStatPct(g,'gearAtkPct'),hp:baseStatPct(g,'gearHpPct'),def:baseStatPct(g,'gearDefPct')},mult,0);const total=enhancedBaseStats(g,integers.total);integers.enhance=Object.fromEntries(['hp','atk','def'].map(k=>[k,total[k]-integers.total[k]]));integers.total=total;}
    else{
      if(!g.baseSnapshot){const b=EmberwildProgression.gearStats(raw,{atk:baseStatPct(g,'gearAtkPct'),hp:baseStatPct(g,'gearHpPct'),def:baseStatPct(g,'gearDefPct')},mult,0);g.baseSnapshot={version:1,raw:b.raw,body:b.body,base:b.total,mult};}
      const b=g.baseSnapshot,total=enhancedBaseStats(g,b.base);
      integers={raw:{...b.raw},body:{...b.body},grade:Object.fromEntries(['hp','atk','def'].map(k=>[k,b.base[k]-b.body[k]])),enhance:Object.fromEntries(['hp','atk','def'].map(k=>[k,total[k]-b.base[k]])),total};
    }
    const value={...integers,mult,powerTier:g.powerTier||1,prefix:prefixById(g.prefixId),suffix:suffixById(g.suffixId),bossProfile:bossProfileForGear(g)};
    rows?.set(g,{plus:g.plus,base:g.baseSnapshot,power:g.powerTier,prefix:g.prefixId,suffix:g.suffixId,value});return value;
  }
  globalThis.gearStatBreakdown=gearStatBreakdown;
  gearBaseStats=function(g){return gearStatBreakdown(g).total;};

  function applyIdentityStatEffect(v,e,attackBox){
    const n=Number(e.value)||0;
    if(e.key==='flatAttack')v.atk+=n;
    else if(e.key==='flatHp')v.hp+=n;
    else if(e.key==='flatDefense')v.def+=n;
    else if(e.key==='speed')attackBox.speed=(attackBox.speed||0)+n;
    else if(e.key==='elementDamagePct'&&e.element)v.elementDamage[e.element]=(v.elementDamage[e.element]||0)+n/100;
    else if(e.key==='elementResistPct'&&e.element)v.resist[e.element]=(v.resist[e.element]||0)+n/100;
    else if(e.key==='raceDamagePct'&&e.race)v.raceDamage[e.race]=(v.raceDamage[e.race]||0)+n/100;
    else if(e.key==='attackPct')attackBox.value+=n;
    else if(e.key==='hpPct')attackBox.hp+=n;
    else if(e.key==='defensePct')attackBox.defense+=n;
    else if(e.key==='crit')v.crit+=n/100;
    else if(e.key==='critDamage')v.critDamage+=n/100;
    else if(e.key==='pierce')v.pierce+=n;
    else if(e.key==='defenseIgnore')v.defenseIgnore+=n/100;
    else if(e.key==='lifesteal')v.lifesteal+=n/100;
    else if(e.key==='evasion')v.evasion+=n/100;
    else if(e.key==='elementBonus')v.elementBonus+=n/100;
    else if(e.key==='bossDamagePct')v.bossDamage+=n/100;
  }
  stats=function(h=state){
    const cls=typeof heroGrowthDefinition==='function'?heroGrowthDefinition(h):CLASSES[h.job],initial=typeof globalThis.classInitialStats==='function'?classInitialStats(cls,h.job):{hp:cls.hp,atk:cls.atk,def:cls.def,crit:h.job===2?GS('progression.baseCrit.archer',.17):GS('progression.baseCrit.default',.07),critDamage:GS('combat.baseCritDamage',1.5)},growth=typeof globalThis.classGrowthPerLevel==='function'?classGrowthPerLevel(cls):{hp:GS('progression.statsPerLevel.hp',20),atk:GS('progression.statsPerLevel.attack',4),def:GS('progression.statsPerLevel.defense',2),crit:0,critDamage:0},natural=EmberwildProgression.naturalStats({initialStats:initial,growthPerLevel:growth,growthSteps:cls.growthSteps},h.lv),v={hp:natural.hp,atk:natural.atk,def:natural.def,crit:initial.crit+(h.lv-1)*growth.crit,critDamage:initial.critDamage+(h.lv-1)*growth.critDamage,pierce:0,defenseIgnore:0,lifesteal:0,evasion:0,elementBonus:0,bossDamage:0,elementDamage:{},raceDamage:{},resist:{}};
    if(h.advanced){v.hp*=GS('progression.advance.hpMultiplier',1.18);v.atk*=GS('progression.advance.attackMultiplier',1.22);v.def*=GS('progression.advance.defenseMultiplier',1.15);}
    if(h.companionId!==undefined)for(const key of ['pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage'])v[key]=(cls.initialStats?.[key]||0)+(h.lv-1)*(cls.growthPerLevel?.[key]||0);
    const attackBox={value:0,hp:0,defense:0};let fixedSpeed=0;
    for(const g of equipment(h)){
      const base=gearBaseStats(g);v.atk+=base.atk;v.hp+=base.hp;v.def+=base.def;
      for(const e of identityEffectEntriesForGear(g)){
        const n=Number(e.value)||0;
        if(e.key==='flatAttack')v.atk+=n;
        else if(e.key==='flatHp')v.hp+=n;
        else if(e.key==='flatDefense')v.def+=n;
        else if(e.key==='speed')fixedSpeed+=n;
        else if(e.key==='elementDamagePct'&&e.element)v.elementDamage[e.element]=(v.elementDamage[e.element]||0)+n/100;
        else if(e.key==='elementResistPct'&&e.element)v.resist[e.element]=(v.resist[e.element]||0)+n/100;
        else if(e.key==='raceDamagePct'&&e.race)v.raceDamage[e.race]=(v.raceDamage[e.race]||0)+n/100;
        else if(!['gearAtkPct','gearHpPct','gearDefPct','basicElement','basicAdvanceNextRound','allCooldownReduction','dropRateBonus','skillEffectPct','skillCooldownReduction'].includes(e.key))applyIdentityStatEffect(v,e,attackBox);
      }
      for(const a0 of g.affix||[]){
        const a=convertLegacyManaAffix(a0,g);
        if(a.type<=3){const key=['atk','hp','def','crit'][a.type];v[key]+=a.value/(key==='crit'?100:1);}
        else if(a.type===6)v.critDamage+=a.value/100;
        else if(a.type===7)v.pierce+=a.value;
        else if(a.type===8)v.lifesteal+=a.value/100;
        else if(a.type===9)v.evasion+=a.value/100;
        else if(a.type===12)v.elementDamage[a.element]=(v.elementDamage[a.element]||0)+a.value/100;
        else if(a.type===13)v.raceDamage[a.race]=(v.raceDamage[a.race]||0)+a.value/100;
        else if(a.type===14)v.resist[a.element]=(v.resist[a.element]||0)+a.value/100;
        else if(a.type===15)attackBox.value+=a.value;
        else if(a.type===18)v.defenseIgnore+=a.value/100;
      }
    }
    const passives=globalThis.companionPassiveStatEffects?.(h)||[];
    for(const e of passives)applyIdentityStatEffect(v,e,attackBox);
    fixedSpeed+=attackBox.speed||0;
    if(attackBox.value)v.atk*=1+attackBox.value/100;
    if(attackBox.hp)v.hp*=1+attackBox.hp/100;
    if(attackBox.defense)v.def*=1+attackBox.defense/100;
    v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,v.crit);v.pierce=Math.min(GAME_BALANCE.combat.statCaps.pierce,v.pierce);v.defenseIgnore=Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,v.defenseIgnore);v.evasion=Math.min(GAME_BALANCE.combat.statCaps.evasion,v.evasion);v.lifesteal=Math.min(GAME_BALANCE.combat.statCaps.lifesteal,v.lifesteal);
    const heroBase=GS('combat.speed.heroBase',[102,108,116,96]);v.speed=Math.round((initial.speed??(heroBase[h.job]??100)+GS('combat.speed.heroPerLevel',.5))+(h.lv-1)*(growth.speed??GS('combat.speed.heroPerLevel',.5))+Math.min(GS('combat.speed.bonusCap',5),(v.evasion||0)*GS('combat.speed.evasionWeight',10)+(v.crit||0)*GS('combat.speed.critWeight',5))+fixedSpeed);
    for(const k of ['hp','atk','def'])v[k]=Math.round(v[k]);
    if(passives.length){v.hp=Math.max(1,v.hp);v.atk=Math.max(0,v.atk);v.def=Math.max(0,v.def);v.speed=Math.max(1,v.speed);v.critDamage=Math.max(1,v.critDamage);}
    return v;
  };
  solo.stats=stats;

  weaponElement=function(h){
    const imbue=activeSupply(h,'imbue');if(imbue&&VALID_ELEMENTS.has(imbue.element))return imbue.element;
    const ordered=[...equipment(h)].sort((a,b)=>a.slot-b.slot);
    for(const g of ordered){const hit=identityEffectEntriesForGear(g).find(e=>e.key==='basicElement'&&VALID_ELEMENTS.has(e.value));if(hit)return hit.value;}
    return 'physical';
  };
  function basicAdvanceSteps(h){return Math.max(0,Math.min(5,Math.round(effectNumberForHero(h,'basicAdvanceNextRound'))));}
  const identityInitiativeOrderBase=initiativeOrder;
  initiativeOrder=function(){
    const order=identityInitiativeOrderBase();
    for(let i=1;i<order.length;i++){
      const u=order[i];if(u.side!=='hero')continue;
      const h=u.actor,basic=h.basicAdvanceRound===round?basicAdvanceSteps(h):0,proc=h.procAdvanceRound===round?Math.max(0,Math.min(5,Number(h.procAdvanceSteps)||0)):0,steps=Math.min(5,basic+proc);
      if(steps){const to=Math.max(0,i-steps);if(to!==i){order.splice(i,1);order.splice(to,0,u);}}
      if(proc){delete h.procAdvanceRound;delete h.procAdvanceSteps;}
    }
    return order;
  };
  const identityPerformHeroBasicBase=performHeroBasic;
  performHeroBasic=function(h){const out=identityPerformHeroBasicBase(h),steps=basicAdvanceSteps(h);if(steps)h.basicAdvanceRound=round+1;else delete h.basicAdvanceRound;return out;};
  const identityResetEncounterBase=resetEncounter;
  resetEncounter=function(){for(const h of party?.members||[]){delete h.basicAdvanceRound;delete h.procAdvanceRound;delete h.procAdvanceSteps;delete h.nextActiveDamageBonus;}return identityResetEncounterBase();};

  function fixedSkillEffectNumber(h,key,i){return identityEffectsForHero(h).filter(e=>e.key===key&&Number(e.skill)===Number(i)).reduce((n,e)=>n+(Number(e.value)||0),0);}
  const identitySkillPowerBase=skillPower;
  skillPower=function(i,h=state){return identitySkillPowerBase(i,h)*(1+fixedSkillEffectNumber(h,'skillEffectPct',i)/100);};
  const identitySkillCooldownBase=skillCooldown;
  skillCooldown=function(i,h=state){const base=identitySkillCooldownBase(i,h),sk=CLASSES[h.job]?.skills?.[i],n=Math.max(0,Math.round(fixedSkillEffectNumber(h,'skillCooldownReduction',i)));return sk?.[1]==='active'?Math.max(GAME_BALANCE.combat.minimumActiveCooldown,base-n):base;};
  const identityProcChanceBase=procChance;
  procChance=function(i,h=state){const base=identityProcChanceBase(i,h),sk=CLASSES[h.job]?.skills?.[i],n=Math.max(0,fixedSkillEffectNumber(h,'skillCooldownReduction',i));return sk?.[1]==='proc'?Math.min(GAME_BALANCE.combat.statCaps.crit,base+n*(GAME_BALANCE.affixes.procChancePerPointPercent/100)):base;};

  const identityAllCdBase=allSkillCooldownReduction;
  allSkillCooldownReduction=function(h=state){return identityAllCdBase(h)+Math.max(0,Math.round(effectNumberForHero(h,'allCooldownReduction')));};
  heroDropRateBonus=function(h){const random=(equipment(h).flatMap(g=>g.affix||[]).filter(a=>a.type===17).reduce((n,a)=>n+(Number(a.value)||0),0))/100;return random+Math.max(0,effectNumberForHero(h,'dropRateBonus'))/100;};
  partyDropRateBonus=function(){const hs=party?heroes():(state?[state]:[]);return hs.reduce((n,h)=>n+heroDropRateBonus(h),0);};

  const identityResolveHitBase=resolveHit;
  resolveHit=function(e,amount,h,element,crit){
    const bonus=(e?.kind==='boss'||e?.kind==='final')?(battleStats(h).bossDamage||0):0;
    return identityResolveHitBase(e,amount*(1+bonus),h,element,crit);
  };

  function sourceDifficulty(g){return MODES[Math.max(0,Math.min(2,Number(g?.difficulty)||0))]?.name||'普通';}
  const PANEL_KEYS=['atk','hp','def','speed'];
  const FLAT_PANEL_KEYS={flatAttack:'atk',flatHp:'hp',flatDefense:'def',speed:'speed'};
  const PCT_PANEL_KEYS={gearAtkPct:'atk',gearHpPct:'hp',gearDefPct:'def'};
  const emptyPanel=()=>({atk:0,hp:0,def:0,speed:0});
  function statText(v){
    const labels={atk:'攻擊',hp:'生命',def:'防禦',speed:'速度'},parts=[];
    for(const k of PANEL_KEYS){const n=Math.round(Number(v?.[k])||0);if(n)parts.push(labels[k]+' '+(n>=0?'+':'')+n);}
    return parts.join(' / ')||'—';
  }
  // A display ledger, not a second character-stat calculator. Percentages are
  // applied to the same raw base as gearStatBreakdown; flat effects retain their
  // existing position after power/enhancement. Character/combat rules stay rules.
  globalThis.equipmentStatContributions=function(g){
    const b=gearStatBreakdown(g),rows=[],effectRows=[],growth=globalThis.equipmentStarterGrowthSources?.(g);
    const add=(label,rule='',effect=null,affix=null)=>{
      const row={label,rule,stats:emptyPanel(),effect,affix};rows.push(row);
      if(effect)effectRows.push(row);
      return row;
    };
    Object.assign(add('基底數值').stats,b.raw);
    const effects=g.boss===undefined?baseEffectEntries(g):identityEffectEntriesForGear(g);
    const baseCount=growth?growth.baseCount:effects.length;
    if(!baseCount)add('基底效果');
    effects.slice(0,baseCount).forEach((e,i)=>add((g.boss===undefined?'基底效果 ':'BOSS 專屬加成 ')+(i+1),effectText(e),e));
    if(growth){
      if(!growth.effects.length)add('每級成長');
      growth.effects.forEach((e,i)=>{
        const active=effects[baseCount+i]||null;
        add('成長加成 '+(i+1),effectText(e)+'／級 · '+growth.range+' · 已成長 '+growth.levels+' 級',active);
      });
    }
    for(const [label,named] of [['前綴加成',b.prefix],['後綴加成',b.suffix]])add(label,named?named.name+' · '+effectText(named.effect):'',named?.effect);
    const affixes=Array.isArray(g.affix)?g.affix:[];
    for(let i=0;i<Math.max(2,affixes.length);i++){
      const a=affixes[i]?convertLegacyManaAffix(affixes[i],g):null;
      add('詞綴 '+(i+1)+' 加成',a?'['+(AFFIX_RANK[a.rank??0]||'普通')+'] '+affixLabel(a,g):'',null,a);
    }
    Object.assign(add(g.starterPack?'基底倍率加成':'基底評級加成',sourceDifficulty(g)+'來源 · 基底倍率 ×'+Number(b.mult.toFixed(3))).stats,b.grade);
    Object.assign(add('強化加成（+'+(g.plus||0)+'）').stats,b.enhance);

    // Allocate integer rounding in source order. The displayed contribution is
    // the change at this step, so rows sum exactly even for small/negative rules.
    const raw=rawTierStats(g),pct={atk:0,hp:0,def:0},body={...b.raw},current={...emptyPanel(),...b.total};
    for(const row of effectRows){
      const e=row.effect,n=Number(e.value)||0,k=PCT_PANEL_KEYS[e.key];
      if(k){
        pct[k]+=n;
        const next=Math.max(0,Math.round(raw[k]*(1+pct[k]/100)));
        row.stats[k]+=next-body[k];body[k]=next;
      }
      const flat=FLAT_PANEL_KEYS[e.key];
      if(flat){const before=Math.round(current[flat]);current[flat]+=n;row.stats[flat]+=Math.round(current[flat])-before;}
    }
    for(const row of rows){
      const a=row.affix,k=a&&['atk','hp','def'][a.type];
      if(k){const before=Math.round(current[k]);current[k]+=Number(a.value)||0;row.stats[k]+=Math.round(current[k])-before;}
    }
    const total=Object.fromEntries(PANEL_KEYS.map(k=>[k,Math.round(current[k])]));
    return {rating:globalThis.equipmentBaseRating(g),total,rows};
  };
  const CHARACTER_EFFECT_KEYS=new Set(['attackPct','hpPct','defensePct']);
  const AFFIX_EFFECT_KEYS={3:'crit',6:'critDamage',7:'pierce',8:'lifesteal',9:'evasion',12:'elementDamagePct',13:'raceDamagePct',14:'elementResistPct',16:'allCooldownReduction',17:'dropRateBonus',18:'defenseIgnore'};
  // Compare random affixes by effect and target, independently of learned skills
  // and character stat caps. Duplicate affixes contribute to the same total.
  globalThis.equipmentAffixComparison=function(current,next){
    const collect=g=>{
      const effects=new Map();
      for(const raw of g.affix||[]){
        const a=convertLegacyManaAffix(raw,g),skill=CLASSES[g.job??0]?.skills?.[a.skill??0];
        let key=AFFIX_EFFECT_KEYS[a.type]||({0:'flatAttack',1:'flatHp',2:'flatDefense',4:'skillEffectPct',5:'skillCooldownReduction',15:'attackPct'})[a.type];
        if(!key)continue;
        let value=Number(a.value)||0,label=({flatAttack:'攻擊',flatHp:'生命',flatDefense:'防禦'})[key]||EFFECT_LABELS[key];
        if([4,5].includes(a.type)){
          if(a.type===5&&skill?.[1]==='proc'){key='skillProcChance';value*=GAME_BALANCE.affixes.procChancePerPointPercent;}
          label=CLASSES[g.job??0].name+' · '+(skill?.[0]||'核心技能 '+((a.skill??0)+1))+' '+(a.type===4?'效果':key==='skillProcChance'?'觸發率':'冷卻縮短');
        }else if(a.type===16)label='全主動／輔助技能冷卻縮短';
        if(a.element)label=(ELEMENTS[a.element]||a.element)+' '+label;
        if(a.race)label='對'+(RACES[a.race]||a.race)+' '+label;
        const id=[key,a.element||'',a.race||'',[4,5].includes(a.type)?g.job+':'+(a.skill??0):''].join(':');
        if(!effects.has(id))effects.set(id,{label,value:0,percent:!['flatAttack','flatHp','flatDefense','pierce','allCooldownReduction','skillCooldownReduction'].includes(key),unit:['allCooldownReduction','skillCooldownReduction'].includes(key)?' 回合':''});
        effects.get(id).value+=value;
      }
      return effects;
    };
    const before=collect(current),after=collect(next),rows=[];
    for(const id of new Set([...before.keys(),...after.keys()])){
      const effect=after.get(id)||before.get(id),a=Number((before.get(id)?.value||0).toFixed(2)),b=Number((after.get(id)?.value||0).toFixed(2)),delta=Number((b-a).toFixed(2));
      if(delta)rows.push({...effect,before:a,after:b,delta,good:delta>0});
    }
    return rows;
  };
  // Equipment-owned bonuses are totals in their own units, never an estimate of
  // character attack or combat power. Keep random-affix rules available above.
  globalThis.equipmentAbilitySummary=function(g){
    const ledger=globalThis.equipmentStatContributions(g),effects=new Map();
    const addEffect=(effect,random=false)=>{
      if(!effect||CHARACTER_EFFECT_KEYS.has(effect.key)||PCT_PANEL_KEYS[effect.key]||FLAT_PANEL_KEYS[effect.key])return;
      const e={...effect};
      if(e.key==='skillCooldownReduction'&&CLASSES[g.job??0]?.skills?.[e.skill??0]?.[1]==='proc'){
        e.key='skillProcChance';e.value=(Number(e.value)||0)*GAME_BALANCE.affixes.procChancePerPointPercent;
      }
      const id=[e.key,e.element||'',e.race||'',e.skill??''].join(':');
      if(e.key==='basicElement'){
        // weaponElement uses the first declared element; conflicting rules do not add.
        if(!effects.has('basicElement'))effects.set('basicElement',e);
        return;
      }
      if(!effects.has(id))effects.set(id,{...e,value:0,fixedValue:0,affixValue:0});
      const total=effects.get(id),n=Number(e.value)||0;
      total.value+=n;total[random?'affixValue':'fixedValue']+=n;
    };
    for(const row of ledger.rows)if(row.effect)addEffect(row.effect);
    for(const row of ledger.rows){
      const a=row.affix;if(!a)continue;
      const key=AFFIX_EFFECT_KEYS[a.type]||(a.type===4?'skillEffectPct':a.type===5?'skillCooldownReduction':'');
      if(key)addEffect({key,value:a.value,...(a.element?{element:a.element}:{}),...(a.race?{race:a.race}:{}),...([4,5].includes(a.type)?{skill:a.skill??0}:{})},true);
    }
    const numeric={...ledger.total};
    for(const row of ledger.rows){const e=row.effect||(row.affix?.type===15?{key:'attackPct',value:row.affix.value}:null);if(e&&CHARACTER_EFFECT_KEYS.has(e.key))numeric[e.key]=(numeric[e.key]||0)+(Number(e.value)||0);}
    const values=statText(ledger.total)==='—'?[]:statText(ledger.total).split(' / ');
    for(const e of effects.values()){
      // The existing skill formula multiplies its fixed and random bonus groups.
      if(e.key==='skillEffectPct')e.value=((1+e.fixedValue/100)*(1+e.affixValue/100)-1)*100;
      if(['allCooldownReduction','skillCooldownReduction'].includes(e.key))e.value=Math.max(0,Math.round(e.fixedValue))+e.affixValue;
      if(e.key==='basicAdvanceNextRound')e.value=Math.max(0,Math.min(5,Math.round(e.value)));
      if(e.key!=='basicElement'){
        e.value=Number(e.value.toFixed(2));
        if(!e.value)continue;
      }
      if(e.key!=='basicElement')numeric[[e.key,e.element||'',e.race||'',e.skill??''].join(':')]=e.value;
      values.push(e.key==='skillProcChance'?'核心技能 '+((e.skill??0)+1)+' 觸發率 '+(e.value>=0?'+':'')+e.value+'%':e.key==='skillCooldownReduction'?'核心技能 '+((e.skill??0)+1)+' 冷卻 −'+e.value+' 回合':effectText(e));
    }
    const affixes=ledger.rows.filter(row=>row.affix).map(row=>({label:row.label.replace(' 加成',''),rule:row.rule,rank:row.affix.rank??0}));
    return {total:ledger.total,values,affixes,numeric};
  };
  globalThis.equipmentNumericFields=function(){
    const fields=[{key:'atk',label:'攻擊'},{key:'def',label:'防禦'},{key:'hp',label:'生命'},{key:'speed',label:'速度'}];
    for(const [key,label] of Object.entries(EFFECT_LABELS)){
      if(key==='basicElement'||FLAT_PANEL_KEYS[key]||PCT_PANEL_KEYS[key])continue;
      if(CHARACTER_EFFECT_KEYS.has(key)){fields.push({key,label:label+'加成（%）'});continue;}
      if(['elementDamagePct','elementResistPct'].includes(key)){for(const [target,name] of Object.entries(ELEMENTS))fields.push({key:[key,target,'',''].join(':'),label:name+' · '+label+'（%）'});}
      else if(key==='raceDamagePct'){for(const [target,name] of Object.entries(RACES))fields.push({key:[key,'',target,''].join(':'),label:name+' · '+label+'（%）'});}
      else if(['skillEffectPct','skillCooldownReduction'].includes(key)){
        const count=Math.max(...CLASSES.map(c=>c.skills.length));
        for(let i=0;i<count;i++)fields.push({key:[key,'','',i].join(':'),label:'核心技能 '+(i+1)+' · '+label});
        if(key==='skillCooldownReduction')for(let i=0;i<count;i++)fields.push({key:['skillProcChance','','',i].join(':'),label:'核心技能 '+(i+1)+' · 觸發率（%）'});
      }else fields.push({key:[key,'','',''].join(':'),label});
    }
    return fields;
  };
  globalThis.equipmentTotalSummaryText=function(g){return globalThis.equipmentAbilitySummary(g).values.join(' / ')||'—';};
  globalThis.equipmentTotalSummaryHTML=function(g){
    const summary=globalThis.equipmentAbilitySummary(g);
    const values='<span class="equipment-summary-values">'+(summary.values.length?summary.values.map(value=>'<span>'+esc(value)+'</span>').join(''):'—')+'</span>';
    const affixes=summary.affixes.length?'<span class="equipment-summary-affixes">'+summary.affixes.map(a=>'<span class="equipment-summary-affix effect-quality-'+a.rank+'"><b>'+esc(a.label)+'</b> '+esc(a.rule)+'</span>').join('')+'</span>':'';
    return values+affixes;
  };
  globalThis.equipmentAttributeDetailsHTML=function(g,options={}){
    if(!g)return '';
    const ledger=globalThis.equipmentStatContributions(g);
    const lines=ledger.rows.map(row=>{
      const stats=statText(row.stats);
      let value=stats,extra='';
      if(!row.affix&&row.rule){
        if(row.effect){
          value=row.rule;
          const flat=FLAT_PANEL_KEYS[row.effect.key];
          if(stats!=='—'&&(PCT_PANEL_KEYS[row.effect.key]||row.label.startsWith('成長加成')||flat&&Number(row.effect.value)!==row.stats[flat]))extra='裝備能力增加量：'+stats;
        }else if(stats==='—')value=row.rule;
        else extra=row.rule;
      }
      // Random-affix rules appear once in the summary. Their detailed rows only
      // show an equipment-panel increment, or a dash when there is none.
      return '<div class="equipment-attribute-line"><b>'+esc(row.label)+'</b><span><span class="equipment-source-value">'+esc(value)+'</span>'+(extra?'<small class="equipment-attribute-rule">'+esc(extra)+'</small>':'')+'</span></div>';
    });
    const note='※ 可加總的裝備能力已列於上方，詳細數值無須再次相加；詞綴加成的「—」表示不直接增加裝備自身能力，效果仍正常生效。';
    return '<details class="equipment-attribute-details"><summary>'+esc(options.summary||'詳細數值來源')+'</summary><div class="equipment-attribute-list">'+lines.join('')+'<p class="equipment-source-note">'+esc(note)+'</p></div></details>';
  };
  exclusiveEquipmentText=function(g){
    const out=[];if(!g)return out;
    if(g.boss!==undefined){for(const e of bossProfileForGear(g)?.effects||[])out.push(effectText(e));return out;}
    for(const e of baseEffectEntries(g))out.push(effectText(e));
    const p=prefixById(g.prefixId),s=suffixById(g.suffixId);if(p)out.push('前綴 '+p.name+'：'+effectText(p.effect));if(s)out.push('後綴 '+s.name+'：'+effectText(s.effect));
    return out;
  };
  gearDesc=function(g){return globalThis.equipmentTotalSummaryText(g);};

  const identityRerollBase=reroll;
  reroll=function(id){const g=findGear(id);if(g?.equipmentSource==='shop'&&g.canReroll===false)return toast('此裝備不可洗鍊');return identityRerollBase(id);};
  const identityAutoRerollBase=autoReroll;
  autoReroll=function(id,targetRank){const g=findGear(id);if(g?.canReroll===false)return toast('此裝備不可洗鍊');return identityAutoRerollBase(id,targetRank);};

  const identityForgeViewBase=forgeView;
  forgeView=function(){
    let html=identityForgeViewBase();
    const g=typeof findGear==='function'?findGear(forgeSelection):null;
    if(!g||g.starterPack||g.equipmentSource==='shop'||globalThis.EmberwildTokens?.isToken(g))return html;
    ensureGearIdentityMeta(g);
    const n=state?.consumables?.[POWER_ITEM_ID]||0,b=gearStatBreakdown(g);
    const card='<section class="forge-power-reroll"><h3>基底重鑄</h3><p><b>基底評級：'+globalThis.equipmentBaseRating(g)+'</b>（'+esc(sourceDifficulty(g))+'來源，基底倍率 ×'+Number(b.mult.toFixed(3))+'）。</p><p class="small">'+esc(EQUIPMENT_POWER.rerollItem.name)+' ×'+n+' · 依原始掉落難度重抽基底；強化與詞綴不改變基底評級。</p><div class="actions"><button onclick="rerollEquipmentPowerTier(\''+g.id+'\')" '+(n<1?'disabled':'')+'>消耗 1 個重鑄基底</button></div></section>';
    const tail=html.lastIndexOf('</section>');return tail>=0?html.slice(0,tail)+card+html.slice(tail):html+card;
  };

  globalThis.rerollEquipmentPowerTier=function(id){
    const g=typeof findGear==='function'?findGear(id):allKnownGear().find(x=>x.id===id);if(!g)return toast('找不到裝備');if(g.equipmentSource==='shop')return toast('商店裝備的 T 級與基底固定，無法重鑄');
    syncRerollItem();state.consumables??={};if((state.consumables[POWER_ITEM_ID]||0)<1)return toast(EQUIPMENT_POWER.rerollItem.name+'不足');
    const old=g.powerTier||strengthAnchor(g.difficulty),weights=EQUIPMENT_POWER.strength.weightsByDifficulty[Math.max(0,Math.min(2,g.difficulty||0))]||[],choices=weights.filter(x=>x>0).length;let next=rollStrengthTier(g.difficulty||0);
    if(choices>1)for(let n=0;n<8&&next===old;n++)next=rollStrengthTier(g.difficulty||0);
    state.consumables[POWER_ITEM_ID]--;delete g.baseSnapshot;g.powerTier=next;gearStatBreakdown(g);g.name=gearName(g);for(const h of party?.members||[state])withHero(h,clampVitals);save();render();toast('基底重鑄完成 · 基底評級：'+BASE_RATINGS[old-1]+' → 基底評級：'+BASE_RATINGS[next-1]+'（基底倍率 ×'+Number(EQUIPMENT_POWER.strength.multipliers[old-1].toFixed(3))+' → ×'+Number(strengthMultiplier(g).toFixed(3))+'）');
  };

  if(typeof supplyDetail==='function'){const identitySupplyDetailBase=supplyDetail;supplyDetail=function(item){if(item?.id===POWER_ITEM_ID)return '基底重鑄道具 · 基底評級：D～SSS · 在裝備強化頁使用 · 賣價 '+Math.round(item.sellPrice||0)+' 金幣';return identitySupplyDetailBase(item);};}
  if(typeof useSupply==='function'){const identityUseSupplyBase=useSupply;useSupply=function(id){if(id===POWER_ITEM_ID)return toast('請在「裝備強化」頁選擇裝備後使用'+EQUIPMENT_POWER.rerollItem.name);return identityUseSupplyBase(id);};}
  if(typeof globalThis.useInventoryItem==='function'){const identityInventoryUseBase=globalThis.useInventoryItem;globalThis.useInventoryItem=function(id,job){if(id===POWER_ITEM_ID){if(typeof setTab==='function')setTab('forge');toast('請選擇裝備後使用'+EQUIPMENT_POWER.rerollItem.name);return;}return identityInventoryUseBase(id,job);};}

  // Reroll stone offers are configured by shopSettings alongside all other products.

  if(typeof update12BossMemberView==='function'){
    update12BossMemberView=function(job=state.job){
      const mode=state.difficulty||0,b=GAMEPLAY_SETTINGS.equipment.boss,needMat=Math.max(0,Math.round(b.craftMaterialCount));
      return heading('BOSS WORKSHOP / 首領製作',MODES[mode].name+'模式專屬裝備')+modePicker()+'<section class="panel">'+resourceLine()+uiHelp('製作說明','BOSS 裝備保留三條專屬效果，另有可洗鍊詞綴；新基底依 T 級為同級標準的 115%～130%，強化與詞綴另外計算。')+'</section><div class="cards boss-recipes">'+MAPS.map((m,i)=>{if(typeof worldIsFinalMap==='function'?worldIsFinalMap(i):i===6)return '';const family=regionFamily(i),tier=regionTier(i),g={job,slot:bossEquipmentSlot(family),tier,boss:family,region:i,difficulty:mode,rar:0,plus:0,affix:[],powerTier:strengthAnchor(mode)},mat=bossMaterial(i,mode),n=state.materials[mat]||0,cost=Math.round(tier*b.craftGoldPerTier*(mode+1)),ready=canVisit(i)&&state.lv>=m.min&&state.gold>=cost&&n>=needMat;return '<article class="card boss-recipe">'+'<span class="tag">'+esc(m.name)+'</span>'+gearSlotHTML(g,{preview:g})+'<p class="small">'+esc(CLASSES[job].name)+' · LV'+m.min+'</p>'+'<div class="recipe-cost"><span>'+itemSlotHTML('material',mat,{count:needMat,detailLabel:'所需數量'})+' 持有 '+n+'</span><span>◈ '+cost+'</span></div><button class="primary" onclick="craftBoss('+i+','+job+')" '+(ready?'':'disabled')+'>'+(!canVisit(i)?'尚未解鎖':ready?'製作裝備':'等級／材料不足')+'</button></article>';}).join('')+'</div>';
    };
  }

  try{
    const raw=balanceSourceText();
    if(raw){const saved=JSON.parse(raw);if(saved?.equipmentPowerSystem)applyBalanceConfig(saved,{persist:false});}
  }catch(e){console.warn('裝備前綴／後綴設定載入失敗，使用內建設定',e);}

  syncRerollItem();normalizeAllGearIdentity();
  // Rehydrate the original bytes once all save validators and migrations exist.
  // Earlier passes must never overwrite the only complete copy of late fields.
  const candidates=[];
  try{const primary=globalThis.__EMBERWILD_BOOT_SAVE_RAW??localStorage.getItem(KEY);if(primary)candidates.push({raw:primary,label:'主要存檔'});}catch{}
  try{const backup=localStorage.getItem(BACKUP_KEY);if(backup&&!candidates.some(x=>x.raw===backup))candidates.push({raw:backup,label:'備份存檔'});}catch{}
  // Published builds install later skill and save validators before one final hydration.
  // Provisional validation here can reject a valid save or recover a backup too early.
  if(candidates.length&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)){
    state=null;party=null;
    // A custom form may be unavailable until its test JSON is imported; keep the primary save intact.
    for(const candidate of candidates){try{loadParty(migrateWorldSave(JSON.parse(candidate.raw)));normalizeAllGearIdentity();normalizeEquippedWearability();globalThis.__EMBERWILD_PRE_CONTROL_SAVE_RAW=candidate.raw;if(candidate.label==='備份存檔'&&candidates[0]?.label==='主要存檔')globalThis.__EMBERWILD_UNREADABLE_PRIMARY_RAW=candidates[0].raw;if(candidate.label==='備份存檔'&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY))toast('主要存檔無法載入，已自動恢復上一份備份');break;}catch(e){state=null;party=null;console.warn(candidate.label+'最終載入失敗',e);if(candidate.label==='主要存檔'&&String(e?.message||e).startsWith('裝備類型無效：'))break;}}
  }
  saveReady=true;
  window.__EMBERWILD_EQUIPMENT_IDENTITY={schemaVersion:2,effectKeys:[...BOSS_EFFECT_KEYS],prefixes:()=>clone(EQUIPMENT_POWER.prefixes),suffixes:()=>clone(EQUIPMENT_POWER.suffixes),bossAffixes:()=>clone(EQUIPMENT_POWER.bossAffixes),effectText};
  if(state){save();render();}
})();
