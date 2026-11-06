
/* Persistent active-party contribution meter: damage, damage taken, healing and shield absorption. */
(()=>{
  const BASE_KEY='emberwild-combat-contribution-v1';
  let cacheKey='',cache=null,selectedMetric='damage';

  function storageKey(){
    const root=party?.members?.[0];
    const id=Number.isFinite(Number(root?.created))?String(root.created):'default';
    return BASE_KEY+':'+id+(ACTIVE_SAVE_SLOT===1?'':':slot-'+ACTIVE_SAVE_SLOT);
  }
  function activeSignature(){
    if(!party?.active)return '';
    return [...party.active].filter(Number.isInteger).sort((a,b)=>a-b).join(',');
  }
  // v0.114: taken = damage that reached the member (shield absorption + HP lost). Older stored rows start it at 0.
  const METRICS=['damage','taken','healing','mitigation'];
  function blankRow(){return {damage:0,taken:0,healing:0,mitigation:0};}
  function blankState(signature=activeSignature()){
    const out={teamSignature:signature,byJob:{}};
    for(const key of party?.active||[])out.byJob[key]=blankRow();
    return out;
  }
  function normalize(raw){
    const signature=typeof raw?.teamSignature==='string'?raw.teamSignature:'';
    const out=blankState(signature),src=raw&&typeof raw==='object'&&raw.byJob&&typeof raw.byJob==='object'?raw.byJob:{};
    for(const key of party?.active||[]){
      const row=src[key]||{},clean=blankRow();
      for(const key of METRICS){
        const n=Number(row[key]);
        clean[key]=Number.isFinite(n)&&n>0?Math.min(1e15,n):0;
      }
      out.byJob[key]=clean;
    }
    return out;
  }
  function writeCache(){
    if(!party||!cache||globalThis.__EMBERWILD_OFFLINE_SILENT)return;
    try{localStorage.setItem(storageKey(),JSON.stringify(cache));}catch{}
  }
  function ensure(){
    const key=storageKey(),signature=activeSignature();
    if(!cache||cacheKey!==key){
      cacheKey=key;
      try{cache=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{cache=blankState(signature);}
    }
    if(cache.teamSignature!==signature){
      cache=blankState(signature);
      writeCache();
    }
    return cache;
  }
  function persist(){
    if(!party)return;
    ensure();
    writeCache();
  }
  globalThis.recordCombatContribution=function(hero,key,amount){
    if(!party||!METRICS.includes(key))return;
    const memberId=typeof hero==='number'?hero:memberKey(hero),n=Number(amount);
    if(!Number.isInteger(memberId)||!party.active.includes(memberId)||!Number.isFinite(n)||n<=0)return;
    const stats=ensure(),row=stats.byJob[memberId]||(stats.byJob[memberId]=blankRow());
    row[key]=Math.min(1e15,(Number(row[key])||0)+n);
  };
  globalThis.resetCombatContribution=function(){
    if(!party)return;
    cache=blankState(activeSignature());cacheKey=storageKey();writeCache();save();render();
  };
  // Read-only rows for the statistics page: active members in party order with every metric.
  globalThis.combatContributionData=function(){
    if(!party)return [];
    const stats=ensure();
    return party.active.map(partyMember).filter(Boolean).map(h=>({key:memberKey(h),name:characterName(h),...blankRow(),...Object.fromEntries(METRICS.map(k=>[k,Number(stats.byJob[memberKey(h)]?.[k])||0]))}));
  };
  globalThis.setCombatContributionMetric=function(metric){
    if(!METRICS.includes(metric))return;
    selectedMetric=metric;
    render();
  };
  globalThis.recordRegenContribution=function(target,healed){
    const total=Number(healed);
    if(!party||!target||!party.active.includes(memberKey(target))||!Number.isFinite(total)||total<=0)return;
    const rows=effects.filter(fx=>fx.target===heroKey(target)&&fx.kind==='regen'&&fx.until>partyClock&&Number(fx.value)>0);
    const weight=rows.reduce((sum,fx)=>sum+Number(fx.value),0);
    if(weight<=0)return;
    for(const fx of rows){
      const caster=partyMember(fx.sourceKey??fx.source);
      if(caster&&party.active.includes(memberKey(caster)))recordCombatContribution(caster,'healing',total*Number(fx.value)/weight);
    }
  };
  globalThis.combatContributionPanel=function(){
    if(!party)return '';
    const stats=ensure(),fmt=n=>Math.round(Number(n)||0).toLocaleString('zh-TW');
    const labels={damage:'傷害',taken:'承傷',healing:'治療',mitigation:'減傷'};
    const active=party.active.map(partyMember).filter(Boolean);
    const values=active.map(h=>({h,value:Number(stats.byJob[memberKey(h)]?.[selectedMetric])||0}));
    const max=Math.max(0,...values.map(x=>x.value));
    const bars=values.map(({h,value})=>{
      const width=max>0?Math.max(value>0?2:0,Math.min(100,value/max*100)):0;
      return '<div class="combat-contribution-row">'+
        '<span class="combat-contribution-name" title="'+esc(characterName(h))+'">'+esc(characterName(h))+'</span>'+
        '<div class="combat-contribution-track" aria-label="'+esc(characterName(h))+' '+labels[selectedMetric]+' '+fmt(value)+'"><div class="combat-contribution-fill" style="width:'+width+'%"></div></div>'+
        '<span class="combat-contribution-value">'+fmt(value)+'</span></div>';
    }).join('');
    const tabs=METRICS.map(key=>'<button class="'+(selectedMetric===key?'active':'')+'" onclick="setCombatContributionMetric(\''+key+'\')">'+labels[key]+'</button>').join('');
    return '<div class="combat-contribution-meter"><div class="combat-contribution-head"><b>隊伍戰鬥統計</b><button onclick="resetCombatContribution()" title="將目前隊伍的累積統計歸零">重置</button></div>'+
      '<div class="combat-contribution-tabs">'+tabs+'</div>'+
      '<div class="combat-contribution-bars">'+bars+'</div>'+
      '<p class="small combat-contribution-note">僅統計目前出戰成員；更換出戰隊伍會自動重置。減傷只計護盾實際抵擋的傷害。</p></div>';
  };

  if(typeof save==='function'){
    const baseSave=save;
    save=function(show=false){persist();return baseSave(show);};
  }
  if(typeof newGame==='function'){
    const baseNewGame=newGame;
    newGame=function(){cache=null;cacheKey='';selectedMetric='damage';return baseNewGame();};
  }
})();
