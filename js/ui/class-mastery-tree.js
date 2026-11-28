/* v0.161 class mastery / class skill panel on the skills page (v0.168: no second class; v0.173: a list, details in a dialog).
   The tree is the current class's skillSystem.classRules rows (initial and former second-class rows alike). Each node
   unlocks by itself once class mastery and its prerequisite nodes are reached; the same
   check (__EMBERWILD_SKILLS.learned) decides what the battle may use. Unlocking does not equip: active, trigger and
   support skills still go into their slots through the existing slot dialog. */
(()=>{
  'use strict';
  const S=()=>globalThis.__EMBERWILD_SKILLS,M=globalThis.__EMBERWILD_MASTERY;
  const TYPE={active:'主動',proc:'觸發',support:'主動',passive:'被動'},STAT={hp:'生命',atk:'攻擊',def:'防禦',crit:'暴擊'};
  function treeRows(job){
    const rule=S()?.system?.()?.classRules?.find(r=>r.job===job);if(!rule)return [];
    return [...rule.initial,...rule.advanced].filter(row=>S().byId(row.skillId)&&!S().byId(row.skillId).disabled).map(row=>({row})).sort((x,y)=>x.row.masteryLevel-y.row.masteryLevel);
  }
  function equippedIds(h){const out=new Set();for(const list of Object.values(h.skillLoadout||{}))for(const id of list||[])if(id)out.add(id);return out;}
  function nodeState(h,n,equipped){
    const sk=S().byId(n.row.skillId);
    if(S().learned(h,sk))return sk.type==='passive'?(S().passiveEnabled(h,sk.id)?'equipped':'unlocked'):equipped.has(sk.id)?'equipped':'unlocked';
    if(!masteryRequirementMet(h,n.row.masteryLevel))return 'mastery';
    return 'prereq';
  }
  const STATE_TEXT={equipped:'已解鎖・使用中',unlocked:'已解鎖',mastery:'未達精通需求',prereq:'前置技能未解鎖'};
  // v0.179: class masteries add HP / attack / defense per level (main class + one sub-class); weapon and element
  // masteries add damage only (js/skills/mastery-damage.js).
  function bonusText(h){const L=__EMBERWILD_MASTERY.masteryLabels||{},b=classMasteryBonus(h),rows=globalThis.__EMBERWILD_MASTERY_DAMAGE?.summary(h)||[];
    const stats=[['hp','生命'],['atk','攻擊'],['def','防禦']].filter(([k])=>b[k]>0).map(([k,n])=>n+' +'+Math.round(b[k]*10)/10);
    const dmg=rows.map(r=>`${L[r.key]||r.key}精通 Lv${r.level}：${r.kind==='weapon'?'使用'+(L[r.key]||r.key)+'時傷害':(L[r.key]||r.key)+'屬性法術傷害'} +${Math.round(r.bonus*100)}%${r.kind==='weapon'&&!r.active?'（目前未持有）':''}`);
    return [stats.length?'職業精通（主職業＋副職業）'+stats.join('、'):'',...dmg].filter(Boolean).join('；')||'無';}
  function headHTML(h){
    const p=M.masteryProgress(classMasteryXp(h)),job=CLASSES[h.job].name,full=p.level>=p.max,width=full?100:Math.round(p.current/Math.max(1,p.next)*100);
    return `<div class="class-mastery-head"><div><h2>${esc(job)}精通 <b>Lv.${p.level}</b> <small>/ ${p.max}</small></h2><p class="small">精通加成：${esc(bonusText(h))}</p></div><div class="class-mastery-bar" role="progressbar" aria-label="${esc(job)}精通經驗" aria-valuemin="0" aria-valuemax="${full?1:p.next}" aria-valuenow="${full?1:p.current}"><span style="width:${width}%"></span><small>${full?'已達上限':`${p.current} / ${p.next}`}</small></div></div>`;
  }
  // v0.173: the class skills are a list in mastery order. A row opens its details in a dialog; nothing on the page is
  // redrawn by the click, so the page no longer jumps, and each dialog is built for the row that opened it.
  function detailHTML(h,n,state){
    const sk=S().byId(n.row.skillId),mastery=classMasteryLevel(h),pre=(n.row.prerequisites||[]).map(id=>{const p=S().byId(id);return `<li class="${S().learned(h,p)?'met':''}">${esc(p?.name||id)}</li>`;}).join('');
    const slot=['active','proc','support'].includes(sk.type)&&state==='unlocked'?`<button type="button" class="primary" onclick="closeModal();equipNewSkill('${esc(sk.id)}')">放入技能槽</button>`:'';
    return `<article class="skill-tree-detail" data-tree-detail="${esc(sk.id)}"><h2>${esc(sk.name)}</h2><p class="skill-tree-tags"><span class="tag">${TYPE[sk.type]||sk.type}</span> <span class="tag tree-state-${state}">${STATE_TEXT[state]}</span></p>${sk.description?`<p>${esc(sk.description)}</p>`:''}<dl><dt>需求精通</dt><dd>${esc(CLASSES[h.job].name)}精通 Lv${n.row.masteryLevel}（目前 Lv${mastery}）</dd><dt>前置技能</dt><dd>${pre?`<ul>${pre}</ul>`:'無'}</dd><dt>裝備狀態</dt><dd>${state==='equipped'?(sk.type==='passive'?'常駐生效':'已在技能槽'):state==='unlocked'?(sk.type==='passive'?'已停用':'未放入技能槽'):'尚未解鎖'}</dd></dl><div class="actions">${slot}<button type="button" onclick="closeModal()">關閉</button></div></article>`;
  }
  function panelHTML(h){
    const nodes=treeRows(h.job);if(!nodes.length)return '';
    const equipped=equippedIds(h);let level=null;
    const rows=nodes.map(n=>{const sk=S().byId(n.row.skillId),st=nodeState(h,n,equipped);
      const head=n.row.masteryLevel!==level?`<li class="skill-list-level">精通 Lv${level=n.row.masteryLevel}</li>`:'';
      return head+`<li><button type="button" class="skill-list-node tree-state-${st}" data-tree-node="${esc(sk.id)}" onclick="openSkillTreeDetail('${esc(sk.id)}')"><b>${esc(sk.name)}</b><span class="tag">${TYPE[sk.type]||''}</span><span class="skill-list-state tree-state-${st}">${STATE_TEXT[st]}</span></button></li>`;}).join('');
    return `<section class="panel class-mastery-tree" data-class-tree="${h.job}">${headHTML(h)}<p class="small">依精通等級排列，點選技能查看說明。已解鎖的主動與觸發技能要放進技能槽才會在戰鬥中使用。</p><ul class="class-skill-list">${rows}</ul></section>`;
  }
  globalThis.openSkillTreeDetail=function(id){
    const h=party?.members?.[0];if(!h)return false;const n=treeRows(h.job).find(x=>x.row.skillId===id);if(!n)return false;
    const modal=$('modal');modal.innerHTML=detailHTML(h,n,nodeState(h,n,equippedIds(h)));modal.classList.add('skill-detail-dialog');if(!modal.open)modal.showModal();return true;
  };
  const closeBase=closeModal;closeModal=function(...args){$('modal')?.classList.remove('skill-detail-dialog');return closeBase(...args);};
  globalThis.selectSkillTreeNode=id=>openSkillTreeDetail(id);
  globalThis.classMasteryTreeHTML=h=>{try{return panelHTML(h||party.members[0]);}catch(e){console.warn('技能列表顯示失敗',e);return '';}};
  const viewBase=skillsView;
  skillsView=function(){
    const html=viewBase(),h=party?.members?.[0];
    if(!h||__EMBERWILD_TEAMS?.plan?.()?.job===null||!html.includes('<div class="skill-system-page">'))return html;
    // Below the slot configuration, so the slots (and the prologue's skill lesson) keep their place on phones.
    return html+classMasteryTreeHTML(h);
  };
})();
