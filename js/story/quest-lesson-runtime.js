/* Quest lesson spotlight (v0.152). A started quest whose current stage asks for story gear to be worn, a skill slotted or a gem socketed is guided step by step: a banner on the page names the next action and a
   spotlight frames the control to press. The steps come from the stage's own conditions (gearWorn, skillSlotted, gearBaseGem), so the quest data needs no extra field. It only points; the controls are the
   game's own and nothing is done for the player. */
(()=>{
 'use strict';
 const S=()=>globalThis.__EMBERWILD_STORY,ORDER=['gearWorn','skillSlotted','gearBaseGem'];
 const PAGE={gearWorn:'worn',gearSkillActive:'skills',skillSlotted:'skills',gearSkillGem:'worn',gearBaseGem:'worn'};
 const ready=()=>!!party&&!!state&&!globalThis.__EMBERWILD_TITLE?.open()&&!S()?.prologueRunning?.()&&!globalThis.__EMBERWILD_PROLOGUE?.active?.();
 const rewardGear=key=>{const h=playerHero();return h.bag.find(g=>g.storyRewardKey===key)||null;};
 // The current lesson: the first started, unfinished quest whose stage has an unmet guided condition.
 function current(){
  if(!ready())return null;
  for(const q of S().design.quests){
   const r=S().record(q.id);if(!q.enabled||!r||r.done||!r.started)continue;
   const s=q.stages.find(x=>x.id===r.current);if(!s)continue;
   const guided=s.conditions.conditions.filter(c=>ORDER.includes(c.type)).sort((a,b)=>ORDER.indexOf(a.type)-ORDER.indexOf(b.type));if(!guided.length)continue;
   // Every condition met: the last step is reporting back, from the banner.
   const c=guided.find(c=>S().progress(c,r)<c.count)||(S().met(s.conditions,r)?{type:'report'}:null);
   if(c)return {q,s,r,c};
  }
  return null;
 }
 function stepText(c){
  if(c.type==='report')return '完成了。按「回報」繼續下一段。';
  const g=c.type==='skillSlotted'?null:rewardGear(c.key),name=g?gearName(g):'任務裝備',sk=c.type==='skillSlotted'?globalThis.__EMBERWILD_SKILLS?.byId(c.key):null;
  if(c.type==='gearWorn')return '到「裝備與信物」點選飾品欄位，穿上'+name+'。';
  if(c.type==='skillSlotted')return '點選'+({active:'主動',proc:'觸發',support:'輔助'}[sk?.type]||'')+'技能槽，裝入「'+(sk?.name||c.key)+'」。';
  const n=c.slot;
  return '在「裝備與信物」按'+name+'的「鑲嵌」，選第 '+(n+1)+' 孔，放入寶石。';
 }
 // The control to press next, as a selector inside the page (or the open dialog).
 function target(c){
  if(c.type==='report')return {selector:'[data-lesson-report]'};
  const h=playerHero(),modal=document.getElementById('modal'),open=!!modal?.open,g=c.type==='skillSlotted'?null:rewardGear(c.key);
  if(c.type==='gearWorn'){
   if(!g)return null;if(open)return {dialog:true,selector:'[onclick^="confirmEquipComparison("]'};
   const position=Math.max(3,h.equipped.indexOf(null,3));
   return {selector:`[onclick^="previewEquip('${g.id}'"]`,fallback:`[onclick="selectWornSlot(${memberKey(h)},${position})"]`};
  }
  if(c.type==='skillSlotted'){
   const sk=globalThis.__EMBERWILD_SKILLS?.byId(c.key);if(!sk)return null;
   if(open)return {dialog:true,selector:`[onclick^="chooseSkillSlot('${sk.type}',"][onclick*="'${sk.id}'"]`};
   return {selector:`[onclick="openSkillSlot('${sk.type}',0)"]`};
  }
  if(!g)return null;const n=c.slot,editor=`[data-socket-equipment="${g.id}"]`;
  // Open the charm's socket editor, pick the socket, then a gem.
  return {socket:`${editor} [data-equipment-socket="${n}"]`,editor,open:`[onclick="toggleWornEquipmentSockets('${g.id}')"]`};
 }
 function resolve(c){
  const t=target(c);if(!t||typeof document.querySelector!=='function')return null;
  const q=sel=>{try{return (t.dialog?document.getElementById('modal'):document.getElementById('app')).querySelector(sel);}catch{return null;}};
  if(c.type!=='report'&&PAGE[c.type]!==tab&&!t.dialog)return null;
  if(t.socket){
   if(!q(t.editor))return q(t.open);
   const slot=q(t.socket);if(slot&&slot.getAttribute('aria-pressed')!=='true')return slot;
   return q(`${t.editor} .equipment-gem-choice[data-equipment-gem="0"]:not([disabled])`)||q(`${t.editor} .equipment-gem-choice:not([disabled])`);
  }
  return q(t.selector)||(t.fallback?q(t.fallback):null);
 }
 function bannerHTML(l){
  if(l.c.type==='report')return `<aside class="prologue-task prologue-task-done lesson-task" data-lesson-quest="${esc(l.q.id)}" data-lesson-step="report" aria-live="polite"><div class="prologue-task-text"><b>${esc(l.q.name)} · ${esc(l.s.name)}</b><p>${esc(stepText(l.c))}</p></div><div class="actions"><button type="button" class="primary" data-lesson-report onclick="questLessonReport()">回報</button></div></aside>`;
  const page=PAGE[l.c.type],go=page!==tab?`<button type="button" class="primary" data-lesson-page="${page}" onclick="setTab('${page}')">${esc(EmberwildStory.GUIDES[page])}</button>`:'';
  return `<aside class="prologue-task lesson-task" data-lesson-quest="${esc(l.q.id)}" data-lesson-step="${esc(l.c.type)}" aria-live="polite"><div class="prologue-task-text"><b>${esc(l.q.name)} · ${esc(l.s.name)}</b><p>${esc(stepText(l.c))}</p></div><div class="actions">${go}</div></aside>`;
 }
 // Banner on the pages the lesson uses; the spotlight follows the next control.
 const PAGES=new Set(['worn','skills','equipment']);
 let el=null,frame=0;
 function spotlight(){
  let o=document.getElementById('lesson-spotlight');if(!o){o=document.createElement('div');o.id='lesson-spotlight';o.setAttribute('aria-hidden','true');o.hidden=true;document.body.appendChild(o);}
  if(frame)return;
  const follow=()=>{
   frame=requestAnimationFrame(follow);
   const layer=document.getElementById('prologue-layer'),busy=!!layer&&!layer.hidden||!!globalThis.__EMBERWILD_TUTORIAL?.status?.().active;
   document.querySelectorAll('.lesson-spot-ring').forEach(n=>{if(n!==el||busy)n.classList.remove('lesson-spot-ring');});
   if(!el||!el.isConnected||busy){o.hidden=true;return;}
   if(el.closest('dialog')){o.hidden=true;el.classList.add('lesson-spot-ring');return;}
   if(document.getElementById('modal')?.open){o.hidden=true;return;}
   const r=el.getBoundingClientRect();if(!r.width||!r.height){o.hidden=true;return;}
   o.hidden=false;o.style.top=r.top-6+'px';o.style.left=r.left-6+'px';o.style.width=r.width+12+'px';o.style.height=r.height+12+'px';
  };
  frame=requestAnimationFrame(follow);
 }
 let lastEl=null;
 function draw(){
  if(typeof document.querySelectorAll!=='function'||!document.getElementById('app')?.querySelector)return;
  const l=current();
  if(!l){el=null;const o=document.getElementById('lesson-spotlight');if(o)o.hidden=true;return;}
  const host=document.getElementById('app').querySelector('.layout>main');
  if(host&&(PAGES.has(tab)||l.c.type==='report')&&!host.querySelector('.lesson-task'))host.insertAdjacentHTML('afterbegin',bannerHTML(l));
  el=resolve(l.c);
  if(el&&el!==lastEl&&!el.closest('dialog'))el.scrollIntoView?.({block:'center',behavior:'smooth'});
  lastEl=el;spotlight();
 }
 // Complete the stage through the normal completion, then open the next stage's lines in the story window.
 globalThis.questLessonReport=function(){const l=current();if(!l||l.c.type!=='report')return false;const ok=completeStoryStage(l.q.id,'',l.s.id);if(ok&&!S().record(l.q.id)?.done)readStory(l.q.id);return ok;};
 const baseRender=render;render=function(...args){const out=baseRender(...args);try{draw();}catch(e){console.warn(e);}return out;};
 // The selection of a socket or an opened dialog changes the target without a full page change.
 setInterval(()=>{try{const l=current();el=l?resolve(l.c):null;}catch{}},250);
 globalThis.__EMBERWILD_QUEST_LESSON={
  current:()=>{const l=current();return l?{quest:l.q.id,stage:l.s.id,step:l.c.type,page:PAGE[l.c.type],text:stepText(l.c),slot:l.c.slot??null}:null;},
  banner:()=>{const l=current();return l?bannerHTML(l):'';}
 };
})();
