/* Reusable death groups and status events. The shared round generator (including
   offline replay) owns transactions; queued explosions never recurse. */
(()=>{
 'use strict';
 const S=()=>globalThis.__EMBERWILD_SKILLS,status=()=>globalThis.__EMBERWILD_STATUS_TEST_API;
 const hero=t=>t&&Object.hasOwn(t,'job'),key=t=>hero(t)?heroKey(t):t?.id;
 let depth=0,draining=false,queue=[],chainContext=null;
 const passives=h=>{
  const classSkills=S()?.system()?.definitions.filter(s=>s.type==='passive'&&s.eventPassive&&S().learned(h,s)&&S().passiveEnabled(h,s.id))||[];
  const companion=globalThis.__EMBERWILD_COMPANION_TEST_API?.passivesFor(h)||[];
  return [...new Map([...classSkills,...companion.filter(s=>s.eventPassive)].map(s=>[s.id,s])).values()];
 };
 function scanDeaths(allowChain=true,chainScale=1){
  const dead=foes.filter(e=>e.hp<=0&&!e.__eventDeathHandled);
  for(const e of dead)e.__eventDeathHandled=true;
  if(dead.length)queue.push({kind:'deaths',dead,allowChain,chainScale});
  return dead;
 }
 function reduceCooldowns(){
  for(const h of living())for(const sk of passives(h)){
   const e=sk.eventPassive;if(e.event!=='enemyDeath')continue;
   h.eventPassiveCooldowns??={};if((h.eventPassiveCooldowns[sk.id]||0)>0)continue;
   const seconds=globalThis.EmberwildSecondsCombat;
   if(seconds?.active)seconds.reduceCooldowns(h,e.reduction);
   else for(const cds of [actorCooldowns,supportCooldowns])for(const id of Object.keys(cds))if(id.startsWith(memberKey(h)+'-'))cds[id]=Math.max(0,cds[id]-e.reduction);
   h.eventPassiveCooldowns[sk.id]=e.cooldown*(seconds?.active?seconds.config().actionReferenceSeconds:1);
   note(characterName(h)+'・'+sk.name+' → 技能冷卻減少 '+e.reduction+' 回合');
  }
 }
 function enqueueStatus(event,target,allowChain=true,chainScale=1,instanceId=null){
  for(const row of status().collectTriggers(event,target,allowChain,chainScale,instanceId))queue.push({kind:'effect',...row});
 }
 function execute(row){
  const {instance:i,trigger:t}=row,caster=partyMember(i.sourceKey) || foes.find(e=>e.id===i.sourceKey);
  if(!caster)return;
  const opponents=hero(caster)?foes.filter(e=>e.hp>0):living(),allies=hero(caster)?living():foes.filter(e=>e.hp>0);
  const target=hero(caster)?foes.find(e=>e.id===i.targetKey):heroes().find(h=>heroKey(h)===i.targetKey);
  const targets=t.target==='enemies'?opponents:t.target==='allies'?allies:t.target==='self'?[caster]:target?.hp>0?[target]:[];
  const v=hero(caster)?battleStats(caster):enemyBattleStats(caster),amount=v.atk*t.power;
  for(const x of targets){
   if(x.hp<=0)continue;
   if(t.effect==='damage'){
    const dealt=hero(caster)?resolveHit(x,amount,caster,t.element,false):sharedEnemySkillDamage(caster,x,amount,t.element,{name:i.name});
    note(i.name+'・'+(t.event==='targetDeath'?'死亡引爆':'回合引爆')+' → '+(hero(x)?characterName(x):combatEnemyName(x))+' '+dealt+' 傷害',hero(caster)?'playerDamage':'enemyDamage');
   }else if(t.effect==='heal'){
    const before=x.hp;x.hp=Math.min(status().maxHp(x),x.hp+Math.round(healingAmount(caster,amount)));if(hero(caster))recordCombatContribution(caster,'healing',Math.max(0,x.hp-before));
    note(i.name+' → '+(hero(x)?characterName(x):combatEnemyName(x))+' 恢復 '+Math.max(0,x.hp-before)+' 生命');
   }else{
    if(hero(x))applyPureShield(x,amount);else x.shield=Math.max(x.shield||0,Math.round(amount));
    note(i.name+' → '+(hero(x)?characterName(x):combatEnemyName(x))+' 護盾 '+Math.round(amount));
   }
  }
  scanDeaths(t.allowDeathChain,t.chainMultiplier);
 }
 function drain(){
  if(draining)return;draining=true;
  try{
   for(let n=0;n<queue.length;n++){
    const row=queue[n];
    if(row.kind==='deaths'){
     reduceCooldowns();
     for(const dead of row.dead)enqueueStatus('targetDeath',dead,row.allowChain,row.chainScale);
    }else execute(row);
   }
  }finally{queue=[];draining=false;}
 }
 function action(actor,fn){
  if(depth||draining)return fn();
  depth++;
  const before=new Set(foes.filter(e=>e.hp>0).map(e=>e.id));
  const old=chainContext;chainContext={actor,kills:new Set()};
  try{
   const out=fn();scanDeaths();drain();
   if(hero(actor)&&actor.hp>0&&[...chainContext.kills].some(id=>before.has(id))){
    const sk=passives(actor).find(s=>s.eventPassive.event==='kill');
    if(sk)for(let n=0;n<sk.eventPassive.maxAttacks;n++){
     const target=foes.filter(e=>e.hp>0).sort((a,b)=>a.hp-b.hp||String(a.id).localeCompare(String(b.id)))[0];if(!target)break;
     const dealt=resolveHit(target,battleStats(actor).atk*sk.eventPassive.power,actor,sk.element||'physical',false),killed=target.hp<=0;
     note(characterName(actor)+'・'+sk.name+' '+(n+1)+' → '+combatEnemyName(target)+' '+dealt+' 傷害','playerDamage');
     scanDeaths();drain();if(!killed)break;
    }
   }
   return out;
  }finally{chainContext=old;depth--;}
 }
 function endTurn(actor,acted=true){
  scanDeaths();drain();
  // Death consumes all marks first, even when death occurs during this turn.
  if(actor.hp>0){
   if(acted)enqueueStatus('targetActionEnd',actor);
   if(!globalThis.EmberwildSecondsCombat?.active)enqueueStatus('targetTurnEnd',actor);drain();
  }
  status().tickActorTurns(actor);
 }
 function clear(resetCooldowns=false,keepStatuses=false){queue=[];depth=0;draining=false;chainContext=null;if(!keepStatuses)status().clearEvents();if(resetCooldowns)for(const h of heroes())delete h.eventPassiveCooldowns;}
 const hit=resolveHit;
 resolveHit=function(target,amount,caster,...args){
  const before=target?.hp,out=hit(target,amount,caster,...args);
  if(before>0&&target.hp<=0&&chainContext&&caster===chainContext.actor)chainContext.kills.add(target.id);
  return out;
 };
 const cast=castPartySkill,basic=performHeroBasic,enemyAction=performEnemyAction;
 castPartySkill=function(h,...args){return action(h,()=>cast(h,...args));};
 performHeroBasic=function(h,...args){return action(h,()=>basic(h,...args));};
 performEnemyAction=function(e,...args){const out=action(e,()=>enemyAction(e,...args));endTurn(e,out!=='controlled');return out;};
 const tick=tickHeroCooldowns;
 tickHeroCooldowns=function(h){tick(h);for(const id of Object.keys(h.eventPassiveCooldowns||{}))h.eventPassiveCooldowns[id]=Math.max(0,h.eventPassiveCooldowns[id]-1);};
 const initiative=initiativeOrder;
 initiativeOrder=function(...args){const out=action(null,()=>initiative(...args));return out;};
 const reset=resetEncounter,spawn=spawnGroup;
 resetEncounter=function(...args){clear(true);return reset(...args);};
 spawnGroup=function(...args){clear(false,!!globalThis.EmberwildSecondsCombat?.continuing);return spawn(...args);};
 status().addDefinition(EmberwildSkillSystem.clearingStatus());
 globalThis.EmberwildCombatEvents={action,endTurn,scanDeaths,drain,clear,emit(event,target,instanceId){scanDeaths();drain();if(target?.hp>0){enqueueStatus(event,target,true,1,instanceId);drain();}}};
})();
