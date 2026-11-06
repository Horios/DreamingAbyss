/* Canonical seconds/MP extension. Legacy positional timing is a derived adapter,
   retained for old import validators, never used by the seconds scheduler. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EmberwildSecondsSchema=api;})(globalThis,()=>{
 'use strict';
 const VERSION=1,copy=x=>JSON.parse(JSON.stringify(x)),round=n=>Math.round(n*1e6)/1e6;
 const finite=(v,min=0,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 const fail=s=>{throw Error('秒數戰鬥設定：'+s);};
 const isActive=s=>s.type==='active'||s.type==='support';
 function assertJSON(input){JSON.stringify(input,(_k,v)=>{if(v===undefined||['function','bigint','symbol'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))throw Error('不是合法 JSON 值');return v;});return input;}
 function defaults(doc){
  const combat=doc.balanceSettings?.combat||{},p=combat.pacing||{},reference=(p.roundMinimumMs||6000)/1000,actionReference=reference/2;
  return {version:VERSION,referenceSpeed:combat.speed?.enemyBase||106,minimumActionIntervalSeconds:(p.actionIntervalMs||1500)/1000/5,
   actionReferenceSeconds:actionReference,durationReferenceSeconds:reference,periodicIntervalSeconds:reference,triggerIntervalSeconds:actionReference,
   advanceStepSeconds:(p.actionIntervalMs||1500)/1000,encounterDelaySeconds:(p.actionIntervalMs||1500)/1000,healThreshold:.75,
   mana:{maxMp:100,regenPerSecond:round(100/(reference*10)),costMultiplier:1},
   classes:[0,1,2,3].map(job=>({job,baseIntervalSeconds:actionReference})),
   groupWeights:[1,1,1],finalBoss:{enrageAfterSeconds:(combat.finalBoss?.enrageAfterTurn??45)*actionReference,specialIntervalSeconds:(combat.finalBoss?.specialEveryTurns||5)*actionReference},migration:{version:1,source:'actor-turns',resourceBudget:100,recoveryReferencePeriods:10}};
 }
 function timing(skill,job,config){
  const interval=config.classes.find(c=>c.job===job)?.baseIntervalSeconds||config.actionReferenceSeconds;
  const active=isActive(skill),power=Math.abs(Number(skill.power??skill.value)||1),area=skill.target==='enemies'||skill.target==='allies'||Number(skill.maxTargets)>1;
  const control=['polymorph','freeze','frost','fear','tauntRage','summonFreezeTrap','summonMorphTrap'].includes(skill.effect);
  const mp=active?round(config.mana.maxMp*Math.min(.25,Math.max(.08,.08*Math.sqrt(power)+(area?.04:0)+(control?.04:0)))):0;
  const heal=skill.effect==='heal'||skill.effect==='revive'||skill.kind==='regen',buff=skill.type==='support'||['guard','regen','taunt'].includes(skill.systemEffect)||skill.effect==='shield';
  return {cooldownSeconds:active?round((Math.max(0,Number(skill.cooldown)||0)+(Number(skill.cooldown)>0?1:0))*interval):0,
   mpCost:mp,castSeconds:0,actionCostSeconds:0,priority:heal?0:buff?1:2,
   durationSeconds:round(Math.max(0,Number(skill.duration)||0)*(control?interval:config.durationReferenceSeconds)),
   bossDurationSeconds:round(Math.max(0,Number(skill.bossDuration)||0)*interval),
   tickIntervalSeconds:config.periodicIntervalSeconds,condition:heal?'injured':buff?'missingEffect':'always'};
 }
 // Initial cooldown (v0.074): time from each encounter's start until a skill may first be cast; the reuse
 // cooldown (cooldownSeconds) starts after each cast. Skills without an explicit value use this role rule
 // instead of becoming instantly ready: a share of the reuse cooldown that depends on the skill's role,
 // clamped per role and never longer than the reuse cooldown, rounded to 0.5 s.
 const INITIAL_ROLES={defense:[0,0,0],heal:[.15,.5,2],taunt:[.15,.5,2],buff:[.2,1,4],debuff:[.2,1,4],control:[.3,2,6],area:[.35,2,6],damage:[.25,1,4]};
 function initialCooldownRole(skill){
  const k=skill.kind,e=skill.effect,se=skill.systemEffect;
  if(e==='shield'||e==='revive'||e==='cleanse'||k==='guard'||se==='guard')return 'defense';
  if(e==='heal'||k==='regen'||se==='regen')return 'heal';
  if(e==='tauntRage'||se==='taunt')return 'taunt';
  if(['polymorph','freeze','frost','fear','summonFreezeTrap','summonMorphTrap'].includes(e)||se==='slow')return 'control';
  if(skill.type==='support')return ['fracture','weaken','damageAmp'].includes(k)?'debuff':'buff';
  if(e==='applyStatus')return skill.statusTarget==='enemies'||skill.statusTarget==='enemy'?'debuff':'buff';
  if(skill.target==='enemies'||Number(skill.maxTargets)>1)return 'area';
  return 'damage';
 }
 function defaultInitialCooldownSeconds(skill,cooldownSeconds=skill?.timing?.cooldownSeconds){
  if(!isActive(skill)||!(cooldownSeconds>0))return 0;
  const [ratio,min,max]=INITIAL_ROLES[initialCooldownRole(skill)];
  return Math.min(cooldownSeconds,Math.round(Math.min(max,Math.max(min,cooldownSeconds*ratio))*2)/2);
 }
 function initialCooldownSeconds(skill){const t=skill?.timing;return finite(t?.initialCooldownSeconds,0,86400)?t.initialCooldownSeconds:defaultInitialCooldownSeconds(skill);}
 // Cooldown reduction (v0.075): every reduction source has its own explicit rule, a percent of the reuse
 // cooldown or a fixed number of seconds per point. Percent reductions apply first, then fixed seconds.
 // The part of a cooldown below thresholdSeconds is diminished by factor, and no reduction takes a
 // cooldown below minimumSeconds (a skill whose own cooldown is shorter keeps it). Initial cooldowns
 // are not reduced.
 const COOLDOWN_REDUCTION_SOURCES=['affixAll','affixSkill','fixedAll','fixedSkill','onCast','enemyDeath'];
 const COOLDOWN_REDUCTION_LABELS={affixAll:'裝備詞條：全技能冷卻（每點）',affixSkill:'裝備詞條：指定技能冷卻（每點）',fixedAll:'裝備固定效果／信物：全技能冷卻（每點）',fixedSkill:'裝備固定效果：指定技能冷卻（每點）',onCast:'寶石／裝備技能：施放時機率縮減（每次觸發）',enemyDeath:'敵人死亡被動：縮減目前冷卻（每點）'};
 function defaultCooldownReduction(){return {diminishing:{thresholdSeconds:5,factor:.5,minimumSeconds:2},sources:Object.fromEntries(COOLDOWN_REDUCTION_SOURCES.map(k=>[k,{mode:'flat',value:3}]))};}
 function cooldownReductionTotals(points,cfg){let percent=0,flat=0;for(const k of COOLDOWN_REDUCTION_SOURCES){const n=Number(points?.[k])||0,r=cfg.sources[k];if(!n||!r)continue;if(r.mode==='percent')percent+=n*r.value;else flat+=n*r.value;}return {percent,flat};}
 function finalizeCooldown(base,raw,cfg,minimumInterval=0){if(!(raw<base))return base;const d=cfg.diminishing,start=Math.min(base,d.thresholdSeconds),diminished=raw>=start?raw:start-(start-raw)*d.factor;return round(Math.max(diminished,Math.min(base,d.minimumSeconds),Math.min(base,minimumInterval)));}
 function applyCooldownReduction(base,points,cfg,minimumInterval=0){const {percent,flat}=cooldownReductionTotals(points,cfg);return finalizeCooldown(base,base*(1-Math.min(100,percent)/100)-flat,cfg,minimumInterval);}
 function cooldownReductionText(source,points,cfg){const r=cfg.sources[source],n=round((Number(points)||0)*r.value);return r.mode==='percent'?'−'+n+'%':'−'+n+' 秒';}
 function validateCooldownReduction(r){if(!r||typeof r!=='object')fail('冷卻縮減設定無效');const d=r.diminishing;if(!d||!finite(d.thresholdSeconds,0,3600)||!finite(d.factor,0,1)||!finite(d.minimumSeconds,0,3600))fail('冷卻縮減衰減設定無效');for(const k of COOLDOWN_REDUCTION_SOURCES){const x=r.sources?.[k];if(!x||!['percent','flat'].includes(x.mode)||!finite(x.value,0,x.mode==='percent'?100:3600))fail('冷卻縮減來源無效：'+k);}}
 function normalize(input){
  const doc=copy(input);doc.balanceSettings??={};doc.balanceSettings.combat??={};doc.balanceSettings.meta??={};
  const c=doc.balanceSettings.combat.seconds===undefined?defaults(doc):copy(doc.balanceSettings.combat.seconds);
  c.finalBoss??={enrageAfterSeconds:(doc.balanceSettings.combat.finalBoss?.enrageAfterTurn??45)*c.actionReferenceSeconds,specialIntervalSeconds:(doc.balanceSettings.combat.finalBoss?.specialEveryTurns||5)*c.actionReferenceSeconds};
  c.advanceStepSeconds??=(doc.balanceSettings.combat.pacing?.actionIntervalMs||1500)/1000;
  c.actionModel??='independent';
  c.cooldownReduction??=defaultCooldownReduction();
  c.recovery??={hpFractionPerSecond:round((doc.balanceSettings.rewards?.postVictoryHeal??.12)/c.durationReferenceSeconds),mpRegenMultiplier:1,minimumHpRatio:1,minimumMpRatio:0};
  doc.balanceSettings.combat.seconds=c;doc.balanceSettings.meta.combatTimingVersion=VERSION;doc.balanceSettings.meta.independentActionsVersion=1;doc.balanceSettings.meta.continuousExplorationVersion=1;
  for(const s of doc.skillSystem?.definitions||[]){s.timing??=timing(s,s.adapter?.job??s.jobs?.[0]??0,c);if(isActive(s))s.timing.initialCooldownSeconds??=defaultInitialCooldownSeconds(s);}
  for(const s of doc.statusDefinitions||[]){s.timing??={durationSeconds:s.permanent?null:round(s.duration*c.durationReferenceSeconds),periodicIntervalSeconds:c.periodicIntervalSeconds,triggerIntervalSeconds:c.triggerIntervalSeconds};if(s.control)s.timing.bossControlDurationSeconds??=round(s.control.bossDuration*c.actionReferenceSeconds);}
  for(const row of doc.balanceSettings.monsters?.catalog||[])row.timing??={baseIntervalSeconds:c.actionReferenceSeconds};
  for(const row of doc.companionTokens?.catalog||[]){const a=row.ability;a.timing??={cooldownSeconds:round(a.cooldown*c.actionReferenceSeconds),durationSeconds:round(a.duration*c.durationReferenceSeconds),triggerIntervalSeconds:c.durationReferenceSeconds,firstTriggerSeconds:round(a.threshold*c.durationReferenceSeconds)};}
  for(const item of doc.items||[])if(item.type==='healPotion'||item.type==='imbue')item.timing??={cooldownSeconds:round((item.cooldown||0)*c.actionReferenceSeconds),durationSeconds:round((item.duration||0)*c.durationReferenceSeconds)};
  doc.timeUnits={consumableClock:'wall',...(doc.timeUnits||{}),combat:'battleSeconds',skillCooldown:'battleSeconds',supportDuration:'battleSeconds',statusDuration:'battleSeconds',itemDuration:'battleSeconds'};
  if(doc._reference?.units){doc._reference.units.cooldown='canonical timing.cooldownSeconds：戰鬥秒數；舊 cooldown 為相容投影';doc._reference.units.duration='canonical timing.durationSeconds：戰鬥秒數；抗性／屬性增幅與加倍券維持現實時間';}
  validate(doc);return doc;
 }
 function validate(doc){
  const c=doc?.balanceSettings?.combat?.seconds;if(c?.actionModel!=='independent')fail('必須使用獨立普攻與技能時間軸');if(!c||c.version!==VERSION)fail('缺少版本 1');
  for(const k of ['referenceSpeed','minimumActionIntervalSeconds','actionReferenceSeconds','durationReferenceSeconds','periodicIntervalSeconds','triggerIntervalSeconds'])if(!finite(c[k],.000001,3600))fail(k+' 必須為正秒數／速度');
  if(!finite(c.advanceStepSeconds,.000001,3600)||!finite(c.encounterDelaySeconds,0,3600)||!finite(c.healThreshold,0,1))fail('遭遇等待或治療門檻無效');
  if(!c.finalBoss||!finite(c.finalBoss.enrageAfterSeconds)||!finite(c.finalBoss.specialIntervalSeconds,.000001))fail('終局首領計時無效');
  if(!c.recovery||!finite(c.recovery.hpFractionPerSecond)||!finite(c.recovery.mpRegenMultiplier)||!finite(c.recovery.minimumHpRatio,0,1)||!finite(c.recovery.minimumMpRatio,0,1))fail('脫戰恢復與遭遇門檻無效');
  if(c.cooldownReduction!==undefined)validateCooldownReduction(c.cooldownReduction);
  if(!c.mana||!finite(c.mana.maxMp,1)||!finite(c.mana.regenPerSecond)||!finite(c.mana.costMultiplier))fail('魔力預算無效');
  if(!Array.isArray(c.classes)||c.classes.length!==4||new Set(c.classes.map(x=>x.job)).size!==4||c.classes.some(x=>!Number.isInteger(x.job)||x.job<0||x.job>3||!finite(x.baseIntervalSeconds,.000001,3600)))fail('職業間隔需各一筆');
  if(!Array.isArray(c.groupWeights)||c.groupWeights.length!==3||c.groupWeights.some(x=>!finite(x))||!c.groupWeights.some(x=>x>0))fail('群怪 3／4／5 隻權重無效');
  for(const s of doc.skillSystem?.definitions||[]){if(['mpCost','manaCost','cooldownSeconds','castSeconds','actionCostSeconds'].some(k=>Object.hasOwn(s,k)))fail(s.id+' 秒數／MP 欄位必須放在 timing');const t=s.timing;if(!t)fail(s.id+' 缺少時間設定');for(const k of ['cooldownSeconds','mpCost','castSeconds','actionCostSeconds','durationSeconds','bossDurationSeconds'])if(!finite(t[k]))fail(s.id+' '+k+' 無效');if(!finite(t.tickIntervalSeconds,.000001)||!Number.isSafeInteger(t.priority)||t.priority<0||t.priority>99||!['always','injured','missingEffect'].includes(t.condition))fail(s.id+' 條件／優先級無效');if(t.initialCooldownSeconds!==undefined&&!finite(t.initialCooldownSeconds,0,86400))fail(s.id+' initialCooldownSeconds 無效');if(t.minTargets!==undefined&&(!Number.isSafeInteger(t.minTargets)||t.minTargets<1||t.minTargets>99))fail(s.id+' 目標數門檻無效');if(t.requiredTargetStatusId!=null&&!doc.statusDefinitions?.some(x=>x.id===t.requiredTargetStatusId))fail(s.id+' 連動狀態不存在');if(!isActive(s)&&t.mpCost!==0)fail(s.id+' 被動／觸發技能不能新增耗魔');}
  for(const s of doc.statusDefinitions||[]){const t=s.timing;if(!t||(t.durationSeconds!==null&&!finite(t.durationSeconds,.000001))||!finite(t.periodicIntervalSeconds,.000001)||!finite(t.triggerIntervalSeconds,.000001))fail(s.id+' 狀態秒數無效');if(t.bossControlDurationSeconds!==undefined&&!finite(t.bossControlDurationSeconds))fail(s.id+' BOSS 控制秒數無效');}
  for(const m of doc.balanceSettings.monsters?.catalog||[]){const t=m.timing;if(!finite(t?.baseIntervalSeconds,.000001,3600))fail(m.id+' 怪物間隔無效');for(const [k,min] of [['maxMp',1],['regenPerSecond',0],['costMultiplier',0]])if(t[k]!==undefined&&!finite(t[k],min))fail(m.id+' 怪物魔力設定無效');}
  for(const row of doc.companionTokens?.catalog||[]){const t=row.ability?.timing;if(!t||!finite(t.cooldownSeconds)||!finite(t.durationSeconds)||!finite(t.triggerIntervalSeconds,.000001)||!finite(t.firstTriggerSeconds))fail(row.id+' 信物秒數無效');}
  for(const group of doc.equipmentForms||[])for(const slot of group||[])for(const form of slot||[])if(form.mana){const m=form.mana;if(!finite(m.maxMp)||!finite(m.regenPerSecond)||!finite(m.costReduction,0,1))fail(form.id+' 裝備魔力能力無效');}
  for(const row of doc.items||[])if(['imbue','healPotion'].includes(row.type)){const t=row.timing;if(!t||!finite(t.cooldownSeconds)||!finite(t.durationSeconds))fail(row.id+' 道具秒數無效');}
  return doc;
 }
 function validateImport(doc){
  const c=doc?.balanceSettings?.combat?.seconds,m=doc?.balanceSettings?.meta;
  if(c?.version!==VERSION)fail('缺少版本 1');
  for(const k of ['independentActionsVersion','continuousExplorationVersion'])if(m?.[k]!==undefined&&m[k]!==1)fail('未知的 '+k);
  validate(m?.independentActionsVersion===undefined&&m?.continuousExplorationVersion===undefined?normalize(doc):doc);return doc;
 }
 function legacy(input){
  const d=copy(input);delete d.balanceSettings?.combat?.seconds;delete d.balanceSettings?.meta?.combatTimingVersion;delete d.balanceSettings?.meta?.independentActionsVersion;delete d.balanceSettings?.meta?.continuousExplorationVersion;
  for(const group of d.equipmentForms||[])for(const slot of group||[])for(const form of slot||[])delete form.mana;
  d.timeUnits={...(d.timeUnits||{}),supportDuration:'battleRounds',itemDuration:'battleRounds'};
  return d;
 }
 function attach(output,source){
  const out=copy(output),d=source?.balanceSettings?.meta?.combatTimingVersion===VERSION?validate(source):normalize(source);out.balanceSettings.combat.seconds=copy(d.balanceSettings.combat.seconds);out.balanceSettings.meta.combatTimingVersion=VERSION;out.balanceSettings.meta.independentActionsVersion=1;out.balanceSettings.meta.continuousExplorationVersion=1;out.timeUnits=copy(d.timeUnits);if(out._reference?.units){out._reference.units.cooldown=d._reference?.units?.cooldown||'timing.cooldownSeconds：戰鬥秒數';out._reference.units.duration=d._reference?.units?.duration||'timing.durationSeconds：戰鬥秒數';}
  for(const [j,group] of (out.equipmentForms||[]).entries())for(const [k,slot] of group.entries())for(const [i,form] of slot.entries()){const mana=d.equipmentForms?.[j]?.[k]?.[i]?.mana;if(mana)form.mana=copy(mana);}
  for(const [name,key] of [['statusDefinitions','id'],['items','id']])for(const x of out[name]||[]){const s=d[name]?.find(s=>s[key]===x[key]);if(s?.timing)x.timing=copy(s.timing);}
  for(const s of out.skillSystem?.definitions||[]){const v=d.skillSystem.definitions.find(x=>x.id===s.id);if(v?.timing)s.timing=copy(v.timing);}
  for(const m of out.balanceSettings.monsters?.catalog||[]){const v=d.balanceSettings.monsters.catalog.find(x=>x.id===m.id);if(v?.timing)m.timing=copy(v.timing);}
  for(const t of out.companionTokens?.catalog||[]){const v=d.companionTokens.catalog.find(x=>x.id===t.id);if(v?.ability?.timing)t.ability.timing=copy(v.ability.timing);}
  return out;
 }
 return {VERSION,copy,assertJSON,defaults,timing,normalize,validate,validateImport,legacy,attach,INITIAL_ROLES,initialCooldownRole,defaultInitialCooldownSeconds,initialCooldownSeconds,COOLDOWN_REDUCTION_SOURCES,COOLDOWN_REDUCTION_LABELS,defaultCooldownReduction,cooldownReductionTotals,finalizeCooldown,applyCooldownReduction,cooldownReductionText};
});
