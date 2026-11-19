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
  cursor=null;const ok=completeStoryStage(q.id,choice,s.id);
  if(ok&&s.chapter.action==='recruit'&&partyMember(q.chapter.companion))toast(q.chapter.ui.companionJoined);
  return ok;
 }
 function recruit(q){
  const id=q.chapter.companion;if(!party||partyMember(id))return;
  globalThis.__EMBERWILD_RECRUIT_FOR_STORY?.(id);
  if(!partyMember(id))throw Error('夥伴未能加入隊伍，請稍後再試');
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

 function chapterView(){
  const c=current();if(!c)return null;const {q,s,r}=c,sc=scene(q,s);
  const head={eyebrow:sc.place||q.chapter.title,title:sc.name},base={sceneKey:'chapter:'+q.id,summary:s.description||s.name,head,attrs:`data-chapter="${esc(q.id)}" data-stage="${esc(s.id)}"`,actions:'',line:null,body:'',advance:null,skip:null,continueLabel:q.chapter.ui.continue||'繼續'};
  if(!linesRead(q,s)){
   if(!cursor||cursor.stage!==s.id)cursor={stage:s.id,index:0};
   cursor.index=Math.min(cursor.index,s.dialogue.length-1);
   const l=s.dialogue[cursor.index];
   return {...base,line:{speaker:speaker(l),kind:l.kind,text:playerText(l.text)},advance:'chapterNext',autoAdvance:!(cursor.index===s.dialogue.length-1&&isTask(s)&&!(s.chapter.action==='talk'&&S().met(s.conditions,r))&&!s.choices.length),continueLabel:isTask(s)?'前往任務':base.continueLabel,lineKey:s.id+':'+cursor.index,signature:['chapter',q.id,s.id,cursor.index,l.text].join('|')};
  }
  if(s.choices.length){
   const options=s.choices.filter(x=>S().met(x.conditions,r)).map(x=>`<button type="button" data-chapter-choice="${esc(x.id)}" onclick="chapterChoose('${esc(x.id)}')">${esc(playerText(x.text))}</button>`).join('');
   return {...base,history:s.dialogue.map(l=>({speaker:speaker(l),kind:l.kind,text:playerText(l.text)})),body:`<div class="story-window-choices chapter-choices" role="group" aria-label="選擇回應">${options}</div>`,signature:['chapter-choice',q.id,s.id,options.length].join('|')};
  }
  if(s.chapter.action==='talk'&&S().met(s.conditions,r))return {...base,body:`<div class="story-window-choices"><button type="button" class="primary" data-chapter-action onclick="chapterAction()">${esc(s.chapter.actionLabel||ui('resume'))}</button></div>`,signature:'chapter-talk|'+q.id+'|'+s.id};
  return null;
 }
 // ---------- start for saves that finished the prologue before chapters existed ----------
 const startFlag=q=>q.unlock.conditions.find(c=>c.type==='flag')?.key||'';
 const prologueDone=()=>{const p=S().prologueQuest();return !!p&&!!S().record(p.id)?.done;};
 function offerable(id){const q=party&&S().chapterQuests().find(x=>x.id===id);return !!q&&ready()&&prologueDone()&&!S().record(q.id)&&!!startFlag(q)&&!flags()[startFlag(q)];}
 // Only the start flag: the feature gate stays off for these players, who already use every page.
 globalThis.chapterBegin=function(id){
  if(!offerable(id)||offlineBusy())return false;const q=S().chapterQuests().find(x=>x.id===id);
  if(!S().transaction(()=>{party.story.flags[startFlag(q)]=true;S().sync();}))return false;
  cursor=null;render();return !!S().record(id);
 };

 // ---------- replay of finished quests (read only: nothing is granted, no record changes) ----------
 let replay=null;
 function replayLines(q,r){
  const out=[];
  for(const id of r.completed){
   const s=q.stages.find(x=>x.id===id);if(!s)continue;const scene=q.chapter?.scenes?.find(x=>x.id===s.chapter?.scene)?.name||q.prologue?.scenes?.[s.prologue?.scene-1]?.name||s.name;
   for(const l of [...s.dialogue,...(s.prologue?.after||[])])out.push({...l,title:scene});
   const pick=s.choices.find(c=>c.id===r.choices[s.id]);if(pick)out.push({kind:'player',speaker:'主角',text:pick.text.replace(/^「|」$/g,''),title:scene});
  }
  if(q.prologue?.chapter)for(const l of q.prologue.chapter.lines)out.push({...l,title:q.prologue.chapter.title});
  return out;
 }
 const finished=id=>{const q=party&&S().design.quests.find(x=>x.id===id),r=q&&S().record(id);return q&&r?.done?{q,r}:null;};
 globalThis.storyReplayable=id=>{const f=finished(id);return !!f&&replayLines(f.q,f.r).length>0;};
 globalThis.storyReplay=function(id){const f=finished(id);if(!f||!ready())return false;const lines=replayLines(f.q,f.r);if(!lines.length)return false;replay={id,name:f.q.name,lines,index:0};render();return true;};
 globalThis.storyReplayNext=function(){if(!replay)return;replay.index++;render();};
 globalThis.storyReplayEnd=function(){replay=null;render();};
 function replayView(){
  if(!replay||!ready())return null;const close=`<button type="button" data-story-replay-end onclick="storyReplayEnd()">結束重看</button>`;
  const l=replay.lines[replay.index],base={sceneKey:'replay:'+replay.id,head:{eyebrow:'重看 · '+replay.name,title:l?.title||replay.name},attrs:`data-story-replay="${esc(replay.id)}"`,actions:close,skip:null,line:null,body:'',advance:null,continueLabel:'繼續'};
  if(!l)return {...base,body:'<div class="prologue-box"><p class="prologue-hint">劇情到這裡結束。</p></div>',signature:'replay-end|'+replay.id};
  return {...base,line:{speaker:speaker(l),kind:l.kind,text:playerText(l.text)},advance:'storyReplayNext',lineKey:'replay:'+replay.index,signature:['replay',replay.id,replay.index].join('|')};
 }

 // ---------- chapter ending: shown once, right after the last stage ----------
 let ending=null;
 const endKey=q=>'chapter_end:'+q.id;
 function endingQuest(){if(!ready()||current())return null;return S().chapterQuests().find(q=>q.chapter.ending&&S().record(q.id)?.done&&!flags()[endKey(q)])||null;}
 globalThis.chapterEndNext=function(){if(ending){ending.index++;render();}};
 globalThis.chapterEndClose=function(){const q=endingQuest();ending=null;if(q)S().transaction(()=>{party.story.flags[endKey(q)]=true;});render();};
 function endingView(){
  const q=endingQuest();if(!q){ending=null;return null;}const e=q.chapter.ending;
  if(!ending||ending.id!==q.id)ending={id:q.id,index:0};
  const last=q.chapter.scenes.at(-1)||{name:q.chapter.title,place:''},l=e.lines[ending.index],base={sceneKey:'chapter:'+q.id,head:{eyebrow:last.place||q.chapter.title,title:last.name},attrs:`data-chapter-ending="${esc(q.id)}"`,actions:'',skip:null,line:null,body:'',advance:null,continueLabel:q.chapter.ui.continue||'繼續'};
  if(l)return {...base,line:{speaker:speaker(l),kind:l.kind,text:playerText(l.text)},advance:'chapterEndNext',lineKey:'end:'+ending.index,signature:['chapter-end',q.id,ending.index].join('|')};
  return {...base,body:`<div class="prologue-chapter"><h2 class="prologue-chapter-title">${esc(e.title)}</h2></div>`,actions:`<button type="button" class="primary" data-chapter-end onclick="chapterEndClose()">${esc(e.button||'結束')}</button>`,signature:'chapter-end-title|'+q.id};
 }
 const view=()=>replayView()||chapterView()||endingView();

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
 const baseNewGame=newGame;newGame=function(...args){cursor=null;replay=null;ending=null;return baseNewGame(...args);};

 globalThis.__EMBERWILD_CHAPTER={
  // Roster changes commit with the stage; a failed save restores both.
  commitStage(q,s){if(s.chapter.action==='allies')for(const a of q.chapter.allies)ALLY()?.remove(a.id);if(s.chapter.action==='recruit')recruit(q);},
  current:()=>{const c=current();return c?{quest:c.q.id,stage:c.s.id,read:linesRead(c.q,c.s),line:cursor?.stage===c.s.id?cursor.index:0}:null;},
  // The task banner as HTML (the headless tests have no layout to insert it into).
  banner:()=>{const c=current();return c&&linesRead(c.q,c.s)&&!c.s.choices.length&&isTask(c.s)?bannerHTML(c.q,c.s,c.r):'';},
  offerable,offerText:id=>S().chapterQuests().find(x=>x.id===id)?.description||'',replaying:()=>replay?{quest:replay.id,index:replay.index,total:replay.lines.length}:null,ending:()=>endingQuest()?.id||null,
  gated,pageOpen,huntLocked,regionLocked
 };
})();
