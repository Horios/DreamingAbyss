
(()=>{
const M=globalThis.__EMBERWILD_MASTERY;if(!M)return;
const weaponLabel=k=>M.weaponTypes[k]||k||'未設定';
const masteryLabel=k=>M.masteryLabels[k]||k||'無';
const DEV_WEAPONS_BY_JOB=[['sword','axe','hammer'],['staff','grimoire'],['bow','crossbow'],['prayerBook','holyStaff']];
const masteryKeys=()=>M.validMasteries(state.job);
function learnedCore(i){return Number(state.skills?.[i])>0;}
function learnedSupport(i){return Number(state.supportLevels?.[i])>0;}
function masteryRequirementText(meta){
  const parts=[];
  if(meta?.requiredMastery)parts.push(`${masteryLabel(meta.requiredMastery)}精通 Lv${Math.max(0,Math.floor(Number(meta.requiredMasteryLevel)||0))}`);
  if(Array.isArray(meta?.weaponTypes)&&meta.weaponTypes.length)parts.push('武器 '+meta.weaponTypes.map(weaponLabel).join('／'));
  return parts;
}
function coreRequirementParts(sk,i){
  const meta=M.coreMeta(state.job,i),parts=[`角色 LV${sk[2]}`];
  if(skillRequiresAdvanced(sk,i))parts.push('完成二轉');
  if(meta?.partnerId!=null)parts.push('此夥伴專屬');return parts.concat(masteryRequirementText(meta));
}
function supportRequirementParts(sk,i){
  const parts=[`角色 LV${sk.level}`];if(i===2)parts.push('完成二轉');
  if(sk?.partnerId!=null)parts.push('此夥伴專屬');return parts.concat(masteryRequirementText(sk));
}
function requirementHTML(parts,missing){
  const misses=new Set(missing||[]);
  return `<div class="skill-requirements">${parts.map(x=>`<span class="tag ${[...misses].some(m=>x.includes(m)||m.includes(x.replace(/^角色 /,'')))?'missing':''}">${esc(x)}</span>`).join('')}</div>`;
}
function masterySummaryHTML(){
  M.ensureHero(state);const currentWeapon=M.currentWeaponType(state);
  return `<section class="panel mastery-summary-panel"><div class="row"><div><h2>精通</h2><p class="small">精通 XP 由符合體系的實際戰鬥行為取得；移到圖示上可查看目前進度。</p></div><span class="tag">目前武器：${esc(weaponLabel(currentWeapon))}</span></div><div class="mastery-summary mastery-icon-summary">${masteryKeys().map(key=>{const p=M.masteryProgress(state.mastery[key]),name=`${masteryLabel(key)}精通`,xpText=p.next?`${p.current} / ${p.next} XP`:`${p.xp} XP · 已達上限`;return `<div class="mastery-icon-item" tabindex="0" aria-label="${esc(name)} LV.${p.level}，${esc(xpText)}"><span class="mastery-icon-level">${esc(name)} LV.${p.level}</span><span class="mastery-icon-box">${skillIconHTML(key)}</span><span class="mastery-icon-tooltip"><b>${esc(name)} LV.${p.level}</b><span>目前／最大經驗：${esc(xpText)}</span></span></div>`;}).join('')}</div></section>`;
}
function coreDetailText(i){
  const sk=CLASSES[state.job].skills[i],meta=M.coreMeta(state.job,i),gain=meta.mastery?` · 使用時培養 ${masteryLabel(meta.mastery)}精通`:'';
  try{return coreSkillDetail(state.job,i,state)+gain;}catch{return (sk[1]==='active'?`冷卻 ${skillCooldown(i,state)} 回合`:`觸發率 ${Number((procChance(i,state)*100).toFixed(1))}%`)+gain;}
}
function renderCoreRows(kind){
  syncHeroSkillArrays(state);ensureProcSlots(state);
  const slots=kind==='active'?Array.from({length:2},(_,i)=>state.active?.[i]??null):state.procSlots;
  const clearFn=kind==='active'?'clearActiveSkill':'clearProcSkill',slotFn=kind==='active'?'equipSkill':'slotProcSkill';
  const rows=CLASSES[state.job].skills.map((sk,i)=>({sk,i})).filter(x=>x.sk[1]===kind&&(typeof coreSkillAvailableToHero!=='function'||coreSkillAvailableToHero(state.job,x.i)));
  return `<div class="actions active-slot-summary">${slots.map((id,slot)=>`<span>槽 ${slot+1}：${id===null?'未配置':esc(CLASSES[state.job].skills[id]?.[0]||'未知技能')} <button onclick="${clearFn}(${slot})">清空</button></span>`).join('')}</div><div class="skill-list">${rows.map(({sk,i})=>{
    const learned=learnedCore(i),missing=learned?M.coreMissingRequirements(state,i,true):M.coreMissingRequirements(state,i,false),meta=M.coreMeta(state.job,i),gem=state.sockets[i]??null,parts=coreRequirementParts(sk,i);
    const usable=learned&&!M.coreMissingRequirements(state,i,true).length;
    return `<article class="skill-list-row"><div><div class="skill-list-title"><b>${skillIconFor(state.job,'core',i)}${esc(sk[0])}</b><span class="skill-state ${learned?'learned':'locked'}">${learned?'已學':'未學'}</span><span>${kind==='proc'?'普攻觸發':'主動'}</span></div>${skillTypeBadges(state.job,i)}${skillMechanicsDetails(state.job,i)}<p class="skill-flavor"><b>說明：</b>${esc(typeof coreSkillFlavor==='function'?coreSkillFlavor(state.job,i):'')}</p><p class="skill-detail"><b>詳細：</b>${esc(coreDetailText(i))}</p>${requirementHTML(parts,missing)}${learned&&!usable?`<p class="small">目前無法使用：${esc(M.coreMissingRequirements(state,i,true).join('、'))}</p>`:''}</div><div class="skill-list-controls"><button onclick="learn(${i})" ${learned||missing.length?'disabled':''}>${learned?'已學會':missing.length?'尚未達成':'學習'}</button>${[0,1].map(slot=>`<button onclick="${slotFn}(${i},${slot})" ${learned?'':'disabled'}>${slots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}<label>寶石 <select aria-label="${esc(sk[0])}寶石" onchange="socket(${i},this.value)" ${learned?'':'disabled'}><option value="-1" ${gem===null?'selected':''}>不鑲嵌</option>${GEMS.map((g,j)=>`<option value="${j}" ${gem===j?'selected':''} ${state.gems[j]<1&&gem!==j?'disabled':''}>${esc(g.name)} ×${state.gems[j]} · ${esc(g.desc)}</option>`).join('')}</select></label></div></article>`;
  }).join('')}</div>`;
}
coreSkillRows=function(){return renderCoreRows('active');};
globalThis.procSkillRows=function(){return renderCoreRows('proc');};

supportSkillRows=function(){
  M.ensureHero(state);
  return `<div class="actions">${state.supportSlots.map((id,slot)=>`<span>槽 ${slot+1}：${id===null?'未配置':esc(SUPPORT[state.job][id]?.name||'未知技能')} <button onclick="slotSupport(null,${slot})">清空</button></span>`).join('')}</div><div class="skill-list">${SUPPORT[state.job].map((sk,i)=>{
    const learned=learnedSupport(i),missing=learned?M.supportMissingRequirements(state,i,true):M.supportMissingRequirements(state,i,false),parts=supportRequirementParts(sk,i),usable=learned&&!M.supportMissingRequirements(state,i,true).length;
    let detail='';try{detail=supportSkillDetail(state.job,i,state);}catch{detail=`${TARGET_NAMES[sk.target]||sk.target} · ${EFFECT_NAMES[sk.kind]||sk.kind} ${Number((supportAmount(state.job,i)*100).toFixed(1))}% · 冷卻 ${sk.cooldown} 回合`;}
    if(sk.mastery)detail+=` · 使用時培養 ${masteryLabel(sk.mastery)}精通`;
    return `<article class="skill-list-row"><div><div class="skill-list-title"><b>${skillIconFor(state.job,'support',i)}${esc(sk.name)}</b><span class="skill-state ${learned?'learned':'locked'}">${learned?'已學':'未學'}</span><span>${esc(ELEMENTS[sk.element]||sk.element)}</span></div>${skillTypeBadges(state.job,i,'support')}${skillMechanicsDetails(state.job,i,'support')}<p class="skill-flavor"><b>說明：</b>${esc(sk.description||'')}</p><p class="skill-detail"><b>詳細：</b>${esc(detail)}</p>${requirementHTML(parts,missing)}${learned&&!usable?`<p class="small">目前無法使用：${esc(M.supportMissingRequirements(state,i,true).join('、'))}</p>`:''}</div><div class="skill-list-controls"><button onclick="learnSupport(${i})" ${learned||missing.length?'disabled':''}>${learned?'已學會':missing.length?'尚未達成':'學習'}</button>${[0,1].map(slot=>`<button onclick="slotSupport(${i},${slot})" ${learned?'':'disabled'}>${state.supportSlots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}</div></article>`;
  }).join('')}</div>`;
};


let skillTurn=1,skillSelection=null,skillSelectionJob=null;
const ICONS=globalThis.__EMBERWILD_SKILL_ICONS;
// Skill tiles use a small, consistent vocabulary. The full palette is available
// to the balance editor for explicit choices and layered compositions.
const DEFAULT_CORE_ICONS={
  '裂地斬':'sword','堅毅壁壘':'shield','反擊之刃':'sword','浴血重擊':'axeBlood','聖鋼裁決':'sword','不屈戰意':'shield',
  '火焰箭':'fire','冰霜護幕':'ice','餘燼爆發':'fire','奧術汲取':'shadow','隕星墜落':'fire','魔力迴響':'wind',
  '穿透箭':'pierce','林間休憩':'eagleEye','連射':'volley','獵手印記':'trap','疾風箭雨':'volley','生命之箭':'pierce',
  '聖光審判':'light','治癒禱言':'heal','懲戒':'shadow','生命泉源':'heal','黎明聖印':'light','神聖庇護':'light'
};
const DEFAULT_SUPPORT_ICONS={
  '戰吼':'sword','守護誓言':'shield','破甲怒吼':'axe',
  '奧術共鳴':'magic','時間凝滯':'ice','元素灼印':'fire',
  '鷹眼指引':'eagleEye','獵手標記':'trap','風行庇佑':'eagleEye',
  '晨光祝福':'light','聖光庇護':'light','光明祈願':'light'
};
function skillTurnOfCore(sk,i){return skillRequiresAdvanced(sk,i)?2:1;}
function skillTurnOfSupport(sk,i){return i===2?2:1;}
function inferredCoreIcon(sk,i,job=state.job){
  const meta=M.coreMeta(job,i),explicit=meta?.iconType;
  if(explicit&&explicit!=='auto')return explicit;
  if(Object.hasOwn(DEFAULT_CORE_ICONS,sk[0]))return DEFAULT_CORE_ICONS[sk[0]];
  if(sk[5]==='heal')return 'heal';
  if(['shield','shieldLowest'].includes(sk[5]))return 'shield';
  if(job===0){
    const weapon=['sword','axe','hammer'].includes(meta?.mastery)?meta.mastery:'sword';
    if(sk[5]==='drain')return weapon==='axe'?'axeBlood':'swordBlood';
    return weapon;
  }
  if(job===2)return sk[1]==='proc'?'volley':'pierce';
  const element=typeof coreSkillElement==='function'?coreSkillElement(job,i):(SKILL_ELEMENTS[job]?.[i]||'physical');
  if(['fire','ice','wind','light','shadow'].includes(element))return element;
  if(sk[5]==='drain')return 'blood';
  return 'magic';
}
function inferredSupportIcon(sk,job=state.job){
  const explicit=sk?.iconType;if(explicit&&explicit!=='auto')return explicit;
  if(Object.hasOwn(DEFAULT_SUPPORT_ICONS,sk?.name))return DEFAULT_SUPPORT_ICONS[sk.name];
  if(job===2)return ['fracture','vulnerable','weaken'].includes(sk?.kind)?'trap':'eagleEye';
  if(job===0)return sk?.kind==='guard'?'shield':'sword';
  if(['fire','ice','wind','light','shadow'].includes(sk?.element))return sk.element;
  if(sk?.kind==='regen')return 'heal';
  if(sk?.kind==='guard')return 'shield';
  return 'magic';
}
function skillIconHTML(type,options={},inline=false){
  const definitions=M.iconDefinitions(),custom=typeof type==='string'&&type.startsWith('custom:')&&definitions.some(icon=>icon.id===type.slice(7));
  const key=ICONS.hasIcon(type)||ICONS.isLucideReference(type)||custom?type:'magic',tone=ICONS.toneByKey[key]||'neutral';
  return `<span class="skill-icon-glyph ${custom?'icon-custom':ICONS.isLucideReference(key)?'icon-lucide':'icon-'+key} tone-${tone}" aria-hidden="true"${inline?' style="display:inline-grid;vertical-align:middle;margin-right:6px"':''}>${ICONS.svgFor(key,definitions,options)}</span>`;
}
// Rows and loadouts share the tile icon vocabulary, independent of the actor
// currently selected elsewhere. Auto icons stay compact; configured appearance
// keeps its own size unless a small loadout preview explicitly requests one.
function skillIconFor(job,kind,index,options={}){
  const sk=kind==='core'?CLASSES[job]?.skills?.[index]:kind==='support'?SUPPORT[job]?.[index]:null;
  if(!sk)return '';
  const meta=kind==='core'?M.coreMeta(job,index):sk;
  const type=kind==='core'?inferredCoreIcon(sk,index,job):inferredSupportIcon(sk,job);
  const size=meta?.iconType&&meta.iconType!=='auto'?{}:{size:24};
  return skillIconHTML(type,{...size,...options,color:globalThis.__EMBERWILD_ICON_COLOR?.('skill',kind+':'+job+':'+index)||options.color},true);
}
function skillMasteryTooltip(meta){
  if(!meta?.requiredMastery)return '精通要求：無';
  const lv=Math.max(0,Math.floor(Number(meta.requiredMasteryLevel)||0)),current=M.masteryLevelFromXp(state.mastery?.[meta.requiredMastery]||0);
  return `精通要求：${masteryLabel(meta.requiredMastery)}精通 Lv${lv}（目前 Lv${current}）`;
}
function skillCatalogEntries(){
  M.ensureHero(state);syncHeroSkillArrays(state);ensureProcSlots(state);
  const core=CLASSES[state.job].skills.map((sk,i)=>({type:'core',i,sk,name:sk[0],level:Math.max(1,Math.floor(Number(sk[2])||1)),turn:skillTurnOfCore(sk,i),icon:inferredCoreIcon(sk,i),meta:M.coreMeta(state.job,i)})).filter(x=>typeof coreSkillAvailableToHero!=='function'||coreSkillAvailableToHero(state.job,x.i));
  const support=SUPPORT[state.job].map((sk,i)=>({type:'support',i,sk,name:sk.name,level:Math.max(1,Math.floor(Number(sk.level)||1)),turn:skillTurnOfSupport(sk,i),icon:inferredSupportIcon(sk),meta:sk})).filter(x=>typeof skillAllowedForPartner!=='function'||skillAllowedForPartner(state,x.sk));
  return [...core,...support].sort((a,b)=>a.level-b.level||a.type.localeCompare(b.type)||a.i-b.i);
}
function skillTileHTML(entry){
  const learned=entry.type==='core'?learnedCore(entry.i):learnedSupport(entry.i),selected=skillSelection?.type===entry.type&&skillSelection?.i===entry.i;
  const missing=entry.type==='core'?M.coreMissingRequirements(state,entry.i,false):M.supportMissingRequirements(state,entry.i,false);
  const kind=entry.type==='support'?'輔助技能':entry.sk[1]==='proc'?'普攻觸發技能':'主動技能';
  const kindClass=entry.type==='support'?'skill-kind-support':entry.sk[1]==='proc'?'skill-kind-proc':'skill-kind-active';
  const requirements=entry.type==='core'?coreRequirementParts(entry.sk,entry.i):supportRequirementParts(entry.sk,entry.i);
  return `<button type="button" class="skill-icon-tile ${kindClass} ${learned?'learned':'locked'} ${selected?'selected':''}" onclick="selectSkillTile('${entry.type}',${entry.i})" aria-label="${esc(entry.name)}">${skillIconHTML(entry.icon)}<span class="skill-icon-status" aria-hidden="true">${learned?'✓':''}</span><span class="skill-icon-tooltip"><b>${esc(entry.name)}</b><span>${esc(kind)} · LV${entry.level}</span><span>${esc(skillMasteryTooltip(entry.meta))}</span><span>學習條件：${esc(requirements.join(' · '))}</span>${missing.length?`<span class="missing">尚缺：${esc(missing.join('、'))}</span>`:''}</span></button>`;
}
function skillLevelBoardHTML(entries){
  if(!entries.length)return '<section class="panel"><p class="empty">此轉職階段目前沒有技能。</p></section>';
  const groups=new Map();for(const entry of entries){if(!groups.has(entry.level))groups.set(entry.level,[]);groups.get(entry.level).push(entry);}
  return `<div class="skill-level-board">${[...groups.entries()].map(([level,list])=>`<section class="skill-level-row"><div class="skill-level-label"><span>LV</span><strong>${level}</strong></div><div class="skill-level-icons">${list.map(skillTileHTML).join('')}</div></section>`).join('')}</div>`;
}
function coreSelectedDetail(i){
  const sk=CLASSES[state.job].skills[i];if(!sk)return '';
  const kind=sk[1],learned=learnedCore(i),missing=learned?M.coreMissingRequirements(state,i,true):M.coreMissingRequirements(state,i,false),usable=learned&&!M.coreMissingRequirements(state,i,true).length,gem=state.sockets[i]??null,parts=coreRequirementParts(sk,i);
  const slots=kind==='active'?Array.from({length:2},(_,slot)=>state.active?.[slot]??null):state.procSlots,slotFn=kind==='active'?'equipSkill':'slotProcSkill';
  return `<section class="panel skill-selected-panel ${kind==='proc'?'skill-kind-proc':'skill-kind-active'}"><div class="skill-selected-heading">${skillIconHTML(inferredCoreIcon(sk,i),{color:globalThis.__EMBERWILD_ICON_COLOR?.('skill','core:'+state.job+':'+i)})}<div><h2>${esc(sk[0])}</h2><div class="skill-list-title"><span class="skill-state ${learned?'learned':'locked'}">${learned?'已學':'未學'}</span><span>${kind==='proc'?'普攻觸發':'主動'}</span></div></div></div>${skillTypeBadges(state.job,i)}${skillMechanicsDetails(state.job,i)}<p class="skill-flavor"><b>說明：</b>${esc(typeof coreSkillFlavor==='function'?coreSkillFlavor(state.job,i):'')}</p><p class="skill-detail"><b>詳細：</b>${esc(coreDetailText(i))}</p>${requirementHTML(parts,missing)}${learned&&!usable?`<p class="small">目前無法使用：${esc(M.coreMissingRequirements(state,i,true).join('、'))}</p>`:''}<div class="skill-selected-controls"><button onclick="learn(${i})" ${learned||missing.length?'disabled':''}>${learned?'已學會':missing.length?'尚未達成':'學習'}</button>${[0,1].map(slot=>`<button onclick="${slotFn}(${i},${slot})" ${learned?'':'disabled'}>${slots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}<label>寶石 <select aria-label="${esc(sk[0])}寶石" onchange="socket(${i},this.value)" ${learned?'':'disabled'}><option value="-1" ${gem===null?'selected':''}>不鑲嵌</option>${GEMS.map((g,j)=>`<option value="${j}" ${gem===j?'selected':''} ${state.gems[j]<1&&gem!==j?'disabled':''}>${esc(g.name)} ×${state.gems[j]} · ${esc(g.desc)}</option>`).join('')}</select></label></div></section>`;
}
function supportSelectedDetail(i){
  const sk=SUPPORT[state.job]?.[i];if(!sk)return '';
  const learned=learnedSupport(i),missing=learned?M.supportMissingRequirements(state,i,true):M.supportMissingRequirements(state,i,false),usable=learned&&!M.supportMissingRequirements(state,i,true).length,parts=supportRequirementParts(sk,i);
  let detail='';try{detail=supportSkillDetail(state.job,i,state);}catch{detail=`${TARGET_NAMES[sk.target]||sk.target} · ${EFFECT_NAMES[sk.kind]||sk.kind} ${Number((supportAmount(state.job,i)*100).toFixed(1))}% · 冷卻 ${sk.cooldown} 回合`;}
  if(sk.mastery)detail+=` · 使用時培養 ${masteryLabel(sk.mastery)}精通`;
  return `<section class="panel skill-selected-panel skill-kind-support"><div class="skill-selected-heading">${skillIconHTML(inferredSupportIcon(sk),{color:globalThis.__EMBERWILD_ICON_COLOR?.('skill','support:'+state.job+':'+i)})}<div><h2>${esc(sk.name)}</h2><div class="skill-list-title"><span class="skill-state ${learned?'learned':'locked'}">${learned?'已學':'未學'}</span><span>輔助</span></div></div></div>${skillTypeBadges(state.job,i,'support')}${skillMechanicsDetails(state.job,i,'support')}<p class="skill-flavor"><b>說明：</b>${esc(sk.description||'')}</p><p class="skill-detail"><b>詳細：</b>${esc(detail)}</p>${requirementHTML(parts,missing)}${learned&&!usable?`<p class="small">目前無法使用：${esc(M.supportMissingRequirements(state,i,true).join('、'))}</p>`:''}<div class="skill-selected-controls"><button onclick="learnSupport(${i})" ${learned||missing.length?'disabled':''}>${learned?'已學會':missing.length?'尚未達成':'學習'}</button>${[0,1].map(slot=>`<button onclick="slotSupport(${i},${slot})" ${learned?'':'disabled'}>${state.supportSlots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}</div></section>`;
}
function selectedSkillDetailHTML(entries){
  if(skillSelectionJob!==memberKey(state)){skillSelectionJob=memberKey(state);skillSelection=null;skillTurn=1;}
  const visible=entries.filter(x=>x.turn===skillTurn);
  if(!visible.length){skillSelection=null;return '';}
  if(!skillSelection||!visible.some(x=>x.type===skillSelection.type&&x.i===skillSelection.i))skillSelection={type:visible[0].type,i:visible[0].i};
  return skillSelection.type==='core'?coreSelectedDetail(skillSelection.i):supportSelectedDetail(skillSelection.i);
}
globalThis.setSkillTurn=function(turn){turn=Number(turn);if(![1,2].includes(turn)||turn===skillTurn)return;skillTurn=turn;skillSelection=null;render();};
globalThis.selectSkillTile=function(type,i){i=Number(i);if(!['core','support'].includes(type)||!Number.isInteger(i))return;skillSelection={type,i};skillSelectionJob=memberKey(state);render();};

function skillLoadoutSummaryHTML(){
  syncHeroSkillArrays(state);ensureProcSlots(state);
  const active=Array.from({length:2},(_,slot)=>state.active?.[slot]??null),proc=Array.from({length:2},(_,slot)=>state.procSlots?.[slot]??null),support=Array.from({length:2},(_,slot)=>state.supportSlots?.[slot]??null);
  const coreName=id=>id===null?'未配置':CLASSES[state.job].skills[id]?.[0]||'未知技能',supportName=id=>id===null?'未配置':SUPPORT[state.job]?.[id]?.name||'未知技能';
  const group=(kind,label,slots,nameOf,clearFn,type)=>`<div class="skill-loadout-group ${kind}"><b>${label}</b><div class="skill-loadout-slots">${slots.map((id,slot)=>`<span class="skill-loadout-slot"><span>槽 ${slot+1}</span><strong>${id===null?'':skillIconFor(state.job,type,id,{size:16})}${esc(nameOf(id))}</strong><button onclick="${clearFn}(${slot})" ${id===null?'disabled':''}>清空</button></span>`).join('')}</div></div>`;
  return `<section class="skill-loadout-panel">${group('skill-kind-active','主動技能',active,coreName,'clearActiveSkill','core')}${group('skill-kind-proc','觸發技能',proc,coreName,'clearProcSkill','core')}${group('skill-kind-support','輔助技能',support,supportName,'slotSupport.bind(null,null)','support')}</section>`.replace(/slotSupport\.bind\(null,null\)\((\d+)\)/g,'slotSupport(null,$1)');
}

function masteryGainHTML(source){
  const entries=Object.entries(source||{}).filter(([key])=>key.startsWith(state.job+':'));
  return entries.length?`<div class="mastery-gain-list">${entries.map(([key,xp])=>`<span class="tag">${esc(masteryLabel(key.split(':')[1]))} +${xp} XP</span>`).join('')}</div>`:'<span class="small">尚無紀錄</span>';
}
function devToolHTML(){
  const player=playerHero();
  const weaponTypes=DEV_WEAPONS_BY_JOB[state.job]||[];
  return `<details class="panel mastery-dev-tools"><summary>測試版開發工具</summary><p class="small">只存在 chatgpt-dev。直接改測試角色資料；長時間模擬會實際推進戰鬥、EXP、掉落與精通。</p><div class="mastery-dev-grid">
    <div class="mastery-dev-box"><b>主角進度（夥伴等級同步）</b><div class="actions"><label>LV <input id="dev-mastery-level" type="number" min="1" max="${RULES.maxLevel}" value="${player.lv}"></label><button onclick="devMasterySetLevel()">設定</button></div><div class="actions"><label>EXP <input id="dev-mastery-exp" type="number" min="0" value="${player.xp}"></label><button onclick="devMasterySetExp()">設定</button></div></div>
    <div class="mastery-dev-box"><b>精通 XP</b>${masteryKeys().map(key=>`<div class="actions"><span style="min-width:54px">${esc(masteryLabel(key))}</span><button onclick="devMasteryAdjust('${key}',-10)">−10</button><input id="dev-mastery-${key}" type="number" min="0" value="${state.mastery[key]}"><button onclick="devMasterySet('${key}')">設定</button><button onclick="devMasteryAdjust('${key}',10)">+10</button></div>`).join('')}<button onclick="devMasteryReset()">重置此角色精通</button></div>
    <div class="mastery-dev-box"><b>武器切換</b><div class="actions">${weaponTypes.map(type=>`<button onclick="devMasteryWeapon('${type}')">${esc(weaponLabel(type))}</button>`).join('')||'<span class="small">目前資料沒有可切換武器。</span>'}</div><p class="small">沒有對應武器時會建立一件基底評級：D 的測試武器並直接穿戴。</p></div>
    <div class="mastery-dev-box"><b>戰鬥模擬</b><div class="actions"><label>秒 <input id="dev-mastery-rounds" type="number" min="1" max="2000" value="100"></label><button onclick="devMasterySimulate()">模擬</button></div><p class="small">上次完整遭遇精通：${masteryGainHTML(M.lastBattleGain())}</p><p class="small">目前遭遇精通：${masteryGainHTML(M.currentBattleGain())}</p></div>
  </div><div class="divider"></div><b>技能測試開關</b><div class="actions">${CLASSES[state.job].skills.map((sk,i)=>`<button onclick="devMasteryToggleCore(${i})">${learnedCore(i)?'取消':'學會'} ${esc(sk[0])}</button>`).join('')}</div><div class="actions">${SUPPORT[state.job].map((sk,i)=>`<button onclick="devMasteryToggleSupport(${i})">${learnedSupport(i)?'取消':'學會'} ${esc(sk.name)}</button>`).join('')}</div></details>`;
}
skillsView=function(){
  M.ensureHero(state);
  return singlePagePanel('skills','技能',()=>{const entries=skillCatalogEntries();if(skillSelectionJob!==memberKey(state)){skillSelectionJob=memberKey(state);skillSelection=null;skillTurn=1;}const visible=entries.filter(x=>x.turn===skillTurn),detail=selectedSkillDetailHTML(entries);return `${skillLoadoutSummaryHTML()}<div class="actions skill-turn-tabs"><button class="${skillTurn===1?'primary':''}" onclick="setSkillTurn(1)">一轉</button><button class="${skillTurn===2?'primary':''}" onclick="setSkillTurn(2)">二轉</button></div>${masterySummaryHTML()}<p class="small skill-board-help">技能依學習角色等級分列；移到圖示上可查看精通與其他學習條件，點擊圖示可查看詳細資料與配置。</p><div class="skill-layout-split"><div class="skill-tree-pane">${skillLevelBoardHTML(visible)}</div><div class="skill-detail-pane">${detail}</div></div>${devToolHTML()}`;});
};
globalThis.__EMBERWILD_MASTERY_UI={icon:skillIconHTML,skillIcon:skillIconFor,loadout:skillLoadoutSummaryHTML,devTools:devToolHTML,individual:()=>skillLoadoutSummaryHTML()+masterySummaryHTML()+coreSkillRows()+procSkillRows()+supportSkillRows()+devToolHTML()};

function stopForDev(){running=false;partyBusy=false;}
globalThis.devMasterySetLevel=function(){
  stopForDev();const el=$('dev-mastery-level'),lv=Math.max(1,Math.min(RULES.maxLevel,Math.floor(Number(el?.value)||1)));const h=playerHero();h.lv=lv;h.xp=Math.min(h.xp,Math.max(0,need(lv)-1));h.hp=stats(h).hp;save();render();
};
globalThis.devMasterySetExp=function(){
  stopForDev();const el=$('dev-mastery-exp'),xp=Math.max(0,Math.floor(Number(el?.value)||0));const h=playerHero();h.xp=h.lv>=levelCap(h)?0:Math.min(xp,Math.max(0,need(h.lv)-1));save();render();
};
globalThis.devMasterySet=function(key){
  if(!masteryKeys().includes(key))return;stopForDev();const el=$('dev-mastery-'+key);state.mastery[key]=Math.max(0,Math.floor(Number(el?.value)||0));save();render();
};
globalThis.devMasteryAdjust=function(key,delta){
  if(!masteryKeys().includes(key))return;stopForDev();state.mastery[key]=Math.max(0,Math.floor((Number(state.mastery[key])||0)+Number(delta||0)));save();render();
};
globalThis.devMasteryReset=function(){stopForDev();for(const key of masteryKeys())state.mastery[key]=0;save();render();toast('已重置此角色精通');};
function clearCoreConfig(i){
  state.active=state.active.map(x=>x===i?null:x);ensureProcSlots(state);state.procSlots=state.procSlots.map(x=>x===i?null:x);
  const gem=state.sockets?.[i];if(gem!==null&&gem!==undefined){state.gems[gem]=(state.gems[gem]||0)+1;state.sockets[i]=null;}
}
globalThis.devMasteryToggleCore=function(i){stopForDev();if(!CLASSES[state.job]?.skills?.[i])return;if(state.skills[i]){state.skills[i]=0;clearCoreConfig(i);}else state.skills[i]=1;save();render();};
globalThis.devMasteryToggleSupport=function(i){stopForDev();if(!SUPPORT[state.job]?.[i])return;if(state.supportLevels[i]){state.supportLevels[i]=0;state.supportSlots=state.supportSlots.map(x=>x===i?null:x);}else state.supportLevels[i]=1;save();render();};
globalThis.devMasteryWeapon=function(type){
  stopForDev();if(!M.weaponTypes[type])return;let g=state.bag?.find(x=>Number(x.slot)===0&&x.weaponType===type);
  if(!g){
    let index=(ITEM_FORMS[state.job]?.[0]||[]).findIndex(x=>x.weaponType===type),synthetic=index<0;
    if(state.bag.length>=RULES.bagCapacity)return toast('背包已滿');
    if(index<0)index=0;
    g=gear(1,0,0,state.job);g.formJob=state.job;g.form=index;g.weaponType=type;g.name=(synthetic?'【測試】'+weaponLabel(type)+' · ':'')+gearName(g);if(synthetic)g.devWeaponTypeOverride=true;addGear(g);
  }
  equipGear(g.id);save();render();toast('已切換為 '+weaponLabel(type));
};
globalThis.devMasterySimulate=function(){
  stopForDev();const el=$('dev-mastery-rounds'),target=Math.max(1,Math.min(2000,Math.floor(Number(el?.value)||100)));let completed=0,actions=0;
  running=true;if(!foes.some(e=>e.hp>0))spawnGroup();
  try{
    if(globalThis.EmberwildSecondsCombat?.active){
      const end=partyClock+target;let guard=0;
      while(running&&partyClock<end&&!$('modal')?.open){const step=EmberwildSecondsCombat.step();completed=target-Math.max(0,end-partyClock);if(++guard>100000)throw Error('模擬事件超過安全上限');}
    }else for(;completed<target;completed++){const gen=pacedRound();for(const step of gen)if(++actions>400000)throw Error('模擬事件超過安全上限');}
  }catch(e){console.warn('長時間戰鬥模擬中止',e);toast('模擬中止：'+e.message);}
  running=false;save();render();if(completed)toast(`已模擬 ${Number(completed.toFixed(1))} ${globalThis.EmberwildSecondsCombat?.active?'秒':'個戰鬥回合'}`);
};

if(GAMEPLAY_SETTINGS.quests?.tutorial)GAMEPLAY_SETTINGS.quests.tutorial.skillLevelRequirement=1;
if(GAMEPLAY_SETTINGS_DEFAULTS.quests?.tutorial)GAMEPLAY_SETTINGS_DEFAULTS.quests.tutorial.skillLevelRequirement=1;
tutorial=function(){
  if(state.tutorial>=3)return '';const t=GAMEPLAY_SETTINGS.quests.tutorial;
  const texts=[['01 / 初次狩獵',`在苔光林地開始自動探索，擊敗 ${Math.round(t.killRequirement)} 隻怪物。`,state.totalKills>=t.killRequirement],['02 / 整理行囊','前往「裝備強化」，將任一裝備強化一次。',state.bag.some(g=>g.plus>0)],['03 / 技能配置','前往「技能」確認初始技能，並開始累積精通。',state.skills[0]>0]][state.tutorial];
  return `<div class="tutorial"><div><b>${texts[0]}</b><p>${texts[1]}</p></div><button ${texts[2]?'':'disabled'} onclick="claimTutorial()">領取獎勵</button></div>`;
};

const masteryCharacterViewBase=characterView;
characterView=function(){
  const h=typeof pageHero==='function'?pageHero('character'):state;M.ensureHero(h);let html=masteryCharacterViewBase();
  html=html.replace(/升級獲得\s*\d+\s*能力點[、，]\s*\d+\s*技能點；?/g,'升級後依職業自然成長；').replace(/技能點\s*\+\s*\d+/g,'');
  const req=M.masterySettings().advanceRequiredLevel,best=Math.max(0,...M.validMasteries(h.job).map(k=>M.masteryLevelFromXp(h.mastery[k]))),a=GAMEPLAY_SETTINGS.progression.advance,disabled=h.advanced||h.lv<a.level||best<req;
  html=html.replace(/<button class="primary" onclick="heroMenuAction\((\d+),\(\)=>\{advance\(\)\}\)"\s*(?:disabled)?\s*>/,(_,job)=>`<button class="primary" onclick="heroMenuAction(${job},()=>{advance()})"${disabled?' disabled':''}>`);
  return html+`<section class="panel"><h2>二轉精通條件</h2><p>除既有角色等級與資源外，需要本職任一主要精通達 Lv${req}。</p><p class="small">目前最高精通 Lv${best}。不要求所有精通平均培養。</p></section>`;
};
const masteryGuideBase=guideView;
guideView=function(){
  return `<section class="panel"><h2>角色成長與精通</h2><p>角色升級後會依職業自然成長並解鎖新的冒險內容。戰士與弓箭手使用對應武器的普攻與技能可累積武器精通；法師與牧師依實際施放技能的體系累積元素或光暗精通。技能學習與二轉可能需要指定的精通等級，習得技能即可使用完整效果。</p></section>`+masteryGuideBase();
};
if(state){save();render();}
})();
