/* One event timeline for visible play, background throttling and cold saves.
   Party, combat cursor and pending receipt are committed by one KEY setItem. */
(()=>{
 'use strict';
 const copy=v=>v==null?v:JSON.parse(JSON.stringify(v)),api=EmberwildTimedBoosts;
 const hooks=()=>[EmberwildControlCombatState,EmberwildEnemyCombatState,EmberwildStatusCombatState,EmberwildTokenCombatState];
 const transient=['eventPassiveCooldowns','hp','mp','shield','basicAdvanceRound','procAdvanceRound','procAdvanceSteps','nextActiveDamageBonus','healPotionCooldownRemaining','manaPotionCooldownRemaining'];
 let internal=false,stepping=false,job=null,failed=false,restoring=false,lastMode=false,actionSerial=0,lastRendered=0,presentation=null,gearPage=0,lastCheck=0,lastHeartbeat=0,requestedAt=0,renderedReceipt=null,jobOffline=false,lastCommitted=globalThis.__EMBERWILD_BOOT_SAVE_RAW||null;
 // Profiling: full saves dominated replay (about 23ms each on an 8h debt).
 // One wall-clock second of work amortizes serialization while bounding replay
 // lost on close. Only commit()/successful save moves the durable checkpoint.
 const checkpointIntervalMs=1000,maxOfflineMs=24*60*60*1000;
 let settlementProgress=null,bootResumePending=!!globalThis.__EMBERWILD_BOOT_SAVE_RAW;
 const atTitle=()=>!!globalThis.isEmberwildTitleOpen?.();
 const nowReal=Date.now.bind(Date),basePack=packParty,baseSave=save,baseLoad=loadParty,baseValidate=validateParty;
 const active=()=>!!party&&running&&!$('modal')?.open&&!globalThis.isEmberwildTitleOpen?.();
 const clock=()=>party?.offlineExploration;
 function fresh(){return {version:globalThis.EmberwildSecondsCombat?.active?3:2,startedAt:nowReal(),lastAt:nowReal(),status:'stopped',nextAt:0,roundAt:0,combat:null,receipt:null,pendingReceipt:null};}
 function migrate(c){
  if(c.version===1){
   if(c.receipt?.complete){c.status=c.resumeRunning?'running':c.status==='paused'?'paused':'stopped';c.receipt.legacy=true;}
   else if(c.receipt){c.pendingReceipt=c.receipt;c.receipt=null;}
   delete c.resumeRunning;c.version=2;
  }
  // Earlier versions could save a visible but empty completed receipt.
  if(c.receipt?.complete&&!hasRewards(c.receipt))c.receipt=null;
  c.pendingReceipt??=null;if(c.pendingReceipt)c.pendingReceipt.battles??=0;
  return c;
 }
 function ensure(){if(party&&!party.offlineExploration)party.offlineExploration=fresh();return clock()?migrate(clock()):null;}
 function snapshot(){return copy({seconds:globalThis.EmberwildSecondsCombat?.pack()??null,configuration:globalThis.EmberwildBattleConfiguration?.pack()??null,foes,enemyId:enemy?.id,round,partyClock,effects,actorCooldowns,supportCooldowns,progress:combatRoundProgress,activeBattleStat,questChallenge:party.questChallenge||null,states:hooks().map(h=>h.pack()),heroes:party.members.map(h=>Object.fromEntries(transient.filter(k=>h[k]!==undefined).map(k=>[k,h[k]])))});}
 function hydrate(c){
  migrate(c);
  roundIterator=null;nextActionAt=c.nextAt;roundStartedAt=c.roundAt;
  running=c.status==='running';lastMode=running;
  const b=c.combat;if(!b){globalThis.EmberwildBattleConfiguration?.restore(null);if(c.version!==3&&globalThis.EmberwildSecondsCombat?.active)EmberwildSecondsCombat.migrateLegacy();return;}
  foes=copy(b.foes);enemy=foes.find(e=>e.id===b.enemyId)||null;round=b.round;partyClock=b.partyClock;effects=copy(b.effects);
  actorCooldowns=copy(b.actorCooldowns);supportCooldowns=copy(b.supportCooldowns);combatRoundProgress=copy(b.progress);activeBattleStat=copy(b.activeBattleStat);party.questChallenge=copy(b.questChallenge);
  hooks().forEach((h,i)=>h.restore(copy(b.states[i])));
  party.members.forEach((h,i)=>{for(const k of transient){if(b.heroes[i]?.[k]===undefined)delete h[k];else h[k]=b.heroes[i][k];}});
  globalThis.EmberwildBattleConfiguration?.restore(b.configuration);
  running=c.status==='running';lastMode=running;
  if(globalThis.EmberwildSecondsCombat?.active){if(b.seconds)EmberwildSecondsCombat.restore(b.seconds);else EmberwildSecondsCombat.migrateLegacy();c.version=3;}
 }
 function validateCombat(b,members){
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),count=n=>Number.isSafeInteger(n)&&n>=0;
  const counters=v=>object(v)&&Object.values(v).every(n=>Number.isFinite(n)&&n>=0);
  const ids=new Set(b.foes.map(e=>e.id)),heroIds=new Set(members.map(h=>'hero-'+memberKey(h)));
  if(ids.size!==b.foes.length||!counters(b.actorCooldowns)||!counters(b.supportCooldowns)||b.effects.some(e=>!object(e)||typeof e.target!=='string'||typeof e.kind!=='string'||!Number.isFinite(e.value)||!Number.isFinite(e.until)))throw Error('離線戰鬥狀態無效');
  const [control,enemies,status,tokens]=b.states;
  if(!object(control)||!object(control.states)||!Array.isArray(control.summons)||control.summons.some(v=>!object(v))||!object(enemies)||Object.values(enemies).some(v=>!counters(v))||!object(status)||!Array.isArray(status.active)||status.active.some(v=>!object(v))||!Number.isSafeInteger(status.clock)||status.clock< -1||!count(status.serial)||!Array.isArray(tokens)||tokens.some(row=>!Array.isArray(row)||row.length!==2||!['number','string'].includes(typeof row[0])||!object(row[1])))throw Error('離線戰鬥效果快照無效');
  if(b.activeBattleStat&&(!object(b.activeBattleStat)||!Array.isArray(b.activeBattleStat.deaths)||!counters(b.activeBattleStat.drops)||!Number.isFinite(b.activeBattleStat.xp)||b.activeBattleStat.xp<0))throw Error('離線戰鬥統計無效');
  const p=b.progress;if(!p)return;
  if(p.order.some(ref=>!object(ref)||!['hero','enemy'].includes(ref.side)||typeof ref.id!=='string'||!(ref.side==='hero'?heroIds:ids).has(ref.id)))throw Error('離線回合角色引用無效');
  if(p.unit){const ref=p.order[p.index],h=ref?.side==='hero'?members.find(h=>'hero-'+memberKey(h)===ref.id):null,u=p.unit;
   if(!h||!object(u)||!Array.isArray(u.support)||!Array.isArray(u.active)||!count(u.index)||u.index>u.support.length||u.support.some(i=>!count(i)||!SUPPORT[h.job]?.[i])||u.active.some(i=>!count(i)||!CLASSES[h.job]?.skills[i]))throw Error('離線回合技能游標無效');
  }
 }
 function validate(raw,members=[]){
  if(raw===undefined)return null;
  const c=copy(raw),validTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=8.64e15;
  if(![1,2,3].includes(c.version)||!validTime(c.lastAt)||!validTime(c.startedAt)||!['running','paused','stopped'].includes(c.status)||![c.nextAt,c.roundAt].every(n=>Number.isFinite(n)&&n>=0))throw Error('離線探索時間或狀態無效');
  if(c.offlineWindow!=null&&(!validTime(c.offlineWindow.capAt)||!validTime(c.offlineWindow.untilAt)))throw Error('離線結算上限資料無效');
  if(c.combat){const b=c.combat;if(!Array.isArray(b.foes)||!Array.isArray(b.states)||b.states.length!==4||!Array.isArray(b.heroes)||!Array.isArray(b.effects)||!Number.isSafeInteger(b.round)||!(c.version===3?Number.isFinite(b.partyClock)&&b.partyClock>=0:Number.isSafeInteger(b.partyClock)))throw Error('離線戰鬥進度無效');
   if(b.seconds)globalThis.EmberwildSecondsCombat?.validateSnapshot(b.seconds);
   if(b.heroes.length!==members.length||b.heroes.some(h=>!Number.isFinite(h.hp)||h.hp<0||!Number.isFinite(h.shield)||h.shield<0)||b.foes.some(e=>!e||typeof e.id!=='string'||!Number.isFinite(e.hp)||e.hp<0||!Number.isFinite(e.maxhp)||e.maxhp<=0))throw Error('離線戰鬥角色資料無效');
   if(b.questChallenge&&(typeof b.questChallenge.key!=='string'||typeof b.questChallenge.name!=='string'||!Number.isInteger(b.questChallenge.mapIndex)))throw Error('離線任務關卡無效');
   if(b.progress&&(!Array.isArray(b.progress.order)||!Number.isInteger(b.progress.index)||b.progress.index<0||b.progress.index>b.progress.order.length))throw Error('離線回合游標無效');
   validateCombat(b,members);globalThis.EmberwildBattleConfiguration?.validate(b.configuration,members);
  }
  for(const r of [c.receipt,c.pendingReceipt].filter(Boolean)){if(!validTime(r.start)||!validTime(r.end)||r.end<r.start||typeof r.id!=='string'||typeof r.complete!=='boolean'||!Array.isArray(r.levels)||!Array.isArray(r.gear)||!r.items||!r.boosts||![r.effectiveMs,r.kills,r.xp,r.goldGained,r.goldSpent].every(n=>Number.isFinite(n)&&n>=0))throw Error('離線收益紀錄無效');
   if(c.version===2&&((r===c.receipt&&!r.complete)||(r===c.pendingReceipt&&r.complete)))throw Error('離線收益紀錄狀態無效');
   if(r.battles!==undefined&&(!Number.isSafeInteger(r.battles)||r.battles<0))throw Error('離線戰鬥完成數無效');
   if(r.intervals!==undefined&&(!Array.isArray(r.intervals)||r.intervals.some((x,i)=>!validTime(x.start)||!validTime(x.end)||x.end<x.start||i>0&&x.start<r.intervals[i-1].end)))throw Error('離線收益時間區間無效');
  }
  function finite(v){if(typeof v==='number'&&!Number.isFinite(v))throw Error('離線存檔包含無效數值');if(v&&typeof v==='object')for(const x of Object.values(v))finite(x);}finite(c);
  return migrate(c);
 }
 validateParty=function(raw){const c=validate(raw?.offlineExploration,raw?.members),p=baseValidate(raw);if(c)p.offlineExploration=c;return p;};
 loadParty=function(raw){
  if(job&&!restoring)throw Error('離線結算進行中，請完成後再讀取存檔');
  restoring=true;try{const out=baseLoad(raw);const c=ensure();hydrate(c);failed=false;lastCheck=nowReal();renderedReceipt=null;return out;}finally{restoring=false;}
 };
 packParty=function(){
  const c=ensure();if(c&&!restoring){c.buffDeadlines=buffs().map(b=>({name:b.name,expiresAt:c.lastAt+b.remainingMs,enabled:b.enabled}));c.status=running?'running':foes.length?'paused':'stopped';c.nextAt=c.status==='stopped'?0:nextActionAt;c.roundAt=c.status==='stopped'?0:roundStartedAt;c.combat=c.status==='stopped'?null:snapshot();}
  const out=basePack();if(c)out.offlineExploration=copy(c);return out;
 };
 save=function(...args){
  if(stepping||restoring)return true;
  if(!internal){sync();if(job)return true;}
  if(failed||globalThis.__EMBERWILD_SAVE_OWNER===false)return false;
  // Never move lastAt just because a save ran: it represents settled events only.
  const saved=baseSave(...args);if(saved===true&&typeof globalThis.__EMBERWILD_BOOT_SAVE_RAW==='string')lastCommitted=globalThis.__EMBERWILD_BOOT_SAVE_RAW;return saved;
 };
 function virtual(at,fn){const prev=Date.now;Date.now=()=>at;try{return fn();}finally{Date.now=prev;}}
 function quiet(fn){
  // Keep the modal DOM contract (dataset/classList) for boss reward cleanup,
  // while leaving replay dialogs detached and unable to pause the event loop.
  const originals={render,note,toast,refreshGlobalJournal,GS},fake=document.createElement('dialog');
  fake.showModal=()=>{};fake.close=()=>{};
  globalThis.__EMBERWILD_OFFLINE_SILENT=true;globalThis.__EMBERWILD_OFFLINE_RULE_CACHE=jobOffline?(replayCache??={}):{};render=()=>{};toast=()=>{};refreshGlobalJournal=()=>{};
  if(jobOffline){
   const settings=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE.settings??=new Map();
   GS=(path,fallback)=>{if(!settings.has(path))settings.set(path,originals.GS(path,undefined));const value=settings.get(path);return value===undefined?fallback:value;};
  }
  // Live ticks use this same event loop; only offline replay suppresses reports.
  if(jobOffline)note=()=>{};
  globalThis.__EMBERWILD_SIMULATION_MODAL=fake;
  try{return fn();}finally{({render,note,toast,refreshGlobalJournal,GS}=originals);globalThis.__EMBERWILD_SIMULATION_MODAL=null;globalThis.__EMBERWILD_OFFLINE_RULE_CACHE=null;globalThis.__EMBERWILD_OFFLINE_SILENT=false;}
 }
 function buffs(){return [...(party?.timedBoosts||[]),...party.members.flatMap(h=>api.ELEMENTAL_TYPES.flatMap(k=>api.buffRows(h[k])))];}
 function receipt(start,end){const p=playerHero();return {id:String(start)+'-'+String(end)+'-'+String(p.created),start,end,map:MAPS[party.map]?.name||'',stage:party.questChallenge?.name||(party.bossChallenge?.active?'BOSS 難關':'一般探索'),intervals:[],battles:0,effectiveMs:0,kills:0,xp:0,goldGained:0,goldSpent:0,items:{},consumed:{},gear:[],boosts:{},levels:party.members.map(h=>({key:memberKey(h),name:characterName(h),before:h.lv,after:h.lv})),complete:false,reason:'',stoppedAt:null};}
 // Scratch buffers belong to one synchronous advance batch, never to the save.
 function stock(out={}){
  const h=playerHero();for(const k in out)out[k]=0;
  out['material:鍛鐵']=h.ore;out['material:粉塵']=h.dust;out['item:legacy-potion']=h.potions;
  for(let i=0;i<h.gems.length;i++)out['gem:'+i]=h.gems[i];
  for(const k in h.materials)out['material:'+k]=h.materials[k];
  for(const k in h.healingPotions)out['item:'+k]=h.healingPotions[k];
  for(const k in h.consumables)out['item:'+k]=h.consumables[k];
  return out;
 }
 function captureResources(before){
  const r=clock()?.pendingReceipt;if(!r||r.complete)return null;
  const t=performance.now(),h=playerHero();before??={items:{},after:{}};before.gold=h.gold;before.gained=r.goldGained;
  stock(before.items);before.bag=h.bag;before.length=h.bag.length;if(metrics)metrics.inventoryMs+=performance.now()-t;return before;
 }
 function collect(before){
  const r=clock()?.pendingReceipt;if(!before||!r||r.complete)return;
  const t=performance.now(),h=playerHero(),delta=h.gold-before.gold-(r.goldGained-before.gained);r.goldGained+=Math.max(0,delta);r.goldSpent+=Math.max(0,-delta);
  const after=stock(before.after);
  for(const k in before.items){const n=(after[k]||0)-(before.items[k]||0);if(n>0)r.items[k]=(r.items[k]||0)+n;else if(n<0){r.consumed??={};r.consumed[k]=(r.consumed[k]||0)-n;if(analysis){analysis.bad=true;analysis.ready=false;}}}
  for(const k in after)if(!(k in before.items)&&after[k]>0)r.items[k]=(r.items[k]||0)+after[k];
  // Combat only appends through addGear (equipment and tokens). UI disposal is
  // blocked while replaying. Inspect just the appended tail, preserving order.
  // Retain ID comparison if a future event replaces the bag array.
  if(h.bag===before.bag){for(let i=before.length;i<h.bag.length;i++)r.gear.push(copy(h.bag[i]));}
  else {const ids=new Set(before.bag.map(g=>g.id));for(const g of h.bag)if(!ids.has(g.id))r.gear.push(copy(g));}
  for(const l of r.levels)l.after=partyMember(l.key)?.lv??l.after;if(metrics)metrics.inventoryMs+=performance.now()-t;
 }
 const award=awardXP;
 awardXP=function(...args){const h=playerHero(),level=h?.lv,xp=h?.xp,out=award(...args),r=clock()?.pendingReceipt;if(stepping&&jobOffline&&r&&!r.complete&&h){let gained=h.xp-xp;for(let lv=level;lv<h.lv;lv++)gained+=need(lv);r.xp+=Math.max(0,gained);}return out;};
 const reward=rewardGroupKill;
 rewardGroupKill=function(e){const started=performance.now(),eligible=e&&!e.rewarded,before=playerHero()?.gold||0,out=reward(e),r=clock()?.pendingReceipt;if(stepping&&jobOffline&&metrics)metrics.dropMs+=performance.now()-started;if(stepping&&jobOffline&&eligible&&e.rewarded&&r&&!r.complete){if(analysis){const k=e.monsterId+':'+e.kind;analysis.monsters[k]=(analysis.monsters[k]||0)+1;}r.kills++;r.goldGained+=Math.max(0,playerHero().gold-before);}return out;};
 const finalize=finalizeBattleStatistics;
 finalizeBattleStatistics=function(result){
  const finished=!!activeBattleStat&&(result==='victory'||result==='wipe'),deaths=activeBattleStat?.deaths?.length||0,out=finalize(result),r=clock()?.pendingReceipt;
  if(stepping&&jobOffline&&analysis){if(result==='wipe'||deaths){analysis.deaths+=deaths;analysis.bad=true;analysis.ready=false;if(observed)observed.bad=true;}if(finished&&observed)observed.finished=true;}
  if(stepping&&jobOffline&&finished&&r){r.battles++;r.lastBattleAt=Date.now();}return out;
 };
 function hasRewards(r){return !!r&&(r.kills>0||r.xp>0||r.goldGained>0||r.gear.length>0||Object.values(r.items).some(n=>n>0));}
 function eligible(r){return hasRewards(r)&&(r.battles>0||r.legacy===true);}
 // An interrupted replay keeps its original 24-hour window in the saved cursor.
 function ensureOfflineWindow(c,target){
  if(!c.offlineWindow||c.lastAt>=c.offlineWindow.untilAt)c.offlineWindow={capAt:Math.min(8.64e15,c.lastAt+maxOfflineMs),untilAt:target};
  else c.offlineWindow.untilAt=Math.max(c.offlineWindow.untilAt,target);
 }
 function track(target){
  const c=ensure();if(!c.pendingReceipt&&lastMode&&target>c.lastAt)c.pendingReceipt=receipt(c.lastAt,target);
 }
 function recordInterval(r,start,end){
  if(!r||end<=start)return;r.intervals??=[{start:r.start,end:Math.min(start,r.end)}];
  const tail=r.intervals.at(-1);if(tail&&tail.end===start)tail.end=end;else r.intervals.push({start,end});
 }
 function promote(){
  const c=clock(),r=c?.pendingReceipt;if(c&&!c.receipt&&eligible(r)){r.complete=true;c.receipt=r;c.pendingReceipt=null;gearPage=0;}
 }
 function consumeTo(at,combatActive){
  const c=clock(),elapsed=at-c.lastAt;if(elapsed<=0)return;
  const r=c.pendingReceipt,rows=buffs(),disabled=rows.filter(b=>!b.enabled);
  if(jobOffline&&r&&!r.complete&&combatActive){r.effectiveMs+=elapsed;for(const b of rows.filter(b=>b.enabled&&b.remainingMs>0)){
   const key=api.sourceKey(b);const entry=r.boosts[key]??={name:b.name,effect:b.boostType==='exp'?'經驗＋'+b.bonusPercent+'%':b.boostType==='drop'?'掉寶＋'+b.bonusPercent+'%':'屬性藥水',ms:0};entry.ms+=Math.min(elapsed,b.remainingMs);
  }}
  if(combatActive)party.combatSession.idleTimeMs+=elapsed;
  api.consume(party,elapsed);
  // Disabled effects also retain their actual wall-clock deadline.
  for(const b of disabled)b.remainingMs=Math.max(0,b.remainingMs-elapsed);
  if(jobOffline&&r&&!r.complete)r.end=at;
  c.lastAt=at;
  virtual(at,()=>__EMBERWILD_TIMED_BOOST_TEST.expireBoosts(at));
 }
 function event(at){
  actionSerial++;stepping=true;
  const visual=!jobOffline?globalThis.EmberwildBattleEffects:null;visual?.begin();
  try{virtual(at,()=>{
   if(globalThis.EmberwildSecondsCombat?.active){
    roundIterator=null;combatRoundProgress=null;const result=EmberwildSecondsCombat.step();
    const actionMs=Math.max(1,Math.round(result.delaySeconds*1000/battleRate));nextActionAt=at+actionMs;
    if(!jobOffline&&!document.hidden)presentation={intervalMs:actionMs,nextAt:nextActionAt,owner:party};
    return;
   }
   if(!roundIterator){globalThis.__EMBERWILD_RESUMING_ROUND=!!combatRoundProgress;roundIterator=pacedRound();if(!combatRoundProgress)roundStartedAt=at;}
   let result;try{
    result=roundIterator.next();
    // A yield is one complete action (including its procs/counters). Close a
    // terminal fight or exhausted round cursor now: its cleanup has no further
    // independent actor to display. Keep the minimum for ongoing rounds below.
    const p=combatRoundProgress;
    if(!result.done&&(!living().length||!foes.some(e=>e.hp>0)||p&&!p.unit&&p.index>=p.order.length))result=roundIterator.next();
   }finally{globalThis.__EMBERWILD_RESUMING_ROUND=false;}
   const actionMs=Math.max(1,Math.round(GS('combat.pacing.actionIntervalMs',1500)/battleRate)),roundMs=Math.max(actionMs,Math.round(GS('combat.pacing.roundMinimumMs',6000)/battleRate));
   if(result.done){
    roundIterator=null;
    // A completed combat round consumes its configured minimum duration even
    // when the last action defeats every foe. Otherwise short AoE victories
    // repeatedly skip that time during cold offline replay. An encounter
    // spawn (round===0) still uses only the regular action interval.
    const completedRound=round>0&&running;
    nextActionAt=completedRound?Math.max(at+actionMs,roundStartedAt+roundMs):at+actionMs;
   }else nextActionAt=at+actionMs;
   if(!jobOffline&&!document.hidden)presentation={intervalMs:actionMs,nextAt:nextActionAt,owner:party};
  });}finally{stepping=false;visual?.end();}
 }
 // Fast replay learns combat cost only. Every new encounter and every reward is
 // still generated by spawnGroup/rewardGroupKill, never copied from sample loot.
 const HOUR=3600000;
 let analysis=null,observed=null,metrics=null,replayCache=null,modelSeed=0;
 function sampleRandom(){modelSeed=(Math.imul(modelSeed,1664525)+1013904223)>>>0;return modelSeed/4294967296;}
 function fastReason(reason){if(metrics)metrics.fallbacks[reason]=(metrics.fallbacks[reason]||0)+1;return false;}
 function combatKey(){return JSON.stringify([party.map,party.difficulty,party.active,battleRate,party.members.map(h=>[memberKey(h),h.lv,h.job,h.advanced,h.stats,h.skills,h.active,h.procSlots,h.supportSlots,h.activeSkillEquipmentId,h.passiveEnabled,equipment(h),stats(h)]),buffs().filter(b=>b.enabled&&b.remainingMs>0).map(b=>[b.name,b.boostType,b.bonusPercent,b.effectPercent])]);}
 function simpleCombat(){
  if(globalThis.EmberwildSecondsCombat?.active)return 'seconds-event-model';
  if(party.questChallenge||party.bossChallenge?.active||isFinalMap(party.map))return 'special-stage';
  // Bosses and custom skills can carry phase, status or progression dependencies.
  if((worldMapConfig(party.map)?.bossChance||0)>0)return 'boss-map';
  if(heroes().length!==1||heroes()[0]!==playerHero())return 'party-mechanism';
  const h=playerHero();
  if(h.hp<=0||h.mp!==undefined)return 'unsupported-resource';
  if(h.tokenId||h.procSlots.some(x=>x!==null)||h.supportSlots.some(x=>x!==null)||h.activeSkillEquipmentId)return 'special-skill';
  const simpleSkill=i=>{const sk=CLASSES[h.job].skills[i],m=sk?.[6];return /^class\d+-initial\d+$/.test(m?.id||'')&&['damage','tauntRage','shield','heal'].includes(sk[5])&&!m.onHitStatusId&&!m.statusId&&(!m.systemEffect||['taunt','guard','regen','slow'].includes(m.systemEffect))&&(m.commonEffectKeys||[]).every(k=>['target','hitCount'].includes(k));};
  if(h.active.some(i=>i!==null&&!simpleSkill(i)))return 'special-skill';
  if(equipment(h).some(g=>itemForm(g)?.fixedEffects?.some(x=>['basicAdvanceNextRound'].includes(x.key))))return 'special-equipment';
  if(api.ELEMENTAL_TYPES.some(k=>api.buffRows(h[k]).some(b=>b.remainingMs>0)))return 'elemental-supply';
  const rows=monsterCatalog().filter(m=>m.mapIndex===party.map&&m.enabled!==false&&m.kind==='normal');
  if(rows.some(m=>m.skillAssignments?.length))return 'enemy-skill';
  return '';
 }
 function totals(){const r=clock()?.pendingReceipt;return {battles:r?.battles||0,kills:r?.kills||0,xp:r?.xp||0,gold:r?.goldGained||0,potions:copy(r?.consumed||{}),deaths:analysis?.deaths||0,hp:party.members.map(h=>h.hp)};}
 function resetAnalysis(at,key=combatKey()){
  analysis={start:at,key,next:at+HOUR,before:{...totals(),deaths:0},deaths:0,minimumHpRatio:1,hours:[],profiles:new Map(),monsters:{},bad:false,ready:false,verdict:false};observed=null;
 }
 function checkHours(at){
  if(!analysis||at<analysis.next||analysis.hours.length>=3)return;
  const t=totals(),b=analysis.before;
  const row={battles:t.battles-b.battles,kills:t.kills-b.kills,xp:t.xp-b.xp,gold:t.gold-b.gold,averageMs:0,hpNet:t.hp.map((n,i)=>n-b.hp[i]),potions:{},deaths:0,monsters:analysis.monsters,key:analysis.key};
  row.averageMs=row.battles?HOUR/row.battles:0;
  for(const k in t.potions)if((t.potions[k]||0)>(b.potions[k]||0))row.potions[k]=t.potions[k]-(b.potions[k]||0);
  row.deaths=analysis.deaths-b.deaths;row.minimumHpRatio=analysis.minimumHpRatio;analysis.minimumHpRatio=1;analysis.hours.push(row);analysis.monsters={};analysis.before=t;analysis.next+=HOUR;
  if(analysis.hours.length<3)return;
  const hs=analysis.hours,stable=k=>{const avg=hs.reduce((n,h)=>n+h[k],0)/3;return avg>0&&hs.every(h=>Math.abs(h[k]-avg)/avg<=.05);};
  const enough=hs.every(h=>h.battles>=30&&h.kills>=100),keys=new Set(hs.flatMap(h=>Object.keys(h.monsters)));
  let distribution=true;
  for(const k of keys){const share=hs.reduce((n,h)=>n+(h.monsters[k]||0),0)/hs.reduce((n,h)=>n+h.kills,0);if(share<.02){distribution=false;break;}if(hs.some(h=>(h.monsters[k]||0)<5||Math.abs((h.monsters[k]||0)/h.kills-share)>.05))distribution=false;}
  analysis.ready=enough&&!analysis.bad&&hs.every(h=>!Object.keys(h.potions).length)&&stable('kills')&&stable('battles')&&(stable('xp')||hs.every(h=>!h.xp))&&(stable('gold')||hs.every(h=>!h.gold))&&distribution;
  analysis.verdict=true;metrics.hours=copy(hs);if(!analysis.ready)fastReason(!enough?'insufficient-hour-samples':analysis.bad?'unsafe-resources':'unstable-hours');
 }
 const spawnForOffline=spawnGroup;
 spawnGroup=function(...args){
  const out=spawnForOffline(...args);
  if(stepping&&jobOffline&&analysis){
   const key=combatKey();if(key!==analysis.key){fastReason('combat-state-change');resetAnalysis(Date.now(),key);}
   observed={at:Date.now(),clock:partyClock,key:foes.length+':'+foes.filter(e=>e.kind==='elite').length,hp:foes.reduce((n,e)=>n+e.maxhp,0),mastery:copy(playerHero().mastery||{}),minHp:1,bad:false,finished:false};
  }
  return out;
 };
 function sampleAfterEvent(){
  if(!analysis||!observed)return;
  const h=playerHero();observed.minHp=Math.min(observed.minHp,h.hp/stats(h).hp);analysis.minimumHpRatio=Math.min(analysis.minimumHpRatio,observed.minHp);
  if(h.hp<=0||observed.minHp<.8||activeBattleStat?.deaths.length){observed.bad=true;analysis.bad=true;analysis.ready=false;}
  if(!observed.finished)return;
  const key=combatKey();if(key!==analysis.key){fastReason('combat-state-change');resetAnalysis(clock().lastAt,key);return;}
  const duration=nextActionAt-observed.at;
  if(duration>0&&!observed.bad){
   const p=analysis.profiles.get(observed.key)||{count:0,rows:[],min:Infinity,max:0};p.count++;p.min=Math.min(p.min,observed.hp);p.max=Math.max(p.max,observed.hp);
   const sample={duration,rounds:partyClock-observed.clock,mastery:Object.fromEntries(Object.entries(h.mastery||{}).map(([k,n])=>[k,n-(observed.mastery[k]||0)])),hero:Object.fromEntries(transient.filter(k=>h[k]!==undefined).map(k=>[k,h[k]]))};
   // Reservoir sampling bounds scratch memory and does not favour early battles.
   if(p.rows.length<128)p.rows.push(sample);else {const i=Math.floor(sampleRandom()*p.count);if(i<128)p.rows[i]=sample;}
   analysis.profiles.set(observed.key,p);
  }
  observed=null;
 }
 function tryFast(target){
  if(!analysis?.ready||!observed||roundIterator||round!==0||combatRoundProgress||!running)return false;
  const reason=simpleCombat();if(reason)return fastReason(reason);
  if(combatKey()!==analysis.key){fastReason('combat-state-change');resetAnalysis(clock().lastAt);return false;}
  if(foes.some(e=>!['normal','elite'].includes(e.kind)||e.evasion>0||e.lifesteal>0))return fastReason('special-enemy');
  const p=analysis.profiles.get(observed.key);if(!p||p.count<8||observed.hp<p.min||observed.hp>p.max)return fastReason('unrepresented-encounter');
  const mean=p.rows.reduce((n,x)=>n+x.duration,0)/p.rows.length,cv=Math.sqrt(p.rows.reduce((n,x)=>n+(x.duration-mean)**2,0)/p.rows.length)/mean;
  if(cv>.3)return fastReason('variable-combat-duration');
  const sample=p.rows[Math.floor(sampleRandom()*p.rows.length)],c=clock(),end=observed.at+sample.duration;
  const expiry=Math.min(...buffs().filter(b=>b.remainingMs>0).map(b=>c.lastAt+b.remainingMs),Infinity);
  if(end>=expiry||end>Math.min(target,c.lastAt+HOUR))return fastReason('time-boundary');
  const h=playerHero(),xp=foes.reduce((n,e)=>n+EmberwildProgression.xpShare(EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,e.lv,e.kind,e.difficulty||0,h.lv),heroes().length)*(1+api.bonus(party,'exp')/100),0);
  if(h.lv<levelCap(h)&&h.xp+(h.xpFraction||0)+xp>=need(h.lv))return fastReason('level-boundary');
  // Require a large HP reserve even with twice the longest sampled battle,
  // no evasion, healing, shield or beneficial status. Special attacks are excluded.
  const v=stats(h),formula=GAMEPLAY_SETTINGS.combat.damageFormula||{},maxRounds=Math.max(...p.rows.map(x=>x.rounds))*2;
  const damage=foes.reduce((n,e)=>n+Math.ceil(Math.max(formula.minimumDamage??1,e.atk*(formula.attackCoefficient??1)*(1+Math.max(0,e.lv-h.lv)*GAMEPLAY_SETTINGS.combat.levelGapDamagePerLevel)-Math.max(0,v.def*(1-Math.min(.95,e.defenseIgnore||0))-(e.pierce||0))*(formula.defenseCoefficient??GAMEPLAY_SETTINGS.combat.defenseEffectiveness))*(e.crit>0?Math.max(1,e.critDamage||1.5):1)*Math.max(1,1+(e.elementBonus||0)+(e.elementDamage?.[e.element]||0))*Math.max(1,1-(v.resist?.[e.element]||0))),0)*maxRounds;
  if(h.hp<v.hp*.99||damage>h.hp*.5)return fastReason('hp-reserve');
  if(h.autoPotion&&(healPotionCount(h.autoPotionId)>0||h.potions>0)&&h.hp-damage<=v.hp*(h.autoPotionThresholdPct??35)/100)return fastReason('potion-threshold');
  // No full save per encounter. A failed fast mutation restores the existing
  // atomic checkpoint and resumes in full mode; no partial rewards are committed.
  const t=performance.now();stepping=true;
  try{virtual(end,()=>{
   consumeTo(end,true);partyClock+=sample.rounds;round=sample.rounds;
   for(const e of foes)e.hp=0;globalThis.EmberwildBattleSummary?.finish('victory');
   metrics.phase='正在生成掉落物品';
   for(const e of foes)rewardGroupKill(e);
   for(const [k,n] of Object.entries(sample.mastery))if(n>0)__EMBERWILD_MASTERY.gainMastery(h,k,n);
   refillParty();for(const [k,n] of Object.entries(sample.hero))if(!['hp','shield'].includes(k))h[k]=n;
   combatRoundProgress=null;roundIterator=null;nextActionAt=end;roundStartedAt=end;
   finalizeBattleStatistics('victory');if(!running){lastMode=false;const r=c.pendingReceipt;if(r){r.stoppedAt=end;r.reason='背包已滿，掉落已保留';}}metrics.fastBattles++;metrics.fastMs+=sample.duration;metrics.phase='正在快速結算收益';observed=null;
  });}finally{stepping=false;metrics.fastComputeMs+=performance.now()-t;}
  return true;
 }

 // Finite batches yield to the browser; settlement enforces the offline cap.
 function advance(target,maxEvents=150,foreground=false){
  let c=ensure();if(globalThis.__EMBERWILD_SAVE_OWNER===false)throw Error('存檔已由另一分頁接手');
  if(!c||target<c.lastAt)return false;
  let count=0,resources=null;const batchStart=performance.now();
  quiet(()=>{while(c.lastAt<target&&count<maxEvents&&(count===0||performance.now()-batchStart<12)){
   if(!lastMode||!running){const wait=target-c.lastAt;if(nextActionAt)nextActionAt+=wait;if(roundStartedAt)roundStartedAt+=wait;consumeTo(target,false);break;}
   if(jobOffline&&analysis){checkHours(c.lastAt);if(analysis.ready&&observed&&!roundIterator&&round===0)resources=captureResources(resources);try{if(tryFast(target)){collect(resources);count++;continue;}}catch(error){
    // Restore inventory, receipt, combat cursor and story trackers together.
    // Re-run only the uncommitted interval using the full combat engine.
    if(!lastCommitted)throw error;metrics.lastFastError=String(error.message||error);restoring=true;try{loadParty(JSON.parse(lastCommitted));}finally{restoring=false;}
    analysis=null;observed=null;resources=null;c=ensure();fastReason('fast-error');metrics.phase='正在分析戰鬥效率（完整模擬）';return true;
   }}
   const expiry=Math.min(...buffs().filter(b=>b.enabled&&b.remainingMs>0).map(b=>c.lastAt+b.remainingMs),Infinity);
   const at=Math.min(target,Math.max(c.lastAt,nextActionAt),expiry,jobOffline&&analysis&&analysis.hours.length<3?analysis.next:Infinity);consumeTo(at,true);
   if(at===expiry){count++;continue;}
   if(jobOffline&&analysis)checkHours(at);
   if(nextActionAt<=at){
    if(foreground&&!globalThis.EmberwildSecondsCombat?.active){
     // One visible event per tick, at the actual presentation time. Absorb a
     // short foreground stall into this round instead of replaying a burst.
     // Wall-clock boosts still consume the whole elapsed interval.
     consumeTo(target,true);
     const late=Math.max(0,target-nextActionAt);
     if(roundIterator||combatRoundProgress)roundStartedAt+=late;
     nextActionAt=target;
    }
    resources=jobOffline?captureResources(resources):null;const eventStart=performance.now();event(foreground&&!globalThis.EmberwildSecondsCombat?.active?target:at);if(jobOffline&&metrics)metrics.fullMs+=performance.now()-eventStart;collect(resources);if(jobOffline)sampleAfterEvent();count++;if(!running){lastMode=false;const r=c.pendingReceipt;if(jobOffline&&r&&!r.complete){r.stoppedAt=at;r.reason=playerHero().bag.length>=RULES.bagCapacity?'背包已滿，掉落已保留':globalThis.expeditionChallengeResult?(expeditionChallengeResult.success?'任務關卡完成':'任務關卡戰敗'):'本次探索已依戰鬥規則結束';}}}
   // A foreground seconds tick can resolve several independent actions.
   // Publish a captured impact before advancing again, or the single pending
   // visual frame is overwritten and some targets lose their HP/icon effects.
   // Offline replay still processes its full batch without presentation waits.
   if(foreground&&globalThis.EmberwildBattleEffects?.pendingEvents.length||foreground&&!globalThis.EmberwildSecondsCombat?.active||at===target)break;
  }});
  c.status=running?'running':foes.length?'paused':'stopped';return c.lastAt<target;
 }
 // Expire wall-clock boosts during the excess absence without granting combat time.
 function skipUncreditedTime(target){
  const c=clock(),delta=target-c.lastAt;if(delta<=0)return;
  if(nextActionAt)nextActionAt+=delta;
  if(roundStartedAt)roundStartedAt+=delta;
  const recording=jobOffline;jobOffline=false;
  try{consumeTo(target,false);}finally{jobOffline=recording;}
 }
 function commit(){const t=performance.now();internal=true;try{if(save()!==true)throw Error('無法儲存結算進度，原存檔與未補算時間仍保留');}finally{internal=false;if(metrics)metrics.saveMs+=performance.now()-t;}}
 function rollback(message){
  let raw=null;try{raw=localStorage.getItem(KEY);}catch{}
  restoring=true;try{for(const candidate of new Set([raw,lastCommitted]))if(candidate){try{loadParty(JSON.parse(candidate));break;}catch{}}}finally{restoring=false;}failed=true;
  showProgress(message,true);
 }
 function showProgress(message,error=false){
  const box=document.getElementById('offline-settlement');if(!box||atTitle())return;
  const c=clock(),p=settlementProgress;
  const total=p?Math.max(1,p.target-p.start):0,done=p?Math.max(0,Math.min(total-1,c.lastAt-p.start)):0,percent=total?Math.floor(done/total*1000)/10:0;box.hidden=false;renderedReceipt=null;
  box.innerHTML=`<section role="status" aria-live="polite" aria-busy="${!error}"><h2>離線探索收益</h2><p>${esc(message)}</p>${p?`<progress max="${total}" value="${done}" aria-label="離線結算進度"></progress><p class="offline-progress-value">${percent}% · 已計算 ${api.timeText(done,true)} / ${api.timeText(total,true)}</p><p class="small">進度代表已計算時間；計算期間分批儲存，完成時立即儲存全部收益。</p>`:''}${error?'<button onclick="retryOfflineExploration()">重試結算</button>':''}</section>`;
 }
 function showReceipt(){
  const r=clock()?.receipt,box=document.getElementById('offline-settlement');if(!r?.complete||!eligible(r)||!box||atTitle()||document.hidden)return;
  if(renderedReceipt===r.id&&!box.hidden)return;renderedReceipt=r.id;
  box.hidden=false;const fmt=n=>Math.round(n).toLocaleString('zh-TW'),time=t=>new Date(t).toLocaleString('zh-TW',{hour12:false});
  const group=(kind,title)=>{const rows=Object.entries(r.items).filter(([k,n])=>k.startsWith(kind+':')&&n>0);return rows.length?`<h3>${title}</h3><div class="offline-items">${rows.map(([k,n])=>itemSlotHTML(kind,k.slice(kind.length+1),{count:n,detailLabel:'本次獲得'})).join('')}</div>`:'';};
  box.innerHTML=`<section role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="offline-heading"><h2 id="offline-heading">離線探索收益</h2><p>${esc(r.map)} · ${esc(r.stage||'一般探索')} · ${r.reason?esc(r.reason):'正常完成補算'}</p><p class="small">開始 ${time(r.start)}<br>結束 ${time(r.end)}${r.stoppedAt?'<br>探索終止 '+time(r.stoppedAt):''}</p><div class="offline-summary"><div>計入離線<b>${api.timeText(r.intervals?.reduce((n,x)=>n+x.end-x.start,0)??r.end-r.start,true)}</b></div><div>有效掛機<b>${api.timeText(r.effectiveMs,true)}</b></div><div>擊殺怪物<b>${fmt(r.kills)} 隻</b></div><div>經驗值<b>＋${fmt(r.xp)}</b></div><div>金錢獲得<b>＋${fmt(r.goldGained)}</b></div><div>金錢消耗<b>−${fmt(r.goldSpent)}</b></div><div>金錢淨增加<b>${fmt(r.goldGained-r.goldSpent)}</b></div></div><p class="small">單次離線最多計算 24 小時，超過的時間不產生戰鬥收益。夥伴沿用現有規則，與主角同步等級，沒有獨立經驗槽。</p><div>${r.levels.map(l=>`<p>${esc(l.name)}：Lv.${l.before} → Lv.${l.after}（升級 ${l.after-l.before} 次）</p>`).join('')}</div>${group('material','素材收益')}${group('item','消耗品收益')}${group('gem','寶石收益')}${r.gear.length?'<h3>裝備收益 · '+r.gear.length+' 件</h3><div class="offline-items">'+r.gear.slice(gearPage*30,gearPage*30+30).map((g,j)=>{const i=gearPage*30+j;return `<button class="offline-gear" onclick="showOfflineGear(${i})">${gearSlotHTML(g,{preview:g,count:1,contentOnly:true})}<span class="q${gearQualityRank(g)}">${AFFIX_RANK[gearQualityRank(g)]}</span></button>`;}).join('')+'</div>'+ (r.gear.length>30?`<div class="actions"><button onclick="changeOfflineGearPage(-1)" ${gearPage===0?'disabled':''}>上一頁</button><span>${gearPage+1} / ${Math.ceil(r.gear.length/30)}</span><button onclick="changeOfflineGearPage(1)" ${(gearPage+1)*30>=r.gear.length?'disabled':''}>下一頁</button></div>`:''):''}<h3>增益實際生效時間</h3>${Object.values(r.boosts).map(b=>`<p>${esc(b.name)} · ${esc(b.effect)}：${api.timeText(b.ms,true)}</p>`).join('')||'<p>無限時增益</p>'}${Object.keys(r.consumed||{}).length?'<h3>道具消耗</h3><div class="offline-items">'+Object.entries(r.consumed).filter(([,n])=>n>0).map(([k,n])=>{const split=k.indexOf(':'),kind=k.slice(0,split),id=k.slice(split+1);if(k==='item:legacy-potion')return '<p>舊版治療藥水 ×'+fmt(n)+'</p>';return ['item','material','gem'].includes(kind)?itemSlotHTML(kind,id,{count:n,detailLabel:'本次消耗'}):'<p>'+esc(k)+' ×'+fmt(n)+'</p>';}).join('')+'</div>':''}<p class="small">收益已存入角色與背包；視窗僅顯示已保存的收益，探索仍會持續進行。</p><button class="primary" onclick="acknowledgeOfflineExploration()">確認／關閉</button></section>`;box.querySelector('[role="dialog"]')?.focus({preventScroll:true});
 }
 globalThis.changeOfflineGearPage=function(delta){renderedReceipt=null;gearPage=Math.max(0,Math.min(Math.ceil((clock()?.receipt?.gear.length||1)/30)-1,gearPage+delta));showReceipt();};
 globalThis.showOfflineGear=function(i){const g=clock()?.receipt?.gear[i];if(!g)return;$('modal').innerHTML='<h2>'+equipmentNameHTML(g)+'</h2>'+equipmentAttributeDetailsHTML(g)+'<button onclick="closeModal()">關閉</button>';$('modal').showModal();};
 globalThis.acknowledgeOfflineExploration=function(){
  const c=clock();if(job||failed||!c?.receipt?.complete||globalThis.__EMBERWILD_SAVE_OWNER===false)return false;
  const previous=copy(c);c.receipt=null;promote();
  try{commit();}catch(e){Object.assign(c,previous);return false;}
  renderedReceipt=null;document.getElementById('offline-settlement').hidden=true;showReceipt();return true;
 };
 function settle(target=nowReal(),offline=true){
  if(!party||restoring||atTitle()||globalThis.__EMBERWILD_SAVE_OWNER===false)return Promise.resolve();
  let c=ensure();
  if(job){if(Number.isSafeInteger(target)){requestedAt=Math.max(requestedAt,target);if(offline){jobOffline=true;ensureOfflineWindow(c,requestedAt);track(Math.min(requestedAt,c.offlineWindow.capAt));}if(c.offlineWindow)c.offlineWindow.untilAt=Math.max(c.offlineWindow.untilAt,requestedAt);}return job;}
  if(!Number.isSafeInteger(target)||target<0||target>8.64e15||target<c.lastAt){failed=true;settlementProgress=null;showProgress('裝置時間無效或早於最後結算時間；收益與時間已保留，請校正時間後重試。',true);return Promise.resolve();}
  requestedAt=target;jobOffline=offline;
  if(offline||c.offlineWindow||target-c.lastAt>maxOfflineMs)ensureOfflineWindow(c,target);
  if(offline)track(Math.min(target,c.offlineWindow?.capAt??target));
  metrics={fullMs:0,fastComputeMs:0,dropMs:0,inventoryMs:0,saveMs:0,totalMs:0,fastMs:0,fastBattles:0,fallbacks:{},hours:[],phase:globalThis.EmberwildSecondsCombat?.active?'正在推進秒數戰鬥與產生掉落':'正在分析戰鬥效率'};
  analysis=null;observed=null;replayCache=null;modelSeed=(c.lastAt^playerHero().created^party.map)>>>0;if(offline&&target-c.lastAt>3*HOUR&&!globalThis.__EMBERWILD_OFFLINE_FULL_ONLY){const reason=simpleCombat();if(reason)fastReason(reason);else resetAnalysis(c.lastAt);}
  failed=false;settlementProgress={start:c.lastAt,target};
  job=Promise.resolve().then(async()=>{
   try{
    // Foreground catch-up is silent; an unread receipt keeps its DOM and scroll.
    const show=jobOffline&&!c.receipt&&settlementProgress.target-settlementProgress.start>1000;
    const settlementStarted=performance.now();if(show)showProgress('正在分析戰鬥效率');commit();
    // Paint the overlay before starting CPU-intensive combat replay.
    if(show)await new Promise(resolve=>setTimeout(resolve,0));
    let lastProgress=performance.now(),lastCheckpoint=lastProgress;
    do{
     const end=c.offlineWindow?Math.min(requestedAt,c.offlineWindow.capAt):requestedAt;
     if(c.offlineWindow)c.offlineWindow.untilAt=Math.max(c.offlineWindow.untilAt,requestedAt);
     settlementProgress.target=end;
     let more;
     do{const start=c.lastAt,r=c.pendingReceipt,status=c.status;more=advance(end);if(c!==clock()){c=clock();more=c.lastAt<end;}else if(jobOffline)recordInterval(r,start,c.lastAt);if(c.status!==status||more&&performance.now()-lastCheckpoint>=checkpointIntervalMs){commit();lastCheckpoint=performance.now();}if(show&&(performance.now()-lastProgress>=100||!more)){showProgress(metrics.fastBattles?'正在快速結算收益 · 正在生成掉落物品':metrics.phase);lastProgress=performance.now();}if(more)await new Promise(resolve=>setTimeout(resolve,0));}while(more);
     if(c.offlineWindow&&c.lastAt<requestedAt)skipUncreditedTime(requestedAt);
    }while(c.lastAt<requestedAt);
    // A throttled tick takes this async path; do not starve online life jobs.
    internal=true;try{globalThis.emberwildLifeHeartbeat?.();}finally{internal=false;}
    if(show){showProgress('正在完成收益與存檔');await new Promise(resolve=>setTimeout(resolve,0));}if(jobOffline&&!document.hidden)promote();c.offlineWindow=null;commit();metrics.totalMs=performance.now()-settlementStarted;lastRendered=actionSerial;render();showReceipt();
    if(!c.receipt)document.getElementById('offline-settlement').hidden=true;
   }catch(e){rollback(String(e.message||e));}
   finally{analysis=null;observed=null;replayCache=null;job=null;lastMode=atTitle()?false:running;lastCheck=nowReal();}
  });return job;
 }
 globalThis.retryOfflineExploration=function(){failed=false;return settle(nowReal(),jobOffline);};
 function sync(now=nowReal()){
  if(internal||stepping||restoring||!party||failed||atTitle()||globalThis.__EMBERWILD_SAVE_OWNER===false)return;
  if(job){requestedAt=Math.max(requestedAt,now);return;}
  const c=ensure();if(now<c.lastAt){void settle(now,false);return;}
  // Hidden tabs and sleep-sized gaps keep the unrestricted shared replay path.
  // Ordinary foreground jitter must never start an asynchronous catch-up job.
  if(now-c.lastAt>=10000||document.hidden&&now-c.lastAt>1000){void settle(now,false);return;}
  jobOffline=false;
  internal=true;try{
   // save()/UI callbacks can sync before tick paints. Do not overwrite that
   // unpresented event with another action; the next 50ms tick publishes it.
   if(document.hidden||actionSerial===lastRendered)advance(now,50,!document.hidden);
   else consumeTo(now,lastMode&&running);
  }finally{internal=false;}
  lastMode=active();c.status=running?'running':foes.length?'paused':'stopped';
  if(c.receipt&&renderedReceipt!==c.receipt.id){try{commit();showReceipt();}catch(e){rollback(String(e.message||e));}}
 }
 tick=function(){
  if(failed||atTitle()||globalThis.__EMBERWILD_SAVE_OWNER===false)return;
  const now=nowReal();if(now-lastCheck<(document.hidden?1000:50))return;lastCheck=now;sync(now);
  if(!job&&!document.hidden){
   if(now-lastHeartbeat>=1000){lastHeartbeat=now;globalThis.emberwildLifeHeartbeat?.();__EMBERWILD_TIMED_BOOST_TEST.refreshJournalRealtime();}
   if(lastRendered!==actionSerial){
    // save()/UI sync can resolve an action before tick presents it. Its wait
    // must survive a delayed publication or a slow render, rather than already
    // being overdue on the following tick. Keep the unpainted-event guard until
    // rendering finishes; replay never enters this foreground publication path.
    const serial=actionSerial,published=presentation;
    if(tab==='battle')render();else refreshGlobalJournal();
    lastRendered=serial;
    // An existing minimum-round wait can already cover the presentation cost.
    const delay=!globalThis.EmberwildSecondsCombat?.active&&published?.owner===party&&published.nextAt===nextActionAt?Math.max(0,nowReal()+published.intervalMs-nextActionAt):0;
    if(lastMode&&running&&delay){nextActionAt+=delay;if(roundIterator||combatRoundProgress)roundStartedAt+=delay;}
   }
  }
 };
 // UI actions are already synchronous. Flush debt before changing the team/map,
 // and persist the new running/paused/stopped state after the operation.
 for(const name of [
  'toggleBattle','stopTeamExploration','restartExploration','startSelectedExploration','startBossChallenge','startQuestEncounter','leaveBossChallenge',
  'chooseMap','changeDifficulty','setEncounterMode','returnToTitle','setTimedBoostEnabled','useSupply','closeModal',
  'buyFixedShopOffer','buyMarketOffer','buyHealingPotion','buySupply','buyLifeMaterial','sellInventoryItem',
  'setHeroAutoPotion','setHeroAutoPotionThreshold','setHeroAutoPotionItem','potion',
  'enhance','reroll','autoReroll','acceptAffix','resolveInlineAffix','rerollEquipmentPowerTier','socket',
  'salvage','salvageAll','sellGear','sellAllGearByQuality','confirmMassSalvage','confirmGearInventoryBatch','confirmTokenBatch','sellMaterial','sellCatalogueGem',
  'startDailyCommission','claimBoard','startSideQuest','claimQuest','completeStoryStage','claimMailboxAttachments','claimAllMailboxAttachments','useLevelScroll'
 ]){
  // Mail claims commit attachments and claim flags atomically, including rollback.
  const savesOwnState=['claimMailboxAttachments','claimAllMailboxAttachments'].includes(name),base=globalThis[name];if(typeof base!=='function')continue;
  globalThis[name]=function(...args){if(!stepping){if(globalThis.__EMBERWILD_SAVE_OWNER===false)return false;sync();if(job||failed)return false;}const wasRunning=running,wasEncounter=foes.length;const out=base.apply(this,args);if(!stepping){if(!wasRunning&&running&&!wasEncounter)ensure().startedAt=nowReal();sync();if(!savesOwnState)save();if(atTitle()){document.getElementById('offline-settlement').hidden=true;renderedReceipt=null;}}return out;};
 }
 const continueBase=continueFromTitle;
 continueFromTitle=function(...args){const out=continueBase(...args);if(party){const c=ensure();lastMode=c.status==='running';const offline=bootResumePending&&lastMode;bootResumePending=false;void settle(nowReal(),offline);}return out;};
 const ui=document.createElement('div');ui.id='offline-settlement';ui.className='offline-settlement';ui.hidden=true;document.body.appendChild(ui);ui.tabIndex=-1;
 ui.addEventListener('keydown',event=>{if($('modal').open)return;if(event.key==='Escape'&&clock()?.receipt?.complete){event.preventDefault();acknowledgeOfflineExploration();}else if(event.key==='Tab'){const buttons=[...ui.querySelectorAll('button:not([disabled])')];if(!buttons.length){event.preventDefault();ui.focus();return;}const index=buttons.indexOf(document.activeElement),next=event.shiftKey?(index<=0?buttons.length-1:index-1):(index+1)%buttons.length;event.preventDefault();buttons[next].focus();}});
 document.addEventListener('visibilitychange',()=>{if(!party||atTitle())return;if(document.hidden){sync();save();}else{if(!job)lastMode=clock()?.status==='running';void settle(nowReal(),false);}});
 addEventListener('pagehide',()=>{if(party&&!job&&!failed&&!atTitle())save();});
 if(party){ensure();}lastCheck=nowReal();
 globalThis.EmberwildOffline={get metrics(){return copy(metrics);},sync,settle,advance,snapshot,hydrate,validate,get busy(){return !!job;},get failed(){return failed;},get active(){return lastMode;}};
})();
