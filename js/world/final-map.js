
/* Update 24: reusable boss-only final maps. Index 6 stays the default progression gate; later final maps do not unlock the level cap unless progressionGate is explicitly moved. */
(function installFinalMapTypeRuntime(){
  const isFinalMap=mi=>typeof worldIsFinalMap==='function'?worldIsFinalMap(mi):mi===6;
  const gateIndex=()=>typeof worldProgressionGateIndex==='function'?worldProgressionGateIndex():6;
  const isGateMap=mi=>isFinalMap(mi)&&mi===gateIndex();
  globalThis.isFinalMap=isFinalMap;globalThis.isProgressionGateMap=isGateMap;
  function normalFallback(mi){
    for(let i=Math.min(mi-1,MAPS.length-1);i>=0;i--)if(!isFinalMap(i)&&MAPS[i]?.mobs?.length)return i;
    const first=MAPS.findIndex((m,i)=>!isFinalMap(i)&&m?.mobs?.length);return first>=0?first:0;
  }
  globalThis.worldNormalFallbackMap=normalFallback;

  const singleCanVisit=function(mi,s=state){
    return mapUnlocked(mi,s,{isFinal:isFinalMap,gate:gateIndex()});
  };
  solo.canVisit=singleCanVisit;
  canVisit=function(mi,s=state){return party?singleCanVisit(mi,party.members[0]):singleCanVisit(mi,s);};

  questRegion=function(s=state){const mi=(party&&Number.isInteger(party.map))?party.map:s.map;return isFinalMap(mi)?normalFallback(mi):mi;};
  buildBoard=function(s=state){
    const mi=questRegion(s),m=MAPS[mi],b=GAMEPLAY_SETTINGS.quests.board,pool=m?.mobs||[];
    if(!pool.length)throw Error('目前沒有可用的普通怪物，無法建立委託');
    s.board.serial++;s.board.next=Date.now()+BOARD_INTERVAL;
    s.board.tasks=Array.from({length:3},(_,i)=>{const mob=pool[i%pool.length];return {id:uid(),map:mi,mat:mob[2],n:Math.max(1,Math.round(b.taskBase+rand(Math.max(1,Math.round(b.taskRandomRange)))+(regionTier(mi)-1)*b.taskPerTier)),kind:i===2?'gear':'gem',gem:rand(3),slot:rand(4),rar:Math.random()<b.legendaryGearChance?3:2,done:false};});
  };
  generateMarket=function(){
    const q=GAMEPLAY_SETTINGS.quests.market,source=questRegion(),serial=(party.market?.serial||0)+1,tier=regionTier(source),pool=MAPS[source]?.mobs||[],count=Math.max(1,Math.round(q.offerCount));
    return {serial,offers:Array.from({length:count},(_,i)=>{const kind=i===0?'ore':i===1?'dust':i===2?'gem':['ore','dust','gem','material'][rand(4)],key=kind==='gem'?String(rand(3)):kind==='material'?(pool[rand(Math.max(1,pool.length))]?.[2]||''):'',qty=kind==='ore'?(Math.round(q.oreMin)+rand(Math.max(1,Math.round(q.oreRandomRange))))*tier:kind==='dust'?Math.round(q.dustMin)+rand(Math.max(1,Math.round(q.dustRandomRange))):kind==='gem'?Math.round(q.gemMin)+rand(Math.max(1,Math.round(q.gemRandomRange))):Math.round(q.materialMin)+rand(Math.max(1,Math.round(q.materialRandomRange))),unit=kind==='ore'?q.oreUnit:kind==='dust'?q.dustUnit:kind==='gem'?q.gemUnit:q.materialUnitPerTier*tier;return {id:serial+'-'+i,kind,key,qty,price:Math.round(qty*unit),sold:false};})};
  };

  spawnGroup=function(){
    const weak=heroes()[0],final=isFinalMap(party.map),g=GAMEPLAY_SETTINGS.combat.groupSize,min=Math.max(1,Math.round(g.min)),max=Math.max(min,Math.round(g.max)),n=final?1:globalThis.EmberwildSecondsCombat?.active?EmberwildSecondsCombat.encounterSize():min+rand(max-min+1);
    foes=[];effects=[];actorCooldowns={};supportCooldowns={};for(const h of heroes())h.shield=0;
    for(let i=0;i<n;i++){const e=makeEnemy(party.map,weak);e.id='foe-'+uid();e.rewarded=false;foes.push(e);}enemy=foes[0];round=0;
    if(typeof beginBattleStatistics==='function')beginBattleStatistics();
    
    note(final?'遭遇終局首領。':'遭遇 '+foes.length+' 隻敵人。');
  };

  // Final-map clears are distinct from the one progression-gate clear.
  victory=function(){
    let e=enemy;if(!e)return;lastDefeatedEnemy={...e};let mode=e.difficulty||0,d=MODES[mode],mi=e.region??state.map,tier=regionTier(mi),kindIndex=e.kind==='normal'?0:e.kind==='elite'?1:2,r=GAMEPLAY_SETTINGS.rewards,mult=[r.kindMultiplier.normal,r.kindMultiplier.elite,r.kindMultiplier.boss][kindIndex],gateFinal=e.kind==='final'&&isGateMap(mi),firstClear=gateFinal&&!state.won;
    state.totalKills++;state.kills[e.mat]=(state.kills[e.mat]||0)+1;if(!state.discovered.includes(e.mat))state.discovered.push(e.mat);
    const gold=EmberwildProgression.enemyGold(GAMEPLAY_SETTINGS,e.lv,e.kind,mode);
    state.gold+=gold;
    const oreFactor=Math.max(0,Math.min(1,Number(r.ore.chanceFactor??1)));/* v0.180: base material chance factor */
    if(kindIndex>0?(oreFactor>=1||Math.random()<oreFactor):Math.random()<(r.ore.normalChanceByDifficulty?.[mode]??1)*oreFactor)
      state.dust+=Math.ceil(tier*(kindIndex===0?r.ore.normalKindMultiplier:r.ore.eliteBossKindMultiplier)*d.ore);/* v0.180: per-kill base material is 粉塵 */
    rollConfiguredDrops(e);awardEther(e);
    if(e.kind==='final'){
      running=false;
      if(gateFinal){state.won=true;state.modeClears[mode]++;if(e.mat)state.materials[e.mat]=Math.max(1,state.materials[e.mat]||0);}
    }
    state.hp=Math.min(stats().hp,state.hp+stats().hp*r.postVictoryHeal);state.shield=0;note(`擊敗 ${combatEnemyName(e)}（${d.name}）· ${gold} 金幣`);enemy=null;
    if(e.kind==='final'&&!partyBusy){
      const title=gateFinal?(firstClear?'突破關卡已完成':'再次完成突破關卡'):'終局首領已擊敗',body=gateFinal?(firstClear?'通關後區域已解鎖。':'可繼續探索通關後區域，或挑戰其他終局地圖。'):`已完成「${MAPS[mi]?.name||'終局地圖'}」。`;
      $('modal').innerHTML=`<h1>${title}</h1><p>${esc(body)}</p><button class="primary" onclick="closeModal()">繼續旅程</button>`;$('modal').showModal();
    }
    save();
  };solo.victory=victory;

  if(typeof rewardGroupKill==='function'){
    const finalMapRewardBase=rewardGroupKill;
    rewardGroupKill=function(e){
      if(e?.rewarded)return;
      const nonGateFinal=e?.kind==='final'&&!isGateMap(e.region??party?.map??state?.map??0),beforeCleared=party?.cleared,heroState=nonGateFinal&&party?party.members.map(h=>({h,won:h.won,modeClears:[...(h.modeClears||[])]})):null;
      const result=finalMapRewardBase(e);
      if(nonGateFinal&&party){party.cleared=beforeCleared;for(const row of heroState){row.h.won=row.won;row.h.modeClears=[...row.modeClears];}closeModal();}
      if(e?.kind==='final')running=false;
      return result;
    };
  }

  if(typeof battleView==='function'){
    const finalMapBattleViewBase=battleView;
    battleView=function(){
      let html=finalMapBattleViewBase();
      if(isFinalMap(party.map))html=html.replace(/群怪 · [^<]+/, '終局首領 · 1 隻').replace('尚無遭遇<br>開始探索，遭遇3～6隻敵人。','尚無遭遇<br>開始探索即挑戰此地圖的終局首領。');
      for(let i=0;i<MAPS.length;i++)if(isFinalMap(i)){const area=MAPS[i],from=`<span class=\"map-level\">推薦裝等 ${mapRecommendedGearLevel(i)}</span><b>${area.name}</b>`,to=`<span class=\"map-level\">推薦裝等 ${mapRecommendedGearLevel(i)} · 終局</span><b>${area.name}</b>`;html=html.replace(from,to);}
      return html;
    };
  }
  if(typeof guideView==='function'){
    const finalMapGuideBase=guideView;
    guideView=function(){return finalMapGuideBase()+`<section class="panel"><h2>終局地圖</h2><p>終局關卡會出現最終首領，部分關卡也有普通或菁英隨從。擊敗終焉王座的噬日者會開放通關後區域；其他終局關卡的勝利不會重複開放。</p></section>`;};
  }
  if(typeof showRegionBestiary==='function'){
    showRegionBestiary=function(){
      const mi=party.map,m=MAPS[mi],mc=typeof worldMapConfig==='function'?worldMapConfig(mi):null,final=isFinalMap(mi);
      const normalRows=final?'':m.mobs.map(x=>`<p><b>${esc(x[0])}</b> · ${ELEMENTS[species.get(x[2])?.element||'physical']}／${RACES[species.get(x[2])?.race||'beast']}<br>專屬掉落：${esc(x[2])}</p>`).join('');
      const bossEnabled=final||mc?.bossEnabled!==false,bossRow=m.boss?.[0]?`<p><b>${esc(m.boss[0])}</b> · ${ELEMENTS[species.get(m.boss[2])?.element||'physical']}／${RACES[species.get(m.boss[2])?.race||'beast']} ${bossEnabled?'':'<span class="tag">遭遇已停用</span>'}<br>專屬掉落：${esc(m.boss[2])}</p>`:'';
      $('modal').innerHTML=`<h2>${esc(m.name)} · ${final?'終局首領':'怪物與掉落'}</h2>${normalRows}${bossRow}<button onclick="closeModal()">關閉</button>`;$('modal').showModal();
    };
  }

  // Keep legacy save migration rules aligned with map type when this module is already active.
  if(state&&party){resetEncounter();save();render();}
})();
