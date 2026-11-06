/* Recruitable people have their own identity, name and fixed growth plan. */
(()=>{
  const Model=EmberwildCompanions,Passive=EmberwildPassives,DEFAULT_PLANS=Model.defaultPlans;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function checkPlan(p,{classes=CLASSES,supportSkills=SUPPORT,checkSkills=true}={}){
    if(!p||!Number.isInteger(p.id)||p.id<10||p.id>1000000000||!Number.isInteger(p.job)||p.job<0||p.job>=classes.length)throw Error('夥伴 ID 或職業無效');
    if(typeof p.description!=='string'||p.description.length>200||typeof p.weapon!=='string'||p.weapon.length>80)throw Error('夥伴說明或武器無效：'+p.id);
    const name=p.name??p.names?.[0];
    if(typeof name!=='string'||!name.trim()||name!==name.trim()||Array.from(name).length>20||/[\u0000-\u001f\u007f]/.test(name))throw Error('夥伴角色名稱無效：'+p.id);
    if(p.name===undefined&&(!Array.isArray(p.names)||!p.names.length||p.names.length>30||p.names.some(n=>typeof n!=='string'||!n.trim()||n!==n.trim()||Array.from(n).length>20||/[\u0000-\u001f\u007f]/.test(n))))throw Error('舊版夥伴名字池無效：'+p.id);

    for(const key of ['core','active','proc','support'])if(!Array.isArray(p[key])||p[key].length>64||new Set(p[key]).size!==p[key].length||p[key].some(n=>!Number.isInteger(n)||n<0||n>63))throw Error('夥伴技能索引無效：'+p.id+' '+key);
    if(checkSkills){
      const skills=classes[p.job]?.skills||[],supports=supportSkills[p.job]||[];
      const type=sk=>Array.isArray(sk)?sk[1]:sk?.activation;
      if(p.core.some(i=>!skills[i])||p.active.some(i=>!p.core.includes(i)||type(skills[i])!=='active')||p.proc.some(i=>!p.core.includes(i)||type(skills[i])!=='proc')||p.support.some(i=>!supports[i]))throw Error('夥伴技能與職業技能池不相容：'+p.id);
    }
    const out=Model.validatePlanStats(p);out.name=name;out.availability=EmberwildCompanionSkills.availability(p);out.unlockCondition=EmberwildCompanionSkills.unlockCondition(p);out.duplicateTicketGold=EmberwildCompanionSkills.duplicateTicketGold(p);delete out.role;delete out.names;out.passives=Passive.assignments(p.passives,p.id);
    for(const key of ['mastery','masteries','masteryLevel','requiredMastery','requiredMasteryLevel'])delete out[key];
    if(out.equipmentInternalized!==1){const def=Model.definition(out,classes,GAMEPLAY_SETTINGS);out.initialStats=def.initialStats;out.growthPerLevel=def.growthPerLevel;out.growthSteps=def.growthSteps;out.equipmentInternalized=1;}return out;
  }
  function parsePlans(input,doc,{checkSkills=true,preserveLegacyNames=false}={}){
    if(input===undefined)input=copy(DEFAULT_PLANS);
    if(!Array.isArray(input)||input.length>512)throw Error('夥伴角色數量無效');
    const plans=input.map(p=>{const out=checkPlan(p,{classes:doc?.classes||CLASSES,supportSkills:doc?.supportSkills||SUPPORT,checkSkills});if(preserveLegacyNames&&p.availability===undefined)delete out.availability;if(preserveLegacyNames&&p.name===undefined){delete out.name;out.names=copy(p.names);}return out;});
    const ids=new Set(plans.map(p=>p.id));
    if(ids.size!==plans.length)throw Error('夥伴 ID 重複');
    const passiveIds=new Set(Passive.normalize(doc?.passiveDefinitions).map(d=>d.id));
    for(const p of plans)if(p.passives.some(id=>!passiveIds.has(id)))throw Error('夥伴引用不存在的被動：'+p.id);
    return plans;
  }
  function storedPlans(raw){
    if(raw===undefined)return {};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>512)throw Error('存檔夥伴模板無效');
    const out=Object.create(null);
    for(const [key,p] of Object.entries(raw)){
      if(!/^[1-9]\d{1,9}$/.test(key)||Number(key)!==p?.id)throw Error('存檔夥伴模板識別無效');
      out[key]=checkPlan(p,{checkSkills:false});
    }
    return out;
  }
  function storedNames(raw){
    if(raw===undefined)return {};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>1024)throw Error('存檔夥伴名字無效');
    const out=Object.create(null);
    for(const [key,name] of Object.entries(raw)){
      if(!/^[1-9]\d{1,9}$/.test(key)||!name||validCharacterName(name)!==name)throw Error('存檔夥伴名字無效');
      out[key]=name;
    }
    return out;
  }
  let plans=DEFAULT_PLANS.map(p=>checkPlan(p)),config=Model.defaults(CLASSES,GAMEPLAY_SETTINGS),passiveDefinitions=Passive.normalize();
  try{const saved=JSON.parse(balanceSourceText()||'null');if(saved?.companions)plans=parsePlans(saved.companions,saved);if(saved){config=Model.normalizeSettings(saved.companionSettings,saved.classes||CLASSES,saved.balanceSettings||GAMEPLAY_SETTINGS);passiveDefinitions=Passive.normalize(saved.passiveDefinitions);}}catch(e){console.warn('夥伴平衡設定無法載入，使用內建角色',e);}
  const byId=()=>new Map(plans.map(p=>[p.id,p]));
  function companionPlan(h){const current=byId().get(h?.companionId);return current?.job===h?.job?current:party?.companionProfiles?.[h?.companionId]?.job===h?.job?party.companionProfiles[h.companionId]:null;}
  // Installed skill systems are immutable (their id/position maps are built once), so keep each one's
  // passive subset instead of scanning every definition on every stat and effect lookup.
  const passiveSubsets=new WeakMap();
  function systemPassives(S){const defs=S.system().definitions;let list=passiveSubsets.get(defs);if(!list){list=defs.filter(d=>d.type==='passive');passiveSubsets.set(defs,list);}return list;}
  function allPassivesFor(h){const S=globalThis.__EMBERWILD_SKILLS;if(S&&h===party?.members[0])return systemPassives(S).filter(d=>S.learned(h,d));return (companionPlan(h)?.passives||[]).map(id=>passiveDefinitions.find(d=>d.id===id)).filter(Boolean);}
  function skillDisabled(h,kind,id){if(globalThis.__EMBERWILD_SKILLS)return false;return !!companionPlan(h)&&!!h.disabledCompanionSkills?.[kind]?.includes(id);}
  function validateDisabledSkills(raw){
    if(raw===undefined)return {core:[],support:[],passive:[]};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['core','support','passive'].includes(k)))throw Error('夥伴技能啟用設定無效');
    const out={};for(const kind of ['core','support','passive']){
      const list=raw[kind]??[];
      if(!Array.isArray(list)||list.length>(kind==='passive'?512:64)||new Set(list).size!==list.length||list.some(id=>kind==='passive'?typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id):!Number.isInteger(id)||id<0||id>63))throw Error('夥伴技能啟用設定無效');
      out[kind]=[...list];
    }return out;
  }
  globalThis.companionSkillDisabled=skillDisabled;
  function passivesFor(h){return allPassivesFor(h).filter(d=>(h===party?.members[0]||d.partnerId===h.companionId)&&globalThis.__EMBERWILD_SKILLS?.passiveEnabled(h,d.id)!==false&&!globalThis.__EMBERWILD_SKILLS?.byId(d.id)?.disabled&&h.lv>=d.requiredLevel&&!skillDisabled(h,'passive',d.id));}
  function passiveEffectsFor(h){
    const out=passivesFor(h).filter(d=>d.target==='self').flatMap(d=>d.effects);
    if(party?.active.includes(memberKey(h)))for(const owner of heroes().filter(x=>x.hp>0))out.push(...passivesFor(owner).filter(d=>d.target==='allies').flatMap(d=>d.effects));
    return out;
  }
  globalThis.companionPassiveStatEffects=h=>passiveEffectsFor(h).filter(e=>!Passive.combatKeys.includes(e.key));
  globalThis.scaleHeroHealing=function(h,amount){return Math.max(0,amount*(1+passiveEffectsFor(h).filter(e=>e.key==='healingPct').reduce((n,e)=>n+e.value,0)/100));};
  const passiveEffectBase=effectTotal;
  effectTotal=function(target,kind){
    let total=passiveEffectBase(target,kind);const h=party?.members.find(x=>heroKey(x)===target);
    if(h)total+=passiveEffectsFor(h).filter(e=>Passive.combatKeys.includes(e.key)&&e.key===kind).reduce((n,e)=>n+e.value/100,0);
    else if(foes.some(e=>e.id===target&&e.hp>0))for(const owner of living())total+=passivesFor(owner).filter(d=>d.target==='enemies').flatMap(d=>d.effects).filter(e=>e.key===kind).reduce((n,e)=>n+e.value/100,0);
    return total;
  };
  const passiveProcBase=procChance;
  procChance=function(i,h=state){return Math.max(0,Math.min(1,passiveProcBase(i,h)+passiveEffectsFor(h).filter(e=>e.key==='procChance').reduce((n,e)=>n+e.value/100,0)));};
  function rosterPlans(){return rosterPlansFor(party);}
  function hideCompanions(p){
    const hidden=new Set(rosterPlansFor(p).filter(plan=>plan.availability==='hidden').map(plan=>plan.id));
    p.active=p.active.filter(key=>!hidden.has(key));if(!p.active.length)p.active=[memberKey(p.members[0])];
    p.enlisted=(p.enlisted||p.members.map(memberKey)).filter(key=>!hidden.has(key));for(const key of p.active)if(!p.enlisted.includes(key))p.enlisted.push(key);
    if(hidden.has(p.selected)){const playerKey=memberKey(p.members[0]);p.selected=p.enlisted.includes(playerKey)?playerKey:p.enlisted[0];if(p===party)state=p.members.find(h=>memberKey(h)===p.selected);}
    for(const [page,key] of pageHeroSelection)if(hidden.has(key))pageHeroSelection.delete(page);
  }
  function ensureRoster(p){
    if(p.enlisted===undefined)p.enlisted=p.members.map(memberKey);
    p.companionProfiles=storedPlans(p.companionProfiles);
    p.companionNames=storedNames(p.companionNames);
    // Preserve only acquired snapshots; new recruits come from the live catalog.
    const owned=new Set(p.members.map(h=>h.companionId).filter(id=>id!==undefined));
    for(const id of Object.keys(p.companionProfiles))if(!owned.has(Number(id)))delete p.companionProfiles[id];
    const known=new Set([...owned,...plans.map(plan=>plan.id)]);
    for(const id of Object.keys(p.companionNames))if(!known.has(Number(id)))delete p.companionNames[id];
    for(const plan of plans){
      const member=p.members.find(h=>h.companionId===plan.id);
      if(!member)continue;
      // A recruited person's class is part of the save. Keep that person's old
      // template if a later balance file reuses the ID for another class.
      if(member&&member.job!==plan.job&&p.companionProfiles[plan.id]?.job===member.job)continue;
      p.companionProfiles[plan.id]=copy(plan);
    }
    for(const plan of rosterPlansFor(p)){
      const member=p.members.find(h=>h.companionId===plan.id);
      p.companionNames[plan.id]=plan.name;
      if(member)member.name=plan.name;
    }
  }
  function rosterPlansFor(p){return [...new Map([...plans,...Object.values(p?.companionProfiles||{})].map(x=>[x.id,x])).values()].sort((a,b)=>a.id-b.id);}
  function applyPlan(h,{fullHealth=false}={}){
    const plan=companionPlan(h);if(!plan)return;
    h.name=plan.name;
    h.advanced=h.lv>=Math.round(GS('progression.advance.level',15));
    delete h.stats;delete h.ap;delete h.sp;
    delete h.mastery;
    syncHeroSkillArrays(h);
    h.skills=h.skills.map((_,i)=>Number(plan.core.includes(i)&&!!CLASSES[h.job].skills[i]&&h.lv>=CLASSES[h.job].skills[i][2]&&skillAllowedForPartner(h,CLASSES[h.job].skills[i][6])));
    h.supportLevels=SUPPORT[h.job].map((sk,i)=>Number(plan.support.includes(i)&&h.lv>=sk.level&&skillAllowedForPartner(h,sk)));
    h.active=plan.active.filter(i=>h.skills[i]&&!skillDisabled(h,'core',i)&&CLASSES[h.job].skills[i]?.[1]==='active').slice(0,2);
    while(h.active.length<2)h.active.push(null);
    h.procSlots=plan.proc.filter(i=>h.skills[i]&&!skillDisabled(h,'core',i)&&CLASSES[h.job].skills[i]?.[1]==='proc').slice(0,PROC_SLOT_COUNT);
    while(h.procSlots.length<PROC_SLOT_COUNT)h.procSlots.push(null);
    h.supportSlots=plan.support.filter(i=>h.supportLevels[i]&&!skillDisabled(h,'support',i)).slice(-2);
    while(h.supportSlots.length<2)h.supportSlots.push(null);
    globalThis.__EMBERWILD_SKILLS?.refreshHero(h);
    h.sockets.forEach((gem,i)=>{if(gem!==null&&!h.skills[i]){h.gems[gem]++;h.sockets[i]=null;}});
    if(fullHealth)h.hp=stats(h).hp;else h.hp=Math.min(h.hp,stats(h).hp);
  }
  // The first member is the player. Companions have no independent EXP pool.
  function syncCompanionLevels({fullHealth=false}={}){
    const player=party?.members[0];if(!player)return;
    hideCompanions(party);
    for(const h of party.members){
      if(h===player)continue;
      const fixedPlan=companionPlan(h);if(fixedPlan){h.name=fixedPlan.name;party.companionNames[h.companionId]=fixedPlan.name;}
      delete h.mastery;
      const previous=h.lv,changed=previous!==player.lv,wasDead=h.hp<=0;
      h.lv=player.lv;h.xp=0;h.won=player.won;
      if(!changed)continue;
      if(companionPlan(h))applyPlan(h,{fullHealth:fullHealth&&h.lv>previous});
      else{
        // Retain the builds of old saves that predate fixed companion plans.
        delete h.stats;delete h.ap;delete h.sp;
        h.advanced=h.advanced&&h.lv>=Math.round(GS('progression.advance.level',15));
        h.active=h.active.map(i=>i!==null&&h.skills[i]?i:null);
        h.procSlots=(h.procSlots||Array(PROC_SLOT_COUNT).fill(null)).map(i=>i!==null&&h.skills[i]?i:null);
        h.supportSlots=h.supportSlots.map(i=>i!==null&&h.supportLevels[i]?i:null);
        h.hp=fullHealth&&h.lv>previous?stats(h).hp:Math.min(h.hp,stats(h).hp);
      }
      // A previously higher-level companion keeps all gear and gems in storage.
      h.equipped=h.equipped.map(id=>id&&h.bag.some(g=>g.id===id&&gearRequiredLevel(g)<=h.lv)?id:null);
      globalThis.__EMBERWILD_SKILLS?.refreshHero(h);
    h.sockets.forEach((gem,i)=>{if(gem!==null&&!h.skills[i]){h.gems[gem]++;h.sockets[i]=null;}});
      h.hp=wasDead?0:Math.min(h.hp,stats(h).hp);
    }
  }
  const originalSyncParty=syncParty;
  syncParty=function(){originalSyncParty();syncCompanionLevels();};
  window.recruitCompanion=function(id){
    const plan=plans.find(p=>p.id===id);if(!party||!plan||plan.availability==='hidden'||!globalThis.companionUnlocked?.(id)||partyMember(id)||party.members.length>=513)return;
    ensureSharedGear();ensureAccountResources();ensureSharedItems();ensureAccountQuests();ensureRoster(party);
    const full=party.active.length>=3;
    // During an encounter the new companion joins the lineup from the next encounter (battle configuration freezes the lineup).
    const deferRoster=!!globalThis.EmberwildBattleConfiguration?.pending();if(!deferRoster)resetEncounter();const h=initial(plan.job);h.companionId=id;
    h.name=party.companionNames[id];h.lv=playerHero().lv;
    h.won=party.cleared&&h.lv>=GS('progression.levelCaps.beforeClear',30);
    h.bag=[];h.equipped=Array(5).fill(null);h.tokenId=null;
    h.gold=0;h.ore=0;h.dust=0;h.gems=[0,0,0];h.materials={};h.potions=0;h.consumables={};
    party.members.push(h);party.companionProfiles[id]=copy(plan);applyPlan(h,{fullHealth:true});
    ensureAccountResources();ensureSharedGear();ensureSharedItems();ensureAccountQuests();
    if(party.enlisted.length<config.activeLimit){party.enlisted.push(id);if(party.active.length<3)party.active.push(id);}
    syncParty();save();render();
    if(full&&party.enlisted.includes(id))requestMemberReplacement(id);
    toast(h.name+(party.enlisted.includes(id)?'已編入現役':'已加入名冊；現役夥伴已達上限'));return h;
  };
  globalThis.acquireCompanion=id=>recruitCompanion(id);
  function requestMemberReplacement(key){
    const incoming=partyMember(key);
    if(!party||!incoming||!isEnlisted(incoming)||party.active.includes(key)||party.active.length!==3)return;
    if(!solo.canVisit(party.map,incoming))return toast('此角色未達目前地圖門檻，請先切換較低級地圖');
    $('modal').innerHTML=`<h2>替換出戰隊員</h2><p>讓 <b>${esc(characterName(incoming))}</b> <span class="tag">${esc(CLASSES[incoming.job].name)}</span> 出戰，請選擇要移至候補的隊員。</p><div class="roster-replace-list">${party.active.map(outKey=>{const h=partyMember(outKey);return `<button onclick="confirmMemberReplacement(${key},${outKey})"><span>替換 ${esc(characterName(h))}</span><span class="tag">${esc(CLASSES[h.job].name)}</span></button>`;}).join('')}</div><div class="actions"><button onclick="closeModal()">保留候補</button></div>`;
    $('modal').showModal();
  }
  window.confirmMemberReplacement=function(inKey,outKey){
    if(!party)return;
    const incoming=partyMember(inKey),index=party.active.indexOf(outKey);
    if(!incoming||!isEnlisted(incoming)||!partyMember(outKey)||party.active.length!==3||party.active.includes(inKey)||index<0)return closeModal();
    if(!solo.canVisit(party.map,incoming)){closeModal();return toast('此角色未達目前地圖門檻，請先切換較低級地圖');}
    const deferRoster=!!globalThis.EmberwildBattleConfiguration?.pending();if(!deferRoster)resetEncounter();party.active[index]=inKey;closeModal();save();if(deferRoster)EmberwildBattleConfiguration.notify();render();
  };
  const originalToggleMember=toggleMember;
  toggleMember=function(key){
    if(companionPlan(partyMember(key))?.availability==='hidden')return false;
    if(!isEnlisted(partyMember(key)))return toast('請先將夥伴編入現役');
    if(party?.active.length===3&&partyMember(key)&&!party.active.includes(key))return requestMemberReplacement(key);
    return originalToggleMember(key);
  };
  recruitHero=function(){toast('請在隊伍編成選擇夥伴');};
  const originalRequestHeroName=requestHeroName;
  requestHeroName=function(job,first=false){if(!first)return toast('請在隊伍編成選擇夥伴');return originalRequestHeroName(job,true);};
  const originalRequestRename=requestRename;
  requestRename=function(key){
    if(partyMember(key)!==party?.members[0])return toast('夥伴使用固定名字');
    return originalRequestRename(key);
  };
  const originalConfirmRename=confirmRename;
  confirmRename=function(key){
    if(partyMember(key)!==party?.members[0])return;
    return originalConfirmRename(key);
  };
  const rosterDetails=new Map();
  globalThis.rememberCompanionRosterDetail=function(key,kind,open){if(partyMember(key)&&['ability','skills'].includes(kind))rosterDetails.set(key+':'+kind,!!open);};
  function memberRow(h,manage=false){
    const key=memberKey(h),plan=companionPlan(h),player=h===party.members[0];
    const header=`<div><div class="member-identity"><b>${esc(characterName(h))}</b>${memberIdentityTags(h)}</div>${plan?`<p class="small">${esc(plan.description)}</p>`:''}</div><div class="roster-member-actions">${manage?`<button onclick="setPartnerEnlisted(${key},${!isEnlisted(h)})" ${party.active.includes(key)?'disabled':''}>${isEnlisted(h)?'移出現役':'編入現役'}</button>`:`<button onclick="toggleMember(${key})">${party.active.includes(key)?'移至後備':'加入上陣'}</button>`}${player?`<button onclick="requestRename(${key})">改名</button>`:''}</div>`;
    const detail=(kind,title,view)=>`<details class="companion-roster-${kind}" ${rosterDetails.get(key+':'+kind)?'open':''} ontoggle="rememberCompanionRosterDetail(${key},'${kind}',this.open)"><summary>${title}</summary><div class="companion-roster-detail-content">${withHero(h,view)}</div></details>`;
    return `<article class="roster-row ${player?'roster-player-row':''} ${manage?'roster-owned-row':''}" data-member-key="${key}">${manage?`<div class="roster-member-header">${header}</div>`:header}${manage&&!player?`<div class="companion-roster-details">${detail('ability','夥伴能力',companionCharacterView)}${detail('skills','夥伴技能',companionSkillsView)}</div>`:''}</article>`;
  }
  rosterView=function(){return heading('PARTY / 隊伍編成','隊伍編成',`<span class="tag">上陣 ${heroes().length} / 3 · 現役 ${enlistedHeroes().length} / ${config.activeLimit}</span>`)+`<section class="panel roster-page"><p class="small">所有夥伴等級與主角相同，不獨立獲得經驗；後備、名冊內與未取得夥伴也會同步主角等級。調整上陣會放棄目前遭遇。</p><div class="actions"><button onclick="setTab('partnerRoster')">管理夥伴名冊</button><button onclick="showCompanionRecruitment()">招募夥伴</button></div><div class="roster-list">${sortedEnlistedHeroes().map(h=>memberRow(h)).join('')}</div></section>`;};
  globalThis.partnerRosterView=function(){
    const companions=party.members.slice(1).filter(h=>companionPlan(h)?.availability!=='hidden').sort(compareMembers),enlisted=companions.filter(isEnlisted).length,limit=Math.max(0,config.activeLimit-Number(isEnlisted(party.members[0])));
    return heading('PARTNER ROSTER / 已取得夥伴','夥伴名冊',`<span class="tag">持有 ${companions.length} · 現役 ${enlisted} / ${limit}</span>`)+`<section class="panel roster-page partner-roster-page"><p class="small">在名冊查看每位夥伴的能力、技能與配置；夥伴依固定走向自動成長。移出現役仍會同步主角等級，並保留所有養成與信物。上陣夥伴須先移至後備，才能移出現役。評級代表夥伴本身的設計。</p><div class="actions"><button onclick="setTab('roster')">隊伍編成</button><button onclick="showCompanionRecruitment()">招募夥伴</button></div><div class="roster-list partner-owned-list">${companions.map(h=>memberRow(h,true)).join('')||'<p class="empty partner-roster-empty">尚未招募任何夥伴。點選「招募夥伴」，將新夥伴加入名冊。</p>'}</div></section>`;
  };
  globalThis.showCompanionRecruitment=function(){const available=rosterPlans().filter(p=>p.availability!=='hidden'&&!partyMember(p.id));$('modal').innerHTML=`<h2>招募夥伴</h2><p class="small">夥伴等級與主角相同（目前 LV${playerHero().lv}），不獨立獲得經驗；現役額滿時，新夥伴會留在名冊。</p><div class="roster-list">${available.map(p=>`<article class="roster-row"><div><div class="member-identity"><b>${esc(party.companionNames[p.id])}</b>${memberIdentityTags({job:p.job,companionId:p.id,lv:playerHero().lv},{includeStatus:false})}</div><p class="small">${esc(p.description)}</p><p class="small">${esc(globalThis.companionUnlockText?.(p)||'')}</p></div><button onclick="closeModal();recruitCompanion(${p.id})" ${globalThis.companionUnlocked?.(p.id)?'':'disabled'}>${globalThis.companionUnlocked?.(p.id)?'招募':'未解鎖'}</button></article>`).join('')||'<p>目前沒有可招募的夥伴。</p>'}</div><button onclick="closeModal()">關閉</button>`;$('modal').showModal();};
  const originalValidateParty=validateParty;
  validateParty=function(data){const out=originalValidateParty(data);for(const h of out.members.slice(1))h.disabledCompanionSkills=validateDisabledSkills(h.disabledCompanionSkills);out.companionProfiles=storedPlans(data?.companionProfiles);out.companionNames=storedNames(data?.companionNames);const keys=out.members.map(memberKey);out.enlisted=data?.enlisted===undefined?[...keys]:data.enlisted;if(!Array.isArray(out.enlisted)||out.enlisted.length<1||new Set(out.enlisted).size!==out.enlisted.length||out.enlisted.some(k=>!keys.includes(k))||out.active.some(k=>!out.enlisted.includes(k)))throw Error('現役夥伴資料無效');out.enlisted=[...out.enlisted];if(!out.enlisted.includes(out.selected))out.selected=out.enlisted[0];return out;};
  const originalAwardXP=awardXP;
  awardXP=function(amount){const player=playerHero();if(!player)return;const before=player.lv,wasDead=player.hp<=0,out=withHero(player,()=>originalAwardXP(amount));syncCompanionLevels({fullHealth:player.lv>before});if(wasDead)player.hp=0;return out;};
  const originalStart=start;
  start=function(job){originalStart(job);if(party){ensureRoster(party);save();render();}};
  const originalLoadParty=loadParty;
  loadParty=function(data){const out=originalLoadParty(data);if(party){ensureRoster(party);syncCompanionLevels();for(const h of party.members){applyPlan(h);cleanPartnerSkillSlots(h);}}return out;};
  if(party){ensureRoster(party);syncCompanionLevels();for(const h of party.members)applyPlan(h);}
  const originalPack=packParty;
  packParty=function(){const out=originalPack();return {...out,members:out.members.map((h,i)=>{const row={...h};if(i>0)delete row.mastery;return row;})};};
  function isEnlisted(h){return !!h&&!!party&&(party.enlisted??party.members.map(memberKey)).includes(memberKey(h));}
  function enlistedHeroes(){return party?.members.filter(isEnlisted)||[];}
  function compareMembers(a,b){const player=party.members[0];return Number(b===player)-Number(a===player)||Number(party.active.includes(memberKey(b)))-Number(party.active.includes(memberKey(a)))||a.job-b.job||memberKey(a)-memberKey(b);}
  function sortedEnlistedHeroes(){return enlistedHeroes().sort(compareMembers);}
  function partnerRating(h){return !h||h===party?.members[0]?null:companionPlan(h)?.rating??'D';}
  function skillAllowedForPartner(h,meta){return meta?.partnerId==null?!(h?.companionId!==undefined||!!party?.members?.slice(1).includes(h)):h?.companionId===meta.partnerId;}
  function validatePartnerSkills(doc){return EmberwildCompanionSkills.validate(doc);}
  function cleanPartnerSkillSlots(h){h.active=h.active.map(i=>i===null||skillAllowedForPartner(h,CLASSES[h.job].skills[i]?.[6])?i:null);h.procSlots=h.procSlots.map(i=>i===null||skillAllowedForPartner(h,CLASSES[h.job].skills[i]?.[6])?i:null);h.supportSlots=h.supportSlots.map(i=>i===null||skillAllowedForPartner(h,SUPPORT[h.job][i])?i:null);}
  function installPartnerSkills(doc){for(let j=0;j<doc.classes.length;j++){for(let i=0;i<doc.classes[j].skills.length;i++){CLASSES[j].skills[i][6]??={};CLASSES[j].skills[i][6].partnerId=doc.classes[j].skills[i].partnerId??null;}for(let i=0;i<doc.supportSkills[j].length;i++)SUPPORT[j][i].partnerId=doc.supportSkills[j][i].partnerId??null;}}
  globalThis.isPartnerEnlisted=isEnlisted;globalThis.enlistedHeroes=enlistedHeroes;globalThis.sortedEnlistedHeroes=sortedEnlistedHeroes;globalThis.partnerRating=partnerRating;globalThis.skillAllowedForPartner=skillAllowedForPartner;
  globalThis.heroGrowthDefinition=function(h){const plan=companionPlan(h)||{job:h.job};return Model.definition(plan,CLASSES,GAMEPLAY_SETTINGS);};
  globalThis.setPartnerEnlisted=function(key,enabled){const h=partyMember(key);if(!h||companionPlan(h)?.availability==='hidden'||isEnlisted(h)===enabled)return false;if(!enabled&&party.active.includes(key)){toast('請先取消上陣或替換隊伍');return false;}if(enabled&&party.enlisted.length>=config.activeLimit){toast('現役夥伴已達上限');return false;}party.enlisted=enabled?[...party.enlisted,key]:party.enlisted.filter(k=>k!==key);if(!party.enlisted.includes(party.selected)){party.selected=party.enlisted[0];state=partyMember(party.selected);}for(const [page,id] of pageHeroSelection)if(!party.enlisted.includes(id))pageHeroSelection.delete(page);save();render();return true;};
  const originalValidateBalance=validateBalanceConfig;
  let restoringDefaults=false;
  const stockSkillPools=originalValidateBalance(exportableBalance()).classes.map((c,j)=>copy(c.skills.slice(0,Math.max(...DEFAULT_PLANS.filter(p=>p.job===j).flatMap(p=>p.core))+1)));
  function prepareSkillDocument(input){
    const source=copy(input);
    if(restoringDefaults&&source.companionSkillVersion!==1){
      source.companions=copy(DEFAULT_PLANS);source.passiveDefinitions=Passive.normalize();
      source.classes.forEach((c,j)=>{while(c.skills.length<stockSkillPools[j].length)c.skills.push(copy(stockSkillPools[j][c.skills.length]));});
    }
    source.passiveDefinitions=Passive.normalize(source.passiveDefinitions);source.companions=parsePlans(source.companions,source,{preserveLegacyNames:true});
    EmberwildCompanionSkills.migrate(source);
    return restoringDefaults?EmberwildCompanionSkills.configureDefaults(source):source;
  }
  globalThis.prepareCompanionSkillDocument=prepareSkillDocument;
  validateBalanceConfig=function(input){
    const source=prepareSkillDocument(input),definitions=Passive.normalize(source.passiveDefinitions),next=parsePlans(source.companions,{...source,passiveDefinitions:definitions});
    const result=originalValidateBalance(source);result.companionSkillVersion=1;result.companionNameVersion=1;result.companions=next;result.passiveDefinitions=definitions;result.companionSettings=Model.normalizeSettings(source.companionSettings,result.classes,result.balanceSettings||GAMEPLAY_SETTINGS);validatePartnerSkills(result);return result;
  };
  const originalApplyBalance=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const checked=validateBalanceConfig(input);originalApplyBalance(checked,{persist:false});plans=checked.companions;config=checked.companionSettings;passiveDefinitions=checked.passiveDefinitions;installPartnerSkills(checked);
    if(party){ensureRoster(party);for(const h of party.members){applyPlan(h);cleanPartnerSkillSlots(h);}save();}
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    if(state)render();
  };
  const originalExportBalance=exportableBalance;
  exportableBalance=function(){const doc=originalExportBalance();doc.companionSkillVersion=1;doc.companionNameVersion=1;doc.companions=copy(plans);doc.passiveDefinitions=copy(passiveDefinitions);doc.companionSettings=copy(config);for(let j=0;j<doc.classes.length;j++)for(let i=0;i<doc.classes[j].skills.length;i++)doc.classes[j].skills[i].partnerId=CLASSES[j].skills[i][6]?.partnerId??null;doc.notes=[...(doc.notes||[]),'companions 每位角色使用單一 name 與獨立技能池；core/support 為夥伴專屬技能，達到需求角色等級後自動學會，不需要二轉與精通；active/proc 依順序配置，可個別啟用或禁用並保存。passives 引用該夥伴的 passiveDefinitions，達到 requiredLevel 且啟用後常駐生效、不占技能槽。'];return doc;};
  const originalResetBalance=resetBalanceJSON;
  resetBalanceJSON=function(){restoringDefaults=true;try{originalResetBalance();}finally{restoringDefaults=false;}config=Model.defaults(CLASSES,GAMEPLAY_SETTINGS);if(party){ensureRoster(party);for(const h of party.members){applyPlan(h);cleanPartnerSkillSlots(h);}save();}if(state)render();};
  for(const name of ['learn','learnSupport','equipSkill','clearActiveSkill','slotProcSkill','clearProcSkill','slotSupport','socket','advance']){
    const original=globalThis[name];if(typeof original!=='function')continue;
    globalThis[name]=function(...args){if(companionPlan(state))return toast('夥伴的技能依固定走向自動成長');return original(...args);};
  }
  function companionCharacterView(){
    const h=state,plan=companionPlan(h),v=stats(h),c=CLASSES[h.job],advanceLevel=Math.round(GS('progression.advance.level',15));
    const percentage=n=>Math.round((n||0)*100);
    const detail=(items,labels)=>Object.entries(items||{}).map(([key,value])=>`${esc(labels[key]||key)} +${percentage(value)}%`).join(' / ');
    return `<p class="companion-ability-intro">${esc(plan?.description||'原有隊員')} ${plan?'<span>升級後依職業自然成長並自動二轉。</span>':''}</p><div class="companion-key-stats"><span>生命 <b>${v.hp}</b></span><span>攻擊 <b>${v.atk}</b></span><span>防禦 <b>${v.def}</b></span><span>暴擊 <b>${percentage(v.crit)}%</b></span><span>速度 <b>${v.speed}</b></span></div><div class="companion-advance-line"><b>職業進階</b><span>LV${advanceLevel} · ${esc(c.advanced)} · ${h.advanced?(plan?'已自動完成':'已完成'):(plan?'達到等級後自動完成':'尚未完成')}</span></div><details class="companion-ability-extra"><summary>查看進階詳細屬性</summary><div class="companion-extra-stats"><span>暴擊傷害 ${percentage(v.critDamage)}%</span><span>防禦穿透 ${Number((v.pierce||0).toFixed(1))}</span><span>防禦無視 ${percentage(v.defenseIgnore)}%</span><span>生命竊取 ${percentage(v.lifesteal)}%</span><span>閃避 ${percentage(v.evasion)}%</span><span>武器屬性 ${esc(ELEMENTS[weaponElement(h)])}</span><span>全屬性增傷 ${percentage(v.elementBonus)}%</span></div><p>${detail(v.elementDamage,ELEMENTS)}</p><p>${detail(v.raceDamage,RACES)}</p><p>${Object.entries(v.resist||{}).map(([key,value])=>`${esc(ELEMENTS[key]||key)}抗性 ${percentage(value)}%`).join(' / ')}</p></details>`;
  }
  function companionSkillsView(){
    const h=state,plan=companionPlan(h),mastery=globalThis.__EMBERWILD_MASTERY;
    const core=CLASSES[h.job].skills,support=SUPPORT[h.job]||[];
    const toggle=(kind,id,unlocked)=>!globalThis.__EMBERWILD_SKILLS&&plan?`<div class="actions"><button data-companion-toggle="${memberKey(h)}:${kind}:${esc(id)}" aria-pressed="${unlocked&&!skillDisabled(h,kind,id)}" onclick="setCompanionSkillEnabled(${memberKey(h)},'${kind}',${kind==='passive'?`'${esc(id)}'`:id},${skillDisabled(h,kind,id)})" ${unlocked?'':'disabled'}>${unlocked?(skillDisabled(h,kind,id)?'啟用':'禁用'):'未解鎖'}</button></div>`:'';
    const includes=(kind,i)=>!plan||(plan[kind]||[]).includes(i)||(kind==='core'?h.skills?.[i]||h.active?.includes(i)||h.procSlots?.includes(i):h.supportLevels?.[i]||h.supportSlots?.includes(i));
    const slotGroup=(label,slots,nameOf)=>`<div class="companion-skill-slot-group"><b>${label}</b>${Array.from({length:2},(_,slot)=>{const id=slots?.[slot]??null;return `<span>槽 ${slot+1}：${esc(id===null?'未配置':nameOf(id)||'未知技能')}</span>`;}).join('')}</div>`;
    const slots=globalThis.__EMBERWILD_SKILLS?'':`<div class="companion-skill-loadout">${slotGroup('主動技能',h.active,i=>core[i]?.[0])}${slotGroup('普攻觸發技能',h.procSlots,i=>core[i]?.[0])}${slotGroup('輔助技能',h.supportSlots,i=>support[i]?.name)}</div>`;
    const skillRows=(kind,list)=>list.map((sk,i)=>{
      const isCore=kind==='core',meta=isCore?sk[6]:sk;
      if(!includes(kind,i)||!skillAllowedForPartner(h,meta))return '';
      const learned=Number((isCore?h.skills:h.supportLevels)?.[i])||0;
      const positions=(isCore?(sk[1]==='proc'?h.procSlots:h.active):h.supportSlots)||[],slotLabel=isCore?(sk[1]==='proc'?'觸發':'主動'):'輔助';
      const equipped=learned?positions.map((id,slot)=>id===i?`${slotLabel}槽 ${slot+1}`:'').filter(Boolean):[];
      const missing=mastery?(isCore?mastery.coreMissingRequirements(h,i,!!learned):mastery.supportMissingRequirements(h,i,!!learned)):[];
      const growthMissing=missing;
      const name=isCore?sk[0]:sk.name,flavor=isCore?coreSkillFlavor(h.job,i):sk.description;
      const detail=isCore?coreSkillDetail(h.job,i,h):supportSkillDetail(h.job,i,h),status=!learned?'未解鎖':skillDisabled(h,kind,i)?'已禁用':equipped.length?'已啟用':'已解鎖';
      const gem=isCore?h.sockets?.[i]:null;
      return `<article class="companion-skill-card" data-companion-skill="${kind}:${i}"><div class="skill-list-title">${globalThis.__EMBERWILD_MASTERY_UI?.skillIcon?.(h.job,kind,i)||''}<b>${esc(name)}</b><span class="skill-state ${learned?'learned':'locked'}">${status}</span><span>${isCore?(sk[1]==='proc'?'普攻觸發':'主動'):'輔助'}</span></div>${skillTypeBadges(h.job,i,isCore?'core':'support')}${skillMechanicsDetails(h.job,i,isCore?'core':'support')}${flavor?`<p class="small">${esc(flavor)}</p>`:''}<p>${esc(detail)}</p><p class="small">解鎖 LV${isCore?sk[2]:sk.level}</p>${equipped.length?`<p class="small companion-skill-equipped">已配置：${esc(equipped.join('、'))}</p>`:''}${growthMissing.length?`<p class="small">使用條件：${esc(growthMissing.join('、'))}</p>`:''}${gem!=null&&GEMS[gem]?`<p class="small">鑲嵌寶石：${esc(GEMS[gem].name)}</p>`:''}${toggle(kind,i,!!learned)}</article>`;
    }).filter(Boolean).join('');
    // Heroes from saves older than the companion system cannot use class skills yet; list them as 等待解鎖.
    const legacy=!plan&&h.companionId===undefined&&h!==party?.members?.[0];
    const waiting=legacy?(globalThis.__EMBERWILD_SKILLS?.system()?.definitions||[]).filter(sk=>!sk.disabled&&sk.partnerId==null&&sk.type!=='passive'&&sk.jobs?.includes(h.job)).map(sk=>`<article class="companion-skill-card is-waiting" data-companion-skill-waiting="${esc(sk.id)}"><div class="skill-list-title"><b>${esc(sk.name)}</b><span class="skill-state locked">等待解鎖</span><span>${({active:'主動',proc:'普攻觸發',support:'輔助'})[sk.type]||''}</span></div>${sk.description?`<p class="small">${esc(sk.description)}</p>`:''}</article>`).join(''):'';
    const rows=legacy?waiting:skillRows('core',core)+skillRows('support',support);
    const passiveRows=allPassivesFor(h).map(d=>`<article class="companion-skill-card" data-companion-passive="${esc(d.id)}"><div class="skill-list-title"><span class="skill-icon-glyph" aria-hidden="true">${globalThis.__EMBERWILD_SKILL_ICONS?.svgFor(d.kind==='debuff'?'skull':'shield')||''}</span><b>${esc(d.name)}</b><span class="skill-state ${h.lv>=d.requiredLevel?'learned':'locked'}">${h.lv<d.requiredLevel?'未解鎖':skillDisabled(h,'passive',d.id)?'已禁用':'已啟用'}</span><span>被動 · ${d.kind==='debuff'?'DEBUFF':'BUFF'}</span></div><p>${esc(d.effects.map(Passive.effectText).join('、'))}</p><p class="small">需求 LV${d.requiredLevel} · ${esc(Passive.targets[d.target])} · ${d.target==='self'?'解鎖且啟用後常時生效':'啟用、上陣且存活時提供常駐光環'} · 不占技能槽</p>${d.description?`<p class="small">${esc(d.description)}</p>`:''}${toggle('passive',d.id,h.lv>=d.requiredLevel)}</article>`).join('');
    return `<p class="small companion-skill-note">${plan?'技能達到需求角色等級後自動解鎖，所有已解鎖技能都會自動使用。':legacy?'原有隊員目前不能使用職業技能，等待解鎖。':'保留原有隊員的技能與配置。'}</p>${legacy?'':slots}<div class="companion-skill-list">${rows||'<p class="small">此夥伴尚無技能。</p>'}</div><h3>常駐被動</h3><div class="companion-skill-list">${passiveRows||'<p class="small">此夥伴尚無被動。</p>'}</div>`;
  }
  globalThis.setCompanionSkillEnabled=function(key,kind,id,enabled){
    if(globalThis.__EMBERWILD_SKILLS)return false;
    const h=partyMember(key),plan=companionPlan(h);if(!plan||typeof enabled!=='boolean')return false;
    let unlocked=false;
    if(kind==='core')unlocked=plan.core.includes(id)&&!!h.skills[id]&&skillAllowedForPartner(h,CLASSES[h.job].skills[id]?.[6]);
    else if(kind==='support')unlocked=plan.support.includes(id)&&!!h.supportLevels[id]&&skillAllowedForPartner(h,SUPPORT[h.job][id]);
    else if(kind==='passive')unlocked=allPassivesFor(h).some(d=>d.id===id&&d.partnerId===h.companionId&&!globalThis.__EMBERWILD_SKILLS?.byId(d.id)?.disabled&&h.lv>=d.requiredLevel);
    if(!unlocked)return false;
    const settings=validateDisabledSkills(h.disabledCompanionSkills);settings[kind]=settings[kind].filter(value=>value!==id);if(!enabled)settings[kind].push(id);h.disabledCompanionSkills=settings;
    applyPlan(h);for(const member of party.members)member.hp=Math.min(member.hp,stats(member).hp);
    save();render();return true;
  };
  const baseCharacterView=characterView;
  characterView=function(){
    const player=party.members[0];
    pageHeroSelection.set('character',memberKey(player));
    return withHero(player,baseCharacterView).replace(pageSelector('character'),'').replace('<div class="page-owner-content">','<div class="page-owner-content">'+playerProgressView('character'));
  };
  const baseRender=render;
  render=function(){syncCompanionLevels();return baseRender();};
  globalThis.__EMBERWILD_COMPANION_TEST_API={get plans(){return copy(plans);},get config(){return copy(config);},get passiveDefinitions(){return copy(passiveDefinitions);},parsePlans,ensureRoster,companionPlan,passivesFor,passiveEffectsFor,applyPlan};
  try{
    const raw=JSON.parse(balanceSourceText()||'null');
    // Later modules have not installed shop, token and team exports yet. Writing
    // here would replace those saved settings with an incomplete document.
    if(raw)applyBalanceConfig(raw,{persist:false});
    else{const doc=exportableBalance();delete doc.companionSkillVersion;delete doc.companionNameVersion;doc.companions=copy(DEFAULT_PLANS);applyBalanceConfig(EmberwildCompanionSkills.configureDefaults(prepareSkillDocument(doc)),{persist:false});}
  }catch(e){console.warn('專屬技能載入失敗',e);}

  if(state&&party)render();
})();
