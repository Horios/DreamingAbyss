/* Progression settings validation and source documentation (character levels removed in v0.161). */
(()=>{
  const copy=v=>JSON.parse(JSON.stringify(v));
  // v0.161: character levels and XP were removed. Saves drop the old XP-curve snapshot fields.
  const packBase=packParty;
  packParty=function(){const out=packBase();if(out){delete out.progressionCurveVersion;delete out.progressionXpRequirements;}return out;};
  const validateBase=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    const out=validateBase(cfg);
    for(const field of ['flatStatsPerLevel','flatStatsPerEquipmentLevel'])if(['atk','hp','def'].some(k=>!Number.isFinite(out.equipment.enhance[field]?.[k])||out.equipment.enhance[field][k]<0))throw Error('裝備精煉成長必須為非負有限數值');
    return out;
  };
  const referenceBase=balanceReference;
  balanceReference=function(){
    const out=referenceBase();out.balancePaths??={};out.legacySettings??={};
    Object.assign(out.balancePaths,{
      'balanceSettings.equipment.enhance.flatStatsPerLevel':'LV1 裝備每次精煉固定增加的 atk/hp/def。只增加基底原有屬性，累計精煉等級後取整。',
      'balanceSettings.equipment.enhance.flatStatsPerEquipmentLevel':'每增加 1 裝備需求等級，每次精煉再增加的固定 atk/hp/def；與 flatStatsPerLevel 相加。不受 T 級、基底數值或角色等級影響。',
      'classes[].initialStats':'職業固定基礎能力（v0.161 起沒有角色等級成長）。',
      'balanceSettings.skills.mastery':'職業精通與武器／元素精通的經驗曲線（xpBase + L×xpLinear + L²×xpQuadratic）與上限 maxLevel；達上限後不再累積。',
      'balanceSettings.rewards.gold':'金幣採獨立曲線和各怪物種類倍率，不共用 EXP。',
      'balanceSettings.difficulty.modes[].goldMultiplier':'各難度獨立金幣倍率。'
    });
    out.legacySettings['balanceSettings.equipment.enhance.statPerLevel']={status:'tokens-only',replacement:'balanceSettings.equipment.enhance.flatStatsPerLevel',note:'只保留信物百分比強化；一般裝備、BOSS 裝及新手裝使用固定值精煉。'};
    for(const path of ['classes[].growthPerLevel','classes[].growthSteps','balanceSettings.progression.statsPerLevel','balanceSettings.progression.xpCurve','balanceSettings.progression.xpLevelGap','balanceSettings.progression.levelCaps','balanceSettings.progression.mapAheadAllowance','balanceSettings.rewards.xp','balanceSettings.difficulty.modes[].xpMultiplier','balanceSettings.drops.levelGap','balanceSettings.equipment.dropLevelGap','balanceSettings.monsters.encounter.levelLeadInterval','balanceSettings.combat.levelGapDamagePerLevel'])out.legacySettings[path]={status:'removed',note:'v0.161 移除角色等級與經驗後不再使用。'};
    return out;
  };
})();
