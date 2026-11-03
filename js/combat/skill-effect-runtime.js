/* Common optional effects. Old skills delegate to their existing implementation. */
(()=>{
  'use strict';
  const schema=EmberwildSkillEffects,copy=x=>JSON.parse(JSON.stringify(x)),status=()=>globalThis.__EMBERWILD_STATUS_TEST_API;
  const configured=def=>schema.EFFECTS.includes(def?.effect)&&(['cleanse','dispel','revive'].includes(def.effect)||(def.commonEffectKeys||[]).length>0);
  const options=meta=>({...meta,target:meta.commonEffectKeys?.includes('target')?meta.target:undefined});
  const isHero=t=>t&&Object.prototype.hasOwnProperty.call(t,'job');
  const name=t=>isHero(t)?characterName(t):combatEnemyName(t);
  const maxHp=t=>status().maxHp(t);
  function members(caster,fallen=false){
    const list=isHero(caster)?heroes():foes;
    return list.filter(t=>fallen?t.hp<=0:t.hp>0);
  }
  function targets(caster,sk,meta){
    const mode=meta.target||schema.defaults(sk.effect).target;
    if(mode==='self')return [caster];
    if(mode==='fallen'||mode==='fallenAllies'){const dead=members(caster,true);return mode==='fallenAllies'?dead:dead.slice(0,Math.max(1,sk.maxTargets||1));}
    if(mode==='allies')return members(caster);
    if(mode==='weakest')return members(caster).sort((a,b)=>a.hp/maxHp(a)-b.hp/maxHp(b)).slice(0,1);
    const opponents=isHero(caster)?foes.filter(e=>e.hp>0):living();
    if(mode==='enemies'||sk.maxTargets>=99)return meta.targetLimit?opponents.slice(0,sk.maxTargets||1):opponents;
    const n=Math.max(1,Math.floor(sk.maxTargets||1)),pool=isHero(caster)&&n===1?opponents.filter(enemyAvailableForSingleTarget):opponents;
    return shuffleCopy(pool).slice(0,n);
  }
  function healing(caster,target,amount,overflow=false){
    const before=target.hp,value=Math.max(0,Math.round(isHero(caster)?healingAmount(caster,amount):amount));
    target.hp=Math.min(maxHp(target),target.hp+value);const healed=Math.max(0,target.hp-before);
    if(overflow&&value>healed)target.shield=Math.max(Number(target.shield)||0,value-healed);
    if(isHero(caster)&&healed>0)recordCombatContribution(caster,'healing',healed);
    return healed;
  }
  function attach(caster,target,meta){
    if(!meta.onHitStatusId||target.hp<=0)return;
    if(Math.random()<(meta.onHitStatusChance??1))status().apply(meta.onHitStatusId,caster,target);
  }
  function cast(caster,sk,meta,v,power,profile){
    const xs=targets(caster,sk,meta);if(!xs.length)return false;
    const effect=sk.effect,damage=['damage','drain'].includes(effect),stored=sk.activation==='active'?Math.max(0,Number(caster.nextActiveDamageBonus)||0):0;
    let total=0;
    for(const target of xs){
      if(effect==='revive'){
        target.hp=Math.max(1,Math.min(maxHp(target),Math.round(maxHp(target)*(meta.reviveHpRatio??.25))));target.shield=0;
        if(isHero(caster))recordCombatContribution(caster,'healing',target.hp);
        note(name(caster)+'・'+sk.name+' → '+name(target)+' 復活，生命 '+target.hp);continue;
      }
      if(effect==='cleanse'||effect==='dispel'){
        const removed=status().remove(target,effect==='cleanse'?'debuff':'buff',meta.dispelCount??99);
        note(name(caster)+'・'+sk.name+' → '+name(target)+' 解除 '+removed+' 個'+(effect==='cleanse'?'減益':'增益'));continue;
      }
      const basis=meta.powerBasis||'casterAttack',raw=(basis==='casterAttack'?v.atk:status().basis(basis,caster,target))*power;
      if(effect==='heal'){
        const amount=healing(caster,target,raw,meta.healResolution==='overflowShield');
        note(name(caster)+'・'+sk.name+' → '+name(target)+' 恢復 '+amount+' 生命');attach(caster,target,meta);continue;
      }
      if(effect==='shield'){
        if(isHero(target))applyPureShield(target,raw);else target.shield=Math.max(Number(target.shield)||0,Math.max(0,Math.round(raw)));
        note(name(caster)+'・'+sk.name+' → '+name(target)+' 護盾 '+Math.round(target.shield));attach(caster,target,meta);continue;
      }
      let dealt=0,hit=false;
      for(let n=0;n<(meta.hitCount??1)&&target.hp>0;n++){
        const amount=raw*(stored>0?1+stored:1),resolution=meta.damageResolution||'standard',beforeShield=Number(target.shield)||0,beforeMorph=globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[target.id]?.polymorph?.shield||0;let d=0;
        if(resolution==='standard'){
          d=isHero(caster)?resolveHit(target,amount,caster,sk.element,Math.random()<profile.critChance,{critDamage:profile.critDamage,defensePenetration:profile.defensePenetration,defenseIgnore:profile.defenseIgnore}):sharedEnemySkillDamage(caster,target,amount,sk.element,sk);
        }else{
          const before=target.hp;d=status().damage(target,amount,resolution==='true');
          if(isHero(caster)&&d>0)recordCombatContribution(caster,'damage',d);
          if(!isHero(caster)&&before>0&&target.hp<=0&&typeof recordBattleDeath==='function')recordBattleDeath(target,caster,sk.name);
          if(v.lifesteal>0)healing(caster,caster,d*v.lifesteal);
        }
        // A shield-only hit is still a hit; an evaded hit neither damages HP nor consumes shield.
        hit=hit||d>0||(Number(target.shield)||0)<beforeShield||(globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[target.id]?.polymorph?.shield||0)<beforeMorph;dealt+=d;
      }
      total+=dealt;
      if(hit)attach(caster,target,meta);
      note(name(caster)+'・'+sk.name+' → '+name(target)+' '+dealt+' 傷害'+((meta.hitCount??1)>1?'（'+meta.hitCount+' 段）':''),isHero(caster)?'playerDamage':'enemyDamage');
    }
    if(effect==='drain')healing(caster,caster,total*(meta.drainRate??1));
    if(damage&&sk.activation==='active'&&stored>0)delete caster.nextActiveDamageBonus;
    return true;
  }
  const baseCast=castPartySkill;
  castPartySkill=function(h,i,v){
    const runtime=CLASSES[h?.job]?.skills?.[i],meta=runtime?.[6]||{},sk=runtime?{name:runtime[0],activation:runtime[1],effect:runtime[5],element:coreSkillElement(h.job,i),maxTargets:meta.maxTargets}:null;
    if(!configured({...meta,effect:sk?.effect}))return baseCast(h,i,v);
    if(!h||h.hp<=0||!h.skills?.[i]||!coreSkillAvailableToHero(h.job,i,h)||globalThis.__EMBERWILD_MASTERY?.coreMissingRequirements(h,i,true).length)return false;
    v=v||battleStats(h);
    const tracker=status();tracker?.beginSkillCast?.(h,i);let ok=false;
    try{
      const power=skillPower(i,h)*(1+effectTotal(heroKey(h),'power'));ok=cast(h,sk,options(meta),v,power,skillCombatProfile(h,i,v));
      
      const mastery=globalThis.__EMBERWILD_MASTERY;if(ok&&meta.mastery&&mastery?.gainMastery)mastery.gainMastery(h,meta.mastery,mastery.masterySettings().skillUseXp);
      return ok;
    }finally{tracker?.endSkillCast?.(h,i,ok);}
  };
  globalThis.EmberwildSkillEffectRuntime={configured,castEnemy(e,sk){const v=enemyBattleStats(e),power=sk.power*(1+effectTotal(e.id,'power'))*(1-Math.min(GAMEPLAY_SETTINGS.combat.caps.weaken,effectTotal(e.id,'weaken')));return cast(e,sk,options(sk.meta||{}),v,power,null);}};
  const validateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    for(const [job,c] of (input?.classes||[]).entries())for(const [i,sk] of (c.skills||[]).entries()){
      const issues=schema.validateSkill(sk,input.statusDefinitions||[]);if(issues.length)throw Error('技能 '+job+'-'+i+'：'+issues.join('；'));
    }
    return validateBase(input);
  };
  const exportBase=exportableBalance;
  exportableBalance=function(){
    const doc=exportBase();for(const [job,c] of doc.classes.entries())for(const [i,sk] of c.skills.entries()){
      const meta=CLASSES[job]?.skills?.[i]?.[6]||{};for(const k of schema.KEYS)if(meta.commonEffectKeys?.includes(k))sk[k]=copy(meta[k]);
    }
    return doc;
  };
  const applyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    validateBalanceConfig(input);const out=applyBase(input,{persist:false});
    for(const [job,c] of (input.classes||[]).entries())for(const [i,sk] of c.skills.entries()){
      const meta=CLASSES[job]?.skills?.[i]?.[6];if(!meta)continue;meta.commonEffectKeys=[];
      for(const k of schema.KEYS)if(sk[k]!==undefined){meta[k]=copy(sk[k]);meta.commonEffectKeys.push(k);}
    }
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(state)render();return out;
  };
  const detailBase=coreSkillDetail;
  coreSkillDetail=function(job,i,h=state){
    const sk=CLASSES[job]?.skills?.[i],m=sk?.[6]||{};let text=detailBase(job,i,h);
    if(!configured({...m,effect:sk?.[5]}))return text;
    const labels={cleanse:'淨化減益',dispel:'驅散增益',revive:'復活'},targets={self:'自己',weakest:'最低生命隊友',allies:'我方全體',enemy:'敵人',enemies:'敵方全體',fallen:'陣亡隊友',fallenAllies:'全體陣亡隊友'};
    const damage=['damage','drain'].includes(sk[5]),mode=m.commonEffectKeys?.includes('target')?m.target:schema.defaults(sk[5]).target;
    text=text.replace(/ · 目標 [^·]*/g,'');
    if(labels[sk[5]])text=labels[sk[5]]+' · '+(sk[1]==='active'?'冷卻 '+skillCooldown(i,h)+' 回合':'普攻觸發率 '+Math.round(procChance(i,h)*100)+'% · 冷卻 無')+' · 需求 LV'+sk[2]+(skillRequiresAdvanced(sk,i)?'／二轉':'');
    text+=' · 目標 '+(mode==='enemy'?(m.maxTargets>=99?'敵方全體':'敵人（最多 '+(m.maxTargets||1)+' 個）'):targets[mode]);
    const basisLabels={fixed:'固定點數',casterAttack:'施放者攻擊力',casterDefense:'施放者防禦',casterMaxHp:'施放者最大生命',casterCurrentHp:'施放者當前生命',casterMissingHp:'施放者已損生命',casterShield:'施放者護盾',casterLevel:'施放者等級',targetAttack:'目標攻擊力',targetDefense:'目標防禦',targetMaxHp:'目標最大生命',targetCurrentHp:'目標當前生命',targetMissingHp:'目標已損生命',targetShield:'目標護盾',targetLevel:'目標等級'};
    if(['damage','drain','heal','shield'].includes(sk[5]))text+=' · 基準 '+basisLabels[m.powerBasis||'casterAttack'];
    if(damage&&(m.hitCount??1)>1)text+=' · 每目標 '+m.hitCount+' 段（每段完整倍率）';
    if(damage&&m.damageResolution&&m.damageResolution!=='standard')text+=' · '+(m.damageResolution==='true'?'真實傷害（穿透護盾）':'固定傷害（可被護盾吸收）');
    if(sk[5]==='revive')text+=' · 恢復最大生命 '+Math.round((m.reviveHpRatio??.25)*100)+'%';
    if(sk[5]==='cleanse'||sk[5]==='dispel')text+=' · 最多解除 '+(m.dispelCount??99)+' 個';
    if(sk[5]==='heal'&&m.healResolution==='overflowShield')text+=' · 溢出治療轉護盾';
    if(sk[5]==='drain')text+=' · 傷害轉治療 '+Math.round((m.drainRate??1)*100)+'%';
    if(m.onHitStatusId)text+=' · 附加 '+(status().definitions.find(x=>x.id===m.onHitStatusId)?.name||m.onHitStatusId)+' '+Math.round((m.onHitStatusChance??1)*100)+'%';
    return text;
  };
  // Earlier import layers run before this optional module is installed.
  try{const saved=globalThis.__EMBERWILD_BALANCE_FINAL_APPLY_PENDING?null:JSON.parse(balanceSourceText()||'null');if(saved)applyBalanceConfig(saved,{persist:false});}catch(e){console.warn('共用技能效果還原失敗',e);}
})();
