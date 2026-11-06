/* Centralized post-cast skill gem effects, including control, status, induction
   and other specialized skill runtimes. Resolve the skill first, then gem. */
(()=>{
  const castSkillBeforeGems=castPartySkill;
  castPartySkill=function(h,i,v){
    const success=castSkillBeforeGems(h,i,v);
    if(success!==false&&h?.hp>0)applyGemAfterSkill(h,i,v||battleStats(h));
    return success;
  };
})();
