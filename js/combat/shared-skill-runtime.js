/* Shared player/monster core-skill pool.
   Monsters keep only skillId references; definitions remain in CLASSES / SKILL_ELEMENTS. */
(()=>{
  let enemySharedCooldowns=Object.create(null);
  globalThis.EmberwildEnemyCombatState={pack:()=>enemySharedCooldowns,restore:v=>{enemySharedCooldowns=v||Object.create(null);}};

  const BASIC_EFFECTS=new Set(['cleanse','dispel','revive','damage','heal','shield','drain','nextActiveDamage','advanceNextRound','shieldLowest','applyStatus','induceSkill']);
  const idFor=(job,index)=>CLASSES[job]?.skills?.[index]?.[6]?.sharedId||`job${job}-core${index}`;
  function sharedCoreSkillPool(){
    const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;if(cache?.sharedSkillPool)return cache.sharedSkillPool;
    const out=[];
    for(let job=0;job<CLASSES.length;job++)for(let index=0;index<(CLASSES[job]?.skills?.length||0);index++){
      const sk=CLASSES[job].skills[index],meta=sk?.[6]&&typeof sk[6]==='object'?sk[6]:{};
      const usageScope=['character','monster','elite','boss','shared'].includes(meta.usageScope)?meta.usageScope:'character';
      out.push({id:idFor(job,index),job,index,name:sk[0],activation:sk[1],requiredLevel:sk[2],cooldown:Math.max(0,Math.round(Number(sk[3])||0)),power:Math.max(0,Number(sk[4])||0),effect:sk[5],element:SKILL_ELEMENTS[job]?.[index]||'physical',maxTargets:Math.max(1,Math.floor(Number(meta.maxTargets)||1)),usageScope,meta});
    }
    if(cache)cache.sharedSkillPool=out;return out;
  }
  globalThis.sharedCoreSkillPool=sharedCoreSkillPool;
  function sharedSkillById(id){return sharedCoreSkillPool().find(x=>x.id===id)||null;}
  globalThis.sharedSkillById=sharedSkillById;
  function monsterRow(e){return (GAMEPLAY_SETTINGS?.monsters?.catalog||[]).find(m=>m.id===e?.monsterId)||null;}
  function scopeAllowsEnemy(scope,kind){if(scope==='shared')return true;if(scope==='monster')return kind==='normal';if(scope==='elite')return kind==='elite';if(scope==='boss')return kind==='boss'||kind==='final';return false;}
  function scopeAllowsHero(scope){return scope==='character'||scope==='shared';}
  globalThis.sharedSkillScopeAllowsEnemy=scopeAllowsEnemy;
  globalThis.sharedSkillScopeAllowsHero=scopeAllowsHero;
  function assignments(e){return (monsterRow(e)?.skillAssignments||[]).map(a=>sharedSkillById(a?.skillId)).filter(Boolean).filter(sk=>sk.meta?.partnerId==null&&e.lv>=sk.requiredLevel&&scopeAllowsEnemy(sk.usageScope,e.kind));}
  function cdBox(e){return enemySharedCooldowns[e.id]??=(Object.create(null));}
  function tickCooldowns(e){const box=cdBox(e);for(const k of Object.keys(box))box[k]=Math.max(0,Math.floor(Number(box[k])||0)-1);}
  function activeReady(e,previewTick=false){const box=cdBox(e);return assignments(e).find(sk=>sk.activation==='active'&&BASIC_EFFECTS.has(sk.effect)&&Math.max(0,(box[sk.id]||0)-(previewTick?1:0))<=0)||null;}
  function heroTargets(sk){
    const alive=[...living()];if(!alive.length)return [];
    if(sk.meta?.target==='weakest'||sk.effect==='heal'||sk.effect==='shieldLowest')return [alive.sort((a,b)=>a.hp/battleStats(a).hp-b.hp/battleStats(b).hp)[0]];
    const n=sk.meta?.target==='enemies'||sk.maxTargets>=99?alive.length:Math.max(1,sk.maxTargets||1);
    for(let i=alive.length-1;i>0;i--){const j=rand(i+1);[alive[i],alive[j]]=[alive[j],alive[i]];}
    return alive.slice(0,Math.min(n,alive.length));
  }
  function foeAllies(){return foes.filter(x=>x.hp>0);}
  function weakestFoe(){return [...foeAllies()].sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp)[0]||null;}
  function enemySkillProfile(e,sk){
    const v=enemyBattleStats(e),meta=sk.meta||{},baseCrit=Number(GS('combat.baseCritDamage',1.5))||1.5;
    return {
      critChance:Math.max(0,Math.min(1,v.crit+(Number(meta.baseCritRate)||0))),
      critDamage:Math.max(1,(Number(meta.baseCritDamage)||baseCrit)+(v.critDamage-baseCrit)),
      pierce:Math.max(0,v.pierce+(Number(meta.defensePenetration)||0)),
      defenseIgnore:Math.max(0,Math.min(1,v.defenseIgnore+(Number(meta.defenseIgnore)||0)))
    };
  }
  function damageHero(e,h,amount,element,sk){
    const ev=enemyBattleStats(e),hv=battleStats(h),profile=enemySkillProfile(e,sk),c=GAMEPLAY_SETTINGS.combat,formula=c.damageFormula||{},atkCoef=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defCoef=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(c.defenseEffectiveness??.55),min=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
    if(Math.random()<hv.evasion){globalThis.EmberwildBattleEffects?.result('evade',h,e);note(characterName(h)+'閃避了'+combatEnemyName(e)+'的「'+sk.name+'」');return 0;}
    const ignore=Math.min(.95,profile.defenseIgnore),effectiveDef=Math.max(0,hv.def*(1-ignore)-profile.pierce);
    let hit=Math.max(min,amount*atkCoef-effectiveDef*defCoef);
    const crit=Math.random()<profile.critChance;if(crit)hit*=profile.critDamage;
    hit*=1+(ev.elementDamage?.[element]||0)+(element==='physical'?0:(ev.elementBonus||0));
    hit*=1-Math.min(c.caps?.guard??.75,effectTotal(heroKey(h),'guard'));
    const resist=Math.min(c.caps?.resistance??.75,(hv.resist?.[element]||0)+supplyEffect(h,'ward',element));
    hit=Math.max(min,Math.round(hit*(1-resist)));
    const absorb=Math.min(h.shield,hit);h.shield-=absorb;if(absorb>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'mitigation',absorb);
    const hpDamage=Math.max(0,hit-absorb),before=h.hp;h.hp=Math.max(0,h.hp-hpDamage);
    globalThis.EmberwildBattleEffects?.result('resolved',h,e,{critical:crit});
    const dealt=Math.max(0,before-h.hp);if(typeof recordCombatContribution==='function')recordCombatContribution(h,'taken',absorb+dealt);if(crit&&dealt>0)globalThis.EmberwildBattleEffects?.result('critical',h,e);globalThis.EmberwildTokenRuntime?.afterDamage(h,e,before,h.hp);
    if(before>0&&h.hp<=0&&typeof recordBattleDeath==='function')recordBattleDeath(h,e,sk.name);
    return dealt;
  }
  globalThis.sharedEnemySkillDamage=damageHero;
  function applyEnemyStatusSkill(e,sk){
    const api=globalThis.__EMBERWILD_STATUS_TEST_API,meta=sk.meta||{};if(!api?.apply||!meta.statusId)return false;
    const mode=meta.statusTarget||'enemy';let targets=[];
    if(mode==='self')targets=[e];
    else if(mode==='allies')targets=foeAllies();
    else if(mode==='weakest'){const t=weakestFoe();if(t)targets=[t];}
    else if(mode==='enemies')targets=[...living()];
    else{const hs=heroTargets({...sk,maxTargets:1,meta:{...meta,target:'enemy'}});targets=hs.slice(0,1);}
    let ok=false;for(const t of targets)ok=api.apply(meta.statusId,e,t)||ok;return ok;
  }
  function castEnemySharedSkillEffect(e,sk){
    if(!e||e.hp<=0||!sk||sk.meta?.partnerId!=null||!BASIC_EFFECTS.has(sk.effect))return false;
    const common=globalThis.EmberwildSkillEffectRuntime;
    if(common?.configured({...sk.meta,effect:sk.effect}))return common.castEnemy(e,sk);
    const v=enemyBattleStats(e),basePower=v.atk*sk.power*(1+effectTotal(e.id,'power'))*(1-Math.min(GAMEPLAY_SETTINGS.combat.caps.weaken,effectTotal(e.id,'weaken'))),element=sk.element||e.element||'physical';
    if(sk.effect==='heal'){
      const target=weakestFoe()||e,before=target.hp;target.hp=Math.min(target.maxhp,target.hp+Math.round(basePower));note(combatEnemyName(e)+'・'+sk.name+' → '+combatEnemyName(target)+' 恢復 '+Math.max(0,target.hp-before)+' 生命');return true;
    }
    if(sk.effect==='shield'||sk.effect==='shieldLowest'){
      const target=sk.effect==='shieldLowest'?(weakestFoe()||e):e,amount=Math.max(0,Math.round(basePower)),before=Math.max(0,Number(target.shield)||0);target.shield=Math.max(before,amount);note(combatEnemyName(e)+'・'+sk.name+' → '+combatEnemyName(target)+' 護盾 '+Math.round(target.shield));return true;
    }
    if(sk.effect==='nextActiveDamage'){e.nextActiveDamageBonus=Math.max(0,Number(e.nextActiveDamageBonus)||0)+sk.power;note(combatEnemyName(e)+'・'+sk.name+' → 下次主動技能傷害 +'+Math.round(sk.power*100)+'%');return true;}
    if(sk.effect==='advanceNextRound'){e.sharedAdvanceRound=round+1;e.sharedAdvanceSteps=Math.min(5,Math.max(0,Number(e.sharedAdvanceSteps)||0)+1);note(combatEnemyName(e)+'・'+sk.name+' → 下回合行動提前 1 格');return true;}
    if(sk.effect==='applyStatus')return applyEnemyStatusSkill(e,sk);
    const targets=heroTargets(sk);if(!targets.length)return false;
    const stored=sk.activation==='active'?Math.max(0,Number(e.nextActiveDamageBonus)||0):0,power=basePower*((stored>0)?1+stored:1);let total=0,parts=[];
    for(const h of targets){const dealt=damageHero(e,h,power,element,sk);total+=dealt;parts.push(characterName(h)+' '+dealt);}
    if(sk.effect==='drain'||v.lifesteal>0){const rate=(sk.effect==='drain'?1:0)+Math.max(0,v.lifesteal||0),heal=Math.round(total*rate);e.hp=Math.min(e.maxhp,e.hp+heal);}
    if(sk.activation==='active'&&stored>0)delete e.nextActiveDamageBonus;
    note(combatEnemyName(e)+'・'+sk.name+' → '+parts.join('、')+' 傷害','enemyDamage');return true;
  }
  function castEnemySharedSkill(e,sk){
    if(globalThis.EmberwildInductionRuntime)return EmberwildInductionRuntime.castEnemy(e,sk,castEnemySharedSkillEffect);
    return castEnemySharedSkillEffect(e,sk);
  }
  globalThis.castEnemySharedSkill=castEnemySharedSkill;
  function procChance(sk){const m=sk.meta||{},base=Number(m.procBaseChance);return Math.max(0,Math.min(1,Number.isFinite(base)?base:Number(GS('skills.proc.baseChance',.22))||.22));}
  function enemyControlState(e){return globalThis.EmberwildControlState?.states?.[e?.id]||null;}
  globalThis.performSharedEnemyAction=function(e){
    if(e.__secondsBasic){performEnemyBasic(e);for(const proc of assignments(e).filter(x=>x.activation==='proc'&&BASIC_EFFECTS.has(x.effect)))if(Math.random()<procChance(proc))castEnemySharedSkill(e,proc);return 'attack';}
    const control=enemyControlState(e);
    if(e?.__controlSkip||control?.rage?.turns>0){performEnemyBasic(e);return 'controlled';}
    const sk=activeReady(e);tickCooldowns(e);
    if(sk&&castEnemySharedSkill(e,sk)){e.turn=(e.turn||0)+1;cdBox(e)[sk.id]=sk.cooldown;return 'skill';}
    performEnemyBasic(e);
    for(const proc of assignments(e).filter(x=>x.activation==='proc'&&BASIC_EFFECTS.has(x.effect)))if(Math.random()<procChance(proc))castEnemySharedSkill(e,proc);
    return 'attack';
  };
  globalThis.performEnemyActionCore=globalThis.performSharedEnemyAction;
  globalThis.sharedEnemyActionLabel=function(e){const control=enemyControlState(e);return e?.__controlSkip||control?.rage?.turns>0?'攻擊':activeReady(e)?'技能':'攻擊';};
  globalThis.enemySharedSkillStatus=function(e){
    const rows=assignments(e);if(!rows.length||e.hp<=0)return '';
    const box=cdBox(e);return rows.map(sk=>'<span class="tag">'+esc(sk.name)+(sk.activation==='active'?' · '+((box[sk.id]||0)>0?'冷卻 '+box[sk.id]:'就緒'):' · 普攻觸發')+'</span>').join('');
  };
  const initiativeBase=initiativeOrder;
  initiativeOrder=function(){
    const order=initiativeBase();
    for(let i=1;i<order.length;i++){const u=order[i];if(u.side!=='enemy')continue;const e=u.actor,steps=e.sharedAdvanceRound===round?Math.min(5,Math.max(0,Number(e.sharedAdvanceSteps)||0)):0;if(steps){const to=Math.max(0,i-steps);order.splice(i,1);order.splice(to,0,u);delete e.sharedAdvanceRound;delete e.sharedAdvanceSteps;}}
    return order;
  };
  const resetBase=resetEncounter;
  resetEncounter=function(){enemySharedCooldowns=Object.create(null);return resetBase();};
  const spawnBase=spawnGroup;
  spawnGroup=function(...args){const out=spawnBase(...args);enemySharedCooldowns=Object.create(null);for(const e of foes||[])cdBox(e);return out;};

  const SHARED_USAGE_SCOPES=new Set(['character','monster','elite','boss','shared']);
  function prepareSharedSkillInput(input){
    const copy=JSON.parse(JSON.stringify(input||{})),monsters=copy.balanceSettings?.monsters;
    if(monsters&&(Array.isArray(monsters.skills)||monsters.skillSystem!==undefined)){
      delete monsters.skills;delete monsters.skillSystem;
      for(const row of monsters.catalog||[])if(row&&typeof row==='object')delete row.skillAssignments;
    }
    return copy;
  }
  function validateSharedSkillInput(input){
    const skillById=new Map();
    for(const [job,c] of (input?.classes||[]).entries())for(const [index,sk] of (c?.skills||[]).entries()){
      const id=typeof sk?.id==='string'&&sk.id.trim()?sk.id.trim():`job${job}-core${index}`;
      if(skillById.has(id))throw Error('核心技能 ID 重複：'+id);
      const usage=SHARED_USAGE_SCOPES.has(sk?.usageScope)?sk.usageScope:'character';
      skillById.set(id,{id,usage,effect:sk?.effect||'',name:sk?.name||id});
    }
    for(const row of input?.balanceSettings?.monsters?.catalog||[]){
      const seen=new Set();
      for(const raw of row?.skillAssignments||[]){
        const id=typeof raw==='string'?raw:raw?.skillId;
        if(typeof id!=='string'||!id.trim())throw Error('怪物技能引用缺少 skillId：'+(row?.id||'未知怪物'));
        if(seen.has(id))throw Error('怪物技能引用重複：'+(row?.id||'未知怪物')+' → '+id);seen.add(id);
        const sk=skillById.get(id);if(!sk)throw Error('怪物引用不存在的核心技能：'+(row?.id||'未知怪物')+' → '+id);
        const kind=row?.kind,allowed=sk.usage==='shared'||((kind==='normal'||kind==='elite')&&(sk.usage==='elite'||kind==='normal'&&sk.usage==='monster'))||((kind==='boss'||kind==='final')&&sk.usage==='boss');
        if(!allowed)throw Error('怪物技能用途分類不相容：'+(row?.id||'未知怪物')+' → '+sk.name);
        if(!BASIC_EFFECTS.has(sk.effect))throw Error('此核心技能效果目前不支援怪物施放：'+sk.name);
      }
    }
    return input;
  }

  // Preserve stable IDs from imported balance data even though the compact runtime array itself is positional.
  const applyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,options={}){
    const prepared=validateSharedSkillInput(prepareSharedSkillInput(input));
    const ids=(prepared?.classes||[]).map((c,job)=>(c.skills||[]).map((sk,i)=>sk?.id||`job${job}-core${i}`));
    const scopes=(prepared?.classes||[]).map(c=>(c.skills||[]).map(sk=>SHARED_USAGE_SCOPES.has(sk?.usageScope)?sk.usageScope:'character'));
    const persist=options?.persist!==false,out=applyBase(prepared,{...options,persist:false});
    for(let job=0;job<ids.length;job++)for(let i=0;i<ids[job].length;i++){const sk=CLASSES[job]?.skills?.[i];if(sk){sk[6]??={};sk[6].sharedId=ids[job][i];sk[6].usageScope=scopes[job][i];}}
    if(typeof syncAllHeroSkillArrays==='function')syncAllHeroSkillArrays();
    if(party?.members)for(const h of party.members)cleanHeroSkillSlots(h);else cleanHeroSkillSlots(state);
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    return out;
  };
  for(let job=0;job<CLASSES.length;job++)for(let i=0;i<CLASSES[job].skills.length;i++){CLASSES[job].skills[i][6]??={};CLASSES[job].skills[i][6].sharedId??=`job${job}-core${i}`;CLASSES[job].skills[i][6].usageScope??='character';}

  globalThis.coreSkillUsageScope=function(job,index){return sharedCoreSkillPool().find(x=>x.job===job&&x.index===index)?.usageScope||'character';};
  globalThis.coreSkillAvailableToHero=function(job,index,h=state){return scopeAllowsHero(coreSkillUsageScope(job,index))&&(typeof skillAllowedForPartner!=='function'||skillAllowedForPartner(h,CLASSES[job]?.skills?.[index]?.[6]));};
  function cleanHeroSkillSlots(h){
    if(!h)return;
    if(Array.isArray(h.active))h.active=h.active.map(i=>i===null||coreSkillAvailableToHero(h.job,i,h)?i:null);
    if(Array.isArray(h.procSlots))h.procSlots=h.procSlots.map(i=>i===null||coreSkillAvailableToHero(h.job,i,h)?i:null);
  }
  if(typeof learn==='function'){const base=learn;learn=function(i){if(!coreSkillAvailableToHero(state.job,i))return toast('此技能分類不提供人物學習');return base(i);};}
  if(typeof equipSkill==='function'){const base=equipSkill;equipSkill=function(i,slot){if(!coreSkillAvailableToHero(state.job,i))return toast('此技能分類不提供人物使用');return base(i,slot);};}
  if(typeof slotProcSkill==='function'){const base=slotProcSkill;slotProcSkill=function(i,slot){if(i!==null&&!coreSkillAvailableToHero(state.job,i))return toast('此技能分類不提供人物使用');return base(i,slot);};}
  if(typeof validProcIndex==='function'){const base=validProcIndex;validProcIndex=function(h,i){return coreSkillAvailableToHero(h.job,i,h)&&base(h,i);};}
  if(typeof castPartySkill==='function'){const base=castPartySkill;castPartySkill=function(h,i,v){if(!h?.skills?.[i]||!coreSkillAvailableToHero(h.job,i,h)||globalThis.__EMBERWILD_MASTERY?.coreMissingRequirements(h,i,true).length)return false;return base(h,i,v);};}

  if(typeof exportableBalance==='function'){
    const base=exportableBalance;
    exportableBalance=function(){const out=base();for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<(out.classes[job]?.skills||[]).length;i++){const def=sharedCoreSkillPool().find(x=>x.job===job&&x.index===i);if(def){out.classes[job].skills[i].id=def.id;out.classes[job].skills[i].usageScope=def.usageScope;}}return out;};
  }

  // Startup imports persisted balance before this late module exists. Reapply once after
  // shared IDs/scopes are installed so monster assignments remain stable after reload.
  try{
    const saved=balanceSourceText();
    if(saved)applyBalanceConfig(JSON.parse(saved),{persist:false});
    else if(party?.members)for(const h of party.members)cleanHeroSkillSlots(h);
  }catch(e){console.warn('共用技能池後段重載失敗',e);}
})();
