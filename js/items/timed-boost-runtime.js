/* Timed effects and the persisted expedition clock share the offline event timeline. */
(function installTimedBoostRuntime(){
  const api=EmberwildTimedBoosts,copy=v=>JSON.parse(JSON.stringify(v));
  let lastBoostState='',clockParty=null,lastClockAt=Date.now(),wasActive=false,pacePausedAt=null,lastStatusKey='';
  const isActive=()=>!!party&&running&&!$('modal')?.open;
  function session(){if(!party)return null;return party.combatSession??={idleTimeMs:0,reportPaused:false,filter:'all'};}
  function syncCombatClock(now=Date.now()){
    if(globalThis.EmberwildOffline)return EmberwildOffline.sync(now);
    if(clockParty===party&&wasActive&&party){const s=session(),elapsed=Math.max(0,now-lastClockAt);s.idleTimeMs=Math.min(Number.MAX_SAFE_INTEGER,s.idleTimeMs+elapsed);const elemental=party.members.map(h=>api.ELEMENTAL_TYPES.flatMap(k=>api.buffRows(h[k])).filter(b=>b.enabled));api.consume(party,elapsed);party.members.forEach((h,i)=>{if(elemental[i].some(b=>!b.enabled))withHero(h,clampVitals);});}
    const active=isActive();
    if(clockParty===party){
      if(wasActive&&!active)pacePausedAt=now;
      else if(!wasActive&&active&&pacePausedAt!==null){const delay=Math.max(0,now-pacePausedAt);if(nextActionAt)nextActionAt+=delay;if(roundStartedAt)roundStartedAt+=delay;pacePausedAt=null;}
    }else pacePausedAt=active?null:now;
    clockParty=party;lastClockAt=now;wasActive=active;
  }
  function expireBoosts(now=Date.now()){
    if(!party)return false;
    const before=JSON.stringify((party.timedBoosts||[]).map(b=>b.enabled));
    party.timedBoosts=(party.timedBoosts||[]).filter(b=>!api.removedItem(b)).map(b=>api.migrateBuff(b,now));
    battleRate=1;
    let elementalExpired=false;
    for(const h of party.members)for(const key of api.ELEMENTAL_TYPES){
      const rows=api.buffRows(h[key]);h[key]=api.compactBuffs(rows.map(b=>api.migrateBuff(b,now)));
      if(rows.some(b=>b.enabled&&api.remainingMs(b,now)<=0)){withHero(h,clampVitals);elementalExpired=true;}
    }
    return before!==JSON.stringify(party.timedBoosts.map(b=>b.enabled))||elementalExpired;
  }
  function restoreSession(){
    if(party){api.removeSpeedSave(party);const s=session();party.timedBoosts=(party.timedBoosts||[]).map(b=>api.migrateBuff(b,Date.now()));battleRate=1;battleReportPaused=s.reportPaused;battleLogFilter=s.filter;expireBoosts();}
    else{battleRate=1;battleReportPaused=false;battleLogFilter='all';}
    clockParty=party;lastClockAt=Date.now();wasActive=isActive();pacePausedAt=wasActive?null:lastClockAt;
    lastStatusKey='';battleLogGeneration++;
  }
  const useBase=useSupply;
  useSupply=function(id){
    syncCombatClock();const item=SHOP.find(x=>x.id===id);if(!api.isItem(item))return useBase(id);
    if(!party||(state.consumables[id]||0)<1)return;
    api.validateItem(item);expireBoosts();const before=copy(party.timedBoosts||[]),count=state.consumables[id];
    const now=Date.now();
    try{party.timedBoosts=api.stackBuff(party.timedBoosts||[],{itemId:item.id,name:item.name,boostType:item.boostType,bonusPercent:item.bonusPercent,durationMinutes:item.durationMinutes,remainingMs:api.expiryTime(item.durationMinutes,0),enabled:true},now);}
    catch(e){return toast(e.message);}
    state.consumables[id]--;
    if(save()===false){party.timedBoosts=before;state.consumables[id]=count;return;}
    render();toast('已使用'+item.name+'；同名同效果累加時間，單一狀態上限 24 小時');
  };
  const detailBase=supplyDetail;
  supplyDetail=function(item){if(!api.isItem(item))return detailBase(item);return api.LABELS[item.boostType]+'＋'+item.bonusPercent+'%'+' · 持續 '+item.durationMinutes+' 分鐘（現實時間） · 同名同效果累加時間；不同倍率獨立計時；單一狀態上限 24 小時';};
  const awardBase=awardXP;
  awardXP=function(amount,{applyExpBoost=true}={}){
    const h=playerHero(),capped=h.lv>=levelCap(h),earned=Math.max(0,(Number(amount)||0)*(applyExpBoost?1+api.bonus(party,'exp')/100:1));
    const result=awardBase(earned);if(!capped&&earned>0)note(characterName(h)+' 獲得 '+Number(earned.toFixed(2))+' EXP','exp');return result;
  };
  const dropBase=partyDropRateBonus;
  partyDropRateBonus=function(){return dropBase()+api.bonus(party,'drop')/100;};
  const etherBase=etherDropChance;
  etherDropChance=function(e){return Math.min(1,etherBase(e)*(1+Math.max(0,partyDropRateBonus())));};

  function wrapClock(name){const base=globalThis[name];globalThis[name]=function(...args){syncCombatClock();try{return base.apply(this,args);}finally{syncCombatClock();}};}
  for(const name of ['toggleBattle','resetEncounter','restartExploration','closeModal','returnToTitle'])wrapClock(name);
  const resetBase=resetSession;
  resetSession=function(){syncCombatClock();const out=resetBase();clockParty=null;wasActive=false;pacePausedAt=null;battleRate=1;battleReportPaused=false;battleLogFilter='all';lastStatusKey='';return out;};
  const loadBase=loadParty;
  loadParty=function(data){const out=loadBase(data);restoreSession();return out;};
  const packBase=packParty;
  packParty=function(){syncCombatClock();expireBoosts();const out=packBase();if(out){const s=session();s.reportPaused=battleReportPaused;s.filter=battleLogFilter;out.timedBoosts=copy(party.timedBoosts);out.combatSession=copy(s);}return out;};
  const tickBase=tick;
  tick=function(){syncCombatClock();const changed=expireBoosts(),key=JSON.stringify(party?.timedBoosts?.map(b=>b.enabled));if((changed||key!==lastBoostState)&&state){lastBoostState=key;render();}try{return tickBase();}finally{syncCombatClock();refreshJournalRealtime();}};
  new MutationObserver(()=>{syncCombatClock();refreshJournalRealtime(true);}).observe($('modal'),{attributes:true,attributeFilter:['open']});

  const timeText=api.timeText;
  const boostState=b=>api.remainingMs(b)<=0?'時間已耗盡':!b.enabled?'已停用':'已啟用・倒數中';
  function sources(){return [...(party?.timedBoosts||[]).map((b,i)=>({b,key:'team:'+i,owner:'全隊'})),...(party?.members||[]).flatMap((h,i)=>api.ELEMENTAL_TYPES.flatMap(k=>api.buffRows(h[k]).map((b,j)=>({b,key:i+':'+k+':'+j,owner:characterName(h)}))))];}
  function source(key){return sources().find(x=>x.key===key);}
  globalThis.setTimedBoostEnabled=function(key,on){
    syncCombatClock();const row=source(key);if(!row||on&&api.remainingMs(row.b)<=0)return false;
    row.b.enabled=!!on;
    if(!row.b.boostType){const h=party.members[Number(key.split(':')[0])];withHero(h,clampVitals);}
    save();render();return true;
  };
  function effectText(b){return b.boostType?api.LABELS[b.boostType]+'＋'+b.bonusPercent+'%':ELEMENTS[b.element]+' '+b.effectPercent+'%';}
  globalThis.timedBoostManagement=function(){
    const rows=sources();return `<details class="exploration-secondary" id="explorationBoostSettings"><summary>限時增益</summary><p class="small">以現實時間倒數；暫停、停止與離線仍會到期。</p><div class="boost-management-list">${rows.map(({b,key,owner})=>`<div class="boost-management-row"><b>${esc(b.name)}</b><small>${esc(owner)} · ${esc(effectText(b))}</small><span data-boost-time="${key}">${timeText(api.remainingMs(b))}</span><span data-boost-state="${key}">${boostState(b)}</span><button data-boost-toggle="${key}" onclick="setTimedBoostEnabled('${key}',${!b.enabled})" ${api.remainingMs(b)<=0?'disabled':''} aria-pressed="${!!b.enabled}">${b.enabled?'停用':'啟用'}</button></div>`).join('')||'<p class="small">尚未使用增益道具。</p>'}</div></details>`;
  };
  globalThis.battleJournalStatus=function(){
    const rows=sources().filter(({b})=>api.remainingMs(b)>0),groups=[...api.KINDS,'elemental'].map(kind=>{
      const entries=rows.filter(({b})=>(b.boostType||'elemental')===kind);if(!entries.length)return '';
      const active=entries.filter(({b})=>b.enabled),shown=active.length?active:entries,left=Math.min(...shown.map(({b})=>api.remainingMs(b))),name=kind==='elemental'?'屬性藥水':api.LABELS[kind],effect=kind==='elemental'?entries.length+' 個狀態':'＋'+api.bonus(party,kind)+'%',status=active.length?'倒數中':'已停用',title=entries.map(({b,owner})=>owner+'・'+b.name+' '+timeText(api.remainingMs(b))+' '+boostState(b)).join('；');
      return `<div class="journal-boost-row" title="${esc(title)}"><span>${name} ${effect} · ${status}</span><b>${timeText(left)}</b>${entries.length>1?'<small>下一筆剩餘時間 · '+entries.length+' 個來源</small>':''}</div>`;
    }).join('');
    return `<div id="journalRealtimeStatus" class="journal-realtime-status"><div>已掛機時間：<b>${timeText(session()?.idleTimeMs||0,true)}</b></div><div class="journal-boosts">${groups||'<span class="small">目前增益：無</span>'}</div></div>`;
  }

  function refreshJournalRealtime(force=false){
    const key=JSON.stringify([Math.floor((session()?.idleTimeMs||0)/1000),isActive(),sources().map(({b})=>[b.name,b.enabled,Math.ceil(api.remainingMs(b)/1000)])]);
    if(!force&&lastStatusKey===key)return;lastStatusKey=key;
    const node=$('journalRealtimeStatus');if(node){const fresh=document.createElement('template');fresh.innerHTML=battleJournalStatus();const next=fresh.content.firstElementChild;if(next&&node.innerHTML!==next.innerHTML)node.innerHTML=next.innerHTML;}
    for(const {b,key} of sources()){
      const time=document.querySelector('[data-boost-time="'+key+'"]'),status=document.querySelector('[data-boost-state="'+key+'"]'),button=document.querySelector('[data-boost-toggle="'+key+'"]');
      if(time)time.textContent=timeText(api.remainingMs(b));if(status)status.textContent=boostState(b);
      if(button){button.disabled=api.remainingMs(b)<=0;button.textContent=b.enabled?'停用':'啟用';button.setAttribute('aria-pressed',String(!!b.enabled));button.setAttribute('onclick',"setTimedBoostEnabled('"+key+"',"+!b.enabled+")");}
    }
    globalThis.refreshExplorationStatus?.();
  }
  // Persist the last settled cursor; the offline runtime retains wall-clock debt.
  addEventListener('pagehide',()=>{syncCombatClock();save();wasActive=false;});
  addEventListener('pageshow',()=>{lastClockAt=Date.now();wasActive=isActive();});
  document.addEventListener('visibilitychange',()=>{syncCombatClock();if(party)save();});
  const referenceBase=balanceReference;
  balanceReference=function(){const out=referenceBase();out.itemTypes={...(out.itemTypes||{}),timedBoost:'全隊現實時間增益；boostType=exp/drop，bonusPercent 為加算百分比，durationMinutes 為正整數分鐘；同名同效果累加時間；不同倍率獨立計時；單一狀態上限 24 小時。'};out.units={...(out.units||{}),timedBoostDuration:'現實分鐘；暫停、停止與離線仍會扣時'};out.balancePaths={...(out.balancePaths||{}),'items[].bonusPercent':'各限時來源的加算百分比，經驗與掉寶各自先相加。','items[].durationMinutes':'抗性／屬性增幅與限時增益的現實分鐘；元素藥水可輸入小數，不使用 duration 的戰鬥回合。'};out.dropAlgorithm='掉落率 = 基礎機率 × (1 + 全隊裝備加成 + 各有效限時來源加成)，封頂 100%；首殺保底不變。';return out;};
  const exportBase=exportableBalance;
  exportableBalance=function(){const out=exportBase();out.timeUnits={...(out.timeUnits||{}),timedBoostDuration:'realMinutes',consumableClock:'wall'};out.notes=[...(out.notes||[]),'type=timedBoost 使用 boostType / bonusPercent / durationMinutes；各類來源加算，同名同效果累加剩餘時間，不同倍率狀態各自計時；單一狀態上限 24 小時，超過時不消耗道具。'];return out;};
  const guideBase=guideView;
  guideView=function(){return `<section class="panel"><h2>限時增益</h2><p>經驗與掉寶的百分比各自加算，不同類型可同時生效；同名同效果的道具重新使用會累加剩餘時間，不同倍率保留各自狀態並獨立計時；每個狀態最多累積 24 小時，若本次使用會超過上限則提醒且不消耗道具。</p><p>限時券以現實時間倒數，各項效果可獨立啟用、停用；停用不延長到期時間；暫停、停止或關閉遊戲仍會扣時。已掛機時間只計實際探索時間；暫停戰鬥或對話框暫停時停止。戰報暫停與篩選只影響紀錄顯示。</p></section>`+guideBase();};
  restoreSession();if(state)render();
  globalThis.__EMBERWILD_TIMED_BOOST_TEST={sources,isActive,syncCombatClock,expireBoosts,restoreSession,refreshJournalRealtime};
})();
