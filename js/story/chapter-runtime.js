/* Chapter presentation (v0.150). A chapter is an ordinary story quest that carries a `chapter` field (all text is balance
   data, see docs/CHAPTER1.md). This file plays its stages in the shared story window, runs the few fixed stage actions
   (`allies` temporary allies for a fight, `talk` a button that moves the story on, `recruit` the companion joins), and
   keeps the feature gate: while the story flag named by `chapter.gate` is on, only the pages the chapter lists, plus the
   ones a story unlock (`page_<id>`) has opened, can be used. Progress is the ordinary story record; the only extra state
   is a story flag per stage once its lines have been read. */
(()=>{
 'use strict';
 const S=()=>globalThis.__EMBERWILD_STORY,ALLY=()=>globalThis.__EMBERWILD_TEMP_ALLY;
 let cursor=null,busy=false;
 const flags=()=>party?.story?.flags||{},unlocks=()=>party?.story?.unlocks||{};
 const ready=()=>!!party&&!!state&&!globalThis.__EMBERWILD_TITLE?.open()&&!S()?.prologueRunning?.()&&!globalThis.__EMBERWILD_PROLOGUE?.active?.();
 // The chapter being played: started (its record exists), not finished.
 function current(){
  if(!ready())return null;
  for(const q of S().chapterQuests()){const r=S().record(q.id);if(!r||r.done)continue;const s=q.stages.find(x=>x.id===r.current);if(s)return {q,r,s};}
  return null;
 }
 const gateQuest=()=>party?S().chapterQuests().find(q=>flags()[q.chapter.gate]):null;
 // Gate: on while any chapter's gate flag is set. Pages: the chapter's list plus story unlocks `page_<id>`.
 const gated=()=>ready()&&!!gateQuest();
 function pageOpen(id){if(!gated())return true;const c=gateQuest().chapter;return c.openPages.includes(id)||!!unlocks()['page_'+id];}
 const huntLocked=()=>gated()&&!unlocks().feature_hunt_mode,regionLocked=()=>gated()&&!unlocks().feature_regions;
 const ui=k=>gateQuest()?.chapter?.ui?.[k]||current()?.q.chapter.ui?.[k]||'';
 const readKey=(q,s)=>'chapter_read:'+q.id+'/'+s.id;
 const linesRead=(q,s)=>!s.dialogue.length||!!flags()[readKey(q,s)];
 const isTask=s=>!!s.encounter?.enabled||!!s.conditions.conditions.length||s.chapter.action==='talk'||s.chapter.action==='allies';
 const playerText=t=>String(t).replaceAll('{player}',characterName(playerHero()));
 const speaker=l=>l.kind==='player'?characterName(playerHero()):l.kind==='narrator'?'':playerText(l.speaker);
 const scene=(q,s)=>q.chapter.scenes.find(x=>x.id===s.chapter.scene)||{name:s.name,place:''};
 const offlineBusy=()=>{if(globalThis.EmberwildOffline?.busy){toast('正在整理進度，請稍候再試一次');return true;}return false;};

 function markRead(q,s){if(linesRead(q,s))return true;return S().transaction(()=>{party.story.flags[readKey(q,s)]=true;});}
 function complete(q,s,choice=''){
  if(offlineBusy())return false;
  // Temporary allies leave once their fight is over; the record keeps no trace of them.
  if(s.chapter.action==='allies')for(const a of q.chapter.allies)ALLY()?.remove(a.id);
  cursor=null;const ok=completeStoryStage(q.id,choice,s.id);
  if(ok&&s.chapter.action==='recruit')recruit(q);
  return ok;
 }
 function recruit(q){
  const id=q.chapter.companion;if(!party||partyMember(id))return;
  globalThis.recruitCompanion?.(id);
  if(partyMember(id))toast(ui('companionJoined'));
 }
 // Fight allies join the lineup next to the player; the player stays first.
 function ensureAllies(q){
  const A=ALLY();if(!A)return;let added=false;
  for(const a of q.chapter.allies)if(!A.member(a.id)){if(A.add(a.id,a.template,a.name))added=true;}
  const key=memberKey(party.members[0]),want=[key,...q.chapter.allies.map(a=>a.id).filter(id=>A.member(id))].slice(0,3);
  if(added||want.some(k=>!party.active.includes(k))){party.active=want;syncParty();save();if(added)toast(ui('alliesJoined'));}
 }
 // After the lines: a choice waits in the window, a task waits on the banner, anything else completes at once.
 function afterLines(q,s){
  if(!markRead(q,s))return;cursor=null;
  if(s.choices.length)return;
  if(isTask(s)){if(s.chapter.action==='allies')ensureAllies(q);if(s.guides[0]&&s.guides[0]!==tab&&pageOpen(s.guides[0]))baseSetTab(s.guides[0]);return;}
  complete(q,s);
 }
 globalThis.chapterNext=function(){
  const c=current();if(!c||linesRead(c.q,c.s))return;if(!cursor||cursor.stage!==c.s.id)cursor={stage:c.s.id,index:0};
  if(cursor.index<c.s.dialogue.length-1){cursor.index++;return render();}
  afterLines(c.q,c.s);render();
 };
 globalThis.chapterChoose=function(id){const c=current();if(!c||!linesRead(c.q,c.s)||!c.s.choices.some(x=>x.id===id))return false;return complete(c.q,c.s,id);};
 globalThis.chapterStartBattle=function(){
  const c=current();if(!c||!c.s.encounter?.enabled||!linesRead(c.q,c.s)||party.questChallenge)return false;
  if(c.s.chapter.action==='allies')ensureAllies(c.q);
  if(tab!=='battle')baseSetTab('battle');
  return startQuestEncounter(c.q.id+'/'+c.s.id);
 };
 globalThis.chapterAction=function(){const c=current();if(!c||c.s.chapter.action!=='talk'||!linesRead(c.q,c.s)||!S().met(c.s.conditions,c.r))return false;if(running)stopTeamExploration();return complete(c.q,c.s);};
 globalThis.chapterResume=function(){const c=current();if(!c||!linesRead(c.q,c.s)||!S().met(c.s.conditions,c.r)||party.questChallenge)return false;if(running)stopTeamExploration();return complete(c.q,c.s);};
 // The main-story page reads chapter quests through this window too.
 const baseRead=readStory;readStory=function(id){const c=current();if(c&&c.q.id===id){cursor=null;if(c.s.dialogue.length)party.story.flags[readKey(c.q,c.s)]=false;render();return;}return baseRead(id);};

 function view(){
  const c=current();if(!c)return null;const {q,s,r}=c,sc=scene(q,s);
  const head={eyebrow:sc.place||q.chapter.title,title:sc.name},base={head,attrs:`data-chapter="${esc(q.id)}" data-stage="${esc(s.id)}"`,actions:'',line:null,body:'',advance:null,skip:null,continueLabel:q.chapter.ui.continue||'繼續'};
  if(!linesRead(q,s)){
   if(!cursor||cursor.stage!==s.id)cursor={stage:s.id,index:0};
   cursor.index=Math.min(cursor.index,s.dialogue.length-1);
   const l=s.dialogue[cursor.index];
   return {...base,line:{speaker:speaker(l),kind:l.kind,text:playerText(l.text)},advance:'chapterNext',lineKey:s.id+':'+cursor.index,signature:['chapter',q.id,s.id,cursor.index,l.text].join('|')};
  }
  if(s.choices.length){
   const l=s.dialogue.at(-1),last=l?`<div class="prologue-box prologue-${esc(l.kind)}">${speaker(l)?`<b class="prologue-speaker">${esc(speaker(l))}</b>`:''}<p class="${l.kind==='narrator'?'prologue-narration':'prologue-text'}">${esc(playerText(l.text))}</p></div>`:'';
   const options=s.choices.filter(x=>S().met(x.conditions,r)).map(x=>`<button type="button" data-chapter-choice="${esc(x.id)}" onclick="chapterChoose('${esc(x.id)}')">${esc(playerText(x.text))}</button>`).join('');
   return {...base,body:last+`<div class="story-window-choices chapter-choices" role="group" aria-label="選擇回應">${options}</div>`,signature:['chapter-choice',q.id,s.id,options.length].join('|')};
  }
  return null;
 }
 // Wrapping the story's dialogue view lets the prologue's draw() (which already renders the window on every frame) show
 // the chapter without a second caller fighting over the same window.
 const baseView=S().dialogueView;S().dialogueView=()=>view()||baseView();

 function bannerHTML(q,s,r){
  const done=S().met(s.conditions,r),fight=!!s.encounter?.enabled,key=q.id+'/'+s.id,runningFight=fight&&!!party.questChallenge;
  const lost=fight&&!done&&globalThis.expeditionChallengeResult?.key===key&&globalThis.expeditionChallengeResult.success===false;
  const guides=s.guides.filter(g=>g!==tab&&pageOpen(g)).map(g=>`<button type="button" onclick="setTab('${g}')">${esc(EmberwildStory.GUIDES[g])}</button>`).join('');
  let action='';
  if(fight&&!done)action=runningFight?`<span class="tag">${esc(ui('battleRunning'))}</span>`:`<button type="button" class="primary" data-chapter-battle onclick="chapterStartBattle()">${esc(ui(lost?'retryBattle':'startBattle'))}</button>`;
  else if(s.chapter.action==='talk')action=`<button type="button" class="primary" data-chapter-action onclick="chapterAction()">${esc(s.chapter.actionLabel||ui('resume'))}</button>`;
  else if(done)action=`<button type="button" class="primary" data-chapter-resume onclick="chapterResume()">${esc(ui('resume'))}</button>`;
  const objectives=s.conditions.conditions.filter(x=>x.type==='explore').map(x=>`<p class="small" data-chapter-progress>探索進度 ${Math.min(x.count,S().progress(x,r))} / ${x.count}</p>`).join('');
  return `<aside class="prologue-task chapter-task ${done?'prologue-task-done':''}" data-chapter-stage="${esc(s.id)}" aria-live="polite"><div class="prologue-task-text"><b>${esc(scene(q,s).name)}</b><p>${esc(s.chapter.hint||s.description)}</p>${objectives}</div><div class="actions">${guides}${action}</div></aside>`;
 }
 // Lock what the gate keeps closed: menu entries, page tabs, header buttons, the hunting-mode switch and other maps.
 function lockControls(){
  if(!gated()||typeof document.querySelectorAll!=='function')return;
  // A locked entry shows no reminder badge: it cannot be opened yet.
  const disable=b=>{if(!b.disabled){b.disabled=true;b.setAttribute('aria-disabled','true');b.classList.add('chapter-locked');b.title=ui('locked');}b.querySelectorAll?.('.quest-new,.number-badge').forEach(x=>x.remove());};
  const nav=EmberwildNavigation.design.groups;
  for(const b of document.querySelectorAll('[data-subpage]'))if(!pageOpen(b.dataset.subpage))disable(b);
  for(const b of document.querySelectorAll('[data-nav-group]')){
   const g=nav.find(x=>x.id===b.dataset.navGroup);if(!g)continue;const open=g.pages.filter(p=>pageOpen(p.id));
   if(!open.length){disable(b);continue;}
   if(!pageOpen(b.dataset.page)){const p=open[0];b.dataset.page=p.id;b.setAttribute('onclick',p.id.startsWith('story-')?`openStory('','${p.id.slice(6)}')`:`setTab('${p.id}')`);}
  }
  for(const id of ['mailbox','achievements'])if(!pageOpen(id)){const b=document.getElementById('utilityButton-'+id);if(b)disable(b);}
  if(huntLocked()){for(const b of document.querySelectorAll('[data-hunting-switch]'))disable(b);for(const s of document.querySelectorAll('select[aria-label="狩獵模式"]'))disable(s);}
  if(regionLocked()){
   for(const s of document.querySelectorAll('select[aria-label="探索地圖"]'))for(const o of s.options)if(o.value!=='0')o.disabled=true;
   for(const b of document.querySelectorAll('main [onclick^="setExplorationCategory"]'))if(!/'explore'/.test(b.getAttribute('onclick')))disable(b);
  }
 }
 function draw(){
  if(!party||!state)return;
  if(gated()&&huntLocked()&&party.huntingMode!=='single'){party.huntingMode='single';save();}
  lockControls();
  const c=current();if(!c){return;}
  const {q,s,r}=c;
  // A render from inside a combat round sees the frozen battle lineup; story changes wait for the next ordinary render.
  const frozen=!!globalThis.EmberwildBattleConfiguration?.active;
  if(!linesRead(q,s)||s.choices.length)return;
  if(!isTask(s)){if(!busy&&!frozen){busy=true;try{complete(q,s);}finally{busy=false;}}return;}
  // A task stage whose objective is met moves on by itself, except a button-driven one.
  if(s.chapter.action!=='talk'&&!frozen&&S().met(s.conditions,r)&&!party.questChallenge&&!document.getElementById('modal')?.open&&!busy&&!globalThis.EmberwildOffline?.busy){
   busy=true;try{if(running)stopTeamExploration();complete(q,s);}finally{busy=false;}return;
  }
  const app=document.getElementById('app'),host=app?.querySelector?.('.layout>main');
  if(host&&!host.querySelector('.chapter-task'))host.insertAdjacentHTML('afterbegin',bannerHTML(q,s,r));
 }

 const baseRender=render;render=function(...args){const out=baseRender(...args);try{draw();}catch(e){console.warn(e);}return out;};
 const baseSetTab=setTab;setTab=function(id){
  if(gated()){const page=id==='story'?'story-'+(globalThis.currentStoryCategory?.()||'main'):id;if(!pageOpen(page)){toast(ui('locked'));return false;}}
  return baseSetTab(id);
 };
 const baseCategory=setStoryCategory;setStoryCategory=function(type){if(gated()&&!pageOpen('story-'+type)){toast(ui('locked'));return false;}return baseCategory(type);};
 const baseOpenStory=openStory;openStory=function(id='',type=''){const t=S()?.questType(id)||type||globalThis.currentStoryCategory?.()||'main';if(gated()&&!pageOpen('story-'+t)){toast(ui('locked'));return false;}return baseOpenStory(id,type);};
 const baseUtility=openUtilityPanel;openUtilityPanel=function(id){if(gated()&&['mailbox','achievements'].includes(id)&&!pageOpen(id)){toast(ui('locked'));return false;}return baseUtility(id);};
 const baseHunt=setHuntingMode;setHuntingMode=function(mode){if(huntLocked()&&mode!=='single'){toast(ui('modeLocked'));return false;}return baseHunt(mode);};
 const baseChoose=chooseMap;chooseMap=function(mi){if(regionLocked()&&mi!==0){toast(ui('regionLocked'));return false;}return baseChoose(mi);};
 const baseSelect=selectExplorationMap;selectExplorationMap=function(mi){if(regionLocked()&&mi!==0){toast(ui('regionLocked'));return render();}return baseSelect(mi);};
 const baseCat=setExplorationCategory;setExplorationCategory=function(cat){if(regionLocked()&&cat!=='explore'){toast(ui('locked'));return false;}return baseCat(cat);};
 // The old "go to the main story" strip is redundant while a chapter is being played.
 const baseTutorial=tutorial;tutorial=function(...args){return current()?'':baseTutorial(...args);};
 const baseNewGame=newGame;newGame=function(...args){cursor=null;return baseNewGame(...args);};

 globalThis.__EMBERWILD_CHAPTER={
  current:()=>{const c=current();return c?{quest:c.q.id,stage:c.s.id,read:linesRead(c.q,c.s),line:cursor?.stage===c.s.id?cursor.index:0}:null;},
  // The task banner as HTML (the headless tests have no layout to insert it into).
  banner:()=>{const c=current();return c&&linesRead(c.q,c.s)&&!c.s.choices.length&&isTask(c.s)?bannerHTML(c.q,c.s,c.r):'';},
  gated,pageOpen,huntLocked,regionLocked
 };
})();
