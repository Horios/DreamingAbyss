(()=>{
  const T=__EMBERWILD_TEAMS,M=EmberwildTeams,mastery=__EMBERWILD_MASTERY;
  const pageHeroBase=pageHero;
  pageHero=function(page=tab){return ['character','skills'].includes(page)&&T.player()?T.player():pageHeroBase(page);};
  // Each plan is a collapsible block; the plan in use starts expanded, and a player's choice is kept per plan.
  const openPlans=new Map();
  // The whole plan block folds too (open by default; always open until the plan has a class).
  let planPanelOpen=true;globalThis.rememberTeamPlanPanel=open=>{planPanelOpen=!!open;};
  globalThis.rememberTeamPlanCard=(id,open)=>{if(typeof id==='string')openPlans.set(id,!!open);};
  function panel(){if(!T.build())return '';const p=T.plan(),busy=T.busy(),limit=T.settings().maxPlans;const panelOpen=p.job===null||planPanelOpen;return `<section class="panel team-plan-panel"><details class="team-plan-fold" ${panelOpen?'open':''} ontoggle="rememberTeamPlanPanel(this.open)"><summary><h2>隊伍方案 · ${esc(p.name)}</h2><span class="small">${p.job===null?'尚未選擇職業':esc(CLASSES[p.job].name)} · ${T.build().plans.length} 個方案</span></summary>${busy?'<div class="row"><button onclick="stopTeamExploration()">停止探索並結束遭遇</button></div>':''}<p class="small team-build-note">永久等級、精通、技能解鎖與背包共用；技能學習、裝配及夥伴配置各隊獨立。${busy?'目前正在探索或遭遇中，請先停止探索。':''}</p><div class="team-plan-list">${T.build().plans.map((x,i)=>`<details class="team-plan-card ${x.id===p.id?'current':''}" data-team-plan="${esc(x.id)}" ${(openPlans.has(x.id)?openPlans.get(x.id):x.id===p.id)?'open':''} ontoggle="rememberTeamPlanCard('${esc(x.id)}',this.open)"><summary><b>${esc(x.name)}</b><span class="small">${x.job===null?'尚未選擇職業':esc(CLASSES[x.job].name)} · ${x.id===p.id?'使用中':'候選方案'}</span></summary><p class="small">夥伴：${x.companions.map(k=>esc(characterName(partyMember(k)))).join('、')||'未配置'}</p><div class="actions"><button onclick="switchTeamPlan('${x.id}')" ${busy||x.id===p.id?'disabled':''}>切換</button><button onclick="renameTeamPlan('${x.id}')" ${busy?'disabled':''}>改名</button><button onclick="copyTeamPlan('${x.id}')" ${busy||T.build().plans.length>=limit?'disabled':''}>複製</button><button onclick="clearTeamPlan('${x.id}')" ${busy?'disabled':''}>清空配置</button><button class="danger" onclick="deleteTeamPlan('${x.id}')" ${busy||i===0?'disabled':''} ${i===0?'title="第一個隊伍方案不可刪除"':''}>刪除方案</button></div></details>`).join('')}</div><div class="actions"><button onclick="addTeamPlan()" ${busy||T.build().plans.length>=limit?'disabled':''}>新增空白隊伍</button><label>本隊主角職業 <select aria-label="本隊主角職業" onchange="changePlayerClass(Number(this.value))" ${busy?'disabled':''}><option value="" ${p.job===null?'selected':''} disabled>請選擇職業</option>${CLASSES.map((c,j)=>`<option value="${j}" ${p.job===j?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label></div>${p.job===null?'<p>先選擇職業，再於人物、技能與背包配置此隊；完成前無法開始探索。</p>':''}</details></section>`;}
  function masteryPanel(){if(!T.build())return '';const perm=T.build().permanent;return `<section class="panel"><h2>目前精通等級</h2><p class="small">各職業、武器與元素的精通等級，切換職業後依然永久保留。</p><h3>職業精通</h3><div class="class-mastery-grid">${CLASSES.map((c,j)=>{const v=perm.classes[j],p=mastery.masteryProgress(v?.xp||0);return `<div><b>${esc(c.name)} · Lv${p.level}</b><p class="small">${v?.activated?`${p.current} / ${p.next||'MAX'} EXP · 累積 ${p.xp}${v.advanced?' · 已二轉':''}`:'尚未使用 · EXP 0'}</p></div>`;}).join('')}</div><h3>武器與元素精通</h3><div class="class-mastery-grid">${Object.entries(perm.masteries).map(([k,xp])=>{const p=mastery.masteryProgress(xp);return `<div>${esc(mastery.masteryLabels[k]||k)} · Lv${p.level}<p class="small">${p.current} / ${p.next||'MAX'} EXP · 累積 ${p.xp}</p></div>`;}).join('')}</div></section>`;}
  function chooseClassNote(){return `<section class="panel"><h2>尚未選擇主角職業</h2><p>請先到隊伍編成選擇本隊主角職業，再配置能力與技能。</p><button onclick="setTab('roster')">前往隊伍編成</button></section>`;}
  const characterBase=characterView;
  characterView=function(){
    if(!T.build())return characterBase();
    const h=T.player();pageHeroSelection.set('character',memberKey(h));
    return T.plan().job===null?heading('ADVENTURER / 角色能力','角色能力')+chooseClassNote()+masteryPanel():withHero(h,characterBase)+masteryPanel();
  };
  let skillClass=null,skillContext=null,selectedTeamSkill=null;
  function viewedSkillClass(){
    const context=T.build().activeId+':'+T.plan().job;
    if(context!==skillContext){skillClass=null;selectedTeamSkill=null;skillContext=context;}
    return skillClass??T.plan().job??0;
  }
  globalThis.browsePlayerSkillClass=function(job){
    job=Number(job);if(!Number.isInteger(job)||!CLASSES[job]||!T.build())return false;
    viewedSkillClass();if(skillClass!==job)selectedTeamSkill=null;skillClass=job;render();return true;
  };
  function classTabs(job){return `<div class="actions player-skill-class-tabs" aria-label="主角技能職業">${CLASSES.map((c,j)=>`<button data-skill-class="${j}" aria-pressed="${job===j}" class="${job===j?'primary':''}" onclick="browsePlayerSkillClass(${j})">${esc(c.name)}${T.plan().job===j?' · 目前職業':''}</button>`).join('')}</div>`;}
  function previewHero(job){
    const h=T.player(),perm=T.build().permanent;
    // A catalog preview has no learned skills, equipped items or slots from the
    // active class. All calculations run against this detached protagonist.
    return {...h,job,advanced:!!perm.classes[job]?.advanced,skills:CLASSES[job].skills.map(()=>0),supportLevels:SUPPORT[job].map(()=>0),active:[null,null],procSlots:[null,null],supportSlots:[null,null],sockets:CLASSES[job].skills.map(()=>null),equipped:Array(5).fill(null),mastery:{...perm.masteries}};
  }
  function teamSkillEntries(job){
    const entries=[];
    for(const [kind,list] of [['core',CLASSES[job].skills],['support',SUPPORT[job]]])list.forEach((sk,i)=>{
      const isCore=kind==='core',meta=isCore?mastery.coreMeta(job,i):sk;
      if(meta?.partnerId!=null||isCore&&typeof coreSkillAvailableToHero==='function'&&!coreSkillAvailableToHero(job,i,T.player()))return;
      entries.push({kind,i,sk,key:M.key(job,kind,i),name:isCore?sk[0]:sk.name,level:Math.max(1,Math.floor(Number(isCore?sk[2]:sk.level)||1))});
    });
    return entries.sort((a,b)=>a.level-b.level||a.kind.localeCompare(b.kind)||a.i-b.i);
  }
  globalThis.selectTeamSkill=function(kind,i){
    i=Number(i);if(!T.build()||!Number.isInteger(i))return false;
    const job=viewedSkillClass(),entry=teamSkillEntries(job).find(x=>x.kind===kind&&x.i===i);if(!entry)return false;
    selectedTeamSkill=entry.key;render();return true;
  };
  function gemIcon(type){
    const color=['#ed7774','#7acfab','#9c9df2'][type];
    return `<span class="skill-gem-icon" style="color:${color}" aria-hidden="true">${globalThis.__EMBERWILD_INVENTORY_ICON?.('gem',String(type),'lucide:gem',{size:26})||__EMBERWILD_SKILL_ICONS.svgFor('lucide:gem',[],{size:26})}</span>`;
  }
  globalThis.inventoryGemIcon=gemIcon;
  function skillGemSockets(i,h,current,learned){
    const gem=current?h.sockets[i]??null:null,blocked=!current||!learned||T.busy();
    return `<section class="skill-gem-sockets" aria-label="技能寶石"><div class="skill-gem-current"><span class="skill-gem-slot ${gem===null?'empty':''}" aria-label="鑲嵌槽：${gem===null?'空':esc(GEMS[gem].name)}">${gem===null?'<span aria-hidden="true">＋</span>':gemIcon(gem)}</span><div><b>${gem===null?'空鑲嵌槽':esc(GEMS[gem].name)}</b><span class="small">${gem===null?(learned?'選擇下方寶石鑲嵌':'學習技能後可鑲嵌寶石'):esc(GEMS[gem].desc)}</span></div>${gem!==null?`<button onclick="socket(${i},-1)" ${blocked?'disabled':''}>卸下</button>`:''}</div><div class="skill-gem-choices">${GEMS.map((g,type)=>`<button type="button" class="skill-gem-choice ${gem===type?'selected':''}" data-team-gem="${type}" aria-label="鑲嵌${esc(g.name)}" aria-pressed="${gem===type}" title="${esc(g.desc)}" onclick="socket(${i},${type})" ${blocked||gem===type||h.gems[type]<1?'disabled':''}>${gemIcon(type)}<span>${esc(g.name)}</span><small>×${h.gems[type]||0}</small></button>`).join('')}</div></section>`;
  }
  function teamSkillDetail(job,h,current,entry){
      const {kind,i,sk}=entry,isCore=kind==='core',perm=T.build().permanent;
      const r=isCore?T.coreRule(job,i):T.supportRule(job,i),k=M.key(job,kind,i),unlocked=!!perm.unlocks[k],learned=current&&!!(isCore?h.skills:h.supportLevels)[i],slots=isCore?(sk[1]==='proc'?h.procSlots:h.active):h.supportSlots,equipped=current&&slots.includes(i),missing=unlocked?[]:T.unlockMissing(job,kind,i),name=isCore?sk[0]:sk.name,slotFn=isCore?(sk[1]==='proc'?'slotProcSkill':'equipSkill'):'slotSupport',learnFn=isCore?'learn':'learnSupport',useMissing=learned?(isCore?mastery.coreMissingRequirements(h,i,true):mastery.supportMissingRequirements(h,i,true)):[],detail=isCore?coreSkillDetail(job,i,h):supportSkillDetail(job,i,h);
      const status=current?(equipped?'本隊已裝配':learned?'本隊已學習':unlocked?'已解鎖 · 本隊未學':'尚未永久解鎖'):(unlocked?'已永久解鎖':'尚未永久解鎖');
      const controls=current?`<div class="actions">${!unlocked?`<button onclick="unlockTeamSkill('${kind}',${i})" ${missing.length||T.busy()?'disabled':''}>永久解鎖</button>`:''}<button onclick="${learnFn}(${i})" ${learned||!unlocked||T.busy()?'disabled':''}>${learned?'本隊已學':'學習'}</button>${[0,1].map(slot=>`<button onclick="${slotFn}(${i},${slot})" ${!learned||T.busy()?'disabled':''}>${slots[slot]===i?'已裝配':'設為'}${isCore?(sk[1]==='proc'?'觸發':'主動'):'輔助'}槽 ${slot+1}</button>`).join('')}</div>`:'';
      const flavor=isCore?coreSkillFlavor(job,i):sk.description;
      return `<article class="panel team-skill-detail" data-team-skill-detail="${k}"><div class="row"><h3>${__EMBERWILD_MASTERY_UI.skillIcon(job,kind,i)}${esc(name)}</h3><span class="tag">${status}</span></div>${skillTypeBadges(job,i,kind)}${skillMechanicsDetails(job,i,kind)}${flavor?`<p class="small">${esc(flavor)}</p>`:''}<p>${esc(detail)}</p><p class="small">需求 LV${entry.level} · ${T.unlockSummary(job,kind,i).length?'解鎖條件：'+esc(T.unlockSummary(job,kind,i).join('、')):'無額外成就條件'} · ${unlocked?'永久條件已完成':missing.length?'尚缺：'+esc(missing.join('、')):'永久條件已達成'}${r.unlockConditions.materials.length?' · 一次性材料：'+esc(r.unlockConditions.materials.map(m=>m.name+' ×'+m.quantity).join('、')):''}</p>${useMissing.length?`<p class="small">目前使用限制：${esc(useMissing.join('、'))}</p>`:''}${controls}${isCore?skillGemSockets(i,h,current,learned):''}</article>`;
  }
  function teamSkillRows(job,h,current){
    const entries=teamSkillEntries(job),groups=new Map();
    for(const entry of entries){if(!groups.has(entry.level))groups.set(entry.level,[]);groups.get(entry.level).push(entry);}
    const tile=entry=>{
      const {kind,i,sk,key,name,level}=entry,isCore=kind==='core',learned=current&&!!(isCore?h.skills:h.supportLevels)[i],slots=isCore?(sk[1]==='proc'?h.procSlots:h.active):h.supportSlots,equipped=learned&&slots.includes(i),unlocked=!!T.build().permanent.unlocks[key],selected=selectedTeamSkill===key;
      const category=isCore?(sk[1]==='proc'?'普攻觸發':'主動'):'輔助',status=equipped?'本隊已裝配':learned?'本隊已學習':unlocked?'已永久解鎖':'尚未永久解鎖',kindClass=isCore?(sk[1]==='proc'?'proc':'active'):'support';
      return `<button type="button" class="skill-icon-tile team-skill-tile skill-kind-${kindClass} ${learned?'learned':'locked'} ${selected?'selected':''}" data-team-skill="${key}" aria-label="${esc(name)}" aria-pressed="${selected}" title="${esc(name)} · LV${level} · ${category} · ${status}" onclick="selectTeamSkill('${kind}',${i})">${__EMBERWILD_MASTERY_UI.skillIcon(job,kind,i)}<span class="skill-icon-status" aria-hidden="true">${equipped?'●':learned?'✓':''}</span></button>`;
    };
    const selected=entries.find(x=>x.key===selectedTeamSkill);
    const board=entries.length?`<div class="skill-level-board">${[...groups].map(([level,list])=>`<section class="skill-level-row" data-skill-level="${level}"><div class="skill-level-label"><span>LV</span><strong>${level}</strong></div><div class="skill-level-icons">${list.map(tile).join('')}</div></section>`).join('')}</div>`:'<p class="empty">此職業尚未設定主角技能。</p>';
    return `<p class="small skill-board-help">依需求等級排列；點選圖示查看詳細資料與配置。✓ 已學習 · ● 已裝配</p><div class="skill-layout-split player-skill-layout"><div class="skill-tree-pane" aria-label="依等級排列的技能">${board}</div><div class="skill-detail-pane" aria-label="技能詳細">${selected?teamSkillDetail(job,h,current,selected):'<section class="panel skill-detail-empty"><p class="small">點選左側技能圖示，查看詳細資料。</p></section>'}</div></div>`;
  }
  const skillBase=globalThis.__EMBERWILD_MASTERY_UI.individual;
  globalThis.individualSkillsView=function(){
    if(state!==T.player()||!T.build())return skillBase();
    T.capture();const p=T.plan(),job=viewedSkillClass(),current=p.job===job,h=current?T.player():previewHero(job),tot=T.budgets();
    const summary=current?`<p>技能沒有技能點成本；達成永久解鎖條件後即可學習。</p><div class="actions"><button onclick="resetSkills()" ${T.busy()?'disabled':''}>免費重置本隊技能</button></div>${globalThis.__EMBERWILD_MASTERY_UI.loadout()}`:`<p>檢視此職業的主角技能與永久解鎖條件。要學習或裝配，請到隊伍編成選擇本隊主角職業。</p><button onclick="setTab('roster')">前往隊伍編成</button>`;
    return classTabs(job)+`<section class="panel player-class-skills" data-player-skill-class="${job}"><h2>${esc(CLASSES[job].name)} · 主角技能</h2>${summary}</section>`+withHero(h,()=>teamSkillRows(job,h,current))+(current?globalThis.__EMBERWILD_MASTERY_UI.devTools():'');
  };
  const skillsBase=skillsView;
  skillsView=function(){
    if(!T.build())return skillsBase();
    const h=T.player();pageHeroSelection.set('skills',memberKey(h));
    return heading('PLAYER SKILLS / 主角技能','主角技能',`<span class="tag">${esc(characterName(h))}</span>`)+`<div class="player-skill-page">${ownerControls(withHero(h,globalThis.individualSkillsView),memberKey(h))}</div>`;
  };
  const rosterBase=rosterView;rosterView=function(){return panel()+rosterBase().replace('調整上陣會放棄目前遭遇。','請先停止探索再調整本隊編成。');};
  const battleBase=battleView;battleView=function(){return T.plan()?.job===null?`<section class="panel"><h2>建立此隊的探索配置</h2>${playerProgressView('team')}<p>尚未選擇主角職業。先選擇職業，再配置能力、技能、裝備及夥伴。</p><button onclick="setTab('roster')">前往隊伍編成</button></section>`:battleBase();};
  const journalBase=sharedBattleJournal;sharedBattleJournal=function(){
    const html=journalBase();return T.plan()?.job===null?html.replace('onclick="toggleBattle()"','onclick="toggleBattle()" disabled title="請先為本隊選擇主角職業"'):html;
  };
  globalThis.__EMBERWILD_AFTER_RENDER=function(){if(!T.build())return;if(T.plan().job===null){const subtitle=document.querySelector('.adventurer-summary > p');if(subtitle)subtitle.textContent='尚未選擇職業';}if(T.plan().job===null)document.querySelectorAll('button[onclick="toggleBattle()"], button[onclick="restartExploration()"], button[onclick="startBossChallenge()"], button[onclick="devMasterySimulate()"]').forEach(el=>{el.disabled=true;el.title='請先為本隊選擇主角職業';});if(T.busy())document.querySelectorAll('#app button[onclick], #app select[onchange], #modal button[onclick]').forEach(el=>{const action=el.getAttribute('onclick')||el.getAttribute('onchange')||'';if(/\b(?:switchTeamPlan|changePlayerClass|addTeamPlan|copyTeamPlan|renameTeamPlan|clearTeamPlan|deleteTeamPlan|allocate|resetStats|resetSkills|advance|learn|learnSupport|socket|toggleMember|setPartnerEnlisted|confirmMemberReplacement|recruitCompanion|equipCompanionToken|unequipCompanionToken|devMasterySetLevel|devMasteryToggleCore|devMasteryToggleSupport|devMasteryWeapon)\s*\(/.test(action))el.disabled=true;});};
  const renderBase=render;render=function(){const out=renderBase();globalThis.__EMBERWILD_AFTER_RENDER();return out;};
  if(party)render();
})();
