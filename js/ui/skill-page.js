/* v0.214 Skill page split: 技能配置 (default), 技能圖鑑 and 職業成長.
   Data, learning, slot rules and combat are untouched: slots change through configureSkill(), passives through
   setPassiveSkillEnabled(), details come from skill-system-ui.js (detailSections / card, read from the battle data),
   and the class growth page is the existing class mastery list (class-mastery-tree.js). */
(()=>{
  'use strict';
  const S=()=>globalThis.__EMBERWILD_SKILLS,U=()=>globalThis.__EMBERWILD_SKILL_SYSTEM_UI;
  const PAGES=[{id:'loadout',label:'技能配置'},{id:'catalog',label:'技能圖鑑'},{id:'growth',label:'職業成長'}];
  const TYPE={active:'主動',proc:'觸發',passive:'被動'};
  const SOURCE={class:'職業',advanced:'職業',quest:'任務',equipment:'裝備',companion:'夥伴'};
  let page='loadout',catalogSelected=null,catalogFilter={state:'all',type:'all',source:'all'};
  // Unlearned skills are shown by default (the choice is remembered), as in the earlier slot dialog.
  let slotShowLocked=true;try{slotShowLocked=localStorage.getItem('emberwild.skillSlotShowLocked')!=='0';}catch{}
  let slotPreview=null;
  const attr=v=>esc(String(v??''));
  const svg=(glyph,size=20)=>globalThis.__EMBERWILD_SKILL_ICONS?.svgFor('lucide:'+glyph,[],{size})||'';
  const hero=()=>party?.members?.[0];
  const slotType=sk=>S().slotType(sk);
  const sourceText=sk=>[...new Set((sk.sources||[]).map(s=>SOURCE[s.type]||s.type))].join('／');
  const oneLine=sk=>String(sk.description||'').split(/[。\n]/)[0];
  const pending=()=>!!globalThis.EmberwildBattleConfiguration?.pending?.();

  globalThis.setSkillPage=function(id){if(!PAGES.some(p=>p.id===id))return false;page=id;render();return true;};
  globalThis.currentSkillPage=()=>page;
  function tabs(){
    // The catalog tab keeps the old 技能圖鑑 button's handler, which tutorials point at.
    return `<div class="skill-page-tabs" role="tablist" aria-label="技能頁">${PAGES.map(p=>`<button type="button" role="tab" class="skill-page-tab${p.id===page?' is-active':''}" aria-selected="${p.id===page}" data-skill-page="${p.id}" onclick="${p.id==='catalog'?'openSkillCatalog()':`setSkillPage('${p.id}')`}">${p.label}</button>`).join('')}</div>`;
  }
  function header(h){
    const level=typeof classMasteryLevel==='function'?classMasteryLevel(h):0;
    return `<div class="skill-page-head"><div><b>${attr(CLASSES[h.job]?.name||'')}</b><span class="small">${attr(characterName(h))}</span></div><span class="small">${attr(CLASSES[h.job]?.name||'')}精通 Lv.${level}</span></div>`;
  }

  /* ---------- 技能配置 ---------- */
  function cell(type,n,id){
    const sk=id&&S().byId(id),label=TYPE[type]+'槽 '+(n+1);
    return `<button type="button" class="skill-cell skill-cell-${type}${sk?'':' is-empty'}" data-skill-slot="${type}:${n}" onclick="openSkillSlot('${type}',${n})" aria-label="${attr(label+'：'+(sk?sk.name:'空欄位'))}"><span class="skill-cell-art">${sk?U().icon(sk):svg('plus',22)}</span><span class="skill-cell-name">${sk?attr(sk.name):'空欄位'}</span></button>`;
  }
  function row(type,label,body,note=''){return `<div class="skill-row skill-row-${type}"><span class="skill-row-label">${label}</span><div class="skill-row-cells">${body}</div>${note}</div>`;}
  function passiveRow(h){
    const learned=U().sortedSkills(S().system().definitions.filter(sk=>sk.type==='passive'&&S().learned(h,sk)),h),on=learned.filter(sk=>S().passiveEnabled(h,sk.id));
    const cells=on.map(sk=>`<button type="button" class="skill-cell skill-cell-passive" data-passive-cell="${attr(sk.id)}" onclick="showSkillInformation('${attr(sk.id)}')" aria-label="${attr('被動：'+sk.name)}"><span class="skill-cell-art">${U().icon(sk)}</span><span class="skill-cell-name">${attr(sk.name)}</span></button>`).join('');
    const manage=learned.length?`<button type="button" class="skill-cell skill-cell-manage" onclick="openPassiveManager()" aria-label="管理被動技能"><span class="skill-cell-art">${svg('settings-2',22)}</span><span class="skill-cell-name">管理</span></button>`:'';
    return row('passive','被動',cells+manage||'<span class="small">尚未學會被動技能</span>',learned.length?`<span class="small skill-row-note">生效 ${on.length} / 已學 ${learned.length}</span>`:'');
  }
  function newSkillNotice(h){
    const fresh=U().newSkillIds(h);if(!fresh.length)return '';
    return `<section class="skill-new-guide" role="status"><b>學會新技能 <span class="quest-new" aria-hidden="true">N</span></b><ul>${fresh.map(id=>{const sk=S().byId(id);return `<li>${U().icon(sk)}<b>${attr(sk.name)}</b> <span class="tag">${TYPE[slotType(sk)]||''}</span> <button type="button" onclick="equipNewSkill('${attr(id)}')">裝配</button></li>`;}).join('')}</ul><button type="button" onclick="dismissNewSkills()">知道了</button></section>`;
  }
  function loadout(h){
    const l=h.skillLoadout;
    return `${newSkillNotice(h)}<div class="skill-loadout">${row('active','主動',l.active.map((id,n)=>cell('active',n,id)).join(''))}${l.proc.length?row('proc','觸發',l.proc.map((id,n)=>cell('proc',n,id)).join('')):''}${passiveRow(h)}</div>${pending()?'<p class="small skill-pending" role="status">目前在戰鬥中：配置變更於下一場戰鬥生效。</p>':''}<p class="small skill-page-hint">點擊技能欄位即可更換；完整數值可在欄位視窗或技能圖鑑查看。</p>`;
  }

  /* ---------- slot dialog: candidates on the left of the detail, one tap equips ---------- */
  function slotCandidates(h,type){
    const obtainable=new Set(U().catalog(h).map(sk=>sk.id));
    return U().sortedSkills(S().system().definitions.filter(sk=>slotType(sk)===type&&!sk.disabled&&sk.partnerId==null&&sk.jobs.includes(h.job)&&(S().learned(h,sk)||obtainable.has(sk.id))),h);
  }
  function slotOf(h,id){for(const t of ['active','proc']){const n=(h.skillLoadout[t]||[]).indexOf(id);if(n>=0)return TYPE[t]+'槽 '+(n+1);}return '';}
  globalThis.toggleSkillSlotLocked=function(type,n,show){slotShowLocked=!!show;try{localStorage.setItem('emberwild.skillSlotShowLocked',show?'1':'0');}catch{}return openSkillSlot(type,n);};
  globalThis.previewSkillSlot=function(type,n,id){slotPreview=id;return openSkillSlot(type,n);};
  globalThis.openSkillSlot=function(type,n){
    const h=hero();if(!h?.skillLoadout?.[type]||!['active','proc'].includes(type)||n<0||n>=h.skillLoadout[type].length)return false;
    const all=slotCandidates(h,type),list=slotShowLocked?all:all.filter(sk=>!U().missing(sk,h).length),hidden=all.length-list.length,current=h.skillLoadout[type][n];
    const fresh=new Set(U().newSkillIds(h).filter(id=>slotType(S().byId(id))===type));
    if(!list.some(sk=>sk.id===slotPreview))slotPreview=list.some(sk=>sk.id===current)?current:list[0]?.id??null;
    const tabsHTML=['active','proc'].filter(t=>h.skillLoadout[t]?.length).map(t=>`<div class="skill-slot-group"><h3>${TYPE[t]}</h3>${h.skillLoadout[t].map((id,i)=>{const cur=id&&S().byId(id),on=t===type&&i===n;return `<button type="button" class="skill-slot-tab" data-slot-tab="${t}:${i}" aria-pressed="${on}" onclick="openSkillSlot('${t}',${i})"><small>${TYPE[t]}槽 ${i+1}</small><b>${cur?attr(cur.name):'未配置'}</b></button>`;}).join('')}</div>`).join('');
    const rows=list.map(sk=>{const reasons=U().missing(sk,h),where=slotOf(h,sk.id),here=current===sk.id;
      const action=reasons.length?'<span class="small">未解鎖</span>':`<button type="button" onclick="chooseSkillSlot('${type}',${n},'${attr(sk.id)}')" ${here?'disabled':''}>${here?'目前配置':where?'移至此槽':'裝入'}</button>`;
      return `<div class="skill-pick${sk.id===slotPreview?' is-previewed':''}${reasons.length?' skill-locked':''}" data-skill-id="${attr(sk.id)}"><button type="button" class="skill-pick-main" onclick="previewSkillSlot('${type}',${n},'${attr(sk.id)}')" aria-pressed="${sk.id===slotPreview}"><span class="skill-pick-art">${U().icon(sk)}</span><span class="skill-pick-text"><b>${fresh.has(sk.id)?'<span class="quest-new skill-new" aria-label="新技能">NEW</span>':''}${attr(sk.name)}</b><small>${attr(sourceText(sk))}${where?' · 已配置於'+attr(where):''}</small><small class="skill-pick-line">${attr(oneLine(sk))}</small></span></button>${action}</div>`;}).join('');
    const sel=slotPreview&&S().byId(slotPreview),reasons=sel?U().missing(sel,h):[];
    const detail=sel?`${U().card(sel,h)}${reasons.length?`<p class="small skill-missing">尚缺：${attr(reasons.join('、'))}</p>`:''}`:'<p class="small">沒有可配置的技能。</p>';
    const modal=$('modal');modal.classList.add('skill-system-dialog','skill-slot-dialog');
    modal.innerHTML=`<h2>技能配置 · ${TYPE[type]}槽 ${n+1}</h2><div class="skill-slot-panes skill-slot-panes-v2"><nav class="skill-slot-tabs" aria-label="技能槽">${tabsHTML}</nav><section class="skill-slot-choices"><div class="skill-slot-toolbar"><label><input type="checkbox" ${slotShowLocked?'checked':''} onchange="toggleSkillSlotLocked('${type}',${n},this.checked)">顯示未學技能</label>${!slotShowLocked&&hidden?`<small>已隱藏 ${hidden} 個未學技能</small>`:''}</div><div class="skill-candidate-list">${rows||(all.length?'<p>目前沒有已學會的此類技能，可勾選「顯示未學技能」查看解鎖條件。</p>':'<p>目前階段沒有符合此類型的技能。</p>')}</div></section><section class="skill-slot-detail" aria-label="技能資訊">${detail}</section></div><div class="actions"><button type="button" onclick="chooseSkillSlot('${type}',${n},null)">清空此技能槽</button><button type="button" onclick="closeModal()">關閉</button></div>`;
    if(!modal.open)modal.showModal();
    if(fresh.size){const seen=U().markSkillsSeen;const h0=hero();seen&&seen(h0,[...fresh].filter(id=>list.some(sk=>sk.id===id)));}
    return true;
  };
  globalThis.equipNewSkill=function(id){const h=hero(),sk=S().byId(id);if(!sk||!['active','proc'].includes(slotType(sk)))return false;const type=slotType(sk),slots=h.skillLoadout?.[type]||[];slotPreview=id;return openSkillSlot(type,Math.max(0,slots.indexOf(null)));};

  /* ---------- passive management ---------- */
  globalThis.openPassiveManager=function(){
    const h=hero(),list=U().sortedSkills(S().system().definitions.filter(sk=>sk.type==='passive'&&S().learned(h,sk)),h),modal=$('modal');
    modal.classList.add('skill-system-dialog');
    modal.innerHTML=`<h2>被動技能管理</h2><p class="small">被動技能不占技能槽；啟用中的被動在戰鬥中常駐生效。</p><div class="passive-manager">${list.map(sk=>{const on=S().passiveEnabled(h,sk.id);return `<div class="passive-manager-row${on?'':' is-off'}" data-passive-id="${attr(sk.id)}"><span class="skill-pick-art">${U().icon(sk)}</span><span class="skill-pick-text"><b>${attr(sk.name)}</b><small class="skill-pick-line">${attr(oneLine(sk))}</small></span><button type="button" onclick="showSkillInformation('${attr(sk.id)}')">詳細</button><button type="button" role="switch" aria-checked="${on}" onclick="togglePassiveFromManager('${attr(sk.id)}',${!on})">${on?'已啟用':'已停用'}</button></div>`;}).join('')||'<p>尚未學會被動技能。</p>'}</div><div class="actions"><button type="button" onclick="closeModal()">關閉</button></div>`;
    if(!modal.open)modal.showModal();return true;
  };
  globalThis.togglePassiveFromManager=function(id,on){const ok=setPassiveSkillEnabled(id,on);openPassiveManager();return ok;};

  /* ---------- 技能圖鑑 ---------- */
  globalThis.setSkillCatalogFilter=function(key,value){if(!Object.hasOwn(catalogFilter,key))return false;catalogFilter[key]=String(value);render();return true;};
  globalThis.openSkillCatalog=function(id){if(id!==undefined)catalogSelected=id;if(typeof tab!=='undefined'&&tab!=='skills')setTab('skills');page='catalog';render();return true;};
  globalThis.selectSkillCatalog=function(id){catalogSelected=id;render();return true;};
  function catalogPage(h){
    const all=U().catalog(h),got=sk=>U().acquired(sk,h),f=catalogFilter;
    // Acquired skills first; inside each group the existing unlock order (catalog() sorts by learning and level).
    const list=all.filter(sk=>(f.state==='all'||(f.state==='yes')===got(sk))&&(f.type==='all'||slotType(sk)===f.type)&&(f.source==='all'||sk.sources.some(s=>(s.type==='advanced'?'class':s.type)===f.source))).map((sk,i)=>({sk,i})).sort((a,b)=>Number(got(b.sk))-Number(got(a.sk))||a.i-b.i).map(x=>x.sk);
    if(!list.some(sk=>sk.id===catalogSelected))catalogSelected=list[0]?.id??null;
    const sel=catalogSelected&&S().byId(catalogSelected),reasons=sel?U().missing(sel,h):[];
    const choose=(key,label,options)=>`<label class="skill-filter"><span>${label}</span><select aria-label="${label}" onchange="setSkillCatalogFilter('${key}',this.value)">${options.map(([v,t])=>`<option value="${v}" ${f[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    const filters=`<div class="skill-catalog-filters">${choose('state','取得狀態',[['all','全部'],['yes','已取得'],['no','未取得']])}${choose('type','技能類型',[['all','全部'],['active','主動'],['proc','觸發'],['passive','被動']])}${choose('source','技能來源',[['all','全部'],['class','職業'],['quest','任務'],['equipment','裝備']])}<span class="small">已取得 ${all.filter(got).length} / ${all.length}</span></div>`;
    const items=list.map(sk=>`<button type="button" class="skill-catalog-item ${got(sk)?'is-acquired':'is-missing'}" data-skill-pick="${attr(sk.id)}" aria-pressed="${sk.id===catalogSelected}" onclick="selectSkillCatalog('${attr(sk.id)}')"><span class="skill-catalog-icon">${U().icon(sk)}</span><span class="skill-catalog-text"><b>${attr(sk.name)}</b><small>${TYPE[slotType(sk)]||''} · ${attr(sourceText(sk))}</small></span><span class="skill-catalog-state">${got(sk)?'已取得':'未取得'}</span></button>`).join('');
    const equipNeed=sel&&sel.sources.some(s=>s.type==='equipment')&&!S().learned(h,sel)?'<p class="small skill-missing">需要穿戴附帶此技能的裝備才能使用。</p>':'';
    const slotable=sel&&S().learned(h,sel)&&['active','proc'].includes(slotType(sel));
    const detail=sel?`${U().card(sel,h)}${reasons.length?`<p class="small skill-missing">解鎖需求：${attr(reasons.join('、'))}</p>`:''}${equipNeed}${slotable?`<div class="actions"><button type="button" onclick="equipNewSkill('${attr(sel.id)}')">放入技能槽</button></div>`:''}`:'<p class="small">沒有符合條件的技能。</p>';
    return `${filters}<div class="skill-catalog-panes skill-catalog-page"><nav class="skill-catalog-list" aria-label="技能清單">${items||'<p class="small">沒有符合條件的技能。</p>'}</nav><section class="skill-catalog-detail" aria-label="技能資訊">${detail}</section></div>`;
  }

  /* ---------- 職業成長 ---------- */
  function growthPage(h){return (globalThis.classMasteryTreeHTML?.(h)||'')+'<p class="small skill-page-hint">進階職業、轉職條件與固化被動尚未開放。</p>';}

  const base=skillsView;
  skillsView=function(){
    const h=hero();if(!h||__EMBERWILD_TEAMS?.plan?.()?.job===null)return base();
    return withHero(h,()=>{S().refreshHero(h);const body=page==='catalog'?catalogPage(h):page==='growth'?growthPage(h):loadout(h);
      return `<section class="panel skill-page" data-skill-page-view="${page}">${header(h)}${tabs()}<div class="skill-page-body">${body}</div></section>`;});
  };
  globalThis.skillsView=skillsView;
  const reset=resetSession;resetSession=function(...args){const out=reset.apply(this,args);page='loadout';catalogSelected=null;catalogFilter={state:'all',type:'all',source:'all'};slotPreview=null;return out;};
  globalThis.resetSession=resetSession;
  globalThis.__EMBERWILD_SKILL_PAGE={page:()=>page,catalogFilter:()=>({...catalogFilter})};
})();
