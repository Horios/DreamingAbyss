/* Resolve explicit catalogue drops against the existing item definitions. */
(function(){
  const M=EmberwildMonsterDesign,baseValidate=validateBalanceConfig;
  validateBalanceConfig=function(input){
    for(const d of input.balanceSettings?.drops?.entries||[]){
      if(d.type==='equipment'&&!M.equipmentRef(d.key,input))throw Error('掉落裝備引用不存在：'+d.id);
      if(d.type==='token'&&!input.companionTokens?.catalog?.some(t=>t.id===d.key))throw Error('掉落信物引用不存在：'+d.id);
    }
    const previous=globalThis.__EMBERWILD_VALIDATE_ITEM_IDS;globalThis.__EMBERWILD_VALIDATE_ITEM_IDS=new Set((input.items||[]).map(x=>x.id));
    try{return baseValidate(input);}finally{globalThis.__EMBERWILD_VALIDATE_ITEM_IDS=previous;}
  };
  const baseGrant=grantConfiguredDrop;
  grantConfiguredDrop=function(rule,e,rng=Math.random){
    if(!['equipment','token'].includes(rule.type))return baseGrant(rule,e,rng);
    const qty=randomQuantity(rule,rng),doc=exportableBalance(),ref=rule.type==='equipment'?M.equipmentRef(rule.key,doc):null;
    if(rule.type==='equipment'&&(!ref||globalThis.__EMBERWILD_STORY?.isRewardForm(ref.form?.id)))return null;
    if(rule.type==='token'){
      const definition=doc.companionTokens?.catalog?.find(t=>t.id===rule.key);if(!definition)return null;
      for(let i=0;i<qty;i++)globalThis.grantConfiguredToken(rule.key,rng);
    }else for(let i=0;i<qty;i++){
      let g;
      if(ref.region!==undefined)g=bossGear(ref.region,ref.job,e.difficulty||0);
      else{
        const quality=GAMEPLAY_SETTINGS.rewards.equipmentQuality,rar=rng()<quality.rareChance?2:rng()<quality.fineConditionalChance?1:0;
        const jobs=(ref.form.wearableJobs||[ref.job]).filter(j=>Number.isInteger(j)&&CLASSES[j]),owner=jobs.includes(state.job)?state.job:jobs[0]??0;
        g=gear(regionTier(e.region??state.map),ref.slot,rar,owner);g.formJob=ref.job;g.form=ref.index;g.name=gearName(g);modeAffixes(g,e.difficulty||0);
      }
      addGear(g);
    }
    return {name:rule.name,count:qty};
  };
})();
