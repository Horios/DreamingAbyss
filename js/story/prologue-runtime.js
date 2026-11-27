/* Character creation and inline onboarding share the ordinary, transactional story record.
   No training encounter, page gate or automatic story quest presentation. */
(()=>{
 'use strict';
 const S=()=>globalThis.__EMBERWILD_STORY,Q=()=>S()?.prologueQuest(),R=()=>party&&S()?.record('prologue');
 const DRAFT_KEY=environmentStorageKey('emberwild-prologue-draft-v1-slot-'+ACTIVE_SAVE_SLOT);
 let chosenJob=null,busy=false;
 function draft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');}catch{return null;}}
 function writeDraft(d){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(d));return true;}catch{toast('無法儲存進度');return false;}}
 function clearDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch{}}
 const creating=()=>!state&&!!Q()&&!!globalThis.__EMBERWILD_TITLE?.creatingCharacter();
 const runningGuide=()=>!!party&&!globalThis.__EMBERWILD_TITLE?.open()&&!!R()&&!R().done;
 const active=()=>creating()||runningGuide();
 const stage=()=>creating()?(draft()?.name?'calling':'creation'):runningGuide()?R().current:null;
 const worn=()=>{const h=playerHero();return h.bag.some(g=>g.starterPack&&h.equipped.includes(g.id));};
 const priest=()=>party?.members.slice(1).find(h=>h.companionId===13||h.job===3&&![900000001,900000002,900000003,900000004].includes(h.companionId));
 // v0.226: the charm and gem lessons finish on their stage conditions (charm worn, 追擊 slotted, gem in the first socket).
 const stageMet=id=>{const s=Q()?.stages.find(x=>x.id===id);return !!s&&S().met(s.conditions,R());};
 function satisfied(){switch(stage()){case 'calling':return true;case 'gift':return worn();case 'charm':case 'gem':return stageMet(stage());case 'practice':return !!party.story.flags.onboarding_battle;case 'helper':return !!priest();case 'departure':return true;default:return false;}}
 // Runs inside the stage transaction: both rewards and joining roll back when saving fails.
 function commitStage(q,s){
  // v0.178: the priest joins by her ticket (夥伴招募券 - 艾琳), handed out with the starter gear and used in the helper stage.
  if(s.id==='calling'){grantStarterPackDirect(playerHero().job,globalThis.__EMBERWILD_STARTER_PACK.rows(playerHero().job));if(!priest()&&!companionTicketCount(13))grantCompanionTicket(13);}
  if(s.id==='departure'){
   party.story.flags.onboarding_story_notice=false;party.story.flags.onboarding_done=true;
   // The actual first exploration just taught this module; keep it available in tutorial review.
   // The roster guide's content is part of the recruiting guide, so it does not replay on the same page right after.
   if(party.tutorials)for(const id of ['explore_basics','partner_basics']){const m=globalThis.__EMBERWILD_TUTORIAL?.design.modules.find(m=>m.id===id);if(m&&!party.tutorials.records[m.id]?.completed)party.tutorials.records[m.id]={triggered:true,completed:true,skipped:false,step:-1,revision:m.revision};}
  }
 }
 function migrate(){
  if(!party||party.story?.flags?.opening_v2)return true;
  return S().transaction(()=>{
   const story=party.story,r=R(),c=story.quests.chapter1;
   story.flags.chapter_gate=false;delete story.flags.chapter1_start;
   // An existing character never returns to the name/class screen. Finished tutorials stay finished.
   if(r&&!r.done){
    const equipped=worn(),fought=r.completed.includes('practice')||r.completed.includes('trial');
    if(fought)story.flags.onboarding_battle=true;
    r.current=!equipped?'gift':!fought?'practice':priest()?'departure':'helper';
    r.completed=['creation','calling',...(equipped?['gift','charm','gem']:[]),...(equipped&&fought?['practice']:[]),...(equipped&&fought&&priest()?['helper']:[])];r.baseline={};
    if(!playerHero().bag.some(g=>g.starterPack))grantStarterPackDirect(playerHero().job,globalThis.__EMBERWILD_STARTER_PACK.rows(playerHero().job));
   }
   if(r?.done||!r)story.flags.onboarding_done=true;
   if(!r){story.quests.prologue={current:'departure',started:true,done:true,completed:['creation','calling','gift','charm','gem','practice','helper','departure'],baseline:{},choices:{}};}
   // Keep the old quest id and completed reward stage as the receipt; never pay the 100 gold twice.
   if(c&&!c.done){
    const ids=new Set(S().design.quests.find(q=>q.id==='chapter1').stages.map(s=>s.id));
    if(!ids.has(c.current))c.current=c.completed.includes('village')?'together':c.completed.includes('ambush_fight')?'village':'ambush';
    c.baseline={};
   }
   if(c?.done&&!partyMember(10)&&!companionTicketCount(10)){grantCompanionTicket(10);story.flags.caravan_warrior_notice=true;}
   // Temporary story actors are no longer needed; their inventory is returned by the existing removal routine.
   globalThis.__EMBERWILD_PROLOGUE_HELPER?.remove();
   for(const id of [900000002,900000003,900000004])globalThis.__EMBERWILD_TEMP_ALLY?.remove(id);
   if(party.questChallenge?.key?.startsWith('prologue/')){party.questChallenge=null;running=false;}
   story.flags.opening_v2=true;
  });
 }
 globalThis.prologueConfirmName=function(){
  if(!creating())return;let name;try{name=validCharacterName(document.getElementById('prologue-name')?.value||'');}catch(e){return toast(e.message);}
  if(!name)return toast('請輸入名字');if(writeDraft({version:1,stage:'calling',name}))render();
 };
 globalThis.prologuePickClass=function(job){if(creating()&&Number.isInteger(job)&&CLASSES[job]){chosenJob=job;render();}};
 globalThis.prologueConfirmClass=function(){
  const d=draft();if(!creating()||!d?.name||!CLASSES[chosenJob])return;
  globalThis.__EMBERWILD_STARTER_PACK.asPrologue(()=>start(chosenJob));if(!party||!state)return;
  playerHero().name=d.name;S().begin('prologue','calling',['creation']);party.story.flags.opening_v2=true;party.story.flags.onboarding_v226=true;
  if(!completeStoryStage('prologue','','calling'))return;
  clearDraft();chosenJob=null;setTab('equipment');
 };
 globalThis.prologueNext=()=>render();
 globalThis.prologueOpenTask=function(){const s=Q()?.stages.find(s=>s.id===stage());if(s?.guides[0])setTab(s.guides[0]);};
 globalThis.prologueReturn=()=>render();
 // v0.185: the goddess's opening lines type out quickly, one paragraph per sentence; the name box appears afterwards.
 // A tap on the dialogue shows everything at once.
 let introDone=false,introTimer=null;
 const sentences=text=>String(text||'').split(/(?<=[。！？!?…])/).map(x=>x.trim()).filter(Boolean);
 function introLines(){return Q().stages[0].dialogue.flatMap(l=>sentences(l.text).map((text,i)=>({who:i===0?(l.speaker||'女神'):'',text})));}
 function startIntro(){
  if(introDone||introTimer)return;const lines=[...(document.querySelectorAll?.('#prologue-layer .goddess-line')||[])];if(!lines.length)return;
  let li=0,ci=0;const step=()=>{
   introTimer=null;if(introDone)return;const line=lines[li];if(!line?.isConnected){return finishIntro();}
   const text=line.dataset.text||'',out=line.querySelector('span');line.classList.remove('pending');ci++;out.textContent=text.slice(0,ci);
   let wait=22;if(ci>=text.length){li++;ci=0;wait=260;if(li>=lines.length)return finishIntro();}else if(/[，、；：,;:]/.test(text[ci-1]))wait=90;
   introTimer=setTimeout(step,wait);
  };introTimer=setTimeout(step,200);
 }
 function finishIntro(){clearTimeout(introTimer);introTimer=null;if(introDone)return;introDone=true;render();}
 globalThis.prologueFinishIntro=finishIntro;
 function creationView(){
  const pick=stage()==='calling',options=Q().stages.find(s=>s.id==='calling').prologue.options;
  return {sceneKey:'creation',head:{eyebrow:'女神',title:pick?'選擇初始職業':'你的名字'},attrs:'data-stage="'+stage()+'"',line:null,advance:null,skip:null,
   body:pick?`<div class="prologue-options" role="radiogroup">${options.map(o=>`<button type="button" class="prologue-option${chosenJob===o.job?' selected':''}" role="radio" aria-checked="${chosenJob===o.job}" onclick="prologuePickClass(${o.job})"><b>${esc(o.text)}</b><span>${esc(o.description)}</span></button>`).join('')}</div>`:`<div class="prologue-goddess" data-goddess-intro="${introDone?'done':'typing'}" onclick="prologueFinishIntro()">${introLines().map(x=>`<p class="goddess-line${introDone?'':' pending'}" data-text="${esc(x.text)}">${x.who?`<b>${esc(x.who)}：</b>`:''}<span>${introDone?esc(x.text):''}</span></p>`).join('')}</div>${introDone?`<label for="prologue-name">名字</label><input id="prologue-name" maxlength="20" autocomplete="off" onkeydown="if(event.key===\'Enter\')prologueConfirmName()">`:'<p class="small goddess-skip">點一下對話可直接顯示全部</p>'}`,
   actions:`<button type="button" onclick="backToTitle()">返回標題</button>`+(pick?`<button type="button" class="primary" onclick="prologueConfirmClass()" ${CLASSES[chosenJob]?'':'disabled'}>開始冒險</button>`:(introDone?'<button type="button" class="primary" onclick="prologueConfirmName()">選擇職業</button>':'')),focus:pick||!introDone?'':'#prologue-name',signature:'creation|'+pick+'|'+chosenJob+'|'+introDone};
 }
 function draw(){
  const W=globalThis.EmberwildStoryWindow;if(creating()){const start=document.getElementById('app').querySelector?.('.start');if(start)start.hidden=true;W.render(creationView());if(stage()!=='calling')startIntro();return;}
  if(introDone||introTimer){clearTimeout(introTimer);introTimer=null;introDone=false;}
  if(runningGuide()&&!busy&&!globalThis.EmberwildOffline?.busy){
   busy=true;try{
    for(let i=0;i<8&&runningGuide()&&satisfied();i++){
     const id=stage();if(!completeStoryStage('prologue','',id))break;
     if(stage()==='charm'&&tab!=='equipment')setTab('equipment');
     if(stage()==='gem'&&tab!=='worn')setTab('worn');
     if(stage()==='practice'&&tab!=='battle')setTab('battle');
     if(stage()==='helper'&&tab!=='equipment')setTab('equipment');
    }
   }finally{busy=false;}
  }
  W.render(S()?.dialogueView?.()||null);
  if(runningGuide()){
   const s=Q().stages.find(s=>s.id===stage());if(!s)return;
   const host=document.getElementById('app').querySelector?.('.layout>main');
   if(host&&!host.querySelector('.prologue-task'))host.insertAdjacentHTML('afterbegin',`<aside class="prologue-task" data-stage="${s.id}"><div><b>新手引導 · ${esc(s.name)}</b><p>${esc(s.description)}</p></div><button onclick="prologueOpenTask()">${esc(EmberwildStory.GUIDES[s.guides[0]]||'前往背包')}</button></aside>`);
  }
  if(party&&!globalThis.__EMBERWILD_TITLE?.open()&&R()?.done&&!party.story.flags.onboarding_story_notice){
   if(S().transaction(()=>{party.story.flags.onboarding_story_notice=true;}))toast('主線任務已有「商隊事件」，可自行開始；也可繼續自由探索。');
  }
  if(party?.story?.flags?.caravan_warrior_notice){if(S().transaction(()=>{delete party.story.flags.caravan_warrior_notice;}))toast('獲得夥伴招募券 - 洛恩，到背包 → 特殊使用');}
 }
 // The ordinary battle must actually finish; killing the first enemy in a group is insufficient.
 function practiceWon(){if(runningGuide()&&stage()==='practice'&&!party.story.flags.onboarding_battle&&foes.length&&foes.every(e=>e.hp<=0)&&!party.questChallenge){if(S().transaction(()=>{party.story.flags.onboarding_battle=true;}))render();}}
 const roundBase=pacedRound;pacedRound=function*(){yield* roundBase();practiceWon();};
 // v0.173: seconds combat ends an encounter through the battle summary, never through pacedRound; the first battle
 // in the onboarding was never counted there.
 const summary=globalThis.EmberwildBattleSummary;if(summary?.finish){const finishBase=summary.finish;summary.finish=function(result,...args){const out=finishBase.call(this,result,...args);if(result==='victory'&&runningGuide()&&stage()==='practice')queueMicrotask(()=>{try{practiceWon();}catch(e){console.warn(e);}});return out;};}
 /* v0.178: saves from before the tickets. A guide waiting for the priest gets her ticket; a finished caravan story
    without 洛恩 gets his. Runs once per save. */
 function migrateTickets(){
  if(!party?.story||party.story.flags.companion_tickets_v178)return;
  S().transaction(()=>{const f=party.story.flags,r=R(),c=party.story.quests.chapter1;
   if(r&&!r.done&&!priest()&&!companionTicketCount(13))grantCompanionTicket(13);
   if(c?.done&&!partyMember(10)&&!companionTicketCount(10))grantCompanionTicket(10);
   f.companion_tickets_v178=true;});
 }
 /* v0.226: the quest 裝備技能與寶石入門 was folded into the onboarding (stages charm and gem). Once per save:
    - an onboarding still before or at those lessons plays them; the gem the quest used to give is handed out now;
    - an onboarding already past them, or a finished onboarding whose quest was not finished, gets the quest's skill
      (and the gem when the quest had not given it) and the two stages count as done;
    - the old quest record is dropped. */
 function migrateLessons(){
  if(!party?.story||party.story.flags.onboarding_v226)return;
  S().transaction(()=>{
   const f=party.story.flags,r=R(),old=party.story.quests.skill_equipment_intro,h=playerHero();
   const playing=!!r&&!r.done&&['gift','charm','gem'].includes(r.current),gemGiven=!!old?.completed?.includes('equip_skill');
   if(r&&!playing&&!r.completed.includes('charm')){const i=r.completed.indexOf('gift');if(i>=0)r.completed.splice(i+1,0,'charm','gem');}
   if(playing&&!gemGiven)h.gems[0]=(h.gems[0]||0)+1;
   if(playing&&!party.members.some(m=>(m.bag||[]).some(g=>g.storyRewardKey==='initiation_charm')))S().grantRewardGear('initiation_charm');
   if(!playing&&(old&&!old.done||r&&!r.done)){
    for(const x of Q()?.stages.find(s=>s.id==='gem')?.rewards.items||[])if(x.type==='skill'&&(x.job===undefined||x.job===h.job))__EMBERWILD_SKILLS.grantSkill(h,x.key);
    if(!gemGiven)h.gems[0]=(h.gems[0]||0)+1;
   }
   delete party.story.quests.skill_equipment_intro;f.onboarding_v226=true;
  });
 }
 const loadBase=loadParty;loadParty=function(...args){const out=loadBase(...args);migrate();migrateTickets();migrateLessons();return out;};
 const renderBase=render;render=function(...args){const out=renderBase(...args);draw();return out;};
 globalThis.__EMBERWILD_PROLOGUE={active,running:runningGuide,creating,stage,phase:()=>active()?'action':null,satisfied,draftKey:DRAFT_KEY,commitStage,migrate,migrateLessons};
 draw();
})();
