/* Last adapter in the production load order. Existing actors remain the combat
   projection; buildSystem owns configuration and permanent progression only. */
(()=>{
  'use strict';
  const M=EmberwildTeams,copy=M.copy,mastery=__EMBERWILD_MASTERY;
  GAMEPLAY_SETTINGS_DEFAULTS.meta.teamBuildVersion=M.VERSION;
  let cfg=M.settings(),hydrating=false,suppressSave=false,resettingBalance=false;
  const classDocs=()=>CLASSES.map(c=>({skills:c.skills.map(sk=>({...sk[6],activation:sk[1]}))}));
  const build=()=>party?.buildSystem,player=()=>party?.members[0],plan=()=>build()?.plans.find(p=>p.id===build().activeId);
  function replayRule(raw){
    const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
    if(!cache||!raw)return M.rules(raw);
    const rules=cache.teamRules??=new WeakMap();if(!rules.has(raw))rules.set(raw,M.rules(raw));return rules.get(raw);
  }
  const coreRule=(j,i)=>replayRule(mastery.coreMeta(j,i)),supportRule=(j,i)=>replayRule(SUPPORT[j]?.[i]);
  const costs=()=>0;
  const budgets=()=>M.budget(player().lv,GAMEPLAY_SETTINGS.progression,build().permanent);
  function masteryView(h){
    if(h!==player()||!build())return null;
    const all=build().permanent.masteries,out={};
    for(const k of mastery.validMasteries(h.job)){all[k]??=0;Object.defineProperty(out,k,{enumerable:true,configurable:true,get:()=>all[k],set:v=>{all[k]=Math.max(0,Math.floor(Number(v)||0));}});}
    return out;
  }
  globalThis.__EMBERWILD_TEAM_MASTERY=masteryView;
  globalThis.__EMBERWILD_TEAM_GAIN=(h,n)=>{if(h!==player()||!build()||plan()?.job===null)return;const c=build().permanent.classes[h.job];if(c?.activated)c.xp+=n;refreshUnlocks();};
  function snapshot(p){
    const h=player();p.skills=copy(h.skills);p.supportLevels=copy(h.supportLevels);p.active=copy(h.active);p.procSlots=copy(h.procSlots);p.supportSlots=copy(h.supportSlots);p.equipped=copy(h.equipped);if(h.skillLoadout)p.skillLoadout=copy(h.skillLoadout);p.activeSkillEquipmentId=h.activeSkillEquipmentId??null;p.passiveEnabled=copy(h.passiveEnabled||{});
    p.playerActive=party.active.includes(memberKey(h));p.companions=party.active.filter(k=>k!==memberKey(h));p.enlisted=(party.enlisted||party.members.map(memberKey)).filter(k=>k!==memberKey(h));
    p.tokens=Object.fromEntries(party.members.slice(1).map(h=>[memberKey(h),h.tokenId??null]));
    p.sockets??=Array(h.skills.length).fill(null);
    if(p.job===null){Object.assign(p,M.blank(p.id,p.name));}
  }
  function migrate(){
    const h=player();if(!h)return;if(build())return;
    h.playerId??=h.job;
    const permanent={playerKey:memberKey(h),classes:{},masteries:copy(h.mastery||{}),unlocks:{},payments:{},gemInstances:{},gemSerial:1};
    CLASSES.forEach((_,j)=>permanent.classes[j]={activated:j===h.job,xp:j===h.job?Object.values(h.mastery||{}).reduce((n,v)=>n+v,0):0,advanced:j===h.job&&h.advanced});
    const p=M.blank('team-1','隊伍 1',h.job,h.skills.length,h.supportLevels.length);party.buildSystem={version:M.VERSION,activeId:p.id,serial:2,plans:[p],permanent};snapshot(p);
    for(const [kind,list] of [['core',h.skills],['support',h.supportLevels]])list.forEach((v,i)=>{if(v)permanent.unlocks[M.key(h.job,kind,i)]=true;});
    h.sockets.forEach((type,i)=>{if(type!==null){const id='gem-'+permanent.gemSerial++;permanent.gemInstances[id]=type;p.sockets[i]=id;}});
    delete h.sp;
    refreshUnlocks();syncPoints();
  }
  function syncPoints(){if(!build())return;const h=player();delete h.ap;delete h.stats;delete h.sp;}
  function capture(){
    if(!party||hydrating)return;migrate();const h=player(),p=plan();
    if(p.job!==null){p.job=h.job;const c=build().permanent.classes[h.job];if(c)c.advanced=h.advanced;}
    snapshot(p);refreshUnlocks();syncPoints();
  }
  function apply(p){
    const h=player(),hp=new Map(party.members.map(x=>[memberKey(x),x.hp]));h.playerId=build().permanent.playerKey;
    h.job=p.job??0;h.advanced=p.job!==null&&!!build().permanent.classes[p.job]?.advanced;
    for(const field of ['skills','supportLevels','active','procSlots','supportSlots','equipped'])h[field]=copy(p[field]);
    if(p.job===null){h.skills=Array(CLASSES[0].skills.length).fill(0);h.supportLevels=SUPPORT[0].map(()=>0);}
    h.sockets=p.job===null?h.skills.map(()=>null):p.sockets.map(id=>id===null?null:build().permanent.gemInstances[id]);
    h.skillLoadout=p.skillLoadout?copy(p.skillLoadout):undefined;h.activeSkillEquipmentId=p.activeSkillEquipmentId??null;h.passiveEnabled=copy(p.passiveEnabled||{});globalThis.__EMBERWILD_SKILLS?.refreshHero(h);h.mastery=masteryView(h);party.active=[...(p.playerActive?[memberKey(h)]:[]),...p.companions];party.enlisted=[memberKey(h),...p.enlisted];party.selected=memberKey(h);state=h;
    for(const x of party.members.slice(1)){const key=memberKey(x),id=p.tokens[key]??null;x.tokenId=id&&EmberwildTokens.canEquip(findGear(id),x)?id:null;p.tokens[key]=x.tokenId;}
    pageHeroSelection.clear();forgeSelection=null;pendingAffix=null;
    for(const x of party.members){x.hp=Math.min(hp.get(memberKey(x))??0,stats(x).hp);if(x.hp<=0)x.hp=0;}
    syncPoints();
  }
  function unlockMissing(j,kind,i){
    const h=player(),perm=build().permanent,c=perm.classes[j],sk=kind==='core'?CLASSES[j]?.skills?.[i]:SUPPORT[j]?.[i],r=kind==='core'?coreRule(j,i):supportRule(j,i),meta=kind==='core'?mastery.coreMeta(j,i):sk,reasons=[];
    if(!sk)return ['技能不存在'];if(!c?.activated)reasons.push('尚未使用此職業');if(meta.partnerId!==null&&meta.partnerId!==undefined)reasons.push('指定夥伴專屬');
    const lv=kind==='core'?sk[2]:sk.level;if(h.lv<lv)reasons.push('主角 LV'+lv);
    if((kind==='core'?skillRequiresAdvanced(sk,i):i===2)&&!c?.advanced)reasons.push('完成二轉');
    if(meta.requiredMastery&&mastery.masteryLevelFromXp(perm.masteries[meta.requiredMastery]||0)<(meta.requiredMasteryLevel||0))reasons.push((mastery.masteryLabels[meta.requiredMastery]||meta.requiredMastery)+'精通 Lv'+meta.requiredMasteryLevel);
    if(mastery.masteryLevelFromXp(c?.xp||0)<r.unlockConditions.classMasteryLevel)reasons.push('職業精通 Lv'+r.unlockConditions.classMasteryLevel);
    for(const q of r.unlockConditions.quests)if(!(q==='tutorial'&&h.tutorial>=3)&&!h.claimed.includes(q))reasons.push('永久任務：'+q);
    for(const m of r.unlockConditions.materials)if(materialCount(m.name)<m.quantity)reasons.push(m.name+' ×'+m.quantity);
    const achievements=party?.achievements||{},sum=obj=>Object.values(obj||{}).reduce((n,v)=>n+(Number(v)||0),0),mapName=i=>i<0?'任意區域':(MAPS[i]?.name||('區域 '+i)),bossName=i=>i<0?'任意 BOSS':(MAPS[i]?.boss?.[0]||mapName(i)+' BOSS');
    for(const x of r.unlockConditions.bossKills){const n=x.mapIndex<0?sum(achievements.bossKills):(achievements.bossKills?.[x.mapIndex]||0);if(n<x.count)reasons.push('擊敗 '+bossName(x.mapIndex)+' '+n+'/'+x.count);}
    for(const x of r.unlockConditions.eliteKills){const n=x.mapIndex<0?sum(achievements.eliteKills):(achievements.eliteKills?.[x.mapIndex]||0);if(n<x.count)reasons.push('擊敗 '+mapName(x.mapIndex)+'菁英 '+n+'/'+x.count);}
    if(r.unlockConditions.bossEquipment.length){const seen=new Set(),owned=[];for(const g of party?.sharedGear?.items||[]){if(g?.id&&!seen.has(g.id)){seen.add(g.id);owned.push(g);}}for(const member of party?.members||[])for(const g of member?.bag||[]){if(g?.id&&!seen.has(g.id)){seen.add(g.id);owned.push(g);}}const bossGear=owned.filter(g=>g?.boss!==undefined);
    for(const x of r.unlockConditions.bossEquipment){const n=bossGear.filter(g=>x.mapIndex<0||(g.region??g.boss)===x.mapIndex).length;if(n<x.quantity)reasons.push('持有 '+bossName(x.mapIndex)+'裝備 '+n+'/'+x.quantity);}}
    return reasons;
  }
  function refreshUnlocks(){
    if(!build())return;const perm=build().permanent,cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE,h=player();
    // Replay cannot edit builds. Re-evaluate gates when their dependencies change,
    // rather than scanning every skill on every point of mastery/character XP.
    const key=cache?JSON.stringify([h.lv,h.tutorial,h.claimed,h.bag.length,party.achievements, Object.values(perm.classes).map(c=>[c.activated,c.advanced,mastery.masteryLevelFromXp(c.xp)]),Object.entries(perm.masteries).map(([k,n])=>[k,mastery.masteryLevelFromXp(n)])]):null;
    if(cache?.unlockOwner===perm&&cache.unlockKey===key)return;
    CLASSES.forEach((c,j)=>{for(const [kind,list] of [['core',c.skills],['support',SUPPORT[j]]])list.forEach((_,i)=>{const k=M.key(j,kind,i),r=kind==='core'?coreRule(j,i):supportRule(j,i);if(!perm.unlocks[k]&&!r.unlockConditions.materials.length&&!unlockMissing(j,kind,i).length)perm.unlocks[k]=true;});});
    if(cache){cache.unlockOwner=perm;cache.unlockKey=key;}
  }
  function busy(){return !!(running||partyBusy||roundIterator||foes.some(e=>e.hp>0));}
  function safe(){if(busy()){toast('請先停止探索並結束目前遭遇，再修改隊伍配置');return false;}return !!party;}
  function valid(){return !!plan()&&plan().job!==null&&party.active.length>0&&heroes().every(h=>solo.canVisit(party.map,h));}
  function transaction(fn,{configuration=false}={}){
    if(configuration?!party:!safe())return false;capture();const before=copy(build()),h=player(),members=party.members.slice(),profiles=copy(party.companionProfiles||{}),names=copy(party.companionNames||{}),old={hp:party.members.map(x=>x.hp),shield:party.members.map(x=>x.shield),potionCD:party.members.map(x=>x.healPotionCooldownRemaining||0),ac:copy(actorCooldowns),sc:copy(supportCooldowns),clock:partyClock,gold:h.gold,ore:h.ore,dust:h.dust,gems:copy(h.gems),materials:copy(h.materials)};
    const previousSuppress=suppressSave;try{suppressSave=true;fn();if(!configuration)resetBattleState();else if(globalThis.EmberwildBattleConfiguration?.pending()){party.members.forEach((x,i)=>{x.hp=old.hp[i];x.shield=old.shield[i];});}suppressSave=previousSuppress;syncPoints();if(save()===false)throw Error('無法儲存');if(configuration)globalThis.EmberwildBattleConfiguration?.notify();render();return true;}catch(e){suppressSave=previousSuppress;party.members=members;party.companionProfiles=profiles;party.companionNames=names;party.buildSystem=before;apply(plan());h.gold=old.gold;h.ore=old.ore;h.dust=old.dust;h.gems=old.gems;h.materials=old.materials;party.members.forEach((x,i)=>{x.hp=old.hp[i];x.shield=old.shield[i];x.healPotionCooldownRemaining=old.potionCD[i];});actorCooldowns=old.ac;supportCooldowns=old.sc;partyClock=old.clock;toast('操作未保存：'+e.message);return false;}
  }
  function activate(j){const c=build().permanent.classes[j]??={activated:false,xp:0,advanced:false};c.activated=true;}
  globalThis.changePlayerClass=function(j){j=Number(j);if(!safe()||!Number.isInteger(j)||!CLASSES[j]||plan().job===j)return false;
    if(plan().job!==null&&!confirm('轉為'+CLASSES[j].name+'？本隊能力與技能分配將返還，技能槽及寶石配置清空；不符職業的裝備將卸下。永久養成與其他隊伍保留。'))return false;
    return transaction(()=>{const p=plan(),gear=copy(p.equipped),members=copy(p.companions),playerActive=p.playerActive,enlisted=copy(p.enlisted),tokens=copy(p.tokens);releaseSockets(p);Object.assign(p,M.blank(p.id,p.name,j,CLASSES[j].skills.length,SUPPORT[j].length));p.companions=members;p.playerActive=playerActive;p.enlisted=enlisted;p.tokens=tokens;p.equipped=gear.map((id,i)=>{const g=findGear(id);return g&&gearWearableJobs(g).includes(j)&&gearEquipPositions(g).includes(i)?id:null;});activate(j);apply(p);refreshUnlocks();});
  };
  globalThis.addTeamPlan=function(){if(!safe()||build().plans.length>=cfg.maxPlans)return false;return transaction(()=>{const b=build(),id='team-'+b.serial++;b.plans.push(M.blank(id,'隊伍 '+id.slice(5)));});};
  globalThis.copyTeamPlan=function(id=build()?.activeId){if(!safe()||build().plans.length>=cfg.maxPlans)return false;return transaction(()=>{const b=build(),source=b.plans.find(p=>p.id===id);if(!source)throw Error('找不到隊伍');const p=copy(source);p.id='team-'+b.serial++;p.name=Array.from(source.name).slice(0,20).join('')+' 複本';b.plans.push(p);});};
  globalThis.renameTeamPlan=function(id,name){if(!safe())return false;if(name===undefined)name=prompt('隊伍名稱（最多 24 字）',build().plans.find(p=>p.id===id)?.name||'');if(typeof name!=='string'||!name.trim()||Array.from(name.trim()).length>24||/[\u0000-\u001f]/.test(name))return false;return transaction(()=>{const p=build().plans.find(p=>p.id===id);if(!p)throw Error('找不到隊伍');p.name=name.trim();});};
  globalThis.switchTeamPlan=function(id){if(!safe()||id===build().activeId||!build().plans.some(p=>p.id===id))return false;return transaction(()=>{build().activeId=id;apply(plan());refreshUnlocks();});};
  function releaseSockets(p){const ids=p.sockets.filter(Boolean);p.sockets=p.sockets.map(()=>null);for(const id of ids)if(!build().plans.some(other=>other.sockets.includes(id))){const type=build().permanent.gemInstances[id];player().gems[type]++;delete build().permanent.gemInstances[id];}}
  globalThis.clearTeamPlan=function(id=build()?.activeId){
    if(!safe())return false;const p=build().plans.find(p=>p.id===id);if(!p)return false;
    if(!confirm('清空「'+p.name+'」的整體配置？主角職業、技能、裝備、寶石及夥伴配置將全部清空，無法復原。永久養成與背包物品保留；未被其他方案使用的寶石會返還。'))return false;
    return transaction(()=>{releaseSockets(p);Object.assign(p,M.blank(p.id,p.name));if(id===build().activeId)apply(p);});
  };
  globalThis.deleteTeamPlan=function(id){
    if(!safe())return false;const b=build(),index=b.plans.findIndex(p=>p.id===id);if(index<0)return false;
    if(index===0){toast('第一個隊伍方案不可刪除，可使用清空配置');return false;}
    const p=b.plans[index];if(!confirm('刪除隊伍方案「'+p.name+'」？整個方案及其配置將永久移除，無法復原。永久養成與背包物品保留；未被其他方案使用的寶石會返還。'+(id===b.activeId?'刪除後切換至第一個方案「'+b.plans[0].name+'」。':'')))return false;
    return transaction(()=>{releaseSockets(p);b.plans.splice(index,1);if(id===b.activeId){b.activeId=b.plans[0].id;apply(plan());}});
  };
  globalThis.resetSkills=function(){if(state!==player()||!safe()||!confirm('免費重置本隊所有技能學習與裝配？永久解鎖與精通保留。'))return false;return transaction(()=>{const p=plan();releaseSockets(p);p.skills.fill(0);p.supportLevels.fill(0);p.active.fill(null);p.procSlots.fill(null);p.supportSlots.fill(null);delete p.skillLoadout;apply(p);});};
  function learnTeam(kind,i){if(state!==player()||!safe()||plan().job===null)return false;capture();const p=plan(),j=p.job,list=kind==='core'?player().skills:player().supportLevels,k=M.key(j,kind,i),r=kind==='core'?coreRule(j,i):supportRule(j,i);if(!Number.isInteger(i)||i<0||i>=list.length||list[i])return false;if(!build().permanent.unlocks[k]){toast('尚未永久解鎖：'+unlockMissing(j,kind,i).join('、'));return false;}return transaction(()=>{list[i]=1;});}
  const learnBase=learn,supportBase=learnSupport;
  learn=function(i){return state===player()?learnTeam('core',i):learnBase(i);};learnSupport=function(i){return state===player()?learnTeam('support',i):supportBase(i);};
  globalThis.unlockTeamSkill=function(kind,i){if(!safe()||!['core','support'].includes(kind)||plan().job===null)return false;const j=plan().job,k=M.key(j,kind,i);if(build().permanent.unlocks[k])return true;const missing=unlockMissing(j,kind,i);if(missing.length){toast('尚未達成：'+missing.join('、'));return false;}return transaction(()=>{const r=kind==='core'?coreRule(j,i):supportRule(j,i);for(const m of r.unlockConditions.materials)setMaterialCount(m.name,materialCount(m.name)-m.quantity);build().permanent.unlocks[k]=true;if(r.unlockConditions.materials.length)build().permanent.payments[k]=true;});};
  const socketBase=socket;socket=function(i,value){if(state!==player())return socketBase(i,value);if(!safe()||plan().job===null||!Number.isInteger(i)||!player().skills[i])return false;const type=Number(value),p=plan();if(!Number.isInteger(type)||type< -1||type>=GEMS.length||type>=0&&!gemCompatible(type,player().job,i))return false;if(type>=0&&player().gems[type]<1)return false;return transaction(()=>{const old=p.sockets[i];p.sockets[i]=null;if(old&&!build().plans.some(other=>other.sockets.includes(old))){player().gems[build().permanent.gemInstances[old]]++;delete build().permanent.gemInstances[old];}if(type>=0){const id='gem-'+build().permanent.gemSerial++;build().permanent.gemInstances[id]=type;player().gems[type]--;p.sockets[i]=id;}player().sockets=p.sockets.map(id=>id?build().permanent.gemInstances[id]:null);});};
  const baseSave=save;save=function(...args){if(suppressSave)return true;if(party&&!hydrating)capture();return baseSave(...args);};
  const basePack=packParty;packParty=function(){capture();const out=basePack();out.buildSystem=copy(build());return out;};
  function validateBuild(data,p){return M.validate(data,{classes:classDocs(),supports:SUPPORT,members:p.members,items:p.members.flatMap(h=>h.bag),progression:GAMEPLAY_SETTINGS.progression,level:p.members[0].lv,config:cfg,wearable:(g,j,i)=>!EmberwildTokens.isToken(g)&&gearWearableJobs(g).includes(j)&&gearEquipPositions(g).includes(i)&&gearRequiredLevel(g)<=p.members[0].lv});}
  const baseValidate=validateParty;validateParty=function(input){const d=M.prepareSave(input),p=baseValidate(d);if(d.buildSystem!==undefined)p.buildSystem=validateBuild(d.buildSystem,p);return p;};
  const baseLoad=loadParty;loadParty=function(input){
    const d=M.prepareSave(input);validateParty(d);hydrating=true;try{baseLoad(d);if(d.buildSystem)party.buildSystem=validateBuild(d.buildSystem,party);else delete party.buildSystem;}finally{hydrating=false;}
    migrate();apply(plan());if(party.enlisted.includes(d.selected)){party.selected=d.selected;state=partyMember(d.selected);}refreshUnlocks();syncPoints();return party;
  };
  const baseStart=start;start=function(...args){const out=baseStart(...args);migrate();capture();save();render();return out;};
  const xpBase=awardXP;awardXP=function(...args){const out=xpBase(...args);if(build()){syncPoints();refreshUnlocks();}return out;};
  const advanceBase=advance;advance=function(){if(!safe()||state===player()&&plan()?.job===null)return false;if(state!==player())return advanceBase();return transaction(()=>{advanceBase();build().permanent.classes[state.job].advanced=state.advanced;refreshUnlocks();});};
  const baseBalanceValidate=validateBalanceConfig;validateBalanceConfig=function(input){return baseBalanceValidate(M.normalizeDocument(input));};
  function applyRules(d){cfg=M.settings(d.teamSettings);d.classes.forEach((c,j)=>c.skills.forEach((sk,i)=>Object.assign(mastery.coreMeta(j,i),M.rules(sk))));d.supportSkills.forEach((list,j)=>list.forEach((sk,i)=>Object.assign(SUPPORT[j][i],M.rules(sk))));}
  const baseExport=exportableBalance;exportableBalance=function(){const d=baseExport();d.teamSettings=copy(cfg);d.balanceSettings.meta.teamBuildVersion=M.VERSION;for(const [j,c] of d.classes.entries())c.skills.forEach((sk,i)=>Object.assign(sk,coreRule(j,i)));d.supportSkills.forEach((list,j)=>list.forEach((sk,i)=>Object.assign(sk,supportRule(j,i))));d.notes=d.notes.filter(x=>!String(x).includes('技能點'));d.notes.push('技能沒有技能點成本；永久解鎖共用，學習與 2 主動／2 觸發／2 輔助槽由各隊伍獨立保存。');d.notes.push('技能 unlockConditions 可指定職業精通、任務、材料、BOSS 擊殺、菁英擊殺與持有 BOSS 裝備；同一技能的多項條件需全部達成。');return d;};
  function stageBalanceBuild(d,refundedGems=[]){
    if(!build())return null;
    const next=copy(build());
    for(const p of next.plans){
      for(const [key,id] of Object.entries(p.tokens)){const h=partyMember(Number(key)),g=findGear(id),definition=g&&d.companionTokens.catalog.find(t=>t.id===g.tokenId);if(id&&!EmberwildTokens.canEquip(g&&{...g,snapshot:definition||g.snapshot},h))p.tokens[key]=null;}
      if(p.job===null)continue;
      for(const [field,count,empty] of [['skills',d.classes[p.job].skills.length,0],['sockets',d.classes[p.job].skills.length,null],['supportLevels',d.supportSkills[p.job].length,0]]){
        if(p[field].slice(count).some(v=>v!==empty))throw Error('平衡設定會刪除「'+p.name+'」的已學習技能或寶石；請先調整方案');
        p[field]=Array.from({length:count},(_,i)=>p[field][i]??empty);
      }
      // Convert only the unoccupied tail of legacy 2/2/2 slots to the
      // currently configured stable-ID skill slot sizes.
      if(p.skillLoadout){
        const stage=next.permanent.classes[p.job]?.advanced?'advanced':'first';
        const rule=d.skillSystem?.classRules?.find(r=>r.job===p.job)?.slots?.[stage];
        if(rule)for(const [type,field] of [['active','active'],['proc','procSlots'],['support','supportSlots']]){
          const count=rule[type],slots=p[field],ids=p.skillLoadout[type];
          if(!Number.isInteger(count)||!Array.isArray(slots)||!Array.isArray(ids))throw Error('隊伍技能槽資料無效');
          for(const entries of [slots,ids]){
            if(entries.slice(count).some(value=>value!==null))throw Error('新版技能槽不足以保留已配置技能');
            entries.length=Math.min(entries.length,count);
            while(entries.length<count)entries.push(null);
          }
        }
        // Published starter skills can be slotted in old builds before the
        // new class catalog has been projected into CLASSES at cold startup.
        // Grant only auto-unlocked starter skills already present in the saved
        // stable-ID loadout and engine slot. All other skills remain untouched.
        const starters=d.skillSystem.classRules.find(r=>r.job===p.job)?.initial||[];
        for(const starter of starters){
          if(player().lv<starter.level||!p.skillLoadout.active?.includes(starter.skillId))continue;
          const skill=d.skillSystem.definitions.find(s=>s.id===starter.skillId);
          const adapter=(skill?.adapters||[skill?.adapter]).find(a=>a?.job===p.job&&a.kind==='core');
          if(!adapter||!p.active.includes(adapter.index)||d.classes[p.job].skills[adapter.index]?.activation!=='active')continue;
          p.skills[adapter.index]=1;
          next.permanent.unlocks[p.job+':core:'+adapter.index]=true;
        }
      }
    }
    // A previously learned core skill may require equipment in the new catalog.
    // If it is no longer learned, unmount only its old *owned* skill gem.
    // Do not silently accept other corrupt skill or gem references.
    const displaced=new Set();
    for(const p of next.plans){
      if(p.job===null)continue;
      for(let i=0;i<p.sockets.length;i++){
        const id=p.sockets[i];
        if(id===null||p.skills[i])continue;
        const wasUnlocked=next.permanent.unlocks[p.job+':core:'+i]===true;
        const skill=d.skillSystem?.definitions.find(s=>(s.adapters||[s.adapter]).some(a=>a?.job===p.job&&a.kind==='core'&&a.index===i));
        const gearOnly=skill?.sources?.some(s=>s.type==='equipment')===true;
        if(!wasUnlocked||!gearOnly||!Object.hasOwn(next.permanent.gemInstances,id))continue;
        p.sockets[i]=null;
        displaced.add(id);
      }
    }
    for(const id of displaced){
      if(next.plans.some(p=>p.sockets.includes(id)))continue;
      refundedGems.push(next.permanent.gemInstances[id]);
      delete next.permanent.gemInstances[id];
    }
    try{return M.validate(next,{classes:d.classes,supports:d.supportSkills,members:party.members,items:player().bag,progression:d.balanceSettings.progression,level:player().lv,config:d.teamSettings,wearable:()=>true});}
    catch(e){throw Error('平衡設定不相容於已保存的隊伍：'+e.message+'。請先調整配置；原設定保留。');}
  }
  const balanceBase=applyBalanceConfig;
  // Re-enter the final adapters without staging a build or committing another save.
  function restoreRules(doc){const previous=resettingBalance;resettingBalance=true;try{applyBalanceConfig(doc,{persist:false});}finally{resettingBalance=previous;}}
  function rollbackDocument(){const doc=exportableBalance();return globalThis.EmberwildInventoryIcons?.migrateDescriptions?.(doc,{hydrate:true})||doc;}
  applyBalanceConfig=function(input,{persist=true}={}){
    if(party&&!safe())return false;
    const d=validateBalanceConfig(input);
    // Earlier reset snapshots precede the later stock skills/status modules.
    // Validate the completed reset once the full existing reset chain returns.
    if(resettingBalance){balanceBase(d,{persist:false});applyRules(d);return d;}
    capture();
    // Inner importers need descriptions hydrated from the exported icon catalogue.
    const refundedGems=[],next=stageBalanceBuild(d,refundedGems),before=rollbackDocument(),previousBuild=build()?copy(build()):null,previousCache=localStorage.getItem(BALANCE_KEY),previousSuppress=suppressSave;
    const previousGems=party?copy(player().gems):null;
    const previousMarket=party?.market===undefined?undefined:copy(party.market);
    const battle=party?{heroes:party.members.map(h=>({hp:h.hp,shield:h.shield,potion:h.healPotionCooldownRemaining||0})),actors:copy(actorCooldowns),supports:copy(supportCooldowns),clock:partyClock}:null;
    try{
      suppressSave=true;balanceBase(d,{persist:false});applyRules(d);
      if(next){
        party.buildSystem=next;
        for(const type of refundedGems)player().gems[type]++;
        for(const p of next.plans)if(p.job!==null)p.equipped=p.equipped.map((id,i)=>{const g=findGear(id);return g&&gearWearableJobs(g).includes(p.job)&&gearEquipPositions(g).includes(i)&&gearRequiredLevel(g)<=player().lv?id:null;});
        apply(plan());capture();resetBattleState();
      }
      if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
      suppressSave=previousSuppress;if(next&&save()===false)throw Error('無法儲存隊伍與平衡設定');
      if(party)render();return d;
    }catch(e){
      suppressSave=true;
      try{
        restoreRules(before);
        if(previousBuild){party.buildSystem=previousBuild;apply(plan());}
        if(party){if(previousGems)player().gems=previousGems;if(previousMarket===undefined)delete party.market;else party.market=previousMarket;}
        if(battle){party.members.forEach((h,i)=>{h.hp=battle.heroes[i].hp;h.shield=battle.heroes[i].shield;h.healPotionCooldownRemaining=battle.heroes[i].potion;});actorCooldowns=battle.actors;supportCooldowns=battle.supports;partyClock=battle.clock;}
        if(persist){if(previousCache===null)localStorage.removeItem(BALANCE_KEY);else localStorage.setItem(BALANCE_KEY,previousCache);}
      }
      finally{suppressSave=previousSuppress;}
      throw e;
    }
  };
  const resetBalanceBase=resetBalanceJSON;
  resetBalanceJSON=function(publishedDefaults){
    if(party&&!safe())return false;capture();
    const before=rollbackDocument(),oldBuild=build()?copy(build()):null,cache=localStorage.getItem(BALANCE_KEY),previousSuppress=suppressSave;
    const previousMarket=party?.market===undefined?undefined:copy(party.market);
    const vitals=party?.members.map(h=>({hp:h.hp,shield:h.shield,potion:h.healPotionCooldownRemaining||0})),actors=copy(actorCooldowns),supports=copy(supportCooldowns),clock=partyClock;
    try{
      suppressSave=true;resettingBalance=true;const out=publishedDefaults?(applyBalanceConfig(publishedDefaults,{persist:false}),localStorage.removeItem(BALANCE_KEY),true):resetBalanceBase(),d=M.normalizeDocument(exportableBalance());
      if(oldBuild){party.buildSystem=oldBuild;apply(plan());}
      resettingBalance=false;suppressSave=previousSuppress;applyBalanceConfig(d,{persist:false});return out;
    }catch(e){
      resettingBalance=false;suppressSave=true;
      try{
        restoreRules(before);if(oldBuild){party.buildSystem=oldBuild;apply(plan());}
        if(party){if(previousMarket===undefined)delete party.market;else party.market=previousMarket;}
        if(vitals){party.members.forEach((h,i)=>{h.hp=vitals[i].hp;h.shield=vitals[i].shield;h.healPotionCooldownRemaining=vitals[i].potion;});actorCooldowns=actors;supportCooldowns=supports;partyClock=clock;}
        if(cache===null)localStorage.removeItem(BALANCE_KEY);else localStorage.setItem(BALANCE_KEY,cache);
      }finally{suppressSave=previousSuppress;}
      toast('無法還原預設：'+e.message);if(party)render();return false;
    }finally{resettingBalance=false;suppressSave=previousSuppress;}
  };
  // Configuration-changing legacy entry points all use the same exploration gate.
  for(const name of ['equipSkill','clearActiveSkill','slotProcSkill','clearProcSkill','slotSupport','equipGear','equipSharedGear','unequipSharedGear','toggleMember','setPartnerEnlisted','confirmMemberReplacement','recruitCompanion','equipCompanionToken','unequipCompanionToken','devMasterySetLevel','devMasterySetExp','devMasterySet','devMasteryAdjust','devMasteryReset','devMasteryToggleCore','devMasteryToggleSupport','devMasteryWeapon']){
    const fn=globalThis[name];if(typeof fn!=='function')continue;globalThis[name]=function(...args){// v0.083: roster and companion-token changes follow gear and skills: allowed while exploring, frozen for the running encounter (battle-configuration.js), applied from the next one.
    const configuration=['equipGear','equipSharedGear','unequipSharedGear','equipSkill','clearActiveSkill','slotProcSkill','clearProcSkill','slotSupport','toggleMember','setPartnerEnlisted','confirmMemberReplacement','recruitCompanion','equipCompanionToken','unequipCompanionToken'].includes(name);if(!configuration&&!safe())return false;if(state===player()&&plan()?.job===null&&['equipSkill','slotProcSkill','slotSupport','equipGear','equipSharedGear'].includes(name)){toast('請先為本隊選擇主角職業');return false;}if(suppressSave)return fn(...args);let out;const ok=transaction(()=>{out=fn(...args);},{configuration});return ok?out:false;};
  }
  const battleBase=toggleBattle;toggleBattle=function(...args){if(!running&&!valid()){toast('請先選擇主角職業，並完成符合地圖門檻的隊伍編成');return false;}return battleBase(...args);};
  for(const name of ['startBossChallenge','restartExploration','devMasterySimulate']){
    const fn=globalThis[name];if(typeof fn!=='function')continue;
    globalThis[name]=function(...args){if(!valid()){toast('請先選擇主角職業，並完成符合地圖門檻的隊伍編成');return false;}return fn(...args);};
  }
  function resetBattleState(){
    running=false;if(roundIterator?.return)roundIterator.return();roundIterator=null;party.bossChallenge=null;resetEncounter();refillParty();mastery.resetBattleGain?.();
  }
  globalThis.stopTeamExploration=function(){
    if(!party)return false;running=false;if(roundIterator?.return)roundIterator.return();roundIterator=null;if(typeof activeBattleStat!=='undefined'&&activeBattleStat)finalizeBattleStatistics('abandoned');resetBattleState();save();render();return true;
  };
  function unlockSummary(j,kind,i){const r=kind==='core'?coreRule(j,i):supportRule(j,i),u=r.unlockConditions,parts=[],mapName=n=>n<0?'任意區域':(MAPS[n]?.name||('區域 '+n)),bossName=n=>n<0?'任意 BOSS':(MAPS[n]?.boss?.[0]||mapName(n)+' BOSS');if(u.classMasteryLevel)parts.push('職業精通 Lv'+u.classMasteryLevel);parts.push(...u.quests.map(q=>'任務 '+q),...u.materials.map(m=>m.name+' ×'+m.quantity),...u.bossKills.map(x=>'擊敗 '+bossName(x.mapIndex)+' ×'+x.count),...u.eliteKills.map(x=>'擊敗 '+mapName(x.mapIndex)+'菁英 ×'+x.count),...u.bossEquipment.map(x=>'持有 '+bossName(x.mapIndex)+'裝備 ×'+x.quantity));return parts;}
  globalThis.__EMBERWILD_TEAMS={build,plan,player,capture,apply,budgets,costs,busy,safe,savingSuppressed:()=>suppressSave,valid,refreshUnlocks,unlockMissing,unlockSummary,coreRule,supportRule,settings:()=>copy(cfg),validateBuild,resetBattleState};
  // Read the exact boot bytes after all late validators are installed.
  const boot=globalThis.__EMBERWILD_TEAM_BOOT_RAW;
  try{const d=M.normalizeDocument(JSON.parse(balanceSourceText()||'null')||baseExport());applyRules(d);Object.assign(GAMEPLAY_SETTINGS.progression.starting,d.balanceSettings.progression.starting);Object.assign(GAMEPLAY_SETTINGS.progression.levelRewards,d.balanceSettings.progression.levelRewards);GAMEPLAY_SETTINGS.meta.teamBuildVersion=M.VERSION;
    // The published loader rehydrates these exact bytes after every module is ready.
    if(boot&&!globalThis.__EMBERWILD_BALANCE_SOURCE)loadParty(JSON.parse(boot));else if(!boot&&party){migrate();apply(plan());}
    globalThis.__EMBERWILD_TEAM_READY=true;delete globalThis.__EMBERWILD_TEAM_BOOT_RAW;if(party)render();
  }catch(e){globalThis.__EMBERWILD_TEAM_READY=true;globalThis.__EMBERWILD_BOOT_SAVE_ERROR=e.message;console.warn('隊伍方案載入失敗；原始存檔保留',e);if(boot){state=null;party=null;globalThis.__EMBERWILD_BOOT_SAVE_RAW=boot;}render();}
})();
