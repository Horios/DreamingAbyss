/* Region earnings statistics and the 30-minute earnings snapshot used by regional earnings tickets.
   Region = map + difficulty. Nothing here draws random numbers, grants rewards or changes combat.

   Recording
   - Every ordinary encounter in live play (foreground or a background-tab catch-up) is added to the
     region's lifetime online totals: time, battles, wipes, deaths, XP, gold, gold lost, kills by kind and
     monster, items gained, items consumed and gear outcomes. An offline catch-up replay
     (EmberwildOffline.replaying) is not online play and never enters these totals.
   - Quest, BOSS challenge and final-stage fights are excluded; they are not repeatable idle earnings.
   - An encounter is credited when the next encounter spawns in the same region while exploration keeps
     running. Its time is that spawn-to-spawn cycle (fight, recovery and the next spawn), so every rate is
     per real exploration time, not per animation or skill time.
   - Rewards are read while they are granted (awardXP, gold and inventory deltas inside rewardGroupKill,
     gear appended by addGear). Ticket redemptions must never run inside rewardGroupKill of a live
     encounter, so redeemed rewards cannot feed back into these statistics.

   Snapshot (one per region)
   - Consecutive credited encounters with one unchanged configuration form a 30-minute run. A wipe, a
     death, a stop, a map/difficulty change, a configuration change or a gap longer than 10 minutes
     discards the unfinished run: such time is not sustained idle efficiency.
   - A completed run becomes a candidate snapshot. It replaces the stored one only when its earnings are
     higher (XP per hour, then gold per hour).
   - A region without 30 minutes of online records samples the first 30 minutes of an offline replay
     instead (source 'offline'). That replay still settles its full time as before.
   - The snapshot keeps the configuration key, levels, consumed items and active timed boosts, so the
     ticket stage can tell whether it depended on consumables or temporary effects. */
(()=>{
 'use strict';
 const RULES={version:1,sampleMs:30*60*1000,maxGapMs:10*60*1000,maxKeys:400};
 const HOUR=3600000,COUNTS=['kills','monsters','enemies','items','consumed','gear'],NUMBERS=['ms','battles','wipes','deaths','xp','gold','goldLost'];
 let rewarding=null;
 const challenge=()=>!!party.questChallenge||!!party.bossChallenge?.active||typeof isFinalMap==='function'&&isFinalMap(party.map);
 const regionKey=()=>party.map+':'+(party.difficulty||0);
 const add=(map,k,n)=>{if(n)map[k]=(map[k]||0)+n;};
 function empty(){return {ms:0,battles:0,wipes:0,deaths:0,xp:0,gold:0,goldLost:0,kills:{},monsters:{},enemies:{},items:{},consumed:{},gear:{}};}
 function hash(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(36);}
 function boosts(){
  const api=globalThis.EmberwildTimedBoosts;if(!api)return [];
  return [...(party.timedBoosts||[]),...party.members.flatMap(h=>api.ELEMENTAL_TYPES.flatMap(k=>api.buffRows(h[k])))].filter(b=>b.enabled!==false&&b.remainingMs>0).map(b=>String(b.name||b.boostType)).sort();
 }
 // Player-chosen setup that changes combat output (levels are recorded separately): members, class stage, loadouts, gear, auto-potion settings, speed.
 function configuration(){
  const members=heroes().map(h=>[memberKey(h),h.job,!!h.advanced,h.skillLoadout||null,h.passiveEnabled||null,h.activeSkillEquipmentId??null,equipment(h).map(g=>g&&[g.id,g.plus||0,g.skillSockets?.gems||null]),h.autoPotion?[h.autoPotionId,h.autoPotionThresholdPct]:null,h.autoManaPotion?h.autoManaPotionThresholdPct:null]);
  return hash(JSON.stringify([typeof battleRate==='number'?battleRate:1,members]));
 }
 function stock(){
  const h=playerHero(),out={'material:鍛鐵':h.ore,'material:粉塵':h.dust,'item:legacy-potion':h.potions};
  for(let i=0;i<h.gems.length;i++)out['gem:'+i]=h.gems[i];
  for(const k in h.materials)out['material:'+k]=h.materials[k];
  for(const k in h.healingPotions)out['item:'+k]=h.healingPotions[k];
  for(const k in h.consumables)out['item:'+k]=h.consumables[k];
  return out;
 }
 // One key per distinct gear outcome: kind | slot | tier | quality rank | power tier | job | boss item | skill | sockets.
 function gearKey(g){
  const token=!!globalThis.EmberwildTokens?.isToken(g);
  return [token?'token':'gear',g.slot??'',g.tier??'',token?(g.rar??0):gearQualityRank(g),g.powerTier??'',g.job??'',g.boss!==undefined?'boss':'',g.skillId?'skill':'',g.skillSockets?.count||0].join('|');
 }
 // Enough of a defeated enemy to roll its item loot again: catalog id | kind | level | source material.
 const enemyKey=e=>[String(e.monsterId??''),e.kind||'normal',Math.round(Number(e.lv)||1),String(e.mat??'')].join('|');
 const onlineMs=key=>party.idleStatistics?.regions?.[key]?.total.ms||0;
 // Unfinished encounter, uncredited encounter and unfinished 30-minute run live in the save, so a reload
 // from any checkpoint (including mid-replay) continues exactly where the committed state stopped.
 const P=()=>store().progress;
 // 'online' records totals and samples; 'offline' only samples the first 30 minutes of one absence
 // (identified by its offline window) when the region lacks 30 minutes of online records.
 function mode(key){
  if(!party||globalThis.isEmberwildTitleOpen?.())return null;
  if(!globalThis.EmberwildOffline?.replaying)return 'online';
  const window=party.offlineExploration?.offlineWindow?.capAt??null;
  return window!==null&&P().sampledWindow!==window&&onlineMs(key)<RULES.sampleMs?'offline':null;
 }
 function begin(){
  const p=P(),at=Date.now(),key=regionKey(),m=mode(key),window=m==='offline'?party.offlineExploration.offlineWindow.capAt:null;
  if(p.pending&&p.pending.region===key&&p.pending.mode===m&&p.pending.window===window&&running&&at>=p.pending.end&&at-p.pending.end<=RULES.maxGapMs)credit(p.pending,at-p.pending.start);
  else if(p.pending)p.run=null;
  p.pending=null;p.current=null;
  if(!m||!running||!foes.length||challenge()){p.run=null;return;}
  p.current={region:key,mode:m,window,config:configuration(),start:at,end:0,levels:heroes().map(h=>h.lv),boosts:boosts(),stock:stock(),goldAfter:null,...empty()};
 }
 function finish(result){
  const p=P(),e=p.current;p.current=null;if(!e)return;
  e.end=Date.now();e.result=result;e.deaths=activeBattleStat?.deaths?.length||0;
  if(result==='wipe'&&e.goldAfter!==null)e.goldLost=Math.max(0,e.goldAfter-playerHero().gold);
  // Consumption over the whole fight (auto potions), net of anything the fight itself dropped.
  const after=stock();for(const k in e.stock){const used=(e.stock[k]||0)+(e.items[k]||0)-(after[k]||0);if(used>0)add(e.consumed,k,used);}
  delete e.goldAfter;delete e.stock;p.pending=e;
 }
 const merge=(agg,e,cycle)=>{
  agg.ms+=cycle;agg.battles++;if(e.result==='wipe')agg.wipes++;agg.deaths+=e.deaths;agg.xp+=e.xp;agg.gold+=e.gold;agg.goldLost+=e.goldLost;
  for(const field of COUNTS)for(const k in e[field])if(k in agg[field]||Object.keys(agg[field]).length<RULES.maxKeys)add(agg[field],k,e[field][k]);
 };
 const better=(a,b)=>!b||a.xp*b.ms>b.xp*a.ms||a.xp*b.ms===b.xp*a.ms&&a.gold*b.ms>b.gold*a.ms;
 function region(data,key,at){return data.regions[key]??={map:Number(key.split(':')[0]),difficulty:Number(key.split(':')[1]),first:at,last:0,total:empty(),snapshot:null};}
 function sample(e,cycle){
  const p=P();if(e.result==='wipe'||e.deaths){p.run=null;return;}
  let run=p.run;
  if(!run||run.region!==e.region||run.mode!==e.mode||run.window!==e.window||run.config!==e.config)run=p.run={region:e.region,mode:e.mode,window:e.window,config:e.config,start:e.start,levelMin:Math.min(...e.levels),levelMax:Math.max(...e.levels),boosts:[],...empty()};
  merge(run,e,cycle);run.levelMin=Math.min(run.levelMin,...e.levels);run.levelMax=Math.max(run.levelMax,...e.levels);for(const b of e.boosts)if(!run.boosts.includes(b))run.boosts.push(b);
  if(run.ms<RULES.sampleMs)return;
  p.run=null;if(run.mode==='offline')p.sampledWindow=run.window;
  const r=region(store(),run.region,run.start);
  const candidate={id:run.region+'-'+run.start+'-'+run.config,source:run.mode,config:run.config,at:run.start,levelMin:run.levelMin,levelMax:run.levelMax,boosts:[...run.boosts].sort(),...aggregate(run)};
  if(better(candidate,r.snapshot))r.snapshot=candidate;
 }
 function credit(e,cycle){
  sample(e,cycle);if(e.mode!=='online')return;
  const r=region(store(),e.region,e.start);r.last=e.start+cycle;merge(r.total,e,cycle);
 }
 function store(){const x=party.idleStatistics;if(x?.version!==RULES.version||!x.regions||typeof x.regions!=='object'||!x.progress||typeof x.progress!=='object')party.idleStatistics=normalize(x);return party.idleStatistics;}
 const num=(v,min=0,max=1e15)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):0;
 function counts(raw,zero=false){const out={};if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [k,v] of Object.entries(raw).slice(0,RULES.maxKeys)){const n=num(Number(v));if((n||zero&&Number(v)===0)&&k.length<=120)out[k]=n;}return out;}
 function aggregate(raw){const a=empty();if(!raw||typeof raw!=='object')return a;for(const k of NUMBERS)a[k]=num(raw[k]);for(const k of COUNTS)a[k]=counts(raw[k]);return a;}
 function snapshotOf(raw){
  if(!raw||typeof raw!=='object'||!['online','offline'].includes(raw.source)||num(raw.ms)<RULES.sampleMs||typeof raw.config!=='string'||raw.config.length>16||typeof raw.id!=='string'||raw.id.length>80)return null;
  return {id:raw.id,source:raw.source,config:raw.config,at:num(raw.at),levelMin:num(raw.levelMin,1,1e4)||1,levelMax:num(raw.levelMax,1,1e4)||1,boosts:Array.isArray(raw.boosts)?raw.boosts.slice(0,20).map(x=>String(x).slice(0,60)):[],...aggregate(raw)};
 }
 // Transient progress is optional: anything malformed is dropped and only delays the next sample.
 function partOf(raw,kind){
  if(!raw||typeof raw!=='object'||typeof raw.region!=='string'||!/^\d+:[012]$/.test(raw.region)||!['online','offline'].includes(raw.mode)||typeof raw.config!=='string'||raw.config.length>16)return null;
  const out={region:raw.region,mode:raw.mode,window:raw.window==null?null:num(raw.window,0,8.64e15),config:raw.config,start:num(raw.start),...aggregate(raw)};
  if(kind==='run')return {...out,levelMin:num(raw.levelMin,1,1e4)||1,levelMax:num(raw.levelMax,0,1e4),boosts:Array.isArray(raw.boosts)?raw.boosts.slice(0,20).map(x=>String(x).slice(0,60)):[]};
  const extra={end:num(raw.end),levels:Array.isArray(raw.levels)?raw.levels.slice(0,3).map(n=>num(n,1,1e4)||1):[],boosts:Array.isArray(raw.boosts)?raw.boosts.slice(0,20).map(x=>String(x).slice(0,60)):[]};
  if(!extra.levels.length)return null;
  if(kind==='current')return {...out,...extra,stock:counts(raw.stock,true),goldAfter:raw.goldAfter==null?null:num(raw.goldAfter,-1e15,1e15)};
  return {...out,...extra,result:raw.result==='wipe'?'wipe':'victory'};
 }
 function progressOf(raw){raw=raw&&typeof raw==='object'?raw:{};return {current:partOf(raw.current,'current'),pending:partOf(raw.pending,'pending'),run:partOf(raw.run,'run'),sampledWindow:raw.sampledWindow==null?null:num(raw.sampledWindow,0,8.64e15)};}
 function normalize(raw){
  const out={version:RULES.version,regions:{},progress:{current:null,pending:null,run:null,sampledWindow:null}};if(!raw||raw.version!==RULES.version||!raw.regions||typeof raw.regions!=='object')return out;
  out.progress=progressOf(raw.progress);
  for(const [key,r] of Object.entries(raw.regions).slice(0,200)){
   const m=/^(\d+):([012])$/.exec(key);if(!m||!r||typeof r!=='object'||Number(m[1])>=MAPS.length)continue;
   out.regions[key]={map:Number(m[1]),difficulty:Number(m[2]),first:num(r.first),last:num(r.last),total:aggregate(r.total),snapshot:snapshotOf(r.snapshot)};
  }
  return out;
 }
 const perHour=(a)=>{const per=v=>a.ms?v*HOUR/a.ms:0,scale=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,per(v)]));return {battles:per(a.battles),xp:per(a.xp),gold:per(a.gold),goldLost:per(a.goldLost),wipes:per(a.wipes),deaths:per(a.deaths),kills:scale(a.kills),monsters:scale(a.monsters),items:scale(a.items),consumed:scale(a.consumed),gear:scale(a.gear)};};
 // A region's snapshot as one 30-minute ticket worth, plus whether it is calibrated for the current configuration.
 function snapshot(map=party?.map,difficulty=party?.difficulty||0){
  const r=party?.idleStatistics?.regions?.[map+':'+difficulty],s=r?.snapshot;if(!s)return null;
  const scale=RULES.sampleMs/s.ms,round=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v*scale]));
  return {id:s.id,map,difficulty,source:s.source,at:s.at,levelMin:s.levelMin,levelMax:s.levelMax,config:s.config,currentConfiguration:!!party&&party.map===map&&(party.difficulty||0)===difficulty&&configuration()===s.config,
   sustainable:!Object.keys(s.consumed).length&&!s.boosts.length,boosts:[...s.boosts],sampleMs:s.ms,
   perTicket:{ms:RULES.sampleMs,battles:s.battles*scale,xp:s.xp*scale,gold:s.gold*scale,kills:round(s.kills),monsters:round(s.monsters),enemies:round(s.enemies),items:round(s.items),consumed:round(s.consumed),gear:round(s.gear)},perHour:perHour(s)};
 }
 function totals(map=party?.map,difficulty=party?.difficulty||0){const r=party?.idleStatistics?.regions?.[map+':'+difficulty];return r?{map,difficulty,first:r.first,last:r.last,...JSON.parse(JSON.stringify(r.total)),perHour:perHour(r.total)}:null;}

 let loading=false;
 const clear=()=>{if(party&&!loading){const p=P();p.current=p.pending=p.run=null;}};
 const beginBase=beginBattleStatistics;
 beginBattleStatistics=function(...args){const out=beginBase.apply(this,args);try{if(party)begin();}catch(error){try{clear();}catch{}console.warn('地區收益統計失敗',error);}return out;};
 const finalizeBase=finalizeBattleStatistics;
 finalizeBattleStatistics=function(result,...args){
  // Record before the base statistics save, so the same write persists this encounter.
  try{if(party){const p=P();if(p.current&&(result==='victory'||result==='wipe'))finish(result);else{p.current=null;p.run=null;}}}catch(error){try{clear();}catch{}console.warn('地區收益統計失敗',error);}
  return finalizeBase.call(this,result,...args);
 };
 const rewardBase=rewardGroupKill;
 rewardGroupKill=function(e){
  const c=party&&!loading?P().current:null;
  if(!c||!e||e.rewarded)return rewardBase.apply(this,arguments);
  const before=stock(),gold=playerHero().gold,outer=rewarding;rewarding=c;
  try{return rewardBase.apply(this,arguments);}
  finally{
   rewarding=outer;
   if(e.rewarded&&P().current===c){
    c.gold+=Math.max(0,playerHero().gold-gold);c.goldAfter=playerHero().gold;add(c.kills,e.kind||'normal',1);add(c.monsters,String(e.monsterId??e.name??'unknown'),1);add(c.enemies,enemyKey(e),1);
    const after=stock();for(const k in after){const n=(after[k]||0)-(before[k]||0);if(n>0)add(c.items,k,n);}
   }
  }
 };
 const xpBase=awardXP;awardXP=function(amount,...args){if(rewarding)rewarding.xp+=Math.max(0,Math.floor(Number(amount)||0));return xpBase.call(this,amount,...args);};
 const gearBase=addGear;addGear=function(g,...args){const out=gearBase.call(this,g,...args);if(rewarding&&g)add(rewarding.gear,gearKey(g),1);return out;};
 const resetBase=resetEncounter;resetEncounter=function(...args){clear();return resetBase.apply(this,args);};
 const createBase=createParty;createParty=function(...args){const p=createBase.apply(this,args);p.idleStatistics=normalize(null);return p;};
 const validateBase=validateParty;validateParty=function(data){const p=validateBase(data);p.idleStatistics=normalize(data?.idleStatistics);return p;};
 // Loading resets the encounter, but the saved progress belongs to the saved combat cursor: keep it.
 const loadBase=loadParty;loadParty=function(...args){loading=true;try{return loadBase.apply(this,args);}finally{loading=false;}};
 globalThis.EmberwildIdleStatistics={RULES,normalize,snapshot,totals,gearKey,configuration,get sampling(){const r=party?.idleStatistics?.progress?.run;return r?{mode:r.mode,ms:r.ms}:null;}};
})();
