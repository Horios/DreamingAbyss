
(()=>{
const clone=v=>JSON.parse(JSON.stringify(v));
const WEAPON_TYPE_LABELS={sword:'劍',axe:'斧',hammer:'槌',bow:'弓',crossbow:'弩',staff:'法杖',grimoire:'法書',prayerBook:'祈禱書',holyStaff:'聖杖'};
const WEAPON_TYPES=new Set(Object.keys(WEAPON_TYPE_LABELS));
const MASTERIES_BY_JOB=[
  ['sword','axe','hammer'],
  ['fire','ice','wind','shadow'],
  ['bow','crossbow'],
  ['light','shadow']
];
const MASTERY_LABELS={sword:'劍',axe:'斧',hammer:'槌',bow:'弓',crossbow:'弩',fire:'火',ice:'冰',wind:'風',light:'光',shadow:'暗'};
const SKILL_ICON_TYPES=new Set(['auto',...globalThis.__EMBERWILD_SKILL_ICONS.keys]);
let customSkillIcons=[];
const normalizeSkillIconType=(value,definitions=customSkillIcons)=>SKILL_ICON_TYPES.has(value)||globalThis.__EMBERWILD_SKILL_ICONS.isLucideReference(value)||typeof value==='string'&&value.startsWith('custom:')&&definitions.some(x=>x.id===value.slice(7))?value:'auto';
function validateSkillIconDefinitions(input){
  if(input===undefined)return [];
  if(!Array.isArray(input)||input.length>100)throw Error('自訂技能圖示數量無效');
  const ids=new Set(),tones=new Set(Object.keys(globalThis.__EMBERWILD_SKILL_ICONS.colors)),kinds=new Set(globalThis.__EMBERWILD_SKILL_ICONS.shapeKinds);
  for(const icon of input){
    if(!icon||typeof icon!=='object'||typeof icon.id!=='string'||!/^[-_a-z0-9]{1,40}$/.test(icon.id)||ids.has(icon.id)||typeof icon.name!=='string'||!icon.name.trim()||icon.name.length>40||!Array.isArray(icon.layers)||!icon.layers.length||icon.layers.length>8)throw Error('自訂技能圖示資料無效');
    ids.add(icon.id);
    if(icon.appearance!==undefined&&!globalThis.__EMBERWILD_SKILL_ICONS.validAppearance(icon.appearance))throw Error('自訂技能圖示外觀無效：'+icon.id);
    for(const layer of icon.layers){
      const kind=layer?.kind||'icon',range=(key,min,max,required=true)=>layer[key]===undefined&&!required||Number.isFinite(layer[key])&&layer[key]>=min&&layer[key]<=max;
      let ok=!!layer&&kinds.has(kind)&&range('x',-24,24)&&range('y',-24,24)&&range('rotation',-180,180,false)&&globalThis.__EMBERWILD_SKILL_ICONS.validEditing(layer);
      if(ok&&kind==='icon')ok=globalThis.__EMBERWILD_SKILL_ICONS.validReference(layer.icon)&&range('scale',.25,2.5);
      else if(ok){
        ok=range('strokeWidth',.4,10);
        if(kind==='line')ok=ok&&range('length',2,64);
        if(kind==='rect')ok=ok&&range('w',1,64)&&range('h',1,64)&&range('radius',0,24);
        if(kind==='ellipse')ok=ok&&range('rx',.5,32)&&range('ry',.5,32);
        if(kind==='arc')ok=ok&&range('r',.5,32)&&range('start',-360,360)&&range('end',-360,360);
        if(kind==='curve')ok=ok&&['x1','y1','cx','cy','x2','y2'].every(key=>range(key,-48,48));
        if(kind==='polygon')ok=ok&&range('scale',.2,4)&&typeof layer.points==='string'&&/^\s*-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?){2,}\s*$/.test(layer.points);
        if(['rect','ellipse','polygon'].includes(kind))ok=ok&&typeof layer.filled==='boolean';
      }
      for(const key of ['tone','strokeTone','fillTone'])if(layer?.[key]!==undefined&&layer[key]!==''&&!tones.has(layer[key]))ok=false;
      if(!ok)throw Error('自訂技能圖示圖層無效：'+icon.id);
    }
  }
  return clone(input);
}
const DEFAULT_WEAPON_BY_JOB=['sword','staff','bow','holyStaff'];
const LEGACY_WEAPON_BY_NAME={
  '闊刃劍':'sword','穿甲槍':'sword','汲血斧':'axe',
  '狙擊長弓':'bow','穿雲弩':'crossbow','風羽短弓':'bow',
  '炎晶杖':'staff','霜紋杖':'staff','疾風法器':'grimoire',
  '晨光權杖':'holyStaff','淨化槌':'holyStaff','祈禱法杖':'holyStaff'
};
const CORE_PLAN=[
  [
    {level:1,mastery:'sword',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['sword']},
    {level:3,mastery:'sword',requiredMastery:'sword',requiredMasteryLevel:1,weaponTypes:['sword']},
    {level:5,mastery:'sword',requiredMastery:'sword',requiredMasteryLevel:2,weaponTypes:['sword']},
    {level:7,mastery:'axe',requiredMastery:'axe',requiredMasteryLevel:2,weaponTypes:['axe']},
    {level:15,mastery:'sword',requiredMastery:'sword',requiredMasteryLevel:4,weaponTypes:['sword']},
    {level:20,mastery:'axe',requiredMastery:'axe',requiredMasteryLevel:4,weaponTypes:['axe']}
  ],
  [
    {level:1,mastery:'fire',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['staff','grimoire']},
    {level:3,mastery:'ice',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['staff','grimoire']},
    {level:5,mastery:'fire',requiredMastery:'fire',requiredMasteryLevel:2,weaponTypes:['staff','grimoire']},
    {level:7,mastery:'shadow',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['staff','grimoire']},
    {level:15,mastery:'fire',requiredMastery:'fire',requiredMasteryLevel:4,weaponTypes:['staff','grimoire']},
    {level:20,mastery:'wind',requiredMastery:'wind',requiredMasteryLevel:4,weaponTypes:['staff','grimoire']}
  ],
  [
    {level:1,mastery:'bow',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['bow']},
    {level:3,mastery:'bow',requiredMastery:'bow',requiredMasteryLevel:1,weaponTypes:['bow']},
    {level:5,mastery:'bow',requiredMastery:'bow',requiredMasteryLevel:2,weaponTypes:['bow']},
    {level:7,mastery:'crossbow',requiredMastery:'crossbow',requiredMasteryLevel:2,weaponTypes:['crossbow']},
    {level:15,mastery:'bow',requiredMastery:'bow',requiredMasteryLevel:4,weaponTypes:['bow']},
    {level:20,mastery:'crossbow',requiredMastery:'crossbow',requiredMasteryLevel:4,weaponTypes:['crossbow']}
  ],
  [
    {level:1,mastery:'light',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['prayerBook','holyStaff']},
    {level:3,mastery:'light',requiredMastery:'light',requiredMasteryLevel:1,weaponTypes:['prayerBook','holyStaff']},
    {level:5,mastery:'shadow',requiredMastery:null,requiredMasteryLevel:0,weaponTypes:['prayerBook','holyStaff']},
    {level:7,mastery:'shadow',requiredMastery:'shadow',requiredMasteryLevel:2,weaponTypes:['prayerBook','holyStaff']},
    {level:15,mastery:'light',requiredMastery:'light',requiredMasteryLevel:4,weaponTypes:['prayerBook','holyStaff']},
    {level:20,mastery:'shadow',requiredMastery:'shadow',requiredMasteryLevel:4,weaponTypes:['prayerBook','holyStaff']}
  ]
];
const SUPPORT_PLAN=[
  [{level:1},{level:4},{level:15}],
  [{level:1,mastery:'wind'},{level:4,mastery:'ice'},{level:15,mastery:'fire'}],
  [{level:1},{level:4},{level:15}],
  [{level:1,mastery:'light'},{level:4,mastery:'light'},{level:15,mastery:'light'}]
];
const MASTERY_DEFAULTS={xpBase:8,xpLinear:5,xpQuadratic:1,skillUseXp:2,basicAttackXp:1,maxLevel:30,advanceRequiredLevel:4,characterXpMultiplier:1};

function ensureMasterySettings(settings){
  if(!settings||typeof settings!=='object')return settings;
  settings.progression??={};settings.progression.starting??={};settings.progression.levelRewards??={};
  delete settings.progression.starting.skillPoints;delete settings.progression.levelRewards.skillPoints;
  if(settings.quests?.tutorial)settings.quests.tutorial.skillLevelRequirement=1;
  settings.skills??={};settings.skills.mastery??={};
  for(const [k,v] of Object.entries(MASTERY_DEFAULTS))if(!Number.isFinite(Number(settings.skills.mastery[k])))settings.skills.mastery[k]=v;
  settings.skills.mastery.xpBase=Math.max(1,Number(settings.skills.mastery.xpBase));
  settings.skills.mastery.xpLinear=Math.max(0,Number(settings.skills.mastery.xpLinear));
  settings.skills.mastery.xpQuadratic=Math.max(0,Number(settings.skills.mastery.xpQuadratic));
  settings.skills.mastery.skillUseXp=Math.max(0,Number(settings.skills.mastery.skillUseXp));
  settings.skills.mastery.basicAttackXp=Math.max(0,Number(settings.skills.mastery.basicAttackXp));
  settings.skills.mastery.maxLevel=Math.max(1,Math.floor(Number(settings.skills.mastery.maxLevel)));
  settings.skills.mastery.advanceRequiredLevel=Math.max(0,Math.floor(Number(settings.skills.mastery.advanceRequiredLevel)));
  settings.skills.mastery.characterXpMultiplier=Math.max(1,Number(settings.skills.mastery.characterXpMultiplier));
  return settings;
}
ensureMasterySettings(GAMEPLAY_SETTINGS_DEFAULTS);
ensureMasterySettings(GAMEPLAY_SETTINGS);

function masterySettings(){
  // Simulation batches cannot edit design data; normalize once per batch.
  const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
  if(cache?.masteryOwner===GAMEPLAY_SETTINGS)return cache.mastery;
  ensureMasterySettings(GAMEPLAY_SETTINGS);
  if(cache){cache.masteryOwner=GAMEPLAY_SETTINGS;cache.mastery=GAMEPLAY_SETTINGS.skills.mastery;}
  return GAMEPLAY_SETTINGS.skills.mastery;
}
function masteryStepCost(level){
  const s=masterySettings(),l=Math.max(0,Math.floor(Number(level)||0));
  return Math.max(1,Math.round(s.xpBase+l*s.xpLinear+l*l*s.xpQuadratic));
}
function masteryLevelFromXp(xp){
  const s=masterySettings(),value=Math.max(0,Math.floor(Number(xp)||0)),cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
  const levels=cache?(cache.masteryLevels??=new Map()):null;if(levels?.has(value))return levels.get(value);
  let level=0,spent=0;
  while(level<s.maxLevel){const cost=masteryStepCost(level);if(value<spent+cost)break;spent+=cost;level++;}
  levels?.set(value,level);return level;
}
function masteryProgress(xp){
  const value=Math.max(0,Math.floor(Number(xp)||0)),level=masteryLevelFromXp(value),max=masterySettings().maxLevel;
  let spent=0;for(let i=0;i<level;i++)spent+=masteryStepCost(i);
  return {level,xp:value,current:Math.max(0,value-spent),next:level>=max?0:masteryStepCost(level),max};
}
function validMasteries(job){return MASTERIES_BY_JOB[Number(job)]||[];}
function normalizeMastery(raw,job){
  const out={};for(const key of validMasteries(job)){const n=Number(raw?.[key]);out[key]=Number.isFinite(n)&&n>=0?Math.floor(n):0;}return out;
}

function runtimeCoreMeta(job,i){const sk=CLASSES[job]?.skills?.[i];if(!sk)return {};sk[6]??={};return sk[6];}
function applyDefaultSkillPlan(){
  for(let job=0;job<CLASSES.length;job++){
    for(let i=0;i<CLASSES[job].skills.length;i++){
      const sk=CLASSES[job].skills[i],plan=CORE_PLAN[job]?.[i]||{},meta=runtimeCoreMeta(job,i);
      if(job===3&&[2,3].includes(i)&&SKILL_ELEMENTS[job]?.[i]==='light')SKILL_ELEMENTS[job][i]='shadow';
      if(Number.isInteger(plan.level))sk[2]=plan.level;
      Object.assign(meta,{
        mastery:plan.mastery??meta.mastery??null,
        requiredMastery:plan.requiredMastery??meta.requiredMastery??null,
        requiredMasteryLevel:Number.isInteger(plan.requiredMasteryLevel)?plan.requiredMasteryLevel:Math.max(0,Math.floor(Number(meta.requiredMasteryLevel)||0)),
        weaponTypes:Array.isArray(plan.weaponTypes)?[...plan.weaponTypes]:(Array.isArray(meta.weaponTypes)?meta.weaponTypes.filter(x=>WEAPON_TYPES.has(x)):[])
      });
      delete meta.prerequisites;delete meta.prerequisiteSkill;delete meta.prerequisiteLevel;
      meta.powerPerLevel=0;
      if(sk[1]==='proc'){ensureProcSkillMeta(job,i);meta.procChancePerLevel=0;}
    }
    for(let i=0;i<(SUPPORT[job]?.length||0);i++){
      const sk=SUPPORT[job][i],plan=SUPPORT_PLAN[job]?.[i]||{};
      if(Number.isInteger(plan.level))sk.level=plan.level;
      sk.mastery=plan.mastery??sk.mastery??null;
      sk.requiredMastery=sk.requiredMastery??null;
      sk.requiredMasteryLevel=Math.max(0,Math.floor(Number(sk.requiredMasteryLevel)||0));
      sk.weaponTypes=Array.isArray(sk.weaponTypes)?sk.weaponTypes.filter(x=>WEAPON_TYPES.has(x)):[];
      delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;
      sk.effectPerLevel=0;
    }
  }
}
applyDefaultSkillPlan();
function applyDefaultAchievementSkillConditions(){
  const empty=()=>({classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]});
  for(let job=0;job<CLASSES.length;job++){
    const second=runtimeCoreMeta(job,4);second.unlockConditions=empty();second.unlockConditions.bossKills=[{mapIndex:2,count:1}];
    if(SUPPORT[job]?.[2]){SUPPORT[job][2].unlockConditions=empty();SUPPORT[job][2].unlockConditions.eliteKills=[{mapIndex:2,count:10}];}
    const late=runtimeCoreMeta(job,5);late.unlockConditions=empty();late.unlockConditions.bossEquipment=[{mapIndex:3,quantity:1}];
  }
}
applyDefaultAchievementSkillConditions();

function migrateWeaponCatalog(forms=ITEM_FORMS){
  if(!Array.isArray(forms))return forms;
  forms.forEach((slots,job)=>{
    const weapons=slots?.[0];if(!Array.isArray(weapons))return;
    for(const form of weapons){
      if(!form||typeof form!=='object')continue;
      if(!WEAPON_TYPES.has(form.weaponType)){
        const mapped=LEGACY_WEAPON_BY_NAME[form.name];
        if(mapped)form.weaponType=mapped;
        else if(job<CLASSES.length)form.weaponType=DEFAULT_WEAPON_BY_JOB[job];
      }
    }
  });
  return forms;
}
migrateWeaponCatalog();

function ensureGearWeaponType(g){
  if(!g||Number(g.slot)!==0)return g;
  const form=typeof itemForm==='function'?itemForm(g):null;
  // The equipment form is authoritative. Starter gear is created through gear() first
  // and then its form is replaced, so an already-valid weaponType can otherwise be
  // left pointing at the randomly-created form (for example 闊刃劍 carrying "axe").
  if(WEAPON_TYPES.has(form?.weaponType)){
    g.weaponType=form.weaponType;
    return g;
  }
  if(WEAPON_TYPES.has(g.weaponType))return g;
  const mapped=LEGACY_WEAPON_BY_NAME[g.name];
  if(mapped)g.weaponType=mapped;
  else if(Number.isInteger(Number(g.job))&&DEFAULT_WEAPON_BY_JOB[Number(g.job)])g.weaponType=DEFAULT_WEAPON_BY_JOB[Number(g.job)];
  return g;
}
function migrateGearList(list){
  if(!Array.isArray(list))return;
  // Replay blocks inventory edits: only the appended tail can need migration.
  const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
  const lengths=cache?(cache.migratedGear??=new WeakMap()):null;
  const start=lengths&&lengths.get(list)<=list.length?lengths.get(list):0;
  for(let i=start;i<list.length;i++)ensureGearWeaponType(list[i]);
  lengths?.set(list,list.length);
}
function migrateAllKnownWeapons(){
  for(const h of party?.members||[]){migrateGearList(h.bag);if(h.equipped)for(const id of h.equipped){if(!id)continue;ensureGearWeaponType(h.bag?.find(g=>g.id===id));}}
  migrateGearList(party?.sharedGear?.items);migrateGearList(state?.bag);
}
const masteryGearBase=gear;
gear=function(...args){return ensureGearWeaponType(masteryGearBase(...args));};

function isCompanionHero(h){return !!h&&(h.companionId!==undefined||!!party?.members?.slice(1).includes(h));}
function ensureHeroMastery(h){
  if(!h||!Number.isInteger(Number(h.job)))return h;
  if(Array.isArray(h.skills))h.skills=h.skills.map(v=>Number(v)>0?1:0);
  if(Array.isArray(h.supportLevels))h.supportLevels=h.supportLevels.map(v=>Number(v)>0?1:0);
  if(isCompanionHero(h))delete h.mastery;
  else h.mastery=globalThis.__EMBERWILD_TEAM_MASTERY?.(h)||normalizeMastery(h.mastery,h.job);
  migrateGearList(h.bag);
  return h;
}
const masteryInitHeroBase=initHero;
initHero=function(h){return ensureHeroMastery(masteryInitHeroBase(h));};
const masteryInitialBase=initial;
initial=function(job){const h=masteryInitialBase(job);delete h.sp;return ensureHeroMastery(h);};

function currentWeapon(h){
  if(!h)return null;
  const list=typeof equipment==='function'?equipment(h):[];
  return list.find(g=>Number(g?.slot)===0)||null;
}
function currentWeaponType(h){if(h?.companionId!==undefined)return globalThis.__EMBERWILD_COMPANION_TEST_API?.companionPlan(h)?.weapon||EmberwildCompanions.defaultPlans.find(p=>p.id===h.companionId)?.weapon||null;return ensureGearWeaponType(currentWeapon(h))?.weaponType||null;}
function skillWeaponAllowed(h,meta){
  const types=Array.isArray(meta?.weaponTypes)?meta.weaponTypes.filter(x=>WEAPON_TYPES.has(x)):[];
  return !types.length||types.includes(currentWeaponType(h));
}
function coreMissingRequirements(h,i,forUse=false){
  const sk=CLASSES[h.job]?.skills?.[i];if(!sk)return ['技能不存在'];
  const meta=runtimeCoreMeta(h.job,i),reasons=[];if(typeof skillAllowedForPartner==='function'&&!skillAllowedForPartner(h,meta))reasons.push(meta?.partnerId==null?'主角專屬':'指定夥伴專屬');
  if(forUse&&globalThis.companionSkillDisabled?.(h,'core',i))reasons.push('技能已禁用');
  if((isCompanionHero(h)||!forUse)&&h.lv<sk[2])reasons.push(`角色 LV${sk[2]}`);
  if(!isCompanionHero(h)&&!forUse&&skillRequiresAdvanced(sk,i)&&!h.advanced)reasons.push('完成二轉');
  const req=meta.requiredMastery,reqLv=Math.max(0,Math.floor(Number(meta.requiredMasteryLevel)||0));
  if(!isCompanionHero(h)&&!forUse&&req&&masteryLevelFromXp(h.mastery?.[req]||0)<reqLv)reasons.push(`${MASTERY_LABELS[req]||req}精通 Lv${reqLv}`);
  if(!skillWeaponAllowed(h,meta))reasons.push(`武器 ${meta.weaponTypes.map(x=>WEAPON_TYPE_LABELS[x]||x).join('／')}`);
  return reasons;
}
function supportMissingRequirements(h,i,forUse=false){
  const sk=SUPPORT[h.job]?.[i];if(!sk)return ['技能不存在'];const reasons=[];if(typeof skillAllowedForPartner==='function'&&!skillAllowedForPartner(h,sk))reasons.push(sk.partnerId==null?'主角專屬':'指定夥伴專屬');
  if(forUse&&globalThis.companionSkillDisabled?.(h,'support',i))reasons.push('技能已禁用');
  if((isCompanionHero(h)||!forUse)&&h.lv<sk.level)reasons.push(`角色 LV${sk.level}`);
  if(!isCompanionHero(h)&&!forUse&&i===2&&!h.advanced)reasons.push('完成二轉');
  const req=sk.requiredMastery,reqLv=Math.max(0,Math.floor(Number(sk.requiredMasteryLevel)||0));
  if(!isCompanionHero(h)&&!forUse&&req&&masteryLevelFromXp(h.mastery?.[req]||0)<reqLv)reasons.push(`${MASTERY_LABELS[req]||req}精通 Lv${reqLv}`);
  if(!skillWeaponAllowed(h,sk))reasons.push(`武器 ${(sk.weaponTypes||[]).map(x=>WEAPON_TYPE_LABELS[x]||x).join('／')}`);
  return reasons;
}
learn=function(i){
  ensureHeroMastery(state);if(!Number.isInteger(i)||!CLASSES[state.job]?.skills?.[i])return;
  if(state.skills[i])return toast('此技能已學會');
  const missing=coreMissingRequirements(state,i,false);if(missing.length)return toast('尚未達成：'+missing.join('、'));
  state.skills[i]=1;save();render();toast('已學會 '+CLASSES[state.job].skills[i][0]);
};
learnSupport=function(i){
  ensureHeroMastery(state);if(!Number.isInteger(i)||!SUPPORT[state.job]?.[i])return;
  if(state.supportLevels[i])return toast('此技能已學會');
  const missing=supportMissingRequirements(state,i,false);if(missing.length)return toast('尚未達成：'+missing.join('、'));
  state.supportLevels[i]=1;save();render();toast('已學會 '+SUPPORT[state.job][i].name);
};

const masterySkillPowerBase=skillPower;
skillPower=function(i,h=state){
  if(!h||!Array.isArray(h.skills))return masterySkillPowerBase(i,h);
  const old=h.skills[i];h.skills[i]=1;
  try{return masterySkillPowerBase(i,h);}finally{h.skills[i]=old;}
};
const masteryProcChanceBase=procChance;
procChance=function(i,h=state){
  if(!h||!Array.isArray(h.skills))return masteryProcChanceBase(i,h);
  const old=h.skills[i];h.skills[i]=1;
  try{return masteryProcChanceBase(i,h);}finally{h.skills[i]=old;}
};
supportAmount=function(job,index){const sk=SUPPORT[job]?.[index];return sk?Number(sk.value)||0:0;};

let currentBattleMastery={},lastBattleMastery={};
function masteryGainKey(h,key){return `${memberKey(h)}:${key}`;}
function gainMastery(h,key,amount){
  if(isCompanionHero(h)){delete h.mastery;return 0;}
  if(!h||!key||!validMasteries(h.job).includes(key))return 0;
  ensureHeroMastery(h);const add=Math.max(0,Math.floor(Number(amount)||0));if(!add)return 0;
  const before=masteryLevelFromXp(h.mastery[key]);h.mastery[key]+=add;const after=masteryLevelFromXp(h.mastery[key]);
  globalThis.__EMBERWILD_TEAM_GAIN?.(h,add);
  const k=masteryGainKey(h,key);currentBattleMastery[k]=(currentBattleMastery[k]||0)+add;
  if(after>before)note(`${characterName(h)}・${MASTERY_LABELS[key]||key}精通提升至 Lv${after}`);
  return add;
}
const masterySpawnBase=spawnGroup;
spawnGroup=function(...args){lastBattleMastery=currentBattleMastery;currentBattleMastery={};return masterySpawnBase(...args);};

const masteryCastBase=castPartySkill;
castPartySkill=function(h,i,v){
  ensureHeroMastery(h);const sk=CLASSES[h.job]?.skills?.[i],meta=runtimeCoreMeta(h.job,i);
  if(!sk||!h.skills?.[i]||coreMissingRequirements(h,i,true).length)return false;
  const out=masteryCastBase(h,i,v);
  if(out!==false&&meta.mastery)gainMastery(h,meta.mastery,masterySettings().skillUseXp);
  return out;
};
const masterySupportBase=castSupport;
castSupport=function(h,i){
  ensureHeroMastery(h);const sk=SUPPORT[h.job]?.[i];
  if(!sk||!h.supportLevels?.[i]||supportMissingRequirements(h,i,true).length)return false;
  const out=masterySupportBase(h,i);
  if(out!==false&&sk.mastery)gainMastery(h,sk.mastery,masterySettings().skillUseXp);
  return out===undefined?true:out;
};
const masteryBasicBase=performHeroBasic;
performHeroBasic=function(h){
  const hadTarget=singleTargetEnemyPool().length>0,type=currentWeaponType(h),out=masteryBasicBase(h);
  if(hadTarget&&((h.job===0&&['sword','axe','hammer'].includes(type))||(h.job===2&&['bow','crossbow'].includes(type))))gainMastery(h,type,masterySettings().basicAttackXp);
  return out;
};

const masteryAdvanceBase=advance;
advance=function(){
  if(!state||state.advanced)return masteryAdvanceBase();
  ensureHeroMastery(state);const req=masterySettings().advanceRequiredLevel,best=Math.max(0,...validMasteries(state.job).map(k=>masteryLevelFromXp(state.mastery[k])));
  if(best<req)return toast(`二轉還需要任一主要精通達 Lv${req}（目前最高 Lv${best}）`);
  return masteryAdvanceBase();
};

const masteryNeedBase=need;
// requiredXp (EmberwildProgression) already applies skills.mastery.characterXpMultiplier; applying it here again
// squared the multiplier whenever it was not 1. Keep the single, shared formula.
need=function(level){return Math.max(1,Math.round(masteryNeedBase(level)));};

function prepSaveForLegacyValidator(input){
  const out=clone(input),rows=out?.version===3?out.members:[out];
  for(const h of rows||[]){
    if(Array.isArray(h?.skills))h.skills=h.skills.map(v=>Number(v)>0?1:0);
    if(Array.isArray(h?.supportLevels))h.supportLevels=h.supportLevels.map(v=>Number(v)>0?1:0);
  }
  return out;
}
const masteryValidatePartyBase=validateParty;
validateParty=function(input){
  const raw=clone(input),prepared=prepSaveForLegacyValidator(input),p=masteryValidatePartyBase(prepared);
  const rawRows=raw?.version===3?raw.members:[raw];
  for(const [memberIndex,h] of (p.members||[]).entries()){
    const source=rawRows?.find(x=>memberKey(x)===memberKey(h)),rawMastery=source?.mastery;
    if(memberIndex===0&&rawMastery!==undefined){
      if(!rawMastery||typeof rawMastery!=='object'||Array.isArray(rawMastery))throw Error('精通資料無效');
      const valid=new Set(validMasteries(h.job));
      for(const [key,value] of Object.entries(rawMastery))if(!valid.has(key)||!Number.isSafeInteger(value)||value<0||value>1e12)throw Error('精通 XP 無效：'+key);
    }
    for(const g of source?.bag||[])if(Number(g?.slot)===0&&g.weaponType!==undefined&&!WEAPON_TYPES.has(g.weaponType))throw Error('裝備類型資料無效');
    if(memberIndex>0)delete h.mastery;else h.mastery=normalizeMastery(rawMastery,h.job);
    if(memberIndex===0)ensureHeroMastery(h);
  }
  migrateWeaponCatalog();migrateGearList(p.sharedGear?.items);for(const h of p.members||[])migrateGearList(h.bag);
  return p;
};

function normalizeOverhaulDocument(input){
  const doc=clone(input||{});doc.balanceSettings??=clone(GAMEPLAY_SETTINGS);ensureMasterySettings(doc.balanceSettings);
  doc.skillIcons=validateSkillIconDefinitions(doc.skillIcons);
  const firstMasteryMigration=Number(doc.balanceSettings?.meta?.masteryOverhaulVersion||0)<1;
  if(firstMasteryMigration)migrateMasteryRequiredLevelsDocument(doc);
  doc.balanceSettings.meta??={};doc.balanceSettings.meta.masteryOverhaulVersion=1;
  if(firstMasteryMigration&&doc.classes?.[3]?.skills?.[2]?.element==='light'&&doc.classes?.[3]?.skills?.[3]?.element==='light'){doc.classes[3].skills[2].element='shadow';doc.classes[3].skills[3].element='shadow';}
  doc.masteryTypes=MASTERIES_BY_JOB.map((list,job)=>({job,types:[...list]}));
  for(let job=0;job<(doc.classes||[]).length;job++)for(let i=0;i<(doc.classes[job]?.skills||[]).length;i++){
    const sk=doc.classes[job].skills[i],fallback=CORE_PLAN[job]?.[i]||{},live=runtimeCoreMeta(job,i);
    sk.mastery=sk.mastery??live.mastery??fallback.mastery??null;
    sk.requiredMastery=sk.requiredMastery??live.requiredMastery??fallback.requiredMastery??null;
    sk.requiredMasteryLevel=Math.max(0,Math.floor(Number(sk.requiredMasteryLevel??live.requiredMasteryLevel??fallback.requiredMasteryLevel)||0));
    sk.weaponTypes=Array.isArray(sk.weaponTypes)?sk.weaponTypes.filter(x=>WEAPON_TYPES.has(x)):clone(live.weaponTypes??fallback.weaponTypes??[]);
    sk.iconType=normalizeSkillIconType(sk.iconType??live.iconType,doc.skillIcons);
    delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;
    if(!Number.isFinite(sk.powerPerLevel))sk.powerPerLevel=0;else sk.powerPerLevel=0;
    if(sk.activation==='proc'){if(!Number.isFinite(sk.procBaseChance))sk.procBaseChance=legacyProcRates(doc.balanceSettings).base;sk.procChancePerLevel=0;}
  }
  for(let job=0;job<(doc.supportSkills||[]).length;job++)for(let i=0;i<(doc.supportSkills[job]||[]).length;i++){
    const sk=doc.supportSkills[job][i],live=SUPPORT[job]?.[i]||{},fallback=SUPPORT_PLAN[job]?.[i]||{};
    sk.mastery=sk.mastery??live.mastery??fallback.mastery??null;
    sk.requiredMastery=sk.requiredMastery??live.requiredMastery??null;
    sk.requiredMasteryLevel=Math.max(0,Math.floor(Number(sk.requiredMasteryLevel??live.requiredMasteryLevel)||0));
    sk.weaponTypes=Array.isArray(sk.weaponTypes)?sk.weaponTypes.filter(x=>WEAPON_TYPES.has(x)):clone(live.weaponTypes||[]);
    sk.iconType=normalizeSkillIconType(sk.iconType??live.iconType,doc.skillIcons);
    delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;
    sk.effectPerLevel=0;
  }
  if(Array.isArray(doc.equipmentForms)){
    normalizeEquipmentFormsArray(doc.equipmentForms);
    doc.equipmentForms.forEach((slots,job)=>{
      for(const form of slots?.[0]||[]){
        if(!WEAPON_TYPES.has(form.weaponType)){
          const mapped=LEGACY_WEAPON_BY_NAME[form.name];
          if(mapped)form.weaponType=mapped;
          else if(job<CLASSES.length)form.weaponType=DEFAULT_WEAPON_BY_JOB[job];
        }
      }
    });
  }
  return doc;
}
function validateOverhaulFields(doc){
  const fail=msg=>{throw Error(msg);};
  const masteryMax=Math.max(1,Math.floor(Number(doc.balanceSettings?.skills?.mastery?.maxLevel)||1)),advanceReq=Math.max(0,Math.floor(Number(doc.balanceSettings?.skills?.mastery?.advanceRequiredLevel)||0));
  if(advanceReq>masteryMax)fail('二轉精通需求不可高於精通最高等級');
  for(let job=0;job<(doc.classes||[]).length;job++)for(let i=0;i<(doc.classes[job]?.skills||[]).length;i++){
    const sk=doc.classes[job].skills[i],valid=new Set(validMasteries(job));
    if(sk.mastery!=null&&!valid.has(sk.mastery))fail(`技能精通不存在：${job}-${i}-${sk.mastery}`);
    if(sk.requiredMastery!=null&&!valid.has(sk.requiredMastery))fail(`技能需求精通不存在：${job}-${i}-${sk.requiredMastery}`);
    if(!Number.isInteger(sk.requiredMasteryLevel)||sk.requiredMasteryLevel<0||sk.requiredMasteryLevel>100||!sk.requiredMastery&&sk.requiredMasteryLevel>0)fail(`技能精通等級需求無效：${job}-${i}`);
    if(!Array.isArray(sk.weaponTypes)||sk.weaponTypes.some(x=>!WEAPON_TYPES.has(x)))fail(`技能武器類型無效：${job}-${i}`);
    if(normalizeSkillIconType(sk.iconType,doc.skillIcons)!==sk.iconType)fail(`技能圖示類型無效：${job}-${i}`);
  }
  for(let job=0;job<(doc.supportSkills||[]).length;job++)for(let i=0;i<(doc.supportSkills[job]||[]).length;i++){
    const sk=doc.supportSkills[job][i],valid=new Set(validMasteries(job));
    if(sk.mastery!=null&&!valid.has(sk.mastery))fail(`輔助技能精通不存在：${job}-${i}-${sk.mastery}`);
    if(sk.requiredMastery!=null&&!valid.has(sk.requiredMastery))fail(`輔助技能需求精通不存在：${job}-${i}-${sk.requiredMastery}`);
    if(!Number.isInteger(sk.requiredMasteryLevel)||sk.requiredMasteryLevel<0||sk.requiredMasteryLevel>100||!sk.requiredMastery&&sk.requiredMasteryLevel>0)fail(`輔助技能精通等級需求無效：${job}-${i}`);
    if(!Array.isArray(sk.weaponTypes)||sk.weaponTypes.some(x=>!WEAPON_TYPES.has(x)))fail(`輔助技能武器類型無效：${job}-${i}`);
    if(normalizeSkillIconType(sk.iconType,doc.skillIcons)!==sk.iconType)fail(`輔助技能圖示類型無效：${job}-${i}`);
  }
  for(let job=0;job<(doc.equipmentForms||[]).length;job++)for(const form of doc.equipmentForms[job]?.[0]||[])if(form.weaponType!=null&&!WEAPON_TYPES.has(form.weaponType))fail(`武器 weaponType 無效：${job}-${form.name}`);
}

const masteryValidateBalanceBase=validateBalanceConfig;
validateBalanceConfig=function(input){
  const full=normalizeOverhaulDocument(input);validateOverhaulFields(full);const clean=clone(full);
  for(const cls of clean.classes||[])for(const sk of cls.skills||[]){delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;sk.powerPerLevel=0;if(sk.activation==='proc')sk.procChancePerLevel=0;}
  for(const list of clean.supportSkills||[])for(const sk of list||[]){delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;sk.effectPerLevel=0;}
  for(const slots of clean.equipmentForms||[])for(const form of slots?.[0]||[])delete form.weaponType;
  const out=masteryValidateBalanceBase(clean);
  out.balanceSettings=clone(full.balanceSettings);out.masteryTypes=clone(full.masteryTypes);out.skillIcons=clone(full.skillIcons);
  for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<(out.classes[job]?.skills||[]).length;i++){
    const src=full.classes[job].skills[i],dst=out.classes[job].skills[i];
    for(const key of ['mastery','requiredMastery','requiredMasteryLevel','weaponTypes','iconType'])dst[key]=clone(src[key]);dst.unlockConditions=clone(src.unlockConditions||{classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]});
    delete dst.prerequisites;delete dst.prerequisiteSkill;delete dst.prerequisiteLevel;dst.powerPerLevel=0;if(dst.activation==='proc')dst.procChancePerLevel=0;
  }
  for(let job=0;job<(out.supportSkills||[]).length;job++)for(let i=0;i<(out.supportSkills[job]||[]).length;i++){
    const src=full.supportSkills[job][i],dst=out.supportSkills[job][i];
    for(const key of ['mastery','requiredMastery','requiredMasteryLevel','weaponTypes','iconType'])dst[key]=clone(src[key]);dst.unlockConditions=clone(src.unlockConditions||{classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]});
    delete dst.prerequisites;delete dst.prerequisiteSkill;delete dst.prerequisiteLevel;dst.effectPerLevel=0;
  }
  for(let job=0;job<(out.equipmentForms||[]).length;job++)for(let i=0;i<(out.equipmentForms[job]?.[0]||[]).length;i++)out.equipmentForms[job][0][i].weaponType=full.equipmentForms[job][0][i].weaponType;
  return out;
};

function applyOverhaulMeta(doc){
  ensureMasterySettings(GAMEPLAY_SETTINGS);
  for(let job=0;job<CLASSES.length;job++)for(let i=0;i<CLASSES[job].skills.length;i++){
    const src=doc.classes?.[job]?.skills?.[i];if(!src)continue;const meta=runtimeCoreMeta(job,i);
    Object.assign(meta,{mastery:src.mastery??null,requiredMastery:src.requiredMastery??null,requiredMasteryLevel:Math.max(0,Math.min(100,Math.floor(Number(src.requiredMasteryLevel)||0))),weaponTypes:clone(src.weaponTypes||[]),iconType:normalizeSkillIconType(src.iconType),powerPerLevel:0,unlockConditions:clone(src.unlockConditions||{classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]})});delete meta.prerequisites;delete meta.prerequisiteSkill;delete meta.prerequisiteLevel;
    if(CLASSES[job].skills[i][1]==='proc')meta.procChancePerLevel=0;
  }
  for(let job=0;job<SUPPORT.length;job++)for(let i=0;i<SUPPORT[job].length;i++){
    const src=doc.supportSkills?.[job]?.[i];if(!src)continue;
    Object.assign(SUPPORT[job][i],{mastery:src.mastery??null,requiredMastery:src.requiredMastery??null,requiredMasteryLevel:Math.max(0,Math.min(100,Math.floor(Number(src.requiredMasteryLevel)||0))),weaponTypes:clone(src.weaponTypes||[]),iconType:normalizeSkillIconType(src.iconType),effectPerLevel:0,unlockConditions:clone(src.unlockConditions||{classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]})});delete SUPPORT[job][i].prerequisites;delete SUPPORT[job][i].prerequisiteSkill;delete SUPPORT[job][i].prerequisiteLevel;
  }
  migrateWeaponCatalog();migrateAllKnownWeapons();
  for(const h of party?.members||[])ensureHeroMastery(h);if(state)ensureHeroMastery(state);
}
const masteryApplyBalanceBase=applyBalanceConfig;
applyBalanceConfig=function(input,{persist=true}={}){
  const full=validateBalanceConfig(input),out=masteryApplyBalanceBase(full,{persist:false});
  customSkillIcons=clone(full.skillIcons);
  ensureMasterySettings(GAMEPLAY_SETTINGS);applyOverhaulMeta(full);
  if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
  if(state)render();
  return out;
};

const masteryExportBalanceBase=exportableBalance;
exportableBalance=function(){
  const out=normalizeOverhaulDocument({...masteryExportBalanceBase(),skillIcons:customSkillIcons});ensureMasterySettings(out.balanceSettings);
  for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<(out.classes[job]?.skills||[]).length;i++){
    const sk=out.classes[job].skills[i],meta=runtimeCoreMeta(job,i);
    sk.mastery=meta.mastery??null;sk.requiredMastery=meta.requiredMastery??null;sk.requiredMasteryLevel=Math.max(0,Math.min(100,Math.floor(Number(meta.requiredMasteryLevel)||0)));sk.weaponTypes=clone(meta.weaponTypes||[]);sk.iconType=normalizeSkillIconType(meta.iconType);delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;
    delete sk.powerPerLevel;if(sk.activation==='proc')delete sk.procChancePerLevel;
  }
  for(let job=0;job<(out.supportSkills||[]).length;job++)for(let i=0;i<(out.supportSkills[job]||[]).length;i++){
    const sk=out.supportSkills[job][i],live=SUPPORT[job][i];
    sk.mastery=live.mastery??null;sk.requiredMastery=live.requiredMastery??null;sk.requiredMasteryLevel=Math.max(0,Math.min(100,Math.floor(Number(live.requiredMasteryLevel)||0)));sk.weaponTypes=clone(live.weaponTypes||[]);sk.iconType=normalizeSkillIconType(live.iconType);delete sk.prerequisites;delete sk.prerequisiteSkill;delete sk.prerequisiteLevel;delete sk.effectPerLevel;
  }
  migrateWeaponCatalog(out.equipmentForms);
  out.masteryTypes=MASTERIES_BY_JOB.map((types,job)=>({job,types:[...types]}));
  out.notes=(out.notes||[]).filter(x=>!/技能等級|每級|skill level|powerPerLevel|procChancePerLevel|effectPerLevel|前置|prerequisite/i.test(String(x)));
  out.notes.push('技能只有未學／已學；沒有技能點成本，達成永久解鎖條件後可直接學習。','mastery 保存精通 XP，等級由 balanceSettings.skills.mastery 的共用曲線即時計算。','mastery / requiredMastery / requiredMasteryLevel / weaponTypes 分別描述培養精通、學習精通條件與可用武器；學習精通等級要求限制為 0～100。','weaponType 與 mastery 為獨立概念；戰士／弓箭手普通攻擊依目前武器類型累積精通，法師／牧師則依技能 mastery 累積。');
  return out;
};

const masteryResetBalanceBase=resetBalanceJSON;
resetBalanceJSON=function(){customSkillIcons=[];const out=masteryResetBalanceBase();ensureMasterySettings(GAMEPLAY_SETTINGS);applyDefaultSkillPlan();migrateWeaponCatalog();migrateAllKnownWeapons();if(state)render();return out;};

try{
  const saved=balanceSourceText();
  if(saved)applyBalanceConfig(JSON.parse(saved),{persist:false});
}catch(e){console.warn('精通大修設定載入失敗，沿用內建設定',e);}
migrateWeaponCatalog();migrateAllKnownWeapons();
for(const h of party?.members||[])ensureHeroMastery(h);if(state)ensureHeroMastery(state);
if(state){save();render();}

globalThis.__EMBERWILD_MASTERY={
  weaponTypes:clone(WEAPON_TYPE_LABELS),masteryTypes:clone(MASTERIES_BY_JOB),masteryLabels:clone(MASTERY_LABELS),iconTypes:[...SKILL_ICON_TYPES],iconDefinitions:()=>clone(customSkillIcons),
  validMasteries,masterySettings,masteryStepCost,masteryLevelFromXp,masteryProgress,currentWeaponType,
  coreMeta:runtimeCoreMeta,coreMissingRequirements,supportMissingRequirements,gainMastery,ensureHero:ensureHeroMastery,
  currentBattleGain:()=>clone(currentBattleMastery),lastBattleGain:()=>clone(lastBattleMastery),normalizeDocument:normalizeOverhaulDocument
};
globalThis.__EMBERWILD_MASTERY.resetBattleGain=()=>{if(Object.keys(currentBattleMastery).length)lastBattleMastery=currentBattleMastery;currentBattleMastery={};};
})();
