/* v0.161: character levels and character XP were removed. This module holds the save compatibility for that change
   and the one rule every skill gate shares:
   - party.legacySkillLevel: the protagonist's level in an old save (companions always matched it). Anything the old
     level had already unlocked stays unlocked (a mastery requirement of L counts as met while L+1 <= legacySkillLevel),
     so old saves keep every skill they could use. The level is not converted into mastery XP.
   - 升級卷軸 (level scroll) has no use any more; old stock is refunded once at its sell price.
   Loading the same save again changes nothing: the level is gone after the first load, the scroll stock is zero. */
(()=>{
  'use strict';
  const SCROLL='升級卷軸';
  // While a save is being loaded its skills are rebuilt before `party` points at it; the incoming level is used then.
  let incomingLegacy=0;
  const legacyLevel=()=>{const n=party?.legacySkillLevel;return Math.max(incomingLegacy,Number.isSafeInteger(n)&&n>0?n:0);};
  function incomingLevel(data){if(Number.isSafeInteger(data?.legacySkillLevel))return data.legacySkillLevel;const rows=data?.version===3?data.members:[data];const n=rows?.[0]?.lv;return Number.isSafeInteger(n)&&n>0?Math.min(999,n):0;}
  // A class-mastery requirement is met by the character's class mastery, or by the level an old save already reached.
  function masteryRequirementMet(h,level){
    const need=Math.max(0,Math.floor(Number(level)||0));if(need<=0)return true;
    return classMasteryLevel(h)>=need||legacyLevel()>=need+1;
  }
  globalThis.masteryRequirementMet=masteryRequirementMet;
  globalThis.legacySkillLevel=legacyLevel;

  const validateBase=validateParty;
  validateParty=function(data){
    const out=validateBase(data),own=data?.legacySkillLevel;
    if(own!==undefined&&(!Number.isSafeInteger(own)||own<1||own>999))throw Error('舊存檔等級相容資料無效');
    const found=Math.max(0,...out.members.map(h=>Number.isSafeInteger(h.legacyLevel)?h.legacyLevel:0));
    for(const h of out.members)delete h.legacyLevel;
    const level=own??(found||undefined);if(level)out.legacySkillLevel=level;else delete out.legacySkillLevel;
    const sub=data?.masterySubClass;if(sub!==undefined&&sub!==null&&!(Number.isInteger(sub)&&sub>=0&&sub<CLASSES.length))throw Error('副職業精通無效');
    out.masterySubClass=sub??null;
    return out;
  };
  const packBase=packParty;
  packParty=function(){const out=packBase();if(out&&party){out.masterySubClass=party.masterySubClass??null;if(legacyLevel())out.legacySkillLevel=legacyLevel();else delete out.legacySkillLevel;for(const h of out.members||[])delete h.legacyLevel;}return out;};

  function refundScrolls(){
    if(!party||!state)return 0;const n=materialCount(SCROLL);if(!(n>0))return 0;
    const price=Math.max(0,Math.floor(Number(materialSellPrice(SCROLL))||0)),gold=n*price;
    setMaterialCount(SCROLL,0);delete state.materials[SCROLL];if(gold)state.gold+=gold;
    note(`角色等級已移除：${n} 個${SCROLL}換成 ${gold} 金幣`);return gold;
  }
  const loadBase=loadParty;
  loadParty=function(data){
    incomingLegacy=incomingLevel(data);let out;
    try{out=loadBase(data);}finally{incomingLegacy=0;}
    if(party){for(const h of party.members)delete h.legacyLevel;if(refundScrolls())save();}
    return out;
  };
  // A save hydrated during boot (before this module loaded) still carries the old level on its members.
  if(party){const found=Math.max(0,...party.members.map(h=>Number.isSafeInteger(h.legacyLevel)?h.legacyLevel:0));for(const h of party.members)delete h.legacyLevel;if(found&&!party.legacySkillLevel)party.legacySkillLevel=found;if(refundScrolls())save();}
  // Class mastery stat bonus: per level of the character's current class mastery (companions: their own mastery).
  /* v0.179: class mastery gives HP, attack and defense per level from its class's row of the classBonus table (no crit).
     The protagonist uses two class masteries at a time: the main class (the class being played) and one sub-class chosen
     on the character page (party.masterySubClass, any other class already trained; null for none). Switching takes
     effect at once. A companion has one class mastery, its own. Weapon and element masteries add damage only
     (js/skills/mastery-damage.js). */
  const classes=()=>globalThis.__EMBERWILD_TEAMS?.build?.()?.permanent?.classes||null;
  const trainedLevel=j=>{const c=classes()?.[j];return c?.activated?__EMBERWILD_MASTERY.masteryLevelFromXp(c.xp||0):0;};
  function subClass(h){const j=party?.masterySubClass;return Number.isInteger(j)&&j!==h?.job&&classes()?.[j]?.activated?j:null;}
  // The class masteries that count for h, with their levels and per-level rows.
  function classMasterySources(h){
    if(!h)return [];const rows=GAMEPLAY_SETTINGS.skills?.mastery?.classBonus||[],row=j=>({hp:Number(rows[j]?.hp)||0,atk:Number(rows[j]?.atk)||0,def:Number(rows[j]?.def)||0});
    const out=[{job:h.job,role:'main',level:classMasteryLevel(h),perLevel:row(h.job)}];
    if(h.companionId===undefined&&typeof playerHero==='function'&&h===playerHero()){const s=subClass(h);if(s!==null)out.push({job:s,role:'sub',level:trainedLevel(s),perLevel:row(s)});}
    return out;
  }
  function classMasteryBonus(h){
    const out={hp:0,atk:0,def:0,crit:0};
    for(const s of classMasterySources(h))for(const k of ['hp','atk','def'])out[k]+=s.perLevel[k]*s.level;
    return out;
  }
  globalThis.classMasterySources=classMasterySources;
  globalThis.masterySubClass=()=>party?subClass(playerHero()):null;
  globalThis.setMasterySubClass=function(j){
    if(!party)return false;const h=playerHero();
    if(j!==null&&(!Number.isInteger(j)||j===h.job||!classes()?.[j]?.activated))return false;
    const old=party.masterySubClass??null;party.masterySubClass=j;
    if(save()===false){party.masterySubClass=old;return false;}
    h.hp=Math.min(h.hp,stats(h).hp);render();return true;
  };
  globalThis.classMasteryBonus=classMasteryBonus;
  // Developer/test helper: put a character's current class mastery at exactly `level` and refresh what it unlocks.
  globalThis.setClassMasteryLevel=function(level,h=state){
    if(!h)return false;const M=__EMBERWILD_MASTERY,max=M.masterySettings().maxLevel,l=Math.max(0,Math.min(max,Math.floor(Number(level)||0)));
    let xp=0;for(let i=0;i<l;i++)xp+=M.masteryStepCost(i);
    if(h.companionId!==undefined){h.companionMastery={xp};}
    else{const b=__EMBERWILD_TEAMS?.build?.();if(!b)return false;const c=b.permanent.classes[h.job]??={activated:true,xp:0,advanced:!!h.advanced};c.activated=true;c.xp=xp;__EMBERWILD_TEAMS.refreshUnlocks();}
    syncParty();globalThis.__EMBERWILD_SKILL_REFRESH?.();return true;
  };
  globalThis.setPartyClassMasteryLevel=function(level){if(!party)return false;for(const h of party.members)setClassMasteryLevel(level,h);return true;};
  globalThis.__EMBERWILD_LEVEL_REMOVAL={refundScrolls,masteryRequirementMet,legacyLevel,classMasteryBonus};
})();
