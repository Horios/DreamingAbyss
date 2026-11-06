/* Equipment owns gems. Cached effects read only the five worn instances; all
   gem changes and item disposal commit together with the existing save. */
(()=>{
 'use strict';
 const M=EmberwildSkillSystem,S=__EMBERWILD_SKILLS,copy=M.copy,cache=new WeakMap();
 let creatingSource=null,creatingPreview=false,creatingContext=null;
 const pending=new WeakSet();
 const owner=()=>party?.members[0],rules=()=>S.system();
 function compatible(id,sk,slot){const g=rules().gems.find(g=>g.kind===id%5);return !!g&&!!sk&&g.skill.types.includes(sk.type)&&(!g.skill.effects.length||g.skill.effects.includes(sk.effect||sk.kind))&&g.skill.slots.includes(slot);}
 function mode(h,g,n){if(n!==0||g.id!==h?.activeSkillEquipmentId||!g.skillId||g.skillSockets.firstMode==='base')return 'base';const id=g.skillSockets.gems[n];return id!==null&&compatible(id,S.byId(g.skillId),n)?'skill':'base';}
 function refresh(h){
  const base={},ratios={},skills=new Map();
  for(const g of equipment(h)){
   if(EmberwildTokens.isToken(g))continue;M.gear(g,{legacy:true,system:rules()});
   g.skillSockets.gems.forEach((id,n)=>{
    if(id===null)return;const def=rules().gems.find(g=>g.kind===id%5),tier=Math.floor(id/5);
    if(mode(h,g,n)==='base'){const v=def.base.values[tier],box=def.base.unit==='ratio'&&def.base.stat!=='crit'?ratios:base;box[def.base.stat]=(box[def.base.stat]||0)+v;}
    else{if(!skills.has(g.skillId))skills.set(g.skillId,{});const out=skills.get(g.skillId);out[def.skill.key]=Math.min(def.cap,(out[def.skill.key]||0)+def.skill.values[tier]);}
   });
  }
  const result={base,ratios,skills};if(!globalThis.EmberwildBattleConfiguration?.active)cache.set(h,result);return result;
 }
 const effectsFor=h=>globalThis.EmberwildBattleConfiguration?.active?globalThis.EmberwildBattleConfiguration.equipmentEffects(h,()=>refresh(h)):cache.get(h)||refresh(h);
 const summaryBase=equipmentAbilitySummary;globalThis.equipmentAbilitySummary=function(g){
  const out=summaryBase(g),h=owner();
  for(const [n,id] of (g.skillSockets?.gems||[]).entries()){
   if(id===null)continue;const d=rules().gems.find(x=>x.kind===id%5),tier=Math.floor(id/5),use=mode(h,g,n);
   if(use==='base'){const ratio=d.base.unit==='ratio',key=ratio&&d.base.stat!=='crit'?({atk:'attackPct',hp:'hpPct',def:'defensePct'}[d.base.stat]||d.base.stat):d.base.stat,v=d.base.values[tier]*(ratio?100:1);out.numeric[key]=(out.numeric[key]||0)+v;out.values.push(GEMS[id].name+'：'+({atk:'攻擊',hp:'生命',def:'防禦',crit:'暴擊率',speed:'速度'}[d.base.stat]||d.base.stat)+' +'+v+(ratio?'%':''));}
   else{const key='gemSkill:'+g.skillId+':'+d.skill.key,v=d.skill.values[tier];out.numeric[key]=(out.numeric[key]||0)+v;out.values.push(GEMS[id].name+'：'+S.byId(g.skillId).name+' '+({effect:'效果',cooldown:'冷卻縮短機率',procChance:'觸發率',heal:'治療',shield:'護盾'}[d.skill.key]||d.skill.key)+' +'+Number((v*100).toFixed(2))+'%');}
  }
  return out;
 };
 function skillRate(h,id,key){return effectsFor(h).skills.get(id)?.[key]||0;}
 function pool(g,source,ctx){const lv=gearRequiredLevel(g);return rules().equipment.pool.filter(r=>!S.byId(r.skillId)?.disabled&&r.jobs.includes(g.job)&&r.slots.includes(g.slot)&&lv>=r.minLevel&&lv<=r.maxLevel&&(source!=='shop'||r.allowShop)&&(source!=='craft'||r.allowCraft)&&(!r.maps.length||r.maps.includes(ctx.map))&&(!r.monsters.length||r.monsters.includes(ctx.monster))&&(!r.bosses.length||r.bosses.includes(g.boss))&&r.weight>0);}
 function generate(g,{source=creatingSource||'drop',preview=creatingPreview,context=creatingContext||{},force=false}={}){
  if(!g||EmberwildTokens.isToken(g))return g;
  if(force){delete g.skillSockets;delete g.skillId;}
  if(g.skillSockets)return g;
  M.gear(g,{source,system:rules(),random:preview?()=>0:Math.random});
  const original=typeof itemForm==='function'?itemForm(g):null,formId=original?.id||`job${g.formJob??g.job}-slot${g.slot}-form${g.form??0}`,form={...original,...rules().equipment.formRules?.find(r=>r.formId===formId)},fixed=form?.skillId;
  if(fixed&&S.byId(fixed))g.skillId=fixed;
  else if(!preview&&source!=='starter'&&form?.allowSkill!==false&&Math.random()<(form?.skillChance??rules().equipment.chanceByDifficulty[context.difficulty??g.difficulty??0])){
   const rows=pool(g,source,{map:g.region??party?.map,monster:context.monster??enemy?.monsterId,...context}),sum=rows.reduce((a,x)=>a+x.weight,0);let n=Math.random()*sum;
   for(const row of rows)if((n-=row.weight)<0){g.skillId=row.skillId;break;}
  }
  return g;
 }
 const baseGear=gear;gear=function(...args){const g=baseGear(...args);if(creatingContext){pending.add(g);return g;}return generate(g);};
 const grantBase=grantConfiguredDrop;grantConfiguredDrop=function(rule,e,...args){const before=creatingContext;creatingContext={map:e.region??party?.map,monster:e.monsterId,difficulty:e.difficulty??0};try{return grantBase(rule,e,...args);}finally{creatingContext=before;}};
 const addBase=addGear;addGear=function(g,...args){if(pending.has(g)){pending.delete(g);generate(g);}return addBase(g,...args);};
 const baseBoss=bossGear;bossGear=function(...args){return generate(baseBoss(...args),{source:creatingSource||'boss',force:true});};
 const shopBase=createEquipmentShopGear;globalThis.createEquipmentShopGear=function(a,b,opts={}){const old=creatingSource,prev=creatingPreview;creatingSource='shop';creatingPreview=!!opts.preview;try{return generate(shopBase(a,b,opts),{source:'shop',preview:!!opts.preview,force:true});}finally{creatingSource=old;creatingPreview=prev;}};
 const craftBase=craftBoss;craftBoss=function(...args){const old=creatingSource;creatingSource='craft';try{return craftBase(...args);}finally{creatingSource=old;}};
 const statsBase=stats;stats=function(h=state){const v=statsBase(h),e=effectsFor(h),b=e.base;for(const [k,n] of Object.entries(b))v[k]=(v[k]||0)+n;for(const [k,n] of Object.entries(e.ratios))v[k]=(v[k]||0)*(1+n);v.hp=Math.max(1,Math.round(v.hp));v.atk=Math.max(0,Math.round(v.atk));v.def=Math.max(0,Math.round(v.def));v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,v.crit);return v;};solo.stats=stats;
 gemCompatible=function(id,job,i){return compatible(id,S.byPosition(job,'core',i),0);};
 gemRate=function(h,i,kind){const sk=S.byPosition(h?.job,'core',i),g=rules().gems.find(g=>g.kind===kind);return sk&&g?skillRate(h,sk.id,g.skill.key):0;};
 applyGemAfterSkill=function(h,i,v){
  const sk=S.byPosition(h?.job,'core',i),id=sk?.id;if(!id)return;
  const heal=skillRate(h,id,'heal'),shield=skillRate(h,id,'shield');if(!heal&&!shield)return;
  const ally=[...living()].sort((a,b)=>a.hp/stats(a).hp-b.hp/stats(b).hp)[0];if(!ally)return;
  if(heal){const before=ally.hp;ally.hp=Math.min(stats(ally).hp,ally.hp+Math.max(1,Math.round((v?.atk??battleStats(h).atk)*heal)));recordCombatContribution(h,'healing',ally.hp-before);}
  if(shield)ally.shield=Math.max(0,ally.shield||0)+Math.max(1,Math.round(stats(h).def*shield));
 };
 const supportAmountBase=supportAmount;supportAmount=function(j,i){const h=heroes().find(h=>h.job===j&&h.supportSlots.includes(i)),sk=S.byPosition(j,'support',i);return supportAmountBase(j,i)*(1+(h&&sk?skillRate(h,sk.id,'effect'):0));};
 function supportCooldownOnCast(h,i){const sk=S.byPosition(h?.job,'support',i);return Math.max(1,supportSkillCooldown(h,i)-(sk&&Math.random()<skillRate(h,sk.id,'cooldown')?1:0));}
 const supportBase=castSupport;castSupport=function(h,i){const out=supportBase(h,i),sk=S.byPosition(h?.job,'support',i);if(out!==false&&sk){const heal=skillRate(h,sk.id,'heal'),shield=skillRate(h,sk.id,'shield'),ally=[...living()].sort((a,b)=>a.hp/stats(a).hp-b.hp/stats(b).hp)[0];if(ally){if(heal){const before=ally.hp;ally.hp=Math.min(stats(ally).hp,ally.hp+Math.round(battleStats(h).atk*heal));recordCombatContribution(h,'healing',ally.hp-before);}if(shield)ally.shield+=Math.round(stats(h).def*shield);}}return out;};
 function transaction(change){
  if(!party)return false;
  const p=owner(),before=copy(packParty()),oldState=memberKey(state);
  try{change();S.refreshAll();if(!globalThis.EmberwildBattleConfiguration?.pending())for(const h of party.members)h.hp=Math.min(h.hp,stats(h).hp);if(save()===false)throw Error('儲存失敗');globalThis.EmberwildBattleConfiguration?.notify();render();return true;}
  catch(e){loadParty(before);state=partyMember(oldState)||p;toast('操作未保存：'+e.message);return false;}
 }
 globalThis.selectSkillEquipment=function(id){
  // The skill page edits the party leader, even when another hero is selected.
  const h=owner();if(!h)return false;
  const g=id===null?null:equipment(h).find(g=>g.id===id),sk=g&&S.byId(g.skillId);
  if(id!==null&&(!g||!sk||!sk.jobs.includes(h.job)||sk.disabled))return false;
  return transaction(()=>{h.activeSkillEquipmentId=id;refresh(h);S.refreshHero(h);});
 };
 globalThis.socketEquipmentGem=function(id,n,type){
  const g=findGear(id);type=Number(type);if(!g||EmberwildTokens.isToken(g)||!Number.isInteger(n)||n<0||n>=g.skillSockets?.count||!Number.isInteger(type)||type< -1||type>=GEMS.length)return false;
  const h=owner(),old=g.skillSockets.gems[n],next=type===-1?null:type;if(old===next)return true;
  if(next!==null&&h.gems[next]<1)return false;
  if(next!==null&&n===0&&g.skillId&&g.skillSockets.firstMode==='skill'&&!compatible(next,S.byId(g.skillId),n)){toast('此寶石不適用於裝備技能');return false;}
  return transaction(()=>{if(old!==null)h.gems[old]++;if(next!==null)h.gems[next]--;g.skillSockets.gems[n]=next;});
 };
 globalThis.setEquipmentGemMode=function(id,value){const h=owner(),g=equipment(h).find(g=>g.id===id);if(!g||!S.byId(g.skillId)||h.activeSkillEquipmentId!==id||!g.skillSockets?.count||!['skill','base'].includes(value))return false;if(value==='skill'&&g.skillSockets.gems[0]!==null&&!compatible(g.skillSockets.gems[0],S.byId(g.skillId),0)){toast('第一孔寶石不相容，請先更換寶石或保留基礎模式');return false;}return transaction(()=>{g.skillSockets.firstMode=value;});};
 function refund(g,h=owner()){for(const id of g.skillSockets?.gems||[])if(id!==null)h.gems[id]++;}
 globalThis.__EMBERWILD_EQUIPMENT_SKILLS={refresh,generate,compatible,mode,effectsFor,skillRate,refund,supportCooldownOnCast};
 S.refreshAll();
})();
