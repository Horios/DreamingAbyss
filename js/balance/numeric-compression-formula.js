
/* Numeric compression v1:
   - Low-number baseline for characters, monsters, equipment and skills.
   - Defense order: target-side reduction -> percentage defense ignore -> flat defense penetration.
   - Core skills can have independent base crit / crit damage / penetration / ignore.
   - Supply items can grant temporary primary and derived stats.
*/
(()=>{
  const COMPRESSION_VERSION=1;
  const SKILL_META_DEFAULTS={baseCritRate:0,baseCritDamage:1.5,defensePenetration:0,defenseIgnore:0};
  const ITEM_STAT_KEYS=['hp','attack','defense','attackPct','critRate','critDamage','defensePenetration','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage','speed'];
  const clone=v=>JSON.parse(JSON.stringify(v));

  function ensureCompressionSettings(s){
    if(!s||typeof s!=='object')return s;
    s.meta??={};
    s.meta.numericCompressionVersion=COMPRESSION_VERSION;
    s.progression??={};s.progression.statsPerLevel??={};s.progression.advance??={};
    Object.assign(s.progression.statsPerLevel,{hp:4,attack:1,defense:1});
    s.skills??={};s.skills.core??={};s.skills.gems??={};
    s.skills.core.effectPerExtraLevel=.18;
    Object.assign(s.skills.gems,{effectMultiplier:1.10,hybridMultiplier:1.05,hybridActiveHealAttack:.10});
    s.equipment??={};s.equipment.baseStats??={};s.equipment.enhance??={};s.equipment.boss??={};s.equipment.difficultyAffix??={};
    Object.assign(s.equipment.difficultyAffix,{baseAttackPerTier:.6,baseHpPerTier:2.2,defenseBasePerTier:.5,defensePerRankPerTier:.2,critBase:2,critPerRank:2});
    s.combat??={};s.combat.damageFormula??={};
    Object.assign(s.combat.damageFormula,{attackCoefficient:1,defenseCoefficient:.55,minimumDamage:1});
    s.combat.defenseEffectiveness=s.combat.damageFormula.defenseCoefficient;
    EmberwildProgression.applyDefaults(s);
    return s;
  }
  function ensureCompressionBalance(b){
    if(!b||typeof b!=='object')return b;
    b.combat??={};b.combat.statCaps??={};
    Object.assign(b.combat.statCaps,{crit:.75,pierce:30,defenseIgnore:.75,evasion:.35,lifesteal:.2});
    b.affixes??={};b.affixes.extendedValues??={};
    b.affixes.extendedValues.defenseIgnore??={normal:0,fine:4,rare:8,legendary:12};
    if(b.affixes.extendedValues.pierce)Object.assign(b.affixes.extendedValues.pierce,{normal:1,fine:2,rare:4,legendary:6});
    if(b.affixes.extendedValues.critDamage)Object.assign(b.affixes.extendedValues.critDamage,{normal:4,fine:8,rare:12,legendary:16});
    if(b.affixes.extendedValues.attackPercent)Object.assign(b.affixes.extendedValues.attackPercent,{normal:0,fine:0,rare:2,legendary:4});
    if(b.affixes.baseValues){
      if(b.affixes.baseValues.attackPerTier)Object.assign(b.affixes.baseValues.attackPerTier,{min:0,max:1});
      if(b.affixes.baseValues.hpPerTier)Object.assign(b.affixes.baseValues.hpPerTier,{min:1,max:3});
      if(b.affixes.baseValues.defensePerTier)Object.assign(b.affixes.baseValues.defensePerTier,{min:0,max:1});
      if(b.affixes.baseValues.critPercent)Object.assign(b.affixes.baseValues.critPercent,{min:2,max:4,cap:12});
    }
    return b;
  }
  function skillDefaultsFor(job,i){
    return {...SKILL_META_DEFAULTS,baseCritDamage:GS('combat.baseCritDamage',1.5)};
  }
  function normalizeSkillExtras(sk,job,i){
    const d=skillDefaultsFor(job,i);
    sk.baseCritRate=Number.isFinite(Number(sk.baseCritRate))?Math.max(0,Math.min(1,Number(sk.baseCritRate))):d.baseCritRate;
    sk.baseCritDamage=Number.isFinite(Number(sk.baseCritDamage))?Math.max(1,Number(sk.baseCritDamage)):d.baseCritDamage;
    sk.defensePenetration=Number.isFinite(Number(sk.defensePenetration))?Math.max(0,Number(sk.defensePenetration)):d.defensePenetration;
    sk.defenseIgnore=Number.isFinite(Number(sk.defenseIgnore))?Math.max(0,Math.min(1,Number(sk.defenseIgnore))):d.defenseIgnore;
    return sk;
  }
  function normalizeStatEffects(raw){
    const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
    for(const key of ITEM_STAT_KEYS){const n=Number(raw[key]);if(Number.isFinite(n)&&n!==0)out[key]=n;}
    return out;
  }
  function compressDocument(doc){
    const out=clone(doc||{}),fresh=(out.balanceSettings?.meta?.numericCompressionVersion||0)<COMPRESSION_VERSION;
    out.balanceSettings??={};out.balance??={};
    if(fresh){
      ensureCompressionSettings(out.balanceSettings);ensureCompressionBalance(out.balance);
      const powers=[
        [1.35,.9,.65,.4,2.05,.8],
        [1.55,.9,.8,.45,2.6,1.15],
        [1.45,.8,.75,.95,2.15,.55],
        [1.4,1,.7,.65,2.0,.9]
      ];
      (out.classes||[]).forEach((cls,job)=>{
        EmberwildProgression.applyClassDefaults(cls,job);
        (cls.skills||[]).forEach((sk,i)=>{if(Number.isFinite(powers[job]?.[i]))sk.power=powers[job][i];});
      });
      if(out.equipmentPowerSystem?.strength?.multipliers)out.equipmentPowerSystem.strength.multipliers=clone(EmberwildProgression.defaults.powerMultipliers);
      for(const list of [out.equipmentPowerSystem?.prefixes,out.equipmentPowerSystem?.suffixes])for(const x of list||[])if(x?.effect?.key==='pierce')x.effect.value=Math.max(1,Number((Number(x.effect.value||0)*.6).toFixed(2)));
      for(const x of out.equipmentPowerSystem?.bossAffixes||[])for(const e of x.effects||[])if(e?.key==='pierce')e.value=Math.max(1,Number((Number(e.value||0)*.6).toFixed(2)));
    }else{
      out.balanceSettings.meta??={};out.balanceSettings.meta.numericCompressionVersion=COMPRESSION_VERSION;
      out.balanceSettings.combat??={};out.balanceSettings.combat.damageFormula??={attackCoefficient:1,defenseCoefficient:.55,minimumDamage:1};
      out.balance.combat??={};out.balance.combat.statCaps??={};out.balance.combat.statCaps.defenseIgnore??=.75;
      out.balance.affixes??={};out.balance.affixes.extendedValues??={};out.balance.affixes.extendedValues.defenseIgnore??={normal:0,fine:4,rare:8,legendary:12};
      // Old v1 JSON used the same encounter/difficulty multipliers for gold and EXP.
      const rewards=out.balanceSettings.rewards??={};rewards.xp??={};
      rewards.xp.kindMultiplier??=clone(rewards.kindMultiplier||EmberwildProgression.defaults.settings.rewards.xp.kindMultiplier);
      for(const [i,d] of (out.balanceSettings.difficulty?.modes||[]).entries())d.xpMultiplier??=d.reward??EmberwildProgression.defaults.settings.difficulty.modes[i].xpMultiplier;
    }
    (out.classes||[]).forEach((cls,job)=>(cls.skills||[]).forEach((sk,i)=>normalizeSkillExtras(sk,job,i)));
    for(const item of out.items||[])item.statEffects=normalizeStatEffects(item.statEffects);
    return out;
  }

  // Defaults used when there is no imported test balance.
  // Only transform the immutable built-in defaults here. Live/imported settings are
  // version-migrated by compressDocument(), so user-edited v1 values are never overwritten on reload.
  ensureCompressionSettings(GAMEPLAY_SETTINGS_DEFAULTS);
  ensureCompressionBalance(GAME_BALANCE_DEFAULTS);

  // Random affix type 7 is now flat penetration; type 18 is percentage defense ignore.
  const compressionRollAffixesBase=rollAffixes;
  rollAffixes=function(g){
    return compressionRollAffixesBase(g).map(a=>{
      if(a?.type===7)a.value=Math.max(1,Math.round(Number(a.value)||0));
      return a;
    }).map(a=>{
      const cfg=GAME_BALANCE.affixes,key=balanceQualityKey(a.rank),ignore=Number(cfg.extendedValues?.defenseIgnore?.[key])||0;
      if(ignore>0&&Math.random()<Math.max(0,Math.min(1,Number(cfg.extendedPoolChance)||0))*.16){
        return {type:18,rank:a.rank,value:ignore};
      }
      return a;
    });
  };
  const compressionAffixLabelBase=affixLabel;
  affixLabel=function(a,g){
    if(a?.type===7)return '防禦穿透 +'+Number(a.value||0);
    if(a?.type===18)return '防禦無視 +'+Number(a.value||0)+'%';
    return compressionAffixLabelBase(a,g);
  };

  // Temporary item stats are applied after the permanent character/equipment calculation.
  const compressionStatsBase=stats;
  stats=function(h=state){
    const v=compressionStatsBase(h),effects={};let attackPct=0,speed=0;
    for(const key of ['imbue','ward','elementTonic'])for(const buff of activeSupplies(h,key)){
      const src=normalizeStatEffects(buff.statEffects);
      for(const [k,n] of Object.entries(src))effects[k]=(effects[k]||0)+n;
    }
    v.hp+=(effects.hp||0);v.atk+=(effects.attack||0);v.def+=(effects.defense||0);attackPct+=effects.attackPct||0;
    v.crit+=(effects.critRate||0)/100;v.critDamage+=(effects.critDamage||0)/100;
    v.pierce+=(effects.defensePenetration||0);v.defenseIgnore+=(effects.defenseIgnore||0)/100;
    v.lifesteal+=(effects.lifesteal||0)/100;v.evasion+=(effects.evasion||0)/100;v.elementBonus+=(effects.elementBonus||0)/100;v.bossDamage+=(effects.bossDamage||0)/100;speed+=effects.speed||0;
    if(attackPct)v.atk*=1+attackPct/100;
    v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,Math.max(0,v.crit));
    v.pierce=Math.min(GAME_BALANCE.combat.statCaps.pierce,Math.max(0,v.pierce));
    v.defenseIgnore=Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,Math.max(0,v.defenseIgnore||0));
    v.lifesteal=Math.min(GAME_BALANCE.combat.statCaps.lifesteal,Math.max(0,v.lifesteal));
    v.evasion=Math.min(GAME_BALANCE.combat.statCaps.evasion,Math.max(0,v.evasion));
    v.speed=Math.round((Number(v.speed)||0)+speed);
    for(const k of ['hp','atk','def'])v[k]=Math.max(0,Math.round(v[k]));
    return v;
  };
  solo.stats=stats;

  function runtimeSkillMeta(job,i){
    const sk=CLASSES[job]?.skills?.[i];if(!sk)return skillDefaultsFor(job,i);
    if(!sk[6]||typeof sk[6]!=='object'||Array.isArray(sk[6]))sk[6]={};
    const d=skillDefaultsFor(job,i),m=sk[6];
    if(!Number.isFinite(m.baseCritRate))m.baseCritRate=d.baseCritRate;
    if(!Number.isFinite(m.baseCritDamage))m.baseCritDamage=d.baseCritDamage;
    if(!Number.isFinite(m.defensePenetration))m.defensePenetration=d.defensePenetration;
    if(!Number.isFinite(m.defenseIgnore))m.defenseIgnore=d.defenseIgnore;
    m.baseCritRate=Math.max(0,Math.min(1,Number(m.baseCritRate)));
    m.baseCritDamage=Math.max(1,Number(m.baseCritDamage));
    m.defensePenetration=Math.max(0,Number(m.defensePenetration));
    m.defenseIgnore=Math.max(0,Math.min(1,Number(m.defenseIgnore)));
    return m;
  }
  function skillCombatProfile(h,i,v=battleStats(h)){
    const m=runtimeSkillMeta(h.job,i),base=GS('combat.baseCritDamage',1.5);
    return {
      critChance:Math.min(GAME_BALANCE.combat.statCaps.crit,Math.max(0,v.crit+m.baseCritRate)),
      critDamage:Math.max(1,m.baseCritDamage+(v.critDamage-base)),
      defensePenetration:Math.max(0,v.pierce+m.defensePenetration),
      defenseIgnore:Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,Math.max(0,(v.defenseIgnore||0)+m.defenseIgnore))
    };
  }
  globalThis.skillCombatProfile=skillCombatProfile;

  // Final player-hit formula. Defense ignore is applied before flat penetration.
  resolveHit=function(e,amount,h,element,crit,options={}){
    const v=battleStats(h),formula=GAMEPLAY_SETTINGS.combat.damageFormula||{},attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(GAMEPLAY_SETTINGS.combat.defenseEffectiveness??.55),minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
    const enemyStats=typeof enemyBattleStats==='function'?enemyBattleStats(e):null;
    if(enemyStats?.evasion>0&&Math.random()<enemyStats.evasion){globalThis.EmberwildBattleEffects?.result('evade',e,h);note(combatEnemyName(e)+'閃避了'+characterName(h)+'的攻擊');return 0;}
    const bossBonus=(e?.kind==='boss'||e?.kind==='final')?(v.bossDamage||0):0;
    const rawAmount=amount*(1+bossBonus),fracture=Math.min(GAMEPLAY_SETTINGS.combat.caps.fracture,effectTotal(e.id,'fracture'));
    const ignore=Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,Math.max(0,Number.isFinite(options.defenseIgnore)?options.defenseIgnore:(v.defenseIgnore||0)));
    const penetration=Math.min(GAME_BALANCE.combat.statCaps.pierce,Math.max(0,Number.isFinite(options.defensePenetration)?options.defensePenetration:v.pierce));
    const afterIgnore=Math.max(0,e.def*(1-fracture)*(1-ignore)),effectiveDefense=Math.max(0,afterIgnore-penetration);
    let d=Math.max(minimumDamage,Math.round(rawAmount*attackCoefficient-effectiveDefense*defenseCoefficient));
    if(crit)d=Math.round(d*Math.max(1,Number.isFinite(options.critDamage)?options.critDamage:v.critDamage));
    const bonus=(v.elementDamage[element]||0)+(element==='physical'?0:v.elementBonus)+supplyEffect(h,'elementTonic',element);
    const amp=effectTotal(e.id,'damageAmp')+effectTotal(e.id,'vulnerable');
    d=Math.max(minimumDamage,Math.round(d*elementFactor(element,e.element)*(1+bonus)*(1+(v.raceDamage[e.race]||0))*(1+amp)));
    const guard=Math.min(GAMEPLAY_SETTINGS.combat.caps.guard,effectTotal(e.id,'guard'));
    if(guard)d=Math.max(minimumDamage,Math.round(d*(1-guard)));
    const resistance=Math.min(GAMEPLAY_SETTINGS.combat.caps.resistance,enemyStats?.resist?.[element]||0);
    if(resistance)d=Math.max(minimumDamage,Math.round(d*(1-resistance)));
    const absorb=Math.min(Math.max(0,Number(e.shield)||0),d);e.shield=Math.max(0,(Number(e.shield)||0)-absorb);d-=absorb;
    const actual=Math.min(e.hp,d);e.hp=Math.max(0,e.hp-d);
    if(actual>0)recordCombatContribution(h,'damage',actual);
    const beforeLifesteal=h.hp;h.hp=Math.min(v.hp,h.hp+healingAmount(h,actual*v.lifesteal));
    const healed=Math.max(0,h.hp-beforeLifesteal);if(healed>0)recordCombatContribution(h,'healing',healed);
    if(actual>0&&e.hp>0)triggerFollowupDebuffs(e);
    return actual;
  };

  // Skills use character crit/crit-damage plus their own editable baseline.
  castPartySkill=function(h,i,v){
    const sk=CLASSES[h.job].skills[i];if(!sk)return false;
    if(sk[1]==='proc'&&PROC_ONLY_EFFECTS.has(sk[5])){
      if(sk[5]==='nextActiveDamage'){const bonus=Math.max(0,skillPower(i,h));h.nextActiveDamageBonus=Math.max(0,Number(h.nextActiveDamageBonus)||0)+bonus;note(characterName(h)+'・'+sk[0]+' → 下次主動技能傷害 +'+Number((bonus*100).toFixed(1))+'%');return true;}
      if(sk[5]==='advanceNextRound'){h.procAdvanceRound=round+1;h.procAdvanceSteps=Math.min(5,Math.max(0,Number(h.procAdvanceSteps)||0)+1);note(characterName(h)+'・'+sk[0]+' → 下回合行動提前 1 格');return true;}
      if(sk[5]==='shieldLowest'){const ally=[...living()].sort((a,b)=>a.hp/stats(a).hp-b.hp/stats(b).hp)[0];if(!ally)return false;const amount=v.atk*skillPower(i,h)*(1+effectTotal(heroKey(h),'power')),r=applyPureShield(ally,amount);note(characterName(h)+'・'+sk[0]+' → '+characterName(ally)+' 護盾 '+r.generated+(r.upgraded?'':'（現有護盾較高，維持不變）'));return true;}
    }
    const storedBonus=sk[1]==='active'?Math.max(0,Number(h.nextActiveDamageBonus)||0):0,basePower=v.atk*skillPower(i,h)*(1+effectTotal(heroKey(h),'power')),power=basePower*((storedBonus>0&&['damage','drain'].includes(sk[5]))?1+storedBonus:1),element=coreSkillElement(h.job,i),profile=skillCombatProfile(h,i,v);let success=false;
    if(sk[5]==='heal'){const ally=[...living()].sort((a,b)=>a.hp/stats(a).hp-b.hp/stats(b).hp)[0];if(!ally)return false;const maxHp=stats(ally).hp,beforeHp=ally.hp;ally.hp=Math.min(maxHp,beforeHp+Math.round(healingAmount(h,basePower)));const recovered=Math.max(0,ally.hp-beforeHp);if(recovered>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'healing',recovered);note(characterName(h)+'・'+sk[0]+' → '+characterName(ally)+' 恢復 '+Math.round(recovered)+' 生命');success=true;}
    else if(sk[5]==='shield'){const shieldResult=applyPureShield(h,basePower);note(pureShieldCastLog(h,sk[0],shieldResult));success=true;}
    else{const targets=coreSkillTargets(sk);if(!targets.length)return false;let total=0;const results=[];for(const e of targets){const crit=Math.random()<profile.critChance,d=resolveHit(e,power,h,element,crit,{critDamage:profile.critDamage,defensePenetration:profile.defensePenetration,defenseIgnore:profile.defenseIgnore});total+=d;results.push(combatEnemyName(e)+' '+d+(crit?'（暴擊）':''));}if(sk[5]==='drain'){const beforeDrain=h.hp;h.hp=Math.min(v.hp,h.hp+healingAmount(h,total));const recovered=Math.max(0,h.hp-beforeDrain);if(recovered>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'healing',recovered);}note(characterName(h)+'・'+sk[0]+' ['+ELEMENTS[element]+'] → '+results.join('、')+' 傷害','playerDamage');success=true;}
    if(success&&sk[1]==='active'&&storedBonus>0)delete h.nextActiveDamageBonus;
    if(success&&h.sockets[i]===2&&sk[1]==='active'){const beforeGem=h.hp;h.hp=Math.min(v.hp,h.hp+Math.round(healingAmount(h,v.atk*GS('skills.gems.hybridActiveHealAttack',.10))));const recovered=Math.max(0,h.hp-beforeGem);if(recovered>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'healing',recovered);}
    return success;
  };

  useSupply=function(id){
    const item=SHOP.find(x=>x.id===id);if(!item||(state.consumables[id]||0)<1)return;
    const previous=state[item.type],count=state.consumables[id],previousHp=state.hp;let buff;
    if(EmberwildTimedBoosts.isElementalItem(item)){
      const api=EmberwildTimedBoosts;
      try{buff=api.compactBuffs(api.stackBuff(api.buffRows(previous),api.createElementalBuff({...item,statEffects:normalizeStatEffects(item.statEffects)})));}
      catch(e){toast(e.message);return false;}
    }else{const seconds=globalThis.EmberwildSecondsCombat?.active&&item.timing?.durationSeconds,turns=seconds||Math.max(1,Math.round(Number(item.duration)||1));buff={element:item.element,remainingTurns:turns,totalTurns:turns,clock:seconds?'battleSeconds':'battleRounds',until:0,statEffects:normalizeStatEffects(item.statEffects)};}
    state.consumables[id]--;state[item.type]=buff;withHero(state,clampVitals);
    if(save()===false){state.consumables[id]=count;state[item.type]=previous;state.hp=previousHp;return false;}
    render();toast('已使用'+item.name);return true;
  };
  function itemStatText(item){
    const s=normalizeStatEffects(item?.statEffects),labels={hp:'生命',attack:'攻擊',defense:'防禦',attackPct:'總攻擊',critRate:'暴擊率',critDamage:'暴擊傷害',defensePenetration:'防禦穿透',defenseIgnore:'防禦無視',lifesteal:'生命竊取',evasion:'閃避',elementBonus:'全屬性增傷',bossDamage:'BOSS 傷害',speed:'速度'},percent=new Set(['attackPct','critRate','critDamage','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage']);
    return Object.entries(s).map(([k,n])=>labels[k]+' '+(n>=0?'+':'')+n+(percent.has(k)?'%':'')).join('、');
  }
  const compressionSupplyDetailBase=supplyDetail;
  supplyDetail=function(item){const base=compressionSupplyDetailBase(item),extra=itemStatText(item);return base+(extra?' · 暫時能力：'+extra:'');};

  // Preserve new skill/item metadata across the existing balance importer.
  const compressionValidateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const full=compressDocument(input),clean=clone(full);
    for(const item of clean.items||[])delete item.statEffects;
    const out=compressionValidateBase(clean);
    (out.classes||[]).forEach((cls,job)=>(cls.skills||[]).forEach((sk,i)=>Object.assign(sk,normalizeSkillExtras(full.classes?.[job]?.skills?.[i]||{},job,i))));
    for(const item of out.items||[]){const src=(full.items||[]).find(x=>x.id===item.id);item.statEffects=normalizeStatEffects(src?.statEffects);}
    out.balanceSettings=clone(full.balanceSettings);out.balance=normalizeRuntimeBalance(full.balance);
    if(full.equipmentPowerSystem)out.equipmentPowerSystem=clone(full.equipmentPowerSystem);
    return out;
  };
  const compressionApplyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const full=compressDocument(input),clean=clone(full),skillExtras=(full.classes||[]).map((cls,job)=>(cls.skills||[]).map((sk,i)=>normalizeSkillExtras(sk,job,i))),itemExtras=new Map((full.items||[]).map(x=>[x.id,normalizeStatEffects(x.statEffects)]));
    for(const item of clean.items||[])delete item.statEffects;
    const out=compressionApplyBase(clean,{persist:false});
    for(let job=0;job<CLASSES.length;job++)for(let i=0;i<CLASSES[job].skills.length;i++)Object.assign(runtimeSkillMeta(job,i),skillExtras[job]?.[i]||skillDefaultsFor(job,i));
    for(const item of SHOP)item.statEffects=clone(itemExtras.get(item.id)||{});
    GAMEPLAY_SETTINGS.combat.damageFormula??={attackCoefficient:1,defenseCoefficient:.55,minimumDamage:1};GAMEPLAY_SETTINGS.combat.defenseEffectiveness=GAMEPLAY_SETTINGS.combat.damageFormula.defenseCoefficient;
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    if(state){for(const h of party?.members||[state])withHero(h,clampVitals);render();}
    return out;
  };
  const compressionExportBase=exportableBalance;
  exportableBalance=function(){
    const out=compressionExportBase();out.balanceSettings=clone(GAMEPLAY_SETTINGS);out.balance=clone(GAME_BALANCE);
    out.balanceSettings.meta??={};out.balanceSettings.meta.numericCompressionVersion=COMPRESSION_VERSION;
    (out.classes||[]).forEach((cls,job)=>(cls.skills||[]).forEach((sk,i)=>{const m=runtimeSkillMeta(job,i);sk.baseCritRate=m.baseCritRate;sk.baseCritDamage=m.baseCritDamage;sk.defensePenetration=m.defensePenetration;sk.defenseIgnore=m.defenseIgnore;}));
    for(const item of out.items||[]){const live=SHOP.find(x=>x.id===item.id);item.statEffects=normalizeStatEffects(live?.statEffects);}
    out.notes=[...(out.notes||[]),'傷害公式：先套防禦降低，再套百分比防禦無視，最後扣固定防禦穿透；係數位於 balanceSettings.combat.damageFormula。','技能可設定 baseCritRate / baseCritDamage / defensePenetration / defenseIgnore；角色本身的暴擊與裝備效果仍會疊加。','商店道具 statEffects 可在效果持續期間提供主屬性與衍生副屬性。'];
    return out;
  };

  // Runtime defaults are migrated through the same importer to avoid separate hidden values.
  try{
    const migrated=compressDocument(compressionExportBase());
    applyBalanceConfig(migrated,{persist:false});
    if(!state)render();
  }catch(e){console.error('數據壓縮初始化失敗',e);}

  // Make the first-level promise explicit even if future catalog multipliers are edited.
  globalThis.__EMBERWILD_NUMERIC_COMPRESSION_TEST={
    version:COMPRESSION_VERSION,
    damageFormula:()=>clone(GAMEPLAY_SETTINGS.combat.damageFormula),
    level1ClassHp:()=>CLASSES.map(x=>x.hp),
    level1MonsterHp:()=>Math.round(GAMEPLAY_SETTINGS.monsters.normal.hpBase+GAMEPLAY_SETTINGS.monsters.normal.hpPerLevel+GAMEPLAY_SETTINGS.monsters.normal.hpQuadratic),
    skillProfile:(job,i)=>clone(runtimeSkillMeta(job,i))
  };
})();
