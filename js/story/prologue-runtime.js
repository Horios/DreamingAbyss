/* Prologue presentation. The script is the `prologue` quest in the story design (all text is balance data); this file only
   plays it and runs the fixed system actions named by EmberwildStory.PROLOGUE_ACTIONS. Progress after character creation
   is the ordinary story record; before that a small per-slot draft keeps the name and the stage. */
(()=>{
 'use strict';
 const M=EmberwildStory,S=()=>globalThis.__EMBERWILD_STORY,HELPER=()=>globalThis.__EMBERWILD_PROLOGUE_HELPER;
 const quest=()=>S()?.prologueQuest()||null,P=()=>quest()?.prologue||null,ui=k=>P()?.ui?.[k]||'';
 const DRAFT_KEY=environmentStorageKey('emberwild-prologue-draft-v1-slot-'+ACTIVE_SAVE_SLOT);
 const TASK_ACTIONS=['skillLesson','recruitHelper','equipLesson'];
 let cursor=null,taskOpen=false,chosenJob=null,bannerNotice='';

 function readDraft(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(d&&d.version===1&&typeof d.stage==='string'&&typeof d.name==='string')return {version:1,stage:d.stage,name:validCharacterName(d.name)};}catch{}return null;}
 function writeDraft(d){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(d));return true;}catch{toast('無法儲存進度，請檢查瀏覽器儲存權限');return false;}}
 const clearDraft=()=>{try{localStorage.removeItem(DRAFT_KEY);}catch{}};

 // The title screen comes first after every page load; the prologue resumes once the save slot is entered.
 const inPrologue=()=>!!party&&!globalThis.__EMBERWILD_TITLE?.open()&&!!S()?.prologueRunning();
 // Before a character exists the prologue replaces the class selection screen.
 const creating=()=>!state&&!!quest()&&!!globalThis.__EMBERWILD_TITLE?.creatingCharacter();
 const active=()=>inPrologue()||creating();
 const record=()=>S().record(quest().id);
 const stageById=id=>quest().stages.find(s=>s.id===id)||null;
 function currentStage(){const q=quest();if(!q)return null;if(inPrologue())return stageById(record().current);const d=readDraft();return stageById(d?.stage)||stageById(q.entry);}
 const encounterKey=s=>quest().id+'/'+s.id;
 const isTask=s=>TASK_ACTIONS.includes(s.prologue.action)||!!s.encounter?.enabled;

 function skillInstalled(){const h=playerHero(),K=globalThis.__EMBERWILD_SKILLS;return (h.skillLoadout?.active||[]).some(id=>{const sk=id&&K.byId(id);return !!sk&&K.learned(h,sk);});}
 // The starter weapon is the bag item that still carries its starter record; the charm is checked by the stage's own gearWorn condition.
 function gearWorn(s){const h=playerHero(),worn=new Set(h.equipped.filter(Boolean));return h.bag.some(g=>g.starterPack&&worn.has(g.id))&&S().met(s.conditions,record());}
 function helperReady(){const id=HELPER().id;return !!HELPER().member()&&party.active.includes(id);}
 function satisfied(s){
  const a=s.prologue.action;
  if(a==='nameHero')return !!state||!!readDraft()?.name;
  if(a==='chooseClass')return !!state;
  if(!inPrologue())return false;
  if(a==='skillLesson')return skillInstalled();
  if(a==='recruitHelper')return helperReady();
  if(a==='equipLesson')return gearWorn(s);
  return S().met(s.conditions,record());
 }
 // On entry or reload: an already satisfied step resumes at its closing lines, otherwise the stage is read from the top.
 function place(s){const done=(s.prologue.action&&s.prologue.action!=='enterWorld'||s.encounter?.enabled)&&satisfied(s);cursor={stage:s.id,phase:done?'after':'before',index:0};taskOpen=false;bannerNotice='';}
 // The script can change under a running prologue (a balance update): keep the cursor inside the lines that exist now.
 function sync(){const s=currentStage();if(!s){cursor=null;return null;}if(!cursor||cursor.stage!==s.id)place(s);const n=linesOf(s).length;if(cursor.index>=n)cursor.index=Math.max(0,n-1);return s;}

 function linesOf(s){return cursor.phase==='before'?s.dialogue:cursor.phase==='after'?s.prologue.after:cursor.phase==='chapter'?P().chapter.lines:[];}
 function speaker(line){return line.kind==='player'?(state?characterName(playerHero()):readDraft()?.name||line.speaker):line.kind==='narrator'?'':line.speaker;}

 function finishStage(s){
  if(!inPrologue()){const d=readDraft()||{version:1,stage:s.id,name:''};d.stage=s.next;if(!writeDraft(d))return;cursor=null;return draw();}
  if(!completeStoryStage(quest().id,'',s.id)){if(globalThis.EmberwildOffline?.busy)toast('正在整理進度，請稍候再試一次');return;}
  cursor=null;taskOpen=false;draw();
 }
 function afterLines(s){
  if(cursor.phase==='before'){
   const a=s.prologue.action;
   if(a==='enterWorld'){cursor={stage:s.id,phase:'chapter',index:0};return;}
   if(a||s.encounter?.enabled||s.conditions.conditions.length){cursor={stage:s.id,phase:satisfied(s)?'after':'action',index:0};if(cursor.phase==='action')beginAction(s);return;}
  }
  if(cursor.phase==='chapter')return;
  if(cursor.phase==='before'||cursor.phase==='action'){cursor={stage:s.id,phase:'after',index:0};if(s.prologue.after.length)return;}
  finishStage(s);
 }
 function beginAction(s){
  const a=s.prologue.action;
  if(a==='nameHero'||a==='chooseClass'||a==='recruitHelper'&&!HELPER().member())return;
  if(a==='equipLesson')bannerNotice=ui('giftReceived');
  openTask(s);
 }
 function openTask(s){taskOpen=true;if(s.guides.length&&!s.guides.includes(tab))return baseSetTab(s.guides[0]);}

 globalThis.prologueNext=function(){
  const s=sync();if(!s||!cursor)return;const lines=linesOf(s);
  if(cursor.index<lines.length-1){cursor.index++;return draw();}
  if(cursor.phase==='chapter')return;
  afterLines(s);draw();
 };
 globalThis.prologueConfirmName=function(){
  const s=sync();if(!s||s.prologue.action!=='nameHero'||cursor.phase!=='action')return;
  let name;try{name=validCharacterName(document.getElementById('prologue-name')?.value||'');}catch(e){return toast(e.message);}
  if(!name)return toast(ui('nameRequired'));
  if(!writeDraft({version:1,stage:s.id,name}))return;
  afterLines(s);draw();
 };
 globalThis.prologuePickClass=function(job){if(Number.isInteger(job)&&CLASSES[job]){chosenJob=job;draw();}};
 globalThis.prologueConfirmClass=function(){
  const s=sync(),d=readDraft();if(!s||s.prologue.action!=='chooseClass'||cursor.phase!=='action'||state||!d?.name||!CLASSES[chosenJob])return;
  const q=quest(),before=q.stages.slice(0,q.stages.indexOf(s)).map(x=>x.id),job=chosenJob;
  globalThis.__EMBERWILD_STARTER_PACK.asPrologue(()=>start(job));
  if(!state||!party)return;
  const h=playerHero();h.name=d.name;
  // The lesson installs the first skill by hand, so creation leaves the active slots empty.
  for(let i=0;i<(h.skillLoadout?.active||[]).length;i++)if(h.skillLoadout.active[i])chooseSkillSlot('active',i,null);
  S().begin(q.id,s.id,before);
  if(save()!==true)return;
  clearDraft();chosenJob=null;cursor={stage:s.id,phase:'after',index:0};
  if(!s.prologue.after.length)return finishStage(s);
  render();
 };
 globalThis.prologueAcceptHelper=function(){
  const s=sync();if(!s||!inPrologue()||s.prologue.action!=='recruitHelper'||cursor.phase!=='action'||HELPER().member())return;
  const cfg=P().helper,h=HELPER().add(cfg.templates[playerHero().job],cfg.name);if(!h)return toast('目前無法加入隊友');
  if(save()!==true){HELPER().remove();return;}
  bannerNotice=ui('helperJoined');openTask(s);render();
 };
 globalThis.prologueStartBattle=function(){const s=sync();if(!s||!inPrologue()||!s.encounter?.enabled||satisfied(s))return;bannerNotice='';if(tab!=='battle')baseSetTab('battle');return startQuestEncounter(encounterKey(s));};
 globalThis.prologueOpenTask=function(){const s=sync();if(s&&inPrologue()&&cursor.phase==='action'&&isTask(s)){openTask(s);render();}};
 globalThis.prologueReturn=function(){const s=sync();if(!s||!inPrologue()||cursor.phase!=='action'||!satisfied(s))return;taskOpen=false;bannerNotice='';afterLines(s);render();};
 globalThis.prologueEnter=function(){
  const s=sync();if(!s||!inPrologue()||s.prologue.action!=='enterWorld'||cursor.phase!=='chapter')return;
  if(!completeStoryStage(quest().id,'',s.id)){if(globalThis.EmberwildOffline?.busy)toast('正在整理進度，請稍候再試一次');return;}
  cursor=null;taskOpen=false;baseSetTab('battle');
 };

 // The scene as a view for the shared story window: one typed line at a time, or the interaction of the current step.
 function sceneView(s){
  const p=P(),scene=p.scenes[s.prologue.scene-1],a=s.prologue.action,lines=linesOf(s),line=lines[cursor.index];
  const view={head:{eyebrow:ui('place'),title:scene.name},attrs:`data-scene="${s.prologue.scene}" data-stage="${esc(s.id)}" data-phase="${cursor.phase}"`,decor:'<div class="prologue-light" aria-hidden="true"><i></i><i></i><i></i></div>',
   actions:state?'':`<button type="button" class="prologue-back" onclick="backToTitle()">${esc(ui('backToTitle'))}</button>`,continueLabel:ui('continue'),lineKey:cursor.phase+':'+cursor.index,
   // The prologue cannot be skipped: it offers no skip handler, and the window refuses to skip a view without one.
   skip:null,advance:null,line:null,body:'',before:''};
  const box=inner=>`<div class="prologue-box">${inner}</div>`,hint=`<p class="prologue-hint">${esc(s.prologue.hint)}</p>`;
  if(cursor.phase==='chapter'){
   const last=cursor.index>=lines.length-1;
   view.before=`<div class="prologue-chapter">${lines.slice(0,cursor.index).map(l=>`<p class="prologue-narration">${esc(l.text)}</p>`).join('')}</div>`;
   if(line)view.line={speaker:'',kind:'narrator',text:line.text};
   if(last){view.body=`<div class="prologue-chapter"><h2 class="prologue-chapter-title">${esc(p.chapter.title)}</h2></div>`;view.actions+=`<button type="button" class="primary" onclick="prologueEnter()">${esc(ui('begin'))}</button>`;}
   else view.advance='prologueNext';
  }else if(cursor.phase==='action'&&a==='nameHero'){
   view.body=box(`${hint}<label for="prologue-name">${esc(ui('nameLabel'))}</label><input id="prologue-name" type="text" maxlength="20" autocomplete="off" enterkeyhint="done" placeholder="${esc(ui('namePlaceholder'))}" value="${esc(readDraft()?.name||'')}" onkeydown="if(event.key==='Enter')prologueConfirmName()">`);
   view.actions+=`<button type="button" class="primary" onclick="prologueConfirmName()">${esc(ui('nameConfirm'))}</button>`;view.focus='#prologue-name';
  }else if(cursor.phase==='action'&&a==='chooseClass'){
   view.body=box(`${hint}<div class="prologue-options" role="radiogroup">${s.prologue.options.map(o=>`<button type="button" role="radio" aria-checked="${chosenJob===o.job}" class="prologue-option${chosenJob===o.job?' selected':''}" data-job="${o.job}" onclick="prologuePickClass(${o.job})"><b>${esc(o.text)}</b><span>${esc(o.description)}</span></button>`).join('')}</div>`);
   view.actions+=`<button type="button" class="primary" onclick="prologueConfirmClass()" ${CLASSES[chosenJob]?'':'disabled'}>${esc(ui('classConfirm'))}</button>`;
  }else if(cursor.phase==='action'&&a==='recruitHelper'&&!HELPER().member()){
   const cfg=p.helper;
   view.body=box(`${hint}<article class="prologue-helper"><h3>${esc(cfg.name)}</h3><p class="small">${esc(cfg.title)}</p><p>${esc(cfg.description)}</p></article>`);
   view.actions+=`<button type="button" class="primary" onclick="prologueAcceptHelper()">${esc(ui('helperAccept'))}</button>`;
  }else if(cursor.phase==='action'){
   view.body=box(hint);view.actions+=`<button type="button" class="primary" onclick="prologueOpenTask()">${esc(ui('toTask'))}</button>`;
  }else{
   // A stage whose lines were all removed still needs a way forward.
   if(line)view.line={speaker:speaker(line),kind:line.kind,text:line.text};
   view.advance='prologueNext';
  }
  view.signature=['prologue',s.id,cursor.phase,cursor.index,chosenJob,!!state,!!HELPER()?.member?.(),scene.name,view.line?.text||'',view.body.length,view.actions.length,view.continueLabel].join('|');
  return view;
 }
 function bannerHTML(s){
  const done=satisfied(s),fight=!!s.encounter?.enabled,busy=fight&&!!party.questChallenge,lost=fight&&!done&&globalThis.expeditionChallengeResult?.key===encounterKey(s)&&globalThis.expeditionChallengeResult.success===false;
  return `<aside class="prologue-task ${done?'prologue-task-done':''}" data-stage="${esc(s.id)}" aria-live="polite"><div class="prologue-task-text"><b>${esc(s.name)}</b><p>${esc(s.prologue.hint)}</p>${s.prologue.steps.length?`<ol>${s.prologue.steps.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>`:''}${bannerNotice?`<p class="prologue-notice">${esc(bannerNotice)}</p>`:''}</div><div class="actions">${s.guides.length>1?s.guides.map(g=>`<button onclick="setTab('${g}')" ${tab===g?'aria-current="page"':''}>${esc(M.GUIDES[g])}</button>`).join(''):''}${fight&&!done?busy?`<span class="tag">${esc(ui('battleRunning'))}</span>`:`<button class="primary" onclick="prologueStartBattle()">${esc(ui(lost?'retryBattle':'startBattle'))}</button>`:''}${done?`<button class="primary" onclick="prologueReturn()">${esc(ui('returnToGoddess'))}</button>`:fight?'':`<span class="small">${esc(ui('taskPending'))}</span>`}</div></aside>`;
 }
 function draw(){
  const W=globalThis.EmberwildStoryWindow;
  // Outside the prologue the same window shows ordinary quest dialogue, when one is being read.
  if(!active()){cursor=null;W.render(S()?.dialogueView?.()||null);return;}
  const s=sync();if(!s)return;
  const app=document.getElementById('app'),start=app.querySelector('.start');if(start)start.hidden=true;
  if(inPrologue()&&cursor.phase==='action'&&taskOpen&&isTask(s)){
   W.render(null);const host=app.querySelector('.layout>main')||app;if(!host.querySelector('.prologue-task'))host.insertAdjacentHTML('afterbegin',bannerHTML(s));
   return;
  }
  W.render(sceneView(s));
 }

 const baseRender=render;render=function(...args){const out=baseRender(...args);draw();return out;};
 // During a lesson only the pages that lesson uses are open.
 const baseSetTab=setTab;setTab=function(id){
  if(inPrologue()){const s=sync();if(!s||!(cursor.phase==='action'&&taskOpen&&isTask(s)&&s.guides.includes(id))){toast(ui('locked'));return false;}}
  return baseSetTab(id);
 };
 // Ordinary exploration (real monsters and loot) stays closed until arrival; training fights come through the quest encounter.
 const baseSpawn=spawnGroup;spawnGroup=function(...args){if(inPrologue()&&!party.questChallenge){running=false;toast(ui('locked'));return false;}return baseSpawn(...args);};
 // A character created any other way (old saves, direct start) has no prologue record and is treated as already arrived.
 const baseStart=start;start=function(...args){const out=baseStart(...args);if(state)clearDraft();return out;};
 const baseNewGame=newGame;newGame=function(...args){cursor=null;taskOpen=false;chosenJob=null;return baseNewGame(...args);};

 globalThis.__EMBERWILD_PROLOGUE={
  active,running:inPrologue,creating,stage:()=>active()?sync()?.id||null:null,phase:()=>active()&&sync()?cursor.phase:null,satisfied:()=>{const s=active()&&sync();return !!s&&satisfied(s);},draftKey:DRAFT_KEY,
  // Runs inside the story stage transaction, so it commits or rolls back with the stage.
  commitStage(q,s){
   // The stage right before the gear lesson hands over the starter pack with its own rewards (the charm); no mail is involved.
   if(q.stages.find(x=>x.id===s.next)?.prologue?.action==='equipLesson'){const h=playerHero();grantStarterPackDirect(h.job,globalThis.__EMBERWILD_STARTER_PACK.rows(h.job));}
   if(s.prologue?.action==='enterWorld'){HELPER().remove();party.questChallenge=null;party.map=0;}
  }
 };
 draw();
})();
