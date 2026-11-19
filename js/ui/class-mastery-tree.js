/* v0.161 class mastery / skill tree panel on the skills page (v0.168: no second class).
   The tree is the current class's skillSystem.classRules rows (initial and former second-class rows alike). Each node
   unlocks by itself once class mastery and its prerequisite nodes are reached; the same
   check (__EMBERWILD_SKILLS.learned) decides what the battle may use. Unlocking does not equip: active, trigger and
   support skills still go into their slots through the existing slot dialog. */
(()=>{
  'use strict';
  const S=()=>globalThis.__EMBERWILD_SKILLS,M=globalThis.__EMBERWILD_MASTERY;
  const TYPE={active:'主動',proc:'觸發',support:'輔助',passive:'被動'},STAT={hp:'生命',atk:'攻擊',def:'防禦',crit:'暴擊'};
  const ROW_HEIGHT=88;
  let selected=null;
  function treeRows(job){
    const rule=S()?.system?.()?.classRules?.find(r=>r.job===job);if(!rule)return [];
    return [...rule.initial.map(row=>({row,advanced:false})),...rule.advanced.map(row=>({row,advanced:true}))].filter(x=>S().byId(x.row.skillId)&&!S().byId(x.row.skillId).disabled);
  }
  // Rows: explicit position.row, else one row per (stage, mastery level). Columns: explicit position.col, else in order.
  function layout(nodes){
    const keys=[...new Set(nodes.filter(n=>!n.row.position).map(n=>n.row.masteryLevel))].sort((a,b)=>a-b);
    const placed=nodes.map(n=>({...n,r:n.row.position?.row??keys.indexOf(n.row.masteryLevel)}));
    const rows=new Map();for(const n of placed){if(!rows.has(n.r))rows.set(n.r,[]);rows.get(n.r).push(n);}
    const order=[...rows.keys()].sort((a,b)=>a-b);
    let cols=1;for(const list of rows.values()){list.forEach((n,i)=>{n.c=n.row.position?.col??i;});cols=Math.max(cols,...list.map(n=>n.c+1));}
    for(const n of placed){n.y=order.indexOf(n.r);n.x=(n.c+.5)/cols*100;}
    return {nodes:placed,height:Math.max(1,order.length)*ROW_HEIGHT};
  }
  function equippedIds(h){const out=new Set();for(const list of Object.values(h.skillLoadout||{}))for(const id of list||[])if(id)out.add(id);return out;}
  function nodeState(h,n,equipped){
    const sk=S().byId(n.row.skillId);
    if(S().learned(h,sk))return sk.type==='passive'?(S().passiveEnabled(h,sk.id)?'equipped':'unlocked'):equipped.has(sk.id)?'equipped':'unlocked';
    if(!masteryRequirementMet(h,n.row.masteryLevel))return 'mastery';
    return 'prereq';
  }
  const STATE_TEXT={equipped:'已解鎖・使用中',unlocked:'已解鎖',mastery:'未達精通需求',prereq:'前置技能未解鎖'};
  function bonusText(h){const b=classMasteryBonus(h);const parts=Object.entries(b).filter(([,v])=>v>0).map(([k,v])=>STAT[k]+' +'+(k==='crit'?Math.round(v*1000)/10+'%':Math.round(v*10)/10));return parts.length?parts.join('、'):'無';}
  function headHTML(h){
    const p=M.masteryProgress(classMasteryXp(h)),job=CLASSES[h.job].name,full=p.level>=p.max,width=full?100:Math.round(p.current/Math.max(1,p.next)*100);
    return `<div class="class-mastery-head"><div><h2>${esc(job)}精通 <b>Lv.${p.level}</b> <small>/ ${p.max}</small></h2><p class="small">精通加成：${esc(bonusText(h))}</p></div><div class="class-mastery-bar" role="progressbar" aria-label="${esc(job)}精通經驗" aria-valuemin="0" aria-valuemax="${full?1:p.next}" aria-valuenow="${full?1:p.current}"><span style="width:${width}%"></span><small>${full?'已達上限':`${p.current} / ${p.next}`}</small></div></div>`;
  }
  function detailHTML(h,n,state){
    if(!n)return '<p class="small skill-tree-hint">點選技能節點查看條件與效果。已解鎖的主動、觸發與輔助技能仍要放進技能槽才會在戰鬥中使用。</p>';
    const sk=S().byId(n.row.skillId),mastery=classMasteryLevel(h),pre=(n.row.prerequisites||[]).map(id=>{const p=S().byId(id);return `<li class="${S().learned(h,p)?'met':''}">${esc(p?.name||id)}</li>`;}).join('');
    const slot=['active','proc','support'].includes(sk.type)&&(state==='unlocked')?`<button type="button" onclick="equipNewSkill('${esc(sk.id)}')">放入技能槽</button>`:'';
    return `<article class="skill-tree-detail" data-tree-detail="${esc(sk.id)}"><h3>${esc(sk.name)} <span class="tag">${TYPE[sk.type]||sk.type}</span> <span class="tag tree-state-${state}">${STATE_TEXT[state]}</span></h3>${sk.description?`<p>${esc(sk.description)}</p>`:''}<dl><dt>需求精通</dt><dd>Lv${n.row.masteryLevel}（目前 Lv${mastery}）</dd><dt>前置技能</dt><dd>${pre?`<ul>${pre}</ul>`:'無'}</dd><dt>來源</dt><dd>${esc(CLASSES[h.job].name)}技能樹</dd><dt>裝備狀態</dt><dd>${state==='equipped'?(sk.type==='passive'?'常駐生效':'已在技能槽'):state==='unlocked'?(sk.type==='passive'?'已停用':'未放入技能槽'):'尚未解鎖'}</dd></dl>${slot}</article>`;
  }
  function panelHTML(h){
    const nodes=treeRows(h.job);if(!nodes.length)return '';
    const {nodes:placed,height}=layout(nodes),equipped=equippedIds(h),states=new Map(placed.map(n=>[n.row.skillId,nodeState(h,n,equipped)]));
    if(selected&&!states.has(selected))selected=null;
    const byId=new Map(placed.map(n=>[n.row.skillId,n]));
    const lines=placed.flatMap(n=>(n.row.prerequisites||[]).map(id=>{const p=byId.get(id);if(!p)return '';const met=['equipped','unlocked'].includes(states.get(id));return `<line class="${met?'met':''}" x1="${p.x}" y1="${p.y*ROW_HEIGHT+ROW_HEIGHT/2}" x2="${n.x}" y2="${n.y*ROW_HEIGHT+ROW_HEIGHT/2}"/>`;})).join('');
    const buttons=placed.map(n=>{const sk=S().byId(n.row.skillId),st=states.get(sk.id);return `<button type="button" class="skill-tree-node tree-state-${st}${selected===sk.id?' selected':''}" style="left:${n.x}%;top:${n.y*ROW_HEIGHT+ROW_HEIGHT/2}px" data-tree-node="${esc(sk.id)}" aria-pressed="${selected===sk.id}" title="${esc(sk.name)} · ${STATE_TEXT[st]}" onclick="selectSkillTreeNode('${esc(sk.id)}')"><b>${esc(sk.name)}</b><small>${TYPE[sk.type]||''} · 精通 Lv${n.row.masteryLevel}</small></button>`;}).join('');
    const legend='<p class="skill-tree-legend" aria-hidden="true"><span class="equipped">使用中</span><span class="unlocked">已解鎖</span><span class="locked">未解鎖</span></p>';
    const pick=selected?byId.get(selected):null;
    return `<section class="panel class-mastery-tree" data-class-tree="${h.job}">${headHTML(h)}${legend}<div class="skill-tree" style="height:${height}px"><svg class="skill-tree-lines" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${buttons}</div>${detailHTML(h,pick,pick?states.get(pick.row.skillId):null)}</section>`;
  }
  globalThis.selectSkillTreeNode=function(id){selected=selected===id?null:id;render();};
  globalThis.classMasteryTreeHTML=h=>{try{return panelHTML(h||party.members[0]);}catch(e){console.warn('技能樹顯示失敗',e);return '';}};
  const viewBase=skillsView;
  skillsView=function(){
    const html=viewBase(),h=party?.members?.[0];
    if(!h||__EMBERWILD_TEAMS?.plan?.()?.job===null||!html.includes('<div class="skill-system-page">'))return html;
    // Below the slot configuration, so the slots (and the prologue's skill lesson) keep their place on phones.
    return html+classMasteryTreeHTML(h);
  };
})();
