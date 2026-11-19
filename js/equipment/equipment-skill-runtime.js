/* Equipment owns gems. Cached effects read only the five worn instances; all
   gem changes and item disposal commit together with the existing save. */
(()=>{
 'use strict';
 const M=EmberwildSkillSystem,S=__EMBERWILD_SKILLS,copy=M.copy,cache=new WeakMap();
 let creatingSource=null,creatingPreview=false,grantingDrop=false;
 const pendingDropGear=new WeakSet();
 const owner=()=>party?.members[0],rules=()=>S.system();
 function refresh(h){
  const base={},ratios={};
  for(const g of equipment(h)){
   if(EmberwildTokens.isToken(g))continue;
   M.gear(g,{legacy:true,system:rules()});
   for(const id of g.skillSockets.gems){
    if(id===null)continue;
    const {stat,unit,values}=rules().gems.find(g=>g.kind===id%5).base;
    const box=unit==='ratio'&&stat!=='crit'?ratios:base;
    box[stat]=(box[stat]||0)+values[Math.floor(id/5)];
   }
  }
  const result={base,ratios};if(!globalThis.EmberwildBattleConfiguration?.active)cache.set(h,result);return result;
 }
 const effectsFor=h=>globalThis.EmberwildBattleConfiguration?.active?globalThis.EmberwildBattleConfiguration.equipmentEffects(h,()=>refresh(h)):cache.get(h)||refresh(h);
 const summaryBase=equipmentAbilitySummary;globalThis.equipmentAbilitySummary=function(g){
  const out=summaryBase(g);
  for(const id of g.skillSockets?.gems||[]){
   if(id===null)continue;const d=rules().gems.find(x=>x.kind===id%5),tier=Math.floor(id/5);
   const ratio=d.base.unit==='ratio',key=ratio&&d.base.stat!=='crit'?({atk:'attackPct',hp:'hpPct',def:'defensePct'}[d.base.stat]||d.base.stat):d.base.stat,v=d.base.values[tier]*(ratio?100:1);out.numeric[key]=(out.numeric[key]||0)+v;out.values.push(GEMS[id].name+'：'+({atk:'攻擊',hp:'生命',def:'防禦',crit:'暴擊率',speed:'速度'}[d.base.stat]||d.base.stat)+' +'+v+(ratio?'%':''));
  }
  return out;
 };
 const dropOnlyForm=id=>rules().equipment.formRules?.some(r=>r.formId===id&&r.dropOnly===true);
 function generate(g,{source=creatingSource||'drop',preview=creatingPreview,force=false}={}){
  if(!g||EmberwildTokens.isToken(g))return g;
  if(force){delete g.skillSockets;delete g.skillId;}
  if(g.skillSockets)return g;
  M.gear(g,{source,system:rules(),random:preview?()=>0:Math.random});
  const original=typeof itemForm==='function'?itemForm(g):null,formId=original?.id||`job${g.formJob??g.job}-slot${g.slot}-form${g.form??0}`,form={...original,...rules().equipment.formRules?.find(r=>r.formId===formId)},fixed=form?.skillId;
  if(fixed&&S.byId(fixed)&&(!form.dropOnly||grantingDrop))g.skillId=fixed;
  return g;
 }
 const baseGear=gear;gear=function(...args){
  const g=baseGear(...args);
  if(grantingDrop){pendingDropGear.add(g);return g;}
  return generate(g);
 };
 const baseGrant=grantConfiguredDrop;
 grantConfiguredDrop=function(...args){
  const previous=grantingDrop;grantingDrop=true;
  try{return baseGrant(...args);}finally{grantingDrop=previous;}
 };
 const baseAdd=addGear;
 addGear=function(g,...args){
  if(pendingDropGear.delete(g))generate(g);
  return baseAdd(g,...args);
 };
 const baseBoss=bossGear;bossGear=function(...args){return generate(baseBoss(...args),{source:creatingSource||'boss',force:true});};
 const shopBase=createEquipmentShopGear;globalThis.createEquipmentShopGear=function(a,b,opts={}){const old=creatingSource,prev=creatingPreview;creatingSource='shop';creatingPreview=!!opts.preview;try{return generate(shopBase(a,b,opts),{source:'shop',preview:!!opts.preview,force:true});}finally{creatingSource=old;creatingPreview=prev;}};
 const craftBase=craftBoss;craftBoss=function(...args){const old=creatingSource;creatingSource='craft';try{return craftBase(...args);}finally{creatingSource=old;}};
 const statsBase=stats;stats=function(h=state){const v=statsBase(h),e=effectsFor(h),b=e.base;for(const [k,n] of Object.entries(b))v[k]=(v[k]||0)+n;for(const [k,n] of Object.entries(e.ratios))v[k]=(v[k]||0)*(1+n);v.hp=Math.max(1,Math.round(v.hp));v.atk=Math.max(0,Math.round(v.atk));v.def=Math.max(0,Math.round(v.def));v.crit=Math.min(GAME_BALANCE.combat.statCaps.crit,v.crit);return v;};solo.stats=stats;
 function transaction(change){
  if(!party)return false;
  const p=owner(),before=copy(packParty()),oldState=memberKey(state);
  try{change();S.refreshAll();if(!globalThis.EmberwildBattleConfiguration?.pending())for(const h of party.members)h.hp=Math.min(h.hp,stats(h).hp);if(save()===false)throw Error(saveFailureText());globalThis.EmberwildBattleConfiguration?.notify();render();return true;}
  catch(e){loadParty(before);state=partyMember(oldState)||p;toast('操作未保存：'+e.message);return false;}
 }
 globalThis.socketEquipmentGem=function(id,n,type){
  const g=findGear(id);type=Number(type);if(!g||EmberwildTokens.isToken(g)||!Number.isInteger(n)||n<0||n>=g.skillSockets?.count||!Number.isInteger(type)||type< -1||type>=GEMS.length)return false;
  const h=owner(),old=g.skillSockets.gems[n],next=type===-1?null:type;if(old===next)return true;
  if(next!==null&&h.gems[next]<1)return false;
  return transaction(()=>{if(old!==null)h.gems[old]++;if(next!==null)h.gems[next]--;g.skillSockets.gems[n]=next;});
 };
 function refund(g,h=owner()){for(const id of g.skillSockets?.gems||[])if(id!==null)h.gems[id]++;}
 globalThis.__EMBERWILD_EQUIPMENT_SKILLS={refresh,generate,effectsFor,refund,dropOnlyForm};
 S.refreshAll();
})();
