

(function installControlStatusAndSummons(){
  const CONTROL_EFFECTS=new Set(['polymorph','freeze','frost','rage','summonMorphTrap','summonFreezeTrap','fear','tauntRage']);
  const CONTROL_META_KEYS=['controlId','duration','bossDuration','slowPct','basicAttackBonus','skipChance','bossSkipChance','damageReduction','trapHp'];
  const CONTROL_SKILLS=[
    {job:0,controlId:'warrior-taunt',name:'嘲諷',level:9,cooldown:6,power:0,effect:'tauntRage',element:'physical',maxTargets:1,description:'挑釁敵方攻擊力最高者，使其陷入狂暴並優先攻擊戰士。',duration:3,bossDuration:1,basicAttackBonus:.20},
    {job:1,controlId:'mage-polymorph',name:'變形術',level:12,cooldown:7,power:1.0,effect:'polymorph',element:'physical',maxTargets:1,description:'將敵人變形並賦予護盾；護盾存在期間無法行動且不會成為單體目標，護盾被打破時立即解除。對 BOSS 無效。',duration:3,bossDuration:0},
    {job:1,controlId:'mage-frost-nova',name:'冰霜新星',level:8,cooldown:6,power:0,effect:'frost',element:'ice',maxTargets:99,description:'使全部存活敵人結霜，降低速度。',slowPct:.30},
    {job:1,controlId:'mage-ice-arrow',name:'寒冰箭',level:5,cooldown:5,power:0,effect:'freeze',element:'ice',maxTargets:1,description:'凍結一名敵人，使其無法行動。',duration:2,bossDuration:1},
    {job:2,controlId:'archer-freeze-trap',name:'冰凍陷阱',level:8,cooldown:6,power:0,effect:'summonFreezeTrap',element:'ice',maxTargets:1,description:'召喚 2 點生命的冰凍陷阱。每次受擊固定失去 1 點生命，並使敵方全體結霜；已結霜者改為冰凍 1 回合。',trapHp:2,slowPct:.30},
    {job:2,controlId:'archer-morph-trap',name:'變形陷阱',level:12,cooldown:7,power:1.0,effect:'summonMorphTrap',element:'physical',maxTargets:1,description:'召喚 1 點生命的變形陷阱。陷阱被擊破時，使攻擊者進入變形狀態。',trapHp:1,duration:3,bossDuration:0},
    {job:3,controlId:'priest-implant-fear',name:'植入恐怖',level:10,cooldown:6,power:0,effect:'fear',element:'shadow',maxTargets:1,description:'植入恐怖，使敵人傷害降低並有機率無法行動。BOSS 的失去行動機率降低。',duration:3,damageReduction:.20,skipChance:.30,bossSkipChance:.15}
  ];
  let controlStates=Object.create(null),combatSummons=[];

  function clamp01(v,fallback=0){v=Number(v);return Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;}
  function int0(v,fallback=0){v=Number(v);return Number.isFinite(v)?Math.max(0,Math.round(v)):fallback;}
  function isBossEnemy(e){return !!e&&(e.kind==='boss'||e.kind==='final');}
  function stateFor(id,create=true){if(!id)return null;if(!controlStates[id]&&create)controlStates[id]={};return controlStates[id]||null;}
  function isPolymorphed(e){const p=stateFor(e?.id,false)?.polymorph;return !!(e&&e.hp>0&&p&&p.shield>0&&p.turns>0);}
  function cleanState(id){const s=stateFor(id,false);if(s&&!Object.keys(s).length)delete controlStates[id];}
  function normalizeControlMeta(meta,effect){
    meta=meta&&typeof meta==='object'&&!Array.isArray(meta)?meta:{};
    meta.duration=int0(meta.duration,effect==='fear'||effect==='rage'||effect==='tauntRage'||effect==='polymorph'?3:effect==='freeze'?2:0);
    meta.bossDuration=int0(meta.bossDuration,effect==='freeze'||effect==='rage'||effect==='tauntRage'?1:effect==='polymorph'?0:meta.duration);
    meta.slowPct=clamp01(meta.slowPct,.30);
    meta.basicAttackBonus=clamp01(meta.basicAttackBonus,.20);
    meta.skipChance=clamp01(meta.skipChance,.30);
    meta.bossSkipChance=clamp01(meta.bossSkipChance,.15);
    meta.damageReduction=clamp01(meta.damageReduction,.20);
    meta.trapHp=Math.max(1,int0(meta.trapHp,effect==='summonFreezeTrap'?2:1));
    return meta;
  }
  function ensureControlSkills(){
    for(const row of CONTROL_SKILLS){
      const list=CLASSES[row.job]?.skills;if(!list)continue;
      let index=list.findIndex(sk=>sk?.[6]?.controlId===row.controlId);
      if(index<0)index=list.findIndex(sk=>sk?.[0]===row.name);
      if(index<0){
        const meta={target:row.maxTargets>=99?'enemies':'enemy',maxTargets:row.maxTargets,requiresAdvanced:false,powerPerLevel:0,mastery:null,requiredMastery:null,requiredMasteryLevel:0,weaponTypes:[],effects:[{kind:row.effect}],description:row.description,controlId:row.controlId};
        for(const k of CONTROL_META_KEYS)if(row[k]!==undefined)meta[k]=row[k];
        normalizeControlMeta(meta,row.effect);
        list.push([row.name,'active',row.level,row.cooldown,row.power,row.effect,meta]);
        index=list.length-1;
      }else{
        const sk=list[index];sk[6]??={};sk[6].controlId??=row.controlId;sk[6].description??=row.description;sk[6].powerPerLevel=0;normalizeControlMeta(sk[6],sk[5]);
      }
      SKILL_ELEMENTS[row.job]??=[];SKILL_ELEMENTS[row.job][index]=SKILL_ELEMENTS[row.job][index]||row.element;
    }
    if(typeof syncAllHeroSkillArrays==='function')syncAllHeroSkillArrays();
  }
  ensureControlSkills();

  // Saves written after control skills were appended contain longer skill/socket arrays.
  // Earlier boot passes intentionally preserve the original bytes; now that the full
  // control-skill catalog exists, hydrate those bytes once more so learned/slot state is
  // restored instead of being rejected or truncated by the core six-skill schema.
  try{
    const raw=globalThis.__EMBERWILD_PRE_CONTROL_SAVE_RAW??globalThis.__EMBERWILD_BOOT_SAVE_RAW??localStorage.getItem(KEY);
    // The published loader restores exact save bytes after all modules are installed.
    if(raw&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)){
      const parsed=JSON.parse(raw),fallbackStats=party?.battleStatistics;
      loadParty(migrateWorldSave(parsed));
      if(!parsed.battleStatistics&&fallbackStats&&typeof normalizeBattleStatistics==='function')party.battleStatistics=normalizeBattleStatistics(fallbackStats);
      save();delete globalThis.__EMBERWILD_PRE_CONTROL_SAVE_RAW;
      delete globalThis.__EMBERWILD_DEFERRED_CUSTOM_FORM_SAVE;
      globalThis.__EMBERWILD_BOOT_SAVE_ERROR=null;
    }
  }catch(e){
    console.warn('控制技能安裝後重新載入存檔失敗',e);
    const message=String(e?.message||e);
    globalThis.__EMBERWILD_BOOT_SAVE_ERROR=message;
    if(!state){
      state=null;party=null;
      const previewBuild=isPreviewBuild();
      if(previewBuild&&message.startsWith('裝備類型無效：'))globalThis.__EMBERWILD_DEFERRED_CUSTOM_FORM_SAVE=true;
      else if(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)toast('存檔未能載入：'+message+'；可匯入備份。');
    }
  }

  function applyPolymorph(e,shield,meta){
    if(!e||e.hp<=0)return false;
    if(isBossEnemy(e)){globalThis.EmberwildBattleEffects?.result('resist',e,null,{label:'免疫'});note(combatEnemyName(e)+' 對變形免疫。');return true;}
    meta=normalizeControlMeta(meta,'polymorph');
    const s=stateFor(e.id),amount=Math.max(1,Math.round(Number(shield)||1));
    s.polymorph={turns:Math.max(1,meta.duration),total:Math.max(1,meta.duration),shield:amount,maxShield:amount};
    note(combatEnemyName(e)+' 進入變形：護盾 '+amount+'，'+s.polymorph.turns+' 回合無法行動且不會成為單體目標。');
    return true;
  }
  function applyFreeze(e,meta,forcedTurns=null){
    if(!e||e.hp<=0)return false;meta=normalizeControlMeta(meta,'freeze');
    const turns=forcedTurns===null?(isBossEnemy(e)?meta.bossDuration:meta.duration):Math.max(1,int0(forcedTurns,1));
    if(turns<=0){globalThis.EmberwildBattleEffects?.result('resist',e);return true;}
    const s=stateFor(e.id);s.freeze={turns,total:turns};
    note(combatEnemyName(e)+' 冰凍 '+turns+' 回合。');return true;
  }
  function applyFrost(e,meta){
    if(!e||e.hp<=0)return false;meta=normalizeControlMeta(meta,'frost');
    const s=stateFor(e.id);s.frost={slowPct:meta.slowPct};
    note(combatEnemyName(e)+' 結霜：速度 -'+Math.round(meta.slowPct*100)+'%。');return true;
  }
  function applyRage(e,meta,tauntHeroJob=null){
    if(!e||e.hp<=0)return false;meta=normalizeControlMeta(meta,'rage');
    const turns=isBossEnemy(e)?meta.bossDuration:meta.duration;if(turns<=0){globalThis.EmberwildBattleEffects?.result('resist',e);return true;}
    const s=stateFor(e.id);s.rage={turns,total:turns,basicAttackBonus:meta.basicAttackBonus,tauntHeroJob:Number.isInteger(tauntHeroJob)?tauntHeroJob:null};
    note(combatEnemyName(e)+' 狂暴 '+turns+' 回合：無法使用技能，普攻傷害 +'+Math.round(meta.basicAttackBonus*100)+'%。');return true;
  }
  function applyFear(e,meta){
    if(!e||e.hp<=0)return false;meta=normalizeControlMeta(meta,'fear');
    const turns=Math.max(1,meta.duration),chance=isBossEnemy(e)?meta.bossSkipChance:meta.skipChance;
    const s=stateFor(e.id);s.fear={turns,total:turns,damageReduction:meta.damageReduction,skipChance:chance};
    note(combatEnemyName(e)+' 陷入畏懼 '+turns+' 回合：傷害 -'+Math.round(meta.damageReduction*100)+'%，每回合 '+Math.round(chance*100)+'% 機率無法行動。');return true;
  }
  function summonTrap(owner,kind,meta){
    meta=normalizeControlMeta(meta,kind);
    const hp=kind==='summonFreezeTrap'?Math.max(1,meta.trapHp):1;
    const trap={id:'summon-'+uid(),name:kind==='summonFreezeTrap'?'冰凍陷阱':'變形陷阱',kind,ownerJob:owner.job,ownerKey:memberKey(owner),hp,maxhp:hp,power:Math.max(0,skillPower(CLASSES[owner.job].skills.findIndex(sk=>sk?.[6]?.controlId===meta.controlId),owner)||0),meta:{...meta},__controlSummon:true};
    combatSummons.push(trap);note(characterName(owner)+' 召喚 '+trap.name+'（生命 '+hp+'）。');return true;
  }
  function onTrapHit(trap,attacker){
    if(!trap||!attacker)return;
    if(trap.kind==='summonFreezeTrap'){
      const livingFoes=foes.filter(e=>e.hp>0);
      for(const e of livingFoes){
        const s=stateFor(e.id,false);
        if(s?.frost){delete s.frost;cleanState(e.id);applyFreeze(e,trap.meta,1);}
        else applyFrost(e,trap.meta);
      }
    }
    if(trap.hp<=0&&trap.kind==='summonMorphTrap'){
      const owner=partyMember(trap.ownerKey??trap.ownerJob),shield=owner?battleStats(owner).atk*Math.max(0,Number(trap.meta.powerMultiplier??1)):1;
      applyPolymorph(attacker,shield,trap.meta);
    }
    if(trap.hp<=0)combatSummons=combatSummons.filter(x=>x.id!==trap.id);
  }

  const controlResolveHitBase=resolveHit;
  resolveHit=function(e,amount,h,element,crit,options={}){
    const polymorph=stateFor(e?.id,false)?.polymorph;
    if(!polymorph||polymorph.shield<=0)return controlResolveHitBase(e,amount,h,element,crit,options);
    const proxy={...e,hp:polymorph.shield,maxhp:polymorph.maxShield,shield:0};
    const dealt=controlResolveHitBase(proxy,amount,h,element,crit,options);
    polymorph.shield=Math.max(0,proxy.hp);
    if(polymorph.shield<=0){const s=stateFor(e.id,false);if(s)delete s.polymorph;cleanState(e.id);note(combatEnemyName(e)+' 的變形護盾被打破，變形解除。');}
    return dealt;
  };

  const controlCombatSpeedBase=combatSpeed;
  combatSpeed=function(e){
    const base=controlCombatSpeedBase(e),frost=stateFor(e?.id,false)?.frost;
    return frost?Math.max(1,Math.round(base*(1-clamp01(frost.slowPct,.30)))):base;
  };

  performEnemyBasic=function(e){
    if(!e||e.hp<=0)return;
    if(e.__controlSkip){note(combatEnemyName(e)+' 因'+e.__controlSkip+'無法行動。');return;}
    e.turn=(e.turn||0)+1;
    const s=stateFor(e.id,false),rage=s?.rage;
    const taunt=effects.find(x=>x.kind==='skillTaunt'&&x.target===e.id&&x.until>partyClock);
    let target=taunt?living().find(h=>memberKey(h)===taunt.source)||null:null;
    if(!target&&rage&&Number.isInteger(rage.tauntHeroJob))target=living().find(h=>memberKey(h)===rage.tauntHeroJob)||null;
    if(!target){
      const candidates=[...living(),...combatSummons.filter(x=>x.hp>0)];
      if(!candidates.length)return;
      target=candidates[rand(candidates.length)];
    }
    if(target.__controlSummon){
      target.hp=Math.max(0,target.hp-1);note(combatEnemyName(e)+' 攻擊 '+target.name+'，陷阱生命 -1（剩餘 '+target.hp+'）。','enemyDamage');onTrapHit(target,e);return;
    }
    const h=target,beforeHp=h.hp,v=battleStats(h),ev=enemyBattleStats(e),c=GAMEPLAY_SETTINGS.combat,fb=c.finalBoss,multi=e.kind==='final'?(globalThis.EmberwildSecondsCombat?.active?EmberwildSecondsCombat.bossMultiplier(e):(e.turn>fb.enrageAfterTurn?fb.enrageMultiplier:e.turn%Math.max(1,Math.round(fb.specialEveryTurns))===0?fb.specialMultiplier:1)):1+Math.max(0,e.lv-h.lv)*c.levelGapDamagePerLevel;
    const formula=c.damageFormula||{},attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:c.defenseEffectiveness,minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
    const effectiveDefense=Math.max(0,v.def*(1-Math.min(.95,ev.defenseIgnore))-ev.pierce);
    let hit=Math.max(minimumDamage,Math.round(ev.atk*(1-Math.min(c.caps.weaken,effectTotal(e.id,'weaken')))*multi*attackCoefficient-effectiveDefense*defenseCoefficient));
    const critical=ev.crit>0&&Math.random()<ev.crit;if(critical)hit=Math.round(hit*ev.critDamage);
    const elementBonus=(ev.elementDamage[e.element]||0)+(e.element==='physical'?0:ev.elementBonus);
    if(elementBonus)hit=Math.max(minimumDamage,Math.round(hit*(1+elementBonus)));
    hit=Math.max(minimumDamage,Math.round(hit*(1-Math.min(c.caps.guard,effectTotal(heroKey(h),'guard')))));
    if(Math.random()<v.evasion){globalThis.EmberwildBattleEffects?.result('evade',h,e);note(characterName(h)+'閃避了'+combatEnemyName(e)+'的攻擊');return;}
    const resist=Math.min(c.caps.resistance,(v.resist[e.element]||0)+supplyEffect(h,'ward',e.element));
    hit=Math.max(minimumDamage,Math.round(hit*(1-resist)));const absorb=Math.min(h.shield,hit);h.shield-=absorb;
    if(absorb>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'mitigation',absorb);
    const hpDamage=Math.max(0,hit-absorb);h.hp=Math.max(0,h.hp-hpDamage);
    globalThis.EmberwildBattleEffects?.result('resolved',h,e,{critical});
    if(typeof recordCombatContribution==='function')recordCombatContribution(h,'taken',absorb+Math.max(0,beforeHp-h.hp));
    if(critical&&beforeHp>h.hp)globalThis.EmberwildBattleEffects?.result('critical',h,e);
    globalThis.EmberwildTokenRuntime?.afterDamage(h,e,beforeHp,h.hp);
    if(ev.lifesteal>0)e.hp=Math.min(e.maxhp,e.hp+Math.round((beforeHp-h.hp)*ev.lifesteal));
    if(absorb>0&&hpDamage===0)note(combatEnemyName(e)+' → '+characterName(h)+' 的護盾 '+absorb+' 傷害（剩餘 '+Math.round(h.shield)+'）','enemyDamage');
    else note(combatEnemyName(e)+' → '+characterName(h)+' '+hpDamage+' 傷害'+(absorb?'（護盾吸收 '+absorb+'，剩餘 '+Math.round(h.shield)+'）':''),'enemyDamage');
    if(beforeHp>0&&h.hp<=0&&typeof recordBattleDeath==='function')recordBattleDeath(h,e,battleDeathMoveName(e));
  };

  function tickEnemyControlTurns(e){
    if(globalThis.EmberwildSecondsCombat?.active)return;
    const s=stateFor(e?.id,false);if(!s)return;
    for(const key of ['polymorph','freeze','rage','fear'])if(s[key]){
      s[key].turns=Math.max(0,int0(s[key].turns,0)-1);
      if(s[key].turns<=0)delete s[key];
    }
    cleanState(e.id);
  }
  const controlEnemyActionBase=performEnemyAction;
  performEnemyAction=function(e){
    if(!e||e.hp<=0)return controlEnemyActionBase(e);
    const s=stateFor(e.id,false),polymorph=s?.polymorph,freeze=s?.freeze,fear=s?.fear,rage=s?.rage;
    let skip='';
    if(polymorph&&polymorph.shield>0&&polymorph.turns>0)skip='變形';
    else if(freeze&&freeze.turns>0)skip='冰凍';
    else if(!e.__secondsFearChecked&&fear&&fear.turns>0&&Math.random()<fear.skipChance)skip='畏懼';
    const oldAtk=e.atk;
    if(skip){e.__controlSkip=skip;globalThis.EmberwildBattleEffects?.result('skip',e,e,{label:skip+'・無法行動'});}
    else{
      const fearMul=fear&&fear.turns>0?1-clamp01(fear.damageReduction,.20):1;
      const rageMul=rage&&rage.turns>0?1+clamp01(rage.basicAttackBonus,.20):1;
      e.atk=Math.max(0,oldAtk*fearMul*rageMul);
    }
    let out;
    try{out=controlEnemyActionBase(e);}finally{e.atk=oldAtk;delete e.__controlSkip;tickEnemyControlTurns(e);}
    return skip?'controlled':out;
  };

  const controlCastBase=castPartySkill;
  castPartySkill=function(h,i,v){
    const sk=CLASSES[h.job]?.skills?.[i],effect=sk?.[5];if(!sk||!CONTROL_EFFECTS.has(effect))return controlCastBase(h,i,v);
    const meta=normalizeControlMeta(sk[6],effect),targets=typeof coreSkillTargets==='function'?coreSkillTargets(sk):foes.filter(e=>e.hp>0).slice(0,1),profileV=v||battleStats(h);
    let success=false;
    if(effect==='polymorph'){const e=targets[0];if(e)success=applyPolymorph(e,profileV.atk*skillPower(i,h),meta);}
    else if(effect==='freeze'){for(const e of targets)applyFreeze(e,meta);success=targets.length>0;}
    else if(effect==='frost'){for(const e of targets)applyFrost(e,meta);success=targets.length>0;}
    else if(effect==='rage'){for(const e of targets)applyRage(e,meta,null);success=targets.length>0;}
    else if(effect==='fear'){for(const e of targets)applyFear(e,meta);success=targets.length>0;}
    else if(effect==='tauntRage'){
      const e=singleTargetEnemyPool().sort((a,b)=>b.atk-a.atk)[0];
      if(e){applyRage(e,meta,memberKey(h));note(characterName(h)+' 嘲諷 '+combatEnemyName(e)+'，其普通攻擊將優先鎖定戰士。');success=true;}
    }else if(effect==='summonMorphTrap'||effect==='summonFreezeTrap'){
      const trapMeta={...meta,controlId:sk[6]?.controlId,powerMultiplier:Math.max(0,skillPower(i,h))};
      success=summonTrap(h,effect,trapMeta);
    }
    const mastery=globalThis.__EMBERWILD_MASTERY;
    if(success&&sk[6]?.mastery&&mastery?.gainMastery)mastery.gainMastery(h,sk[6].mastery,mastery.masterySettings().skillUseXp);
    return success;
  };

  const controlCoreDetailBase=coreSkillDetail;
  coreSkillDetail=function(job,i,h=state){
    const sk=CLASSES[job]?.skills?.[i],effect=sk?.[5];if(!sk||!CONTROL_EFFECTS.has(effect))return controlCoreDetailBase(job,i,h);
    const m=normalizeControlMeta(sk[6],effect),cd=sk[1]==='active'?skillCooldown(i,h):0,head=actionTurnElementLabel(coreSkillElement(job,i))+' · 冷卻 '+cd+' 回合 · 需求 LV'+sk[2];
    if(effect==='polymorph')return head+' · 變形護盾＝攻擊×'+Number(skillPower(i,h).toFixed(2))+' · 無法行動 '+m.duration+' 回合 · 不會成為單體目標 · 護盾破裂立即解除 · BOSS 無效';
    if(effect==='freeze')return head+' · 冰凍：無法行動 '+m.duration+' 回合；BOSS '+m.bossDuration+' 回合';
    if(effect==='frost')return head+' · 敵方全體結霜：速度 -'+Math.round(m.slowPct*100)+'% · 持續至遭遇結束或被陷阱轉為冰凍';
    if(effect==='rage')return head+' · 狂暴 '+m.duration+' 回合（BOSS '+m.bossDuration+'）· 禁用技能 · 普攻 +'+Math.round(m.basicAttackBonus*100)+'%';
    if(effect==='summonMorphTrap')return head+' · 召喚生命 1 的變形陷阱 · 被擊破時使攻擊者變形 '+m.duration+' 回合 · BOSS 無效';
    if(effect==='summonFreezeTrap')return head+' · 召喚生命 '+m.trapHp+' 的冰凍陷阱 · 每次受擊固定 -1 · 敵方全體結霜；已結霜者轉為冰凍 1 回合';
    if(effect==='fear')return head+' · 畏懼 '+m.duration+' 回合 · 傷害 -'+Math.round(m.damageReduction*100)+'% · '+Math.round(m.skipChance*100)+'% 不行動；BOSS '+Math.round(m.bossSkipChance*100)+'%';
    if(effect==='tauntRage')return head+' · 敵方攻擊最高者狂暴 '+m.duration+' 回合（BOSS '+m.bossDuration+'）· 禁用技能 · 普攻 +'+Math.round(m.basicAttackBonus*100)+'% · 優先攻擊戰士';
    return controlCoreDetailBase(job,i,h);
  };

  const controlEffectBadgesBase=effectBadges;
  effectBadges=function(key){
    let html=controlEffectBadgesBase(key),s=stateFor(key,false);if(!s)return html;
    if(s.polymorph)html+=combatStatusBadge('變形',s.polymorph.turns,'無法行動，且不會成為單體目標；護盾被打破時消失。剩餘護盾 '+Math.round(s.polymorph.shield)+'。');
    if(s.freeze)html+=combatStatusBadge('冰凍',s.freeze.turns,'無法行動。');
    if(s.frost)html+=combatStatusBadge('結霜',null,'速度降低 '+Math.round(s.frost.slowPct*100)+'%，持續至遭遇結束或被冰凍陷阱轉為冰凍。');
    if(s.rage){const taunted=Number.isInteger(s.rage.tauntHeroJob);html+=combatStatusBadge(taunted?'嘲諷／狂暴':'狂暴',s.rage.turns,'無法使用技能，普攻傷害增加 '+Math.round(s.rage.basicAttackBonus*100)+'%。'+(taunted?'優先攻擊戰士。':''));}
    if(s.fear)html+=combatStatusBadge('畏懼',s.fear.turns,'傷害降低 '+Math.round(s.fear.damageReduction*100)+'%，每回合 '+Math.round(s.fear.skipChance*100)+'% 機率無法行動。');
    return html;
  };

  if(typeof battleBuffRows==='function'){
    const controlBuffRowsBase=battleBuffRows;
    battleBuffRows=function(){
      const extra=[];
      for(const e of foes.filter(x=>x.hp>0)){
        const s=stateFor(e.id,false);if(!s)continue;
        if(s.polymorph)extra.push('<tr><td>'+esc(e.name)+'</td><td>變形</td><td>無法行動；護盾 '+Math.round(s.polymorph.shield)+'</td><td class="buff-time">'+s.polymorph.turns+' / '+s.polymorph.total+' 回合</td><td>自身行動</td></tr>');
        if(s.freeze)extra.push('<tr><td>'+esc(e.name)+'</td><td>冰凍</td><td>無法行動</td><td class="buff-time">'+s.freeze.turns+' / '+s.freeze.total+' 回合</td><td>自身行動</td></tr>');
        if(s.frost)extra.push('<tr><td>'+esc(e.name)+'</td><td>結霜</td><td>速度 -'+Math.round(s.frost.slowPct*100)+'%</td><td class="buff-time">遭遇期間</td><td>解除／轉冰凍</td></tr>');
        if(s.rage)extra.push('<tr><td>'+esc(e.name)+'</td><td>狂暴</td><td>禁用技能；普攻 +'+Math.round(s.rage.basicAttackBonus*100)+'%</td><td class="buff-time">'+s.rage.turns+' / '+s.rage.total+' 回合</td><td>自身行動</td></tr>');
        if(s.fear)extra.push('<tr><td>'+esc(e.name)+'</td><td>畏懼</td><td>傷害 -'+Math.round(s.fear.damageReduction*100)+'%；'+Math.round(s.fear.skipChance*100)+'% 不行動</td><td class="buff-time">'+s.fear.turns+' / '+s.fear.total+' 回合</td><td>自身行動</td></tr>');
      }
      const base=controlBuffRowsBase();return extra.length?extra.join('')+(base.includes('no-buffs')?'':base):base;
    };
  }

  if(typeof battleView==='function'){
    const controlBattleViewBase=battleView;
    battleView=function(){
      let html=controlBattleViewBase();if(!combatSummons.length)return html;
      const summonHtml='<section class="control-summons"><h3>召喚物 <small>'+combatSummons.filter(x=>x.hp>0).length+'</small></h3>'+combatSummons.filter(x=>x.hp>0).map(x=>'<article data-combat-id="'+x.id+'" class="unit"><div class="unit-title"><b>'+esc(x.name)+'</b><span>召喚物</span></div><div class="unit-numbers"><span>生命 <b>'+x.hp+' / '+x.maxhp+'</b></span><span>'+esc(characterName(partyMember(x.ownerKey??x.ownerJob)))+' 的陷阱</span></div></article>').join('')+'</section>';
      return html.replace('<section class="squad-enemies">',summonHtml+'<section class="squad-enemies">');
    };
  }

  if(!document.getElementById('control-summon-style')){
    const style=document.createElement('style');style.id='control-summon-style';style.textContent='.control-summons{display:grid;gap:6px;align-content:start}.control-summons h3{margin:0}.control-summons .unit{min-height:0}';document.head.appendChild(style);
  }

  const controlResetBase=resetEncounter;
  resetEncounter=function(){controlStates=Object.create(null);combatSummons=[];return controlResetBase();};
  const controlSpawnBase=spawnGroup;
  spawnGroup=function(...args){controlStates=Object.create(null);combatSummons=[];return controlSpawnBase(...args);};

  const controlValidateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const copy=JSON.parse(JSON.stringify(input));
    for(const c of copy?.classes||[])for(const sk of c?.skills||[])if(CONTROL_EFFECTS.has(sk?.effect)){
      sk.duration=int0(sk.duration,sk.effect==='freeze'?2:3);sk.bossDuration=int0(sk.bossDuration,sk.effect==='freeze'||sk.effect==='rage'||sk.effect==='tauntRage'?1:sk.effect==='polymorph'?0:sk.duration);
      sk.slowPct=clamp01(sk.slowPct,.30);sk.basicAttackBonus=clamp01(sk.basicAttackBonus,.20);sk.skipChance=clamp01(sk.skipChance,.30);sk.bossSkipChance=clamp01(sk.bossSkipChance,.15);sk.damageReduction=clamp01(sk.damageReduction,.20);sk.trapHp=Math.max(1,int0(sk.trapHp,sk.effect==='summonFreezeTrap'?2:1));
    }
    return controlValidateBase(copy);
  };

  const controlApplyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,options={}){
    const copy=JSON.parse(JSON.stringify(input)),extras=(copy.classes||[]).map(c=>(c.skills||[]).map(sk=>Object.fromEntries(CONTROL_META_KEYS.filter(k=>sk[k]!==undefined).map(k=>[k,sk[k]]))));
    const out=controlApplyBase(copy,options);
    for(let job=0;job<extras.length;job++)for(let i=0;i<extras[job].length;i++){
      const sk=CLASSES[job]?.skills?.[i];if(!sk)continue;sk[6]??={};Object.assign(sk[6],extras[job][i]);normalizeControlMeta(sk[6],sk[5]);
    }
    ensureControlSkills();if(state)render();return out;
  };

  const controlExportBase=exportableBalance;
  exportableBalance=function(){
    const out=controlExportBase();
    out.classes.forEach((c,job)=>c.skills.forEach((sk,i)=>{
      const meta=CLASSES[job]?.skills?.[i]?.[6]||{};if(!CONTROL_EFFECTS.has(CLASSES[job]?.skills?.[i]?.[5]))return;
      for(const k of CONTROL_META_KEYS)if(meta[k]!==undefined)sk[k]=meta[k];
    }));
    out.notes=[...(out.notes||[]),'控制狀態以目標自己的行動回合計數；結霜持續到遭遇結束或被冰凍陷阱轉為冰凍。','BOSS 對變形免疫；變形期間不會成為單體攻擊、隨機單體或依能力排序的單體指定目標，但仍會被範圍技能擊中；冰凍與狂暴使用 bossDuration；畏懼保留傷害降低與持續時間，但 BOSS 使用較低 bossSkipChance。','陷阱是可被敵方普通攻擊選中的召喚物；嘲諷中的敵人優先攻擊戰士。'];
    return out;
  };

  if(typeof resetBalanceJSON==='function'){
    const controlResetBalanceBase=resetBalanceJSON;
    resetBalanceJSON=function(){const out=controlResetBalanceBase();ensureControlSkills();if(state)render();return out;};
  }

  globalThis.EmberwildControlCombatState={pack:()=>({states:controlStates,summons:combatSummons}),restore:v=>{controlStates=v?.states||Object.create(null);combatSummons=v?.summons||[];}};
  // Production name for live control/summon state. The historical test name stays an alias of the same object.
  globalThis.EmberwildControlState=globalThis.__EMBERWILD_CONTROL_TEST_API={
    get states(){return controlStates;},get summons(){return combatSummons;},
    clear(e,kind){const s=stateFor(e?.id,false),key=kind==='tauntRage'?'rage':kind;if(!s?.[key])return false;delete s[key];cleanState(e.id);return true;},
    applyPolymorph,applyFreeze,applyFrost,applyRage,applyFear,isPolymorphed,ensureControlSkills
  };
  if(state){syncAllHeroSkillArrays();render();}
})();
