/* Retain the complete quest design document through legacy balance normalizers. */
(()=>{
  const M=EmberwildQuestDesign,copy=M.copy;
  const context=()=>({mapCount:GAMEPLAY_SETTINGS.maps.catalog.length,items:SHOP});
  const stored=balanceSourceText();
  let saved=null;try{saved=stored?JSON.parse(stored).balanceSettings?.quests:null;}catch(e){console.warn('委託設定無法讀取，保留原始文字並使用內建設計',e);}
  GAMEPLAY_SETTINGS_DEFAULTS.quests.design=M.defaults(GAMEPLAY_SETTINGS_DEFAULTS.quests);
  try{GAMEPLAY_SETTINGS.quests.design=M.validate(saved?.design??M.defaults(saved||GAMEPLAY_SETTINGS.quests),context());}
  catch(e){console.warn('委託設計無效，保留原資料並使用內建設計',e);GAMEPLAY_SETTINGS.quests.design=M.defaults(GAMEPLAY_SETTINGS.quests);}
  const normalizeBase=normalizeGameplaySettings;
  normalizeGameplaySettings=function(input){
    const design=copy(input?.quests?.design??M.defaults(input?.quests||GAMEPLAY_SETTINGS_DEFAULTS.quests));
    const cfg=normalizeBase(input),ctx={mapCount:cfg.maps.catalog?.length??MAPS.length};
    cfg.quests.design=M.validate(design,ctx);return cfg;
  };
  const validateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const out=validateBase(input),quests=out.balanceSettings.quests;
    // Reset snapshots precede dynamic world/settings modules; their missing extensions
    // are hydrated by the existing apply chain after this early validation pass.
    const candidate=input.balanceSettings?.quests?.design??quests.design??M.defaults(quests);
    quests.design=M.validate(candidate,{mapCount:out.balanceSettings.maps.catalog?.length??input.balanceSettings?.maps?.catalog?.length??MAPS.length,items:normalizeDescriptionBalance(out).items});return out;
  };
  const referenceBase=balanceReference;
  balanceReference=function(){const out=referenceBase();out.balancePaths['balanceSettings.quests.design']='每日委託池與一次性支線的唯一有效設計來源。每日隨機五項、完成上限四項；台灣午夜更新；當日委託保存需求／獎勵快照。進度型需求採累計紀錄。';for(const path of ['quests.board','quests.repeat','quests.side'])out.legacySettings['balanceSettings.'+path]={status:'deprecated',replacement:'balanceSettings.quests.design',note:'僅作舊 JSON 遷移，新設計器使用穩定任務 ID。'};return out;};
  const sideEffectsBase=applyGameplaySettingsSideEffects;
  applyGameplaySettingsSideEffects=function(){sideEffectsBase();syncQuestCatalog();};
  function syncQuestCatalog(){
    const design=GAMEPLAY_SETTINGS.quests.design;if(!design)return;
    QUESTS.splice(0,QUESTS.length,...design.side.map(q=>({id:q.id,title:q.title,desc:q.description,mat:q.objectives[0]?.key,n:q.objectives[0]?.quantity,gold:q.rewards.gold,ore:q.rewards.ore})));
  }
  syncQuestCatalog();
  globalThis.__EMBERWILD_GAMEPLAY_SETTINGS=GAMEPLAY_SETTINGS;
})();
