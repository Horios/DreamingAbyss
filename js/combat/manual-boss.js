
/* Update 26: normal-map bosses are manual fixed stages unlocked by kill progress. */
(function installManualBossChallengeSystem(){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isFinalMapIndex=mi=>typeof worldIsFinalMap==='function'?worldIsFinalMap(mi):(GAMEPLAY_SETTINGS?.maps?.catalog?.[mi]?.mapType==='final'||mi===6);
  const mapConfig=mi=>typeof worldMapConfig==='function'?worldMapConfig(mi):GAMEPLAY_SETTINGS?.maps?.catalog?.[mi];
  const mapKey=mi=>String(mapConfig(mi)?.id||('map'+mi));

  GAMEPLAY_SETTINGS_DEFAULTS.monsters.bossMeter ??={normalProgress:1,eliteMultiplier:1.5,progressPerCharge:100,maxCharges:100,maxStageEnemies:20};
  GAMEPLAY_SETTINGS.monsters.bossMeter ??=clone(GAMEPLAY_SETTINGS_DEFAULTS.monsters.bossMeter);
  // Random BOSS chances are compatibility data only; manual challenges own spawning.
  GAMEPLAY_SETTINGS_DEFAULTS.monsters.encounter.bossChance=0;
  GAMEPLAY_SETTINGS.monsters.encounter.bossChance=0;

  function normalizeBossStageRow(m){
    if(!m||typeof m!=='object')return m;
    if(!Number.isInteger(m.bossStageCount)||m.bossStageCount<0)m.bossStageCount=m.kind==='normal'?0:1;
    m.bossStageCount=Math.max(0,Math.min(20,m.bossStageCount));
    if(!Number.isInteger(m.bossStageOrder)||m.bossStageOrder<0)m.bossStageOrder=m.kind==='normal'?10:100;
    m.bossStageOrder=Math.max(0,Math.min(999,m.bossStageOrder));
    m.bossStageElite=m.kind==='normal'&&m.bossStageElite===true;
    return m;
  }
  for(const m of GAMEPLAY_SETTINGS_DEFAULTS.monsters.catalog||[])normalizeBossStageRow(m);
  for(const m of GAMEPLAY_SETTINGS.monsters.catalog||[])normalizeBossStageRow(m);
  for(const m of GAMEPLAY_SETTINGS_DEFAULTS.maps?.catalog||[])if(m?.mapType!=='final')m.bossChance=0;
  for(const m of GAMEPLAY_SETTINGS.maps?.catalog||[])if(m?.mapType!=='final')m.bossChance=0;

  if(typeof normalizeGameplaySettings==='function'){
    const base=normalizeGameplaySettings;
    normalizeGameplaySettings=function(input){
      const prepared=clone(input||{});prepared.monsters??={};
      prepared.monsters.encounter={...(prepared.monsters.encounter||{}),bossChance:0};
      prepared.monsters.bossMeter={...clone(GAMEPLAY_SETTINGS_DEFAULTS.monsters.bossMeter),...(prepared.monsters.bossMeter||{})};
      if(Array.isArray(prepared.maps?.catalog))for(const m of prepared.maps.catalog)if(m?.mapType!=='final')m.bossChance=0;
      if(Array.isArray(prepared.monsters?.catalog))prepared.monsters.catalog=prepared.monsters.catalog.map(m=>normalizeBossStageRow({...m}));
      const cfg=base(prepared);cfg.monsters.bossMeter={...clone(GAMEPLAY_SETTINGS_DEFAULTS.monsters.bossMeter),...(cfg.monsters.bossMeter||{})};
      for(const m of cfg.maps?.catalog||[])if(m?.mapType!=='final')m.bossChance=0;
      for(const m of cfg.monsters?.catalog||[])normalizeBossStageRow(m);
      return cfg;
    };
  }

  if(typeof validateGameplaySettings==='function'){
    const base=validateGameplaySettings;
    validateGameplaySettings=function(cfg){
      cfg=base(cfg);const bm=cfg.monsters?.bossMeter||{};
      if(!Number.isFinite(bm.normalProgress)||bm.normalProgress<=0||!Number.isFinite(bm.eliteMultiplier)||bm.eliteMultiplier<=0||!Number.isFinite(bm.progressPerCharge)||bm.progressPerCharge<=0||!Number.isInteger(bm.maxCharges)||bm.maxCharges<1||bm.maxCharges>1000||!Number.isInteger(bm.maxStageEnemies)||bm.maxStageEnemies<1||bm.maxStageEnemies>100)throw Error('BOSS 進度規則無效');
      for(const row of cfg.monsters?.catalog||[]){
        normalizeBossStageRow(row);
        if(!Number.isInteger(row.bossStageCount)||row.bossStageCount<0||row.bossStageCount>20||!Number.isInteger(row.bossStageOrder)||row.bossStageOrder<0||row.bossStageOrder>999||typeof row.bossStageElite!=='boolean')throw Error('BOSS 關卡怪物設定無效：'+row.id);
      }
      const issues=EmberwildMonsterDesign.stageIssues(cfg.maps.catalog,cfg.monsters.catalog,bm.maxStageEnemies);if(issues.length)throw Error(issues.join("\n"));
      return cfg;
    };
  }

  function normalizeProgressEntry(raw){
    const bm=GAMEPLAY_SETTINGS.monsters.bossMeter,charges=Math.max(0,Math.min(bm.maxCharges,Math.floor(Number(raw?.charges)||0))),progress=Math.max(0,Math.min(bm.progressPerCharge,Number(raw?.progress)||0));
    return {progress:charges>=bm.maxCharges?0:progress,charges};
  }
  function normalizeBossProgress(raw){
    const out={};if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(let mi=0;mi<MAPS.length;mi++){const key=mapKey(mi);if(raw[key]!==undefined)out[key]=normalizeProgressEntry(raw[key]);}
    return out;
  }
  function bossProgressEntry(mi){
    if(!party)return {progress:0,charges:0};
    party.bossProgress??={};const key=mapKey(mi),normalized=normalizeProgressEntry(party.bossProgress[key]),existing=party.bossProgress[key];
    if(existing&&typeof existing==='object'&&!Array.isArray(existing)){existing.progress=normalized.progress;existing.charges=normalized.charges;return existing;}
    party.bossProgress[key]=normalized;return normalized;
  }
  globalThis.bossProgressEntry=bossProgressEntry;
  function normalizeChallenge(raw){
    if(!raw||typeof raw!=='object'||raw.active!==true)return null;
    const mi=Number.isInteger(raw.mapIndex)?raw.mapIndex:MAPS.findIndex((_,i)=>mapKey(i)===raw.mapId);
    if(mi<0||!MAPS[mi]||isFinalMapIndex(mi)||mapConfig(mi)?.bossEnabled===false)return null;
    return {active:true,mapIndex:mi,mapId:mapKey(mi),stagePaid:raw.stagePaid===true};
  }

  if(typeof createParty==='function'){const base=createParty;createParty=function(hero){const p=base(hero);p.bossProgress={};p.bossChallenge=null;return p;};}
  if(typeof validateParty==='function'){const base=validateParty;validateParty=function(data){const p=base(data);p.bossProgress=normalizeBossProgress(data?.bossProgress);p.bossChallenge=normalizeChallenge(data?.bossChallenge);return p;};}
  if(typeof packParty==='function'){const base=packParty;packParty=function(){const out=base();if(party){out.bossProgress=normalizeBossProgress(party.bossProgress);out.bossChallenge=normalizeChallenge(party.bossChallenge);}return out;};}

  function weightedPick(list,rng=Math.random){const total=list.reduce((n,m)=>n+Math.max(.0001,Number(m.spawnWeight)||1),0);let r=rng()*total;for(const m of list){r-=Math.max(.0001,Number(m.spawnWeight)||1);if(r<=0)return m;}return list[list.length-1];}
  if(typeof makeBaseEnemy==='function'){
    const base=makeBaseEnemy;
    makeBaseEnemy=function(map=state.map,h=state,rng=Math.random){
      const mc=mapConfig(map);if(!mc||mc.mapType==='final')return base(map,h,rng);
      const runtime=MAPS[map],cat=monsterCatalog(),normals=cat.filter(m=>m.mapIndex===map&&EmberwildMonsterDesign.roaming(m)),elites=normals.filter(m=>m.kind==='normal'&&m.eliteEnabled!==false);
      if(!normals.length)throw Error('地圖沒有啟用中的普通怪物：'+runtime.name);
      const eliteChance=mc.eliteEnabled&&elites.length?Math.max(0,Math.min(1,Number(mc.eliteChance)||0)):0,elite=rng()<eliteChance,row=weightedPick(elite?elites:normals,rng),kind=row.kind==='elite'||elite?'elite':'normal';
      const ahead=EmberwildProgression.encounterLevelLead(GAMEPLAY_SETTINGS,h.lv),maxLv=Math.min(runtime.max,h.lv+ahead),lv=runtime.min+Math.floor(rng()*Math.max(1,maxLv-runtime.min+1));
      const {hp,atk,def}=EmberwildProgression.baseMonsterStats(GAMEPLAY_SETTINGS,lv,kind,row);
      return {name:(kind==='elite'?'菁英・':'')+row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind,turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race};
    };
  }

  function addBossProgress(e){
    if(!party||!e||e.bossChallenge||!['normal','elite'].includes(e.kind))return;
    const mi=Number.isInteger(e.region)?e.region:party.map,mc=mapConfig(mi);if(!mc||mc.mapType==='final'||mc.bossEnabled===false)return;
    const bm=GAMEPLAY_SETTINGS.monsters.bossMeter,entry=bossProgressEntry(mi);if(entry.charges>=bm.maxCharges)return;
    entry.progress+=bm.normalProgress*(e.kind==='elite'?bm.eliteMultiplier:1);let gained=0;
    while(entry.progress+1e-9>=bm.progressPerCharge&&entry.charges<bm.maxCharges){entry.progress-=bm.progressPerCharge;entry.charges++;gained++;}
    if(entry.charges>=bm.maxCharges)entry.progress=0;entry.progress=Math.max(0,Math.round(entry.progress*1000)/1000);
    if(gained)note(`BOSS 挑戰次數 +${gained}（目前 ${entry.charges}/${bm.maxCharges}）`);
  }
  if(typeof rewardGroupKill==='function'){const base=rewardGroupKill;rewardGroupKill=function(e){const eligible=!!e&&!e.rewarded,result=base(e);if(eligible&&e.rewarded)addBossProgress(e);return result;};}

  function enemyFromStageRow(row,mi,h,kind,order){
    const runtime=MAPS[mi],mode=h.difficulty||0,ahead=EmberwildProgression.encounterLevelLead(GAMEPLAY_SETTINGS,h.lv);
    const maxLv=Math.max(runtime.min,Math.min(runtime.max,h.lv+ahead)),lv=kind==='boss'?runtime.max:runtime.min+Math.floor(Math.random()*Math.max(1,maxLv-runtime.min+1));
    const {hp,atk,def}=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,lv,kind,mode,row);
    return {name:(kind==='elite'?'菁英・':'')+row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind,turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race,difficulty:mode,region:mi,bossChallenge:true,stageOrder:order};
  }
  function configuredBossStageRows(mi,rng=Math.random,options={}){
    return EmberwildMonsterDesign.stageRows(GAMEPLAY_SETTINGS.maps.catalog,monsterCatalog(),mi,rng,options);
  }
  globalThis.configuredBossStageRows=configuredBossStageRows;

  function clearEncounter(){foes=[];enemy=null;effects=[];actorCooldowns={};supportCooldowns={};round=0;for(const h of heroes())h.shield=0;}
  function spawnBossStage(){
    const ch=party?.bossChallenge;if(!ch?.active)return false;const mi=ch.mapIndex,entry=bossProgressEntry(mi);
    if(!ch.stagePaid){if(entry.charges<1){party.bossChallenge=null;clearEncounter();return false;}entry.charges--;ch.stagePaid=true;note(`進入 ${MAPS[mi].name} BOSS 關卡，消耗 1 次挑戰（剩餘 ${entry.charges}）。`);}
    const weak=[...heroes()].sort((a,b)=>a.lv-b.lv)[0],rows=configuredBossStageRows(mi);refillParty();clearEncounter();
    for(const spec of rows)for(let i=0;i<spec.count;i++){const e=enemyFromStageRow(spec.row,mi,weak,spec.kind,spec.order);e.id='foe-'+uid();e.rewarded=false;foes.push(e);}
    enemy=foes.find(e=>e.hp>0)||null;if(typeof beginBattleStatistics==='function')beginBattleStatistics();note(`BOSS 關卡開始：${foes.length} 隻敵人。`);return true;
  }
  if(typeof spawnGroup==='function'){const base=spawnGroup;spawnGroup=function(){if(party?.bossChallenge?.active&&!isFinalMapIndex(party.map)&&spawnBossStage())return;return base();};}

  globalThis.startBossChallenge=function(){
    if(!party||party.bossChallenge?.active||isFinalMapIndex(party.map))return;const mc=mapConfig(party.map),entry=bossProgressEntry(party.map);
    if(mc?.bossEnabled===false)return toast('此地圖的 BOSS 挑戰已停用');if(entry.charges<1)return toast('尚未累積 BOSS 挑戰次數');
    resetEncounter();running=true;party.bossChallenge={active:true,mapIndex:party.map,mapId:mapKey(party.map),stagePaid:false};spawnBossStage();save();render();
  };
  globalThis.leaveBossChallenge=function(){
    if(!party?.bossChallenge?.active)return;const mi=party.bossChallenge.mapIndex;party.bossChallenge=null;resetEncounter();refillParty();running=true;note(`已離開 ${MAPS[mi]?.name||'目前地圖'} 的 BOSS 關卡，返回一般探索。`);save();render();
  };
  if(typeof chooseMap==='function'){const base=chooseMap;chooseMap=function(mi){if(party?.bossChallenge?.active&&mi!==party.map)party.bossChallenge=null;return base(mi);};}

  function completeAttempt(){
    const ch=party?.bossChallenge;if(!ch?.active||!ch.stagePaid)return;const mi=ch.mapIndex,entry=bossProgressEntry(mi);globalThis.recordMapClear?.(mi);ch.stagePaid=false;refillParty();clearEncounter();
    if(entry.charges>0){running=true;note(`BOSS 關卡完成。仍有 ${entry.charges} 次挑戰，將自動進入下一場。`);}else{party.bossChallenge=null;running=true;note('BOSS 挑戰次數已用完，返回目前地圖繼續一般探索。');}
    save();if(tab==='battle'||!isEditingControl())render();else refreshGlobalJournal();
  }
  if(typeof pacedRound==='function'){const base=pacedRound;pacedRound=function*(){const was=!!party?.bossChallenge?.active;yield* base();if(was&&party?.bossChallenge?.active&&party.bossChallenge.stagePaid&&foes.length&&foes.every(e=>e.hp<=0)&&foes.some(e=>e.bossChallenge))completeAttempt();};}

  function panel(mi){
    const mc=mapConfig(mi);if(!mc||mc.mapType==='final')return '';const bm=GAMEPLAY_SETTINGS.monsters.bossMeter,entry=bossProgressEntry(mi),active=party?.bossChallenge?.active&&party.bossChallenge.mapIndex===mi,pct=entry.charges>=bm.maxCharges?100:Math.max(0,Math.min(100,entry.progress/bm.progressPerCharge*100)),enabled=mc.bossEnabled!==false;
    const total=enabled?(mc.bossStageMode==='random'?mc.bossStageRandomCount:configuredBossStageRows(mi,Math.random,{preview:true}).reduce((n,x)=>n+x.count,0)):0;
    return `<section class="panel boss-meter-panel"><div class="row"><div><span class="eyebrow">BOSS CHALLENGE</span><h3>${active?'BOSS 關卡進行中':'區域 BOSS 進度'}</h3></div><span class="tag">挑戰次數 ${entry.charges}/${bm.maxCharges}</span></div><div style="height:8px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin:8px 0"><div style="height:100%;width:${pct}%;background:currentColor;opacity:.7"></div></div><p class="small">${enabled?`進度 ${Math.round(entry.progress*100)/100}/${bm.progressPerCharge}% · 普通怪 +${bm.normalProgress}% · 菁英 ×${bm.eliteMultiplier} · 關卡 ${total} 隻`:'此地圖的 BOSS 挑戰已停用。'}</p><div class="actions">${active?`<button class="danger" onclick="leaveBossChallenge()">離開 BOSS 關卡</button><span class="small">離開會放棄目前已消耗的一次；尚未消耗的次數保留。</span>`:`<button class="primary" onclick="startBossChallenge()" ${!enabled||entry.charges<1?'disabled':''}>挑戰 BOSS</button><span class="small">會連續消耗已累積次數；次數用完自動回到一般探索。</span>`}</div></section>`;
  }
  if(typeof battleView==='function'){const base=battleView;battleView=function(){let html=base();if(!party||isFinalMapIndex(party.map))return html;const active=party.bossChallenge?.active&&party.bossChallenge.mapIndex===party.map;if(active){const total=(mapConfig(party.map).bossStageMode==='random'?mapConfig(party.map).bossStageRandomCount:configuredBossStageRows(party.map,Math.random,{preview:true}).reduce((n,x)=>n+x.count,0));html=html.replace(/群怪 · [^<]+/,`BOSS 關卡 · ${total} 隻`);}const p=panel(party.map),mark='<div class="text-battle-layout">';return html.includes(mark)?html.replace(mark,p+mark):p+html;};}

  if(typeof showRegionBestiary==='function'){
    const base=showRegionBestiary;
    showRegionBestiary=function(){
      if(!party||isFinalMapIndex(party.map))return base();const mi=party.map,m=MAPS[mi],mc=mapConfig(mi),cat=monsterCatalog(),normals=cat.filter(x=>x.mapIndex===mi&&['normal','elite'].includes(x.kind)),stage=configuredBossStageRows(mi,Math.random,{preview:true});
      const roaming=normals.filter(x=>x.enabled!==false).map(x=>`<p><b>${esc(x.name)}</b> · ${ELEMENTS[x.element]}／${RACES[x.race]}${x.eliteEnabled!==false?' · 可出現菁英':''}<br>${x.kind==='elite'?'菁英':'普通'} ${configuredDropDescription(x,x.kind,mi)}${x.eliteEnabled!==false?'<br>菁英 '+configuredDropDescription(x,'elite',mi):''}</p>`).join('');
      const stageHtml=stage.map(x=>`<p><b>${esc(x.row.name)}</b> <span class="tag">${x.kind==='boss'?'BOSS':x.kind==='elite'?'菁英隨從':'普通隨從'}${x.count>1?' ×'+x.count:''}</span> · 隊列 ${x.order}<br>${configuredDropDescription(x.row,x.kind,mi)}</p>`).join('');
      $('modal').innerHTML=`<h2>${esc(m.name)} · 怪物與掉落</h2><h3>一般探索</h3>${roaming||'<p class="small">沒有啟用中的普通怪物。</p>'}<h3>BOSS 關卡${mc?.bossStageMode==='random'?'（隨機候選池，每場 '+mc.bossStageRandomCount+' 隻）':'（固定陣容）'} ${mc?.bossEnabled===false?'<span class="tag">已停用</span>':''}</h3>${stageHtml}<button onclick="closeModal()">關閉</button>`;$('modal').showModal();
    };
  }
  if(typeof exportableBalance==='function'){const base=exportableBalance;exportableBalance=function(){const out=base();out.notes=[...(out.notes||[]),'一般地圖不再隨機遭遇 BOSS；普通／菁英擊殺累積 monsters.bossMeter 進度，滿 progressPerCharge 後增加 1 次 BOSS 挑戰。','一般地圖 BOSS 關卡以 bossStageCount / bossStageElite / bossStageOrder 自訂隨從；BOSS 可配置多種變體；maps.catalog.bossStageMode=fixed/random，隨機模式以 bossStageRandomCount 決定出場數，依 spawnWeight 抽取且至少包含一名 BOSS。'];return out;};}

  if(typeof guideView==='function'){
    const bossMeterGuideBase=guideView;
    guideView=function(){
      const b=GAMEPLAY_SETTINGS.monsters.bossMeter;
      return `<section class="panel"><h2>BOSS 挑戰進度</h2><p>一般地圖不會隨機遭遇 BOSS。擊敗普通怪增加 ${b.normalProgress}% 進度，菁英怪為 ×${b.eliteMultiplier}；每累積 ${b.progressPerCharge}% 會存入 1 次 BOSS 挑戰，最多可保留 ${b.maxCharges} 次。</p><p>可在探索頁手動進入目前地圖的 BOSS 關卡。每個地區的 BOSS 關卡有各自的敵人編成；若還有累積次數，完成後會自動進入下一場。次數用完會返回原地圖繼續一般探索，也可隨時手動離開；離開會放棄目前已消耗的一次挑戰。</p></section>`+bossMeterGuideBase();
    };
  }

  try{
    GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;if(typeof applyGameplaySettingsSideEffects==='function')applyGameplaySettingsSideEffects();
    if(party){party.bossProgress=normalizeBossProgress(party.bossProgress);party.bossChallenge=normalizeChallenge(party.bossChallenge);}
    // The published loader restores the original save after the complete module chain.
    const raw=globalThis.__EMBERWILD_BOOT_SAVE_RAW??localStorage.getItem(KEY);if(raw&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)){loadParty(JSON.parse(raw));party.bossProgress=normalizeBossProgress(party.bossProgress);party.bossChallenge=normalizeChallenge(party.bossChallenge);save();}
  }catch(e){console.warn('BOSS 進度／挑戰系統初始化失敗',e);}
  render();
})();
