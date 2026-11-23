/* One loadout view and one equipment socket editor use the canonical catalog. */
(()=>{
 'use strict';
 const S=__EMBERWILD_SKILLS;
 const labels={active:'主動',proc:'觸發',support:'輔助',passive:'被動'},sources={class:'職業',advanced:'職業',quest:'任務',equipment:'裝備',companion:'夥伴'};
 function detail(sk,h=state){
  if(globalThis.EmberwildSecondsUI)return EmberwildSecondsUI.detail(sk,h);
  const a=EmberwildSkillSystem.adapterFor(sk,h.job);
  if(sk.type==='passive')return [sk.description,...(sk.effects||[]).map(EmberwildPassives.effectText)].filter(Boolean).join(' · ');
  if(sk.systemEffect)return `持續 ${sk.duration} 回合 · 冷卻 ${sk.cooldown} 回合${['guard','slow'].includes(sk.systemEffect)?' · '+Math.round(sk.power*100)+'%':sk.systemEffect==='regen'?' · 每回合最大生命 '+Math.round(sk.power*10000)/100+'%':''}`;
  return a.kind==='core'?coreSkillDetail(a.job,a.index,h):supportSkillDetail(a.job,a.index,h);
 }
 function icon(sk){if(sk.type==='passive')return `<span class="skill-icon-glyph" aria-hidden="true">${__EMBERWILD_SKILL_ICONS.svgFor(sk.kind==='debuff'?'skull':'shield')}</span>`;return __EMBERWILD_MASTERY_UI.skillIcon(sk.adapter.job,sk.adapter.kind,sk.adapter.index);}
 function stage(sk,h){return sk.requiresAdvanced||sk.sources.some(s=>s.type==='advanced')||S.system().classRules.find(r=>r.job===h.job)?.advanced.some(r=>r.skillId===sk.id)?'職業':'職業';}
 const questItems=q=>[...(q.rewards?.items||[]),...q.stages.flatMap(s=>s.rewards.items)];
 function routes(sk,h){
  const out=[],system=S.system(),rule=system.classRules.find(r=>r.job===h.job),story=globalThis.__EMBERWILD_STORY?.design;
  for(const row of rule?.initial||[])if(row.skillId===sk.id)out.push('職業技能 · 精通 Lv'+row.masteryLevel);
  for(const row of rule?.advanced||[])if(row.skillId===sk.id)out.push('職業技能 · 精通 Lv'+row.masteryLevel);
  for(const src of sk.sources){
   if(src.type==='quest'){
    if(src.rewardOnly){for(const q of story?.quests||[])if(q.enabled!==false&&questItems(q).some(x=>x.type==='skill'&&x.key===sk.id&&(x.job===undefined||x.job===h.job)))out.push('任務獎勵：'+q.name);}
    else {const ids=src.questIds||sk.unlockConditions?.quests||['tutorial'];if(!ids.length||ids.every(id=>id==='tutorial'||story?.quests.some(q=>q.id===id&&q.enabled!==false)))out.push('完成'+(ids.length?ids.map(id=>id==='tutorial'?'新手教學':story.quests.find(q=>q.id===id)?.name||id).join('、'):'新手教學'));}
   }
   if(src.type!=='equipment')continue;
   ITEM_FORMS.forEach((slots,j)=>slots.forEach((forms,slot)=>forms.forEach((f,i)=>{const id=f.id||`job${j}-slot${slot}-form${i}`,fixed=system.equipment.formRules?.find(r=>r.formId===id)?.skillId||f.skillId;if(fixed===sk.id&&(j===h.job||f.wearableJobs?.includes(h.job)))out.push('裝備附帶');} )));
   for(const g of story?.gearRewards||[])if(g.skillId===sk.id&&(story.quests||[]).some(q=>q.enabled!==false&&questItems(q).some(x=>x.type==='gear'&&x.key===g.id&&(x.job===undefined||x.job===h.job))))out.push('裝備附帶');
  }
  return [...new Set(out)];
 }
 function sortedSkills(list,h){return list.sort((a,b)=>Number(S.learned(h,b))-Number(S.learned(h,a))||(a.requiredLevel??a.level??0)-(b.requiredLevel??b.level??0));}
 function catalog(h){return sortedSkills(S.system().definitions.filter(sk=>!sk.disabled&&sk.partnerId==null&&sk.jobs.includes(h.job)&&routes(sk,h).length),h);}
 function conditions(sk,h){
  if(sk.sources.some(s=>s.type==='equipment'))return '裝備附帶';
  const a=EmberwildSkillSystem.adapterFor(sk,h.job),parts=[];const need=sk.requiredLevel??sk.level??0;if(need)parts.push('職業精通 Lv'+need);
  if(sk.requiredMastery)parts.push((__EMBERWILD_MASTERY.masteryLabels[sk.requiredMastery]||sk.requiredMastery)+'精通 LV'+(sk.requiredMasteryLevel||0));
  if(sk.weaponTypes?.length)parts.push('武器：'+sk.weaponTypes.join('／'));
  if(a.kind!=='passive')parts.push(...__EMBERWILD_TEAMS.unlockSummary(h.job,a.kind,a.index));
  if(sk.sources.some(s=>s.type==='quest'||s.type==='equipment'))parts.push(...routes(sk,h));
  return [...new Set(parts)].join(' · ');
 }
 function missing(sk,h){const a=EmberwildSkillSystem.adapterFor(sk,h.job),out=[];if(!S.learned(h,sk)){out.push(conditions(sk,h));if(sk.sources.some(s=>s.type==='equipment'))return out;}if(a.kind==='core')out.push(...__EMBERWILD_MASTERY.coreMissingRequirements(h,a.index,true).filter(x=>x!=='尚未取得技能'));else if(a.kind==='support')out.push(...__EMBERWILD_MASTERY.supportMissingRequirements(h,a.index,true).filter(x=>x!=='尚未取得技能'));return [...new Set(out)];}
 function acquired(sk,h){return S.learned(h,sk)||h.acquiredSkillIds?.includes(sk.id)||sk.sources.some(s=>s.type==='equipment')&&(h.bag||[]).some(g=>g.skillId===sk.id);}
 // v0.076: the skill description is split into sections (effect, numbers, cooldown and cost, learning) instead of one line.
 const SKIP_PART=/^(主動技能，獨立冷卻|觸發技能，不占行動|常駐被動，不占行動|來源：)/,TIMER_PART=/^(初始冷卻|再使用冷卻|觸發冷卻|冷卻|MP|施法|普攻觸發率)/,REQUIRE_PART=/^需求/;
 function pair(text){const t=String(text),c=t.indexOf('：');if(c>0&&c<=8)return [t.slice(0,c),t.slice(c+1)];const m=t.match(/^(\S{1,8})\s+(.+)$/);return m?[m[1],m[2]]:[null,t];}
 function rows(parts){return parts.map(x=>{const [k,v]=pair(x);return k?`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`:`<div class="skill-detail-wide"><dd>${esc(v)}</dd></div>`;}).join('');}
 function detailSections(sk,h){
  const parts=String(detail(sk,h)||'').split(/\s*·\s*/).map(x=>x.trim()).filter(Boolean).filter(x=>!SKIP_PART.test(x));
  const effect=[],numbers=[],timers=[],require=[];
  for(const x of parts){if(TIMER_PART.test(x))timers.push(x);else if(REQUIRE_PART.test(x))require.push(x);else if(/[。；]/.test(x)||x.length>26)effect.push(x);else numbers.push(x);}
  const learn=[...require,'解鎖條件：'+conditions(sk,h),'取得來源：'+routes(sk,h).join('／')];
  const section=(title,body)=>body?`<section class="skill-detail-section"><h4>${title}</h4>${body}</section>`:'';
  return `<div class="skill-detail">${section('效果',(sk.description?`<p>${esc(sk.description)}</p>`:'')+effect.map(x=>`<p class="small">${esc(x)}</p>`).join(''))}${section('數值',numbers.length?`<dl class="skill-detail-grid">${rows(numbers)}</dl>`:'')}${section('冷卻與消耗',timers.length?`<dl class="skill-detail-grid">${rows(timers)}</dl>`:'')}${section('學習條件',`<dl class="skill-detail-grid">${rows(learn)}</dl>`)}</div>`;
 }
 function card(sk,h,action=''){
  const locked=!S.learned(h,sk),equipmentSkill=sk.sources.some(s=>s.type==='equipment');
  return `<article class="skill-candidate ${locked?'skill-locked':''}" data-skill-id="${esc(sk.id)}"><div class="skill-slot-name">${icon(sk)}<b>${esc(sk.name)}</b><span class="tag">${equipmentSkill?'裝備 · ':''}${sk.type==='support'?'主動（輔助）':labels[sk.type]} · ${stage(sk,h)}</span></div>${detailSections(sk,h)}${action}</article>`;
 }
 function passives(h){const list=sortedSkills(S.system().definitions.filter(sk=>sk.type==='passive'&&S.learned(h,sk)),h);return `<section class="panel"><h2>被動技能 <small>無槽位上限 · 不占主動槽</small></h2><div class="skill-passive-grid">${list.map(sk=>{const on=S.passiveEnabled(h,sk.id);return `<article class="skill-candidate ${on?'':'skill-passive-disabled'}" data-passive-id="${esc(sk.id)}"><button type="button" class="skill-passive-detail" onclick="showSkillInformation('${esc(sk.id)}')">${icon(sk)}<b>${esc(sk.name)}</b></button><p>${esc(sk.description)}</p><button type="button" role="switch" aria-checked="${on}" onclick="setPassiveSkillEnabled('${esc(sk.id)}',${!on})">${on?'已啟用':'已停用'}</button></article>`;}).join('')||'<p>尚未學會被動技能，可至技能圖鑑查看解鎖條件。</p>'}</div></section>`;}
 globalThis.showSkillInformation=function(id){const h=party.members[0],sk=S.byId(id);if(!sk||!S.learned(h,sk)&&!catalog(h).some(s=>s.id===id))return false;const modal=$('modal');modal.classList.add('skill-system-dialog');modal.innerHTML=card(sk,h)+`<button onclick="closeModal()">關閉</button>`;if(!modal.open)modal.showModal();return true;};
 // v0.092: two-pane catalog. Left: every skill of the class (learned first, then by level) with a strong learned/unlearned
 // contrast; right: the selected skill's full details. Read-only.
 let catalogSelected=null;
 globalThis.openSkillCatalog=function(id){
  const h=party.members[0],modal=$('modal'),list=catalog(h);if(!list.length)return false;
  if(id!==undefined)catalogSelected=id;if(!list.some(sk=>sk.id===catalogSelected))catalogSelected=list[0].id;
  const sel=list.find(sk=>sk.id===catalogSelected),have=list.filter(sk=>acquired(sk,h)).length;
  modal.classList.add('skill-system-dialog','skill-catalog-dialog');
  modal.innerHTML=`<h2>${esc(CLASSES[h.job].name)}技能圖鑑</h2><p class="small">收錄目前版本可取得的本職業技能。已取得 ${have} / ${list.length}。</p><div class="skill-catalog-panes"><nav class="skill-catalog-list" aria-label="技能清單">${list.map(sk=>{const got=acquired(sk,h);return `<button type="button" class="skill-catalog-item ${got?'is-acquired':'is-missing'}" data-skill-pick="${esc(sk.id)}" aria-pressed="${sk.id===catalogSelected}" onclick="openSkillCatalog('${esc(sk.id)}')"><span class="skill-catalog-icon">${icon(sk)}</span><span class="skill-catalog-text"><b>${esc(sk.name)}</b><small>${sk.type==='support'?'主動（輔助）':labels[sk.type]||sk.type} · ${stage(sk,h)}</small></span><span class="skill-catalog-state">${got?'已取得':'未取得'}</span></button>`;}).join('')}</nav><section class="skill-catalog-detail ${acquired(sel,h)?'is-acquired':'is-missing'}">${card(sel,h,`<span class="tag skill-catalog-status">${acquired(sel,h)?'已取得':'尚未取得'}</span>`)}</section></div><div class="actions"><button type="button" onclick="closeModal()">關閉</button></div>`;
  if(!modal.open)modal.showModal();modal.querySelector('.skill-catalog-item[aria-pressed="true"]')?.scrollIntoView?.({block:'nearest'});return true;
 };
 // Equipment skills belong to classes: a skill rolled for another class shows its class limit and cannot be enabled.
 const skillJobsText=sk=>(sk?.jobs||[]).map(j=>CLASSES[j]?.name||'').filter(Boolean).join('／');
 const usableBy=(sk,h)=>!!sk&&(sk.jobs||[]).includes(h?.job);
 skillsView=function(){
  const h=party.members[0];if(__EMBERWILD_TEAMS.plan()?.job===null)return heading('SKILLS / 技能','尚未選擇職業')+`<section class="panel"><button onclick="setTab('roster')">前往隊伍編成</button></section>`;return withHero(h,()=>{S.refreshHero(h);return heading('SKILLS / 技能','目前技能配置',`<span class="tag">${esc(characterName(h))}</span>`)+`<div class="skill-system-page"><div class="actions"><button type="button" onclick="openSkillCatalog()">技能圖鑑</button></div>${['active','proc','support'].map(type=>`<section class="panel"><h2>${labels[type]}技能</h2><div class="skill-system-slots">${h.skillLoadout[type].map((id,n)=>{const sk=S.byId(id);return `<button type="button" class="skill-system-slot skill-kind-${type}" data-skill-slot="${type}:${n}" onclick="openSkillSlot('${type}',${n})"><span class="small">${labels[type]}槽 ${n+1}</span>${sk?`<span class="skill-slot-name">${icon(sk)}<b>${esc(sk.name)}</b></span><span>${esc(sk.description||detail(sk,h))}</span>`:'<b>選擇技能</b>'}</button>`;}).join('')}</div></section>`).join('')}${passives(h)}</div>`;});
 };
 // v0.083: two-pane slot dialog. Left: every slot (active / proc / support) to switch between; right: the skills for the
 // selected slot's type, with a toggle that shows or hides skills not yet learned (shown by default).
 let slotShowLocked=true;try{slotShowLocked=localStorage.getItem('emberwild.skillSlotShowLocked')!=='0';}catch{}
 globalThis.toggleSkillSlotLocked=function(type,n,show){slotShowLocked=!!show;try{localStorage.setItem('emberwild.skillSlotShowLocked',show?'1':'0');}catch{}return globalThis.openSkillSlot(type,n);};
 globalThis.openSkillSlot=function(type,n){
  const h=party.members[0];if(!h.skillLoadout?.[type]||n<0||n>=h.skillLoadout[type].length)return false;
  const obtainable=new Set(catalog(h).map(sk=>sk.id)),all=sortedSkills(S.system().definitions.filter(sk=>sk.type===type&&!sk.disabled&&sk.partnerId==null&&sk.jobs.includes(h.job)&&(S.learned(h,sk)||obtainable.has(sk.id))),h),modal=$('modal');modal.classList.add('skill-system-dialog','skill-slot-dialog');
  const list=slotShowLocked?all:all.filter(sk=>!missing(sk,h).length),hidden=all.length-list.length;
  const slots=['active','proc','support'].filter(t=>h.skillLoadout[t]?.length).map(t=>`<div class="skill-slot-group"><h3>${labels[t]}</h3>${h.skillLoadout[t].map((id,i)=>{const cur=id&&S.byId(id),on=t===type&&i===n;return `<button type="button" class="skill-slot-tab" data-slot-tab="${t}:${i}" aria-pressed="${on}" onclick="openSkillSlot('${t}',${i})"><small>${labels[t]}槽 ${i+1}</small><b>${cur?esc(cur.name):'未配置'}</b></button>`;}).join('')}</div>`).join('');
  const cards=list.map(sk=>{const reasons=missing(sk,h),slotted=h.skillLoadout[type].includes(sk.id);return card(sk,h,`<p class="small">${reasons.length?'尚缺：'+esc(reasons.join('、')):slotted?'已裝備':'已學會'}</p><button type="button" onclick="chooseSkillSlot('${type}',${n},'${esc(sk.id)}')" ${reasons.length?'disabled':''}>${reasons.length?'未解鎖／條件未符合':h.skillLoadout[type][n]===sk.id?'目前配置':slotted?'移至此槽':'裝入技能'}</button>`);}).join('');
  modal.innerHTML=`<h2>技能配置 · ${labels[type]}槽 ${n+1}</h2><div class="skill-slot-panes"><nav class="skill-slot-tabs" aria-label="技能槽">${slots}</nav><section class="skill-slot-choices"><div class="skill-slot-toolbar"><label><input type="checkbox" ${slotShowLocked?'checked':''} onchange="toggleSkillSlotLocked('${type}',${n},this.checked)">顯示未學技能</label>${!slotShowLocked&&hidden?`<small>已隱藏 ${hidden} 個未學技能</small>`:''}</div><div class="skill-candidate-list">${cards||(all.length?'<p>目前沒有已學會的此類技能，可勾選「顯示未學技能」查看解鎖條件。</p>':'<p>目前階段沒有符合此類型的技能。</p>')}</div></section></div><div class="actions"><button type="button" onclick="chooseSkillSlot('${type}',${n},null)">清空此技能槽</button><button type="button" onclick="closeModal()">關閉</button></div>`;if(!modal.open)modal.showModal();return true;
 };
 globalThis.chooseSkillSlot=function(t,n,id){const h=party.members[0];return withHero(h,()=>{if(!configureSkill(t,n,id))return false;closeModal();return true;});};
 $('modal').addEventListener('close',()=>$('modal').classList.remove('skill-system-dialog','skill-slot-dialog','skill-catalog-dialog'));
 const statNames={atk:'攻擊',hp:'生命',def:'防禦',attackSpeedPct:'攻擊速度',crit:'暴擊'};
 function gemText(id){
  const {stat,unit,values}=S.system().gems.find(x=>x.kind===id%5).base,value=values[Math.floor(id/5)];
  return statNames[stat]+' +'+(unit==='ratio'?Math.round(value*10000)/100+'%':unit==='percent'?value+'%':value);
 }
 let socketSelection=null;
 globalThis.selectEquipmentSocket=function(id,n){
  const g=findGear(id);if(!g?.skillSockets||!Number.isInteger(n)||n<0||n>=g.skillSockets.count)return false;
  socketSelection={id,n};render();return true;
 };
 function socketIcon(id){return id===null?'<span aria-hidden="true">＋</span>':inventoryGemIcon(id);}
 function sockets(g){
  if(!g||EmberwildTokens.isToken(g))return '';const sk=S.byId(g.skillId),h=party.members[0],x=g.skillSockets;
  if(!x)return '';
  if(socketSelection?.id!==g.id)socketSelection=null;
  const selected=socketSelection&&socketSelection.n<x.count?socketSelection.n:-1,id=selected<0?null:x.gems[selected];
  const owned=GEMS.map((gem,type)=>({gem,type})).filter(({type})=>h.gems[type]>0);
  const slots=x.gems.map((gem,n)=>`<button type="button" class="equipment-socket-slot ${gem===null?'empty':''}" data-equipment-socket="${n}" aria-label="第 ${n+1} 孔：${gem===null?'空孔':esc(GEMS[gem].name)}" aria-pressed="${selected===n}" title="${gem===null?'空孔':esc(GEMS[gem].name)+' · '+esc(gemText(gem))}" onclick="selectEquipmentSocket('${esc(g.id)}',${n})">${socketIcon(gem)}<small>第 ${n+1} 孔</small></button>`).join('');
  const choices=selected>=0?`<div class="equipment-socket-choices" aria-label="第 ${selected+1} 孔寶石"><p class="small">第 ${selected+1} 孔 · ${id===null?'空孔':esc(GEMS[id].name)+' · '+esc(gemText(id))}</p><div class="equipment-gem-grid">${owned.map(({gem,type})=>{return `<button type="button" class="equipment-gem-choice" data-equipment-gem="${type}" aria-label="鑲嵌${esc(gem.name)}" aria-pressed="${id===type}" title="${esc(gemText(type))}" onclick="socketEquipmentGem('${esc(g.id)}',${selected},${type})" ${id===type?'disabled':''}>${socketIcon(type)}<span>${esc(gem.name)}</span><small>×${h.gems[type]}</small></button>`;}).join('')||'<p class="small">目前沒有可鑲嵌的已持有寶石。</p>'}</div><button type="button" class="equipment-gem-remove" onclick="socketEquipmentGem('${esc(g.id)}',${selected},-1)" ${id===null?'disabled':''}>免費拆除第 ${selected+1} 孔寶石</button></div>`:'';
  return `<section class="equipment-socket-editor" data-socket-equipment="${esc(g.id)}">${sk?'':'<h3>裝備技能</h3><p class="small">無附帶技能</p>'}${globalThis.__EMBERWILD_STORY?.protectedGear(g)?'<p class="small">教學進行中，完成後可出售或分解此裝備。</p>':''}<h3>鑲嵌孔 ${x.gems.filter(id=>id!==null).length}／${x.count}</h3><div class="equipment-socket-list">${slots||'<p class="small">此裝備沒有鑲嵌孔。</p>'}</div>${choices}<p class="small">點選孔位後選擇寶石。寶石提供屬性加成。拆除與替換免費；出售或分解時，寶石會退回庫存。</p></section>`;
 }

 const attributeBase=globalThis.equipmentAttributeDetailsHTML;
 globalThis.equipmentAttributeDetailsHTML=function(g,...args){
  const html=attributeBase(g,...args),sk=!EmberwildTokens.isToken(g)&&S.byId(g?.skillId);
  if(!sk)return html;
  const h=party.members[0],active=S.worn(h).some(item=>item.id===g.id)&&S.learned(h,sk);
  return html+`<section class="equipment-skill-description"><h3>裝備技能${active?' · 可配置':''}</h3><b class="equipment-skill-name">${esc(sk.name)} · ${labels[sk.type]}${usableBy(sk,h)?'':`（限${esc(skillJobsText(sk))}）`}</b>${usableBy(sk,h)?'':`<p class="small equipment-skill-limit">目前職業（${esc(CLASSES[h.job]?.name||'')}）無法啟用此裝備技能。</p>`}<p class="equipment-skill-effect">${esc(sk.description||detail(sk,h))}</p></section>`;
 };
 globalThis.showWornEquipmentDetail=function(id){
  const g=findGear(id);if(!g||EmberwildTokens.isToken(g)||!gearWearer(id))return false;
  const modal=$('modal');
  modal.innerHTML=`<h2>裝備詳情 · ${equipmentNameHTML(g)}</h2><p class="small">${esc(gearWearableJobsText(g))} · 裝等 ${gearRequiredLevel(g)} · ${qualityTag(g)}</p><p class="equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}<div class="actions"><button type="button" onclick="closeModal()">關閉</button></div>`;
  if(!modal.open)modal.showModal();
  return true;
 };
 const resetSocketSession=resetSession;
 resetSession=function(){socketSelection=null;return resetSocketSession();};
 const detailBase=inventoryGearDetail;inventoryGearDetail=function(g){return detailBase(g);};
 const slotBase=gearSlotHTML;gearSlotHTML=function(g,options){
  // v0.173: the worn page rows (contentOnly) are all worn, so they show the sockets in place of the worn checkmark.
  let html=slotBase(g,options);const gems=g?.skillSockets?.gems;if(options?.contentOnly)html=html.replace(/<span class="item-slot-worn"[\s\S]*?<\/svg><\/span>/,'');if(!gems?.length)return html;
  const label=gems.map((id,i)=>'第 '+(i+1)+' 孔：'+(GEMS[id]?.name||'空孔')).join('、');
  const icons=gems.map(id=>`<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="${esc(GEMS[id]?.color||'none')}" stroke="currentColor"/></svg>`).join('');
  const badge=`<span class="equipment-socket-badge" role="img" aria-label="${esc(label)}" title="${esc(label)}">${icons}</span>`;
  if(options?.contentOnly)return html.replace(/(<\/span>)$/,` ${badge.replace('class="equipment-socket-badge"','class="equipment-socket-badge worn-socket-badge"')}$1`);
  return html.replace(/(<\/button>)$/,badge+'$1');
 };
 // v0.076: newly learned skills are not equipped automatically. The skills tab shows NEW until the player has seen them,
 // and the skills page offers to equip each one. Seen skills are remembered per hero (seenSkillIds); on the first
 // check every skill already learned counts as seen, so existing saves start without a flood of NEW marks.
 const SLOT_TYPES=['active','proc','support'];
 function learnedSkillIds(h){return S.system().definitions.filter(sk=>SLOT_TYPES.includes(sk.type)&&!sk.disabled&&!sk.deleted&&sk.partnerId==null&&sk.jobs.includes(h.job)&&S.learned(h,sk)).map(sk=>sk.id);}
 function seenSkills(h){if(!Array.isArray(h.seenSkillIds))h.seenSkillIds=learnedSkillIds(h);return h.seenSkillIds;}
 function newSkillIds(h){if(!h||h!==party?.members?.[0]||__EMBERWILD_TEAMS.plan?.()?.job===null)return [];const seen=new Set(seenSkills(h)),slotted=new Set(Object.values(h.skillLoadout||{}).flat().filter(Boolean));return learnedSkillIds(h).filter(id=>!seen.has(id)&&!slotted.has(id));}
 function markSkillsSeen(h,ids){const seen=seenSkills(h);let changed=false;for(const id of ids)if(!seen.includes(id)){seen.push(id);changed=true;}if(changed){save();render();}return changed;}
 globalThis.newSkillCount=()=>{try{return newSkillIds(party?.members?.[0]).length;}catch{return 0;}};
 const reminderBase=globalThis.pageNewReminder;globalThis.pageNewReminder=id=>id==='skills'?newSkillCount()>0:!!reminderBase?.(id);
 globalThis.dismissNewSkills=function(){const h=party.members[0];return markSkillsSeen(h,newSkillIds(h));};
 // Open the first empty slot of the skill's type (or slot 1) with the new skill highlighted; seeing the list marks it.
 globalThis.equipNewSkill=function(id){const h=party.members[0],sk=S.byId(id);if(!sk||!SLOT_TYPES.includes(sk.type))return false;const slots=h.skillLoadout?.[sk.type]||[];const n=Math.max(0,slots.indexOf(null));return openSkillSlot(sk.type,n);};
 const slotBaseOpen=globalThis.openSkillSlot;globalThis.openSkillSlot=function(type,n){const h=party.members[0],fresh=newSkillIds(h).filter(id=>S.byId(id)?.type===type);const out=slotBaseOpen(type,n);if(out!==false&&fresh.length){{const modal=$('modal');let html=modal.innerHTML;for(const id of fresh)html=html.replace(`data-skill-id="${id}"><div class="skill-slot-name">`,`data-skill-id="${id}"><div class="skill-slot-name"><span class="quest-new skill-new" aria-label="新技能">NEW</span>`);modal.innerHTML=html;}const seen=seenSkills(h);for(const id of fresh)if(!seen.includes(id))seen.push(id);save();}return out;};
 const viewBase=skillsView;skillsView=function(){
  const html=viewBase(),h=party.members[0],fresh=newSkillIds(h);if(!fresh.length)return html;
  const rows=fresh.map(id=>{const sk=S.byId(id);return `<li><b>${esc(sk.name)}</b> <span class="tag">${sk.type==='support'?'輔助':labels[sk.type]}</span> <button type="button" onclick="equipNewSkill('${esc(id)}')">裝配</button></li>`;}).join('');
  const notice=`<section class="panel skill-new-guide" role="status"><h2>學會新技能 <span class="quest-new" aria-hidden="true">N</span></h2><p class="small">新技能不會自動裝上。按「裝配」選擇要放入的技能槽；槽位已滿時，可替換現有技能。</p><ul>${rows}</ul><button type="button" onclick="dismissNewSkills()">知道了</button></section>`;
  const at=html.indexOf('<section');return at<0?html+notice:html.slice(0,at)+notice+html.slice(at);
 };
 globalThis.__EMBERWILD_SKILL_SYSTEM_UI={detail,sockets,catalog,routes,conditions,missing,newSkillIds,markSkillsSeen};
})();
