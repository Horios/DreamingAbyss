
(()=>{
  const copy=value=>JSON.parse(JSON.stringify(value));
  let savedClasses=null;try{const saved=JSON.parse(balanceSourceText()||'null');if(saved?.schema===BALANCE_SCHEMA)savedClasses=saved.classes;}catch{}
  // v0.161: classes only have fixed initial stats; per-level growth (growthPerLevel/growthSteps) was removed with levels.
  CLASSES.forEach((cls,job)=>{const d=EmberwildProgression.defaults.classes[job],legacy=!!savedClasses?.[job];cls.initialStats??=legacy?classInitial(cls,job):copy(d.initialStats);delete cls.growthPerLevel;delete cls.growthSteps;});
  function classInitial(cls,job){
    const own=cls?.initialStats||{};
    return {
      hp:Number.isFinite(Number(own.hp))?Number(own.hp):Number(cls?.hp||0),
      atk:Number.isFinite(Number(own.atk))?Number(own.atk):Number(cls?.atk||0),
      def:Number.isFinite(Number(own.def))?Number(own.def):Number(cls?.def||0),
      crit:Number.isFinite(Number(own.crit))?Number(own.crit):Number(job===2?GS('progression.baseCrit.archer',.17):GS('progression.baseCrit.default',.07)),
      critDamage:Number.isFinite(Number(own.critDamage))?Number(own.critDamage):Number(GS('combat.baseCritDamage',1.5)),...(Number.isFinite(own.speed)?{speed:own.speed}:{})
    };
  }
  const classStatsValidateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    for(const [job,cls] of (input?.classes||[]).entries())for(const field of ['initialStats']){
      if(cls?.[field]===undefined)continue;
      const values=cls[field];
      if(!values||typeof values!=='object'||Array.isArray(values)||['hp','atk','def','crit','critDamage'].some(key=>!Number.isFinite(values[key])||values[key]<0)||(field==='initialStats'&&(values.hp<=0||values.atk<=0)))throw Error('職業初始能力資料無效：'+job);
    }
    const out=classStatsValidateBase(input);
    out.classes.forEach(cls=>{delete cls.growthPerLevel;delete cls.growthSteps;});
    for(const [job,cls] of (input?.classes||[]).entries())if(cls?.initialStats!==undefined)out.classes[job].initialStats={...cls.initialStats};
    return out;
  };
  const classStatsApplyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const checked=validateBalanceConfig(input),out=classStatsApplyBase(checked,{persist:false});
    for(const [job,cls] of checked.classes.entries())for(const field of ['initialStats']){
      if(cls[field]===undefined)delete CLASSES[job][field];else CLASSES[job][field]=copy(cls[field]);
      if(field==='initialStats'&&cls[field])for(const key of ['hp','atk','def'])CLASSES[job][key]=cls[field][key];
    }
    if(state){for(const h of party?.members||[state])withHero(h,clampVitals);render();}
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    return out;
  };
  const classStatsExportBase=exportableBalance;
  exportableBalance=function(){
    const out=classStatsExportBase();
    out.classes.forEach((cls,job)=>{cls.initialStats=classInitial(CLASSES[job],job);delete cls.growthPerLevel;delete cls.growthSteps;for(const key of ['hp','atk','def'])cls[key]=cls.initialStats[key];});
    const skills=out.balanceSettings?.skills;
    if(skills){
      for(const key of ['maxLevel','initialCap','capLevelsPerStep','effectPerExtraLevel'])delete skills.core?.[key];
      delete skills.proc?.perSkillLevel;
      for(const key of ['maxLevel','effectPerExtraLevel'])delete skills.support?.[key];
    }
    return out;
  };
  const resetBase=resetBalanceJSON;
  resetBalanceJSON=function(){const out=resetBase();CLASSES.forEach((cls,job)=>EmberwildProgression.applyClassDefaults(cls,job));if(state)for(const h of party?.members||[state])withHero(h,clampVitals);render();return out;};
  globalThis.classInitialStats=classInitial;
  // The early balance loader runs before this module installs its class fields.
  try{
    const saved=JSON.parse(balanceSourceText()||'null');
    if(saved?.schema===BALANCE_SCHEMA){
      const checked=validateBalanceConfig(saved);
      checked.classes.forEach((cls,job)=>{for(const field of ['initialStats']){if(cls[field]!==undefined)CLASSES[job][field]=copy(cls[field]);}if(cls.initialStats)for(const key of ['hp','atk','def'])CLASSES[job][key]=cls.initialStats[key];});
      if(state){for(const h of party?.members||[state])withHero(h,clampVitals);render();}
    }
  }catch(e){console.warn('職業初始能力資料還原失敗',e);}
})();
