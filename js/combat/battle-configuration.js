/* One persisted encounter projection. Only configuration is frozen; vitals,
   rewards and progression continue to belong to the real actors. Each generator
   step restores the editable configuration before yielding to the UI. */
(()=>{
 'use strict';
 const S=__EMBERWILD_SKILLS,copy=EmberwildSkillSystem.copy;
 // tokenId (v0.083): a companion token changed during an encounter applies from the next encounter, like gear.
 const fields=['skills','supportLevels','active','procSlots','supportSlots','skillLoadout','activeSkillEquipmentId','passiveEnabled','equipped','tokenId'];
 // frozenActive (v0.083): the lineup that started the encounter; roster changes during it apply from the next encounter.
 let owner=null,rows=null,active=false,live=null,notified=false,frozenActive=null,liveActive=null;
 const gemEffects=new Map();
 const values=h=>Object.fromEntries(fields.filter(k=>h[k]!==undefined).map(k=>[k,h[k]]));
 function assign(h,v){for(const k of fields){if(Object.hasOwn(v,k))h[k]=v[k];else delete h[k];}}
 // rows is only ever replaced (capture/clear/restore), never edited in place, so lookups
 // are memoised per rows array: combat reads these on every passive and skill check.
 let rowCacheFor=null,rowCache=new WeakMap(),learnedCache=new WeakMap();
 const row=h=>{
  if(owner!==party)return false;if(!rows)return undefined;
  if(rowCacheFor!==rows){rowCacheFor=rows;rowCache=new WeakMap();learnedCache=new WeakMap();}
  if(!h||typeof h!=='object')return rows.find(r=>r.key===memberKey(h));
  if(rowCache.has(h))return rowCache.get(h);
  const found=rows.find(r=>r.key===memberKey(h));rowCache.set(h,found);return found;
 };
 const learnedIds=r=>{let set=learnedCache.get(r);if(!set){set=new Set(r.learned);learnedCache.set(r,set);}return set;};
 const pending=()=>!!(owner===party&&rows&&foes.length&&(foes.some(e=>e.hp>0)||combatRoundProgress||roundIterator));
 function capture(){
  S.refreshAll();owner=party;notified=false;gemEffects.clear();frozenActive=[...party.active];
  rows=heroes().map(h=>({key:memberKey(h),config:copy(values(h)),gear:copy(equipment(h)),learned:S.system().definitions.filter(sk=>S.learned(h,sk)).map(sk=>sk.id)}));
 }
 function editable(fn){
  if(!active)return fn();
  const frozen=new Map(party.members.map(h=>[h,values(h)]));
  const frozenLineup=party.active;active=false;for(const [h,v] of live)assign(h,v);if(liveActive)party.active=liveActive;
  try{return fn();}finally{for(const h of live.keys())live.set(h,values(h));for(const [h,v] of frozen)assign(h,v);if(liveActive){liveActive=party.active;party.active=frozenLineup;}active=true;}
 }
 function combat(fn){
  if(active||!pending())return fn();
  const prior=live;live=new Map(party.members.map(h=>[h,values(h)]));
  for(const h of party.members){const r=row(h);if(r)assign(h,copy(r.config));}
  const priorActive=liveActive;liveActive=null;if(frozenActive){liveActive=party.active;party.active=frozenActive.filter(k=>partyMember(k));}
  active=true;
  try{return fn();}finally{active=false;for(const [h,v] of live)assign(h,v);live=prior;if(liveActive)party.active=liveActive;liveActive=priorActive;}
 }
 function clear(){owner=null;rows=null;notified=false;frozenActive=null;gemEffects.clear();}
 function notify(){if(pending()&&!notified){notified=true;toast('配置已更新，將於下一場戰鬥生效。');}}
 function validate(data,members){
  if(data==null)return;
  if(data.version!==1||!Array.isArray(data.heroes)||data.heroes.length>members.length||new Set(data.heroes.map(r=>r.key)).size!==data.heroes.length)throw Error('戰鬥配置快照無效');
  if(data.active!==undefined&&(!Array.isArray(data.active)||!data.active.length||data.active.length>3||new Set(data.active).size!==data.active.length||data.active.some(k=>!members.some(h=>memberKey(h)===k))))throw Error('戰鬥配置出戰隊員無效');
  for(const r of data.heroes){
   const h=members.find(h=>memberKey(h)===r.key),c=r.config;
   if(!h||!c||Object.keys(c).some(k=>!fields.includes(k))||!Array.isArray(r.gear)||r.gear.length>5||!Array.isArray(r.learned)||new Set(r.learned).size!==r.learned.length||r.learned.some(id=>!S.byId(id)?.jobs.includes(h.job)))throw Error('戰鬥配置角色無效');
   for(const f of ['skills','supportLevels'])if(!Array.isArray(c[f])||c[f].length>64||c[f].some(n=>!Number.isInteger(n)||n<0||n>5))throw Error('戰鬥配置技能無效');
   for(const [f,defs] of [['active',CLASSES[h.job].skills],['procSlots',CLASSES[h.job].skills],['supportSlots',SUPPORT[h.job]]])if(!Array.isArray(c[f])||c[f].length>64||c[f].some(i=>i!==null&&(!Number.isInteger(i)||i<0||!defs[i])))throw Error('戰鬥配置技能槽無效');
   if(!Array.isArray(c.equipped)||c.equipped.length!==5||c.equipped.some(id=>id!==null&&typeof id!=='string')||c.activeSkillEquipmentId!=null&&typeof c.activeSkillEquipmentId!=='string'||c.tokenId!=null&&typeof c.tokenId!=='string'||!c.passiveEnabled||typeof c.passiveEnabled!=='object'||Array.isArray(c.passiveEnabled)||Object.entries(c.passiveEnabled).some(([id,v])=>S.byId(id)?.type!=='passive'||typeof v!=='boolean'))throw Error('戰鬥配置啟用資料無效');
   if(h.companionId===undefined&&(!c.skillLoadout||['active','proc','support'].some(k=>!Array.isArray(c.skillLoadout[k])||c.skillLoadout[k].some(id=>id!==null&&!r.learned.includes(id)))))throw Error('戰鬥配置技能引用無效');
   for(const g of r.gear){if(!g||typeof g.id!=='string'||!Number.isInteger(g.slot)||g.slot<0||g.slot>4||!Array.isArray(g.affix))throw Error('戰鬥配置裝備無效');EmberwildSkillSystem.gear(g,{legacy:true,system:S.system()});}
  }
 }
 globalThis.EmberwildBattleConfiguration={begin:capture,get active(){return active;},has:h=>!!row(h),learned:(h,id)=>{const r=row(h);return !!r&&learnedIds(r).has(id);},pending,notify,editable,combat,
  equipmentEffects(h,read){if(!row(h))return read();if(!gemEffects.has(memberKey(h)))gemEffects.set(memberKey(h),read());return gemEffects.get(memberKey(h));},
  pack:()=>owner===party&&rows?{version:1,heroes:copy(rows),...(frozenActive?{active:[...frozenActive]}:{})}:null,
  validate,restore(data){clear();if(data){validate(data,party.members);owner=party;rows=copy(data.heroes);frozenActive=data.active?[...data.active]:rows.map(r=>r.key).filter(k=>party.active.includes(k));}else if(foes.some(e=>e.hp>0))editable(capture);}
 };
 const liveEquipment=equipment;
 equipment=function(h=state){return active&&row(h)?row(h).gear:liveEquipment(h);};
 const spawn=spawnGroup,reset=resetEncounter;
 spawnGroup=function(...args){return editable(()=>{capture();for(const h of heroes())h.hp=Math.min(h.hp,stats(h).hp);return spawn(...args);});};
 resetEncounter=function(...args){clear();return reset(...args);};
 // These entry points also support manual casts, status ticks and battle details.
 for(const name of ['battleStats','castPartySkill','castSupport','performHeroBasic','performEnemyAction','initiativeOrder','resolveHit','effectTotal','battleView','showBattleActorDetails']){
  const fn=globalThis[name];if(typeof fn==='function')globalThis[name]=function(...args){return combat(()=>fn(...args));};
 }
 for(const name of ['inspect','showUnit']){const fn=EmberwildBattleSummary[name];EmberwildBattleSummary[name]=function(...args){return combat(()=>fn(...args));};}
 const roundBase=pacedRound;
 pacedRound=function(...args){const iterator=roundBase(...args);return {next:v=>combat(()=>iterator.next(v)),return:v=>combat(()=>iterator.return(v)),throw:e=>combat(()=>iterator.throw(e)),[Symbol.iterator](){return this;}};};
 // Saving and progression always see the latest permanent configuration, even
 // when a reward or a checkpoint is produced inside an encounter step.
 for(const name of ['save','packParty','awardXP','render']){
  const fn=globalThis[name];globalThis[name]=function(...args){if(name==='save'&&__EMBERWILD_TEAMS.savingSuppressed())return true;return editable(()=>fn(...args));};
 }
})();
