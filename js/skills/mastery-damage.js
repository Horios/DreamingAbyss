/* v0.179 mastery damage. Masteries give damage only, never HP or defense (class mastery no longer adds stats; it still
   unlocks skills):
   - weapon mastery (劍／斧／槌／弓／弩): total damage +1% per level while a weapon of that type is equipped;
   - element mastery (火／冰／風／光／暗): +1% per level on spells of that element only; basic attacks (and their
     follow-up hits) are not spells, even when their weapon or a potion gives them an element.
   Only the protagonist has weapon and element masteries; companions grow class mastery only.
   Loaded after every resolveHit override, so this wrapper sees all hits. */
(()=>{
  'use strict';
  const PER_LEVEL=0.01,WEAPONS=['sword','axe','hammer','bow','crossbow'],ELEMENTS=['fire','ice','wind','light','shadow'];
  const M=()=>globalThis.__EMBERWILD_MASTERY;
  const level=(h,key)=>h?.mastery?M().masteryLevelFromXp(h.mastery[key]||0):0;
  let basicDepth=0;
  function weaponBonus(h){if(!h||h.companionId!==undefined)return 0;const type=M().currentWeaponType(h);return WEAPONS.includes(type)?level(h,type)*PER_LEVEL:0;}
  function elementBonus(h,element){if(!h||h.companionId!==undefined||!ELEMENTS.includes(element))return 0;return level(h,element)*PER_LEVEL;}
  // The multiplier for one hit of hero h: weapon always (when held), element only for a spell of that element.
  function multiplier(h,element,{basic=false}={}){return (1+weaponBonus(h))*(1+(basic?0:elementBonus(h,element)));}
  const isHero=h=>!!h&&Array.isArray(party?.members)&&party.members.includes(h);
  const baseHit=resolveHit;
  resolveHit=function(e,amount,h,element,crit,options={},...rest){
    if(isHero(h)&&Number.isFinite(amount)){const m=multiplier(h,element,{basic:basicDepth>0||!!options?.tokenExtra});if(m!==1)amount=amount*m;}
    return baseHit.call(this,e,amount,h,element,crit,options,...rest);
  };
  const baseBasic=performHeroBasic;
  performHeroBasic=function(...args){basicDepth++;try{return baseBasic.apply(this,args);}finally{basicDepth--;}};
  // Text for the mastery pages: what each mastery adds right now.
  function summary(h){
    if(!h||h.companionId!==undefined)return [];
    const out=[];const type=M().currentWeaponType(h);
    for(const k of WEAPONS){const lv=level(h,k);if(lv>0)out.push({key:k,kind:'weapon',level:lv,bonus:lv*PER_LEVEL,active:k===type});}
    for(const k of ELEMENTS){const lv=level(h,k);if(lv>0)out.push({key:k,kind:'element',level:lv,bonus:lv*PER_LEVEL,active:true});}
    return out;
  }
  globalThis.__EMBERWILD_MASTERY_DAMAGE={PER_LEVEL,weaponBonus,elementBonus,multiplier,summary};
})();
