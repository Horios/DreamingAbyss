/* One-hop skill induction. No cooldown writes, natural proc rolls, or recursive casts. */
(()=>{
  'use strict';
  const api=EmberwildInduction,copy=x=>JSON.parse(JSON.stringify(x));
  let inducedDepth=0;
  const runtimeDef=(job,i)=>{const sk=CLASSES[job]?.skills?.[i];return sk?{...sk[6],effect:sk[5],activation:sk[1]}:null;};
  function heroTarget(h,target){
    if(target.kind==='activeSlot')return h.active?.[target.slot];
    if(target.kind==='procSlot')return h.procSlots?.[target.slot];
    if(target.kind==='skill')return CLASSES[h.job]?.skills?.findIndex((sk,i)=>(sk[6]?.sharedId||`job${h.job}-core${i}`)===target.skillId);
    return null;
  }
  function eligible(h,i){
    return Number.isInteger(i)&&i>=0&&h.hp>0&&h.skills?.[i]>0&&runtimeDef(h.job,i)&&
      !api.blocked(runtimeDef(h.job,i))&&coreSkillAvailableToHero(h.job,i,h)&&
      !globalThis.__EMBERWILD_MASTERY?.coreMissingRequirements(h,i,true).length;
  }
  function induceHero(h,i){
    const source=runtimeDef(h.job,i);if(inducedDepth||!api.tagged(source))return 0;
    let count=0;const seen=new Set();
    for(const target of (source.induction?.targets||[]).slice(0,api.MAX_TARGETS)){
      const index=heroTarget(h,target);
      if(index===i||seen.has(index)||!eligible(h,index))continue;
      seen.add(index);
      if(!Number.isFinite(target.chance)||target.chance<=0||Math.random()>=Math.min(1,target.chance))continue;
      inducedDepth++;
      try{
        if(castPartySkill(h,index,battleStats(h))!==false){count++;note(characterName(h)+'・'+CLASSES[h.job].skills[i][0]+' [誘發] → '+CLASSES[h.job].skills[index][0]);}
      }finally{inducedDepth--;}
    }
    return count;
  }
  const castBase=castPartySkill;
  castPartySkill=function(h,i,v){
    const source=runtimeDef(h?.job,i);
    if(!source||inducedDepth&&api.blocked(source))return false;
    if(source.effect===api.EFFECT){
      if(inducedDepth||!api.tagged(source)||!h.skills?.[i]||h.hp<=0||!coreSkillAvailableToHero(h.job,i,h)||globalThis.__EMBERWILD_MASTERY?.coreMissingRequirements(h,i,true).length)return false;
      const count=induceHero(h,i);
      // A valid induction action consumes its normal turn/cooldown even when probability misses.
      if(source.mastery)globalThis.__EMBERWILD_MASTERY?.gainMastery(h,source.mastery,globalThis.__EMBERWILD_MASTERY.masterySettings().skillUseXp);
      note(characterName(h)+'・'+CLASSES[h.job].skills[i][0]+' [誘發]：成功 '+count+' 個技能');
      return true;
    }
    const result=castBase(h,i,v);
    if(result!==false&&!inducedDepth)induceHero(h,i);
    return result;
  };

  function castEnemy(e,sk,base){
    if(!e||e.hp<=0||!sk||sk.meta?.partnerId!=null)return false;
    const source={...sk.meta,effect:sk.effect};
    if(inducedDepth&&api.blocked(source))return false;
    if(sk.effect===api.EFFECT&&(!api.tagged(source)||inducedDepth||e.hp<=0))return false;
    const result=sk.effect===api.EFFECT?true:base(e,sk);
    if(result===false||inducedDepth||!api.tagged(source))return result;
    const row=(GAMEPLAY_SETTINGS.monsters.catalog||[]).find(m=>m.id===e.monsterId),pool=(row?.skillAssignments||[]).map(a=>sharedSkillById(typeof a==='string'?a:a.skillId)).filter(x=>x&&e.lv>=x.requiredLevel&&sharedSkillScopeAllowsEnemy(x.usageScope,e.kind));
    const seen=new Set();
    for(const target of (source.induction?.targets||[]).slice(0,api.MAX_TARGETS)){
      const kind=target.kind==='activeSlot'?'active':'proc',dest=target.kind==='skill'?pool.find(x=>x.id===target.skillId):pool.filter(x=>x.activation===kind)[target.slot];
      if(!dest||dest.id===sk.id||seen.has(dest.id)||api.blocked({...dest.meta,effect:dest.effect})||e.hp<=0)continue;
      seen.add(dest.id);
      if(!Number.isFinite(target.chance)||target.chance<=0||Math.random()>=Math.min(1,target.chance))continue;
      inducedDepth++;
      try{if(globalThis.castEnemySharedSkill(e,dest)!==false)note(combatEnemyName(e)+'・'+sk.name+' [誘發] → '+dest.name);}finally{inducedDepth--;}
    }
    return result;
  }
  globalThis.EmberwildInductionRuntime={castEnemy};

  const validateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const issues=api.validate(input);if(issues.length)throw Error(issues.join('；'));
    const clean=copy(input);
    for(const c of clean.classes||[])for(const sk of c.skills||[])if(sk.effect===api.EFFECT)sk.effect='damage';
    const out=validateBase(clean);
    for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<out.classes[job].skills.length;i++){
      const src=input.classes[job].skills[i],dst=out.classes[job].skills[i];
      if(src.tags!==undefined)dst.tags=copy(src.tags);
      if(src.induction!==undefined)dst.induction=copy(src.induction);
      if(src.effect===api.EFFECT)dst.effect=api.EFFECT;
    }
    return out;
  };
  const exportBase=exportableBalance;
  exportableBalance=function(){
    const out=exportBase();
    for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<out.classes[job].skills.length;i++){
      const def=runtimeDef(job,i),sk=out.classes[job].skills[i];
      sk.tags=copy(def.tags||[]);
      if(def.induction)sk.induction=copy(def.induction);else delete sk.induction;
      if(def.effect===api.EFFECT)sk.effect=api.EFFECT;
    }
    return out;
  };
  const applyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const full=validateBalanceConfig(input),clean=copy(full);
    for(const c of clean.classes||[])for(const sk of c.skills||[])if(sk.effect===api.EFFECT)sk.effect='damage';
    const out=applyBase(clean,{persist:false});
    for(let job=0;job<CLASSES.length;job++)for(let i=0;i<CLASSES[job].skills.length;i++){
      const src=full.classes[job].skills[i],sk=CLASSES[job].skills[i];
      // Reset/apply can reinstall a built-in late skill absent from old JSON.
      if(!src){if(sk[6]){delete sk[6].tags;delete sk[6].induction;}continue;}
      sk[6]??={};sk[6].tags=copy(src.tags||[]);
      if(src.induction)sk[6].induction=copy(src.induction);else delete sk[6].induction;
      if(src.effect===api.EFFECT){sk[5]=api.EFFECT;sk[6].effects=[{kind:api.EFFECT}];}
    }
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    if(state)render();return full;
  };
  const resetBase=resetBalanceJSON;
  resetBalanceJSON=function(){for(const c of CLASSES)for(const sk of c.skills){delete sk[6]?.tags;delete sk[6]?.induction;}return resetBase();};

  const detailBase=coreSkillDetail;
  coreSkillDetail=function(job,i,h=state){
    const def=runtimeDef(job,i),base=def?.effect===api.EFFECT?('誘發其他技能（不造成直接傷害） · '+(def.activation==='active'?'冷卻 '+skillCooldown(i,h)+' 回合':'普攻觸發率 '+Math.round(procChance(i,h)*100)+'%')):detailBase(job,i,h);
    if(!api.tagged(def))return base;
    const targets=(def.induction?.targets||[]).map(t=>{
      let name=t.kind==='skill'?(sharedSkillById(t.skillId)?.name||t.skillId):(t.kind==='activeSlot'?'主動槽':'觸發槽')+' '+(t.slot+1);
      return name+' '+Math.round(t.chance*100)+'%';
    });
    return base+' · 誘發：'+targets.join('、')+' · 無視目標冷卻／最多一層／不可誘發誘發技能';
  };
  const badgesBase=skillTypeBadges;
  skillTypeBadges=function(job,i,group='core'){return badgesBase(job,i,group)+(group==='core'&&api.tagged(runtimeDef(job,i))?'<span class="tag">誘發</span>':'');};
  // Earlier layers load saved JSON before this late module is available.
  try{const saved=globalThis.__EMBERWILD_BALANCE_FINAL_APPLY_PENDING?null:JSON.parse(balanceSourceText()||'null');if(saved)applyBalanceConfig(saved,{persist:false});}catch(e){console.warn('誘發技能資料還原失敗',e);}
})();
