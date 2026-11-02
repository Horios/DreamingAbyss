/* The shared live/offline seconds driver. Existing damage, targeting, equipment,
   death-chain and reward handlers remain authoritative. No round generator runs. */
(()=>{
 'use strict';
 const Schema=EmberwildSecondsSchema,S=__EMBERWILD_SKILLS,E=EmberwildSecondsTimeline;
 const copy=Schema.copy,key=x=>Object.hasOwn(x||{},'job')?heroKey(x):x?.id;
 let source=Schema.normalize(exportableBalance()),engine=null,owner=null,serial=0,ended=false,importing=0,currentTiming=null;
 let pendingRestore=null,encounterStart=0,scheduledAt=0,needsRoster=true,procReady={};
 const config=()=>source.balanceSettings.combat.seconds;
 const unit=id=>party?.members.find(h=>heroKey(h)===id)||foes.find(e=>e.id===id);
 const skill=id=>S.byId(id)||source.skillSystem.definitions.find(s=>s.id===id);
 const timing=s=>s?.timing||source.skillSystem.definitions.find(x=>x.id===s?.id)?.timing;
 const statusList=()=>EmberwildStatusCombatState.seconds.instances(),statusDefs=()=>EmberwildStatusCombatState.seconds.definitions();
 const actorInterval=h=>config().classes.find(x=>x.job===h.job).baseIntervalSeconds;
 const mono=()=>engine?engine.now/1e6:partyClock;
 function mana(h){
  const c=config().mana;if(!Object.hasOwn(h,'job')){const t=source.balanceSettings.monsters.catalog.find(m=>m.id===h.monsterId)?.timing||{};return {maxMp:t.maxMp??c.maxMp,regen:t.regenPerSecond??c.regenPerSecond,cost:t.costMultiplier??c.costMultiplier};}const extras=equipment(h).map(g=>g.mana??itemForm(g)?.mana).filter(Boolean);
  return {maxMp:Math.max(1,(h.mana?.maxMp??c.maxMp)+extras.reduce((n,x)=>n+(Number(x.maxMp)||0),0)),regen:Math.max(0,(h.mana?.regenPerSecond??c.regenPerSecond)+extras.reduce((n,x)=>n+(Number(x.regenPerSecond)||0),0)),cost:Math.max(0,(h.mana?.costMultiplier??c.costMultiplier)-extras.reduce((n,x)=>n+(Number(x.costReduction)||0),0))};
 }
 function skillCooldownSeconds(h,s){
  const t=timing(s),factor=actorInterval(h),flat=allSkillCooldownReduction(h)+(s.adapter.kind==='core'?bonusFor(s.adapter.index,5,h):0);
  return Math.max(config().minimumActionIntervalSeconds,t.cooldownSeconds-flat*factor);
 }
 function cooldownReductionOnCast(h,id){const chance=__EMBERWILD_EQUIPMENT_SKILLS.skillRate(h,id,'cooldown');return chance>0&&Math.random()<chance?actorInterval(h):0;}
 function definition(x){
  const hero=Object.hasOwn(x,'job'),m=mana(x);
  const rows=hero?[...x.active.filter(i=>i!==null).map(i=>S.byPosition(x.job,'core',i)),...x.supportSlots.filter(i=>i!==null).map(i=>S.byPosition(x.job,'support',i))].filter(s=>s&&['active','support'].includes(s.type)&&!s.disabled&&S.learned(x,s)):
   (GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===x.monsterId)?.skillAssignments||[]).map(r=>skill(r.skillId)).filter(s=>s?.type==='active'&&sharedSkillScopeAllowsEnemy(s.usageScope||'character',x.kind));
  const skills=[...new Map(rows.map(s=>[s.id,s])).values()].map(s=>{const t=timing(s);return {id:s.id,type:'active',cooldownSeconds:hero?skillCooldownSeconds(x,s):t.cooldownSeconds,castSeconds:t.castSeconds,actionCostSeconds:t.actionCostSeconds,mpCost:t.mpCost,priority:t.priority};});
  return {id:key(x),baseIntervalSeconds:hero?actorInterval(x):source.balanceSettings.monsters.catalog.find(m=>m.id===x.monsterId)?.timing.baseIntervalSeconds??config().actionReferenceSeconds,
   speed:hero?battleStats(x).speed:combatSpeed(x),mp:Math.max(0,Math.min(m.maxMp,Number.isFinite(x.mp)?x.mp:m.maxMp)),maxMp:m.maxMp,mpRegenPerSecond:m.regen,skills};
 }
 function canUse(view,s){
  const x=unit(view.id),d=skill(s.id);if(!x||x.hp<=0||!d)return false;
  const hero=Object.hasOwn(x,'job'),t=timing(d),effect=d.effect||d.kind;
  if((t.minTargets||1)>foes.filter(e=>e.hp>0).length&&hero)return false;
  if(t.requiredTargetStatusId&&!statusList().some(s=>s.statusId===t.requiredTargetStatusId&&unit(s.targetKey)?.hp>0&&(hero?foes:living()).some(x=>key(x)===s.targetKey)))return false;
  if(!hero){const c=__EMBERWILD_CONTROL_TEST_API.states[x.id];if(c?.rage||!living().length)return false;if(effect==='revive')return foes.some(e=>e.hp<=0);if(t.condition==='injured')return foes.some(e=>e.hp>0&&e.hp/e.maxhp<config().healThreshold);if(t.condition==='missingEffect'&&effect==='shield')return x.shield<x.atk*(d.power||0);return true;}
  if(!S.learned(x,d)||__EMBERWILD_MASTERY?.[d.type==='support'?'supportMissingRequirements':'coreMissingRequirements'](x,d.adapter.index,true).length)return false;
  if(['revive'].includes(effect))return heroes().some(h=>h.hp<=0);
  if(['heal','regen'].includes(effect)&&t.condition==='injured')return living().some(h=>h.hp/stats(h).hp<config().healThreshold);
  if(t.condition==='missingEffect'){
   const present=effects.some(f=>f.secondsSkillId===d.id&&(f.sourceKey??f.source)===memberKey(x)&&f.until>partyClock);
   const custom=statusList().some(a=>a.sourceKey===memberKey(x)&&a.statusId===d.statusId&&partyClock<a.expiresClock);
   if(present||custom)return false;
   if(effect==='shield'&&!d.systemEffect&&x.shield>=battleStats(x).atk*(d.power||0))return false;
  }
  if(d.statusId&&!__EMBERWILD_STATUS_TEST_API.definitions.some(v=>v.id===d.statusId))return false;
  if(d.statusId&&d.statusTarget==='rankedAllies'&&!d.statusTargetIncludeSelf&&!living().some(h=>h!==x))return false;
  if(d.type==='support'&&['allies','weakest','self'].includes(d.target))return living().length>0;
  if(d.target==='enemies'||(d.maxTargets||1)>1||d.statusTarget==='enemies')return foes.some(e=>e.hp>0);
  if(['polymorph','freeze','fear','tauntRage'].includes(effect))return singleTargetEnemyPool().some(e=>!__EMBERWILD_CONTROL_TEST_API.states[e.id]?.[effect==='tauntRage'?'rage':effect]);
  return singleTargetEnemyPool().length>0;
 }
 function ensure(){
  if(!party)return null;
  if(owner!==party){engine=null;owner=party;ended=false;scheduledAt=partyClock;needsRoster=true;procReady={};}
  if(!engine){engine=E.create({minimumActionIntervalSeconds:config().minimumActionIntervalSeconds,referenceSpeed:config().referenceSpeed},[],handlers);engine.now=Math.round(partyClock*1e6);}
  return engine;
 }
 function syncRoster(){
  if(!ensure())return;
  engine.config={minimumActionIntervalSeconds:config().minimumActionIntervalSeconds,referenceSpeed:config().referenceSpeed};
  engine.syncActors([...heroes(),...foes].map(definition));
  const retained=[...party.members,...foes].map(x=>key(x)+':');procReady=Object.fromEntries(Object.entries(procReady).filter(([id])=>retained.some(prefix=>id.startsWith(prefix))));
  for(const a of engine.actors){const x=unit(a.definition.id);a.alive=!!x&&x.hp>0;}
  syncResources();
 }
 function syncResources(){
  if(!engine)return;
  for(const a of engine.actors){const x=unit(a.definition.id);if(!x)continue;
   if(x.hp<=0&&a.alive)engine.setAlive(a.definition.id,false);else if(x.hp>0&&!a.alive)engine.setAlive(a.definition.id,true);
   {const m=mana(x);engine.setMpRegen(key(x),m.regen*Math.max(0,1+effectTotal(key(x),'mpRegen')));engine.setMpCostMultiplier(key(x),Math.max(0,m.cost-effectTotal(key(x),'mpCostReduction')));}
   const speed=Object.hasOwn(x,'job')?battleStats(x).speed:combatSpeed(x);if(speed!==a.speed)engine.setSpeed(key(x),speed);
   x.mp=engine.actor(key(x)).mp;
   if(Object.hasOwn(x,'job'))for(const s of a.definition.skills){const d=skill(s.id);(d.type==='support'?supportCooldowns:actorCooldowns)[memberKey(x)+'-'+d.adapter.index]=Math.max(0,(a.ready[s.id]-engine.now)/1e6);}
  }
 }
 function addTimer(id,actorId,duration,interval,payload,control=false,priority=0){
  if(!engine||!unit(actorId))return;
  if(!engine.actors.some(a=>a.definition.id===actorId)){if(engine.executing)return;syncRoster();}
  engine.removeStatus(id);if(duration!==null&&duration<=0)return;
  engine.addStatus({id,actorId,durationSeconds:duration,tickEverySeconds:interval,preventsAction:control,tickPriority:priority,payload});
 }
 function scheduleEffects(before,t,sk){
  if(!engine)return;
  for(const fx of effects)if(!before.has(fx)){
   if(t){fx.until=partyClock+t.durationSeconds;fx.secondsSkillId=sk.id;}
   fx.secondsId??='support:'+ ++serial;
   const periodic=['regen','dotAttack','dotMaxHp'].includes(fx.kind);
   addTimer(fx.secondsId,fx.target,Math.max(.000001,fx.until-partyClock),periodic?(t?.tickIntervalSeconds||config().periodicIntervalSeconds):null,{kind:'effect',id:fx.secondsId});
  }
 }
 function scheduleControls(t=null){
  if(!engine)return;
  const states=__EMBERWILD_CONTROL_TEST_API.states;
  for(const [actorId,c] of Object.entries(states))for(const kind of ['polymorph','freeze','fear','rage'])if(c[kind]){
   const row=c[kind];if(row.secondsUntil!==undefined)continue;
   const x=unit(actorId),duration=t?((x?.kind==='boss'||x?.kind==='final')&&kind!=='fear'?t.bossDurationSeconds:t.durationSeconds):row.turns*config().actionReferenceSeconds;
   row.secondsUntil=partyClock+duration;row.total=duration;row.turns=duration;
   addTimer('control:'+actorId+':'+kind,actorId,duration,null,{kind:'control',control:kind},kind==='polymorph'||kind==='freeze');
  }
 }
 function scheduleStatus(inst,remaining=null){
  if(!ensure())return;
  const d=inst.definition,t=d.timing||source.statusDefinitions.find(s=>s.id===inst.statusId)?.timing||{durationSeconds:d.permanent?null:d.duration*config().durationReferenceSeconds,periodicIntervalSeconds:config().periodicIntervalSeconds,triggerIntervalSeconds:config().triggerIntervalSeconds};
  if(!t)return;
  inst.duration=t.durationSeconds??0;inst.remainingTurns=inst.duration;inst.expiresClock=t.durationSeconds===null?Number.MAX_SAFE_INTEGER:partyClock+t.durationSeconds;inst.seconds=true;
  const duration=remaining??t.durationSeconds;inst.expiresClock=duration===null?Number.MAX_SAFE_INTEGER:partyClock+duration;
  if(d.control){const kind=d.control.kind==='tauntRage'?'rage':d.control.kind,c=__EMBERWILD_CONTROL_TEST_API.states[inst.targetKey]?.[kind],target=unit(inst.targetKey),boss=['boss','final'].includes(target?.kind),controlDuration=boss&&kind!=='fear'?(t.bossControlDurationSeconds??d.control.bossDuration*config().actionReferenceSeconds):duration;
   if(c&&(controlDuration===null||controlDuration>0)){c.secondsStatus=true;c.secondsUntil=controlDuration===null?Number.MAX_SAFE_INTEGER:partyClock+controlDuration;c.turns=controlDuration??Number.MAX_SAFE_INTEGER;c.total=c.turns;addTimer('control:'+inst.targetKey+':'+kind,inst.targetKey,controlDuration,null,{kind:'control',control:kind},kind==='freeze'||kind==='polymorph');}
  }
  if(d.periodic.length||d.modifiers.some(m=>m.kind==='regen'))addTimer('dot:'+inst.id,inst.targetKey,duration,t.periodicIntervalSeconds,{kind:'statusDot',id:inst.id});
  if(d.triggers?.some(t=>t.event==='targetTurnEnd'))addTimer('event:'+inst.id,inst.targetKey,duration,t.triggerIntervalSeconds,{kind:'statusEvent',id:inst.id},false,1);
  addTimer('status:'+inst.id,inst.targetKey,duration,null,{kind:'statusExpiry',id:inst.id},false);
 }
 function cleanTimers(){
  if(!engine)return;
  for(const [id,states] of Object.entries(__EMBERWILD_CONTROL_TEST_API.states))for(const [kind,c] of Object.entries(states))if(c.secondsStatus&&!statusList().some(s=>s.targetKey===id&&s.expiresClock>partyClock&&(s.definition.control?.kind===kind||s.definition.control?.kind==='tauntRage'&&kind==='rage')))__EMBERWILD_CONTROL_TEST_API.clear(unit(id),kind);
  const ids=new Set(statusList().map(s=>s.id)),fx=new Set(effects.map(s=>s.secondsId));
  engine.statuses=engine.statuses.filter(s=>{
   const p=s.payload;if(p?.kind==='control')return !!__EMBERWILD_CONTROL_TEST_API.states[s.actorId]?.[p.control];
   if(p?.kind==='effect')return fx.has(p.id);
   if(p?.id&&p.kind.startsWith('status'))return ids.has(p.id);
   return true;
  });
 }
 function clock(at){
  const delta=Math.max(0,at-partyClock);partyClock=at;
  for(const h of heroes()){h.healPotionCooldownRemaining=Math.max(0,(h.healPotionCooldownRemaining||0)-delta);for(const id of Object.keys(h.eventPassiveCooldowns||{}))h.eventPassiveCooldowns[id]=Math.max(0,h.eventPassiveCooldowns[id]-delta);const b=h.imbue;if(b?.remainingTurns){b.remainingTurns=Math.max(0,b.remainingTurns-delta);if(!b.remainingTurns)h.imbue=null;}}
  for(const c of Object.values(__EMBERWILD_CONTROL_TEST_API.states))for(const s of Object.values(c))if(s.secondsUntil!==undefined)s.turns=Math.max(0,s.secondsUntil-at);
 }
 function periodic(event){
  const p=event.payload,x=unit(event.actorId);if(!p)return;
  if(event.type==='statusExpire'){
   if(p.kind==='control')__EMBERWILD_CONTROL_TEST_API.clear(x,p.control);
   else if(p.kind==='effect')effects=effects.filter(f=>f.secondsId!==p.id);
   else if(p.kind==='statusExpiry')EmberwildStatusCombatState.seconds.replaceInstances(statusList().filter(s=>s.id!==p.id));
   return;
  }
  if(!x||x.hp<=0)return;
  if(p.kind==='statusEvent')EmberwildCombatEvents.emit('targetTurnEnd',x,p.id);
  else if(p.kind==='statusDot'){
   const inst=statusList().find(s=>s.id===p.id);if(!inst)return;
   for(const fx of inst.definition.periodic)EmberwildStatusCombatState.seconds.periodic(inst,fx);
   for(const fx of inst.definition.modifiers.filter(f=>f.kind==='regen')){const before=x.hp;x.hp=Math.min(__EMBERWILD_STATUS_TEST_API.maxHp(x),x.hp+healingAmount(partyMember(inst.sourceKey),__EMBERWILD_STATUS_TEST_API.maxHp(x)*fx.value));if(x.hp>before)recordCombatContribution(partyMember(inst.sourceKey),'healing',x.hp-before);}
  }else if(p.kind==='effect'){
   const fx=effects.find(f=>f.secondsId===p.id);if(!fx)return;const caster=partyMember(fx.sourceKey??fx.source);
   if(fx.kind==='regen'){const before=x.hp;x.hp=Math.min(__EMBERWILD_STATUS_TEST_API.maxHp(x),x.hp+__EMBERWILD_STATUS_TEST_API.maxHp(x)*fx.value);if(caster&&x.hp>before)recordCombatContribution(caster,'healing',x.hp-before);}
   else{const amount=(fx.kind==='dotAttack'?(caster?battleStats(caster).atk:0):__EMBERWILD_STATUS_TEST_API.maxHp(x))*fx.value,dealt=Math.min(x.hp,Math.max(1,Math.round(amount)));x.hp-=dealt;if(caster)recordCombatContribution(caster,'damage',dealt);note(fx.name+' → '+(Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x))+' '+dealt+' 持續傷害','playerDamage');}
  }else if(p.kind==='token'){
   const api=__EMBERWILD_TOKEN_TEST,g=api.item(x);if(g&&g.snapshot.ability.event==='round')api.trigger(x,'round');
  }
 }
 function castResolved(x,s){
  const d=skill(s.id),before=new Set(effects),t=timing(d);currentTiming=t;
  let ok;
  try{
   if(Object.hasOwn(x,'job'))ok=d.type==='support'?castSupport(x,d.adapter.index):castPartySkill(x,d.adapter.index,battleStats(x));
   else{const shared=sharedSkillById(d.id),old=x.atk,c=__EMBERWILD_CONTROL_TEST_API.states[x.id];x.atk*=1-(c?.fear?.damageReduction||0);try{ok=EmberwildCombatEvents.action(x,()=>castEnemySharedSkill(x,shared));}finally{x.atk=old;}EmberwildCombatEvents.endTurn(x,ok!==false);}
  }finally{currentTiming=null;}
  if(ok===false){const a=engine.find(key(x));engine.setMp(key(x),Math.min(a.definition.maxMp,engine.actor(key(x)).mp+s.mpCost*a.mpCostMultiplier));a.ready[s.id]=engine.now;engine.deferSkill(key(x),s.id,config().minimumActionIntervalSeconds);return false;}
  scheduleEffects(before,t,d);scheduleControls(t);
  if(Object.hasOwn(x,'job')){
   const a=engine.find(key(x)),reduction=cooldownReductionOnCast(x,d.id);if(reduction)a.ready[s.id]=Math.max(engine.now+Math.round(config().minimumActionIntervalSeconds*1e6),a.ready[s.id]-Math.round(reduction*1e6));
   EmberwildCombatEvents.endTurn(x,true);
  }
  return true;
 }
 function basicAction(x){
   recordAction(key(x),Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x),'普攻');
   if(Object.hasOwn(x,'job')){performHeroBasic(x);EmberwildCombatEvents.endTurn(x,true);}
   else{x.__secondsBasic=true;x.__secondsFearChecked=true;try{performEnemyAction(x);}finally{delete x.__secondsBasic;delete x.__secondsFearChecked;}}

 }
 function handleEvent(event){
  clock(event.timeSeconds);
  if(event.type==='statusTick'||event.type==='statusExpire'){periodic(event);return;}
  const x=unit(event.actorId);if(!x||x.hp<=0)return;
  x.mp=engine.actor(event.actorId).mp;
  if(event.type==='castStart'){recordAction(event.actorId,Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x),'詠唱');note((Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x))+'開始施放 '+skill(event.skillId).name);return;}
  if(event.type==='interrupt'){note((Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x))+'的施法被中斷。');return;}
  if(event.type==='blocked'){note(combatEnemyName(x)+' 因畏懼延後行動。');return;}
  if(event.type==='basic'){
   basicAction(x);  }else if(event.type==='skill'||event.type==='castComplete'){
   const s=engine.find(event.actorId).definition.skills.find(s=>s.id===event.skillId);if(s){if(castResolved(x,s))recordAction(event.actorId,Object.hasOwn(x,'job')?characterName(x):combatEnemyName(x),skill(s.id).name);}
  }
  scheduleEffects(new Set(effects.filter(f=>f.secondsId)),null,null);scheduleControls();
  for(const a of engine.actors){const u=unit(a.definition.id);if(!u)continue;const steps=(u.procAdvanceSteps||0)+(u.basicAdvanceRound?1:0)+(u.sharedAdvanceSteps||0);if(steps){const advance=steps*config().advanceStepSeconds*1e6;a.basicAt=Math.max(engine.now+config().minimumActionIntervalSeconds*1e6,a.basicAt-advance);a.actionSpeedAt=Math.max(engine.now+config().minimumActionIntervalSeconds*1e6,a.actionSpeedAt-advance);a.actionAt=Math.max(a.actionSpeedAt,a.actionFixedAt);for(const k of ['procAdvanceSteps','basicAdvanceRound','procAdvanceRound','sharedAdvanceSteps','sharedAdvanceRound'])delete u[k];}}
 }
 const handlers={canAct:view=>{const x=unit(view.id);return !!x&&x.hp>0&&living().length>0&&foes.some(e=>e.hp>0);},canUse,
  beforeAction(view){const x=unit(view.id);if(Object.hasOwn(x,'job'))return true;const f=__EMBERWILD_CONTROL_TEST_API.states[x.id]?.fear;return !f||Math.random()>=f.skipChance;},onEvent:handleEvent};
 function finish(){
  if(ended||!foes.length||living().length&&foes.some(e=>e.hp>0))return false;
  ended=true;const victory=living().length>0,finalAttempt=foes.some(e=>e.kind==='final');
  EmberwildBattleSummary.finish(victory?'victory':'wipe');
  for(const e of foes)if(e.hp<=0&&!e.rewarded)rewardGroupKill(e);
  EmberwildCombatEvents.clear();EmberwildTokenCombatState.restore([]);engine.statuses=[];effects=[];EmberwildStatusCombatState.seconds.replaceInstances([]);
  const quest=party.questChallenge;
  if(!victory){running=false;party.members[0].gold-=Math.floor(party.members[0].gold*GS('combat.defeatGoldLoss',.05));note('全隊戰敗，生命已回滿。');refillParty();foes=[];enemy=null;}
  else{refillParty();note('本次遭遇勝利。');if(foes.some(e=>e.kind==='final'))running=false;}
  if(activeBattleStat)finalizeBattleStatistics(victory?'victory':'wipe');
  if(finalAttempt){if(victory)EmberwildFinalEncounter.complete(party.map);else EmberwildFinalEncounter.fail(party.map);}
  if(quest)EmberwildQuestEncounter.complete(quest);else if(victory&&party.bossChallenge?.active)EmberwildBossEncounter.complete();
  return true;
 }
 function step(){if(foes.some(e=>e.hp>0)&&!EmberwildBattleConfiguration.pending())EmberwildBattleConfiguration.begin();return EmberwildBattleConfiguration.combat(stepCore);}
 function stepCore(){
  ensure();
  if(!foes.some(e=>e.hp>0)||ended){
   if(!ended&&foes.length)finish();
   if(!running)return {delaySeconds:config().encounterDelaySeconds};
   const next=Math.max(mono(),scheduledAt);engine.advanceTo(next,{maxEvents:1});clock(next);
   spawnGroup();ended=false;encounterStart=partyClock;syncRoster();
   const before=new Set(effects);
   for(const h of heroes()){
    __EMBERWILD_TOKEN_TEST.ensureBattle(h);const g=__EMBERWILD_TOKEN_TEST.item(h);if(g?.snapshot.ability.event==='round'){const t=tokenTiming(g);addTimer('token:'+key(h),key(h),null,t.triggerIntervalSeconds,{kind:'token'});const timer=engine.statuses.find(s=>s.id==='token:'+key(h));timer.next=engine.now+Math.round(t.firstTriggerSeconds*1e6);}
   }
   scheduleEffects(before,null,null);
  }else if(!engine.actors.length||needsRoster){
   encounterStart=partyClock;syncRoster();
   const before=new Set(effects);
   for(const h of heroes()){
    __EMBERWILD_TOKEN_TEST.ensureBattle(h);const g=__EMBERWILD_TOKEN_TEST.item(h);if(g?.snapshot.ability.event==='round'){
     const t=tokenTiming(g);addTimer('token:'+key(h),key(h),null,t.triggerIntervalSeconds,{kind:'token'});engine.statuses.find(s=>s.id==='token:'+key(h)).next=engine.now+Math.round(t.firstTriggerSeconds*1e6);
    }
   }
   scheduleEffects(before,null,null);
  }
  needsRoster=false;
  scheduleControls();cleanTimers();syncResources();
  let next=engine.nextEvent();
  if(!next){const at=Math.max(mono(),scheduledAt);engine.advanceTo(at);clock(at);scheduledAt=at+config().actionReferenceSeconds;return {delaySeconds:config().actionReferenceSeconds};}
  if(next.at/1e6>scheduledAt){scheduledAt=next.at/1e6;return {delaySeconds:Math.max(.000001,scheduledAt-mono())};}
  const at=next.at/1e6;currentEvents=[];lastActionOrder=[];actionVisualTime=Date.now();let count=0,dotPhase=true;
  while((next=engine.nextEvent())&&next.at/1e6===at&&count++<2000){
   if(dotPhase&&next.priority>0){EmberwildCombatEvents.scanDeaths();EmberwildCombatEvents.drain();dotPhase=false;syncResources();if(!living().length||!foes.some(e=>e.hp>0))break;}
   clock(at);
   for(const h of living())if(h.healPotionCooldownRemaining<=0){if(useAutoHealingPotion(h)){const item=SHOP.find(s=>s.id===h.autoPotionId);h.healPotionCooldownRemaining=item?.timing?.cooldownSeconds??(item?.cooldown||0)*actorInterval(h);}}
   engine.advanceTo(at,{maxEvents:1});cleanTimers();syncResources();
   if(!dotPhase&&(!living().length||!foes.some(e=>e.hp>0)))break;
  }
  EmberwildCombatEvents.scanDeaths();EmberwildCombatEvents.drain();syncResources();
  for(const e of foes)if(e.hp<=0&&!e.rewarded)rewardGroupKill(e);
  if(finish()){scheduledAt=mono()+config().encounterDelaySeconds;return {delaySeconds:config().encounterDelaySeconds};}
  next=engine.nextEvent();scheduledAt=next?next.at/1e6:mono()+config().actionReferenceSeconds;return {delaySeconds:Math.max(.000001,scheduledAt-mono())};
 }
 function tokenTiming(g){const a=g?.snapshot?.ability;if(a?.timing)return a.timing;return {cooldownSeconds:(a?.cooldown||0)*config().actionReferenceSeconds,durationSeconds:(a?.duration||0)*config().durationReferenceSeconds,triggerIntervalSeconds:config().durationReferenceSeconds,firstTriggerSeconds:(a?.threshold||1)*config().durationReferenceSeconds};}
 function install(doc){
  source=doc;GAMEPLAY_SETTINGS.combat.seconds=copy(config());
  for(const [j,group] of ITEM_FORMS.entries())for(const [k,slot] of group.entries())for(const [i,form] of slot.entries()){const mana=doc.equipmentForms?.[j]?.[k]?.[i]?.mana;if(mana)form.mana=copy(mana);else delete form.mana;}
  for(const s of S.system().definitions){const original=doc.skillSystem.definitions.find(x=>x.id===s.id);if(original)s.timing=copy(original.timing);}
  for(const d of statusDefs()){const original=doc.statusDefinitions.find(x=>x.id===d.id);if(original)d.timing=copy(original.timing);}
  for(const item of SHOP){const original=doc.items.find(x=>x.id===item.id);if(original?.timing)item.timing=copy(original.timing);}
 }
 function pack(){if(!party)return null;ensure();syncResources();return {version:1,timeline:engine.snapshot(),uidSerial,serial,ended,encounterStart,scheduledAt,procReady:copy(procReady)};}
 function restore(raw){engine=null;owner=party;ended=false;pendingRestore=raw;
  if(raw){engine=E.restore(raw.timeline,handlers);serial=raw.serial;if(raw.uidSerial!==undefined)uidSerial=raw.uidSerial;ended=raw.ended;encounterStart=raw.encounterStart;scheduledAt=raw.scheduledAt??engine.now/1e6;needsRoster=false;procReady=copy(raw.procReady);partyClock=engine.now/1e6;syncResources();}
 }
 function migrateLegacy(){
  if(!party)return;const before=partyClock,oldCds=copy(actorCooldowns),oldSupports=copy(supportCooldowns);partyClock=0;scheduledAt=0;round=0;combatRoundProgress=null;roundIterator=null;restore(null);ensure();syncRoster();
  for(const h of party.members){if(h.imbue&&h.imbue.clock!=='battleSeconds'){h.imbue.remainingTurns*=config().durationReferenceSeconds;h.imbue.totalTurns=(h.imbue.totalTurns||0)*config().durationReferenceSeconds;h.imbue.clock='battleSeconds';}h.healPotionCooldownRemaining=(h.healPotionCooldownRemaining||0)*actorInterval(h);}
  for(const fx of effects){fx.until=Math.max(0,fx.until-before)*config().durationReferenceSeconds;delete fx.secondsId;}
  for(const c of Object.values(__EMBERWILD_CONTROL_TEST_API.states))for(const row of Object.values(c))delete row.secondsUntil;
  for(const inst of statusList()){const left=inst.definition.permanent?null:Math.max(.000001,(inst.expiresClock===Number.MAX_SAFE_INTEGER?inst.remainingTurns:inst.expiresClock-before)*config().durationReferenceSeconds);inst.appliedClock=0;delete inst.seconds;scheduleStatus(inst,left);}
  scheduleEffects(new Set(),null,null);scheduleControls();
  for(const h of heroes()){const a=engine.find(key(h));for(const s of a.definition.skills){const d=skill(s.id),old=(d.type==='support'?oldSupports:oldCds)[memberKey(h)+'-'+d.adapter.index]||0;a.ready[s.id]=Math.round(old*actorInterval(h)*1e6);}}
  const enemyCds=EmberwildEnemyCombatState.pack();for(const e of foes){const a=engine.find(key(e)),base=source.balanceSettings.monsters.catalog.find(m=>m.id===e.monsterId)?.timing.baseIntervalSeconds??config().actionReferenceSeconds;for(const s of a.definition.skills)a.ready[s.id]=Math.round((enemyCds[e.id]?.[s.id]||0)*base*1e6);}
  const c=party.offlineExploration;if(c){c.version=3;c.combat=null;}
 }
 const oldValidate=validateBalanceConfig,oldApply=applyBalanceConfig,oldExport=exportableBalance;
 validateBalanceConfig=function(input){if(importing)return oldValidate(input);Schema.assertJSON(input);const d=Schema.normalize(input);return Schema.attach(oldValidate(Schema.legacy(d)),d);};
 applyBalanceConfig=function(input,options={}){Schema.assertJSON(input);const d=Schema.normalize(input);importing++;let out;try{out=oldApply(Schema.legacy(d),{...options,persist:false});}finally{importing--;}install(Schema.normalize(Schema.attach(oldExport(),d)));engine=null;owner=party;if(party?.offlineExploration?.combat?.seconds)restore(party.offlineExploration.combat.seconds);else if(party&&foes.length)migrateLegacy();if(options.persist!==false)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));return out;};
 exportableBalance=function(){const d=oldExport();return importing?d:Schema.attach(d,source);};
 const oldEnemyCast=castEnemySharedSkill;castEnemySharedSkill=function(e,s,...args){const d=skill(s?.id);if(d?.type!=='proc')return oldEnemyCast(e,s,...args);const k=key(e)+':'+d.id;if((procReady[k]||0)>partyClock)return false;const out=oldEnemyCast(e,s,...args);if(out!==false)procReady[k]=partyClock+(timing(d)?.cooldownSeconds||0);return out;};
 const oldCast=castPartySkill,oldSupport=castSupport;
 castPartySkill=function(h,i,v){const d=S.byPosition(h?.job,'core',i),k=key(h)+':'+d?.id;if(d?.type==='proc'&&(procReady[k]||0)>partyClock)return false;const before=new Set(effects),t=timing(d);const out=oldCast(h,i,v);if(out!==false){if(d?.type==='proc')procReady[k]=partyClock+(t?.cooldownSeconds||0);scheduleEffects(before,t,d);scheduleControls(t);}return out;};
 castSupport=function(h,i){const before=new Set(effects),d=S.byPosition(h?.job,'support',i),out=oldSupport(h,i);if(out!==false){scheduleEffects(before,timing(d),d);scheduleControls(timing(d));}return out;};
 const oldNote=note;note=function(text,type){const secs=partyClock||0,stamp=String(Math.floor(secs/60)).padStart(2,'0')+':'+(secs%60).toFixed(1).padStart(4,'0');let value=String(text);if(currentTiming)value=value.replace(/\d+(?:\.\d+)? 回合/g,currentTiming.durationSeconds+' 秒');value=value.replace(/回合/g,'秒');return oldNote('['+stamp+'] '+value,type);};
 skillManaCost=function(i,h=state){return timing(S.byPosition(h.job,'core',i))?.mpCost||0;};
 skillCooldown=function(i,h=state){const s=S.byPosition(h.job,'core',i);return s?(s.type==='proc'?timing(s).cooldownSeconds:skillCooldownSeconds(h,s)):0;};
 supportSkillCooldown=function(h,i){const s=S.byPosition(h.job,'support',i);return s?(s.type==='proc'?timing(s).cooldownSeconds:skillCooldownSeconds(h,s)):0;};
 gemCooldownOnCast=function(i,h=state){const s=S.byPosition(h.job,'core',i),cd=skillCooldown(i,h);return s?.type==='active'?Math.max(config().minimumActionIntervalSeconds,cd-cooldownReductionOnCast(h,s.id)):cd;};
 __EMBERWILD_EQUIPMENT_SKILLS.supportCooldownOnCast=function(h,i){const s=S.byPosition(h.job,'support',i);return Math.max(config().minimumActionIntervalSeconds,supportSkillCooldown(h,i)-(s?cooldownReductionOnCast(h,s.id):0));};
 const oldReset=resetEncounter;resetEncounter=function(...args){const out=oldReset(...args);engine=null;owner=party;ended=false;scheduledAt=partyClock;needsRoster=true;procReady={};return out;};
 const oldSpawn=spawnGroup;spawnGroup=function(...args){const cds=copy(actorCooldowns),supports=copy(supportCooldowns),out=oldSpawn(...args);actorCooldowns=cds;supportCooldowns=supports;needsRoster=true;return out;};
 const oldPack=packParty,oldPartyValidate=validateParty;
 packParty=function(){const out=oldPack();if(party){out.huntingMode=party.huntingMode||'single';out.currentHuntingMode=party.currentHuntingMode||out.huntingMode;}return out;};
 validateParty=function(raw){if(raw?.huntingMode!==undefined&&!['single','group'].includes(raw.huntingMode))throw Error('狩獵模式無效');const out=oldPartyValidate(raw);out.huntingMode=raw?.huntingMode||'single';out.currentHuntingMode=raw?.currentHuntingMode||out.huntingMode;return out;};
 const baseSupplyDetail=supplyDetail;supplyDetail=function(item){let text=baseSupplyDetail(item);if(item?.type==='imbue')text=text.replace(/持續 \d+(?:\.\d+)?(?: 戰鬥)? 回合/g,'持續 '+item.timing.durationSeconds+' 秒');return text;};
 const baseSupplyDetails=supplyBuffDetails;supplyBuffDetails=function(b,k){const d=baseSupplyDetails(b,k);if(k==='imbue'){d.time=Number(b.remainingTurns.toFixed(1))+' / '+Number(b.totalTurns.toFixed(1))+' 秒';d.clock='戰鬥秒數';}return d;};
 const baseSupplyStatus=supplyStatus;supplyStatus=function(h){return baseSupplyStatus(h).replace(/回合/g,'秒');};
 globalThis.setHuntingMode=function(mode){if(!['single','group'].includes(mode))return false;party.huntingMode=mode;save();render();return true;};
 globalThis.EmberwildSecondsCombat={active:true,config,resourceProfile:mana,step,pack,restore,migrateLegacy,tokenTiming,statusApplied:scheduleStatus,get timeline(){return engine;},get source(){return source;},ensure,sync:syncResources,
  encounterSize(){party.currentHuntingMode=party.huntingMode||'single';if(party.currentHuntingMode==='single')return 1;const weights=config().groupWeights,total=weights.reduce((a,b)=>a+b,0);let pick=Math.random()*total;for(let i=0;i<weights.length;i++)if((pick-=weights[i])<0)return i+3;return 5;},
  validateSnapshot(raw){if(raw!==null){if(raw.version!==1||!Number.isSafeInteger(raw.serial)||raw.serial<0||typeof raw.ended!=='boolean'||!Number.isFinite(raw.encounterStart)||raw.scheduledAt!==undefined&&(!Number.isFinite(raw.scheduledAt)||raw.scheduledAt<0)||raw.uidSerial!==undefined&&(!Number.isSafeInteger(raw.uidSerial)||raw.uidSerial<0))throw Error('秒數快照無效');E.restore(raw.timeline);}},
  reduceCooldowns(h,legacyAmount){if(engine?.actors.some(a=>a.definition.id===key(h)))engine.reduceCooldowns(key(h),legacyAmount*actorInterval(h));},
  bossMultiplier(e){const f=GAMEPLAY_SETTINGS.combat.finalBoss,schedule=config().finalBoss,elapsed=partyClock-encounterStart;if(elapsed>schedule.enrageAfterSeconds)return f.enrageMultiplier;e.secondsSpecialAt??=encounterStart+schedule.specialIntervalSeconds;if(partyClock>=e.secondsSpecialAt){while(e.secondsSpecialAt<=partyClock)e.secondsSpecialAt+=schedule.specialIntervalSeconds;return f.specialMultiplier;}return 1;}
 };
 install(source);
 if(party)migrateLegacy();
})();
