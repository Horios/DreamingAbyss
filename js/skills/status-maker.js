
(()=>{
/* STATUS_PURE_START */
const STATUS_SCHEMA_VERSION=1;
const STATUS_TAGS=['periodic','control','modifier','instant'];
const STATUS_MODIFIER_KINDS=['attack','critical','guard','fracture','power','weaken','vulnerable','damageAmp','regen','followup','mpRegen','mpCostReduction'];
const STATUS_CONTROL_KINDS=['polymorph','freeze','frost','rage','fear','tauntRage'];
const STATUS_PERIODIC_KINDS=['damage','heal'];
const STATUS_BASIS=['fixed','casterAttack','casterMaxHp','casterCurrentHp','casterMissingHp','casterDefense','casterShield','casterLevel','targetAttack','targetMaxHp','targetCurrentHp','targetMissingHp','targetDefense','targetShield','targetLevel'];
const STATUS_DAMAGE_RESOLUTIONS=['fixed','defended','elemental','true'];
const STATUS_HEAL_RESOLUTIONS=['heal','overflowShield'];
const STATUS_ELEMENTS=['physical','fire','ice','wind','light','shadow'];
function statusNum(v,fallback=0){v=Number(v);return Number.isFinite(v)?v:fallback;}
function statusInt(v,fallback=0,min=0,max=99){return Math.max(min,Math.min(max,Math.round(statusNum(v,fallback))));}
function statusClamp01(v,fallback=0){return Math.max(0,Math.min(1,statusNum(v,fallback)));}
function statusPolarity(def){
  if(['buff','debuff','neutral'].includes(def?.polarity))return def.polarity;
  let good=false,bad=!!def?.control;
  for(const m of def?.modifiers||[]){if(!m.value)continue;const negative=['fracture','weaken','vulnerable','damageAmp','followup'].includes(m.kind);if(negative===(m.value>0))bad=true;else good=true;}
  for(const fx of def?.periodic||[]){if(!(fx.coefficient>0))continue;if(fx.kind==='heal')good=true;else bad=true;}
  return good===bad?'neutral':good?'buff':'debuff';
}
function normalizeStatusDefinition(raw,index=0){
  raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const tags=[...new Set((Array.isArray(raw.tags)?raw.tags:[]).filter(x=>STATUS_TAGS.includes(x)))];
  const modifiers=tags.includes('modifier')?(Array.isArray(raw.modifiers)?raw.modifiers:[]).slice(0,3).map(x=>({kind:STATUS_MODIFIER_KINDS.includes(x?.kind)?x.kind:'attack',value:statusNum(x?.value,0),element:STATUS_ELEMENTS.includes(x?.element)?x.element:'physical'})):[];
  let control=null;
  if(tags.includes('control')&&raw.control&&STATUS_CONTROL_KINDS.includes(raw.control.kind)){
    control={
      kind:raw.control.kind,
      bossDuration:statusInt(raw.control.bossDuration,Math.min(statusInt(raw.duration,1,1,99),1),0,99),
      slowPct:statusClamp01(raw.control.slowPct,.30),
      basicAttackBonus:statusClamp01(raw.control.basicAttackBonus,.20),
      damageReduction:statusClamp01(raw.control.damageReduction,.20),
      skipChance:statusClamp01(raw.control.skipChance,.30),
      bossSkipChance:statusClamp01(raw.control.bossSkipChance,.15)
    };
  }
  const periodic=tags.includes('periodic')?(Array.isArray(raw.periodic)?raw.periodic:[]).slice(0,3).map(x=>{
    const kind=STATUS_PERIODIC_KINDS.includes(x?.kind)?x.kind:'damage';
    const allowed=kind==='heal'?STATUS_HEAL_RESOLUTIONS:STATUS_DAMAGE_RESOLUTIONS;
    return {kind,basis:STATUS_BASIS.includes(x?.basis)?x.basis:'casterAttack',coefficient:Math.max(0,statusNum(x?.coefficient,0)),resolution:allowed.includes(x?.resolution)?x.resolution:allowed[0],element:STATUS_ELEMENTS.includes(x?.element)?x.element:'physical'};
  }):[];
  return {...(raw.timing?{timing:deepClone(raw.timing)}:{}),polarity:['auto','buff','debuff','neutral'].includes(raw.polarity)?raw.polarity:'auto',dispellable:raw.dispellable!==false,id:String(raw.id||('status-'+(index+1))).trim()||('status-'+(index+1)),name:String(raw.name||'未命名狀態').trim()||'未命名狀態',tags,duration:statusInt(raw.duration,1,1,99),modifiers,control,periodic};
}
function validateStatusDefinition(raw){
  const s=normalizeStatusDefinition(raw),issues=[];
  if(!s.id)issues.push('缺少狀態 ID');
  if(!s.name)issues.push('缺少狀態名稱');
  if(!Number.isInteger(s.duration)||s.duration<1||s.duration>99)issues.push('持續回合必須介於 1～99');
  if(s.modifiers.length>3)issues.push('增減益最多三種');
  if(s.periodic.length>3)issues.push('持續傷害／恢復最多三種');
  if(s.control&&!STATUS_CONTROL_KINDS.includes(s.control.kind))issues.push('控制類型無效');
  for(const fx of s.periodic){if(!STATUS_BASIS.includes(fx.basis)||fx.coefficient<0)issues.push('持續效果係數設定無效');}
  return issues;
}
function statusPureSelfTest(){
  const samples=[
    {id:'cap-test',name:'上限測試',tags:['modifier','control','periodic','instant'],duration:150,modifiers:[{kind:'attack',value:.1},{kind:'guard',value:.2},{kind:'critical',value:.3},{kind:'power',value:.4}],control:{kind:'freeze',bossDuration:2},periodic:[{kind:'damage',basis:'casterAttack',coefficient:.2,resolution:'fixed'},{kind:'damage',basis:'targetMaxHp',coefficient:.05,resolution:'elemental',element:'fire'},{kind:'heal',basis:'targetMissingHp',coefficient:.3,resolution:'overflowShield'},{kind:'heal',basis:'fixed',coefficient:5,resolution:'heal'}]},
    {id:'dot',name:'灼燒',tags:['periodic'],duration:3,periodic:[{kind:'damage',basis:'casterAttack',coefficient:.25,resolution:'defended',element:'fire'}]},
    {id:'hot',name:'再生',tags:['periodic','instant'],duration:4,periodic:[{kind:'heal',basis:'targetMaxHp',coefficient:.05,resolution:'heal'}]},
    {id:'cc',name:'冰封',tags:['control'],duration:2,control:{kind:'freeze',bossDuration:1}}
  ];
  const normalized=samples.map(normalizeStatusDefinition),issues=normalized.flatMap(validateStatusDefinition);
  return {schema:STATUS_SCHEMA_VERSION,ok:issues.length===0&&normalized[0].duration===99&&normalized[0].modifiers.length===3&&normalized[0].periodic.length===3,issues,summary:normalized.map(s=>({id:s.id,duration:s.duration,tags:s.tags,modifiers:s.modifiers.length,control:s.control?.kind||null,periodic:s.periodic.length}))};
}
/* STATUS_PURE_END */

const STATUS_TARGETS=['enemy','enemies','self','weakest','allies'];
const STATUS_TARGET_LABELS={enemy:'目前敵人',enemies:'敵方全體',self:'自己',weakest:'生命比例最低隊友',allies:'我方全體'};
const STATUS_HERO_ONLY_MODIFIERS=new Set(['attack','critical','guard','power','regen']);
const STATUS_ENEMY_ONLY_MODIFIERS=new Set(['fracture','weaken','vulnerable','damageAmp','followup']);
function statusAllowedTargetsForDefinition(def){
  if(!def)return STATUS_TARGETS.slice();
  const heroOnly=def.modifiers.some(m=>STATUS_HERO_ONLY_MODIFIERS.has(m.kind))||def.periodic.some(fx=>fx.kind==='heal'&&fx.resolution==='overflowShield'),enemyOnly=!!def.control||def.modifiers.some(m=>STATUS_ENEMY_ONLY_MODIFIERS.has(m.kind));
  if(heroOnly&&enemyOnly)return [];
  if(heroOnly)return ['self','weakest','allies'];
  if(enemyOnly)return ['enemy','enemies'];
  return STATUS_TARGETS.slice();
}
let statusDefinitions=[];
let activeStatuses=[];
let lastStatusTickClock=-1;
const deepClone=v=>JSON.parse(JSON.stringify(v));
const normalizeStatusList=list=>Array.isArray(list)?list.map((x,i)=>normalizeStatusDefinition(x,i)):[];
function statusById(id){return statusDefinitions.find(x=>x.id===id)||null;}
function statusTargetKey(target){return target&&Object.prototype.hasOwnProperty.call(target,'job')?heroKey(target):target?.id||null;}
function statusTargetByKey(key){if(!key)return null;if(String(key).startsWith('hero-'))return party?.members?.find(h=>heroKey(h)===key)||null;return foes?.find(e=>e.id===key)||null;}
function statusIsHero(target){return !!target&&Object.prototype.hasOwnProperty.call(target,'job');}
function statusMaxHp(target){return statusIsHero(target)?Math.max(1,Number(stats(target).hp)||1):Math.max(1,Number(target?.maxhp??target?.maxHp??target?.hp)||1);}
function statusAttack(target){return statusIsHero(target)?Math.max(0,Number(battleStats(target).atk)||0):Math.max(0,Number(target?.atk)||0);}
function statusDefense(target){return statusIsHero(target)?Math.max(0,Number(battleStats(target).def)||0):Math.max(0,Number(target?.def)||0);}
function statusBasisValue(kind,source,target){
  const who=kind.startsWith('caster')?source:target,suffix=kind.replace(/^caster|^target/,'');
  if(kind==='fixed')return 1;if(!who)return 0;
  if(suffix==='Attack')return statusAttack(who);
  if(suffix==='MaxHp')return statusMaxHp(who);
  if(suffix==='CurrentHp')return Math.max(0,Number(who.hp)||0);
  if(suffix==='MissingHp')return Math.max(0,statusMaxHp(who)-(Number(who.hp)||0));
  if(suffix==='Defense')return statusDefense(who);
  if(suffix==='Shield')return Math.max(0,Number(who.shield)||0);
  if(suffix==='Level')return Math.max(1,Number(who.lv)||1);
  return 0;
}
function statusApplyShieldAwareDamage(target,amount,bypassShield=false){
  amount=Math.max(0,Math.round(amount));if(amount<=0){globalThis.EmberwildBattleEffects?.result('resolved',target,null,{critical:false});return 0;}
  const before=Math.max(0,Number(target.hp)||0);let hpDamage=amount;
  if(!bypassShield&&statusIsHero(target)){
    const absorb=Math.min(Math.max(0,Number(target.shield)||0),amount);target.shield=Math.max(0,(Number(target.shield)||0)-absorb);hpDamage=Math.max(0,amount-absorb);if(absorb>0&&typeof recordCombatContribution==='function')recordCombatContribution(target,'mitigation',absorb);
  }else if(!bypassShield&&!statusIsHero(target)){
    const api=globalThis.EmberwildControlState,p=api?.states?.[target.id]?.polymorph;
    if(p?.shield>0){const absorb=Math.min(p.shield,amount);p.shield=Math.max(0,p.shield-absorb);hpDamage=Math.max(0,amount-absorb);if(p.shield<=0){delete api.states[target.id].polymorph;note(combatEnemyName(target)+' 的變形護盾被持續效果打破，變形解除。');}}
    const absorb=Math.min(Math.max(0,Number(target.shield)||0),hpDamage);target.shield=Math.max(0,(Number(target.shield)||0)-absorb);hpDamage-=absorb;
  }
  target.hp=Math.max(0,before-hpDamage);globalThis.EmberwildBattleEffects?.result('resolved',target,null,{critical:false});const dealt=Math.max(0,before-target.hp);if(statusIsHero(target)){globalThis.EmberwildTokenRuntime?.afterDamage(target,null,before,target.hp);if(typeof recordCombatContribution==='function')recordCombatContribution(target,'taken',amount-hpDamage+dealt);}return dealt;
}
function statusDamageAmount(raw,source,target,fx){
  const formula=GAMEPLAY_SETTINGS?.combat?.damageFormula||{},attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(GAMEPLAY_SETTINGS?.combat?.defenseEffectiveness??.55),minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
  if(fx.resolution==='fixed'||fx.resolution==='true')return Math.max(0,Math.round(raw));
  let defense=statusDefense(target);
  if(!statusIsHero(target)){
    const sourceStats=statusIsHero(source)?battleStats(source):source||{},fractureCap=GAMEPLAY_SETTINGS?.combat?.caps?.fracture??.75,fracture=Math.min(fractureCap,effectTotal(target.id,'fracture')),ignore=Math.min(GAME_BALANCE?.combat?.statCaps?.defenseIgnore??.75,Math.max(0,Number(sourceStats?.defenseIgnore)||0)),pierce=Math.min(GAME_BALANCE?.combat?.statCaps?.pierce??10000,Math.max(0,Number(sourceStats?.pierce)||0));
    defense=Math.max(0,target.def*(1-fracture)*(1-ignore)-pierce);
  }
  let out=Math.max(minimumDamage,Math.round(raw*attackCoefficient-defense*defenseCoefficient));
  if(statusIsHero(target))out=Math.max(minimumDamage,Math.round(out*(1-Math.min(GAMEPLAY_SETTINGS?.combat?.caps?.guard??.75,effectTotal(heroKey(target),'guard')))));
  else out=Math.max(minimumDamage,Math.round(out*(1+effectTotal(target.id,'damageAmp')+effectTotal(target.id,'vulnerable'))));
  if(fx.resolution==='elemental'){
    if(statusIsHero(target)){
      const v=battleStats(target),resist=Math.min(GAMEPLAY_SETTINGS?.combat?.caps?.resistance??.75,Math.max(0,Number(v.resist?.[fx.element])||0));out=Math.max(minimumDamage,Math.round(out*(1-resist)));
    }else{
      const v=statusIsHero(source)?battleStats(source):source||{},bonus=(v.elementDamage?.[fx.element]||0)+(fx.element==='physical'?0:(v.elementBonus||0));out=Math.max(minimumDamage,Math.round(out*elementFactor(fx.element,target.element)*(1+bonus)*(1+(v.raceDamage?.[target.race]||0))));
    }
  }
  return out;
}
function executeStatusPeriodic(inst,fx,immediate=false){
  const source=partyMember(inst.sourceKey??inst.sourceJob)||foes.find(e=>e.id===inst.sourceKey)||null,target=statusTargetByKey(inst.targetKey);if(!target||target.hp<=0)return 0;
  const basis=statusBasisValue(fx.basis,source,target)*fx.coefficient,raw=Math.max(0,fx.kind==='heal'?healingAmount(source,basis):basis),prefix=immediate?'立即':'持續';
  if(fx.kind==='heal'){
    const max=statusMaxHp(target),before=target.hp;target.hp=Math.min(max,target.hp+Math.max(0,Math.round(raw)));let healed=Math.max(0,target.hp-before);
    if(fx.resolution==='overflowShield'&&raw>healed){const overflow=Math.max(0,Math.round(raw-healed));target.shield=Math.max(Number(target.shield)||0,overflow);}
    if(healed>0&&source&&typeof recordCombatContribution==='function')recordCombatContribution(source,'healing',healed);
    if(healed>0||fx.resolution==='overflowShield')note(inst.name+'・'+prefix+'恢復 → '+(statusIsHero(target)?characterName(target):combatEnemyName(target))+' '+healed+' 生命');
    return healed;
  }
  const amount=statusDamageAmount(raw,source,target,fx),dealt=statusApplyShieldAwareDamage(target,amount,fx.resolution==='true');
  if(dealt>0&&statusIsHero(target)&&target.hp<=0&&typeof recordBattleDeath==='function')recordBattleDeath(target,{name:inst.sourceName},inst.name+(immediate?'（立即傷害）':'（持續傷害）'));
  if(dealt>0&&source&&typeof recordCombatContribution==='function')recordCombatContribution(source,'damage',dealt);
  if(dealt>0)note(inst.name+'・'+prefix+'傷害 → '+(statusIsHero(target)?characterName(target):combatEnemyName(target))+' '+dealt+' 傷害',source?statusIsHero(source)?'playerDamage':'enemyDamage':statusIsHero(target)?'enemyDamage':'playerDamage');
  return dealt;
}
function applyStatusControl(def,target,source){
  const c=def.control,api=globalThis.EmberwildControlState;if(!c||!api||statusIsHero(target))return;
  const meta={duration:def.duration,bossDuration:c.bossDuration,slowPct:c.slowPct,basicAttackBonus:c.basicAttackBonus,damageReduction:c.damageReduction,skipChance:c.skipChance,bossSkipChance:c.bossSkipChance};
  if(c.kind==='polymorph')api.applyPolymorph(target,Math.max(1,statusAttack(source)),meta);
  else if(c.kind==='freeze')api.applyFreeze(target,meta);
  else if(c.kind==='rage')api.applyRage(target,meta,null);
  else if(c.kind==='fear')api.applyFear(target,meta);
  else if(c.kind==='tauntRage')api.applyRage(target,meta,source?memberKey(source):null);
  // frost is handled by combatSpeed wrapper below so it expires with the custom status itself.
}
function applyCustomStatus(defOrId,source,target){
  const def=typeof defOrId==='string'?statusById(defOrId):normalizeStatusDefinition(defOrId);if(!def||!target||target.hp<=0)return false;
  const targetKey=statusTargetKey(target),sourceJob=Number.isInteger(source?.job)?source.job:null,sourceKey=sourceJob===null?(source?.id||null):memberKey(source);if(!targetKey)return false;
  activeStatuses=activeStatuses.filter(x=>!(x.statusId===def.id&&(x.sourceKey??x.sourceJob)===sourceKey&&x.targetKey===targetKey));
  const inst={id:def.id+'@'+String(sourceKey)+'@'+targetKey,statusId:def.id,name:def.name,sourceJob,sourceKey,sourceName:source?(statusIsHero(source)?characterName(source):combatEnemyName(source)):'未知來源',targetKey,appliedClock:partyClock,duration:def.duration,expiresClock:partyClock+def.duration,definition:deepClone(def)};
  activeStatuses.push(inst);applyStatusControl(def,target,source);
  const regenRate=def.modifiers.filter(m=>m.kind==='regen').reduce((sum,m)=>sum+Math.max(0,Number(m.value)||0),0);
  if(regenRate>0&&statusIsHero(target)){
    const max=statusMaxHp(target),before=target.hp;target.hp=Math.min(max,target.hp+healingAmount(source,max*regenRate));const healed=Math.max(0,target.hp-before);
    if(healed>0&&source&&typeof recordCombatContribution==='function')recordCombatContribution(source,'healing',healed);
    if(healed>0)note(def.name+'・再生 → '+characterName(target)+' '+Math.round(healed)+' 生命');
  }
  if(def.tags.includes('instant'))for(const fx of def.periodic)executeStatusPeriodic(inst,fx,true);
  note((source?(statusIsHero(source)?characterName(source):combatEnemyName(source))+' → ':'')+(statusIsHero(target)?characterName(target):combatEnemyName(target))+' 獲得狀態「'+def.name+'」· '+(def.permanent?'永久':def.duration+' 回合'));
  return true;
}
function removeStatusEffects(target,polarity,limit=99){
  const key=statusTargetKey(target);if(!key)return 0;
  let left=Math.max(1,Math.min(99,Math.floor(Number(limit)||99))),removed=0;const controls=new Set();
  activeStatuses=activeStatuses.filter(inst=>{
    if(left>0&&inst.targetKey===key&&partyClock<inst.expiresClock&&inst.definition.dispellable!==false&&statusPolarity(inst.definition)===polarity){left--;removed++;if(inst.definition.control)controls.add(inst.definition.control.kind);return false;}return true;
  });
  const api=globalThis.EmberwildControlState;
  for(const kind of controls)if(!activeStatuses.some(inst=>inst.targetKey===key&&partyClock<inst.expiresClock&&inst.definition.control?.kind===kind))api?.clear?.(target,kind);
  effects=effects.filter(fx=>{
    const def={modifiers:[{kind:fx.kind,value:fx.value}],periodic:['dotAttack','dotMaxHp'].includes(fx.kind)?[{kind:'damage',coefficient:fx.value}]:[]};
    if(left>0&&fx.target===key&&fx.until>partyClock&&statusPolarity(def)===polarity){left--;removed++;return false;}return true;
  });
  if(polarity==='debuff'&&!statusIsHero(target)&&left>0){
    for(const kind of ['polymorph','freeze','frost','rage','fear']){
      if(left<=0)break;
      if(activeStatuses.some(inst=>inst.targetKey===key&&partyClock<inst.expiresClock&&inst.definition.control&&(inst.definition.control.kind===kind||kind==='rage'&&inst.definition.control.kind==='tauntRage')))continue;
      if(api?.clear?.(target,kind)){left--;removed++;}
    }
  }
  return removed;
}
function tickCustomStatuses(){
  if(globalThis.EmberwildSecondsCombat?.active)return;
  if(lastStatusTickClock===partyClock)return;lastStatusTickClock=partyClock;
  const keep=[];
  for(const inst of activeStatuses){
    const target=statusTargetByKey(inst.targetKey),elapsed=partyClock-inst.appliedClock;
    if(inst.definition.triggers){
      if(!target||target.hp<=0&&target.__eventDeathHandled||partyClock>=inst.expiresClock)continue;
      if(target.hp>0&&elapsed>0)for(const fx of inst.definition.periodic)executeStatusPeriodic(inst,fx,false);
      keep.push(inst);continue;
    }
    if(!target||target.hp<=0)continue;
    if(elapsed>0&&elapsed<=inst.duration)for(const fx of inst.definition.periodic)executeStatusPeriodic(inst,fx,false);
    if(elapsed<inst.duration)keep.push(inst);
  }
  activeStatuses=keep;
}
function statusTargetsForSkill(h,meta){
  const mode=STATUS_TARGETS.includes(meta?.statusTarget)?meta.statusTarget:'enemy';
  if(mode==='self')return [h];if(mode==='allies')return living();if(mode==='weakest'){const xs=[...living()].sort((a,b)=>a.hp/statusMaxHp(a)-b.hp/statusMaxHp(b));return xs.length?[xs[0]]:[];}if(mode==='enemies')return foes.filter(e=>e.hp>0);const e=foes.find(enemyAvailableForSingleTarget);return e?[e]:[];
}
function customStatusSummary(def){
  if(!def)return '未指定狀態';const bits=[];
  if(def.modifiers.length)bits.push(def.modifiers.map(x=>x.kind+' '+Number((x.value*100).toFixed(2))+'%'+(x.kind==='followup'?' '+x.element:'' )).join('、'));
  if(def.control)bits.push('控制 '+def.control.kind);
  if(def.periodic.length)bits.push(def.periodic.map(x=>(x.kind==='heal'?'恢復':'傷害')+' '+x.basis+'×'+x.coefficient+' / '+x.resolution).join('、'));
  if(def.tags.includes('instant'))bits.push('套用時立即結算持續效果 1 次');return bits.join('；')||'純標記狀態';
}
function customStatusTooltip(def){
 if(!def)return '狀態效果';
 const pct=v=>Number((Math.max(0,Number(v)||0)*100).toFixed(1))+'%';
 const modifierLabels={attack:'攻擊增加',critical:'暴擊率增加',guard:'受到傷害減少',fracture:'防禦降低',power:'技能效果增加',weaken:'攻擊降低',vulnerable:'承受傷害增加',damageAmp:'承受傷害增加',regen:'每回合恢復最大生命'};
 const basisLabels={fixed:'固定值',casterAttack:'施術者攻擊',casterMaxHp:'施術者最大生命',casterCurrentHp:'施術者目前生命',casterMissingHp:'施術者已損生命',casterDefense:'施術者防禦',casterShield:'施術者護盾',casterLevel:'施術者等級',targetAttack:'目標攻擊',targetMaxHp:'目標最大生命',targetCurrentHp:'目標目前生命',targetMissingHp:'目標已損生命',targetDefense:'目標防禦',targetShield:'目標護盾',targetLevel:'目標等級'};
 const resolutionLabels={fixed:'固定傷害',defended:'受防禦減免',elemental:'屬性傷害',true:'真實傷害',heal:'治療',overflowShield:'溢出轉護盾'};
 const bits=[];
 for(const m of def.modifiers||[]){
  if(m.kind==='followup')bits.push('受到攻擊時追加 '+(ELEMENTS[m.element]||m.element||'無')+'屬性追打，倍率 '+pct(m.value));
  else bits.push((modifierLabels[m.kind]||m.kind)+' '+pct(m.value));
 }
 const c=def.control;
 if(c){
  if(c.kind==='polymorph')bits.push('無法行動且不會成為單體目標，護盾被打破時消失；BOSS 無效');
  else if(c.kind==='freeze')bits.push('無法行動'+(Number.isFinite(c.bossDuration)?'；BOSS 持續 '+c.bossDuration+' 回合':''));
  else if(c.kind==='frost')bits.push('速度降低 '+pct(c.slowPct));
  else if(c.kind==='rage')bits.push('無法使用技能，普攻傷害增加 '+pct(c.basicAttackBonus));
  else if(c.kind==='fear')bits.push('傷害降低 '+pct(c.damageReduction)+'，每回合 '+pct(c.skipChance)+' 機率無法行動'+(Number.isFinite(c.bossSkipChance)?'（BOSS '+pct(c.bossSkipChance)+'）':''));
  else if(c.kind==='tauntRage')bits.push('優先攻擊施術者，無法使用技能，普攻傷害增加 '+pct(c.basicAttackBonus));
 }
 for(const fx of def.periodic||[]){
  const basis=basisLabels[fx.basis]||fx.basis,coef=Number(fx.coefficient)||0,amount=fx.basis==='fixed'?String(coef):basis+' × '+Number(coef.toFixed(3));
  bits.push('每回合'+(fx.kind==='heal'?'恢復 ':'造成 ')+amount+(fx.kind==='damage'&&fx.element?' '+(ELEMENTS[fx.element]||fx.element)+'屬性':'')+'（'+(resolutionLabels[fx.resolution]||fx.resolution)+'）');
 }
 for(const t of def.triggers||[])bits.push(({targetTurnEnd:'受術者回合結束（含受控）',targetActionEnd:'受術者行動結束',targetDeath:'受術者死亡'})[t.event]+'：'+pct(t.power)+' '+(t.target==='enemies'?'敵方全體':'目標')+' '+(ELEMENTS[t.element]||t.element)+'；觸發後'+(def.removeOnTrigger?'移除':'保留'));
 if(def.permanent)bits.push('永久');
 if(def.tags?.includes('instant')&&def.periodic?.length)bits.push('套用時立即結算持續效果 1 次');
 return bits.join('；')||'狀態效果';
}

function triggerCustomStatusFollowups(target){
  if(!target||target.hp<=0)return 0;let total=0;
  const entries=[];
  for(const inst of activeStatuses.filter(x=>x.targetKey===target.id&&partyClock<x.expiresClock)){
    for(const m of inst.definition.modifiers)if(m.kind==='followup')entries.push({inst,m});
  }
  for(const {inst,m} of entries){
    if(target.hp<=0)break;
    const caster=partyMember(inst.sourceKey??inst.sourceJob);if(!caster)continue;
    const v=battleStats(caster),formula=GAMEPLAY_SETTINGS?.combat?.damageFormula||{},attackCoefficient=Number.isFinite(formula.attackCoefficient)?formula.attackCoefficient:1,defenseCoefficient=Number.isFinite(formula.defenseCoefficient)?formula.defenseCoefficient:(GAMEPLAY_SETTINGS?.combat?.defenseEffectiveness??.55),minimumDamage=Math.max(0,Number.isFinite(formula.minimumDamage)?formula.minimumDamage:1);
    const fracture=Math.min(GAMEPLAY_SETTINGS?.combat?.caps?.fracture??.75,effectTotal(target.id,'fracture')),ignore=Math.min(GAME_BALANCE?.combat?.statCaps?.defenseIgnore??.75,Math.max(0,Number(v.defenseIgnore)||0)),penetration=Math.min(GAME_BALANCE?.combat?.statCaps?.pierce??10000,Math.max(0,Number(v.pierce)||0));
    const effectiveDefense=Math.max(0,Math.max(0,Number(target.def)||0)*(1-fracture)*(1-ignore)-penetration);
    let amount=Math.max(minimumDamage,Math.round(statusAttack(caster)*Math.max(0,m.value)*attackCoefficient-effectiveDefense*defenseCoefficient));
    const crit=Math.random()<Math.max(0,Math.min(GAME_BALANCE?.combat?.statCaps?.crit??1,Number(v.crit)||0));if(crit)amount=Math.round(amount*Math.max(1,Number(v.critDamage)||1));
    amount=Math.max(minimumDamage,Math.round(amount*elementFactor(m.element||'physical',target.element)*(1-Math.min(GAMEPLAY_SETTINGS?.combat?.caps?.guard??.75,effectTotal(target.id,'guard')))));
    const dealt=statusApplyShieldAwareDamage(target,amount,false);if(dealt>0&&typeof recordCombatContribution==='function')recordCombatContribution(caster,'damage',dealt);total+=dealt;
    if(dealt>0)note(inst.name+'・受擊追打 ['+((typeof ELEMENTS==='object'&&ELEMENTS[m.element])||m.element||'physical')+'] → '+combatEnemyName(target)+' '+dealt+' 傷害'+(crit?'（暴擊）':''),'playerDamage');
  }
  return total;
}
const statusResolveHitBase=resolveHit;
resolveHit=function(e,amount,h,element,crit,options={}){const dealt=statusResolveHitBase(e,amount,h,element,crit,options);if(dealt>0&&e?.hp>0)triggerCustomStatusFollowups(e);return dealt;};

// Add custom status modifiers to the same aggregation path used by existing buffs/debuffs.
const statusEffectTotalBase=effectTotal;
effectTotal=function(target,kind){return statusEffectTotalBase(target,kind)+activeStatuses.filter(x=>x.targetKey===target&&partyClock<x.expiresClock).reduce((sum,x)=>sum+x.definition.modifiers.filter(m=>m.kind===kind).reduce((n,m)=>n+(m.kind==='regen'?healingAmount(partyMember(x.sourceKey??x.sourceJob),m.value):m.value),0),0);};
const statusCombatSpeedBase=combatSpeed;
combatSpeed=function(e){let v=statusCombatSpeedBase(e);const frost=activeStatuses.some(x=>x.targetKey===e?.id&&partyClock<x.expiresClock&&x.definition.control?.kind==='frost');if(frost){const slow=Math.max(...activeStatuses.filter(x=>x.targetKey===e?.id&&partyClock<x.expiresClock&&x.definition.control?.kind==='frost').map(x=>x.definition.control.slowPct||.30));v=Math.max(1,Math.round(v*(1-Math.min(.95,slow))));}return v;};
const statusInitiativeBase=initiativeOrder;
initiativeOrder=function(){tickCustomStatuses();return statusInitiativeBase();};

const statusCastBase=castPartySkill;
castPartySkill=function(h,i,v){
  const sk=CLASSES[h.job]?.skills?.[i],meta=sk?.[6];if(!sk||sk[5]!=='applyStatus')return statusCastBase(h,i,v);
  const def=statusById(meta?.statusId);if(!def||!statusAllowedTargetsForDefinition(def).includes(meta?.statusTarget||'enemy'))return false;const targets=statusTargetsForSkill(h,meta).slice(0,meta?.statusMaxTargets??99);if(!targets.length)return false;
  let success=false;for(const target of targets)success=applyCustomStatus(def,h,target)||success;
  const mastery=globalThis.__EMBERWILD_MASTERY;
  if(success&&meta?.mastery&&mastery?.gainMastery)mastery.gainMastery(h,meta.mastery,mastery.masterySettings().skillUseXp);
  return success;
};
function customStatusRemainingTurns(inst){
  if(inst.definition?.permanent)return Infinity;
  return Math.max(0,Math.ceil(inst.definition?.triggers&&inst.definition.durationClock!=='battle'?(inst.remainingTurns??inst.duration):inst.expiresClock-partyClock));
}
const statusCoreDetailBase=coreSkillDetail;
coreSkillDetail=function(job,i,h=state){const sk=CLASSES[job]?.skills?.[i];if(sk?.[5]!=='applyStatus')return statusCoreDetailBase(job,i,h);const def=statusById(sk[6]?.statusId),target=STATUS_TARGET_LABELS[sk[6]?.statusTarget]||STATUS_TARGET_LABELS.enemy;return '套用狀態：'+(def?.name||'未指定')+' · 目標 '+target+' · '+(def?(def.permanent?'永久':def.duration+' 回合')+' · '+customStatusSummary(def):'請在平衡設計器指定狀態');};

if(typeof effectBadges==='function'){
  const statusBadgesBase=effectBadges;
  effectBadges=function(key){let html=statusBadgesBase(key);for(const x of activeStatuses.filter(s=>s.targetKey===key&&partyClock<s.expiresClock)){html+=combatStatusBadge(x.name,customStatusRemainingTurns(x),customStatusTooltip(x.definition),x.definition.permanent?'永久':'');}return html;};
}
if(typeof battleBuffRows==='function'){
  const statusRowsBase=battleBuffRows;
  battleBuffRows=function(){const rows=activeStatuses.filter(x=>partyClock<x.expiresClock).map(x=>{const t=statusTargetByKey(x.targetKey),time=x.definition.permanent?'永久':customStatusRemainingTurns(x)+' / '+x.duration+' 回合';return '<tr><td>'+esc(t?(statusIsHero(t)?characterName(t):t.name):x.targetKey)+'</td><td>'+esc(x.name)+'</td><td>'+esc(customStatusSummary(x.definition))+'</td><td class="buff-time">'+time+'</td><td>自訂狀態</td></tr>';});const base=statusRowsBase();return rows.length?rows.join('')+(base.includes('no-buffs')?'':base):base;};
}

function attachStatusSkillExtras(raw){
  for(let job=0;job<(raw?.classes||[]).length;job++)for(let i=0;i<(raw.classes[job]?.skills||[]).length;i++){
    const src=raw.classes[job].skills[i],runtime=CLASSES[job]?.skills?.[i];if(!runtime||src?.effect!=='applyStatus')continue;runtime[6]??={};runtime[6].statusMaxTargets=src.statusMaxTargets??99;runtime[6].statusId=String(src.statusId||'');runtime[6].statusTarget=STATUS_TARGETS.includes(src.statusTarget)?src.statusTarget:'enemy';
  }
}
const statusValidateBase=validateBalanceConfig;
validateBalanceConfig=function(input){
  const out=statusValidateBase(input),defs=normalizeStatusList(input?.statusDefinitions),ids=new Set();
  for(const [i,d] of defs.entries()){const issues=validateStatusDefinition(d);if(issues.length)throw Error('自訂狀態 '+(i+1)+' 無效：'+issues.join('、'));if(ids.has(d.id))throw Error('自訂狀態 ID 重複：'+d.id);ids.add(d.id);}
  for(const [job,c] of (input?.classes||[]).entries())for(const [i,sk] of (c?.skills||[]).entries())if(sk?.effect==='applyStatus'){const def=defs.find(x=>x.id===String(sk.statusId||'')),target=sk.statusTarget||'enemy';if(!def)throw Error('技能 '+job+'-'+i+' 引用不存在的狀態');if(!STATUS_TARGETS.includes(target))throw Error('技能 '+job+'-'+i+' 的狀態目標無效');if(!statusAllowedTargetsForDefinition(def).includes(target))throw Error('技能 '+job+'-'+i+' 的狀態效果與套用目標方向不相容');}
  out.statusDefinitions=defs;return out;
};
const statusApplyBase=applyBalanceConfig;
applyBalanceConfig=function(input,{persist=true}={}){
  const raw=deepClone(input),out=statusApplyBase(raw,{persist:false});statusDefinitions=normalizeStatusList(raw.statusDefinitions);attachStatusSkillExtras(raw);activeStatuses=[];lastStatusTickClock=-1;
  if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(state)render();return out;
};
const statusExportBase=exportableBalance;
exportableBalance=function(){const out=statusExportBase();out.statusDefinitions=deepClone(statusDefinitions);for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<(out.classes[job]?.skills||[]).length;i++){const runtime=CLASSES[job]?.skills?.[i],sk=out.classes[job].skills[i];if(runtime?.[5]==='applyStatus'){sk.effect='applyStatus';sk.statusId=runtime[6]?.statusId||'';sk.statusTarget=STATUS_TARGETS.includes(runtime[6]?.statusTarget)?runtime[6].statusTarget:'enemy';}}out.notes=[...(out.notes||[]),'statusDefinitions 為自訂狀態製作器資料；技能 effect=applyStatus 時以 statusId 引用，statusTarget 決定套用目標。','自訂狀態最多 3 個增減益、1 個控制、3 個持續效果；duration 1～99。instant 會在套用時額外立即結算一次 periodic，後續持續結算不受影響。'];return out;};

const statusResetEncounterBase=resetEncounter;
resetEncounter=function(){activeStatuses=[];lastStatusTickClock=-1;return statusResetEncounterBase();};
const statusSpawnBase=spawnGroup;
spawnGroup=function(...args){if(!globalThis.EmberwildSecondsCombat?.continuing){activeStatuses=[];lastStatusTickClock=-1;if(party)refillParty();}return statusSpawnBase(...args);};
if(typeof resetBalanceJSON==='function'){
  const statusResetBalanceBase=resetBalanceJSON;
  resetBalanceJSON=function(){statusDefinitions=[];activeStatuses=[];lastStatusTickClock=-1;return statusResetBalanceBase();};
}

// A saved balance file may have been loaded by earlier compatibility layers before this extension installed.
try{const saved=JSON.parse(balanceSourceText()||'null');if(saved?.schema===BALANCE_SCHEMA){statusDefinitions=normalizeStatusList(saved.statusDefinitions);attachStatusSkillExtras(saved);}}catch(e){console.warn('自訂狀態資料還原失敗',e);}


/* ADVANCED_COUNTED_STATUS_EXTENSION */
if(!STATUS_MODIFIER_KINDS.includes('damageSpread'))STATUS_MODIFIER_KINDS.push('damageSpread');
STATUS_HERO_ONLY_MODIFIERS.add('damageSpread');
for(const mode of ['rankedAllies','rankedEnemies'])if(!STATUS_TARGETS.includes(mode))STATUS_TARGETS.push(mode);
Object.assign(STATUS_TARGET_LABELS,{rankedAllies:'依能力排序的我方單位',rankedEnemies:'依能力排序的敵方單位'});
const ADVANCED_STATUS_TARGET_STATS=['attack','defense','maxHp','currentHp','missingHp','shield','level','crit'];
const ADVANCED_STATUS_TARGET_ORDERS=['highest','lowest'];
const PAIN_SPREAD_STATUS_ID='pain-spread';
const PAIN_SPREAD_DEFAULT={id:PAIN_SPREAD_STATUS_ID,name:'苦痛蔓延',polarity:'buff',dispellable:true,tags:['modifier'],duration:99,uses:1,stackable:false,modifiers:[{kind:'damageSpread',value:.30,targets:2}]};

const advancedNormalizeStatusBase=normalizeStatusDefinition;
normalizeStatusDefinition=function(raw,index=0){
  const out=advancedNormalizeStatusBase(raw,index),source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  out.uses=statusInt(source.uses,0,0,99);out.stackable=source.stackable===true;
  if(source.triggers!==undefined){
    if(!Array.isArray(source.triggers)||source.triggers.length>8)throw Error('狀態事件觸發設定無效');
    out.triggers=source.triggers.map(t=>{
      if(!t||!['targetTurnEnd','targetActionEnd','targetDeath'].includes(t.event)||!['damage','heal','shield'].includes(t.effect)||!Number.isFinite(t.power)||t.power<0||t.power>100||!['enemies','allies','self','target'].includes(t.target)||!STATUS_ELEMENTS.includes(t.element)||typeof t.allowDeathChain!=='boolean'||!Number.isFinite(t.chainMultiplier)||t.chainMultiplier<0||t.chainMultiplier>100)throw Error('狀態事件積木參數無效');
      return {event:t.event,effect:t.effect,power:t.power,target:t.target,element:t.element,allowDeathChain:t.allowDeathChain,chainMultiplier:t.chainMultiplier};
    });
    if(new Set(out.triggers.map(t=>t.event)).size!==out.triggers.length)throw Error('同一狀態的觸發時機不可重複');
    out.removeOnTrigger=source.removeOnTrigger!==false;
    out.permanent=source.permanent===true;
    out.durationClock=source.durationClock??'target';
    if(!['target','caster','battle'].includes(out.durationClock))throw Error('狀態持續時間時計無效');
  }
  out.modifiers=out.modifiers.map((m,i)=>{if(m.kind==='damageSpread')m.targets=statusInt(source.modifiers?.[i]?.targets,2,1,99);return m;});
  return out;
};
const advancedValidateStatusBase=validateStatusDefinition;
validateStatusDefinition=function(raw){const issues=advancedValidateStatusBase(raw),s=normalizeStatusDefinition(raw);for(const m of s.modifiers)if(m.kind==='damageSpread'&&(!Number.isInteger(m.targets)||m.targets<1||m.targets>99))issues.push('傷害擴散目標數必須介於 1～99');return issues;};
const advancedAllowedTargetsBase=statusAllowedTargetsForDefinition;
statusAllowedTargetsForDefinition=function(def){const out=advancedAllowedTargetsBase(def);if(out.includes('allies')&&!out.includes('rankedAllies'))out.push('rankedAllies');if(out.includes('enemies')&&!out.includes('rankedEnemies'))out.push('rankedEnemies');return out;};
function advancedTargetValue(target,stat){
  if(stat==='attack')return statusAttack(target);if(stat==='defense')return statusDefense(target);if(stat==='maxHp')return statusMaxHp(target);
  if(stat==='currentHp')return Math.max(0,Number(target?.hp)||0);if(stat==='missingHp')return Math.max(0,statusMaxHp(target)-(Number(target?.hp)||0));
  if(stat==='shield')return Math.max(0,Number(target?.shield)||0);if(stat==='level')return Math.max(1,Number(target?.lv)||1);
  if(stat==='crit')return statusIsHero(target)?Math.max(0,Number(battleStats(target).crit)||0):Math.max(0,Number(target?.crit)||0);return 0;
}
const advancedStatusTargetsBase=statusTargetsForSkill;
statusTargetsForSkill=function(h,meta){
  const mode=meta?.statusTarget;if(!['rankedAllies','rankedEnemies'].includes(mode))return advancedStatusTargetsBase(h,meta);
  let pool=mode==='rankedAllies'?living():foes.filter(e=>e.hp>0);if(mode==='rankedAllies'&&meta?.statusTargetIncludeSelf!==true)pool=pool.filter(x=>x!==h);
  const stat=ADVANCED_STATUS_TARGET_STATS.includes(meta?.statusTargetStat)?meta.statusTargetStat:'attack',order=ADVANCED_STATUS_TARGET_ORDERS.includes(meta?.statusTargetOrder)?meta.statusTargetOrder:'highest';
  pool=[...pool].sort((a,b)=>{const av=advancedTargetValue(a,stat),bv=advancedTargetValue(b,stat),delta=order==='lowest'?av-bv:bv-av;if(delta)return delta;return String(statusTargetKey(a)).localeCompare(String(statusTargetKey(b)));});
  return pool.slice(0,1);
};
let advancedStatusSerial=0;
applyCustomStatus=function(defOrId,source,target){
  const def=typeof defOrId==='string'?statusById(defOrId):normalizeStatusDefinition(defOrId);if(!def||!target||target.hp<=0)return false;
  const targetKey=statusTargetKey(target),sourceJob=Number.isInteger(source?.job)?source.job:null,sourceKey=sourceJob===null?(source?.id||null):memberKey(source);if(!targetKey)return false;
  if(!def.stackable)activeStatuses=activeStatuses.filter(x=>!(x.statusId===def.id&&x.targetKey===targetKey));
  const inst={id:def.id+'@'+targetKey+'@'+(++advancedStatusSerial),statusId:def.id,name:def.name,sourceJob,sourceKey,sourceName:source?(statusIsHero(source)?characterName(source):combatEnemyName(source)):'未知來源',targetKey,appliedClock:partyClock,duration:def.duration,expiresClock:def.triggers&&(def.permanent||def.durationClock!=='battle')?Number.MAX_SAFE_INTEGER:partyClock+def.duration,remainingTurns:def.duration,remainingUses:def.uses>0?def.uses:null,definition:deepClone(def)};
  activeStatuses.push(inst);applyStatusControl(def,target,source);
  const regenRate=def.modifiers.filter(m=>m.kind==='regen').reduce((sum,m)=>sum+Math.max(0,Number(m.value)||0),0);
  if(regenRate>0&&statusIsHero(target)){const max=statusMaxHp(target),before=target.hp;target.hp=Math.min(max,target.hp+healingAmount(source,max*regenRate));const healed=Math.max(0,target.hp-before);if(healed>0&&source&&typeof recordCombatContribution==='function')recordCombatContribution(source,'healing',healed);if(healed>0)note(def.name+'・再生 → '+characterName(target)+' '+Math.round(healed)+' 生命');}
  if(def.tags.includes('instant'))for(const fx of def.periodic)executeStatusPeriodic(inst,fx,true);
  note((source?(statusIsHero(source)?characterName(source):combatEnemyName(source))+' → ':'')+(statusIsHero(target)?characterName(target):combatEnemyName(target))+' 獲得狀態「'+def.name+'」· '+(def.permanent?'永久':def.duration+' 回合')+(inst.remainingUses===null?'':' · '+inst.remainingUses+' 次'));
  globalThis.EmberwildSecondsCombat?.statusApplied(inst);
  return true;
};
function consumeCustomStatusUse(instanceId,count=1){const inst=activeStatuses.find(x=>x.id===instanceId);if(!inst||inst.remainingUses===null)return false;inst.remainingUses=Math.max(0,inst.remainingUses-Math.max(1,Math.floor(Number(count)||1)));if(inst.remainingUses<=0)activeStatuses=activeStatuses.filter(x=>x.id!==instanceId);return true;}
function ensurePainSpreadDefinition(){if(!statusDefinitions.some(x=>x.id===PAIN_SPREAD_STATUS_ID))statusDefinitions.push(normalizeStatusDefinition(PAIN_SPREAD_DEFAULT,statusDefinitions.length));}
statusDefinitions=statusDefinitions.map((x,i)=>normalizeStatusDefinition(x,i));ensurePainSpreadDefinition();

const advancedSummaryBase=customStatusSummary;
customStatusSummary=function(def){const d=normalizeStatusDefinition(def),bits=[];for(const m of d.modifiers)if(m.kind==='damageSpread')bits.push('單體技能傷害擴散 '+Number((m.value*100).toFixed(2))+'% → 額外 '+m.targets+' 名');if(d.uses>0)bits.push('可觸發 '+d.uses+' 次');bits.push(d.stackable?'可疊加':'不可疊加');const base=advancedSummaryBase(d);return [base,...bits].filter(Boolean).join('；');};

function advancedStatusMetaFromSkill(sk){return {statusTarget:sk?.statusTarget||sk?.target||'enemy',statusTargetStat:sk?.statusTargetStat,statusTargetOrder:sk?.statusTargetOrder,statusTargetIncludeSelf:sk?.statusTargetIncludeSelf};}
const advancedCastSupportBase=castSupport;
castSupport=function(h,index){
  const sk=SUPPORT[h.job]?.[index];if(!sk||sk.kind!=='applyStatus')return advancedCastSupportBase(h,index);
  const def=statusById(sk.statusId);if(!def)return false;const targets=statusTargetsForSkill(h,advancedStatusMetaFromSkill(sk));if(!targets.length)return false;
  let success=false;for(const target of targets)success=applyCustomStatus(def,h,target)||success;if(success)note(characterName(h)+'施放 '+sk.name+' → '+targets.map(t=>statusIsHero(t)?characterName(t):combatEnemyName(t)).join('、'));return success;
};
const advancedSupportDetailBase=typeof supportSkillDetail==='function'?supportSkillDetail:null;
if(advancedSupportDetailBase)supportSkillDetail=function(job,index,h=state){const sk=SUPPORT[job]?.[index];if(!sk||sk.kind!=='applyStatus')return advancedSupportDetailBase(job,index,h);const def=statusById(sk.statusId),metric={attack:'攻擊',defense:'防禦',maxHp:'最大生命',currentHp:'目前生命',missingHp:'已損生命',shield:'護盾',level:'等級',crit:'暴擊率'}[sk.statusTargetStat]||'攻擊';return '套用狀態：'+(def?.name||sk.statusId||'未指定')+' · 目標 '+(sk.statusTarget==='rankedEnemies'?'敵方':'我方')+(sk.statusTargetOrder==='lowest'?'最低':'最高')+metric+(sk.statusTargetIncludeSelf?'（包含自己）':'（不含自己）')+' · '+(def?customStatusSummary(def):'狀態不存在');};

let advancedSpreadContext=null;
function spreadStatusEntries(h){const key=heroKey(h);return activeStatuses.filter(x=>x.targetKey===key&&partyClock<x.expiresClock&&(x.remainingUses===null||x.remainingUses>0)).map(inst=>({inst,mods:inst.definition.modifiers.filter(m=>m.kind==='damageSpread'&&m.value>0&&m.targets>0)})).filter(x=>x.mods.length);}
function isSingleTargetDamageSkill(h,i){const sk=CLASSES[h?.job]?.skills?.[i],meta=sk?.[6]||{};if(!sk||!['damage','drain'].includes(sk[5]))return false;const mode=meta.target||'enemy',max=Math.max(1,Math.floor(meta.maxTargets||1));return mode!=='enemies'&&max===1;}
function beginStatusSkillCast(h,i){if(advancedSpreadContext||!h||!isSingleTargetDamageSkill(h,i))return false;const entries=spreadStatusEntries(h);if(!entries.length)return false;advancedSpreadContext={caster:h,index:i,entries,primary:null,damage:0};return true;}
function recordSpreadDamage(target,h,dealt){if(!advancedSpreadContext||advancedSpreadContext.caster!==h||!(dealt>0)||!target)return;if(!advancedSpreadContext.primary)advancedSpreadContext.primary=target;if(advancedSpreadContext.primary===target)advancedSpreadContext.damage+=dealt;}
function trackedStatusDamage(target,amount,bypassShield=false){const dealt=statusApplyShieldAwareDamage(target,amount,bypassShield);if(advancedSpreadContext)recordSpreadDamage(target,advancedSpreadContext.caster,dealt);return dealt;}
const advancedResolveHitBase=resolveHit;
resolveHit=function(e,amount,h,element,crit,options={}){const dealt=advancedResolveHitBase(e,amount,h,element,crit,options);recordSpreadDamage(e,h,dealt);return dealt;};
function endStatusSkillCast(h,i,result){
  const ctx=advancedSpreadContext;if(!ctx||ctx.caster!==h||ctx.index!==i)return;advancedSpreadContext=null;if(result===false)return;
  for(const entry of ctx.entries){
    if(ctx.primary&&ctx.damage>0){for(const m of entry.mods){const amount=Math.max(0,Math.round(ctx.damage*Math.max(0,Number(m.value)||0))),targets=shuffleCopy(foes.filter(e=>e.hp>0&&e!==ctx.primary)).slice(0,Math.max(1,Math.floor(m.targets||1)));for(const target of targets){const dealt=statusApplyShieldAwareDamage(target,amount,false);if(dealt>0&&typeof recordCombatContribution==='function')recordCombatContribution(h,'damage',dealt);if(dealt>0)note(entry.inst.name+'・傷害擴散 → '+combatEnemyName(target)+' '+dealt+' 傷害','playerDamage');}}}
    consumeCustomStatusUse(entry.inst.id,1);
  }
}
const advancedCastPartyBase=castPartySkill;
castPartySkill=function(h,i,v){const tracking=beginStatusSkillCast(h,i);let result;try{result=advancedCastPartyBase(h,i,v);return result;}finally{if(tracking)endStatusSkillCast(h,i,result);}};

function copyAdvancedTargetMeta(raw){for(let job=0;job<(raw?.classes||[]).length;job++)for(let i=0;i<(raw.classes[job]?.skills||[]).length;i++){const src=raw.classes[job].skills[i],runtime=CLASSES[job]?.skills?.[i];if(!runtime||src?.effect!=='applyStatus')continue;runtime[6]??={};runtime[6].statusTargetStat=ADVANCED_STATUS_TARGET_STATS.includes(src.statusTargetStat)?src.statusTargetStat:'attack';runtime[6].statusTargetOrder=ADVANCED_STATUS_TARGET_ORDERS.includes(src.statusTargetOrder)?src.statusTargetOrder:'highest';runtime[6].statusTargetIncludeSelf=src.statusTargetIncludeSelf===true;}}
function validateAdvancedStatusTarget(sk,label,defs){if(sk?.effect!=='applyStatus'&&sk?.kind!=='applyStatus')return;const target=sk.statusTarget||sk.target||'enemy',def=defs.find(x=>x.id===String(sk.statusId||''));if(!def)throw Error(label+' 引用不存在的狀態');if(!STATUS_TARGETS.includes(target))throw Error(label+' 的狀態目標無效');if(!statusAllowedTargetsForDefinition(def).includes(target))throw Error(label+' 的狀態效果與套用目標方向不相容');if(['rankedAllies','rankedEnemies'].includes(target)){if(sk.statusTargetStat!==undefined&&!ADVANCED_STATUS_TARGET_STATS.includes(sk.statusTargetStat))throw Error(label+' 的排序能力無效');if(sk.statusTargetOrder!==undefined&&!ADVANCED_STATUS_TARGET_ORDERS.includes(sk.statusTargetOrder))throw Error(label+' 的排序方向無效');if(sk.statusTargetIncludeSelf!==undefined&&typeof sk.statusTargetIncludeSelf!=='boolean')throw Error(label+' 的包含自己設定無效');}}
const advancedValidateBalanceBase=validateBalanceConfig;
validateBalanceConfig=function(input){const defs=(input?.statusDefinitions||[]).map((x,i)=>normalizeStatusDefinition(x,i));if(!defs.some(x=>x.id===PAIN_SPREAD_STATUS_ID))defs.push(normalizeStatusDefinition(PAIN_SPREAD_DEFAULT,defs.length));for(const [job,c] of (input?.classes||[]).entries())for(const [i,sk] of (c.skills||[]).entries())validateAdvancedStatusTarget(sk,'技能 '+job+'-'+i,defs);for(const [job,list] of (input?.supportSkills||[]).entries())for(const [i,sk] of (list||[]).entries())validateAdvancedStatusTarget(sk,'輔助技能 '+job+'-'+i,defs);return advancedValidateBalanceBase(input);};
const advancedApplyBalanceBase=applyBalanceConfig;
applyBalanceConfig=function(input,{persist=true}={}){const raw=deepClone(input);raw.statusDefinitions=Array.isArray(raw.statusDefinitions)?raw.statusDefinitions:[];if(!raw.statusDefinitions.some(x=>x?.id===PAIN_SPREAD_STATUS_ID))raw.statusDefinitions.push(deepClone(PAIN_SPREAD_DEFAULT));const out=advancedApplyBalanceBase(raw,{persist:false});statusDefinitions=statusDefinitions.map((x,i)=>normalizeStatusDefinition(x,i));ensurePainSpreadDefinition();copyAdvancedTargetMeta(raw);if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(state)render();return out;};
const advancedExportBalanceBase=exportableBalance;
exportableBalance=function(){const out=advancedExportBalanceBase();ensurePainSpreadDefinition();out.statusDefinitions=deepClone(statusDefinitions);for(let job=0;job<(out.classes||[]).length;job++)for(let i=0;i<(out.classes[job]?.skills||[]).length;i++){const runtime=CLASSES[job]?.skills?.[i],sk=out.classes[job].skills[i];if(runtime?.[5]==='applyStatus'){sk.statusTargetStat=runtime[6]?.statusTargetStat||'attack';sk.statusTargetOrder=runtime[6]?.statusTargetOrder||'highest';sk.statusTargetIncludeSelf=runtime[6]?.statusTargetIncludeSelf===true;}}out.notes=[...(out.notes||[]),'狀態 uses > 0 時代表可觸發次數；stackable 控制同一狀態能否在同一目標並存。damageSpread 於單體傷害技能成功施放時觸發並消耗 1 次。','statusTarget=rankedAllies/rankedEnemies 時，以 statusTargetStat 排序；statusTargetOrder 可選 highest/lowest；statusTargetIncludeSelf 控制我方排序是否包含施術者。'];return out;};
const advancedResetEncounterBase=resetEncounter;
resetEncounter=function(){advancedStatusSerial=0;advancedSpreadContext=null;return advancedResetEncounterBase();};

const visualPeriodicBase=executeStatusPeriodic;
executeStatusPeriodic=function(inst,fx,...args){
  const visual=globalThis.EmberwildBattleEffects;
  if(!visual?.capturing)return visualPeriodicBase(inst,fx,...args);
  return visual.scope({mode:fx.kind==='heal'?'regen':'damage',periodic:true,critical:false,element:fx.resolution==='elemental'?fx.element:null},()=>visualPeriodicBase(inst,fx,...args));
};
const visualStatusDamageBase=statusApplyShieldAwareDamage;
statusApplyShieldAwareDamage=function(...args){
  const visual=globalThis.EmberwildBattleEffects;
  if(!visual?.capturing)return visualStatusDamageBase(...args);
  return visual.scope({mode:'damage'},()=>visualStatusDamageBase(...args));
};
globalThis.EmberwildStatusCombatState={pack:()=>({active:activeStatuses,clock:lastStatusTickClock,serial:advancedStatusSerial}),restore:v=>{activeStatuses=v?.active||[];lastStatusTickClock=v?.clock??-1;advancedStatusSerial=v?.serial||0;advancedSpreadContext=null;},seconds:{instances:()=>activeStatuses,definitions:()=>statusDefinitions,replaceInstances:rows=>{activeStatuses=rows;},periodic:executeStatusPeriodic}};
function collectStatusTriggers(event,target,allowChain=true,chainScale=1,instanceId=null){
  const rows=[];
  for(const inst of [...activeStatuses]){
    if(instanceId&&inst.id!==instanceId)continue;
    if(inst.targetKey!==statusTargetKey(target)||partyClock>=inst.expiresClock||inst.remainingUses===0)continue;
    const trigger=inst.definition.triggers?.find(t=>t.event===event);if(!trigger)continue;
    // Even a suppressed chained death consumes/removes its dead target's mark.
    if(inst.remainingUses!==null)inst.remainingUses=Math.max(0,inst.remainingUses-1);
    if(inst.definition.removeOnTrigger||inst.remainingUses===0||event==='targetDeath')activeStatuses=activeStatuses.filter(x=>x.id!==inst.id);
    if(allowChain)rows.push({instance:deepClone(inst),trigger:{...trigger,power:trigger.power*chainScale}});
  }
  return rows;
}
function tickStatusActorTurns(actor){
  if(globalThis.EmberwildSecondsCombat?.active)return;
  for(const inst of [...activeStatuses]){
    const d=inst.definition;if(!d.triggers||d.permanent||d.durationClock==='battle')continue;
    const match=d.durationClock==='target'?inst.targetKey===statusTargetKey(actor):(inst.sourceKey=== (statusIsHero(actor)?memberKey(actor):actor?.id));
    if(match){inst.remainingTurns=Math.max(0,(inst.remainingTurns??d.duration)-1);if(inst.remainingTurns===0)activeStatuses=activeStatuses.filter(x=>x.id!==inst.id);}
  }
}
globalThis.__EMBERWILD_STATUS_TEST_API={addDefinition(raw){const def=normalizeStatusDefinition(raw);if(!statusById(def.id))statusDefinitions.push(def);},collectTriggers:collectStatusTriggers,tickActorTurns:tickStatusActorTurns,clearEvents(){activeStatuses=activeStatuses.filter(x=>!x.definition.triggers);},tooltip:customStatusTooltip,remainingTurns:customStatusRemainingTurns,schema:STATUS_SCHEMA_VERSION,normalize:normalizeStatusDefinition,validate:validateStatusDefinition,selfTest:statusPureSelfTest,get definitions(){return deepClone(statusDefinitions);},get active(){return deepClone(activeStatuses);},apply:applyCustomStatus,tick:tickCustomStatuses,remove:removeStatusEffects,polarity:statusPolarity,basis:statusBasisValue,damage:trackedStatusDamage,maxHp:statusMaxHp,consume:consumeCustomStatusUse,beginSkillCast:beginStatusSkillCast,endSkillCast:endStatusSkillCast,targetStats:ADVANCED_STATUS_TARGET_STATS,targetOrders:ADVANCED_STATUS_TARGET_ORDERS};
if(state)render();
})();
