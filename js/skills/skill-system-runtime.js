/* Stable-ID configuration projected into the existing shared combat runtime. */
(()=>{
 'use strict';
 const M=EmberwildSkillSystem,copy=M.copy,T=()=>globalThis.__EMBERWILD_TEAMS;
 let system=null,byId=new Map(),byPosition=new Map(),refreshing=false,restoringBuild=null;
 const wornCache=new WeakMap();
 function worn(h){if(!party?.members.includes(h))return (h.bag||[]).filter(g=>h.equipped?.includes(g.id));if(!wornCache.has(h))wornCache.set(h,equipment(h));return wornCache.get(h);}
 const player=()=>party?.members[0],companion=h=>h&&h!==player()&&h.companionId!==undefined;
 const position=(j,k,i)=>`${j}:${k}:${i}`;
 function install(s){system=copy(M.validate(s));byId=new Map(system.definitions.map(sk=>[sk.id,sk]));byPosition=new Map(system.definitions.flatMap(sk=>M.adapters(sk).map(a=>[position(a.job,a.kind,a.index),sk])));}
 function slotCounts(h){return companion(h)?{active:h.active?.length||0,proc:h.procSlots?.length||0,support:h.supportSlots?.length||0}:M.slots(system,h.job,h.advanced);}
 function learned(h,sk){
  const battle=globalThis.EmberwildBattleConfiguration;if(battle?.active&&battle.has(h))return battle.learned(h,sk?.id);
  if(!sk||sk.disabled||!sk.jobs.includes(h.job)||sk.partnerId!=null&&sk.partnerId!==h.companionId)return false;
  const level=sk.requiredLevel??sk.level??1;if(h.lv<level)return false;
  if(companion(h)){const p=globalThis.__EMBERWILD_COMPANION_TEST_API?.companionPlan(h);return sk.partnerId===h.companionId&&(sk.type==='passive'?p?.passives?.includes(sk.id):(sk.adapter.kind==='core'?p?.core:p?.support)?.includes(sk.adapter.index));}
  const key=`${h.job}:${M.adapterFor(sk,h.job).kind}:${M.adapterFor(sk,h.job).index}`,permanent=restoringBuild?.permanent||T()?.build()?.permanent,unlocked=permanent?.unlocks?.[key];
  if(!unlocked&&sk.requiredMastery&&__EMBERWILD_MASTERY.masteryLevelFromXp(h.mastery?.[sk.requiredMastery]||0)<(sk.requiredMasteryLevel||0))return false;
  const gates=sk.unlockConditions||{};
  if(!unlocked&&(gates.classMasteryLevel||['materials','bossKills','eliteKills','bossEquipment'].some(k=>gates[k]?.length)))return false;
  const r=system.classRules.find(r=>r.job===h.job);
  if(r.initial.some(x=>x.skillId===sk.id&&h.lv>=x.level))return true;
  if(h.advanced&&r.advanced.some(x=>x.skillId===sk.id&&h.lv>=x.level))return true;
  for(const src of sk.sources){
   if(src.level&&h.lv<src.level)continue;
   if(src.type==='quest'){if(src.rewardOnly){if(h.acquiredSkillIds?.includes(sk.id))return true;continue;}const qs=src.questIds||sk.unlockConditions?.quests||['tutorial'];const required=qs.length?qs:['tutorial'];if(required.every(q=>q==='tutorial'?player()?.tutorial>=3||party?.story?.quests?.goddess_intro?.done:player()?.claimed?.includes(q)||party?.story?.quests?.[q]?.done)||h.acquiredSkillIds?.includes(sk.id))return true;}
   if(src.type==='equipment'&&h.activeSkillEquipmentId&&worn(h).some(g=>g.id===h.activeSkillEquipmentId&&g.skillId===sk.id))return true;
  }
  return false;
 }
 function emptyLoadout(h){const c=M.slots(system,h.job,h.advanced);return Object.fromEntries(['active','proc','support'].map(t=>[t,Array(c[t]).fill(null)]));}
 function legacyLoadout(h){const out=emptyLoadout(h);for(const [type,field,kind] of [['active','active','core'],['proc','procSlots','core'],['support','supportSlots','support']])out[type]=out[type].map((_,n)=>byPosition.get(position(h.job,kind,h[field]?.[n]))?.id??null);return out;}
 function projectHero(h){
  if(!h||!system)return h;
  if(companion(h)){
   const list=system.definitions.filter(sk=>learned(h,sk));
   // New append-only companion skills can be projected beyond old saved arrays.
   // Only mark skills the companion's validated ownership rules actually unlock.
   // Do not reclassify unknown or malformed persisted values as learned.
   for(const sk of list){
    const field=sk.adapter.kind==='core'?'skills':sk.adapter.kind==='support'?'supportLevels':null;
    const values=field&&h[field],i=sk.adapter.index;
    if(!Array.isArray(values)||!Number.isInteger(i)||i<0)continue;
    while(values.length<=i)values.push(0);
    values[i]=1;
   }
   h.active=list.filter(sk=>sk.type==='active').map(sk=>sk.adapter.index);h.procSlots=list.filter(sk=>sk.type==='proc').map(sk=>sk.adapter.index);h.supportSlots=list.filter(sk=>sk.type==='support').map(sk=>sk.adapter.index);
   return h;
  }
  if(!h.skillLoadout)return h;
  for(const [type,field] of [['active','active'],['proc','procSlots'],['support','supportSlots']])h[field]=h.skillLoadout[type].map(id=>(byId.has(id)?M.adapterFor(byId.get(id),h.job).index:null));
  return h;
 }
 function refreshHero(h){
  if(!h||!system)return h;
  if(h===player()&&T()?.plan()?.job===null){h.skillLoadout=null;h.activeSkillEquipmentId=null;return h;}
  h.activeSkillEquipmentId??=null;
  wornCache.delete(h);
  h.passiveEnabled??={};
  if(companion(h)){for(const sk of system.definitions)if(sk.type==='passive'&&learned(h,sk)&&!Object.hasOwn(h.passiveEnabled,sk.id))h.passiveEnabled[sk.id]=true;delete h.disabledCompanionSkills;return projectHero(h);}
  if(h.activeSkillEquipmentId&&!worn(h).some(g=>g.id===h.activeSkillEquipmentId&&byId.get(g.skillId)?.jobs.includes(h.job)))h.activeSkillEquipmentId=null;
  globalThis.__EMBERWILD_EQUIPMENT_SKILLS?.refresh(h);
  const first=!h.skillLoadout;h.skillLoadout??=legacyLoadout(h);
  const slots=emptyLoadout(h),seen=new Set();
  for(const type of ['active','proc','support'])for(let n=0;n<slots[type].length;n++){
   const id=h.skillLoadout[type]?.[n],sk=byId.get(id);if(id&&sk?.type===type&&learned(h,sk)&&!seen.has(id)){slots[type][n]=id;seen.add(id);}
  }
  if(first)for(const row of system.classRules.find(r=>r.job===h.job).initial){const sk=byId.get(row.skillId),n=slots.active.indexOf(null);if(sk.type==='active'&&n>=0&&!seen.has(sk.id)&&learned(h,sk)){slots.active[n]=sk.id;seen.add(sk.id);}}
  h.skillLoadout=slots;
  h.skills=CLASSES[h.job].skills.map((_,i)=>Number(learned(h,byPosition.get(position(h.job,'core',i)))));
  h.supportLevels=SUPPORT[h.job].map((_,i)=>Number(learned(h,byPosition.get(position(h.job,'support',i)))));
  h.passiveEnabled??={};for(const sk of system.definitions)if(sk.type==='passive'&&learned(h,sk)&&!Object.hasOwn(h.passiveEnabled,sk.id))h.passiveEnabled[sk.id]=true;
  h.sockets=h.skills.map(()=>null);return projectHero(h);
 }
 function refreshAll(){if(refreshing||!party||!system)return;refreshing=true;try{for(const h of party.members)refreshHero(h);}finally{refreshing=false;}}
 function applyMetadata(){for(const r of system.classRules)if(r.description)CLASSES[r.job].desc=r.description;for(const sk of system.definitions)for(const a of M.adapters(sk)){if(a.kind==='core'&&CLASSES[a.job]?.skills[a.index])Object.assign(CLASSES[a.job].skills[a.index][6],copy(sk),{sharedId:sk.adapters?sk.id+'-job'+a.job:sk.id,requiresAdvanced:false});else if(a.kind==='support'&&SUPPORT[a.job]?.[a.index])Object.assign(SUPPORT[a.job][a.index],copy(sk));}}
 const baseValidate=validateBalanceConfig,baseApply=applyBalanceConfig,baseExport=exportableBalance;
 validateBalanceConfig=function(input){const d=M.normalizeDocument(input),out=baseValidate(d);out.skillSystem=copy(d.skillSystem);return out;};
 exportableBalance=function(){const d=baseExport();d.skillSystem=copy(system);d.balanceSettings.meta.skillSystemVersion=M.VERSION;return M.project(d);};
 applyBalanceConfig=function(input,options={}){
  const d=M.normalizeDocument(input),old=system;install(d.skillSystem);
  try{const out=baseApply(d,{...options,persist:false});if(out===false){install(old);return false;}applyMetadata();refreshAll();if(options.persist!==false)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));return {...out,skillSystem:copy(system)};}catch(e){if(old)install(old);throw e;}
 };
 const baseCoreAvailable=coreSkillAvailableToHero;
 coreSkillAvailableToHero=function(j,i,h=state){const sk=byPosition.get(position(j,'core',i));return sk?learned(h,sk):baseCoreAvailable(j,i,h);};
 const mastery=__EMBERWILD_MASTERY,oldCoreMissing=mastery.coreMissingRequirements,oldSupportMissing=mastery.supportMissingRequirements;
 mastery.coreMissingRequirements=(h,i,use)=>{const sk=byPosition.get(position(h?.job,'core',i));return sk?[...(learned(h,sk)?[]:['尚未取得技能']),...oldCoreMissing(h,i,true)]:oldCoreMissing(h,i,use);};
 mastery.supportMissingRequirements=(h,i,use)=>{const sk=byPosition.get(position(h?.job,'support',i));return sk?[...(learned(h,sk)?[]:['尚未取得技能']),...oldSupportMissing(h,i,true)]:oldSupportMissing(h,i,use);};
 function validCast(h,i,kind){const sk=byPosition.get(position(h?.job,kind,i));if(!sk||!learned(h,sk)||h.hp<=0||(kind==='core'?oldCoreMissing:oldSupportMissing)(h,i,true).length)return false;return companion(h)||Object.values(h.skillLoadout||{}).some(a=>a.includes(sk.id));}
 const oldCast=castPartySkill,oldSupport=castSupport;
 castPartySkill=function(h,i,v){
  if(!validCast(h,i,'core'))return false;const sk=byPosition.get(position(h.job,'core',i));
  if(!sk.systemEffect)return oldCast(h,i,v);
  const alive=foes.filter(e=>e.hp>0);if(!alive.length)return false;
  if(sk.systemEffect==='taunt'){for(const e of alive){effects=effects.filter(x=>!(x.kind==='skillTaunt'&&x.target===e.id));effects.push({source:memberKey(h),skill:sk.id,target:e.id,kind:'skillTaunt',value:memberKey(h),until:partyClock+sk.duration,name:sk.name});}}
  else if(sk.systemEffect==='guard'||sk.systemEffect==='regen'){
   const targets=sk.systemEffect==='guard'?[h]:living(),kind=sk.systemEffect==='guard'?'guard':'regen';
   for(const ally of targets){effects=effects.filter(e=>!(e.source===memberKey(h)&&e.skill===sk.id&&e.target===heroKey(ally)));effects.push({source:memberKey(h),skill:sk.id,target:heroKey(ally),kind,value:sk.power,until:partyClock+sk.duration,name:sk.name});}
  }else if(sk.systemEffect==='slow')for(const e of alive.slice(0,sk.maxTargets)){effects=effects.filter(x=>!(x.skill===sk.id&&x.target===e.id));effects.push({source:memberKey(h),skill:sk.id,target:e.id,kind:'skillSlow',value:sk.power,until:partyClock+sk.duration,name:sk.name});}
  note(characterName(h)+'・'+sk.name+' · '+sk.description);applyGemAfterSkill(h,i,v||battleStats(h));return true;
 };
 castSupport=function(h,i){return validCast(h,i,'support')?oldSupport(h,i):false;};
 const speedBase=combatSpeed;combatSpeed=function(e){return Math.max(1,Math.round(speedBase(e)*(1-Math.min(.9,effectTotal(e.id,'skillSlow')))));};
 const oldValidateParty=validateParty;
 function prepare(raw){
  // Check saved fields before the new skill system rebuilds its projections.
  // Keep legitimate old skill indices, but never normalize corrupted input away.
  for(const p of raw?.buildSystem?.plans||[]){
   if(p.job===null)continue;
   for(const field of ['skills','supportLevels'])if(!Array.isArray(p[field])||p[field].some(v=>!Number.isInteger(v)||v<0||v>1))throw Error('隊伍技能資料無效');
   for(const [field,source] of [['active','skills'],['procSlots','skills'],['supportSlots','supportLevels']]){
    if(!Array.isArray(p[field])||p[field].some(i=>i!==null&&(!Number.isInteger(i)||i<0||i>=p[source].length||p[source][i]!==1)))throw Error('隊伍技能槽無效');
   }
   if(!Array.isArray(p.sockets)||p.sockets.some(id=>id!==null&&!Object.hasOwn(raw.buildSystem.permanent?.gemInstances||{},id)))throw Error('隊伍技能寶石引用無效');
  }
  const d=M.migrateSave(migrateLegacyGemSave(raw),system),members=d.version===3?d.members:[d],h=members[0],b=d.buildSystem;
  if(d.skillTutorialVersion!==1&&d.story?.quests?.goddess_intro?.done){h.acquiredSkillIds??=[];for(const sk of system.definitions.filter(sk=>sk.sources.some(s=>s.rewardOnly))){const a=sk.adapter;if((h.job===a.job&&h.supportLevels?.[a.index]||b?.plans?.some(p=>p.job===a.job&&p.supportLevels?.[a.index]))&&!h.acquiredSkillIds.includes(sk.id))h.acquiredSkillIds.push(sk.id);}}d.skillTutorialVersion=1;
  if(b){restoringBuild=b;try{for(const p of b.plans){if(p.job===null){p.skillLoadout=null;p.activeSkillEquipmentId=null;continue;}const tmp={...h,job:p.job,advanced:!!b.permanent.classes[p.job]?.advanced,...copy(p)};tmp.advanced=!!b.permanent.classes[p.job]?.advanced;refreshHero(tmp);for(const f of ['skills','supportLevels','active','procSlots','supportSlots','skillLoadout','activeSkillEquipmentId','passiveEnabled'])if(tmp[f]!==undefined)p[f]=copy(tmp[f]);for(const [kind,list] of [['core',p.skills],['support',p.supportLevels]])list.forEach((v,i)=>{if(v)b.permanent.unlocks[`${p.job}:${kind}:${i}`]=true;});}const p=b.plans.find(x=>x.id===b.activeId);if(p?.job!==null)for(const f of ['skills','supportLevels','active','procSlots','supportSlots','skillLoadout','activeSkillEquipmentId','passiveEnabled'])if(p[f]!==undefined)h[f]=copy(p[f]);}finally{restoringBuild=null;}}
  for(const member of members)refreshHero(member);
  if(raw.skillSystemVersion!==M.VERSION&&d.offlineExploration?.combat){d.offlineExploration.combat.progress=null;d.offlineExploration.combat.actorCooldowns={};d.offlineExploration.combat.supportCooldowns={};}
  return d;
 }
 validateParty=function(raw){const d=prepare(raw),out=oldValidateParty(d);out.skillSystemVersion=M.VERSION;for(let n=0;n<out.members.length;n++){const src=d.version===3?d.members[n]:d;if(src.passiveEnabled!==undefined&&(!src.passiveEnabled||typeof src.passiveEnabled!=='object'||Array.isArray(src.passiveEnabled)||Object.entries(src.passiveEnabled).some(([id,v])=>!byId.has(id)||byId.get(id).type!=='passive'||typeof v!=='boolean')))throw Error('被動技能啟用資料無效');for(const f of ['skillLoadout','activeSkillEquipmentId','acquiredSkillIds','passiveEnabled'])if(src[f]!==undefined)out.members[n][f]=copy(src[f]);}return out;};
 const oldLoad=loadParty;loadParty=function(raw){const d=prepare(raw),out=oldLoad(d);party.skillSystemVersion=M.VERSION;party.skillTutorialVersion=1;refreshAll();const message=$('toast');if(party&&state&&message?.textContent?.startsWith('存檔未能載入：')){message.textContent='';message.style.display='none';}return out;};
 const oldPack=packParty;packParty=function(){refreshAll();const out=oldPack();out.skillSystemVersion=M.VERSION;out.skillTutorialVersion=1;return out;};
 const oldStart=start;start=function(...args){const out=oldStart(...args);refreshAll();T()?.capture();save();render();return out;};
 const oldXP=awardXP;awardXP=function(...args){
  const out=oldXP(...args),cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
  const key=cache?JSON.stringify([party.members.map(h=>[memberKey(h),h.lv,h.job,h.advanced,h.activeSkillEquipmentId,h.acquiredSkillIds,Object.entries(h.mastery||{}).map(([k,n])=>[k,__EMBERWILD_MASTERY.masteryLevelFromXp(n)])]),T()?.build()?.permanent.unlocks]):null;
  if(!cache||cache.skillParty!==party||cache.skillProjection!==key){refreshAll();if(cache){cache.skillParty=party;cache.skillProjection=key;}}
  return out;
 };
 const oldSave=save;save=function(...args){refreshAll();return oldSave(...args);};
 globalThis.configureSkill=function(type,slot,id){
  const h=state;if(!h||companion(h)||T()?.plan()?.job===null||!['active','proc','support'].includes(type)||!Number.isInteger(slot)||slot<0||slot>=slotCounts(h)[type])return false;
  const sk=byId.get(id);if(id!==null&&(!sk||sk.type!==type||!learned(h,sk)||(M.adapterFor(sk,h.job).kind==='core'?oldCoreMissing:oldSupportMissing)(h,M.adapterFor(sk,h.job).index,true).length))return false;
  const old=copy(h.skillLoadout);for(const list of Object.values(h.skillLoadout))for(let n=0;n<list.length;n++)if(id!==null&&list[n]===id)list[n]=null;
  h.skillLoadout[type][slot]=id;projectHero(h);
  if(save()===false){h.skillLoadout=old;projectHero(h);T()?.capture();return false;}globalThis.EmberwildBattleConfiguration?.notify();render();return true;
 };
 globalThis.setPassiveSkillEnabled=function(id,enabled){const h=party?.members[0],sk=byId.get(id);if(!h||sk?.type!=='passive'||!learned(h,sk)||typeof enabled!=='boolean')return false;h.passiveEnabled??={};const old=h.passiveEnabled[id],hp=h.hp;h.passiveEnabled[id]=enabled;if(!globalThis.EmberwildBattleConfiguration?.pending())h.hp=Math.min(h.hp,stats(h).hp);if(save()===false){h.hp=hp;if(old===undefined)delete h.passiveEnabled[id];else h.passiveEnabled[id]=old;T()?.capture();return false;}globalThis.EmberwildBattleConfiguration?.notify();render();return true;};
 equipSkill=(i,n)=>configureSkill('active',n,byPosition.get(position(state.job,'core',i))?.id);
 clearActiveSkill=n=>configureSkill('active',n,null);slotProcSkill=(i,n)=>configureSkill('proc',n,i===null?null:byPosition.get(position(state.job,'core',i))?.id);clearProcSkill=n=>configureSkill('proc',n,null);slotSupport=(i,n)=>configureSkill('support',n,i===null?null:byPosition.get(position(state.job,'support',i))?.id);
 socket=()=>false;
 globalThis.__EMBERWILD_SKILLS={system:()=>system,byId:id=>byId.get(id),byPosition:(j,k,i)=>byPosition.get(position(j,k,i)),slotCounts,learned,passiveEnabled:(h,id)=>h?.passiveEnabled?.[id]!==false,grantSkill(h,id){const sk=byId.get(id);if(!sk||!sk.jobs.includes(h.job)||!sk.sources.some(s=>s.type==='quest'))throw Error('任務技能不適用目前職業');h.acquiredSkillIds??=[];if(h.acquiredSkillIds.includes(id))return false;h.acquiredSkillIds.push(id);const a=M.adapterFor(sk,h.job);T().build().permanent.unlocks[`${h.job}:${a.kind}:${a.index}`]=true;refreshHero(h);toast('取得技能：'+sk.name+'；請前往技能頁配置輔助槽');return true;},refreshHero,refreshAll,projectHero,prepare,validCast,worn};
 install(M.normalizeDocument(baseExport()).skillSystem);applyMetadata();
 const source=globalThis.__EMBERWILD_BALANCE_FINAL_APPLY_PENDING?null:JSON.parse(balanceSourceText()||'null');if(source)applyBalanceConfig(source,{persist:false});
 refreshAll();
})();
