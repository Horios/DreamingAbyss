/* Save progress and source documentation for the LV1–60 curves. */
(()=>{
  const copy=v=>JSON.parse(JSON.stringify(v));
  // "Built-in" means the published curve (the model default only when nothing is published). Comparing with the
  // model default stopped matching once the published curve was tuned (v0.051), so v1 saves were never migrated.
  const builtinCurve=()=>globalThis.__EMBERWILD_PUBLISHED_BALANCE?.balanceSettings?.progression?.xpCurve||EmberwildProgression.defaults.settings.progression.xpCurve;
  const sameBuiltinCurve=()=>{const want=builtinCurve(),now=GAMEPLAY_SETTINGS.progression.xpCurve;return Object.keys(want).every(k=>now?.[k]===want[k])&&GS('skills.mastery.characterXpMultiplier',1)===1;};
  const legacyNeed=l=>Math.max(1,Math.round(Math.round((45+l*18+l*l*2)*(2.2+l*.16))*1.35));
  const builtinLegacy=data=>data?.progressionXpRequirements===undefined&&data?.progressionCurveVersion===undefined&&sameBuiltinCurve()&&!localStorage.getItem(BALANCE_KEY);
  function migrateProgress(data){
    const out=copy(data);if(!Array.isArray(out?.members))return out;
    const snapshot=out.progressionXpRequirements;
    if(snapshot!==undefined&&(!Array.isArray(snapshot)||snapshot.length!==out.members.length||snapshot.some(n=>!Number.isSafeInteger(n)||n<=0)))throw Error('存檔 EXP 曲線快照無效');
    const legacy=builtinLegacy(out);
    out.members.forEach((h,i)=>{
      const before=snapshot?.[i]??(legacy?legacyNeed(h.lv):need(h.lv)),after=need(h.lv);
      if(before!==after)h.xp=Math.max(0,Math.floor(Math.min(.999999,Math.max(0,h.xp)/before)*after));
    });
    out.progressionCurveVersion=2;out.progressionXpRequirements=out.members.map(h=>need(h.lv));return out;
  }
  const packBase=packParty;
  packParty=function(){const out=packBase();if(out){out.progressionCurveVersion=2;out.progressionXpRequirements=out.members.map(h=>need(h.lv));}return out;};
  const loadBase=loadParty;
  loadParty=function(data){const legacy=builtinLegacy(data),out=loadBase(migrateProgress(data));if(legacy)refillParty();return out;};
  // The core loader runs before the last growth modules have been installed.
  // A built-in v1 save gets one refill because HP uses a larger scale in v2.
  if(party){const legacy=builtinLegacy(party),migrated=migrateProgress(party);party.members.forEach((h,i)=>h.xp=migrated.members[i].xp);party.progressionCurveVersion=2;party.progressionXpRequirements=migrated.progressionXpRequirements;if(legacy)refillParty();}
  const validateBase=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    const out=validateBase(cfg),x=out.rewards.xp.kindMultiplier;
    if(!x||['normal','elite','boss'].some(k=>!Number.isFinite(x[k])||x[k]<=0))throw Error('EXP 遭遇倍率必須大於 0');
    if(out.difficulty.modes.some(d=>!Number.isFinite(d.xpMultiplier)||d.xpMultiplier<=0))throw Error('難度 EXP 倍率必須大於 0');
    for(const field of ['flatStatsPerLevel','flatStatsPerEquipmentLevel'])if(['atk','hp','def'].some(k=>!Number.isFinite(out.equipment.enhance[field]?.[k])||out.equipment.enhance[field][k]<0))throw Error('裝備精煉成長必須為非負有限數值');
    const p=out.progression.xpLevelGap;
    if(!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.freeLevels)||p.freeLevels<0||!Number.isInteger(p.midGap)||p.midGap<=p.freeLevels||!Number.isInteger(p.highGap)||p.highGap<=p.midGap||![p.midMultiplier,p.highMultiplier,p.minimumMultiplier].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isInteger(p.zeroGap)||p.zeroGap<=p.highGap||p.highMultiplier>p.midMultiplier||p.minimumMultiplier>p.highMultiplier)throw Error('經驗等級差懲罰設定無效');
    const interval=out.monsters.encounter.levelLeadInterval;
    if(!Number.isInteger(interval)||interval<0||interval>60)throw Error('怪物領先等級間隔必須為 0～60 整數');
    for(const [path,min] of [['rewards.xp.base',0],['rewards.xp.perLevel',0],['progression.xpCurve.base',0],['progression.xpCurve.linear',0],['progression.xpCurve.quadratic',0],['progression.xpCurve.multiplierBase',.000001],['progression.xpCurve.multiplierPerLevel',0]])if(!Number.isFinite(gameplayAt(out,path))||gameplayAt(out,path)<min)throw Error('成長／EXP 設定無效：'+path);
    return out;
  };
  const referenceBase=balanceReference;
  balanceReference=function(){
    const out=referenceBase();out.balancePaths??={};out.legacySettings??={};
    Object.assign(out.balancePaths,{
      'balanceSettings.equipment.enhance.flatStatsPerLevel':'LV1 裝備每次精煉固定增加的 atk/hp/def。只增加基底原有屬性，累計精煉等級後取整。',
      'balanceSettings.equipment.enhance.flatStatsPerEquipmentLevel':'每增加 1 裝備需求等級，每次精煉再增加的固定 atk/hp/def；與 flatStatsPerLevel 相加。不受 T 級、基底數值或角色等級影響。',
      'classes[].initialStats':'LV1 裸裝自然能力，與舊 hp/atk/def 同步。',
      'classes[].growthPerLevel':'各職業每級自然增加量；HP／攻擊／防禦取整。',
      'classes[].growthSteps':'整數階梯：每 every 級額外增加 hp/atk/def；以 (LV−1) 計算。',
      'balanceSettings.rewards.xp.kindMultiplier':'EXP 專用普通／菁英／BOSS 倍率；final 沿用 boss。',
      'balanceSettings.rewards.kindMultiplier':'金幣等既有獎勵的遭遇倍率；EXP 使用 rewards.xp.kindMultiplier。',
      'balanceSettings.difficulty.modes[].xpMultiplier':'EXP 專用難度倍率；reward 仍控制金幣等既有獎勵。',
      'balanceSettings.monsters.encounter.levelLeadInterval':'怪物每此間隔可領先 1 級，最多 progression.mapAheadAllowance 級；0 沿用固定上限。只限制隨機怪物等級，BOSS 固定為地圖上限。',
      'balanceSettings.progression.xpCurve':'升級需求多項式；LV30 與 LV45 後的逐級增額由 latePerLevel/endPerLevel 管理，夥伴等級同步主角。',
      'balanceSettings.progression.xpLevelGap':'主角高於怪物的 EXP 階段式懲罰：midGap 起乘 midMultiplier、highGap 起乘 highMultiplier、zeroGap 起為 0，freeLevels 內不扣減。',
      'balanceSettings.rewards.gold':'金幣採獨立曲線和各怪物種類倍率，不共用 EXP。',
      'balanceSettings.difficulty.modes[].goldMultiplier':'各難度獨立金幣倍率。',
      'balanceSettings.drops.levelGap':'一般怪／菁英怪常見掉落依玩家與怪物級差衰減，劇情與 BOSS 素材豁免。'
    });
    out.legacySettings['balanceSettings.equipment.enhance.statPerLevel']={status:'tokens-only',replacement:'balanceSettings.equipment.enhance.flatStatsPerLevel',note:'只保留信物百分比強化；一般裝備、BOSS 裝及新手裝使用固定值精煉。'};
    out.legacySettings['balanceSettings.progression.statsPerLevel']={status:'fallback',replacement:'classes[].growthPerLevel',note:'只有缺少該職業獨立成長的舊 JSON 使用。'};
    return out;
  };
  globalThis.__EMBERWILD_PROGRESSION_TEST={migrateProgress};
})();
