
/* Debuff mechanics v2:
   followup  = target is hit -> extra caster ATK% elemental damage; applies defense, element matchup and target damage reduction.
   dotAttack = before target acts -> fixed caster ATK% damage; ignores all damage modifiers.
   dotMaxHp  = before target acts -> fixed target max-HP% damage; ignores all damage modifiers.
   damageAmp = target is hit -> that triggering hit is increased by value%.
*/
(()=>{
  const SUPPORT_DEBUFF_KINDS=new Set(['followup','dotAttack','dotMaxHp','damageAmp']);
  const SUPPORT_ELEMENT_KEYS=new Set(['physical','fire','ice','wind','light','shadow']);
  const SUPPORT_COMBAT_DEFAULTS={baseCritRate:0,baseCritDamage:1.5,defensePenetration:0,defenseIgnore:0};

  function normalizeSupportCombatSkill(sk){
    if(!sk||typeof sk!=='object')return sk;
    const baseCritDamage=GS('combat.baseCritDamage',SUPPORT_COMBAT_DEFAULTS.baseCritDamage);
    sk.baseCritRate=Number.isFinite(Number(sk.baseCritRate))?Math.max(0,Math.min(1,Number(sk.baseCritRate))):SUPPORT_COMBAT_DEFAULTS.baseCritRate;
    sk.baseCritDamage=Number.isFinite(Number(sk.baseCritDamage))?Math.max(1,Number(sk.baseCritDamage)):baseCritDamage;
    sk.defensePenetration=Number.isFinite(Number(sk.defensePenetration))?Math.max(0,Number(sk.defensePenetration)):SUPPORT_COMBAT_DEFAULTS.defensePenetration;
    sk.defenseIgnore=Number.isFinite(Number(sk.defenseIgnore))?Math.max(0,Math.min(1,Number(sk.defenseIgnore))):SUPPORT_COMBAT_DEFAULTS.defenseIgnore;
    return sk;
  }

  function normalizeSupportDebuffSkill(sk){
    if(!sk||typeof sk!=='object')return sk;
    // Backward compatibility: old vulnerable was a generic damage-taken multiplier.
    // Elemental Brand is intentionally migrated to the new elemental follow-up model.
    if(sk.kind==='vulnerable')sk.kind=sk.name==='元素灼印'?'followup':'damageAmp';
    if(!SUPPORT_ELEMENT_KEYS.has(sk.element))sk.element=sk.kind==='followup'?'fire':'physical';
    if(sk.kind==='followup'&&sk.element==='physical'&&sk.name==='元素灼印')sk.element='fire';
    normalizeSupportCombatSkill(sk);
    return sk;
  }
  function normalizeAllSupportDebuffs(){for(const list of SUPPORT)for(const sk of list)normalizeSupportDebuffSkill(sk);}
  normalizeAllSupportDebuffs();

  Object.assign(EFFECT_NAMES,{
    followup:'受擊追打',
    dotAttack:'行動前持續傷害（施放者攻擊）',
    dotMaxHp:'行動前持續傷害（最大生命）',
    damageAmp:'受擊傷害增加'
  });

  function supportEffectDescription(sk,valuePct){
    const element=SUPPORT_ELEMENT_KEYS.has(sk.element)?sk.element:'physical';
    if(sk.kind==='followup')return `受擊時追打：施放者攻擊 ${valuePct}% 的${ELEMENTS[element]}屬性傷害（吃防禦、屬性克制與減傷）`;
    if(sk.kind==='dotAttack')return `自身行動前：受到施放者攻擊 ${valuePct}% 的固定傷害（不吃任何增減傷）`;
    if(sk.kind==='dotMaxHp')return `自身行動前：受到自身最大生命 ${valuePct}% 的固定傷害（不吃任何增減傷）`;
    if(sk.kind==='damageAmp')return `受到攻擊時：該次攻擊傷害增加 ${valuePct}%`;
    return `${EFFECT_NAMES[sk.kind]||sk.kind} ${valuePct}%`;
  }

  // Keep support effects self-contained so imported JSON immediately gains the new semantics.
  castSupport=function(h,index){
    const sk=normalizeSupportDebuffSkill(SUPPORT[h.job][index]);
    let targets=sk.target==='allies'?living().map(heroKey):sk.target==='weakest'?[heroKey([...living()].sort((a,b)=>a.hp/solo.stats(a).hp-b.hp/solo.stats(b).hp)[0])]:sk.target==='enemies'?foes.filter(e=>e.hp>0).map(e=>e.id):[foes.find(enemyAvailableForSingleTarget)?.id];
    for(const target of targets.filter(Boolean)){
      effects=effects.filter(e=>!((e.sourceKey??e.source)===memberKey(h)&&e.skill===index&&e.target===target));
      effects.push({source:h.job,sourceKey:memberKey(h),skill:index,target,kind:sk.kind,element:sk.element,value:sk.kind==='regen'?healingAmount(h,supportAmount(h.job,index)):supportAmount(h.job,index),until:partyClock+Math.max(0,Math.round(sk.duration)),name:sk.name});
      if(sk.kind==='regen'){const ally=party.members.find(a=>heroKey(a)===target);if(ally){const before=ally.hp;ally.hp=Math.min(solo.stats(ally).hp,ally.hp+healingAmount(h,solo.stats(ally).hp*supportAmount(h.job,index)));const recovered=Math.max(0,ally.hp-before);if(recovered>0)recordCombatContribution(h,'healing',recovered);}}
    }
    note(characterName(h)+'施放 '+sk.name+' · '+Math.round(sk.duration)+' 回合');
  };

  function followupEffects(targetId){return effects.filter(e=>e.target===targetId&&e.kind==='followup'&&e.until>partyClock);}
  function triggerFollowupDebuffs(target){
    if(!target||target.hp<=0)return 0;
    let total=0;
    for(const fx of followupEffects(target.id)){
      if(target.hp<=0)break;
      const sk=normalizeSupportDebuffSkill(SUPPORT[fx.source]?.[fx.skill]);
      const caster=partyMember(fx.sourceKey??fx.source);
      if(!sk||!caster)continue;
      const element=SUPPORT_ELEMENT_KEYS.has(sk.element)?sk.element:'physical';
      // Elemental follow-up damage uses the same defense order as normal skills:
      // fracture -> percentage defense ignore -> flat defense penetration.
      // It may crit with the caster's stats plus this support skill's editable baseline,
      // but still does not inherit attacker-side element/race bonuses, lifesteal or damageAmp/vulnerable.
      const v=battleStats(caster),cap=GAMEPLAY_SETTINGS.combat.caps,formula=GAMEPLAY_SETTINGS.combat.damageFormula||{},meta=normalizeSupportCombatSkill(sk);
      const raw=Math.max(1,v.atk*Math.max(0,Number(fx.value)||0)),fracture=Math.min(cap.fracture,effectTotal(target.id,'fracture'));
      const ignore=Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,Math.max(0,(v.defenseIgnore||0)+meta.defenseIgnore));
      const penetration=Math.min(GAME_BALANCE.combat.statCaps.pierce,Math.max(0,(v.pierce||0)+meta.defensePenetration));
      const afterIgnore=Math.max(0,Math.max(0,Number(target.def)||0)*(1-fracture)*(1-ignore)),effectiveDefense=Math.max(0,afterIgnore-penetration);
      const attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(GAMEPLAY_SETTINGS.combat.defenseEffectiveness??.55),minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
      let followup=Math.max(minimumDamage,Math.round(raw*attackCoefficient-effectiveDefense*defenseCoefficient));
      const critChance=Math.min(GAME_BALANCE.combat.statCaps.crit,Math.max(0,v.crit+meta.baseCritRate)),crit=Math.random()<critChance,baseCrit=GS('combat.baseCritDamage',1.5),critDamage=Math.max(1,meta.baseCritDamage+(v.critDamage-baseCrit));
      if(crit)followup=Math.round(followup*critDamage);
      followup=Math.max(minimumDamage,Math.round(followup*elementFactor(element,target.element)));
      followup=Math.max(minimumDamage,Math.round(followup*(1-Math.min(cap.guard,effectTotal(target.id,'guard')))));
      const dealt=Math.min(target.hp,followup);
      const visual=globalThis.EmberwildBattleEffects;
      if(visual?.capturing)visual.scope({source:caster,mode:'damage',element},()=>{target.hp=Math.max(0,target.hp-dealt);});
      else target.hp=Math.max(0,target.hp-dealt);
      if(dealt>0)recordCombatContribution(caster,'damage',dealt);
      total+=dealt;
      note(`${fx.name}追打 [${ELEMENTS[element]}] → ${combatEnemyName(target)} ${dealt} 傷害${crit?'（暴擊）':''}`,'playerDamage');
    }
    return total;
  }
  globalThis.triggerFollowupDebuffs=triggerFollowupDebuffs;

  // Final damage resolver: damageAmp increases only the triggering attack.
  // Legacy vulnerable remains accepted as a compatibility alias for old imported configs.
  resolveHit=function(e,amount,h,element,crit){
    const v=battleStats(h),cap=GAMEPLAY_SETTINGS.combat.caps,formula=GAMEPLAY_SETTINGS.combat.damageFormula||{},fracture=Math.min(cap.fracture,effectTotal(e.id,'fracture'));
    const ignore=Math.min(GAME_BALANCE.combat.statCaps.defenseIgnore??.75,Math.max(0,v.defenseIgnore||0)),penetration=Math.min(GAME_BALANCE.combat.statCaps.pierce,Math.max(0,v.pierce||0));
    const afterIgnore=Math.max(0,e.def*(1-fracture)*(1-ignore)),effectiveDefense=Math.max(0,afterIgnore-penetration);
    const attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(GAMEPLAY_SETTINGS.combat.defenseEffectiveness??.55),minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
    let d=Math.max(minimumDamage,Math.round(amount*attackCoefficient-effectiveDefense*defenseCoefficient));
    if(crit)d=Math.round(d*v.critDamage);
    const bonus=(v.elementDamage[element]||0)+(element==='physical'?0:v.elementBonus)+supplyEffect(h,'elementTonic',element);
    const amp=effectTotal(e.id,'damageAmp')+effectTotal(e.id,'vulnerable');
    d=Math.max(minimumDamage,Math.round(d*elementFactor(element,e.element)*(1+bonus)*(1+(v.raceDamage[e.race]||0))*(1+amp)));
    const actual=Math.min(e.hp,d);
    e.hp=Math.max(0,e.hp-d);
    if(actual>0)recordCombatContribution(h,'damage',actual);
    const beforeLifesteal=h.hp;
    h.hp=Math.min(v.hp,h.hp+actual*v.lifesteal);
    const lifestealHealing=Math.max(0,h.hp-beforeLifesteal);if(lifestealHealing>0)recordCombatContribution(h,'healing',lifestealHealing);
    if(actual>0&&e.hp>0)triggerFollowupDebuffs(e);
    return actual;
  };

  function tickFixedDotBeforeEnemyAction(e){
    if(globalThis.EmberwildSecondsCombat?.active)return 0;
    if(!e||e.hp<=0)return 0;
    let total=0;
    const dots=effects.filter(fx=>fx.target===e.id&&fx.until>partyClock&&(fx.kind==='dotAttack'||fx.kind==='dotMaxHp'));
    for(const fx of dots){
      if(e.hp<=0)break;
      const caster=partyMember(fx.sourceKey??fx.source);
      let raw=0;
      if(fx.kind==='dotAttack'){
        if(caster)raw=battleStats(caster).atk*Math.max(0,Number(fx.value)||0);
      }else raw=(Number(e.maxhp)||Number(e.hp)||1)*Math.max(0,Number(fx.value)||0);
      // DOT is deliberately fixed damage: direct HP loss, no defense, resistance, guard, amp, reduction, crit or element factor.
      const dealt=Math.min(e.hp,Math.max(1,Math.round(raw)));
      e.hp=Math.max(0,e.hp-dealt);
      if(dealt>0&&caster)recordCombatContribution(caster,'damage',dealt);
      total+=dealt;
      note(`${fx.name} → ${combatEnemyName(e)} ${dealt} 持續傷害`,'playerDamage');
    }
    return total;
  }

  const debuffPerformEnemyActionBase=performEnemyAction;
  performEnemyAction=function(e){
    const visual=globalThis.EmberwildBattleEffects;
    if(visual?.capturing)visual.scope({mode:'damage',periodic:true},()=>tickFixedDotBeforeEnemyAction(e));else tickFixedDotBeforeEnemyAction(e);
    if(!e||e.hp<=0){note((e?.name||'敵人')+'受到持續傷害倒下，未能行動。');return 'dot';}
    return debuffPerformEnemyActionBase(e);
  };

  supportSkillDetail=function(job,i,h=state){
    const sk=normalizeSupportDebuffSkill(SUPPORT[job]?.[i]);if(!sk)return '';
    const level=Math.max(1,h?.supportLevels?.[i]||1),value=+((sk.value+Math.max(0,level-1)*(Number.isFinite(sk.effectPerLevel)?sk.effectPerLevel:GS('skills.support.effectPerExtraLevel',.2)))*100).toFixed(1),cd=supportSkillCooldown(h,i);
    const elementText=sk.kind==='followup'?`${actionTurnElementLabel(sk.element)} · `:'';
    const combatText=sk.kind==='followup'?` · 基礎暴率 +${Number((sk.baseCritRate*100).toFixed(1))}% · 基礎暴傷 ${Number((sk.baseCritDamage*100).toFixed(1))}% · 防穿 +${Number(sk.defensePenetration.toFixed(2))} · 防無 +${Number((sk.defenseIgnore*100).toFixed(1))}%`:'';
    return `${elementText}目標 ${TARGET_NAMES[sk.target]} · ${supportEffectDescription(sk,value)}${combatText} · 持續 ${Math.round(sk.duration)} 戰鬥回合 · 冷卻 ${cd} 回合 · 需求 LV${sk.level}${i===2?'／二轉':''}`;
  };

  battleBuffRows=function(){
    const rows=[],row=(who,name,detail,time,clock)=>`<tr><td>${esc(who)}</td><td>${esc(name)}</td><td>${esc(detail)}</td><td class="buff-time">${esc(time)}</td><td>${esc(clock)}</td></tr>`;
    const names={attack:'攻擊提升',power:'技能威力提升',guard:'傷害減免',fracture:'防禦降低',weaken:'攻擊降低',vulnerable:'承受傷害增加（舊版）',damageAmp:'受擊傷害增加',critical:'暴擊率提升',regen:'每回合恢復最大生命',followup:'受擊追打',dotAttack:'行動前 DOT（攻擊%）',dotMaxHp:'行動前 DOT（最大生命%）'};
    for(const e of effects.filter(e=>e.until>partyClock)){
      const h=party.members.find(h=>heroKey(h)===e.target),foe=foes.find(f=>f.id===e.target);if(!h&&!foe)continue;const sk=normalizeSupportDebuffSkill(SUPPORT[e.source]?.[e.skill]),total=Math.max(0,Math.round(sk?.duration??0));
      let detail=(names[e.kind]||e.kind)+' '+Number((e.value*100).toFixed(1))+'%';
      if(e.kind==='followup')detail=`受擊時追打 ${Number((e.value*100).toFixed(1))}% 施放者攻擊 · ${ELEMENTS[sk?.element||'physical']}屬性 · 吃防禦／克制／減傷`;
      else if(e.kind==='dotAttack')detail=`自身行動前固定傷害 · ${Number((e.value*100).toFixed(1))}% 施放者攻擊`;
      else if(e.kind==='dotMaxHp')detail=`自身行動前固定傷害 · ${Number((e.value*100).toFixed(1))}% 最大生命`;
      rows.push(row(h?characterName(h):foe.name,e.name,detail,Math.max(0,Math.ceil(e.until-partyClock))+' / '+(total||'—')+' 回合','戰鬥回合'));
    }
    for(const h of party.members){
      const who=characterName(h)+(party.active.includes(memberKey(h))?'':'（候補）');
      for(const key of ['imbue','ward','elementTonic'])for(const b of activeSupplies(h,key)){const d=supplyBuffDetails(b,key);rows.push(row(who,d.name,d.detail,d.time,d.clock));}
      if(h.shield>0)rows.push(row(who,'護盾','可抵擋所有來源傷害 · 剩餘 '+Math.round(h.shield),'無回合期限','耗盡或戰鬥結束'));
    }
    return rows.join('')||'<tr><td colspan="5" class="no-buffs">目前沒有生效中的 BUFF、DEBUFF 或消耗品效果。</td></tr>';
  };


  if(typeof validateBalanceConfig==='function'){
    const debuffValidateBalanceBase=validateBalanceConfig;
    validateBalanceConfig=function(input){
      const copy=JSON.parse(JSON.stringify(input));
      const allowedKinds=new Set(['attack','critical','fracture','guard','power','regen','weaken','followup','dotAttack','dotMaxHp','damageAmp','vulnerable','applyStatus']);
      const allowedTargets=new Set(['allies','enemy','enemies','weakest','rankedAllies','rankedEnemies']);
      for(const [job,list] of (copy.supportSkills||[]).entries())for(const [i,sk] of (list||[]).entries()){
        normalizeSupportDebuffSkill(sk);
        if(sk&&!Number.isFinite(sk.effectPerLevel))sk.effectPerLevel=Number(copy.balanceSettings?.skills?.support?.effectPerExtraLevel??.2);
        if(!sk||!allowedKinds.has(sk.kind))throw Error(`輔助技能效果類型無效：${job}-${i}`);
        if(!allowedTargets.has(sk.target))throw Error(`輔助技能目標無效：${job}-${i}`);
        if(!SUPPORT_ELEMENT_KEYS.has(sk.element))throw Error(`輔助技能屬性無效：${job}-${i}`);
        if(!Number.isFinite(sk.value)||sk.value<0)throw Error(`輔助技能效果比例無效：${job}-${i}`);
        if(!Number.isFinite(sk.effectPerLevel)||sk.effectPerLevel<0)throw Error(`輔助技能每級增加倍率無效：${job}-${i}`);
        if(!Number.isInteger(sk.duration)||sk.duration<0||!Number.isInteger(sk.cooldown)||sk.cooldown<0||!Number.isInteger(sk.level)||sk.level<1)throw Error(`輔助技能回合／等級無效：${job}-${i}`);
        if(!Number.isFinite(sk.baseCritRate)||sk.baseCritRate<0||sk.baseCritRate>1||!Number.isFinite(sk.baseCritDamage)||sk.baseCritDamage<1||!Number.isFinite(sk.defensePenetration)||sk.defensePenetration<0||!Number.isFinite(sk.defenseIgnore)||sk.defenseIgnore<0||sk.defenseIgnore>1)throw Error(`輔助技能戰鬥判定無效：${job}-${i}`);
        if(SUPPORT_DEBUFF_KINDS.has(sk.kind)&&!['enemy','enemies'].includes(sk.target))throw Error(`傷害型 DEBUFF 目標必須是 enemy 或 enemies：${job}-${i}`);
      }
      return debuffValidateBalanceBase(copy);
    };
  }

  // Re-normalize support data after every balance import, including old vulnerable JSON.
  if(typeof applyBalanceConfig==='function'){
    const debuffApplyBalanceBase=applyBalanceConfig;
    applyBalanceConfig=function(input,{persist=true}={}){
      const copy=JSON.parse(JSON.stringify(input));
      for(const list of copy.supportSkills||[])for(const sk of list||[])normalizeSupportDebuffSkill(sk);
      const out=debuffApplyBalanceBase(copy,{persist:false});
      normalizeAllSupportDebuffs();
      if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
      if(state)render();
      return out;
    };
  }
  if(typeof exportableBalance==='function'){
    const debuffExportBalanceBase=exportableBalance;
    exportableBalance=function(){
      normalizeAllSupportDebuffs();
      const out=debuffExportBalanceBase();
      out.supportSkills=SUPPORT.map((list,job)=>list.map((sk,i)=>({id:`job${job}-support${i}`,...sk})));
      out.notes=[...(out.notes||[]),
        '輔助 DEBUFF 新機制：followup=受擊時以施放者攻擊力%造成可設定屬性的追打，會套用防禦、屬性克制與目標減傷；dotAttack=目標行動前受到施放者攻擊力%的固定傷害；dotMaxHp=目標行動前受到自身最大生命%的固定傷害；damageAmp=受到攻擊時該次傷害增加%。',
        'dotAttack / dotMaxHp 為直接固定傷害，不受防禦、抗性、增傷、減傷、暴擊、屬性克制影響。followup 為獨立追打，會使用角色暴率／暴傷並疊加輔助技能自身 baseCritRate / baseCritDamage / defensePenetration / defenseIgnore；防禦順序為破甲→防禦無視→固定防穿，且不再次套用 damageAmp / vulnerable。'];
      return out;
    };
  }

  // Runtime checks for manual testing from DevTools without exposing mutable internals.
  window.__EMBERWILD_DEBUFF_MECHANICS={kinds:[...SUPPORT_DEBUFF_KINDS],normalize:normalizeAllSupportDebuffs};
  if(state)render();
})();
