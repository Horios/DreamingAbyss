/* Tutorial manager. Plays the modules of the `tutorials` balance data (rules: js/story/tutorial-model.js) on top of the
   ordinary game screens: it highlights a control, explains it and waits for the game's own handler to report success.
   It never changes values, items, costs or unlocks. Player progress lives in party.tutorials, apart from the story. */
(()=>{
 'use strict';
 const M=EmberwildTutorial,copy=M.copy,STORY=()=>globalThis.__EMBERWILD_STORY,PRO=()=>globalThis.__EMBERWILD_PROLOGUE;
 const COUNTERS=['gearAcquired','explorationStarted','gearSelected','wearOpened','gearEquipped','skillSlotOpened','skillSlotted','catalogOpened'];
 let design=M.defaults();
 let session=null;            // {id, index, mode:'normal'|'replay'|'test', paused, reason, startedOn}
 const snoozed=new Set();     // modules the player closed during this page load (they come back after a reload)
 const notices=new Map();     // id -> {kind:'unlock'|'revision'}
 let lastTab=null,lastStatus='';

 // ---------- progress record ----------
 // auto:false — no automatic notices or guides (characters made without the prologue); review and replay still work.
 function fresh(auto=true){const events={};for(const k of COUNTERS)events[k]=0;return {version:1,auto,records:{},pages:{},events};}
 const recordKeys={triggered:'boolean',completed:'boolean',skipped:'boolean',notified:'boolean',revision:'number',step:'number',notifiedRevision:'number',legacy:'boolean'};
 function validateProgress(raw){
  if(raw===undefined)return undefined;
  const x=copy(raw),bad=m=>{throw Error('教學存檔格式無效：'+m);};
  if(!x||typeof x!=='object'||Array.isArray(x)||x.version!==1)bad('版本');
  for(const k of ['records','pages','events'])if(!x[k]||typeof x[k]!=='object'||Array.isArray(x[k]))bad(k);
  if(x.auto!==undefined&&typeof x.auto!=='boolean')bad('auto');
  for(const k of Object.keys(x))if(!['version','auto','records','pages','events'].includes(k))bad(k);
  for(const [id,r] of Object.entries(x.records)){
   if(['__proto__','constructor','prototype'].includes(id)||!r||typeof r!=='object'||Array.isArray(r))bad('紀錄 '+id);
   for(const [k,v] of Object.entries(r)){if(!Object.hasOwn(recordKeys,k)||typeof v!==recordKeys[k])bad('紀錄欄位 '+id+'.'+k);if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<-1||v>9999))bad('紀錄數值 '+id+'.'+k);}
  }
  for(const [k,v] of Object.entries(x.pages))if(!Object.hasOwn(M.PAGES,k)||v!==1)bad('頁面 '+k);
  for(const k of COUNTERS){x.events[k]??=0;if(!Number.isSafeInteger(x.events[k])||x.events[k]<0||x.events[k]>1e9)bad('事件 '+k);}
  for(const k of Object.keys(x.events))if(!COUNTERS.includes(k))bad('事件 '+k);
  return x;
 }
 // Saves made before the tutorial system have no record. Their counters are seeded from what the save already shows,
 // and a module whose waits are all evidenced (and whose prerequisites hold) counts as done, so long-time players are
 // not walked through basics again. Nothing else changes.
 function migrate(){
  const t=fresh(),h=party.members?.[0],explored=Object.values(party.progressStats?.explore||{}).some(n=>n>0)||(h?.totalKills||0)>0;
  t.events.explorationStarted=explored?1:0;t.events.gearAcquired=explored?allGear().filter(normalGear).length:0;
  const worn=h?(h.equipped||[]).filter(Boolean).map(id=>(h.bag||[]).find(g=>g.id===id)).filter(g=>g&&normalGear(g)).length:0;
  t.events.gearEquipped=t.events.gearSelected=t.events.wearOpened=worn?1:0;
  const slotted=h?(h.skillLoadout?.active||[]).filter(Boolean).length:0;t.events.skillSlotOpened=t.events.skillSlotted=slotted?1:0;
  party.tutorials=t;
  for(const m of design.modules)if(m.enabled&&m.implemented&&met(m.prerequisites)&&evidenced(m))t.records[m.id]={triggered:true,completed:true,skipped:false,revision:m.revision,step:-1,legacy:true};
  return t;
 }
 let creating=false,viaPrologue=false;
 function ensure(){if(!party)return null;if(!party.tutorials){if(creating)party.tutorials=fresh(viaPrologue);else migrate();}return party.tutorials;}
 const rec=id=>{const t=ensure();return t?(t.records[id]??={triggered:false,completed:false,skipped:false,step:-1}):null;};
 const peek=id=>party?.tutorials?.records?.[id]||null;
 // Tutorial progress is saved after the current task (a microtask), never inside the render or the game action that
 // changed it: the action's own transaction and save stay exactly as they were, and a rolled-back action keeps nothing.
 // No timer is used, so the offline settlement's own timer queue is untouched; while it is busy the save waits for the
 // next tutorial check.
 let persistQueued=false,persistPending=false;
 function flush(){persistQueued=false;if(!party||!state)return;if(globalThis.EmberwildOffline?.busy){persistPending=true;return;}persistPending=false;try{save();}catch{}}
 const persist=()=>{if(persistQueued)return true;persistQueued=true;(globalThis.queueMicrotask||(fn=>Promise.resolve().then(fn)))(flush);return true;};

 // ---------- conditions ----------
 const hero=()=>party?.members?.[0]||null;
 const normalGear=g=>!!g&&!g.starterPack&&!g.storyRewardKey&&!globalThis.EmberwildTokens?.isToken?.(g);
 const allGear=()=>party?.sharedGear?.items||hero()?.bag||[];
 const prologueRunning=()=>!!STORY()?.prologueRunning?.()||!!PRO()?.active?.();
 function prologueLesson(action){const S=STORY(),q=S?.prologueQuest?.();if(!q)return 0;const r=S.record(q.id);if(!r)return 0;return Number(q.stages.some(s=>s.prologue?.action===action&&r.completed.includes(s.id)));}
 function skillDefs(h){const K=globalThis.__EMBERWILD_SKILLS;return K?K.system().definitions.filter(sk=>!sk.disabled&&sk.partnerId==null&&sk.jobs?.includes(h.job)):[];}
 function value(c){
  const h=hero(),t=party?.tutorials;if(!party||!h)return 0;
  switch(c.type){
   case 'prologueDone':return Number(!!state&&!prologueRunning());
   case 'tutorialDone':return Number(!!t?.records?.[c.key]?.completed);
   case 'pageVisited':return Number(!!t?.pages?.[c.key]);
   case 'featureUnlocked':return Number(!!party.story?.unlocks?.[c.key]);
   case 'questDone':return Number(!!party.story?.quests?.[c.key]?.done);
   case 'level':return h.lv||0;
   case 'companions':return Math.max(0,party.members.length-1);
   case 'gearOwned':return allGear().filter(normalGear).length;
   case 'itemAcquired':return STORY()?.value?.({type:'acquired',key:c.key,itemType:c.itemType})||0;
   case 'exploring':return Number(!!globalThis.running||typeof running!=='undefined'&&!!running);
   case 'explorationStarted':case 'gearEquipped':case 'gearAcquired':return t?.events?.[c.type]||0;
   case 'learnedActiveSkills':{const K=globalThis.__EMBERWILD_SKILLS;return K?skillDefs(h).filter(sk=>sk.type==='active'&&K.learned(h,sk)).length:0;}
   case 'activeSkillSlotted':return (h.skillLoadout?.active||[]).filter(Boolean).length;
   case 'skillSlots':return (h.skillLoadout?.[c.key]||[]).length;
   case 'prologueLesson':return prologueLesson(c.key);
   default:return 0;
  }
 }
 const need=c=>c.type==='exploring'||c.type==='prologueLesson'||c.type==='prologueDone'||c.type==='tutorialDone'||c.type==='pageVisited'||c.type==='featureUnlocked'||c.type==='questDone'?Math.max(1,c.count):c.count;
 const ok=c=>value(c)>=need(c);
 const met=g=>!g||!g.conditions.length||(g.mode==='any'?g.conditions.some(ok):g.conditions.every(ok));
 const label=c=>{const d=M.CONDITIONS[c.type];let key=c.key;if(c.type==='pageVisited')key=M.PAGES[c.key]||c.key;if(c.type==='tutorialDone')key=design.modules.find(m=>m.id===c.key)?.title||c.key;if(c.type==='skillSlots')key=M.SLOT_TYPES[c.key]||c.key;return (d?.label||c.type)+(key?'：'+key:'');};
 const explain=g=>(g?.conditions||[]).map(c=>({label:label(c),value:value(c),count:need(c),met:ok(c)}));
 // Migration evidence: every required wait of the module is already shown by the seeded counters.
 function evidenced(m){
  if(m.completion.type==='condition')return met(m.completion.condition);
  const t=party.tutorials;return m.steps.filter(s=>!s.optional).every(s=>{const a=s.advance;if(a.type==='event')return (t.events[a.key]||0)>0;if(a.type==='condition')return a.condition.type==='exploring'?t.events.explorationStarted>0:ok(a.condition);return true;});
 }

 // ---------- module state ----------
 const byId=id=>design.modules.find(m=>m.id===id)||null;
 const live=m=>!!m&&m.enabled&&m.implemented&&m.steps.length>0;
 const unlocked=m=>live(m)&&(met(m.prerequisites)||!!peek(m.id)?.completed||!!peek(m.id)?.triggered);
 const done=m=>!!peek(m.id)?.completed;
 function status(m){const r=peek(m.id);if(session?.id===m.id&&session.mode==='normal')return session.paused?'paused':'running';if(r?.completed)return 'completed';if(r?.skipped)return 'skipped';if(r?.triggered)return 'started';return 'new';}
 const STATUS_TEXT={new:'尚未開始',started:'進行到一半',running:'進行中',paused:'暫停中',completed:'已完成',skipped:'已跳過'};
 const playing=()=>!!party&&!!state&&!globalThis.isEmberwildTitleOpen?.()&&!prologueRunning();
 const blocked=()=>{const layer=document.getElementById('prologue-layer');return !!document.getElementById('modal')?.open||!!layer&&!layer.hidden;};
 const pageOf=s=>s?.page||M.TARGETS[s?.target]?.page||'';
 const currentPage=()=>typeof tab==='string'?tab:'';

 // ---------- targets ----------
 const $q=(sel,root=document)=>root.querySelector?.(sel)||null;
 const modal=()=>{const d=document.getElementById('modal');return d?.open?d:null;};
 const main=()=>$q('#app .layout>main')||$q('#app');
 function newestGearRow(){
  const list=$q('.inline-equipment-list');if(!list)return null;
  const g=allGear().filter(normalGear).sort((a,b)=>(b.acquiredAt||0)-(a.acquiredAt||0))[0];
  return g?[...list.querySelectorAll('.gear-management-row')].find(r=>r.querySelector(`[onclick*="selectInventoryGear('${g.id}')"]`))||null:list.querySelector('.gear-management-row');
 }
 const FIND={
  'battle.destination':()=>$q('main .seconds-destination-bar')||$q('main .expedition-control-card'),
  'battle.categories':()=>$q('main [onclick^="setExplorationCategory"]')?.parentElement||null,
  'battle.mapSelect':()=>$q('main select[aria-label="探索地圖"]'),
  'battle.start':()=>$q('main [onclick="startSelectedExploration()"]')||$q('main .seconds-adventure-toolbar [onclick="toggleBattle()"]'),
  'battle.huntMode':()=>$q('main [onclick^="setHuntingMode"]'),
  'battle.allies':()=>$q('main .seconds-side-ally')||$q('main .party-combat'),
  'battle.enemies':()=>$q('main .seconds-side-enemy'),
  'bag.categories':()=>$q('main [onclick^="setInventoryCategory"]')?.parentElement||null,
  'bag.list':()=>$q('main .inline-equipment-list'),
  'bag.newGear':newestGearRow,
  'bag.wearButton':()=>$q('main [onclick*="openInventoryWear("]'),
  'worn.slots':()=>$q('main [onclick^="selectWornSlot("]')?.parentElement?.parentElement||null,
  'worn.candidate':()=>{const m=modal();if(m)return $q('[onclick^="confirmEquipComparison("]',m);return $q('main [onclick^="previewEquip("]');},
  'worn.confirm':()=>{const m=modal();return m?$q('[onclick^="confirmEquipComparison("]',m):null;},
  'skills.catalog':()=>$q('main [onclick="openSkillCatalog()"]'),
  'skills.activeSlots':()=>$q('main [onclick^="openSkillSlot(\'active\'"]')?.parentElement||null,
  'skills.firstActiveSlot':()=>$q('main [onclick="openSkillSlot(\'active\',0)"]'),
  'skills.procSlots':()=>$q('main [onclick^="openSkillSlot(\'proc\'"]')?.parentElement||null,
  'skills.supportSlots':()=>$q('main [onclick^="openSkillSlot(\'support\'"]')?.parentElement||null,
  'skills.slotChoice':()=>{const m=modal();return m?[...m.querySelectorAll('[onclick^="chooseSkillSlot("]')].find(b=>!b.disabled&&!/null\)$/.test(b.getAttribute('onclick')))||null:null;},
  'header.options':()=>document.getElementById('utilityButton-options')
 };
 // A control marked data-tutorial-target="id" wins over the built-in lookup, so a redesigned screen can keep its target.
 function resolve(id){
  if(!id)return {state:'none',el:null};
  let el=document.querySelector?.(`[data-tutorial-target~="${globalThis.CSS?.escape?CSS.escape(id):id}"]`)||null;
  try{el=el||FIND[id]?.()||null;}catch{el=null;}
  if(!el||!el.isConnected)return {state:'missing',el:null};
  const r=el.getBoundingClientRect?.();if(!r||!r.width||!r.height)return {state:'hidden',el};
  if(el.disabled)return {state:'disabled',el};
  return {state:'found',el};
 }
 const TARGET_TEXT={none:'不需要目標',found:'已找到',missing:'找不到（頁面尚未顯示或版面已改變）',hidden:'存在但目前看不到',disabled:'存在但目前無法操作'};

 // ---------- events from the game's own handlers ----------
 function count(kind){const t=party&&ensure();if(t)t.events[kind]=Math.min(1e9,(t.events[kind]||0)+1);const s=current();if(s&&!session.paused&&s.step.advance.type==="event"&&s.step.advance.key===kind&&!replayExplain(s.step))advance("event");}
 function wrap(name,check){const base=globalThis[name];if(typeof base!=='function')return;globalThis[name]=function(...args){const before=check?.before?.(...args),out=base.apply(this,args);try{if(check?check.after(out,before,...args):out!==false)count(check?.kind||name);}catch{}return out;};}
 const wornSignature=()=>party?party.members.map(h=>(h.equipped||[]).join(',')).join('|'):'';
 function installHooks(){
  wrap('startSelectedExploration',{kind:'explorationStarted',after:()=>value({type:'exploring'})>0});
  wrap('selectInventoryGear',{kind:'gearSelected',after:out=>out!==false});
  wrap('openInventoryWear',{kind:'wearOpened',after:out=>out===true});
  wrap('equipSharedGear',{kind:'gearEquipped',before:wornSignature,after:(out,before)=>wornSignature()!==before});
  wrap('openSkillSlot',{kind:'skillSlotOpened',after:out=>out!==false});
  wrap('chooseSkillSlot',{kind:'skillSlotted',after:out=>out===true});
  wrap('openSkillCatalog',{kind:'catalogOpened',after:out=>out!==false});
 }

 // ---------- sessions ----------
 function current(){if(!session)return null;const m=byId(session.id);if(!m||!m.steps.length){session=null;return null;}if(session.index>=m.steps.length)session.index=m.steps.length-1;return {m,step:m.steps[session.index]};}
 const replayExplain=s=>session&&session.mode!=='normal'&&s.onReplay==='explain';
 const testing=()=>session?.mode==='test';
 function skippedByPrologue(s){return session?.mode==='normal'&&s.skipIf?.conditions?.length&&met(s.skipIf);}
 function writeStep(){if(session?.mode!=='normal')return;const r=rec(session.id);r.step=session.index;persist();}
 function go(page){if(!page||currentPage()===page)return true;const out=setTab(page);return out!==false&&currentPage()===page;}
 // Move to step i (skipping steps the prologue already taught), open its page and record where the player is.
 function enter(i,{record=true}={}){
  const m=byId(session.id);
  while(i<m.steps.length&&skippedByPrologue(m.steps[i]))i++;
  if(i>=m.steps.length)return finish(true);
  session.index=i;session.paused=false;session.reason='';
  const s=m.steps[i],page=pageOf(s);
  if(page&&currentPage()!==page&&!go(page)){session.paused=true;session.reason='目前無法開啟「'+(M.PAGES[page]||page)+'」頁';}
  lastTab=currentPage();
  if(record)writeStep();draw();return true;
 }
 function begin(id,mode='normal',step=0){
  const m=byId(id);if(!m)return {ok:false,error:'教學不存在：'+id};
  if(mode!=='test'&&!live(m))return {ok:false,error:'這個教學尚未實裝或已停用'};
  if(!party||!state)return {ok:false,error:'尚未建立角色'};
  if(prologueRunning())return {ok:false,error:'序幕進行中，結束後才能使用教學'};
  if(session&&session.id!==id&&mode!=='test')return {ok:false,error:'另一個教學正在進行：'+(byId(session.id)?.title||session.id)};
  if(mode==='replay'&&!unlocked(m))return {ok:false,error:'這個功能尚未解鎖'};
  if(mode==='replay'&&!m.replayable)return {ok:false,error:'這個教學不提供重播'};
  if(!Number.isSafeInteger(step)||step<0||step>=m.steps.length)return {ok:false,error:'步驟不存在'};
  session={id,index:step,mode,paused:false,reason:''};notices.delete(id);
  if(mode==='normal'){const r=rec(id);r.triggered=true;}
  enter(step);return {ok:true};
 }
 function finish(completed){
  const s=session;if(!s)return;const m=byId(s.id);session=null;
  if(s.mode==='normal'&&m){const r=rec(m.id);r.step=-1;if(completed&&(m.completion.type==='steps'||met(m.completion.condition))){r.completed=true;r.skipped=false;r.revision=m.revision;}persist();}
  else if(s.mode==='replay'&&m&&completed&&!peek(m.id)?.completed&&(m.completion.type==='steps'||met(m.completion.condition))){const r=rec(m.id);r.completed=true;r.skipped=false;r.revision=m.revision;persist();}
  if(m&&completed&&s.mode!=='test')toast('教學完成：'+m.title);
  draw();
 }
 function advance(source='next'){
  const c=current();if(!c||session.paused)return false;
  if(source==='next'&&c.step.advance.type!=='next'&&!replayExplain(c.step)&&!testing()&&!stepUnavailable(c))return false;
  if(session.index>=c.m.steps.length-1)return finish(true),true;
  return enter(session.index+1);
 }
 function stepUnavailable(c){if(!c||c.step.requires?.conditions?.length&&!met(c.step.requires))return explain(c.step.requires).filter(x=>!x.met).map(x=>x.label+'（目前 '+x.value+'／需要 '+x.count+'）').join('、')||'條件未成立';return '';}

 // Public controls (the card buttons and the developer test panel use the same functions).
 const api={
  next(){return advance('next');},
  back(){const c=current();if(!c)return false;let j=session.index-1;while(j>=0&&skippedByPrologue(c.m.steps[j]))j--;if(j<0)return false;return enter(j);},
  skipStep(){const c=current();if(!c)return false;if(!c.step.optional&&!stepUnavailable(c)&&!testing())return false;if(session.index>=c.m.steps.length-1)return finish(!stepUnavailable(c)||c.step.optional),true;return enter(session.index+1);},
  skipAll(){const c=current();if(!c)return false;if(session.mode==='normal'){if(!c.m.skippable)return false;const r=rec(c.m.id);r.skipped=true;r.step=-1;persist();}session=null;draw();return true;},
  close(){const c=current();if(!c)return false;if(session.mode==='normal'){snoozed.add(c.m.id);writeStep();}session=null;draw();return true;},
  resume(){const c=current();if(!c)return false;session.paused=false;return enter(session.index,{record:false});},
  pause(){if(!session)return false;session.paused=true;session.reason='已暫停';draw();return true;},
  restartStep(){const c=current();if(!c)return false;return enter(session.index,{record:false});}
 };
 globalThis.tutorialControl=function(action){return typeof api[action]==='function'?api[action]():false;};
 globalThis.tutorialNotice=function(id,action){
  const m=byId(id);if(!m)return false;const n=notices.get(id);notices.delete(id);
  if(action==='go'){const r=begin(id,n?.kind==='revision'?'replay':'normal');if(!r.ok)toast(r.error);return r.ok;}
  if(action==='skip'&&n?.kind!=='revision'&&m.skippable){const r=rec(id);r.skipped=true;persist();}
  draw();return true;
 };
 globalThis.replayTutorial=function(id){const r=begin(id,'replay');if(!r.ok){toast(r.error);return false;}closeModal();const c=current();if(c)enter(session.index,{record:false});return true;};

 // ---------- automatic triggers ----------
 // New gear is counted by id as it appears. Drops, shop and wishing-lake gear carry acquiredAt; starting gear does not,
 // and neither does the gear already owned when tracking begins (the baseline).
 let known=null,knownOwner=null;
 function trackGear(){
  if(!party)return false;const ids=allGear().map(g=>g.id);
  if(knownOwner!==party||!known){known=new Set(ids);knownOwner=party;return false;}
  let n=0;for(const g of allGear())if(!known.has(g.id)){known.add(g.id);if(normalGear(g)&&g.acquiredAt!==undefined)n++;}
  if(n){const t=ensure();t.events.gearAcquired=Math.min(1e9,(t.events.gearAcquired||0)+n);}return n>0;
 }
 // Pages opened by a developer test run are not the player's visits.
 function notePage(page){if(session?.mode==='test')return false;const t=party&&ensure();if(!t||!Object.hasOwn(M.PAGES,page)||t.pages[page])return false;t.pages[page]=1;return true;}
 function evaluate(){
  if(!playing())return;
  const page=currentPage();let dirty=trackGear();
  if(persistPending)dirty=true;
  if(page!==lastTab){if(notePage(page))dirty=true;onPageChange(page);lastTab=page;}
  if(party.tutorials?.auto===false){if(dirty)persist();if(session){const c=current();if(c&&!session.paused)watch(c);}return;}
  for(const m of design.modules){
   if(!live(m)||!met(m.prerequisites))continue;
   const r=peek(m.id);
   // Revised content: offer it once to players who completed an older revision; never force it.
   if(m.reprompt&&r?.completed&&(r.revision||1)<m.revision&&(r.notifiedRevision||0)<m.revision&&m.replayable){notices.set(m.id,{kind:'revision'});rec(m.id).notifiedRevision=m.revision;dirty=true;continue;}
   if(r?.completed||r?.skipped)continue;
   if(m.trigger.notify&&!r?.notified&&!(m.trigger.type==='pageEnter'&&page===m.trigger.page)){notices.set(m.id,{kind:'unlock'});rec(m.id).notified=true;dirty=true;}
   if(m.trigger.type==='unlock'&&!r?.notified){notices.set(m.id,{kind:'unlock'});rec(m.id).notified=true;dirty=true;}
  }
  if(dirty)persist();
  if(session){const c=current();if(c&&!session.paused)watch(c);return;}
  if(blocked())return;
  // One guide at a time: the first eligible module in list order whose page is open starts (or resumes).
  for(const m of design.modules){
   if(!live(m)||snoozed.has(m.id)||m.trigger.type!=='pageEnter'||!met(m.prerequisites))continue;
   const r=peek(m.id);if(r?.completed||r?.skipped)continue;
   const at=r?.triggered&&r.step>=0&&r.step<m.steps.length?r.step:0,startPage=at?pageOf(m.steps[at])||m.trigger.page:m.trigger.page;
   if(page!==startPage&&!(at&&page===m.trigger.page))continue;
   if(m.steps[at]?.requires?.conditions?.length&&!met(m.steps[at].requires)&&at===0)continue;
   const out=begin(m.id,'normal',page===startPage?at:0);if(out.ok)return;
  }
 }
 function onPageChange(page){
  const c=current();if(!c||session.paused)return;
  const want=pageOf(c.step);if(!want||want===page)return;
  // Moving on by the step's own action (the wear button opens the gear page) is the next step, not an interruption.
  const nextStep=c.m.steps[session.index+1];if(c.step.advance.type==='page'&&c.step.advance.key===page)return advance('page');
  if(nextStep&&pageOf(nextStep)===page&&c.step.advance.type==='event')return;
  if(c.m.interrupt==='end'&&session.mode!=='test'){if(session.mode==='normal'){snoozed.add(c.m.id);writeStep();}session=null;return;}
  session.paused=true;session.reason='已離開「'+(M.PAGES[want]||want)+'」頁';
 }
 function watch(c){
  const a=c.step.advance;
  if(replayExplain(c.step))return;
  if(a.type==='condition'&&ok(a.condition))return advance('condition');
  if(a.type==='page'&&currentPage()===a.key)return advance('page');
 }
 // Passive completion for condition-type modules the player already finished reading.
 function passiveCompletion(){if(!playing())return;let dirty=false;for(const m of design.modules){if(m.completion.type!=='condition')continue;const r=peek(m.id);if(r?.triggered&&!r.completed&&!r.skipped&&r.step===-1&&met(m.completion.condition)){r.completed=true;r.revision=m.revision;dirty=true;}}if(dirty)persist();}
 // A click on the highlighted control moves a "click" step on, after the control's own handler has run.
 document.addEventListener?.('click',e=>{const c=current();if(!c||session.paused||c.step.advance.type!=='click')return;const {el}=resolve(c.step.target);if(el&&el.contains(e.target))setTimeout(()=>advance('click'),0);},true);

 // ---------- drawing ----------
 const esc2=s=>typeof esc==='function'?esc(String(s??'')):String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function layer(id,tag='div'){let n=document.getElementById(id);if(!n){n=document.createElement(tag);n.id=id;n.hidden=true;document.body.appendChild(n);}return n;}
 function cardHTML(c){
  const {m,step}=c,i=session.index,n=m.steps.length,unavail=stepUnavailable(c),target=resolve(step.target),explainOnly=replayExplain(step);
  const wait=explainOnly||step.advance.type==='next'?'':step.advance.type==='event'?'完成「'+(M.EVENTS[step.advance.key]||step.advance.key)+'」後自動繼續':step.advance.type==='click'?'點擊高亮的位置後自動繼續':step.advance.type==='page'?'前往「'+(M.PAGES[step.advance.key]||'')+'」後自動繼續':'達成「'+label(step.advance.condition)+'」後自動繼續';
  const missing=step.target&&target.state!=='found'?`<p class="tutorial-warn">${target.state==='missing'?'畫面上找不到要說明的位置。':'要說明的位置目前看不到或無法操作。'}可以按「下一步」或結束教學。</p>`:'';
  const mode=session.mode==='test'?'<span class="tutorial-mode">測試</span>':session.mode==='replay'?'<span class="tutorial-mode">重播</span>':'';
  const buttons=[];
  if(session.paused){buttons.push('<button type="button" class="primary" onclick="tutorialControl(\'resume\')">繼續教學</button>');}
  else{
   if(i>0)buttons.push('<button type="button" onclick="tutorialControl(\'back\')">上一步</button>');
   if(unavail||step.optional)buttons.push('<button type="button" onclick="tutorialControl(\'skipStep\')">略過此步</button>');
   if(step.advance.type==='next'||explainOnly||missing||testing())buttons.push(`<button type="button" class="primary" onclick="tutorialControl('next')">${i===n-1?'完成':'下一步'}</button>`);
  }
  if(session.mode==='normal'&&m.skippable)buttons.push('<button type="button" onclick="tutorialControl(\'skipAll\')">跳過教學</button>');
  buttons.push(`<button type="button" onclick="tutorialControl('close')">${session.mode==='normal'?'稍後再看':'結束'}</button>`);
  return `<div class="tutorial-card-head"><span>${M.CATEGORIES[m.category]&&M.CATEGORIES[m.category]!==m.title?esc2(M.CATEGORIES[m.category])+' · ':''}${esc2(m.title)}</span>${mode}<span class="tutorial-count">${i+1} / ${n}</span></div><h3>${esc2(step.title)}</h3><p>${esc2(step.text)}</p>${explainOnly?'<p class="tutorial-note">重播時只說明，不需要實際操作。</p>':''}${session.paused?`<p class="tutorial-warn">教學已暫停：${esc2(session.reason)}</p>`:unavail?`<p class="tutorial-warn">目前無法進行這一步：${esc2(unavail)}</p>`:wait?`<p class="tutorial-wait">${esc2(wait)}</p>`:''}${missing}<div class="tutorial-card-actions">${buttons.join('')}</div>`;
 }
 function place(card,rect,placement){
  const W=innerWidth,H=innerHeight,cw=card.offsetWidth,ch=card.offsetHeight,gap=12;let x,y;
  if(!rect||placement==='center'||W<640){card.dataset.dock=!rect||placement==='center'?'center':'bottom';x=(W-cw)/2;y=!rect||placement==='center'?(H-ch)/2:(rect.top>H/2?12:H-ch-12);}
  else{
   delete card.dataset.dock;
   const room={bottom:H-rect.bottom,top:rect.top,right:W-rect.right,left:rect.left},side=placement==='auto'?(room.bottom>=ch+gap?'bottom':room.top>=ch+gap?'top':room.right>=cw+gap?'right':room.left>=cw+gap?'left':'bottom'):placement;
   if(side==='bottom'||side==='top'){x=rect.left+rect.width/2-cw/2;y=side==='bottom'?rect.bottom+gap:rect.top-ch-gap;}
   else{y=rect.top+rect.height/2-ch/2;x=side==='right'?rect.right+gap:rect.left-cw-gap;}
  }
  card.style.left=Math.max(8,Math.min(W-cw-8,x))+'px';card.style.top=Math.max(8,Math.min(H-ch-8,y))+'px';
 }
 let ringEl=null;
 function draw(){
  if(typeof document.createElement!=='function'||!document.body)return;
  const card=layer('tutorial-card','section'),spot=layer('tutorial-spotlight'),box=layer('tutorial-notices');
  card.setAttribute('aria-live','polite');card.setAttribute('role','dialog');card.setAttribute('aria-label','教學');spot.setAttribute('aria-hidden','true');
  // Notices: non-blocking cards; at most three shown.
  const shown=playing()?[...notices.entries()].filter(([id])=>byId(id)).slice(0,3):[];
  const html=shown.map(([id,n])=>{const m=byId(id);return `<div class="tutorial-notice" data-tutorial-notice="${esc2(id)}"><b>${n.kind==='revision'?'教學已更新：':'新功能：'}${esc2(m.title)}</b><p>${esc2(n.kind==='revision'?'內容有新的步驟，可以重新看一次。':m.trigger.notifyText||m.description)}</p><div class="tutorial-card-actions"><button type="button" class="primary" onclick="tutorialNotice('${esc2(id)}','go')">${m.trigger.type==='pageEnter'&&n.kind!=='revision'?'前往':'查看'}</button>${n.kind!=='revision'&&m.skippable?`<button type="button" onclick="tutorialNotice('${esc2(id)}','skip')">不需要</button>`:''}<button type="button" onclick="tutorialNotice('${esc2(id)}','later')">關閉</button></div></div>`;}).join('');
  if(box.dataset.html!==html){box.innerHTML=html;box.dataset.html=html;}box.hidden=!html||!!session;
  const c=current();
  if(!c||!playing()){card.hidden=true;spot.hidden=true;ringOff();lastStatus='';return;}
  const html2=cardHTML(c);if(card.dataset.html!==html2){card.innerHTML=html2;card.dataset.html=html2;}
  card.dataset.type=c.m.type;card.hidden=false;follow();
 }
 function ringOff(){ringEl?.classList.remove('tutorial-ring');ringEl=null;}
 // Position the card and the highlight on every frame tick; cheap (a few rects).
 function follow(){
  const c=current(),card=document.getElementById('tutorial-card'),spot=document.getElementById('tutorial-spotlight');
  if(!c||!card||card.hidden){if(spot)spot.hidden=true;ringOff();return;}
  const target=session.paused?{state:'none',el:null}:resolve(c.step.target),dlg=modal();
  const host=dlg&&(!target.el||dlg.contains(target.el))?dlg:document.body;if(card.parentElement!==host)host.appendChild(card);
  // Something unrelated is open in the dialog: step back and let the player finish it.
  card.classList.toggle('tutorial-card-quiet',!!dlg&&host!==dlg);
  const el=target.state==='found'?target.el:null;
  if(el&&(dlg?.contains(el)||c.m.type!=='guide')){spot.hidden=true;if(ringEl!==el){ringOff();ringEl=el;el.classList.add('tutorial-ring');}}
  else ringOff();
  if(el&&!dlg&&c.m.type==='guide'){const r=el.getBoundingClientRect();spot.hidden=false;spot.style.top=r.top-6+'px';spot.style.left=r.left-6+'px';spot.style.width=r.width+12+'px';spot.style.height=r.height+12+'px';}
  else spot.hidden=true;
  place(card,el?el.getBoundingClientRect():null,c.step.placement);
 }
 let scrolledFor='';
 function scrollTarget(){const c=current();if(!c||session.paused)return;const key=session.id+':'+session.index;if(scrolledFor===key)return;const {el,state}=resolve(c.step.target);if(state==='found'){scrolledFor=key;el.scrollIntoView?.({block:'center',behavior:'smooth'});}}

 // ---------- review (Settings → 教學回顧) ----------
 let reviewOpen='';
 globalThis.toggleTutorialReview=id=>{reviewOpen=reviewOpen===id?'':id;render();};
 globalThis.tutorialReviewView=function(){
  if(!party)return '';
  const rows=design.modules.filter(unlocked);
  if(!rows.length)return '<section class="panel option-row"><div><h2>教學回顧</h2><p class="small">目前沒有已解鎖的教學。</p></div></section>';
  return rows.map(m=>{
   const st=status(m),why=prologueRunning()?'序幕結束後才能重播':session&&session.id!==m.id?'另一個教學正在進行':!m.replayable?'這個教學不提供重播':'';
   const steps=reviewOpen===m.id?`<ol class="tutorial-review-steps">${m.steps.map(s=>`<li><b>${esc2(s.title)}</b>：${esc2(s.text)}</li>`).join('')}</ol>`:'';
   return `<section class="panel option-row tutorial-review" data-tutorial-review="${esc2(m.id)}"><div><h2>${esc2(m.title)} <span class="tag">${esc2(M.TYPES[m.type])}</span> <span class="tag">${esc2(STATUS_TEXT[st])}</span></h2><p class="small">${esc2(M.CATEGORIES[m.category])} · ${esc2(m.description)}</p>${steps}${why?`<p class="small">${esc2(why)}</p>`:''}</div><div class="actions"><button type="button" onclick="toggleTutorialReview('${esc2(m.id)}')">${reviewOpen===m.id?'收起說明':'查看說明'}</button><button type="button" class="primary" onclick="replayTutorial('${esc2(m.id)}')" ${why?'disabled':''}>${m.type==='guide'?'重新執行引導':'重新查看'}</button></div></section>`;
  }).join('');
 };

 // ---------- balance document ----------
 const ctx=d=>({quests:d.story?.quests,items:d.items});
 const exportBase=exportableBalance;exportableBalance=function(){return {...exportBase(),tutorials:copy(design)};};
 const validateBase=validateBalanceConfig;validateBalanceConfig=function(input){const d=validateBase(input);d.tutorials=M.validate(input.tutorials??M.defaults(),ctx(d));return d;};
 const applyBase=applyBalanceConfig;applyBalanceConfig=function(input,options={}){
  const d=validateBalanceConfig(input),old=design;design=d.tutorials;
  try{const out=applyBase(d,options);if(out===false){design=old;return out;}
   // A running session whose module disappeared or lost its steps ends safely; otherwise it stays on a step that exists.
   if(session&&!current())session=null;draw();return out;}catch(e){design=old;throw e;}
 };
 try{const d=JSON.parse(balanceSourceText()||'null');if(d?.tutorials)design=M.validate(d.tutorials,ctx(d));}catch(e){console.warn(e);}

 // ---------- save ----------
 const validatePartyBase=validateParty;validateParty=function(raw){const p=validatePartyBase(raw);const t=validateProgress(raw?.tutorials);if(t)p.tutorials=t;else delete p.tutorials;return p;};
 const packBase=packParty;packParty=function(){const out=packBase();if(party?.tutorials)out.tutorials=copy(party.tutorials);return out;};
 const loadBase=loadParty;loadParty=function(...args){const out=loadBase(...args);session=null;known=null;snoozed.clear();notices.clear();lastTab=null;ensure();return out;};
 // Only a character made through the prologue gets automatic guides; one made by a direct start(job) (old flow, tests)
 // is treated as already arrived, like the prologue does.
 // The prologue creates its character through the starter pack's asPrologue(); that marks it.
 const SP=globalThis.__EMBERWILD_STARTER_PACK;if(SP?.asPrologue){const base=SP.asPrologue;SP.asPrologue=function(action){viaPrologue=true;try{return base.call(this,action);}finally{viaPrologue=false;}};}
 const startBase=start;start=function(...args){creating=true;let out;try{out=startBase(...args);}finally{creating=false;}session=null;notices.clear();lastTab=null;if(party&&!party.tutorials)party.tutorials=fresh(viaPrologue);viaPrologue=false;known=null;trackGear();return out;};
 const newGameBase=newGame;newGame=function(...args){session=null;notices.clear();snoozed.clear();return newGameBase(...args);};

 const baseRender=render;render=function(...args){const out=baseRender(...args);try{evaluate();draw();}catch(e){console.warn(e);}return out;};
 installHooks();
 setInterval(()=>{try{if(!playing()){if(session&&session.mode!=='test'&&prologueRunning())session=null;draw();return;}evaluate();passiveCompletion();follow();scrollTarget();}catch(e){console.warn(e);}},200);
 addEventListener?.('resize',()=>follow());

 // ---------- developer API (balance editor preview) ----------
 function report(){
  const c=current(),m=c?.m,out={ready:!!party&&!!state,prologue:prologueRunning(),active:null};
  if(c){const t=resolve(c.step.target);out.active={id:m.id,title:m.title,mode:session.mode,paused:session.paused,reason:session.reason,step:session.index,stepId:c.step.id,stepTitle:c.step.title,steps:m.steps.length,page:currentPage(),stepPage:pageOf(c.step),
   target:{id:c.step.target,state:t.state,text:TARGET_TEXT[t.state]},advance:{type:c.step.advance.type,key:c.step.advance.key||'',explainOnly:replayExplain(c.step),met:c.step.advance.type==='condition'?ok(c.step.advance.condition):null},requires:explain(c.step.requires),unavailable:stepUnavailable(c)};}
  return out;
 }
 function moduleReport(id){const m=byId(id);if(!m||!party)return null;return {id,trigger:{type:m.trigger.type,page:m.trigger.page,notify:m.trigger.notify},prerequisites:{met:met(m.prerequisites),conditions:explain(m.prerequisites)},completion:{type:m.completion.type,met:m.completion.type==='condition'?met(m.completion.condition):null,conditions:m.completion.type==='condition'?explain(m.completion.condition):[]},record:copy(peek(id)||null),status:status(m)};}
 globalThis.__EMBERWILD_TUTORIAL=Object.freeze({
  get design(){return copy(design);},
  records:()=>copy(party?.tutorials||null),
  status:report,module:moduleReport,
  // Test mode: ignores prerequisites, writes no record, and works on whatever save the preview frame holds
  // (the developer preview keeps its storage in memory, apart from real player saves).
  test(id,{step=0}={}){if(session&&session.mode!=='test')return {ok:false,error:'玩家的教學正在進行，請先結束'};session=null;return begin(id,'test',step);},
  control:a=>tutorialControl(a),
  start:(id,mode='normal')=>begin(id,mode),
  targets:()=>Object.fromEntries(Object.keys(M.TARGETS).map(id=>[id,resolve(id).state])),
  value:c=>value(c),met,validateProgress,fresh,evaluate,draw
 });
 draw();
})();
