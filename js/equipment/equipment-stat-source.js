
/* Final equipment source cleanup:
   - Base stats never change because of an equipment name/form.
   - Fixed form effects are explicit exclusive stats and are shown as immutable.
   - Boss equipment never inherits a hidden normal-form effect.
   - Equipment max-MP / MP-regen effects and affixes are removed; legacy ones migrate to small attack bonuses.
*/
const EQUIPMENT_FIXED_EFFECT_KEYS=new Set(['flatAttack','flatHp','flatDefense','gearAtkPct','gearHpPct','gearDefPct','attackPct','crit','critDamage','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamagePct','speed','allCooldownReduction','dropRateBonus','basicAdvanceNextRound','basicElement','elementDamagePct','elementResistPct','raceDamagePct','skillEffectPct','skillCooldownReduction']);
const EQUIPMENT_EFFECT_ELEMENTS=new Set(['physical','fire','ice','wind','light','shadow']);
const EQUIPMENT_EFFECT_RACES=new Set(['beast','plant','undead','construct','demon','spirit']);
function normalizeFixedEquipmentEffect(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!EQUIPMENT_FIXED_EFFECT_KEYS.has(raw.key))return null;
 const out={key:raw.key};
 if(raw.key==='basicElement')out.value=EQUIPMENT_EFFECT_ELEMENTS.has(raw.value)?raw.value:'physical';else out.value=Number.isFinite(Number(raw.value))?Number(raw.value):0;
 if(['elementDamagePct','elementResistPct'].includes(raw.key))out.element=EQUIPMENT_EFFECT_ELEMENTS.has(raw.element)&&raw.element!=='physical'?raw.element:'fire';
 if(raw.key==='raceDamagePct')out.race=EQUIPMENT_EFFECT_RACES.has(raw.race)?raw.race:'beast';
 if(['skillEffectPct','skillCooldownReduction'].includes(raw.key))out.skill=Math.max(0,Number.isInteger(Number(raw.skill))?Number(raw.skill):0);
 return out;
}
function normalizeEquipmentFormObject(source){
 if(!source||typeof source!=='object'||Array.isArray(source))return source;
 const form=source,legacy=[];
 if(!Array.isArray(form.fixedEffects)||!form.fixedEffects.length){
  const ex=(form.exclusive&&typeof form.exclusive==='object'&&!Array.isArray(form.exclusive))?{...form.exclusive}:{},pct=value=>Number(((Number(value)-1)*100).toFixed(2));
  if(Number.isFinite(form.atk)&&form.atk!==1)ex.gearAtkPct=(ex.gearAtkPct||0)+pct(form.atk);
  if(Number.isFinite(form.hp)&&form.hp!==1)ex.gearHpPct=(ex.gearHpPct||0)+pct(form.hp);
  if(Number.isFinite(form.def)&&form.def!==1)ex.gearDefPct=(ex.gearDefPct||0)+pct(form.def);
  for(const key of ['crit','critDamage','pierce','lifesteal','evasion','elementBonus','defenseIgnore'])if(Number.isFinite(form[key])&&form[key]!==0)ex[key]=(ex[key]||0)+form[key];
  let manaAttack=0;if(Number.isFinite(form.mp)&&form.mp>0)manaAttack+=Math.max(1,Math.round(form.mp/15));if(Number.isFinite(form.mpRegen)&&form.mpRegen>0)manaAttack+=Math.max(1,Math.round(form.mpRegen));if(manaAttack)ex.attackPct=(ex.attackPct||0)+manaAttack;
  for(const [key,value] of Object.entries(ex))legacy.push({key,value});
  if(EQUIPMENT_EFFECT_ELEMENTS.has(form.element)&&form.element!=='physical')legacy.push({key:'basicElement',value:form.element});
 }
 const src=Array.isArray(form.fixedEffects)&&form.fixedEffects.length?[...form.fixedEffects]:legacy;
 // Legacy import only: migrate element into basicElement, then remove element below. Live equipment never reads element.
 if(EQUIPMENT_EFFECT_ELEMENTS.has(form.element)&&form.element!=='physical'&&!src.some(e=>e?.key==='basicElement'))src.unshift({key:'basicElement',value:form.element});
 form.fixedEffects=src.map(normalizeFixedEquipmentEffect).filter(Boolean).slice(0,5);
 if(!form.fixedEffects.length)form.fixedEffects=[{key:'flatAttack',value:0}];
 for(const key of ['atk','hp','def','mp','mpRegen','crit','critDamage','pierce','lifesteal','evasion','elementBonus','defenseIgnore','element','exclusive'])delete form[key];
 return form;
}
function normalizeAllEquipmentForms(){
  for(const jobs of ITEM_FORMS)for(const forms of jobs)for(const form of forms)normalizeEquipmentFormObject(form);
}
normalizeAllEquipmentForms();
delete EXTRA_AFFIX_NAMES[10];
delete EXTRA_AFFIX_NAMES[11];

// A boss item has its own identity. Its hidden random normal form must not grant effects.
itemForm=function(g){const group=equipmentFormGroup(g);return g&&g.boss===undefined&&Number.isInteger(g.form)?ITEM_FORMS[group]?.[g.slot]?.[g.form]||null:null;};

// Generic job-based armor profiles were another hidden equipment stat source. Remove them.
armorProfile=function(){return null;};

function convertLegacyManaAffix(a,g){
  if(!a||![10,11].includes(a.type))return a;
  const rank=Math.max(0,Math.min(3,Number(a.rank)||0)),tier=Math.max(1,Number(g?.tier)||1);
  const factor=a.type===10?(1+.35*rank):(.7+.3*rank);
  return {type:0,rank,value:Math.max(1,Math.round(tier*factor))};
}
function migrateEquipmentManaAffixes(list){
  if(!Array.isArray(list))return;
  for(const g of list){
    if(!g||!Array.isArray(g.affix))continue;
    g.affix=g.affix.map(a=>convertLegacyManaAffix(a,g));
  }
}
function migrateCurrentEquipmentMana(){
  if(state?.bag)migrateEquipmentManaAffixes(state.bag);
  if(typeof inlineAffixDrafts!=='undefined')for(const [key,list] of inlineAffixDrafts){
    const id=String(key).replace(/^shared:/,''),g=state?.bag?.find(x=>x.id===id);
    inlineAffixDrafts.set(key,list.map(a=>convertLegacyManaAffix(a,g)));
  }
}

// New rolls cannot produce max-MP or MP-regen affixes.
rollAffixes=function(g){
  return oldAffixRoll(g).map(a=>{
    const cfg=GAME_BALANCE.affixes,key=balanceQualityKey(a.rank);
    if(Math.random()>cfg.extendedPoolChance)return a;
    const attackPct=Number(cfg.extendedValues.attackPercent[key])||0;
    const specialTypes=[6,7,8,9,12,13,14,...(a.rank>=2&&attackPct>0?[15]:[])];
    const type=specialTypes[rand(specialTypes.length)];
    const value=type===15?attackPct:type===6?cfg.extendedValues.critDamage[key]:type===7?cfg.extendedValues.pierce[key]:type===8?cfg.extendedValues.lifesteal[key]:type===9?cfg.extendedValues.evasion[key]:type===12?cfg.extendedValues.elementDamage[key]:type===13?cfg.extendedValues.raceDamage[key]:cfg.extendedValues.resist[key];
    const result={type,rank:a.rank,value};
    if(type===12||type===14)result.element=['fire','ice','wind','light','shadow'][rand(5)];
    if(type===13)result.race=Object.keys(RACES)[rand(6)];
    return result;
  });
};

const equipmentCleanupAffixLabel=affixLabel;
affixLabel=function(a,g){
  if(a?.type===10||a?.type===11){const migrated=convertLegacyManaAffix(a,g);return `攻擊 +${migrated.value}`;}
  return equipmentCleanupAffixLabel(a,g);
};

function exclusiveEquipmentStats(g){
  const form=itemForm(g),ex=form?.exclusive||{};
  return {form,ex};
}
function exclusiveEquipmentText(g){
  const {form,ex}=exclusiveEquipmentStats(g),parts=[];
  const basicElement=form?.fixedEffects?.find(e=>e?.key==='basicElement')?.value;
  if(basicElement&&basicElement!=='physical')parts.push(`此武器攻擊屬性 ${ELEMENTS[basicElement]}`);
  const addPct=(key,label)=>{const n=Number(ex[key]);if(Number.isFinite(n)&&n!==0)parts.push(`${label} ${n>0?'+':''}${n}%`);};
  addPct('gearAtkPct','此裝備基礎攻擊');
  addPct('gearHpPct','此裝備基礎生命');
  addPct('gearDefPct','此裝備基礎防禦');
  addPct('attackPct','攻擊力');
  addPct('crit','暴擊率');
  addPct('critDamage','暴擊傷害');
  addPct('pierce','防禦穿透');
  addPct('lifesteal','生命竊取');
  addPct('evasion','閃避率');
  addPct('elementBonus','全屬性增傷');
  return parts;
}

// Rebuild final stats from explicit sources only: character, base gear, affixes, then declared exclusive effects.
stats=function(h=state){
  const v=oldStats(h);
  Object.assign(v,{critDamage:1.5,pierce:0,lifesteal:0,evasion:0,elementBonus:0,elementDamage:{},raceDamage:{},resist:{}});
  let totalAttackPct=0;
  for(const g of equipment(h)){
    const base=gearBaseStats(g),{ex}=exclusiveEquipmentStats(g);
    if(ex.gearAtkPct)v.atk+=base.atk*ex.gearAtkPct/100;
    if(ex.gearHpPct)v.hp+=base.hp*ex.gearHpPct/100;
    if(ex.gearDefPct)v.def+=base.def*ex.gearDefPct/100;
    totalAttackPct+=Number(ex.attackPct)||0;
    if(ex.crit)v.crit+=(Number(ex.crit)||0)/100;
    for(const k of ['critDamage','pierce','lifesteal','evasion','elementBonus'])v[k]+=(Number(ex[k])||0)/100;
    for(const a0 of g.affix){
      const a=convertLegacyManaAffix(a0,g);
      if(a.type>=6&&a.type<=9)v[{6:'critDamage',7:'pierce',8:'lifesteal',9:'evasion'}[a.type]]+=a.value/100;
      else if(a.type===12)v.elementDamage[a.element]=(v.elementDamage[a.element]||0)+a.value/100;
      else if(a.type===13)v.raceDamage[a.race]=(v.raceDamage[a.race]||0)+a.value/100;
      else if(a.type===14)v.resist[a.element]=(v.resist[a.element]||0)+a.value/100;
      else if(a.type===15)totalAttackPct+=a.value;
    }
  }
  if(totalAttackPct)v.atk*=1+totalAttackPct/100;
  v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,v.crit);v.pierce=Math.min(GAME_BALANCE.combat.statCaps.pierce,v.pierce);v.evasion=Math.min(GAME_BALANCE.combat.statCaps.evasion,v.evasion);v.lifesteal=Math.min(GAME_BALANCE.combat.statCaps.lifesteal,v.lifesteal);
  v.speed=Math.round([102,108,116,96][h.job]+h.lv*.5+Math.min(5,(v.evasion||0)*10+(v.crit||0)*5));
  for(const k of ['hp','atk','def'])v[k]=Math.round(v[k]);
  return v;
};
solo.stats=stats;

// Base-stat text stays pure. Immutable extras are always separated and labeled.
gearDesc=function(g){
  const v=gearBaseStats(g),base=['atk','hp','def'].filter(k=>v[k]).map(k=>`${{atk:'攻擊',hp:'生命',def:'防禦'}[k]} +${Math.round(v[k])}`).join(' / ');
  const extras=exclusiveEquipmentText(g);
  return base+(extras.length?` / 專屬額外屬性（不可變更）：${extras.join('、')}`:'');
};

// Equipment comparison deliberately contains no MP / MP-regen rows.
equipmentComparison=function(h,g,position=null){
  const afterHero={...h,equipped:[...h.equipped]};while(afterHero.equipped.length<5)afterHero.equipped.push(null);const positions=gearEquipPositions(g);let target=Number.isInteger(position)&&positions.includes(position)?position:positions.find(p=>!afterHero.equipped[p]);if(target===undefined)target=positions[0];afterHero.equipped=afterHero.equipped.map(id=>id===g.id?null:id);afterHero.equipped[target]=g.id;
  const compare=()=>{
  const before=stats(h),after=stats(afterHero),rows=[];
  const labels={hp:'生命上限',atk:'攻擊力',def:'防禦力',crit:'暴擊率',critDamage:'暴擊傷害',pierce:'防禦穿透',defenseIgnore:'防禦無視',lifesteal:'生命竊取',evasion:'閃避率',elementBonus:'全屬性增傷',bossDamage:'BOSS 增傷',speed:'速度'};
  const percent=new Set(['crit','critDamage','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage']);
  function add(label,a,b,isPercent=false,lowerBetter=false){const factor=isPercent?100:1;a=Number(((a||0)*factor).toFixed(2));b=Number(((b||0)*factor).toFixed(2));if(a===b)return;const d=Number((b-a).toFixed(2));rows.push({label,before:a,after:b,delta:d,percent:isPercent,good:lowerBetter?d<0:d>0});}
  for(const [key,label] of Object.entries(labels))add(label,before[key],after[key],percent.has(key));
  for(const key of ['elementDamage','raceDamage','resist'])for(const type of new Set([...Object.keys(before[key]||{}),...Object.keys(after[key]||{})]))add((key==='raceDamage'?RACES[type]:ELEMENTS[type])+' '+({elementDamage:'傷害',raceDamage:'種族增傷',resist:'抗性'}[key]),before[key]?.[type],after[key]?.[type],true);
  for(let i=0;i<CLASSES[h.job].skills.length;i++){const skill=CLASSES[h.job].skills[i];if(!h.skills[i])continue;add(skill[0]+' 威力倍率',skillPower(i,h),skillPower(i,afterHero));if(skill[1]==='active')add(skill[0]+' 冷卻',skillCooldown(i,h),skillCooldown(i,afterHero),false,true);else add(skill[0]+' 觸發率',procChance(i,h),procChance(i,afterHero),true);}
  return rows;
  };
  // Compare current inventory values, even while combat uses its encounter snapshot.
  return globalThis.__EMBERWILD_TEAM_EQUIPMENT?.withLiveEquipment(compare)??compare();
};

// Test JSON accepts fixedEffects (1–5 rows) and transparently migrates legacy exclusive / mana / form fields.
validateBalanceConfig=function(input){
  const data=validateBalanceConfigCore(input),elements=new Set(Object.keys(ELEMENTS));
  data.equipmentForms.forEach((jobs,job)=>jobs.forEach((forms,slot)=>forms.forEach((form,i)=>{normalizeEquipmentFormObject(form);for(const key of Object.keys(form))if(!['id','name','wearableJobs','fixedEffects','textStyleId','mana'].includes(key))throw Error(`未知裝備欄位：${key}`);if(!Array.isArray(form.fixedEffects)||form.fixedEffects.length<1||form.fixedEffects.length>5)throw Error(`裝備固定屬性必須為 1～5 條：${job}-${slot}-${i}`);const wearJobs=Array.isArray(form.wearableJobs)?form.wearableJobs.filter(j=>Number.isInteger(j)&&j>=0&&j<data.classes.length):(job<data.classes.length?[job]:data.classes.map((_,j)=>j)),skillCount=wearJobs.reduce((max,j)=>Math.max(max,(data.classes[j]?.skills||[]).length),0);for(const [j,fx] of form.fixedEffects.entries()){if(!fx||!EQUIPMENT_FIXED_EFFECT_KEYS.has(fx.key))throw Error(`裝備固定屬性無效：${job}-${slot}-${i}-${j}`);if(fx.key==='basicElement'){if(!EQUIPMENT_EFFECT_ELEMENTS.has(fx.value))throw Error('裝備普通攻擊屬性無效');}else if(!Number.isFinite(fx.value))throw Error(`裝備固定屬性數值無效：${job}-${slot}-${i}-${j}`);if(['elementDamagePct','elementResistPct'].includes(fx.key)&&(!EQUIPMENT_EFFECT_ELEMENTS.has(fx.element)||fx.element==='physical'))throw Error('裝備固定屬性的元素目標無效');if(fx.key==='raceDamagePct'&&!EQUIPMENT_EFFECT_RACES.has(fx.race))throw Error('裝備固定屬性的種族目標無效');if(['skillEffectPct','skillCooldownReduction'].includes(fx.key)&&(!Number.isInteger(fx.skill)||fx.skill<0||fx.skill>=skillCount))throw Error('裝備固定屬性的技能目標無效');}})));
  return data;
};

const equipmentCleanupApplyBalanceConfig=applyBalanceConfig;
applyBalanceConfig=function(input,options={}){const result=equipmentCleanupApplyBalanceConfig(input,options);normalizeAllEquipmentForms();migrateCurrentEquipmentMana();if(state)render();return result;};
const equipmentCleanupExportableBalance=exportableBalance;
exportableBalance=function(){normalizeAllEquipmentForms();const data=equipmentCleanupExportableBalance();data.balance=cloneBalance(GAME_BALANCE);data._reference=balanceReference();data.notes=[...(data.notes||[]),'equipmentForms.fixedEffects 為每件基底裝備的 1～5 條固定屬性；武器攻擊屬性唯一來源為 basicElement。舊 element 僅在匯入時轉換為 basicElement，隨即移除。','主動技能同時受秒數冷卻、共同行動間隔與 MP 限制；equipmentForms.mana 可設定額外魔力、每秒恢復與消耗減免。已轉換的舊裝備能力維持原值。','balance.affixes 可直接調整品質機率、詞條倍率、攻擊%與洗鍊成本；_reference 僅為欄位說明。'];return data;};

const equipmentCleanupLoadParty=loadParty;
loadParty=function(data){const out=equipmentCleanupLoadParty(data);normalizeAllEquipmentForms();migrateCurrentEquipmentMana();return out;};

migrateCurrentEquipmentMana();

// Mana resource system removed: active skills are governed only by cooldowns.
// Legacy save/config fields are stripped after successful migration.
function stripLegacyManaState(){
  if(!party)return;
  for(const h of party.members){
    if(!globalThis.EmberwildSecondsCombat?.active)delete h.mp;
    if(h.consumables&&Object.prototype.hasOwnProperty.call(h.consumables,'mana'))delete h.consumables.mana;
  }
  if(party.sharedItems?.consumables&&Object.prototype.hasOwnProperty.call(party.sharedItems.consumables,'mana'))delete party.sharedItems.consumables.mana;
}
const noManaStats=stats;
stats=function(h=state){const v=noManaStats(h);delete v.mp;delete v.mpRegen;return v;};
solo.stats=stats;
skillManaCost=function(){return 0;};
refillParty=function(){for(const h of party.members){const v=stats(h);h.hp=v.hp;h.shield=0;}effects=[];};
const noManaLoadParty=loadParty;
loadParty=function(data){const out=noManaLoadParty(data);stripLegacyManaState();return out;};
const noManaPackParty=packParty;
packParty=function(){stripLegacyManaState();const data=noManaPackParty();for(const h of data.members||[]){if(!globalThis.EmberwildSecondsCombat?.active)delete h.mp;if(h.consumables)delete h.consumables.mana;}return data;};
const noManaRecruitHero=recruitHero;
recruitHero=function(job){const out=noManaRecruitHero(job);stripLegacyManaState();return out;};

stripLegacyManaState();
if(state){for(const h of party?.members||[state])withHero(h,clampVitals);save();render();}

// Update 12 final runtime hooks. These are deliberately last so every later compatibility layer uses the JSON settings.
need=function(l){return EmberwildProgression.requiredXp(GAMEPLAY_SETTINGS,l);};
initial=function(job){let g=gear(1,0,0,job);return migrate({version:1,job,lv:1,xp:0,gold:Math.round(GS('progression.starting.gold',150)),ore:Math.round(GS('progression.starting.ore',12)),dust:Math.round(GS('progression.starting.dust',0)),hp:CLASSES[job].hp,shield:0,map:0,advanced:false, skills:[1,0,0,0,0,0],active:[0,null],procSlots:[null,null],gems:Array(GEMS.length).fill(0),sockets:[null,null,null,null,null,null],bag:[g],equipped:[g.id,null,null,null,null],materials:{},kills:{},totalKills:0,tutorial:0,claimed:[],repeat:0,won:false,autoPotion:true,potions:Math.round(GS('progression.starting.potions',5)),discovered:[],created:Date.now()});};
solo.initial=initial;
levelCap=function(s=state){return s?.won?Math.floor(GS('progression.levelCaps.afterClear',60)):Math.floor(GS('progression.levelCaps.beforeClear',30));};
regionTier=function(mi){if(!MAPS[mi])return 1;return Math.max(1,Math.ceil(MAPS[mi].min/Math.max(1,GS('progression.regionTierLevels',5))));};
canVisit=function(mi,s=state){if(!s||!Number.isInteger(mi)||!MAPS[mi])return false;const before=Math.floor(GS('progression.levelCaps.beforeClear',30)),ahead=GS('progression.mapAheadAllowance',5),finalIndex=6;return mi===finalIndex?s.lv>=before:MAPS[mi].min>before?s.won&&MAPS[mi].min<=s.lv+ahead:MAPS[mi].min<=s.lv+ahead;};
skillCap=function(s=state){return Math.min(RULES.skillMax,Math.max(1,Math.floor(GS('skills.core.initialCap',2)))+Math.floor(s.lv/Math.max(1,GS('skills.core.capLevelsPerStep',3))));};

const update12BaseGear=gear;
gear=function(tier=1,slot=rand(4),rar=0,job=null){const owner=job??(state?(Math.random()<GS('equipment.lootOwnerSameJobChance',.75)?state.job:rand(CLASSES.length)):0),g=update12BaseGear(tier,slot,rar,owner);g.job=owner;return g;};

gearBaseStats=function(g){const f=(1+(g.plus||0)*GS('equipment.enhance.statPerLevel',.12))*bossPower(g),tier=g.tier,atkPer=g.slot===2?GS('equipment.baseStats.offhandAttackPerTier',GS('equipment.baseStats.accessoryAttackPerTier',4)):GS('equipment.baseStats.accessoryAttackPerTier',4),hpPer=g.slot===2?GS('equipment.baseStats.offhandHpPerTier',GS('equipment.baseStats.accessoryHpPerTier',20)):GS('equipment.baseStats.accessoryHpPerTier',20);return {atk:g.slot===0?tier*GS('equipment.baseStats.weaponAttackPerTier',11)*f:[2,3].includes(g.slot)?tier*atkPer*f:0,hp:g.slot===1?tier*GS('equipment.baseStats.armorHpPerTier',45)*f:[2,3].includes(g.slot)?tier*hpPer*f:0,def:g.slot===1?tier*GS('equipment.baseStats.armorDefensePerTier',4)*f:0};};
bossPower=function(g){const a=GS('equipment.boss.powerByDifficulty',[1,1.25,1.55]);return g.boss!==undefined?(a[g.difficulty||0]??1):1;};

stats=function(h=state){
  const c=CLASSES[h.job],natural=EmberwildProgression.naturalStats(c,h.lv),v={hp:natural.hp,atk:natural.atk,def:natural.def,crit:h.job===2?GS('progression.baseCrit.archer',.17):GS('progression.baseCrit.default',.07),critDamage:GS('combat.baseCritDamage',1.5),pierce:0,lifesteal:0,evasion:0,elementBonus:0,elementDamage:{},raceDamage:{},resist:{}};
  if(h.advanced){v.hp*=GS('progression.advance.hpMultiplier',1.18);v.atk*=GS('progression.advance.attackMultiplier',1.22);v.def*=GS('progression.advance.defenseMultiplier',1.15);}
  let totalAttackPct=0;
  for(const g of equipment(h)){
    const base=gearBaseStats(g),{ex}=exclusiveEquipmentStats(g);v.atk+=base.atk;v.hp+=base.hp;v.def+=base.def;
    if(ex.gearAtkPct)v.atk+=base.atk*ex.gearAtkPct/100;if(ex.gearHpPct)v.hp+=base.hp*ex.gearHpPct/100;if(ex.gearDefPct)v.def+=base.def*ex.gearDefPct/100;
    totalAttackPct+=Number(ex.attackPct)||0;if(ex.crit)v.crit+=(Number(ex.crit)||0)/100;for(const k of ['critDamage','pierce','lifesteal','evasion','elementBonus'])v[k]+=(Number(ex[k])||0)/100;
    for(const a0 of g.affix){const a=convertLegacyManaAffix(a0,g);if(a.type<=3){const key=['atk','hp','def','crit'][a.type];v[key]+=a.value/(key==='crit'?100:1);}else if(a.type>=6&&a.type<=9)v[{6:'critDamage',7:'pierce',8:'lifesteal',9:'evasion'}[a.type]]+=a.value/100;else if(a.type===12)v.elementDamage[a.element]=(v.elementDamage[a.element]||0)+a.value/100;else if(a.type===13)v.raceDamage[a.race]=(v.raceDamage[a.race]||0)+a.value/100;else if(a.type===14)v.resist[a.element]=(v.resist[a.element]||0)+a.value/100;else if(a.type===15)totalAttackPct+=a.value;}
  }
  if(totalAttackPct)v.atk*=1+totalAttackPct/100;v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,v.crit);v.pierce=Math.min(GAME_BALANCE.combat.statCaps.pierce,v.pierce);v.evasion=Math.min(GAME_BALANCE.combat.statCaps.evasion,v.evasion);v.lifesteal=Math.min(GAME_BALANCE.combat.statCaps.lifesteal,v.lifesteal);
  const heroBase=GS('combat.speed.heroBase',[102,108,116,96]);v.speed=Math.round((heroBase[h.job]??100)+h.lv*GS('combat.speed.heroPerLevel',.5)+Math.min(GS('combat.speed.bonusCap',5),(v.evasion||0)*GS('combat.speed.evasionWeight',10)+(v.crit||0)*GS('combat.speed.critWeight',5)));for(const k of ['hp','atk','def'])v[k]=Math.round(v[k]);return v;
};solo.stats=stats;

skillPower=function(i,h=state){const sk=CLASSES[h.job].skills[i],perLevel=Number.isFinite(sk?.[6]?.powerPerLevel)?sk[6].powerPerLevel:GS('skills.core.effectPerExtraLevel',.4);return (sk[4]+Math.max(0,(Number(h.skills[i])||0)-1)*perLevel)*(1+gemRate(h,i,0)+bonusFor(i,4,h)/100);};
skillCooldown=function(i,h=state){return Math.max(GAME_BALANCE.combat.minimumActiveCooldown,CLASSES[h.job].skills[i][3]-bonusFor(i,5,h));};
procChance=function(i,h=state){const meta=ensureProcSkillMeta(h.job,i);if(!meta)return 0;const level=Math.max(1,Number(h.skills[i])||1),gem=gemRate(h,i,2),affix=bonusFor(i,5,h)*(GAME_BALANCE.affixes.procChancePerPointPercent/100);return Math.min(GAME_BALANCE.combat.statCaps.crit,Math.max(0,meta.procBaseChance+(level-1)*meta.procChancePerLevel+gem+affix));};
supportAmount=function(job,index){const h=party.members.find(h=>h.job===job),sk=SUPPORT[job][index];return sk.value+Math.max(0,(Number(h.supportLevels[index])||0)-1)*(Number.isFinite(sk.effectPerLevel)?sk.effectPerLevel:GS('skills.support.effectPerExtraLevel',.2));};

claimTutorial=function(){const t=GAMEPLAY_SETTINGS.quests.tutorial;if(state.tutorial===0&&state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理再領取新手護甲');let ok=[state.totalKills>=t.killRequirement,state.bag.some(g=>g.plus>0),state.skills[0]>=t.skillLevelRequirement][state.tutorial];if(!ok)return;state.tutorial++;state.gold+=Math.round(t.rewardGold);state.ore+=Math.round(t.rewardOre);if(state.tutorial===1){addGear(gear(Math.max(1,Math.round(t.armorTier)),Math.max(0,Math.min(3,Math.round(t.armorSlot))),Math.max(0,Math.min(3,Math.round(t.armorQuality))),state.job));}save();render();toast('獲得 '+Math.round(t.rewardGold)+' 金幣與 '+Math.round(t.rewardOre)+' 鍛鐵');};
advance=function(){const a=GAMEPLAY_SETTINGS.progression.advance;if(state.advanced||state.lv<a.level)return;if(state.gold<a.gold||state.ore<a.ore||(state.materials['怨念碎片']||0)<a.materialCount)return toast('二轉資源不足');state.gold-=Math.round(a.gold);state.ore-=Math.round(a.ore);state.materials['怨念碎片']=(state.materials['怨念碎片']||0)-Math.round(a.materialCount);state.advanced=true;state.hp=stats().hp;save();render();toast('二轉完成，進階技能已開放！');};
awardXP=function(amount){if(state.lv>=levelCap())return;const grant=Math.max(0,Number(amount)||0);const total=(state.xpFraction||0)+grant;const integral=Math.floor(total+1e-10);state.xpFraction=Math.max(0,total-integral);state.xp+=integral;while(state.lv<levelCap()&&state.xp>=need(state.lv)){state.xp-=need(state.lv);state.lv++;state.hp=stats().hp;note(`升至 LV${state.lv}！`);}if(state.lv===levelCap()){state.xp=0;state.xpFraction=0;}};

makeBaseEnemy=function(map=state.map,h=state,rng=Math.random){const m=MAPS[map],f=GAMEPLAY_SETTINGS.monsters.finalBoss;if(map===6)return{name:m.boss[0],icon:m.boss[1],mat:m.boss[2],lv:Math.round(f.level),hp:Math.round(f.hp),maxhp:Math.round(f.hp),atk:Math.round(f.attack),def:Math.round(f.defense),kind:'final',turn:0};const ec=GAMEPLAY_SETTINGS.monsters.encounter,r=rng(),bossAllowed=m.max<=h.lv+GS('progression.mapAheadAllowance',5),kind=r<ec.bossChance&&bossAllowed?'boss':r<ec.bossChance+ec.eliteChance?'elite':'normal',mob=kind==='boss'?m.boss:m.mobs[Math.floor(rng()*m.mobs.length)],maxLv=Math.min(m.max,h.lv+GS('progression.mapAheadAllowance',5)),lv=kind==='boss'?m.max:m.min+Math.floor(rng()*Math.max(1,maxLv-m.min+1)),n=GAMEPLAY_SETTINGS.monsters.normal,k=GAMEPLAY_SETTINGS.monsters.kindMultipliers,hp=Math.round((n.hpBase+lv*n.hpPerLevel+lv*lv*n.hpQuadratic)*(kind==='boss'?k.bossHp:kind==='elite'?k.eliteHp:1)),atk=Math.round((n.attackBase+lv*n.attackPerLevel)*(kind==='boss'?k.bossAttack:kind==='elite'?k.eliteAttack:1));return{name:(kind==='elite'?'菁英・':'')+mob[0],icon:mob[1],mat:mob[2],lv,hp,maxhp:hp,atk,def:Math.round(lv*n.defensePerLevel),kind,turn:0};};
makeEnemy=function(mi=state.map,h=state,rng=Math.random){let e=makeBaseEnemy(mi,h,rng),mode=h.difficulty||0;Object.assign(e,EmberwildProgression.scaleMonsterStats(GAMEPLAY_SETTINGS,e.lv,e.kind,mode,e));e.maxhp=e.hp;e.difficulty=mode;e.region=mi;const meta=species.get(e.mat)||{element:'physical',race:'beast'};return {...e,...meta};};

modeAffixes=function(g,mode){if(mode===0)return;const c=GAMEPLAY_SETTINGS.equipment.difficultyAffix;g.difficulty=mode;g.name=gearName(g);if(g.affix.length||Math.random()<(mode===1?c.hardChance:c.hellChance)){g.affix=rollAffixes(g);const r=Math.random(),rank=mode===1?(r<c.hardFineThreshold?1:r<c.hardRareThreshold?2:3):(r<c.hellFineThreshold?1:r<c.hellRareThreshold?2:3);g.affix[0]=rollAffixFromPool(g,rank);}};
bossGear=function(mi,job=state.job,mode=state.difficulty||0){let family=regionFamily(mi),ranks=GS('equipment.boss.affixRankByDifficulty',[2,2,3]),g=gear(regionTier(mi),bossEquipmentSlot(family),mode===2?3:2,job);g.boss=family;g.region=mi;g.difficulty=mode;g.name=gearName(g);g.affix[0]={type:4,rank:ranks[mode]??2,skill:family,value:(GS('equipment.boss.skillEffectByDifficulty',[30,40,55])[mode]??30)};return g;};
craftBoss=function(mi,job=state.job){if(!Number.isInteger(job)||!CLASSES[job]||mi===6||!canVisit(mi))return;let mode=state.difficulty||0,mat=bossMaterial(mi,mode),cost=Math.round(regionTier(mi)*GS('equipment.boss.craftGoldPerTier',250)*(mode+1)),needMat=Math.max(0,Math.round(GS('equipment.boss.craftMaterialCount',5)));if(state.lv<MAPS[mi].min||state.gold<cost||(state.materials[mat]||0)<needMat)return toast('等級、金幣或對應難度的 BOSS 素材不足');if(state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理再製作');state.gold-=cost;state.materials[mat]=(state.materials[mat]||0)-needMat;addGear(bossGear(mi,job,mode));save();render();toast('已製作'+MODES[mode].name+' BOSS 專屬裝備');};

upgradeMaterials=function(g){const next=g.plus+1,e=GAMEPLAY_SETTINGS.equipment.enhance,dust=next>=e.dustStartLevel?g.tier*Math.max(0,next-e.dustStartLevel+1)*e.dustPerTierPerLevelAboveStart:0,ether=next>=e.etherStartLevel?e.etherCost:0;return {ore:Math.max(0,Math.round(g.tier*next*e.orePerTierPerLevel)),dust:Math.max(0,Math.round(dust)),ether:Math.max(0,Math.round(ether))};};
enhanceCost=function(g){return upgradeMaterials(g).ore;};
canEnhance=function(g){const c=upgradeMaterials(g);return g.plus<RULES.enhanceMax&&state.ore>=c.ore&&state.dust>=c.dust&&(state.materials['以太鍛鐵']||0)>=c.ether;};
enhance=function(id){ensureBoard();const g=findGear(id);if(!g||g.plus>=RULES.enhanceMax)return;if(!canEnhance(g))return toast('材料不足：'+upgradeCostText(g));const c=upgradeMaterials(g),ether=state.materials['以太鍛鐵']||0;state.ore-=c.ore;state.dust-=c.dust;if(c.ether)state.materials['以太鍛鐵']=ether-c.ether;const oldProgress=party?.progressStats?JSON.parse(JSON.stringify(party.progressStats)):null,oldBoard=JSON.parse(JSON.stringify(playerHero().board));g.plus++;globalThis.recordEnhancement?.(g.plus);if(!save()){if(oldProgress)party.progressStats=oldProgress;playerHero().board=oldBoard;g.plus--;state.ore+=c.ore;state.dust+=c.dust;if(c.ether)state.materials['以太鍛鐵']=ether;return;}render();toast('已強化至 +'+g.plus);};

function update12SalvageRewards(g,includeEnhance=true){const q=gearQualityRank(g),c=GAMEPLAY_SETTINGS.equipment.salvage;return {ore:Math.max(0,Math.round(g.tier*(c.oreBasePerTier+q*c.orePerQualityPerTier+(includeEnhance?(g.plus||0)*c.orePerEnhancePerTier:0)))),dust:Math.max(0,Math.round(c.dustBase+q*c.dustPerQuality))};}
salvage=function(id){const g=findGear(id);if(!g||g.locked||gearWearer(g.id)||inlineAffixDrafts.has(affixDraftKey(g)))return;const r=update12SalvageRewards(g,true);state.ore+=r.ore;state.dust+=r.dust;state.bag=state.bag.filter(x=>x.id!==id);pruneGearSelections();save();render();};
confirmMassSalvage=function(){if(!massSalvageIds)return;const items=massSalvageTargets(massSalvageIds),ids=new Set(items.map(g=>g.id)),bag=state.bag,ore=state.ore,dust=state.dust;for(const g of items){const r=update12SalvageRewards(g,true);state.ore+=r.ore;state.dust+=r.dust;}state.bag=state.bag.filter(g=>!ids.has(g.id));if(!save()){state.bag=bag;state.ore=ore;state.dust=dust;return;}massSalvageIds=null;pruneGearSelections();closeModal();render();toast('已分解 '+items.length+' 件裝備');};
salvageAll=function(){const targets=state.bag.filter(g=>gearQualityRank(g)===0&&(g.plus||0)===0&&!g.affix.length&&g.boss===undefined&&!state.equipped.includes(g.id)&&!g.locked),ids=new Set(targets.map(g=>g.id));for(const g of targets){const r=update12SalvageRewards(g,false);state.ore+=r.ore;state.dust+=r.dust;}state.bag=state.bag.filter(g=>!ids.has(g.id));pruneGearSelections();save();render();toast(`已分解 ${ids.size} 件未養成普通裝備`);};
addGear=function(g){
  if(!g)return;
  g.acquiredAt??=Date.now();
  const q=gearQualityRank(g);
  // This late module replaces core addGear. It must use the same overflow
  // contract: never append beyond capacity, salvage only the new drop, and
  // keep exploration running. The old implementation appended then stopped.
  if(state.bag.length>=RULES.bagCapacity){
    state.ore+=g.tier*(3+q*2);
    state.dust+=1+q;
    note('背包已滿，掉落裝備自動分解。','item');
    return;
  }
  state.bag.push(g);
  note(`獲得 ${AFFIX_RANK[q]} ${equipmentDisplayName(g)}${g.boss!==undefined?'（BOSS 專屬）':''}`,'item');
};

combatSpeed=function(e){const s=GAMEPLAY_SETTINGS.combat.speed;return Math.round(s.enemyBase+e.lv*s.enemyPerLevel+(s.race[e.race]||0)+(s.kind[e.kind]||0)+(e.difficulty||0)*s.difficultyBonus);};
resolveHit=function(e,amount,h,element,crit){const v=battleStats(h),cap=GAMEPLAY_SETTINGS.combat.caps,def=e.def*(1-Math.min(cap.fracture,effectTotal(e.id,'fracture')))*(1-v.pierce);let d=Math.max(1,Math.round(amount-def*GS('combat.defenseEffectiveness',.65)));if(crit)d=Math.round(d*v.critDamage);const tonic=activeSupply(h,'elementTonic'),bonus=(v.elementDamage[element]||0)+(element==='physical'?0:v.elementBonus)+(tonic&&tonic.element===element?GS('combat.supply.elementTonicDamage',.2):0);d=Math.max(1,Math.round(d*elementFactor(element,e.element)*(1+bonus)*(1+(v.raceDamage[e.race]||0))*(1+effectTotal(e.id,'vulnerable'))));const actual=Math.min(e.hp,d);e.hp=Math.max(0,e.hp-d);h.hp=Math.min(v.hp,h.hp+actual*v.lifesteal);return actual;};
performEnemyBasic=function(e){e.turn++;const targets=living(),h=targets[rand(targets.length)],v=battleStats(h),c=GAMEPLAY_SETTINGS.combat,fb=c.finalBoss,multi=e.kind==='final'?(e.turn>fb.enrageAfterTurn?fb.enrageMultiplier:e.turn%Math.max(1,Math.round(fb.specialEveryTurns))===0?fb.specialMultiplier:1):1+Math.max(0,e.lv-h.lv)*c.levelGapDamagePerLevel;let hit=Math.max(1,Math.round(e.atk*(1-Math.min(c.caps.weaken,effectTotal(e.id,'weaken')))*multi-v.def*c.defenseEffectiveness));hit=Math.max(1,Math.round(hit*(1-Math.min(c.caps.guard,effectTotal(heroKey(h),'guard')))));if(Math.random()<v.evasion){note(characterName(h)+'閃避了'+e.name+'的攻擊');return;}const ward=activeSupply(h,'ward'),resist=Math.min(c.caps.resistance,(v.resist[e.element]||0)+(ward&&ward.element===e.element?c.supply.wardResistance:0));hit=Math.max(1,Math.round(hit*(1-resist)));const absorb=Math.min(h.shield,hit);h.shield-=absorb;if(absorb>0)recordCombatContribution(h,'mitigation',absorb);const hpDamage=Math.max(0,hit-absorb);h.hp=Math.max(0,h.hp-hpDamage);if(absorb>0&&hpDamage===0)note(e.name+' → '+characterName(h)+' 的護盾 '+absorb+' 傷害（剩餘 '+Math.round(h.shield)+'）');else note(e.name+' → '+characterName(h)+' '+hpDamage+' 傷害'+(absorb?`（護盾吸收 ${absorb}，剩餘 ${Math.round(h.shield)}）`:''));};
spawnGroup=function(){const weak=[...heroes()].sort((a,b)=>a.lv-b.lv)[0],g=GAMEPLAY_SETTINGS.combat.groupSize,min=Math.max(1,Math.round(g.min)),max=Math.max(min,Math.round(g.max)),n=min+rand(max-min+1);foes=[];effects=[];actorCooldowns={};supportCooldowns={};for(const h of heroes())h.shield=0;for(let i=0;i<n;i++){const mi=party.map===6&&i>0?5:party.map,e=makeEnemy(mi,weak);e.id='foe-'+uid();e.rewarded=false;foes.push(e);}enemy=foes[0];round=0;note('遭遇 '+foes.length+' 隻敵人。');};

tick=function(){if(!party||!running||$('modal').open)return;const now=Date.now();if(now<nextActionAt)return;if(!roundIterator){roundIterator=pacedRound();roundStartedAt=now;}const step=roundIterator.next(),actionMs=Math.max(0,GS('combat.pacing.actionIntervalMs',900)),roundMs=Math.max(actionMs,GS('combat.pacing.roundMinimumMs',6000));if(step.done){roundIterator=null;nextActionAt=Math.max(now+actionMs/battleRate,roundStartedAt+roundMs/battleRate);}else{nextActionAt=now+actionMs/battleRate;if(tab==='battle')render();}if(tab!=='battle')refreshGlobalJournal();};

potion=function(quiet=false){if(state.potions<1)return;let v=stats();if(state.hp>=v.hp)return;state.potions--;const f=GS('quests.potion.healFraction',.45);state.hp=Math.min(v.hp,state.hp+v.hp*f);note('使用治療藥水，恢復 '+Math.round(f*10000)/100+'% 生命。');if(!quiet){save();render();}};
buyPotion=function(){const c=Math.max(0,Math.round(GS('quests.potion.buyCost',75))),q=Math.max(1,Math.round(GS('quests.potion.buyQuantity',5)));if(state.gold<c)return toast('金幣不足');state.gold-=c;state.potions+=q;save();render();};
radiantDropChance=function(kind){return kind==='boss'||kind==='final'?GS('rewards.radiant.bossFinal',.01):kind==='normal'||kind==='elite'?GS('rewards.radiant.normalElite',.0005):0;};
etherDropChance=function(e){const c=GAMEPLAY_SETTINGS.rewards.ether;if(e.kind==='elite')return Math.min(c.eliteCap,c.eliteBase+c.elitePerTier*(regionTier(e.region??party.map)-1));if(e.kind==='boss'||e.kind==='final')return c.bossRepeat;return 0;};
awardEther=function(e){if(!party)return;let n=0;const c=GAMEPLAY_SETTINGS.rewards.ether,boss=e.kind==='boss'||e.kind==='final',key=(e.region??party.map)+':'+(e.difficulty||0);party.etherBossClaims??=[];if(boss&&!party.etherBossClaims.includes(key)){const min=Math.round(c.firstBossMin),max=Math.max(min,Math.round(c.firstBossMax));n=min+rand(max-min+1);party.etherBossClaims.push(key);}else {const factor=e.kind==='elite'?generalDropLevelGapFactor({type:'material'},e):1;if(Math.random()<etherDropChance(e)*factor)n=1;}if(n){state.materials['以太鍛鐵']=(state.materials['以太鍛鐵']||0)+n;note('獲得以太鍛鐵 ×'+n,'item');}};

victory=function(){let e=enemy;if(!e)return;lastDefeatedEnemy={...e};let mode=e.difficulty||0,d=MODES[mode],mi=e.region??state.map,tier=regionTier(mi),kindIndex=e.kind==='normal'?0:e.kind==='elite'?1:2,r=GAMEPLAY_SETTINGS.rewards,mult=[r.kindMultiplier.normal,r.kindMultiplier.elite,r.kindMultiplier.boss][kindIndex],firstClear=e.kind==='final'&&!state.won;state.totalKills++;state.kills[e.mat]=(state.kills[e.mat]||0)+1;if(!state.discovered.includes(e.mat))state.discovered.push(e.mat);let gold=Math.round((r.gold.base+e.lv*r.gold.perLevel)*mult*d.xp),xp=EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,e.lv,e.kind,mode,party?.members?.[0]?.lv??state?.lv);state.gold+=gold;state.ore+=Math.ceil(tier*(kindIndex===0?r.ore.normalKindMultiplier:r.ore.eliteBossKindMultiplier)*d.ore);if(Math.random()<(GAMEPLAY_SETTINGS.difficulty.materialChance[mode]??0)||kindIndex>0){let mat=e.kind==='boss'?bossMaterial(mi,mode):e.mat;state.materials[mat]=(state.materials[mat]||0)+1;note('獲得 '+mat+' ×1');}if(Math.random()<d.equip[kindIndex]){let g=gear(tier,rand(4),Math.random()<r.equipmentQuality.rareChance?2:Math.random()<r.equipmentQuality.fineConditionalChance?1:0);modeAffixes(g,mode);addGear(g);}if(Math.random()<d.rare){let g=gear(tier,rand(4),3);modeAffixes(g,mode);addGear(g);}if(e.kind==='boss'&&mi!==6&&Math.random()<d.boss)addGear(bossGear(mi,state.job,mode));if(Math.random()<d.gem[kindIndex]){let i=rand(3);state.gems[i]++;note('獲得 '+GEMS[i].name);}awardEther(e);if(Math.random()<r.potionDropChance)state.potions++;if(Math.random()<radiantDropChance(e.kind)){state.materials['光輝碎塊']=(state.materials['光輝碎塊']||0)+1;note('獲得極稀有道具：光輝碎塊 ×1');}if(e.kind==='final'){state.won=true;state.modeClears[mode]++;state.materials['日蝕王冠']=1;running=false;}awardXP(xp);state.hp=Math.min(stats().hp,state.hp+stats().hp*r.postVictoryHeal);state.shield=0;note(`擊敗 ${e.name}（${d.name}）· +${xp} EXP、${gold} 金幣`);enemy=null;if(e.kind==='final'){$('modal').innerHTML=`<h1>${firstClear?'等級界限已突破':'再次戰勝噬日者'}</h1><p>${d.name}模式通關。${firstClear?'等級上限提升。':'可繼續探索或挑戰更高難度。'}</p><button class="primary" onclick="closeModal()">繼續旅程</button>`;$('modal').showModal();}save();};solo.victory=victory;
rewardGroupKill=function(e){
  if(e.rewarded)return;e.rewarded=true;
  const members=heroes(),receiver=members[rand(members.length)],isFinal=e.kind==='final',xp=EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,e.lv,e.kind,e.difficulty||0,party?.members?.[0]?.lv??state?.lv),hp=receiver.hp,shield=receiver.shield;
  const oldAward=awardXP;awardXP=()=>{};enemy=e;partyBusy=true;
  try{withHero(receiver,()=>solo.victory());}finally{awardXP=oldAward;partyBusy=false;receiver.hp=hp;receiver.shield=shield;}
  if(isFinal){party.cleared=true;closeModal();running=true;}
  for(const h of members){if(h!==receiver){if(isFinal)h.modeClears[e.difficulty]++;h.totalKills++;h.kills[e.mat]=(h.kills[e.mat]||0)+1;if(!h.discovered.includes(e.mat))h.discovered.push(e.mat);}}
  // Preserve the existing per-character EXP rate, and settle it once to the player
  // even when the player is in reserve. All companion levels follow that player.
  syncParty();
  withHero(party.members[0],()=>awardXP(EmberwildProgression.xpShare(xp,members.length)));
  syncParty();enemy=foes.find(x=>x.hp>0)||null;
};

claimQuest=function(id){let q=QUESTS.find(q=>q.id===id),idx=QUESTS.indexOf(q),cfg=GAMEPLAY_SETTINGS.quests.side[idx];if(!q||state.claimed.includes(id)||(state.materials[q.mat]||0)<q.n)return;state.materials[q.mat]-=q.n;state.gold+=q.gold;state.ore+=q.ore;for(let i=0;i<Math.max(0,Math.round(cfg?.gem??1));i++)state.gems[rand(3)]++;state.claimed.push(id);save();render();toast('委託完成，已領取獎勵');};
claimRepeat=function(){const mi=questRegion(),mat=MAPS[mi].mobs[0][2],q=GAMEPLAY_SETTINGS.quests.repeat,need=Math.max(1,Math.round(q.required));if((state.materials[mat]||0)<need)return;state.materials[mat]-=need;state.gold+=Math.round(regionTier(mi)*q.goldPerTier);state.ore+=Math.round(q.ore);state.dust+=Math.round(q.dust);for(let i=0;i<Math.max(0,Math.round(q.gem));i++)state.gems[rand(3)]++;state.repeat++;save();render();};
boardRefreshCost=function(){return Math.round(regionTier(questRegion())*GS('quests.board.refreshGoldPerTier',150));};
buildBoard=function(s=state){let mi=s.map===6?5:s.map,m=MAPS[mi],b=GAMEPLAY_SETTINGS.quests.board;s.board.serial++;s.board.next=Date.now()+BOARD_INTERVAL;s.board.tasks=m.mobs.slice(0,3).map((mob,i)=>({id:uid(),map:mi,mat:mob[2],n:Math.max(1,Math.round(b.taskBase+rand(Math.max(1,Math.round(b.taskRandomRange)))+(regionTier(mi)-1)*b.taskPerTier)),kind:i===2?'gear':'gem',gem:rand(3),slot:rand(4),rar:Math.random()<b.legendaryGearChance?3:2,done:false}));};
claimBoard=function(id){ensureBoard();let q=state.board.tasks.find(q=>q.id===id),b=GAMEPLAY_SETTINGS.quests.board;if(!q||q.done||(state.materials[q.mat]||0)<q.n)return;if(q.kind==='gear'&&state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理再領取裝備獎勵');state.materials[q.mat]-=q.n;q.done=true;state.gold+=Math.round(regionTier(q.map)*b.goldPerTier);state.ore+=Math.round(regionTier(q.map)*b.orePerTier);if(q.kind==='gear')addGear(gear(regionTier(q.map),q.slot,q.rar,q.job??rand(4)));else state.gems[q.gem]+=Math.round(b.gemReward);state.repeat++;save();render();toast('委託完成，獎勵已放入背包');};

generateMarket=function(){const m=GAMEPLAY_SETTINGS.quests.market,serial=(party.market?.serial||0)+1,tier=regionTier(party.map===6?5:party.map),pool=MAPS[party.map===6?5:party.map].mobs,count=Math.max(1,Math.round(m.offerCount));return {serial,offers:Array.from({length:count},(_,i)=>{const kind=i===0?'ore':i===1?'dust':i===2?'gem':['ore','dust','gem','material'][rand(4)],key=kind==='gem'?String(rand(3)):kind==='material'?pool[rand(pool.length)][2]:'',qty=kind==='ore'?(Math.round(m.oreMin)+rand(Math.max(1,Math.round(m.oreRandomRange))))*tier:kind==='dust'?Math.round(m.dustMin)+rand(Math.max(1,Math.round(m.dustRandomRange))):kind==='gem'?Math.round(m.gemMin)+rand(Math.max(1,Math.round(m.gemRandomRange))):Math.round(m.materialMin)+rand(Math.max(1,Math.round(m.materialRandomRange))),unit=kind==='ore'?m.oreUnit:kind==='dust'?m.dustUnit:kind==='gem'?m.gemUnit:m.materialUnitPerTier*tier;return {id:serial+'-'+i,kind,key,qty,price:Math.round(qty*unit),sold:false};})};};
refreshMarket=function(){ensureMarket();if(state.gold<MARKET_REFRESH_COST)return toast('刷新需要 '+MARKET_REFRESH_COST+' 金幣');const old=party.market;state.gold-=MARKET_REFRESH_COST;party.market=generateMarket();if(!save()){party.market=old;state.gold+=MARKET_REFRESH_COST;return;}render();toast('素材商品已刷新');};

supplyDetail=function(item){const effect=item.type==='imbue'?`普通攻擊轉為${ELEMENTS[item.element]}屬性`:item.type==='ward'?`${ELEMENTS[item.element]}屬性傷害減少 ${Math.round(GS('combat.supply.wardResistance',.25)*10000)/100}%`:item.type==='elementTonic'?`${ELEMENTS[item.element]}屬性傷害增加 ${Math.round(GS('combat.supply.elementTonicDamage',.2)*10000)/100}%`:'依道具效果生效';return `${effect} · ${item.duration?`持續 ${item.duration} 回合`:'立即生效'} · 單價 ${item.cost} 金幣`;};

// Later wrappers replaced validation/reset after the first Update 12 hook; restore normalization here.
const update12FinalValidate=validateBalanceConfig;
validateBalanceConfig=function(input){const copy=JSON.parse(JSON.stringify(input));copy.balanceSettings=normalizeGameplaySettings(copy.balanceSettings);const out=update12FinalValidate(copy);out.balanceSettings=copy.balanceSettings;return out;};
const UPDATE12_DEFAULT_BALANCE=JSON.parse(JSON.stringify(typeof UPDATE11_DEFAULT_BALANCE!=='undefined'?UPDATE11_DEFAULT_BALANCE:exportableBalance()));
UPDATE12_DEFAULT_BALANCE.balanceSettings=cloneGameplaySettings(GAMEPLAY_SETTINGS_DEFAULTS);
resetBalanceJSON=function(){localStorage.removeItem(BALANCE_KEY);applyBalanceConfig(UPDATE12_DEFAULT_BALANCE,{persist:false});toast('已恢復 HTML 內建預設設定');};

// Re-apply the saved balance once after all compatibility layers exist, so balanceSettings also controls this session.
try{const raw=balanceSourceText();if(raw)applyBalanceConfig(JSON.parse(raw),{persist:false});else{GAMEPLAY_SETTINGS=normalizeGameplaySettings();globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();}}catch(e){console.warn('擴充平衡設定載入失敗，使用預設值',e);GAMEPLAY_SETTINGS=normalizeGameplaySettings();globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();}
if(state){for(const h of party?.members||[state])withHero(h,clampVitals);render();}


// Update 12 display consistency: controls and summaries show the live balance settings.
tutorial=function(){if(state.tutorial>=3)return '';const t=GAMEPLAY_SETTINGS.quests.tutorial,texts=[['01 / 初次狩獵',`在苔光林地開始自動探索，擊敗 ${Math.round(t.killRequirement)} 隻怪物。`,state.totalKills>=t.killRequirement],['02 / 整理行囊','前往「裝備強化」，將任一裝備強化一次。',state.bag.some(g=>g.plus>0)],['03 / 學習技能',`前往「技能」，將初始主動技能提升至 ${Math.round(t.skillLevelRequirement)} 級。`,state.skills[0]>=t.skillLevelRequirement]][state.tutorial];return `<div class="tutorial"><div><b>${texts[0]}</b><p>${texts[1]}</p></div><button ${texts[2]?'':'disabled'} onclick="claimTutorial()">領取獎勵</button></div>`;};

const update12CharacterViewBase=characterView;
characterView=function(){let html=update12CharacterViewBase(),a=GAMEPLAY_SETTINGS.progression.advance;html=html.replace(/LV15 ·/g,`LV${a.level} ·`).replace(/進階後生命 \+18%、攻擊 \+22%、防禦 \+15%/g,`進階後生命 +${Math.round((a.hpMultiplier-1)*10000)/100}%、攻擊 +${Math.round((a.attackMultiplier-1)*10000)/100}%、防禦 +${Math.round((a.defenseMultiplier-1)*10000)/100}%`).replace(/需求：LV15、500 金幣、20 鍛鐵、怨念碎片 ×3/g,`需求：LV${a.level}、${a.gold} 金幣、${a.ore} 鍛鐵、怨念碎片 ×${a.materialCount}`);return html;};

const update12ForgeViewBase=forgeView;
forgeView=function(){return update12ForgeViewBase().replace(/最高 \+10/g,'最高 +'+RULES.enhanceMax).replace(/已達 \+10 強化上限/g,'已達 +'+RULES.enhanceMax+' 強化上限');};
const update12InlineInventoryBase=inlineInventoryView;
inlineInventoryView=function(){return update12InlineInventoryBase().replace(/已達 \+10/g,'已達 +'+RULES.enhanceMax);};

shopView=function(){ensureMarket();const h=pageHero('shop'),pc=Math.round(GS('quests.potion.buyCost',75)),pq=Math.round(GS('quests.potion.buyQuantity',5));return `<div class="actions"><button onclick="showTestCodes()">兌換碼</button></div>`+heading('SUPPLIES / 全隊共用','商店')+pageSelector('shop')+`<section class="panel shared-shop-info"><b>道具使用對象：${esc(characterName(h))} · ${h.gold} 金幣</b>${uiHelp('補給說明','購買扣除帳號金幣，使用效果只施加到選取角色。附魔、抗性、增幅各保留一種；同類覆蓋，不同類可並存。消耗品效果以戰鬥回合計時；只有角色出戰的實際戰鬥回合會扣減，暫停或關閉遊戲不會消耗回合。')}<div class="actions">${ownerControls(`<button onclick="buyPotion()" ${h.gold<pc?'disabled':''}>治療藥水 +${pq}／${pc} 金幣</button><button onclick="potion()" ${h.potions<1?'disabled':''}>使用治療藥水（共用 ${h.potions}）</button>`,h.job)}</div><p class="supply-countdown" data-job="${h.job}">${supplyStatus(h)||'目前無消耗品效果'}</p></section><div class="actions market-refresh"><span>素材商品 · 第 ${party.market.serial} 批</span><button onclick="refreshMarket()">刷新商店 · ${MARKET_REFRESH_COST} 金幣</button></div><div class="shared-shop-grid">${marketCards()}${SHOP.map(item=>`<article class="card"><h3>${esc(item.name)}</h3><p class="item-flavor"><b>說明：</b>${esc(item.description||item.desc||'')}</p><p class="item-detail small"><b>詳細：</b>${esc(supplyDetail(item))}</p><div class="row"><span>共用 ${h.consumables[item.id]||0} 瓶</span><span>${item.cost} 金幣</span></div><div class="actions">${ownerControls(`<button onclick="buySupply('${item.id}')" ${h.gold<item.cost?'disabled':''}>購買</button><button onclick="useSupply('${item.id}')" ${!h.consumables[item.id]?'disabled':''}>對${esc(characterName(h))}使用</button>`,h.job)}</div></article>`).join('')}</div>`;};

// Keep the sidebar and guide from displaying stale default values.
const update12RenderBase=render;
render=function(){update12RenderBase();if(!state)return;const after=GS('progression.levelCaps.afterClear',60),before=GS('progression.levelCaps.beforeClear',30);document.querySelectorAll('.aside-foot .gold').forEach(el=>{el.textContent=state.won?' 已突破 · 上限 LV'+after:'LV'+before+' · 挑戰噬日者';});};

guideView=function(){
 const g=GAMEPLAY_SETTINGS,p=g.progression,e=g.equipment,c=g.combat,x=p.xpLevelGap,drop=e.dropLevelGap;
 const xpHint=x?.enabled?`<p>挑戰低等怪物時，高於怪物 ${x.freeLevels} 級以內仍可獲得完整經驗；高出 ${x.midGap} 級時剩 ${Math.round(x.midMultiplier*100)}%、高出 ${x.highGap} 級時剩 ${Math.round(x.highMultiplier*100)}%，高出 ${x.highGap+1} 級以上剩 ${Math.round(x.minimumMultiplier*100)}%。中間等級差逐級遞減，BOSS 也適用。</p>`:'';
 const dropHint=drop?.enabled?`<p>角色高於地圖最高等級 ${drop.freeLevels} 級後，普通怪與菁英怪的裝備掉落率會逐漸降低，最低為基礎掉落率的 ${Math.round(drop.minimumMultiplier*100)}%。素材與 BOSS 裝備不受這項限制。</p>`:'';
 return heading('FIELD NOTES / 冒險指南','遊戲系統說明')+`<section class="panel guide-scroll">
 <h2>角色成長與隊伍</h2>
 <p>主角透過探索獲得經驗並升級，夥伴等級與主角同步。最多三人出戰，其他夥伴可以留在候補。LV${p.advance.level} 可以二轉。擊敗界限突破首領後，等級上限由 LV${p.levelCaps.beforeClear} 提升至 LV${p.levelCaps.afterClear}。</p>
 <p>金幣、素材、消耗品與背包由隊伍共用；角色的技能與穿戴裝備則可分別設定。</p>
 <h2>探索與戰鬥</h2>
 <p>開始探索後會自動遭遇並攻擊怪物。普通探索的擊殺可累積地區 BOSS 挑戰進度。技能依裝備的技能槽與冷卻時間使用，普攻觸發技能須配置到觸發槽才會生效。火剋風、風剋冰、冰剋火，光與暗互相剋制。</p>
 <p>遭遇結束後全隊恢復生命；戰敗會停止探索並損失 ${Math.round(c.defeatGoldLoss*100)}% 金幣。暫停不會回復生命，停止探索則結束目前的掛機。</p>
 <h2>經驗與戰利品</h2>
 <p>怪物等級、種類與探索難度會影響獲得的經驗。經驗由出戰隊伍人數分配，再由主角累積並同步夥伴等級；經驗加倍券可額外提高收益。</p>
 ${xpHint}
 <p>裝備、素材與其他戰利品依怪物掉落表判定；擊敗怪物取得的裝備會直接放入背包。一般裝備掉率依探索難度不同，詳情可在怪物資訊查看。</p>
 ${dropHint}
 <h2>裝備與養成</h2>
 <p>裝備需符合職業及等級需求。背包最多持有 ${e.bagCapacity} 件裝備，可篩選、排序、鎖定及批次處理。強化最多 +${e.enhance.maxLevel}，能提升裝備能力；洗鍊可重新產生詞條，並選擇採用新結果或保留原詞條。BOSS 專屬裝備可使用對應素材製作。</p>
 <h2>任務與生活技能</h2>
 <p>主線、支線、NPC 任務與每日委託會依各自條件推進並提供獎勵。採集會按時間取得材料；煉金則依配方消耗材料製作道具。</p>
 <h2>存檔與離線探索</h2>
 <p>遊戲會自動保存進度，也可以匯出存檔備份或移轉裝置。探索進行中關閉網頁，重新進入後會補算離線期間完成的戰鬥與收益；暫停或停止探索的時間不會產生探索收益。</p>
 </section>`;
};

// Update 12 views whose original renderers captured old constants before the settings layer existed.
function update12BossMemberView(){
  const mode=state.difficulty||0,b=GAMEPLAY_SETTINGS.equipment.boss,rank=b.affixRankByDifficulty[mode]??2,power=b.powerByDifficulty[mode]??1,skillValue=b.skillEffectByDifficulty[mode]??30,needMat=Math.max(0,Math.round(b.craftMaterialCount));
  return heading('BOSS WORKSHOP / 首領製作',MODES[mode].name+'模式專屬裝備')+modePicker()+`<section class="panel">${resourceLine()}${uiHelp('製作說明',`此難度 BOSS 裝基礎能力 ×${power}、固定技能效果 +${skillValue}%；每件需要 ${needMat} 份對應難度素材。`)}</section><div class="cards boss-recipes">${MAPS.map((m,i)=>{if(i===6)return '';const family=regionFamily(i),tier=regionTier(i),g={job:state.job,slot:bossEquipmentSlot(family),tier,boss:family,region:i,difficulty:mode,rar:0,plus:0,affix:[{type:4,rank,skill:family,value:skillValue}]},mat=bossMaterial(i,mode),n=state.materials[mat]||0,cost=Math.round(tier*b.craftGoldPerTier*(mode+1)),ready=canVisit(i)&&state.lv>=m.min&&state.gold>=cost&&n>=needMat;return `<article class="card boss-recipe">${equipmentArt(g)}<span class="tag">${m.name}</span><h3>${equipmentNameHTML(g)}</h3><p class="small">${esc(characterName(state))} · LV${m.min} · ${AFFIX_RANK[rank]||'自訂'}</p><p class="effect-quality-${rank}">${CLASSES[state.job].skills[family]?.[0]||'技能'} 效果 +${skillValue}%</p><div class="recipe-cost"><span>${mat} ${n}/${needMat}</span><span>◈ ${cost}</span></div><button class="primary" onclick="craftBoss(${i})" ${ready?'':'disabled'}>${!canVisit(i)?'尚未解鎖':ready?'製作裝備':'等級／材料不足'}</button></article>`;}).join('')}</div>`;
}
bossCraftView=function(){return singlePagePanel('bossCraft','BOSS 裝備製作',update12BossMemberView);};

function update12QuestMemberView(){
  ensureBoard();const board=GAMEPLAY_SETTINGS.quests.board,repeat=GAMEPLAY_SETTINGS.quests.repeat,mi=questRegion(),m=MAPS[mi],repeatMat=m.mobs[0][2],mins=Math.max(1,Math.ceil((state.board.next-Date.now())/60000));
  const boardHtml=heading('COMMISSION BOARD / 委託看板','荒野的新委託',`<span class="tag">第 ${state.board.serial} 批</span>`)+`<section class="panel board-bar"><div><b>${mins} 分鐘內自動刷新</b><p class="small">每 ${board.refreshMinutes} 分鐘更換三張委託。刷新依目前地圖生成；切換地圖不會立即更換。</p></div><button onclick="refreshBoard()">立即刷新 · ${boardRefreshCost()}◈</button></section><div class="cards">${state.board.tasks.map(q=>`<article class="card"><span class="tag">${MAPS[q.map].name} · ${q.done?'已交付':'物資委託'}</span><h2 style="margin-top:16px">${q.mat}募集</h2>${q.kind==='gear'?equipmentArt({job:state.job,slot:q.slot,tier:regionTier(q.map)}):''}<p>${state.materials[q.mat]||0} / ${q.n} 份</p><p class="gold">${q.kind==='gear'?`${AFFIX_RANK[q.rar]||'裝備'}裝備 ×1`:`${GEMS[q.gem].name} ×${Math.round(board.gemReward)}`}</p><p class="small">另獲 ${Math.round(regionTier(q.map)*board.goldPerTier)} 金幣、${Math.round(regionTier(q.map)*board.orePerTier)} 鍛鐵</p><button class="primary" ${q.done||(state.materials[q.mat]||0)<q.n?'disabled':''} onclick="claimBoard('${q.id}')">${q.done?'已完成':'交付並領獎'}</button></article>`).join('')}</div>`;
  const sideHtml=`<h2 style="margin-top:28px">支線手札與常駐募集</h2><div class="cards">${QUESTS.map((q,i)=>{const cfg=GAMEPLAY_SETTINGS.quests.side[i]||{gem:1};return `<article class="card"><span class="tag">一次性支線</span><h2 style="margin-top:15px">${q.title}</h2><p>${q.desc}</p><p>${q.mat}　${state.materials[q.mat]||0} / ${q.n}</p><p class="gold">${q.gold} 金幣 · ${q.ore} 鍛鐵 · 隨機寶石 ×${Math.round(cfg.gem)}</p><button class="primary" onclick="claimQuest('${q.id}')" ${state.claimed.includes(q.id)||(state.materials[q.mat]||0)<q.n?'disabled':''}>${state.claimed.includes(q.id)?'已完成':'交付材料'}</button></article>`;}).join('')}<article class="card"><span class="tag">可重複 · ${m.name}</span><h2 style="margin-top:15px">營地物資募集</h2><p>收集本地常見怪物的材料。切換地圖後會更新募集品項。</p><p>${repeatMat}　${state.materials[repeatMat]||0} / ${Math.round(repeat.required)}</p><p class="gold">${Math.round(regionTier(mi)*repeat.goldPerTier)} 金幣 · ${Math.round(repeat.ore)} 鍛鐵 · ${Math.round(repeat.dust)} 粉塵 · 隨機寶石 ×${Math.round(repeat.gem)}</p><button class="primary" onclick="claimRepeat()" ${(state.materials[repeatMat]||0)<repeat.required?'disabled':''}>交付材料</button><p class="small">累計完成 ${state.repeat} 次</p></article></div>`;
  return boardHtml+sideHtml;
}
questView=function(){return singlePagePanel('quests','委託手札',update12QuestMemberView);};

// Correct the captured character renderer's advance button state when the threshold is changed.
const update12CharacterViewConsistency=characterView;
characterView=function(){let html=update12CharacterViewConsistency(),a=GAMEPLAY_SETTINGS.progression.advance;const disabled=state.advanced||state.lv<a.level?' disabled':'';html=html.replace(/<button class="primary" onclick="advance\(\)"[^>]*>/,`<button class="primary" onclick="advance()"${disabled}>`);return html;};

// The battle page was composed by earlier wrappers; replace only the stale balance-dependent supply text.
const update12BattleViewConsistency=battleView;
battleView=function(){let html=update12BattleViewConsistency(),pc=Math.round(GS('quests.potion.buyCost',75)),pq=Math.round(GS('quests.potion.buyQuantity',5)),th=Math.round(GS('combat.autoPotionThreshold',.35)*10000)/100;return html.replace(/\+\d+ 瓶／\d+ 金幣/g,`+${pq} 瓶／${pc} 金幣`).replace(/低於\d+(?:\.\d+)?%自動喝藥/g,`低於${th}%自動喝藥`);};

// Roaming equipment attenuation is data; all other loot retains the same rates.
(()=>{
 GAMEPLAY_SETTINGS_DEFAULTS.equipment.dropLevelGap={enabled:true,freeLevels:5,penaltyPerLevel:.4,minimumMultiplier:.05};
 const normalizeBase=normalizeGameplaySettings;normalizeGameplaySettings=function(input){const cfg=normalizeBase(input);cfg.equipment.dropLevelGap={enabled:true,freeLevels:5,penaltyPerLevel:.4,minimumMultiplier:.05,...input?.equipment?.dropLevelGap};return cfg;};
 const validateBase=validateGameplaySettings;validateGameplaySettings=function(input){const cfg=validateBase(input),v=cfg.equipment.dropLevelGap;if(typeof v.enabled!=='boolean'||!Number.isFinite(v.freeLevels)||v.freeLevels<0||!Number.isFinite(v.penaltyPerLevel)||v.penaltyPerLevel<0||!Number.isFinite(v.minimumMultiplier)||v.minimumMultiplier<0||v.minimumMultiplier>1)throw Error('裝備掉落等級差設定無效');return cfg;};
 GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);
})();
