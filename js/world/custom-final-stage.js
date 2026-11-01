
/* Update 25: final maps are fixed, configurable boss stages. They may contain one final boss plus configured normal/elite adds. */
(function installCustomFinalStageRuntime(){
  const isFinal=mi=>typeof isFinalMap==='function'?isFinalMap(mi):(typeof worldIsFinalMap==='function'?worldIsFinalMap(mi):mi===6);
  const gateIndex=()=>typeof worldProgressionGateIndex==='function'?worldProgressionGateIndex():6;
  const isGate=mi=>isFinal(mi)&&mi===gateIndex();
  const clampInt=(v,lo,hi,def)=>Number.isInteger(v)?Math.max(lo,Math.min(hi,v)):def;
  function normalizeStageRow(m){
    if(!m||typeof m!=='object')return m;
    m.stageCount=clampInt(m.stageCount,1,20,1);
    m.stageOrder=clampInt(m.stageOrder,0,999,m.kind==='normal'?10:100);
    m.stageElite=m.kind==='normal'&&m.stageElite===true;
    return m;
  }
  for(const m of GAMEPLAY_SETTINGS_DEFAULTS.monsters.catalog||[])normalizeStageRow(m);
  for(const m of GAMEPLAY_SETTINGS.monsters.catalog||[])normalizeStageRow(m);

  const stageValidateBase=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    cfg=stageValidateBase(cfg);
    for(const m of cfg.monsters.catalog||[]){
      normalizeStageRow(m);
      if(!Number.isInteger(m.stageCount)||m.stageCount<1||m.stageCount>20||!Number.isInteger(m.stageOrder)||m.stageOrder<0||m.stageOrder>999||typeof m.stageElite!=='boolean')throw Error('終局關卡怪物設定無效：'+m.id);
    }
    for(let mi=0;mi<(cfg.maps?.catalog?.length||0);mi++)if(cfg.maps.catalog[mi]?.mapType==='final'){
      const rows=cfg.monsters.catalog.filter(m=>m.mapIndex===mi),bosses=rows.filter(m=>m.kind==='final'),adds=rows.filter(m=>['normal','elite'].includes(m.kind)&&m.enabled!==false);
      if(bosses.length!==1)throw Error('終局地圖必須恰好有 1 名最終首領：'+cfg.maps.catalog[mi].name);
      const total=1+adds.reduce((n,m)=>n+m.stageCount,0);
      if(total<1||total>20)throw Error('終局關卡總敵人數必須為 1～20：'+cfg.maps.catalog[mi].name);
    }
    return cfg;
  };

  function stageEnemyFromRow(row,mi,h,kind){
    const runtime=MAPS[mi],ahead=EmberwildProgression.encounterLevelLead(GAMEPLAY_SETTINGS,h.lv);
    const maxLv=Math.max(runtime.min,Math.min(runtime.max,h.lv+ahead)),lv=runtime.min+Math.floor(Math.random()*Math.max(1,maxLv-runtime.min+1));
    const mode=h.difficulty||0,{hp,atk,def}=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,lv,kind,mode,row);
    return {name:(kind==='elite'?'菁英・':'')+row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind,turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race,difficulty:mode,region:mi,stageOrder:row.stageOrder};
  }
  function finalBossFromRow(row,mi,h){
    const f=GAMEPLAY_SETTINGS.monsters.finalBoss,mc=worldMapConfig(mi),lv=mc?.progressionGate===true?Math.round(f.level):Math.round(MAPS[mi].max),mode=h.difficulty||0;
    const {hp,atk,def}=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,lv,'final',mode,row);
    return {name:row.name,icon:'',mat:row.material,lv,hp,maxhp:hp,atk,def,kind:'final',turn:0,monsterId:row.id,maxDrops:row.maxDrops,element:row.element,race:row.race,difficulty:mode,region:mi,stageOrder:row.stageOrder};
  }
  function configuredStageRows(mi){
    const cat=monsterCatalog(),boss=cat.find(m=>m.mapIndex===mi&&m.kind==='final'),adds=cat.filter(m=>m.mapIndex===mi&&['normal','elite'].includes(m.kind)&&m.enabled!==false);
    if(!boss)throw Error('終局首領未設定');
    const rows=[{row:boss,kind:'final',count:1,order:boss.stageOrder??100}];
    for(const row of adds)rows.push({row,kind:row.kind==='elite'||row.stageElite?'elite':'normal',count:row.stageCount??1,order:row.stageOrder??10});
    return rows.sort((a,b)=>a.order-b.order||((a.kind==='final')-(b.kind==='final'))||a.row.id.localeCompare(b.row.id));
  }
  globalThis.configuredFinalStageRows=configuredStageRows;

  const customStageSpawnBase=spawnGroup;
  spawnGroup=function(){
    if(!party||!isFinal(party.map))return customStageSpawnBase();
    const weak=[...heroes()].sort((a,b)=>a.lv-b.lv)[0],rows=configuredStageRows(party.map);
    foes=[];effects=[];actorCooldowns={};supportCooldowns={};for(const h of heroes())h.shield=0;
    for(const spec of rows)for(let i=0;i<spec.count;i++){
      const e=spec.kind==='final'?finalBossFromRow(spec.row,party.map,weak):stageEnemyFromRow(spec.row,party.map,weak,spec.kind);
      e.id='foe-'+uid();e.rewarded=false;foes.push(e);
    }
    enemy=foes.find(e=>e.hp>0)||null;round=0;globalThis.__EMBERWILD_FINAL_STAGE_CLEARED=false;
    if(typeof beginBattleStatistics==='function')beginBattleStatistics();
    
    const adds=foes.length-1;note(adds?`遭遇終局關卡：1 名首領與 ${adds} 隻隨從。`:'遭遇終局首領。');
  };

  // A final boss can die before its adds. Grant its normal drops immediately,
  // but defer progression-clear side effects until the entire fixed stage is dead.
  if(typeof rewardGroupKill==='function'){
    const customStageRewardBase=rewardGroupKill;
    rewardGroupKill=function(e){
      if(!e||e.rewarded||e.kind!=='final'||!isFinal(e.region??party?.map??state?.map??0))return customStageRewardBase(e);
      const beforeRunning=running,beforeCleared=party?.cleared,heroState=party?party.members.map(h=>({h,won:h.won,modeClears:[...(h.modeClears||[])]})):[];
      const result=customStageRewardBase(e);
      if(party){party.cleared=beforeCleared;for(const x of heroState){x.h.won=x.won;x.h.modeClears=[...x.modeClears];}}
      running=beforeRunning;if($('modal')?.open)closeModal();return result;
    };
  }

  function completeFinalStage(mi){
    if(globalThis.__EMBERWILD_FINAL_STAGE_CLEARED)return;
    globalThis.__EMBERWILD_FINAL_STAGE_CLEARED=true;
    const boss=foes.find(e=>e.kind==='final'),mode=boss?.difficulty??state.difficulty??0,d=MODES[mode],gate=isGate(mi),firstClear=gate&&!party.cleared,before=Math.floor(GS('progression.levelCaps.beforeClear',30));
    globalThis.expeditionChallengeResult={name:MAPS[mi]?.name||'終局關卡',success:true};running=false;refillParty();
    globalThis.recordMapClear?.(mi);
    if(gate){party.cleared=true;for(const h of heroes()){h.modeClears[mode]=(h.modeClears[mode]||0)+1;if(h.lv>=before)h.won=true;}}
    note(`終局關卡「${MAPS[mi]?.name||'未命名'}」已完成。`);
    if(!partyBusy){const title=gate?(firstClear?'等級界限已突破':'再次完成突破關卡'):'終局關卡已完成',body=gate?(firstClear?'等級上限提升，通關後區域已解鎖。':'可繼續探索通關後區域，或挑戰其他終局地圖。'):`已擊敗首領與所有隨從，完成「${MAPS[mi]?.name||'終局地圖'}」。此關卡不會改變等級上限。`;$('modal').innerHTML=`<h1>${title}</h1><p>${esc(body)}</p><button class="primary" onclick="closeModal()">繼續旅程</button>`;$('modal').showModal();}
    save();if(tab==='battle'||!isEditingControl())render();else refreshGlobalJournal();
  }

  globalThis.EmberwildFinalEncounter={complete:completeFinalStage,fail(mi){globalThis.expeditionChallengeResult={name:MAPS[mi]?.name||'終局關卡',success:false};}};
  if(typeof pacedRound==='function'){
    const customStagePacedBase=pacedRound;
    pacedRound=function*(){
      const finalAttempt=party&&isFinal(party.map)&&running;
      yield* customStagePacedBase();
      if(finalAttempt&&party&&!running&&!foes.length){globalThis.expeditionChallengeResult={name:MAPS[party.map]?.name||'終局關卡',success:false};save();render();}
      if(party&&isFinal(party.map)&&foes.length&&foes.some(e=>e.kind==='final')&&foes.every(e=>e.hp<=0))completeFinalStage(party.map);
    };
  }
  if(typeof resetEncounter==='function'){
    const customStageResetBase=resetEncounter;
    resetEncounter=function(){globalThis.__EMBERWILD_FINAL_STAGE_CLEARED=false;return customStageResetBase();};
  }

  if(typeof battleView==='function'){
    const customStageBattleBase=battleView;
    battleView=function(){let html=customStageBattleBase();if(!party||!isFinal(party.map))return html;const rows=configuredStageRows(party.map),total=rows.reduce((n,x)=>n+x.count,0),adds=total-1;html=html.replace(/終局首領 · 1 隻/g,`終局關卡 · ${total} 隻`).replace(/尚無遭遇<br>開始探索即挑戰此地圖的終局首領。/g,adds?`尚無遭遇<br>開始探索即挑戰 1 名首領與 ${adds} 隻隨從。`:'尚無遭遇<br>開始探索即挑戰此地圖的終局首領。');return html;};
  }
  if(typeof guideView==='function'){
    const customStageGuideBase=guideView;
    guideView=function(){let html=customStageGuideBase();html=html.replace(/終局地圖固定只生成一名終局首領[^<]*/g,'終局地圖為固定關卡編成：必須有 1 名終局首領，也可配置普通或菁英隨從、數量與集火隊列。');return html;};
  }
  if(typeof showRegionBestiary==='function'){
    const customStageBestiaryBase=showRegionBestiary;
    showRegionBestiary=function(){
      if(!party||!isFinal(party.map))return customStageBestiaryBase();
      const mi=party.map,m=MAPS[mi],rows=configuredStageRows(mi),parts=rows.map(x=>{const r=x.row,label=x.kind==='final'?'最終首領':x.kind==='elite'?'菁英隨從':'普通隨從';return `<p><b>${esc(r.name)}</b> <span class="tag">${label}${x.count>1?' ×'+x.count:''}</span> · ${ELEMENTS[r.element]}／${RACES[r.race]}<br>${configuredDropDescription(r,x.kind,mi)} · 隊列 ${x.order}</p>`;}).join('');$('modal').innerHTML=`<h2>${esc(m.name)} · 終局關卡編成</h2>${parts}<button onclick="closeModal()">關閉</button>`;$('modal').showModal();
    };
  }
  if(typeof note==='function'){
    const customStageNoteBase=note;
    note=function(text,type){if(party&&isFinal(party.map)&&/^噬日者已倒下！/.test(String(text)))return;return customStageNoteBase(text,type);};
  }
  if(typeof exportableBalance==='function'){
    const customStageExportBase=exportableBalance;
    exportableBalance=function(){const out=customStageExportBase();out.notes=[...(out.notes||[]),'final 地圖可包含 1 名 final 首領與任意 normal 小怪；normal 小怪以 stageCount、stageElite、stageOrder 組成固定關卡。','final 關卡只有在首領與全部隨從都被擊敗後才算完成；提前擊殺首領不會提前解鎖 progressionGate。'];return out;};
  }

  // Normalize the already-loaded settings once so older JSON gains stage defaults.
  try{GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;if(typeof applyGameplaySettingsSideEffects==='function')applyGameplaySettingsSideEffects();}catch(e){console.warn('終局關卡設定初始化失敗',e);}
  if(state)render();
})();
