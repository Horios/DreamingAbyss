
GAME_BALANCE_DEFAULTS.affixes.extendedValues.allCooldownReduction ??= {normal:0,fine:0,rare:1,legendary:2};
GAME_BALANCE_DEFAULTS.combat.minimumActiveCooldown=1;
function migrateActiveCooldownFloorDocument(input){
  if(!input||typeof input!=='object')return input;
  const out=JSON.parse(JSON.stringify(input));
  out.balanceSettings??={};out.balanceSettings.meta??={};
  if(Number(out.balanceSettings.meta.activeCooldownFloorVersion||0)<1){
    if(Number(out.balance?.combat?.minimumActiveCooldown)===2)out.balance.combat.minimumActiveCooldown=1;
    out.balanceSettings.meta.activeCooldownFloorVersion=1;
  }
  return out;
}
let actionTurnMigratedSaved=null;
try{
  const raw=balanceSourceText();
  if(raw){
    const parsed=JSON.parse(raw),migrated=migrateActiveCooldownFloorDocument(parsed);
    actionTurnMigratedSaved=migrated;
    if(JSON.stringify(parsed)!==JSON.stringify(migrated))localStorage.setItem(BALANCE_KEY,JSON.stringify(migrated));
  }
}catch(e){console.warn('冷卻下限設定 migration 失敗',e);}
GAME_BALANCE=normalizeRuntimeBalance(actionTurnMigratedSaved?.balance||GAME_BALANCE);
const actionTurnApplyBalanceConfigBase=applyBalanceConfig;
applyBalanceConfig=function(input,options){return actionTurnApplyBalanceConfigBase(migrateActiveCooldownFloorDocument(input),options);};
const actionTurnBalanceReferenceBase=balanceReference;
balanceReference=function(){const r=actionTurnBalanceReferenceBase();r.affixTypes['16']='全主動／輔助技能冷卻減少（回合）';r.balancePaths['balance.affixes.extendedValues.allCooldownReduction']='新全技能冷卻詞條；只影響有冷卻的主動與輔助技能，單位為角色回合';r.units.cooldown='回合；冷卻 N 表示施放後需經過 N 次該角色自身行動，之後才能再次施放';return r;};
EXTRA_AFFIX_NAMES[16]='全技能冷卻';
rollAffixes=function(g){return oldAffixRoll(g).map(a=>{const cfg=GAME_BALANCE.affixes,key=balanceQualityKey(a.rank);if(Math.random()>cfg.extendedPoolChance)return a;const attackPct=Number(cfg.extendedValues.attackPercent[key])||0,allCd=Number(cfg.extendedValues.allCooldownReduction?.[key])||0;const specialTypes=[6,7,8,9,12,13,14,...(a.rank>=2&&attackPct>0?[15]:[]),...(allCd>0?[16]:[])],type=specialTypes[rand(specialTypes.length)];const value=type===16?allCd:type===15?attackPct:type===6?cfg.extendedValues.critDamage[key]:type===7?cfg.extendedValues.pierce[key]:type===8?cfg.extendedValues.lifesteal[key]:type===9?cfg.extendedValues.evasion[key]:type===12?cfg.extendedValues.elementDamage[key]:type===13?cfg.extendedValues.raceDamage[key]:cfg.extendedValues.resist[key];const result={type,rank:a.rank,value};if(type===12||type===14)result.element=['fire','ice','wind','light','shadow'][rand(5)];if(type===13)result.race=Object.keys(RACES)[rand(6)];return result;});};
const actionTurnAffixLabelBase=affixLabel;
affixLabel=function(a,g){
  if(a?.type===16)return `全主動／輔助技能冷卻 ${globalThis.EmberwildSecondsCombat?.cooldownReductionText?.('affixAll',a.value)??'−'+a.value+' 回合'}`;
  if(a?.type===5){const sk=CLASSES[g?.job??state.job]?.skills?.[a.skill??0];if(sk?.[1]==='active')return `${sk[0]} 冷卻 −${a.value} 回合`;}
  return actionTurnAffixLabelBase(a,g);
};
/* Keep the unified equipment filter model; affix type 16 needs no separate filter override. */
function allSkillCooldownReduction(h=state){return equipment(h).filter(g=>g.job===h.job||g.slot===1).flatMap(g=>g.affix||[]).filter(a=>a.type===16).reduce((n,a)=>n+(Number(a.value)||0),0);}
skillCooldown=function(i,h=state){return Math.max(GAME_BALANCE.combat.minimumActiveCooldown,CLASSES[h.job].skills[i][3]-bonusFor(i,5,h)-allSkillCooldownReduction(h));};
function supportSkillCooldown(h,index){return Math.max(1,Math.round(SUPPORT[h.job][index].cooldown-allSkillCooldownReduction(h)));}
function runCombatEventAction(actor,fn){return globalThis.EmberwildCombatEvents?globalThis.EmberwildCombatEvents.action(actor,fn):fn();}
function tickHeroCooldowns(h){for(const key of Object.keys(actorCooldowns))if(key.startsWith(memberKey(h)+'-'))actorCooldowns[key]=Math.max(0,Math.floor(actorCooldowns[key])-1);for(const key of Object.keys(supportCooldowns))if(key.startsWith(memberKey(h)+'-'))supportCooldowns[key]=Math.max(0,Math.floor(supportCooldowns[key])-1);}
function cooldownLeft(cds,key){return Math.max(0,Math.floor(cds[key]||0));}
globalThis.performEnemyActionCore ??= (e=>performEnemyBasic(e));
function performEnemyAction(e){return globalThis.performEnemyActionCore(e);}
// The same generator drives visible and offline actions. Its cursor contains
// only IDs and indices, so a save can resume between any two yielded actions.
let combatRoundProgress=null;
pacedRound=function*(){
 if(!party||!running||$('modal').open)return;
 if(!combatRoundProgress){
  currentEvents=[];lastActionOrder=[];actionVisualTime=Date.now();partyClock++;round++;
  effects=effects.filter(e=>e.until>partyClock);
  if(!foes.some(e=>e.hp>0)){spawnGroup();if(tab==='battle'||!isEditingControl())render();else refreshGlobalJournal();return;}
  for(const h of living()){
   const v=battleStats(h),regen=effectTotal(heroKey(h),'regen'),beforeRegen=h.hp;
   h.hp=Math.min(v.hp,h.hp+v.hp*regen);
   const regenHealed=Math.max(0,h.hp-beforeRegen);if(regenHealed>0)recordRegenContribution(h,regenHealed);
   if(h.autoPotion&&h.hp<v.hp*GS('combat.autoPotionThreshold',.35)&&h.potions>0)withHero(h,()=>potion(true));
  }
  combatRoundProgress={order:initiativeOrder().map(u=>({side:u.side,id:u.id})),index:0,unit:null};
 }
 const p=combatRoundProgress;
 while(p.index<p.order.length){
  if(!living().length||!foes.some(e=>e.hp>0))break;
  const ref=p.order[p.index],actor=ref.side==='hero'?heroes().find(h=>heroKey(h)===ref.id):foes.find(e=>e.id===ref.id);
  if(!actor||actor.hp<=0){p.index++;p.unit=null;continue;}
  if(ref.side==='hero'){
   const h=actor;
   if(!p.unit){
    p.unit={support:h.supportSlots.filter(i=>i!==null&&cooldownLeft(supportCooldowns,memberKey(h)+'-'+i)<=0),active:h.active.filter(i=>i!==null&&cooldownLeft(actorCooldowns,memberKey(h)+'-'+i)<=0),index:0};
    tickHeroCooldowns(h);
   }
   const u=p.unit;
   while(u.index<u.support.length){
    const i=u.support[u.index++],key=memberKey(h)+'-'+i;
    if(runCombatEventAction(h,()=>{const ok=castSupport(h,i);if(ok!==false)supportCooldowns[key]=globalThis.__EMBERWILD_EQUIPMENT_SKILLS?.supportCooldownOnCast(h,i)??supportSkillCooldown(h,i);return ok;})!==false){recordAction(heroKey(h),characterName(h),'輔助');yield;if(!living().length||!foes.some(e=>e.hp>0))break;}
   }
   if(!living().length||!foes.some(e=>e.hp>0))break;
   let actionTaken=false;
   for(const i of u.active){
    if(!foes.some(e=>e.hp>0))break;
    if(runCombatEventAction(h,()=>{const ok=castPartySkill(h,i,battleStats(h));if(ok!==false)actorCooldowns[memberKey(h)+'-'+i]=Math.max(0,Math.round(gemCooldownOnCast(i,h)));return ok;})!==false){recordAction(heroKey(h),characterName(h),'技能');actionTaken=true;break;}
   }
   p.index++;p.unit=null;
   if(actionTaken){globalThis.EmberwildCombatEvents?.endTurn(h);yield;continue;}
   if(singleTargetEnemyPool().length){recordAction(ref.id,characterName(h),'普攻');performHeroBasic(h);globalThis.EmberwildCombatEvents?.endTurn(h);yield;}else globalThis.EmberwildCombatEvents?.endTurn(h,false);
  }else{
   const label=typeof sharedEnemyActionLabel==='function'?sharedEnemyActionLabel(actor):'攻擊';
   recordAction(ref.id,actor.name,label);performEnemyAction(actor);p.index++;p.unit=null;yield;
  }
 }
 combatRoundProgress=null;
 if(!living().length||!foes.some(e=>e.hp>0))globalThis.EmberwildCombatEvents?.clear();
 // Capture presentation references before the existing result cleanup removes foes.
 if(!living().length)globalThis.EmberwildBattleSummary?.finish('wipe');
 else if(foes.length&&!foes.some(e=>e.hp>0))globalThis.EmberwildBattleSummary?.finish('victory');
 for(const e of foes)if(e.hp<=0)rewardGroupKill(e);if(!living().length){running=false;party.members[0].gold-=Math.floor(party.members[0].gold*GS('combat.defeatGoldLoss',.05));for(const h of heroes())h.shield=0;note('全隊戰敗，帳號失去 '+Math.round(GS('combat.defeatGoldLoss',.05)*10000)/100+'% 金幣。生命已全滿。');refillParty();foes=[];enemy=null;}else if(!foes.some(e=>e.hp>0)){refillParty();note('本次遭遇勝利，全隊生命已回滿。');if(foes.some(e=>e.kind==='final')){running=false;note('噬日者已倒下！LV30 成員解鎖 LV60，其他成員達 LV30 時解鎖。');}}save();if(tab==='battle'||!isEditingControl())render();else refreshGlobalJournal();if(activeBattleStat){if(activeBattleStat.pendingOutcome==='wipe')finalizeBattleStatistics('wipe');else if(foes.length&&foes.every(e=>e.hp<=0))finalizeBattleStatistics('victory');}
};
const resumableRoundReset=resetEncounter;
resetEncounter=function(){combatRoundProgress=null;return resumableRoundReset();};
function actionTurnElementLabel(element){return element==='physical'?'無屬性':`${ELEMENTS[element]}屬性`;}
coreSkillDetail=function(job,i,h=state){const sk=CLASSES[job]?.skills?.[i];if(!sk)return '';const old=state;if(h&&h!==state)state=h;let power=0,cdText='',proc=0;try{power=Math.round(skillPower(i,h)*100);if(sk[1]==='active')cdText=`冷卻 ${skillCooldown(i,h)} 回合`;else{proc=Math.round(procChance(i,h)*100);cdText=`普攻觸發率 ${proc}% · 冷卻 無`;}}finally{state=old;}const effectLabel={damage:'傷害倍率',heal:'治療倍率',shield:'護盾倍率',drain:'傷害／吸血倍率'}[sk[5]]||'效果倍率';return `${actionTurnElementLabel(coreSkillElement(job,i))} · ${effectLabel} ${power}% · 目標 ${coreSkillTargetText(sk)} · ${cdText} · 需求 LV${sk[2]}${skillRequiresAdvanced(sk,i)?'／二轉':''}`;};
supportSkillDetail=function(job,i,h=state){const sk=SUPPORT[job]?.[i];if(!sk)return '';const level=Math.max(1,h?.supportLevels?.[i]||1),value=+((sk.value+Math.max(0,level-1)*(Number.isFinite(sk.effectPerLevel)?sk.effectPerLevel:GS('skills.support.effectPerExtraLevel',.2)))*100).toFixed(1),cd=supportSkillCooldown(h,i);return `${actionTurnElementLabel(sk.element)} · 目標 ${TARGET_NAMES[sk.target]} · ${EFFECT_NAMES[sk.kind]} ${value}% · 持續 ${sk.duration} 戰鬥回合 · 冷卻 ${cd} 回合 · 需求 LV${sk.level}${i===2?'／二轉':''}`;};
const actionTurnApplyGameplaySettingsBase=applyGameplaySettingsSideEffects;
applyGameplaySettingsSideEffects=function(){actionTurnApplyGameplaySettingsBase();};
applyGameplaySettingsSideEffects();
const actionTurnGuideBase=guideView;
guideView=function(){return `<section class="panel"><h2>行動回合冷卻</h2><p>主動與輔助技能的冷卻只在該角色自己的行動回合推進；冷卻 N 代表施放後要完整經過 N 次自身行動，之後才能再次施放。其他隊員與敵人行動不會扣除冷卻。</p><p>每個角色自己的行動中，輔助技能不消耗主要行動；輔助處理完後，最多只會施放 1 個可用主動技能，若沒有主動技能可施放才會普通攻擊。主動技能或普通攻擊一旦執行，就結束該角色本回合。</p><p>主動技能最低冷卻為 ${GAME_BALANCE.combat.minimumActiveCooldown} 回合；因此 1 回合冷卻時，至少會隔一個自己的行動回合才再次施放。裝備的全技能冷卻詞條與指定技能冷卻詞條可同時生效。</p></section>`+actionTurnGuideBase();};
try{GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;applyGameplaySettingsSideEffects();}catch(e){console.warn('行動回合設定初始化失敗',e);}
if(state&&party){resetEncounter();save();render();}
